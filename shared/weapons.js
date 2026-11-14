// Shared weapon definitions — imported by the server (rules) and the client (visuals/HUD).
// kind: 'melee' hits anything inside range + cone in front of you.
//       'ranged' fires along your aim; hits if the target is inside a narrow cone.
//       'spray' is a short, wide-cone ranged attack (flamethrower, water pistol).
// splash: extra radius damage around the target (rocket launcher).
// cooldown in ms between uses. Every weapon has 3 uses (USES_PER_WEAPON).

export const USES_PER_WEAPON = 3;
export const MAX_HEALTH = 100;

export const WEAPONS = {
  pool_noodle:     { name: 'Pool Noodle',      kind: 'melee',  damage: 2,  range: 3.0, cone: 70, cooldown: 400,  color: 0xff4fd8, rarity: 3 },
  water_pistol:    { name: 'Water Pistol',     kind: 'spray',  damage: 1,  range: 9,   cone: 18, cooldown: 300,  color: 0x4fc3ff, rarity: 3 },
  rubber_chicken:  { name: 'Rubber Chicken',   kind: 'melee',  damage: 4,  range: 2.6, cone: 60, cooldown: 450,  color: 0xffe14f, rarity: 3 },
  foam_bat:        { name: 'Foam Bat',         kind: 'melee',  damage: 3,  range: 2.8, cone: 60, cooldown: 450,  color: 0x8fff6a, rarity: 3 },
  baguette:        { name: 'Baguette',         kind: 'melee',  damage: 5,  range: 2.7, cone: 55, cooldown: 500,  color: 0xd9a35a, rarity: 3 },
  dead_fish:       { name: 'Dead Fish',        kind: 'melee',  damage: 6,  range: 2.4, cone: 60, cooldown: 500,  color: 0x9fb8c8, rarity: 3 },
  tennis_racket:   { name: 'Tennis Racket',    kind: 'melee',  damage: 7,  range: 2.6, cone: 60, cooldown: 500,  color: 0xc8ff3c, rarity: 2 },
  umbrella:        { name: 'Umbrella',         kind: 'melee',  damage: 8,  range: 3.0, cone: 45, cooldown: 600,  color: 0x6a5cff, rarity: 2 },
  frying_pan:      { name: 'Frying Pan',       kind: 'melee',  damage: 12, range: 2.2, cone: 55, cooldown: 650,  color: 0x555555, rarity: 2 },
  boomerang:       { name: 'Boomerang',        kind: 'ranged', damage: 14, range: 18,  cone: 10, cooldown: 900,  color: 0xff8c2a, rarity: 2 },
  throwing_knives: { name: 'Throwing Knives',  kind: 'ranged', damage: 12, range: 20,  cone: 7,  cooldown: 600,  color: 0xd0d0d0, rarity: 2 },
  hockey_stick:    { name: 'Hockey Stick',     kind: 'melee',  damage: 13, range: 3.2, cone: 55, cooldown: 700,  color: 0xe8e8e8, rarity: 2 },
  baseball_bat:    { name: 'Baseball Bat',     kind: 'melee',  damage: 15, range: 2.9, cone: 55, cooldown: 700,  color: 0xb5793b, rarity: 2 },
  crowbar:         { name: 'Crowbar',          kind: 'melee',  damage: 16, range: 2.6, cone: 50, cooldown: 700,  color: 0xd42a2a, rarity: 2 },
  pistol:          { name: 'Pistol',           kind: 'ranged', damage: 18, range: 40,  cone: 5,  cooldown: 500,  color: 0x333333, rarity: 2 },
  trident:         { name: 'Trident',          kind: 'melee',  damage: 25, range: 3.8, cone: 30, cooldown: 900,  color: 0x36d6c3, rarity: 1 },
  katana:          { name: 'Katana',           kind: 'melee',  damage: 28, range: 3.0, cone: 60, cooldown: 750,  color: 0xeeeeee, rarity: 1 },
  crossbow:        { name: 'Crossbow',         kind: 'ranged', damage: 30, range: 45,  cone: 4,  cooldown: 1200, color: 0x7a4a22, rarity: 1 },
  flamethrower:    { name: 'Flamethrower',     kind: 'spray',  damage: 30, range: 8,   cone: 30, cooldown: 1000, color: 0xff5a1f, rarity: 1 },
  battle_axe:      { name: 'Battle Axe',       kind: 'melee',  damage: 32, range: 3.0, cone: 55, cooldown: 1000, color: 0x8a8a8a, rarity: 1 },
  flaming_sword:   { name: 'Flaming Sword',    kind: 'melee',  damage: 35, range: 3.2, cone: 60, cooldown: 900,  color: 0xff3d00, rarity: 1 },
  shotgun:         { name: 'Shotgun',          kind: 'ranged', damage: 35, range: 14,  cone: 14, cooldown: 1300, color: 0x4a3020, rarity: 1 },
  warhammer:       { name: 'Warhammer',        kind: 'melee',  damage: 38, range: 3.0, cone: 50, cooldown: 1200, color: 0x6f6f7f, rarity: 1 },
  plasma_blade:    { name: 'Plasma Blade',     kind: 'melee',  damage: 40, range: 3.2, cone: 60, cooldown: 800,  color: 0x39ff14, rarity: 1 },
  chainsaw:        { name: 'Chainsaw',         kind: 'melee',  damage: 45, range: 2.6, cone: 60, cooldown: 1100, color: 0xffa600, rarity: 1 },
  sniper_rifle:    { name: 'Sniper Rifle',     kind: 'ranged', damage: 55, range: 90,  cone: 2,  cooldown: 2000, color: 0x2e4a2e, rarity: 1 },
  rocket_launcher: { name: 'Rocket Launcher',  kind: 'ranged', damage: 60, range: 60,  cone: 5,  cooldown: 2200, color: 0x3a5f2a, rarity: 1, splash: 4 },

  // ---- SPECIAL weapons: rare, glow from across the room, have special powers ----
  berserk_helmet: { name: 'Berzerk Helmet',    kind: 'berserk', damage: 20, range: 45, cone: 360, cooldown: 2500, color: 0xff2020, special: true, uses: 3,
                    desc: 'Wear it. Attack to launch at your enemy and punch like crazy (20 dmg)' },
  poop_bazooka:   { name: 'Poop Bazooka',      kind: 'poopgun', damage: 25, range: 35, cone: 12,  cooldown: 1800, color: 0x8b5a2b, special: true, uses: 3,
                    desc: 'Machine-guns dozens of poops (25 dmg)' },
  dragon_sword:   { name: 'Dragon Sword',      kind: 'melee',   damage: 50, range: 3.4, cone: 65, cooldown: 1000, color: 0x22e070, special: true, uses: 3,
                    desc: 'A blade from a dragon\'s jaws (50 dmg)' },
  fire_spear:     { name: 'fake0h Fire Spear', kind: 'homing',  damage: 999, range: 999, cone: 360, cooldown: 1000, color: 0xff6a00, special: true, uses: 1,
                    desc: 'Guided missile. Throw from anywhere — it always finds and kills' },
  birthday_cake:  { name: 'Birthday Cake',     kind: 'heal',    damage: 0,  range: 0,  cone: 0,   cooldown: 500,  color: 0xffb6e1, special: true, uses: 1,
                    desc: 'Eat it to restore all your health' },
  // "instant" specials take effect the moment you pick them up
  wall_breaker:   { name: 'Wall Breaker',      kind: 'walls',   damage: 0,  range: 0,  cone: 0,   cooldown: 0,    color: 0xa855ff, special: true, instant: true, uses: 1, weight: 1,
                    desc: 'Raises the maze walls for 30 seconds' },
  bomb:           { name: 'Bomb',              kind: 'bombs',   damage: 50, range: 2.4, cone: 0,  cooldown: 0,    color: 0xff3030, special: true, instant: true, uses: 1, weight: 2,
                    desc: '100 bombs rain from the ceiling and explode for 50 damage — they hit EVERYONE' },
  lava_bucket:    { name: 'Lava Bucket',       kind: 'lava',    damage: 10, range: 0,  cone: 0,   cooldown: 0,    color: 0xff5a00, special: true, instant: true, uses: 1, weight: 2,
                    desc: 'Turns about half the floor into lava for 20s (10 damage per second to anyone in it)' },
  robot_swarm:    { name: 'Robot Swarm',       kind: 'robots',  damage: 10, range: 0,  cone: 0,   cooldown: 0,    color: 0x9fb4c8, special: true, instant: true, uses: 1, weight: 2,
                    desc: '10 robots burst out of the floor and hunt the other players for 20s (10 damage per hit)' },
  invisibility_cloak: { name: 'Invisibility Cloak', kind: 'cloak', damage: 0, range: 0, cone: 0,  cooldown: 0,    color: 0x9ad8ff, special: true, instant: true, uses: 1, weight: 3,
                    desc: 'You turn invisible to the other players for 20 seconds' },
};

