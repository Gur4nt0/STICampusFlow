/* ==========================================================================
   pages/registrar/closures.js — office closures, class suspensions and seats per window (#/r/calendar)
   ========================================================================== */
(function () {
  'use strict';
  const { $, $$, esc, ico, fmtDate, toast, confirmBox, busy, S, frame, defineRoute, todayStr } = App;

  /* ================================================================ closures, suspensions, capacity */
  defineRoute('/r/calendar', async () => {
    const main = frame('Closures & notices');
    main.innerHTML = '<div class="page"><div class="skeleton"></div></div>';
    const d = await API.get('/api/closures');
    const today = todayStr();
    main.innerHTML = `<div class="page stack" style="--gap:1.25rem">
      <div class="page-head" style="margin-bottom:0"><div><h1>Closures and notices</h1><p>Tell students when the office is closed, or when classes are suspended but the office is still open.</p></div></div>
      <div class="split">
        <section class="card"><h2 style="margin-bottom:1rem">Post a notice</h2>
          <form class="stack" id="clForm">
            <div class="field"><label for="cd">Date</label><input class="input" type="date" id="cd" name="date" min="${today}" value="${today}" required></div>
            <div class="stack" style="--gap:.5rem"><span class="label">What's happening?</span>
              <label class="choice"><input type="radio" name="kind" value="office_open" checked><span><b>Classes suspended, office open</b><br><span class="small muted">For typhoons and other suspensions. Students booked that day get a notice that they can still claim, and can move their time for free.</span></span></label>
              <label class="choice"><input type="radio" name="kind" value="closed"><span><b>Office closed</b><br><span class="small muted">Holidays and emergencies. Booked students are asked to pick a new time, and it won't count against their changes.</span></span></label></div>
            <div class="field"><label for="cr">Reason students will see</label><input class="input" id="cr" name="reason" maxlength="160" placeholder="e.g. Classes suspended due to Typhoon signal no. 2"></div>
            <button class="btn btn-primary" type="submit">${ico('bell')}Post and notify students</button>
          </form></section>
        <section class="card"><h2 style="margin-bottom:1rem">Seats per window</h2>
          <p class="small muted" style="margin-bottom:.9rem">Default is ${S.cfg.defaultSlotCapacity} students per ${S.cfg.slotMinutes}-minute window. Lower it on busy or short-staffed days.</p>
          <form class="row" id="capForm" style="align-items:flex-end">
            <div class="field grow"><label for="capd">Date</label><input class="input" type="date" id="capd" name="date" min="${today}" required></div>
            <div class="field" style="width:110px"><label for="capn">Seats</label><input class="input" type="number" id="capn" name="capacity" min="0" max="50" value="${S.cfg.defaultSlotCapacity}" required></div>
            <button class="btn" type="submit">Save</button></form>
          <div class="list" style="margin-top:1rem">${d.capacity.length ? d.capacity.map((c) => `<div class="row between small" style="border-top:1px solid var(--border);padding-top:.5rem"><span><b>${esc(fmtDate(c.date))}</b>: ${c.capacity} seats per window</span><button class="btn btn-sm btn-ghost" data-capclear="${c.date}">Reset</button></div>`).join('') : '<p class="small muted">No changes. Every day uses the default.</p>'}</div>
        </section>
      </div>
      <section class="card"><h2 style="margin-bottom:.9rem">Upcoming and recent notices</h2>
        ${d.closures.length ? `<div class="list">${d.closures.map((c) => `<div class="row between" style="border-top:1px solid var(--border);padding-top:.6rem">
          <div><b>${esc(fmtDate(c.date))}</b> <span class="pill ${c.kind === 'closed' ? 'rejected' : 'pending'}">${c.kind === 'closed' ? 'Office closed' : 'Suspended, office open'}</span><br><span class="small muted">${esc(c.reason)}</span></div>
          ${c.date >= today ? `<button class="btn btn-sm btn-danger" data-rm="${c.id}">${ico('trash')}Remove</button>` : ''}</div>`).join('')}</div>` : '<p class="muted">No notices.</p>'}</section>
    </div>`;
    const f = $('#clForm');
    f.onsubmit = (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      busy(f.querySelector('button[type=submit]'), async () => {
        const r = await API.post('/api/closures', body);
        toast(`Notice posted. ${r.affected} booked student${r.affected === 1 ? ' was' : 's were'} notified.`, 'success'); App.route();
      });
    };
    const cf = $('#capForm');
    cf.onsubmit = (e) => { e.preventDefault(); busy(cf.querySelector('button'), async () => { await API.post('/api/capacity', { date: cf.date.value, capacity: cf.capacity.value }); toast('Seats updated.', 'success'); App.route(); }); };
    $$('[data-capclear]').forEach((b) => (b.onclick = () => busy(b, async () => { await API.post('/api/capacity', { date: b.dataset.capclear, capacity: null }); App.route(); })));
    $$('[data-rm]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox({ title: 'Remove this notice?', body: 'The day becomes bookable again. Students already moved will keep their new times.', ok: 'Remove' }))) return;
      busy(b, async () => { await API.del('/api/closures/' + b.dataset.rm); App.route(); });
    }));
  }, { role: 'staff' });
})();
