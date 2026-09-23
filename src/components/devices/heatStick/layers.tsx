import {
  Blur,
  Group,
  LinearGradient,
  RoundedRect,
  Rect,
  Oval,
  vec,
} from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import type { HeatStickGeom } from './geometry';
import { SKIN_PALETTES } from '../../../theme/palette';

const P = SKIN_PALETTES.heatStick;

export function DropShadow({ g }: { g: HeatStickGeom }) {
  const cx = g.canvasW / 2;
  const cy = g.canvasH - g.baseH * 0.1;
  return (
    <Group>
      <Oval
        x={cx - g.bodyW * 0.75}
        y={cy - g.bodyW * 0.12}
        width={g.bodyW * 1.5}
        height={g.bodyW * 0.28}
        color="rgba(0,0,0,0.6)"
      >
        <Blur blur={12} />
      </Oval>
    </Group>
  );
}

export function OuterGlow({ g }: { g: HeatStickGeom }) {
  return (
    <RoundedRect
      x={g.bodyX - 6}
      y={g.holderTop - 4}
      width={g.bodyW + 12}
      height={g.holderH + 10}
      r={g.holderRx + 4}
      color={P.neon}
      opacity={0.28}
    >
      <Blur blur={12} />
    </RoundedRect>
  );
}

/**
 * Inserted heat stick — paper/filter tip protruding, shaft sinks into holder.
 * Drawn under the holder so only the tip + collar gap read as “inserted”.
 */
export function InsertedStick({ g }: { g: HeatStickGeom }) {
  const { stickX: x, stickTop: y, stickW: w, stickDrawH: h, filterH } = g;
  const r = w * 0.45;

  return (
    <Group>
      {/* Soft glow at tip when heating (subtle) */}
      <Oval
        x={x - 4}
        y={y - 2}
        width={w + 8}
        height={filterH + 6}
        color={P.neonSoft}
        opacity={0.5}
      >
        <Blur blur={6} />
      </Oval>

      {/* Paper shaft */}
      <RoundedRect x={x} y={y} width={w} height={h} r={r}>
        <LinearGradient
          start={vec(x, y)}
          end={vec(x + w, y)}
          colors={['#c4b49a', '#efe6d4', '#f7f1e6', '#d4c4a8', '#8a7a62']}
          positions={[0, 0.22, 0.45, 0.72, 1]}
        />
      </RoundedRect>

      {/* Paper fiber lines */}
      <Rect
        x={x + w * 0.32}
        y={y + filterH}
        width={1}
        height={h - filterH - 4}
        color="rgba(0,0,0,0.08)"
      />
      <Rect
        x={x + w * 0.58}
        y={y + filterH + 2}
        width={1}
        height={h - filterH - 8}
        color="rgba(0,0,0,0.06)"
      />

      {/* Filter tip (lighter, distinct material) */}
      <RoundedRect x={x} y={y} width={w} height={filterH} r={r}>
        <LinearGradient
          start={vec(x, y)}
          end={vec(x + w, y)}
          colors={['#e8d9b8', '#fff8ea', '#f0e4c8', '#c9b892']}
          positions={[0, 0.35, 0.7, 1]}
        />
      </RoundedRect>
      {/* Filter end seam */}
      <Rect
        x={x}
        y={y + filterH - 1}
        width={w}
        height={1.2}
        color="rgba(0,0,0,0.18)"
      />

      {/* Top face of filter (flat cut) */}
      <Oval
        x={x + w * 0.12}
        y={y + 1}
        width={w * 0.76}
        height={w * 0.28}
        color="#d8cba8"
      />
      <Oval
        x={x + w * 0.28}
        y={y + 2}
        width={w * 0.44}
        height={w * 0.16}
        color="#2a2418"
        opacity={0.85}
      />
    </Group>
  );
}

/** Metal collar around stick entry — emphasizes two-part assembly */
export function StickCollar({ g }: { g: HeatStickGeom }) {
  const w = g.bodyW * 0.92;
  const x = g.bodyX + (g.bodyW - w) / 2;
  const y = g.holderTop - g.collarH * 0.35;
  const h = g.collarH;

  return (
    <Group>
      <RoundedRect x={x} y={y} width={w} height={h} r={h * 0.4}>
        <LinearGradient
          start={vec(x, y)}
          end={vec(x + w, y)}
          colors={['#1a1e24', '#6a7380', '#c5ccd6', '#7a8490', '#252a32']}
          positions={[0, 0.25, 0.48, 0.75, 1]}
        />
      </RoundedRect>
      {/* Inner well shadow around stick */}
      <Oval
        x={g.stickX - 3}
        y={y + h * 0.15}
        width={g.stickW + 6}
        height={h * 0.7}
        color="rgba(0,0,0,0.55)"
      >
        <Blur blur={2} />
      </Oval>
      {/* Spec on collar */}
      <Rect
        x={x + w * 0.2}
        y={y + 1}
        width={w * 0.15}
        height={h * 0.35}
        color="#ffffff"
        opacity={0.25}
      >
        <Blur blur={1} />
      </Rect>
    </Group>
  );
}

