import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import { LineChart } from 'react-native-chart-kit';

import { t, APP_NAME } from './src/i18n';
import { GAUGE_MAX, SKIN_ORDER } from './src/constants';
import type {
  AppScreen,
  BurnSpeed,
  DailyCounts,
  SessionMode,
  SkinId,
  WeekSeries,
} from './src/types';
import { BASE, getSkinPalette } from './src/theme/palette';
import { useDeviceTilt } from './src/hooks/useDeviceTilt';
import { usePuffSession } from './src/hooks/usePuffSession';
import { useShakeAsh } from './src/hooks/useShakeAsh';
import { useCameraAccess } from './src/hooks/useCameraAccess';
import {
  IdleBannerAd,
  AdsRootExtras,
  useInterstitialOnIdleReturn,
} from './src/ads/adsBridge';
import {
  incrementButts,
  incrementStubs,
  loadTodayCounts,
  loadWeekSeries,
} from './src/storage/dailyCounters';
import { loadSettings, setBurnSpeed } from './src/storage/settings';
import { DeviceView } from './src/components/devices/DeviceView';
import { SkinPicker } from './src/components/devices/SkinPicker';
import {
  CameraBackdrop,
  type CameraBackdropHandle,
} from './src/components/CameraBackdrop';
import { SessionScreen } from './src/screens/SessionScreen';
import { useSessionAudio } from './src/hooks/useSessionAudio';
import { composeCaptureToLibrary } from './src/utils/composeCapture';
import { ErrorBoundary } from './src/components/ErrorBoundary';

const BURN_SPEEDS: BurnSpeed[] = ['slow', 'normal', 'fast'];
const IS_WEB = Platform.OS === 'web';
const WEB_PHONE_MAX_W = 430;

/**
 * Tilt & Puff — screen machine + themed device skins + live camera backdrop.
 */
