// Hydra Cubed client pieces: wireframe monsters, red armor + shield + sword for the players,
// and the camera controls (raise left hand = shield, swing right arm = sword, lean to dodge).
import * as THREE from 'three';
import { HYDRA } from '/shared/hydra.js';
import { PoseTracker, BONES } from './dance.js';

const wire = (color, opacity = 0.95) => new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity });
const solid = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
const ease = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));

// ---------- monsters ----------
const SEG_GEO = new THREE.SphereGeometry(1, 8, 6);
const NECK_SEGS = 11;

function makeHead(mat, size, hood) {
  const g = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), mat);
  skull.scale.set(1, 0.62, 1.45);
  g.add(skull);
  // lower jaw hinges open when it strikes
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, -0.18);
  const jm = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat);
  jm.scale.set(0.95, 0.5, 1.6); jm.position.z = 0.26;
  jaw.add(jm);
  // fangs
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 5), solid(0xffffff));
    f.position.set(0.12 * s, -0.12, 0.3); f.rotation.x = Math.PI;
    g.add(f);
  }
  g.add(jaw);
  // glowing eyes
  const eyeMat = solid(0xffe000);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), eyeMat);
    e.position.set(0.17 * s, 0.1, 0.22);
    g.add(e);
  }
  // forked tongue flicks out before a strike
  const tongue = new THREE.Group();
  tongue.position.set(0, -0.05, 0.42);
  const tm = new THREE.MeshBasicMaterial({ color: 0xff2050 });
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), tm);
    t.rotation.set(Math.PI / 2, 0, s * 0.35); t.position.set(0.03 * s, 0, 0.12);
    tongue.add(t);
  }
  tongue.scale.setScalar(0.01);
  g.add(tongue);
  let hoodMesh = null;
  if (hood) {
    // cobra hood: a wide flat fan behind the head
    hoodMesh = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), mat);
    hoodMesh.scale.set(1, 1.35, 1);
    hoodMesh.position.set(0, -0.55, -0.35);
    hoodMesh.rotation.x = -0.25;
    g.add(hoodMesh);
  }
  g.scale.setScalar(size);
  return { g, jaw, tongue, eyeMat };
}

function tube(points, radius, mat, seg = 40) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), seg, radius, 8, false), mat);
}
function leg(x, z, len, r, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, len, 8, 2), mat);
  m.position.set(x, len / 2, z);
  const paw = new THREE.Mesh(new THREE.SphereGeometry(r * 1.3, 8, 5), mat);
  paw.scale.set(1, 0.5, 1.4); paw.position.set(x, r * 0.5, z + r * 0.4);
  return [m, paw];
}