// ---- Hit area tuning ----
// Turn these up or down to make every weapon easier or harder to land.
export const HIT_TUNING = {
  meleeRange: 1.4,    // melee reach multiplier
  meleeCone: 1.6,     // melee swing width multiplier (capped at 150 degrees)
  rangedCone: 1.8,    // aim forgiveness multiplier for guns, bows, sprays
  splash: 1.75,       // rocket blast radius multiplier
  bodyRadius: 0.75,   // how "wide" a player's body counts as for hits (meters)
};
for (const w of Object.values(WEAPONS)) {
  if (w.special && w.kind !== 'melee') continue;  // special powers aren't cone-based
  if (w.kind === 'melee') {
    w.range = +(w.range * HIT_TUNING.meleeRange).toFixed(1);
    w.cone = Math.min(150, Math.round(w.cone * HIT_TUNING.meleeCone));
  } else {
    w.cone = Math.round(w.cone * HIT_TUNING.rangedCone);
  }
  if (w.splash) w.splash = +(w.splash * HIT_TUNING.splash).toFixed(1);
}

export const WEAPON_IDS = Object.keys(WEAPONS);
export const NORMAL_IDS = WEAPON_IDS.filter(id => !WEAPONS[id].special);
export const SPECIAL_IDS = WEAPON_IDS.filter(id => WEAPONS[id].special);
export const usesOf = (type) => WEAPONS[type].uses ?? USES_PER_WEAPON;

