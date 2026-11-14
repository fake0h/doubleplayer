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
    this.score = 0;              // smoothed live score for the current emotion
    this.best = 0;
    this.bestPhoto = null;       // canvas snapshot from this round's best moment
    this.lastDetect = 0;
    this.lastShot = 0;
    this.faceSeen = false;
    this.snap = document.createElement('canvas');
    this.snap.width = 480; this.snap.height = 360;
  }

  // Ask for the camera. Must be called from a tap/click on some browsers (iPad Safari).
  async start() {
    if (this.fake) { this.status = 'ready'; return true; }
    this.status = 'asking';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
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
              outputFaceBlendshapes: true, runningMode: 'VIDEO', numFaces: 1,
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
  }

  resetRound() { this.score = 0; this.best = 0; this.bestPhoto = null; }

  // Call every frame during a round; detection runs ~12 times a second.
  update(emotionId) {
    const t = performance.now();
    if (t - this.lastDetect < 80) return this.score;
    this.lastDetect = t;
    let s = 0;
    if (this.fake) {
      // simulated face for testing: wanders up and down
      s = Math.max(0, Math.min(100, (this.score || 30) + (Math.random() - 0.45) * 18));
      this.faceSeen = true;
    } else if (this.status === 'ready' && this.video && this.video.readyState >= 2) {
      const res = this.landmarker.detectForVideo(this.video, t);
      const cats = res.faceBlendshapes?.[0]?.categories;
      this.faceSeen = !!cats;
      if (cats) {
        const b = {};
        for (const c of cats) b[c.categoryName] = c.score;
        s = scoreEmotion(computeFeatures(b), emotionId);
      }
    }
    // smooth so the number doesn't jitter
    this.score = this.fake ? s : this.score * 0.6 + s * 0.4;
    if (this.score > this.best + 0.5 || (!this.bestPhoto && this.score > 0)) {
      this.best = Math.max(this.best, this.score);
      if (t - this.lastShot > 150) { this.capture(); this.lastShot = t; }
    }
    return this.score;
  }

  capture() {
    const c = this.snap.getContext('2d');
    c.save();
    c.translate(c.canvas.width, 0); c.scale(-1, 1);   // mirror, like looking in a mirror
    if (this.video && this.video.readyState >= 2) {
      c.drawImage(this.video, 0, 0, c.canvas.width, c.canvas.height);
    } else {
      // no real camera (test mode): draw a placeholder
      c.fillStyle = `hsl(${Math.random() * 360},60%,40%)`; c.fillRect(0, 0, 480, 360);
      c.restore(); c.save();
      c.fillStyle = '#fff'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center';
      c.fillText(`TEST PHOTO ${Math.round(this.score)}`, 240, 190);
    }
    c.restore();
    this.bestPhoto = this.snap.toDataURL('image/jpeg', 0.75);
  }
}
