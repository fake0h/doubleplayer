// Low-poly models for every weapon. Each model is built pointing along +Y with the grip at the origin.
import * as THREE from 'three';
import { WEAPONS } from '/shared/weapons.js';

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2, emissive: color, emissiveIntensity: 0.3, ...opts }));
  }
  return matCache.get(key);
}
const glow = (color) => mat(color, { emissive: color, emissiveIntensity: 1.2 });

function part(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

const HANDLE_DARK = 0x2a2a2a;
const WOOD = 0x8b5a2b;
const STEEL = 0xc8ccd2;

// A gun: grip at origin, body/barrel extending along +Y
function gun({ len, color, barrel = 0.035, bodyW = 0.09, extra }) {
  const g = new THREE.Group();
  g.add(part(box(0.06, 0.16, 0.12), mat(HANDLE_DARK), 0, -0.02, 0.06, 0.3));     // grip
  g.add(part(box(bodyW, len * 0.5, 0.12), mat(color), 0, len * 0.25, -0.02));    // body
  g.add(part(cyl(barrel, barrel, len * 0.6), mat(0x222222, { metalness: 0.7 }), 0, len * 0.7, -0.03));
  if (extra) extra(g);
  return g;
}

const BUILDERS = {
  pool_noodle: (c) => {
    const g = new THREE.Group();
    const n = part(cyl(0.07, 0.07, 1.5, 12), mat(c), 0, 0.7, 0);
    const hole = part(cyl(0.025, 0.025, 1.52, 8), mat(0x111111), 0, 0.7, 0);
    g.add(n, hole);
    return g;
  },
  water_pistol: (c) => gun({ len: 0.4, color: c, bodyW: 0.12, extra: (g) => {
    g.add(part(new THREE.SphereGeometry(0.09, 10, 8), mat(0xffd000, { transparent: true, opacity: 0.8 }), 0, 0.18, 0.08));
  } }),
  rubber_chicken: (c) => {
    const g = new THREE.Group();
    const body = part(new THREE.SphereGeometry(0.12, 10, 8), mat(c), 0, 0.45, 0);
    body.scale.set(1, 1.6, 1);
    g.add(part(cyl(0.025, 0.04, 0.3), mat(c), 0, 0.12, 0));                // neck/legs as handle
    g.add(body);
    g.add(part(new THREE.SphereGeometry(0.08, 8, 6), mat(c), 0, 0.72, 0));
    g.add(part(new THREE.ConeGeometry(0.03, 0.1, 6), mat(0xff7a00), 0, 0.72, -0.1, -Math.PI / 2));
    g.add(part(box(0.02, 0.07, 0.07), mat(0xff2a2a), 0, 0.8, 0));
    return g;
  },
  foam_bat: (c) => {
    const g = new THREE.Group();
    g.add(part(cyl(0.035, 0.035, 0.3), mat(HANDLE_DARK), 0, 0.1, 0));
    g.add(part(cyl(0.1, 0.05, 0.85, 12), mat(c), 0, 0.65, 0));
    return g;
  },
  baguette: (c) => {
    const g = new THREE.Group();
    const b = part(new THREE.CapsuleGeometry(0.06, 0.9, 4, 10), mat(c), 0, 0.45, 0);
    b.scale.set(1.2, 1, 1);
    g.add(b);
    for (let i = 0; i < 4; i++) g.add(part(box(0.09, 0.02, 0.03), mat(0xf3d9a4), 0, 0.2 + i * 0.2, -0.065, 0, 0, 0.5));
    return g;
  },
  dead_fish: (c) => {
    const g = new THREE.Group();
    const body = part(new THREE.SphereGeometry(0.12, 10, 8), mat(c, { metalness: 0.6 }), 0, 0.45, 0);
    body.scale.set(0.5, 2.6, 1);
    g.add(body);
    g.add(part(new THREE.ConeGeometry(0.12, 0.18, 4), mat(c), 0, 0.08, 0, Math.PI));
    g.add(part(new THREE.SphereGeometry(0.02, 6, 4), mat(0x000000), 0.05, 0.7, -0.05));
    return g;
  },
  tennis_racket: (c) => {
    const g = new THREE.Group();
    g.add(part(cyl(0.025, 0.025, 0.4), mat(HANDLE_DARK), 0, 0.15, 0));
    const ring = part(new THREE.TorusGeometry(0.16, 0.018, 6, 20), mat(c), 0, 0.55, 0);
    ring.scale.set(1, 1.3, 1);
    g.add(ring);
    const net = part(new THREE.CircleGeometry(0.155, 16), mat(0xffffff, { wireframe: true }), 0, 0.55, 0);
    net.scale.set(1, 1.3, 1);
    g.add(net);
    return g;
  },
  umbrella: (c) => {
    const g = new THREE.Group();
    g.add(part(new THREE.TorusGeometry(0.06, 0.015, 6, 12, Math.PI), mat(HANDLE_DARK), 0.06, 0, 0, 0, 0, Math.PI));
    g.add(part(cyl(0.015, 0.015, 1.0), mat(0x333333), 0, 0.5, 0));
    g.add(part(new THREE.ConeGeometry(0.12, 0.6, 8), mat(c), 0, 0.75, 0));
    return g;
  },
  frying_pan: (c) => {
    const g = new THREE.Group();
    g.add(part(cyl(0.025, 0.03, 0.4), mat(HANDLE_DARK), 0, 0.2, 0));
    g.add(part(cyl(0.22, 0.2, 0.05, 20), mat(c, { metalness: 0.8, roughness: 0.3 }), 0, 0.62, 0, Math.PI / 2));
    return g;
  },
  boomerang: (c) => {
    const g = new THREE.Group();
    g.add(part(box(0.08, 0.5, 0.025), mat(c), -0.08, 0.2, 0, 0, 0, 0.5));
    g.add(part(box(0.08, 0.5, 0.025), mat(c), 0.08, 0.2, 0, 0, 0, -0.5));
    return g;
  },
  throwing_knives: (c) => {
    const g = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      const k = new THREE.Group();
      k.add(part(cyl(0.015, 0.015, 0.12), mat(HANDLE_DARK), 0, 0.06, 0));
      k.add(part(new THREE.ConeGeometry(0.03, 0.22, 4), mat(c, { metalness: 0.9 }), 0, 0.23, 0));
      k.rotation.z = i * 0.35;
      g.add(k);
    }
    return g;
  },
  hockey_stick: (c) => {
    const g = new THREE.Group();
    g.add(part(box(0.04, 1.3, 0.03), mat(c), 0, 0.55, 0));
    g.add(part(box(0.3, 0.07, 0.03), mat(0x111111), 0.12, 1.2, 0));
    return g;
  },
  baseball_bat: (c) => {
    const g = new THREE.Group();
    g.add(part(cyl(0.025, 0.025, 0.3), mat(HANDLE_DARK), 0, 0.1, 0));
    g.add(part(cyl(0.055, 0.025, 0.8, 12), mat(c), 0, 0.6, 0));
    return g;
  },
  crowbar: (c) => {
    const g = new THREE.Group();
    g.add(part(cyl(0.02, 0.02, 0.9, 8), mat(c, { metalness: 0.7 }), 0, 0.45, 0));
    g.add(part(new THREE.TorusGeometry(0.07, 0.02, 6, 10, Math.PI), mat(c, { metalness: 0.7 }), -0.07, 0.9, 0));
    return g;
  },
  pistol: (c) => gun({ len: 0.32, color: c }),
  trident: (c) => {
    const g = new THREE.Group();
    g.add(part(cyl(0.022, 0.022, 1.5), mat(c, { metalness: 0.6 }), 0, 0.6, 0));
    g.add(part(box(0.3, 0.03, 0.03), mat(c, { metalness: 0.6 }), 0, 1.35, 0));
    for (const x of [-0.14, 0, 0.14]) g.add(part(new THREE.ConeGeometry(0.03, 0.3, 6), mat(c, { metalness: 0.6 }), x, 1.5, 0));
    return g;
  },
  katana: (c) => {
    const g = new THREE.Group();
    g.add(part(cyl(0.025, 0.025, 0.28), mat(0x1a1a40), 0, 0.12, 0));
    g.add(part(cyl(0.07, 0.07, 0.02, 12), mat(0xc9a227), 0, 0.27, 0));
    g.add(part(box(0.05, 1.0, 0.012), mat(c, { metalness: 0.95, roughness: 0.15 }), 0, 0.78, 0, 0, 0, 0.04));
    return g;
  },
  crossbow: (c) => {
    const g = gun({ len: 0.55, color: c, bodyW: 0.06 });
    const bow = part(new THREE.TorusGeometry(0.28, 0.02, 6, 16, Math.PI * 0.8), mat(0x333333), 0, 0.55, 0, 0, 0, Math.PI * 0.1);
    g.add(bow);
    g.add(part(cyl(0.008, 0.008, 0.6), mat(STEEL), 0, 0.6, -0.08));
    return g;
  },
  flamethrower: (c) => gun({ len: 0.75, color: c, barrel: 0.05, bodyW: 0.12, extra: (g) => {
    g.add(part(cyl(0.08, 0.08, 0.35, 10), mat(0xb02020), 0, 0.2, 0.14));
    g.add(part(new THREE.ConeGeometry(0.035, 0.08, 6), glow(0x3fa9ff), 0, 1.0, -0.03));
  } }),
  battle_axe: (c) => {
    const g = new THREE.Group();
    g.add(part(cyl(0.025, 0.03, 1.1), mat(WOOD), 0, 0.5, 0));
    const blade = new THREE.Shape();
    blade.moveTo(0, -0.12); blade.quadraticCurveTo(0.35, -0.3, 0.3, 0); blade.quadraticCurveTo(0.35, 0.3, 0, 0.12);
    const geo = new THREE.ExtrudeGeometry(blade, { depth: 0.02, bevelEnabled: false });
    for (const s of [1, -1]) {
      const b = new THREE.Mesh(geo, mat(c, { metalness: 0.85, roughness: 0.25 }));
      b.position.set(0, 0.95, -0.01);
      b.scale.x = s;
      g.add(b);
    }
    return g;
  },
  flaming_sword: (c) => {
    const g = new THREE.Group();
    g.add(part(cyl(0.025, 0.025, 0.25), mat(0x3b1f0f), 0, 0.1, 0));
    g.add(part(box(0.26, 0.04, 0.05), mat(0xc9a227), 0, 0.24, 0));
    g.add(part(box(0.07, 0.95, 0.015), mat(0xffd2a0, { emissive: 0xff5000, emissiveIntensity: 0.8 }), 0, 0.72, 0));
    const flames = new THREE.Group();
    flames.userData.flames = true;
    for (let i = 0; i < 9; i++) {
      const f = part(new THREE.ConeGeometry(0.06, 0.22, 5), glow(i % 2 ? 0xff7a00 : 0xffd000), 0, 0.3 + i * 0.1, 0);
      f.material = f.material.clone();
      f.material.transparent = true; f.material.opacity = 0.75;
      flames.add(f);
    }
    g.add(flames);
    return g;
  },
  shotgun: (c) => gun({ len: 0.85, color: c, barrel: 0.04, extra: (g) => {
    g.add(part(cyl(0.04, 0.04, 0.5), mat(0x222222, { metalness: 0.7 }), 0.06, 0.65, -0.03));
    g.add(part(box(0.08, 0.25, 0.14), mat(WOOD), 0, -0.12, 0.1, 0.4));
  } }),
  warhammer: (c) => {
    const g = new THREE.Group();
    g.add(part(cyl(0.03, 0.03, 1.1), mat(0x3b2a1a), 0, 0.5, 0));
    g.add(part(box(0.45, 0.2, 0.2), mat(c, { metalness: 0.7 }), 0, 1.1, 0));
    return g;
  },
  plasma_blade: (c) => {
    const g = new THREE.Group();
    g.add(part(cyl(0.035, 0.035, 0.3, 12), mat(0x999999, { metalness: 0.9 }), 0, 0.1, 0));
    const blade = part(cyl(0.03, 0.03, 1.0, 10), glow(c), 0, 0.75, 0);
    g.add(blade);
    g.add(part(cyl(0.05, 0.05, 1.02, 10), mat(c, { emissive: c, transparent: true, opacity: 0.25 }), 0, 0.75, 0));
    return g;
  },
  chainsaw: (c) => {
    const g = new THREE.Group();
    g.add(part(box(0.18, 0.3, 0.28), mat(c), 0, 0.12, 0));
    g.add(part(new THREE.TorusGeometry(0.08, 0.015, 6, 10, Math.PI), mat(HANDLE_DARK), 0, 0.27, 0.06, 0, Math.PI / 2));
    const bar = part(box(0.04, 0.75, 0.1), mat(STEEL, { metalness: 0.8 }), 0, 0.6, -0.05);
    g.add(bar);
    const chain = part(box(0.05, 0.78, 0.12), mat(0x333333, { wireframe: true }), 0, 0.6, -0.05);
    chain.userData.chain = true;
    g.add(chain);
    return g;
  },
  sniper_rifle: (c) => gun({ len: 1.2, color: c, barrel: 0.025, bodyW: 0.07, extra: (g) => {
    g.add(part(cyl(0.035, 0.035, 0.3), mat(0x111111), 0, 0.35, -0.1));
    g.add(part(box(0.06, 0.3, 0.14), mat(c), 0, -0.15, 0.08, 0.3));
  } }),
  rocket_launcher: (c) => {
    const g = new THREE.Group();
    g.add(part(box(0.06, 0.15, 0.1), mat(HANDLE_DARK), 0, -0.02, 0.1, 0.3));
    g.add(part(cyl(0.09, 0.09, 1.1, 12), mat(c), 0, 0.35, -0.05));
    g.add(part(new THREE.ConeGeometry(0.08, 0.2, 10), mat(0xd42a2a), 0, 0.98, -0.05));
    return g;
  },
};

export function buildWeaponMesh(type) {
  const def = WEAPONS[type];
  const build = BUILDERS[type];
  const mesh = build ? build(def.color) : new THREE.Mesh(box(0.1, 1, 0.1), mat(0xffffff));
  mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
  mesh.userData.type = type;
  return mesh;
}

// Per-frame cosmetic animation (flames flicker, chainsaw chain buzzes)
export function animateWeaponMesh(mesh, t) {
  mesh.traverse(o => {
    if (o.userData.flames) {
      o.children.forEach((f, i) => {
        const s = 0.7 + Math.sin(t * 20 + i * 1.7) * 0.3;
        f.scale.set(s, 0.8 + Math.sin(t * 15 + i) * 0.4, s);
        f.position.x = Math.sin(t * 13 + i * 2) * 0.03;
      });
    }
    if (o.userData.chain) o.position.z = -0.05 + Math.sin(t * 80) * 0.01;
  });
}
