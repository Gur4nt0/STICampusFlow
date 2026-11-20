/* ==========================================================================
   pages/slips/slip-pages.js — slip routes: in-app (#/print/…) and opened from the QR code (#/slip/…)
   ========================================================================== */
(function () {
  'use strict';
  const { esc, ico, S, frame, defineRoute, slipPage } = App;

  // In-app slip (signed in)
  defineRoute('/print/:kind/:id', async ({ kind, id }) => {
    const main = frame('Slip', { chrome: false });
    main.innerHTML = '<div class="print-page"><div class="skeleton"></div></div>';
    const [r, st] = await Promise.all([API.get('/api/requests/' + id), API.get('/api/settings')]);
    if (!r.student) r.student = { name: S.user.name, studentNo: S.user.loginId, program: S.user.program };
    slipPage(main, kind, r, st, { campusName: S.cfg.campusName, officeName: S.cfg.officeName, graceMinutes: S.cfg.graceMinutes },
      { back: App.isStaff() ? '#/r/request/' + r.id : '#/request/' + r.id });
  });

  // Slip opened by scanning the QR code — works without signing in
  defineRoute('/slip/:kind/:ref/:token', async ({ kind, ref, token }) => {
    const main = frame('Slip', { chrome: false });
    main.innerHTML = '<div class="print-page"><div class="skeleton"></div></div>';
    let d;
    try { d = await API.get(`/api/public/slip/${encodeURIComponent(ref)}?t=${encodeURIComponent(token)}`); }
    catch (e) { main.innerHTML = `<div class="print-page"><div class="note danger">${ico('alert')}<div><b>Slip not found.</b><br>${esc(e.message)}${API.demo ? '<br>In the live preview, data only exists in the browser that created it.' : ''}</div></div></div>`; return; }
    const r = d.request;
    const back = S.user ? (App.isStaff() ? '#/r/request/' + r.id : '#/request/' + r.id) : '';
    slipPage(main, kind === 'payment' ? 'payment' : 'claim', r, d.settings, d.office, { back, live: true });
  }, { open: true });
})();
