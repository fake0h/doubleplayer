import * as THREE from 'three';
import { WEAPONS, ARENA, FALL_MS, USES_PER_WEAPON, MAX_HEALTH, usesOf, wallBox, wallHeightAt } from '/shared/weapons.js';
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
scene.fog = new THREE.Fog(0x05060a, 50, 130);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 300);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// lights
scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x1a1030, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(12, 60, 8);
sun.shadow.camera.far = 150;
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -35;
sun.shadow.camera.right = sun.shadow.camera.top = 35;
const COARSE = matchMedia('(pointer: coarse)').matches;
sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
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

// ---------- maze walls ----------
const wallSolids = [];
const camRay = new THREE.Raycaster();
const wallMeshes = ARENA.walls.map((w, i) => {
  const b = wallBox(w);
  const sx = b.x1 - b.x0, sz = b.z1 - b.z0;
  const g = new THREE.Group();
  g.position.set(w.x, 0, w.z);
  const body = new THREE.Group();          // scaled on y as the wall rises
  const geo = new THREE.BoxGeometry(sx, 1, sz);
  geo.translate(0, 0.5, 0);
  const solid = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x141a2e, emissive: 0x0a1030, roughness: 0.6, metalness: 0.3 }));
  solid.castShadow = true; solid.receiveShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x00e5ff }));
  // horizontal neon stripes so the wall reads well from a distance
  const stripes = new THREE.Group();
  for (let k = 1; k < 5; k++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.02, 0.04, sz + 0.02), new THREE.MeshBasicMaterial({ color: 0xff3df2 }));
    st.position.y = k / 5;
    stripes.add(st);
  }
  body.add(solid, edges, stripes);
  wallSolids.push(solid);
  body.scale.y = 0.001;
  body.visible = false;
  // glowing slot in the floor so you can see where walls will come up
  const slot = new THREE.Mesh(new THREE.PlaneGeometry(sx + 0.3, sz + 0.3),
    new THREE.MeshBasicMaterial({ color: 0xff3df2, transparent: true, opacity: 0.25, depthWrite: false }));
  slot.rotation.x = -Math.PI / 2;
  slot.position.y = 0.02;
  g.add(body, slot);
  scene.add(g);
  return { body, slot, stripes, height: 0, up: false, age: 99999, recvAt: performance.now() };
});
function wallHeightNow(i) {
  const wm = wallMeshes[i];
  return wallHeightAt(wm.up, wm.age + (performance.now() - wm.recvAt));
}
function updateWalls(t) {
  wallMeshes.forEach((wm, i) => {
    const h = wallHeightNow(i);
    wm.height = h;
    wm.body.visible = h > 0.02;
    wm.body.scale.y = Math.max(0.001, h);
    const moving = wm.age + (performance.now() - wm.recvAt) < ARENA.wallRiseMs;
    const mazeOn = (snap.wallsLeft || 0) > 0;
    wm.slot.material.opacity = moving ? 0.5 + Math.sin(t * 20) * 0.3 : (h > 0.1 ? 0.08 : (mazeOn ? 0.22 : 0));
    wm.slot.material.color.setHex(moving && wm.up ? 0xff3030 : 0xff3df2);
  });
}

