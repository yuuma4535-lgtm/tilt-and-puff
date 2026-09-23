import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  GAUGE_MAX,
  PUFF_DURATION_SEC,
  PUFF_GAUGE_COST,
  PUFFS_PER_SESSION,
  ROLL_BURN_DURATION_SEC,
  CIGAR_BURN_DURATION_SEC,
  SMOKE_EXHALE_MS,
} from '../constants';
import type { BurnSpeed, SkinId } from '../types';

type Options = {
  active: boolean;
  skinId: SkinId;
  tilted: boolean;
  nearVertical: boolean;
  /** Continuous-burn speed for Roll / Cigar */
  burnSpeed?: BurnSpeed;
  /** Full session complete → butts / 吸い殻 */
  onEmpty: () => void;
  /** Fired when a puff ends or continuous burn reaches the end — vapor + exhale SFX */
  onExhale?: () => void;
  /** Fired when a puff / tilt-burn starts — inhale SFX */
  onPuffStart?: () => void;
};

export type PuffSession = {
  gaugeSV: SharedValue<number>;
  puffProgressSV: SharedValue<number>;
  /** Roll/Cigar: 0→1 continuous ash progress; HeatStick unused (0) */
  burnProgressSV: SharedValue<number>;
  gaugeDisplay: number;
  isActivelyPuffing: boolean;
  awaitingUpright: boolean;
  puffCount: number;
  settling: boolean;
  freeze: () => void;
  resetGauge: () => void;
  notifySmokeComplete: () => void;
};

function burnDurationSec(skinId: SkinId, speed: BurnSpeed): number {
  if (skinId === 'cigar') return CIGAR_BURN_DURATION_SEC[speed];
  return ROLL_BURN_DURATION_SEC[speed];
}

/**
 * Heat Stick: max PUFFS_PER_SESSION discrete tilt→return cycles.
 * Roll / Cigar: continuous burn while tilted; pause upright;
 * end when ash reaches filter (Roll) or band bottom (Cigar) → butts.
 */
