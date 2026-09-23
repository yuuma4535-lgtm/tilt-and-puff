import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import {
  SENSOR_UPDATE_MS,
  SHAKE_COOLDOWN_MS,
  SHAKE_MAG_MIN_G,
  SHAKE_THRESHOLD_G,
} from '../constants';
import { impactLight } from '../utils/haptics';

type Options = {
  enabled: boolean;
  onShake: () => void;
};

type Sample = { x: number; y: number; z: number };

/**
 * Roll skin only: very light vertical-ish wrist flick → ash knock.
 * Tuned ~0.7g Δy — a small shake knocks ash; walk/lift stay mostly quiet.
 */
export function useShakeAsh({ enabled, onShake }: Options): void {
  const lastRef = useRef<Sample | null>(null);
  const cooldownUntilRef = useRef(0);
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  useEffect(() => {
    if (!enabled) return;

    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const ok = await Accelerometer.isAvailableAsync();
      if (!ok || cancelled) return;

      Accelerometer.setUpdateInterval(SENSOR_UPDATE_MS);
      sub = Accelerometer.addListener(({ x, y, z }) => {
        const prev = lastRef.current;
        lastRef.current = { x, y, z };
        if (prev == null) return;

        const deltaX = Math.abs(x - prev.x);
        const deltaY = Math.abs(y - prev.y);
        const deltaZ = Math.abs(z - prev.z);
        const mag = Math.sqrt(x * x + y * y + z * z);
        const now = Date.now();

        // Prefer Y-ish flick; soft bias so a slight diagonal still counts
        const yDominant =
          deltaY >= deltaX * 0.7 && deltaY >= deltaZ * 0.7;

        if (
          deltaY >= SHAKE_THRESHOLD_G &&
          mag >= SHAKE_MAG_MIN_G &&
          yDominant &&
          now >= cooldownUntilRef.current
        ) {
          cooldownUntilRef.current = now + SHAKE_COOLDOWN_MS;
          void impactLight();
          onShakeRef.current();
        }
      });
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      lastRef.current = null;
    };
  }, [enabled]);
}
