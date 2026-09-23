import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  Canvas,
  Fill,
  Shader,
  Skia,
  useClock,
} from '@shopify/react-native-skia';
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SMOKE_EXHALE_MS } from '../../constants';
import type { SkinConfig } from '../../types';

/**
 * Mouth exhale plume — FBM wisps. Density/tempo vary by skin (cigar = heavy & slow).
 */
const SMOKE_SKSL = `
uniform float2 u_resolution;
uniform float u_time;
uniform float u_life;
uniform float u_heavy; // 0 light … 1 cigar-heavy

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 2; i++) {
    v += a * valueNoise(p);
    p = p * 2.02 + float2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

float wisp(
  float2 uv,
  float age,
  float seed,
  float t,
  float heavy
) {
  float a = clamp(age, 0.0, 1.0);
  // Cigar: softer ease → slower, heavier drift
  float easePow = mix(1.65, 1.25, heavy);
  float push = 1.0 - pow(1.0 - a, easePow);

  float jet = 1.0 - smoothstep(0.0, mix(0.42, 0.55, heavy), push);
  float coast = smoothstep(mix(0.25, 0.18, heavy), 0.94, push);

  float2 mouth = float2(0.5, -0.02);
  float travel = mix(0.44, 0.52, heavy);
  float centerY = mouth.y + push * travel;
  float driftAmp = mix(0.18, 0.12, heavy);
  float drift = (seed - 0.5) * mix(0.02, driftAmp, coast);
  float2 center = float2(0.5 + drift, centerY);

  float spreadX = mix(0.045, mix(0.74, 0.86, heavy), coast * coast);
  float spreadY = mix(0.24, mix(0.42, 0.54, heavy), push) * mix(1.22, 0.98, coast);

  float2 d = (uv - center) / float2(max(spreadX, 0.02), max(spreadY, 0.02));
  d.y += jet * mix(0.28, 0.18, heavy) * (1.0 - push);

  float r2 = dot(d, d);
  float envelope = exp(-r2 * mix(mix(2.45, 1.95, heavy), mix(0.95, 0.75, heavy), coast));
  float core = exp(-r2 * mix(mix(5.4, 4.1, heavy), mix(2.25, 1.7, heavy), coast));

  float2 local = d;
  float crawl = mix(1.0, 0.55, heavy);
  float2 p1 = local * float2(2.6, 3.4) + float2(t * 0.045 * crawl + seed * 3.1, t * 0.025 * crawl + push);
  float2 p2 = local * float2(5.0, 3.8) + float2(-t * 0.07 * crawl, seed * 5.0) + 17.0;
  float2 p3 = local * float2(1.8, 2.4) + float2(t * 0.022 * crawl, -t * 0.035 * crawl) + 41.0 + seed * 9.0;

  float warp = fbm(p1 * 0.85 + float2(t * 0.015 * crawl, seed));
  p2 += (warp - 0.5) * mix(0.2, 0.65, coast);
  p3 += (warp - 0.5) * mix(0.12, 0.4, coast);

  float cloudy = fbm(p1) * 0.42 + fbm(p2) * 0.35 + fbm(p3) * 0.28;
  // Tighter smoothstep → stronger light/dark contrast over camera bg
  float thresh = mix(0.08, 0.36, coast);
  float body = smoothstep(thresh, thresh + 0.32, cloudy);

  float dens = body * envelope;
  dens *= mix(0.95, 0.48, coast) + core * mix(0.72, 0.32, coast);
  dens += dens * cloudy * 0.22;
  dens *= mix(1.12, 1.48, heavy);

  float fadeIn = smoothstep(0.0, mix(0.12, 0.16, heavy), a);
  float fadeOut = 1.0 - smoothstep(mix(0.68, 0.62, heavy), 1.0, a);
  return dens * fadeIn * fadeOut;
}

half4 main(float2 xy) {
  float2 uv = xy / u_resolution;
  float life = clamp(u_life, 0.0, 1.0);
  float t = u_time;
  float heavy = clamp(u_heavy, 0.0, 1.0);

  if (life <= 0.001) {
    return half4(0.0);
  }

  float dens = 0.0;
  dens += wisp(uv, life * 1.02 - 0.00, 0.12, t, heavy);
  dens += wisp(uv, life * 1.02 - 0.14, 0.31, t, heavy) * 0.95;
  dens += wisp(uv, life * 1.02 - 0.28, 0.55, t, heavy) * 0.88;
  dens += wisp(uv, life * 1.02 - 0.40, 0.78, t, heavy) * mix(0.7, 0.95, heavy);
  dens += wisp(uv, life * 1.02 - 0.52, 0.91, t, heavy) * mix(0.45, 0.7, heavy);

  float globalFade = smoothstep(0.0, 0.07, life) * (1.0 - smoothstep(0.9, 1.0, life));
  float alphaScale = mix(0.72, 0.92, heavy);
  float alpha = clamp(dens * globalFade * alphaScale, 0.0, mix(0.9, 0.96, heavy));

  // Kill residual haze so empty pixels stay fully transparent (no gray plate)
  alpha *= smoothstep(0.018, 0.09, alpha);

  // Soft-fade at canvas edges — hides the Fill rectangle silhouette
  float edge = smoothstep(0.0, 0.05, uv.x) * smoothstep(0.0, 0.05, 1.0 - uv.x)
             * smoothstep(0.0, 0.03, uv.y) * smoothstep(0.0, 0.08, 1.0 - uv.y);
  alpha *= edge;

  if (alpha < 0.004) {
    return half4(0.0);
  }

  // Cool pale grey — holds up on camera / bright scenes without chalk-white
  float3 colLite = float3(0.74, 0.76, 0.79);
  float3 colHeavy = float3(0.64, 0.66, 0.69);
  float3 col = mix(colLite, colHeavy, heavy);
  // Premultiplied alpha — rgb * a, a
  return half4(half3(col * alpha), half(alpha));
}
`;

