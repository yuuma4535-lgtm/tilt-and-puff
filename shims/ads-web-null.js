/**
 * Metro web stub for react-native-google-mobile-ads.
 * AdMob is never used on web — App skips ads via adsBridge.web.tsx.
 * This file only exists so accidental resolves don't crash the web bundle.
 * Do not delete useAds.tsx / adConfig.js; native EAS builds still use them.
 */
module.exports = {
  TestIds: {
    BANNER: 'web-null-banner',
    INTERSTITIAL: 'web-null-interstitial',
  },
  BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' },
  AdEventType: {
    LOADED: 'loaded',
    CLOSED: 'closed',
    ERROR: 'error',
  },
  BannerAd: function BannerAdNull() {
    return null;
  },
  InterstitialAd: {
    createForAdRequest() {
      return {
        addAdEventListener() {
          return () => {};
        },
        load() {},
        show: async () => {},
      };
    },
  },
  default: () => ({
    initialize: async () => {},
  }),
};
