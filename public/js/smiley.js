// The giant yellow Say Cheese smiley. Drawn on a canvas every frame so it can morph
// smoothly between emotions (brows, eyes, mouth) and show little extras (tears, zzz, hearts...).
import * as THREE from 'three';
import { emotionById } from '/shared/emotions.js';

const lerp = (a, b, k) => a + (b - a) * k;

export class Smiley {
  constructor(size = 12) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true }));
    this.cur = { brow: 0, browY: 0, curve: 0.8, open: 0, width: 1 };
    this.face = emotionById('happy').face;
    this.flashT = 0;
    this.draw(0);
  }

  setEmotion(id) {
    const e = emotionById(id);
    if (e) this.face = e.face;
  }

  update(dt, t) {
    const f = this.face, k = Math.min(1, dt * 6);
    this.cur.brow = lerp(this.cur.brow, f.brow, k);
    this.cur.browY = lerp(this.cur.browY, f.browY, k);
    this.cur.curve = lerp(this.cur.curve, f.mouth.curve, k);
    this.cur.open = lerp(this.cur.open, f.mouth.open, k);
    this.cur.width = lerp(this.cur.width, f.mouth.width, k);
    this.flashT = Math.max(0, this.flashT - dt * 2);
    this.draw(t);
    this.texture.needsUpdate = true;
  }

  draw(t) {
    const c = this.ctx, S = 512, cx = S / 2, cy = S / 2 + Math.sin(t * 2) * 4, R = 200;
    const f = this.face, m = this.cur;
    c.clearRect(0, 0, S, S);
    // glow + face
    c.save();
    c.shadowColor = '#ffd400'; c.shadowBlur = 40;
    const grd = c.createRadialGradient(cx - 60, cy - 70, 20, cx, cy, R);
    grd.addColorStop(0, '#fff27a'); grd.addColorStop(1, '#ffc400');
    c.fillStyle = grd; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.restore();
    c.lineWidth = 8; c.strokeStyle = '#c99700'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();

    const ex = 70, ey = cy - 45;
    const ink = '#2b1a00';
    // cheeks for puffed / blush
    if (f.mouth.type === 'puff') {
      c.fillStyle = '#ffb000';
      for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(cx + sd * 120, cy + 60, 55, 45, 0, 0, Math.PI * 2); c.fill(); }
    }
    if (f.extras.includes('blush')) {
      c.fillStyle = 'rgba(255,90,120,0.55)';
      for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(cx + sd * 120, cy + 40, 34, 18, 0, 0, Math.PI * 2); c.fill(); }
    }

    // eyebrows: brow -1 = angry (inner ends down), +1 = sad (inner ends up)
    c.strokeStyle = ink; c.lineWidth = 14; c.lineCap = 'round';
    for (const sd of [-1, 1]) {
      const by = ey - 62 - m.browY * 22;
      const inner = m.brow * 18, outer = -m.brow * 6;
      c.beginPath();
      c.moveTo(cx + sd * (ex + 40), by - outer);
      c.quadraticCurveTo(cx + sd * ex, by - 10 - outer / 2, cx + sd * (ex - 38), by - inner);
      c.stroke();
    }

    // eyes
    const eye = (sd, type) => {
      const x = cx + sd * ex, y = ey;
      c.fillStyle = ink; c.strokeStyle = ink; c.lineWidth = 12;
      const pupil = (dx, dy) => {
        c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y, 30, 38, 0, 0, Math.PI * 2); c.fill();
        c.lineWidth = 5; c.stroke();
        c.fillStyle = ink; c.beginPath(); c.arc(x + dx, y + dy, 15, 0, Math.PI * 2); c.fill();
      };
      switch (type) {
        case 'wide': pupil(0, 0); break;
        case 'side': pupil(12, 0); break;
        case 'up': pupil(0, -18); break;
        case 'down': pupil(0, 16); break;
        case 'closed':
          c.beginPath(); c.arc(x, y + 8, 26, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); break;
        case 'squint':
          c.beginPath(); c.moveTo(x - 28, y); c.lineTo(x + 28, y - (sd * 0) ); c.stroke();
          c.beginPath(); c.ellipse(x, y + 2, 22, 8, 0, 0, Math.PI * 2); c.fill(); break;
        case 'hearts': {
          c.fillStyle = '#ff2a5a';
          const s = 26 + Math.sin(t * 8) * 3;
          c.beginPath(); c.moveTo(x, y + s * 0.9);
          c.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.3, x, y - s * 0.4);
          c.bezierCurveTo(x + s * 0.6, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
          c.fill(); break;
        }
        case 'spiral': {
          c.lineWidth = 5; c.beginPath();
          for (let a = 0; a < Math.PI * 6; a += 0.2) {
            const r = a * 2.2, aa = a + t * 6 * sd;
            const px = x + Math.cos(aa) * r, py = y + Math.sin(aa) * r;
            a === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
          }
          c.stroke(); break;
        }
        default:
          c.beginPath(); c.ellipse(x, y, 20, 32, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 6, y - 12, 7, 0, Math.PI * 2); c.fill();
      }
    };
    if (f.eyes === 'wink') { eye(-1, 'normal'); eye(1, 'closed'); }
    else { eye(-1, f.eyes); eye(1, f.eyes); }

    // mouth
    const my = cy + 75, w = 85 * m.width, bend = m.curve * 55, open = m.open * 70;
    c.lineWidth = 12; c.strokeStyle = ink; c.fillStyle = '#7a1020';
    switch (f.mouth.type) {
      case 'o':
        c.beginPath(); c.ellipse(cx, my + 10, 26 + m.width * 10, 22 + open * 0.6, 0, 0, Math.PI * 2); c.fill(); c.stroke(); break;
      case 'kiss': {
        c.fillStyle = '#ff4f7a'; c.lineWidth = 8;
        c.beginPath(); c.ellipse(cx, my, 24, 18, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(cx - 14, my); c.lineTo(cx + 14, my); c.stroke(); break;
      }
      case 'flat':
        c.beginPath(); c.moveTo(cx - w * 0.8, my + 8 - bend * 0.2); c.lineTo(cx + w * 0.8, my + 8 - bend * 0.2); c.stroke(); break;
      case 'wavy': {
        c.beginPath();
        for (let i = 0; i <= 8; i++) {
          const px = cx - w + (i / 8) * w * 2, py = my + 10 - bend * 0.5 * Math.sin((i / 8) * Math.PI) + (i % 2 ? 9 : -9);
          i ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.stroke(); break;
      }
      case 'smirk':
        c.beginPath(); c.moveTo(cx - w * 0.7, my + 12); c.quadraticCurveTo(cx + w * 0.2, my + 22, cx + w * 0.8, my - 10 * Math.max(0.3, m.curve + 0.5)); c.stroke(); break;
      case 'puff':
        c.beginPath(); c.ellipse(cx, my + 8, 16, 10, 0, 0, Math.PI * 2); c.fill(); c.stroke(); break;
      default: {
        // smile/frown, optionally open (with teeth for 'teeth', tongue for 'tongue')
        const top = (x) => my + bend * (1 - Math.pow(x / w, 2)) * -0.0 + bend * (1 - Math.pow(x / w, 2));
        c.beginPath();
        c.moveTo(cx - w, my);
        c.quadraticCurveTo(cx, my + bend * 2, cx + w, my);
        if (open > 4) {
          c.quadraticCurveTo(cx, my + bend * 2 + open * (bend >= 0 ? 1.4 : -0.2) + open, cx - w, my);
          c.closePath();
          c.fillStyle = f.mouth.type === 'teeth' ? '#fff' : '#7a1020';
          c.fill();
          if (f.mouth.type === 'teeth') {
            c.lineWidth = 3;
            for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(cx + i * w / 4, my - 10); c.lineTo(cx + i * w / 4, my + bend * 2 + open); c.stroke(); }
            c.lineWidth = 12;
          } else {
            c.fillStyle = '#ff6b8a';
            c.beginPath(); c.ellipse(cx, my + bend * 1.6 + open * 0.9, w * 0.45, open * 0.35 + 4, 0, 0, Math.PI * 2); c.fill();
          }
        }
        c.stroke();
        if (f.mouth.type === 'tongue') {
          c.fillStyle = '#ff5a7a'; c.lineWidth = 6;
          c.beginPath(); c.ellipse(cx + 18, my + bend * 1.5 + 28, 22, 30, 0.2, 0, Math.PI * 2); c.fill(); c.stroke();
        }
        void top;
      }
    }

    // extras
    const ex2 = f.extras;
    if (ex2.includes('tears')) {
      c.fillStyle = '#4fc3ff';
      for (const sd of [-1, 1]) {
        const drop = ((t * 1.2 + (sd > 0 ? 0.5 : 0)) % 1) * 90;
        c.beginPath(); c.ellipse(cx + sd * (ex + 10), ey + 40 + drop, 10, 16, 0, 0, Math.PI * 2); c.fill();
      }
    }
    if (ex2.includes('sweat')) {
      c.fillStyle = '#7fd8ff';
      c.beginPath(); c.moveTo(cx + 150, cy - 130); c.quadraticCurveTo(cx + 175, cy - 85, cx + 150, cy - 75); c.quadraticCurveTo(cx + 125, cy - 85, cx + 150, cy - 130); c.fill();
    }
    if (ex2.includes('zzz')) {
      c.fillStyle = '#ffffff'; c.strokeStyle = '#2b1a00'; c.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.6 + i / 3) % 1;
        c.font = `900 ${30 + i * 14}px sans-serif`;
        const px = cx + 150 + k * 60, py = cy - 120 - k * 120;
        c.globalAlpha = 1 - k; c.strokeText('Z', px, py); c.fillText('Z', px, py);
      }
      c.globalAlpha = 1;
    }
    if (ex2.includes('steam')) {
      c.fillStyle = 'rgba(255,255,255,0.8)';
      for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
        const k = (t * 1.5 + i / 3) % 1;
        c.globalAlpha = 1 - k;
        c.beginPath(); c.arc(cx + sd * (170 + k * 40), cy - 150 - k * 70, 14 + k * 16, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
    }
    if (ex2.includes('question')) {
      c.fillStyle = '#ffffff'; c.strokeStyle = '#2b1a00'; c.lineWidth = 6;
      c.font = '900 120px sans-serif';
      const bob = Math.sin(t * 3) * 8;
      c.strokeText('?', cx + 170, cy - 100 + bob); c.fillText('?', cx + 170, cy - 100 + bob);
    }
    if (ex2.includes('hearts')) {
      c.fillStyle = '#ff2a5a';
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.5 + i / 4) % 1, s = 14;
        const x = cx + Math.sin(i * 2.3) * 200, y = cy - 160 - k * 60;
        c.globalAlpha = 1 - k;
        c.beginPath(); c.moveTo(x, y + s);
        c.bezierCurveTo(x - s * 1.6, y, x - s * 0.6, y - s * 1.3, x, y - s * 0.4);
        c.bezierCurveTo(x + s * 0.6, y - s * 1.3, x + s * 1.6, y, x, y + s); c.fill();
      }
      c.globalAlpha = 1;
    }
    if (ex2.includes('sparkle') || ex2.includes('stars')) {
      c.fillStyle = ex2.includes('stars') ? '#ffffff' : '#fff7b0';
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + t * (ex2.includes('stars') ? 1.5 : 0.3);
        const r = R + 30, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        const s = 10 + Math.sin(t * 6 + i) * 5;
        c.beginPath();
        for (let p = 0; p < 8; p++) {
          const rr = p % 2 ? s * 0.4 : s, aa = p / 8 * Math.PI * 2;
          p ? c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr) : c.moveTo(x + rr, y);
        }
        c.closePath(); c.fill();
      }
    }
    // camera flash
    if (this.flashT > 0) { c.fillStyle = `rgba(255,255,255,${this.flashT})`; c.beginPath(); c.arc(cx, cy, R + 4, 0, Math.PI * 2); c.fill(); }
  }
}
