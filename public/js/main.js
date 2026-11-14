import * as THREE from 'three';
import { WEAPONS, ARENA, FALL_MS, USES_PER_WEAPON, MAX_HEALTH } from '/shared/weapons.js';
import { WireBody } from './body.js';
import { buildWeaponMesh, animateWeaponMesh } from './weaponMeshes.js';

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.Fog(0x05060a, 40, 110);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 300);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// lights
scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x1a1030, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(12, 30, 8);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -35;
sun.shadow.camera.right = sun.shadow.camera.top = 35;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

// ---------- the room ----------
const S = ARENA.size, H = ARENA.height, HALF = S / 2;
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S),
    new THREE.MeshStandardMaterial({ color: 0x0b0f1a, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(S, 30, 0x00e5ff, 0x113344);
  grid.position.y = 0.01;
  grid.material.transparent = true; grid.material.opacity = 0.55;
  scene.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0a0d18, roughness: 1, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(S, H, S), wallMat);
  room.position.y = H / 2;
  room.receiveShadow = true;
  scene.add(room);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(S, H, S)),
    new THREE.LineBasicMaterial({ color: 0xff3df2 }));
  edges.position.y = H / 2;
  scene.add(edges);

  // grid lines on walls and ceiling
  const wallGrid = (rotX, rotZ, x, y, z, w, h) => {
    const g = new THREE.GridHelper(Math.max(w, h), Math.max(w, h) / 3, 0x2a1640, 0x1a1030);
    g.rotation.set(rotX, 0, rotZ);
    g.position.set(x, y, z);
    g.scale.set(w / Math.max(w, h), 1, h / Math.max(w, h));
    scene.add(g);
  };
  wallGrid(Math.PI / 2, 0, 0, H / 2, -HALF + 0.02, S, H);
  wallGrid(Math.PI / 2, 0, 0, H / 2, HALF - 0.02, S, H);
  wallGrid(Math.PI / 2, Math.PI / 2, -HALF + 0.02, H / 2, 0, H, S);
  wallGrid(Math.PI / 2, Math.PI / 2, HALF - 0.02, H / 2, 0, H, S);
  wallGrid(0, 0, 0, H - 0.02, 0, S, S);
}

// ceiling hatches the weapons drop from
const hatches = [];
for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
  const hatch = new THREE.Mesh(new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({ color: 0x331a00, side: THREE.DoubleSide }));
  hatch.rotation.x = Math.PI / 2;
  hatch.position.set(i * 11, H - 0.05, j * 11);
  scene.add(hatch);
  hatches.push(hatch);
}

// ---------- pressure pads ----------
const pads = ARENA.pads.map((p, i) => {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  const color = i === 0 ? 0x00e5ff : 0xff3df2;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(p.r + 0.3, p.r + 0.4, 0.15, 40),
    new THREE.MeshStandardMaterial({ color: 0x1b1f2b, metalness: 0.6, roughness: 0.4 }));
  base.position.y = 0.075;
  base.receiveShadow = true;
  const plateMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 0.12, 40), plateMat);
  plate.position.y = 0.16;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r + 0.15, 0.05, 8, 48),
    new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, H, 40, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = H / 2;
  const light = new THREE.PointLight(color, 0, 12);
  light.position.y = 1.5;
  g.add(base, plate, ring, beam, light);
  scene.add(g);
  return { group: g, plate, plateMat, ring, beam, light, pressed: 0, active: false };
});

