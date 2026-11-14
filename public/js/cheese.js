// Say Cheese: camera + face expression scoring, all inside the player's own browser.
// Uses Google MediaPipe Face Landmarker blendshapes (52 facial muscle readings). Live video
// never leaves the device; only the round winner's snapshot is sent to the other players.
import { emotionById } from '/shared/emotions.js';

const MODEL_URLS = [
  '/models/face_landmarker.task',   // cached by our server
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
];

// Each blendshape tops out at a different level in practice; these gains map them to roughly 0..1.
function computeFeatures(b) {
  const g = (name) => b[name] || 0;
  const avg = (a, c) => (g(a) + g(c)) / 2;
  const n = (v, max) => Math.max(0, Math.min(1, v / max));
  return {
    smile: n(avg('mouthSmileLeft', 'mouthSmileRight'), 0.7),
    frown: n(avg('mouthFrownLeft', 'mouthFrownRight'), 0.35),
    jawOpen: n(g('jawOpen'), 0.6),
    browUp: n(g('browInnerUp'), 0.6),
    browOuter: n(avg('browOuterUpLeft', 'browOuterUpRight'), 0.5),
    browDown: n(avg('browDownLeft', 'browDownRight'), 0.5),
    eyeWide: n(avg('eyeWideLeft', 'eyeWideRight'), 0.4),
    eyeSquint: n(avg('eyeSquintLeft', 'eyeSquintRight'), 0.6),
    eyeClosed: n(avg('eyeBlinkLeft', 'eyeBlinkRight'), 0.7),
    wink: n(Math.abs(g('eyeBlinkLeft') - g('eyeBlinkRight')), 0.5),
    pucker: n(g('mouthPucker'), 0.7),
    funnel: n(g('mouthFunnel'), 0.5),
    cheekPuff: n(g('cheekPuff'), 0.45),
    press: n(avg('mouthPressLeft', 'mouthPressRight'), 0.5),
    sneer: n(avg('noseSneerLeft', 'noseSneerRight'), 0.45),
    stretch: n(avg('mouthStretchLeft', 'mouthStretchRight'), 0.4),
    smirk: n(Math.abs(g('mouthSmileLeft') - g('mouthSmileRight')), 0.35),
    mouthSide: n(Math.max(g('mouthLeft'), g('mouthRight')), 0.5),
    lookDown: n(avg('eyeLookDownLeft', 'eyeLookDownRight'), 0.6),
    lookUp: n(avg('eyeLookUpLeft', 'eyeLookUpRight'), 0.6),
    lookSide: n(Math.max(avg('eyeLookOutLeft', 'eyeLookInRight'), avg('eyeLookInLeft', 'eyeLookOutRight')), 0.6),
    upperUp: n(avg('mouthUpperUpLeft', 'mouthUpperUpRight'), 0.5),
  };
}

// 0..100: how close the face is to the emotion's target. A neutral face scores ~0.
export function scoreEmotion(features, emotionId) {
  const em = emotionById(emotionId);
  if (!em) return 0;
  let raw = 0, neutral = 0, wsum = 0;
  for (const [f, want, w] of em.target) {
    const v = features[f] || 0;
    raw += w * (1 - Math.abs(v - want));
    neutral += w * (1 - Math.abs(0 - want));
    wsum += w;
  }
  raw /= wsum; neutral /= wsum;
  if (neutral >= 0.999) return 0;
  return Math.round(Math.max(0, Math.min(1, (raw - neutral) / (1 - neutral))) * 100);
}

export class FaceScorer {
  constructor() {
    this.fake = new URLSearchParams(location.search).has('fakeface'); // testing without a camera
    this.video = null;
    this.landmarker = null;
    this.status = 'idle';        // idle | asking | loading | ready | nocamera | error
    this.count = 1;              // how many people this camera is scoring (local game: 2-4)
    this.faces = [];             // faces seen this frame, left to right: { box: {x,y,w,h} (0..1, mirrored), blend }
    this.scores = [0];           // smoothed live score per player
    this.best = [0];
    this.bestPhotos = [null];    // close-up snapshot of each player's face at their best moment
    this.lastDetect = 0;
    this.lastShot = [0];
    this.snap = document.createElement('canvas');
    this.snap.width = 480; this.snap.height = 360;
  }

  get score() { return this.scores[0] || 0; }
  get faceSeen() { return this.faces.length > 0; }
  get facesOk() { return this.faces.length >= this.count; }
  get bestPhoto() { return this.bestPhotos[0]; }

  setCount(n) {
    this.count = n;
    this.resetRound();
  }

