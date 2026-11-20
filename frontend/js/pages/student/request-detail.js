/* ==========================================================================
   pages/student/request-detail.js — one request (#/request/:id): appointment, payment upload, change time, cancel
   ========================================================================== */
(function () {
  'use strict';
  const { U, $, esc, ico, fmtDate, fmtTime, whenWords, ago, pill, payPill, toast, modal, confirmBox, busy, S, frame, defineRoute, dateBox, nextStep } = App;

  /* ================================================================ request detail */
  defineRoute('/request/:id', async ({ id }) => {
    const main = frame('Request', { rail: true });
    main.innerHTML = '<div class="page narrow"><div class="skeleton"></div></div>';
    const r = await API.get('/api/requests/' + id);
    const ns = nextStep(r);
    const pay = r.payment.status;
    const payStep = (n) => (n === 1 ? (pay === 'unpaid' || pay === 'rejected' ? 'now' : 'done') : n === 2 ? (pay === 'unpaid' || pay === 'rejected' ? 'now' : 'done') : pay === 'verified' ? 'done' : pay === 'submitted' ? 'now' : '');
    main.innerHTML = `<div class="page narrow stack" style="--gap:1.25rem">
      <div><a href="#/requests" class="small">${'←'} My requests</a></div>
      <div class="page-head" style="margin-bottom:0"><div><h1>${esc(r.docSummary)}</h1><p>${esc(r.ref)} — sent ${esc(ago(r.createdAt))}</p></div>${pill(r.status, r.statusLabel)}</div>
      ${ns ? `<div class="note ${ns.kind}">${ico(ns.kind === 'success' ? 'check' : ns.kind === 'info' ? 'info' : 'alert')}<div>${ns.text}</div></div>` : ''}
      ${r.status === 'rejected' ? `<div class="note danger">${ico('alert')}<div><b>Declined:</b> ${esc(r.rejectReason)}</div></div>` : ''}

      <section class="card">
        <div class="card-head"><h2>Appointment</h2></div>
        <div class="appt">${dateBox(r.date)}<div><div class="appt-time">${fmtTime(r.slotStart)} – ${fmtTime(r.slotEnd)}</div><div class="countdown">${esc(whenWords(r.date))}</div>
          <p class="small muted">${esc(S.cfg.officeName)}. Please arrive on time; you have a ${S.cfg.graceMinutes}-minute allowance.</p></div></div>
        ${['cancelled', 'rejected', 'noshow'].includes(r.status) ? '' : App.tracker(r.status)}
        <div class="row" style="margin-top:1rem">
          ${r.canReschedule ? `<button class="btn ${r.status === 'missed' ? 'btn-primary' : ''}" id="resched" ${!r.freeReschedule && r.reschedulesLeft <= 0 ? 'disabled' : ''}>${ico('calendar')}${r.status === 'missed' ? 'Pick a new time' : 'Change time'}</button>` : ''}
          ${['cancelled', 'rejected', 'noshow'].includes(r.status) ? '' : `<a class="btn" href="#/print/claim/${r.id}">${ico('printer')}Claim slip</a>`}
          ${r.canCancel ? `<button class="btn btn-danger" id="cancelReq">${ico('x')}Cancel request</button>` : ''}
        </div>
        ${r.canReschedule ? `<p class="tiny muted" style="margin-top:.6rem">${r.freeReschedule ? 'Your next move is free because the office changed its schedule.' : `You can change the time ${r.reschedulesLeft} more time${r.reschedulesLeft === 1 ? '' : 's'}.`}</p>` : ''}
      </section>

      ${r.totalFee > 0 ? `<section class="card">
        <div class="card-head"><h2>Payment</h2>${payPill(r.payment)}</div>
        <ol class="todo">
          <li class="${payStep(1)}"><div><b>Print or save your payment slip</b><br><span class="small muted">It lists the documents and fees, signed by the Registrar.</span>
            <div style="margin-top:.5rem"><a class="btn btn-sm" href="#/print/payment/${r.id}">${ico('printer')}Payment slip</a></div></div></li>
          <li class="${payStep(2)}"><div><b>Pay ${U.peso(r.totalFee)} at the Cashier</b><br><span class="small muted">Keep your official receipt (OR).</span></div></li>
          <li class="${payStep(3)}"><div><b>Upload the receipt</b><br><span class="small muted">${pay === 'submitted' ? `Sent (OR ${esc(r.payment.orNumber)}). The Registrar is checking it.` : pay === 'verified' ? `Confirmed (OR ${esc(r.payment.orNumber)}).` : pay === 'rejected' ? esc(r.payment.note) : 'Type the OR number and add a clear photo.'}</span>
            ${r.canPay && U.OPEN.includes(r.status) ? `<div style="margin-top:.5rem"><button class="btn btn-sm btn-primary" id="payBtn">${ico('upload')}Upload receipt</button></div>` : ''}</div></li>
        </ol>
      </section>` : ''}

      <section class="card">
        <h2 style="margin-bottom:.8rem">Documents</h2>
        <table class="data"><thead><tr><th>Document</th><th>Copies</th><th style="text-align:right">Fee</th></tr></thead>
          <tbody>${r.items.map((i) => `<tr><td>${esc(i.name)} <span class="tag">${esc(i.code)}</span></td><td>${i.copies}</td><td style="text-align:right">${i.unitFee > 0 ? U.peso(i.unitFee * i.copies) : 'Free'}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="2"><b>Total</b></td><td style="text-align:right"><b>${r.totalFee > 0 ? U.peso(r.totalFee) : 'Free'}</b></td></tr></tfoot></table>
        ${r.purpose || r.studentNote ? `<dl class="kv" style="margin-top:1rem">${r.purpose ? `<dt>Purpose</dt><dd>${esc(r.purpose)}</dd>` : ''}${r.studentNote ? `<dt>Your note</dt><dd>${esc(r.studentNote)}</dd>` : ''}</dl>` : ''}
      </section>

      <section class="card"><h2 style="margin-bottom:.9rem">Activity</h2>
        <ul class="timeline">${r.history.slice().reverse().map((h) => `<li><b>${esc(h.from === h.to ? (h.note || h.label) : h.label)}</b>${h.note && h.from !== h.to ? `<div class="small">${esc(h.note)}</div>` : ''}<time>${esc(ago(h.at))}${h.by ? ' — ' + esc(h.by) : ''}</time></li>`).join('')}</ul></section>
    </div>`;

    const reload = () => App.route();
    const cb = $('#cancelReq');
    if (cb) cb.onclick = async () => {
      if (!(await confirmBox({ title: 'Cancel this request?', body: `${esc(r.docSummary)} on ${esc(fmtDate(r.date))}. Your seat will be given to another student.`, ok: 'Yes, cancel it', danger: true }))) return;
      await busy(null, async () => { await API.post(`/api/requests/${r.id}/cancel`, {}); toast('Request cancelled.', 'success'); reload(); });
    };
    const rs = $('#resched');
    if (rs) rs.onclick = () => rescheduleModal(r, reload);
    const pb = $('#payBtn');
    if (pb) pb.onclick = () => paymentModal(r, reload);
  }, { role: 'student' });

  function rescheduleModal(r, after) {
    let pick = null;
    const m = modal(`<h2>${r.status === 'missed' ? 'Pick a new time' : 'Change your time'}</h2>
      <p class="muted small" style="margin:.3rem 0 1rem">Now: ${esc(fmtDate(r.date))}, ${fmtTime(r.slotStart)}. ${r.freeReschedule ? 'This move is free.' : `You have ${r.reschedulesLeft} change${r.reschedulesLeft === 1 ? '' : 's'} left.`}</p>
      <div id="rpk"></div>
      <div class="modal-foot"><button class="btn" data-close>Keep current time</button><button class="btn btn-primary" id="saveTime" disabled>Save new time</button></div>`, { wide: true });
    App.picker($('#rpk', m.el), { query: 'request=' + r.id, exclude: r.id, onChange: (v) => { pick = v; $('#saveTime', m.el).disabled = !v; $('#saveTime', m.el).textContent = v ? `Save ${fmtDate(v.date)}, ${fmtTime(v.slot.start)}` : 'Save new time'; } });
    $('#saveTime', m.el).onclick = (e) => busy(e.currentTarget, async () => {
      await API.post(`/api/requests/${r.id}/reschedule`, { date: pick.date, slot: pick.slot.start });
      m.close(); toast('New time saved.', 'success'); App.poll(false); after();
    });
  }

  function paymentModal(r, after) {
    let img = '';
    const m = modal(`<h2>Upload your receipt</h2>
      <p class="muted small" style="margin:.3rem 0 1rem">Amount paid: <b>${U.peso(r.totalFee)}</b> for ${esc(r.ref)}.</p>
      <div class="stack">
        <div class="field"><label for="orn">OR number</label><input class="input" id="orn" placeholder="Printed on your official receipt" maxlength="30" autocomplete="off"><span class="hint">Letters, numbers and dashes only.</span></div>
        <div class="field"><label for="orf">Photo of the receipt</label><input class="input" id="orf" type="file" accept="image/*" capture="environment"><span class="hint">Make sure the OR number and amount are readable.</span></div>
        <img id="orPrev" class="receipt-thumb hidden" alt="Receipt preview">
      </div>
      <div class="modal-foot"><button class="btn" data-close>Not now</button><button class="btn btn-primary" id="sendPay">Send receipt</button></div>`);
    $('#orf', m.el).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { img = await App.compressImage(f); const p = $('#orPrev', m.el); p.src = img; p.classList.remove('hidden'); } catch (err) { toast(err.message, 'error'); }
    };
    $('#sendPay', m.el).onclick = (e) => busy(e.currentTarget, async () => {
      await API.post(`/api/requests/${r.id}/payment`, { orNumber: $('#orn', m.el).value, receiptImage: img });
      m.close(); toast('Receipt sent. We\'ll let you know once it\'s checked.', 'success'); after();
    });
  }
})();
