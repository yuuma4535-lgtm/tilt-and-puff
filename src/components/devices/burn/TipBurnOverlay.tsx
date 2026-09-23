import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Fill, Shader, useClock } from '@shopify/react-native-skia';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { tipEffect } from './shaders';
import { skiaCanvasStyle } from '../../../utils/skiaCanvasStyle';

type Props = {
  width: number;
  tipOverlap: number;
  crustH: number;
  tipHSV: SharedValue<number>;
  ashShedSV: SharedValue<number>;
  emberSV: SharedValue<number>;
  puffingSV: SharedValue<number>;
  /** Optional solid fallback when effect fails to compile */
  fallback?: boolean;
};

/**
 * Ember+ash tip overlay. Clock + Skia canvas mount only while tip is visible.
 */
export function TipBurnOverlay({
  width,
  tipOverlap,
  crustH,
  tipHSV,
  ashShedSV,
  emberSV,
  puffingSV,
  fallback = false,
}: Props) {
  const [live, setLive] = useState(false);

  useAnimatedReaction(
    () => tipHSV.value,
    (h, prev) => {
      const on = h > 0.5;
      const was = prev !== null && prev !== undefined && prev > 0.5;
      if (on !== was) runOnJS(setLive)(on);
    },
    [tipHSV],
  );

  useEffect(() => {
    if (tipHSV.value > 0.5) setLive(true);
  }, [tipHSV]);

  if (!live) return null;

  return (
    <TipBurnCanvas
      width={width}
      tipOverlap={tipOverlap}
      crustH={crustH}
      tipHSV={tipHSV}
      ashShedSV={ashShedSV}
      emberSV={emberSV}
      puffingSV={puffingSV}
      fallback={fallback}
    />
  );
}

function TipBurnCanvas({
  width,
  tipOverlap,
  crustH,
  tipHSV,
  ashShedSV,
  emberSV,
  puffingSV,
  fallback,
}: Props) {
  const clock = useClock();

  const tipStyle = useAnimatedStyle(() => {
    const h = tipHSV.value;
    if (h < 0.5) return { height: 0, opacity: 0, bottom: 0 };
    return {
      height: h + tipOverlap,
      opacity: 1,
      bottom: ashShedSV.value,
    };
  });

  const tipUniforms = useDerivedValue(() => {
    const tipH = Math.max(1, tipHSV.value);
    return {
      u_resolution: [width, tipH + tipOverlap],
      u_crust: Math.min(crustH, tipH),
      u_overlap: tipOverlap,
      u_time: clock.value,
      u_ember: emberSV.value,
      u_puff: puffingSV.value,
    };
  });

  return (
    <Animated.View style={[styles.tipOverlay, tipStyle]} pointerEvents="none">
      {tipEffect ? (
        <Canvas style={skiaCanvasStyle()}>
          <Fill>
            <Shader source={tipEffect} uniforms={tipUniforms} />
          </Fill>
        </Canvas>
      ) : fallback ? (
        <View style={[StyleSheet.absoluteFill, styles.tipFallback]} />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tipOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
    overflow: 'hidden',
  },
  tipFallback: {
    backgroundColor: '#3a2a22',
  },
});
