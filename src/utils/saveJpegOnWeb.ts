import { showWebImageSaveSheet } from './showWebImageSaveSheet';

/**
 * Save a JPEG on web. iOS Safari ignores <a download> + data: URIs after async
 * work — prefer Web Share API, then Blob download, then an in-page save sheet.
 */
export type WebSaveResult =
  | 'shared'
  | 'downloaded'
  | 'opened'
  | 'cancelled'
  | 'sheet';

function isIosWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  if (
    /Macintosh/i.test(ua) &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function saveJpegOnWeb(
  b64: string,
  filename: string,
): Promise<WebSaveResult> {
  console.log('[capture:save] start', {
    b64Len: b64.length,
    filename,
    ios: isIosWeb(),
    hasShare:
      typeof navigator !== 'undefined' && typeof navigator.share === 'function',
  });

  const blob = base64ToBlob(b64, 'image/jpeg');
  const file = new File([blob], filename, { type: 'image/jpeg' });
  console.log('[capture:save] blob', blob.size, 'bytes');

  // 1) Web Share API — best on iOS when user-gesture is still valid
  if (typeof navigator.share === 'function') {
    try {
      const can =
        typeof navigator.canShare !== 'function' ||
        navigator.canShare({ files: [file] });
      console.log('[capture:save] try navigator.share', { can });
      if (can) {
        await navigator.share({
          files: [file],
          title: filename,
        });
        console.log('[capture:save] share ok');
        return 'shared';
      }
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'AbortError') {
        console.log('[capture:save] share cancelled by user');
        return 'cancelled';
      }
      console.warn('[capture:save] share failed, falling back', e);
    }
  }

  const url = URL.createObjectURL(blob);
  console.log('[capture:save] object URL created');

  try {
    // 2) Programmatic download (desktop / Android)
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    console.log('[capture:save] <a download> clicked');

    if (isIosWeb()) {
      // 3) In-page sheet — fresh tap restores user gesture for Share / long-press
      URL.revokeObjectURL(url);
      const sheet = await showWebImageSaveSheet(blob, filename);
      console.log('[capture:save] sheet result', sheet);
      if (sheet === 'dismissed') return 'cancelled';
      return sheet === 'shared' ? 'shared' : 'sheet';
    }

    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return 'downloaded';
  } catch (e) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
    console.error('[capture:save] failed', e);
    const sheet = await showWebImageSaveSheet(blob, filename);
    if (sheet === 'dismissed') throw e;
    return sheet === 'shared' ? 'shared' : 'sheet';
  }
}
