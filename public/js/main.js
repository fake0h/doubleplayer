import * as THREE from 'three';
import { WEAPONS, ARENA, FALL_MS, USES_PER_WEAPON, MAX_HEALTH, usesOf, wallBox, wallHeightAt, weaponName, ADMIN_PANEL, LAVA, ROBOTS, WEAPON_IDS } from '/shared/weapons.js';
import { WireBody } from './body.js';
import { buildWeaponMesh, animateWeaponMesh, buildRobot } from './weaponMeshes.js';
import { Smiley } from './smiley.js';
import { FaceScorer } from './cheese.js';
import { MotionMeter, DiscoMusic, PoseTracker, BONES } from './dance.js';
import { DISCO } from '/shared/disco.js';
import { emotionById, CHEESE, CHEESE_SPOTS } from '/shared/emotions.js';

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
let roomEdges = null;
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
  roomEdges = edges;
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
  const hide = (snap.mode === 'cheese' || snap.mode === 'disco') && (snap.phase === 'cheese' || snap.phase === 'disco' || snap.phase === 'over');
  for (const jp of jumpPadMeshes) jp.g.visible = !hide;
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

// ---------- lava floor ----------
const LAVA_N = Math.round(ARENA.size / LAVA.tile);
const lavaTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#c21d00'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) {
    const r = 6 + Math.random() * 18;
    const gr = x.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, Math.random() < 0.5 ? '#ffe14f' : '#ff8a00'); gr.addColorStop(1, 'rgba(255,60,0,0)');
    x.save(); x.translate(Math.random() * 128, Math.random() * 128); x.fillStyle = gr; x.fillRect(-r, -r, r * 2, r * 2); x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex, transparent: true, opacity: 0.95 });
const lavaWarnMat = new THREE.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.3, depthWrite: false });
const lavaTiles = [];
for (let j = 0; j < LAVA_N; j++) for (let i = 0; i < LAVA_N; i++) {
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(LAVA.tile - 0.05, LAVA.tile - 0.05), lavaMat);
  tile.rotation.x = -Math.PI / 2;
  tile.position.set(-ARENA.size / 2 + (i + 0.5) * LAVA.tile, 0.025, -ARENA.size / 2 + (j + 0.5) * LAVA.tile);
  tile.visible = false;
  scene.add(tile);
  lavaTiles.push(tile);
}
const lavaLight = new THREE.HemisphereLight(0xff5a00, 0x000000, 0);
scene.add(lavaLight);
function lavaAt(x, z) {
  const L = snap.lava; if (!L) return false;
  const i = Math.floor((x + ARENA.size / 2) / LAVA.tile), j = Math.floor((z + ARENA.size / 2) / LAVA.tile);
  return i >= 0 && j >= 0 && i < LAVA_N && j < LAVA_N && L.mask[j * LAVA_N + i] === '1';
}
function updateLava(t) {
  const L = snap.lava;
  const warning = L && L.age < LAVA.warnMs;
  lavaTiles.forEach((tile, k) => {
    tile.visible = !!L && L.mask[k] === '1';
    tile.material = warning ? lavaWarnMat : lavaMat;
  });
  lavaWarnMat.opacity = 0.25 + Math.abs(Math.sin(t * 8)) * 0.45;
  lavaTex.offset.set(Math.sin(t * 0.3) * 0.2, t * 0.05);
  lavaLight.intensity = L && !warning ? 0.6 + Math.sin(t * 3) * 0.15 : 0;
  // bubbling
  if (L && !warning && Math.random() < 0.3) {
    const k = Math.floor(Math.random() * lavaTiles.length);
    if (lavaTiles[k].visible) addBurst(lavaTiles[k].position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 0.1, (Math.random() - 0.5) * 5)), 0xffa000, 3, 2.5, 0.1, 0.5);
  }
}

// ---------- robot swarm ----------
const robotMeshes = new Map(); // id -> { g, target }
function updateRobots(dt, t) {
  const seen = new Set();
  for (const [id, x, z, yaw, age] of snap.robots || []) {
    seen.add(id);
    let r = robotMeshes.get(id);
    if (!r) {
      const g = buildRobot(1.1);
      g.position.set(x, -1.3, z);
      scene.add(g);
      r = { g, x, z, yaw, age, recv: performance.now() };
      robotMeshes.set(id, r);
      addBurst(new THREE.Vector3(x, 0.2, z), 0x777777, 10, 3, 0.1, 0.5);
    }
    r.x = x; r.z = z; r.yaw = yaw; r.age = age; r.recv = performance.now();
  }
  for (const [id, r] of robotMeshes) {
    if (!seen.has(id)) { addBurst(r.g.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0x9fb4c8, 8, 3, 0.08, 0.4); scene.remove(r.g); robotMeshes.delete(id); continue; }
    const age = r.age + (performance.now() - r.recv);
    const rise = Math.min(1, age / ROBOTS.riseMs);           // climbing out of the floor
    r.g.position.x += (r.x - r.g.position.x) * Math.min(1, dt * 10);
    r.g.position.z += (r.z - r.g.position.z) * Math.min(1, dt * 10);
    r.g.position.y = -1.3 * (1 - rise);
    let dy = r.yaw - r.g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    r.g.rotation.y += dy * Math.min(1, dt * 10);
    const legs = r.g.userData.legs;
    legs[0].rotation.x = Math.sin(t * 14 + id) * 0.6; legs[1].rotation.x = -legs[0].rotation.x;
  }
}

// ---------- admin panel (north wall) ----------
const adminPanel = (() => {
  const g = new THREE.Group();
  g.position.set(ADMIN_PANEL.x, 0, -HALF + 0.05);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 384;
  const x = c.getContext('2d');
  x.fillStyle = '#0a0f1e'; x.fillRect(0, 0, 256, 384);
  x.strokeStyle = '#ffd23c'; x.lineWidth = 8; x.strokeRect(6, 6, 244, 372);
  x.fillStyle = '#ffd23c'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.fillText('ADMIN', 128, 56);
  x.fillStyle = '#05080f'; x.fillRect(30, 76, 196, 46);
  x.fillStyle = '#39ff14'; x.font = 'bold 30px monospace'; x.fillText('* * *', 128, 110);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
  keys.forEach((k, i) => {
    const cx = 52 + (i % 3) * 76, cy = 150 + Math.floor(i / 3) * 56;
    x.fillStyle = k === 'OK' ? '#1f7a2e' : k === 'C' ? '#7a1f1f' : '#1c2540';
    x.fillRect(cx - 30, cy, 60, 44);
    x.fillStyle = '#fff'; x.font = 'bold 24px sans-serif'; x.fillText(k, cx, cy + 31);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.y = 1.8;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.12), new THREE.MeshStandardMaterial({ color: 0x333a4a, metalness: 0.8, roughness: 0.3 }));
  frame.position.set(0, 1.8, -0.07);
  const light = new THREE.PointLight(0xffd23c, 4, 6);
  light.position.set(0, 2, 1);
  const floorMark = new THREE.Mesh(new THREE.RingGeometry(ADMIN_PANEL.reach - 0.15, ADMIN_PANEL.reach, 48, 1, 0, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  floorMark.rotation.x = -Math.PI / 2;
  floorMark.rotation.z = Math.PI;
  floorMark.position.y = 0.03;
  g.add(frame, face, light, floorMark);
  scene.add(g);
  return { light, floorMark };
})();

// ---------- weapon showcase: every weapon framed on the admin panel wall ----------
const showcase = [];
(() => {
  const ids = [...WEAPON_IDS].sort((a, b) => {
    const A = WEAPONS[a], B = WEAPONS[b];
    if (!!A.special !== !!B.special) return A.special ? 1 : -1;     // normal weapons first, then specials
    return A.special ? 0 : A.damage - B.damage;                      // weakest to strongest
  });
  const perRow = Math.ceil(ids.length / 2);
  const span = ARENA.size - 8;                 // keep clear of the corners
  const gap = 2.6;                             // keep clear of the admin panel in the middle
  const half = Math.ceil(perRow / 2);
  const step = (span / 2 - gap) / half;
  const W = Math.min(1.9, step - 0.2), Hh = 1.9;
  ids.forEach((id, n) => {
    const row = Math.floor(n / perRow), col = n % perRow;
    const side = col < half ? -1 : 1;
    const k = col < half ? half - 1 - col : col - half;   // fill outward from the admin panel
    const x = side * (gap + step * (k + 0.5));
    const y = row === 0 ? 2.0 : 4.4;
    const def = WEAPONS[id];
    const g = new THREE.Group();
    g.position.set(x, y, -HALF + 0.08);
    const frameCol = def.special ? 0xffd23c : 0x00e5ff;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.9, emissive: 0x000000 }));
    back.userData.weaponType = id;   // admin mode: click a frame to take this weapon
    g.add(back);
    const bar = (w, h, px, py) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), new THREE.MeshBasicMaterial({ color: frameCol })); m.position.set(px, py, 0.03); g.add(m); };
    bar(W + 0.08, 0.06, 0, Hh / 2); bar(W + 0.08, 0.06, 0, -Hh / 2); bar(0.06, Hh, -W / 2, 0); bar(0.06, Hh, W / 2, 0);
    // name plate
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const cx = c.getContext('2d');
    cx.fillStyle = def.special ? '#3a2a00' : '#06202a'; cx.fillRect(0, 0, 256, 64);
    cx.textAlign = 'center';
    cx.fillStyle = def.special ? '#ffd23c' : '#bff6ff'; cx.font = 'bold 26px sans-serif';
    cx.fillText((def.special ? '★ ' : '') + def.name, 128, 28, 244);
    cx.fillStyle = '#ffffff'; cx.font = '20px sans-serif';
    cx.fillText(def.special ? 'SPECIAL' : `${def.damage} damage · ${def.kind}`, 128, 54, 244);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, (W - 0.1) / 4), new THREE.MeshBasicMaterial({ map: tex }));
    plate.position.set(0, -Hh / 2 + (W - 0.1) / 8 + 0.06, 0.02);
    g.add(plate);
    // the weapon itself, scaled to fit and slowly turning
    const mesh = buildWeaponMesh(id);
    const holder = new THREE.Group();
    holder.add(mesh);
    const box3 = new THREE.Box3().setFromObject(mesh);
    const size = box3.getSize(new THREE.Vector3()), center = box3.getCenter(new THREE.Vector3());
    mesh.position.sub(center);
    holder.scale.setScalar(Math.min(1.1 / Math.max(size.x, size.y, size.z, 0.01), 3));
    holder.position.set(0, 0.2, 0.35);
    holder.rotation.z = ['heal', 'berserk', 'walls', 'bombs', 'lava', 'robots', 'cloak'].includes(def.kind) ? 0 : -0.75;
    g.add(holder);
    if (def.special) {
      const l = new THREE.PointLight(0xffd23c, 1.2, 3);
      l.position.set(0, 0.3, 0.8);
      g.add(l);
    }
    scene.add(g);
    showcase.push({ holder, mesh, back, id });
  });
})();
// big title above the showcase
{
  const c = document.createElement('canvas'); c.width = 1024; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#ffd23c'; x.font = 'bold 64px sans-serif'; x.textAlign = 'center';
  x.fillText('WEAPONS OF DOUBLE PLAYER', 512, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const title = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  title.position.set(0, 6.6, -HALF + 0.1);
  scene.add(title);
}

// ---------- Say Cheese back wall (south wall, opposite the admin panel) ----------
const smiley = new Smiley(12);
smiley.mesh.position.set(-6, 9.5, HALF - 0.1);
smiley.mesh.rotation.y = Math.PI;
smiley.mesh.visible = false;
scene.add(smiley.mesh);
function textPlane(w, h, pos) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.position.copy(pos); m.rotation.y = Math.PI; m.visible = false;
  scene.add(m);
  return { mesh: m, canvas: c, tex, draw(fn) { const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); fn(x, c.width, c.height); tex.needsUpdate = true; } };
}
const cheeseTitle = textPlane(26, 2.6, new THREE.Vector3(0, 17.2, HALF - 0.1));
const photoFrame = new THREE.Group();
photoFrame.position.set(7, 9.5, HALF - 0.1);
photoFrame.rotation.y = Math.PI;
photoFrame.visible = false;
const photoMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
const photo = new THREE.Mesh(new THREE.PlaneGeometry(11, 8.25), photoMat);
const photoBorder = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 9.05), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
photoBorder.position.z = -0.02;
photoFrame.add(photoBorder, photo);
scene.add(photoFrame);
const photoCaption = textPlane(11.8, 1.6, new THREE.Vector3(7, 4.2, HALF - 0.1));