/** Matte metal / ceramic holder body */
export function HolderBody({ g }: { g: HeatStickGeom }) {
  const { bodyX: x, holderTop: y, bodyW: w, holderH: h, holderRx: r } = g;

  return (
    <Group>
      {/* Base matte cylinder — lower contrast than chrome */}
      <RoundedRect x={x} y={y} width={w} height={h} r={r}>
        <LinearGradient
          start={vec(x, y)}
          end={vec(x + w, y)}
          colors={[
            '#1c2026',
            '#4a5360',
            '#8a939f',
            '#5c6570',
            '#3a424c',
            '#181c22',
          ]}
          positions={[0, 0.2, 0.4, 0.58, 0.8, 1]}
        />
      </RoundedRect>

      {/* Matte ceramic wash — kills mirror look */}
      <RoundedRect
        x={x}
        y={y}
        width={w}
        height={h}
        r={r}
        color="rgba(20,24,30,0.22)"
      />

      {/* Soft side volume (not chrome specular) */}
      <RoundedRect
        x={x + w * 0.1}
        y={y + h * 0.04}
        width={w * 0.42}
        height={h * 0.9}
        r={r * 0.6}
        opacity={0.28}
      >
        <LinearGradient
          start={vec(x, y)}
          end={vec(x + w, y)}
          colors={['transparent', '#b8c4d0', 'transparent']}
          positions={[0.1, 0.4, 0.75]}
        />
      </RoundedRect>

      {/* Soft end shading — keep tight so it doesn’t bloom into stage haze */}
      <RoundedRect x={x} y={y} width={w} height={h} r={r} opacity={0.4}>
        <LinearGradient
          start={vec(x, y)}
          end={vec(x, y + h)}
          colors={[
            'rgba(0,0,0,0.28)',
            'transparent',
            'transparent',
            'rgba(0,0,0,0.22)',
            'rgba(0,0,0,0.38)',
          ]}
          positions={[0, 0.1, 0.5, 0.88, 1]}
        />
      </RoundedRect>
    </Group>
  );
}

export function AmbientOcclusion({ g }: { g: HeatStickGeom }) {
  const { bodyX: x, bodyW: w, holderTop: y, holderH: h } = g;
  return (
    <Group>
      <Rect x={x} y={y} width={w} height={h * 0.04} color="rgba(0,0,0,0.28)">
        <Blur blur={1.5} />
      </Rect>
      <Rect
        x={x}
        y={y + h * 0.94}
        width={w}
        height={h * 0.05}
        color="rgba(0,0,0,0.32)"
      >
        <Blur blur={1.5} />
      </Rect>
    </Group>
  );
}

export function SpecularHighlight({ g }: { g: HeatStickGeom }) {
  const { specX, holderTop: y, specW, holderH: h, holderRx } = g;
  return (
    <Group>
      <RoundedRect
        x={specX}
        y={y + h * 0.08}
        width={specW}
        height={h * 0.72}
        r={holderRx * 0.2}
        opacity={0.45}
      >
        <LinearGradient
          start={vec(specX, y)}
          end={vec(specX + specW, y)}
          colors={['transparent', '#dce4ee', 'transparent']}
          positions={[0, 0.5, 1]}
        />
      </RoundedRect>
      <RoundedRect
        x={specX + specW * 0.38}
        y={y + h * 0.15}
        width={specW * 0.18}
        height={h * 0.4}
        r={1}
        color="#ffffff"
        opacity={0.35}
      >
        <Blur blur={1.5} />
      </RoundedRect>
    </Group>
  );
}

export function RimLight({ g }: { g: HeatStickGeom }) {
  const x = g.bodyX + g.bodyW * 0.88;
  return (
    <RoundedRect
      x={x}
      y={g.holderTop + g.holderH * 0.1}
      width={g.bodyW * 0.06}
      height={g.holderH * 0.7}
      r={2}
      opacity={0.32}
    >
      <LinearGradient
        start={vec(x, 0)}
        end={vec(x + g.bodyW * 0.06, 0)}
        colors={['transparent', '#c8d0da']}
      />
    </RoundedRect>
  );
}