// Weighted random pick of a normal weapon: rarity 3 = common, 1 = rare.
export function randomWeaponType(rng = Math.random) {
  const total = NORMAL_IDS.reduce((s, id) => s + WEAPONS[id].rarity, 0);
  let r = rng() * total;
  for (const id of NORMAL_IDS) {
    r -= WEAPONS[id].rarity;
    if (r <= 0) return id;
  }
  return NORMAL_IDS[0];
}
// Weighted pick among specials (default weight 3; Wall Breaker is the rarest)
export function randomSpecialType(rng = Math.random) {
  const wt = (id) => WEAPONS[id].weight ?? 3;
  const total = SPECIAL_IDS.reduce((s, id) => s + wt(id), 0);
  let r = rng() * total;
  for (const id of SPECIAL_IDS) { r -= wt(id); if (r <= 0) return id; }
  return SPECIAL_IDS[0];
}

// Names for damage sources that aren't weapons
export const weaponName = (type) => WEAPONS[type]?.name ?? ({ invincible: 'Rainbow Ram', lava: 'Lava', robot: 'Robot Swarm' })[type] ?? type;

// Admin panel on the north wall (code is checked on the server)
export const ADMIN_PANEL = { x: 0, z: -29.5, reach: 4 };
export const INVINCIBLE = { ms: 30000, ramDamage: 10, ramRange: 1.3, ramCooldownMs: 500 };

// Lava Bucket, Robot Swarm, Invisibility Cloak settings
export const LAVA = { tile: 6, ms: 20000, warnMs: 2000, dps: 10, coverage: 0.5 };
export const ROBOTS = { count: 10, ms: 20000, speed: 4.5, damage: 10, hitCooldownMs: 1500, riseMs: 1000, reach: 1.0 };
export const CLOAK_MS = 20000;

// Bomb rain settings
export const BOMBS = { count: 100, spreadMs: 2500, fuseMs: 3000 };

