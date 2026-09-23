/** Two-part heat device: holder body + inserted heat stick (fictional). */
export type HeatStickGeom = {
  canvasW: number;
  canvasH: number;

  /** Holder (charger/device) */
  bodyW: number;
  bodyX: number;
  holderTop: number;
  holderH: number;
  holderRx: number;
  baseH: number;

  /** Inserted stick (paper/filter) — tip protrudes above holder */
  stickW: number;
  stickX: number;
  stickTop: number;
  /** Visible protruding length above holder collar */
  stickProtrudeH: number;
  /** Total stick draw height (protrusion + sunk into holder) */
  stickDrawH: number;
  filterH: number;

  collarH: number;

  specX: number;
  specW: number;
  ledX: number;
  ledW: number;
  windowW: number;
  windowH: number;
  windowY: number;
};

export function buildHeatStickGeom(height: number): HeatStickGeom {
  const bodyW = Math.round(height * 0.175);
  const padX = Math.round(bodyW * 0.9);
  const canvasW = bodyW + padX * 2;
  const canvasH = height;
  const bodyX = (canvasW - bodyW) / 2;

  // Tip of stick slightly above holder — like a real inserted heat stick
  const stickProtrudeH = height * 0.09;
  const filterH = stickProtrudeH * 0.55;
  const stickTop = height * 0.02;
  const collarH = height * 0.028;
  const holderTop = stickTop + stickProtrudeH;
  const baseH = height * 0.05;
  const holderH = canvasH - holderTop - baseH * 0.4;
  const holderRx = bodyW * 0.38;

  const stickW = bodyW * 0.42;
  const stickX = bodyX + (bodyW - stickW) / 2;
  // Stick continues into holder so insertion reads clearly
  const stickDrawH = stickProtrudeH + holderH * 0.22;

  return {
    canvasW,
    canvasH,
    bodyW,
    bodyX,
    holderTop,
    holderH,
    holderRx,
    baseH,
    stickW,
    stickX,
    stickTop,
    stickProtrudeH,
    stickDrawH,
    filterH,
    collarH,
    specX: bodyX + bodyW * 0.16,
    specW: bodyW * 0.13,
    ledX: bodyX + bodyW * 0.78,
    ledW: Math.max(2.2, bodyW * 0.05),
    windowW: bodyW * 0.34,
    windowH: bodyW * 0.72,
    windowY: holderTop + holderH * 0.32,
  };
}
