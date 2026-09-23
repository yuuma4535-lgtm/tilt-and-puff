import type { RefObject } from 'react';
import { Alert, Platform, type View } from 'react-native';
import {
  ImageFormat,
  Skia,
  makeImageFromView,
  type SkImage,
} from '@shopify/react-native-skia';
import type { CameraBackdropHandle } from '../components/CameraBackdrop';
import { t } from '../i18n';

/** Long-edge cap so Skia offscreen stays fast on older phones */
const MAX_OUT_EDGE = 1920;

type ComposeOpts = {
  cameraRef: RefObject<CameraBackdropHandle | null>;
  /** Full-bleed transparent layer: device (+ vapor), no chrome */
  deviceLayerRef: RefObject<View | null>;
  cameraGranted: boolean;
  screenW: number;
  screenH: number;
};

type Stage =
  | 'media-permission'
  | 'camera-photo'
  | 'device-snapshot'
  | 'load-photo'
  | 'compose'
  | 'encode'
  | 'save';

function logStage(stage: Stage, detail?: unknown) {
  const msg =
    detail === undefined
      ? `[capture] ${stage}`
      : `[capture] ${stage}: ${
          detail instanceof Error ? detail.message : String(detail)
        }`;
  console.log(msg);
  if (detail instanceof Error && detail.stack) {
    console.log(detail.stack);
  }
}

function coverCrop(
  photoW: number,
  photoH: number,
  screenW: number,
  screenH: number,
) {
  const screenAspect = screenW / Math.max(screenH, 1);
  const photoAspect = photoW / Math.max(photoH, 1);
  if (photoAspect > screenAspect) {
    const cropH = photoH;
    const cropW = photoH * screenAspect;
    return { x: (photoW - cropW) / 2, y: 0, w: cropW, h: cropH };
  }
  const cropW = photoW;
  const cropH = photoW / screenAspect;
  return { x: 0, y: (photoH - cropH) / 2, w: cropW, h: cropH };
}

async function loadSkiaImage(uri: string): Promise<SkImage | null> {
  try {
    const data = await Skia.Data.fromURI(uri);
    const img = Skia.Image.MakeImageFromEncoded(data);
    if (img) return img;
  } catch (e) {
    logStage('load-photo', e);
  }
  // Fallback: fetch → bytes (some file:// hosts fail fromURI)
  try {
    const res = await fetch(uri);
    const buf = await res.arrayBuffer();
    const data = Skia.Data.fromBytes(new Uint8Array(buf));
    return Skia.Image.MakeImageFromEncoded(data);
  } catch (e) {
    logStage('load-photo', e);
    return null;
  }
}

function makeFallbackBg(outW: number, outH: number): SkImage | null {
  const surface =
    Skia.Surface.MakeOffscreen(outW, outH) ?? Skia.Surface.Make(outW, outH);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#07070b'));
  canvas.drawRect(Skia.XYWHRect(0, 0, outW, outH), paint);
  return surface.makeImageSnapshot();
}

function fail(stage: Stage, err?: unknown): false {
  logStage(stage, err ?? 'failed');
  const detail =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : stage;
  Alert.alert(t('capture'), `${t('captureFailed')}\n(${stage}: ${detail})`);
  return false;
}

/**
 * Camera still + device-layer snapshot (Skia makeImageFromView) → JPEG in library.
 * view-shot cannot capture Skia Canvas children — that was the prior failure mode.
 */
