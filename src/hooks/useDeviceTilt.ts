import { useEffect, useRef, useState } from 'react';
import { DeviceMotion } from 'expo-sensors';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import {
  PUFF_TILT_MIN_DEG,
  SENSOR_UPDATE_MS,
  VERTICAL_RESUME_DEG,
} from '../constants';

/**
 * Roll-only puff detection + live gravity direction for ash fall.
 */
function rollDegFromGamma(gammaRad: number): number {
  return (Math.abs(gammaRad) * 180) / Math.PI;
}

/** Map device accel (incl. gravity) → screen unit vector (x right, y down). */
function screenGravityFromAccel(x: number, y: number): { gx: number; gy: number } {
  // Device Y points up; RN screen Y points down.
  let sx = x;
  let sy = -y;
  const len = Math.hypot(sx, sy);
  if (len < 0.15) {
    // Nearly flat — default to screen-down
    return { gx: 0, gy: 1 };
  }
  sx /= len;
  sy /= len;
  // Keep a minimum downward component so crumbs always leave the tip
  if (sy < 0.25) {
    sy = 0.25;
    const n = Math.hypot(sx, sy) || 1;
    sx /= n;
    sy /= n;
  }
  return { gx: sx, gy: sy };
}

export type TiltState = {
  /** Live |gamma| degrees — read from UI thread / animated reactions */
  tiltSV: SharedValue<number>;
  /** Signed gamma degrees (negative = one side, positive = other) */
  signedTiltSV: SharedValue<number>;
  /**
   * Unit gravity in screen space (x right, y down).
   * Used so falling ash follows real device tilt.
   */
  gravityXSV: SharedValue<number>;
  gravityYSV: SharedValue<number>;
  tiltDeg: number;
  isInPuffZone: boolean;
  isNearVertical: boolean;
  /** Web/iOS Safari only — native always false */
  motionPermissionNeeded: boolean;
  requestMotionPermission: () => Promise<boolean>;
  /** Web: iOS on HTTP without requestPermission — need HTTPS */
  motionNeedsHttps: boolean;
  /** Web hold-to-puff — native no-op */
  setManualPuff: (active: boolean) => void;
  /** Web: show hold-to-puff hint when sensors unavailable */
  manualPuffRecommended: boolean;
};

export function useDeviceTilt(enabled: boolean): TiltState {
  const tiltSV = useSharedValue(0);
  const signedTiltSV = useSharedValue(0);
  const gravityXSV = useSharedValue(0);
  const gravityYSV = useSharedValue(1);
  const [tiltDeg, setTiltDeg] = useState(0);
  const [isInPuffZone, setInPuffZone] = useState(false);
  const [isNearVertical, setNearVertical] = useState(true);

  const zoneRef = useRef({ puff: false, vert: true });
  const lastUiTiltRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      zoneRef.current = { puff: false, vert: true };
      tiltSV.value = 0;
      signedTiltSV.value = 0;
      gravityXSV.value = 0;
      gravityYSV.value = 1;
      setInPuffZone(false);
      setNearVertical(true);
      setTiltDeg(0);
      return;
    }

    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const available = await DeviceMotion.isAvailableAsync();
      if (!available || cancelled) return;

      const permission = await DeviceMotion.requestPermissionsAsync();
      if (!permission.granted || cancelled) return;

      DeviceMotion.setUpdateInterval(SENSOR_UPDATE_MS);
      sub = DeviceMotion.addListener((data) => {
        const gamma = data.rotation?.gamma;
        if (gamma == null || Number.isNaN(gamma)) return;

        const signed = (gamma * 180) / Math.PI;
        const roll = rollDegFromGamma(gamma);
        tiltSV.value = roll;
        signedTiltSV.value = signed;

        const ag = data.accelerationIncludingGravity;
        if (
          ag &&
          typeof ag.x === 'number' &&
          typeof ag.y === 'number' &&
          !Number.isNaN(ag.x) &&
          !Number.isNaN(ag.y)
        ) {
          const { gx, gy } = screenGravityFromAccel(ag.x, ag.y);
          gravityXSV.value = gx;
          gravityYSV.value = gy;
        } else {
          // Fallback: signed roll → lateral gravity bias
          const rad = (signed * Math.PI) / 180;
          gravityXSV.value = Math.sin(rad);
          gravityYSV.value = Math.max(0.25, Math.cos(rad));
          const n =
            Math.hypot(gravityXSV.value, gravityYSV.value) || 1;
          gravityXSV.value /= n;
          gravityYSV.value /= n;
        }

        const puff = roll >= PUFF_TILT_MIN_DEG;
        const vert = roll <= VERTICAL_RESUME_DEG;
        const z = zoneRef.current;
        if (puff !== z.puff || vert !== z.vert) {
          zoneRef.current = { puff, vert };
          setInPuffZone(puff);
          setNearVertical(vert);
        }

        if (Math.abs(roll - lastUiTiltRef.current) >= 2) {
          lastUiTiltRef.current = roll;
          setTiltDeg(roll);
        }
      });
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled, tiltSV, signedTiltSV, gravityXSV, gravityYSV]);

  return {
    tiltSV,
    signedTiltSV,
    gravityXSV,
    gravityYSV,
    tiltDeg,
    isInPuffZone,
    isNearVertical,
    motionPermissionNeeded: false,
    motionNeedsHttps: false,
    requestMotionPermission: async () => true,
    setManualPuff: () => {},
    manualPuffRecommended: false,
  };
}
