import { useCallback, useEffect, useRef, useState } from 'react';
import {
  preload,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
} from 'expo-audio';
import { impactSoft } from '../utils/haptics';

/**
 * Breath / device SFX (see assets/sounds/CREDITS.md).
 * Paths must match files that exist under assets/sounds/.
 */
const SOUND = {
  inhale: require('../../assets/sounds/inhale-once.wav'),
  puffStart: require('../../assets/sounds/puff-start.wav'),
  exhale: require('../../assets/sounds/exhale-once.wav'),
  sessionEnd: require('../../assets/sounds/session-end.wav'),
} as const;

/** Buffer before first React render — expo-audio docs require module-scope preload */
preload(SOUND.inhale);
preload(SOUND.puffStart);
preload(SOUND.exhale);
preload(SOUND.sessionEnd);

const PLAYER_OPTS = {
  updateInterval: 200,
  downloadFirst: true,
} as const;

const INHALE_VOL = 0.32;
const START_VOL = 0.22;
const EXHALE_VOL = 0.46;
const END_VOL = 0.34;

/** Retries while native player finishes loading (ms) */
const LOAD_RETRY_MS = [50, 120, 250, 500, 900] as const;

export type SessionAudioApi = {
  playPuffStart: () => void;
  playPuffEnd: () => void;
  playSessionEnd: () => Promise<void>;
  /** Silence every player before leaving session (prevents teardown glitch noise) */
  stopAll: () => Promise<void>;
  stopLoop: () => Promise<void>;
  audioReady: boolean;
};

type PendingPlay = {
  label: string;
  player: AudioPlayer;
  source: number;
  volume: number;
};

function isPlayerReady(player: AudioPlayer): boolean {
  try {
    if (player.isLoaded === true) return true;
    // Player object fields are not always reactive — prefer currentStatus
    const status = player.currentStatus;
    return status?.isLoaded === true;
  } catch {
    return false;
  }
}

function forceReload(label: string, player: AudioPlayer, source: number): void {
  try {
    player.replace(source);
    console.log(`[audio:${label}] replace() to re-bind source`);
  } catch (e) {
    console.warn(`[audio:${label}] replace failed`, e);
  }
}

/**
 * Non-blocking restart. Waits for load (with retries + optional replace)
 * so early puff edges after session start are not skipped forever.
 */
function restartNow(
  label: string,
  player: AudioPlayer,
  source: number,
  volume: number,
  attempt = 0,
): void {
  try {
    if (!isPlayerReady(player)) {
      if (attempt === 0) {
        forceReload(label, player, source);
      }
      if (attempt >= LOAD_RETRY_MS.length) {
        console.error(
          `[audio:${label}] still not loaded after ${LOAD_RETRY_MS.length} retries — skip`,
          {
            isLoaded: (() => {
              try {
                return player.isLoaded;
              } catch {
                return 'err';
              }
            })(),
            status: (() => {
              try {
                return player.currentStatus;
              } catch {
                return null;
              }
            })(),
          },
        );
        return;
      }
      const delay = LOAD_RETRY_MS[attempt];
      console.warn(
        `[audio:${label}] not loaded — retry ${attempt + 1}/${LOAD_RETRY_MS.length} in ${delay}ms`,
      );
      setTimeout(() => {
        restartNow(label, player, source, volume, attempt + 1);
      }, delay);
      return;
    }

    player.loop = false;
    try {
      if (player.playing) player.pause();
    } catch (e) {
      console.warn(`[audio:${label}] pause`, e);
    }

    const start = () => {
      try {
        player.volume = volume;
        player.play();
      } catch (e) {
        console.error(`[audio:${label}] play failed`, e);
      }
    };

    try {
      player.currentTime = 0;
      start();
    } catch {
      void player
        .seekTo(0)
        .then(() => start())
        .catch((e) => {
          console.warn(`[audio:${label}] seekTo`, e);
          start();
        });
    }
  } catch (e) {
    console.error(`[audio:${label}] restartNow failed`, e);
  }
}