// ---------- HUD helpers ----------
const $ = (id) => document.getElementById(id);
const ui = {
  status: $('status'), fighters: $('fighters'), banner: $('banner'), countdown: $('countdown'),
  prompt: $('prompt'), labels: $('labels'), hpText: $('hpText'), hpBar: $('hpBar'), myName: $('myName'),
  wName: $('wName'), wInfo: $('wInfo'), pips: $('pips'), feed: $('feed'), vignette: $('vignette'),
  crosshair: $('crosshair'), conn: $('conn'),
};
let bannerTimer = 0;
function banner(text, ms = 2500) {
  ui.banner.textContent = text;
  ui.banner.style.opacity = 1;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { ui.banner.style.opacity = 0; }, ms);
}
function feed(text, color = '#e8f6ff') {
  const d = document.createElement('div');
  d.textContent = text; d.style.color = color;
  ui.feed.prepend(d);
  while (ui.feed.children.length > 6) ui.feed.lastChild.remove();
  setTimeout(() => d.remove(), 7000);
}
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const hpColor = (hp) => hp > 60 ? '#4cff6a' : hp > 30 ? '#ffd23c' : '#ff4040';

// ---------- tiny synth for sound effects ----------
let actx = null;
function tone(freq, dur = 0.1, type = 'square', vol = 0.08, slide = 0) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
  o.connect(g).connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}
function noise(dur = 0.2, vol = 0.15) {
  if (!actx) return;
  const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = actx.createBufferSource(), g = actx.createGain();
  src.buffer = buf; g.gain.value = vol;
  src.connect(g).connect(actx.destination);
  src.start();
}

// ---------- local player ----------
const me = {
  id: null, name: '', color: 0xffffff,
  pos: new THREE.Vector3(0, 0, 10), velY: 0, yaw: 0, pitch: -0.15, onGround: true, moving: false,
  hp: MAX_HEALTH, weapon: null, uses: 0, lastAttack: 0,
};
const keys = {};
let locked = false;
let started = false;

// ---------- world state from server ----------
const avatars = new Map();   // id -> { body, label, target, yaw, data, weaponType }
const floorWeapons = new Map(); // id -> { group, mesh, ring, spawnLocal, type, x, z }
let snap = { phase: 'lobby', fighters: [], pads: [false, false], countdown: 0, players: [], weapons: [] };
let lastCount = null;

function getAvatar(p) {
  let a = avatars.get(p.id);
  if (!a) {
    const body = new WireBody(p.color);
    body.root.position.set(...p.p);
    scene.add(body.root);
    const label = document.createElement('div');
    label.className = 'label3d';
    label.innerHTML = `<div class="nm"></div><div class="mini"><div></div></div>`;
    ui.labels.appendChild(label);
    a = { body, label, target: new THREE.Vector3(...p.p), yaw: p.yaw, data: p, weaponType: null };
    avatars.set(p.id, a);
  }
  return a;
}

function removeAvatar(id) {
  const a = avatars.get(id);
  if (!a) return;
  scene.remove(a.body.root);
  a.label.remove();
  avatars.delete(id);
}

