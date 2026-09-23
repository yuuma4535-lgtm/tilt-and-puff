import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { INTERSTITIAL_EVERY_N_SESSIONS } from '../constants';
import { bumpSessionCount } from '../storage/dailyCounters';
import { BASE } from '../theme/palette';
import { t } from '../i18n';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const adConfig = require('../../adConfig') as {
  adsense: {
    clientId: string;
    bannerSlot: string;
    interstitialSlot: string;
  };
};

const { clientId, bannerSlot, interstitialSlot } = adConfig.adsense;
const hasAdSenseIds = Boolean(clientId && bannerSlot);
const hasInterstitialSlot = Boolean(clientId && interstitialSlot);

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let adsenseScriptPromise: Promise<void> | null = null;
/** Module bridge so the hook can request a show without returning JSX */
let requestInterstitialShow: (() => void) | null = null;

function ensureAdSenseScript(): Promise<void> {
  if (!clientId || typeof document === 'undefined') {
    return Promise.resolve();
  }
  if (adsenseScriptPromise) return adsenseScriptPromise;
  adsenseScriptPromise = new Promise((resolve) => {
    const existing = document.querySelector(
      'script[data-tilt-puff-adsense]',
    );
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.tiltPuffAdsense = '1';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  return adsenseScriptPromise;
}

function pushAdSense(): void {
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    // ignore — placeholder / ad blocker
  }
}

/**
 * Idle banner — real AdSense when IDs are set, otherwise a local placeholder
 * (no external request), matching adConfig.js comments.
 */
export function IdleBannerAd() {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!hasAdSenseIds) return;
    let cancelled = false;
    void ensureAdSenseScript().then(() => {
      if (cancelled || pushedRef.current) return;
      pushedRef.current = true;
      pushAdSense();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hasAdSenseIds) {
    return (
      <View style={styles.bannerWrap} pointerEvents="none">
        <View style={styles.placeholderBanner}>
          <Text style={styles.placeholderLabel}>{t('adPlaceholder')}</Text>
        </View>
      </View>
    );
  }

  const ins = createElement('ins', {
    className: 'adsbygoogle',
    style: {
      display: 'block',
      width: '100%',
      minHeight: 50,
      maxWidth: 430,
    },
    'data-ad-client': clientId,
    'data-ad-slot': bannerSlot,
    'data-ad-format': 'horizontal',
    'data-full-width-responsive': 'true',
  });

  return (
    <View style={styles.bannerWrap} pointerEvents="box-none">
      {ins}
    </View>
  );
}

/**
 * Full-screen-ish display after every N sessions. Mount once near the app root.
 */
export function AdsRootExtras() {
  const [visible, setVisible] = useState(false);
  const pushedRef = useRef(false);

  useEffect(() => {
    requestInterstitialShow = () => setVisible(true);
    return () => {
      requestInterstitialShow = null;
    };
  }, []);

  useEffect(() => {
    if (!visible || !hasInterstitialSlot) return;
    pushedRef.current = false;
    let cancelled = false;
    void ensureAdSenseScript().then(() => {
      if (cancelled || pushedRef.current) return;
      pushedRef.current = true;
      requestAnimationFrame(() => pushAdSense());
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const onClose = useCallback(() => setVisible(false), []);

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.interstitialBackdrop}>
        <View style={styles.interstitialCard}>
          {hasInterstitialSlot ? (
            createElement('ins', {
              className: 'adsbygoogle',
              style: {
                display: 'block',
                width: '100%',
                minHeight: 280,
              },
              'data-ad-client': clientId,
              'data-ad-slot': interstitialSlot,
              'data-ad-format': 'auto',
              'data-full-width-responsive': 'true',
            })
          ) : (
            <View style={styles.placeholderInterstitial}>
              <Text style={styles.placeholderLabel}>{t('adPlaceholder')}</Text>
              <Text style={styles.placeholderHint}>
                {t('adInterstitialHint')}
              </Text>
            </View>
          )}
          <Pressable
            onPress={onClose}
            style={styles.interstitialClose}
            accessibilityRole="button"
          >
            <Text style={styles.interstitialCloseLabel}>{t('close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Same call sites as native AdMob — bumps session count and shows overlay
 * every N sessions (AdSense unit or placeholder).
 */
export function useInterstitialOnIdleReturn() {
  const preloadInterstitial = useCallback(() => {
    if (hasInterstitialSlot) {
      void ensureAdSenseScript();
    }
  }, []);

  const maybeShowAfterSession = useCallback(async () => {
    const count = await bumpSessionCount();
    if (count % INTERSTITIAL_EVERY_N_SESSIONS !== 0) return;
    requestInterstitialShow?.();
  }, []);

  return {
    maybeShowAfterSession,
    preloadInterstitial,
    adsEnabled: true,
  };
}

const styles = StyleSheet.create({
  bannerWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 50,
  },
  placeholderBanner: {
    width: '100%',
    maxWidth: 430,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BASE.surface,
    borderTopWidth: 1,
    borderColor: BASE.border,
    paddingVertical: 10,
  },
  placeholderLabel: {
    color: BASE.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  placeholderHint: {
    color: BASE.textDim,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  placeholderInterstitial: {
    width: '100%',
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BASE.bgElevated,
    borderRadius: 8,
    padding: 24,
  },
  interstitialBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    padding: 20,
  },
  interstitialCard: {
    backgroundColor: BASE.bgElevated,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BASE.border,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  interstitialClose: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: BASE.surface,
    borderWidth: 1,
    borderColor: BASE.border,
  },
  interstitialCloseLabel: {
    color: BASE.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
