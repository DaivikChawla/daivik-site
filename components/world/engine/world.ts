// The miniature world: a floating island (static terrain) and everything that gets
// built on it, each block carrying the moment in the build when it lands.
//
// Build space B:
//   [0, 1)   by hand: the MysteryStudios keep's first courses, one block at a time
//   [1, 2)   automated: the wave that builds the rest of the island
//   [2, 2.5) pagewalla's construction site and crane, built as the camera arrives
//   [2.5, 3] Vesper's lantern and orb, built as the camera arrives

import { clamp, makeNoise2, rng, type Vec3 } from "./math";

export const DIMS: Vec3 = [64, 48, 64];
const [W, H, D] = DIMS;
export const SURF = 22; // ground level: y of the top terrain block on flat land

export const M = {
  GRASS: 0, DIRT: 1, STONE: 2, STONE_DARK: 3, PATH: 4, WATER: 5, WOOD: 6, PLANK: 7,
  LEAF: 8, LEAF2: 9, BLOSSOM: 10, PLASTER: 11, ROOF: 12, SLATE: 13, HAND: 14, GLASS: 15,
  COBALT: 16, VIOLET: 17, GOLD: 18, PINK: 19, TEAL: 20, CRANE: 21, CLOUD: 22, LAMP: 23,
  IRON: 24, FLOWER: 25, MINT: 26, PEACH: 27, ORB: 28, SAND: 29, PINE: 30, ROCK: 31,
} as const;

/** Sub-block shapes (see SHAPES in shaders.ts). */
export const S = { FULL: 0, HALF: 1, POST: 2, SLAB: 3, TINY: 4, CABLE: 5, PLATE_Z: 6, AWNING: 7, PLATE_X: 8, CORE: 9 } as const;

export const G = { NONE: 0, JIB: 1, CLOUD_A: 2, CLOUD_B: 3, ORB: 4, FLAG: 5, HOOK: 6 } as const;

export const KIND = { STATIC: 0, HAND: 1, AUTO: 2 } as const;

type Block = {
  x: number; y: number; z: number;
  mat: number; shape: number; group: number; kind: number;
  s: number; // threshold in build space (static: -1)
};

export type Light = { pos: Vec3; size: number; kind: "lamp" | "orb" };

export type WorldData = {
  count: number;
  staticCount: number;
  pos: Float32Array; // xyz per instance
  info: Float32Array; // mat, shape, group, kind per instance
  thresholds: Float32Array; // built blocks only, ascending
  occStatic: Uint8Array; // W*H*D
  occIndex: Int32Array; // per built block: voxel index into occupancy, or -1
  occWeight: Float32Array; // per built block: how much it occludes (small shapes less)
  lights: Light[];
  anchors: Record<"center" | "keep" | "ms" | "pw" | "crane" | "vesper" | "orb", Vec3>;
  pivots: { jib: Vec3; orb: Vec3; flag: Vec3 };
  cloudSpan: [number, number];
  handCount: number;
};

