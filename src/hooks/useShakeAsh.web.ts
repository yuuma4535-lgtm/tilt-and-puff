import { useEffect, useRef } from 'react';
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
 * Web ash-knock via DeviceMotion acceleration (same thresholds as native).
 */
export function useShakeAsh({ enabled, onShake }: Options): void {
  const lastRef = useRef<Sample | null>(null);
  const cooldownUntilRef = useRef(0);
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let lastTs = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const nowPerf = performance.now();
      if (nowPerf - lastTs < SENSOR_UPDATE_MS) return;
      lastTs = nowPerf;

      const a = e.accelerationIncludingGravity ?? e.acceleration;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      // Rough g units (device motion is m/s² ≈ /9.81)
      const x = a.x / 9.81;
      const y = a.y / 9.81;
      const z = a.z / 9.81;

      const prev = lastRef.current;
      lastRef.current = { x, y, z };
      if (prev == null) return;

      const deltaX = Math.abs(x - prev.x);
      const deltaY = Math.abs(y - prev.y);
      const deltaZ = Math.abs(z - prev.z);
      const mag = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      const yDominant = deltaY >= deltaX * 0.7 && deltaY >= deltaZ * 0.7;

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
    };

    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      lastRef.current = null;
    };
  }, [enabled]);
}
