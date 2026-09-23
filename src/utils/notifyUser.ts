/**
 * User-visible notices — RN Alert is unreliable / silent on many mobile browsers.
 */
export function notifyUser(title: string, message: string): void {
  const text = message ? `${title}\n\n${message}` : title;
  console.log(`[notify] ${text}`);
  try {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(text);
      return;
    }
  } catch (e) {
    console.warn('[notify] window.alert failed', e);
  }
  try {
    // Native fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Alert } = require('react-native') as typeof import('react-native');
    Alert.alert(title, message);
  } catch (e) {
    console.warn('[notify] Alert.alert failed', e);
  }
}
