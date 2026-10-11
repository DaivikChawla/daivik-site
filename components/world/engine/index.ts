// The world renderer. Plain WebGL2, no libraries: one instanced draw for every block,
// a sun shadow map, voxel AO from a live 3D occupancy texture, a sky with a cloud sea,
// and a depth-of-field "tilt-shift" pass that makes it read as a miniature.

import { buildWorld, DIMS, G, M, type WorldData } from "./world";
import * as SH from "./shaders";
import { buildAt, cameraAt, hexToLinear, lightAt } from "./timeline";
import { clamp, damp, easeOutCubic, invert, lookAt, mul, ortho, perspective, project, v3, type Vec3 } from "./math";

const PALETTE: Record<number, string> = {
  [M.GRASS]: "#70b35c", [M.DIRT]: "#b4875c", [M.STONE]: "#aaa5b6", [M.STONE_DARK]: "#857f98",
  [M.PATH]: "#ead6a8", [M.WATER]: "#5fb4e0", [M.WOOD]: "#9b6b46", [M.PLANK]: "#d8ad72",
  [M.LEAF]: "#5d9f58", [M.LEAF2]: "#86be5c", [M.BLOSSOM]: "#f3a9c4", [M.PLASTER]: "#f2f1ec",
  [M.ROOF]: "#d8693f", [M.SLATE]: "#5468bd", [M.HAND]: "#ff6a1f", [M.GLASS]: "#33427a",
  [M.COBALT]: "#2135d9", [M.VIOLET]: "#8a63e8", [M.GOLD]: "#f2c14e", [M.PINK]: "#f28db2",
  [M.TEAL]: "#3fb8a8", [M.CRANE]: "#f5b731", [M.CLOUD]: "#ffffff", [M.LAMP]: "#ffe2a0",
  [M.IRON]: "#3c4160", [M.FLOWER]: "#f7d046", [M.MINT]: "#c2e7d5", [M.PEACH]: "#f7c9a7",
  [M.ORB]: "#d4c2ff", [M.SAND]: "#ecdcb2", [M.PINE]: "#3f7f5a", [M.ROCK]: "#cac4d2",
};

export type Label = { id: "ms" | "pw" | "vesper"; x: number; y: number; on: boolean };
export type EngineFrame = { T: number; B: number; labels: Label[] };

export type EngineOptions = {
  tall: () => boolean;
  reducedMotion?: boolean;
  /** Render one deterministic frame at this story position and clock (for stills). */
  still?: { T: number; time: number };
  /** Fly in on the first frames. Off when a matching still is already on screen. */
  dollyIn?: boolean;
  onFirstFrame?: () => void;
  onFrame?: (f: EngineFrame) => void;
  onLost?: () => void;
};

export type Engine = {
  setProgress(T: number): void;
  setPointer(x: number, y: number): void;
  setVisible(v: boolean): void;
  resize(): void;
  destroy(): void;
};

class GLError extends Error {}

/** Clock value used for stills; the live clock starts here too. */
export const STILL_TIME = 130;

