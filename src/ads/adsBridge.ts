/**
 * Native / default ads bridge — re-exports real AdMob hooks.
 * Web builds resolve adsBridge.web.tsx instead (AdSense / placeholder).
 * useAds.tsx is never modified by the web work.
 */
export {
  IdleBannerAd,
  useInterstitialOnIdleReturn,
} from '../hooks/useAds';

/** Web-only interstitial Modal host — no-op on native */
export function AdsRootExtras(): null {
  return null;
}