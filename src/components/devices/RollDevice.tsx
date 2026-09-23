import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

type Props = {
  gaugeSV?: SharedValue<number>;
  puffing?: boolean;
  puffProgressSV?: SharedValue<number>;
  /** Continuous 0→1 burn (Roll session). When set, overrides puff-count burn. */
  burnProgressSV?: SharedValue<number>;
  /** Screen-space gravity unit (x right, y down) for ash fall */
  gravityXSV?: SharedValue<number>;
  gravityYSV?: SharedValue<number>;
  /** Increment to knock off most ash (shake) */
  ashKnockId?: number;
  puffCount?: number;
  sessionActive?: boolean;
  settling?: boolean;
  butt?: boolean;
  lengthScale?: number;
  height?: number;
};

/**
 * Consumed (ember+ash) as fraction of body length.
 * 1.0 = tip reaches the filter / tipping-band boundary.
 */
const MAX_ASH_FRAC = 1;

/** Ash must exceed this fraction of full stick before crumbs can fall */
const ASH_SHED_MIN_FRAC = 0.1;

function buildFiberLines(count: number) {
  const lines: { top: number; opacity: number; h: number }[] = [];
  for (let i = 0; i < count; i++) {
    lines.push({
      top: 2.5 + i * (95 / count),
      opacity: 0.06 + (i % 5) * 0.04,
      h: i % 3 === 0 ? 1.4 : 0.7,
    });
  }
  return lines;
}

