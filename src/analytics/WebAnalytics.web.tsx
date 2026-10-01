import { Platform } from 'react-native';
import { Analytics } from '@vercel/analytics/react';

/**
 * Vercel Web Analytics. Renders nothing; injects the tracking script.
 * Guarded again so a mistaken native import stays a no-op.
 */
export function WebAnalytics() {
  if (Platform.OS !== 'web') return null;
  return <Analytics />;
}
