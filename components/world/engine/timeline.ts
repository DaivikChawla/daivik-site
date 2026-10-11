// The story, as numbers. T runs 0..6, one unit per beat of the Work section:
// 0 hero · 1 by hand · 2 automated · 3 MysteryStudios · 4 pagewalla · 5 Vesper · 6 golden hour.

import { clamp, lerp, smootherstep, smoothstep, type Vec3, v3 } from "./math";
import type { WorldData } from "./world";

export type Region = [number, number, number, number]; // x0, y0, x1, y1 in 0..1 (y up)

type Shot = {
  t: number;
  target: Vec3 | keyof WorldData["anchors"];
  yaw: number; // degrees, 0 = camera south of target, + swings east
  pitch: number; // degrees above the horizon
  radius: number; // world radius that must fit the region
  wide: Region; // landscape layout (placards on the left)
  tall: Region; // portrait layout (placards at the bottom)
  focus: number; // depth-of-field range as a multiple of radius
};

const SIDE: Region = [0.4, 0.07, 0.99, 0.93];
const TALL: Region = [0.03, 0.5, 0.97, 0.97];

const SHOTS: Shot[] = [
  { t: 0, target: "center", yaw: -56, pitch: 23, radius: 28, wide: [0.44, 0.17, 0.99, 0.97], tall: [0.02, 0.55, 0.98, 0.98], focus: 1.3 },
  { t: 1, target: "keep", yaw: -30, pitch: 33, radius: 8.5, wide: SIDE, tall: TALL, focus: 1.1 },
  { t: 2, target: [31, 22, 31], yaw: -8, pitch: 47, radius: 27, wide: SIDE, tall: TALL, focus: 1.3 },
  { t: 3, target: "ms", yaw: -22, pitch: 29, radius: 12.5, wide: SIDE, tall: TALL, focus: 0.95 },
  { t: 4, target: "pw", yaw: 24, pitch: 31, radius: 14, wide: SIDE, tall: TALL, focus: 0.95 },
  { t: 5, target: "vesper", yaw: -32, pitch: 13, radius: 11.5, wide: SIDE, tall: TALL, focus: 1.0 },
  { t: 6, target: "center", yaw: -62, pitch: 24, radius: 31, wide: [0.08, 0.06, 0.92, 0.94], tall: [-0.08, 0.24, 1.08, 0.88], focus: 1.35 },
  // after the story: the same world at blue hour, for the footer (rendered as a still)
  { t: 7, target: "center", yaw: -40, pitch: 21, radius: 30, wide: [0.1, 0.08, 0.9, 0.96], tall: [0.0, 0.3, 1.0, 0.7], focus: 1.4 },
];

// Light: morning → day → late afternoon → golden hour.
type Look = {
  t: number;
  sunAz: number;
  sunEl: number;
  sun: string;
  sunI: number;
  zenith: string;
  horizon: string;
  seaLit: string;
  seaShade: string;
  skyAmb: string;
  skyAmbI: number;
  groundAmb: string;
  groundAmbI: number;
  fog: string;
  night: number;
  exposure: number;
};

const LOOKS: Look[] = [
  { t: 0, sunAz: 75, sunEl: 26, sun: "#ffdcb8", sunI: 1.95, zenith: "#7fa3dd", horizon: "#bccdeb", seaLit: "#f6f2ef", seaShade: "#8d9fd6", skyAmb: "#a5bae6", skyAmbI: 0.52, groundAmb: "#d3b896", groundAmbI: 0.22, fog: "#cfd8ec", night: 0, exposure: 0.95 },
  { t: 2, sunAz: 70, sunEl: 48, sun: "#fff4e4", sunI: 2.4, zenith: "#6f9de0", horizon: "#b9cfee", seaLit: "#ffffff", seaShade: "#97abdc", skyAmb: "#abc6ec", skyAmbI: 0.55, groundAmb: "#c9b597", groundAmbI: 0.24, fog: "#d3def0", night: 0, exposure: 0.97 },
  { t: 4, sunAz: 130, sunEl: 40, sun: "#fff0dc", sunI: 2.4, zenith: "#6b98dc", horizon: "#c2d2ec", seaLit: "#fffaf3", seaShade: "#9eaedb", skyAmb: "#aac3e8", skyAmbI: 0.55, groundAmb: "#ceb492", groundAmbI: 0.24, fog: "#d6dfee", night: 0, exposure: 0.98 },
  { t: 5, sunAz: 175, sunEl: 21, sun: "#ffd7a6", sunI: 2.5, zenith: "#6a87d0", horizon: "#f6d3b2", seaLit: "#ffead4", seaShade: "#c0b4d0", skyAmb: "#a6aedb", skyAmbI: 0.56, groundAmb: "#d6aa86", groundAmbI: 0.3, fog: "#ecd6c6", night: 0.18, exposure: 1.02 },
  { t: 6, sunAz: 200, sunEl: 8.5, sun: "#ffad66", sunI: 2.9, zenith: "#5b6fbf", horizon: "#ffb47e", seaLit: "#ffcf9f", seaShade: "#a98db4", skyAmb: "#8f92cf", skyAmbI: 0.5, groundAmb: "#d99b78", groundAmbI: 0.32, fog: "#eab598", night: 0.9, exposure: 1.06 },
  { t: 7, sunAz: 230, sunEl: 7, sun: "#8e9cf2", sunI: 0.75, zenith: "#14208f", horizon: "#2c44d6", seaLit: "#6377e4", seaShade: "#1d2a93", skyAmb: "#5868d4", skyAmbI: 0.48, groundAmb: "#2a2f7a", groundAmbI: 0.2, fog: "#2c42c9", night: 1, exposure: 1.18 },
];