// ---------- Dance Dance Disco scenery (only shown during the game) ----------
const disco = (() => {
  const g = new THREE.Group();
  g.visible = false;
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 2),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15, flatShading: true, emissive: 0x222233 }));
  ball.position.set(0, 8.5, 0);   // low enough to be in the dancers' camera view
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, H - 9.9, 4), new THREE.MeshBasicMaterial({ color: 0x888888 }));
  string.position.set(0, 8.5 + (H - 8.5) / 2, 0);
  g.add(ball, string);
  const cols = [0xff3df2, 0x00e5ff, 0xffd400, 0x7dff3d];
  const spots = cols.map((c, i) => {
    const sl = new THREE.SpotLight(c, 0, 40, 0.35, 0.5);
    sl.position.set(0, 8.3, 0);
    sl.target.position.set(Math.cos(i * Math.PI / 2) * 8, 0, Math.sin(i * Math.PI / 2) * 8);
    g.add(sl, sl.target);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.5, 9, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(beam);
    return { sl, beam, c };
  });
  // glowing dance floor under the line of dancers
  const floorTiles = [];
  for (let i = -4; i <= 4; i++) for (let j = -2; j <= 2; j++) {
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ color: cols[(i + j + 8) % 4], transparent: true, opacity: 0.15, depthWrite: false }));
    tile.rotation.x = -Math.PI / 2; tile.position.set(i * 2, 0.02, j * 2);
    g.add(tile); floorTiles.push(tile);
  }
  scene.add(g);
  return { g, ball, spots, floorTiles, cols };
})();

// ---------- pressure pads ----------
const PVP_GREEN = 0x39ff14, CHEESE_YELLOW = 0xffd400;
function makePad(p, color) {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
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
}
const pads = ARENA.pads.map((p) => makePad(p, PVP_GREEN));                  // 4xPVP corner (southwest)
const cheesePads = ARENA.cheesePads.map((p) => makePad(p, CHEESE_YELLOW));  // Say Cheese corner (northeast)
const NEXT_BLUE = 0x2a8cff, GRAY = 0x5a5f6b;
const nextPads = ARENA.nextPads.map((p) => makePad(p, NEXT_BLUE));          // next game: middle of the east wall
const grayPads = ARENA.grayPads.map((p) => makePad(p, GRAY));               // unused for now
for (const g of grayPads) { g.plateMat.emissiveIntensity = 0.05; g.ring.material.color.setHex(0x3a3f4a); }
const nextFloor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ color: NEXT_BLUE, transparent: true, opacity: 0.06, depthWrite: false }));
nextFloor.rotation.x = -Math.PI / 2; nextFloor.position.set(21, 0.015, 0); scene.add(nextFloor);
const onPadList = (list, x, z, y) => list.some(p => Math.hypot(x - p.x, z - p.z) <= p.r && y < 1);
function onCheesePad(x, z, y) {
  return ARENA.cheesePads.some(p => Math.hypot(x - p.x, z - p.z) <= p.r && y < 1);
}

// ---------- corner signs ----------
function wallSign(draw, w, h, pos, rotY) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.round(1024 * h / w);
  draw(c.getContext('2d'), c.width, c.height);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.position.copy(pos); m.rotation.y = rotY;
  scene.add(m);
  return m;
}
// 4xPVP on the west wall above the green pads (northwest corner, facing the Say Cheese sign)
const pvpSign = wallSign((x, W, Hc) => {
  x.fillStyle = 'rgba(2,12,2,0.85)'; x.fillRect(0, 0, W, Hc);
  x.strokeStyle = '#39ff14'; x.lineWidth = 18; x.shadowColor = '#39ff14'; x.shadowBlur = 30;
  x.strokeRect(20, 20, W - 40, Hc - 40);
  x.fillStyle = '#39ff14'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 300px sans-serif'; x.fillText('4xPVP', W / 2, Hc * 0.45);
  x.shadowBlur = 0; x.fillStyle = '#d8ffd0'; x.font = 'bold 56px sans-serif';
  x.fillText('Weapons free-for-all · 2-4 players · stand on a green pad', W / 2, Hc * 0.82, W - 80);
}, 12, 6, new THREE.Vector3(-HALF + 0.1, 6, -21), Math.PI / 2);
const pvpFloor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ color: PVP_GREEN, transparent: true, opacity: 0.06, depthWrite: false }));
pvpFloor.rotation.x = -Math.PI / 2; pvpFloor.position.set(-21, 0.015, -21); scene.add(pvpFloor);
// Say Cheese: big yellow smiley on the east wall above the yellow pads
const cheeseSign = wallSign((x, W, Hc) => {
  const cx = W / 2, cy = Hc * 0.42, r = Hc * 0.34;
  x.shadowColor = '#ffd400'; x.shadowBlur = 40;
  x.fillStyle = '#ffd400'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  x.shadowBlur = 0;
  x.lineWidth = 14; x.strokeStyle = '#b38f00'; x.stroke();
  x.fillStyle = '#1a1200';
  x.beginPath(); x.ellipse(cx - r * 0.35, cy - r * 0.25, r * 0.11, r * 0.17, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(cx + r * 0.35, cy - r * 0.25, r * 0.11, r * 0.17, 0, 0, Math.PI * 2); x.fill();
  x.lineWidth = r * 0.09; x.lineCap = 'round'; x.strokeStyle = '#1a1200';
  x.beginPath(); x.arc(cx, cy + r * 0.05, r * 0.55, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
  x.fillStyle = '#ffd400'; x.textAlign = 'center'; x.font = '900 120px sans-serif';
  x.shadowColor = '#ffd400'; x.shadowBlur = 20;
  x.fillText('SAY CHEESE', cx, Hc * 0.95);
}, 11, 9, new THREE.Vector3(HALF - 0.1, 7, -21), -Math.PI / 2);
// Dance Dance Disco sign on the east wall above the blue pads
const discoSign = wallSign((x, W, Hc) => {
  x.fillStyle = 'rgba(0,6,20,0.85)'; x.fillRect(0, 0, W, Hc);
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#ff3df2'); g.addColorStop(0.5, '#00e5ff'); g.addColorStop(1, '#ffd400');
  x.strokeStyle = g; x.lineWidth = 16; x.shadowColor = '#2a8cff'; x.shadowBlur = 30; x.strokeRect(20, 20, W - 40, Hc - 40);
  x.fillStyle = g; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 120px sans-serif'; x.fillText('🪩 DANCE DANCE', W / 2, Hc * 0.33, W - 80);
  x.font = '900 150px sans-serif'; x.fillText('DISCO', W / 2, Hc * 0.66, W - 80);
  x.shadowBlur = 0; x.fillStyle = '#d8ecff'; x.font = 'bold 40px sans-serif';
  x.fillText('Dance with your camera until the floor explodes · blue pads', W / 2, Hc * 0.9, W - 80);
}, 11, 6.2, new THREE.Vector3(HALF - 0.1, 6, 0), -Math.PI / 2);
const cheeseFloor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ color: CHEESE_YELLOW, transparent: true, opacity: 0.06, depthWrite: false }));
cheeseFloor.rotation.x = -Math.PI / 2; cheeseFloor.position.set(21, 0.015, -21); scene.add(cheeseFloor);

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
    a.body.rainbow = (p.inv || 0) > 0;
    a.cloaked = (p.cloak || 0) > 0;
    if (p.id !== me.id) { a.target.set(...p.p); a.yaw = p.yaw; }
    else { me.hp = p.hp; me.weapon = p.w; me.uses = p.uses; me.streak = p.streak || 0; me.muscle = p.muscle || 0; me.inv = p.inv || 0; me.cloak = p.cloak || 0; }
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
      const upright = ['heal', 'berserk', 'walls', 'bombs', 'lava', 'robots', 'cloak'].includes(WEAPONS[w.type].kind);
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
        if (m.mode === 'disco') { banner(`🪩 DANCE DANCE DISCO: ${names.join(', ')}\nOthers: hop on a free blue pad to join!`, 3000); break; }
        banner(m.mode === 'cheese' ? `🧀 SAY CHEESE: ${names.join(', ')}\nOthers: hop on a free yellow pad to join!` : `${names.join(' vs ')}\nOthers: jump on a free pad to join!`, 3000);
        break;
      }
      case 'out':
        if (m.id === me.id) banner(`💀 You're out!\n${m.text}\nWatch the rest of the battle`, 3500);
        tone(180, 0.4, 'sawtooth', 0.1, -120);
        break;
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
        if (m.mode === 'disco') { showDiscoResults(m); banner(m.boom ? '💥 THE DANCE FLOOR EXPLODED — EVERYBODY WINS! 💥' : '🪩 The music stopped!', 5500); break; }
        if (m.mode === 'cheese') showCheeseResults(m);
        banner(m.mode === 'cheese' ? `🧀 ${m.name} WINS SAY CHEESE! 🧀` : `${m.name} WINS!\n${m.reason}${streakLine}${muscleLine ? `\n💪${muscleLine}` : ''}`, 5500);
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
        else if (m.kind === 'robothit') {
          const r = robotMeshes.get(m.robot);
          if (r) addBurst(r.g.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 0xff2020, 8, 4, 0.08, 0.3);
          tone(220, 0.08, 'square', 0.08, -100);
        }
        else if (m.kind === 'ram') {
          const tgt = avatars.get(m.to);
          if (tgt) addBurst(tgt.body.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)), new THREE.Color().setHSL(Math.random(), 1, 0.6).getHex(), 14, 6, 0.1, 0.5);
          tone(300 + Math.random() * 400, 0.08, 'square', 0.08, 200);
        }
        else onAttackFx(m);
        break;
      case 'heal': onHeal(m); break;
      case 'bombs': onBombs(m); break;
      case 'admin': onAdminResult(m); break;
      case 'cheeseStart': onCheeseStart(m); hideInvite(); break;
      case 'invite': onInvite(m); break;
      case 'cheeseCount': onCheeseCount(m); break;
      case 'discoGo': onDiscoGo(); break;
      case 'discoBoom': onDiscoBoom(); break;
      case 'dancePhoto': discoPhotos[m.key] = m.data; break;
      case 'cheeseRound': onCheeseRound(m); break;
      case 'cheeseFlash': onCheeseFlash(m); break;
      case 'cheesePhoto': onCheesePhoto(m); break;
      case 'adminMode':
        me.adminMode = m.on;
        renderAdminModeBtn();
        feed(m.on ? '🛠️ Admin mode ON — aim at a weapon on the weapon wall and click it' : 'Admin mode OFF', '#ffd23c');
        if (m.on) setTimeout(closeAdmin, 400);
        break;
      case 'blocked': {
        const a = avatars.get(m.target);
        if (a) addBurst(a.body.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xffffff, 8, 4, 0.08, 0.3);
        tone(1500, 0.05, 'triangle', 0.05);
        break;
      }
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
  banner(mine ? '💣 BOMBS AWAY! They hit you too — find a clear spot!' : '💣 100 BOMBS INCOMING — FIND A CLEAR SPOT!', 3000);
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

