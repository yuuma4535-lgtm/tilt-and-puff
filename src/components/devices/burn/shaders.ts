/**
 * Shared burn / ash shaders — identical look for Roll and Cigar.
 * Tip: FBM ember + ash silhouette. Crumb: lumpy falling flakes.
 * Kept lean (2-octave FBM) for mobile GPU cost.
 */

import { Skia } from '@shopify/react-native-skia';

export const TIP_SKSL = `
uniform float2 u_resolution;
uniform float u_crust;
uniform float u_overlap;
uniform float u_time;
uniform float u_ember;
uniform float u_puff;

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + float2(1.0, 0.0)), u.x),
    mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 2; i++) {
    v += a * valueNoise(p);
    p = p * 2.05 + float2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

half4 main(float2 xy) {
  float2 res = max(u_resolution, float2(1.0));
  float2 uv = xy / res;
  float t = u_time * 0.001;
  float intens = clamp(u_ember, 0.0, 1.0);
  float puff = clamp(u_puff, 0.0, 1.0);

  float overlapFrac = clamp(u_overlap / res.y, 0.02, 0.35);
  float contentH = max(res.y - u_overlap, 1.0);
  float crustFrac = overlapFrac + clamp(u_crust / contentH, 0.06, 0.9) * (contentH / res.y);

  float2 pSlow = uv * float2(4.2, 5.5) + float2(t * 0.04, 2.1);
  float2 pMid  = uv * float2(9.5, 11.0) + float2(-t * 0.07, 8.3);

  float n1 = fbm(pSlow);
  float n2 = fbm(pMid);
  float grain = n1 * 0.62 + n2 * 0.38;

  float topWave = fbm(float2(uv.x * 14.0, 4.2));
  float topEdge = overlapFrac * (0.25 + topWave * 0.95);
  float topMask = smoothstep(topEdge - 0.012, topEdge + 0.01, uv.y);

  float frontWave = (fbm(float2(uv.x * 11.0, 7.5)) - 0.5) * 0.16;
  float front = crustFrac + frontWave;
  float blendW = 0.05 + n2 * 0.035;
  float emberAmt = 1.0 - smoothstep(front - blendW, front + blendW * 0.9, uv.y);

  float botWave = fbm(float2(uv.x * 12.0, 40.0));
  float botEdge = 1.0 - (0.008 + botWave * 0.04);
  float botMask = 1.0 - smoothstep(botEdge - 0.01, botEdge + 0.008, uv.y);

  float sideWave = fbm(float2(uv.y * 10.0, 5.1));
  float insetBase = mix(0.012, 0.048, sideWave);
  insetBase *= mix(0.55, 1.2, 1.0 - emberAmt);
  float left = clamp(insetBase + (n2 - 0.5) * 0.018, 0.0, 0.07);
  float right = clamp(1.0 - insetBase + (n2 - 0.5) * 0.018, 0.93, 1.0);
  float sideMask =
      smoothstep(left - 0.01, left + 0.006, uv.x) *
      (1.0 - smoothstep(right - 0.006, right + 0.01, uv.x));

  float alpha = topMask * botMask * sideMask;
  if (alpha < 0.004) {
    return half4(0.0);
  }

  float heat = clamp(grain * 0.75 + n2 * 0.3, 0.0, 1.0);
  float localGlow = mix(0.55, 1.45, heat);
  localGlow *= mix(0.85, 1.35, puff);
  localGlow *= mix(0.55, 1.2, intens);
  float flicker = 0.9 + 0.1 * sin(t * 2.1 + n1 * 6.28);
  flicker *= 0.94 + 0.06 * sin(t * 5.3 + n2 * 4.0);
  localGlow *= flicker;

  float3 charDark = float3(0.1, 0.05, 0.03);
  float3 emberRed = float3(0.72, 0.16, 0.04);
  float3 emberOrg = float3(1.0, 0.48, 0.08);
  float3 emberYel = float3(1.0, 0.92, 0.5);
  float3 emberHot = float3(1.0, 0.98, 0.92);

  float h = clamp(heat * localGlow, 0.0, 1.2);
  float3 emberCol = mix(charDark, emberRed, smoothstep(0.0, 0.22, h));
  emberCol = mix(emberCol, emberOrg, smoothstep(0.18, 0.48, h));
  emberCol = mix(emberCol, emberYel, smoothstep(0.42, 0.72, h));
  emberCol = mix(emberCol, emberHot, smoothstep(0.65, 1.05, h));
  emberCol += float3(0.22, 0.07, 0.01) * (0.35 + heat * 0.55) * mix(0.45, 1.15, intens);
  emberCol += float3(0.15, 0.05, 0.0) * puff * 0.35;

  float ashTone = clamp(0.42 + (grain - 0.5) * 0.38, 0.22, 0.72);
  float3 ashBase = float3(0.55, 0.52, 0.48);
  float3 ashDark = float3(0.32, 0.30, 0.28);
  float3 ashLite = float3(0.68, 0.65, 0.60);
  float3 ashCol = mix(ashDark, ashBase, smoothstep(0.25, 0.55, ashTone));
  ashCol = mix(ashCol, ashLite, smoothstep(0.55, 0.8, ashTone));
  float pits = smoothstep(0.62, 0.82, n2);
  ashCol = mix(ashCol, ashCol * 0.55, pits * 0.55);
  float shadeX = abs(uv.x - 0.5) * 2.0;
  ashCol *= mix(1.0, 0.78, shadeX * shadeX);

  float fromPaper = smoothstep(topEdge, topEdge + 0.04 + n2 * 0.02, uv.y);
  float3 tipCol = mix(ashCol, emberCol, emberAmt * fromPaper);

  float tipEnd = smoothstep(0.82, botEdge, uv.y);
  tipCol = mix(tipCol, tipCol * 0.88, tipEnd * (1.0 - emberAmt));

  float seam = (1.0 - fromPaper) * (0.55 + n2 * 0.25);
  float3 paperHint = float3(0.9, 0.88, 0.84);
  tipCol = mix(tipCol, mix(paperHint, charDark, 0.65), seam * 0.45);
  tipCol *= mix(0.7, 1.15, max(intens, 0.22));

  return half4(half3(tipCol * alpha), half(alpha));
}
`;

