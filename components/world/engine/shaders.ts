// GLSL ES 3.00 sources for the world renderer.

const COMMON = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toDisplay(vec3 linear, float exposure) {
  return pow(aces(linear * exposure), vec3(1.0 / 2.2));
}
`;

// Block placement + moving parts, shared by the colour and shadow passes.
const VOXEL_TRANSFORM = /* glsl */ `
layout(location = 0) in vec3 aCorner;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
layout(location = 3) in vec3 aPos;
layout(location = 4) in vec4 aInfo;
layout(location = 5) in float aTime;

uniform float uTime;
uniform vec4 uGroupA[8]; // pivot.xyz, yaw
uniform vec4 uGroupB[8]; // translate.xyz, wrap span (0 = none)
uniform float uWrapMin;

const vec3 SHAPE_S[10] = vec3[10](
  vec3(1.0), vec3(0.5), vec3(0.26, 1.0, 0.26), vec3(1.0, 0.5, 1.0), vec3(0.32),
  vec3(0.12, 1.0, 0.12), vec3(1.0, 1.0, 0.16), vec3(1.0, 0.32, 1.0), vec3(0.16, 1.0, 1.0), vec3(0.62));
const vec3 SHAPE_O[10] = vec3[10](
  vec3(0.0), vec3(0.25, 0.0, 0.25), vec3(0.37, 0.0, 0.37), vec3(0.0), vec3(0.34, 0.0, 0.34),
  vec3(0.44, 0.0, 0.44), vec3(0.0, 0.0, 0.42), vec3(0.0, 0.68, 0.0), vec3(0.42, 0.0, 0.0), vec3(0.19));

float easeOutBack(float t) {
  float c1 = 1.9, c3 = c1 + 1.0, x = t - 1.0;
  return 1.0 + c3 * x * x * x + c1 * x * x;
}