// ---------- admin keypad + cheat menu ----------
let adminOpen = false;
let adminCode = '';
const adminEl = $('admin'), padView = $('padView'), cheatView = $('cheatView'), codeEl = $('adminCode'), adminMsg = $('adminMsg');
function openAdmin() {
  adminOpen = true;
  adminCode = '';
  codeEl.textContent = '_ _ _';
  adminMsg.textContent = '';
  padView.style.display = me.isAdmin ? 'none' : 'block';
  cheatView.style.display = me.isAdmin ? 'block' : 'none';
  renderAdminModeBtn();
  adminEl.style.display = 'flex';
  document.exitPointerLock?.();
  tone(660, 0.08, 'square', 0.06);
}
function closeAdmin() {
  adminOpen = false;
  adminEl.style.display = 'none';
  if (!touch.active) renderer.domElement.requestPointerLock?.();
}
function padPress(k) {
  if (k === 'C') adminCode = '';
  else if (k === 'OK') { send({ t: 'admin', code: adminCode }); adminMsg.textContent = 'Checking…'; return; }
  else if (adminCode.length < 6) adminCode += k;
  codeEl.textContent = adminCode ? '*'.repeat(adminCode.length) : '_ _ _';
  tone(500 + Number(k || 0) * 40, 0.05, 'square', 0.05);
}
adminEl.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); padPress(b.dataset.k); }));
const adminModeBtn = $('adminModeBtn');
function renderAdminModeBtn() {
  adminModeBtn.firstChild.textContent = `🛠️ Admin Mode: ${me.adminMode ? 'ON' : 'OFF'}`;
  adminModeBtn.style.background = me.adminMode ? '#1f7a2e' : '#3a3f4f';
}
adminModeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  send({ t: 'adminMode', on: !me.adminMode });
  tone(880, 0.12, 'triangle', 0.08);
});
$('adminClose').addEventListener('click', (e) => { e.stopPropagation(); closeAdmin(); });
addEventListener('keydown', (e) => {
  if (!adminOpen) return;
  if (/^Digit[0-9]$/.test(e.code) || /^Numpad[0-9]$/.test(e.code)) padPress(e.code.slice(-1));
  else if (e.code === 'Enter' || e.code === 'NumpadEnter') padPress('OK');
  else if (e.code === 'Backspace') padPress('C');
  else if (e.code === 'Escape') closeAdmin();
});
function onAdminResult(m) {
  if (m.ok) {
    me.isAdmin = true;
    padView.style.display = 'none';
    cheatView.style.display = 'block';
    [523, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.08), i * 90));
  } else {
    adminMsg.textContent = 'ACCESS DENIED';
    adminCode = ''; codeEl.textContent = '_ _ _';
    tone(120, 0.3, 'sawtooth', 0.1);
  }
}

// ---------- Say Cheese client ----------
const scorer = new FaceScorer();
const cheeseEl = { count: $('camCount'), ask: $('camAsk'), overlay: $('faceOverlay'), faceMsg: $('faceMsg'), cam: $('cheeseCam'), hud: $('cheeseHud'), emotion: $('cheeseEmotion'), timer: $('cheeseTimer'), board: $('cheeseBoard'),
  preview: $('cheesePreview'), rating: $('myRating'), note: $('cheeseNote'), flash: $('flash'), camMsg: $('camMsg') };
let cheeseScoreSent = 0;
let cheeseFacesSent = 0;
let localIds = null;          // local game (one camera, 2-4 people): cheese player ids, left to right
let winningFaces = {};        // player id -> close-ups of every round they won this game
const VIRTUAL_COLORS = [0x00e5ff, 0xff3df2, 0x7dff3d, 0xffb300];
const virtualAvatars = new Map(); // id -> { body, label }
function isLocalHost() { return !!snap.cheese?.local && snap.cheese.host === me.id; }
function cheeseName(id) { return snap.cheese?.players.find(p => p[0] === id)?.[5] ?? avatars.get(id)?.data.name ?? '?'; }
let lastTimerNum = null;
function inCheeseGame() { return snap.mode === 'cheese' && !!snap.cheese && snap.cheese.players.some(p => p[0] === me.id); }
function cheeseReady(camera) {
  send({ t: 'cheeseReady', camera });
  cheeseEl.cam.style.display = 'none';
  if (!touch.active) renderer.domElement.requestPointerLock?.();
}
function attachPreview() {
  if (scorer.video && !scorer.video.parentNode) cheeseEl.preview.prepend(scorer.video);
  cheeseEl.preview.classList.toggle('fakecam', !scorer.video);
  cheeseEl.preview.style.display = scorer.video || scorer.fake ? 'block' : 'none';
}
async function turnOnCamera() {
  cheeseEl.camMsg.textContent = 'Asking for your camera…';
  const ok = await scorer.start();
  if (!ok) { cheeseEl.camMsg.textContent = 'No camera access — check your browser settings, or play without a camera.'; return; }
  attachPreview();
  if (scorer.status === 'error') {
    cheeseEl.note.textContent = '⚠️ Face tracking could not load on this device, so your faces can\'t be scored. You can still watch!';
    cheeseEl.note.style.display = 'block';
  }
  cheeseReady(scorer.status === 'ready');
}
$('camYes').addEventListener('click', (e) => { e.stopPropagation(); turnOnCamera(); });
$('camNo').addEventListener('click', (e) => { e.stopPropagation(); cheeseReady(false); });
document.querySelectorAll('#camCount .cnt').forEach(b => b.addEventListener('click', (e) => {
  e.stopPropagation();
  send({ t: 'cheeseCount', n: Number(b.dataset.n) });
}));
async function showCameraAsk() {
  cheeseEl.count.style.display = 'none';
  cheeseEl.ask.style.display = 'block';
  // camera was connected when you pressed PLAY: wait for it if it's still warming up
  if (scorer.status === 'asking' || scorer.status === 'loading') {
    cheeseEl.cam.style.display = 'none';
    while (scorer.status === 'asking' || scorer.status === 'loading') await new Promise(r => setTimeout(r, 200));
  }
  if (scorer.status === 'ready') { attachPreview(); cheeseReady(true); return; }
  if (scorer.status === 'error') {
    attachPreview();
    cheeseEl.note.textContent = '⚠️ Face tracking could not load on this device, so your faces can\'t be scored. You can still watch!';
    cheeseEl.note.style.display = 'block';
    cheeseReady(false);
    return;
  }
  if (scorer.fake) { turnOnCamera(); return; }
  cheeseEl.camMsg.textContent = '';
  cheeseEl.cam.style.display = 'flex';
}

