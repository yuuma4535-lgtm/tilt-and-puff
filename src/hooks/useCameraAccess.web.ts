import { useCallback, useEffect, useState } from 'react';

export type CameraAccess = {
  loading: boolean;
  granted: boolean;
  denied: boolean;
  canAskAgain: boolean;
  /** getUserMedia missing or insecure context */
  unsupported: boolean;
  request: () => Promise<boolean>;
  openSystemSettings: () => void;
};

function canUseGetUserMedia(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    (window.isSecureContext ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1')
  );
}

/**
 * Web camera permission via getUserMedia (environment / rear when available).
 */
export function useCameraAccess(): CameraAccess {
  const [loading, setLoading] = useState(true);
  const [granted, setGranted] = useState(false);
  const [denied, setDenied] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [unsupported, setUnsupported] = useState(!canUseGetUserMedia());

  const request = useCallback(async () => {
    if (!canUseGetUserMedia()) {
      setUnsupported(true);
      setGranted(false);
      setDenied(true);
      setCanAskAgain(false);
      setLoading(false);
      return false;
    }
    setUnsupported(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      stream.getTracks().forEach((t) => t.stop());
      setGranted(true);
      setDenied(false);
      setCanAskAgain(true);
      setLoading(false);
      return true;
    } catch {
      setGranted(false);
      setDenied(true);
      setCanAskAgain(true);
      setLoading(false);
      return false;
    }
  }, []);

  useEffect(() => {
    void request();
  }, [request]);

  /** No system Settings deep-link on web — browser site settings are manual */
  const openSystemSettings = useCallback(() => {}, []);

  return {
    loading,
    granted,
    denied,
    canAskAgain,
    unsupported,
    request,
    openSystemSettings,
  };
}