function applySnapshot(s) {
  snap = s;
  const seen = new Set();
  for (const p of s.players) {
    seen.add(p.id);
    const a = getAvatar(p);
    a.data = p;
    if (p.id !== me.id) { a.target.set(...p.p); a.yaw = p.yaw; }
    else { me.hp = p.hp; me.weapon = p.w; me.uses = p.uses; }
    if (a.weaponType !== p.w) {
      a.weaponType = p.w;
      a.body.setWeapon(p.w ? buildWeaponMesh(p.w) : null, p.w ? WEAPONS[p.w].kind : null);
    }
  }
  for (const id of [...avatars.keys()]) if (!seen.has(id)) removeAvatar(id);

  // weapons on the floor / falling
  const wSeen = new Set();
  for (const w of s.weapons) {
    wSeen.add(w.id);
    if (!floorWeapons.has(w.id)) {
      const group = new THREE.Group();
      const mesh = buildWeaponMesh(w.type);
      mesh.rotation.z = Math.PI / 2;            // lie flat-ish
      mesh.position.y = 0;
      const holder = new THREE.Group();
      holder.add(mesh);
      holder.scale.setScalar(1.7);              // easier to spot on the floor
      group.add(holder);
      // colored light beacon so weapons are visible from across the room
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.25, 6, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: WEAPONS[w.type].color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      beacon.position.set(w.x, 3, w.z);
      scene.add(beacon);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32),
        new THREE.MeshBasicMaterial({ color: WEAPONS[w.type].color, transparent: true, opacity: 0, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      scene.add(ring);
      group.position.set(w.x, ARENA.dropHeight, w.z);
      group.rotation.y = w.spin;
      scene.add(group);
      floorWeapons.set(w.id, { group, holder, mesh, ring, beacon, spawnLocal: performance.now() - w.age, type: w.type, x: w.x, z: w.z, landed: w.age >= FALL_MS });
      ring.position.x = w.x; ring.position.z = w.z;
    }
  }
  for (const [id, fw] of floorWeapons) {
    if (!wSeen.has(id)) { scene.remove(fw.group); scene.remove(fw.ring); scene.remove(fw.beacon); floorWeapons.delete(id); }
  }

  // countdown numbers
  if (s.phase === 'countdown') {
    const n = Math.ceil(s.countdown / 1000);
    if (n !== lastCount && n > 0) { lastCount = n; tone(440, 0.15, 'square', 0.1); }
    ui.countdown.textContent = n > 0 ? n : '';
    ui.countdown.style.display = 'block';
  } else {
    lastCount = null;
    if (ui.countdown.textContent !== 'FIGHT!') ui.countdown.style.display = 'none';
  }
}

// ---------- effects ----------
const fx = [];
function addTracer(origin, dir, len, color, width = 1) {
  const end = origin.clone().addScaledVector(dir, len);
  const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, linewidth: width }));
  scene.add(line);
  fx.push({ obj: line, life: 0.25, max: 0.25, fade: true });
}
function addBurst(pos, color, count = 14, speed = 5, size = 0.08, life = 0.6) {
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(pos);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
    scene.add(m);
    fx.push({ obj: m, vel: v, life, max: life, fade: true, gravity: 9 });
  }
}
function addSpray(origin, dir, range, color, count = 30) {
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1 + Math.random() * 0.12, 6, 4),
      new THREE.MeshBasicMaterial({ color: i % 3 ? color : 0xffffff, transparent: true }));
    m.position.copy(origin);
    const d = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.35)).normalize();
    const life = 0.35 + Math.random() * 0.2;
    scene.add(m);
    fx.push({ obj: m, vel: d.multiplyScalar(range / life), life, max: life, fade: true, grow: 2.5, delay: Math.random() * 0.12 });
  }
}
function addExplosion(pos) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.9 }));
  m.position.copy(pos);
  scene.add(m);
  fx.push({ obj: m, life: 0.5, max: 0.5, fade: true, grow: 7 });
  addBurst(pos, 0xff5000, 30, 10, 0.15, 0.9);
  noise(0.5, 0.3);
}
function addSwoosh(avatar, color) {
  const arc = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.9, 24, 1, -Math.PI * 0.35, Math.PI * 0.7),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  arc.position.copy(avatar.body.root.position).add(new THREE.Vector3(0, 1.3, 0));
  arc.rotation.set(-Math.PI / 2, 0, avatar.body.root.rotation.y + Math.PI / 2);
  scene.add(arc);
  fx.push({ obj: arc, life: 0.2, max: 0.2, fade: true });
}
function damageNumber(worldPos, amount) {
  const el = document.createElement('div');
  el.className = 'dmg';
  el.textContent = `-${amount}`;
  const v = worldPos.clone().project(camera);
  el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
  el.style.fontSize = `${18 + Math.min(40, amount)}px`;
  document.getElementById('hud').appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translate(-50%, -160%)'; el.style.opacity = 0; });
  setTimeout(() => el.remove(), 1000);
}