  // Ask for the camera. Must be called from a tap/click on some browsers (iPad Safari).
  async start() {
    if (this.fake) { this.status = 'ready'; return true; }
    this.status = 'asking';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const v = document.createElement('video');
      v.playsInline = true; v.muted = true; v.autoplay = true;
      v.setAttribute('playsinline', '');
      v.srcObject = stream;
      await v.play().catch(() => {});
      this.video = v;
    } catch (e) {
      this.status = 'nocamera';
      return false;
    }
    this.status = 'loading';
    try {
      const { FilesetResolver, FaceLandmarker } = await import('/vendor/mediapipe/vision_bundle.mjs');
      const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      let lastErr = null;
      for (const url of MODEL_URLS) {
        for (const delegate of ['GPU', 'CPU']) {
          try {
            this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: url, delegate },
              outputFaceBlendshapes: true, runningMode: 'VIDEO', numFaces: 4,
            });
            break;
          } catch (e) { lastErr = e; }
        }
        if (this.landmarker) break;
      }
      if (!this.landmarker) throw lastErr || new Error('face model failed to load');
      this.status = 'ready';
    } catch (e) {
      console.warn('Face tracking unavailable:', e);
      this.status = 'error';
    }
    return true;
  }

  stop() {
    this.video?.srcObject?.getTracks().forEach(tr => tr.stop());
    this.video = null;
    this.status = 'idle';
    this.faces = [];
  }

  resetRound() {
    this.scores = Array(this.count).fill(0);
    this.best = Array(this.count).fill(0);
    this.bestPhotos = Array(this.count).fill(null);
    this.lastShot = Array(this.count).fill(0);
  }

  // Find faces (call every frame; detection runs ~12x a second). Faces are ordered left to
  // right as seen in the mirrored preview, so Player 1 is whoever stands on the left.
  detect() {
    const t = performance.now();
    if (t - this.lastDetect < 80) return false;
    this.lastDetect = t;
    if (this.fake) {
      // simulated faces for testing: one per player, spaced across the picture
      this.faces = Array.from({ length: this.count }, (_, i) => ({
        box: { x: (i + 0.5) / this.count - 0.08, y: 0.3, w: 0.16, h: 0.3 }, blend: null,
      }));
      return true;
    }
    if (this.status !== 'ready' || !this.video || this.video.readyState < 2) { this.faces = []; return true; }
    const res = this.landmarker.detectForVideo(this.video, t);
    const faces = (res.faceLandmarks || []).map((lm, i) => {
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (const p of lm) { const mx = 1 - p.x; x0 = Math.min(x0, mx); x1 = Math.max(x1, mx); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      const b = {};
      for (const c of res.faceBlendshapes?.[i]?.categories || []) b[c.categoryName] = c.score;
      return { box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, blend: b };
    });
    // biggest faces first (closest to the camera), keep as many as we're scoring, then order left to right
    faces.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
    this.faces = faces.slice(0, this.count).sort((a, b) => a.box.x - b.box.x);
    return true;
  }

  // Score each player's face for the current emotion. Returns the live scores array.
  update(emotionId) {
    if (!this.detect()) return this.scores;
    const t = performance.now();
    for (let i = 0; i < this.count; i++) {
      const f = this.faces[i];
      let s = 0;
      if (this.fake) s = Math.max(0, Math.min(100, (this.scores[i] || 25 + i * 8) + (Math.random() - 0.45) * 18));
      else if (f) s = scoreEmotion(computeFeatures(f.blend), emotionId);
      this.scores[i] = this.fake ? s : this.scores[i] * 0.6 + s * 0.4;   // smooth so it doesn't jitter
      if (f && (this.scores[i] > this.best[i] + 0.5 || (!this.bestPhotos[i] && this.scores[i] > 0))) {
        this.best[i] = Math.max(this.best[i], this.scores[i]);
        if (t - this.lastShot[i] > 150) { this.capture(i, f.box); this.lastShot[i] = t; }
      }
    }
    return this.scores;
  }

  // Close-up of one player's face (mirrored like the preview)
  capture(i, box) {
    const c = this.snap.getContext('2d');
    const W = c.canvas.width, H = c.canvas.height;
    c.save();
    if (this.video && this.video.readyState >= 2) {
      const vw = this.video.videoWidth, vh = this.video.videoHeight;
      // frame the face with some room around it, at the canvas's 4:3 shape
      const cx = (box.x + box.w / 2) * vw, cy = (box.y + box.h / 2) * vh;
      let h = box.h * vh * 1.7, w = h * (W / H);
      w = Math.min(w, vw); h = Math.min(h, vh);
      const sx = Math.max(0, Math.min(vw - w, cx - w / 2)), sy = Math.max(0, Math.min(vh - h, cy - h / 2));
      // box.x is in mirrored coordinates; mirror back to pick the source region, then draw mirrored
      c.translate(W, 0); c.scale(-1, 1);
      c.drawImage(this.video, vw - sx - w, sy, w, h, 0, 0, W, H);
    } else {
      c.fillStyle = `hsl(${(i * 90 + Math.random() * 40) % 360},60%,40%)`; c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center';
      c.fillText(`TEST CLOSE-UP P${i + 1}`, W / 2, H / 2 - 10);
      c.fillText(`score ${Math.round(this.scores[i])}`, W / 2, H / 2 + 40);
    }
    c.restore();
    this.bestPhotos[i] = this.snap.toDataURL('image/jpeg', 0.8);
  }
}