export class Monster {
  constructor(kind) {
    this.kind = kind;
    const def = HYDRA.monsters[kind];
    this.color = new THREE.Color(def.color);
    this.mat = wire(def.color);
    this.strikeMat = wire(0xff2a2a);
    this.g = new THREE.Group();
    this.bodyG = new THREE.Group();
    this.g.add(this.bodyG);
    this.necks = [];
    this.flying = [];          // chopped-off heads tumbling to the floor
    this.dodgeT = 0; this.dodgeDir = 1; this.hitT = 0;
    const m = this.mat;
    let bases, rests, size;
    if (kind === 'cobra') {
      // coiled body
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const a = i / 40 * Math.PI * 5, r = 1.25 - i / 40 * 0.65;
        pts.push([Math.cos(a) * r, 0.22 + i / 40 * 0.75, Math.sin(a) * r]);
      }
      this.bodyG.add(tube(pts, 0.24, m, 120));
      bases = [[0, 1.0, 0.2]]; rests = [[0, 3.2, 1.0]]; size = 1.25;
    } else if (kind === 'twin') {
      // a dog's body with two snake necks
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.5, 6, 12), m);
      torso.rotation.x = Math.PI / 2; torso.position.set(0, 1.35, -0.1);
      this.bodyG.add(torso);
      for (const [x, z] of [[-0.38, 0.6], [0.38, 0.6], [-0.38, -0.85], [0.38, -0.85]]) this.bodyG.add(...leg(x, z, 1.1, 0.13, m));
      this.bodyG.add(tube([[0, 1.5, -1.1], [0, 1.9, -1.6], [0, 2.3, -1.8], [0, 2.5, -1.6]], 0.08, m));
      bases = [[-0.28, 1.65, 0.75], [0.28, 1.65, 0.75]]; rests = [[-0.95, 3.0, 1.6], [0.95, 3.0, 1.6]]; size = 1.1;
    } else {
      // the hydra: a big scaly body, thick legs, three long necks
      const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), m);
      torso.scale.set(1.5, 1.1, 1.9); torso.position.set(0, 1.6, -0.3);
      this.bodyG.add(torso);
      for (const [x, z] of [[-1.0, 0.7], [1.0, 0.7], [-1.0, -1.2], [1.0, -1.2]]) this.bodyG.add(...leg(x, z, 1.0, 0.26, m));
      this.bodyG.add(tube([[0, 1.4, -2.0], [0, 1.0, -2.8], [0.4, 0.5, -3.5], [1.0, 0.3, -3.8]], 0.22, m));
      bases = [[-0.75, 2.2, 0.9], [0, 2.45, 1.1], [0.75, 2.2, 0.9]]; rests = [[-1.9, 3.9, 1.9], [0, 4.6, 2.2], [1.9, 3.9, 1.9]]; size = 1.4;
    }
    bases.forEach((b, i) => {
      const segs = [];
      for (let k = 0; k < NECK_SEGS; k++) {
        const s = new THREE.Mesh(SEG_GEO, m);
        this.g.add(s); segs.push(s);
      }
      const head = makeHead(m, size, kind === 'cobra');
      this.g.add(head.g);
      const rest = new THREE.Vector3(...rests[i]);
      head.g.position.copy(rest);
      this.necks.push({ base: new THREE.Vector3(...b), rest, segs, head, alive: true, radius: kind === 'hydra' ? 0.24 : 0.19, open: 0 });
    });
    this.rise = 0; this.dead = 0; this.yaw = 0;
    this.g.scale.setScalar(1.55);      // big and scary
  }

  setOpacity(o) {
    for (const mat of [this.mat, this.strikeMat]) mat.opacity = 0.95 * o;
    for (const n of this.necks) n.head.eyeMat.opacity = o;
  }

  chop(i) {
    const n = this.necks[i];
    if (!n || !n.alive) return;
    n.alive = false;
    // the severed head tumbles away
    const h = n.head.g;
    const wp = h.getWorldPosition(new THREE.Vector3());
    const copy = h.clone();
    copy.position.copy(wp); copy.quaternion.copy(h.getWorldQuaternion(new THREE.Quaternion()));
    copy.scale.setScalar(h.scale.x);
    this.g.parent?.add(copy);
    this.flying.push({ obj: copy, v: new THREE.Vector3((Math.random() - 0.5) * 4, 5, 3), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), t: 0 });
    h.visible = false;
  }

  dodge() { this.dodgeT = 1; this.dodgeDir = Math.random() < 0.5 ? -1 : 1; }
  hit() { this.hitT = 1; }

  // st: { state, k (progress 0..1 of the current state), head, open, targetPos (world Vector3|null), faceYaw }
  update(dt, t, st) {
    // turn toward whoever it's about to strike
    let dy = st.faceYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 5);
    this.g.rotation.y = this.yaw;
    // rising from the ground / collapsing
    if (st.state === 'rise') this.rise = ease(clamp01(st.k)); else this.rise = 1;
    this.g.position.y = -8 * (1 - this.rise);
    if (st.state === 'dead') this.dead = Math.min(1, this.dead + dt * 1.2);
    this.bodyG.rotation.z = this.dead * 0.5;
    this.dodgeT = Math.max(0, this.dodgeT - dt * 2.5);
    this.hitT = Math.max(0, this.hitT - dt * 3);
    const flash = this.hitT > 0 && Math.floor(t * 20) % 2 === 0;
    this.mat.color.copy(flash ? new THREE.Color(0xffffff) : this.color);

    const targetLocal = st.targetPos ? this.g.worldToLocal(st.targetPos.clone()) : null;
    const tmp = new THREE.Vector3();
    this.necks.forEach((n, i) => {
      const striking = i === st.head && (st.state === 'windup' || st.state === 'strike');
      // the twin rears BOTH heads back so you can't tell which one will strike until the last moment
      const rearing = st.state === 'windup' && (striking || this.kind === 'twin');
      const p = n.rest.clone();
      const sway = st.state === 'sway' ? 1 : 0.4;
      p.x += Math.sin(t * 1.6 + i * 2.1) * 0.55 * sway;
      p.y += Math.sin(t * 2.3 + i) * 0.18;
      p.z += Math.cos(t * 1.3 + i) * 0.25 * sway;
      p.x += this.dodgeDir * Math.sin(this.dodgeT * Math.PI) * 1.4;     // jerks aside when you swing too early
      let look = null, rate = 6, open = 0;
      if (rearing) {
        const w = ease(clamp01(st.k * 1.4));
        p.add(tmp.set(0, 0.8, -1.5).multiplyScalar(w));
        look = p.clone().add(new THREE.Vector3(0, 1.2, 1));
        open = striking ? w * 0.4 : 0.1;
        // the real striker flicks its tongue and turns red in the last moment
        if (striking && st.k > (this.kind === 'twin' ? 0.55 : 0.2)) open = 0.6;
      } else if (striking && st.state === 'strike' && targetLocal) {
        const lunge = targetLocal.clone().lerp(n.base, 0.12); lunge.y = 1.7;
        if (st.k < 0.22 || !st.open) {
          // lunging (and pulling back after a bite)
          const back = st.k < 0.22 ? 1 : clamp01(1 - (st.k - 0.22) * 3);
          p.lerp(lunge, back);
          rate = 28; open = back;
        } else {
          // it missed: dazed, head low and open to a sword hit
          const dazed = targetLocal.clone().lerp(n.base, 0.45); dazed.y = 0.9 + Math.sin(t * 6) * 0.1;
          dazed.x += Math.sin(t * 3) * 0.3;
          p.copy(dazed); rate = 8; open = 0.2;
          look = dazed.clone().add(new THREE.Vector3(Math.sin(t * 4), -0.6, 1));
        }
      }
      if (this.dead > 0) { p.lerp(new THREE.Vector3(p.x * 1.4, 0.4, p.z + 1.5), this.dead); rate = 4; }
      const h = n.head.g;
      h.position.lerp(p, Math.min(1, dt * rate));
      if (!look) look = targetLocal && (st.state === 'strike' || st.state === 'windup') ? targetLocal.clone().setY(1.5) : h.position.clone().add(new THREE.Vector3(0, -0.15, 1));
      h.lookAt(this.g.localToWorld(look.clone()));
      n.open += (open - n.open) * Math.min(1, dt * 14);
      n.head.jaw.rotation.x = n.open * 0.9;
      n.head.tongue.scale.setScalar(Math.max(0.01, rearing && striking ? Math.abs(Math.sin(t * 25)) : 0.01));
      const red = striking && (st.state === 'strike' || (st.state === 'windup' && st.k > (this.kind === 'twin' ? 0.55 : 0.2)));
      h.children.forEach(c => { if (c.material === this.mat || c.material === this.strikeMat) c.material = red ? this.strikeMat : this.mat; });
      n.head.jaw.children[0].material = red ? this.strikeMat : this.mat;
      // neck: a curve from the base up and over to the head
      const ctrl = n.base.clone().add(new THREE.Vector3(0, (h.position.y - n.base.y) * 0.8 + 0.6, 0));
      const count = n.alive ? NECK_SEGS : 3;
      n.segs.forEach((s, k) => {
        s.visible = k < count;
        if (!s.visible) return;
        const u = n.alive ? k / (NECK_SEGS - 1) : k / (NECK_SEGS - 1) * 0.8;
        const a = 1 - u;
        s.position.set(
          a * a * n.base.x + 2 * a * u * ctrl.x + u * u * h.position.x,
          a * a * n.base.y + 2 * a * u * ctrl.y + u * u * h.position.y,
          a * a * n.base.z + 2 * a * u * ctrl.z + u * u * h.position.z);
        s.scale.setScalar(n.radius * (1.25 - u * 0.5));
        s.material = red ? this.strikeMat : this.mat;
      });
    });
    // severed heads fall and fade
    for (const f of this.flying) {
      f.t += dt;
      f.v.y -= 14 * dt;
      f.obj.position.addScaledVector(f.v, dt);
      if (f.obj.position.y < 0.3) { f.obj.position.y = 0.3; f.v.multiplyScalar(0.5); f.v.y = Math.abs(f.v.y) * 0.4; }
      f.obj.rotation.x += f.spin.x * dt; f.obj.rotation.y += f.spin.y * dt;
    }
  }

  dispose() {
    this.g.parent?.remove(this.g);
    for (const f of this.flying) f.obj.parent?.remove(f.obj);
  }
}

