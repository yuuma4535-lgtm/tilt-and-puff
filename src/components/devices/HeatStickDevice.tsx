import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Group } from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { buildHeatStickGeom } from './heatStick/geometry';
import {
  AmbientOcclusion,
  BaseCap,
  HolderBody,
  InsertedStick,
  OuterGlow,
  RimLight,
  SegmentRings,
  SpecularHighlight,
  StatusWindow,
  StickCollar,
} from './heatStick/layers';

type Props = {
  gaugeSV: SharedValue<number>;
  puffing?: boolean;
  puffProgressSV?: SharedValue<number>;
  height?: number;
};

/**
 * Inhale = internal light only (window + body glow). No continuous vapor.
 */
export function HeatStickDevice({
  gaugeSV,
  puffing = false,
  puffProgressSV,
  height = 280,
}: Props) {
  const g = useMemo(() => buildHeatStickGeom(height), [height]);
  const fallbackProgress = useSharedValue(0);
  const progress = puffProgressSV ?? fallbackProgress;
  const activeSV = useSharedValue(0);
  const pulseSV = useSharedValue(0);

  useEffect(() => {
    if (puffing) {
      activeSV.value = withTiming(1, { duration: 180 });
      pulseSV.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 480, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.35, { duration: 480, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      activeSV.value = withTiming(0, { duration: 260 });
      pulseSV.value = withTiming(0, { duration: 260 });
    }
  }, [puffing, activeSV, pulseSV]);

  const glowOpacity = useDerivedValue(() => {
    const gauge = Math.max(0, Math.min(100, gaugeSV.value)) / 100;
    const p = progress.value;
    const on = activeSV.value;
    const pulse = pulseSV.value;
    const idle = 0.08 * gauge;
    const heating = on * (0.22 + 0.45 * pulse + 0.2 * p) * (0.25 + gauge * 0.75);
    return idle + heating;
  });

  return (
    <View
      style={[
        styles.wrap,
        { width: g.canvasW, height: g.canvasH, backgroundColor: 'transparent' },
      ]}
    >
      <Canvas
        style={{
          width: g.canvasW,
          height: g.canvasH,
          backgroundColor: 'transparent',
        }}
      >
        {/* No DropShadow — black blurred oval reads as haze on camera / dark stage */}
        <Group opacity={glowOpacity}>
          <OuterGlow g={g} />
        </Group>
        <InsertedStick g={g} />
        <HolderBody g={g} />
        <StickCollar g={g} />
        <AmbientOcclusion g={g} />
        <SegmentRings g={g} />
        <SpecularHighlight g={g} />
        <RimLight g={g} />
        <StatusWindow g={g} gaugeSV={gaugeSV} puffingSV={activeSV} />
        <BaseCap g={g} />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