export async function composeCaptureToLibrary({
  cameraRef,
  deviceLayerRef,
  cameraGranted,
  screenW,
  screenH,
}: ComposeOpts): Promise<boolean> {
  let stage: Stage = 'media-permission';
  try {
    if (Platform.OS !== 'web') {
      logStage('media-permission', 'requesting');
      const MediaLibrary = await import('expo-media-library');
      const mediaPerm = await MediaLibrary.requestPermissionsAsync(true);
      if (!mediaPerm.granted) {
        Alert.alert(t('capture'), t('photoDenied'));
        return false;
      }
    } else {
      logStage('media-permission', 'skipped (web download)');
    }

    stage = 'camera-photo';
    let photoUri: string | null = null;
    if (cameraGranted) {
      logStage('camera-photo', 'takePhoto…');
      photoUri = (await cameraRef.current?.takePhoto()) ?? null;
      logStage('camera-photo', photoUri ? `ok ${photoUri.slice(0, 48)}…` : 'null');
    } else {
      logStage('camera-photo', 'skipped (no permission / camera off)');
    }

    stage = 'device-snapshot';
    logStage('device-snapshot', 'makeImageFromView…');
    if (!deviceLayerRef.current) {
      return fail('device-snapshot', 'deviceLayerRef is null');
    }
    const deviceImg = await makeImageFromView(deviceLayerRef);
    if (!deviceImg) {
      return fail(
        'device-snapshot',
        'makeImageFromView returned null (Skia view snapshot)',
      );
    }
    logStage(
      'device-snapshot',
      `ok ${deviceImg.width()}x${deviceImg.height()}`,
    );

    stage = 'load-photo';
    let photoImg: SkImage | null = null;
    if (photoUri) {
      photoImg = await loadSkiaImage(photoUri);
      logStage(
        'load-photo',
        photoImg
          ? `ok ${photoImg.width()}x${photoImg.height()}`
          : 'decode failed — using fallback bg',
      );
    }

    const srcW = photoImg?.width() ?? Math.round(screenW * 2);
    const srcH = photoImg?.height() ?? Math.round(screenH * 2);
    const scaleDown =
      Math.max(srcW, srcH) > MAX_OUT_EDGE
        ? MAX_OUT_EDGE / Math.max(srcW, srcH)
        : 1;
    const outW = Math.max(1, Math.round(srcW * scaleDown));
    const outH = Math.max(1, Math.round(srcH * scaleDown));

    if (!photoImg) {
      photoImg = makeFallbackBg(outW, outH);
    }
    if (!photoImg) {
      return fail('load-photo', 'fallback background failed');
    }

    stage = 'compose';
    logStage('compose', `${outW}x${outH}`);
    const surface =
      Skia.Surface.MakeOffscreen(outW, outH) ?? Skia.Surface.Make(outW, outH);
    if (!surface) {
      return fail('compose', 'Skia.Surface.MakeOffscreen/Make returned null');
    }

    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    paint.setAntiAlias(true);

    canvas.drawImageRect(
      photoImg,
      Skia.XYWHRect(0, 0, photoImg.width(), photoImg.height()),
      Skia.XYWHRect(0, 0, outW, outH),
      paint,
    );

    const crop = coverCrop(
      photoImg.width(),
      photoImg.height(),
      screenW,
      screenH,
    );
    const sx = outW / photoImg.width();
    const sy = outH / photoImg.height();
    canvas.drawImageRect(
      deviceImg,
      Skia.XYWHRect(0, 0, deviceImg.width(), deviceImg.height()),
      Skia.XYWHRect(crop.x * sx, crop.y * sy, crop.w * sx, crop.h * sy),
      paint,
    );

    stage = 'encode';
    const snap = surface.makeImageSnapshot();
    const b64 = snap.encodeToBase64(ImageFormat.JPEG, 90);
    if (!b64 || b64.length < 32) {
      return fail('encode', 'empty JPEG payload');
    }
    stage = 'save';
    if (Platform.OS === 'web') {
      // Browser download — no MediaLibrary
      const a = document.createElement('a');
      a.href = `data:image/jpeg;base64,${b64}`;
      a.download = `tilt-puff-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      logStage('save', 'web download ok');
      Alert.alert(t('capture'), t('saveOkWeb'));
      return true;
    }

    const FileSystem = await import('expo-file-system/legacy');
    const MediaLibrary = await import('expo-media-library');
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      return fail('encode', 'FileSystem.cacheDirectory is null');
    }
    const outPath = `${cacheDir}tilt-puff-${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(outPath, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    logStage('encode', outPath);

    const asset = await MediaLibrary.Asset.create(outPath);
    logStage('save', `ok ${asset.id}`);
    Alert.alert(t('capture'), t('saveOk'));
    return true;
  } catch (e) {
    return fail(stage, e);
  }
}
