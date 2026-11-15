// Steam Tunnels: builds the wireframe tunnel maze (tall, narrow tunnels with pipes along one side),
// the ladder down, caged lamps, steam vents, and the hidden painting.
import * as THREE from 'three';
import { TUNNELS, DIRS, cellCenter } from '/shared/tunnels.js';

const COL = { wall: 0x34c6ff, floor: 0x1b6b88, rib: 0x58d8ff, copper: 0xff8a3c, steel: 0xc8d6e0, lamp: 0xffc060 };

function rng(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// an original oil painting: a domed, columned rotunda on a green lawn at sunset
function paintingTexture() {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, '#2b3a78'); sky.addColorStop(0.55, '#e57f4a'); sky.addColorStop(1, '#ffd38a');
  x.fillStyle = sky; x.fillRect(0, 0, 640, 320);
  // brushy clouds
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(255,${180 + Math.random() * 60},${150 + Math.random() * 60},${0.15 + Math.random() * 0.2})`;
    x.beginPath(); x.ellipse(Math.random() * 640, 40 + Math.random() * 160, 30 + Math.random() * 60, 6 + Math.random() * 10, 0, 0, Math.PI * 2); x.fill();
  }
  // lawn
  const lawn = x.createLinearGradient(0, 300, 0, 480);
  lawn.addColorStop(0, '#4f8a3a'); lawn.addColorStop(1, '#1f4a1c');
  x.fillStyle = lawn; x.fillRect(0, 300, 640, 180);
  // trees
  for (const [tx, s] of [[60, 1], [130, 0.8], [520, 0.9], [590, 1.1]]) {
    x.fillStyle = '#3a2614'; x.fillRect(tx - 5 * s, 260, 10 * s, 60 * s);
    x.fillStyle = '#2f5a24'; x.beginPath(); x.arc(tx, 250, 42 * s, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(120,170,60,0.5)'; x.beginPath(); x.arc(tx - 12 * s, 238, 22 * s, 0, Math.PI * 2); x.fill();
  }
  // the rotunda: steps, columns, pediment, drum and dome
  const cx = 320;
  x.fillStyle = '#d9cbb4'; x.fillRect(cx - 140, 300, 280, 14); x.fillRect(cx - 130, 290, 260, 12);
  x.fillStyle = '#b5523a'; x.fillRect(cx - 120, 180, 240, 110);                         // brick
  x.fillStyle = '#f2ece0';
  for (let k = 0; k < 6; k++) x.fillRect(cx - 100 + k * 38, 190, 14, 100);              // columns
  x.beginPath(); x.moveTo(cx - 125, 190); x.lineTo(cx, 140); x.lineTo(cx + 125, 190); x.closePath(); x.fill();
  x.fillStyle = '#e8dfcc'; x.fillRect(cx - 95, 118, 190, 30);                             // drum
  x.beginPath(); x.ellipse(cx, 120, 95, 75, 0, Math.PI, 0); x.fill();                     // dome
  x.strokeStyle = 'rgba(120,100,80,0.5)'; x.lineWidth = 2;
  for (let k = 1; k < 5; k++) { x.beginPath(); x.ellipse(cx, 120, 95 * k / 5, 75, 0, Math.PI, 0); x.stroke(); }
  // a few painterly strokes on top
  for (let i = 0; i < 300; i++) {
    x.strokeStyle = `rgba(${200 + Math.random() * 55},${150 + Math.random() * 90},${90 + Math.random() * 90},0.08)`;
    x.lineWidth = 3 + Math.random() * 4;
    const px = Math.random() * 640, py = Math.random() * 480;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + 10 + Math.random() * 20, py + (Math.random() - 0.5) * 6); x.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildTunnels(maze) {
  const g = new THREE.Group();
  const { width: W, height: Ht, cell: C, cols, rows } = TUNNELS;
  const hw = W / 2, hc = C / 2;
  const tris = [];
  const L = { wall: [], floor: [], rib: [], copper: [], steel: [] };
  const P = (cx, cz, u, v, s, t, y) => [cx + u[0] * s + v[0] * t, y, cz + u[1] * s + v[1] * t];
  const quad = (a, b, c, d) => tris.push(...a, ...b, ...c, ...a, ...c, ...d);
  const line = (k, a, b) => L[k].push(...a, ...b);
  const rand = rng(maze.seed + 7);
  const vents = [];
  // a pipe as a 6-sided wireframe tube from a to b (axis-aligned), rings every so often
  const pipe = (k, a, b, r) => {
    const ax = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = ax.length(); if (len < 0.05) return;
    ax.normalize();
    const n1 = Math.abs(ax.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const n2 = new THREE.Vector3().crossVectors(ax, n1).normalize();
    n1.crossVectors(n2, ax).normalize();
    const pt = (s, ang) => [a[0] + ax.x * s + (n1.x * Math.cos(ang) + n2.x * Math.sin(ang)) * r, a[1] + ax.y * s + (n1.y * Math.cos(ang) + n2.y * Math.sin(ang)) * r, a[2] + ax.z * s + (n1.z * Math.cos(ang) + n2.z * Math.sin(ang)) * r];
    for (let q = 0; q < 6; q++) line(k, pt(0, q * Math.PI / 3), pt(len, q * Math.PI / 3));
    const rings = Math.max(1, Math.round(len / 1.27));
    for (let i = 0; i <= rings; i++) {
      const s = len * i / rings;
      for (let q = 0; q < 6; q++) line(k, pt(s, q * Math.PI / 3), pt(s, (q + 1) * Math.PI / 3));
    }
  };
  // pipes always run along the same wall: the +z wall for east-west tunnels, the +x wall for north-south ones
  const PIPES = [{ y: 2.75, r: 0.12, k: 'copper' }, { y: 3.12, r: 0.08, k: 'steel' }, { y: 0.45, r: 0.17, k: 'copper' }];
  const pipeRun = (cx, cz, axis, s0, s1, skipLow) => {
    for (const p of PIPES) {
      if (skipLow && p.y < 1) continue;
      const off = hw - p.r - 0.06;
      const a = axis === 0 ? [cx + s0, p.y, cz + off] : [cx + off, p.y, cz + s0];
      const b = axis === 0 ? [cx + s1, p.y, cz + off] : [cx + off, p.y, cz + s1];
      pipe(p.k, a, b, p.r);
    }
  };

  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const { x: cx, z: cz } = cellCenter(i, j);
    const open = maze.open[maze.idx(i, j)];
    // middle square: floor, ceiling, corner edges
    quad([cx - hw, 0, cz - hw], [cx + hw, 0, cz - hw], [cx + hw, 0, cz + hw], [cx - hw, 0, cz + hw]);
    quad([cx - hw, Ht, cz - hw], [cx + hw, Ht, cz - hw], [cx + hw, Ht, cz + hw], [cx - hw, Ht, cz + hw]);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) line('wall', [cx + sx * hw, 0, cz + sz * hw], [cx + sx * hw, Ht, cz + sz * hw]);
    for (let d = 0; d < 4; d++) {
      const u = DIRS[d], v = [-u[1], u[0]];
      if (open[d]) {
        // tunnel arm out to the edge of the cell (the neighbor builds the other half)
        quad(P(cx, cz, u, v, hw, -hw, 0), P(cx, cz, u, v, hc, -hw, 0), P(cx, cz, u, v, hc, hw, 0), P(cx, cz, u, v, hw, hw, 0));
        quad(P(cx, cz, u, v, hw, -hw, Ht), P(cx, cz, u, v, hc, -hw, Ht), P(cx, cz, u, v, hc, hw, Ht), P(cx, cz, u, v, hw, hw, Ht));
        for (const t of [-hw, hw]) {
          quad(P(cx, cz, u, v, hw, t, 0), P(cx, cz, u, v, hc, t, 0), P(cx, cz, u, v, hc, t, Ht), P(cx, cz, u, v, hw, t, Ht));
          line('wall', P(cx, cz, u, v, hw, t, 0), P(cx, cz, u, v, hc, t, 0));
          line('wall', P(cx, cz, u, v, hw, t, Ht), P(cx, cz, u, v, hc, t, Ht));
          line('floor', P(cx, cz, u, v, hw, t, 1.2), P(cx, cz, u, v, hc, t, 1.2));
        }
        // ribs (concrete arches) and floor grating lines
        for (let s = hc; s > hw + 0.3; s -= 2.54) {
          line('rib', P(cx, cz, u, v, s, -hw, 0), P(cx, cz, u, v, s, -hw, Ht));
          line('rib', P(cx, cz, u, v, s, hw, 0), P(cx, cz, u, v, s, hw, Ht));
          line('rib', P(cx, cz, u, v, s, -hw, Ht), P(cx, cz, u, v, s, hw, Ht));
          line('floor', P(cx, cz, u, v, s - 1.27, -hw, 0.01), P(cx, cz, u, v, s - 1.27, hw, 0.01));
        }
        line('floor', P(cx, cz, u, v, hw, 0, 0.01), P(cx, cz, u, v, hc, 0, 0.01));
        // pipes along this arm
        const axis = d % 2, sgn = d < 2 ? 1 : -1;
        pipeRun(cx, cz, axis, sgn * hw, sgn * hc, false);
        if (rand() < 0.12) vents.push(new THREE.Vector3(...P(cx, cz, u, v, (hw + hc) / 2, 0, 0)).setY(2.75).add(new THREE.Vector3(axis === 0 ? 0 : hw - 0.3, 0, axis === 0 ? hw - 0.3 : 0)));
      } else {
        // dead end / side wall
        const a = P(cx, cz, u, v, hw, -hw, 0), b = P(cx, cz, u, v, hw, hw, 0);
        quad(a, b, [b[0], Ht, b[2]], [a[0], Ht, a[2]]);
        line('wall', a, b); line('wall', [a[0], Ht, a[2]], [b[0], Ht, b[2]]);
        for (let y = 0.6; y < Ht; y += 0.6) line('floor', [a[0], y, a[2]], [b[0], y, b[2]]);
      }
    }
    // pipes across the middle square on each axis that has a tunnel
    if (open[0] || open[2]) pipeRun(cx, cz, 0, open[2] ? -hw : -hw + 0.3, open[0] ? hw : hw - 0.3, open[1]);
    if (open[1] || open[3]) pipeRun(cx, cz, 1, open[3] ? -hw : -hw + 0.3, open[1] ? hw : hw - 0.3, open[0]);
  }

  const solidGeo = new THREE.BufferGeometry();
  solidGeo.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  const solidMat = new THREE.MeshBasicMaterial({ color: 0x04070b, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  g.add(new THREE.Mesh(solidGeo, solidMat));
  const OP = { wall: 0.85, floor: 0.45, rib: 0.6, copper: 0.95, steel: 0.8 };
  for (const k of Object.keys(L)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(L[k], 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COL[k === 'copper' ? 'copper' : k === 'steel' ? 'steel' : k], transparent: true, opacity: OP[k] })));
  }

  // caged lamps on the ceiling of every junction
  const bulbGeo = new THREE.SphereGeometry(0.09, 8, 6), cageGeo = new THREE.SphereGeometry(0.16, 6, 4);
  const bulbMat = new THREE.MeshBasicMaterial({ color: COL.lamp }), cageMat = new THREE.MeshBasicMaterial({ color: 0x8a7a50, wireframe: true });
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (rand() < 0.3) continue;            // some are burnt out
    const { x: cx, z: cz } = cellCenter(i, j);
    const b = new THREE.Mesh(bulbGeo, bulbMat); b.position.set(cx, Ht - 0.25, cz);
    const c = new THREE.Mesh(cageGeo, cageMat); c.position.copy(b.position);
    g.add(b, c);
  }

  // the ladder you climbed down, under a manhole
  {
    const s = maze.start, lad = [];
    const back = maze.open[maze.idx(s.i, s.j)].findIndex(o => !o);
    const bd = back >= 0 ? DIRS[back] : [0, 1];
    const lx = s.x + bd[0] * (hw - 0.15), lz = s.z + bd[1] * (hw - 0.15), side = [-bd[1], bd[0]];
    for (const t of [-0.25, 0.25]) lad.push(lx + side[0] * t, 0, lz + side[1] * t, lx + side[0] * t, Ht, lz + side[1] * t);
    for (let y = 0.3; y < Ht; y += 0.35) lad.push(lx - side[0] * 0.25, y, lz - side[1] * 0.25, lx + side[0] * 0.25, y, lz + side[1] * 0.25);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(lad, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffd400 })));
    const hole = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 20), new THREE.MeshBasicMaterial({ color: 0xffd400, side: THREE.DoubleSide }));
    hole.rotation.x = Math.PI / 2; hole.position.set(lx - bd[0] * 0.35, Ht - 0.02, lz - bd[1] * 0.35);
    const sky = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, side: THREE.DoubleSide }));
    sky.rotation.x = Math.PI / 2; sky.position.copy(hole.position).setY(Ht - 0.01);
    g.add(hole, sky);
  }

  // the hidden painting
  const pm = maze.painting;
  const painting = new THREE.Group();
  painting.position.set(pm.x, 1.75, pm.z);
  painting.rotation.y = Math.atan2(DIRS[pm.facing][0], DIRS[pm.facing][1]);
  const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ map: paintingTexture() }));
  canvasMesh.position.z = 0.06;
  // carved gold frame: outer and inner edges with bevel lines at the corners
  const frameMat = new THREE.LineBasicMaterial({ color: 0xffc23c });
  const frame = new THREE.Group();
  frame.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.9, 1.5, 0.12)), frameMat));
  frame.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.66, 1.26, 0.14)), frameMat));
  const bev = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bev.push(sx * 0.95, sy * 0.75, 0.06, sx * 0.83, sy * 0.63, 0.07);
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bev, 3));
  frame.add(new THREE.LineSegments(bg, frameMat));

  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.22, 0.18, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc23c, wireframe: true }));
  lamp.position.set(0, 0.95, 0.3);
  painting.add(frame, canvasMesh, lamp);
  g.add(painting);

  // steam puffs drifting up from a few leaky pipes
  const puffGeo = new THREE.SphereGeometry(1, 7, 5);
  const puffs = [];
  for (const v of vents) for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xe8f4ff, wireframe: true, transparent: true, opacity: 0 }));
    m.userData = { base: v, t: k / 4 };
    g.add(m); puffs.push(m);
  }

  return {
    group: g, painting, vents,
    update(dt, t) {
      frameMat.color.setHSL(0.11, 1, 0.55 + Math.sin(t * 2.5) * 0.1);   // the gold frame gleams
      for (const m of puffs) {
        const d = m.userData;
        d.t = (d.t + dt * 0.45) % 1;
        m.position.copy(d.base).add(new THREE.Vector3(Math.sin(d.t * 9) * 0.1, d.t * 0.9, Math.cos(d.t * 7) * 0.1));
        m.scale.setScalar(0.08 + d.t * 0.35);
        m.material.opacity = 0.5 * (1 - d.t);
      }
    },
    dispose() { g.parent?.remove(g); g.traverse(o => { o.geometry?.dispose?.(); if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } }); },
  };
}
