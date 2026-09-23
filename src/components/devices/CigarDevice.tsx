import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Fill,
  ImageShader,
  Shader,
  Skia,
  useImage,
} from '@shopify/react-native-skia';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { PUFFS_PER_SESSION } from '../../constants';
import { SidestreamSmoke } from './SidestreamSmoke';
import { FallingAshCrumb, makeCrumbBatch, type CrumbSpec } from './burn/crumbs';
import { TipBurnOverlay } from './burn/TipBurnOverlay';
import { skiaCanvasStyle } from '../../utils/skiaCanvasStyle';

type Props = {
  gaugeSV: SharedValue<number>;
  puffing?: boolean;
  puffProgressSV?: SharedValue<number>;
  burnProgressSV?: SharedValue<number>;
  puffCount?: number;
  sessionActive?: boolean;
  settling?: boolean;
  butt?: boolean;
  gravityXSV?: SharedValue<number>;
  gravityYSV?: SharedValue<number>;
  ashKnockId?: number;
  height?: number;
};

/**
 * Cylinder lighting over a tiled wrapper ImageShader child.
 * Samples `image` (baked tobacco tile) then applies strong form + sheen.
 */
const WRAPPER_SHADE_SKSL = `
uniform shader image;
uniform float2 u_resolution;

half4 main(float2 xy) {
  float2 res = max(u_resolution, float2(1.0));
  float2 uv = xy / res;

  // Soft cylinder sides + rounded head only (foot stays a flat cut)
  float inset = 0.028;
  float side = smoothstep(inset - 0.012, inset + 0.01, uv.x) *
               (1.0 - smoothstep(1.0 - inset - 0.01, 1.0 - inset + 0.012, uv.x));
  float endR = min(0.5, 0.62 * res.x / max(res.y, 1.0));
  float2 headN = float2((uv.x - 0.5) / 0.5, (uv.y) / max(endR, 0.001));
  float headCap = 1.0 - smoothstep(0.92, 1.08, length(headN));
  float yBody = smoothstep(0.0, endR * 0.85, uv.y) *
                (1.0 - smoothstep(0.992, 1.0, uv.y));
  float yMask = max(yBody, headCap * step(uv.y, endR));
  float mask = side * yMask;

  half4 tex = image.eval(xy);
  float3 col = tex.rgb;

  col = mix(col, col * float3(1.08, 0.92, 0.78), 0.35);

  float nx = (uv.x - 0.5) * 2.0;
  float cyl = clamp(1.0 - nx * nx, 0.0, 1.0);
  col *= mix(0.32, 1.22, pow(cyl, 0.65));

  float spec1 = exp(-pow((uv.x - 0.36) * 9.0, 2.0)) * 0.34;
  float spec2 = exp(-pow((uv.x - 0.48) * 20.0, 2.0)) * 0.1;
  col += float3(spec1 + spec2) * float3(1.1, 0.88, 0.5);

  col *= mix(0.78, 1.0, smoothstep(0.0, 0.1, uv.y));
  col = mix(col, col * float3(0.9, 0.75, 0.55), smoothstep(0.9, 1.0, uv.y) * 0.35);

  float a = clamp(mask, 0.0, 1.0);
  return half4(half3(col * a), half(a));
}
`;