// ---------- corner jump pads ----------
const jumpPadMeshes = ARENA.jumpPads.map((jp) => {
  const g = new THREE.Group();
  g.position.set(jp.x, 0, jp.z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(jp.r + 0.3, jp.r + 0.5, 0.25, 6),
    new THREE.MeshStandardMaterial({ color: 0x222833, metalness: 0.7, roughness: 0.3 }));
  base.position.y = 0.125;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(jp.r, jp.r, 0.08, 6),
    new THREE.MeshStandardMaterial({ color: 0x7dff3d, emissive: 0x7dff3d, emissiveIntensity: 1 }));
  top.position.y = 0.28;
  g.add(base, top);
  // stacked chevrons pointing up
  const chevrons = [];
  for (let k = 0; k < 4; k++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7dff3d, transparent: true, opacity: 0.5, wireframe: true }));
    c.position.y = 0.6 + k * 0.9;
    g.add(c);
    chevrons.push(c);
  }
  const light = new THREE.PointLight(0x7dff3d, 6, 10);
  light.position.y = 1.5;
  g.add(light);
  scene.add(g);
  return { g, top, chevrons, light, flash: 0 };
});
function updateJumpPads(dt, t) {
  if (snap.jumpPads) snap.jumpPads.forEach(([x, z], i) => {
    const jp = jumpPadMeshes[i];
    if (!jp) return;
    if (!jp.placed) { jp.g.position.set(x, 0, z); jp.placed = true; }
    jp.g.position.x += (x - jp.g.position.x) * Math.min(1, dt * 8);
    jp.g.position.z += (z - jp.g.position.z) * Math.min(1, dt * 8);
  });
  for (const jp of jumpPadMeshes) {
    jp.chevrons.forEach((c, k) => {
      c.position.y = 0.6 + ((k * 0.9 + t * 2.5) % 3.6);
      c.material.opacity = 0.6 * (1 - (c.position.y - 0.6) / 3.6);
      c.rotation.y = t;
    });
    jp.flash = Math.max(0, jp.flash - dt * 2);
    jp.top.material.emissiveIntensity = 1 + jp.flash * 4;
    jp.light.intensity = 6 + jp.flash * 30;
  }
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

// ---------- touch controls (iPad / phones) ----------
const touch = { active: false, move: { x: 0, y: 0 }, stickId: null, lookId: null, lastX: 0, lastY: 0, attackHeld: false, jump: false };
function enableTouch() {
  if (touch.active) return;
  touch.active = true;
  document.body.classList.add('touch');
}
if (COARSE) enableTouch();
const canControl = () => locked || (touch.active && started);

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
  if (s.walls) {
    const nowT = performance.now();
    s.walls.forEach(([up, age], i) => {
      const wm = wallMeshes[i];
      if (!wm) return;
      wm.up = !!up; wm.age = age; wm.recvAt = nowT;
    });
  }
  const seen = new Set();
  for (const p of s.players) {
    seen.add(p.id);
    const a = getAvatar(p);
    a.data = p;
    a.body.setMuscle(p.muscle || 0);
    if (p.id !== me.id) { a.target.set(...p.p); a.yaw = p.yaw; }
    else { me.hp = p.hp; me.weapon = p.w; me.uses = p.uses; me.streak = p.streak || 0; me.muscle = p.muscle || 0; }
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
      const upright = ['heal', 'berserk', 'walls', 'bombs'].includes(WEAPONS[w.type].kind);
      mesh.rotation.z = upright ? 0 : Math.PI / 2;   // cakes and helmets sit upright, the rest lie flat
      if (WEAPONS[w.type].kind === 'berserk') mesh.position.y = 0.05;
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
      let special = null;
      if (WEAPONS[w.type].special) {
        // specials glow from across the room: bright tall beacon, light, orbiting sparkles, name tag
        beacon.geometry.dispose();
        beacon.geometry = new THREE.CylinderGeometry(0.25, 0.6, H, 12, 1, true);
        beacon.position.y = H / 2;
        const light = new THREE.PointLight(WEAPONS[w.type].color, 0, 14);
        light.position.y = 1.2;
        group.add(light);
        const sparkles = new THREE.Group();
        for (let i = 0; i < 10; i++) {
          const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffffff : 0xffd000 }));
          sp.userData.a = i / 10 * Math.PI * 2;
          sp.userData.h = 0.3 + (i % 3) * 0.4;
          sparkles.add(sp);
        }
        sparkles.position.set(w.x, 0, w.z);
        sparkles.visible = false;
        scene.add(sparkles);
        const tag = document.createElement('div');
        tag.className = 'label3d special';
        tag.textContent = `★ ${WEAPONS[w.type].name} ★`;
        tag.style.display = 'none';
        ui.labels.appendChild(tag);
        special = { light, sparkles, tag };
        tone(880, 0.12, 'triangle', 0.08); setTimeout(() => tone(1320, 0.2, 'triangle', 0.08), 120);
      }
      floorWeapons.set(w.id, { special, group, holder, mesh, ring, beacon, spawnLocal: performance.now() - w.age, type: w.type, x: w.x, z: w.z, landed: w.age >= FALL_MS });
      ring.position.x = w.x; ring.position.z = w.z;
    }
  }
  for (const [id, fw] of floorWeapons) {
    if (!wSeen.has(id)) {
      scene.remove(fw.group); scene.remove(fw.ring); scene.remove(fw.beacon);
      if (fw.special) { scene.remove(fw.special.sparkles); fw.special.tag.remove(); }
      floorWeapons.delete(id);
    }
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
  if (type === 'poop_bazooka') { for (let i = 0; i < 10; i++) setTimeout(() => tone(120 + Math.random() * 60, 0.06, 'square', 0.07, -60), i * 90); return; }
  if (type === 'dragon_sword') { tone(90, 0.5, 'sawtooth', 0.12, -40); noise(0.3, 0.12); return; }
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
      case 'over': {
        const lvl = m.muscle || 0;
        const streakLine = m.streak >= 2 ? `\n${m.streak} wins in a row!` : '';
        const muscleLine = lvl >= 5 ? ' MAX MUSCLE — GLOWING!' : lvl > 0 ? ` Muscle level ${lvl}` : '';
        banner(`${m.name} WINS!\n${m.reason}${streakLine}\n💪${muscleLine}`, 5500);
        if (lvl > 0) feed(`${m.name} bulked up to muscle level ${lvl}${lvl >= 5 ? ' (MAX — glowing!)' : ''}`, '#ffd23c');
        feed(m.reason, '#ffd23c');
        tone(m.winner === me.id ? 660 : 200, 0.6, 'triangle', 0.15, m.winner === me.id ? 400 : -100);
        if (m.winner === me.id && lvl > 0) setTimeout(() => { for (let i = 0; i < lvl; i++) setTimeout(() => tone(330 + i * 110, 0.12, 'square', 0.08), i * 110); }, 600);
        break;
      }
      case 'picked':
        tone(520, 0.08, 'square', 0.08, 300);
        feed(m.instant ? `You activated the ${WEAPONS[m.weapon].name}!` : `You picked up the ${WEAPONS[m.weapon].name}`, '#00e5ff');
        break;
      case 'broke':
        if (m.id === me.id) feed(`Your ${WEAPONS[m.weapon].name} broke!`, '#ff8c2a');
        tone(150, 0.15, 'sawtooth', 0.06, -80);
        break;
      case 'fx':
        if (m.kind === 'homing') onHomingFx(m);
        else if (m.kind === 'berserk') onBerserkFx(m);
        else if (m.kind === 'punch') onPunchFx(m);
        else onAttackFx(m);
        break;
      case 'heal': onHeal(m); break;
      case 'bombs': onBombs(m); break;
      case 'teleport':
        // berserk launch: fly to the enemy, controls locked during the flurry
        me.dash = { from: me.pos.clone(), to: new THREE.Vector3(...m.p), start: performance.now(), ms: m.launchMs };
        me.yaw = m.yaw;
        me.lockUntil = performance.now() + m.lockMs;
        break;
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
  if (def.kind === 'poopgun') {
    poopStream(origin, dir, Math.min(len, def.range));
  } else if (def.kind === 'ranged') {
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

// ---------- special weapon effects ----------
let poopTex = null;
function getPoopTex() {
  if (poopTex) return poopTex;
  // hand-drawn poop emoji so it looks the same on every device
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const blob = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.stroke(); };
  g.lineWidth = 4; g.strokeStyle = '#3d2210';
  const grad = g.createLinearGradient(0, 20, 0, 120);
  grad.addColorStop(0, '#b0743a'); grad.addColorStop(1, '#6b3d18');
  g.fillStyle = grad;
  blob(64, 98, 50, 20);
  blob(64, 72, 38, 17);
  blob(64, 50, 25, 14);
  g.beginPath(); g.moveTo(52, 42); g.quadraticCurveTo(66, 10, 74, 18); g.quadraticCurveTo(70, 34, 76, 44); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(50, 74, 9, 11, 0, 0, Math.PI * 2); g.ellipse(78, 74, 9, 11, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111';
  g.beginPath(); g.arc(52, 76, 5, 0, Math.PI * 2); g.arc(80, 76, 5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a1608'; g.lineWidth = 4;
  g.beginPath(); g.arc(64, 92, 14, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  poopTex = new THREE.CanvasTexture(c);
  poopTex.colorSpace = THREE.SRGBColorSpace;
  return poopTex;
}
function poopStream(origin, dir, len) {
  const tex = getPoopTex();
  const speed = 30;
  for (let i = 0; i < 40; i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    spr.scale.setScalar(0.55 + Math.random() * 0.25);
    spr.position.copy(origin);
    const d = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.12)).normalize();
    const life = Math.max(0.15, len / speed);
    scene.add(spr);
    fx.push({ obj: spr, vel: d.multiplyScalar(speed), life, max: life * 3, fade: true, delay: i * 0.025 });
  }
}

const homing = [];
function onHomingFx(m) {
  const a = avatars.get(m.from);
  if (a) a.body.swing('ranged');
  const spear = buildWeaponMesh('fire_spear');
  spear.scale.setScalar(1.6);
  const holder = new THREE.Group();
  holder.add(spear);
  scene.add(holder);
  const origin = new THREE.Vector3(...m.origin);
  const side = new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16);
  homing.push({ holder, spear, origin, side, to: m.to, start: performance.now(), ms: m.travelMs, last: origin.clone() });
  tone(200, 0.6, 'sawtooth', 0.1, 600);
  feed(`${a?.data.name ?? '?'} threw the fake0h Fire Spear!`, '#ff8c2a');
  if (m.to === me.id) banner('🔥 A FIRE SPEAR IS HUNTING YOU! 🔥', 1800);
}
function updateHoming() {
  const now = performance.now();
  for (let i = homing.length - 1; i >= 0; i--) {
    const h = homing[i];
    const t = Math.min(1, (now - h.start) / h.ms);
    const target = avatars.get(h.to);
    const end = target ? target.body.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)) : h.last.clone();
    // curved path that bends toward the target wherever it runs
    const ctrl = h.origin.clone().lerp(end, 0.5).add(h.side).add(new THREE.Vector3(0, 7, 0));
    const p = new THREE.Vector3()
      .addScaledVector(h.origin, (1 - t) * (1 - t))
      .addScaledVector(ctrl, 2 * (1 - t) * t)
      .addScaledVector(end, t * t);
    const dirv = p.clone().sub(h.last);
    if (dirv.lengthSq() > 1e-6) h.holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirv.normalize());
    h.holder.position.copy(p);
    addBurst(p, Math.random() < 0.5 ? 0xff5a00 : 0xffd000, 2, 1.5, 0.12, 0.35);
    h.last.copy(p);
    if (t >= 1) {
      addExplosion(end);
      scene.remove(h.holder);
      homing.splice(i, 1);
    }
  }
}

