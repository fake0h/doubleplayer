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
export function randomSpecialType(rng = Math.random) {
  return SPECIAL_IDS[Math.floor(rng() * SPECIAL_IDS.length)];
}

// Arena layout (shared so client and server agree)
export const ARENA = {
  size: 60,          // square room, -30..30 on x and z
  height: 22,
  pads: [
    { x: -8, z: 0, r: 2.2 },
    { x: 8,  z: 0, r: 2.2 },
  ],
  dropHeight: 20,
  gravity: 22,
};

// Time for a weapon to fall from the ceiling to the floor (ms)
export const FALL_MS = Math.sqrt((2 * (ARENA.dropHeight - 0.3)) / ARENA.gravity) * 1000;