export const hexToLinear = (hex: string): Vec3 => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2));
  return [c[0], c[1], c[2]];
};

function segment<K extends { t: number }>(list: K[], T: number): [K, K, number] {
  if (T <= list[0].t) return [list[0], list[0], 0];
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (T <= b.t) return [a, b, (T - a.t) / (b.t - a.t)];
  }
  const last = list[list.length - 1];
  return [last, last, 0];
}

export type CameraState = {
  target: Vec3;
  yaw: number;
  pitch: number;
  radius: number;
  region: Region;
  focus: number;
};

export function cameraAt(T: number, world: WorldData, tall: boolean): CameraState {
  const [a, b, f] = segment(SHOTS, T);
  const e = smootherstep(f);
  const tgt = (s: Shot) => (typeof s.target === "string" ? world.anchors[s.target] : s.target);
  const ra = tall ? a.tall : a.wide;
  const rb = tall ? b.tall : b.wide;
  // the finale keeps turning slowly while you scroll through it
  const extraYaw = T > 5 ? (Math.min(T, 6) - 5) * 6 : 0;
  // while travelling between two close-ups, rise a little so the camera never clips the model
  const arc = Math.sin(Math.PI * f) * (a === b ? 0 : 7);
  return {
    target: v3.lerp(tgt(a), tgt(b), e),
    yaw: lerp(a.yaw, b.yaw, e) + extraYaw,
    pitch: lerp(a.pitch, b.pitch, e) + arc * 0.6,
    radius: lerp(a.radius, b.radius, e) + arc,
    region: [lerp(ra[0], rb[0], e), lerp(ra[1], rb[1], e), lerp(ra[2], rb[2], e), lerp(ra[3], rb[3], e)],
    focus: lerp(a.focus, b.focus, e),
  };
}

export type LightState = {
  sunDir: Vec3;
  sun: Vec3;
  zenith: Vec3;
  horizon: Vec3;
  seaLit: Vec3;
  seaShade: Vec3;
  skyAmb: Vec3;
  groundAmb: Vec3;
  fog: Vec3;
  night: number;
  exposure: number;
};

const LIN = LOOKS.map((l) => ({
  ...l,
  sunL: v3.scale(hexToLinear(l.sun), l.sunI),
  zenithL: hexToLinear(l.zenith),
  horizonL: hexToLinear(l.horizon),
  seaLitL: hexToLinear(l.seaLit),
  seaShadeL: hexToLinear(l.seaShade),
  skyAmbL: v3.scale(hexToLinear(l.skyAmb), l.skyAmbI),
  groundAmbL: v3.scale(hexToLinear(l.groundAmb), l.groundAmbI),
  fogL: hexToLinear(l.fog),
}));

export function lightAt(T: number): LightState {
  const [a, b, f] = segment(LIN, T);
  const e = smoothstep(0, 1, f);
  const az = (lerp(a.sunAz, b.sunAz, e) * Math.PI) / 180;
  const el = (lerp(a.sunEl, b.sunEl, e) * Math.PI) / 180;
  return {
    sunDir: [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)],
    sun: v3.lerp(a.sunL, b.sunL, e),
    zenith: v3.lerp(a.zenithL, b.zenithL, e),
    horizon: v3.lerp(a.horizonL, b.horizonL, e),
    seaLit: v3.lerp(a.seaLitL, b.seaLitL, e),
    seaShade: v3.lerp(a.seaShadeL, b.seaShadeL, e),
    skyAmb: v3.lerp(a.skyAmbL, b.skyAmbL, e),
    groundAmb: v3.lerp(a.groundAmbL, b.groundAmbL, e),
    fog: v3.lerp(a.fogL, b.fogL, e),
    night: lerp(a.night, b.night, e),
    exposure: lerp(a.exposure, b.exposure, e),
  };
}

/**
 * Scroll story → build progress. By hand is slow and even; automation starts
 * gently and then runs away; pagewalla and Vesper finish as the camera arrives.
 */
export function buildAt(T: number): number {
  if (T <= 1.3) return 0.975 * clamp(T / 1.3);
  if (T <= 2.25) return 1 + Math.pow((T - 1.3) / 0.95, 1.9);
  if (T <= 3.15) return 2;
  if (T <= 3.95) return 2 + 0.5 * smoothstep(3.15, 3.95, T);
  if (T <= 4.2) return 2.5;
  if (T <= 4.95) return 2.5 + 0.5 * smoothstep(4.2, 4.95, T);
  return 3;
}

/** 0 = by hand, 1 = automated, for the status chip. */
export const phaseAt = (B: number) => (B < 1 ? 0 : 1);
