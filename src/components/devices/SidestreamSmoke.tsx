import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  Canvas,
  Fill,
  Shader,
  Skia,
  useClock,
} from '@shopify/react-native-skia';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { skiaCanvasStyle } from '../../utils/skiaCanvasStyle';

/**
 * Continuous sidestream from the ember.
 * Transparency / premultiplied alpha mirrors VaporField.
 * Ascent is easeOut along age; noise crawl + sway are slow so plumes
 * don't jitter. Gravity up-vector is low-pass filtered in JS.
 */
const SIDESTREAM_SKSL = `
uniform float2 u_resolution;
uniform float u_time;
uniform float u_ember;
uniform float u_upX;
uniform float u_upY;
uniform float u_heavy;

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

float wisp(float2 uv, float age, float seed, float t, float2 up, float2 origin, float heavy) {
  float a = clamp(age, 0.0, 1.0);
  // Soft easeOut rise — smooth, not springy
  float easePow = mix(1.55, 1.28, heavy);
  float push = 1.0 - pow(1.0 - a, easePow);

  float2 side = float2(-up.y, up.x);
  // Very slow lateral drift (was fast fbm → tremble)
  float sway = sin(t * mix(0.28, 0.16, heavy) + seed * 5.5) *
               mix(0.008, mix(0.035, 0.05, heavy), push * push);
  float travel = mix(0.74, 0.86, heavy);
  float2 center = origin + up * (push * travel) + side * sway;

  float coast = smoothstep(0.2, 0.92, push);
  float spreadX = mix(0.03, mix(0.18, 0.26, heavy), coast * coast);
  float spreadY = mix(0.05, mix(0.24, 0.34, heavy), push);
  float2 d = (uv - center) / float2(max(spreadX, 0.01), max(spreadY, 0.01));

  float r2 = dot(d, d);
  float envelope = exp(-r2 * mix(mix(3.0, 2.3, heavy), mix(1.05, 0.82, heavy), coast));
  float core = exp(-r2 * mix(mix(5.4, 4.0, heavy), mix(2.2, 1.6, heavy), coast));

  // Slow crawl — shape evolves gently while center rises smoothly
  float crawl = mix(0.55, 0.32, heavy);
  float2 p1 = d * float2(2.6, 3.2) + float2(t * 0.018 * crawl + seed * 2.5, t * 0.012 * crawl + push);
  float2 p2 = d * float2(4.4, 3.5) + float2(-t * 0.022 * crawl, seed * 4.2) + 19.0;
  float warp = fbm(p1 * 0.85 + float2(t * 0.008 * crawl, seed));
  p2 += (warp - 0.5) * mix(0.12, 0.35, coast);

  float cloudy = fbm(p1) * 0.55 + fbm(p2) * 0.45;
  float thresh = mix(0.1, 0.34, coast);
  float body = smoothstep(thresh, thresh + 0.3, cloudy);

  float dens = body * envelope;
  dens *= mix(0.95, 0.48, coast) + core * mix(0.65, 0.28, coast);
  dens += dens * cloudy * 0.16;
  dens *= mix(1.2, 1.55, heavy);

  // Longer fades so fract() loop restart doesn't pop / flicker
  float fadeIn = smoothstep(0.0, mix(0.14, 0.2, heavy), a);
  float fadeOut = 1.0 - smoothstep(mix(0.72, 0.66, heavy), 1.0, a);
  return dens * fadeIn * fadeOut;
}

half4 main(float2 xy) {
  float2 res = max(u_resolution, float2(1.0));
  float2 uv = xy / res;
  float intens = clamp(u_ember, 0.0, 1.0);
  float heavy = clamp(u_heavy, 0.0, 1.0);
  if (intens < 0.02) {
    return half4(0.0);
  }

  float t = u_time;
  float2 up = float2(u_upX, u_upY);
  float ul = length(up);
  if (ul < 0.01) {
    up = float2(0.0, -1.0);
  } else {
    up /= ul;
  }

  float2 origin = float2(0.5, 0.9);
  // Slower spawn rate → fewer overlapping morphs, calmer plume
  float rate = mix(0.16, 0.1, heavy);
  float dens = 0.0;
  dens += wisp(uv, fract(t * rate), 0.12, t, up, origin, heavy);
  dens += wisp(uv, fract(t * rate + 0.28), 0.41, t, up, origin, heavy) * 0.95;
  dens += wisp(uv, fract(t * rate + 0.55), 0.73, t, up, origin, heavy) *
          mix(0.8, 0.95, heavy);
  dens += wisp(uv, fract(t * rate + 0.78), 0.88, t, up, origin, heavy) *
          mix(0.5, 0.72, heavy);

  dens *= mix(0.62, 1.12, intens);
  dens = clamp(dens * mix(0.78, 0.92, heavy), 0.0, mix(0.72, 0.86, heavy));

  // Same haze-kill as VaporField — empty pixels fully transparent
  dens *= smoothstep(0.018, 0.09, dens);

  // Soft edge fade (stronger than before — small canvas otherwise shows a plate)
  float edge = smoothstep(0.0, 0.1, uv.x) * smoothstep(0.0, 0.1, 1.0 - uv.x)
             * smoothstep(0.0, 0.04, uv.y) * smoothstep(0.0, 0.12, 1.0 - uv.y);
  dens *= edge;

  if (dens < 0.004) {
    return half4(0.0);
  }

  float3 colLite = float3(0.74, 0.76, 0.79);
  float3 colHeavy = float3(0.64, 0.66, 0.69);
  float3 col = mix(colLite, colHeavy, heavy);
  return half4(half3(col * dens), half(dens));
}
`;

