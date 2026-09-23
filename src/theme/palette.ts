import type { SkinId } from '../types';

/** Shared dark canvas — ink, not pure black */
export const BASE = {
  bg: '#07070b',
  bgElevated: '#101018',
  bgMuted: '#181822',
  surface: '#1c1c28',
  border: '#2a2a3a',
  text: '#f4f4f8',
  textMuted: '#8b8b9e',
  textDim: '#5c5c70',
  danger: '#ff5c7a',
  dangerSoft: '#ff5c7a33',
} as const;

export type SkinPalette = {
  /** Primary neon accent */
  neon: string;
  neonSoft: string;
  neonDim: string;
  /** Secondary accent (tips, LEDs, highlights) */
  accent: string;
  accentSoft: string;
  /** Device body materials */
  body: string;
  bodyMid: string;
  bodyDark: string;
  bodyHighlight: string;
  /** Tip / ember / LED */
  tip: string;
  tipHot: string;
  tipCool: string;
  /** UI chrome for this skin */
  gauge: string;
  button: string;
  buttonText: string;
  link: string;
  glowShadow: string;
  vapor: string;
};

/**
 * Fictional neon identities — no real brand colors.
 * Heat Stick: ice cyan metal
 * Roll: ember amber paper
 * Cigar: molten gold tobacco
 */
export const SKIN_PALETTES: Record<SkinId, SkinPalette> = {
  heatStick: {
    neon: '#5ce1ff',
    neonSoft: '#5ce1ff44',
    neonDim: '#1a6a7a',
    accent: '#a78bfa',
    accentSoft: '#a78bfa33',
    body: '#c5cdd8',
    bodyMid: '#8a93a3',
    bodyDark: '#3a414d',
    bodyHighlight: '#eef2f7',
    tip: '#5ce1ff',
    tipHot: '#b8f4ff',
    tipCool: '#2a9bb0',
    gauge: '#5ce1ff',
    button: '#5ce1ff',
    buttonText: '#041018',
    link: '#7ee9ff',
    glowShadow: '#5ce1ff',
    vapor: '#d8f7ff',
  },
  roll: {
    neon: '#ff6b2c',
    neonSoft: '#ff6b2c44',
    neonDim: '#8a3010',
    accent: '#ffd166',
    accentSoft: '#ffd16633',
    body: '#e8dcc8',
    bodyMid: '#c4b49a',
    bodyDark: '#6b5a42',
    bodyHighlight: '#f7f0e4',
    tip: '#ff3b1f',
    tipHot: '#ffd56a',
    tipCool: '#7a1808',
    gauge: '#ff7a3d',
    button: '#ff6b2c',
    buttonText: '#1a0800',
    link: '#ff9a5c',
    glowShadow: '#ff4d1a',
    vapor: '#ffe8d6',
  },
  cigar: {
    neon: '#f0c75e',
    neonSoft: '#f0c75e44',
    neonDim: '#7a5a18',
    accent: '#e8a87c',
    accentSoft: '#e8a87c33',
    body: '#5c3a22',
    bodyMid: '#3e2616',
    bodyDark: '#1f120a',
    bodyHighlight: '#8b5e3c',
    tip: '#ff8a3d',
    tipHot: '#ffe08a',
    tipCool: '#5a2208',
    gauge: '#f0c75e',
    button: '#f0c75e',
    buttonText: '#1a1200',
    link: '#f5d78a',
    glowShadow: '#f0c75e',
    vapor: '#f5e6c8',
  },
};

export function getSkinPalette(id: SkinId): SkinPalette {
  return SKIN_PALETTES[id];
}
