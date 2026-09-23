export type SkinId = 'heatStick' | 'roll' | 'cigar';

export type AppScreen = 'idle' | 'session' | 'settings';

/** How the user entered the session — capture mode shows the shutter */
export type SessionMode = 'normal' | 'capture';

export type SessionEndReason = 'stop' | 'empty';

export type DailyCounts = {
  /** 吸い殻 — Roll: burned to filter; other skins: finished session */
  butts: number;
  /** シケモク — STOP / back before session complete */
  stubs: number;
};

/** Roll continuous-burn speed preset (settings) */
export type BurnSpeed = 'slow' | 'normal' | 'fast';

export type WeekSeries = {
  labels: string[];
  butts: number[];
  stubs: number[];
};

export type SkinConfig = {
  id: SkinId;
  /** Gauge % drained per second while tilting in the puff zone */
  consumePerSecond: number;
  vaporDensity: 'light' | 'medium' | 'heavy';
  glowIntensity: number;
  tipGlow: boolean;
};
