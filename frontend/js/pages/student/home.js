/* ==========================================================================
   pages/student/home.js — student Home (#/home)
   ========================================================================== */
(function () {
  'use strict';
  const { $, esc, ico, fmtDate, fmtTime, whenWords, S, frame, defineRoute, appointmentCard } = App;

  /* ================================================================ home */
  defineRoute('/home', async () => {
    const main = frame('Home', { rail: true });
    main.innerHTML = '<div class="page"><div class="skeleton" style="height:140px"></div><div class="skeleton" style="margin-top:1rem;height:220px"></div></div>';
    const list = await API.get('/api/requests?status=open&sort=appt&limit=10');
    const open = list.rows.slice().sort((a, b) => (a.date + a.slotStart).localeCompare(b.date + b.slotStart));
    const missed = open.filter((r) => r.status === 'missed');
    const upcoming = open.filter((r) => r.status !== 'missed');
    const next = upcoming[0];
    const first = S.user.name.split(' ')[0];
    const showPush = 'Notification' in window && Notification.permission === 'default';

    main.innerHTML = `<div class="page stack" style="--gap:1.25rem">
      <section class="hero-cta">
        <div><h1>Hi, ${esc(first)}!</h1><p>${next ? `Your next visit to the Registrar: <b style="color:#fff">${esc(whenWords(next.date))}, ${fmtTime(next.slotStart)}</b>.` : 'What do you need from the Registrar today?'}</p></div>
        <a class="btn btn-accent btn-lg" href="#/new">${ico('filePlus')}Request a document</a>
      </section>

      ${showPush ? `<div class="note info" id="pushNote">${ico('bell')}<div class="grow"><b>Get reminded the day before.</b> Turn on pop-up reminders so you don't miss your time.</div><button class="btn btn-sm btn-primary" id="pushOn">Turn on</button></div>` : ''}

      ${missed.map((r) => `<div class="note danger">${ico('alert')}<div class="grow"><b>Missed: ${esc(r.docSummary)}</b> (${esc(fmtDate(r.date))}, ${fmtTime(r.slotStart)}). Your request is on hold. Pick a new time by ${esc(fmtDate(r.rescheduleDeadline))}.</div><a class="btn btn-sm" href="#/request/${r.id}">Pick a new time</a></div>`).join('')}

      ${next ? appointmentCard(next) : `<div class="empty">${ico('doc')}<div><b style="color:var(--text)">No appointments yet</b><br>Request a document and pick a time. It takes about two minutes.</div><a class="btn btn-primary" href="#/new">Start a request</a></div>`}

      ${upcoming.length > 1 ? `<div><h2 class="section-title">Your other open requests</h2><div class="list">${upcoming.slice(1).map((r) => App.reqRow(r, '#/request/' + r.id)).join('')}</div></div>` : ''}

      <div class="card show-sm" id="homeBoard"></div>

      <div class="card flat" style="background:var(--surface-2)">
        <h3>How it works</h3>
        <ol class="todo" style="margin-top:.8rem">
          <li><div><b>Pick your documents</b><br><span class="small muted">Some have a fee, like Good Moral, Form 137 and Form 138.</span></div></li>
          <li><div><b>Choose a time with open seats</b><br><span class="small muted">Only ${S.cfg.defaultSlotCapacity} students per ${S.cfg.slotMinutes}-minute window, so there's no crowd.</span></div></li>
          <li><div><b>Pay at the Cashier and upload the receipt</b><br><span class="small muted">Bring the payment slip we give you. Free documents skip this.</span></div></li>
          <li><div><b>Claim on your day</b><br><span class="small muted">We'll remind you a day before. If you're late, you have ${S.cfg.graceMinutes} minutes; if you miss it, you can pick a new time within ${S.cfg.rescheduleWindowDays} days.</span></div></li>
        </ol>
      </div>
    </div>`;
    if (window.innerWidth < 1280) App.renderBoard($('#homeBoard'), { compact: true });
    const po = $('#pushOn');
    if (po) po.onclick = async () => { await App.askNotifyPermission(); $('#pushNote').remove(); };
  });
})();
