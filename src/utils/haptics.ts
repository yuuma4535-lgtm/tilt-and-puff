import { Platform } from 'react-native';

/**
 * Soft impact — native haptics, or Vibration API on web (no-op if unsupported).
 */
export async function impactSoft(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
    } catch {
      // ignore
    }
    return;
  }
  try {
    const Haptics = await import('expo-haptics');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  } catch {
    // ignore
  }
}

/**
 * Light impact — shake / ash knock.
 */
export async function impactLight(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(18);
      }
    } catch {
      // ignore
    }
    return;
  }
  try {
    const Haptics = await import('expo-haptics');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // ignore
  }
}