// ---------- player gear: red armor, shield, sword ----------
const ARMOR_RED = 0xff2a2a;
function buildSword() {
  const g = new THREE.Group();
  const steel = wire(0xdff4ff), gold = wire(0xffc23c);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 1.0, 0.02, 1, 6, 1), steel);
  blade.position.y = 0.62;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.053, 0.16, 4), steel);
  tip.position.y = 1.2; tip.rotation.y = Math.PI / 4; tip.scale.z = 0.3;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.07), gold);
  guard.position.y = 0.1;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6), gold);
  grip.position.y = -0.02;
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), gold);
  pommel.position.y = -0.13;
  g.add(blade, tip, guard, grip, pommel);
  return g;
}
function buildShield() {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 18, 1), wire(0xbfe6ff));
  face.rotation.x = Math.PI / 2;               // disc faces forward (-z)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 24), wire(0xffc23c));
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), wire(0xffc23c));
  boss.rotation.x = -Math.PI / 2; boss.position.z = -0.03;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.35, 18), new THREE.MeshBasicMaterial({ color: 0x4fb8ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  g.add(face, rim, boss, fill);
  g.userData.mats = [face.material, rim.material, boss.material];
  g.userData.fill = fill.material;
  return g;
}
export function equipHydra(body) {
  if (body.hydraGear) return body.hydraGear;
  const red = wire(ARMOR_RED);
  // helmet with a crest and cheek guards
  const helmet = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), red);
  dome.scale.set(0.95, 1.15, 1.05); dome.position.y = 0.02;
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.34, 1, 2, 4), red);
  crest.position.y = 0.21;
  const cheeks = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.12, 12, 1, true, Math.PI * 0.25, Math.PI * 1.5), red);
  cheeks.position.y = -0.06;
  helmet.add(dome, crest, cheeks);
  body.head.add(helmet);
  // arm armor: shoulder guards and bracers on both arms
  const arms = [];
  for (const arm of [body.armL, body.armR]) {
    const paul = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), red);
    paul.scale.set(1.1, 0.8, 1.1); paul.position.y = 0.02;
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.2, 10, 2, true), red);
    brace.position.y = -0.2;
    const vamb = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.2, 10, 2, true), red);
    vamb.position.y = -0.17;
    arm.upper.add(paul, brace);
    arm.fore.add(vamb);
    arms.push(paul, brace, vamb);
  }
  // chest plate and belt
  const chest = new THREE.Group();
  const plateGeo = new THREE.CapsuleGeometry(0.235, 0.3, 4, 12);
  plateGeo.scale(1.22, 1, 0.85);
  const plate = new THREE.Mesh(plateGeo, red);
  plate.position.y = 0.3;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 20), red);
  belt.rotation.x = Math.PI / 2; belt.scale.set(1.15, 0.85, 1); belt.position.y = 0.03;
  chest.add(plate, belt);
  body.spine.add(chest);
  const shield = buildShield();
  body.spine.add(shield);
  const sword = buildSword();
  body.setWeapon(sword, 'melee');
  body.hydraGear = { helmet, arms, chest, shield, sword, k: 0, lean: 0, back: 0, armor: [helmet, chest, ...arms] };
  return body.hydraGear;
}
export function unequipHydra(body) {
  const gear = body.hydraGear;
  if (!gear) return;
  gear.helmet.parent?.remove(gear.helmet);
  gear.chest.parent?.remove(gear.chest);
  gear.shield.parent?.remove(gear.shield);
  for (const a of gear.arms) a.parent?.remove(a);
  if (body.held === gear.sword) body.setWeapon(null);
  body.spine.rotation.z = 0;
  body.hydraGear = null;
}
// pose the gear after the normal body animation: shield arm, leaning, armor pieces left
export function poseHydra(body, dt, { hits, shieldUp, cooling, lean }) {
  const g = body.hydraGear;
  if (!g) return;
  g.helmet.visible = hits < 1;
  for (const a of g.arms) a.visible = hits < 2;
  g.chest.visible = hits < 3;
  g.k += ((shieldUp ? 1 : 0) - g.k) * Math.min(1, dt * 16);
  const k = g.k;
  // shield: at your side, or raised in front of your chest
  g.shield.position.set(THREE.MathUtils.lerp(-0.43, -0.12, k), THREE.MathUtils.lerp(0.18, 0.6, k), THREE.MathUtils.lerp(-0.05, -0.5, k));
  g.shield.rotation.set(0, THREE.MathUtils.lerp(-Math.PI / 2 + 0.3, 0.15, k), 0);
  g.shield.scale.setScalar(1 + k * 0.2);
  for (const m of g.shield.userData.mats) m.opacity = cooling ? 0.35 : 0.95;
  g.shield.userData.fill.opacity = shieldUp ? 0.3 : cooling ? 0.03 : 0.12;
  body.armL.shoulder.rotation.set(THREE.MathUtils.lerp(0.1, 1.45, k), 0, THREE.MathUtils.lerp(-0.15, 0.55, k));
  body.armL.elbow.rotation.x = THREE.MathUtils.lerp(-0.3, 0.35, k);
  // lean left / right / back
  const lz = lean === 'left' ? 0.32 : lean === 'right' ? -0.32 : 0;
  g.lean += (lz - g.lean) * Math.min(1, dt * 10);
  g.back += ((lean === 'back' ? 0.35 : 0) - g.back) * Math.min(1, dt * 10);
  body.spine.rotation.z = g.lean;
  body.spine.rotation.x += g.back;
}

