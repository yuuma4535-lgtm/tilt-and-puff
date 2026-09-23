import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Fill, Shader } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ashCrumbEffect } from './shaders';
import { skiaCanvasStyle } from '../../../utils/skiaCanvasStyle';

export type CrumbSpec = {
  id: number;
  w: number;
  h: number;
  x: number;
  seed: number;
  gx: number;
  gy: number;
  impulse: number;
  originBottom: number;
};

/**
 * Build falling crumbs whose total visual area tracks the shed length.
 */
export function makeCrumbBatch(opts: {
  nextId: () => number;
  width: number;
  shedPx: number;
  baseGx: number;
  baseGy: number;
  impulse: number;
  originBottom: number;
  mode: 'natural' | 'knock';
  spreadAmp?: number;
}): CrumbSpec[] {
  const {
    nextId,
    width,
    shedPx,
    baseGx,
    baseGy,
    impulse,
    originBottom,
    mode,
    spreadAmp = mode === 'knock' ? 0.55 : 0.32,
  } = opts;

  const fill = mode === 'knock' ? 0.72 : 0.62;
  let remaining = Math.max(0, shedPx) * width * fill;

  // Cap particle count for GPU — fewer larger flakes still read as volume
  const pieceCount =
    mode === 'knock'
      ? Math.max(2, Math.min(5, Math.round(2 + shedPx / Math.max(16, width * 0.45))))
      : Math.max(1, Math.min(3, Math.round(1 + shedPx / Math.max(18, width * 0.55))));

  const batch: CrumbSpec[] = [];
  for (let i = 0; i < pieceCount; i++) {
    const piecesLeft = pieceCount - i;
    const share = remaining / piecesLeft;

    const aspect = 0.45 + Math.random() * (mode === 'knock' ? 1.1 : 0.85);
    let cw = Math.sqrt(Math.max(share, 40) / Math.max(aspect, 0.35));
    let ch = cw * aspect;

    const maxW = width * (mode === 'knock' ? 0.88 : 0.72);
    cw = Math.max(9, Math.min(cw, maxW));
    ch = Math.max(
      7,
      Math.min(ch, Math.max(shedPx * 0.95, width * 0.35) + (mode === 'knock' ? 18 : 8)),
    );

    remaining = Math.max(0, remaining - cw * ch);

    const spread = (Math.random() - 0.5) * spreadAmp;
    const pgx = baseGx + spread * baseGy;
    const pgy = Math.max(0.2, baseGy - spread * baseGx * 0.3);
    const pn = Math.hypot(pgx, pgy) || 1;

    batch.push({
      id: nextId(),
      w: Math.round(cw),
      h: Math.round(ch),
      x: Math.round(
        (width - cw) * (0.08 + Math.random() * 0.84) + (Math.random() - 0.5) * 6,
      ),
      seed: Math.random() * 100,
      gx: pgx / pn,
      gy: pgy / pn,
      impulse,
      originBottom,
    });
  }

  if (remaining > width * 6 && batch.length > 0) {
    const boost = remaining / batch.length;
    for (const c of batch) {
      const addH = Math.min(28, boost / Math.max(c.w, 1));
      c.h = Math.round(Math.min(c.h + addH, shedPx * 1.15 + 24));
    }
  }

  return batch;
}

export function FallingAshCrumb({
  crumb,
  onDone,
}: {
  crumb: CrumbSpec;
  onDone: (id: number) => void;
}) {
  const distSV = useSharedValue(0);
  const rot = useSharedValue(0);
  const op = useSharedValue(1);
  const breakSV = useSharedValue(0);

  const finish = useCallback(() => {
    onDone(crumb.id);
  }, [onDone, crumb.id]);

  useEffect(() => {
    const boost = crumb.impulse;
    const dist = (150 + Math.random() * 150) * boost;
    const spin =
      (Math.random() > 0.5 ? 1 : -1) *
      (22 + Math.random() * 50) *
      Math.min(1.4, boost);
    const dur = Math.max(420, (740 + Math.random() * 400) / Math.sqrt(boost));
    distSV.value = withTiming(dist, {
      duration: dur,
      easing: Easing.in(Easing.quad),
    });
    rot.value = withTiming(spin, { duration: dur, easing: Easing.linear });
    breakSV.value = withTiming(1, {
      duration: dur,
      easing: Easing.in(Easing.cubic),
    });
    op.value = withTiming(
      0,
      { duration: dur, easing: Easing.in(Easing.cubic) },
      (ok) => {
        if (ok) runOnJS(finish)();
      },
    );
  }, [distSV, rot, op, breakSV, finish, crumb.impulse]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: crumb.gx * distSV.value },
      { translateY: crumb.gy * distSV.value },
      { rotate: `${rot.value}deg` },
    ],
    opacity: op.value,
  }));

  const uniforms = useDerivedValue(() => ({
    u_resolution: [crumb.w, crumb.h],
    u_seed: crumb.seed,
    u_break: breakSV.value,
  }));

  if (!ashCrumbEffect) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.crumb,
        {
          left: crumb.x,
          width: crumb.w,
          height: crumb.h,
          bottom: crumb.originBottom,
        },
        style,
      ]}
    >
      <Canvas style={skiaCanvasStyle()}>
        <Fill>
          <Shader source={ashCrumbEffect} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  crumb: {
    position: 'absolute',
    zIndex: 8,
  },
});
