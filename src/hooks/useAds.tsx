import { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import {
  AD_UNIT,
  INTERSTITIAL_EVERY_N_SESSIONS,
} from '../constants';
import { bumpSessionCount } from '../storage/dailyCounters';

type AdsModule = typeof import('react-native-google-mobile-ads');
type InterstitialInstance = ReturnType<
  AdsModule['InterstitialAd']['createForAdRequest']
>;

/** Expo Go — no custom native modules; ads stay fully no-op */
function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

/**
 * Native AdMob only in Dev Client / EAS / bare builds.
 * Never `require` the module inside Expo Go (avoids native stub errors).
 */
function loadAdsModule(): AdsModule | null {
  if (isExpoGo()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-google-mobile-ads') as AdsModule;
  } catch {
    return null;
  }
}

const ads = loadAdsModule();
const adsEnabled = ads != null;

/**
 * Prefer Google TestIds while developing (__DEV__).
 * Release / production builds use IDs from adConfig.js → constants AD_UNIT.
 */
function resolveUnitId(
  testId: string | undefined,
  production: { ios: string; android: string },
): string {
  if (__DEV__ && testId) return testId;
  return (
    Platform.select({
      ios: production.ios,
      android: production.android,
    }) ?? production.android
  );
}

const bannerUnitId = adsEnabled
  ? resolveUnitId(ads!.TestIds.BANNER, AD_UNIT.banner)
  : '';

const interstitialUnitId = adsEnabled
  ? resolveUnitId(ads!.TestIds.INTERSTITIAL, AD_UNIT.interstitial)
  : '';

/** Idle-only banner; null stub in Expo Go / when native ads are off */
export function IdleBannerAd() {
  if (!adsEnabled || !ads) {
    return null;
  }

  const { BannerAd, BannerAdSize } = ads;
  return (
    <View style={styles.bannerWrap} pointerEvents="box-none">
      <BannerAd
        unitId={bannerUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}

/**
 * Interstitial after return to idle, 1 / N sessions (butts + stubs).
 * Call `preloadInterstitial` on session start so the ad is ready
 * when the session ends. Fully no-ops in Expo Go.
 */
export function useInterstitialOnIdleReturn() {
  const interstitialRef = useRef<InterstitialInstance | null>(null);
  const readyRef = useRef(false);
  const initStartedRef = useRef(false);
  const loadingRef = useRef(false);

  const ensureInitialized = useCallback(async () => {
    if (!adsEnabled || !ads || initStartedRef.current) return;
    initStartedRef.current = true;
    try {
      await ads.default().initialize();
    } catch {
      // soft-fail — keep app usable without ads
    }
  }, []);

  const ensureAdInstance = useCallback(() => {
    if (!adsEnabled || !ads || interstitialRef.current) return;
    const mod = ads;
    const ad = mod.InterstitialAd.createForAdRequest(interstitialUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });
    interstitialRef.current = ad;

    ad.addAdEventListener(mod.AdEventType.LOADED, () => {
      readyRef.current = true;
      loadingRef.current = false;
    });
    ad.addAdEventListener(mod.AdEventType.CLOSED, () => {
      readyRef.current = false;
      loadingRef.current = false;
      try {
        ad.load();
        loadingRef.current = true;
      } catch {
        // ignore
      }
    });
    ad.addAdEventListener(mod.AdEventType.ERROR, () => {
      readyRef.current = false;
      loadingRef.current = false;
    });
  }, []);

  /** Preload (or refresh) interstitial — call when a session starts */
  const preloadInterstitial = useCallback(() => {
    if (!adsEnabled || !ads) return;
    void (async () => {
      await ensureInitialized();
      ensureAdInstance();
      const ad = interstitialRef.current;
      if (!ad || readyRef.current || loadingRef.current) return;
      try {
        loadingRef.current = true;
        ad.load();
      } catch {
        loadingRef.current = false;
      }
    })();
  }, [ensureInitialized, ensureAdInstance]);

  // Warm SDK once at mount (still no-op in Expo Go)
  useEffect(() => {
    if (!adsEnabled) return;
    void ensureInitialized().then(() => {
      ensureAdInstance();
      preloadInterstitial();
    });
  }, [ensureInitialized, ensureAdInstance, preloadInterstitial]);

  /**
   * Bump session counter (always). On every Nth session, try to show
   * a preloaded interstitial after returning to idle.
   */
  const maybeShowAfterSession = useCallback(async () => {
    const count = await bumpSessionCount();
    if (!adsEnabled || !ads) return;
    if (count % INTERSTITIAL_EVERY_N_SESSIONS !== 0) return;

    const ad = interstitialRef.current;
    if (!ad || !readyRef.current) {
      // Not ready — kick a load for next time; don't block idle UX
      preloadInterstitial();
      return;
    }

    try {
      readyRef.current = false;
      await ad.show();
    } catch {
      readyRef.current = false;
      preloadInterstitial();
    }
  }, [preloadInterstitial]);

  return { maybeShowAfterSession, preloadInterstitial, adsEnabled };
}

const styles = StyleSheet.create({
  bannerWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
});
