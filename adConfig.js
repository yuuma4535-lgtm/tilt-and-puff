/**
 * AdMob configuration — single source of truth.
 * Shared by app.config.js (EAS native App IDs) and src/constants.ts (ad unit IDs).
 *
 * !! IMPORTANT !!
 * Native values below are Google's official SAMPLE / TEST IDs for development.
 * Before store release, replace every AdMob ID with real values from:
 *   https://admob.google.com/ → Apps → Ad units
 *
 * Web uses Google AdSense (separate from AdMob). Replace adsense.clientId / slots
 * with your AdSense publisher IDs before deploying the web build.
 */
module.exports = {
  /** Native App IDs (Info.plist / AndroidManifest) — injected only when EAS_BUILD=true */
  appIds: {
    android: 'ca-app-pub-3940256099942544~3347511713',
    ios: 'ca-app-pub-3940256099942544~1458002511',
  },

  /** Ad Unit IDs used at runtime (banner + interstitial) — native AdMob */
  units: {
    banner: {
      ios: 'ca-app-pub-3940256099942544/2934735716',
      android: 'ca-app-pub-3940256099942544/6300978111',
    },
    interstitial: {
      ios: 'ca-app-pub-3940256099942544/4411468910',
      android: 'ca-app-pub-3940256099942544/1033173712',
    },
  },

  /**
   * Google AdSense (web only). Leave bannerSlot / interstitialSlot empty to
   * show a local placeholder until ad units are created in AdSense console.
   */
  adsense: {
    clientId: 'ca-pub-2605764921087854',
    bannerSlot: '', // e.g. '1234567890'
    /** Full-screen-ish display unit used after every N sessions */
    interstitialSlot: '',
  },

  /** Show interstitial every N completed sessions (butts + stubs) */
  interstitialEveryNSessions: 3,
};
