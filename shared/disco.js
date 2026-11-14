// Dance Dance Disco settings (shared by server and client)
export const DISCO = {
  // players line up in the middle of the room, facing the camera (toward the south wall)
  spots: [{ x: 4.5, z: 0 }, { x: 1.5, z: 0 }, { x: -1.5, z: 0 }, { x: -4.5, z: 0 }],
  goalPoints: 500,      // the party meter fills as the dancers' combined points reach this, then BOOM
  maxEnergy: 80,        // energy (0-100) shown as "max dancing" (gold bar)
  hypeRiseSec: 14,      // seconds of everyone max dancing to fill the party meter
  hypeFallSec: 7,       // seconds for a full meter to drain if someone stops
  boomMs: 4500,         // explosion + flying through the air
  maxMs: 150000,        // the party ends after 2.5 minutes if the floor never explodes
  cameraWaitMs: 20000,  // most we wait for cameras / faces before the music starts
};