let camGame = 'cheese';
function onCheeseStart(m) {
  me.cheeseSpot = m.spot;
  localIds = null;
  winningFaces = {};
  camGame = m.game || 'cheese';
  if (camGame === 'disco') pose.load();
  danceView.classList.remove('fade');
  const disc = camGame === 'disco';
  document.querySelector('#cheeseCam h2').textContent = disc ? '🪩 DANCE DANCE DISCO' : '🧀 SAY CHEESE';
  document.querySelector('#camCount p').textContent = disc ? 'How many dancers are in front of this camera?' : 'How many players are in front of this camera?';
  document.querySelector('#camAsk p').innerHTML = disc
    ? 'Dance for your camera! The more you move, the higher your score. When everyone dances at max, the floor explodes.<br><small>Your video stays on your device.</small>'
    : 'The giant smiley will ask for a face. Make it with your real face! Your camera rates how well you match, and the best face each round gets its photo on the wall.<br><small>Your video stays on your device. Only the round winner\'s snapshot is shared.</small>';
  document.exitPointerLock?.();
  if (m.local) {
    // started alone: ask how many people are playing on this camera first
    cheeseEl.count.style.display = 'block';
    cheeseEl.ask.style.display = 'none';
    cheeseEl.cam.style.display = 'flex';
    return;
  }
  scorer.setCount(1);
  showCameraAsk();
}
function onCheeseCount(m) {
  localIds = m.ids;
  scorer.setCount(m.n);
  showCameraAsk();
}
const aOrAn = (word) => (/^[aeiou]/i.test(word) ? 'AN' : 'A');
function drawCheeseTitle(text, sub = '') {
  cheeseTitle.draw((x, W, Hc) => {
    x.fillStyle = 'rgba(20,14,0,0.8)'; x.fillRect(0, 0, W, Hc);
    x.strokeStyle = '#ffd400'; x.lineWidth = 8; x.strokeRect(4, 4, W - 8, Hc - 8);
    x.fillStyle = '#ffd400'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 52px sans-serif'; x.fillText(text, W / 2, sub ? Hc * 0.38 : Hc / 2, W - 40);
    if (sub) { x.fillStyle = '#fff'; x.font = 'bold 30px sans-serif'; x.fillText(sub, W / 2, Hc * 0.75, W - 40); }
  });
}
function onCheeseRound(m) {
  scorer.resetRound();
  smiley.setEmotion(m.emotion);
  const name = emotionById(m.emotion)?.name ?? m.emotion;
  drawCheeseTitle(`ROUND ${m.round}: MAKE ${aOrAn(name)} ${name.toUpperCase()} FACE!`);
  [523, 659].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.08), i * 110));
}
function onCheeseFlash(m) {
  smiley.flashT = 1;
  cheeseEl.flash.style.transition = 'none';
  cheeseEl.flash.style.opacity = 0.95;
  requestAnimationFrame(() => { cheeseEl.flash.style.transition = 'opacity 0.8s ease-out'; cheeseEl.flash.style.opacity = 0; });
  noise(0.15, 0.25); tone(1800, 0.08, 'square', 0.06);
  const names = m.winners.map(id => cheeseName(id));
  const name = emotionById(m.emotion)?.name ?? '';
  if (names.length) {
    banner(`📸 ${names.join(' & ')} ${names.length > 1 ? 'tie' : 'wins'} the round!`, 2500);
    drawCheeseTitle(`📸 ${names.join(' & ')} made the best ${name.toUpperCase()} face!`);
  } else {
    banner('📸 Nobody scored this round!', 2000);
    drawCheeseTitle('📸 Nobody scored that round!');
  }
  // the winner's browser sends the snapshot from their best moment
  if (localIds) {
    const i = localIds.indexOf(m.photoFrom);
    if (i >= 0 && scorer.bestPhotos[i]) send({ t: 'cheesePhoto', data: scorer.bestPhotos[i] });
  } else if (m.photoFrom === me.id && scorer.bestPhoto) send({ t: 'cheesePhoto', data: scorer.bestPhoto });
}
function onCheesePhoto(m) {
  (winningFaces[m.id] ||= []).push(m.data);
  const img = new Image();
  img.onload = () => {
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    photoMat.map?.dispose();
    photoMat.map = tex; photoMat.color.set(0xffffff); photoMat.needsUpdate = true;
    photoFrame.visible = true;
  };
  img.src = m.data;
  const name = emotionById(m.emotion)?.name ?? m.emotion;
  photoCaption.draw((x, W, Hc) => {
    x.fillStyle = '#ffd400'; x.fillRect(0, 0, W, Hc);
    x.fillStyle = '#1a1400'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 64px sans-serif'; x.fillText(`${m.name} — ${name.toUpperCase()}`, W / 2, Hc / 2, W - 40);
  });
  photoCaption.mesh.visible = true;
  feed(`📸 ${m.name}'s ${name} face is on the wall!`, '#ffd400');
}
function updateCheese(dt, t) {
  const C = snap.cheese;
  const show = snap.mode === 'cheese' && (snap.phase === 'cheese' || snap.phase === 'over') && !!C;
  smiley.mesh.visible = show;
  cheeseTitle.mesh.visible = show;
  if (!show) {
    photoFrame.visible = false; photoCaption.mesh.visible = false;
    cheeseEl.hud.style.display = 'none';
    if (virtualAvatars.size && snap.mode !== 'disco') updateVirtualAvatars(dt);
    if (snap.phase === 'lobby') {
      resultsEl.style.display = 'none';
      // keep the camera connected for the next game; just hide the preview
      if (me.cheeseSpot) { me.cheeseSpot = null; cheeseEl.cam.style.display = 'none'; cheeseEl.note.style.display = 'none'; cheeseEl.preview.style.display = 'none'; }
      photoMat.map = null; photoMat.color.set(0x222222);
    }
    return;
  }
  smiley.update(dt, t);
  cheeseEl.hud.style.display = resultsEl.style.display === 'block' ? 'none' : 'block';   // results take over the screen
  const playing = inCheeseGame();
  // live scoring during the 10-second pose window
  const local = isLocalHost();
  if (C.stage === 'pose' && playing && scorer.status === 'ready') {
    const scs = scorer.update(C.emotion);
    if (performance.now() - cheeseScoreSent > 200) {
      cheeseScoreSent = performance.now();
      send(local ? { t: 'cheeseScore', scores: scs.map(Math.round) } : { t: 'cheeseScore', s: Math.round(scs[0]) });
    }
    cheeseEl.rating.textContent = local ? scs.map((v, i) => `P${i + 1} ${Math.round(v)}`).join(' · ') : `${Math.round(scs[0])}${scorer.faceSeen ? '' : ' · no face'}`;
  } else if (playing && scorer.status === 'ready') {
    scorer.detect();   // keep finding faces between rounds
  }
  if (local && scorer.status === 'ready' && performance.now() - cheeseFacesSent > 300) {
    cheeseFacesSent = performance.now();
    send({ t: 'cheeseFaces', ok: scorer.facesOk, n: scorer.faces.length });
  }
  // camera preview: big while we're finding faces, with a labeled box on every face
  const finding = local && C.stage === 'camera' && scorer.status === 'ready';
  cheeseEl.preview.classList.toggle('big', finding);
  if (finding) cheeseEl.faceMsg.textContent = scorer.facesOk
    ? `✅ Found all ${scorer.count} faces — get ready!`
    : `Line up side by side · found ${scorer.faces.length} of ${scorer.count} faces`;
  drawFaceBoxes(local, C.stage === 'pose');
  // big countdown 10..1, then FLASH
  const name = emotionById(C.emotion)?.name ?? '';
  if (C.stage === 'count') { cheeseEl.emotion.textContent = 'How many players?'; cheeseEl.timer.textContent = ''; drawCheeseTitle('🧀 SAY CHEESE!', 'Choosing how many players…'); }
  else if (C.stage === 'camera' && C.local) { cheeseEl.emotion.textContent = 'Finding everyone\'s face…'; cheeseEl.timer.textContent = ''; drawCheeseTitle('🧀 SAY CHEESE!', 'Line up side by side so the camera can see every face'); }
  else if (C.stage === 'camera') { cheeseEl.emotion.textContent = 'Waiting for cameras…'; cheeseEl.timer.textContent = Math.ceil(C.left / 1000); drawCheeseTitle('🧀 SAY CHEESE!', 'Players are turning on their cameras…'); }
  else if (C.stage === 'pose') {
    const n = Math.max(1, Math.ceil(C.left / 1000));
    cheeseEl.emotion.textContent = `Make ${aOrAn(name).toLowerCase()} ${name.toUpperCase()} face!`;
    cheeseEl.timer.textContent = n;
    if (n !== lastTimerNum) { lastTimerNum = n; if (n <= 3) tone(660 + (3 - n) * 110, 0.1, 'square', 0.07); }
  } else if (C.stage === 'ready') {
    cheeseEl.emotion.textContent = `Get ready: ${aOrAn(name).toLowerCase()} ${name.toUpperCase()} face!`;
    cheeseEl.timer.textContent = '…';
    lastTimerNum = null;
  } else if (C.stage === 'flash') { cheeseEl.emotion.textContent = 'SAY CHEESE!'; cheeseEl.timer.textContent = '📸'; lastTimerNum = null; }
  else { cheeseEl.emotion.textContent = ''; cheeseEl.timer.textContent = ''; }
  // live ratings + wins for every player
  const rows = [...C.players].sort((a, b) => b[3] - a[3] || b[1] - a[1]);
  cheeseEl.board.innerHTML = `<div style="font-weight:900;color:#ffd400;margin-bottom:8px">LIVE RATINGS · first to ${CHEESE.winsToWin} 🏆</div>` + rows.map(([id, score, best, wins, ready, name]) => {
    const idx = C.players.findIndex(q => q[0] === id);
    const p = snap.players.find(x => x.id === id) || { color: VIRTUAL_COLORS[idx % 4] };
    const nm = name || p.name || '?';
    const val = C.stage === 'pose' ? score : best;
    return `<div class="crow ${id === me.id ? 'me' : ''}"><div class="top"><span style="color:${p ? hex(p.color) : '#fff'}">${nm}${id === me.id ? ' (you)' : ''}${ready ? '' : ' ⏳'}</span><span>${'🏆'.repeat(wins) || '—'} ${val}</span></div>
      <div class="bar"><div style="width:${val}%"></div></div></div>`;
  }).join('');
  updateVirtualAvatars(dt);
}

