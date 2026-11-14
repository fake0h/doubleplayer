// Double Player — game server
// Serves the static client and runs the shared match over WebSockets.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { EMOTION_IDS, emotionById, CHEESE, CHEESE_SPOTS } from './shared/emotions.js';
import { DISCO } from './shared/disco.js';
import {
  WEAPONS, USES_PER_WEAPON, MAX_HEALTH, ARENA, FALL_MS, randomWeaponType, HIT_TUNING,
  randomSpecialType, usesOf, wallBox, wallHeightAt, segmentHitsWalls, jumpPadPos, BOMBS,
  weaponName, ADMIN_PANEL, INVINCIBLE, LAVA, ROBOTS, CLOAK_MS,
} from './shared/weapons.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE || '812';

// ---------- static files ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm',
};
const ROUTES = [
  ['/shared/', path.join(__dirname, 'shared')],
  ['/vendor/three/', path.join(__dirname, 'node_modules', 'three', 'build')],
  ['/vendor/mediapipe/', path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision')],
  ['/', path.join(__dirname, 'public')],
];

// MediaPipe models (Google): the face model for Say Cheese and the body/pose model for Dance Dance
// Disco. Each is downloaded once and kept in memory so every player gets it from this server; if that
// fails, the browser is sent to Google directly.
const MODELS = {
  'face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'pose_landmarker_lite.task': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};
const modelCache = {}, modelLoading = {};
function loadModel(name) {
  if (!modelLoading[name]) {
    modelLoading[name] = fetch(MODELS[name])
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(buf => { modelCache[name] = Buffer.from(buf); console.log(`Model cached: ${name} (${modelCache[name].length} bytes)`); })
      .catch(err => { console.log(`Model download failed (${name}), browsers will fetch it from Google:`, err.message); modelLoading[name] = null; });
  }
  return modelLoading[name];
}
async function serveModel(name, res) {
  if (!modelCache[name]) await loadModel(name);
  if (modelCache[name]) {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
    return res.end(modelCache[name]);
  }
  res.writeHead(302, { Location: MODELS[name] });
  res.end();
}
for (const name of Object.keys(MODELS)) loadModel(name);

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/health') { res.writeHead(200); return res.end('ok'); }
  const modelName = urlPath.startsWith('/models/') ? urlPath.slice(8) : null;
  if (modelName && MODELS[modelName]) return serveModel(modelName, res);
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
        'Cache-Control': prefix.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache',
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
  mode: 'pvp',        // pvp (4xPVP weapons free-for-all) | cheese (Say Cheese)
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
    adminMode: false,  // admin mode on: clicking weapons on the weapon wall gives them to you
    adminTries: 0,
    invincibleUntil: 0,
    lastRam: 0,
    cloakUntil: 0,
    lastLava: 0,
  };
}

function onPad(player, pad) {
  const dx = player.p[0] - pad.x, dz = player.p[2] - pad.z;
  return dx * dx + dz * dz <= pad.r * pad.r && player.p[1] < 1.0;
}

function padOccupants(padList = ARENA.pads) {
  return padList.map(pad => [...players.values()].filter(pl => onPad(pl, pad)).map(pl => pl.id));
}
const modePads = (mode) => (mode === 'cheese' ? ARENA.cheesePads : mode === 'disco' ? ARENA.nextPads : ARENA.pads);
const asMode = (m) => (['pvp', 'cheese', 'disco'].includes(m) ? m : 'pvp');

