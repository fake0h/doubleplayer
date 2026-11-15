// Steam Tunnels settings and the maze generator (shared, so the server only has to send a seed)
const FT = 0.3048;
export const TUNNELS = {
  cell: 50 * FT,          // grid spacing: every tunnel run is 50 ft (1 cell) to 200 ft (4 cells) long
  cols: 7, rows: 7,
  maxRun: 4,              // longest straight run in cells (200 ft)
  width: 8 * FT,          // tunnels are taller than wide: 8 ft wide...
  height: 12 * FT,        // ...12 ft tall
  findDist: 3.2,          // how close you need to get to the painting
  timeLimitMs: 8 * 60 * 1000,
  walkSpeed: 4.6, runSpeed: 8.5,
  eyeHeight: 1.65,
};

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// directions: 0 = +x (east), 1 = +z (south), 2 = -x (west), 3 = -z (north)
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function cellCenter(i, j) {
  const C = TUNNELS.cell;
  return { x: (i - (TUNNELS.cols - 1) / 2) * C, z: (j - (TUNNELS.rows - 1) / 2) * C };
}

// Carve a maze (depth-first, with straight runs capped at 200 ft and a taste for long runs),
// then hide the painting at the dead end farthest from the ladder down.
export function makeMaze(seed) {
  const { cols, rows, maxRun } = TUNNELS;
  const rnd = mulberry32(seed);
  const open = Array.from({ length: cols * rows }, () => [false, false, false, false]);
  const idx = (i, j) => j * cols + i;
  const seen = new Set();
  const start = { i: 0, j: rows - 1 };
  const stack = [{ i: start.i, j: start.j, dir: -1, run: 0 }];
  seen.add(idx(start.i, start.j));
  while (stack.length) {
    const c = stack[stack.length - 1];
    let options = [0, 1, 2, 3].filter(d => {
      const ni = c.i + DIRS[d][0], nj = c.j + DIRS[d][1];
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || seen.has(idx(ni, nj))) return false;
      return !(d === c.dir && c.run >= maxRun);
    });
    if (!options.length) { stack.pop(); continue; }
    // shuffle, but often keep going straight so runs vary between 50 and 200 ft
    for (let k = options.length - 1; k > 0; k--) {        // Fisher-Yates: same result in every browser and on the server
      const r = Math.floor(rnd() * (k + 1));
      [options[k], options[r]] = [options[r], options[k]];
    }
    if (c.dir >= 0 && options.includes(c.dir) && rnd() < 0.55) options = [c.dir];
    const d = options[0];
    const ni = c.i + DIRS[d][0], nj = c.j + DIRS[d][1];
    open[idx(c.i, c.j)][d] = true;
    open[idx(ni, nj)][(d + 2) % 4] = true;
    seen.add(idx(ni, nj));
    stack.push({ i: ni, j: nj, dir: d, run: d === c.dir ? c.run + 1 : 1 });
  }
  // a few extra openings make loops, so it's a real maze to get lost in
  for (let k = 0; k < 6; k++) {
    const i = Math.floor(rnd() * cols), j = Math.floor(rnd() * rows), d = Math.floor(rnd() * 4);
    const ni = i + DIRS[d][0], nj = j + DIRS[d][1];
    if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
    open[idx(i, j)][d] = true; open[idx(ni, nj)][(d + 2) % 4] = true;
  }
  // farthest dead end from the start
  const dist = new Array(cols * rows).fill(-1);
  dist[idx(start.i, start.j)] = 0;
  const q = [start];
  while (q.length) {
    const c = q.shift();
    open[idx(c.i, c.j)].forEach((o, d) => {
      if (!o) return;
      const ni = c.i + DIRS[d][0], nj = c.j + DIRS[d][1];
      if (dist[idx(ni, nj)] < 0) { dist[idx(ni, nj)] = dist[idx(c.i, c.j)] + 1; q.push({ i: ni, j: nj }); }
    });
  }
  let best = null;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const deg = open[idx(i, j)].filter(Boolean).length;
    if ((i === start.i && j === start.j) || deg !== 1) continue;
    if (!best || dist[idx(i, j)] > best.d) best = { i, j, d: dist[idx(i, j)] };
  }
  // the painting hangs on the dead end's back wall, facing back down the tunnel
  const openDir = open[idx(best.i, best.j)].findIndex(Boolean);
  const back = (openDir + 2) % 4;
  const cc = cellCenter(best.i, best.j), hw = TUNNELS.width / 2;
  const painting = { i: best.i, j: best.j, x: cc.x + DIRS[back][0] * (hw - 0.05), z: cc.z + DIRS[back][1] * (hw - 0.05), facing: openDir };
  const startDir = open[idx(start.i, start.j)].findIndex(Boolean);
  const sc = cellCenter(start.i, start.j);
  return { seed, open, idx, start: { ...start, x: sc.x, z: sc.z, yaw: Math.atan2(-DIRS[startDir][0], -DIRS[startDir][1]) }, painting };
}

// tunnel rectangles you can stand in (axis-aligned): one per open connection, plus each cell's middle
export function walkRects(maze) {
  const { cols, rows } = TUNNELS, hw = TUNNELS.width / 2, rects = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = cellCenter(i, j);
    rects.push([a.x - hw, a.z - hw, a.x + hw, a.z + hw]);
    for (const d of [0, 1]) {
      if (!maze.open[maze.idx(i, j)][d]) continue;
      const b = cellCenter(i + DIRS[d][0], j + DIRS[d][1]);
      rects.push([Math.min(a.x, b.x) - hw, Math.min(a.z, b.z) - hw, Math.max(a.x, b.x) + hw, Math.max(a.z, b.z) + hw]);
    }
  }
  return rects;
}
export function canStand(rects, x, z, r = 0.3) {
  return rects.some(([x0, z0, x1, z1]) => x >= x0 + r && x <= x1 - r && z >= z0 + r && z <= z1 - r);
}