export function SegmentRings({ g }: { g: HeatStickGeom }) {
  const { bodyX: x, bodyW: w, holderTop: y, holderH: h } = g;
  return (
    <Group>
      {[0.28, 0.62].map((t) => (
        <Group key={t}>
          <Rect
            x={x}
            y={y + h * t}
            width={w}
            height={1.4}
            color="rgba(0,0,0,0.4)"
          />
          <Rect
            x={x}
            y={y + h * t + 1.4}
            width={w}
            height={0.6}
            color="rgba(255,255,255,0.12)"
          />
        </Group>
      ))}
    </Group>
  );
}

export function BaseCap({ g }: { g: HeatStickGeom }) {
  const w = g.bodyW * 0.94;
  const x = g.bodyX + (g.bodyW - w) / 2;
  const y = g.canvasH - g.baseH;
  const h = g.baseH;

  return (
    <Group>
      <RoundedRect x={x} y={y} width={w} height={h} r={h * 0.35}>
        <LinearGradient
          start={vec(x, y)}
          end={vec(x + w, y)}
          colors={['#101418', '#3a424c', '#6a7380', '#2a3038', '#0a0c10']}
          positions={[0, 0.3, 0.5, 0.8, 1]}
        />
      </RoundedRect>
      <Rect x={x} y={y} width={w} height={h * 0.3} color="rgba(0,0,0,0.45)">
        <Blur blur={2} />
      </Rect>
    </Group>
  );
}

type LedProps = {
  g: HeatStickGeom;
  intensity: SharedValue<number>;
};

type GlowProps = {
  g: HeatStickGeom;
  /** 0–1 puff progress or idle intensity */
  progress: SharedValue<number>;
  active: SharedValue<number>;
};

/**
 * Soft liquid glow that fills from the base upward during a puff,
 * with a pulsed band (not a hard LED strip).
 */
export function LiquidRiseGlow({ g, progress, active }: GlowProps) {
  const bandH = useDerivedValue(() => {
    const p = Math.max(0, Math.min(1, progress.value));
    const pulse = 0.82 + 0.18 * Math.sin(p * Math.PI * 5);
    const on = active.value;
    return Math.max(2, g.holderH * 0.88 * p * pulse * (0.25 + 0.75 * on));
  });

  const bandY = useDerivedValue(() => {
    return g.holderTop + g.holderH * 0.96 - bandH.value;
  });

  const bloomOp = useDerivedValue(() => {
    return (0.2 + progress.value * 0.75) * (0.35 + 0.65 * active.value);
  });

  return (
    <Group>
      <RoundedRect
        x={g.bodyX - 10}
        y={bandY}
        width={g.bodyW + 20}
        height={bandH}
        r={g.holderRx}
        color={P.neon}
        opacity={bloomOp}
      >
        <Blur blur={22} />
      </RoundedRect>
      <RoundedRect
        x={g.bodyX + g.bodyW * 0.12}
        y={bandY}
        width={g.bodyW * 0.76}
        height={bandH}
        r={g.holderRx * 0.6}
      >
        <LinearGradient
          start={vec(g.bodyX, g.holderTop + g.holderH)}
          end={vec(g.bodyX, g.holderTop)}
          colors={['transparent', P.neon, P.tipHot, 'transparent']}
          positions={[0, 0.35, 0.7, 1]}
        />
      </RoundedRect>
      <RoundedRect
        x={g.bodyX + g.bodyW * 0.12}
        y={bandY}
        width={g.bodyW * 0.76}
        height={bandH}
        r={g.holderRx * 0.6}
        opacity={0.55}
      >
        <Blur blur={8} />
        <LinearGradient
          start={vec(g.bodyX, g.holderTop + g.holderH)}
          end={vec(g.bodyX, g.holderTop)}
          colors={[P.tipCool, P.neon, P.tipHot]}
        />
      </RoundedRect>
    </Group>
  );
}

export function LedRail({ g, intensity }: LedProps) {
  // Deprecated as gauge — kept unused; window is the sole level indicator.
  return <Group />;
}

/**
 * Glass status window = remaining gauge.
 * Fill rises from the bottom; 100% = full cyan, 0% = dark / off.
 */
