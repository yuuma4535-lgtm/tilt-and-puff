/**
 * Expo config — no `owner` / `extra.eas.projectId` so Expo Go works without login.
 * AdMob native plugin + root app IDs are only injected during EAS Build.
 */
const IS_EAS_BUILD = process.env.EAS_BUILD === 'true';
const { appIds } = require('./adConfig');

const ADMOB_ANDROID_APP_ID = appIds.android;
const ADMOB_IOS_APP_ID = appIds.ios;

const basePlugins = [
  'expo-localization',
  'expo-sharing',
  [
    'expo-splash-screen',
    {
      backgroundColor: '#0A0D12',
      image: './assets/splash-icon.png',
      imageWidth: 220,
      resizeMode: 'contain',
      dark: {
        backgroundColor: '#0A0D12',
        image: './assets/splash-icon.png',
      },
    },
  ],
  [
    'expo-audio',
    {
      microphonePermission: false,
      recordAudioAndroid: false,
      enableBackgroundPlayback: false,
      enableBackgroundRecording: false,
    },
  ],
  [
    'expo-camera',
    {
      cameraPermission:
        'Allow Tilt & Puff to use the camera as a live background.',
      microphonePermission: false,
      recordAudioAndroid: false,
      barcodeScannerEnabled: false,
    },
  ],
  [
    'expo-sensors',
    {
      motionPermission:
        'Allow Tilt & Puff to access device motion for tilt and shake effects.',
    },
  ],
  [
    'expo-media-library',
    {
      photosPermission: 'Allow Tilt & Puff to save screenshots.',
      savePhotosPermission:
        'Allow Tilt & Puff to save screenshots to your library.',
      isAccessMediaLocationEnabled: false,
    },
  ],
];

const config = {
  expo: {
    name: 'Tilt & Puff',
    slug: 'tilt-and-puff',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.tiltandpuff.app',
      infoPlist: {
        NSCameraUsageDescription:
          'Tilt & Puff uses the camera as a live background for novelty screenshots.',
        NSPhotoLibraryAddUsageDescription:
          'Save Tilt & Puff screenshots to your camera roll.',
        NSMotionUsageDescription:
          'Tilt & Puff uses motion sensors to detect device tilt and shake.',
      },
    },
    android: {
      package: 'com.tiltandpuff.app',
      adaptiveIcon: {
        backgroundColor: '#0A0D12',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      permissions: [
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ],
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      ...basePlugins,
      ...(IS_EAS_BUILD
        ? [
            [
              'react-native-google-mobile-ads',
              {
                androidAppId: ADMOB_ANDROID_APP_ID,
                iosAppId: ADMOB_IOS_APP_ID,
              },
            ],
          ]
        : []),
    ],
  },
};

// Invertase requires this block outside `expo` for native builds only.
if (IS_EAS_BUILD) {
  config['react-native-google-mobile-ads'] = {
    android_app_id: ADMOB_ANDROID_APP_ID,
    ios_app_id: ADMOB_IOS_APP_ID,
  };
}

module.exports = config;
