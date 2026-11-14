// Double Player — game server
// Serves the static client and runs the shared match over WebSockets.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  WEAPONS, USES_PER_WEAPON, MAX_HEALTH, ARENA, FALL_MS, randomWeaponType,
} from './shared/weapons.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ---------- static files ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const ROUTES = [
  ['/shared/', path.join(__dirname, 'shared')],
  ['/vendor/three/', path.join(__dirname, 'node_modules', 'three', 'build')],
  ['/', path.join(__dirname, 'public')],
];

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/health') { res.writeHead(200); return res.end('ok'); }
  for (const [prefix, dir] of ROUTES) {
    if (!urlPath.startsWith(prefix)) continue;
    const file = path.normalize(path.join(dir, urlPath.slice(prefix.length)));
    if (!file.startsWith(dir)) break; // path traversal guard
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
    return;
  }
  res.writeHead(404); res.end('Not found');
});

// ---------- game state ----------
const COLORS = [0x00e5ff, 0xff3df2, 0x7dff3d, 0xffb300, 0xff4040, 0xb388ff, 0x40ffd0, 0xffffff];
const NAMES = ['Neon', 'Vector', 'Glitch', 'Pixel', 'Static', 'Wire', 'Polygon', 'Mesh', 'Voxel', 'Shader'];
const HALF = ARENA.size / 2 - 0.6;

const players = new Map();   // id -> player
const weapons = new Map();   // id -> weapon on the floor / falling
let nextId = 1;
let nextWeaponId = 1;

const game = {
  phase: 'lobby',     // lobby | countdown | fight | over
  phaseEndsAt: 0,
  fighters: [],       // [idA, idB]
  nextDropAt: 0,
  dropInterval: 7000,
  fightStartedAt: 0,
  winner: null,
};

function now() { return Date.now(); }

function makePlayer(ws) {
  const id = nextId++;
  const used = new Set([...players.values()].map(p => p.color));
  const color = COLORS.find(c => !used.has(c)) ?? COLORS[id % COLORS.length];
  const angle = Math.random() * Math.PI * 2;
  return {
    id, ws, color,
    name: `${NAMES[Math.floor(Math.random() * NAMES.length)]}-${id}`,
    p: [Math.cos(angle) * 14, 0, Math.sin(angle) * 14 + 8],
    yaw: 0, pitch: 0, moving: false,
    hp: MAX_HEALTH,
    weapon: null,      // { type, uses }
    lastAttack: 0,
    lastHitAt: 0,
  };
}

function onPad(player, pad) {
  const dx = player.p[0] - pad.x, dz = player.p[2] - pad.z;
  return dx * dx + dz * dz <= pad.r * pad.r && player.p[1] < 1.0;
}

function padOccupants() {
  return ARENA.pads.map(pad => [...players.values()].filter(pl => onPad(pl, pad)).map(pl => pl.id));
}

// Pick two different players, one on each pad
function padPair(occ) {
  for (const a of occ[0]) for (const b of occ[1]) if (a !== b) return [a, b];
  return null;
}

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const pl of players.values()) if (pl.ws.readyState === 1) pl.ws.send(s);
}
function announce(text, ms = 2500) { broadcast({ t: 'msg', text, ms }); }

function spawnWeapon() {
  const id = nextWeaponId++;
  // avoid spawning directly on the pads
  let x, z;
  do {
    x = (Math.random() * 2 - 1) * (HALF - 3);
    z = (Math.random() * 2 - 1) * (HALF - 3);
  } while (ARENA.pads.some(p => Math.hypot(x - p.x, z - p.z) < 3));
  weapons.set(id, { id, type: randomWeaponType(), x, z, spin: Math.random() * Math.PI * 2, spawnAt: now() });
}

function resetToLobby() {
  game.phase = 'lobby';
  game.fighters = [];
  game.winner = null;
  weapons.clear();
  for (const pl of players.values()) { pl.hp = MAX_HEALTH; pl.weapon = null; }
}

function startFight() {
  game.phase = 'fight';
  game.fightStartedAt = now();
  game.dropInterval = 7000;
  game.nextDropAt = now() + game.dropInterval;
  for (const id of game.fighters) {
    const pl = players.get(id);
    if (pl) { pl.hp = MAX_HEALTH; pl.weapon = null; }
  }
  for (let i = 0; i < 6; i++) spawnWeapon();
  broadcast({ t: 'fight' });
  announce('FIGHT! Grab a weapon (E)', 2500);
}

function endFight(winnerId, reason) {
  game.phase = 'over';
  game.winner = winnerId;
  game.phaseEndsAt = now() + 6000;
  const w = players.get(winnerId);
  broadcast({ t: 'over', winner: winnerId, name: w ? w.name : 'Nobody', reason });
}