export function StatusWindow({
  g,
  gaugeSV,
  puffingSV,
}: {
  g: HeatStickGeom;
  gaugeSV: SharedValue<number>;
  /** 0–1: stronger window bloom while inhaling (internal heat) */
  puffingSV?: SharedValue<number>;
}) {
  const x = g.bodyX + (g.bodyW - g.windowW) / 2;
  const y = g.windowY;
  const w = g.windowW;
  const h = g.windowH;
  const inset = 2.2;
  const idlePuff = useSharedValue(0);
  const puff = puffingSV ?? idlePuff;

  const level = useDerivedValue(() => {
    return Math.max(0, Math.min(1, gaugeSV.value / 100));
  });

  const fillH = useDerivedValue(() => {
    const innerH = h - inset * 2;
    return Math.max(0, innerH * level.value);
  });

  const fillY = useDerivedValue(() => {
    return y + h - inset - fillH.value;
  });

  const liquidOp = useDerivedValue(() => {
    const L = level.value;
    if (L <= 0.001) return 0;
    const boost = 1 + puff.value * 0.35;
    return Math.min(1, (0.55 + L * 0.45) * boost);
  });

  const glowOp = useDerivedValue(() => {
    const base = level.value * 0.55;
    // Quiet inhale cue: window blooms harder while puffing
    return Math.min(1, base + puff.value * 0.55 * Math.max(0.15, level.value));
  });

  const heatHaloOp = useDerivedValue(() => {
    return puff.value * 0.42 * Math.max(0.1, level.value);
  });

  return (
    <Group>
      {/* Outer metal bezel */}
      <RoundedRect x={x - 1.5} y={y - 1.5} width={w + 3} height={h + 3} r={4}>
        <LinearGradient
          start={vec(x, y)}
          end={vec(x + w, y + h)}
          colors={['#6a7380', '#2a3038', '#9aa3b0', '#1a1e24']}
          positions={[0, 0.35, 0.7, 1]}
        />
      </RoundedRect>

      {/* Inner well (off / empty look) */}
      <RoundedRect
        x={x}
        y={y}
        width={w}
        height={h}
        r={3}
        color="#05080c"
      />
      {/* Recessed AO */}
      <RoundedRect
        x={x + 0.5}
        y={y + 0.5}
        width={w - 1}
        height={h * 0.35}
        r={2}
        color="rgba(0,0,0,0.55)"
      >
        <Blur blur={2} />
      </RoundedRect>

      {/* Inhale heat halo around the window */}
      <RoundedRect
        x={x - 6}
        y={y - 6}
        width={w + 12}
        height={h + 12}
        r={6}
        color={P.neon}
        opacity={heatHaloOp}
      >
        <Blur blur={10} />
      </RoundedRect>

      {/* Soft cyan bloom behind liquid */}
      <RoundedRect
        x={x - 2}
        y={fillY}
        width={w + 4}
        height={fillH}
        r={3}
        color={P.neon}
        opacity={glowOp}
      >
        <Blur blur={6} />
      </RoundedRect>

      {/* Liquid fill (bottom → top) */}
      <RoundedRect
        x={x + inset}
        y={fillY}
        width={w - inset * 2}
        height={fillH}
        r={2}
        opacity={liquidOp}
      >
        <LinearGradient
          start={vec(x, y + h)}
          end={vec(x, y)}
          colors={[P.tipCool, P.neon, P.tipHot]}
          positions={[0, 0.45, 1]}
        />
      </RoundedRect>

      {/* Meniscus / surface line on liquid top */}
      <RoundedRect
        x={x + inset + 0.5}
        y={fillY}
        width={w - inset * 2 - 1}
        height={1.4}
        r={0.5}
        color="#e8fbff"
        opacity={liquidOp}
      />

      {/* Glass rim */}
      <RoundedRect
        x={x + 0.6}
        y={y + 0.6}
        width={w - 1.2}
        height={h - 1.2}
        r={2.4}
        color="rgba(255,255,255,0.22)"
        style="stroke"
        strokeWidth={0.7}
      />

      {/* Specular glass reflection (top-left) */}
      <RoundedRect
        x={x + 2}
        y={y + 2}
        width={w * 0.38}
        height={h * 0.28}
        r={1.5}
        color="#ffffff"
        opacity={0.22}
      >
        <Blur blur={1.2} />
      </RoundedRect>
      {/* Secondary thin glint */}
      <RoundedRect
        x={x + w * 0.55}
        y={y + 3}
        width={1.2}
        height={h * 0.4}
        r={0.6}
        color="#ffffff"
        opacity={0.12}
      />
    </Group>
  );
}
