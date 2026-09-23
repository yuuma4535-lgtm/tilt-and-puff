import '@expo/metro-runtime';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { registerRootComponent } from 'expo';

/**
 * Web entry — load CanvasKit WASM before mounting the app so Skia
 * smoke / burn / device canvases work in the browser.
 */
LoadSkiaWeb({
  locateFile: (file) => {
    if (file.endsWith('.wasm')) {
      return `/${file}`;
    }
    return file;
  },
})
  .then(() => import('./App'))
  .then(({ default: App }) => {
    registerRootComponent(App);
  })
  .catch((err) => {
    console.error('[skia-web] failed to load CanvasKit', err);
    // Still mount so non-Skia UI is reachable; Skia views may be blank
    void import('./App').then(({ default: App }) => {
      registerRootComponent(App);
    });
  });