// End of game: horizontal bar chart, winner on top, each bar filled with that player's winning faces
const resultsEl = $('cheeseResults');
function showCheeseResults(m) {
  const standings = m.standings || [];
  const maxWins = Math.max(CHEESE.winsToWin, ...standings.map(s => s[2]));
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  // spectators who joined mid-game may have missed some photos; they still see the bars
  if (!Object.keys(winningFaces).length && !standings.length) return;
  document.querySelector('#cheeseResults h2').textContent = '🏆 SAY CHEESE — FINAL RESULTS 🏆';
  $('resultsSub').textContent = m.reason || '';
  $('resultsRows').innerHTML = standings.map(([id, name, wins], i) => {
    const faces = winningFaces[id] || [];
    const tiles = Array.from({ length: wins }, (_, k) => faces[k] ? `<img src="${faces[k]}" alt="">` : `<div class="noimg">😀</div>`).join('');
    return `<div class="rrow ${i === 0 ? 'first' : ''}"><div class="place">${medals[i] || i + 1}</div><div class="nm">${name}</div>
      <div class="track"><div class="bar" style="width:0%;${wins ? '' : 'padding:0'}" data-w="${wins ? Math.max(12, (wins / maxWins) * 100) : 0}">${tiles}</div></div><div class="wins">${wins}</div></div>`;
  }).join('');
  resultsEl.style.display = 'block';
  document.exitPointerLock?.();
  // grow the bars in
  requestAnimationFrame(() => requestAnimationFrame(() => resultsEl.querySelectorAll('.bar').forEach(b => { b.style.width = b.dataset.w + '%'; })));
}
resultsEl.addEventListener('click', (e) => { e.stopPropagation(); resultsEl.style.display = 'none'; });

// Boxes around each face in the camera preview, labeled Player 1..4 (left to right)
function drawFaceBoxes(local, posing) {
  const cv = cheeseEl.overlay;
  const r = cheeseEl.preview.getBoundingClientRect();
  if (!r.width) return;
  if (cv.width !== Math.round(r.width) || cv.height !== Math.round(r.height)) { cv.width = Math.round(r.width); cv.height = Math.round(r.height); }
  const x = cv.getContext('2d');
  x.clearRect(0, 0, cv.width, cv.height);
  scorer.faces.forEach((f, i) => {
    const col = '#' + VIRTUAL_COLORS[i % 4].toString(16).padStart(6, '0');
    const bx = f.box.x * cv.width, by = f.box.y * cv.height, bw = f.box.w * cv.width, bh = f.box.h * cv.height;
    x.strokeStyle = col; x.lineWidth = 4; x.strokeRect(bx, by, bw, bh);
    const label = local ? `P${i + 1}${posing ? ' ' + Math.round(scorer.scores[i] || 0) : ''}` : (posing ? String(Math.round(scorer.scores[0] || 0)) : 'YOU');
    x.font = 'bold 18px system-ui, sans-serif';
    const tw = x.measureText(label).width + 10;
    x.fillStyle = col; x.fillRect(bx, by - 24, tw, 24);
    x.fillStyle = '#000'; x.fillText(label, bx + 5, by - 6);
  });
}

// Local game: avatars for players 2-4 (they don't have their own device)
function camGamePlayers() {
  if (snap.mode === 'disco' && snap.disco) return snap.disco.dancers.slice(0, DISCO.spots.length).map(d => ({ id: d[0], energy: d[1], score: d[2], name: d[3], virtual: true }));
  if (snap.cheese) return snap.cheese.players.map(p => ({ id: p[0], name: p[5], virtual: !!p[6] }));
  return [];
}
function updateVirtualAvatars(dt) {
  const spotsList = snap.mode === 'disco' ? DISCO.spots : CHEESE_SPOTS;
  const want = new Set();
  camGamePlayers().forEach(({ id, name, virtual }, i) => {
    if (!virtual) return;
    want.add(id);
    let v = virtualAvatars.get(id);
    if (!v) {
      const body = new WireBody(VIRTUAL_COLORS[i % 4]);
      const spot = spotsList[i];
      body.root.position.set(spot.x, 0, spot.z);
      body.root.rotation.y = Math.PI;
      scene.add(body.root);
      const label = document.createElement('div');
      label.className = 'label3d';
      label.innerHTML = `<div class="nm" style="color:#${VIRTUAL_COLORS[i % 4].toString(16).padStart(6, '0')}">${name}</div>`;
      ui.labels.appendChild(label);
      v = { body, label };
      virtualAvatars.set(id, v);
    }
    applyDiscoToBody(v.body, id);
    v.body.update(dt, false, 0.2, false);
    applyBlown(v.body.root, i, spotsList[i]);
    const pos = v.body.root.position.clone().add(new THREE.Vector3(0, 2.25, 0)).project(camera);
    v.label.style.display = pos.z < 1 && danceView.style.display !== 'block' ? 'block' : 'none';
    v.label.style.left = `${(pos.x * 0.5 + 0.5) * innerWidth}px`;
    v.label.style.top = `${(-pos.y * 0.5 + 0.5) * innerHeight}px`;
  });
  for (const [id, v] of virtualAvatars) {
    if (!want.has(id)) { scene.remove(v.body.root); v.label.remove(); virtualAvatars.delete(id); }
  }
}

