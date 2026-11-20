/* ==========================================================================
   pages/student/my-requests.js — My requests list (#/requests)
   ========================================================================== */
(function () {
  'use strict';
  const { U, $, $$, ico, frame, go, defineRoute } = App;

  /* ================================================================ my requests */
  defineRoute('/requests', async (p, q) => {
    const main = frame('My requests', { rail: true });
    const tab = q.tab === 'past' ? 'past' : 'open';
    main.innerHTML = `<div class="page narrow"><div class="page-head"><div><h1>My requests</h1><p>Open requests first. Tap one to see details, pay, or change the time.</p></div><a class="btn btn-primary" href="#/new">${ico('plus')}New request</a></div>
      <div class="tabs" role="tablist"><button class="${tab === 'open' ? 'on' : ''}" data-tab="open">Open</button><button class="${tab === 'past' ? 'on' : ''}" data-tab="past">Finished</button></div>
      <div id="reqList"><div class="skeleton"></div></div></div>`;
    $$('[data-tab]').forEach((b) => (b.onclick = () => go('/requests?tab=' + b.dataset.tab)));
    const all = await API.get('/api/requests?limit=100&sort=created');
    const rows = all.rows.filter((r) => (tab === 'open' ? U.OPEN.includes(r.status) : !U.OPEN.includes(r.status)));
    if (tab === 'open') rows.sort((a, b) => (a.date + a.slotStart).localeCompare(b.date + b.slotStart));
    $('#reqList').innerHTML = rows.length ? `<div class="list">${rows.map((r) => App.reqRow(r, '#/request/' + r.id)).join('')}</div>`
      : `<div class="empty">${tab === 'open' ? 'No open requests.' : 'Nothing finished yet.'}${tab === 'open' ? '<a class="btn btn-primary" href="#/new">Request a document</a>' : ''}</div>`;
  }, { role: 'student' });
})();