export function usePuffSession({
  active,
  skinId,
  tilted,
  nearVertical,
  burnSpeed = 'normal',
  onEmpty,
  onExhale,
  onPuffStart,
}: Options): PuffSession {
  const isContinuous = skinId === 'roll' || skinId === 'cigar';

  const gaugeSV = useSharedValue(GAUGE_MAX);
  const puffProgressSV = useSharedValue(0);
  const burnProgressSV = useSharedValue(0);

  const lastTsSV = useSharedValue(-1);
  const activeSV = useSharedValue(0);
  const tiltedSV = useSharedValue(0);
  const settlingSV = useSharedValue(0);
  const continuousSV = useSharedValue(isContinuous ? 1 : 0);
  const rateSV = useSharedValue(1 / burnDurationSec(skinId, burnSpeed));
  const burnDoneSV = useSharedValue(0);
  const lastSyncTsSV = useSharedValue(0);

  const [gaugeDisplay, setGaugeDisplay] = useState(GAUGE_MAX);
  const [isActivelyPuffing, setIsActivelyPuffing] = useState(false);
  const [awaitingUpright, setAwaitingUpright] = useState(false);
  const [puffCount, setPuffCount] = useState(0);
  const [settling, setSettling] = useState(false);

  const onEmptyRef = useRef(onEmpty);
  onEmptyRef.current = onEmpty;
  const onExhaleRef = useRef(onExhale);
  onExhaleRef.current = onExhale;
  const onPuffStartRef = useRef(onPuffStart);
  onPuffStartRef.current = onPuffStart;

  const puffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gaugeRef = useRef(GAUGE_MAX);
  const puffingRef = useRef(false);
  const puffCountRef = useRef(0);
  const puffTargetRef = useRef(GAUGE_MAX);
  const settlingRef = useRef(false);
  const exhaledThisPuffRef = useRef(false);
  const emptyFiredRef = useRef(false);
  /** Continuous: inhale SFX edge while entering tilt */
  const continuousTiltActiveRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (puffTimerRef.current) {
      clearTimeout(puffTimerRef.current);
      puffTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const syncDisplay = useCallback((v: number) => {
    gaugeRef.current = v;
    setGaugeDisplay(v);
  }, []);

  const fireEmpty = useCallback(() => {
    if (emptyFiredRef.current) return;
    emptyFiredRef.current = true;
    onEmptyRef.current();
  }, []);

  const beginSettleAndEnd = useCallback(
    (opts?: { fireExhale?: boolean }) => {
      if (settlingRef.current) return;
      settlingRef.current = true;
      emptyFiredRef.current = false;
      setSettling(true);
      setAwaitingUpright(false);
      settlingSV.value = 1;
      setIsActivelyPuffing(false);
      puffingRef.current = false;
      continuousTiltActiveRef.current = false;

      cancelAnimation(gaugeSV);
      gaugeSV.value = withTiming(0, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
      });
      syncDisplay(0);
      puffProgressSV.value = withTiming(0, { duration: 300 });
      burnProgressSV.value = 1;
      burnDoneSV.value = 1;
      lastTsSV.value = -1;

      if (opts?.fireExhale) {
        onExhaleRef.current?.();
      }

      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        fireEmpty();
      }, SMOKE_EXHALE_MS + 200);
    },
    [
      gaugeSV,
      puffProgressSV,
      burnProgressSV,
      burnDoneSV,
      settlingSV,
      lastTsSV,
      syncDisplay,
      fireEmpty,
    ],
  );

  const notifySmokeComplete = useCallback(() => {
    if (!settlingRef.current) return;
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    fireEmpty();
  }, [fireEmpty]);

  const onRollBurnComplete = useCallback(() => {
    beginSettleAndEnd({ fireExhale: true });
  }, [beginSettleAndEnd]);

  // —— Sync shared flags for continuous-burn frame callback ——
  useEffect(() => {
    continuousSV.value = isContinuous ? 1 : 0;
  }, [isContinuous, continuousSV]);

  useEffect(() => {
    activeSV.value = active ? 1 : 0;
  }, [active, activeSV]);

  useEffect(() => {
    tiltedSV.value = tilted ? 1 : 0;
    if (!tilted) lastTsSV.value = -1;
  }, [tilted, tiltedSV, lastTsSV]);

  useEffect(() => {
    settlingSV.value = settling ? 1 : 0;
  }, [settling, settlingSV]);

  useEffect(() => {
    rateSV.value = 1 / burnDurationSec(skinId, burnSpeed);
  }, [skinId, burnSpeed, rateSV]);

  // Continuous burn on UI thread (Roll + Cigar).
  // autostart must be toggled via setActive — a changing 2nd arg is NOT reactive.
  const burnFrame = useFrameCallback((frame) => {
    'worklet';
    if (continuousSV.value < 0.5) return;
    if (
      activeSV.value < 0.5 ||
      tiltedSV.value < 0.5 ||
      settlingSV.value > 0.5 ||
      burnDoneSV.value > 0.5
    ) {
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

    const rate = rateSV.value;
    if (!(rate > 0)) return;

    const next = Math.min(1, burnProgressSV.value + rate * dt);
    burnProgressSV.value = next;
    const gauge = GAUGE_MAX * (1 - next);
    gaugeSV.value = gauge;
    // Throttle React gaugeDisplay sync (~8 Hz) — UI mostly reads SVs
    if (now - lastSyncTsSV.value > 120) {
      lastSyncTsSV.value = now;
      runOnJS(syncDisplay)(gauge);
    }

    if (next >= 1 && burnDoneSV.value < 0.5) {
      burnDoneSV.value = 1;
      runOnJS(onRollBurnComplete)();
    }
  }, false);

  useEffect(() => {
    burnFrame.setActive(active && isContinuous);
    if (!(active && isContinuous)) {
      lastTsSV.value = -1;
    }
  }, [active, isContinuous, burnFrame, lastTsSV]);

  // —— Discrete puff logic (Heat Stick only) ——
  const completePuff = useCallback(() => {
    if (isContinuous) return;
    if (!puffingRef.current || settlingRef.current) return;
    if (exhaledThisPuffRef.current) {
      puffingRef.current = false;
      return;
    }
    exhaledThisPuffRef.current = true;
    puffingRef.current = false;
    clearTimers();

    const target = puffTargetRef.current;
    cancelAnimation(gaugeSV);
    gaugeSV.value = target;
    syncDisplay(target);
    puffProgressSV.value = withTiming(0, { duration: 180 });
    setIsActivelyPuffing(false);

    const next = puffCountRef.current + 1;
    puffCountRef.current = next;
    setPuffCount(next);

    onExhaleRef.current?.();

    if (next >= PUFFS_PER_SESSION) {
      beginSettleAndEnd();
    } else {
      setAwaitingUpright(true);
    }
  }, [
    isContinuous,
    clearTimers,
    gaugeSV,
    puffProgressSV,
    syncDisplay,
    beginSettleAndEnd,
  ]);

  const startPuff = useCallback(() => {
    if (isContinuous) return;
    if (puffingRef.current || settlingRef.current) return;
    if (puffCountRef.current >= PUFFS_PER_SESSION) return;

    puffingRef.current = true;
    exhaledThisPuffRef.current = false;
    setIsActivelyPuffing(true);
    setAwaitingUpright(false);
    onPuffStartRef.current?.();

    const from = Math.max(
      0,
      GAUGE_MAX - puffCountRef.current * PUFF_GAUGE_COST,
    );
    const target = Math.max(
      0,
      GAUGE_MAX - (puffCountRef.current + 1) * PUFF_GAUGE_COST,
    );
    puffTargetRef.current = target;

    const durationMs = Math.round(PUFF_DURATION_SEC * 1000);

    cancelAnimation(gaugeSV);
    gaugeSV.value = from;
    syncDisplay(from);
    gaugeSV.value = withTiming(target, {
      duration: durationMs,
      easing: Easing.linear,
    });

    clearTimers();
    // Progress lives on UI thread via withTiming — no 50ms JS interval
    puffProgressSV.value = 0;
    puffProgressSV.value = withTiming(1, {
      duration: durationMs,
      easing: Easing.linear,
    });

    puffTimerRef.current = setTimeout(() => {
      syncDisplay(target);
      puffProgressSV.value = 1;
    }, durationMs);
  }, [isContinuous, gaugeSV, puffProgressSV, syncDisplay, clearTimers]);

  const resetGauge = useCallback(() => {
    clearTimers();
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    cancelAnimation(gaugeSV);
    puffingRef.current = false;
    settlingRef.current = false;
    exhaledThisPuffRef.current = false;
    emptyFiredRef.current = false;
    continuousTiltActiveRef.current = false;
    puffCountRef.current = 0;
    puffTargetRef.current = GAUGE_MAX;
    gaugeRef.current = GAUGE_MAX;
    gaugeSV.value = GAUGE_MAX;
    puffProgressSV.value = 0;
    burnProgressSV.value = 0;
    burnDoneSV.value = 0;
    lastTsSV.value = -1;
    settlingSV.value = 0;
    setGaugeDisplay(GAUGE_MAX);
    setIsActivelyPuffing(false);
    setAwaitingUpright(false);
    setPuffCount(0);
    setSettling(false);
  }, [
    clearTimers,
    gaugeSV,
    puffProgressSV,
    burnProgressSV,
    burnDoneSV,
    lastTsSV,
    settlingSV,
  ]);

  const freeze = useCallback(() => {
    clearTimers();
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    cancelAnimation(gaugeSV);
    syncDisplay(gaugeRef.current);
    puffingRef.current = false;
    settlingRef.current = false;
    exhaledThisPuffRef.current = false;
    continuousTiltActiveRef.current = false;
    setIsActivelyPuffing(false);
    setSettling(false);
    settlingSV.value = 0;
    lastTsSV.value = -1;
    tiltedSV.value = 0;
    puffProgressSV.value = 0;
  }, [
    clearTimers,
    gaugeSV,
    puffProgressSV,
    syncDisplay,
    settlingSV,
    lastTsSV,
    tiltedSV,
  ]);

  // Only react to session enter/leave — do not re-reset when callback identities change
  useEffect(() => {
    if (active) {
      resetGauge();
    } else {
      freeze();
    }
    // Intentionally omit resetGauge/freeze from deps (stable enough; identity churn would wipe burn)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session edge only
  }, [active]);

  useEffect(() => {
    if (!active || settlingRef.current) return;
    if (nearVertical) {
      setAwaitingUpright(false);
    }
  }, [active, nearVertical]);

  // Continuous tilt edges: rising/falling of `tilted` (every untilt fires exhale)
  const prevContinuousTiltedRef = useRef(false);

  useEffect(() => {
    if (!active || !isContinuous) {
      prevContinuousTiltedRef.current = false;
      return;
    }
    if (settlingRef.current || burnDoneSV.value > 0.5) {
      prevContinuousTiltedRef.current = tilted;
      return;
    }

    const wasTilted = prevContinuousTiltedRef.current;
    prevContinuousTiltedRef.current = tilted;

    if (tilted && !wasTilted) {
      continuousTiltActiveRef.current = true;
      setIsActivelyPuffing(true);
      onPuffStartRef.current?.();
    } else if (!tilted && wasTilted) {
      continuousTiltActiveRef.current = false;
      setIsActivelyPuffing(false);
      onExhaleRef.current?.();
    }
  }, [active, isContinuous, tilted, burnDoneSV]);

  const startPuffRef = useRef(startPuff);
  startPuffRef.current = startPuff;
  const completePuffRef = useRef(completePuff);
  completePuffRef.current = completePuff;

  useEffect(() => {
    if (!active || settlingRef.current || isContinuous) return;

    if (puffingRef.current && !tilted) {
      completePuffRef.current();
      return;
    }

    if (puffingRef.current) return;
    if (awaitingUpright) return;
    if (puffCountRef.current >= PUFFS_PER_SESSION) return;

    if (tilted) {
      startPuffRef.current();
    }
  }, [active, tilted, awaitingUpright, isContinuous]);

  useEffect(
    () => () => {
      clearTimers();
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    },
    [clearTimers],
  );

  return {
    gaugeSV,
    puffProgressSV,
    burnProgressSV,
    gaugeDisplay,
    isActivelyPuffing,
    awaitingUpright,
    puffCount,
    settling,
    freeze,
    resetGauge,
    notifySmokeComplete,
  };
}
