/* ==========================================================================
   pages/registrar/dashboard.js — registrar Dashboard (#/r/dashboard)
   ========================================================================== */
(function () {
  'use strict';
  const { U, esc, ico, fmtDate, fmtTime, ago, S, frame, defineRoute, todayStr } = App;

  /* ================================================================ dashboard */
  defineRoute('/r/dashboard', async () => {
    const main = frame('Dashboard', { rail: true });
    main.innerHTML = '<div class="page"><div class="skeleton"></div></div>';
    const d = await API.get('/api/registrar/dashboard');
    const max = Math.max(1, ...d.todaySlots.map((s) => s.capacity));
    const hour = new Date().getHours();
    const todo = d.pending + d.paymentsToCheck;
    const focus = todo ? `${todo} item${todo === 1 ? '' : 's'} need${todo === 1 ? 's' : ''} your attention` : 'All caught up. Nothing waiting for review.';
    main.innerHTML = `<div class="page stack" style="--gap:1.4rem">
      <header class="dash-header">
        <div class="dash-header-main">
          <p class="dash-eyebrow">${ico('grid')}Registrar dashboard<span class="hide-sm"> · ${esc(S.cfg ? S.cfg.officeName : 'Registrar')}</span></p>
          <h1>Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, ${esc(S.user.name.split(' ')[0])}</h1>
          <p class="dash-date">${ico('calendar')}${esc(fmtDate(todayStr()))} · ${focus}</p>
        </div>
        <div class="dash-header-side">
          <div class="row dash-actions">
            <a class="btn btn-accent" href="#/r/manifest">${ico('clipboard')}Today's claiming list</a>
            <a class="btn btn-on-dark" href="#/r/queue?status=pending">${ico('inbox')}Review requests</a>
          </div>
        </div>
      </header>
      <div class="stats">
        <a class="stat ${d.pending ? 'alert' : ''}" href="#/r/queue?status=pending"><b>${d.pending}</b><span>Waiting for review</span></a>
        <a class="stat ${d.paymentsToCheck ? 'alert' : ''}" href="#/r/queue?payment=submitted"><b>${d.paymentsToCheck}</b><span>Receipts to check</span></a>
        <a class="stat" href="#/r/manifest"><b>${d.todayTotal}</b><span>Appointments today</span></a>
        <a class="stat" href="#/r/queue?status=ready"><b>${d.ready}</b><span>Ready at the counter</span></a>
        <a class="stat" href="#/r/queue?status=missed"><b>${d.missed}</b><span>Missed, on hold</span></a>
        <div class="stat"><b>${d.releasedWeek}</b><span>Claimed this week</span></div>
        <div class="stat"><b style="font-size:1.4rem">${U.peso(d.feesMonth)}</b><span>Fees confirmed this month</span></div>
      </div>
      <div class="split">
        <section class="card"><div class="card-head"><h2>Today's windows</h2><span class="small muted">Booked / seats</span></div>
          <div class="bars">${d.todaySlots.map((s) => `<div class="bar-row"><span class="num">${fmtTime(s.start)}</span><div class="bar"><i class="${s.booked >= s.capacity ? 'hot' : ''}" style="width:${(s.booked / max) * 100}%"></i></div><span class="num">${s.booked}/${s.capacity}</span></div>`).join('')}</div></section>
        <section class="card"><h2 style="margin-bottom:.8rem">Most requested (30 days)</h2>
          ${d.topDocs.length ? `<div class="bars">${d.topDocs.map((t) => `<div class="bar-row" style="grid-template-columns:52px minmax(0,1fr) 36px"><span class="tag">${esc(t.code)}</span><div class="bar"><i style="width:${(t.copies / d.topDocs[0].copies) * 100}%"></i></div><span class="num">${t.copies}</span></div>`).join('')}</div>` : '<p class="muted">No data yet.</p>'}</section>
      </div>
      <section class="card"><h2 style="margin-bottom:.9rem">Recent activity</h2>
        <ul class="timeline">${d.activity.map((a) => `<li><a href="#/r/request/${a.id}"><b>${esc(a.ref)}</b></a> ${esc(a.student)}: <b>${esc(a.label)}</b>${a.note ? ` <span class="small muted">(${esc(a.note)})</span>` : ''}<br><time>${esc(ago(a.at))} — ${esc(a.by)}</time></li>`).join('')}</ul></section>
    </div>`;
  }, { role: 'staff' });
})();
