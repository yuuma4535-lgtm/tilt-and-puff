import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useCameraPermissions } from 'expo-camera';

export type CameraAccess = {
  /** Permission object still loading */
  loading: boolean;
  /** Live rear-camera background allowed */
  granted: boolean;
  /** User denied / blocked — show fallback + settings help */
  denied: boolean;
  /** Can still prompt the system dialog */
  canAskAgain: boolean;
  /** Web: getUserMedia unavailable (insecure context / missing API) */
  unsupported: boolean;
  request: () => Promise<boolean>;
  openSystemSettings: () => void;
};

/**
 * Request camera on first mount; expose grant/deny for backdrop + settings.
 */
export function useCameraAccess(): CameraAccess {
  const [permission, requestPermission] = useCameraPermissions();
  const [asked, setAsked] = useState(false);

  const request = useCallback(async () => {
    const res = await requestPermission();
    setAsked(true);
    return res.granted;
  }, [requestPermission]);

  useEffect(() => {
    if (!permission || asked) return;
    if (permission.granted) {
      setAsked(true);
      return;
    }
    // First launch: show the system permission dialog once
    if (permission.canAskAgain) {
      void request();
    } else {
      setAsked(true);
    }
  }, [permission, asked, request]);

  const openSystemSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  return {
    loading: !permission,
    granted: !!permission?.granted,
    denied: !!permission && !permission.granted,
    canAskAgain: permission?.canAskAgain ?? false,
    unsupported: false,
    request,
    openSystemSettings,
  };
}
