// Hydra Cubed settings (shared by server and client)
export const HYDRA = {
  monsterPos: { x: 0, z: -6 },     // where the monsters rise
  arcRadius: 8,                    // players stand in an arc this far from the monster
  arcSpreadDeg: 100,               // total width of the arc
  pvpRadius: 5,                    // after the hydra, survivors face each other in a circle

  shieldUpMs: 2000,                // shield stays up this long...
  shieldCooldownMs: 2000,          // ...then can't be raised again for this long
  swingCooldownMs: 1000,           // sword can be swung once a second
  hitsToKill: 4,                   // helmet, arm armor, chest armor, then dead

  swayMs: [2500, 4500],            // monsters sway this long (random) before winding up
  windupMs: { cobra: 1100, twin: 1000, hydra: 900 },   // head cocked back before the strike
  vulnerableMs: 1600,              // after a strike you can hit back for this long
  riseMs: 2600,                    // next monster rising from the corpse
  calibrateMs: 20000,              // most we wait for players to get set up

  // monster lineup: hit points and heads (head names are from the targeted player's point of view)
  monsters: {
    cobra: { name: 'Cobra', hp: 1, heads: ['middle'], color: 0x39ff14 },
    twin: { name: 'Twin-Headed Hound', hp: 2, heads: ['left', 'right'], color: 0xb388ff },
    hydra: { name: 'Hydra', hp: 3, heads: ['left', 'middle', 'right'], color: 0x00ffc8 },
  },
  order: ['cobra', 'twin', 'hydra'],
};

// The arc of spots facing the monster, and the yaw that faces it (models face -z at yaw 0)
export function hydraSpots(n) {
  const M = HYDRA.monsterPos, spread = (HYDRA.arcSpreadDeg * Math.PI) / 180;
  return Array.from({ length: n }, (_, i) => {
    const a = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
    const x = M.x + Math.sin(a) * HYDRA.arcRadius, z = M.z + Math.cos(a) * HYDRA.arcRadius;
    return { x, z, yaw: Math.atan2(-(M.x - x), -(M.z - z)) };
  });
}
// After the monsters: survivors in a circle around the monster spot, facing the middle
export function pvpSpots(n) {
  const M = HYDRA.monsterPos;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const x = M.x + Math.sin(a) * HYDRA.pvpRadius, z = M.z + Math.cos(a) * HYDRA.pvpRadius;
    return { x, z, yaw: Math.atan2(-(M.x - x), -(M.z - z)) };
  });
}