function tickGame() {
  const t = now();
  if (game.phase === 'lobby') {
    const pair = padPair(padOccupants());
    if (pair) {
      game.phase = 'countdown';
      game.fighters = pair;
      game.phaseEndsAt = t + 3000;
      broadcast({ t: 'countdown', fighters: pair });
    }
  } else if (game.phase === 'countdown') {
    const occ = padOccupants();
    const [a, b] = game.fighters;
    const stillOn = (occ[0].includes(a) && occ[1].includes(b)) || (occ[0].includes(b) && occ[1].includes(a));
    if (!stillOn || !players.has(a) || !players.has(b)) {
      game.phase = 'lobby';
      game.fighters = [];
      announce('Countdown cancelled — both players must stay on the pads', 2500);
    } else if (t >= game.phaseEndsAt) {
      startFight();
    }
  } else if (game.phase === 'fight') {
    // More weapons fall as the match goes on: interval shrinks and batch size grows.
    if (t >= game.nextDropAt) {
      const elapsed = (t - game.fightStartedAt) / 1000;
      const batch = 1 + Math.min(4, Math.floor(elapsed / 20));
      for (let i = 0; i < batch; i++) if (weapons.size < 40) spawnWeapon();
      game.dropInterval = Math.max(2000, game.dropInterval * 0.88);
      game.nextDropAt = t + game.dropInterval;
    }
  } else if (game.phase === 'over') {
    if (t >= game.phaseEndsAt) resetToLobby();
  }
}

// ---------- combat ----------
function aimDir(pl, dir) {
  // client sends a normalized aim vector; fall back to body yaw
  if (Array.isArray(dir) && dir.length === 3 && dir.every(Number.isFinite)) {
    const len = Math.hypot(...dir);
    if (len > 0.001) return dir.map(v => v / len);
  }
  return [-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw)];
}

function angleBetween(a, b) {
  const la = Math.hypot(...a), lb = Math.hypot(...b);
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
}

function damage(target, amount, attacker, weaponType) {
  if (game.phase !== 'fight' || target.hp <= 0) return;
  target.hp = Math.max(0, target.hp - amount);
  target.lastHitAt = now();
  broadcast({ t: 'hit', target: target.id, from: attacker.id, dmg: amount, weapon: weaponType, hp: target.hp });
  if (target.hp <= 0) endFight(attacker.id, `${attacker.name} defeated ${target.name} with the ${WEAPONS[weaponType].name}`);
}

function handleAttack(pl, msg) {
  if (game.phase !== 'fight' || !game.fighters.includes(pl.id) || pl.hp <= 0) return;
  if (!pl.weapon) return;
  const def = WEAPONS[pl.weapon.type];
  const t = now();
  if (t - pl.lastAttack < def.cooldown) return;
  pl.lastAttack = t;

  const dir = aimDir(pl, msg.dir);
  const origin = [pl.p[0], pl.p[1] + 1.45, pl.p[2]];
  const opponentId = game.fighters.find(id => id !== pl.id);
  const opp = players.get(opponentId);
  let hitId = null;
  let impact = null;

  if (opp && opp.hp > 0) {
    const chest = [opp.p[0], opp.p[1] + 1.1, opp.p[2]];
    const to = [chest[0] - origin[0], chest[1] - origin[1], chest[2] - origin[2]];
    const dist = Math.hypot(...to);
    if (def.kind === 'melee') {
      // melee uses horizontal facing so you don't need precise vertical aim
      const flatTo = [to[0], 0, to[2]];
      const flatDir = [dir[0], 0, dir[2]];
      if (dist <= def.range + 0.4 && angleBetween(flatDir, flatTo) <= def.cone / 2) hitId = opp.id;
    } else {
      // bigger tolerance up close (body is wider than a point)
      const tolerance = def.cone / 2 + Math.atan2(0.45, Math.max(dist, 0.1)) * 180 / Math.PI;
      if (dist <= def.range && angleBetween(dir, to) <= tolerance) hitId = opp.id;
    }
    if (hitId) impact = chest;
    // rocket splash: near-misses still hurt
    if (!hitId && def.splash) {
      const along = Math.max(0, to[0] * dir[0] + to[1] * dir[1] + to[2] * dir[2]);
      const closest = [origin[0] + dir[0] * along, origin[1] + dir[1] * along, origin[2] + dir[2] * along];
      const miss = Math.hypot(chest[0] - closest[0], chest[1] - closest[1], chest[2] - closest[2]);
      if (along <= def.range && miss <= def.splash) {
        hitId = opp.id;
        impact = closest;
        const type = pl.weapon.type;
        broadcast({ t: 'fx', kind: 'attack', from: pl.id, weapon: type, origin, dir, hit: null, impact });
        pl.weapon.uses -= 1;
        damage(opp, Math.round(def.damage * (1 - miss / def.splash) * 0.7 + 5), pl, type);
        finishUse(pl);
        return;
      }
    }
  }

  broadcast({ t: 'fx', kind: 'attack', from: pl.id, weapon: pl.weapon.type, origin, dir, hit: hitId, impact });
  const type = pl.weapon.type;
  pl.weapon.uses -= 1;
  if (hitId) damage(opp, def.damage, pl, type);
  finishUse(pl);
}