function onBerserkFx(m) {
  const start = new THREE.Vector3(...m.start).add(new THREE.Vector3(0, 1, 0));
  const end = new THREE.Vector3(...m.end).add(new THREE.Vector3(0, 1, 0));
  // red streak along the launch path
  for (let i = 0; i < 5; i++) {
    const off = new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4);
    const geo = new THREE.BufferGeometry().setFromPoints([start.clone().add(off), end.clone().add(off)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: i % 2 ? 0xff2020 : 0xffa000, transparent: true }));
    scene.add(line);
    fx.push({ obj: line, life: 0.6, max: 0.6, fade: true });
  }
  setTimeout(() => addBurst(end, 0xff2020, 20, 6, 0.1, 0.5), m.launchMs);
  tone(70, 0.5, 'sawtooth', 0.15, 200);
  const a = avatars.get(m.from);
  feed(`${a?.data.name ?? '?'} went BERZERK!`, '#ff4040');
}
function onPunchFx(m) {
  const a = avatars.get(m.from);
  const target = avatars.get(m.to);
  if (a) a.body.punch(m.n);
  if (target) addBurst(target.body.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)), 0xffffff, 5, 3, 0.06, 0.25);
  tone(140 + (m.n % 3) * 30, 0.06, 'square', 0.1, -80);
}
function onHeal(m) {
  const a = avatars.get(m.id);
  if (a) {
    const pos = a.body.root.position.clone();
    for (let i = 0; i < 4; i++) setTimeout(() => addBurst(pos.clone().add(new THREE.Vector3(0, 0.5 + i * 0.4, 0)), i % 2 ? 0x4cff6a : 0xff9ad5, 12, 3, 0.08, 0.8), i * 120);
    const el = document.createElement('div');
    el.className = 'dmg';
    el.style.color = '#4cff6a';
    el.textContent = '+FULL HEALTH 🎂';
    const v = pos.clone().add(new THREE.Vector3(0, 2.1, 0)).project(camera);
    el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
    document.getElementById('hud').appendChild(el);
    requestAnimationFrame(() => { el.style.transform = 'translate(-50%, -180%)'; el.style.opacity = 0; });
    setTimeout(() => el.remove(), 1000);
  }
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.1), i * 100));
  feed(`${a?.data.name ?? '?'} ate the Birthday Cake and restored all health!`, '#4cff6a');
}

