import type { SkinConfig, SkinId } from './types';

/**
 * Absolute lateral roll (DeviceMotion gamma) in degrees.
 * Puffing while |roll| >= this — no upper bound.
 */
export const PUFF_TILT_MIN_DEG = 30;

/** Below this → re-arm for next discrete puff */
export const VERTICAL_RESUME_DEG = 15;

/** One IQOS-style puff window (seconds) — gauge drain length while tilted */
export const PUFF_DURATION_SEC = 2.5;

/** Session ends after this many tilt→return cycles (butts / 吸い殻) */
export const PUFFS_PER_SESSION = 3;

export const GAUGE_MAX = 100;

/** Gauge % removed per puff — evenly empties over PUFFS_PER_SESSION */
export const PUFF_GAUGE_COST = GAUGE_MAX / PUFFS_PER_SESSION;

/**
 * Mouth-exhale smoke lifetime (ms). Session end after the final puff
 * must wait at least this long so the plume can fully dissolve.
 */
export const SMOKE_EXHALE_MS = 3700;

export const SENSOR_UPDATE_MS = 66; // ~15Hz — enough for puff edges, less JS churn

// AdMob IDs live in adConfig.js (shared with app.config.js)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const adConfig = require('../adConfig') as {
  units: {
    banner: { ios: string; android: string };
    interstitial: { ios: string; android: string };
  };
  interstitialEveryNSessions: number;
};

export const INTERSTITIAL_EVERY_N_SESSIONS =
  adConfig.interstitialEveryNSessions;

/** Ad unit IDs — replace values in adConfig.js before store release */
export const AD_UNIT = adConfig.units;

/**
 * Shake (Roll only): sudden Δaccel in g between samples.
 * ~0.7 catches a light wrist flick; walk/lift usually stay below.
 */
export const SHAKE_THRESHOLD_G = 0.7;
/** Soft floor on |a| (user-accel platforms); gravity-incl. platforms always clear this */
export const SHAKE_MAG_MIN_G = 0.55;
export const SHAKE_COOLDOWN_MS = 650;

/**
 * Roll continuous burn — seconds of tilt to reach the filter at each speed.
 * (Paused time while upright does not count.)
 */
export const ROLL_BURN_DURATION_SEC = {
  slow: 55,
  normal: 32,
  fast: 18,
} as const;

/**
 * Cigar continuous burn — seconds of tilt to reach the band (吸い殻), like Roll→filter.
 */
export const CIGAR_BURN_DURATION_SEC = {
  slow: 95,
  normal: 55,
  fast: 32,
} as const;

export const SKINS: Record<SkinId, SkinConfig> = {
  heatStick: {
    id: 'heatStick',
    consumePerSecond: 4,
    vaporDensity: 'light',
    glowIntensity: 0.45,
    tipGlow: false,
  },
  roll: {
    id: 'roll',
    consumePerSecond: 6.5,
    vaporDensity: 'medium',
    glowIntensity: 0.85,
    tipGlow: true,
  },
  cigar: {
    id: 'cigar',
    consumePerSecond: 2.2,
    vaporDensity: 'heavy',
    glowIntensity: 0.6,
    tipGlow: true,
  },
};

export const SKIN_ORDER: SkinId[] = ['heatStick', 'roll', 'cigar'];
