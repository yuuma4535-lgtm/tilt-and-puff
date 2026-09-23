import { useCallback, useEffect, useState } from 'react';
import {
  useSharedValue,
  useFrameCallback,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { GAUGE_MAX, SKINS } from '../constants';
import type { SkinId } from '../types';

type Options = {
  active: boolean;
  skinId: SkinId;
  isPuffing: boolean;
  onEmpty: () => void;
};

export type GaugeSession = {
  gaugeSV: SharedValue<number>;
  gaugeDisplay: number;
  resetGauge: () => void;
  freeze: () => void;
};

/**
 * Gauge drains only while `active && isPuffing`.
 * Leaving the tilt zone freezes remaining value (resume anytime).
 * Drain runs in a Reanimated frame callback (UI worklet).
 */
export function useGaugeSession({
  active,
  skinId,
  isPuffing,
  onEmpty,
}: Options): GaugeSession {
  const gaugeSV = useSharedValue(GAUGE_MAX);
  const lastTsSV = useSharedValue(-1);
  const activeSV = useSharedValue(0);
  const puffingSV = useSharedValue(0);
  const rateSV = useSharedValue(SKINS[skinId].consumePerSecond);
  const emptiedSV = useSharedValue(0);

  const [gaugeDisplay, setGaugeDisplay] = useState(GAUGE_MAX);

  useEffect(() => {
    activeSV.value = active ? 1 : 0;
  }, [active, activeSV]);

  useEffect(() => {
    puffingSV.value = isPuffing ? 1 : 0;
    if (!isPuffing) {
      lastTsSV.value = -1;
    }
  }, [isPuffing, puffingSV, lastTsSV]);

  useEffect(() => {
    rateSV.value = SKINS[skinId].consumePerSecond;
  }, [skinId, rateSV]);

  const notifyEmpty = useCallback(() => {
    onEmpty();
  }, [onEmpty]);

  const syncDisplay = useCallback((v: number) => {
    setGaugeDisplay(v);
  }, []);

  const resetGauge = useCallback(() => {
    emptiedSV.value = 0;
    lastTsSV.value = -1;
    gaugeSV.value = GAUGE_MAX;
    setGaugeDisplay(GAUGE_MAX);
  }, [emptiedSV, lastTsSV, gaugeSV]);

  const freeze = useCallback(() => {
    lastTsSV.value = -1;
    puffingSV.value = 0;
  }, [lastTsSV, puffingSV]);

  useEffect(() => {
    if (active) {
      resetGauge();
    } else {
      freeze();
    }
  }, [active, resetGauge, freeze]);

  useFrameCallback((frame) => {
    'worklet';
    if (activeSV.value !== 1 || puffingSV.value !== 1 || emptiedSV.value === 1) {
      lastTsSV.value = -1;
      return;
    }

    const now = frame.timestamp;
    if (lastTsSV.value < 0) {
      lastTsSV.value = now;
      return;
    }

    const dt = Math.min(0.05, (now - lastTsSV.value) / 1000);
    lastTsSV.value = now;

    const next = Math.max(0, gaugeSV.value - rateSV.value * dt);
    gaugeSV.value = next;
    runOnJS(syncDisplay)(next);

    if (next <= 0 && emptiedSV.value === 0) {
      emptiedSV.value = 1;
      runOnJS(notifyEmpty)();
    }
  }, active);

  return {
    gaugeSV,
    gaugeDisplay,
    resetGauge,
    freeze,
  };
}