// ---------- Dance Dance Disco client ----------
const meter = new MotionMeter();
const pose = new PoseTracker();
const danceView = $('danceView'), danceVideo = $('danceVideo'), danceCanvas = $('danceCanvas');
// live camera feed behind everything, with a stick figure drawn over each dancer
function danceVideoOn() {
  if (scorer.video && danceVideo.srcObject !== scorer.video.srcObject) {
    danceVideo.srcObject = scorer.video.srcObject;
    danceVideo.play().catch(() => {});
  }
}
function drawDanceOverlay(tracks, scoreOf) {
  const W = innerWidth, Hh = innerHeight;
  if (danceCanvas.width !== W || danceCanvas.height !== Hh) { danceCanvas.width = W; danceCanvas.height = Hh; }
  const x = danceCanvas.getContext('2d');
  x.clearRect(0, 0, W, Hh);
  // same "cover" fit as the video so the stick figures line up with the people
  const vw = danceVideo.videoWidth || 1280, vh = danceVideo.videoHeight || 720;
  const sc = Math.max(W / vw, Hh / vh), dw = vw * sc, dh = vh * sc, ox = (W - dw) / 2, oy = (Hh - dh) / 2;
  const P = (pt) => [ox + pt.x * dw, oy + pt.y * dh];
  for (const tr of tracks) {
    const pp = tr.points;
    const col = hex(VIRTUAL_COLORS[(tr.slot - 1) % 4]);
    const body = Math.hypot((pp[11].x - pp[12].x) * dw, (pp[11].y - pp[12].y) * dh);
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.shadowColor = col; x.shadowBlur = 18;
    x.strokeStyle = col; x.lineWidth = Math.max(4, body * 0.08);
    for (const [a, b] of BONES) {
      if (pp[a].v < 0.4 || pp[b].v < 0.4) continue;
      const [x1, y1] = P(pp[a]), [x2, y2] = P(pp[b]);
      x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
    }
    // neck + head
    const neck = { x: (pp[11].x + pp[12].x) / 2, y: (pp[11].y + pp[12].y) / 2, v: Math.min(pp[11].v, pp[12].v) };
    const [hx, hy] = P(pp[0]), [nx, ny] = P(neck);
    const hr = Math.max(12, body * 0.38);
    if (neck.v > 0.4 && pp[0].v > 0.4) { x.beginPath(); x.moveTo(nx, ny); x.lineTo(hx, hy + hr * 0.8); x.stroke(); }
    if (pp[0].v > 0.4) { x.beginPath(); x.arc(hx, hy, hr, 0, Math.PI * 2); x.stroke(); }
    // hands and feet
    x.fillStyle = '#fff';
    for (const k of [15, 16, 27, 28]) {
      if (pp[k].v < 0.4) continue;
      const [px, py] = P(pp[k]);
      x.beginPath(); x.arc(px, py, Math.max(6, body * 0.1), 0, Math.PI * 2); x.fill();
    }
    x.shadowBlur = 0;
    // name, energy bar and score floating above the head
    const e = Math.round(tr.energy || 0), name = `Dancer ${tr.slot}`, score = scoreOf(tr.tid);
    const bw = Math.max(120, body * 1.4), by = Math.max(215, hy - hr - 52);
    const lx = Math.max(bw / 2 + 8, Math.min(W - bw / 2 - 8, hx)), bx = lx - bw / 2;   // keep the label on screen
    x.font = 'bold 20px system-ui, sans-serif'; x.textAlign = 'center';
    const label = score != null ? `${name} · ${score}` : name;
    x.fillStyle = '#000'; x.fillText(label, lx + 1, by + 1); x.fillStyle = col; x.fillText(label, lx, by);
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(bx, by + 8, bw, 12);
    x.fillStyle = e >= DISCO.maxEnergy ? '#ffd400' : col; x.fillRect(bx, by + 8, bw * e / 100, 12);
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.strokeRect(bx, by + 8, bw, 12);
  }
}
let music = null;
let energySent = 0, discoFacesSent = 0;
let blownAt = 0;                       // when the dance floor exploded
const danceTags = new Map();           // id -> label element under each dancer
let discoPhotos = {};                  // dancer key -> snapshot of that dancer
const snapCanvas = document.createElement('canvas'); snapCanvas.width = snapCanvas.height = 128;
// close-up of one dancer (head and shoulders), mirrored like the video
function snapDancer(tr) {
  const c = snapCanvas.getContext('2d');
  const pp = tr.points;
  if (danceVideo.readyState >= 2 && danceVideo.videoWidth) {
    const vw = danceVideo.videoWidth, vh = danceVideo.videoHeight;
    const sw = Math.hypot((pp[11].x - pp[12].x) * vw, (pp[11].y - pp[12].y) * vh);
    const cx = (pp[0].x * 0.6 + (pp[11].x + pp[12].x) / 2 * 0.4) * vw, cy = (pp[0].y * 0.7 + (pp[11].y + pp[12].y) / 2 * 0.3) * vh;
    const size = Math.max(60, Math.min(Math.min(vw, vh), sw * 2.2));
    const sx = Math.max(0, Math.min(vw - size, cx - size / 2)), sy = Math.max(0, Math.min(vh - size, cy - size / 2));
    c.save(); c.translate(128, 0); c.scale(-1, 1);
    c.drawImage(danceVideo, vw - sx - size, sy, size, size, 0, 0, 128, 128);   // x is mirrored: flip back to pick the region
    c.restore();
  } else {
    c.fillStyle = hex(VIRTUAL_COLORS[(tr.slot - 1) % 4]); c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#000'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.fillText(`D${tr.slot}`, 64, 80);
  }
  return snapCanvas.toDataURL('image/jpeg', 0.75);
}
const discoEl = { hud: $('discoHud'), meter: document.querySelector('#discoMeter > div'), hint: $('discoHint'), title: $('discoTitle'), tags: $('danceTags') };
function inDiscoGame() { return snap.mode === 'disco' && !!snap.disco && snap.disco.devices.includes(me.id); }
function discoOn() { return snap.mode === 'disco' && !!snap.disco && (snap.phase === 'disco' || snap.phase === 'over'); }
// during Disco the people on camera are shown as dancing avatars; the players' own avatars step aside
function hiddenForDisco(id) { return discoOn() && snap.disco.devices.includes(id); }
function onDiscoGo() {
  discoPhotos = {};
  if (!actx) { try { actx = new AudioContext(); } catch {} }
  if (actx && !music) music = new DiscoMusic(actx);
  if (actx?.state === 'suspended') actx.resume();
  music?.start();
  blownAt = 0;
  meter.fakeT = 0;
}
function onDiscoBoom() {
  blownAt = performance.now();
  music?.boom();
  cheeseEl.flash.style.transition = 'none'; cheeseEl.flash.style.opacity = 1;
  requestAnimationFrame(() => { cheeseEl.flash.style.transition = 'opacity 1.5s ease-out'; cheeseEl.flash.style.opacity = 0; });
  shake = 1.2;
  const center = new THREE.Vector3(0, 1.5, 0);
  const ring = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  ring.position.copy(center); scene.add(ring);
  fx.push({ obj: ring, life: 1.2, max: 1.2, fade: true, grow: 4 });
  for (const c of [0xff3df2, 0x00e5ff, 0xffd400, 0x7dff3d, 0xffffff]) addBurst(center, c, 30, 16, 0.2, 1.6);
}
// the explosion throws every dancer up and outward, spinning
function applyBlown(root, i, spot) {
  if (!blownAt || snap.mode !== 'disco') return;
  const t = Math.min(3.1, (performance.now() - blownAt) / 1000);   // fly, then land and stay put
  const dir = new THREE.Vector3(spot.x || (i % 2 ? 1 : -1), 0, 1.2 + (i % 2) * 0.4).normalize();
  const h = Math.max(-0.0, 14 * t - 0.5 * 9 * t * t);
  root.position.x = spot.x + dir.x * 9 * t;
  root.position.z = spot.z + dir.z * 6 * t;
  root.position.y = t < 3.1 ? h : Math.max(0, h);
  root.rotation.x = t * 6; root.rotation.z = t * 4 * (i % 2 ? 1 : -1);
}
function applyDiscoToBody(body, key) {
  const D = snap.disco;
  if (!discoOn()) { body.dance = 0; body.partyGlow = 0; return; }
  const d = D.dancers.find(q => q[0] === key);
  body.dance = D.stage === 'dance' || D.stage === 'boom' ? Math.max(15, d ? d[1] : 0) : 15;
  body.partyGlow = Math.max(0, (D.hype - 0.35) / 0.65);
}
function updateDisco(dt, t) {
  const D = snap.disco;
  const show = discoOn();
  disco.g.visible = show;
  if (snap.mode === 'disco') updateVirtualAvatars(dt);
  if (!show) {
    discoEl.hud.style.display = 'none';
    danceView.style.display = 'none';
    danceView.classList.remove('fade');
    if (music && music.timer) music.stop();
    blownAt = 0;
    pose.reset();
    for (const [, el] of danceTags) el.remove();
    danceTags.clear();
    return;
  }
  const playing = inDiscoGame();
  const hasCam = !!scorer.video || pose.fake;
  cheeseEl.hud.style.display = 'none';
  // live video of the dancers fills the screen (fades out when the floor explodes)
  const videoMode = playing && hasCam && ['camera', 'dance', 'boom'].includes(D.stage);
  danceView.style.display = videoMode ? 'block' : 'none';
  if (D.stage === 'boom') danceView.classList.add('fade');
  if (videoMode) danceVideoOn();
  // find bodies (up to 4) and stick to them; report each one's dancing
  let tracks = [];
  if (playing && hasCam && (D.stage === 'camera' || D.stage === 'dance')) {
    const src = danceVideo.readyState >= 2 ? danceVideo : scorer.video;
    if (pose.status === 'ready') tracks = pose.update(src);
    else if (pose.status === 'error' && scorer.video) {
      // body tracking unavailable on this device: score the whole picture as one dancer
      const en = meter.update(scorer.video, 1, null);
      tracks = [{ tid: 1, slot: 1, energy: en[0], points: null }];
    }
    if (performance.now() - energySent > 200) {
      energySent = performance.now();
      send({ t: 'danceBodies', bodies: tracks.map(tr => [tr.tid, tr.slot, Math.round(tr.energy)]) });
    }
    // a second after we find a dancer, snap their picture to show next to their score
    if (D.stage === 'dance') for (const tr of tracks) {
      if (tr.points && !tr.photoSent && performance.now() - tr.born > 1000 && D.dancers.some(d => d[0] === `${me.id}:${tr.tid}`)) {
        tr.photoSent = true;
        send({ t: 'dancePhoto', tid: tr.tid, data: snapDancer(tr) });
      }
    }
  }
  if (videoMode) {
    const scoreOf = (tid) => { const d = D.dancers.find(q => q[0] === `${me.id}:${tid}`); return d ? d[2] : null; };
    drawDanceOverlay(tracks.filter(tr => tr.points), scoreOf);
  }
  // music follows the dancing
  const avg = D.dancers.length ? D.dancers.reduce((a, d) => a + d[1], 0) / D.dancers.length / 100 : 0;
  if (music && D.stage === 'dance') { if (!music.timer) music.start(); music.setLevel(avg, D.hype); }
  // the room pulses with the beat, harder as the party meter fills
  const beat = Math.pow(Math.max(0, Math.cos(t * Math.PI * 2 * 2)), 8);      // 120 BPM pulse
  const hype = D.hype;
  disco.ball.rotation.y += dt * 0.8;
  disco.spots.forEach((s, i) => {
    const a = t * (0.6 + hype) + i * Math.PI / 2;
    const r = 5 + Math.sin(t * 0.7 + i) * 3;
    s.sl.target.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    s.sl.intensity = 40 + hype * 120 + beat * 60 * (0.3 + hype);
    s.beam.position.set(Math.cos(a) * r * 0.5, 4.3, Math.sin(a) * r * 0.5);
    s.beam.lookAt(0, 8.5, 0); s.beam.rotateX(Math.PI / 2);
    s.beam.material.opacity = 0.05 + hype * 0.12 + beat * 0.05;
  });
  disco.floorTiles.forEach((tile, k) => {
    const on = ((k + Math.floor(t * 2)) % 4 === 0);
    tile.material.opacity = (on ? 0.35 : 0.08) + beat * 0.3 * (0.3 + hype);
  });
  if (roomEdges) roomEdges.material.color.setHSL((t * 0.2) % 1, 1, 0.5 + beat * 0.3 * hype);
  scene.background.setRGB(0.02 + beat * hype * 0.25, 0.02 + beat * hype * 0.05, 0.04 + beat * hype * 0.2);
  // HUD: party meter + every dancer's score, always on top of the video
  discoEl.hud.style.display = 'block';
  discoEl.meter.style.width = `${Math.round(hype * 100)}%`;
  const found = playing ? tracks.length : D.dancers.length;
  const slackers = D.dancers.filter(d => d[1] < DISCO.maxEnergy).map(d => d[3]);
  discoEl.title.textContent = D.stage === 'camera' ? '🪩 GET READY TO DANCE 🪩' : D.stage === 'boom' ? '💥 BOOM! 💥' : hype > 0.66 ? '🔥 KEEP GOING!! 🔥' : '🪩 JUST DANCE! 🪩';
  document.getElementById('discoMeterLabel').textContent = `PARTY METER · ${Math.min(D.total || 0, D.goal || 500)} / ${D.goal || 500} POINTS`;
  discoEl.hint.textContent = D.stage === 'camera' ? `Get in front of the camera · looking for up to 4 dancers · found ${found}`
    : D.stage !== 'dance' ? ''
    : !D.dancers.length ? 'No dancers found — step in front of the camera!'
    : slackers.length ? `Dance harder to score faster: ${slackers.join(', ')}` : 'EVERYONE IS MAX DANCING — points are flying in!';
  const seenTags = new Set();
  D.dancers.forEach(([key, energy, score, name], i) => {
    seenTags.add(key);
    let el = danceTags.get(key);
    if (!el) {
      el = document.createElement('div'); el.className = 'danceTag';
      el.innerHTML = `<img class="face" alt=""><div class="info"><div class="nm"></div><div class="bar"><div></div></div><div class="score"></div></div>`;
      discoEl.tags.appendChild(el); danceTags.set(key, el);
    }
    const img = el.querySelector('.face');
    if (discoPhotos[key] && img.src !== discoPhotos[key]) { img.src = discoPhotos[key]; img.style.display = 'block'; }
    if (videoMode || i >= DISCO.spots.length) {
      // a row of score bars along the bottom of the screen
      el.style.left = `${((i + 0.5) / D.dancers.length) * innerWidth}px`;
      el.style.top = `${innerHeight - 78}px`;
    } else {
      const sp = DISCO.spots[i];
      const p = new THREE.Vector3(sp.x, -0.15, sp.z).project(camera);
      el.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
      el.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
    }
    el.style.display = blownAt ? 'none' : 'flex';   // photo beside the name, bar and score
    el.querySelector('.nm').textContent = name;
    el.querySelector('.bar > div').style.width = `${energy}%`;
    el.querySelector('.score').textContent = score;
  });
  for (const [key, el] of danceTags) if (!seenTags.has(key)) { el.remove(); danceTags.delete(key); }
}
function showDiscoResults(m) {
  const standings = m.standings || [];
  const top = Math.max(1, ...standings.map(s => s[2]));
  document.querySelector('#cheeseResults h2').textContent = m.boom ? '💥 DANCE DANCE DISCO — EVERYBODY WINS! 💥' : '🪩 DANCE DANCE DISCO — RESULTS';
  $('resultsSub').textContent = m.reason || '';
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  document.querySelectorAll('.rrow').forEach(r => r.style.gridTemplateColumns = '');
  $('resultsRows').innerHTML = standings.map(([id, name, score], i) => `<div class="rrow ${i === 0 ? 'first' : ''}" style="grid-template-columns:60px 260px 1fr 70px"><div class="place">${m.boom ? '🏆' : medals[i] || i + 1}</div><div class="nm">${discoPhotos[id] ? `<img src="${discoPhotos[id]}" alt="">` : ''}${name}</div>
    <div class="track" style="height:84px"><div class="bar" style="width:0%;background:linear-gradient(90deg,#00e5ff,#ff3df2)" data-w="${Math.max(6, (score / top) * 100)}"></div></div><div class="wins">${score}</div></div>`).join('');
  resultsEl.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => resultsEl.querySelectorAll('.bar').forEach(b => { b.style.width = b.dataset.w + '%'; })));
}