// One player per pad, each player counted once. Returns the list of fighters (0-4).
function padFighters(occ) {
  const taken = new Set();
  for (const onThisPad of occ) {
    const pick = onThisPad.find(id => !taken.has(id));
    if (pick != null) taken.add(pick);
  }
  return [...taken].slice(0, ARENA.maxFighters);
}
const aliveFighters = () => game.fighters.filter(id => players.has(id) && players.get(id).hp > 0);
const opponentsOf = (pl) => game.fighters.filter(id => id !== pl.id).map(id => players.get(id)).filter(o => o && o.hp > 0);
function nearestOpponent(pl) {
  let best = null, bd = Infinity;
  for (const o of opponentsOf(pl)) {
    const d = Math.hypot(o.p[0] - pl.p[0], o.p[2] - pl.p[2]);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
// The opponent you're aiming at: smallest angle off your aim, nearer wins ties
function aimedOpponent(pl, origin, dir, melee) {
  let best = null, bestScore = Infinity;
  for (const o of opponentsOf(pl)) {
    const to = [o.p[0] - origin[0], o.p[1] + 1.1 - origin[1], o.p[2] - origin[2]];
    const flat = Math.hypot(to[0], to[2]);
    const ang = flat < HIT_TUNING.bodyRadius ? 0
      : melee ? angleBetween([dir[0], 0, dir[2]], [to[0], 0, to[2]]) : angleBetween(dir, to);
    const score = ang + flat * 0.5;
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best;
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
        || ARENA.cheesePads.some(p => Math.hypot(x - p.x, z - p.z) < 3)
        || ARENA.nextPads.some(p => Math.hypot(x - p.x, z - p.z) < 3)
        || ARENA.grayPads.some(p => Math.hypot(x - p.x, z - p.z) < 3)
        || insideAnyWall(x, z, 1.2));
  const specialsOut = [...weapons.values()].filter(w => WEAPONS[w.type].special).length;
  let type = forceType;
  if (!type) type = (specialsOut < 3 && Math.random() < specialChance()) ? randomSpecialType() : randomWeaponType();
  weapons.set(id, { id, type, x, z, spin: Math.random() * Math.PI * 2, spawnAt: now() });
  if (WEAPONS[type].special) announce(`★ A SPECIAL weapon is falling: ${WEAPONS[type].name}!`, 3000);
}

function resetToLobby() {
  game.phase = 'lobby';
  disco = null;
  game.solo = false;
  game.mode = 'pvp';
  cheese = null;
  for (const pl of players.values()) pl.lockUntil = 0;   // release anyone lined up for Say Cheese
  deactivateWalls();
  game.fighters = [];
  game.winner = null;
  weapons.clear();
  for (const pl of players.values()) { pl.hp = MAX_HEALTH; pl.weapon = null; pl.invincibleUntil = 0; pl.cloakUntil = 0; }
  lava = null;
  robots = [];
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
    // green pads start 4xPVP, yellow pads start Say Cheese
    for (const mode of ['pvp', 'cheese', 'disco']) {
      const fighters = padFighters(padOccupants(modePads(mode)));
      if (fighters.length >= 2) {   // a lone Say Cheese player starts with the "Play now" button instead
        game.phase = 'countdown';
        game.solo = false;
        game.mode = mode;
        game.fighters = fighters;
        game.phaseEndsAt = t + 3000;
        broadcast({ t: 'countdown', fighters, mode });
        break;
      }
    }
  } else if (game.phase === 'countdown') {
    // players can hop on a free pad to join (or step off to leave) until the countdown ends
    const fighters = padFighters(padOccupants(modePads(game.mode)));
    const joined = fighters.filter(id => !game.fighters.includes(id));
    for (const id of joined) announce(`${players.get(id)?.name} joined ${game.mode === 'cheese' ? 'Say Cheese' : 'the battle'}!`, 1500);
    game.fighters = fighters;
    if (fighters.length < (game.solo ? 1 : 2)) {
      game.phase = 'lobby';
      game.fighters = [];
      announce('Countdown cancelled — at least 2 players must stay on the pads', 2500);
    } else if (t >= game.phaseEndsAt) {
      if (game.mode === 'cheese') startCheese(); else if (game.mode === 'disco') startDisco(); else startFight();
    }
  } else if (game.phase === 'disco') {
    tickDisco(t);
  } else if (game.phase === 'cheese') {
    tickCheese(t);
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

// ---------- Dance Dance Disco ----------
// Each player's device runs its camera and looks for up to 4 bodies. Every body it finds becomes a
// dancer (it sticks to that body until it leaves the picture) and reports how hard it's dancing
// (0-100). Bodies can come and go at any time. Scores build up while you dance. The party meter
// fills while EVERY body on screen is max dancing; when it's full the floor explodes and everyone wins.
let disco = null;
const DANCER_TIMEOUT_MS = 1200;   // a body that hasn't been reported for this long has left the picture
function discoDevices() { return disco ? disco.devices.filter(id => players.has(id)) : []; }
function visibleDancers(t = now()) {
  return disco ? [...disco.dancers.values()].filter(d => t - d.lastSeen < DANCER_TIMEOUT_MS && players.has(d.owner)) : [];
}
function startDisco() {
  game.phase = 'disco';
  const t = now();
  disco = {
    stage: 'camera', stageEndsAt: t + DISCO.cameraWaitMs, hype: 0, danceStart: 0, lastTick: t,
    devices: [...game.fighters], ready: new Set(), dancers: new Map(),
  };
  game.fighters.forEach((id, i) => {
    const pl = players.get(id);
    if (pl) lineUp(pl, DISCO.spots[i % DISCO.spots.length], { game: 'disco' });
  });
  announce('🪩 DANCE DANCE DISCO! Get in front of the camera — up to 4 dancers per camera', 3000);
}
function tickDisco(t) {
  if (!disco) return;
  const dt = Math.min(0.25, (t - disco.lastTick) / 1000);
  disco.lastTick = t;
  if (!discoDevices().length && disco.stage !== 'boom') return endDisco(false, 'Everyone left the dance floor');
  if (disco.stage === 'camera') {
    if (discoDevices().every(id => disco.ready.has(id)) || t >= disco.stageEndsAt) {
      disco.stage = 'dance';
      disco.danceStart = t;
      broadcast({ t: 'discoGo' });
      announce('🪩 JUST DANCE! When everyone on screen is max dancing, the party meter fills!', 3000);
    }
    return;
  }
  if (disco.stage === 'dance') {
    const vis = visibleDancers(t);
    for (const d of vis) d.score += d.energy * dt / 10;
    // the party meter fills as the dancers' combined points build up to the goal
    const total = [...disco.dancers.values()].reduce((a, d) => a + d.score, 0);
    disco.total = total;
    disco.hype = Math.min(1, total / DISCO.goalPoints);
    if (disco.hype >= 1) {
      disco.danceEndAt = t;
      disco.stage = 'boom';
      disco.stageEndsAt = t + DISCO.boomMs;
      broadcast({ t: 'discoBoom' });
    } else if (t - disco.danceStart > DISCO.maxMs) {
      return endDisco(false, 'The music stopped before the dance floor exploded!');
    }
    return;
  }
  if (disco.stage === 'boom' && t >= disco.stageEndsAt) endDisco(true, 'The dance floor EXPLODED — everybody wins!');
}
function endDisco(boom, reason) {
  // dancers who were still on screen when the dance ended (not marked "left")
  const stillHere = new Set(visibleDancers(disco?.danceEndAt || now()).map(d => d.key));
  const standings = [...(disco?.dancers.values() || [])].filter(d => d.score >= 1)
    .map(d => [d.key, stillHere.has(d.key) ? d.name : `${d.name} (left)`, Math.round(d.score)]).sort((a, b) => b[2] - a[2]).slice(0, 8);
  game.phase = 'over';
  game.winner = boom ? 'everyone' : standings[0]?.[0] ?? null;
  game.phaseEndsAt = now() + 10000;
  broadcast({ t: 'over', mode: 'disco', boom, reason, name: boom ? 'EVERYONE' : (standings[0]?.[1] ?? 'Nobody'), standings });
  if (disco) disco.stage = 'done';
}

// ---------- Say Cheese ----------
// Players line up facing the back wall, the giant smiley names an emotion, each player's own
// browser rates their face from their camera (0-100) and reports it. Best face wins the round
// and their photo goes up on the wall. First to 3 wins (with nobody tied for the lead) wins.
let cheese = null;
// Online: one player per device. Local: one device, 2-4 people in front of the same camera
// (player 1 is the device's own player, the rest are "virtual" players owned by that device).
function cheesePlayers() {
  if (!cheese) return [];
  if (cheese.local) return players.has(cheese.host) ? cheese.players : [];
  return cheese.players.filter(cp => players.has(cp.id));
}
function lineUp(pl, spot, extra = {}) {
  pl.p = [spot.x, 0, spot.z];
  pl.yaw = Math.PI;                      // facing the back wall
  pl.lockUntil = Infinity;               // stay in line for the whole game
  pl.weapon = null;
  send(pl.ws, { t: 'cheeseStart', spot: [spot.x, spot.z], ...extra });
}
function startCheese() {
  game.phase = 'cheese';
  const t = now();
  const solo = game.fighters.length === 1;
  cheese = {
    stage: solo ? 'count' : 'camera', stageEndsAt: t + (solo ? 30000 : CHEESE.cameraWaitMs),
    round: 0, emotion: null, recent: [], local: solo, host: solo ? game.fighters[0] : null, facesOk: !solo,
    players: game.fighters.map((id, i) => ({ id, name: players.get(id)?.name ?? '?', wins: 0, ready: false, score: 0, best: 0, spot: CHEESE_SPOTS[i] })),
  };
  for (const cp of cheese.players) {
    const pl = players.get(cp.id);
    if (pl) lineUp(pl, cp.spot, { local: solo });
  }
  announce(solo ? '🧀 SAY CHEESE! How many players are in front of the camera?' : '🧀 SAY CHEESE! Allow camera access to play', 3000);
}
function setLocalCount(n) {
  if (!cheese?.local || cheese.stage !== 'count') return;
  n = Math.max(2, Math.min(4, Math.round(n) || 2));
  const host = players.get(cheese.host);
  cheese.players = Array.from({ length: n }, (_, i) => ({
    id: i === 0 ? cheese.host : `v${cheese.host}-${i + 1}`, name: `Player ${i + 1}`, virtual: i > 0,
    wins: 0, ready: false, score: 0, best: 0, spot: CHEESE_SPOTS[i],
  }));
  cheese.stage = 'camera';
  cheese.stageEndsAt = now() + 90000;   // generous: waiting until the camera finds every face
  cheese.facesOk = false;
  if (host) send(host.ws, { t: 'cheeseCount', n, ids: cheese.players.map(cp => cp.id) });
  announce(`🧀 ${n} players! Line up side by side so the camera can see every face`, 3000);
}
function nextCheeseRound(t) {
  // pick an emotion we haven't used recently
  const choices = EMOTION_IDS.filter(id => !cheese.recent.includes(id));
  const emotion = choices[Math.floor(Math.random() * choices.length)];
  cheese.recent = [...cheese.recent, emotion].slice(-12);
  cheese.round++;
  cheese.emotion = emotion;
  // show the emotion right away, then give everyone 2 seconds before the 3-2-1 countdown
  cheese.stage = 'ready';
  cheese.stageEndsAt = t + CHEESE.readyMs;
  for (const cp of cheese.players) { cp.score = 0; cp.best = 0; }
  broadcast({ t: 'cheeseRound', round: cheese.round, emotion, readyMs: CHEESE.readyMs, ms: CHEESE.poseMs });
}
function tickCheese(t) {
  if (!cheese) return;
  const cps = cheesePlayers();
  if (cps.length < (cheese.local ? 1 : 2)) return endCheese('Not enough players left');
  if (cheese.stage === 'count') {
    if (t >= cheese.stageEndsAt) setLocalCount(2);
    return;
  }
  if (cheese.stage === 'camera') {
    // local: start once the camera can see every player's face; online: once everyone is ready
    const ok = cheese.local ? cheese.facesOk && cps[0].ready : cps.every(cp => cp.ready);
    if (ok || t >= cheese.stageEndsAt) nextCheeseRound(t);
  } else if (cheese.stage === 'ready' && cheese.local && !cheese.facesOk) {
    // someone left the camera during "get ready": wait for them, then start a fresh emotion
    cheese.stage = 'camera'; cheese.stageEndsAt = t + 90000;
  } else if (cheese.stage === 'ready' && t >= cheese.stageEndsAt) {
    cheese.stage = 'pose';
    cheese.stageEndsAt = t + CHEESE.poseMs;
  } else if (cheese.stage === 'pose' && t >= cheese.stageEndsAt) {
    // FLASH: highest score this round wins (ties share the win)
    const top = Math.max(...cps.map(cp => cp.best));
    const winners = top > 0 ? cps.filter(cp => cp.best === top) : [];
    for (const cp of winners) cp.wins++;
    cheese.stage = 'flash';
    cheese.photoFrom = winners[0]?.id ?? null;
    cheese.stageEndsAt = t + (cheese.photoFrom ? CHEESE.photoWaitMs : 600);
    broadcast({
      t: 'cheeseFlash', emotion: cheese.emotion, winners: winners.map(cp => cp.id),
      photoFrom: cheese.photoFrom, scores: cps.map(cp => [cp.id, Math.round(cp.best)]),
    });
  } else if (cheese.stage === 'flash' && t >= cheese.stageEndsAt) {
    // the winner's close-up is on the wall (or we waited long enough): straight on to the next emotion
    const most = Math.max(...cps.map(cp => cp.wins));
    const leaders = cps.filter(cp => cp.wins === most);
    if (most >= CHEESE.winsToWin && leaders.length === 1) {
      return endCheese(`${leaders[0].name} won Say Cheese with ${most} wins!`, leaders[0].id);
    }
    if (most >= CHEESE.winsToWin) announce(`Tie at ${most} wins — keep going until there's one winner!`, 2500);
    // local game: wait until everyone is back in the camera before the next emotion
    if (cheese.local && !cheese.facesOk) { cheese.stage = 'camera'; cheese.stageEndsAt = t + 90000; return; }
    nextCheeseRound(t);
  }
}
function endCheese(reason, winnerId = null) {
  if (winnerId == null) {
    const cps = cheesePlayers().sort((a, b) => b.wins - a.wins);
    winnerId = cps[0]?.id ?? null;
  }
  const w = cheese?.players.find(cp => cp.id === winnerId);
  game.phase = 'over';
  game.winner = winnerId;
  game.phaseEndsAt = now() + 12000;   // time to look at the final results
  const standings = (cheese?.players || []).map(cp => [cp.id, cp.name, cp.wins]).sort((a, b) => b[2] - a[2]);
  broadcast({ t: 'over', mode: 'cheese', winner: winnerId, name: w ? w.name : 'Nobody', reason, standings });
  if (cheese) cheese.stage = 'done';
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
  if (target.hp <= 0) {
    const how = `${attacker.name} knocked out ${target.name} with the ${weaponName(weaponType)}`;
    const alive = aliveFighters();
    if (alive.length <= 1) endFight(alive[0] ?? attacker.id, how);
    else {
      broadcast({ t: 'out', id: target.id, by: attacker.id, text: how, left: alive.length });
      announce(`💀 ${how} — ${alive.length} left!`, 2500);
    }
  }
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
  // with up to 4 fighters, you hit whoever you're aiming at
  const opp = aimedOpponent(pl, origin, dir, def.kind === 'melee');
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

  if (def.kind === 'homing' || def.kind === 'berserk') opp = nearestOpponent(pl);
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
  if (type === 'lava_bucket') return spillLava(pl);
  if (type === 'robot_swarm') return releaseRobots(pl);
  if (type === 'invisibility_cloak') {
    pl.cloakUntil = now() + CLOAK_MS;
    announce(`👻 ${pl.name} put on the INVISIBILITY CLOAK and vanished!`, 3000);
  }
}

// ---------- Lava Bucket ----------
const LAVA_N = Math.round(ARENA.size / LAVA.tile); // 10x10 tiles
let lava = null; // { owner, start, mask: '0101...' }
function spillLava(owner) {
  const idx = [...Array(LAVA_N * LAVA_N).keys()].sort(() => Math.random() - 0.5);
  const lavaSet = new Set(idx.slice(0, Math.round(idx.length * LAVA.coverage)));
  lava = { owner, start: now(), mask: idx.map((_, i) => (lavaSet.has(i) ? '1' : '0')).join('') };
  announce(`🌋 ${owner.name} spilled the LAVA BUCKET — half the floor is turning to lava! Get off the glowing tiles!`, 3500);
}
function lavaTileAt(x, z) {
  const i = Math.floor((x + ARENA.size / 2) / LAVA.tile), j = Math.floor((z + ARENA.size / 2) / LAVA.tile);
  if (i < 0 || j < 0 || i >= LAVA_N || j >= LAVA_N) return false;
  return lava.mask[j * LAVA_N + i] === '1';
}
function tickLava(t) {
  if (!lava) return;
  if (t - lava.start > LAVA.warnMs + LAVA.ms) { lava = null; announce('The lava cooled down', 1500); return; }
  if (game.phase !== 'fight' || t - lava.start < LAVA.warnMs) return;
  for (const id of game.fighters) {
    const pl = players.get(id);
    if (!pl || pl.hp <= 0 || pl.p[1] > 0.4 || t - pl.lastLava < 1000) continue; // jumping / on a wall = safe
    if (lavaTileAt(pl.p[0], pl.p[2])) { pl.lastLava = t; damage(pl, LAVA.dps, lava.owner, 'lava'); }
  }
}

// ---------- Robot Swarm ----------
let robots = [];
let nextRobotId = 1;
function releaseRobots(owner) {
  const t = now();
  for (let i = 0; i < ROBOTS.count; i++) {
    robots.push({ id: nextRobotId++, owner, x: (Math.random() * 2 - 1) * (HALF - 3), z: (Math.random() * 2 - 1) * (HALF - 3), born: t, hitUntil: 0 });
  }
  announce(`🤖 ${owner.name} released the ROBOT SWARM — ${ROBOTS.count} robots are hunting!`, 3000);
}
function tickRobots(t, dt) {
  if (!robots.length) return;
  robots = robots.filter(r => t - r.born < ROBOTS.ms + ROBOTS.riseMs && game.phase === 'fight');
  for (const r of robots) {
    if (t - r.born < ROBOTS.riseMs || t < r.hitUntil) continue; // still climbing out / recovering after a hit
    // hunt the nearest player that isn't their owner
    let target = null, bd = Infinity;
    for (const id of game.fighters) {
      const pl = players.get(id);
      if (!pl || pl.hp <= 0 || id === r.owner.id) continue;
      const d = Math.hypot(pl.p[0] - r.x, pl.p[2] - r.z);
      if (d < bd) { bd = d; target = pl; }
    }
    if (!target) continue;
    const dx = target.p[0] - r.x, dz = target.p[2] - r.z;
    r.yaw = Math.atan2(-dx, -dz);
    if (bd <= ROBOTS.reach && target.p[1] < 1.5) {
      damage(target, ROBOTS.damage, r.owner, 'robot');
      broadcast({ t: 'fx', kind: 'robothit', robot: r.id, to: target.id });
      r.hitUntil = t + ROBOTS.hitCooldownMs;
      r.x -= dx / bd * 2; r.z -= dz / bd * 2; // bounce back
    } else {
      const step = Math.min(bd, ROBOTS.speed * dt);
      r.x += dx / bd * step; r.z += dz / bd * step;
    }
    r.x = Math.max(-HALF, Math.min(HALF, r.x)); r.z = Math.max(-HALF, Math.min(HALF, r.z));
  }
}

function bombRain(owner) {
  announce(`💣 ${owner.name} triggered the BOMBS — 100 incoming and they hit EVERYONE! Find a clear spot!`, 3000);
  const fightId = game.fightStartedAt;
  const list = [];
  for (let i = 0; i < BOMBS.count; i++) {
    const x = (Math.random() * 2 - 1) * (HALF - 1);
    const z = (Math.random() * 2 - 1) * (HALF - 1);
    const delay = Math.round(Math.random() * BOMBS.spreadMs);
    list.push([+x.toFixed(2), +z.toFixed(2), delay]);
    setTimeout(() => {
      if (game.phase !== 'fight' || game.fightStartedAt !== fightId) return;
      for (const id of game.fighters) {   // bombs hit everyone, including whoever dropped them
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
      case 'soloStart': {
        // alone on the yellow (Say Cheese) or blue (Dance Dance Disco) pads: play with everyone on this camera
        if (game.phase !== 'lobby') break;
        const mode = msg.mode === 'disco' ? 'disco' : 'cheese';
        const mine = padFighters(padOccupants(modePads(mode)));
        if (mine.length === 1 && mine[0] === pl.id) {
          game.phase = 'countdown'; game.mode = mode; game.solo = true;
          game.fighters = mine; game.phaseEndsAt = now() + 3000;
          broadcast({ t: 'countdown', fighters: mine, mode });
        }
        break;
      }
      case 'invite': {
        // alone on a pad: invite everyone else in the arena
        const mode = asMode(msg.mode);
        if (game.phase !== 'lobby' && game.phase !== 'countdown') break;
        if (!padFighters(padOccupants(modePads(mode))).includes(pl.id)) break;
        if (now() - (pl.lastInvite || 0) < 8000) break;   // no spamming
        pl.lastInvite = now();
        for (const other of players.values()) {
          if (other.id !== pl.id) send(other.ws, { t: 'invite', from: pl.id, name: pl.name, mode });
        }
        send(ws, { t: 'msg', text: `📣 Invite sent to ${players.size - 1} player${players.size === 2 ? '' : 's'}`, ms: 2500 });
        break;
      }
      case 'acceptInvite': {
        // jump onto a free pad of that game
        const mode = asMode(msg.mode);
        if (game.phase !== 'lobby' && game.phase !== 'countdown') break;
        if (game.phase === 'countdown' && game.mode !== mode) break;
        const list = modePads(mode);
        const occ = padOccupants(list);
        const i = occ.findIndex(o => o.length === 0);
        if (i < 0) { send(ws, { t: 'msg', text: 'Sorry, all the pads are taken!', ms: 2500 }); break; }
        pl.p = [list[i].x, 0, list[i].z];
        pl.lockUntil = now() + 600;
        send(ws, { t: 'teleport', p: pl.p, yaw: pl.yaw, lockMs: 600, launchMs: 450 });
        break;
      }
      case 'cheeseCount':
        if (game.mode === 'disco') break;   // Disco doesn't ask how many players
        if (cheese?.local && cheese.host === pl.id) setLocalCount(msg.n);
        break;
      case 'cheeseFaces': {
        // local game: the host's camera reports whether it can see every player's face
        const g = game.mode === 'disco' ? disco : cheese;
        if (g?.local && g.host === pl.id) g.facesOk = !!msg.ok;
        break;
      }
      case 'cheeseReady': {
        if (game.mode === 'disco') { if (disco?.devices.includes(pl.id)) disco.ready.add(pl.id); break; }
        const cp = cheese?.players.find(c => c.id === pl.id);
        if (cp) { cp.ready = true; cp.camera = !!msg.camera; }
        break;
      }
      case 'dancePhoto': {
        // a snapshot of one dancer, shown next to their score for everyone
        if (!disco || typeof msg.data !== 'string' || !msg.data.startsWith('data:image/jpeg;base64,') || msg.data.length > 80000) break;
        const d = disco.dancers.get(`${pl.id}:${msg.tid}`);
        if (!d) break;
        d.photo = msg.data;
        broadcast({ t: 'dancePhoto', key: d.key, data: msg.data });
        break;
      }
      case 'danceBodies': {
        // the bodies this device's camera sees right now: [trackId, slot (1-4), energy]
        if (!disco || !disco.devices.includes(pl.id) || !Array.isArray(msg.bodies)) break;
        if (disco.stage !== 'dance' && disco.stage !== 'camera') break;
        const multi = discoDevices().length > 1;
        for (const b of msg.bodies.slice(0, 4)) {
          if (!Array.isArray(b)) continue;
          const [tid, slot, e] = b;
          if (!Number.isFinite(tid) || !Number.isFinite(slot) || !Number.isFinite(e)) continue;
          const key = `${pl.id}:${tid}`;
          let d = disco.dancers.get(key);
          if (!d) {
            d = { key, owner: pl.id, tid, slot, score: 0, energy: 0, lastSeen: 0, name: multi ? `${pl.name} · Dancer ${slot}` : `Dancer ${slot}` };
            disco.dancers.set(key, d);
          }
          d.slot = slot;
          d.energy = disco.stage === 'dance' ? Math.max(0, Math.min(100, e)) : 0;
          d.lastSeen = now();
        }
        break;
      }
      case 'cheeseScore': {
        if (!cheese || cheese.stage !== 'pose') break;
        const set = (cp, v) => { if (cp && Number.isFinite(v)) { cp.score = Math.max(0, Math.min(100, v)); cp.best = Math.max(cp.best, cp.score); } };
        if (cheese.local && cheese.host === pl.id && Array.isArray(msg.scores)) cheese.players.forEach((cp, i) => set(cp, msg.scores[i]));
        else set(cheese.players.find(c => c.id === pl.id), msg.s);
        break;
      }
      case 'cheesePhoto': {
        // close-up of the round winner's face from their best moment, shown on the back wall for everyone
        if (!cheese || !cheese.photoFrom || typeof msg.data !== 'string') break;
        const allowed = cheese.local ? cheese.host === pl.id : cheese.photoFrom === pl.id;
        if (!allowed || !msg.data.startsWith('data:image/jpeg;base64,') || msg.data.length > 400000) break;
        const cp = cheese.players.find(c => c.id === cheese.photoFrom);
        cheese.photoFrom = null;
        if (cheese.stage === 'flash') cheese.stageEndsAt = Math.min(cheese.stageEndsAt, now() + 300);
        broadcast({ t: 'cheesePhoto', id: cp?.id, name: cp?.name ?? pl.name, emotion: cheese.emotion, data: msg.data });
        break;
      }
      case 'adminMode': {
        if (!pl.admin) break;
        pl.adminMode = !!msg.on;
        send(ws, { t: 'adminMode', on: pl.adminMode });
        break;
      }
      case 'giveWeapon': {
        // admin mode: take any weapon off the weapon wall
        if (!pl.admin || !pl.adminMode || !WEAPONS[msg.type]) break;
        if (WEAPONS[msg.type].instant) { useInstant(pl, msg.type); break; }
        pl.weapon = { type: msg.type, uses: usesOf(msg.type) };
        pl.lastAttack = 0;
        send(ws, { t: 'picked', weapon: msg.type });
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
    if (game.phase === 'fight' && game.fighters.includes(pl.id)) {
      const alive = aliveFighters();
      if (alive.length <= 1) endFight(alive[0], `${pl.name} left the match`);
    }
    // during the countdown, tickGame drops players who left
  });
});

// Invincible players hurt anyone they run into
function tickRams(t) {
  if (game.phase !== 'fight') return;
  for (const id of game.fighters) {
    const pl = players.get(id);
    if (!pl || t >= pl.invincibleUntil || pl.hp <= 0) continue;
    if (t - pl.lastRam < INVINCIBLE.ramCooldownMs) continue;
    let rammed = false;
    for (const opp of opponentsOf(pl)) {
      const d = Math.hypot(opp.p[0] - pl.p[0], opp.p[2] - pl.p[2]);
      if (d <= INVINCIBLE.ramRange && Math.abs(opp.p[1] - pl.p[1]) < 2) {
        broadcast({ t: 'fx', kind: 'ram', from: pl.id, to: opp.id, weapon: 'invincible' });
        damage(opp, INVINCIBLE.ramDamage, pl, 'invincible');
        rammed = true;
      }
    }
    if (rammed) pl.lastRam = t;
  }
}

// 20 Hz snapshots
setInterval(() => {
  tickGame();
  const t = now();
  tickRams(t);
  tickLava(t);
  tickRobots(t, 0.05);
  const snap = {
    t: 'snap',
    phase: game.phase,
    countdown: game.phase === 'countdown' ? Math.max(0, game.phaseEndsAt - t) : 0,
    fighters: game.fighters,
    pads: padOccupants().map(o => o.length > 0),
    mode: game.mode,
    disco: disco && game.phase !== 'lobby' ? {
      stage: disco.stage, hype: +disco.hype.toFixed(3), total: Math.round(disco.total || 0), goal: DISCO.goalPoints, left: Math.max(0, disco.stageEndsAt - t),
      elapsed: disco.danceStart ? t - disco.danceStart : 0, devices: discoDevices(),
      dancers: visibleDancers(t).sort((a, b) => a.owner - b.owner || a.slot - b.slot)   // Dancer 1, 2, 3, 4 per camera
        .map(d => [d.key, Math.round(d.energy), Math.round(d.score), d.name, d.owner, d.slot]),
    } : null,
    cheese: cheese && game.phase !== 'lobby' ? {
      stage: cheese.stage, round: cheese.round, emotion: cheese.emotion, left: Math.max(0, cheese.stageEndsAt - t),
      players: cheesePlayers().map(cp => [cp.id, Math.round(cp.score), Math.round(cp.best), cp.wins, cp.ready || cheese.local ? 1 : 0, cp.name, cp.virtual ? 1 : 0]),
      local: cheese.local, host: cheese.host, facesOk: cheese.facesOk,
    } : null,
    walls: walls.map(w => [w.up ? 1 : 0, t - w.changedAt]),
    wallsLeft: Math.max(0, wallsActiveUntil - t),
    lava: lava ? { mask: lava.mask, age: t - lava.start } : null,
    robots: robots.map(r => [r.id, +r.x.toFixed(2), +r.z.toFixed(2), +(r.yaw || 0).toFixed(2), t - r.born]),
    jumpPads: ARENA.jumpPads.map((_, i) => { const p = jumpPadPos(i, t / 1000); return [+p.x.toFixed(2), +p.z.toFixed(2)]; }),
    players: [...players.values()].map(pl => ({
      id: pl.id, name: pl.name, color: pl.color, p: pl.p, yaw: pl.yaw, pitch: pl.pitch,
      streak: pl.streak, muscle: Math.min(5, pl.streak),
      inv: Math.max(0, pl.invincibleUntil - t),
      cloak: Math.max(0, pl.cloakUntil - t),
      moving: pl.moving, hp: pl.hp, w: pl.weapon ? pl.weapon.type : null, uses: pl.weapon ? pl.weapon.uses : 0,
    })),
    weapons: [...weapons.values()].map(w => ({ id: w.id, type: w.type, x: w.x, z: w.z, spin: w.spin, age: t - w.spawnAt })),
  };
  broadcast(snap);
}, 50);

server.listen(PORT, () => console.log(`Double Player running on http://localhost:${PORT}`));