/** Existing fictional gold/navy band — kept as-is */
const BAND_SKSL = `
uniform float2 u_resolution;

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

half4 main(float2 xy) {
  float2 res = max(u_resolution, float2(1.0));
  float2 uv = xy / res;

  float edge = smoothstep(0.0, 0.1, uv.y) * (1.0 - smoothstep(0.9, 1.0, uv.y));
  float side = smoothstep(0.015, 0.06, uv.x) * (1.0 - smoothstep(0.94, 0.985, uv.x));
  float mask = edge * side;

  float3 black = float3(0.06, 0.05, 0.05);
  float3 gold = float3(0.82, 0.68, 0.32);
  float3 goldHi = float3(0.96, 0.88, 0.55);
  float3 wine = float3(0.42, 0.08, 0.12);
  float3 navy = float3(0.1, 0.12, 0.28);

  float gx = abs(fract(uv.x * 22.0) - 0.5);
  float gy = abs(fract(uv.y * 7.0) - 0.5);
  float lattice = (1.0 - smoothstep(0.0, 0.06, gx)) + (1.0 - smoothstep(0.0, 0.08, gy));
  lattice = clamp(lattice, 0.0, 1.0);
  float3 col = mix(black, gold * 0.85, lattice * 0.55);

  float railT = smoothstep(0.06, 0.14, uv.y) * (1.0 - smoothstep(0.18, 0.26, uv.y));
  float railB = smoothstep(0.74, 0.82, uv.y) * (1.0 - smoothstep(0.86, 0.94, uv.y));
  col = mix(col, gold, max(railT, railB) * 0.95);
  col = mix(col, goldHi, max(railT, railB) * 0.25 * (1.0 - abs(uv.x - 0.5) * 2.0));

  float ribbon = smoothstep(0.28, 0.34, uv.y) * (1.0 - smoothstep(0.66, 0.72, uv.y));
  col = mix(col, mix(wine, navy, 0.35), ribbon * 0.85);
  float hair = abs(uv.y - 0.5);
  col = mix(col, gold, ribbon * (1.0 - smoothstep(0.0, 0.02, abs(hair - 0.14))) * 0.7);

  float2 c = (uv - float2(0.5, 0.5)) * float2(1.0, 1.35);
  float shield = max(abs(c.x) * 1.1 + abs(c.y) * 0.35, abs(c.y) * 1.4);
  float crestOut = 1.0 - smoothstep(0.16, 0.2, shield);
  float crestIn = 1.0 - smoothstep(0.1, 0.14, shield);
  float diamond = abs(c.x) * 1.6 + abs(c.y) * 2.0;
  float dia = 1.0 - smoothstep(0.07, 0.1, diamond);
  col = mix(col, gold, crestOut * 0.9);
  col = mix(col, wine * 0.9, crestIn * 0.9);
  col = mix(col, goldHi, dia * 0.95);
  float spark = step(0.94, hash(floor(uv * float2(36.0, 12.0) + 2.0)));
  col = mix(col, goldHi, spark * crestOut * 0.4);

  float nx = abs(uv.x - 0.5) * 2.0;
  float foil = exp(-pow((uv.x - 0.36) * 10.0, 2.0)) * 0.18;
  col += goldHi * foil * 0.35;
  col *= mix(1.12, 0.55, nx * nx);
  col *= 0.92 + valueNoise(uv * float2(30.0, 12.0)) * 0.1;

  float a = mask * 0.98;
  return half4(half3(col * a), half(a));
}
`;

/**
 * Burn end = band bottom (like Roll filter). burnProgress 1.0 → ash front there.
 * Computed per layout from bandTop + bandH.
 */
const ASH_SHED_MIN_FRAC = 0.1;
const WRAPPER_TEX = require('../../../assets/textures/cigar-wrapper.png');

const shadeFx = Skia.RuntimeEffect.Make(WRAPPER_SHADE_SKSL);
const bandFx = Skia.RuntimeEffect.Make(BAND_SKSL);

/**
 * Cigar: wrapper + band + shared Roll burn stack.
 * Height model: unburned + tip (+ shed) = bodyH; burn ends at band bottom.
 */