export function RollDevice({
  puffing = false,
  puffProgressSV,
  burnProgressSV,
  gravityXSV,
  gravityYSV,
  ashKnockId = 0,
  puffCount = 0,
  sessionActive = false,
  settling = false,
  butt = false,
  lengthScale = 1,
  height = 240,
}: Props) {
  const width = Math.max(16, Math.round(height * 0.135));
  const bandH = Math.max(2, Math.round(height * 0.01));
  const filterH = Math.round(height * 0.25);
  const bodyMaxH = Math.max(56, Math.round(height * 0.68 * lengthScale));
  const stickLen = filterH + bandH + bodyMaxH;
  const crustH = Math.max(
    5,
    Math.min(Math.round(width * 0.32), Math.round(bodyMaxH * 0.045)),
  );
  const tipOverlap = Math.max(7, Math.round(width * 0.28));

  const fiberLines = useMemo(() => buildFiberLines(30), []);

  const fallbackProgress = useSharedValue(0);
  const progressSV = puffProgressSV ?? fallbackProgress;
  const fallbackBurn = useSharedValue(-1);
  const continuousBurnSV = burnProgressSV ?? fallbackBurn;
  const puffCountSV = useSharedValue(puffCount);
  const puffingSV = useSharedValue(puffing ? 1 : 0);
  const sessionSV = useSharedValue(sessionActive ? 1 : 0);
  const settlingSV = useSharedValue(settling ? 1 : 0);
  const buttSV = useSharedValue(butt ? 1 : 0);
  /** Visual-only ash lost to crumbling (px). Does not affect burnProgress. */
  const ashShedSV = useSharedValue(0);

  const [crumbs, setCrumbs] = useState<CrumbSpec[]>([]);
  const crumbIdRef = useMemo(() => ({ n: 0 }), []);

  useEffect(() => {
    puffCountSV.value = puffCount;
  }, [puffCount, puffCountSV]);
  useEffect(() => {
    puffingSV.value = withTiming(puffing ? 1 : 0, { duration: 140 });
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

  const burnSV = useDerivedValue(() => {
    if (buttSV.value > 0.5) return 1;
    if (sessionSV.value < 0.5) return 0;
    const continuous = continuousBurnSV.value;
    if (continuous >= 0) {
      return Math.min(1, continuous);
    }
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
    const hasLit =
      (continuous >= 0 && continuous > 0.001) || discreteLit;
    if (!hasLit) return 0;

    if (settlingSV.value > 0.5) return 0.12;
    if (puffingSV.value > 0.5) return 1;
    return 0.32;
  });

  const litSV = useDerivedValue(() =>
    buttSV.value > 0.5 || burnSV.value > 0.008 || emberSV.value > 0.05 ? 1 : 0,
  );

  /** Burn-driven tip length before visual shed */
  const consumedHSV = useDerivedValue(() => {
    const body = bodyMaxH;
    if (buttSV.value > 0.5) {
      return Math.max(0, body - Math.max(4, body * 0.06));
    }
    if (litSV.value < 0.5) return 0;
    return Math.max(crustH, body * burnSV.value * MAX_ASH_FRAC);
  });

  /** Visible tip after crumbling (never below crust) */
  const tipHSV = useDerivedValue(() => {
    const consumed = consumedHSV.value;
    if (consumed < 0.5) return 0;
    return Math.max(crustH, consumed - ashShedSV.value);
  });

  const paperStyle = useAnimatedStyle(() => {
    const body = bodyMaxH;
    if (buttSV.value > 0.5) {
      return { height: Math.max(4, body * 0.06) };
    }
    if (litSV.value < 0.5) {
      return { height: body };
    }
    // Paper follows burn only — shed does not grow paper / advance burn front
    return { height: Math.max(0, body - consumedHSV.value) };
  });

  /** Tip sits above a shed gap so the tip end retracts upward */
  // (rendered by TipBurnOverlay — mounts clock only while tip is visible)

  const smokeOriginBottomSV = useDerivedValue(() => {
    const tipH = tipHSV.value;
    if (tipH < 1 || emberSV.value < 0.04) return ashShedSV.value;
    // Crust sits near the top of the tip column
    return ashShedSV.value + Math.max(crustH, tipH * 0.88);
  });

  const smokeW = Math.round(width * 3.45);
  const smokeH = Math.max(95, Math.round(bodyMaxH * 0.48));
  const smokeLit = sessionActive && !butt;

  const removeCrumb = useCallback((id: number) => {
    setCrumbs((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Occasional ash crumb — eligible once cool ash is long enough
  useEffect(() => {
    if (!sessionActive || butt || settling) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      const delay = 4500 + Math.random() * 10000; // ~4.5–14.5s
      timer = setTimeout(() => {
        if (cancelled) return;

        const burn =
          burnProgressSV && burnProgressSV.value >= 0
            ? burnProgressSV.value
            : Math.min(1, puffCount / PUFFS_PER_SESSION);
        const consumed = Math.max(crustH, bodyMaxH * burn * MAX_ASH_FRAC);
        const shedNow = ashShedSV.value;
        const tipVis = Math.max(crustH, consumed - shedNow);
        const ashLen = tipVis - crustH;

        if (ashLen >= stickLen * ASH_SHED_MIN_FRAC) {
          const chunk = Math.min(
            ashLen * (0.08 + Math.random() * 0.1),
            6 + Math.random() * 10,
          );
          const maxShed = Math.max(0, consumed - crustH - 3);
          const nextShed = Math.min(shedNow + chunk, maxShed);
          const actual = nextShed - shedNow;

          if (actual > 2) {
            // Spawn at current tip BEFORE retracting
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
    bodyMaxH,
    stickLen,
    width,
    ashShedSV,
    crumbIdRef,
    gravityXSV,
    gravityYSV,
  ]);

  // Shake knock: leave a short stump (~1–2 diameters of ash), dump the rest
  useEffect(() => {
    if (!sessionActive || butt || settling || ashKnockId <= 0) return;

    const burn =
      burnProgressSV && burnProgressSV.value >= 0
        ? burnProgressSV.value
        : Math.min(1, puffCount / PUFFS_PER_SESSION);
    const consumed = Math.max(crustH, bodyMaxH * burn * MAX_ASH_FRAC);
    const shedNow = ashShedSV.value;
    const tipVis = Math.max(crustH, consumed - shedNow);
    const ashLen = tipVis - crustH;

    // Too little ash to knock — ignore (avoid weird empty bursts)
    if (ashLen < width * 1.15) return;

    // Keep crust + ~1–2 cigarette-diameters of ash at the root
    const stump = crustH + width * (1.05 + Math.random() * 0.95);
    const keepTip = Math.min(tipVis, Math.max(crustH + 4, stump));
    const nextShed = Math.max(shedNow, consumed - keepTip);
    const actual = nextShed - shedNow;
    if (actual < 4) return;

    // Spawn at the live tip end, then retract ash
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
    bodyMaxH,
    width,
    ashShedSV,
    gravityXSV,
    gravityYSV,
    crumbIdRef,
  ]);

  return (
    <View
      style={[styles.wrap, { width, height: filterH + bandH + bodyMaxH }]}
    >
      <View style={[styles.stick, { width }]}>
        <View style={[styles.segment, { height: filterH }]}>
          <LinearGradient
            colors={['#efe2c6', '#e5d0a6', '#d6bc8e', '#c9a87a', '#b89768']}
            locations={[0, 0.22, 0.5, 0.78, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['#00000055', 'transparent', 'transparent', '#00000066']}
            locations={[0, 0.2, 0.55, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['transparent', '#ffffff99', '#ffffff44', 'transparent']}
            locations={[0.1, 0.32, 0.42, 0.6]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          {fiberLines.map((line, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: '4%',
                right: '4%',
                top: `${line.top}%`,
                height: line.h,
                backgroundColor: i % 2 === 0 ? '#6a4c2c' : '#a07850',
                opacity: line.opacity,
              }}
            />
          ))}
        </View>

        <View style={{ height: bandH, width: '100%' }}>
          <LinearGradient
            colors={['#3a3a48', '#1a1a28', '#2e2e3a']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={[styles.body, { height: bodyMaxH }]}>
          <Animated.View style={[styles.segment, paperStyle]}>
            <LinearGradient
              colors={['#c8c2b8', '#f2eee7', '#ffffff', '#f5f1ea', '#c4beb4']}
              locations={[0, 0.16, 0.4, 0.7, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={['#00000050', 'transparent', 'transparent', '#00000058']}
              locations={[0, 0.18, 0.55, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={['transparent', '#ffffffbb', '#ffffff55', 'transparent']}
              locations={[0.1, 0.3, 0.4, 0.55]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.seam, { left: '40%' }]} />
          </Animated.View>

          <TipBurnOverlay
            width={width}
            tipOverlap={tipOverlap}
            crustH={crustH}
            tipHSV={tipHSV}
            ashShedSV={ashShedSV}
            emberSV={emberSV}
            puffingSV={puffingSV}
            fallback
          />
        </View>
      </View>

      {/* Sidestream — outside stick so plume isn't clipped */}
      {smokeLit ? (
        <SidestreamSmoke
          width={smokeW}
          height={smokeH}
          emberSV={emberSV}
          gravityXSV={gravityXSV}
          gravityYSV={gravityYSV}
          originBottomSV={smokeOriginBottomSV}
          stickWidth={width}
          active={smokeLit}
        />
      ) : null}

      {/* Falling crumbs — outside stick so they aren't clipped */}
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
  stick: {
    overflow: 'hidden',
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#00000024',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  body: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  segment: {
    width: '100%',
    overflow: 'hidden',
  },
  tipOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  tipFallback: {
    backgroundColor: '#9a9690',
  },
  seam: {
    position: 'absolute',
    top: '2%',
    bottom: '2%',
    width: 1,
    backgroundColor: '#00000018',
  },
});
