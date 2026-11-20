/* ==========================================================================
   pages/registrar/queue.js — request queue with search, filters and bulk approve (#/r/queue)
   ========================================================================== */
(function () {
  'use strict';
  const { U, $, $$, esc, ico, fmtDate, fmtTime, pill, payPill, toast, busy, frame, go, defineRoute } = App;

  /* ================================================================ queue */
  defineRoute('/r/queue', async (p, q) => {
    const main = frame('Requests');
    const f = { q: q.q || '', status: q.status || 'open', payment: q.payment || '', date: q.date || '', page: Number(q.page) || 1 };
    const qs = (o) => '?' + new URLSearchParams(Object.fromEntries(Object.entries(Object.assign({}, f, o)).filter(([, v]) => v !== '' && v != null))).toString();
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>Requests</h1><p>Search by name, student number or reference. Tick pending requests to approve many at once.</p></div></div>
      <form class="filters" id="flt">
        <input class="input q" name="q" placeholder="Search name, student no. or CF-…" value="${esc(f.q)}" aria-label="Search">
        <select class="input" name="status" aria-label="Status"><option value="open">All open</option><option value="all">Everything</option>${Object.entries(U.STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
        <select class="input" name="payment" aria-label="Payment"><option value="">Any payment</option>${Object.entries(U.PAYMENT_LABEL).map(([k, v]) => `<option value="${k}" ${f.payment === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
        <input class="input" type="date" name="date" value="${esc(f.date)}" aria-label="Appointment date">
      </form>
      <div class="row between" style="margin-bottom:.7rem"><span class="small muted" id="cnt"></span><button class="btn btn-sm btn-primary hidden" id="bulk">${ico('check')}Approve selected</button></div>
      <div id="qBody"><div class="skeleton"></div></div></div>`;
    const form = $('#flt');
    form.status.value = f.status;
    let t;
    const apply = () => { const d = Object.fromEntries(new FormData(form)); go('/r/queue' + qs(Object.assign(d, { page: 1 }))); };
    form.onchange = apply;
    form.q.oninput = () => { clearTimeout(t); t = setTimeout(apply, 450); };
    form.onsubmit = (e) => { e.preventDefault(); apply(); };
    if (f.q) { form.q.focus(); form.q.setSelectionRange(f.q.length, f.q.length); }

    const res = await API.get('/api/requests' + qs({}) + '&limit=20');
    $('#cnt').textContent = `${res.total} request${res.total === 1 ? '' : 's'}`;
    if (!res.rows.length) { $('#qBody').innerHTML = '<div class="empty">No requests match these filters.</div>'; return; }
    $('#qBody').innerHTML = `
      <div class="table-wrap hide-sm"><table class="data"><thead><tr><th><input type="checkbox" id="allChk" aria-label="Select all pending"></th><th>Reference</th><th>Student</th><th>Documents</th><th>Appointment</th><th>Status</th><th>Payment</th></tr></thead>
        <tbody>${res.rows.map((r) => `<tr data-go="${r.id}">
          <td>${r.status === 'pending' ? `<input type="checkbox" class="chk" value="${r.id}" aria-label="Select ${esc(r.ref)}">` : ''}</td>
          <td><b>${esc(r.ref)}</b></td>
          <td>${esc(r.student.name)}<br><span class="small muted num">${esc(r.student.studentNo)}</span></td>
          <td>${esc(r.docSummary)}</td>
          <td class="num">${esc(fmtDate(r.date))}<br><span class="small muted">${fmtTime(r.slotStart)}</span></td>
          <td>${pill(r.status, r.statusLabel)}</td><td>${r.totalFee > 0 ? payPill(r.payment) : '<span class="small muted">Free</span>'}</td></tr>`).join('')}</tbody></table></div>
      <div class="list show-sm">${res.rows.map((r) => App.reqRow(r, '#/r/request/' + r.id)).join('')}</div>
      <div class="pager"><span class="small muted">Page ${res.page} of ${res.pages}</span><div class="row">
        <a class="btn btn-sm ${res.page <= 1 ? 'hidden' : ''}" href="#/r/queue${qs({ page: res.page - 1 })}">${ico('left')}Previous</a>
        <a class="btn btn-sm ${res.page >= res.pages ? 'hidden' : ''}" href="#/r/queue${qs({ page: res.page + 1 })}">Next${ico('right')}</a></div></div>`;
    $$('tr[data-go]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('input')) go('/r/request/' + tr.dataset.go); }));
    const bulk = $('#bulk');
    const sync = () => { const n = $$('.chk:checked').length; bulk.classList.toggle('hidden', !n); bulk.innerHTML = `${ico('check')}Approve ${n} selected`; };
    $$('.chk').forEach((c) => (c.onchange = sync));
    const all = $('#allChk'); if (all) all.onchange = () => { $$('.chk').forEach((c) => (c.checked = all.checked)); sync(); };
    bulk.onclick = () => busy(bulk, async () => { const r = await API.post('/api/requests/bulk-approve', { ids: $$('.chk:checked').map((c) => Number(c.value)) }); toast(`${r.approved} request${r.approved === 1 ? '' : 's'} approved. Students were notified.`, 'success'); App.route(); });
  }, { role: 'staff' });
})();