// 100 bombs: fall from the ceiling, blink for 3 seconds, explode
const bombs = [];
let bombProto = null;
function onBombs(m) {
  if (!bombProto) bombProto = buildWeaponMesh('bomb');
  const t0 = performance.now();
  const mine = m.owner === me.id;
  banner(mine ? '💣 BOMBS AWAY! You are immune — chase them into the blasts!' : '💣 100 BOMBS INCOMING — FIND A CLEAR SPOT!', 3000);
  tone(1200, 0.3, 'square', 0.1, -900);
  for (const [x, z, delay] of m.list) {
    const mesh = bombProto.clone(true);
    // each bomb needs its own body material so it can blink independently
    const bodyMesh = mesh.children[0];
    bodyMesh.material = bodyMesh.material.clone();
    mesh.scale.setScalar(1.6);
    mesh.position.set(x, ARENA.dropHeight, z);
    mesh.visible = false;
    scene.add(mesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(m.radius - 0.15, m.radius, 32),
      new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.04, z);
    scene.add(ring);
    bombs.push({ mesh, bodyMat: bodyMesh.material, ring, x, z, start: t0 + delay, fallMs: m.fallMs, fuseMs: m.fuseMs, landed: false });
  }
}
let boomSounds = 0;
function updateBombs(t) {
  const now = performance.now();
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    const age = now - b.start;
    if (age < 0) continue;
    b.mesh.visible = true;
    if (age < b.fallMs) {
      const s = age / 1000;
      b.mesh.position.y = Math.max(0, ARENA.dropHeight - 0.5 * ARENA.gravity * s * s);
      b.mesh.rotation.x = s * 5;
      continue;
    }
    if (!b.landed) {
      b.landed = true;
      b.mesh.position.y = 0; b.mesh.rotation.set(0, Math.random() * 6, 0);
      addBurst(new THREE.Vector3(b.x, 0.2, b.z), 0x888888, 4, 2, 0.06, 0.3);
    }
    const fuse = (age - b.fallMs) / b.fuseMs;     // 0 -> 1 over 3 seconds
    if (fuse < 1) {
      // blink faster and faster as the fuse runs out
      const rate = 3 + fuse * 14;
      const on = Math.sin((age / 1000) * rate * Math.PI * 2) > 0;
      b.bodyMat.emissive.setHex(on ? 0xff0000 : 0x000000);
      b.bodyMat.emissiveIntensity = on ? 2 : 0;
      b.ring.material.opacity = on ? 0.7 : 0.2;
      continue;
    }
    // BOOM (lighter effect than a rocket so 100 of them don't slow things down)
    const pos = new THREE.Vector3(b.x, 0.6, b.z);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.85 }));
    ball.position.copy(pos);
    ball.scale.setScalar(0.6);
    scene.add(ball);
    fx.push({ obj: ball, life: 0.4, max: 0.4, fade: true, grow: 5 });
    addBurst(pos, Math.random() < 0.5 ? 0xff5000 : 0xffd000, 6, 7, 0.14, 0.6);
    if (boomSounds < 6) { boomSounds++; noise(0.4, 0.18); setTimeout(() => boomSounds--, 150); }
    if (Math.hypot(me.pos.x - b.x, me.pos.z - b.z) < 6) shake = Math.max(shake, 0.25);
    scene.remove(b.mesh); scene.remove(b.ring);
    b.ring.geometry.dispose(); b.ring.material.dispose(); b.bodyMat.dispose();
    bombs.splice(i, 1);
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
      m.weapon === 'water_pistol' ? 0x4fc3ff : m.weapon === 'pool_noodle' ? 0xff4fd8 : m.weapon === 'poop_bazooka' ? 0x7a4a1a : 0xff2020, 8 + Math.min(20, m.dmg / 2), 4);
  }
  if (m.target === me.id) {
    ui.vignette.style.boxShadow = `inset 0 0 ${120 + m.dmg * 3}px rgba(255,0,0,${Math.min(0.85, 0.25 + m.dmg / 60)})`;
    setTimeout(() => { ui.vignette.style.boxShadow = 'inset 0 0 160px rgba(255,0,0,0)'; }, 180);
    shake = Math.min(0.6, m.dmg / 60);
    tone(110, 0.2, 'sawtooth', 0.12, -60);
  }
  if (m.from === me.id) { hitMarkerT = 0.25; tone(1200, 0.05, 'square', 0.06); }
  if (m.weapon === 'berserk_helmet' || m.weapon === 'poop_bazooka' || m.weapon === 'bomb') return; // multi-hit attacks: skip feed spam
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
  if (!touch.active) renderer.domElement.requestPointerLock?.();
}
// Right mouse: click = pick up + jump, hold = run forward
let rightHeld = false;
let jumpReq = false;
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button !== 2 || touch.active || !started) return;
  e.preventDefault();
  rightHeld = true;
  pickup();
  jumpReq = true;
});
addEventListener('mouseup', (e) => { if (e.button === 2) rightHeld = false; });
addEventListener('blur', () => { rightHeld = false; });
renderer.domElement.addEventListener('click', () => {
  if (touch.active) return;
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

const stickEl = $('stick'), knobEl = $('knob');
const STICK_R = 75;
const buttons = { btnAttack: $('btnAttack'), btnGrab: $('btnGrab'), btnJump: $('btnJump'), btnDrop: $('btnDrop') };
const btnTouch = new Map(); // touch id -> button id

function setStick(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (len > STICK_R) { dx *= STICK_R / len; dy *= STICK_R / len; }
  touch.move.x = dx / STICK_R;
  touch.move.y = dy / STICK_R;
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
}

document.addEventListener('touchstart', (e) => {
  enableTouch();
  if (!started) return; // let the start screen's tap work normally
  for (const t of e.changedTouches) {
    const el = t.target.closest ? t.target.closest('.tbtn, #stick') : null;
    if (el && el.id === 'stick') {
      touch.stickId = t.identifier;
      const r = stickEl.getBoundingClientRect();
      touch.stickCx = r.left + r.width / 2;
      touch.stickCy = r.top + r.height / 2;
      setStick(t.clientX - touch.stickCx, t.clientY - touch.stickCy);
    } else if (el) {
      btnTouch.set(t.identifier, el.id);
      el.classList.add('down');
      if (actx && actx.state === 'suspended') actx.resume();
      if (el.id === 'btnAttack') { touch.attackHeld = true; attack(); }
      if (el.id === 'btnGrab') pickup();
      if (el.id === 'btnJump') touch.jump = true;
      if (el.id === 'btnDrop') send({ t: 'drop' });
    } else if (touch.lookId === null) {
      touch.lookId = t.identifier;
      touch.lastX = t.clientX; touch.lastY = t.clientY;
    }
  }
  e.preventDefault();
}, { passive: false });

document.addEventListener('touchmove', (e) => {
  if (!started) return;
  for (const t of e.changedTouches) {
    if (t.identifier === touch.stickId) setStick(t.clientX - touch.stickCx, t.clientY - touch.stickCy);
    else if (t.identifier === touch.lookId) {
      me.yaw -= (t.clientX - touch.lastX) * 0.006;
      me.pitch = THREE.MathUtils.clamp(me.pitch - (t.clientY - touch.lastY) * 0.005, -1.1, 0.9);
      touch.lastX = t.clientX; touch.lastY = t.clientY;
    }
  }
  e.preventDefault();
}, { passive: false });

function endTouches(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.stickId) { touch.stickId = null; setStick(0, 0); }
    if (t.identifier === touch.lookId) touch.lookId = null;
    const id = btnTouch.get(t.identifier);
    if (id) {
      btnTouch.delete(t.identifier);
      buttons[id].classList.remove('down');
      if (id === 'btnAttack') touch.attackHeld = false;
    }
  }
}
document.addEventListener('touchend', endTouches);
document.addEventListener('touchcancel', endTouches);
// stop iOS pinch-zoom / double-tap zoom from hijacking the game
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

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

