// Double Player — game server
// Serves the static client and runs the shared match over WebSockets.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  WEAPONS, USES_PER_WEAPON, MAX_HEALTH, ARENA, FALL_MS, randomWeaponType, HIT_TUNING,
  randomSpecialType, usesOf, wallBox, wallHeightAt, segmentHitsWalls, jumpPadPos, BOMBS,
  weaponName, ADMIN_PANEL, INVINCIBLE,
} from './shared/weapons.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE || '812';

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
      // no-cache: browsers must check for a new version every time, so every player
      // always runs the latest game code after a deploy (old cached copies caused
      // features like the muscle upgrades to be missing on some screens).
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': prefix === '/vendor/three/' ? 'public, max-age=86400' : 'no-cache',
      });
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

// ---------- maze walls ----------
// Each wall rises or sinks; every cycle a new random set goes up to form a fresh maze.
const walls = ARENA.walls.map(() => ({ up: false, changedAt: 0 }));
function wallHeights() {
  const t = now();
  return walls.map(w => wallHeightAt(w.up, t - w.changedAt));
}
let wallsActiveUntil = 0; // walls only come up after someone grabs a Wall Breaker
const wallsActive = () => now() < wallsActiveUntil;
function shuffleWalls() {
  const t = now();
  const active = wallsActive();
  walls.forEach((w) => {
    const wantUp = active && Math.random() < 0.55;
    if (wantUp !== w.up) {
      // start from wherever it currently is so a half-risen wall doesn't jump
      const cur = wallHeightAt(w.up, t - w.changedAt) / ARENA.wallHeight;
      const k = wantUp ? cur : 1 - cur;               // progress already made in the new direction
      const kInv = Math.acos(1 - 2 * k) / Math.PI;    // undo the smooth ease approximately
      w.up = wantUp;
      w.changedAt = t - kInv * ARENA.wallRiseMs;
    }
  });
}
let wallTimer = null;
function activateWalls(by) {
  wallsActiveUntil = now() + ARENA.wallsActiveMs;
  shuffleWalls();
  clearInterval(wallTimer);
  wallTimer = setInterval(() => {
    shuffleWalls();
    if (!wallsActive()) { clearInterval(wallTimer); wallTimer = null; announce('The maze walls are sinking back into the floor', 2000); }
  }, ARENA.wallCycleMs);
  // make sure they sink right at the 30s mark
  setTimeout(() => { if (!wallsActive()) shuffleWalls(); }, ARENA.wallsActiveMs + 20);
  announce(`🧱 ${by.name} found the WALL BREAKER — the maze is up for 30 seconds!`, 3000);
}
function deactivateWalls() {
  wallsActiveUntil = 0;
  clearInterval(wallTimer); wallTimer = null;
  shuffleWalls();
}

function insideAnyWall(x, z, margin) {
  return ARENA.walls.some(w => { const b = wallBox(w, margin); return x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1; });
}

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
    streak: 0,         // wins in a row; drives muscle level (max 5)
    weapon: null,      // { type, uses }
    lastAttack: 0,
    lastHitAt: 0,
    lockUntil: 0,      // berserk lunge: server owns position until this time
    admin: false,      // unlocked the admin panel
    adminTries: 0,
    invincibleUntil: 0,
    lastRam: 0,
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

// Special weapons are rare: a small chance per drop that grows as the match goes on,
// and at most 2 lying around at once.
function specialChance() {
  if (game.phase !== 'fight') return 0;
  const elapsed = (now() - game.fightStartedAt) / 1000;
  return Math.min(0.28, 0.08 + elapsed / 450);   // twice as common as before
}
function spawnWeapon(forceType) {
  const id = nextWeaponId++;
  // avoid spawning directly on the pads
  let x, z;
  do {
    x = (Math.random() * 2 - 1) * (HALF - 3);
    z = (Math.random() * 2 - 1) * (HALF - 3);
  } while (ARENA.pads.some(p => Math.hypot(x - p.x, z - p.z) < 3)
        || ARENA.jumpPads.some(p => Math.hypot(x - p.x, z - p.z) < 3)
        || insideAnyWall(x, z, 1.2));
  const specialsOut = [...weapons.values()].filter(w => WEAPONS[w.type].special).length;
  let type = forceType;
  if (!type) type = (specialsOut < 3 && Math.random() < specialChance()) ? randomSpecialType() : randomWeaponType();
  weapons.set(id, { id, type, x, z, spin: Math.random() * Math.PI * 2, spawnAt: now() });
  if (WEAPONS[type].special) announce(`★ A SPECIAL weapon is falling: ${WEAPONS[type].name}!`, 3000);
}