// ---------- invites ----------
const padPanel = $('padPanel'), inviteToast = $('inviteToast');
let aloneMode = null;          // 'pvp' | 'cheese' when I'm the only one on that game's pads
let pendingInvite = null, inviteTimer = 0;
function padsPressedBy(list) {
  return list.map(p => snap.players.filter(pl => Math.hypot(pl.p[0] - p.x, pl.p[2] - p.z) <= p.r && pl.p[1] < 1).map(pl => pl.id));
}
function updatePadPanel() {
  aloneMode = null;
  if (snap.phase === 'lobby' && started) {
    for (const [mode, list] of [['pvp', ARENA.pads], ['cheese', ARENA.cheesePads], ['disco', ARENA.nextPads]]) {
      const on = [...new Set(padsPressedBy(list).flat())];
      if (on.length === 1 && on[0] === me.id) aloneMode = mode;
    }
  }
  padPanel.style.display = aloneMode ? 'block' : 'none';
  if (!aloneMode) return;
  $('padTitle').textContent = aloneMode === 'cheese' ? '🧀 Say Cheese — invite friends, or play now with everyone on your camera'
    : aloneMode === 'disco' ? '🪩 Dance Dance Disco — invite friends, or dance now with everyone on your camera'
    : '⚔️ 4xPVP needs at least 2 players — invite someone!';
  $('btnSolo').style.display = aloneMode === 'pvp' ? 'none' : '';
}
function sendInvite() { if (aloneMode) { send({ t: 'invite', mode: aloneMode }); tone(880, 0.1, 'triangle', 0.07); } }
async function copyLink() {
  const url = location.origin + location.pathname;
  try {
    if (navigator.share && touch.active) await navigator.share({ title: 'Double Player', text: 'Come play Double Player with me!', url });
    else { await navigator.clipboard.writeText(url); feed('🔗 Link copied — paste it to a friend!', '#00e5ff'); }
  } catch { feed(`🔗 Share this link: ${url}`, '#00e5ff'); }
}
function playSolo() { if (aloneMode === 'cheese' || aloneMode === 'disco') send({ t: 'soloStart', mode: aloneMode }); }
function acceptInvite() {
  if (!pendingInvite) return;
  send({ t: 'acceptInvite', mode: pendingInvite.mode });
  hideInvite();
}
function hideInvite() { pendingInvite = null; inviteToast.style.display = 'none'; clearTimeout(inviteTimer); }
function onInvite(m) {
  pendingInvite = m;
  $('inviteMsg').textContent = `📣 ${m.name} wants to play ${m.mode === 'cheese' ? '🧀 Say Cheese' : m.mode === 'disco' ? '🪩 Dance Dance Disco' : '⚔️ 4xPVP'}!`;
  inviteToast.style.display = 'block';
  [660, 880, 1100].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'triangle', 0.08), i * 100));
  clearTimeout(inviteTimer);
  inviteTimer = setTimeout(hideInvite, 30000);
}
const tapBtn = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
tapBtn('btnInvite', sendInvite); tapBtn('btnLink', copyLink); tapBtn('btnSolo', playSolo);
tapBtn('btnJoin', acceptInvite); tapBtn('btnNope', hideInvite);
for (const id of ['padPanel', 'inviteToast']) $(id).addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

let hitMarkerT = 0;
function onHit(m) {
  const target = avatars.get(m.target);
  const def = WEAPONS[m.weapon] || { name: weaponName(m.weapon) };
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
  if (['berserk_helmet', 'poop_bazooka', 'bomb', 'lava', 'robot'].includes(m.weapon)) return; // multi-hit attacks: skip feed spam
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
  // connect the camera now so Say Cheese is ready to go when you step on a yellow pad
  if (scorer.status === 'idle') scorer.start().then(() => {
    if (scorer.status === 'ready') feed('📷 Camera ready for Say Cheese', '#ffd400');
    else if (scorer.status === 'error') feed('📷 Camera is on, but face tracking could not load on this device', '#ff8c2a');
  });
  if (!touch.active) renderer.domElement.requestPointerLock?.();
}
// Mouse: hold right = run forward; left click = pick up (when next to a weapon) or attack
let rightHeld = false;
let jumpReq = false;
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button !== 2 || touch.active || !started) return;
  e.preventDefault();
  rightHeld = true;
});
addEventListener('mouseup', (e) => { if (e.button === 2) rightHeld = false; });
addEventListener('blur', () => { rightHeld = false; });
renderer.domElement.addEventListener('click', () => {
  if (touch.active || adminOpen) return;
  if (started && !locked) { renderer.domElement.requestPointerLock?.(); return; }
  if (!locked) return;
  if (takeFromWall(frameAt())) return;   // admin mode: clicking a weapon on the wall gives it to you
  if (canPickup()) pickup();
  else if (nearAdminPanel()) openAdmin();
  else attack();
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
  if (adminOpen) return; // keypad handles its own keys
  if (e.code === 'KeyE') { if (canPickup() || !nearAdminPanel()) pickup(); else openAdmin(); }
  if (e.code === 'KeyI') sendInvite();
  if (e.code === 'KeyL' && aloneMode) copyLink();
  if (e.code === 'KeyP') playSolo();
  if (e.code === 'KeyJ') acceptInvite();
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
  if (!started || adminOpen) return; // let the start screen / admin keypad taps work normally
  if (e.target.closest && e.target.closest('#padPanel, #inviteToast')) return; // invite buttons
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
      if (el.id === 'btnGrab') { if (canPickup() || !nearAdminPanel()) pickup(); else openAdmin(); }
      if (el.id === 'btnJump') touch.jump = true;
      if (el.id === 'btnDrop') send({ t: 'drop' });
    } else if (touch.lookId === null) {
      touch.lookId = t.identifier;
      touch.lastX = t.clientX; touch.lastY = t.clientY;
      touch.tapStart = { x: t.clientX, y: t.clientY, at: performance.now() };
    }
  }
  e.preventDefault();
}, { passive: false });

