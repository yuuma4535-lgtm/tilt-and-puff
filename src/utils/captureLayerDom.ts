/** Stable DOM id for the capture layer (RN Web maps nativeID → id) */
export const CAPTURE_LAYER_DOM_ID = 'tilt-puff-capture-layer';

const MAX_EDGE = 1920;

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function resolveCaptureRoot(
  preferred?: HTMLElement | null,
): HTMLElement | null {
  if (preferred && preferred.isConnected) return preferred;
  if (typeof document === 'undefined') return null;
  return document.getElementById(CAPTURE_LAYER_DOM_ID);
}

function resolveFromViewRef(viewRef: { current: unknown }): HTMLElement | null {
  const cur = viewRef.current;
  if (!cur) return null;
  if (typeof HTMLElement !== 'undefined' && cur instanceof HTMLElement) {
    return cur;
  }
  if (typeof cur === 'object' && cur !== null) {
    const rec = cur as Record<string, unknown>;
    if (rec._nativeNode instanceof HTMLElement) return rec._nativeNode;
    if (typeof rec.getNode === 'function') {
      try {
        const n = (rec.getNode as () => unknown)();
        if (n instanceof HTMLElement) return n;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

/**
 * Snapshot a DOM subtree by compositing child canvas / video / img nodes.
 * Skia on web renders to <canvas> (WebGL); makeImageFromView is unimplemented
 * and requires a custom callback — this is that capture path.
 */
export async function snapshotDomLayerToCanvas(
  viewRef?: { current: unknown } | null,
): Promise<HTMLCanvasElement | null> {
  await waitForPaint();
  // One more frame so Skia finishes its WebGL present
  await waitForPaint();

  const fromRef = viewRef ? resolveFromViewRef(viewRef) : null;
  const root = resolveCaptureRoot(fromRef);
  console.log('[capture:dom] root', {
    fromRef: !!fromRef,
    byId: !!document.getElementById(CAPTURE_LAYER_DOM_ID),
    rootTag: root?.tagName,
    rootId: root?.id,
  });
  if (!root) return null;

  const rect = root.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    console.warn('[capture:dom] root has zero size', rect);
    return null;
  }

  const scale = Math.min(
    2,
    typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    MAX_EDGE / Math.max(rect.width, rect.height),
  );
  const outW = Math.max(1, Math.round(rect.width * scale));
  const outH = Math.max(1, Math.round(rect.height * scale));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const nodes = root.querySelectorAll('canvas, video, img');
  console.log('[capture:dom] drawable nodes', nodes.length);

  let drawn = 0;
  nodes.forEach((node) => {
    const el = node as HTMLCanvasElement | HTMLVideoElement | HTMLImageElement;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const x = r.left - rect.left;
    const y = r.top - rect.top;
    try {
      // WebGL canvases: drawImage reads the current color buffer when available
      ctx.drawImage(el, x, y, r.width, r.height);
      drawn += 1;
    } catch (e) {
      console.warn('[capture:dom] drawImage failed', el.tagName, e);
    }
  });

  console.log('[capture:dom] drawn', drawn, `${outW}x${outH}`);
  if (drawn === 0) {
    console.warn('[capture:dom] no drawables — empty snapshot');
    return null;
  }

  return out;
}

export async function canvasToJpegBase64(
  canvas: HTMLCanvasElement,
  quality = 0.9,
): Promise<string> {
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function coverCrop(
  photoW: number,
  photoH: number,
  screenW: number,
  screenH: number,
) {
  const screenAspect = screenW / Math.max(screenH, 1);
  const photoAspect = photoW / Math.max(photoH, 1);
  if (photoAspect > screenAspect) {
    const cropH = photoH;
    const cropW = photoH * screenAspect;
    return { x: (photoW - cropW) / 2, y: 0, w: cropW, h: cropH };
  }
  const cropW = photoW;
  const cropH = photoW / screenAspect;
  return { x: 0, y: (photoH - cropH) / 2, w: cropW, h: cropH };
}

/**
 * Compose camera still + device-layer DOM snapshot → JPEG base64 (no Skia).
 */
export async function composeWebCaptureJpeg(opts: {
  photoDataUrl: string | null;
  deviceLayerRef: { current: unknown } | null;
  screenW: number;
  screenH: number;
}): Promise<string | null> {
  const { photoDataUrl, deviceLayerRef, screenW, screenH } = opts;

  const deviceCanvas = await snapshotDomLayerToCanvas(deviceLayerRef);
  if (!deviceCanvas) {
    console.warn('[capture:dom] device snapshot failed');
    return null;
  }

  let bgW = Math.round(screenW * 2);
  let bgH = Math.round(screenH * 2);
  let bgImg: HTMLImageElement | null = null;

  if (photoDataUrl) {
    try {
      bgImg = await loadImageElement(photoDataUrl);
      bgW = bgImg.naturalWidth || bgW;
      bgH = bgImg.naturalHeight || bgH;
    } catch (e) {
      console.warn('[capture:dom] photo load failed', e);
    }
  }

  const scaleDown =
    Math.max(bgW, bgH) > MAX_EDGE ? MAX_EDGE / Math.max(bgW, bgH) : 1;
  const outW = Math.max(1, Math.round(bgW * scaleDown));
  const outH = Math.max(1, Math.round(bgH * scaleDown));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d');
  if (!ctx) return null;

  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, outW, outH);
  } else {
    ctx.fillStyle = '#07070b';
    ctx.fillRect(0, 0, outW, outH);
  }

  const crop = coverCrop(bgW, bgH, screenW, screenH);
  const sx = outW / bgW;
  const sy = outH / bgH;
  ctx.drawImage(
    deviceCanvas,
    crop.x * sx,
    crop.y * sy,
    crop.w * sx,
    crop.h * sy,
  );

  console.log('[capture:dom] composed', outW, outH);
  return canvasToJpegBase64(out, 0.9);
}