function resetToLobby() {
  game.phase = 'lobby';
  deactivateWalls();
  game.fighters = [];
  game.winner = null;
  weapons.clear();
  for (const pl of players.values()) { pl.hp = MAX_HEALTH; pl.weapon = null; pl.invincibleUntil = 0; }
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
  // win streaks: winner bulks up, loser goes back to level 0
  for (const id of game.fighters) {
    const pl = players.get(id);
    if (!pl) continue;
    pl.streak = id === winnerId ? pl.streak + 1 : 0;
  }
  const streak = w ? w.streak : 0;
  broadcast({ t: 'over', winner: winnerId, name: w ? w.name : 'Nobody', reason, streak, muscle: Math.min(5, streak) });
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
  if (now() < target.invincibleUntil) {  // cheat: nothing hurts you
    broadcast({ t: 'blocked', target: target.id });
    return;
  }
  target.hp = Math.max(0, target.hp - amount);
  target.lastHitAt = now();
  broadcast({ t: 'hit', target: target.id, from: attacker.id, dmg: amount, weapon: weaponType, hp: target.hp });
  if (target.hp <= 0) endFight(attacker.id, `${attacker.name} defeated ${target.name} with the ${weaponName(weaponType)}`);
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
  if (def.special && def.kind !== 'melee') return specialAttack(pl, opp, def, origin, dir);
  let hitId = null;
  let impact = null;

  if (opp && opp.hp > 0) {
    const chest = [opp.p[0], opp.p[1] + 1.1, opp.p[2]];
    const to = [chest[0] - origin[0], chest[1] - origin[1], chest[2] - origin[2]];
    const dist = Math.hypot(...to);
    const flatDist = Math.hypot(to[0], to[2]);
    if (flatDist < HIT_TUNING.bodyRadius) {
      // point blank: players overlapping always connect
      hitId = opp.id;
    } else if (def.kind === 'melee') {
      // melee uses horizontal facing so you don't need precise vertical aim
      const flatTo = [to[0], 0, to[2]];
      const flatDir = [dir[0], 0, dir[2]];
      // widen the cone up close so you can't slip past someone standing right next to you
      const closeBonus = Math.atan2(HIT_TUNING.bodyRadius, Math.max(dist, 0.1)) * 180 / Math.PI;
      if (dist <= def.range + HIT_TUNING.bodyRadius && angleBetween(flatDir, flatTo) <= def.cone / 2 + closeBonus) hitId = opp.id;
    } else {
      // bigger tolerance up close (body is wider than a point)
      const tolerance = def.cone / 2 + Math.atan2(HIT_TUNING.bodyRadius, Math.max(dist, 0.1)) * 180 / Math.PI;
      if (dist <= def.range + HIT_TUNING.bodyRadius && angleBetween(dir, to) <= tolerance) hitId = opp.id;
    }
    // walls give cover: anything between you and the target blocks the hit
    if (hitId && flatDist >= HIT_TUNING.bodyRadius) {
      const blockT = segmentHitsWalls(origin, chest, wallHeights());
      if (blockT !== null) {
        hitId = null;
        impact = origin.map((v, k) => v + (chest[k] - v) * blockT);
      }
    }
    if (hitId) impact = chest;
    // rocket splash: near-misses still hurt
    if (!hitId && def.splash) {
      const along = Math.max(0, to[0] * dir[0] + to[1] * dir[1] + to[2] * dir[2]);
      const closest = [origin[0] + dir[0] * along, origin[1] + dir[1] * along, origin[2] + dir[2] * along];
      const miss = Math.hypot(chest[0] - closest[0], chest[1] - closest[1], chest[2] - closest[2]);
      if (along <= def.range && miss <= def.splash && segmentHitsWalls(origin, closest, wallHeights()) === null) {
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

  if (!impact && def.kind !== 'melee') {
    const far = origin.map((v, k) => v + dir[k] * def.range);
    const t = segmentHitsWalls(origin, far, wallHeights());
    if (t !== null) impact = origin.map((v, k) => v + (far[k] - v) * t);
  }
  broadcast({ t: 'fx', kind: 'attack', from: pl.id, weapon: pl.weapon.type, origin, dir, hit: hitId, impact });
  const type = pl.weapon.type;
  pl.weapon.uses -= 1;
  if (hitId) damage(opp, def.damage, pl, type);
  finishUse(pl);
}

// ---------- special powers ----------
const stillFighting = (a, b) => game.phase === 'fight' && a && b && players.has(a.id) && players.has(b.id) && b.hp > 0;

function specialAttack(pl, opp, def, origin, dir) {
  const type = pl.weapon.type;
  const use = () => { pl.weapon.uses -= 1; finishUse(pl); };

  if (def.kind === 'heal') {
    // Birthday Cake: restore all health
    pl.hp = MAX_HEALTH;
    broadcast({ t: 'heal', id: pl.id, hp: pl.hp, weapon: type });
    return use();
  }

  if (!opp || opp.hp <= 0) return;

  if (def.kind === 'homing') {
    // fake0h Fire Spear: guided missile that always finds and kills the opponent
    const dist = Math.hypot(opp.p[0] - pl.p[0], opp.p[1] - pl.p[1], opp.p[2] - pl.p[2]);
    const travelMs = Math.round(Math.min(3000, 700 + dist * 40));
    broadcast({ t: 'fx', kind: 'homing', from: pl.id, to: opp.id, weapon: type, origin, travelMs });
    setTimeout(() => {
      if (stillFighting(pl, opp)) damage(opp, opp.hp, pl, type);
    }, travelMs);
    return use();
  }

  if (def.kind === 'berserk') {
    // Berzerk Helmet: launch at the enemy, then a flurry of punches (20 total)
    const dx = pl.p[0] - opp.p[0], dz = pl.p[2] - opp.p[2];
    const d = Math.hypot(dx, dz);
    if (d > def.range) { send(pl.ws, { t: 'msg', text: 'Too far away to berserk!', ms: 1500 }); return; }
    const ux = d > 0.01 ? dx / d : 0, uz = d > 0.01 ? dz / d : 1;
    const start = [...pl.p];
    const end = [
      Math.max(-HALF, Math.min(HALF, opp.p[0] + ux * 0.9)),
      0,
      Math.max(-HALF, Math.min(HALF, opp.p[2] + uz * 0.9)),
    ];
    const LAUNCH_MS = 350, PUNCHES = 8, PUNCH_GAP = 120;
    const yaw = Math.atan2(ux, uz); // face the enemy (model faces -z)
    pl.p = end;
    pl.yaw = yaw;
    pl.lockUntil = now() + LAUNCH_MS + PUNCHES * PUNCH_GAP + 150;
    send(pl.ws, { t: 'teleport', p: end, yaw, lockMs: pl.lockUntil - now(), launchMs: LAUNCH_MS });
    broadcast({ t: 'fx', kind: 'berserk', from: pl.id, to: opp.id, weapon: type, start, end, launchMs: LAUNCH_MS });
    const perPunch = def.damage / PUNCHES; // 2.5 each -> 20 total
    let dealt = 0;
    for (let i = 0; i < PUNCHES; i++) {
      setTimeout(() => {
        if (!stillFighting(pl, opp)) return;
        const amount = Math.round(perPunch * (i + 1)) - dealt; // keeps the total at exactly 20
        dealt += amount;
        broadcast({ t: 'fx', kind: 'punch', from: pl.id, to: opp.id, weapon: type, n: i });
        if (amount > 0) damage(opp, amount, pl, type);
      }, LAUNCH_MS + i * PUNCH_GAP);
    }
    return use();
  }

  if (def.kind === 'poopgun') {
    // Poop Bazooka: a stream of poop, 25 damage if it's aimed at the enemy
    const chest = [opp.p[0], opp.p[1] + 1.1, opp.p[2]];
    const to = [chest[0] - origin[0], chest[1] - origin[1], chest[2] - origin[2]];
    const dist = Math.hypot(...to);
    const tolerance = def.cone + Math.atan2(HIT_TUNING.bodyRadius, Math.max(dist, 0.1)) * 180 / Math.PI;
    const hit = (Math.hypot(to[0], to[2]) < HIT_TUNING.bodyRadius)
      || (dist <= def.range && angleBetween(dir, to) <= tolerance && segmentHitsWalls(origin, chest, wallHeights()) === null);
    broadcast({ t: 'fx', kind: 'attack', from: pl.id, weapon: type, origin, dir: hit ? to.map(v => v / dist) : dir, hit: hit ? opp.id : null, impact: hit ? chest : null });
    if (hit) {
      const TICKS = 5;
      for (let i = 0; i < TICKS; i++) {
        setTimeout(() => { if (stillFighting(pl, opp)) damage(opp, def.damage / TICKS, pl, type); }, 150 + i * 180);
      }
    }
    return use();
  }
}

// ---------- instant specials ----------
function useInstant(pl, type) {
  send(pl.ws, { t: 'picked', weapon: type, instant: true });
  if (type === 'wall_breaker') return activateWalls(pl);
  if (type === 'bomb') return bombRain(pl);
}

function bombRain(owner) {
  announce(`💣 ${owner.name} found the BOMB — 100 bombs incoming! Find a clear spot!`, 3000);
  const fightId = game.fightStartedAt;
  const list = [];
  for (let i = 0; i < BOMBS.count; i++) {
    const x = (Math.random() * 2 - 1) * (HALF - 1);
    const z = (Math.random() * 2 - 1) * (HALF - 1);
    const delay = Math.round(Math.random() * BOMBS.spreadMs);
    list.push([+x.toFixed(2), +z.toFixed(2), delay]);
    setTimeout(() => {
      if (game.phase !== 'fight' || game.fightStartedAt !== fightId) return;
      for (const id of game.fighters) {
        if (id === owner.id) continue; // the bomb's owner is immune to their own bombs
        const pl = players.get(id);
        if (!pl || pl.hp <= 0) continue;
        if (Math.hypot(pl.p[0] - x, pl.p[2] - z) <= WEAPONS.bomb.range && pl.p[1] < 3) damage(pl, WEAPONS.bomb.damage, owner, 'bomb');
      }
    }, delay + FALL_MS + BOMBS.fuseMs);
  }
  broadcast({ t: 'bombs', owner: owner.id, list, fallMs: FALL_MS, fuseMs: BOMBS.fuseMs, radius: WEAPONS.bomb.range });
}

function finishUse(pl) {
  if (pl.weapon && pl.weapon.uses <= 0) {
    broadcast({ t: 'broke', id: pl.id, weapon: pl.weapon.type });
    pl.weapon = null;
  }
}

function handlePickup(pl, msg) {
  if (game.phase !== 'fight' || !game.fighters.includes(pl.id) || pl.hp <= 0) return;
  const t = now();
  let best = null, bestD = 2.6;
  for (const w of weapons.values()) {
    if (t - w.spawnAt < FALL_MS) continue; // still falling
    if (pl.weapon && !WEAPONS[w.type].instant) continue; // hands full (instant specials still work)
    const d = Math.hypot(w.x - pl.p[0], w.z - pl.p[2]);
    if (d < bestD && (msg.id == null || msg.id === w.id || d < 1.5)) { best = w; bestD = d; }
  }
  if (!best) return;
  weapons.delete(best.id);
  if (WEAPONS[best.type].instant) return useInstant(pl, best.type);
  pl.weapon = { type: best.type, uses: best.uses ?? usesOf(best.type) };
  pl.lastAttack = 0; // a fresh weapon is ready to use right away
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
        if (now() < pl.lockUntil) return;                // mid-berserk: server controls position
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
      case 'admin': {
        // number pad on the wall panel: you have to be standing at the panel
        const near = Math.hypot(pl.p[0] - ADMIN_PANEL.x, pl.p[2] - ADMIN_PANEL.z) <= ADMIN_PANEL.reach + 1.5;
        if (!near || pl.adminTries > 20) { send(ws, { t: 'admin', ok: false }); break; }
        const ok = String(msg.code) === ADMIN_CODE;
        if (ok) pl.admin = true; else pl.adminTries++;
        send(ws, { t: 'admin', ok });
        break;
      }
      case 'cheat': {
        if (!pl.admin) break;
        if (msg.action === 'spear') {
          pl.weapon = { type: 'fire_spear', uses: usesOf('fire_spear') };
          pl.lastAttack = 0;
          send(ws, { t: 'picked', weapon: 'fire_spear' });
          announce(`🛠️ ${pl.name} summoned a fake0h Fire Spear from the admin panel!`, 2500);
        } else if (msg.action === 'bombs') {
          bombRain(pl);
        } else if (msg.action === 'invincible') {
          pl.invincibleUntil = now() + INVINCIBLE.ms;
          announce(`🌈 ${pl.name} is INVINCIBLE for 30 seconds — don't let them touch you!`, 3000);
        }
        break;
      }
      case 'debugSpawn':
        if (process.env.DEBUG_SPAWN && WEAPONS[msg.type] && game.phase === 'fight') {
          spawnWeapon(msg.type);
          const w = [...weapons.values()].pop();
          w.x = pl.p[0] + 1; w.z = pl.p[2]; w.spawnAt = now() - FALL_MS - 1;
        }
        break;
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

// Invincible players hurt anyone they run into
function tickRams(t) {
  if (game.phase !== 'fight') return;
  for (const id of game.fighters) {
    const pl = players.get(id);
    if (!pl || t >= pl.invincibleUntil || pl.hp <= 0) continue;
    const opp = players.get(game.fighters.find(f => f !== id));
    if (!opp || opp.hp <= 0) continue;
    const d = Math.hypot(opp.p[0] - pl.p[0], opp.p[2] - pl.p[2]);
    if (d <= INVINCIBLE.ramRange && Math.abs(opp.p[1] - pl.p[1]) < 2 && t - pl.lastRam >= INVINCIBLE.ramCooldownMs) {
      pl.lastRam = t;
      broadcast({ t: 'fx', kind: 'ram', from: pl.id, to: opp.id, weapon: 'invincible' });
      damage(opp, INVINCIBLE.ramDamage, pl, 'invincible');
    }
  }
}

// 20 Hz snapshots
setInterval(() => {
  tickGame();
  const t = now();
  tickRams(t);
  const snap = {
    t: 'snap',
    phase: game.phase,
    countdown: game.phase === 'countdown' ? Math.max(0, game.phaseEndsAt - t) : 0,
    fighters: game.fighters,
    pads: padOccupants().map(o => o.length > 0),
    walls: walls.map(w => [w.up ? 1 : 0, t - w.changedAt]),
    wallsLeft: Math.max(0, wallsActiveUntil - t),
    jumpPads: ARENA.jumpPads.map((_, i) => { const p = jumpPadPos(i, t / 1000); return [+p.x.toFixed(2), +p.z.toFixed(2)]; }),
    players: [...players.values()].map(pl => ({
      id: pl.id, name: pl.name, color: pl.color, p: pl.p, yaw: pl.yaw, pitch: pl.pitch,
      streak: pl.streak, muscle: Math.min(5, pl.streak),
      inv: Math.max(0, pl.invincibleUntil - t),
      moving: pl.moving, hp: pl.hp, w: pl.weapon ? pl.weapon.type : null, uses: pl.weapon ? pl.weapon.uses : 0,
    })),
    weapons: [...weapons.values()].map(w => ({ id: w.id, type: w.type, x: w.x, z: w.z, spin: w.spin, age: t - w.spawnAt })),
  };
  broadcast(snap);
}, 50);

server.listen(PORT, () => console.log(`Double Player running on http://localhost:${PORT}`));
