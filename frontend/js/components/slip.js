/* ==========================================================================
   components/slip.js — printable payment & claim slips: HTML view, PNG download, slip page
   ========================================================================== */
(function () {
  'use strict';
  const { U, $, esc, ico, fmtDate, fmtTime, toast, busy } = App;

  /* ================================================================ printable slips (feedback item 1) */
  function signBlock(st, label = 'Approved by') {
    return `<div class="sign-box"><div class="small" style="text-align:left;color:#5b6477">${esc(label)}</div>
      <div class="sign-img">${st.signature ? `<img src="${esc(st.signature)}" alt="Signature">` : `<span class="sign-script">${esc(st.registrarName || '')}</span>`}</div>
      <div class="sign-line">${esc((st.registrarName || '').toUpperCase())}</div><div class="sign-title">${esc(st.registrarTitle || 'Registrar')}</div></div>`;
  }
  App.signBlock = signBlock;

  // One function builds the slip for both the in-app view and the page opened by scanning the QR.
  function slipHtml(kind, r, st, office) {
    const payment = kind === 'payment';
    const url = App.slipUrl(kind, r);
    const head = `<div class="slip-head"><span class="brand-mark">CF</span><div><b>${esc(office.campusName)}</b><span>${esc(office.officeName)}</span></div><div class="slip-kind">${payment ? 'Payment slip' : 'Claim slip'}<br><span style="color:#fff;font-size:.9rem">${esc(r.ref)}</span></div></div>`;
    const student = `<dl class="slip-grid"><div><dt>Student</dt><dd>${esc(r.student.name)}</dd></div><div><dt>Student number</dt><dd>${esc(r.student.studentNo)}</dd></div>
      <div><dt>Program</dt><dd>${esc(r.student.program || '—')}</dd></div><div><dt>Date issued</dt><dd>${esc(fmtDate(r.createdAt.slice(0, 10)))}</dd></div></dl>`;
    const table = `<table><thead><tr><th class="hide-sm">Code</th><th>Document</th><th class="r">Copies</th><th class="r hide-sm">Unit fee</th><th class="r">Amount</th></tr></thead>
      <tbody>${r.items.map((i) => `<tr><td class="hide-sm">${esc(i.code)}</td><td>${esc(i.name)}</td><td class="r">${i.copies}</td><td class="r hide-sm">${i.unitFee > 0 ? U.peso(i.unitFee) : 'Free'}</td><td class="r">${U.peso(i.unitFee * i.copies)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td class="hide-sm"></td><td colspan="2">Total</td><td class="hide-sm"></td><td class="r">${U.peso(r.totalFee)}</td></tr></tfoot></table>`;
    const qr = `<div class="qr-box">${App.qrSvg(url, 132)}<div><b>Scan to open this slip</b><span>Opens a live copy you can save on your phone. The Registrar can scan it at the window.</span><span class="ref">${esc(r.ref)}</span></div></div>`;
    if (payment) return `${head}<div class="slip-body">${student}${table}
      <ol class="slip-rules"><li>Present this slip at the <b>Cashier's Office</b> and pay the total amount above.</li><li>Keep the official receipt (OR). Upload a photo of it on CampusFlow, or show it at the Registrar.</li><li>The Registrar prepares your documents once the payment is confirmed.</li></ol>
      <div class="sign">${qr}${signBlock(st, 'Order of payment issued by')}</div></div>`;
    return `${head}<div class="slip-body">
      <div class="slip-when"><div><div class="small" style="color:#5b6477;font-weight:700">Claim on</div><div class="big">${esc(fmtDate(r.date))}</div><div style="font-weight:700">${fmtTime(r.slotStart)} to ${fmtTime(r.slotEnd)}</div></div>
        <div class="small">Please be at the Registrar's window on time. You have a ${office.graceMinutes}-minute allowance. Bring this slip and your school ID${r.totalFee > 0 ? ', plus your official receipt' : ''}.</div></div>
      ${student}${table}
      <dl class="slip-grid"><div><dt>Status</dt><dd>${esc(r.statusLabel)}</dd></div><div><dt>Payment</dt><dd>${esc(r.payment.label)}${r.payment.orNumber ? ' (OR ' + esc(r.payment.orNumber) + ')' : ''}</dd></div></dl>
      <hr class="perf">
      <div class="sign">${qr}${signBlock(st, 'Released under the authority of')}</div>
      <div class="sign" style="justify-content:flex-start"><div class="sign-box"><div class="sign-img"></div><div class="sign-line">Student's signature over printed name</div><div class="sign-title">Received the documents above</div></div></div></div>`;
  }

  /* ---- "Download as image": draws the slip onto a canvas and saves a PNG (works on phones) */
  function loadImg(src) { return new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
  async function slipPng(kind, r, st, office) {
    const W = 1080, P = 56, payment = kind === 'payment';
    const cv = document.createElement('canvas'); const x = cv.getContext('2d');
    const F = (w, s) => `${w} ${s}px "Atkinson Hyperlegible Next", "Segoe UI", Arial, sans-serif`;
    const H = (s) => `800 ${s}px "Bricolage Grotesque", "Segoe UI", Arial, sans-serif`;
    const wrap = (text, maxW, font) => { x.font = font; const words = String(text).split(' '); const lines = []; let line = '';
      for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); return lines; };
    const rules = payment
      ? ['1. Present this slip at the Cashier\'s Office and pay the total amount.', '2. Keep the official receipt (OR) and upload a photo of it on CampusFlow.', '3. The Registrar prepares your documents once payment is confirmed.']
      : [`Be at the Registrar's window on time (${office.graceMinutes}-minute allowance). Bring this slip and your school ID${r.totalFee > 0 ? ', plus your official receipt' : ''}.`];
    const ruleLines = rules.flatMap((t) => wrap(t, W - P * 2, F(400, 24)));
    cv.width = W; cv.height = 150 + (payment ? 0 : 170) + 190 + 60 + r.items.length * 50 + 70 + ruleLines.length * 34 + 40 + 330 + 40;
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, cv.height);
    // header
    x.fillStyle = '#0E2A55'; x.fillRect(0, 0, W, 130);
    x.fillStyle = '#FFD21F'; x.beginPath(); x.roundRect ? x.roundRect(P, 33, 64, 64, 14) : x.rect(P, 33, 64, 64); x.fill();
    x.fillStyle = '#0E2A55'; x.font = H(28); x.textAlign = 'center'; x.fillText('CF', P + 32, 76);
    x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = H(30); x.fillText(office.campusName, P + 84, 62);
    x.fillStyle = '#C4D2EA'; x.font = F(400, 22); x.fillText(office.officeName, P + 84, 94);
    x.textAlign = 'right'; x.fillStyle = '#FFD21F'; x.font = H(28); x.fillText(payment ? 'Payment slip' : 'Claim slip', W - P, 62);
    x.fillStyle = '#fff'; x.font = F(700, 24); x.fillText(r.ref, W - P, 94); x.textAlign = 'left';
    let y = 150;
    if (!payment) {
      x.fillStyle = '#FFF6CC'; x.strokeStyle = '#C9A400'; x.setLineDash([8, 6]); x.lineWidth = 2;
      x.fillRect(P, y, W - P * 2, 150); x.strokeRect(P, y, W - P * 2, 150); x.setLineDash([]);
      x.fillStyle = '#5b6477'; x.font = F(700, 22); x.fillText('Claim on', P + 28, y + 42);
      x.fillStyle = '#111'; x.font = H(46); x.fillText(fmtDate(r.date), P + 28, y + 96);
      x.font = F(700, 28); x.fillText(`${fmtTime(r.slotStart)} to ${fmtTime(r.slotEnd)}`, P + 28, y + 132);
      y += 170;
    }
    const field = (label, val, fx, fy) => { x.fillStyle = '#5b6477'; x.font = F(700, 20); x.fillText(label, fx, fy); x.fillStyle = '#111'; x.font = F(700, 26); x.fillText(val, fx, fy + 34); };
    const half = P + (W - P * 2) / 2;
    field('Student', r.student.name, P, y + 20); field('Student number', r.student.studentNo, half, y + 20);
    field('Program', r.student.program || '—', P, y + 100); field(payment ? 'Date issued' : 'Status', payment ? fmtDate(r.createdAt.slice(0, 10)) : r.statusLabel, half, y + 100);
    y += 190;
    // table
    x.fillStyle = '#5b6477'; x.font = F(700, 20); x.fillText('Document', P, y); x.textAlign = 'right'; x.fillText('Copies', W - P - 200, y); x.fillText('Amount', W - P, y); x.textAlign = 'left';
    x.fillStyle = '#e0e5ee'; x.fillRect(P, y + 16, W - P * 2, 2); y += 60;
    for (const i of r.items) {
      x.fillStyle = '#111'; x.font = F(400, 24); x.fillText(`${i.code}  ${i.name}`, P, y);
      x.textAlign = 'right'; x.fillText(String(i.copies), W - P - 200, y); x.fillText(U.peso(i.unitFee * i.copies), W - P, y); x.textAlign = 'left';
      x.fillStyle = '#e0e5ee'; x.fillRect(P, y + 18, W - P * 2, 1); y += 50;
    }
    x.fillStyle = '#111'; x.font = H(30); x.fillText('Total', P, y + 14); x.textAlign = 'right'; x.fillText(U.peso(r.totalFee), W - P, y + 14); x.textAlign = 'left';
    y += 70;
    x.fillStyle = '#3b4456'; x.font = F(400, 24);
    for (const l of ruleLines) { x.fillText(l, P, y); y += 34; }
    y += 40;
    // QR + signature
    const m = QRCodeLib.matrix(App.slipUrl(kind, r), 'M'); const cell = Math.floor(260 / (m.length + 8)); const qs = cell * (m.length + 8);
    x.fillStyle = '#fff'; x.fillRect(P, y, qs, qs); x.fillStyle = '#000';
    m.forEach((row, ri) => row.forEach((on, ci) => { if (on) x.fillRect(P + (ci + 4) * cell, y + (ri + 4) * cell, cell, cell); }));
    x.font = F(700, 20); x.fillText(r.ref, P + 20, y + qs + 26);
    const sx = W - P - 360, sy = y + 40;
    x.fillStyle = '#5b6477'; x.font = F(400, 20); x.fillText(payment ? 'Order of payment issued by' : 'Released under the authority of', sx, sy);
    const sig = await loadImg(st.signature);
    if (sig) x.drawImage(sig, sx + 20, sy + 20, 320, 92);
    else { x.fillStyle = '#1a3a8a'; x.font = '600 52px Caveat, "Segoe Script", cursive'; x.textAlign = 'center'; x.fillText(st.registrarName || '', sx + 180, sy + 100); x.textAlign = 'left'; }
    x.fillStyle = '#111'; x.fillRect(sx, sy + 122, 360, 2);
    x.textAlign = 'center'; x.font = F(700, 24); x.fillText((st.registrarName || '').toUpperCase(), sx + 180, sy + 156);
    x.fillStyle = '#5b6477'; x.font = F(400, 20); x.fillText(st.registrarTitle || 'Registrar', sx + 180, sy + 184); x.textAlign = 'left';
    return cv.toDataURL('image/png');
  }
  async function downloadSlip(kind, r, st, office, btn) {
    await busy(btn, async () => {
      try { if (document.fonts) await document.fonts.ready; } catch (e) { /* ignore */ }
      const png = await slipPng(kind, r, st, office);
      const a = document.createElement('a');
      a.href = png; a.download = `${r.ref}-${kind === 'payment' ? 'payment-slip' : 'claim-slip'}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      toast('Slip saved as an image. Check your Downloads or Photos.', 'success');
    });
  }

  function slipPage(main, kind, r, st, office, { back, live }) {
    const payment = kind === 'payment';
    main.innerHTML = `<div class="print-page"><div class="print-actions">${back ? `<a class="btn" href="${back}">${ico('back')}Back</a>` : '<span></span>'}
      <div class="row">${payment || r.totalFee === 0 ? '' : `<a class="btn" href="${live ? App.slipUrl('payment', r).replace(/^.*#/, '#') : '#/print/payment/' + r.id}">Payment slip</a>`}
        <button class="btn" id="dlSlip">${ico('download')}Download as image</button>
        <button class="btn btn-primary" onclick="window.print()">${ico('printer')}Print or save as PDF</button></div></div>
      ${live ? `<div class="note ${['released', 'cancelled', 'rejected', 'noshow'].includes(r.status) ? 'warn' : 'success'} no-print" style="margin-bottom:1rem">${ico('check')}<div><b>Genuine CampusFlow slip.</b> Current status: ${esc(r.statusLabel)}${r.totalFee > 0 ? `, payment: ${esc(r.payment.label)}` : ''}.</div></div>` : ''}
      ${payment && r.totalFee === 0 ? `<div class="note info">${ico('info')}<div>This request is free — no payment slip is needed.</div></div>` : `<article class="slip">${slipHtml(kind, r, st, office)}</article>`}
      <p class="small muted no-print" style="margin-top:1rem;text-align:center">On a phone, tap <b>Download as image</b> to keep it in your photos, or scan the QR code from another device.</p></div>`;
    const dl = $('#dlSlip'); if (dl) dl.onclick = () => downloadSlip(kind, r, st, office, dl);
  }

  Object.assign(App, { slipHtml, slipPage, downloadSlip });
})();
