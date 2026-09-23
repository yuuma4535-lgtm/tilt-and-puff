import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, type CameraPictureOptions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { BASE } from '../theme/palette';

export type CameraBackdropHandle = {
  /** High-quality still for composite capture */
  takePhoto: () => Promise<string | null>;
};

type Props = {
  /** When true, show live CameraView (permission already granted) */
  enabled: boolean;
};

function pickPreviewSize(sizes: string[]): string | undefined {
  return (
    sizes.find((s) => /1280x720|720x1280|960x720|720x960/i.test(s)) ??
    sizes.find((s) => /640x480|480x640|800x600/i.test(s)) ??
    sizes[Math.floor(sizes.length / 2)] ??
    sizes[0]
  );
}

/**
 * Full-bleed rear-camera background (iBeer-style).
 * Falls back to the dark gradient when camera is off / denied.
 * takePhoto uses the live session without swapping pictureSize mid-shot
 * (size swaps were racing CameraView re-init and causing null captures).
 */
export const CameraBackdrop = forwardRef<CameraBackdropHandle, Props>(
  function CameraBackdrop({ enabled }, ref) {
    const cameraRef = useRef<CameraView>(null);
    const [pictureSize, setPictureSize] = useState<string | undefined>();
    const readyRef = useRef(false);

    useEffect(() => {
      if (!enabled) readyRef.current = false;
    }, [enabled]);

    const onReady = useCallback(async () => {
      readyRef.current = true;
      try {
        const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
        if (!sizes?.length) return;
        setPictureSize(pickPreviewSize(sizes));
      } catch (e) {
        console.log('[camera] getAvailablePictureSizesAsync failed', e);
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        takePhoto: async () => {
          const cam = cameraRef.current;
          console.log('[camera] takePhoto', {
            enabled,
            ready: readyRef.current,
            hasRef: !!cam,
            pictureSize,
          });
          if (!enabled || !cam || !readyRef.current) {
            console.log('[camera] takePhoto aborted — not ready');
            return null;
          }
          try {
            const opts: CameraPictureOptions = {
              quality: 0.8,
              shutterSound: false,
              skipProcessing: false,
            };
            const photo = await cam.takePictureAsync(opts);
            console.log(
              '[camera] takePhoto ok',
              photo?.uri?.slice(0, 64),
              photo?.width,
              photo?.height,
            );
            return photo?.uri ?? null;
          } catch (e) {
            console.log('[camera] takePictureAsync error', e);
            return null;
          }
        },
      }),
      [enabled, pictureSize],
    );

    return (
      <View style={styles.root} pointerEvents="none">
        <LinearGradient
          colors={[BASE.bg, '#0c0c14', BASE.bg]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />

        {enabled ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="picture"
            mute
            animateShutter={false}
            pictureSize={pictureSize}
            onCameraReady={() => {
              void onReady();
            }}
          />
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
});