// Push the player out of any raised wall they're running into (unless they're above it).
const PLAYER_R = 0.4;
function collideWalls() {
  ARENA.walls.forEach((w, i) => {
    const h = wallMeshes[i].height;
    if (h < 0.15 || me.pos.y >= h - 0.3) return;
    const b = wallBox(w, PLAYER_R);
    const p = me.pos;
    if (p.x <= b.x0 || p.x >= b.x1 || p.z <= b.z0 || p.z >= b.z1) return;
    // push out along the shallowest side
    const pushes = [[b.x0 - p.x, 0], [b.x1 - p.x, 0], [0, b.z0 - p.z], [0, b.z1 - p.z]];
    pushes.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
    p.x += pushes[0][0]; p.z += pushes[0][1];
  });
}
// Floor height under the player: 0, or the top of a wall they're standing on.
function groundHeight(x, z, y) {
  let g = 0;
  ARENA.walls.forEach((w, i) => {
    const h = wallMeshes[i].height;
    if (h < 0.15 || y < h - 0.35) return;
    const b = wallBox(w, 0.15);
    if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) g = Math.max(g, h);
  });
  return g;
}

function updateLocal(dt) {
  const downed = me.hp <= 0 && (snap.phase === 'fight' || snap.phase === 'over') && snap.fighters.includes(me.id);
  const fwd = new THREE.Vector3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
  const right = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
  const move = new THREE.Vector3();
  const lockedOut = me.lockUntil && performance.now() < me.lockUntil;
  if (me.dash) {
    const k = Math.min(1, (performance.now() - me.dash.start) / me.dash.ms);
    me.pos.lerpVectors(me.dash.from, me.dash.to, k);
    me.pos.y = Math.sin(k * Math.PI) * 2.5; // flying leap
    if (k >= 1) { me.dash = null; me.pos.y = 0; }
  }
  let sprint = keys.ShiftLeft || keys.ShiftRight;
  if (touch.active && started && !downed && !lockedOut && (touch.move.x || touch.move.y)) {
    // analog stick: up on the stick = forward; push all the way to run
    move.addScaledVector(fwd, -touch.move.y).addScaledVector(right, touch.move.x);
    if (Math.hypot(touch.move.x, touch.move.y) > 0.92) sprint = true;
  }
  if (locked && !downed && !lockedOut) {
    if (rightHeld) { move.add(fwd); sprint = true; }
    if ((keys.KeyW || keys.ArrowUp) && !rightHeld) move.add(fwd);
    if (keys.KeyS || keys.ArrowDown) move.sub(fwd);
    if (keys.KeyD || keys.ArrowRight) move.add(right);
    if (keys.KeyA || keys.ArrowLeft) move.sub(right);
  }
  me.moving = move.lengthSq() > 0.0025;
  if (me.moving) {
    // after a jump pad launch you only get a little steering until you land
    const speed = (sprint ? 11 : 6.5) * (me.padAir ? ARENA.airControl : 1);
    if (move.lengthSq() > 1) move.normalize();
    move.multiplyScalar(speed * dt);
    me.pos.add(move);
  }
  if (me.padAir && me.padDrift) me.pos.addScaledVector(me.padDrift, dt);
  collideWalls();
  if (((locked && (keys.Space || jumpReq)) || touch.jump) && me.onGround && !downed && !lockedOut) { me.velY = ARENA.jumpSpeed; me.onGround = false; tone(300, 0.1, 'triangle', 0.05, 200); }
  touch.jump = false;
  jumpReq = false;
  if (touch.attackHeld) attack(); // hold ATTACK to keep swinging/firing
  if (!me.dash) {
    me.velY -= ARENA.gravity * dt;
    me.pos.y += me.velY * dt;
  }
  const ground = groundHeight(me.pos.x, me.pos.z, me.pos.y);
  if (me.pos.y <= ground) {
    if (me.padAir && me.velY < -20) { shake = 0.35; tone(80, 0.25, 'sine', 0.15, -30); }
    me.pos.y = ground; me.velY = 0; me.onGround = true; me.padAir = false;
  } else if (me.pos.y > ground + 0.05) me.onGround = false;
  if (me.pos.y > H - 2) { me.pos.y = H - 2; me.velY = Math.min(0, me.velY); }
  // corner jump pads
  if (me.onGround && !downed && !me.dash) {
    jumpPadMeshes.forEach((jp, i) => {
      const pad = { x: jp.g.position.x, z: jp.g.position.z, r: ARENA.jumpPads[i].r };  // pads roam around
      if (Math.hypot(me.pos.x - pad.x, me.pos.z - pad.z) < pad.r && me.pos.y < 0.5) {
        me.velY = ARENA.jumpPadSpeed;
        me.onGround = false;
        me.padAir = true;
        // gentle drift toward the middle of the room so you fly out over the arena
        me.padDrift = new THREE.Vector3(-pad.x, 0, -pad.z).normalize().multiplyScalar(4.5);
        jp.flash = 1;
        addBurst(new THREE.Vector3(pad.x, 0.5, pad.z), 0x7dff3d, 30, 10, 0.12, 0.8);
        tone(200, 0.6, 'sine', 0.15, 900);
      }
    });
  }
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
    fw.holder.rotation.x = landed || fw.special && ['heal', 'berserk', 'walls', 'bombs'].includes(WEAPONS[fw.type].kind) ? 0 : age * 6;
    fw.group.rotation.y += dt * (landed ? 0.8 : 3);
    fw.group.position.y += landed ? Math.sin(t * 3 + id) * 0.08 + 0.1 : 0;
    fw.ring.material.opacity = landed ? (near && near.id === id ? 0.9 : 0.35) : 0;
    fw.beacon.material.opacity = landed ? 0.18 + Math.sin(t * 4 + id) * 0.06 : 0;
    if (fw.special) {
      const sp = fw.special;
      fw.beacon.material.opacity = 0.3 + Math.sin(t * 5) * 0.12;   // visible while falling too
      sp.light.intensity = 8 + Math.sin(t * 6) * 4;
      fw.holder.scale.setScalar(2.2 + Math.sin(t * 3) * 0.1);
      sp.sparkles.visible = landed;
      sp.sparkles.children.forEach((c, i) => {
        const a = c.userData.a + t * 1.5;
        c.position.set(Math.cos(a) * 0.9, c.userData.h + Math.sin(t * 3 + i) * 0.15, Math.sin(a) * 0.9);
        c.rotation.y = t * 4;
      });
      const v = fw.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)).project(camera);
      const show = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      sp.tag.style.display = show ? 'block' : 'none';
      if (show) {
        sp.tag.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
        sp.tag.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
      }
    }
    animateWeaponMesh(fw.mesh, t);
  }
  for (const a of avatars.values()) if (a.body.held) animateWeaponMesh(a.body.held, t);

  // pickup prompt
  if (near && isFighter() && (!me.weapon || WEAPONS[near.type].instant) && snap.phase === 'fight' && me.hp > 0) {
    const d = WEAPONS[near.type];
    ui.prompt.innerHTML = `${touch.active ? 'Tap <b>GRAB</b>' : 'Press <b>E</b>'} to pick up <b style="color:${hex(d.color)}">${d.special ? '★ ' : ''}${d.name}</b> · ${d.special ? d.desc : d.damage + ' dmg'}`;
    ui.prompt.style.display = 'block';
    buttons.btnGrab.classList.add('ready');
  } else { ui.prompt.style.display = 'none'; buttons.btnGrab.classList.remove('ready'); }
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
  // don't let a wall get between the camera and your player
  const toCam = pos.clone().sub(target);
  const camDist = toCam.length();
  camRay.set(target, toCam.normalize());
  camRay.far = camDist;
  const visibleWalls = wallSolids.filter(m => m.parent.visible);
  const hit = visibleWalls.length ? camRay.intersectObjects(visibleWalls, false)[0] : null;
  if (hit) pos.copy(target).addScaledVector(toCam, Math.max(0.6, hit.distance - 0.3));
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
  const lvl = me.muscle || 0;
  ui.myName.innerHTML = `${me.name}<span style="float:right;font-weight:600;font-size:13px;color:${lvl >= 5 ? '#ffd23c' : '#9fd8ff'}">`
    + `${lvl > 0 ? `💪 Lv ${lvl}${lvl >= 5 ? ' MAX' : ''} · ${me.streak} win streak` : 'No win streak yet'}</span>`;
  ui.hpBar.style.width = `${me.hp}%`;
  ui.hpBar.style.background = hpColor(me.hp);
  if (me.weapon) {
    const d = WEAPONS[me.weapon];
    ui.wName.textContent = (d.special ? '★ ' : '') + d.name;
    ui.wName.style.color = hex(d.color);
    const cd = Math.max(0, d.cooldown - (performance.now() - me.lastAttack));
    ui.wInfo.textContent = d.special ? `${d.desc}${cd > 0 ? ' · recharging' : ''}`
      : `${d.damage} damage · ${d.kind} · range ${d.range}m${cd > 0 ? ' · reloading' : ''}`;
  } else {
    ui.wName.textContent = 'Bare hands';
    ui.wName.style.color = '#e8f6ff';
    ui.wInfo.textContent = snap.phase === 'fight' && isFighter() ? (touch.active ? 'Walk to a weapon and tap GRAB' : 'Grab a weapon from the floor (E)') : 'Weapons drop when the fight starts';
  }
  ui.pips.innerHTML = Array.from({ length: me.weapon ? usesOf(me.weapon) : USES_PER_WEAPON }, (_, i) => `<div class="pip ${i < me.uses ? 'on' : ''}"></div>`).join('');

  // status line
  const occupied = snap.pads.filter(Boolean).length;
  let status = '';
  if (snap.phase === 'lobby') {
    const others = snap.players.length - 1;
    status = others < 1 ? 'Waiting for a second player to join… (share this link!)'
      : `Stand on a pressure pad · ${occupied}/2 pads pressed`;
  } else if (snap.phase === 'countdown') status = 'Get ready!';
  else if (snap.phase === 'fight') status = isFighter() ? 'Fight! Pick up weapons and attack' : 'Spectating the match';
  if (snap.wallsLeft > 0) status += ` · 🧱 Maze: ${Math.ceil(snap.wallsLeft / 1000)}s`;
  else if (snap.phase === 'over') status = 'Match over — back to the lobby soon';
  ui.status.textContent = status;

  // fighter health bars
  if (snap.phase === 'fight' || snap.phase === 'over' || snap.phase === 'countdown') {
    ui.fighters.style.display = 'flex';
    ui.fighters.innerHTML = snap.fighters.map(id => {
      const p = snap.players.find(x => x.id === id);
      if (!p) return '';
      const ml = p.muscle || 0;
      const flex = ml > 0 ? ` <span style="color:${ml >= 5 ? '#ffd23c' : '#9fd8ff'}">💪${ml}${ml >= 5 ? ' MAX' : ''}</span>` : '';
      return `<div class="fbar panel"><div class="label"><span style="color:${hex(p.color)};font-weight:700">${p.name}${id === me.id ? ' (you)' : ''}${flex}</span><span>${Math.ceil(p.hp)}</span></div>
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
    const ml = a.data.muscle || 0;
    nm.textContent = a.data.name + (ml > 0 ? ` 💪${ml}${ml >= 5 ? ' MAX' : ''}` : '') + (a.data.w ? ` · ${WEAPONS[a.data.w].name}` : '');
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
  updateWalls(clock.t);
  updateJumpPads(dt, clock.t);
  updateFx(dt);
  updateHoming();
  updateBombs(clock.t);
  updateCamera(dt);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

connect();
frame();

// expose a little for debugging / automated tests
window.__dp = { me, snap: () => snap, avatars, floorWeapons, send, scene, camera, THREE, test: { updateLocal, updateWalls, touch, wallMeshes } };