function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    if (f.delay > 0) { f.delay -= dt; f.obj.visible = false; continue; }
    f.obj.visible = true;
    f.life -= dt;
    if (f.vel) {
      if (f.gravity) f.vel.y -= f.gravity * dt;
      f.obj.position.addScaledVector(f.vel, dt);
    }
    if (f.grow) f.obj.scale.multiplyScalar(1 + f.grow * dt);
    if (f.fade && f.obj.material) f.obj.material.opacity = Math.max(0, f.life / f.max);
    if (f.life <= 0) {
      scene.remove(f.obj);
      f.obj.geometry?.dispose();
      f.obj.material?.dispose();
      fx.splice(i, 1);
    }
  }
}

function playAttackSound(type) {
  const k = WEAPONS[type].kind;
  if (type === 'chainsaw') { tone(90, 0.45, 'sawtooth', 0.12, 40); return; }
  if (type === 'pool_noodle' || type === 'rubber_chicken') { tone(700, 0.2, 'triangle', 0.1, -400); return; }
  if (k === 'spray') { noise(0.35, type === 'flamethrower' ? 0.2 : 0.06); return; }
  if (k === 'ranged') { noise(0.12, 0.25); tone(160, 0.12, 'square', 0.08, -100); return; }
  tone(260, 0.12, 'triangle', 0.08, -150);
}

// ---------- networking ----------
let ws = null;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ui.conn.textContent = 'connecting…';
  ws.onopen = () => {
    ui.conn.textContent = '';
    if (me.name) send({ t: 'name', name: me.name });
  };
  ws.onclose = () => {
    ui.conn.textContent = 'disconnected — reconnecting…';
    for (const id of [...avatars.keys()]) removeAvatar(id);
    setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    switch (m.t) {
      case 'welcome':
        me.id = m.id; me.color = m.color; me.pos.set(...m.p);
        if (!me.name) me.name = m.name;
        ui.myName.textContent = me.name;
        ui.myName.style.color = hex(m.color);
        break;
      case 'snap': applySnapshot(m); break;
      case 'msg': feed(m.text); break;
      case 'countdown': {
        const names = m.fighters.map(id => avatars.get(id)?.data.name ?? '?');
        banner(`${names[0]} vs ${names[1]}`, 3000);
        break;
      }
      case 'fight':
        ui.countdown.textContent = 'FIGHT!';
        ui.countdown.style.display = 'block';
        setTimeout(() => { if (ui.countdown.textContent === 'FIGHT!') ui.countdown.style.display = 'none'; }, 1200);
        tone(880, 0.4, 'square', 0.12);
        hatchFlash = 1;
        break;
      case 'over':
        banner(`${m.name} WINS!\n${m.reason}`, 5500);
        feed(m.reason, '#ffd23c');
        tone(m.winner === me.id ? 660 : 200, 0.6, 'triangle', 0.15, m.winner === me.id ? 400 : -100);
        break;
      case 'picked':
        tone(520, 0.08, 'square', 0.08, 300);
        feed(`You picked up the ${WEAPONS[m.weapon].name}`, '#00e5ff');
        break;
      case 'broke':
        if (m.id === me.id) feed(`Your ${WEAPONS[m.weapon].name} broke!`, '#ff8c2a');
        tone(150, 0.15, 'sawtooth', 0.06, -80);
        break;
      case 'fx': onAttackFx(m); break;
      case 'hit': onHit(m); break;
    }
  };
}
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

