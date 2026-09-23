import { useCallback, useEffect, useRef, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import {
  PUFF_TILT_MIN_DEG,
  SENSOR_UPDATE_MS,
  VERTICAL_RESUME_DEG,
} from '../constants';

function rollDegFromGammaDeg(gammaDeg: number): number {
  return Math.abs(gammaDeg);
}

function screenGravityFromAccel(x: number, y: number): { gx: number; gy: number } {
  let sx = x;
  let sy = -y;
  const len = Math.hypot(sx, sy);
  if (len < 0.15) return { gx: 0, gy: 1 };
  sx /= len;
  sy /= len;
  if (sy < 0.25) {
    sy = 0.25;
    const n = Math.hypot(sx, sy) || 1;
    sx /= n;
    sy /= n;
  }
  return { gx: sx, gy: sy };
}

type OrientationCtor = {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/** iPhone / iPod / iPad (incl. iPadOS desktop-UA) */
function isIosWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  // iPadOS 13+ can report as Macintosh with touch
  if (
    /Macintosh/i.test(ua) &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}

function hasOrientationPermissionApi(): boolean {
  if (typeof window === 'undefined') return false;
  const DOE = window.DeviceOrientationEvent as unknown as OrientationCtor | undefined;
  return typeof DOE?.requestPermission === 'function';
}

function hasMotionPermissionApi(): boolean {
  if (typeof window === 'undefined') return false;
  const DME = window.DeviceMotionEvent as unknown as OrientationCtor | undefined;
  return typeof DME?.requestPermission === 'function';
}

/** HTTPS / localhost — LAN http://192… is NOT a secure context */
function isSecureMotionContext(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.isSecureContext) return true;
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

function logMotionDiagnostics(tag: string): void {
  if (typeof window === 'undefined') return;
  const DOE = window.DeviceOrientationEvent as unknown as OrientationCtor | undefined;
  const DME = window.DeviceMotionEvent as unknown as OrientationCtor | undefined;
  console.log(`[tilt-web:${tag}]`, {
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    isIosWeb: isIosWeb(),
    isSecureContext:
      typeof window.isSecureContext === 'boolean' ? window.isSecureContext : null,
    protocol: typeof location !== 'undefined' ? location.protocol : null,
    host: typeof location !== 'undefined' ? location.hostname : null,
    hasDeviceOrientationEvent: typeof window.DeviceOrientationEvent !== 'undefined',
    hasDeviceMotionEvent: typeof window.DeviceMotionEvent !== 'undefined',
    orientationRequestPermissionType: typeof DOE?.requestPermission,
    motionRequestPermissionType: typeof DME?.requestPermission,
    hasOrientationPermissionApi: hasOrientationPermissionApi(),
    hasMotionPermissionApi: hasMotionPermissionApi(),
    isSecureMotionContext: isSecureMotionContext(),
  });
}

/** Desktop / no-gyro: hold-to-puff. Never true for iOS (use permission / HTTPS UX). */
function likelyNeedsManualPuff(): boolean {
  if (typeof window === 'undefined') return true;
  if (isIosWeb()) return false;
  if (hasOrientationPermissionApi()) return false;
  try {
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: fine)').matches &&
      !window.matchMedia('(pointer: coarse)').matches
    ) {
      return true;
    }
  } catch {
    // ignore
  }
  return typeof DeviceOrientationEvent === 'undefined';
}

export type TiltState = {
  tiltSV: SharedValue<number>;
  signedTiltSV: SharedValue<number>;
  gravityXSV: SharedValue<number>;
  gravityYSV: SharedValue<number>;
  tiltDeg: number;
  isInPuffZone: boolean;
  isNearVertical: boolean;
  /** Show “Enable tilt sensing” (iOS Safari permission gate) */
  motionPermissionNeeded: boolean;
  /**
   * iOS on plain HTTP: requestPermission is often missing — show HTTPS guidance
   * instead of the desktop hold-to-puff copy.
   */
  motionNeedsHttps: boolean;
  requestMotionPermission: () => Promise<boolean>;
  setManualPuff: (active: boolean) => void;
  /** Desktop / denied fallback — press-and-hold to puff */
  manualPuffRecommended: boolean;
};

/**
 * Web tilt via DeviceOrientation / DeviceMotion.
 * iOS 13+ requires a user-gesture call to requestPermission() (HTTPS / localhost).
 */
