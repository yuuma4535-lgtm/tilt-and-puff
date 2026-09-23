import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInRight,
  FadeOutRight,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SkinId } from '../types';
import { DeviceView } from '../components/devices/DeviceView';
import { VaporField } from '../components/session/VaporField';
import { t } from '../i18n';
import { PUFF_TILT_MIN_DEG, SKINS, VERTICAL_RESUME_DEG } from '../constants';

const LONG_PRESS_MS = 800;
const MANUAL_PUFF_HOLD_MS = 180;
const IS_WEB = Platform.OS === 'web';

type Props = {
  skinId: SkinId;
  gaugeSV: SharedValue<number>;
  puffProgressSV: SharedValue<number>;
  burnProgressSV?: SharedValue<number>;
  gravityXSV?: SharedValue<number>;
  gravityYSV?: SharedValue<number>;
  ashKnockId?: number;
  puffCount: number;
  isActivelyPuffing: boolean;
  settling: boolean;
  exhaleBurstId: number;
  showBack: boolean;
  /** Live tilt on UI thread — no React re-render per sensor tick */
  tiltSV: SharedValue<number>;
  lengthScale: number;
  onLongPressStop: () => void;
  onBackPress: () => void;
  onSmokeComplete?: () => void;
  /** Transparent full-bleed layer for composite capture (device + vapor only) */
  deviceLayerRef?: RefObject<View | null>;
  onCapturePress?: () => void;
  capturing?: boolean;
  /** Phone-frame height on web; falls back to window height */
  viewportHeight?: number;
  /** Web: hold-to-puff when sensors unavailable */
  onManualPuffChange?: (active: boolean) => void;
  showHoldToPuffHint?: boolean;
  /** Web: tap device to knock ash (Roll / Cigar) */
  onAshTap?: () => void;
  showAshTapHint?: boolean;
  /** iOS Safari motion gate during session */
  motionPermissionNeeded?: boolean;
  /** iOS on HTTP — explain HTTPS requirement */
  motionNeedsHttps?: boolean;
  onRequestMotionPermission?: () => void;
};