export function createEngine(canvas: HTMLCanvasElement, opts: EngineOptions): Engine | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: !!opts.still,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  let world: WorldData;
  try {
    world = buildWorld();
  } catch {
    return null;
  }
  const [DW, DH, DD] = DIMS;
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  // ── programs ───────────────────────────────────────────────────────────
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new GLError(gl.getShaderInfoLog(s) || "shader");
    return s;
  };
  const program = (vs: string, fs: string) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new GLError(gl.getProgramInfoLog(p) || "link");
    const cache = new Map<string, WebGLUniformLocation | null>();
    const u = (name: string) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
      return cache.get(name)!;
    };
    return { p, u };
  };

  let P: ReturnType<typeof program>;
  let PS: ReturnType<typeof program>;
  let PSky: ReturnType<typeof program>;
  let PGlow: ReturnType<typeof program>;
  let PBlur: ReturnType<typeof program>;
  let PComp: ReturnType<typeof program>;
  try {
    P = program(SH.VOXEL_VS, SH.VOXEL_FS);
    PS = program(SH.SHADOW_VS, SH.SHADOW_FS);
    PSky = program(SH.FULLSCREEN_VS, SH.SKY_FS);
    PGlow = program(SH.GLOW_VS, SH.GLOW_FS);
    PBlur = program(SH.FULLSCREEN_VS, SH.BLUR_FS);
    PComp = program(SH.FULLSCREEN_VS, SH.COMPOSITE_FS);
  } catch {
    return null;
  }

  // ── geometry ───────────────────────────────────────────────────────────
  const cube: number[] = [];
  for (let a = 0; a < 3; a++)
    for (const s of [1, -1]) {
      const n = [0, 0, 0];
      n[a] = s;
      let u = (a + 1) % 3, v = (a + 2) % 3;
      if (s < 0) [u, v] = [v, u];
      const C = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const p = [0, 0, 0];
        p[a] = s > 0 ? 1 : 0;
        p[u] = C[k][0];
        p[v] = C[k][1];
        cube.push(p[0], p[1], p[2], n[0], n[1], n[2], C[k][0], C[k][1]);
      }
    }

  const count = world.count;
  const staticCount = world.staticCount;
  const builtCount = count - staticCount;
  canvas.dataset.blocks = `${count} (${builtCount} built, ${world.handCount} by hand)`;

  const inst = new Float32Array(count * 7);
  for (let i = 0; i < count; i++) {
    inst.set(world.pos.subarray(i * 3, i * 3 + 3), i * 7);
    inst.set(world.info.subarray(i * 4, i * 4 + 4), i * 7 + 3);
  }
  const times = new Float32Array(count);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const cubeBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cube), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  const instBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 28, 0);
  gl.vertexAttribDivisor(3, 1);
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 28, 12);
  gl.vertexAttribDivisor(4, 1);
  const timeBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, timeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, times, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(5);
  gl.vertexAttribPointer(5, 1, gl.FLOAT, false, 4, 0);
  gl.vertexAttribDivisor(5, 1);

  // glow sprites
  const glowVao = gl.createVertexArray()!;
  gl.bindVertexArray(glowVao);
  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  const glowData = new Float32Array(world.lights.length * 5);
  world.lights.forEach((l, i) => glowData.set([l.pos[0], l.pos[1], l.pos[2], l.size, l.kind === "orb" ? 1 : 0], i * 5));
  const glowBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, glowBuf);
  gl.bufferData(gl.ARRAY_BUFFER, glowData, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 20, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
  gl.vertexAttribDivisor(2, 1);

  const emptyVao = gl.createVertexArray()!;
  gl.bindVertexArray(null);

  // ── occupancy volume (AO) ──────────────────────────────────────────────
  const occ = new Uint8Array(world.occStatic);
  const occTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_3D, occTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, DW, DH, DD, 0, gl.RED, gl.UNSIGNED_BYTE, occ);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

  // ── shadow map ─────────────────────────────────────────────────────────
  const SM = coarse ? 1024 : 2048;
  const shadowTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SM, SM);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const shadowFbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // ── render targets (sized in resize) ────────────────────────────────────
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
  const msFbo = gl.createFramebuffer()!;
  const msColor = gl.createRenderbuffer()!;
  const msDepth = gl.createRenderbuffer()!;
  const makeTarget = () => {
    const tex = gl.createTexture()!;
    const fbo = gl.createFramebuffer()!;
    return { tex, fbo, w: 1, h: 1 };
  };
  const sharp = makeTarget();
  const halfA = makeTarget();
  const halfB = makeTarget();
  const quarterA = makeTarget();
  const quarterB = makeTarget();
  const sizeTarget = (t: ReturnType<typeof makeTarget>, w: number, h: number) => {
    t.w = w;
    t.h = h;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
  };

  let W = 1, H = 1, cssW = 1, cssH = 1;
  let quality = 1;
  const resize = () => {
    cssW = Math.max(1, canvas.clientWidth);
    cssH = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * quality;
    W = Math.max(1, Math.round(cssW * dpr));
    H = Math.max(1, Math.round(cssH * dpr));
    canvas.width = W;
    canvas.height = H;
    gl.bindRenderbuffer(gl.RENDERBUFFER, msColor);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, W, H);
    gl.bindRenderbuffer(gl.RENDERBUFFER, msDepth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColor);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepth);
    sizeTarget(sharp, W, H);
    sizeTarget(halfA, Math.ceil(W / 2), Math.ceil(H / 2));
    sizeTarget(halfB, Math.ceil(W / 2), Math.ceil(H / 2));
    sizeTarget(quarterA, Math.ceil(W / 4), Math.ceil(H / 4));
    sizeTarget(quarterB, Math.ceil(W / 4), Math.ceil(H / 4));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    kick();
  };

  // ── static uniforms ────────────────────────────────────────────────────
  const pal = new Float32Array(32 * 4);
  for (let i = 0; i < 32; i++) {
    const c = hexToLinear(PALETTE[i] || "#ff00ff");
    pal.set([c[0], c[1], c[2], 0], i * 4);
  }
  gl.useProgram(P.p);
  gl.uniform4fv(P.u("uPal"), pal);
  gl.uniform1i(P.u("uOcc"), 0);
  gl.uniform1i(P.u("uShadow"), 1);
  gl.uniform3f(P.u("uDims"), DW, DH, DD);
  gl.uniform1f(P.u("uShadowTexel"), 1 / SM);

  // ── build state ────────────────────────────────────────────────────────
  const thr = world.thresholds;
  let placed = 0; // built blocks [0, placed) are in
  let animLo = Infinity, animHi = -1, animUntil = 0;
  const upperBound = (B: number) => {
    let lo = 0, hi = builtCount;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (thr[mid] <= B) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const SETTLED = 1; // a placement time long in the past

  const handN = world.handCount; // built blocks [0, handN) are the ones laid by hand
  let handQueue = 0; // when the last queued hand block lands

  const applyBuild = (B: number, now: number, snap: boolean) => {
    const target = upperBound(B);
    if (target === placed) return;
    let lo: number, hi: number;
    if (target > placed) {
      lo = placed;
      hi = target;
      // by hand stays one block at a time, even if you scroll past it fast
      const handHi = Math.min(hi, handN);
      const handStep = Math.min(0.07, 2.2 / Math.max(1, handHi - lo));
      let t = Math.max(now, handQueue);
      for (let i = lo; i < handHi; i++) {
        times[staticCount + i] = snap ? SETTLED : t;
        t += handStep;
      }
      if (handHi > lo) handQueue = t;
      // automation lands as a cascade
      const a0 = Math.max(lo, handN);
      const n = hi - a0;
      const spread = snap ? 0 : Math.min(0.85, n * 0.011);
      for (let i = a0; i < hi; i++) times[staticCount + i] = snap ? SETTLED : now + (n > 1 ? ((i - a0) / (n - 1)) * spread : 0);
      if (!snap) animUntil = Math.max(animUntil, now + spread + 0.85, handQueue + 0.85);
    } else {
      lo = target;
      hi = placed;
      for (let i = lo; i < hi; i++) times[staticCount + i] = snap ? 0 : -now;
      if (lo < handN) handQueue = now;
      if (!snap) animUntil = Math.max(animUntil, now + 0.4);
    }
    placed = target;
    gl.bindBuffer(gl.ARRAY_BUFFER, timeBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, (staticCount + lo) * 4, times, staticCount + lo, hi - lo);
    animLo = Math.min(animLo, lo);
    animHi = Math.max(animHi, hi);
    if (snap) refreshOcc(now, true);
  };

  const refreshOcc = (now: number, all: boolean) => {
    const lo = all ? 0 : animLo, hi = all ? builtCount : animHi;
    for (let j = lo; j < hi; j++) {
      const vi = world.occIndex[j];
      if (vi < 0) continue;
      const t = times[staticCount + j];
      let a: number;
      if (t === 0) a = 0;
      else if (t > 0) a = clamp((now - t) / 0.7);
      else a = 1 - clamp((now + t) / 0.34);
      occ[vi] = Math.max(world.occStatic[vi], Math.round(255 * world.occWeight[j] * a * a * (3 - 2 * a)));
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, occTex);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, DW, DH, DD, gl.RED, gl.UNSIGNED_BYTE, occ);
  };

  // ── per-frame state ────────────────────────────────────────────────────
  let targetT = opts.still ? opts.still.T : 0;
  let T = targetT;
  let px = 0, py = 0, pxS = 0, pyS = 0;
  let raf = 0;
  let alive = true;
  let visible = true;
  let first = true;
  let startAt = -1;
  let last = performance.now();
  let slowFor = 0;
  let cooldown = 0;
  const groupA = new Float32Array(32);
  const groupB = new Float32Array(32);
  const clock0 = performance.now();

  const frame = (nowMs: number) => {
    raf = 0;
    if (!alive) return;
    const dt = Math.min(0.1, Math.max(0.001, (nowMs - last) / 1000));
    last = nowMs;
    const still = opts.still;
    // the live clock starts where the stills were rendered, so the first live frame matches them
    const now = still ? still.time : STILL_TIME + (nowMs - clock0) / 1000;
    if (startAt < 0) startAt = now;
    const since = now - startAt;
    const tall = opts.tall();

    // story position, damped so the camera glides
    T = still || opts.reducedMotion ? targetT : damp(T, targetT, 3.4, dt);
    pxS = damp(pxS, px, 2.5, dt);
    pyS = damp(pyS, py, 2.5, dt);

    // build: scroll drives it; on load the first blocks go down by hand on their own
    let B = buildAt(T);
    if (!still && !opts.reducedMotion) {
      for (let k = 0; k < 3; k++) if (since >= 1.1 + k * 0.85) B = Math.max(B, thr[k] + 1e-5);
    }
    applyBuild(B, now, !!still || !!opts.reducedMotion);
    if (animHi >= 0) {
      refreshOcc(now, false);
      if (now > animUntil) {
        animLo = Infinity;
        animHi = -1;
      }
    }

    // camera
    const cam = cameraAt(T, world, tall);
    const intro = still || opts.reducedMotion || !opts.dollyIn ? 1 : easeOutCubic(since / 3.2);
    const sway = still || opts.reducedMotion ? 0 : Math.sin(since * 0.13) * 1.6;
    const yaw = ((cam.yaw + sway + pxS * 3.2 - (1 - intro) * 14) * Math.PI) / 180;
    const pitch = ((cam.pitch - pyS * 2 + (1 - intro) * 6) * Math.PI) / 180;
    const fovY = ((tall ? 34 : 26) * Math.PI) / 180;
    const f = 1 / Math.tan(fovY / 2);
    const aspect = W / H;
    const [x0, y0, x1, y1] = cam.region;
    const hx = x1 - x0, hy = y1 - y0;
    let dist = (cam.radius * f * Math.max(1 / (aspect * hx), 1 / hy)) / 0.94;
    dist *= 1 + (1 - intro) * 0.32;
    const dir: Vec3 = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    const target = v3.add(cam.target, [0, -(1 - intro) * 4, 0]);
    const eye = v3.add(target, v3.scale(dir, dist));
    const view = lookAt(eye, target, [0, 1, 0]);
    const proj = perspective(fovY, aspect, Math.max(0.5, dist - 75), dist + 140);
    proj[8] = -(x0 + x1 - 1);
    proj[9] = -(y0 + y1 - 1);
    const VP = mul(proj, view);

    // light
    const L = lightAt(T);
    const lc: Vec3 = [32, 14, 32];
    const le = v3.add(lc, v3.scale(L.sunDir, 90));
    const lightVP = mul(ortho(-44, 44, -44, 44, 1, 200), lookAt(le, lc, Math.abs(L.sunDir[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0]));

    // moving parts
    const t = now;
    const setG = (g: number, pivot: Vec3, yawG: number, tr: Vec3, wrap = 0) => {
      groupA.set([pivot[0], pivot[1], pivot[2], yawG], g * 4);
      groupB.set([tr[0], tr[1], tr[2], wrap], g * 4);
    };
    const jib = Math.sin(t * 0.21) * 0.42;
    setG(G.JIB, world.pivots.jib, jib, [0, 0, 0]);
    setG(G.HOOK, world.pivots.jib, jib, [0, Math.sin(t * 0.55) * 1.2, 0]);
    // clouds drift around their homes, never through the island
    setG(G.CLOUD_A, [0, 0, 0], 0, [Math.sin(t * 0.043) * 6.5, Math.sin(t * 0.07) * 0.6, Math.cos(t * 0.031) * 2.5]);
    setG(G.CLOUD_B, [0, 0, 0], 0, [Math.sin(t * 0.037 + 2) * 7, Math.sin(t * 0.06 + 1) * 0.5, Math.cos(t * 0.029 + 1) * 2]);
    setG(G.ORB, world.pivots.orb, t * 0.7, [0, Math.sin(t * 1.4) * 0.14, 0]);
    setG(G.FLAG, world.pivots.flag, Math.sin(t * 2.1) * 0.2 + Math.sin(t * 3.7) * 0.07, [0, 0, 0]);

    const orbOn = clamp((B - 2.93) / 0.05);

    // ── shadow pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.viewport(0, 0, SM, SM);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.useProgram(PS.p);
    gl.uniformMatrix4fv(PS.u("uLightVP"), false, lightVP);
    gl.uniform1f(PS.u("uTime"), now);
    gl.uniform4fv(PS.u("uGroupA"), groupA);
    gl.uniform4fv(PS.u("uGroupB"), groupB);
    gl.uniform1f(PS.u("uWrapMin"), world.cloudSpan[0]);
    gl.bindVertexArray(vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, count);

    // ── colour pass (MSAA)
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
    gl.viewport(0, 0, W, H);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    // sky
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(PSky.p);
    gl.uniformMatrix4fv(PSky.u("uInvVP"), false, invert(VP));
    gl.uniform3fv(PSky.u("uCamPos"), eye);
    gl.uniform3fv(PSky.u("uSunDir"), L.sunDir);
    gl.uniform3fv(PSky.u("uZenith"), L.zenith);
    gl.uniform3fv(PSky.u("uHorizon"), L.horizon);
    gl.uniform3fv(PSky.u("uSunColor"), v3.scale(L.sun, 0.35));
    gl.uniform3fv(PSky.u("uSeaLit"), L.seaLit);
    gl.uniform3fv(PSky.u("uSeaShade"), L.seaShade);
    gl.uniform1f(PSky.u("uTime"), now);
    gl.uniform1f(PSky.u("uExposure"), L.exposure);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // blocks
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u("uVP"), false, VP);
    gl.uniformMatrix4fv(P.u("uLightVP"), false, lightVP);
    gl.uniform1f(P.u("uTime"), now);
    gl.uniform4fv(P.u("uGroupA"), groupA);
    gl.uniform4fv(P.u("uGroupB"), groupB);
    gl.uniform1f(P.u("uWrapMin"), world.cloudSpan[0]);
    gl.uniform3fv(P.u("uSunDir"), L.sunDir);
    gl.uniform3fv(P.u("uSunColor"), L.sun);
    gl.uniform3fv(P.u("uSkyAmb"), L.skyAmb);
    gl.uniform3fv(P.u("uGroundAmb"), L.groundAmb);
    gl.uniform3fv(P.u("uFogColor"), L.fog);
    gl.uniform3fv(P.u("uCamPos"), eye);
    gl.uniform2f(P.u("uFog"), dist * 0.9, dist * 2.4);
    gl.uniform2f(P.u("uFocus"), dist, cam.radius * cam.focus);
    gl.uniform1f(P.u("uNight"), L.night);
    gl.uniform1f(P.u("uExposure"), L.exposure);
    gl.uniform1f(P.u("uFlash"), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, occTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.bindVertexArray(vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, count);
    // glows
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.colorMask(true, true, true, false);
    gl.useProgram(PGlow.p);
    gl.uniformMatrix4fv(PGlow.u("uV"), false, view);
    gl.uniformMatrix4fv(PGlow.u("uP"), false, proj);
    gl.uniform1f(PGlow.u("uTime"), now);
    gl.uniform1f(PGlow.u("uOrbY"), Math.sin(t * 1.4) * 0.14);
    gl.uniform1f(PGlow.u("uNight"), L.night);
    gl.uniform1f(PGlow.u("uOrbOn"), orbOn);
    gl.bindVertexArray(glowVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, world.lights.length);
    gl.colorMask(true, true, true, true);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    // resolve
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sharp.fbo);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    // depth-of-field blur pyramid
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(emptyVao);
    gl.useProgram(PBlur.p);
    gl.uniform1i(PBlur.u("uSrc"), 2);
    const k = H / 1000;
    const blur = (src: ReturnType<typeof makeTarget>, dst: ReturnType<typeof makeTarget>, sx: number, sy: number, weighted: boolean) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(PBlur.u("uStep"), sx / W, sy / H);
      gl.uniform1f(PBlur.u("uWeighted"), weighted ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    blur(sharp, halfA, 2.2 * k, 0, true);
    blur(halfA, halfB, 0, 2.2 * k, false);
    blur(halfB, quarterA, 6.5 * k, 0, false);
    blur(quarterA, quarterB, 0, 6.5 * k, false);

    // composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(PComp.p);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, sharp.tex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, halfB.tex);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, quarterB.tex);
    gl.uniform1i(PComp.u("uSharp"), 2);
    gl.uniform1i(PComp.u("uBlur1"), 3);
    gl.uniform1i(PComp.u("uBlur2"), 4);
    const subj = project(VP, cam.target);
    gl.uniform3f(PComp.u("uTilt"), clamp(subj[1] * 0.5 + 0.5, 0.1, 0.9), tall ? 0.2 : 0.26, 0.36);
    gl.uniform1f(PComp.u("uTime"), still ? 0 : now);
    gl.uniform1f(PComp.u("uFade"), 1);
    gl.uniform3f(PComp.u("uBg"), 0.86, 0.89, 0.93);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (first) {
      first = false;
      opts.onFirstFrame?.();
    }
    if (opts.onFrame) {
      const lab = (id: Label["id"], p: Vec3): Label => {
        const s = project(VP, p);
        return { id, x: (s[0] * 0.5 + 0.5) * cssW, y: (1 - (s[1] * 0.5 + 0.5)) * cssH, on: s[2] > 0 };
      };
      opts.onFrame({
        T,
        B,
        labels: [
          lab("ms", v3.add(world.anchors.keep, [0, 9, 0])),
          lab("pw", v3.add(world.anchors.pw, [0, 5, 0])),
          lab("vesper", v3.add(world.anchors.orb, [0, 3, 0])),
        ],
      });
    }

    // adaptive resolution: if frames are slow for a while, render fewer pixels
    if (!still) {
      cooldown -= dt;
      slowFor = dt > 0.026 ? slowFor + dt : Math.max(0, slowFor - dt * 0.5);
      if (slowFor > 1.2 && cooldown <= 0 && quality > 0.6) {
        quality = Math.max(0.6, quality * 0.85);
        slowFor = 0;
        cooldown = 2;
        resize();
      }
    }

    if (!still && visible) raf = requestAnimationFrame(frame);
  };

  function kick() {
    if (!raf && alive && visible) raf = requestAnimationFrame(frame);
  }

  const onLost = (e: Event) => {
    e.preventDefault();
    alive = false;
    cancelAnimationFrame(raf);
    opts.onLost?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  resize();

  return {
    setProgress(t: number) {
      targetT = clamp(t, 0, 6);
      kick();
    },
    setPointer(x: number, y: number) {
      px = clamp(x, -1, 1);
      py = clamp(y, -1, 1);
    },
    setVisible(v: boolean) {
      visible = v;
      if (v) {
        last = performance.now();
        kick();
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    resize,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