function finishUse(pl) {
  if (pl.weapon && pl.weapon.uses <= 0) {
    broadcast({ t: 'broke', id: pl.id, weapon: pl.weapon.type });
    pl.weapon = null;
  }
}

function handlePickup(pl, msg) {
  if (game.phase !== 'fight' || !game.fighters.includes(pl.id) || pl.hp <= 0) return;
  if (pl.weapon) return;
  const t = now();
  let best = null, bestD = 2.6;
  for (const w of weapons.values()) {
    if (t - w.spawnAt < FALL_MS) continue; // still falling
    const d = Math.hypot(w.x - pl.p[0], w.z - pl.p[2]);
    if (d < bestD && (msg.id == null || msg.id === w.id || d < 1.5)) { best = w; bestD = d; }
  }
  if (!best) return;
  weapons.delete(best.id);
  pl.weapon = { type: best.type, uses: best.uses ?? USES_PER_WEAPON };
  send(pl.ws, { t: 'picked', weapon: best.type });
}

function handleDrop(pl) {
  if (!pl.weapon || game.phase !== 'fight') return;
  const id = nextWeaponId++;
  // dropped weapons land instantly (spawnAt in the past)
  weapons.set(id, { id, type: pl.weapon.type, x: pl.p[0], z: pl.p[2], spin: pl.yaw, spawnAt: now() - FALL_MS - 1, uses: pl.weapon.uses });
  pl.weapon = null;
}

// ---------- networking ----------
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const pl = makePlayer(ws);
  players.set(pl.id, pl);
  send(ws, { t: 'welcome', id: pl.id, color: pl.color, name: pl.name, p: pl.p });
  announce(`${pl.name} joined`, 2000);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.t) {
      case 'state': {
        if (!Array.isArray(msg.p) || msg.p.length !== 3 || !msg.p.every(Number.isFinite)) return;
        if (pl.hp <= 0 && game.phase === 'fight') return; // downed players stay put
        pl.p = [
          Math.max(-HALF, Math.min(HALF, msg.p[0])),
          Math.max(0, Math.min(ARENA.height - 2, msg.p[1])),
          Math.max(-HALF, Math.min(HALF, msg.p[2])),
        ];
        if (Number.isFinite(msg.yaw)) pl.yaw = msg.yaw;
        if (Number.isFinite(msg.pitch)) pl.pitch = Math.max(-1.4, Math.min(1.4, msg.pitch));
        pl.moving = !!msg.moving;
        break;
      }
      case 'attack': handleAttack(pl, msg); break;
      case 'pickup': handlePickup(pl, msg); break;
      case 'drop': handleDrop(pl); break;
      case 'name': {
        if (typeof msg.name === 'string') {
          const clean = msg.name.replace(/[^\w \-]/g, '').trim().slice(0, 16);
          if (clean) pl.name = clean;
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    players.delete(pl.id);
    announce(`${pl.name} left`, 2000);
    if ((game.phase === 'fight' || game.phase === 'countdown') && game.fighters.includes(pl.id)) {
      const other = game.fighters.find(id => id !== pl.id);
      if (game.phase === 'fight' && players.has(other)) endFight(other, `${pl.name} left the match`);
      else resetToLobby();
    }
  });
});

// 20 Hz snapshots
setInterval(() => {
  tickGame();
  const t = now();
  const snap = {
    t: 'snap',
    phase: game.phase,
    countdown: game.phase === 'countdown' ? Math.max(0, game.phaseEndsAt - t) : 0,
    fighters: game.fighters,
    pads: padOccupants().map(o => o.length > 0),
    players: [...players.values()].map(pl => ({
      id: pl.id, name: pl.name, color: pl.color, p: pl.p, yaw: pl.yaw, pitch: pl.pitch,
      moving: pl.moving, hp: pl.hp, w: pl.weapon ? pl.weapon.type : null, uses: pl.weapon ? pl.weapon.uses : 0,
    })),
    weapons: [...weapons.values()].map(w => ({ id: w.id, type: w.type, x: w.x, z: w.z, spin: w.spin, age: t - w.spawnAt })),
  };
  broadcast(snap);
}, 50);

server.listen(PORT, () => console.log(`Double Player running on http://localhost:${PORT}`));