export function CigarDevice({
  gaugeSV: _gaugeSV,
  puffing = false,
  puffProgressSV,
  burnProgressSV,
  puffCount = 0,
  sessionActive = false,
  settling = false,
  butt = false,
  gravityXSV,
  gravityYSV,
  ashKnockId = 0,
  height = 240,
}: Props) {
  const width = Math.max(40, Math.round(height * 0.29));
  const bodyH = Math.round(height * 0.92);
  const bandH = Math.max(18, Math.round(height * 0.062));
  const bandTop = Math.round(bodyH * 0.09);
  /** Yellow band lower edge — burn front stops here (Roll filter equivalent) */
  const bandBottom = bandTop + bandH;
  const stumpH = bandBottom;
  const burnableH = Math.max(1, bodyH - bandBottom);
  const maxAshFrac = burnableH / bodyH;
  const headRadius = Math.round(width * 0.48);
  // Thin ember band ≈ stick diameter fraction (capped vs body), same as Roll
  const crustH = Math.max(
    5,
    Math.min(Math.round(width * 0.35), Math.round(bodyH * 0.045)),
  );
  const tipOverlap = Math.max(7, Math.round(width * 0.22));

  const wrapperImage = useImage(WRAPPER_TEX);

  const fallbackProgress = useSharedValue(0);
  const progressSV = puffProgressSV ?? fallbackProgress;
  const fallbackBurn = useSharedValue(-1);
  const continuousBurnSV = burnProgressSV ?? fallbackBurn;
  const puffCountSV = useSharedValue(puffCount);
  const puffingSV = useSharedValue(puffing ? 1 : 0);
  const sessionSV = useSharedValue(sessionActive ? 1 : 0);
  const settlingSV = useSharedValue(settling ? 1 : 0);
  const buttSV = useSharedValue(butt ? 1 : 0);
  const ashShedSV = useSharedValue(0);

  const [crumbs, setCrumbs] = useState<CrumbSpec[]>([]);
  const crumbIdRef = useMemo(() => ({ n: 0 }), []);

  useEffect(() => {
    puffCountSV.value = puffCount;
  }, [puffCount, puffCountSV]);
  useEffect(() => {
    puffingSV.value = withTiming(puffing ? 1 : 0, { duration: 200 });
  }, [puffing, puffingSV]);
  useEffect(() => {
    sessionSV.value = sessionActive ? 1 : 0;
  }, [sessionActive, sessionSV]);
  useEffect(() => {
    settlingSV.value = settling ? 1 : 0;
  }, [settling, settlingSV]);
  useEffect(() => {
    buttSV.value = withTiming(butt ? 1 : 0, { duration: 280 });
  }, [butt, buttSV]);
  useEffect(() => {
    if (!sessionActive || butt) {
      ashShedSV.value = 0;
      setCrumbs([]);
    }
  }, [sessionActive, butt, ashShedSV]);

  const burnSV = useDerivedValue((): number => {
    if (buttSV.value > 0.5) return 1;
    if (sessionSV.value < 0.5) return 0;
    const continuous = continuousBurnSV.value;
    if (continuous >= 0) return Math.min(1, continuous);
    const slice =
      puffingSV.value > 0.5 || settlingSV.value > 0.5 ? progressSV.value : 0;
    return Math.min(1, (puffCountSV.value + slice) / PUFFS_PER_SESSION);
  });

  const emberSV = useDerivedValue((): number => {
    if (buttSV.value > 0.5) return 0;
    if (sessionSV.value < 0.5) return 0;
    const continuous = continuousBurnSV.value;
    const discreteLit =
      puffCountSV.value > 0 ||
      puffingSV.value > 0.5 ||
      progressSV.value > 0.02;
    // Continuous: only glow once burn has actually started (avoids tip-less flash)
    const hasLit =
      continuous >= 0
        ? continuous > 0.001
        : discreteLit;
    if (!hasLit) return 0;
    if (settlingSV.value > 0.5) return 0.12;
    if (puffingSV.value > 0.5) return 1;
    return 0.32;
  });

  const litSV = useDerivedValue(() =>
    buttSV.value > 0.5 || burnSV.value > 0.001 ? 1 : 0,
  );

  /** Burn-driven tip length before visual shed — continuous with burnProgress.
   *  burnProgress 1.0 ⇒ consumed = burnableH ⇒ ash front at band bottom. */
  const consumedHSV = useDerivedValue(() => {
    const body = bodyH;
    if (buttSV.value > 0.5) {
      return Math.max(0, body - stumpH);
    }
    if (litSV.value < 0.5) return 0;
    const grown = body * burnSV.value * maxAshFrac;
    if (grown < 0.5) return 0;
    return grown < crustH ? grown : Math.max(crustH, grown);
  });

  /** Visible tip after crumbling (never below crust once established) */
  const tipHSV = useDerivedValue(() => {
    const consumed = consumedHSV.value;
    if (consumed < 0.5) return 0;
    const visible = Math.max(0, consumed - ashShedSV.value);
    if (visible < 0.5) return 0;
    return visible < crustH ? visible : Math.max(crustH, visible);
  });

  /** Unburned wrapper shrinks frame-by-frame: height + tip (+ shed) = bodyH */
  const wrapperStyle = useAnimatedStyle(() => {
    const body = bodyH;
    if (buttSV.value > 0.5) {
      return { height: stumpH };
    }
    if (litSV.value < 0.5) {
      return { height: body };
    }
    return { height: Math.max(0, body - consumedHSV.value) };
  });

  const smokeOriginBottomSV = useDerivedValue(() => {
    const tipH = tipHSV.value;
    if (tipH < 1 || emberSV.value < 0.04) return ashShedSV.value;
    return ashShedSV.value + Math.max(Math.min(crustH, tipH), tipH * 0.88);
  });

  const shadeUniforms = useDerivedValue(() => ({
    u_resolution: [width, bodyH],
  }));

  const bandUniforms = useDerivedValue(() => ({
    u_resolution: [width + 8, bandH],
  }));

  const removeCrumb = useCallback((id: number) => {
    setCrumbs((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Natural ash fall — same schedule / sizing logic as Roll
  useEffect(() => {
    if (!sessionActive || butt || settling) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      const delay = 4500 + Math.random() * 10000;
      timer = setTimeout(() => {
        if (cancelled) return;

        const burn =
          burnProgressSV && burnProgressSV.value >= 0
            ? burnProgressSV.value
            : Math.min(1, puffCount / PUFFS_PER_SESSION);
        const consumed = Math.max(crustH, bodyH * burn * maxAshFrac);
        const shedNow = ashShedSV.value;
        const tipVis = Math.max(crustH, consumed - shedNow);
        const ashLen = tipVis - crustH;

        if (ashLen >= bodyH * ASH_SHED_MIN_FRAC) {
          const chunk = Math.min(
            ashLen * (0.08 + Math.random() * 0.1),
            6 + Math.random() * 10,
          );
          const maxShed = Math.max(0, consumed - crustH - 3);
          const nextShed = Math.min(shedNow + chunk, maxShed);
          const actual = nextShed - shedNow;

          if (actual > 2) {
            const tipOrigin = shedNow;
            ashShedSV.value = withTiming(nextShed, {
              duration: 220,
              easing: Easing.out(Easing.cubic),
            });
            const gx = gravityXSV?.value ?? 0;
            const gy = gravityYSV?.value ?? 1;
            const gLen = Math.hypot(gx, gy) || 1;
            const batch = makeCrumbBatch({
              nextId: () => {
                crumbIdRef.n += 1;
                return crumbIdRef.n;
              },
              width,
              shedPx: actual,
              baseGx: gx / gLen,
              baseGy: gy / gLen,
              impulse: 1,
              originBottom: tipOrigin,
              mode: 'natural',
            });
            setCrumbs((prev) => [...prev.slice(-1), ...batch].slice(-4));
          }
        }

        schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    sessionActive,
    butt,
    settling,
    burnProgressSV,
    puffCount,
    crustH,
    bodyH,
    maxAshFrac,
    width,
    ashShedSV,
    crumbIdRef,
    gravityXSV,
    gravityYSV,
  ]);

  // Shake knock — same stump logic as Roll
  useEffect(() => {
    if (!sessionActive || butt || settling || ashKnockId <= 0) return;

    const burn =
      burnProgressSV && burnProgressSV.value >= 0
        ? burnProgressSV.value
        : Math.min(1, puffCount / PUFFS_PER_SESSION);
    const consumed = Math.max(crustH, bodyH * burn * maxAshFrac);
    const shedNow = ashShedSV.value;
    const tipVis = Math.max(crustH, consumed - shedNow);
    const ashLen = tipVis - crustH;
    if (ashLen < width * 1.15) return;

    const stump = crustH + width * (1.05 + Math.random() * 0.95);
    const keepTip = Math.min(tipVis, Math.max(crustH + 4, stump));
    const nextShed = Math.max(shedNow, consumed - keepTip);
    const actual = nextShed - shedNow;
    if (actual < 4) return;

    const tipOrigin = shedNow;
    ashShedSV.value = withTiming(nextShed, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });

    const gx = gravityXSV?.value ?? 0;
    const gy = gravityYSV?.value ?? 1;
    const gLen = Math.hypot(gx, gy) || 1;
    const batch = makeCrumbBatch({
      nextId: () => {
        crumbIdRef.n += 1;
        return crumbIdRef.n;
      },
      width,
      shedPx: actual,
      baseGx: gx / gLen,
      baseGy: gy / gLen,
      impulse: 1.45 + Math.random() * 0.35,
      originBottom: tipOrigin,
      mode: 'knock',
    });
    setCrumbs((prev) => [...prev.slice(-1), ...batch].slice(-4));
  }, [
    ashKnockId,
    sessionActive,
    butt,
    settling,
    burnProgressSV,
    puffCount,
    crustH,
    bodyH,
    maxAshFrac,
    width,
    ashShedSV,
    gravityXSV,
    gravityYSV,
    crumbIdRef,
  ]);

  const smokeW = Math.round(width * 3.35);
  const smokeH = Math.max(105, Math.round(bodyH * 0.46));
  const smokeLit = sessionActive && !butt;

  return (
    <View style={[styles.wrap, { width: width + 14, height: bodyH + 10 }]}>
      <View
        style={[
          styles.body,
          {
            width,
            height: bodyH,
            borderTopLeftRadius: headRadius,
            borderTopRightRadius: headRadius,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.wrapper,
            {
              width,
              borderTopLeftRadius: headRadius,
              borderTopRightRadius: headRadius,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            },
            wrapperStyle,
          ]}
          pointerEvents="none"
        >
          {shadeFx && wrapperImage ? (
            <Canvas style={skiaCanvasStyle()}>
              <Fill>
                <Shader source={shadeFx} uniforms={shadeUniforms}>
                  <ImageShader
                    image={wrapperImage}
                    tx="repeat"
                    ty="repeat"
                    fit="fill"
                    rect={{ x: 0, y: 0, width, height: bodyH }}
                  />
                </Shader>
              </Fill>
            </Canvas>
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.fallback]} />
          )}

          {bandFx ? (
            <View
              style={[
                styles.band,
                {
                  top: bandTop,
                  height: bandH,
                  left: -4,
                  width: width + 8,
                  borderRadius: 4,
                  overflow: 'hidden',
                },
              ]}
              pointerEvents="none"
            >
              <Canvas style={skiaCanvasStyle()}>
                <Fill>
                  <Shader source={bandFx} uniforms={bandUniforms} />
                </Fill>
              </Canvas>
            </View>
          ) : null}
        </Animated.View>

        <TipBurnOverlay
          width={width}
          tipOverlap={tipOverlap}
          crustH={crustH}
          tipHSV={tipHSV}
          ashShedSV={ashShedSV}
          emberSV={emberSV}
          puffingSV={puffingSV}
        />
      </View>

      {smokeLit ? (
        <SidestreamSmoke
          width={smokeW}
          height={smokeH}
          emberSV={emberSV}
          gravityXSV={gravityXSV}
          gravityYSV={gravityYSV}
          originBottomSV={smokeOriginBottomSV}
          stickWidth={width}
          density="heavy"
          active={smokeLit}
        />
      ) : null}

      {crumbs.map((c) => (
        <FallingAshCrumb key={c.id} crumb={c} onDone={removeCrumb} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'visible',
  },
  body: {
    overflow: 'visible',
  },
  wrapper: {
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    zIndex: 4,
  },
  fallback: {
    backgroundColor: '#6b3d22',
  },
});