type Props = {
  burstId: number;
  /** Fired once when this burst’s plume has fully faded */
  onComplete?: () => void;
  vaporDensity?: SkinConfig['vaporDensity'];
};

function densityToHeavy(d: SkinConfig['vaporDensity'] | undefined): number {
  if (d === 'heavy') return 1;
  if (d === 'medium') return 0.35;
  return 0;
}

function densityDurationMs(d: SkinConfig['vaporDensity'] | undefined): number {
  if (d === 'heavy') return Math.round(SMOKE_EXHALE_MS * 1.35);
  if (d === 'medium') return SMOKE_EXHALE_MS;
  return Math.round(SMOKE_EXHALE_MS * 0.92);
}

/**
 * Mouth exhale plume — quality restored, still one Canvas Fill.
 */
export function VaporField({
  burstId,
  onComplete,
  vaporDensity = 'medium',
}: Props) {
  const { width, height } = useWindowDimensions();
  const heavy = densityToHeavy(vaporDensity);
  const bandH = Math.round(height * (heavy > 0.5 ? 0.48 : 0.42));
  const duration = densityDurationMs(vaporDensity);

  const effect = useMemo(() => Skia.RuntimeEffect.Make(SMOKE_SKSL), []);
  const clock = useClock();
  const life = useSharedValue(0);
  const active = useSharedValue(0);
  const startMs = useSharedValue(0);
  const heavySV = useSharedValue(heavy);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    heavySV.value = heavy;
  }, [heavy, heavySV]);

  const emitComplete = useCallback(() => {
    setVisible(false);
    onCompleteRef.current?.();
  }, []);

  useEffect(() => {
    if (burstId <= 0 || !effect) {
      active.value = 0;
      life.value = 0;
      setVisible(false);
      return;
    }
    setVisible(true);
    startMs.value = clock.value;
    life.value = 0;
    active.value = 1;
    life.value = withTiming(
      1,
      {
        duration,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        'worklet';
        if (finished) {
          active.value = 0;
          runOnJS(emitComplete)();
        }
      },
    );
  }, [burstId, effect, life, active, startMs, clock, emitComplete, duration]);

  const uniforms = useDerivedValue(() => {
    const on = active.value > 0.5;
    return {
      u_resolution: [width, bandH],
      u_time: Math.max(0, (clock.value - startMs.value) / 1000),
      u_life: on ? life.value : 0,
      u_heavy: heavySV.value,
    };
  }, [width, bandH]);

  if (!effect || !visible) return null;

  return (
    <View style={[styles.wrap, { height: bandH }]} pointerEvents="none">
      <Canvas style={{ width, height: bandH, backgroundColor: 'transparent' }}>
        <Fill>
          <Shader source={effect} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
  },
});
