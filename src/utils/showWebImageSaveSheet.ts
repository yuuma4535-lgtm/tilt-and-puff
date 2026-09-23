/**
 * In-page preview when Web Share / download are blocked after async work
 * (common on iOS Safari once the user-gesture token expires).
 */
export function showWebImageSaveSheet(
  blob: Blob,
  filename: string,
): Promise<'shared' | 'downloaded' | 'dismissed'> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);

    const overlay = document.createElement('div');
    overlay.setAttribute('data-tilt-puff-capture', '1');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '99999',
      background: 'rgba(0,0,0,0.88)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      gap: '14px',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    });

    const img = document.createElement('img');
    img.src = url;
    img.alt = filename;
    Object.assign(img.style, {
      maxWidth: '100%',
      maxHeight: '55vh',
      borderRadius: '8px',
      objectFit: 'contain',
    });

    const hint = document.createElement('p');
    hint.textContent =
      'Long-press the image to Save, or tap Share / Download below.';
    Object.assign(hint.style, {
      color: 'rgba(255,255,255,0.75)',
      fontSize: '13px',
      textAlign: 'center',
      margin: '0',
      maxWidth: '320px',
      lineHeight: '1.4',
    });

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '10px',
      justifyContent: 'center',
    });

    const mkBtn = (label: string, primary?: boolean) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      Object.assign(b.style, {
        padding: '12px 18px',
        borderRadius: '10px',
        border: primary ? 'none' : '1px solid rgba(255,255,255,0.35)',
        background: primary ? '#fff' : 'transparent',
        color: primary ? '#111' : '#fff',
        fontWeight: '700',
        fontSize: '14px',
        cursor: 'pointer',
      });
      return b;
    };

    const shareBtn = mkBtn('Share', true);
    const dlBtn = mkBtn('Download');
    const closeBtn = mkBtn('Close');

    const cleanup = (result: 'shared' | 'downloaded' | 'dismissed') => {
      overlay.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      resolve(result);
    };

    shareBtn.onclick = async () => {
      try {
        const file = new File([blob], filename, { type: 'image/jpeg' });
        if (typeof navigator.share === 'function') {
          const can =
            typeof navigator.canShare !== 'function' ||
            navigator.canShare({ files: [file] });
          if (can) {
            await navigator.share({ files: [file], title: filename });
            cleanup('shared');
            return;
          }
        }
      } catch (e) {
        const name = e instanceof Error ? e.name : '';
        if (name === 'AbortError') {
          cleanup('dismissed');
          return;
        }
        console.warn('[capture] sheet share failed', e);
      }
      // Fall through: open image for long-press
      window.open(url, '_blank');
    };

    dlBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Also open for iOS long-press
      window.open(url, '_blank');
      cleanup('downloaded');
    };

    closeBtn.onclick = () => cleanup('dismissed');

    row.appendChild(shareBtn);
    row.appendChild(dlBtn);
    row.appendChild(closeBtn);
    overlay.appendChild(img);
    overlay.appendChild(hint);
    overlay.appendChild(row);
    document.body.appendChild(overlay);
    console.log('[capture:save] showed in-page save sheet');
  });
}