document.addEventListener('touchmove', (e) => {
  if (!started || adminOpen) return;
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
    if (t.identifier === touch.lookId) {
      touch.lookId = null;
      // a quick tap (not a swipe) on a weapon frame takes it in admin mode
      const st = touch.tapStart;
      if (st && me.adminMode && performance.now() - st.at < 300 && Math.hypot(t.clientX - st.x, t.clientY - st.y) < 12) {
        takeFromWall(frameAt((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1));
      }
      touch.tapStart = null;
    }
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
function canPickup() {
  const w = nearestWeapon();
  return !!w && isFighter() && snap.phase === 'fight' && me.hp > 0 && (!me.weapon || WEAPONS[w.type].instant);
}
function pickup() {
  const w = nearestWeapon();
  if (w) send({ t: 'pickup', id: w.id });
}
// Admin mode: which weapon frame is under the crosshair (or under a tap on touch screens)?
const frameRay = new THREE.Raycaster();
function frameAt(ndcX = 0, ndcY = 0) {
  if (!me.adminMode) return null;
  frameRay.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  frameRay.far = 60;
  const hit = frameRay.intersectObjects(showcase.map(sc => sc.back), false)[0];
  return hit ? hit.object.userData.weaponType : null;
}
function takeFromWall(type) {
  if (!type) return false;
  send({ t: 'giveWeapon', type });
  tone(1047, 0.1, 'triangle', 0.08);
  return true;
}
function nearAdminPanel() {
  return Math.hypot(me.pos.x - ADMIN_PANEL.x, me.pos.z - ADMIN_PANEL.z) <= ADMIN_PANEL.reach;
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
  // Say Cheese: stand in line facing the back wall
  if (me.cheeseSpot && inCamGame()) {
    me.pos.set(me.cheeseSpot[0], 0, me.cheeseSpot[1]);
    me.yaw = Math.PI; me.pitch = 0.32; me.velY = 0;
    me.lockUntil = performance.now() + 150;
  }
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
    a.body.dance = 0; a.body.partyGlow = 0;
    a.body.update(dt, me.moving, me.pitch, downed);
    a.body.root.visible = !hiddenForDisco(me.id);
    // you can still see yourself while cloaked, as a faint ghost
    const ghost = me.cloak > 0;
    a.body.mat.opacity = ghost ? 0.25 : 0.95;
    a.body.fillMat.opacity = ghost ? 0.02 : a.body.fillMat.opacity;
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
    a.body.dance = 0; a.body.partyGlow = 0;
    a.body.update(dt, a.data.moving, a.data.pitch, downed);
    a.body.root.visible = !a.cloaked && !hiddenForDisco(id);   // cloaked, or stepping aside for the Disco dancers
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
    fw.holder.rotation.x = landed || fw.special && ['heal', 'berserk', 'walls', 'bombs', 'lava', 'robots', 'cloak'].includes(WEAPONS[fw.type].kind) ? 0 : age * 6;
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
  const aimed = !touch.active ? frameAt() : null;
  for (const sc of showcase) {
    sc.holder.rotation.y = Math.sin(t * 0.6) * 0.6;
    animateWeaponMesh(sc.mesh, t);
    const hot = me.adminMode && (aimed === sc.id || touch.active);
    sc.back.material.emissive.setHex(hot ? (aimed === sc.id ? 0x2a4a2a : 0x101a10) : 0x000000);
  }

  // pickup prompt
  if (near && isFighter() && (!me.weapon || WEAPONS[near.type].instant) && snap.phase === 'fight' && me.hp > 0) {
    const d = WEAPONS[near.type];
    ui.prompt.innerHTML = `${touch.active ? 'Tap <b>GRAB</b>' : '<b>Left click</b> or <b>E</b>'} to pick up <b style="color:${hex(d.color)}">${d.special ? '★ ' : ''}${d.name}</b> · ${d.special ? d.desc : d.damage + ' dmg'}`;
    ui.prompt.style.display = 'block';
    buttons.btnGrab.classList.add('ready');
  } else if (nearAdminPanel() && !adminOpen) {
    ui.prompt.innerHTML = `${touch.active ? 'Tap <b>GRAB</b>' : 'Press <b>E</b> or <b>left click</b>'} to use the <b style="color:#ffd23c">ADMIN PANEL</b>`;
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
  // Say Cheese, next-game and gray pads light up when someone stands on them
  const animatePads = (meshes, list, glow) => meshes.forEach((pad, i) => {
    const p = list[i];
    const on = snap.players.some(pl => Math.hypot(pl.p[0] - p.x, pl.p[2] - p.z) <= p.r && pl.p[1] < 1);
    pad.pressed += ((on ? 1 : 0) - pad.pressed) * Math.min(1, dt * 10);
    pad.plate.position.y = 0.16 - pad.pressed * 0.07;
    pad.plateMat.emissiveIntensity = (glow ? 0.25 : 0.05) + pad.pressed * (glow ? 1.6 : 0.3);
    pad.light.intensity = glow ? pad.pressed * 12 : 0;
    pad.ring.scale.setScalar(1 + (on ? Math.sin(t * 6) * 0.04 : 0));
  });
  animatePads(cheesePads, ARENA.cheesePads, true);
  animatePads(nextPads, ARENA.nextPads, true);
  animatePads(grayPads, ARENA.grayPads, false);
  // Lobby vs. active game: pads, corner signs and floor tints only show in the lobby (and during
  // the countdown so people can still hop on). During a game the room outline takes the game's color.
  const lobbyLook = snap.phase === 'lobby' || snap.phase === 'countdown';
  if (snap.mode !== 'disco' || lobbyLook) scene.background.setHex(0x05060a);
  for (const pad of [...pads, ...cheesePads, ...nextPads, ...grayPads]) pad.group.visible = lobbyLook;
  pvpSign.visible = cheeseSign.visible = discoSign.visible = pvpFloor.visible = cheeseFloor.visible = nextFloor.visible = lobbyLook;
  if (roomEdges && snap.mode !== 'disco') roomEdges.material.color.setHex(lobbyLook ? 0xff3df2 : snap.mode === 'cheese' ? 0xffd400 : 0xff3030);
  // hatches glow when weapons are dropping
  hatchFlash = Math.max(0, hatchFlash - dt * 0.8);
  const fighting = snap.phase === 'fight';
  for (const h of hatches) h.material.color.setHex(fighting ? (hatchFlash > 0.5 && Math.floor(t * 8) % 2 ? 0xffaa00 : 0x663300) : 0x221100);
}

function inCamGame() {
  return (snap.mode === 'cheese' && (snap.phase === 'cheese' || snap.phase === 'over'))
    || (snap.mode === 'disco' && (snap.phase === 'disco' || snap.phase === 'over'));
}
function updateCamera(dt) {
  // Dance Dance Disco: look at the line of dancers from the front
  if (me.cheeseSpot && snap.mode === 'disco' && (snap.phase === 'disco' || snap.phase === 'over')) {
    camera.position.set(0 + (shake > 0 ? (Math.random() - 0.5) * shake : 0), 4 + (shake > 0 ? (Math.random() - 0.5) * shake : 0), 11.5);
    camera.lookAt(0, 2, -2);
    shake = Math.max(0, shake - dt * 1.5);
    return;
  }
  // Say Cheese: fixed view from behind and above the line of players, looking at the back wall
  if (me.cheeseSpot && snap.mode === 'cheese' && (snap.phase === 'cheese' || snap.phase === 'over')) {
    camera.position.set(0, 4.5, 3.5);
    camera.lookAt(0.5, 9, HALF);
    return;
  }
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
    ui.wInfo.textContent = snap.phase === 'fight' && isFighter() ? (touch.active ? 'Walk to a weapon and tap GRAB' : 'Walk to a weapon and left click (or E)') : 'Weapons drop when the fight starts';
  }
  ui.pips.innerHTML = Array.from({ length: me.weapon ? usesOf(me.weapon) : USES_PER_WEAPON }, (_, i) => `<div class="pip ${i < me.uses ? 'on' : ''}"></div>`).join('');

  // status line
  const occupied = snap.pads.filter(Boolean).length;
  let status = '';
  if (snap.phase === 'lobby') {
    const others = snap.players.length - 1;
    status = others < 1 ? 'Waiting for a second player to join… (share this link!)'
      : `4xPVP: stand on a green pad in the northwest corner · ${occupied}/${ARENA.pads.length} pressed`;
    const cheeseOn = ARENA.cheesePads.filter(p => snap.players.some(pl => Math.hypot(pl.p[0] - p.x, pl.p[2] - p.z) <= p.r && pl.p[1] < 1)).length;
    if (onCheesePad(me.pos.x, me.pos.z, me.pos.y) || cheeseOn) status = `🧀 Say Cheese: stand on a yellow pad · ${cheeseOn}/${ARENA.cheesePads.length} pressed`;
    if (onPadList(ARENA.nextPads, me.pos.x, me.pos.z, me.pos.y)) status = '🪩 Dance Dance Disco: stand on a blue pad (2-4 dancers)';
    if (onPadList(ARENA.grayPads, me.pos.x, me.pos.z, me.pos.y)) status = 'These gray pads aren\'t used yet';
  } else if (snap.phase === 'countdown' && snap.mode === 'disco') status = isFighter() ? '🪩 Dance Dance Disco is starting — warm up!' : '🪩 Disco starting — hop on a free blue pad to join!';
  else if (snap.phase === 'disco') status = inDiscoGame() ? '🪩 Dance Dance Disco' : '🪩 Watching Dance Dance Disco';
  else if (snap.phase === 'countdown') status = snap.mode === 'cheese'
    ? (isFighter() ? '🧀 Say Cheese is starting — get your face ready!' : '🧀 Say Cheese starting — hop on a free yellow pad to join!')
    : (isFighter() ? 'Get ready!' : 'Battle starting — jump on a free pad to join!');
  else if (snap.phase === 'cheese') status = inCheeseGame() ? `🧀 Say Cheese · round ${snap.cheese?.round || 0}` : '🧀 Watching Say Cheese — look at the back wall!';
  else if (snap.phase === 'fight') {
    const alive = snap.fighters.filter(id => (snap.players.find(p => p.id === id)?.hp ?? 0) > 0).length;
    status = !isFighter() ? 'Spectating the match'
      : me.hp <= 0 ? `You're out — spectating · ${alive} left`
      : `Fight! ${alive} fighters left`;
  }
  if (snap.wallsLeft > 0) status += ` · 🧱 Maze: ${Math.ceil(snap.wallsLeft / 1000)}s`;
  if (snap.lava) status += snap.lava.age < LAVA.warnMs ? ' · 🌋 LAVA INCOMING!' : ` · 🌋 Lava: ${Math.ceil((LAVA.warnMs + LAVA.ms - snap.lava.age) / 1000)}s`;
  if ((snap.robots || []).length) status += ` · 🤖 ${snap.robots.length} robots`;
  if (me.adminMode) status = `🛠️ ADMIN MODE — ${touch.active ? 'tap' : 'aim at and click'} any weapon on the weapon wall · ` + status;
  if (me.cloak > 0) status = `👻 INVISIBLE ${Math.ceil(me.cloak / 1000)}s · ` + status;
  if (me.inv > 0) status = `🌈 INVINCIBLE ${Math.ceil(me.inv / 1000)}s — run into your enemy! · ` + status;
  else if (snap.phase === 'over') status = 'Match over — back to the lobby soon';
  ui.status.textContent = status;

  // fighter health bars
  const cheeseOn = (snap.mode === 'cheese' || snap.mode === 'disco') && snap.phase !== 'lobby';
  document.getElementById('me').style.display = cheeseOn && (inCheeseGame() || inDiscoGame()) ? 'none' : '';
  document.getElementById('weapon').style.display = cheeseOn ? 'none' : '';
  if (!cheeseOn && (snap.phase === 'fight' || snap.phase === 'over' || snap.phase === 'countdown')) {
    ui.fighters.style.display = 'flex';
    ui.fighters.classList.toggle('many', snap.fighters.length > 2);
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
    if (id === me.id || a.cloaked || danceView.style.display === 'block') { a.label.style.display = 'none'; continue; }
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

  const onLava = snap.lava && snap.lava.age >= LAVA.warnMs && me.pos.y < 0.4 && lavaAt(me.pos.x, me.pos.z) && me.hp > 0;
  if (onLava) ui.vignette.style.boxShadow = `inset 0 0 ${150 + Math.sin(clock.t * 10) * 30}px rgba(255,90,0,0.6)`;
  else if (ui.vignette.dataset.lava) ui.vignette.style.boxShadow = 'inset 0 0 160px rgba(255,0,0,0)';
  ui.vignette.dataset.lava = onLava ? '1' : '';
  ui.crosshair.style.display = inCamGame() && me.cheeseSpot ? 'none' : '';
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
  adminPanel.light.intensity = 3 + Math.sin(clock.t * 3) * 1.5;
  adminPanel.floorMark.material.opacity = nearAdminPanel() ? 0.6 : 0.25;
  updateFx(dt);
  updateHoming();
  updateBombs(clock.t);
  updateLava(clock.t);
  updateRobots(dt, clock.t);
  updateCheese(dt, clock.t);
  updateDisco(dt, clock.t);
  updatePadPanel();
  updateCamera(dt);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

connect();
frame();

// expose a little for debugging / automated tests
window.__dp = { me, snap: () => snap, avatars, floorWeapons, send, scene, camera, THREE, test: { updateLocal, updateWalls, touch, wallMeshes } };