export function SessionScreen({
  skinId,
  gaugeSV,
  puffProgressSV,
  burnProgressSV,
  gravityXSV,
  gravityYSV,
  ashKnockId = 0,
  puffCount,
  isActivelyPuffing,
  settling,
  exhaleBurstId,
  showBack,
  tiltSV,
  lengthScale,
  onLongPressStop,
  onBackPress,
  onSmokeComplete,
  deviceLayerRef,
  onCapturePress,
  capturing = false,
  viewportHeight,
  onManualPuffChange,
  showHoldToPuffHint = false,
  onAshTap,
  showAshTapHint = false,
  motionPermissionNeeded = false,
  motionNeedsHttps = false,
  onRequestMotionPermission,
}: Props) {
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layoutH = viewportHeight ?? winH;
  const deviceH = Math.round(layoutH * 0.72);

  const liftY = useSharedValue(0);
  const settleDim = useSharedValue(1);
  const settlingSV = useSharedValue(0);

  const maxLift = Math.max(72, (layoutH - deviceH) / 2 + 40);

  useEffect(() => {
    settlingSV.value = settling ? 1 : 0;
  }, [settling, settlingSV]);

  useAnimatedReaction(
    () => tiltSV.value,
    (roll) => {
      if (settlingSV.value > 0.5) return;
      const target = -interpolate(
        roll,
        [VERTICAL_RESUME_DEG, PUFF_TILT_MIN_DEG, 70],
        [0, maxLift * 0.75, maxLift],
        Extrapolation.CLAMP,
      );
      if (Math.abs(liftY.value - target) < 1.5) return;
      liftY.value = withTiming(target, { duration: 90 });
    },
    [maxLift],
  );

  useAnimatedReaction(
    () => settlingSV.value,
    (s) => {
      if (s > 0.5) {
        settleDim.value = withTiming(0.55, { duration: 520 });
        liftY.value = withSpring(0, { damping: 16, stiffness: 110 });
      } else {
        settleDim.value = withTiming(1, { duration: 200 });
      }
    },
  );

  const deviceLiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: liftY.value }],
    opacity: settleDim.value,
  }));

  const longPress = Gesture.LongPress()
    .minDuration(LONG_PRESS_MS)
    .maxDistance(40)
    .onEnd((_e, success) => {
      if (success) {
        runOnJS(onLongPressStop)();
      }
    });

  const enableManualPuff =
    IS_WEB &&
    !!onManualPuffChange &&
    (showHoldToPuffHint || motionNeedsHttps);
  // Hold-to-puff conflicts with long-press-to-stop — use Back button instead
  const stageGesture = enableManualPuff
    ? Gesture.Tap().enabled(false)
    : longPress;

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const puffArmedRef = useRef(false);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const onDevicePressIn = () => {
    if (!enableManualPuff) return;
    clearHoldTimer();
    puffArmedRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      puffArmedRef.current = true;
      onManualPuffChange?.(true);
    }, MANUAL_PUFF_HOLD_MS);
  };

  const onDevicePressOut = () => {
    if (!enableManualPuff) return;
    const wasPuffing = puffArmedRef.current;
    clearHoldTimer();
    if (wasPuffing) {
      onManualPuffChange?.(false);
      puffArmedRef.current = false;
    } else if (onAshTap) {
      // Short tap → knock ash (Roll / Cigar)
      onAshTap();
    }
  };

  const onDevicePress = () => {
    if (enableManualPuff) return; // handled in pressOut for short taps
    onAshTap?.();
  };

  const deviceInner = (
    <View style={[styles.deviceCluster, { height: deviceH + 40 }]}>
      <DeviceView
        skinId={skinId}
        gaugeSV={gaugeSV}
        puffing={isActivelyPuffing}
        puffProgressSV={puffProgressSV}
        burnProgressSV={burnProgressSV}
        gravityXSV={gravityXSV}
        gravityYSV={gravityYSV}
        ashKnockId={ashKnockId}
        puffCount={puffCount}
        sessionActive
        settling={settling}
        lengthScale={lengthScale}
        height={deviceH}
        showLabel={false}
      />
    </View>
  );

  return (
    <View style={styles.root} accessibilityLabel={t('sessionA11y')}>
      <GestureDetector gesture={stageGesture}>
        <Animated.View entering={FadeIn.duration(280)} style={styles.stageHit}>
          {/* Capture layer: device + vapor only — transparent, no chrome */}
          <View
            ref={deviceLayerRef}
            collapsable={false}
            style={styles.captureLayer}
            pointerEvents="box-none"
          >
            <Animated.View
              style={[styles.deviceSlot, deviceLiftStyle]}
              pointerEvents="box-none"
            >
              {enableManualPuff || onAshTap ? (
                <Pressable
                  onPressIn={enableManualPuff ? onDevicePressIn : undefined}
                  onPressOut={enableManualPuff ? onDevicePressOut : undefined}
                  onPress={!enableManualPuff ? onDevicePress : undefined}
                  accessibilityRole="button"
                  accessibilityLabel={
                    enableManualPuff ? t('holdToPuff') : t('sessionA11y')
                  }
                >
                  {deviceInner}
                </Pressable>
              ) : (
                deviceInner
              )}
            </Animated.View>

            <VaporField
              burstId={exhaleBurstId}
              onComplete={onSmokeComplete}
              vaporDensity={SKINS[skinId].vaporDensity}
            />
          </View>
        </Animated.View>
      </GestureDetector>

      {motionNeedsHttps && !settling ? (
        <View style={[styles.hintBanner, { top: Math.max(12, insets.top + 8) }]}>
          <Text style={styles.hintBannerText}>{t('motionNeedsHttpsHint')}</Text>
        </View>
      ) : null}

      {motionPermissionNeeded && onRequestMotionPermission && !settling ? (
        <View style={[styles.hintBanner, { top: Math.max(12, insets.top + 8) }]}>
          <Text style={styles.hintBannerText}>{t('motionPermissionHint')}</Text>
          <Pressable
            onPress={onRequestMotionPermission}
            style={styles.hintBannerBtn}
          >
            <Text style={styles.hintBannerBtnLabel}>{t('motionPermission')}</Text>
          </Pressable>
        </View>
      ) : null}

      {showHoldToPuffHint &&
      !motionPermissionNeeded &&
      !motionNeedsHttps &&
      !settling &&
      !isActivelyPuffing ? (
        <View
          style={[styles.hintBanner, { top: Math.max(12, insets.top + 8) }]}
          pointerEvents="none"
        >
          <Text style={styles.hintBannerText}>{t('holdToPuffHint')}</Text>
        </View>
      ) : null}

      {showAshTapHint && !settling && !isActivelyPuffing ? (
        <Text
          style={[
            styles.ashHint,
            { bottom: Math.max(88, insets.bottom + 72) },
          ]}
          pointerEvents="none"
        >
          {t('tapToKnockAsh')}
        </Text>
      ) : null}

      {onCapturePress && !settling ? (
        <Pressable
          onPress={onCapturePress}
          disabled={capturing}
          style={[
            styles.shutter,
            {
              bottom: Math.max(22, insets.bottom + 14),
              opacity: capturing ? 0.5 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('capture')}
        >
          <View style={styles.shutterInner} />
        </Pressable>
      ) : null}

      {showBack && !settling && (
        <Animated.View
          entering={FadeInRight.duration(180)}
          exiting={FadeOutRight.duration(120)}
          style={[
            styles.backWrap,
            { bottom: Math.max(18, insets.bottom + 10) },
          ]}
        >
          <Pressable
            onPress={onBackPress}
            hitSlop={12}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('back')}
          >
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  stageHit: { flex: 1 },
  captureLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
  deviceSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceCluster: {
    width: 220,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  hintBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 40,
  },
  hintBannerText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  hintBannerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  hintBannerBtnLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  ashHint: {
    position: 'absolute',
    alignSelf: 'center',
    left: 24,
    right: 24,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    zIndex: 25,
  },
  shutter: {
    position: 'absolute',
    alignSelf: 'center',
    left: '50%',
    marginLeft: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 35,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  shutterInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  backWrap: {
    position: 'absolute',
    right: 16,
    zIndex: 30,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backIcon: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 18,
    fontWeight: '600',
  },
});
