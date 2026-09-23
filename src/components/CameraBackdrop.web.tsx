import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BASE } from '../theme/palette';

export type CameraBackdropHandle = {
  takePhoto: () => Promise<string | null>;
};

type Props = {
  enabled: boolean;
};

/**
 * Web rear-camera backdrop via getUserMedia + HTML video.
 * takePhoto snapshots the live video frame to a JPEG data URL.
 */
export const CameraBackdrop = forwardRef<CameraBackdropHandle, Props>(
  function CameraBackdropWeb({ enabled }, ref) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const readyRef = useRef(false);

    useEffect(() => {
      let cancelled = false;

      const stop = () => {
        readyRef.current = false;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
      };

      if (!enabled) {
        stop();
        return;
      }

      (async () => {
        if (!navigator.mediaDevices?.getUserMedia) return;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          const el = videoRef.current;
          if (el) {
            el.srcObject = stream;
            el.muted = true;
            el.setAttribute('playsinline', 'true');
            await el.play().catch(() => {});
            readyRef.current = true;
          }
        } catch (e) {
          console.log('[camera-web] getUserMedia failed', e);
          readyRef.current = false;
        }
      })();

      return () => {
        cancelled = true;
        stop();
      };
    }, [enabled]);

    useImperativeHandle(
      ref,
      () => ({
        takePhoto: async () => {
          const video = videoRef.current;
          console.log('[camera-web] takePhoto', {
            enabled,
            ready: readyRef.current,
            w: video?.videoWidth,
            h: video?.videoHeight,
          });
          if (!enabled || !video || !readyRef.current || video.videoWidth < 2) {
            return null;
          }
          try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(video, 0, 0);
            return canvas.toDataURL('image/jpeg', 0.85);
          } catch (e) {
            console.log('[camera-web] snapshot error', e);
            return null;
          }
        },
      }),
      [enabled],
    );

    const videoNode = enabled
      ? createElement('video', {
          ref: (node: HTMLVideoElement | null) => {
            videoRef.current = node;
          },
          autoPlay: true,
          muted: true,
          playsInline: true,
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          },
        })
      : null;

    return (
      <View style={styles.root} pointerEvents="none">
        <LinearGradient
          colors={[BASE.bg, '#0c0c14', BASE.bg]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        {videoNode}
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