export function buildWorld(): WorldData {
  const rand = rng(20231013);
  const n1 = makeNoise2(11);
  const n2 = makeNoise2(29);
  const n3 = makeNoise2(53);

  const blocks = new Map<number, Block>();
  const key = (x: number, y: number, z: number) => (z * 256 + (y + 64)) * 256 + (x + 96);
  const put = (b: Block) => blocks.set(key(b.x, b.y, b.z), b);
  const has = (x: number, y: number, z: number) => blocks.has(key(x, y, z));

  // ── island footprint and height field ───────────────────────────────────
  const cx = 32, cz = 32;
  const top: number[][] = [];
  const bot: number[][] = [];
  const inside: boolean[][] = [];
  const radiusAt = (ang: number) => 24 + 4.5 * n1(Math.cos(ang) * 1.6 + 7, Math.sin(ang) * 1.6 + 7);

  // zones that must be flat (plots) as soft masks
  const dist = (x: number, z: number, px: number, pz: number) => Math.hypot(x - px, z - pz);
  const flatW = (x: number, z: number) => {
    const ms = x >= 9 && x <= 30 && z >= 8 && z <= 31 ? 1 : 0;
    const pw = x >= 35 && x <= 56 && z >= 15 && z <= 35 ? 1 : 0;
    const plaza = dist(x, z, 32, 33) < 6 ? 1 : 0;
    const pond = x >= 9 && x <= 22 && z >= 31 && z <= 41 ? 1 : 0;
    return Math.max(ms, pw, plaza, pond);
  };

  for (let x = 0; x < W; x++) {
    top[x] = [];
    bot[x] = [];
    inside[x] = [];
    for (let z = 0; z < D; z++) {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
      const d = Math.hypot(dx, dz);
      const r = radiusAt(Math.atan2(dz, dx));
      const isIn = d < r && x > 1 && z > 1 && x < W - 2 && z < D - 2;
      inside[x][z] = isIn;
      if (!isIn) continue;
      let h = SURF;
      const flat = flatW(x, z);
      // gentle rolling hills, broad enough that steps sit far apart
      const hills = (n2(x * 0.065, z * 0.065) - 0.5) * 5.5 + (n3(x * 0.13, z * 0.13) - 0.5) * 1.2;
      if (!flat) h += Math.max(0, Math.min(3, Math.round(hills)));
      // Vesper's hill, by the south edge: a soft dome
      const vh = dist(x, z, 30.5, 47.5);
      h += Math.round(4 * Math.pow(clamp((10.5 - vh) / 8.5), 1.4));
      top[x][z] = h;
      const t = 3 + 18 * Math.pow(Math.max(0, 1 - d / r), 0.8) * (0.72 + 0.56 * n3(x * 0.075 + 40, z * 0.075));
      bot[x][z] = Math.round(h - t);
    }
  }

  // no lone spikes or pits: they read as noise at miniature scale
  for (let pass = 0; pass < 2; pass++)
    for (let x = 1; x < W - 1; x++)
      for (let z = 1; z < D - 1; z++) {
        if (!inside[x][z]) continue;
        const nb = [top[x + 1]?.[z], top[x - 1]?.[z], top[x][z + 1], top[x][z - 1]].filter((v) => v !== undefined) as number[];
        if (nb.length < 4) continue;
        const hi = Math.max(...nb), lo = Math.min(...nb);
        if (top[x][z] > hi) top[x][z] = hi;
        else if (top[x][z] < lo) top[x][z] = lo;
      }

  // ── plan: paths (trenches) and water basins carved into the static terrain ─
  const pathCells = new Set<number>();
  const ck = (x: number, z: number) => z * 256 + x;
  const stroke = (pts: [number, number][], width: number) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s <= len * 3; s++) {
        const t = s / (len * 3);
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        for (let ox = -1; ox <= 1; ox++)
          for (let oz = -1; oz <= 1; oz++) {
            const x = Math.round(px + ox * 0.5 * (width - 1)), z = Math.round(pz + oz * 0.5 * (width - 1));
            if (inside[x]?.[z] && Math.hypot(x - px, z - pz) <= width * 0.5 + 0.2) pathCells.add(ck(x, z));
          }
      }
    }
  };
  stroke([[19.5, 26], [24, 29], [29, 31.5]], 2); // MysteryStudios gate → plaza
  stroke([[35.5, 31.2], [55, 31.2]], 2.2); // plaza → pagewalla high street
  stroke([[32, 38], [31, 41], [30, 43]], 2); // plaza → Vesper
  stroke([[27, 33], [23, 35]], 1.6); // plaza → pond
  // plaza disc
  for (let x = 27; x <= 37; x++)
    for (let z = 28; z <= 38; z++) if (dist(x, z, 32, 33) <= 4.2 && inside[x][z]) pathCells.add(ck(x, z));

  const waterCells = new Map<number, number>(); // cell → depth
  for (let x = 9; x <= 22; x++)
    for (let z = 31; z <= 41; z++) {
      const e = ((x - 15.5) / 5.4) ** 2 + ((z - 36) / 4.2) ** 2;
      if (e < 1 && inside[x][z]) waterCells.set(ck(x, z), e < 0.45 ? 2 : 1);
    }
  // stream from the pond to the south-west rim
  const streamPts: [number, number][] = [];
  for (let z = 40; z < D; z++) {
    const x = Math.round(14 + Math.sin(z * 0.35) * 1.2);
    for (const xx of [x, x + 1]) {
      if (!inside[xx]?.[z]) continue;
      if (!waterCells.has(ck(xx, z))) waterCells.set(ck(xx, z), 1);
      streamPts.push([xx, z]);
    }
  }
  let fallX = 14, fallZ = 40;
  for (const [x, z] of streamPts) if (z >= fallZ) { fallX = x; fallZ = z; }

  // ── static terrain columns ──────────────────────────────────────────────
  const staticOcc = new Uint8Array(W * H * D);
  const vid = (x: number, y: number, z: number) => x + W * (y + H * z);
  const inGrid = (x: number, y: number, z: number) => x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D;
  const groundTop: number[][] = []; // y of the solid static top after carving
  for (let x = 0; x < W; x++) {
    groundTop[x] = [];
    for (let z = 0; z < D; z++) {
      if (!inside[x][z]) continue;
      let t = top[x][z];
      const c = ck(x, z);
      if (waterCells.has(c)) t -= waterCells.get(c)!;
      else if (pathCells.has(c)) t -= 1;
      groundTop[x][z] = t;
      for (let y = Math.max(0, bot[x][z]); y <= t; y++) staticOcc[vid(x, y, z)] = 1;
    }
  }
  const sOcc = (x: number, y: number, z: number) => (inGrid(x, y, z) ? staticOcc[vid(x, y, z)] : 0);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) {
      if (!inside[x][z]) continue;
      const t = groundTop[x][z];
      const b0 = Math.max(0, bot[x][z]);
      const c = ck(x, z);
      for (let y = b0; y <= t; y++) {
        const enclosed =
          sOcc(x + 1, y, z) && sOcc(x - 1, y, z) && sOcc(x, y + 1, z) && sOcc(x, y - 1, z) && sOcc(x, y, z + 1) && sOcc(x, y, z - 1);
        if (enclosed) continue;
        const depth = t - y;
        let mat: number = M.STONE;
        const band = SURF - 8 + Math.round((n1(x * 0.12 + 9, z * 0.12) - 0.5) * 4);
        if (depth === 0) mat = waterCells.has(c) ? M.STONE : pathCells.has(c) ? M.DIRT : M.GRASS;
        else if (depth <= 2) mat = M.DIRT;
        else if (y < band) mat = M.STONE_DARK;
        put({ x, y, z, mat, shape: S.FULL, group: 0, kind: KIND.STATIC, s: -1 });
      }
    }

  // ── built things ────────────────────────────────────────────────────────
  type Part = { b: Block[]; s0: number; s1: number; order?: (b: Block) => number };
  const parts: Part[] = [];
  const part = (s0: number, s1: number, order?: (b: Block) => number) => {
    const p: Part = { b: [], s0, s1, order };
    parts.push(p);
    return p;
  };
  const add = (p: Part, x: number, y: number, z: number, mat: number, shape: number = S.FULL, group: number = 0) =>
    p.b.push({ x, y, z, mat, shape, group, kind: KIND.AUTO, s: 0 });
  const gTop = (x: number, z: number) => (inside[x]?.[z] ? top[x][z] : SURF);

  // paths and plaza, a wave outward from the studio gate
  const paths = part(1.08, 1.62, (b) => Math.hypot(b.x - 20, b.z - 26));
  for (const c of pathCells) {
    const x = c % 256, z = Math.floor(c / 256);
    if (waterCells.has(c)) continue;
    add(paths, x, top[x][z], z, M.PATH);
  }

  // water: pond, stream, then the fall over the rim
  const water = part(1.38, 1.62, (b) => b.z * 2 - b.y);
  for (const [c, depth] of waterCells) {
    const x = c % 256, z = Math.floor(c / 256);
    for (let k = 0; k < depth; k++) add(water, x, top[x][z] - k, z, M.WATER);
  }
  const fall = part(1.6, 1.78, (b) => -b.y);
  {
    const fx = fallX;
    const z0 = fallZ + 1;
    const yTop = gTop(fx, fallZ);
    for (const xx of [fx - 1, fx, fx + 1]) {
      // hang down the cliff, fall free, then break up into spray above the clouds
      const y0 = xx === fx + 1 ? yTop - 1 : yTop;
      for (let y = y0; y > yTop - 19; y--) add(fall, xx, y, z0, M.WATER);
      for (let y = yTop - 19; y > yTop - 25; y--) if ((y + xx) % 2 === 0) add(fall, xx, y, z0, M.WATER, y > yTop - 22 ? S.HALF : S.TINY);
    }
  }

  // MysteryStudios: the keep. Its first three courses are laid by hand (orange).
  const KX = 14, KZ = 16, KS = 7; // keep footprint x 14..20, z 16..22
  const hand: Block[] = [];
  for (let layer = 1; layer <= 3; layer++) {
    const y = SURF + layer;
    // walk the perimeter like a bricklayer, starting at the south-west corner
    const ring: [number, number][] = [];
    for (let x = KX; x < KX + KS; x++) ring.push([x, KZ + KS - 1]);
    for (let z = KZ + KS - 2; z >= KZ; z--) ring.push([KX + KS - 1, z]);
    for (let x = KX + KS - 2; x >= KX; x--) ring.push([x, KZ]);
    for (let z = KZ + 1; z <= KZ + KS - 2; z++) ring.push([KX, z]);
    for (const [x, z] of ring) {
      const door = z === KZ + KS - 1 && x === KX + 3 && layer <= 2;
      if (door) continue;
      hand.push({ x, y, z, mat: M.HAND, shape: S.FULL, group: 0, kind: KIND.HAND, s: 0 });
    }
  }
  // the rest of the keep is automated
  const keep = part(1.0, 1.3, (b) => b.y * 40 + Math.atan2(b.z - 19, b.x - 17));
  const KH = 13;
  for (let layer = 4; layer <= KH; layer++) {
    const y = SURF + layer;
    for (let x = KX; x < KX + KS; x++)
      for (let z = KZ; z < KZ + KS; z++) {
        const wall = x === KX || x === KX + KS - 1 || z === KZ || z === KZ + KS - 1;
        if (!wall && layer !== KH - 1) continue;
        const corner = (x === KX || x === KX + KS - 1) && (z === KZ || z === KZ + KS - 1);
        const mid = x === KX + 3 || z === KZ + 3;
        const win = !corner && mid && (layer === 6 || layer === 7 || layer === 10);
        if (layer === KH && !corner && (x + z) % 2 === 1 && wall) continue; // crenellations
        add(keep, x, y, z, win ? M.GLASS : layer === KH - 1 && !wall ? M.PLANK : M.PLASTER);
      }
  }
  // banner pole + flag on the keep (flag waves)
  const flagX = KX + 3, flagZ = KZ + 3;
  const flag = part(1.88, 1.98, (b) => b.y);
  for (let y = SURF + KH - 1; y <= SURF + KH + 4; y++) add(flag, flagX, y, flagZ, M.IRON, S.CABLE);
  for (let i = 1; i <= 3; i++)
    for (let y = SURF + KH + 3; y <= SURF + KH + 4; y++) add(flag, flagX + i, y, flagZ, i === 3 && y === SURF + KH + 3 ? M.PLASTER : M.HAND, S.PLATE_Z, G.FLAG);

  // arena: stepped oval ring of seats around a sand floor
  const AX = 25.5, AZ = 12.5;
  const arena = part(1.06, 1.32, (b) => b.y * 50 + Math.atan2(b.z - AZ, b.x - AX));
  for (let x = 18; x <= 33; x++)
    for (let z = 6; z <= 19; z++) {
      if (!inside[x]?.[z]) continue;
      const e = Math.hypot((x - AX) / 6.4, (z - AZ) / 5.2);
      if (e > 1) continue;
      if (e < 0.52) add(arena, x, SURF + 1, z, M.SAND, S.SLAB);
      else {
        // seats step up and out, in coloured sections like a stadium
        const tiers = e > 0.86 ? 3 : e > 0.68 ? 2 : 1;
        const sector = Math.floor(((Math.atan2(z - AZ, x - AX) + Math.PI) / (2 * Math.PI)) * 8) % 8;
        const seat = [M.HAND, M.PLASTER, M.TEAL, M.PLASTER, M.COBALT, M.PLASTER, M.PINK, M.PLASTER][sector];
        for (let k = 1; k <= tiers; k++) add(arena, x, SURF + k, z, k === 1 ? M.STONE : k === tiers ? seat : M.PLASTER, k === tiers && k < 3 ? S.SLAB : S.FULL);
      }
    }
  for (const [x, z] of [[21, 9], [30, 9], [21, 16], [30, 16]]) {
    if (!inside[x]?.[z]) continue;
    for (let y = SURF + 4; y <= SURF + 5; y++) add(arena, x, y, z, M.IRON, S.CABLE);
    add(arena, x, SURF + 6, z, M.HAND, S.HALF);
  }

  // market: three stalls with awnings (the in-game economy, made physical)
  const market = part(1.12, 1.34, (b) => b.x + b.y * 3);
  const awn = [M.HAND, M.COBALT, M.TEAL];
  for (let i = 0; i < 3; i++) {
    const x0 = 13 + i * 4, z0 = 25;
    for (const [px, pz] of [[x0, z0], [x0 + 2, z0], [x0, z0 + 2], [x0 + 2, z0 + 2]])
      for (let y = SURF + 1; y <= SURF + 2; y++) add(market, px, y, pz, M.WOOD, S.POST);
    for (let x = x0; x <= x0 + 2; x++) {
      add(market, x, SURF + 1, z0 + 1, M.PLANK, S.SLAB);
      for (let z = z0; z <= z0 + 2; z++) add(market, x, SURF + 3, z, (x + z) % 2 ? awn[i] : M.PLASTER, S.SLAB);
    }
  }

  // low curtain wall with a gate
  const wall = part(1.16, 1.4, (b) => b.x - b.z);
  for (let x = 10; x <= 29; x++) {
    if (x >= 18 && x <= 21) continue;
    if (!inside[x]?.[30]) continue;
    add(wall, x, SURF + 1, 30, M.STONE);
    if (x % 2 === 0) add(wall, x, SURF + 2, 30, M.STONE);
  }
  for (const gx of [17, 22]) for (let y = SURF + 1; y <= SURF + 4; y++) add(wall, gx, y, 30, M.PLASTER);
  for (let x = 17; x <= 22; x++) add(wall, x, SURF + 5, 30, M.HAND);

  // pagewalla: a little high street of local businesses, shopfronts facing the street (south)
  const shopDefs = [
    { x0: 37, wall: M.MINT, awning: M.PLASTER, roof: M.SLATE, h: 5 },
    { x0: 43, wall: M.PEACH, awning: M.PINK, roof: M.ROOF, h: 6 },
    { x0: 49, wall: M.PLASTER, awning: M.TEAL, roof: M.SLATE, h: 5 },
  ];
  const SZ0 = 24, SZ1 = 29; // shop depth, front at SZ1
  shopDefs.forEach((sd, i) => {
    const sp = part(1.36 + i * 0.07, 1.58 + i * 0.07, (b) => b.y * 30 + b.x);
    const x0 = sd.x0, x1 = sd.x0 + 4;
    for (let y = SURF + 1; y <= SURF + sd.h; y++)
      for (let x = x0; x <= x1; x++)
        for (let z = SZ0; z <= SZ1; z++) {
          const edge = x === x0 || x === x1 || z === SZ0 || z === SZ1;
          if (!edge) continue;
          const front = z === SZ1;
          const glass = front && x > x0 && x < x1 && y <= SURF + 2 && x !== x0 + 2;
          const door = front && x === x0 + 2 && y <= SURF + 2;
          const upperWin = front && (x === x0 + 1 || x === x1 - 1) && y === SURF + 4;
          // a cobalt signboard under the eaves: every shop gets its site
          const sign = front && y === SURF + sd.h && x > x0 && x < x1;
          add(sp, x, y, z, door ? M.WOOD : glass || upperWin ? M.GLASS : sign ? M.COBALT : sd.wall);
        }
    // a striped awning over the window
    for (let x = x0; x <= x1; x++) add(sp, x, SURF + 3, SZ1 + 1, x % 2 ? sd.awning : M.PLASTER, S.AWNING);
    // pitched roof, ridge running east-west
    for (let x = x0; x <= x1; x++)
      for (let z = SZ0; z <= SZ1; z++) {
        const ridge = Math.min(z - SZ0, SZ1 - z);
        add(sp, x, SURF + sd.h + 1, z, sd.roof, ridge === 0 ? S.SLAB : S.FULL);
        if (ridge >= 2) add(sp, x, SURF + sd.h + 2, z, sd.roof, S.SLAB);
      }
  });

  // pagewalla's construction site behind the street: a frame going up and a tower crane
  // (their first client, Shri Raam Engineering, builds cranes)
  const site = part(2.0, 2.38, (b) => b.y * 20 + b.x);
  for (let y = SURF + 1; y <= SURF + 5; y++)
    for (const [x, z] of [[41, 17], [46, 17], [41, 21], [46, 21]]) add(site, x, y, z, M.PLANK, S.POST);
  for (let x = 41; x <= 46; x++) {
    add(site, x, SURF + 3, 17, M.PLANK, S.SLAB);
    add(site, x, SURF + 3, 21, M.PLANK, S.SLAB);
  }
  for (let z = 17; z <= 21; z++) for (let x = 41; x <= 46; x++) if ((x + z) % 3 === 0) add(site, x, SURF + 1, z, M.PLASTER);

  const CX = 49, CZ = 19, CH = 19;
  const crane = part(2.04, 2.46, (b) => b.y * 10 + Math.abs(b.x - CX));
  for (let y = SURF + 1; y <= SURF + CH; y++) add(crane, CX, y, CZ, M.CRANE, y % 3 === 0 ? S.POST : S.FULL);
  add(crane, CX, SURF + CH + 1, CZ, M.CRANE, S.FULL, G.JIB);
  for (let i = 1; i <= 12; i++) add(crane, CX - i, SURF + CH, CZ, M.CRANE, S.SLAB, G.JIB); // jib
  for (let i = 1; i <= 4; i++) add(crane, CX + i, SURF + CH, CZ, M.CRANE, S.SLAB, G.JIB); // counter-jib
  add(crane, CX + 4, SURF + CH - 1, CZ, M.STONE_DARK, S.FULL, G.JIB); // counterweight
  add(crane, CX - 1, SURF + CH + 1, CZ, M.IRON, S.HALF, G.JIB); // cab
  for (let y = SURF + 9; y <= SURF + CH - 1; y++) add(crane, CX - 9, y, CZ, M.IRON, S.CABLE, G.HOOK);
  add(crane, CX - 9, SURF + 8, CZ, M.HAND, S.FULL, G.HOOK); // the load: a hand-orange block

  // Vesper: a white tower on the hill with a glowing lantern
  const VX = 30, VZ = 47;
  const vBase = gTop(VX, VZ);
  const vesper = part(1.55, 1.86, (b) => b.y * 30 + Math.atan2(b.z - VZ, b.x - VX));
  const VH = 10;
  for (let y = vBase + 1; y <= vBase + VH; y++)
    for (let x = VX - 2; x <= VX + 2; x++)
      for (let z = VZ - 2; z <= VZ + 2; z++) {
        const r = Math.hypot(x - VX, z - VZ);
        if (r > 2.5) continue;
        if (r < 1.5 && y < vBase + VH) continue;
        const band = (y - vBase) % 4 === 0;
        const win = r > 1.5 && (y - vBase) % 4 === 2 && (x === VX || z === VZ);
        add(vesper, x, y, z, win ? M.GLASS : band ? M.VIOLET : M.PLASTER);
      }
  // small cottage at the foot of the tower
  const cottage = part(1.6, 1.84, (b) => b.y * 20 + b.x);
  for (let y = vBase + 1; y <= vBase + 3; y++)
    for (let x = VX + 3; x <= VX + 6; x++)
      for (let z = VZ - 1; z <= VZ + 2; z++) {
        if (!(x === VX + 3 || x === VX + 6 || z === VZ - 1 || z === VZ + 2)) continue;
        if (!inside[x]?.[z]) continue;
        const win = y === vBase + 2 && z === VZ + 2 && (x === VX + 4 || x === VX + 5);
        add(cottage, x, y, z, win ? M.GLASS : M.PLASTER);
      }
  for (let x = VX + 3; x <= VX + 6; x++)
    for (let z = VZ - 1; z <= VZ + 2; z++) if (inside[x]?.[z]) add(cottage, x, vBase + 4, z, M.VIOLET, z === VZ - 1 || z === VZ + 2 ? S.SLAB : S.FULL);

  // the lantern room and the orb: built last, when the camera arrives
  const lantern = part(2.5, 2.98, (b) => b.y * 10);
  const LY = vBase + VH + 1;
  for (let x = VX - 1; x <= VX + 1; x++)
    for (let z = VZ - 1; z <= VZ + 1; z++) {
      const corner = Math.abs(x - VX) === 1 && Math.abs(z - VZ) === 1;
      if (corner) for (let y = LY; y <= LY + 1; y++) add(lantern, x, y, z, M.VIOLET, S.POST);
      add(lantern, x, LY + 2, z, M.VIOLET, S.FULL);
    }
  add(lantern, VX, LY + 3, VZ, M.VIOLET, S.HALF);
  add(lantern, VX, LY, VZ, M.ORB, S.CORE, G.ORB);

  // trees: a ring of oaks, blossoms and pines on the open grass
  const blocked = (x: number, z: number) =>
    !inside[x]?.[z] ||
    pathCells.has(ck(x, z)) ||
    waterCells.has(ck(x, z)) ||
    flatW(x, z) > 0 ||
    dist(x, z, VX, VZ) < 6.5 ||
    (x >= 33 && x <= 57 && z >= 33 && z <= 40); // keep the shopfronts in view
  const treeSpots: [number, number][] = [];
  for (let tries = 0; tries < 900 && treeSpots.length < 34; tries++) {
    const x = 4 + Math.floor(rand() * 56), z = 4 + Math.floor(rand() * 56);
    if (blocked(x, z)) continue;
    const dc = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (dc > radiusAt(Math.atan2(z + 0.5 - cz, x + 0.5 - cx)) - 2.2) continue;
    if (treeSpots.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 4.2)) continue;
    treeSpots.push([x, z]);
  }
  // a few deliberate ones near the plaza and pond
  for (const t of [[25, 38], [37, 39], [21, 43], [36, 25]] as [number, number][]) if (!blocked(t[0], t[1])) treeSpots.push(t);
  treeSpots.forEach(([x, z], i) => {
    const d = Math.hypot(x - 20, z - 26);
    const s0 = 1.22 + (d / 40) * 0.5;
    const tp = part(s0, s0 + 0.09, (b) => b.y);
    const gy = gTop(x, z);
    const pine = i % 5 === 0 || (i % 3 === 1 && gy > SURF + 1);
    const kind = pine ? 0 : i % 9 === 4 ? 2 : 1 + (i % 2) * 2;
    if (pine) {
      // pine
      const h = 6 + (i % 3);
      for (let y = 1; y <= 2; y++) add(tp, x, gy + y, z, M.WOOD);
      for (let y = 2; y <= h; y++) {
        const r = Math.max(0, Math.round((h - y) * 0.45));
        for (let ox = -r; ox <= r; ox++) for (let oz = -r; oz <= r; oz++) if (Math.abs(ox) + Math.abs(oz) <= r) add(tp, x + ox, gy + y, z + oz, M.PINE);
      }
      add(tp, x, gy + h + 1, z, M.PINE, S.HALF);
    } else {
      const trunk = 2 + (i % 3 === 0 ? 2 : 1);
      for (let y = 1; y <= trunk; y++) add(tp, x, gy + y, z, M.WOOD);
      const leaf = kind === 2 ? M.BLOSSOM : kind === 1 ? M.LEAF : M.LEAF2;
      const r = 1.6 + (i % 4) * 0.25;
      const cyy = gy + trunk + 1.2;
      for (let ox = -2; ox <= 2; ox++)
        for (let oy = -1; oy <= 2; oy++)
          for (let oz = -2; oz <= 2; oz++) {
            const e = Math.hypot(ox, (oy - 0.3) * 1.25, oz);
            if (e > r + (n3(x + ox, z + oz + oy * 7) - 0.5) * 0.9) continue;
            if (ox === 0 && oz === 0 && oy < 0) continue;
            add(tp, x + ox, Math.round(cyy + oy), z + oz, leaf);
          }
    }
  });

  // the plaza's big tree
  {
    const tp = part(1.3, 1.44, (b) => b.y);
    const x = 32, z = 33, gy = SURF;
    for (let y = 1; y <= 5; y++) add(tp, x, gy + y, z, M.WOOD);
    add(tp, x + 1, gy + 4, z, M.WOOD);
    add(tp, x - 1, gy + 5, z, M.WOOD);
    for (let ox = -3; ox <= 3; ox++)
      for (let oy = -1; oy <= 3; oy++)
        for (let oz = -3; oz <= 3; oz++) {
          const e = Math.hypot(ox, (oy - 0.6) * 1.35, oz);
          if (e > 3.1 + (n2(ox + 40, oz + oy * 5) - 0.5)) continue;
          add(tp, x + ox, gy + 6 + oy, z + oz, oy > 1 ? M.LEAF2 : M.LEAF);
        }
    // benches
    for (const [bx, bz] of [[29, 30], [35, 36]]) {
      add(tp, bx, gy + 1, bz, M.PLANK, S.SLAB);
      add(tp, bx + 1, gy + 1, bz, M.PLANK, S.SLAB);
    }
  }

  // lamps along the paths (they glow at golden hour) + flowers
  const lights: Light[] = [];
  const lamps = part(1.62, 1.95, (b) => Math.hypot(b.x - 20, b.z - 26) + b.y * 0.1);
  const lampSpots: [number, number][] = [[23, 31], [27, 29], [39, 34], [45, 34], [51, 34], [42, 30], [48, 30], [33, 41], [29, 38]];
  for (const [x, z] of lampSpots) {
    if (!inside[x]?.[z] || pathCells.has(ck(x, z)) || waterCells.has(ck(x, z))) continue;
    const gy = gTop(x, z);
    add(lamps, x, gy + 1, z, M.IRON, S.CABLE);
    add(lamps, x, gy + 2, z, M.IRON, S.CABLE);
    add(lamps, x, gy + 3, z, M.LAMP, S.HALF);
    lights.push({ pos: [x + 0.5, gy + 3.25, z + 0.5], size: 2.4, kind: "lamp" });
  }
  const flowers = part(1.5, 1.98, (b) => Math.hypot(b.x - 20, b.z - 26));
  for (let x = 4; x < 60; x++)
    for (let z = 4; z < 60; z++) {
      if (blocked(x, z)) continue;
      if (n1(x * 0.4 + 30, z * 0.4) < 0.72 || rand() < 0.55) continue;
      const gy = gTop(x, z);
      if (has(x, gy + 1, z)) continue;
      add(flowers, x, gy + 1, z, rand() < 0.5 ? M.FLOWER : M.PINK, S.TINY);
    }
  lights.push({ pos: [VX + 0.5, LY + 0.5, VZ + 0.5], size: 6, kind: "orb" });

  // the empty island isn't bare: a few rocks and tufts were always there
  for (let tries = 0, made = 0; tries < 2000 && made < 70; tries++) {
    const x = 4 + Math.floor(rand() * 56), z = 4 + Math.floor(rand() * 56);
    if (blocked(x, z)) continue;
    if (treeSpots.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 3)) continue;
    if (lampSpots.some(([lx, lz]) => lx === x && lz === z)) continue;
    const gy = gTop(x, z);
    if (has(x, gy + 1, z) || !has(x, gy, z)) continue;
    const rock = made % 5 === 0;
    put({ x, y: gy + 1, z, mat: rock ? M.ROCK : M.LEAF2, shape: rock ? S.HALF : S.TINY, group: 0, kind: KIND.STATIC, s: -1 });
    made++;
  }

  // ── clouds and floating islets (static scenery) ─────────────────────────
  const cloudBlocks: Block[] = [];
  // a cloud is a few overlapping puffs on a flat base
  const cloud = (x0: number, y0: number, z0: number, sx: number, sz: number, group: number) => {
    const puffs = [
      [0, 0, 0, 1],
      [sx * 0.5, sz * 0.15, 0.4, 0.72],
      [-sx * 0.45, -sz * 0.2, 0.2, 0.68],
    ];
    const cells = new Set<string>();
    for (const [ox, oz, oy, s] of puffs) {
      const rx = sx * s, rz = sz * s, ry = 2.6 * s + 0.8;
      for (let x = Math.floor(-rx); x <= Math.ceil(rx); x++)
        for (let z = Math.floor(-rz); z <= Math.ceil(rz); z++)
          for (let y = 0; y <= Math.ceil(ry + oy); y++) {
            const e = ((x - 0) / rx) ** 2 + ((z - 0) / rz) ** 2 + ((y - oy) / ry) ** 2;
            if (e > 1) continue;
            const cx2 = Math.round(x0 + ox + x), cz2 = Math.round(z0 + oz + z);
            const kk = `${cx2},${y},${cz2}`;
            if (cells.has(kk)) continue;
            cells.add(kk);
            cloudBlocks.push({ x: cx2, y: y0 + y, z: cz2, mat: M.CLOUD, shape: S.FULL, group, kind: KIND.STATIC, s: -1 });
          }
    }
  };
  cloud(-10, 15, 12, 6, 3, G.CLOUD_A);
  cloud(68, 30, 24, 5, 3, G.CLOUD_A);
  cloud(10, 4, 66, 7, 4, G.CLOUD_B);
  cloud(54, 9, 70, 5, 3, G.CLOUD_B);
  cloud(76, 18, 52, 6, 3, G.CLOUD_A);
  cloud(-17, 26, 44, 4, 3, G.CLOUD_B);
  cloud(40, 33, -10, 6, 3, G.CLOUD_B);
  cloud(20, 1, -6, 5, 3, G.CLOUD_A);

  const islet = (x0: number, y0: number, z0: number, r: number, withTree: boolean) => {
    for (let x = -r; x <= r; x++)
      for (let z = -r; z <= r; z++) {
        const d = Math.hypot(x, z);
        if (d > r + 0.3) continue;
        const depth = Math.round((r - d) * 1.6) + 1;
        for (let y = 0; y < depth; y++)
          put({ x: x0 + x, y: y0 - y, z: z0 + z, mat: y === 0 ? M.GRASS : y < 2 ? M.DIRT : M.STONE, shape: S.FULL, group: 0, kind: KIND.STATIC, s: -1 });
      }
    if (withTree) {
      put({ x: x0, y: y0 + 1, z: z0, mat: M.WOOD, shape: S.FULL, group: 0, kind: KIND.STATIC, s: -1 });
      for (const [ox, oy, oz] of [[0, 2, 0], [1, 2, 0], [-1, 2, 0], [0, 2, 1], [0, 2, -1], [0, 3, 0]])
        put({ x: x0 + ox, y: y0 + oy, z: z0 + oz, mat: M.LEAF, shape: S.FULL, group: 0, kind: KIND.STATIC, s: -1 });
    }
  };
  islet(66, 17, 36, 2, true);
  islet(60, 7, 60, 2, false);
  islet(46, 8, 66, 1, false);
  islet(8, 24, 4, 1, false);

  // ── assemble: thresholds, sort, pack ────────────────────────────────────
  // hand: an uneven rhythm over [0.035, 0.97]; the first three land on their own on load
  hand.forEach((b, i) => {
    const u = i / (hand.length - 1);
    b.s = 0.035 + 0.935 * u;
  });

  const built: Block[] = [...hand];
  for (const p of parts) {
    if (!p.b.length) continue;
    // remove duplicates inside the part and anything that collides with static terrain
    const seen = new Set<number>();
    const list = p.b.filter((b) => {
      const k = key(b.x, b.y, b.z);
      if (seen.has(k)) return false;
      seen.add(k);
      return !blocks.has(k);
    });
    const order = p.order || ((b: Block) => b.y);
    const ranked = list.map((b) => ({ b, o: order(b) + rand() * 1e-3 })).sort((a, c) => a.o - c.o);
    const n = ranked.length;
    ranked.forEach(({ b }, i) => {
      // a little jitter so a part never lands in lockstep, but never past its window
      b.s = Math.min(p.s1, p.s0 + (p.s1 - p.s0) * (n > 1 ? i / (n - 1) : 0) + rand() * 0.004);
      built.push(b);
    });
  }
  // later parts win over earlier ones in the same cell
  const builtByCell = new Map<number, Block>();
  for (const b of built) builtByCell.set(key(b.x, b.y, b.z), b);
  const builtList = [...builtByCell.values()].sort((a, b) => a.s - b.s);

  const staticList = [...blocks.values(), ...cloudBlocks];

  const count = staticList.length + builtList.length;
  const pos = new Float32Array(count * 3);
  const info = new Float32Array(count * 4);
  const thresholds = new Float32Array(builtList.length);
  const occIndex = new Int32Array(builtList.length);
  const occWeight = new Float32Array(builtList.length);
  const occ = new Uint8Array(W * H * D);
  const write = (b: Block, i: number) => {
    pos[i * 3] = b.x;
    pos[i * 3 + 1] = b.y;
    pos[i * 3 + 2] = b.z;
    info[i * 4] = b.mat;
    info[i * 4 + 1] = b.shape;
    info[i * 4 + 2] = b.group;
    info[i * 4 + 3] = b.kind;
  };
  staticList.forEach((b, i) => {
    write(b, i);
    if (b.group === 0 && b.shape === S.FULL && inGrid(b.x, b.y, b.z)) occ[vid(b.x, b.y, b.z)] = 255;
  });
  // static occupancy also includes the culled interior
  for (let i = 0; i < staticOcc.length; i++) if (staticOcc[i]) occ[i] = 255;
  builtList.forEach((b, j) => {
    write(b, staticList.length + j);
    thresholds[j] = b.s;
    const inside3 = inGrid(b.x, b.y, b.z) && b.group === 0;
    occIndex[j] = inside3 ? vid(b.x, b.y, b.z) : -1;
    occWeight[j] = b.shape === S.FULL || b.shape === S.SLAB ? 1 : b.shape === S.AWNING ? 0.6 : 0.25;
  });

  return {
    count,
    staticCount: staticList.length,
    pos,
    info,
    thresholds,
    occStatic: occ,
    occIndex,
    occWeight,
    lights,
    anchors: {
      center: [32, SURF - 2, 32],
      keep: [KX + 3.5, SURF + 2.5, KZ + 3.5],
      ms: [21, SURF + 4, 19],
      pw: [45.5, SURF + 4, 27],
      crane: [CX - 3, SURF + 10, CZ],
      vesper: [VX + 1.5, vBase + 6, VZ + 0.5],
      orb: [VX + 0.5, LY + 0.5, VZ + 0.5],
    },
    pivots: { jib: [CX + 0.5, 0, CZ + 0.5], orb: [VX + 0.5, LY + 0.5, VZ + 0.5], flag: [flagX + 0.5, 0, flagZ + 0.5] },
    cloudSpan: [-24, 92],
    handCount: hand.length,
  };
}