export function useDeviceTilt(enabled: boolean): TiltState {
  const ios = isIosWeb();
  const hasPermApi = hasOrientationPermissionApi();
  const secure = isSecureMotionContext();

  const tiltSV = useSharedValue(0);
  const signedTiltSV = useSharedValue(0);
  const gravityXSV = useSharedValue(0);
  const gravityYSV = useSharedValue(1);
  const [tiltDeg, setTiltDeg] = useState(0);
  const [isInPuffZone, setInPuffZone] = useState(false);
  const [isNearVertical, setNearVertical] = useState(true);
  /**
   * iOS always starts locked until the user taps Allow (or we confirm sensors).
   * Non-iOS: unlocked unless the permission API exists and needs a gesture.
   */
  const [motionGranted, setMotionGranted] = useState(() => {
    if (ios) return false;
    return !hasOrientationPermissionApi();
  });
  const [manualPuff, setManualPuffState] = useState(false);
  const [receivedSensorSample, setReceivedSensorSample] = useState(false);
  const [manualPuffRecommended, setManualPuffRecommended] = useState(
    likelyNeedsManualPuff(),
  );
  const [permissionDenied, setPermissionDenied] = useState(false);

  const zoneRef = useRef({ puff: false, vert: true });
  const lastUiTiltRef = useRef(0);
  const lastGammaRef = useRef(0);
  const stopRef = useRef<(() => void) | null>(null);
  const manualRef = useRef(false);
  const sensorPuffRef = useRef(false);
  const loggedRef = useRef(false);

  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    logMotionDiagnostics('mount');
  }, []);

  const publishZone = useCallback(() => {
    const puff = manualRef.current || sensorPuffRef.current;
    const vert = manualRef.current ? false : zoneRef.current.vert;
    setInPuffZone(puff);
    setNearVertical(vert);
    if (manualRef.current) {
      const roll = Math.max(PUFF_TILT_MIN_DEG + 5, 40);
      tiltSV.value = roll;
      signedTiltSV.value = roll;
      gravityXSV.value = 0.35;
      gravityYSV.value = 0.94;
      if (Math.abs(roll - lastUiTiltRef.current) >= 2) {
        lastUiTiltRef.current = roll;
        setTiltDeg(roll);
      }
    }
  }, [tiltSV, signedTiltSV, gravityXSV, gravityYSV]);

  const applySample = useCallback(
    (gammaDeg: number, accel?: { x: number; y: number } | null) => {
      if (Number.isNaN(gammaDeg)) return;
      setReceivedSensorSample(true);
      setManualPuffRecommended(false);
      setMotionGranted(true);

      const signed = gammaDeg;
      const roll = rollDegFromGammaDeg(gammaDeg);
      if (!manualRef.current) {
        tiltSV.value = roll;
        signedTiltSV.value = signed;
      }

      if (accel && typeof accel.x === 'number' && typeof accel.y === 'number') {
        const { gx, gy } = screenGravityFromAccel(accel.x, accel.y);
        if (!manualRef.current) {
          gravityXSV.value = gx;
          gravityYSV.value = gy;
        }
      } else if (!manualRef.current) {
        const rad = (signed * Math.PI) / 180;
        gravityXSV.value = Math.sin(rad);
        gravityYSV.value = Math.max(0.25, Math.cos(rad));
        const n = Math.hypot(gravityXSV.value, gravityYSV.value) || 1;
        gravityXSV.value /= n;
        gravityYSV.value /= n;
      }

      const puff = roll >= PUFF_TILT_MIN_DEG;
      const vert = roll <= VERTICAL_RESUME_DEG;
      const z = zoneRef.current;
      if (puff !== z.puff || vert !== z.vert) {
        zoneRef.current = { puff, vert };
      }
      sensorPuffRef.current = puff;
      publishZone();

      if (!manualRef.current && Math.abs(roll - lastUiTiltRef.current) >= 2) {
        lastUiTiltRef.current = roll;
        setTiltDeg(roll);
      }
    },
    [tiltSV, signedTiltSV, gravityXSV, gravityYSV, publishZone],
  );

  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return;
    stopRef.current?.();
    let lastTs = 0;

    const onOrient = (e: DeviceOrientationEvent) => {
      const now = performance.now();
      if (now - lastTs < SENSOR_UPDATE_MS) return;
      lastTs = now;
      if (e.gamma == null) return;
      lastGammaRef.current = e.gamma;
      applySample(e.gamma);
    };

    const onMotion = (e: DeviceMotionEvent) => {
      const ag = e.accelerationIncludingGravity;
      if (!ag || ag.x == null || ag.y == null) return;
      applySample(lastGammaRef.current, { x: ag.x, y: ag.y });
    };

    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('devicemotion', onMotion);
    stopRef.current = () => {
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('devicemotion', onMotion);
      stopRef.current = null;
    };
  }, [applySample]);

  const requestMotionPermission = useCallback(async () => {
    logMotionDiagnostics('requestPermission-tap');
    try {
      const DOE = window.DeviceOrientationEvent as unknown as OrientationCtor;
      const DME = window.DeviceMotionEvent as unknown as OrientationCtor;

      if (typeof DOE?.requestPermission !== 'function') {
        console.warn(
          '[tilt-web] DeviceOrientationEvent.requestPermission is not available',
          {
            isSecureContext: window.isSecureContext,
            protocol: location.protocol,
            host: location.hostname,
          },
        );
        // iOS on HTTP: API often missing — do not pretend desktop hold-to-puff is the primary path
        setMotionGranted(false);
        setPermissionDenied(true);
        if (!isIosWeb()) {
          setManualPuffRecommended(true);
        }
        return false;
      }

      const r = await DOE.requestPermission();
      console.log('[tilt-web] orientation permission result', r);
      if (r !== 'granted') {
        setMotionGranted(false);
        setPermissionDenied(true);
        setManualPuffRecommended(true);
        return false;
      }

      if (typeof DME?.requestPermission === 'function') {
        try {
          const mr = await DME.requestPermission();
          console.log('[tilt-web] motion permission result', mr);
        } catch (e) {
          console.warn('[tilt-web] DeviceMotion requestPermission', e);
        }
      }

      setPermissionDenied(false);
      setMotionGranted(true);
      setManualPuffRecommended(false);
      startListening();
      return true;
    } catch (e) {
      console.warn('[tilt-web] requestMotionPermission failed', e);
      setMotionGranted(false);
      setPermissionDenied(true);
      setManualPuffRecommended(true);
      return false;
    }
  }, [startListening]);

  const setManualPuff = useCallback(
    (active: boolean) => {
      manualRef.current = active;
      setManualPuffState(active);
      if (!active) {
        if (!sensorPuffRef.current) {
          tiltSV.value = 0;
          signedTiltSV.value = 0;
          gravityXSV.value = 0;
          gravityYSV.value = 1;
          lastUiTiltRef.current = 0;
          setTiltDeg(0);
        }
      }
      publishZone();
    },
    [publishZone, tiltSV, signedTiltSV, gravityXSV, gravityYSV],
  );

  useEffect(() => {
    if (!enabled) {
      zoneRef.current = { puff: false, vert: true };
      sensorPuffRef.current = false;
      manualRef.current = false;
      tiltSV.value = 0;
      signedTiltSV.value = 0;
      gravityXSV.value = 0;
      gravityYSV.value = 1;
      setInPuffZone(false);
      setNearVertical(true);
      setTiltDeg(0);
      setManualPuffState(false);
      stopRef.current?.();
      return;
    }
    if (motionGranted) startListening();

    // Desktop only: if no samples, offer hold-to-puff. Never auto-switch iOS to that copy.
    const timer = window.setTimeout(() => {
      if (receivedSensorSample || isIosWeb()) return;
      if (!hasOrientationPermissionApi()) {
        setManualPuffRecommended(true);
      }
    }, 1800);

    return () => {
      window.clearTimeout(timer);
      stopRef.current?.();
    };
  }, [
    enabled,
    motionGranted,
    startListening,
    receivedSensorSample,
    tiltSV,
    signedTiltSV,
    gravityXSV,
    gravityYSV,
  ]);

  /**
   * Show the Allow button when:
   * - iOS and not yet granted (even if API missing — tap surfaces HTTPS / error), or
   * - permission API exists and not granted
   */
  const motionPermissionNeeded =
    !motionGranted &&
    !receivedSensorSample &&
    (ios || hasPermApi) &&
    // On insecure iOS without API, prefer HTTPS banner over a fake “Allow” that can’t work
    !(ios && !hasPermApi && !secure);

  const motionNeedsHttps = ios && !secure && !hasPermApi && !receivedSensorSample;

  // Hold-to-puff: desktop, or after explicit deny — never as the default iOS message
  const showManualPuff =
    !motionPermissionNeeded &&
    !motionNeedsHttps &&
    (manualPuffRecommended || permissionDenied);

  return {
    tiltSV,
    signedTiltSV,
    gravityXSV,
    gravityYSV,
    tiltDeg,
    isInPuffZone: isInPuffZone || manualPuff,
    isNearVertical: manualPuff ? false : isNearVertical,
    motionPermissionNeeded,
    motionNeedsHttps,
    requestMotionPermission,
    setManualPuff,
    manualPuffRecommended: showManualPuff,
  };
}
