/* ==========================================================================
   pages/registrar/announcements.js — announcements on the claiming board (#/r/announcements)
   ========================================================================== */
(function () {
  'use strict';
  const { $, $$, esc, ico, ago, toast, busy, frame, defineRoute, todayStr } = App;

  /* ================================================================ announcements */
  defineRoute('/r/announcements', async () => {
    const main = frame('Announcements', { rail: true });
    const b = await API.get('/api/board');
    main.innerHTML = `<div class="page narrow stack" style="--gap:1.25rem">
      <div class="page-head" style="margin-bottom:0"><div><h1>Announcements</h1><p>Shown on the claiming board beside every student's screen.</p></div></div>
      <section class="card"><form class="stack" id="anForm">
        <div class="field"><label for="at">Title</label><input class="input" id="at" name="title" maxlength="120" placeholder="e.g. Form 137 requests take longer this week"></div>
        <div class="field"><label for="ab">Details (optional)</label><textarea class="input" id="ab" name="body" maxlength="500"></textarea></div>
        <div class="field"><label for="ae">Hide after (optional)</label><input class="input" type="date" id="ae" name="expiresOn" min="${todayStr()}"></div>
        <button class="btn btn-primary" type="submit">${ico('board')}Post announcement</button></form></section>
      <section><h2 class="section-title">Showing now</h2><div class="list">${b.announcements.length ? b.announcements.map((a) => `<div class="announce ${esc(a.kind)} row between"><div class="grow"><b>${esc(a.title)}</b>${a.body ? `<p>${esc(a.body)}</p>` : ''}<p class="tiny">${esc(ago(a.at))}</p></div><button class="btn btn-sm btn-ghost" data-del="${a.id}" aria-label="Delete">${ico('trash')}</button></div>`).join('') : '<div class="empty">No announcements.</div>'}</div></section>
    </div>`;
    const f = $('#anForm');
    f.onsubmit = (e) => { e.preventDefault(); busy(f.querySelector('button'), async () => { await API.post('/api/announcements', Object.fromEntries(new FormData(f))); toast('Posted.', 'success'); App.route(); }); };
    $$('[data-del]').forEach((x) => (x.onclick = () => busy(x, async () => { await API.del('/api/announcements/' + x.dataset.del); App.route(); })));
  }, { role: 'staff' });
})();
