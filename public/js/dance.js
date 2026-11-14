// Dance Dance Disco: how hard is each player dancing? (camera motion) + the disco music.

// Measures movement by comparing each camera frame with the one before. Works with just the
// camera (no face model needed). In a same-camera game the picture is split into one column per
// dancer, centered on their faces when we can see them.
export class MotionMeter {
  constructor() {
    this.c = document.createElement('canvas');
    this.c.width = 96; this.c.height = 72;
    this.ctx = this.c.getContext('2d', { willReadFrequently: true });
    this.prev = null;
    this.energy = [0];
    this.last = 0;
    this.fake = new URLSearchParams(location.search).has('fakeface');
    this.fakeT = 0;
  }

  // video: camera <video>; count: dancers on this camera; faces: [{box:{x,w}}] left to right (mirrored coords)
  update(video, count, faces) {
    const t = performance.now();
    if (t - this.last < 100) return this.energy;
    const dt = (t - this.last) / 1000;
    this.last = t;
    if (this.energy.length !== count) this.energy = Array(count).fill(0);
    if (this.fake) {
      // simulated dancers: ramp up to max dancing so the whole game can be tested
      this.fakeT += dt;
      for (let i = 0; i < count; i++) {
        const target = Math.min(100, 40 + this.fakeT * 6 + Math.sin(this.fakeT * 2 + i) * 8);
        this.energy[i] += (target - this.energy[i]) * 0.3;
      }
      return this.energy;
    }
    if (!video || video.readyState < 2) return this.energy;
    const W = this.c.width, H = this.c.height, x = this.ctx;
    x.save(); x.translate(W, 0); x.scale(-1, 1); x.drawImage(video, 0, 0, W, H); x.restore();
    const img = x.getImageData(0, 0, W, H).data;
    const gray = new Float32Array(W * H);
    for (let i = 0, j = 0; i < img.length; i += 4, j++) gray[j] = img[i] * 0.3 + img[i + 1] * 0.59 + img[i + 2] * 0.11;
    if (this.prev) {
      // column boundaries: halfway between neighboring faces, or evenly split
      const centers = faces && faces.length === count ? faces.map(f => f.box.x + f.box.w / 2) : Array.from({ length: count }, (_, i) => (i + 0.5) / count);
      const edges = [0, ...centers.slice(1).map((c, i) => (c + centers[i]) / 2), 1].map(v => Math.round(v * W));
      for (let i = 0; i < count; i++) {
        let sum = 0, n = 0;
        for (let yy = 0; yy < H; yy++) for (let xx = edges[i]; xx < edges[i + 1]; xx++) { const k = yy * W + xx; sum += Math.abs(gray[k] - this.prev[k]); n++; }
        const diff = n ? sum / n : 0;
        // ~1.5 = sitting still (camera noise), ~14+ = dancing hard
        const e = Math.max(0, Math.min(100, ((diff - 1.5) / 12.5) * 100));
        this.energy[i] = this.energy[i] * 0.65 + e * 0.35;   // smooth
      }
    }
    this.prev = gray;
    return this.energy;
  }
}