function silencePlayer(label: string, player: AudioPlayer): void {
  try {
    player.volume = 0;
    if (player.playing) player.pause();
    try {
      player.currentTime = 0;
    } catch {
      void player.seekTo(0).catch(() => {});
    }
  } catch (e) {
    console.warn(`[audio:${label}] silence`, e);
  }
}

export function useSessionAudio(active: boolean): SessionAudioApi {
  const inhalePlayer = useAudioPlayer(SOUND.inhale, PLAYER_OPTS);
  const startPlayer = useAudioPlayer(SOUND.puffStart, PLAYER_OPTS);
  /** Ping-pong pair so rapid untilts never skip while the previous clip is busy */
  const exhalePlayerA = useAudioPlayer(SOUND.exhale, PLAYER_OPTS);
  const exhalePlayerB = useAudioPlayer(SOUND.exhale, PLAYER_OPTS);
  const endPlayer = useAudioPlayer(SOUND.sessionEnd, PLAYER_OPTS);

  const inhaleStatus = useAudioPlayerStatus(inhalePlayer);
  const startStatus = useAudioPlayerStatus(startPlayer);
  const exhaleStatusA = useAudioPlayerStatus(exhalePlayerA);
  const exhaleStatusB = useAudioPlayerStatus(exhalePlayerB);
  const endStatus = useAudioPlayerStatus(endPlayer);

  const [audioReady, setAudioReady] = useState(false);
  const readyRef = useRef(false);
  const modeConfiguredRef = useRef(false);
  const exhaleFlipRef = useRef(0);
  const pendingRef = useRef<PendingPlay[]>([]);

  const playersRef = useRef({
    inhale: inhalePlayer,
    start: startPlayer,
    exhaleA: exhalePlayerA,
    exhaleB: exhalePlayerB,
    end: endPlayer,
  });
  playersRef.current = {
    inhale: inhalePlayer,
    start: startPlayer,
    exhaleA: exhalePlayerA,
    exhaleB: exhalePlayerB,
    end: endPlayer,
  };

  const sourcesRef = useRef({
    inhale: SOUND.inhale as number,
    start: SOUND.puffStart as number,
    exhale: SOUND.exhale as number,
    end: SOUND.sessionEnd as number,
  });

  useEffect(() => {
    if (modeConfiguredRef.current) return;
    modeConfiguredRef.current = true;
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      allowsRecording: false,
    }).catch((e) => console.error('[audio] setAudioModeAsync', e));

    for (const p of [
      inhalePlayer,
      startPlayer,
      exhalePlayerA,
      exhalePlayerB,
      endPlayer,
    ]) {
      p.loop = false;
    }
  }, [
    inhalePlayer,
    startPlayer,
    exhalePlayerA,
    exhalePlayerB,
    endPlayer,
  ]);

  // Track load via reactive status (more reliable than player.isLoaded alone)
  useEffect(() => {
    const statuses = [
      ['inhale', inhaleStatus],
      ['puff-start', startStatus],
      ['exhale-a', exhaleStatusA],
      ['exhale-b', exhaleStatusB],
      ['session-end', endStatus],
    ] as const;

    for (const [name, s] of statuses) {
      if (s.error) {
        console.error(`[audio:${name}] status.error`, s.error);
      }
    }

    const ok =
      inhaleStatus.isLoaded &&
      startStatus.isLoaded &&
      exhaleStatusA.isLoaded &&
      exhaleStatusB.isLoaded &&
      endStatus.isLoaded;

    const wasReady = readyRef.current;
    readyRef.current = ok;
    setAudioReady(ok);

    if (ok && !wasReady) {
      console.log('[audio] all players isLoaded');
      // Flush anything queued before load finished
      const pending = pendingRef.current;
      pendingRef.current = [];
      for (const item of pending) {
        restartNow(item.label, item.player, item.source, item.volume);
      }
    }
  }, [
    inhaleStatus.isLoaded,
    inhaleStatus.error,
    startStatus.isLoaded,
    startStatus.error,
    exhaleStatusA.isLoaded,
    exhaleStatusA.error,
    exhaleStatusB.isLoaded,
    exhaleStatusB.error,
    endStatus.isLoaded,
    endStatus.error,
  ]);

  // If a single player never loads, try one replace after a short settle
  useEffect(() => {
    const t = setTimeout(() => {
      const { start, inhale, exhaleA, exhaleB, end } = playersRef.current;
      const pairs: [string, AudioPlayer, number, boolean][] = [
        ['puff-start', start, sourcesRef.current.start, startStatus.isLoaded],
        ['inhale', inhale, sourcesRef.current.inhale, inhaleStatus.isLoaded],
        ['exhale-a', exhaleA, sourcesRef.current.exhale, exhaleStatusA.isLoaded],
        ['exhale-b', exhaleB, sourcesRef.current.exhale, exhaleStatusB.isLoaded],
        ['session-end', end, sourcesRef.current.end, endStatus.isLoaded],
      ];
      for (const [label, player, source, loaded] of pairs) {
        if (!loaded && !isPlayerReady(player)) {
          forceReload(label, player, source);
        }
      }
    }, 800);
    return () => clearTimeout(t);
  }, [
    startStatus.isLoaded,
    inhaleStatus.isLoaded,
    exhaleStatusA.isLoaded,
    exhaleStatusB.isLoaded,
    endStatus.isLoaded,
  ]);

  const enqueueOrPlay = useCallback(
    (label: string, player: AudioPlayer, source: number, volume: number) => {
      if (!readyRef.current && !isPlayerReady(player)) {
        console.warn(`[audio:${label}] queued until load`);
        pendingRef.current.push({ label, player, source, volume });
        // Cap queue so a stuck load cannot grow forever
        if (pendingRef.current.length > 8) {
          pendingRef.current = pendingRef.current.slice(-4);
        }
        // Still kick retries so we don't wait forever on readyRef alone
        restartNow(label, player, source, volume);
        return;
      }
      restartNow(label, player, source, volume);
    },
    [],
  );

  const stopAll = useCallback(async () => {
    pendingRef.current = [];
    const { inhale, start, exhaleA, exhaleB, end } = playersRef.current;
    silencePlayer('inhale', inhale);
    silencePlayer('puff-start', start);
    silencePlayer('exhale-a', exhaleA);
    silencePlayer('exhale-b', exhaleB);
    silencePlayer('session-end', end);
  }, []);

  // Unmount / leave session — hard silence (avoids teardown glitch noise)
  useEffect(() => {
    if (!active) {
      void stopAll();
    }
    return () => {
      void stopAll();
    };
  }, [active, stopAll]);

  const playPuffStart = useCallback(() => {
    const { start, inhale } = playersRef.current;
    enqueueOrPlay(
      'puff-start',
      start,
      sourcesRef.current.start,
      START_VOL,
    );
    enqueueOrPlay('inhale', inhale, sourcesRef.current.inhale, INHALE_VOL);
    void impactSoft();
  }, [enqueueOrPlay]);

  const playPuffEnd = useCallback(() => {
    const { inhale, exhaleA, exhaleB } = playersRef.current;
    silencePlayer('inhale', inhale);
    const useA = exhaleFlipRef.current % 2 === 0;
    exhaleFlipRef.current += 1;
    enqueueOrPlay(
      useA ? 'exhale-a' : 'exhale-b',
      useA ? exhaleA : exhaleB,
      sourcesRef.current.exhale,
      EXHALE_VOL,
    );
  }, [enqueueOrPlay]);

  const playSessionEnd = useCallback(async () => {
    await stopAll();
    await new Promise((r) => setTimeout(r, 30));
    enqueueOrPlay(
      'session-end',
      playersRef.current.end,
      sourcesRef.current.end,
      END_VOL,
    );
  }, [stopAll, enqueueOrPlay]);

  const stopLoop = useCallback(async () => {
    await stopAll();
  }, [stopAll]);

  return {
    playPuffStart,
    playPuffEnd,
    playSessionEnd,
    stopAll,
    stopLoop,
    audioReady,
  };
}