// Arena layout (shared so client and server agree)
export const ARENA = {
  size: 60,          // square room, -30..30 on x and z
  height: 40,        // tall enough for the jump pads to fling you sky-high
  // The square has 4 quadrants. Two corners hold game-mode pads:
  // 4xPVP (southwest corner, neon green): 2+ players start the weapons free-for-all for up to 4
  pads: [
    { x: -24.5, z: 17.5, r: 2.2 },
    { x: -17.5, z: 17.5, r: 2.2 },
    { x: -24.5, z: 24.5, r: 2.2 },
    { x: -17.5, z: 24.5, r: 2.2 },
  ],
  // Say Cheese (northeast corner, yellow): game still being designed
  cheesePads: [
    { x: 24.5, z: -17.5, r: 2.2 },
    { x: 17.5, z: -17.5, r: 2.2 },
    { x: 24.5, z: -24.5, r: 2.2 },
    { x: 17.5, z: -24.5, r: 2.2 },
  ],
  maxFighters: 4,
  dropHeight: 36,
  gravity: 22,
  jumpSpeed: 13.9,   // 3x the original jump height (was 8)
  // Corner jump pads: launch you way up, with only a little steering on the way down
  jumpPads: [
    { x: -25, z: -25, r: 1.8 },
    { x: 25,  z: 25,  r: 1.8 },
    { x: 25,  z: -25, r: 1.8 },
    { x: -25, z: 25,  r: 1.8 },
  ],
  jumpPadSpeed: 36,  // ~29m up
  jumpPadMoveSpeed: 0.11, // how fast the jump pads roam around the arena
  airControl: 0.35,  // steering strength while falling from a jump pad (1 = full)
  // Maze walls that rise out of / sink into the floor. Axis-aligned boxes.
  // ax: 'x' = runs along x, 'z' = runs along z. len = length, wall is 0.8 thick, 5 tall.
  wallHeight: 5,
  wallThickness: 0.8,
  wallRiseMs: 1500,
  wallCycleMs: 7000,
  wallsActiveMs: 30000, // walls stay up for 30s after someone grabs a Wall Breaker
  walls: [
    { x: 0,   z: -8,  len: 8, ax: 'x' }, { x: 0,   z: 8,   len: 8, ax: 'x' },
    { x: -16, z: -4,  len: 8, ax: 'z' }, { x: 16,  z: 4,   len: 8, ax: 'z' },
    { x: -6,  z: 18,  len: 8, ax: 'z' }, { x: 6,   z: -18, len: 8, ax: 'z' },
    { x: -22, z: 4,   len: 7, ax: 'x' }, { x: 22,  z: -4,  len: 7, ax: 'x' },
    { x: 0,   z: 24,  len: 8, ax: 'x' }, { x: 0,   z: -24, len: 8, ax: 'x' },
    { x: -9,  z: -15, len: 6, ax: 'x' }, { x: 9,   z: 15,  len: 6, ax: 'x' },
    { x: 14,  z: 22,  len: 6, ax: 'z' }, { x: -14, z: -22, len: 6, ax: 'z' },
  ],
};

// Where a roaming jump pad is at time t (seconds). They circle the outer part of the
// arena on wobbly paths, staying clear of the pressure pads in the middle.
export function jumpPadPos(i, t) {
  const sp = ARENA.jumpPadMoveSpeed;
  const a = t * sp * (i % 2 === 0 ? 1 : -1.3) + i * Math.PI / 2 + Math.PI / 4;
  // two tracks: pads 0 & 2 on an outer ring, pads 1 & 3 on an inner ring (so they never collide)
  // outer track dips inward near the 4xPVP and Say Cheese corners so pads never roll over them
  const dip = Math.pow(Math.max(0, Math.cos(2 * (a - 3 * Math.PI / 4))), 2);
  const r = i % 2 === 0 ? 23.5 + 1.5 * Math.sin(t * sp * 2.3 + i * 1.7) - 6.5 * dip : 11.4 + 0.6 * Math.sin(t * sp * 2.3 + i * 1.7);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

// Footprint of a wall as an axis-aligned box on the floor
export function wallBox(w, pad = 0) {
  const hl = w.len / 2 + pad, ht = ARENA.wallThickness / 2 + pad;
  return w.ax === 'x'
    ? { x0: w.x - hl, x1: w.x + hl, z0: w.z - ht, z1: w.z + ht }
    : { x0: w.x - ht, x1: w.x + ht, z0: w.z - hl, z1: w.z + hl };
}

// Current height of a wall given whether it's going up and how long ago it changed
export function wallHeightAt(up, ageMs) {
  const k = Math.max(0, Math.min(1, ageMs / ARENA.wallRiseMs));
  const e = k * k * (3 - 2 * k); // smooth ease
  return ARENA.wallHeight * (up ? e : 1 - e);
}

// Segment a->b vs wall boxes at their current heights. Returns hit fraction (0..1) or null.
export function segmentHitsWalls(a, b, heights) {
  let best = null;
  ARENA.walls.forEach((w, i) => {
    const h = heights[i];
    if (h < 0.2) return;
    const bx = wallBox(w);
    const min = [bx.x0, 0, bx.z0], max = [bx.x1, h, bx.z1];
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 3; k++) {
      const d = b[k] - a[k];
      if (Math.abs(d) < 1e-9) { if (a[k] < min[k] || a[k] > max[k]) return; continue; }
      let ta = (min[k] - a[k]) / d, tb = (max[k] - a[k]) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return;
    }
    if (best === null || t0 < best) best = t0;
  });
  return best;
}

// Time for a weapon to fall from the ceiling to the floor (ms)
export const FALL_MS = Math.sqrt((2 * (ARENA.dropHeight - 0.3)) / ARENA.gravity) * 1000;