function onAttackFx(m) {
  const a = avatars.get(m.from);
  const def = WEAPONS[m.weapon];
  if (a) {
    a.body.swing(def.kind);
    if (def.kind === 'melee') addSwoosh(a, def.color);
  }
  playAttackSound(m.weapon);
  const origin = new THREE.Vector3(...m.origin);
  const dir = new THREE.Vector3(...m.dir).normalize();
  // start effects from the weapon tip when we can see it
  if (a?.body.held) {
    const tip = new THREE.Vector3();
    a.body.armR.hand.getWorldPosition(tip);
    origin.copy(tip);
  }
  const impact = m.impact ? new THREE.Vector3(...m.impact) : null;
  const len = impact ? origin.distanceTo(impact) : def.range;
  if (def.kind === 'ranged') {
    if (m.weapon === 'rocket_launcher') {
      const rocket = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      rocket.position.copy(origin);
      rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      scene.add(rocket);
      const travel = Math.min(len, def.range) / 40;
      fx.push({ obj: rocket, vel: dir.clone().multiplyScalar(40), life: travel, max: travel });
      setTimeout(() => addExplosion(origin.clone().addScaledVector(dir, Math.min(len, def.range))), travel * 1000);
    } else {
      addTracer(origin, dir, Math.min(len, def.range), m.weapon === 'sniper_rifle' ? 0xffffff : def.color);
      if (m.weapon === 'shotgun') for (let i = 0; i < 6; i++) {
        const d = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.15)).normalize();
        addTracer(origin, d, Math.min(len, def.range), 0xffd080);
      }
      addBurst(origin, 0xffe080, 5, 2, 0.05, 0.15);
    }
  } else if (def.kind === 'spray') {
    addSpray(origin, dir, def.range, def.color, m.weapon === 'flamethrower' ? 45 : 20);
  }
}

let hitMarkerT = 0;
function onHit(m) {
  const target = avatars.get(m.target);
  const def = WEAPONS[m.weapon];
  if (target) {
    target.body.flash();
    const p = target.body.root.position.clone().add(new THREE.Vector3(0, 1.9, 0));
    damageNumber(p, m.dmg);
    addBurst(target.body.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
      m.weapon === 'water_pistol' ? 0x4fc3ff : m.weapon === 'pool_noodle' ? 0xff4fd8 : 0xff2020, 8 + Math.min(20, m.dmg / 2), 4);
  }
  if (m.target === me.id) {
    ui.vignette.style.boxShadow = `inset 0 0 ${120 + m.dmg * 3}px rgba(255,0,0,${Math.min(0.85, 0.25 + m.dmg / 60)})`;
    setTimeout(() => { ui.vignette.style.boxShadow = 'inset 0 0 160px rgba(255,0,0,0)'; }, 180);
    shake = Math.min(0.6, m.dmg / 60);
    tone(110, 0.2, 'sawtooth', 0.12, -60);
  }
  if (m.from === me.id) { hitMarkerT = 0.25; tone(1200, 0.05, 'square', 0.06); }
  feed(`${avatars.get(m.from)?.data.name ?? '?'} hit ${target?.data.name ?? '?'} with ${def.name} for ${m.dmg}`,
    m.from === me.id ? '#7dff3d' : m.target === me.id ? '#ff6060' : '#c8d8ff');
}

// ---------- input ----------
const startEl = $('start');
$('playBtn').addEventListener('click', (e) => { e.stopPropagation(); begin(); });
startEl.addEventListener('click', begin);
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') begin(); e.stopPropagation(); });

function begin() {
  const n = $('nameInput').value.trim();
  if (n) { me.name = n; ui.myName.textContent = n; send({ t: 'name', name: n }); }
  if (!actx) { try { actx = new AudioContext(); } catch {} }
  startEl.style.display = 'none';
  started = true;
  renderer.domElement.requestPointerLock?.();
}
renderer.domElement.addEventListener('click', () => {
  if (started && !locked) renderer.domElement.requestPointerLock?.();
  else if (locked) attack();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  me.yaw -= e.movementX * 0.0025;
  me.pitch = THREE.MathUtils.clamp(me.pitch - e.movementY * 0.0022, -1.1, 0.9);
});
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!started) return;
  if (e.code === 'KeyE') pickup();
  if (e.code === 'KeyQ') send({ t: 'drop' });
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function isFighter() { return snap.fighters.includes(me.id); }

