/* ==========================================================================
   pages/registrar/claiming-list.js — claiming list for a day, printable + CSV (#/r/manifest)
   ========================================================================== */
(function () {
  'use strict';
  const { U, $, $$, esc, ico, fmtDate, fmtTime, pill, payPill, toast, busy, frame, go, defineRoute, todayStr } = App;

  /* ================================================================ claiming list (manifest) */
  defineRoute('/r/manifest', async (p, q) => {
    const main = frame('Claiming list');
    const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : todayStr();
    main.innerHTML = `<div class="page"><div class="page-head"><div><h1>Claiming list</h1><p>Everyone booked for the day, grouped by time window.</p></div>
      <div class="row no-print"><a class="icon-btn" href="#/r/manifest?date=${U.addDays(date, -1)}" aria-label="Previous day">${ico('left')}</a>
        <input class="input" type="date" id="mDate" value="${date}" style="width:auto" aria-label="Date"><a class="icon-btn" href="#/r/manifest?date=${U.addDays(date, 1)}" aria-label="Next day">${ico('right')}</a>
        <button class="btn" id="csv">${ico('download')}CSV</button><button class="btn" onclick="window.print()">${ico('printer')}Print</button></div></div>
      <div id="mBody"><div class="skeleton"></div></div></div>`;
    $('#mDate').onchange = (e) => go('/r/manifest?date=' + e.target.value);
    const m = await API.get('/api/registrar/manifest?date=' + date);
    const groups = {};
    m.rows.forEach((r) => (groups[r.slotStart] = groups[r.slotStart] || []).push(r));
    $('#mBody').innerHTML = `<h2 style="margin-bottom:.8rem">${esc(fmtDate(date))} — ${m.rows.length} student${m.rows.length === 1 ? '' : 's'}</h2>
      ${m.closure ? `<div class="note ${m.closure.kind === 'closed' ? 'danger' : 'warn'}" style="margin-bottom:1rem">${ico('alert')}<div><b>${m.closure.kind === 'closed' ? 'Office closed' : 'Classes suspended, office open'}:</b> ${esc(m.closure.reason)}</div></div>` : ''}
      ${m.rows.length ? Object.keys(groups).sort().map((k) => `<section class="card" style="margin-bottom:1rem"><div class="card-head"><h3>${fmtTime(k)} – ${fmtTime(groups[k][0].slotEnd)}</h3><span class="small muted">${groups[k].length} student${groups[k].length === 1 ? '' : 's'}</span></div>
        <div class="list">${groups[k].map((r) => `<div class="row between" style="padding:.55rem 0;border-top:1px solid var(--border)">
          <div class="grow"><b>${esc(r.student.name)}</b> <span class="small muted num">${esc(r.student.studentNo)}</span><br><span class="small">${esc(r.items.map((i) => i.name + (i.copies > 1 ? ' x' + i.copies : '')).join(', '))}</span></div>
          <div class="row" style="gap:.4rem">${pill(r.status, r.statusLabel)}${r.totalFee > 0 ? payPill(r.payment) : ''}
            ${r.status === 'ready' && (r.totalFee === 0 || r.payment.status === 'verified') ? `<button class="btn btn-sm btn-primary no-print" data-release="${r.id}">Release</button>` : ''}
            <a class="btn btn-sm no-print" href="#/r/request/${r.id}">Open</a></div></div>`).join('')}</div></section>`).join('') : '<div class="empty">No one is booked on this day.</div>'}`;
    $$('[data-release]').forEach((b) => (b.onclick = () => busy(b, async () => { await API.post(`/api/requests/${b.dataset.release}/transition`, { to: 'released' }); toast('Released.', 'success'); App.route(); })));
    $('#csv').onclick = () => {
      const rows = [['Time', 'Reference', 'Student no.', 'Name', 'Documents', 'Status', 'Payment', 'OR number']].concat(m.rows.map((r) => [fmtTime(r.slotStart), r.ref, r.student.studentNo, r.student.name, r.items.map((i) => `${i.code} x${i.copies}`).join('; '), r.statusLabel, r.payment.label, r.payment.orNumber]));
      const csv = rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); a.download = `claiming-list-${date}.csv`; document.body.appendChild(a); a.click(); a.remove();
    };
  }, { role: 'staff' });
})();