export const ASH_CRUMB_SKSL = `
uniform float2 u_resolution;
uniform float u_seed;
uniform float u_break;

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453123);
}
float valueNoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + float2(1.0, 0.0)), u.x),
    mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 2; i++) {
    v += a * valueNoise(p);
    p = p * 2.1 + float2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
float sdEllipse(float2 p, float2 c, float2 r) {
  float2 q = (p - c) / max(r, float2(0.001));
  return length(q) - 1.0;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

half4 main(float2 xy) {
  float2 res = max(u_resolution, float2(1.0));
  float2 uv = xy / res;
  float seed = u_seed;
  float brk = clamp(u_break, 0.0, 1.0);

  float2 c = uv - 0.5;
  float warp = fbm(c * 5.0 + seed * 3.1) - 0.5;
  float2 p = c + float2(warp, warp * 0.7) * mix(0.12, 0.22, brk);

  float d = sdEllipse(p, float2(0.0, 0.02), float2(0.34, 0.28));
  d = smin(d, sdEllipse(p, float2(-0.16, -0.08), float2(0.2, 0.18)), 0.08);
  d = smin(d, sdEllipse(p, float2(0.18, -0.06), float2(0.22, 0.16)), 0.08);
  d = smin(d, sdEllipse(p, float2(0.04, 0.16), float2(0.18, 0.14)), 0.07);

  float chip = sdEllipse(p, float2(0.22, 0.14), float2(0.12, 0.1) * (0.5 + brk));
  d = max(d, -chip * brk * 1.2);

  d += brk * 0.06 + fbm(p * 8.0 + brk * 4.0) * brk * 0.05;

  float shape = 1.0 - smoothstep(-0.02, 0.05, d);
  float crack = smoothstep(0.55, 0.78, fbm(p * float2(12.0, 5.0) + seed));
  shape *= 1.0 - crack * brk * 0.55;
  if (shape < 0.02) return half4(0.0);

  float grain = fbm(uv * float2(8.0, 10.0) + seed * 17.0);
  float tone = clamp(0.4 + (grain - 0.5) * 0.4, 0.22, 0.7);
  float3 ash = mix(float3(0.3, 0.28, 0.26), float3(0.62, 0.58, 0.54), tone);

  float a = shape * mix(0.94, 0.55, brk);
  return half4(half3(ash * a), half(a));
}
`;

/** Module-level compile — shared by Roll + Cigar, avoids per-mount Make() */
export const tipEffect = Skia.RuntimeEffect.Make(TIP_SKSL);
export const ashCrumbEffect = Skia.RuntimeEffect.Make(ASH_CRUMB_SKSL);