function nearestWeapon() {
  let best = null, bestD = 2.6;
  const t = performance.now();
  for (const [id, fw] of floorWeapons) {
    if (t - fw.spawnLocal < FALL_MS) continue;
    const d = Math.hypot(fw.x - me.pos.x, fw.z - me.pos.z);
    if (d < bestD) { best = { id, ...fw }; bestD = d; }
  }
  return best;
}
function pickup() {
  const w = nearestWeapon();
  if (w) send({ t: 'pickup', id: w.id });
}

const raycaster = new THREE.Raycaster();
function aimDirection() {
  // Aim where the crosshair points: ray from camera, then direction from the player's eye to that point.
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = [];
  for (const [id, a] of avatars) if (id !== me.id) targets.push(a.body.root);
  const hits = raycaster.intersectObjects(targets, true);
  const point = hits.length ? hits[0].point : raycaster.ray.at(80, new THREE.Vector3());
  const eye = me.pos.clone().add(new THREE.Vector3(0, 1.45, 0));
  return point.sub(eye).normalize();
}
function attack() {
  if (!me.weapon || snap.phase !== 'fight' || !isFighter() || me.hp <= 0) return;
  const def = WEAPONS[me.weapon];
  const t = performance.now();
  if (t - me.lastAttack < def.cooldown) return;
  me.lastAttack = t;
  const d = aimDirection();
  // melee swings follow the crosshair: turn the body to face it
  send({ t: 'attack', dir: [d.x, d.y, d.z] });
}

// ---------- main loop ----------
let last = performance.now();
let sendAcc = 0;
let shake = 0;
let hatchFlash = 0;
const clock = { t: 0 };

function updateLocal(dt) {
  const downed = me.hp <= 0 && (snap.phase === 'fight' || snap.phase === 'over') && snap.fighters.includes(me.id);
  const fwd = new THREE.Vector3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
  const right = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
  const move = new THREE.Vector3();
  if (locked && !downed) {
    if (keys.KeyW || keys.ArrowUp) move.add(fwd);
    if (keys.KeyS || keys.ArrowDown) move.sub(fwd);
    if (keys.KeyD || keys.ArrowRight) move.add(right);
    if (keys.KeyA || keys.ArrowLeft) move.sub(right);
  }
  me.moving = move.lengthSq() > 0;
  if (me.moving) {
    const speed = (keys.ShiftLeft || keys.ShiftRight) ? 11 : 6.5;
    move.normalize().multiplyScalar(speed * dt);
    me.pos.add(move);
  }
  if (locked && keys.Space && me.onGround && !downed) { me.velY = 8; me.onGround = false; }
  me.velY -= 22 * dt;
  me.pos.y += me.velY * dt;
  if (me.pos.y <= 0) { me.pos.y = 0; me.velY = 0; me.onGround = true; }
  const lim = HALF - 0.6;
  me.pos.x = THREE.MathUtils.clamp(me.pos.x, -lim, lim);
  me.pos.z = THREE.MathUtils.clamp(me.pos.z, -lim, lim);

  sendAcc += dt;
  if (sendAcc > 0.05) {
    sendAcc = 0;
    send({ t: 'state', p: [me.pos.x, me.pos.y, me.pos.z], yaw: me.yaw, pitch: me.pitch, moving: me.moving });
  }

  const a = me.id != null ? avatars.get(me.id) : null;
  if (a) {
    a.body.root.position.copy(me.pos);
    a.body.root.rotation.y = me.yaw;
    a.body.update(dt, me.moving, me.pitch, downed);
  }
}

function updateRemotes(dt) {
  for (const [id, a] of avatars) {
    if (id === me.id) continue;
    a.body.root.position.lerp(a.target, Math.min(1, dt * 12));
    let dy = a.yaw - a.body.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    a.body.root.rotation.y += dy * Math.min(1, dt * 12);
    const downed = a.data.hp <= 0 && snap.fighters.includes(id) && snap.phase !== 'lobby';
    a.body.update(dt, a.data.moving, a.data.pitch, downed);
  }
}