// ---------- camera controls ----------
// Raise your left hand above your shoulder = shield. Swing your right arm fast = sword.
// Lean your head left/right of where you started = lean; step/lean back (you look smaller) = lean back.
export class HydraControl {
  constructor() {
    this.tracker = new PoseTracker();
    this.fake = this.tracker.fake;
    this.status = 'off';     // off | asking | loading | calibrating | ready | nocam | error
    this.video = null;
    this.ownStream = false;
    this.reset();
  }
  reset() {
    this.base = null; this.samples = []; this.firstSample = 0; this.points = null; this.lastPts = null;
    this.lean = null; this.shieldWasUp = false; this.lastSwing = 0; this.wristPrev = null; this.fakeT = 0;
  }
  async start(sharedVideo) {
    this.reset();
    if (this.fake) { this.status = 'calibrating'; return true; }
    this.status = 'asking';
    try {
      let stream = sharedVideo?.srcObject;
      if (!stream || !stream.active) {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 } }, audio: false });
        this.ownStream = true;
      }
      const v = document.createElement('video');
      v.playsInline = true; v.muted = true; v.autoplay = true; v.setAttribute('playsinline', '');
      v.srcObject = stream;
      await v.play().catch(() => {});
      this.video = v;
    } catch (e) { this.status = 'nocam'; return false; }
    this.status = 'loading';
    await this.tracker.load();
    this.status = this.tracker.status === 'ready' ? 'calibrating' : 'error';
    return this.status === 'calibrating';
  }
  stop() {
    if (this.ownStream) this.video?.srcObject?.getTracks().forEach(tr => tr.stop());
    this.video = null; this.ownStream = false;
    this.status = 'off';
    this.tracker.reset();
  }
  get active() { return this.status === 'calibrating' || this.status === 'ready'; }

  // a standing person for testing without a camera (?fakeface=1): leans and raises the shield now and then
  fakeBody(dt) {
    this.fakeT += dt;
    const T = this.fakeT, cx = 0.5 + Math.sin(T * 0.7) * (T > 3 ? 0.05 : 0);
    const pts = Array.from({ length: 33 }, () => ({ x: cx, y: 0.6, v: 1 }));
    const set = (k, x, y) => { pts[k] = { x, y, v: 1 }; };
    const w = 0.09;
    set(0, cx, 0.25);
    set(11, cx - w, 0.42); set(12, cx + w, 0.42);
    const up = Math.sin(T * 0.9) > 0.6;
    set(13, cx - w - 0.03, up ? 0.3 : 0.55); set(15, cx - w + 0.01, up ? 0.2 : 0.66);
    set(14, cx + w + 0.04, 0.55); set(16, cx + w + 0.05, 0.66);
    set(23, cx - 0.06, 0.72); set(24, cx + 0.06, 0.72);
    set(25, cx - 0.06, 0.86); set(26, cx + 0.06, 0.86); set(27, cx - 0.06, 0.98); set(28, cx + 0.06, 0.98);
    return pts;
  }

  // returns { shield, swing, lean, calibrated } for this frame
  update(dt) {
    const out = { shield: false, swing: false, lean: this.lean, calibrated: false };
    if (!this.active) return out;
    let pts = null;
    if (this.fake) pts = this.fakeBody(dt);
    else {
      const vis = this.tracker.update(this.video);
      const width = (pp) => Math.hypot(pp[11].x - pp[12].x, pp[11].y - pp[12].y);
      const best = vis.slice().sort((a, b) => width(b.points) - width(a.points))[0];
      pts = best ? best.points : null;
    }
    this.points = pts;
    if (!pts || pts === this.lastPts) return out;
    const fresh = this.lastPts;
    this.lastPts = pts;
    const now = performance.now();
    const sw = Math.max(0.02, Math.hypot(pts[11].x - pts[12].x, pts[11].y - pts[12].y));
    if (this.status === 'calibrating') {
      if (!this.firstSample) this.firstSample = now;
      this.samples.push({ x: pts[0].x, w: sw });
      if (now - this.firstSample > 1500 && this.samples.length >= 8) {
        const n = this.samples.length;
        this.base = { x: this.samples.reduce((a, s) => a + s.x, 0) / n, w: this.samples.reduce((a, s) => a + s.w, 0) / n };
        this.status = 'ready';
        out.calibrated = true;
      }
      return out;
    }
    // lean
    const dx = (pts[0].x - this.base.x) / this.base.w;
    let lean = null;
    if (dx < -0.45) lean = 'left';
    else if (dx > 0.45) lean = 'right';
    else if (sw < this.base.w * 0.85) lean = 'back';
    this.lean = out.lean = lean;
    // shield: left wrist raised above the left shoulder
    const lw = pts[15], ls = pts[11];
    const up = lw.v > 0.5 && lw.y < ls.y - sw * 0.15;
    if (up && !this.shieldWasUp) out.shield = true;
    this.shieldWasUp = up;
    // sword: right wrist moving fast compared to the shoulders
    const mid = { x: (pts[11].x + pts[12].x) / 2, y: (pts[11].y + pts[12].y) / 2 };
    const rw = { x: pts[16].x - mid.x, y: pts[16].y - mid.y, t: now, v: pts[16].v };
    if (this.wristPrev && fresh && rw.v > 0.5) {
      const dts = Math.max(0.03, (rw.t - this.wristPrev.t) / 1000);
      const speed = Math.hypot(rw.x - this.wristPrev.x, rw.y - this.wristPrev.y) / dts / sw;
      if (speed > 3.2 && now - this.lastSwing > 600) { this.lastSwing = now; out.swing = true; }
    }
    this.wristPrev = rw;
    return out;
  }

  // small mirrored preview with the skeleton and lean guides
  draw(canvas) {
    const W = canvas.width, Hc = canvas.height, x = canvas.getContext('2d');
    x.clearRect(0, 0, W, Hc);
    if (this.video && this.video.readyState >= 2) {
      x.save(); x.translate(W, 0); x.scale(-1, 1);
      const vw = this.video.videoWidth, vh = this.video.videoHeight, sc = Math.max(W / vw, Hc / vh);
      x.drawImage(this.video, (W - vw * sc) / 2, (Hc - vh * sc) / 2, vw * sc, vh * sc);
      x.restore();
    } else { x.fillStyle = '#081018'; x.fillRect(0, 0, W, Hc); }
    const pts = this.points;
    if (this.base) {
      // lean zones
      x.strokeStyle = 'rgba(255,255,255,0.35)'; x.setLineDash([6, 6]); x.lineWidth = 2;
      for (const s of [-0.45, 0.45]) { const lx = (this.base.x + s * this.base.w) * W; x.beginPath(); x.moveTo(lx, 0); x.lineTo(lx, Hc); x.stroke(); }
      x.setLineDash([]);
    }
    if (!pts) return;
    const P = (p) => [p.x * W, p.y * Hc];
    x.lineCap = 'round'; x.lineWidth = 4; x.strokeStyle = '#00ffc8';
    for (const [a, b] of BONES) {
      if (pts[a].v < 0.4 || pts[b].v < 0.4) continue;
      const [x1, y1] = P(pts[a]), [x2, y2] = P(pts[b]);
      x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
    }
    const [hx, hy] = P(pts[0]);
    x.beginPath(); x.arc(hx, hy, 10, 0, Math.PI * 2); x.stroke();
    // shield hand (left, shown on the left like a mirror) and sword hand
    const [lx, ly] = P(pts[15]), [rx, ry] = P(pts[16]);
    x.fillStyle = this.shieldWasUp ? '#4fb8ff' : '#bfe6ff'; x.beginPath(); x.arc(lx, ly, 9, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffc23c'; x.beginPath(); x.arc(rx, ry, 7, 0, Math.PI * 2); x.fill();
  }
}