export default function App() {
  const { width: winW, height: winH } = useWindowDimensions();
  const [screen, setScreen] = useState<AppScreen>('idle');
  const [skinId, setSkinId] = useState<SkinId>('heatStick');
  const [counts, setCounts] = useState<DailyCounts>({ butts: 0, stubs: 0 });
  const [week, setWeek] = useState<WeekSeries | null>(null);
  const [chartVisible, setChartVisible] = useState(false);
  const [rollLengthScale, setRollLengthScale] = useState(1);
  const [exhaleBurstId, setExhaleBurstId] = useState(0);
  /** Roll idle shows full ash butt after burning to the filter */
  const [rollButt, setRollButt] = useState(false);
  const [burnSpeed, setBurnSpeedState] = useState<BurnSpeed>('normal');
  const [ashKnockId, setAshKnockId] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [sessionMode, setSessionMode] = useState<SessionMode>('normal');

  const cameraRef = useRef<CameraBackdropHandle>(null);
  const deviceLayerRef = useRef<View>(null);

  const idleGaugeSV = useSharedValue(GAUGE_MAX);
  const endingRef = useRef(false);
  const audioApiRef = useRef({
    playSessionEnd: async () => {},
    stopLoop: async () => {},
    stopAll: async () => {},
    playPuffStart: () => {},
    playPuffEnd: () => {},
  });
  const inSession = screen === 'session';
  const palette = getSkinPalette(skinId);
  const camera = useCameraAccess();
  const cameraLive = inSession && camera.granted && !camera.loading;
  const captureEnabled = inSession && sessionMode === 'capture';
  const frameW = IS_WEB ? Math.min(winW, WEB_PHONE_MAX_W) : winW;
  const frameH = IS_WEB
    ? Math.min(winH, Math.round(frameW * (19.5 / 9)))
    : winH;

  const { tiltSV, gravityXSV, gravityYSV, isInPuffZone, isNearVertical, motionPermissionNeeded, motionNeedsHttps, requestMotionPermission, setManualPuff, manualPuffRecommended } =
    useDeviceTilt(inSession);
  const { maybeShowAfterSession, preloadInterstitial } =
    useInterstitialOnIdleReturn();

  const returnToIdle = useCallback(
    async (reason: 'stop' | 'empty') => {
      if (endingRef.current) return;
      endingRef.current = true;

      await audioApiRef.current.stopAll();

      if (reason === 'empty') {
        await audioApiRef.current.playSessionEnd();
      }

      const next =
        reason === 'empty' ? await incrementButts() : await incrementStubs();
      setCounts(next);
      if (reason === 'empty') {
        setRollButt(true);
      }
      setScreen('idle');
      setRollLengthScale(1);
      idleGaugeSV.value = GAUGE_MAX;
      // After butts / stubs — interstitial every N sessions (AdMob native / AdSense web)
      await maybeShowAfterSession();
      endingRef.current = false;
    },
    [maybeShowAfterSession, idleGaugeSV],
  );

  const returnToIdleRef = useRef(returnToIdle);
  returnToIdleRef.current = returnToIdle;

  const onExhaleBurst = useCallback(() => {
    setExhaleBurstId((n) => n + 1);
  }, []);

  const {
    playSessionEnd,
    stopLoop,
    stopAll,
    playPuffStart,
    playPuffEnd,
  } = useSessionAudio(inSession);
  audioApiRef.current = {
    playSessionEnd,
    stopLoop,
    stopAll,
    playPuffStart,
    playPuffEnd,
  };

  const onPuffStart = useCallback(() => {
    audioApiRef.current.playPuffStart();
  }, []);

  const onPuffEnd = useCallback(() => {
    audioApiRef.current.playPuffEnd();
    onExhaleBurst();
  }, [onExhaleBurst]);

  const {
    gaugeSV,
    puffProgressSV,
    burnProgressSV,
    isActivelyPuffing,
    settling,
    puffCount,
    freeze,
    notifySmokeComplete,
  } = usePuffSession({
    active: inSession,
    skinId,
    burnSpeed,
    tilted: inSession && isInPuffZone,
    nearVertical: !inSession || isNearVertical,
    onEmpty: () => {
      void returnToIdleRef.current('empty');
    },
    onExhale: onPuffEnd,
    onPuffStart,
  });

  useShakeAsh({
    enabled: inSession && (skinId === 'roll' || skinId === 'cigar'),
    onShake: () => {
      setAshKnockId((n) => n + 1);
    },
  });

  useEffect(() => {
    void loadTodayCounts().then(setCounts);
    void loadSettings().then((s) => setBurnSpeedState(s.burnSpeed));
  }, []);

  const onChangeBurnSpeed = (speed: BurnSpeed) => {
    setBurnSpeedState(speed);
    void setBurnSpeed(speed);
  };

  const onStart = (mode: SessionMode = 'normal') => {
    endingRef.current = false;
    setSessionMode(mode);
    setRollLengthScale(1);
    setRollButt(false);
    setExhaleBurstId(0);
    setAshKnockId(0);
    // Preload interstitial while the session runs
    preloadInterstitial();
    setScreen('session');
  };

  const onLongPressStop = () => {
    freeze();
    void returnToIdle('stop');
  };

  const cycleSkin = (dir: 1 | -1) => {
    const idx = SKIN_ORDER.indexOf(skinId);
    const next = SKIN_ORDER[(idx + dir + SKIN_ORDER.length) % SKIN_ORDER.length];
    setSkinId(next);
    setRollButt(false);
  };

  const openChart = async () => {
    const series = await loadWeekSeries();
    setWeek(series);
    setChartVisible(true);
  };

  const onCaptureSave = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      await composeCaptureToLibrary({
        cameraRef,
        deviceLayerRef,
        cameraGranted: cameraLive,
        screenW: frameW,
        screenH: frameH,
      });
    } finally {
      setCapturing(false);
    }
  };

  const burnSpeedLabel = (speed: BurnSpeed) =>
    speed === 'slow'
      ? t('burnSlow')
      : speed === 'fast'
        ? t('burnFast')
        : t('burnNormal');

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={IS_WEB ? styles.webShell : styles.flexFill}>
          <View
            style={[
              IS_WEB ? styles.phoneFrame : styles.flexFill,
              IS_WEB && { width: frameW, height: frameH, maxHeight: winH },
            ]}
          >
        <View
          style={[
            styles.scene,
            { backgroundColor: cameraLive ? 'transparent' : BASE.bg },
          ]}
        >
          <CameraBackdrop ref={cameraRef} enabled={cameraLive} />

          <SafeAreaView
            style={styles.overlay}
            edges={inSession ? [] : ['top', 'left', 'right']}
          >
            <StatusBar style="light" hidden={inSession} />

            {screen === 'idle' && (
              <ScrollView
                style={styles.flexFill}
                contentContainerStyle={styles.idleScroll}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <Text style={[styles.brand, styles.textGlow]}>{APP_NAME}</Text>
                <Text style={[styles.tagline, { color: palette.neon }]}>
                  {t(
                    skinId === 'heatStick'
                      ? 'skinHeatStick'
                      : skinId === 'roll'
                        ? 'skinRoll'
                        : 'skinCigar',
                  )}
                </Text>

                <Pressable onPress={() => cycleSkin(1)} style={styles.deviceHit}>
                  <DeviceView
                    skinId={skinId}
                    gaugeSV={idleGaugeSV}
                    height={250}
                    butt={(skinId === 'roll' || skinId === 'cigar') && rollButt}
                  />
                  <Text style={[styles.hint, styles.textGlow]}>
                    {t('tapToSwitchSkin')}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.startBtn,
                    {
                      backgroundColor: palette.button,
                      shadowColor: palette.glowShadow,
                    },
                  ]}
                  onPress={() => onStart('normal')}
                >
                  <Text
                    style={[styles.startLabel, { color: palette.buttonText }]}
                  >
                    {t('start')}
                  </Text>
                </Pressable>

                {IS_WEB && motionNeedsHttps ? (
                  <View style={styles.motionGate}>
                    <Text style={[styles.hint, styles.textGlow]}>
                      {t('motionNeedsHttpsHint')}
                    </Text>
                  </View>
                ) : null}

                {IS_WEB && motionPermissionNeeded ? (
                  <View style={styles.motionGate}>
                    <Text style={[styles.hint, styles.textGlow]}>
                      {t('motionPermissionHint')}
                    </Text>
                    <Pressable
                      style={[
                        styles.captureModeBtn,
                        { borderColor: palette.neon },
                      ]}
                      onPress={() => void requestMotionPermission()}
                    >
                      <Text
                        style={[
                          styles.captureModeLabel,
                          { color: palette.neon },
                        ]}
                      >
                        {t('motionPermission')}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {IS_WEB &&
                !motionPermissionNeeded &&
                !motionNeedsHttps &&
                manualPuffRecommended ? (
                  <Text style={[styles.hint, styles.textGlow]}>
                    {t('holdToPuffHint')}
                  </Text>
                ) : null}

                <Pressable
                  style={[
                    styles.captureModeBtn,
                    { borderColor: palette.neon },
                  ]}
                  onPress={() => onStart('capture')}
                >
                  <Text
                    style={[styles.captureModeLabel, { color: palette.neon }]}
                  >
                    {t('captureModeStart')}
                  </Text>
                </Pressable>

                <View style={styles.counters}>
                  <View style={styles.counterChip}>
                    <Text style={styles.counterValue}>{counts.butts}</Text>
                    <Text style={styles.counterLabel}>{t('butts')}</Text>
                  </View>
                  <View style={styles.counterChip}>
                    <Text style={styles.counterValue}>{counts.stubs}</Text>
                    <Text style={styles.counterLabel}>{t('stubs')}</Text>
                  </View>
                </View>

                <View style={styles.row}>
                  <Pressable onPress={() => setScreen('settings')}>
                    <Text style={[styles.link, { color: palette.link }]}>
                      {t('settings')}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => void openChart()}>
                    <Text style={[styles.link, { color: palette.link }]}>
                      {t('weeklyChart')}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.bannerSlotInline}>
                  <IdleBannerAd />
                </View>
              </ScrollView>
            )}

            {inSession && (
              <ErrorBoundary
                name="session"
                onReset={() => {
                  endingRef.current = false;
                  setScreen('idle');
                }}
              >
              <SessionScreen
                skinId={skinId}
                gaugeSV={gaugeSV}
                puffProgressSV={puffProgressSV}
                burnProgressSV={burnProgressSV}
                gravityXSV={gravityXSV}
                gravityYSV={gravityYSV}
                ashKnockId={ashKnockId}
                puffCount={puffCount}
                isActivelyPuffing={isActivelyPuffing}
                settling={settling}
                exhaleBurstId={exhaleBurstId}
                showBack={!isActivelyPuffing}
                tiltSV={tiltSV}
                lengthScale={rollLengthScale}
                onLongPressStop={onLongPressStop}
                onBackPress={onLongPressStop}
                onSmokeComplete={notifySmokeComplete}
                deviceLayerRef={deviceLayerRef}
                onCapturePress={
                  captureEnabled ? () => void onCaptureSave() : undefined
                }
                capturing={capturing}
                viewportHeight={frameH}
                onManualPuffChange={IS_WEB ? setManualPuff : undefined}
                showHoldToPuffHint={
                  IS_WEB && manualPuffRecommended && !motionNeedsHttps
                }
                onAshTap={
                  IS_WEB && (skinId === 'roll' || skinId === 'cigar')
                    ? () => setAshKnockId((n) => n + 1)
                    : undefined
                }
                showAshTapHint={
                  IS_WEB && (skinId === 'roll' || skinId === 'cigar')
                }
                motionPermissionNeeded={IS_WEB && motionPermissionNeeded}
                motionNeedsHttps={IS_WEB && motionNeedsHttps}
                onRequestMotionPermission={
                  IS_WEB
                    ? () => {
                        void requestMotionPermission();
                      }
                    : undefined
                }
              />
              </ErrorBoundary>
            )}

            {screen === 'settings' && (
              <ScrollView
                style={styles.flexFill}
                contentContainerStyle={[styles.idleScroll, styles.settingsPad]}
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.brand, styles.textGlow]}>{t('skins')}</Text>
                <SkinPicker selected={skinId} onSelect={setSkinId} />

                <Text style={[styles.settingsSection, { color: palette.neon }]}>
                  {t('burnSpeed')}
                </Text>
                <Text style={[styles.hint, styles.textGlow]}>
                  {t('burnSpeedHint')}
                </Text>
                <View style={styles.speedRow}>
                  {BURN_SPEEDS.map((speed) => {
                    const selected = burnSpeed === speed;
                    return (
                      <Pressable
                        key={speed}
                        onPress={() => onChangeBurnSpeed(speed)}
                        style={[
                          styles.speedChip,
                          selected && {
                            borderColor: palette.neon,
                            backgroundColor: palette.neonSoft,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.speedChipLabel,
                            selected && { color: palette.neon },
                          ]}
                        >
                          {burnSpeedLabel(speed)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.settingsSection, { color: palette.neon }]}>
                  {t('cameraBackground')}
                </Text>
                {camera.granted ? (
                  <Text style={[styles.hint, styles.textGlow]}>
                    {t('cameraAllowed')}
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.hint, styles.textGlow]}>
                      {camera.unsupported
                        ? t('cameraUnsupportedWeb')
                        : IS_WEB
                          ? t('cameraDeniedHintWeb')
                          : t('cameraDeniedHint')}
                    </Text>
                    <View style={styles.speedRow}>
                      {camera.canAskAgain ? (
                        <Pressable
                          onPress={() => void camera.request()}
                          style={[
                            styles.speedChip,
                            {
                              borderColor: palette.neon,
                              backgroundColor: palette.neonSoft,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.speedChipLabel,
                              { color: palette.neon },
                            ]}
                          >
                            {t('requestCamera')}
                          </Text>
                        </Pressable>
                      ) : null}
                      {!IS_WEB ? (
                        <Pressable
                          onPress={camera.openSystemSettings}
                          style={styles.speedChip}
                        >
                          <Text style={styles.speedChipLabel}>
                            {t('openSystemSettings')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </>
                )}

                <Pressable onPress={() => setScreen('idle')}>
                  <Text style={[styles.link, { color: palette.link }]}>
                    {t('backNav')}
                  </Text>
                </Pressable>
              </ScrollView>
            )}

            <Modal visible={chartVisible} animationType="slide" transparent>
              <View style={styles.modalBackdrop}>
                <View style={styles.modalCard}>
                  <Text style={styles.brand}>{t('weeklyChart')}</Text>
                  {week && (
                    <LineChart
                      data={{
                        labels: week.labels,
                        datasets: [
                          { data: week.butts, color: () => palette.neon },
                          { data: week.stubs, color: () => palette.accent },
                        ],
                        legend: [t('butts'), t('stubs')],
                      }}
                      width={Math.max(200, frameW - 48)}
                      height={200}
                      chartConfig={{
                        backgroundGradientFrom: BASE.bgElevated,
                        backgroundGradientTo: BASE.surface,
                        color: (o) => `rgba(255,255,255,${o})`,
                        labelColor: () => BASE.textMuted,
                      }}
                      bezier
                      style={{ borderRadius: 8 }}
                    />
                  )}
                  <Pressable onPress={() => setChartVisible(false)}>
                    <Text style={[styles.link, { color: palette.link }]}>
                      {t('close')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Modal>
          </SafeAreaView>
        </View>
          </View>
        </View>
        <AdsRootExtras />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BASE.bg },
  flexFill: { flex: 1 },
  webShell: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050508',
  },
  phoneFrame: {
    flexGrow: 0,
    flexShrink: 1,
    overflow: 'hidden',
    backgroundColor: BASE.bg,
    // Soft phone-like bounds on wide desktops
    borderRadius: Platform.OS === 'web' ? 16 : 0,
    maxWidth: WEB_PHONE_MAX_W,
  },
  scene: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'transparent', zIndex: 1 },
  idleScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
    paddingTop: 24,
    paddingBottom: 28,
  },
  idle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
    paddingBottom: 72,
  },
  settingsPad: {
    justifyContent: 'flex-start',
    paddingTop: 32,
    paddingBottom: 40,
  },
  settingsSection: {
    marginTop: 20,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },
  speedRow: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
    justifyContent: 'space-between',
  },
  speedChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BASE.border,
    backgroundColor: BASE.surface,
  },
  speedChipLabel: {
    color: BASE.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  brand: {
    color: BASE.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  textGlow: {
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: -6,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  deviceHit: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  startBtn: {
    marginTop: 8,
    paddingHorizontal: 52,
    paddingVertical: 16,
    borderRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  startLabel: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
  },
  captureModeBtn: {
    marginTop: 2,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  captureModeLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  motionGate: {
    alignItems: 'center',
    gap: 8,
    maxWidth: 320,
  },
  counters: { flexDirection: 'row', gap: 16, marginTop: 4 },
  counterChip: {
    alignItems: 'center',
    minWidth: 72,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: BASE.surface,
    borderWidth: 1,
    borderColor: BASE.border,
  },
  counterValue: {
    color: BASE.text,
    fontSize: 20,
    fontWeight: '700',
  },
  counterLabel: {
    color: BASE.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  row: { flexDirection: 'row', gap: 18, marginTop: 4 },
  link: {
    fontSize: 14,
    padding: 8,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  hint: {
    color: BASE.textDim,
    fontSize: 12,
    textAlign: 'center',
  },
  bannerSlot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bannerSlotInline: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    minHeight: 50,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: BASE.bgElevated,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BASE.border,
  },
});