function updateWeapons(dt, t) {
  const now = performance.now();
  const near = nearestWeapon();
  for (const [id, fw] of floorWeapons) {
    const age = (now - fw.spawnLocal) / 1000;
    const y = Math.max(0.35, ARENA.dropHeight - 0.5 * ARENA.gravity * age * age);
    fw.group.position.y = y;
    const landed = y <= 0.35;
    if (landed && !fw.landed) {
      fw.landed = true;
      addBurst(new THREE.Vector3(fw.x, 0.2, fw.z), WEAPONS[fw.type].color, 10, 3, 0.06, 0.4);
      if (Math.hypot(fw.x - me.pos.x, fw.z - me.pos.z) < 25) tone(180, 0.08, 'triangle', 0.05);
    }
    fw.holder.rotation.x = landed ? 0 : age * 6;
    fw.group.rotation.y += dt * (landed ? 0.8 : 3);
    fw.group.position.y += landed ? Math.sin(t * 3 + id) * 0.08 + 0.1 : 0;
    fw.ring.material.opacity = landed ? (near && near.id === id ? 0.9 : 0.35) : 0;
    fw.beacon.material.opacity = landed ? 0.18 + Math.sin(t * 4 + id) * 0.06 : 0;
    animateWeaponMesh(fw.mesh, t);
  }
  for (const a of avatars.values()) if (a.body.held) animateWeaponMesh(a.body.held, t);

  // pickup prompt
  if (near && isFighter() && !me.weapon && snap.phase === 'fight' && me.hp > 0) {
    const d = WEAPONS[near.type];
    ui.prompt.innerHTML = `Press <b>E</b> to pick up <b style="color:${hex(d.color)}">${d.name}</b> · ${d.damage} dmg`;
    ui.prompt.style.display = 'block';
  } else ui.prompt.style.display = 'none';
}

function updatePads(dt, t) {
  pads.forEach((pad, i) => {
    const on = !!snap.pads[i];
    pad.pressed += ((on ? 1 : 0) - pad.pressed) * Math.min(1, dt * 10);
    pad.plate.position.y = 0.16 - pad.pressed * 0.07;
    pad.plateMat.emissiveIntensity = 0.25 + pad.pressed * 1.6;
    pad.light.intensity = pad.pressed * 12;
    const counting = snap.phase === 'countdown';
    pad.beam.material.opacity = counting ? 0.12 + Math.sin(t * 12) * 0.06 : pad.pressed * 0.05;
    pad.ring.scale.setScalar(1 + (on ? Math.sin(t * 6) * 0.04 : 0));
  });
  // hatches glow when weapons are dropping
  hatchFlash = Math.max(0, hatchFlash - dt * 0.8);
  const fighting = snap.phase === 'fight';
  for (const h of hatches) h.material.color.setHex(fighting ? (hatchFlash > 0.5 && Math.floor(t * 8) % 2 ? 0xffaa00 : 0x663300) : 0x221100);
}

function updateCamera(dt) {
  const target = me.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
  const f = new THREE.Vector3(-Math.sin(me.yaw) * Math.cos(me.pitch), Math.sin(me.pitch), -Math.cos(me.yaw) * Math.cos(me.pitch));
  const right = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
  const dist = 4.2;
  const pos = target.clone().addScaledVector(f, -dist).addScaledVector(right, 0.7);
  const lim = HALF - 0.3;
  pos.x = THREE.MathUtils.clamp(pos.x, -lim, lim);
  pos.z = THREE.MathUtils.clamp(pos.z, -lim, lim);
  pos.y = THREE.MathUtils.clamp(pos.y, 0.3, H - 0.3);
  if (shake > 0) {
    pos.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    shake = Math.max(0, shake - dt * 2);
  }
  camera.position.copy(pos);
  camera.lookAt(target.clone().addScaledVector(f, 20).addScaledVector(right, 0.7));
}

