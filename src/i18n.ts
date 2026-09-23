import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';

/**
 * Brand name — always English, never localized.
 * Use this constant in UI; do not put it in the translation tables.
 */
export const APP_NAME = 'Tilt & Puff';

/**
 * UI copy only. Keep en / ja key sets identical.
 * Brand / product-style skin names are localized so a Japanese UI
 * does not mix Latin labels into Japanese chrome.
 */
const translations = {
  en: {
    start: 'START',
    stop: 'STOP',
    settings: 'Settings',
    skins: 'Skins',
    skinHeatStick: 'Heat Stick',
    skinRoll: 'Roll',
    skinCigar: 'Cigar',
    butts: 'Butts',
    stubs: 'Stubs',
    weeklyChart: 'Weekly chart',
    capture: 'Capture',
    captureModeStart: 'CAPTURE MODE',
    share: 'Share',
    saveOk: 'Saved to camera roll',
    saveOkWeb: 'Image downloaded',
    motionPermission: 'Enable tilt sensing',
    motionPermissionHint:
      'Required on iPhone Safari to detect tilt for puffing. Tap the button, then Allow.',
    motionNeedsHttpsHint:
      'Tilt sensing on iPhone requires HTTPS (or localhost). This page is HTTP, so Safari does not expose the permission API. Use an HTTPS tunnel (e.g. ngrok) or hold the device to puff.',
    holdToPuff: 'Hold to puff',
    holdToPuffHint:
      'No tilt sensor — press and hold the device to puff (desktop / some browsers)',
    tapToKnockAsh: 'Tap device to knock ash',
    cameraDenied: 'Camera unavailable — using fallback background',
    gauge: 'Gauge',
    tilting: 'Puffing…',
    paused: 'Paused — tilt again to continue',
    back: 'Back',
    backNav: '← Back',
    close: 'Close',
    tapToSwitchSkin: 'Tap device to switch skin',
    sessionA11y: 'Session',
    burnSpeed: 'Burn speed',
    burnSpeedHint: 'How fast a Roll or Cigar burns while tilted',
    burnSlow: 'Slow',
    burnNormal: 'Normal',
    burnFast: 'Fast',
    cameraBackground: 'Camera background',
    cameraAllowed: 'During a session, the rear camera shows behind the device',
    cameraDeniedHint:
      'Camera access is off — sessions use a dark background. You can enable it in system Settings.',
    cameraDeniedHintWeb:
      'Camera access is off — sessions use a dark background. Allow the camera in your browser site settings, then tap Allow camera.',
    cameraUnsupportedWeb:
      'This browser cannot access the camera (needs HTTPS or localhost). Sessions use a dark background.',
    openSystemSettings: 'Open system Settings',
    requestCamera: 'Allow camera',
    saveToRoll: 'Save to camera roll',
    captureHint:
      'Capture mode is the same session, plus a shutter to save camera + device',
    photoDenied: 'Photo library access is required to save',
    captureFailed: 'Could not save the photo',
    capturing: 'Saving…',
    adPlaceholder: 'Ad',
    adInterstitialHint: 'Placeholder — set AdSense IDs in adConfig.js to show real ads',
    sessionRecoverTitle: 'Something went wrong in the session',
    sessionRecoverAction: 'Back to start',
  },
  ja: {
    start: 'スタート',
    stop: 'ストップ',
    settings: '設定',
    skins: 'スキン',
    skinHeatStick: '電子タバコ',
    skinRoll: '紙タバコ',
    skinCigar: '葉巻',
    butts: '吸い殻',
    stubs: 'シケモク',
    weeklyChart: '週間グラフ',
    capture: '撮影',
    captureModeStart: '撮影モードで開始',
    share: '共有',
    saveOk: 'カメラロールに保存しました',
    saveOkWeb: '画像をダウンロードしました',
    motionPermission: '傾き検知を許可',
    motionPermissionHint:
      'iPhoneのSafariでは、吸引の傾き検知に許可が必要です。ボタンを押して「許可」を選んでください',
    motionNeedsHttpsHint:
      'iPhoneの傾き検知にはHTTPS（またはlocalhost）が必要です。今はHTTPのためSafariが許可APIを出しません。ngrok等でHTTPS化するか、デバイスを長押しして吸引してください',
    holdToPuff: '長押しで吸引',
    holdToPuffHint:
      '傾きセンサーが使えないため、デバイスを長押しして吸引します（PCや一部ブラウザ）',
    tapToKnockAsh: 'タップで灰を落とす',
    cameraDenied: 'カメラ非許可 — グラデーション背景を使用中',
    gauge: 'ゲージ',
    tilting: '吸引中…',
    paused: '一時停止 — 傾けると再開',
    back: '戻る',
    backNav: '← 戻る',
    close: '閉じる',
    tapToSwitchSkin: 'デバイスをタップしてスキン切替',
    sessionA11y: 'セッション',
    burnSpeed: '燃え進む速さ',
    burnSpeedHint: '紙タバコ／葉巻を傾けているあいだの燃焼速度',
    burnSlow: 'ゆっくり',
    burnNormal: '標準',
    burnFast: '早い',
    cameraBackground: 'カメラ背景',
    cameraAllowed: 'セッション中は背面カメラがデバイスの後ろに透過表示されます',
    cameraDeniedHint:
      'カメラがオフのためセッションも暗い背景です。システム設定から許可できます。',
    cameraDeniedHintWeb:
      'カメラがオフのためセッションも暗い背景です。ブラウザのサイト設定でカメラを許可してから「カメラを許可」を押してください。',
    cameraUnsupportedWeb:
      'このブラウザではカメラを使えません（HTTPSまたはlocalhostが必要）。暗い背景で動作します。',
    openSystemSettings: 'システム設定を開く',
    requestCamera: 'カメラを許可',
    saveToRoll: 'カメラロールに保存',
    captureHint:
      '撮影モードは通常と同じ吸引体験に、保存用シャッターが付きます',
    photoDenied: '保存には写真へのアクセス許可が必要です',
    captureFailed: '写真を保存できませんでした',
    capturing: '保存中…',
    adPlaceholder: '広告',
    adInterstitialHint:
      'プレースホルダー — 本番広告は adConfig.js に AdSense ID を設定してください',
    sessionRecoverTitle: 'セッションでエラーが発生しました',
    sessionRecoverAction: 'スタート画面に戻る',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

/** English default; Japanese only when the device language is Japanese. */
export function resolveAppLocale(): 'ja' | 'en' {
  const primary = getLocales()[0];
  const code = (primary?.languageCode ?? primary?.languageTag ?? 'en')
    .toLowerCase()
    .split(/[-_]/)[0];
  return code === 'ja' ? 'ja' : 'en';
}

const i18n = new I18n(translations);
i18n.enableFallback = true;
i18n.defaultLocale = 'en';
i18n.locale = resolveAppLocale();

export default i18n;

export function t(key: TranslationKey): string {
  return i18n.t(key);
}

export function getAppLocale(): 'ja' | 'en' {
  return i18n.locale === 'ja' ? 'ja' : 'en';
}
