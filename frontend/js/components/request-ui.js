/* ==========================================================================
   components/request-ui.js — small pieces shared by request pages:
   progress tracker, request row, date box, "what to do next" note, appointment card
   ========================================================================== */
(function () {
  'use strict';
  const { U, esc, ico, fmtDate, fmtTime, whenWords, pill } = App;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* ---------- tracker used on student cards */
  const STEPS = [['pending', 'Sent'], ['approved', 'Approved'], ['processing', 'Preparing'], ['ready', 'Ready'], ['released', 'Claimed']];
  function tracker(status, prev) {
    const s = status === 'missed' ? (prev || 'approved') : status;
    const idx = STEPS.findIndex((x) => x[0] === s);
    return `<div class="tracker" aria-label="Progress">${STEPS.map((st, i) => `<div class="${i < idx || s === 'released' ? 'done' : i === idx ? 'now' : ''}">${st[1]}</div>`).join('')}</div>`;
  }
  function reqRow(r, href) {
    const d = U.parseDate(r.date);
    return `<a class="req-row" href="${href}">
      <div class="mini-date"><span>${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}</span><b>${d.getDate()}</b><span>${fmtTime(r.slotStart)}</span></div>
      <div style="min-width:0"><div class="req-title">${esc(r.docSummary)}</div>
        <div class="small muted">${esc(r.ref)}${r.student ? ` — ${esc(r.student.name)}` : ''}${r.totalFee > 0 ? ` — ${U.peso(r.totalFee)}` : ''}</div></div>
      <div class="row" style="gap:.4rem">${App.pill(r.status, r.statusLabel)}${r.totalFee > 0 && r.payment.status !== 'verified' && r.status !== 'cancelled' && r.status !== 'rejected' ? App.payPill(r.payment) : ''}</div>
    </a>`;
  }

  function dateBox(date) {
    const d = U.parseDate(date);
    return `<div class="datebox"><div class="m">${MON[d.getMonth()]}</div><div class="d">${d.getDate()}</div><div class="w">${DOW[d.getDay()]}</div></div>`;
  }

  /* ---------- what should the student do next? */
  function nextStep(r) {
    if (r.status === 'missed') return { kind: 'danger', text: `<b>You missed this appointment.</b> It's on hold, not cancelled. Pick a new time by ${esc(fmtDate(r.rescheduleDeadline))}${r.freeReschedule ? ' — this move is free because the office changed its schedule' : ''}.`, action: 'reschedule' };
    if (r.canPay && r.totalFee > 0) return { kind: 'warn', text: r.payment.status === 'rejected' ? `<b>Your receipt was not accepted:</b> ${esc(r.payment.note)} Please upload it again.` : `<b>Pay ${U.peso(r.totalFee)} at the Cashier</b>, then upload your official receipt so the Registrar can prepare your document.`, action: 'pay' };
    if (r.payment.status === 'submitted') return { kind: 'info', text: 'Receipt sent. The Registrar is checking it.' };
    if (r.status === 'pending') return { kind: 'info', text: 'Waiting for the Registrar to review your request. We\'ll notify you.' };
    if (r.status === 'ready') return { kind: 'success', text: `<b>Ready!</b> Come at ${fmtTime(r.slotStart)} with your claim slip${r.totalFee > 0 ? ' and official receipt' : ''}.` };
    if (r.status === 'approved' || r.status === 'processing') return { kind: 'info', text: 'Approved. The Registrar is preparing your document.' };
    return null;
  }

  function appointmentCard(r) {
    const ns = nextStep(r);
    return `<section class="card">
      <div class="card-head"><h2>Next appointment</h2>${pill(r.status, r.statusLabel)}</div>
      <div class="appt">${dateBox(r.date)}
        <div><div class="appt-time">${fmtTime(r.slotStart)} – ${fmtTime(r.slotEnd)}</div>
          <div class="countdown">${esc(whenWords(r.date))}</div>
          <p style="margin-top:.35rem">${r.items.map((i) => `${esc(i.name)}${i.copies > 1 ? ` <span class="muted">x${i.copies}</span>` : ''}`).join(', ')}</p>
          <p class="small muted">${esc(r.ref)}${r.totalFee > 0 ? ' — ' + U.peso(r.totalFee) : ' — Free'}</p></div></div>
      ${App.tracker(r.status)}
      ${ns ? `<div class="note ${ns.kind}" style="margin-top:1rem">${ico(ns.kind === 'success' ? 'check' : ns.kind === 'info' ? 'info' : 'alert')}<div>${ns.text}</div></div>` : ''}
      <div class="row" style="margin-top:1rem">
        <a class="btn btn-primary" href="#/request/${r.id}">Open request</a>
        ${r.canPay && r.totalFee > 0 ? `<a class="btn" href="#/print/payment/${r.id}">${ico('printer')}Payment slip</a>` : ''}
        <a class="btn" href="#/print/claim/${r.id}">${ico('printer')}Claim slip</a>
      </div>
    </section>`;
  }

  Object.assign(App, { tracker, reqRow, dateBox, nextStep, appointmentCard });
})();
