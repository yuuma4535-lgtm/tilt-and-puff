const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Keep AdMob off the web bundle; adsBridge.web.tsx serves AdSense / placeholders.
  if (
    platform === 'web' &&
    moduleName === 'react-native-google-mobile-ads'
  ) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'shims/ads-web-null.js'),
    };
  }
  if (platform === 'web' && moduleName === 'expo-media-library') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'shims/media-library-web.js'),
    };
  }
  if (upstream) {
    return upstream(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