// Procedural disco music: four-on-the-floor kick, hats, bass line and chord stabs at 120 BPM.
// Gets louder and adds layers as the dancing heats up; swells and explodes at the end.
export class DiscoMusic {
  constructor(actx) {
    this.a = actx;
    this.master = actx.createGain(); this.master.gain.value = 0;
    this.comp = actx.createDynamicsCompressor();
    this.master.connect(this.comp).connect(actx.destination);
    this.level = 0;     // 0..1 how hard everyone is dancing
    this.hype = 0;      // 0..1 party meter
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.swell = null;
    this.noiseBuf = (() => { const b = actx.createBuffer(1, actx.sampleRate, actx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
  }
  start() {
    if (this.timer) return;
    this.nextTime = this.a.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  stop() {
    clearInterval(this.timer); this.timer = null;
    this.master.gain.cancelScheduledValues(this.a.currentTime);
    this.master.gain.setTargetAtTime(0, this.a.currentTime, 0.3);
    if (this.swell) { try { this.swell.stop(); } catch {} this.swell = null; }
  }
  setLevel(level, hype) {
    this.level = level; this.hype = hype;
    // louder and louder as people dance (quiet but audible when nobody moves)
    const vol = 0.12 + level * 0.5 + hype * 0.3;
    this.master.gain.setTargetAtTime(vol, this.a.currentTime, 0.4);
    if (this.swellGain) this.swellGain.gain.setTargetAtTime(Math.max(0, hype - 0.4) * 0.25, this.a.currentTime, 0.3);
    if (this.swellOsc) this.swellOsc.frequency.setTargetAtTime(110 + hype * 330, this.a.currentTime, 0.3);
  }
  schedule() {
    const spb = 60 / (120 + this.hype * 8) / 4;   // 16th notes, tempo creeps up with the hype
    while (this.nextTime < this.a.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += spb;
      this.step = (this.step + 1) % 64;
    }
    if (this.hype > 0.4 && !this.swell) this.startSwell();
  }
  env(node, t, peak, dur) {
    const g = this.a.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g).connect(this.master);
    return g;
  }
  playStep(s, t) {
    const a = this.a, L = this.level, H = this.hype;
    const beat = s % 4 === 0;
    // kick on every beat
    if (beat) { const o = a.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); this.env(o, t, 0.9, 0.25); o.start(t); o.stop(t + 0.3); }
    // open hat on the off-beat, closed hats when the dancing picks up
    if (s % 4 === 2 || (L > 0.35 && s % 2 === 1)) {
      const n = a.createBufferSource(); n.buffer = this.noiseBuf;
      const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
      n.connect(f); this.env(f, t, s % 4 === 2 ? 0.25 : 0.1, s % 4 === 2 ? 0.12 : 0.04); n.start(t); n.stop(t + 0.15);
    }
    // clap on 2 and 4
    if (L > 0.2 && s % 8 === 4) {
      const n = a.createBufferSource(); n.buffer = this.noiseBuf;
      const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500;
      n.connect(f); this.env(f, t, 0.35, 0.15); n.start(t); n.stop(t + 0.2);
    }
    // octave-bouncing disco bass
    const roots = [41.2, 41.2, 49, 55];        // E1, E1, G1, A1 (one per bar)
    const root = roots[Math.floor(s / 16) % 4];
    if (s % 2 === 0) {
      const o = a.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = root * (s % 4 === 2 ? 4 : 2);
      const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300 + L * 900 + H * 1500;
      o.connect(f); this.env(f, t, 0.3, 0.14); o.start(t); o.stop(t + 0.16);
    }
    // chord stabs once the floor is warming up
    if (L > 0.5 && (s % 8 === 2 || s % 8 === 6)) {
      for (const m of [4, 5, 6]) {
        const o = a.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = root * 4 * Math.pow(2, [0, 4, 7][m - 4] / 12) * 2;
        o.detune.value = (Math.random() - 0.5) * 12;
        const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500;
        o.connect(f); this.env(f, t, 0.07, 0.18); o.start(t); o.stop(t + 0.2);
      }
    }
  }
  startSwell() {
    const a = this.a;
    const n = a.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 2;
    this.swellOsc = a.createOscillator(); this.swellOsc.type = 'sawtooth'; this.swellOsc.frequency.value = 110;
    this.swellGain = a.createGain(); this.swellGain.gain.value = 0;
    n.connect(f).connect(this.swellGain); this.swellOsc.connect(this.swellGain);
    this.swellGain.connect(this.master);
    n.start(); this.swellOsc.start();
    this.swell = { stop: () => { n.stop(); this.swellOsc.stop(); } };
  }
  boom() {
    const a = this.a, t = a.currentTime;
    // big boom: sub drop + crash
    const o = a.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(25, t + 1.5);
    const g = a.createGain(); g.gain.setValueAtTime(1.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 2);
    o.connect(g).connect(this.comp); o.start(t); o.stop(t + 2);
    const n = a.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const g2 = a.createGain(); g2.gain.setValueAtTime(0.9, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 3);
    n.connect(g2).connect(this.comp); n.start(t); n.stop(t + 3);
    this.stop();
  }
}