const sidestreamEffect = Skia.RuntimeEffect.Make(SIDESTREAM_SKSL);

/** Low-pass factor per frame (~60fps) — damps sensor / tip jitter */
const UP_SMOOTH = 0.07;
const BOTTOM_SMOOTH = 0.1;

type Props = {
  width: number;
  height: number;
  emberSV: SharedValue<number>;
  gravityXSV?: SharedValue<number>;
  gravityYSV?: SharedValue<number>;
  originBottomSV: SharedValue<number>;
  stickWidth: number;
  /** Roll = light wisps; cigar = heavy / slow */
  density?: 'light' | 'heavy';
  /** Parent session gate — false unmounts GPU work */
  active?: boolean;
};

function SidestreamSmokeCanvas({
  width,
  height,
  emberSV,
  gravityXSV,
  gravityYSV,
  originBottomSV,
  stickWidth,
  density,
}: Omit<Props, 'active'> & { density: 'light' | 'heavy' }) {
  const clock = useClock();
  const heavy = density === 'heavy' ? 1 : 0;
  const smoothUpX = useSharedValue(0);
  const smoothUpY = useSharedValue(-1);
  const smoothBottom = useSharedValue(-1);
  const upInited = useSharedValue(0);

  const uniforms = useDerivedValue(() => {
    const gx = gravityXSV?.value ?? 0;
    const gy = gravityYSV?.value ?? 1;
    let ux = -gx;
    let uy = -gy;
    const n = Math.hypot(ux, uy);
    if (n < 0.05) {
      ux = 0;
      uy = -1;
    } else {
      ux /= n;
      uy /= n;
    }

    if (upInited.value < 0.5) {
      smoothUpX.value = ux;
      smoothUpY.value = uy;
      upInited.value = 1;
    } else {
      smoothUpX.value += (ux - smoothUpX.value) * UP_SMOOTH;
      smoothUpY.value += (uy - smoothUpY.value) * UP_SMOOTH;
    }
    let sux = smoothUpX.value;
    let suy = smoothUpY.value;
    const sn = Math.hypot(sux, suy) || 1;
    sux /= sn;
    suy /= sn;

    return {
      u_resolution: [width, height],
      u_time: clock.value / 1000,
      u_ember: emberSV.value,
      u_upX: sux,
      u_upY: suy,
      u_heavy: heavy,
    };
  }, [width, height, emberSV, gravityXSV, gravityYSV, clock, heavy]);

  const style = useAnimatedStyle(() => {
    const target = originBottomSV.value;
    if (smoothBottom.value < 0) {
      smoothBottom.value = target;
    } else {
      smoothBottom.value += (target - smoothBottom.value) * BOTTOM_SMOOTH;
    }
    return {
      bottom: smoothBottom.value,
      opacity: emberSV.value > 0.04 ? 1 : 0,
    };
  });

  if (!sidestreamEffect) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          width,
          height,
          left: (stickWidth - width) / 2,
          backgroundColor: 'transparent',
        },
        style,
      ]}
    >
      <Canvas style={skiaCanvasStyle({ backgroundColor: 'transparent' })}>
        <Fill>
          <Shader source={sidestreamEffect} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </Animated.View>
  );
}

export function SidestreamSmoke({
  width,
  height,
  emberSV,
  gravityXSV,
  gravityYSV,
  originBottomSV,
  stickWidth,
  density = 'light',
  active = true,
}: Props) {
  const [emberHot, setEmberHot] = useState(false);

  useAnimatedReaction(
    () => emberSV.value,
    (v, prev) => {
      const on = v > 0.06;
      const was = prev !== null && prev !== undefined && prev > 0.06;
      if (on !== was) runOnJS(setEmberHot)(on);
    },
    [emberSV],
  );

  useEffect(() => {
    if (emberSV.value > 0.06) setEmberHot(true);
  }, [emberSV]);

  if (!active || !emberHot) return null;

  return (
    <SidestreamSmokeCanvas
      width={width}
      height={height}
      emberSV={emberSV}
      gravityXSV={gravityXSV}
      gravityYSV={gravityYSV}
      originBottomSV={originBottomSV}
      stickWidth={stickWidth}
      density={density}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 6,
    backgroundColor: 'transparent',
  },
});
