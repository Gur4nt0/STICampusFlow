/* ==========================================================================
   core/media.js — Code 39 barcode, QR code SVG, slip links, photo compression
   ========================================================================== */
(function () {
  'use strict';
  const { esc, S } = App;

  /* ---------- Code 39 barcode for slips */
  const C39 = { '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
    A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn',
    N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn', U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '*': 'nwnnwnwnn' };
  function barcode(text) {
    const s = '*' + String(text).toUpperCase().replace(/[^0-9A-Z-]/g, '') + '*';
    let x = 0; const bars = [];
    for (const ch of s) {
      const p = C39[ch]; if (!p) continue;
      for (let i = 0; i < 9; i++) { const w = p[i] === 'w' ? 3 : 1; if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="50"/>`); x += w; }
      x += 1;
    }
    return `<div class="barcode"><svg viewBox="0 0 ${x} 50" preserveAspectRatio="none" role="img" aria-label="Barcode ${esc(text)}"><g fill="#000">${bars.join('')}</g></svg><div>${esc(text)}</div></div>`;
  }

  /* ---------- QR code for slips (scan to open / download the slip) */
  function qrSvg(text, px = 150) {
    const m = QRCodeLib.matrix(text, 'M');
    const n = m.length, q = 4, size = n + q * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += `M${c + q} ${r + q}h1v1h-1z`;
    return `<svg class="qr" viewBox="0 0 ${size} ${size}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  function slipUrl(kind, r) {
    const base = (S.cfg && S.cfg.publicUrl) ? S.cfg.publicUrl.replace(/\/+$/, '') + '/' : location.href.split('#')[0];
    return `${base}#/slip/${kind}/${r.ref}/${r.slipToken}`;
  }

  /* ---------- image compression for receipt photos (phones take huge photos) */
  function compressImage(file, max = 1400) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('Choose a photo (JPG or PNG).'));
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => reject(new Error('That photo could not be opened.'));
        img.src = r.result;
      };
      r.onerror = () => reject(new Error('That photo could not be read.'));
      r.readAsDataURL(file);
    });
  }

  Object.assign(App, { barcode, qrSvg, slipUrl, compressImage });
})();