// returns world position; writes normal, local position, flash age and visibility
vec3 placeBlock(out vec3 nrm, out vec3 local, out float since, out float vis) {
  int shape = int(aInfo.y + 0.5);
  int group = int(aInfo.z + 0.5);
  int kind = int(aInfo.w + 0.5);
  float a = 1.0;
  since = 1e3;
  if (kind > 0) {
    if (aTime == 0.0) a = 0.0;
    else if (aTime > 0.0) {
      since = uTime - aTime;
      a = clamp(since / (kind == 1 ? 0.62 : 0.78), 0.0, 1.0);
    } else {
      a = 1.0 - clamp((uTime + aTime) / 0.34, 0.0, 1.0);
      since = 1e3;
    }
  }
  vis = a;
  local = SHAPE_O[shape] + aCorner * SHAPE_S[shape];
  vec3 p = local;
  nrm = aNormal;
  if (a < 1.0) {
    vec3 pivot = vec3(0.5, 0.0, 0.5);
    float h = hash13(aPos + 7.0);
    vec3 sc = vec3(1.0);
    float lift = 0.0;
    if (aTime < 0.0) {
      // leaving: shrink back into the air
      sc = vec3(a);
      lift = (1.0 - a) * 0.6;
    } else if (kind == 1) {
      // by hand: lifted in, set down with care
      float e = easeOutBack(a);
      sc = vec3(mix(0.55, 1.0, e));
      lift = (1.0 - smoothstep(0.0, 1.0, a)) * 1.1;
    } else {
      // automated: falls from the sky, lands with a small squash
      float f = clamp(a / 0.72, 0.0, 1.0);
      float g = clamp((a - 0.72) / 0.28, 0.0, 1.0);
      lift = (1.0 - f * f) * (5.0 + h * 6.0);
      float sq = sin(g * 3.14159) * (1.0 - g) * 0.9;
      sc = vec3(1.0 + 0.16 * sq, 1.0 - 0.24 * sq, 1.0 + 0.16 * sq) * mix(0.82, 1.0, f);
    }
    p = pivot + (p - pivot) * sc + vec3(0.0, lift, 0.0);
  }
  vec3 w = aPos + p;
  if (group > 0) {
    vec4 ga = uGroupA[group];
    vec4 gb = uGroupB[group];
    vec3 q = w - ga.xyz;
    float c = cos(ga.w), s = sin(ga.w);
    q = vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z);
    nrm = vec3(c * nrm.x + s * nrm.z, nrm.y, -s * nrm.x + c * nrm.z);
    w = q + ga.xyz + gb.xyz;
    if (gb.w > 0.0) w.x -= floor((aPos.x + gb.x - uWrapMin) / gb.w) * gb.w;
  }
  return w;
}
`;

export const VOXEL_VS = /* glsl */ `#version 300 es
precision highp float;
${COMMON}
${VOXEL_TRANSFORM}
uniform mat4 uVP;
uniform mat4 uLightVP;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vLocal;
out vec2 vUV;
out vec4 vLight;
out float vSince;
flat out int vMat;
flat out int vKind;
flat out vec3 vCell;
void main() {
  vec3 n, local;
  float since, vis;
  vec3 w = placeBlock(n, local, since, vis);
  if (vis <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vWorld = w;
  vNormal = n;
  vLocal = local;
  vUV = aUV;
  vSince = since;
  vMat = int(aInfo.x + 0.5);
  vKind = int(aInfo.w + 0.5);
  vCell = aPos;
  vLight = uLightVP * vec4(w + n * 0.04, 1.0);
  gl_Position = uVP * vec4(w, 1.0);
}
`;

export const VOXEL_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;
precision highp sampler2DShadow;
${COMMON}
in vec3 vWorld;
in vec3 vNormal;
in vec3 vLocal;
in vec2 vUV;
in vec4 vLight;
in float vSince;
flat in int vMat;
flat in int vKind;
flat in vec3 vCell;

uniform sampler3D uOcc;
uniform sampler2DShadow uShadow;
uniform vec3 uDims;
uniform float uShadowTexel;
uniform vec4 uPal[32];
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uFogColor;
uniform vec3 uCamPos;
uniform vec2 uFog; // start, end
uniform vec2 uFocus; // distance, range
uniform float uNight;
uniform float uTime;
uniform float uExposure;
uniform float uFlash;
out vec4 outColor;

float oc(vec3 p) { return texture(uOcc, p / uDims).r; }

float shadowAt(vec4 lp) {
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float s = 0.0;
  float r = uShadowTexel * 1.25;
  s += texture(uShadow, vec3(p.xy, p.z - 0.0009));
  s += texture(uShadow, vec3(p.xy + vec2(r, r * 0.4), p.z - 0.0009));
  s += texture(uShadow, vec3(p.xy + vec2(-r * 0.4, r), p.z - 0.0009));
  s += texture(uShadow, vec3(p.xy + vec2(-r, -r * 0.4), p.z - 0.0009));
  s += texture(uShadow, vec3(p.xy + vec2(r * 0.4, -r), p.z - 0.0009));
  return s / 5.0;
}

void main() {
  vec3 n = normalize(vNormal);
  vec4 pal = uPal[vMat];
  vec3 alb = pal.rgb;
  float jitter = hash13(vCell);
  alb *= 0.95 + 0.1 * jitter;

  // grass: broad patches of warmer and cooler green so the meadow isn't one flat colour
  if (vMat == 0) {
    float macro = 0.5 + 0.5 * sin(vCell.x * 0.23 + sin(vCell.z * 0.19) * 1.7) * sin(vCell.z * 0.21 + 1.3 + sin(vCell.x * 0.11));
    alb *= mix(vec3(0.86, 0.95, 0.93), vec3(1.05, 1.03, 0.94), macro);
  }
  // grass: green on top, earth on the sides under a green lip
  if (vMat == 0 && n.y < 0.5) {
    float wave = sin((vLocal.x + vLocal.z) * 9.0 + jitter * 6.0) * 0.06;
    float lip = smoothstep(0.42, 0.5, vLocal.y + wave);
    alb = mix(uPal[1].rgb * (0.95 + 0.1 * jitter), alb * 0.9, lip);
  }

  // ambient occlusion from the live occupancy volume
  vec3 t1 = abs(n.y) > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 t2 = cross(n, t1);
  vec3 q = vWorld + n * 0.5;
  float a1 = (oc(q + t1 * 0.5) + oc(q - t1 * 0.5) + oc(q + t2 * 0.5) + oc(q - t2 * 0.5)) * 0.25;
  vec3 q2 = vWorld + n * 1.5;
  float a2 = (oc(q2 + t1) + oc(q2 - t1) + oc(q2 + t2) + oc(q2 - t2) + oc(q2)) * 0.2;
  float ao = clamp(1.0 - 0.62 * a1 - 0.32 * a2, 0.34, 1.0);

  float sh = shadowAt(vLight);
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 hemi = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
  vec3 light = hemi * ao + uSunColor * ndl * sh * mix(0.55, 1.0, ao);
  vec3 col = alb * light;

  vec3 V = normalize(uCamPos - vWorld);

  if (vMat == 22) {
    // clouds: soft, wrapped light, no hard shadow
    float wrap = dot(n, uSunDir) * 0.5 + 0.5;
    col = alb * (uSkyAmb * 1.15 + uSunColor * wrap * 0.75);
  } else if (vMat == 5) {
    // water: ripples and a sun glint on top, falling streaks on the sides
    float t = uTime;
    if (n.y > 0.5) {
      vec2 p = vWorld.xz;
      float rip = sin(p.x * 3.1 + t * 1.7) * 0.5 + sin(p.y * 2.3 - t * 1.3 + p.x) * 0.5;
      vec3 pn = normalize(vec3(rip * 0.12, 1.0, cos(p.y * 2.7 + t * 1.5) * 0.12));
      vec3 h = normalize(uSunDir + V);
      float spec = pow(max(dot(pn, h), 0.0), 90.0) * sh;
      col = alb * (hemi * ao * 0.9 + uSunColor * 0.35 * sh) + uSunColor * spec * 1.6 + uSkyAmb * 0.08;
    } else {
      float streak = smoothstep(0.55, 1.0, fract(vWorld.y * 0.45 + t * 1.6 + hash13(vec3(vCell.x, 0.0, vCell.z)) * 3.0 + vLocal.x * 0.7));
      col = alb * (hemi * 1.05 + uSunColor * 0.35) + vec3(0.6, 0.75, 0.85) * streak * 0.35;
    }
  } else if (vMat == 15) {
    // windows: sky reflection by day, warm light at golden hour
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    col = alb * light * 0.8 + uSkyAmb * fres * 0.4;
    col = mix(col, vec3(1.0, 0.62, 0.28) * 1.7, uNight * 0.92);
  } else if (vMat == 23) {
    col = mix(alb * light, vec3(1.0, 0.78, 0.42) * 2.6, 0.25 + 0.75 * uNight);
  } else if (vMat == 28) {
    float pulse = 0.75 + 0.25 * sin(uTime * 2.2);
    col = mix(alb * light, vec3(0.78, 0.66, 1.0) * 3.2, (0.55 + 0.45 * uNight) * pulse);
  }

  // block edges: a soft bevel so the model reads as physical blocks
  vec2 e2 = min(vUV, 1.0 - vUV);
  float ed = min(e2.x, e2.y);
  float bevel = smoothstep(0.0, 0.07, ed);
  bool ground = vKind == 0 && (vMat == 0 || vMat == 1);
  col *= mix(n.y > 0.5 ? (ground ? 0.975 : 0.93) : (ground ? 0.93 : 0.88), 1.0, bevel);
  if (n.y > 0.5 && !ground) col += alb * (1.0 - bevel) * 0.05;

  // build flash: orange for by-hand, white for automated
  if (vKind == 1) col += vec3(1.0, 0.36, 0.08) * exp(-vSince * 3.2) * 1.4 * uFlash;
  else if (vKind == 2) col += vec3(0.9, 0.95, 1.0) * exp(-vSince * 5.0) * 0.8 * uFlash;

  // aerial perspective + the underside melting into the cloud sea
  float dist = length(uCamPos - vWorld);
  float fog = smoothstep(uFog.x, uFog.y, dist) * 0.7;
  fog = max(fog, smoothstep(14.0, -8.0, vWorld.y) * 0.55);
  col = mix(col, uFogColor, fog);

  // in focus across the subject, then a smooth falloff in front and behind
  float coc = smoothstep(uFocus.y * 0.55, uFocus.y * 1.9, abs(dist - uFocus.x));
  outColor = vec4(toDisplay(col, uExposure), coc);
}
`;

export const SHADOW_VS = /* glsl */ `#version 300 es
precision highp float;
${COMMON}
${VOXEL_TRANSFORM}
uniform mat4 uLightVP;
void main() {
  vec3 n, local;
  float since, vis;
  vec3 w = placeBlock(n, local, since, vis);
  if (vis <= 0.0 || int(aInfo.x + 0.5) == 22) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  gl_Position = uLightVP * vec4(w, 1.0);
}
`;

export const SHADOW_FS = /* glsl */ `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(1.0); }
`;

export const FULLSCREEN_VS = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SKY_FS = /* glsl */ `#version 300 es
precision highp float;
${COMMON}
in vec2 vUv;
uniform mat4 uInvVP;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSeaLit;
uniform vec3 uSeaShade;
uniform float uTime;
uniform float uExposure;
out vec4 outColor;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(vec3(i, 1.0)), b = hash13(vec3(i + vec2(1.0, 0.0), 1.0));
  float c = hash13(vec3(i + vec2(0.0, 1.0), 1.0)), d = hash13(vec3(i + vec2(1.0, 1.0), 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += vnoise(p) * a;
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec4 a = uInvVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize(a.xyz / a.w - uCamPos);
  float y = dir.y;
  vec3 sky = mix(uHorizon, uZenith, smoothstep(-0.05, 0.75, y));
  float sd = max(dot(dir, uSunDir), 0.0);
  sky += uSunColor * (pow(sd, 5.0) * 0.18 + pow(sd, 48.0) * 0.5 + pow(sd, 900.0) * 3.0);

  if (y < 0.02) {
    // a sea of clouds far below the island
    float seaY = -34.0;
    float t = (seaY - uCamPos.y) / min(y, -0.004);
    vec3 p = uCamPos + dir * t;
    vec2 uv = p.xz * 0.016 + vec2(uTime * 0.004, uTime * 0.0016);
    float d = fbm(uv);
    float d2 = fbm(uv * 2.4 + 13.0 + uTime * 0.0015);
    float billow = d * 0.62 + d2 * 0.38;
    float cloud = smoothstep(0.34, 0.66, billow);
    // light the billows from the sun's side so they read as volumes
    float dx = fbm(uv + vec2(0.02, 0.0)) - d;
    float dz = fbm(uv + vec2(0.0, 0.02)) - d;
    float rim = clamp(0.5 - (dx * uSunDir.x + dz * uSunDir.z) * 18.0, 0.0, 1.0);
    vec3 sea = mix(uSeaShade, uSeaLit, clamp(cloud * (0.55 + 0.45 * rim), 0.0, 1.0));
    sea += uSunColor * pow(sd, 4.0) * 0.35 * cloud;
    float haze = 1.0 - exp(-t * 0.0013);
    vec3 below = mix(sea, uHorizon, clamp(haze, 0.0, 1.0));
    sky = mix(sky, below, smoothstep(0.02, -0.06, y));
  }
  outColor = vec4(toDisplay(sky, uExposure), 1.0);
}
`;

export const GLOW_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec4 aLight; // xyz, size
layout(location = 2) in float aKind; // 0 lamp, 1 orb
uniform mat4 uV;
uniform mat4 uP;
uniform float uTime;
uniform float uOrbY;
out vec2 vQ;
flat out float vKind;
void main() {
  vec3 c = aLight.xyz;
  if (aKind > 0.5) c.y += uOrbY;
  vec4 v = uV * vec4(c, 1.0);
  v.xyz += normalize(-v.xyz) * 1.2;
  float s = aLight.w * (aKind > 0.5 ? 1.0 + 0.08 * sin(uTime * 2.2) : 1.0);
  v.xy += aQuad * s;
  vQ = aQuad;
  vKind = aKind;
  gl_Position = uP * v;
}
`;

export const GLOW_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vQ;
flat in float vKind;
uniform float uNight;
uniform float uOrbOn;
out vec4 o;
void main() {
  float r2 = dot(vQ, vQ);
  if (r2 > 1.0) discard;
  float g = exp(-r2 * 5.0) * (1.0 - r2);
  vec3 c = vKind > 0.5 ? vec3(0.62, 0.5, 1.0) * (0.35 + 0.65 * uNight) * uOrbOn : vec3(1.0, 0.7, 0.35) * uNight;
  o = vec4(c * g * 0.9, 0.0);
}
`;

// Blur with circle-of-confusion weighting: in-focus pixels don't bleed into the background.
export const BLUR_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uStep;
uniform float uWeighted;
out vec4 o;
void main() {
  const float w0 = 0.2270270270, w1 = 0.3162162162, w2 = 0.0702702703;
  vec2 d1 = uStep * 1.3846153846, d2 = uStep * 3.2307692308;
  vec4 s0 = texture(uSrc, vUv);
  vec4 s1 = texture(uSrc, vUv + d1), s2 = texture(uSrc, vUv - d1);
  vec4 s3 = texture(uSrc, vUv + d2), s4 = texture(uSrc, vUv - d2);
  if (uWeighted > 0.5) {
    vec4 acc = vec4(0.0);
    float c;
    c = max(s0.a, 0.04) * w0; acc += vec4(s0.rgb * c, c);
    c = max(s1.a, 0.04) * w1; acc += vec4(s1.rgb * c, c);
    c = max(s2.a, 0.04) * w1; acc += vec4(s2.rgb * c, c);
    c = max(s3.a, 0.04) * w2; acc += vec4(s3.rgb * c, c);
    c = max(s4.a, 0.04) * w2; acc += vec4(s4.rgb * c, c);
    o = acc;
  } else {
    o = s0 * w0 + (s1 + s2) * w1 + (s3 + s4) * w2;
  }
}
`;

export const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSharp;
uniform sampler2D uBlur1;
uniform sampler2D uBlur2;
uniform vec3 uTilt; // focus y (0..1 from bottom), clear half-band, strength
uniform float uTime;
uniform float uFade;
uniform vec3 uBg;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec4 s = texture(uSharp, vUv);
  float tilt = smoothstep(uTilt.y, uTilt.y + 0.42, abs(vUv.y - uTilt.x)) * uTilt.z;
  float coc = clamp(max(s.a, tilt), 0.0, 1.0);
  vec4 b1 = texture(uBlur1, vUv);
  vec4 b2 = texture(uBlur2, vUv);
  vec3 c1 = b1.a > 0.0001 ? b1.rgb / b1.a : s.rgb;
  vec3 c2 = b2.a > 0.0001 ? b2.rgb / b2.a : c1;
  vec3 c = coc < 0.5 ? mix(s.rgb, c1, smoothstep(0.0, 0.5, coc)) : mix(c1, c2, smoothstep(0.5, 1.0, coc));
  // miniature grade: a touch more saturation and a gentle S-curve
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.1);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);
  // vignette
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.34;
  // grain hides banding in the sky
  c += (hash(vUv * 1024.0 + fract(uTime) * 61.0) - 0.5) * 0.012;
  c = mix(uBg, c, uFade);
  o = vec4(c, 1.0);
}
`;