function updateHud() {
  // my panel
  ui.hpText.textContent = Math.ceil(me.hp);
  ui.hpBar.style.width = `${me.hp}%`;
  ui.hpBar.style.background = hpColor(me.hp);
  if (me.weapon) {
    const d = WEAPONS[me.weapon];
    ui.wName.textContent = d.name;
    ui.wName.style.color = hex(d.color);
    const cd = Math.max(0, d.cooldown - (performance.now() - me.lastAttack));
    ui.wInfo.textContent = `${d.damage} damage · ${d.kind} · range ${d.range}m${cd > 0 ? ' · reloading' : ''}`;
  } else {
    ui.wName.textContent = 'Bare hands';
    ui.wName.style.color = '#e8f6ff';
    ui.wInfo.textContent = snap.phase === 'fight' && isFighter() ? 'Grab a weapon from the floor (E)' : 'Weapons drop when the fight starts';
  }
  ui.pips.innerHTML = Array.from({ length: USES_PER_WEAPON }, (_, i) => `<div class="pip ${i < me.uses ? 'on' : ''}"></div>`).join('');

  // status line
  const occupied = snap.pads.filter(Boolean).length;
  let status = '';
  if (snap.phase === 'lobby') {
    const others = snap.players.length - 1;
    status = others < 1 ? 'Waiting for a second player to join… (share this link!)'
      : `Stand on a pressure pad · ${occupied}/2 pads pressed`;
  } else if (snap.phase === 'countdown') status = 'Get ready!';
  else if (snap.phase === 'fight') status = isFighter() ? 'Fight! Pick up weapons and attack' : 'Spectating the match';
  else if (snap.phase === 'over') status = 'Match over — back to the lobby soon';
  ui.status.textContent = status;

  // fighter health bars
  if (snap.phase === 'fight' || snap.phase === 'over' || snap.phase === 'countdown') {
    ui.fighters.style.display = 'flex';
    ui.fighters.innerHTML = snap.fighters.map(id => {
      const p = snap.players.find(x => x.id === id);
      if (!p) return '';
      return `<div class="fbar panel"><div class="label"><span style="color:${hex(p.color)};font-weight:700">${p.name}${id === me.id ? ' (you)' : ''}</span><span>${Math.ceil(p.hp)}</span></div>
        <div class="bar"><div style="width:${p.hp}%;background:${hpColor(p.hp)}"></div></div></div>`;
    }).join('');
  } else ui.fighters.style.display = 'none';

  // name tags over other players
  for (const [id, a] of avatars) {
    if (id === me.id) { a.label.style.display = 'none'; continue; }
    const p = a.body.root.position.clone().add(new THREE.Vector3(0, 2.25, 0));
    const v = p.project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { a.label.style.display = 'none'; continue; }
    a.label.style.display = 'block';
    a.label.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
    a.label.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
    const nm = a.label.querySelector('.nm');
    nm.textContent = a.data.name + (a.data.w ? ` · ${WEAPONS[a.data.w].name}` : '');
    nm.style.color = hex(a.data.color);
    const bar = a.label.querySelector('.mini > div');
    bar.style.width = `${a.data.hp}%`;
    bar.style.background = hpColor(a.data.hp);
  }

  hitMarkerT = Math.max(0, hitMarkerT - 1 / 60);
  ui.crosshair.classList.toggle('hit', hitMarkerT > 0);
}

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock.t += dt;
  updateLocal(dt);
  updateRemotes(dt);
  updateWeapons(dt, clock.t);
  updatePads(dt, clock.t);
  updateFx(dt);
  updateCamera(dt);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

connect();
frame();

// expose a little for debugging / automated tests
window.__dp = { me, snap: () => snap, avatars, floorWeapons, send, scene, camera, THREE };
