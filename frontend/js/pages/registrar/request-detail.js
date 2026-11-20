/* ==========================================================================
   pages/registrar/request-detail.js — review one request (#/r/request/:id): approve, prepare, release, payment check
   ========================================================================== */
(function () {
  'use strict';
  const { U, $, $$, esc, ico, fmtDate, fmtTime, whenWords, ago, pill, payPill, toast, modal, confirmBox, busy, frame, defineRoute } = App;

  const ACTION = {
    approved: ['Approve', 'btn-primary', 'check'], processing: ['Start preparing', '', 'doc'], ready: ['Mark ready to claim', 'btn-accent', 'check'],
    released: ['Release to student', 'btn-primary', 'check'], rejected: ['Decline', 'btn-danger', 'x'], noshow: ['Close as not claimed', 'btn-danger', 'x'],
  };
  const DECLINE_REASONS = ['Incomplete requirements. Please bring your clearance.', 'Unsettled balance with the Accounting Office.', 'Your student record is on hold. Please visit the Registrar.', 'This document is not available for your program.'];

  /* ================================================================ request detail (registrar) */
  defineRoute('/r/request/:id', async ({ id }) => {
    const main = frame('Request');
    main.innerHTML = '<div class="page"><div class="skeleton"></div></div>';
    const r = await API.get('/api/requests/' + id);
    const needsPay = r.totalFee > 0 && r.payment.status !== 'verified';
    main.innerHTML = `<div class="page stack" style="--gap:1.25rem">
      <div><a href="#/r/queue" class="small">${'←'} Requests</a></div>
      <div class="page-head" style="margin-bottom:0"><div><h1>${esc(r.ref)}</h1><p>${esc(r.student.name)} — ${esc(r.docSummary)}</p></div>${pill(r.status, r.statusLabel)}</div>
      <div class="split">
        <div class="stack" style="--gap:1.25rem">
          <section class="card">
            <div class="card-head"><h2>Next step</h2></div>
            ${r.allowed.length ? `
              ${needsPay && r.allowed.some((a) => a === 'ready' || a === 'released') ? `<div class="note warn" style="margin-bottom:.9rem">${ico('coins')}<div>Check the payment before marking it ready or releasing it.</div></div>` : ''}
              <div class="field" style="margin-bottom:.9rem"><label for="snote">Note to the student (optional)</label><input class="input" id="snote" maxlength="400" placeholder="e.g. Please bring a valid ID"></div>
              <div class="row">${r.allowed.map((a) => `<button class="btn ${ACTION[a][1]}" data-to="${a}" ${needsPay && (a === 'ready' || a === 'released') ? 'disabled' : ''}>${ico(ACTION[a][2])}${ACTION[a][0]}</button>`).join('')}</div>`
              : `<p class="muted">This request is finished. No more actions.</p>`}
            ${r.status === 'rejected' ? `<div class="note danger" style="margin-top:.9rem">${ico('alert')}<div>${esc(r.rejectReason)}</div></div>` : ''}
          </section>
          ${r.totalFee > 0 ? `<section class="card"><div class="card-head"><h2>Payment</h2>${payPill(r.payment)}</div>
            <dl class="kv"><dt>Amount</dt><dd><b>${U.peso(r.totalFee)}</b></dd><dt>OR number</dt><dd>${esc(r.payment.orNumber) || '<span class="muted">Not sent yet</span>'}</dd>${r.payment.note ? `<dt>Note</dt><dd>${esc(r.payment.note)}</dd>` : ''}</dl>
            ${r.payment.hasReceipt ? '<div id="rcpt" style="margin-top:.9rem"><div class="skeleton" style="height:160px"></div></div>' : ''}
            ${r.payment.status === 'submitted' ? `<div class="row" style="margin-top:1rem"><button class="btn btn-primary" id="payOk">${ico('check')}Payment is correct</button><button class="btn btn-danger" id="payNo">${ico('x')}Not accepted</button></div>` : ''}
          </section>` : ''}
          <section class="card"><h2 style="margin-bottom:.8rem">Documents</h2>
            <table class="data"><thead><tr><th>Document</th><th>Copies</th><th style="text-align:right">Fee</th></tr></thead><tbody>${r.items.map((i) => `<tr><td>${esc(i.name)} <span class="tag">${esc(i.code)}</span></td><td>${i.copies}</td><td style="text-align:right">${i.unitFee > 0 ? U.peso(i.unitFee * i.copies) : 'Free'}</td></tr>`).join('')}</tbody></table>
            <dl class="kv" style="margin-top:1rem"><dt>Purpose</dt><dd>${esc(r.purpose) || '—'}</dd><dt>Student note</dt><dd>${esc(r.studentNote) || '—'}</dd>${r.staffNote ? `<dt>Staff note</dt><dd>${esc(r.staffNote)}</dd>` : ''}</dl></section>
          <section class="card"><h2 style="margin-bottom:.9rem">Activity</h2><ul class="timeline">${r.history.slice().reverse().map((h) => `<li><b>${esc(h.from === h.to ? (h.note || h.label) : h.label)}</b>${h.note && h.from !== h.to ? `<div class="small">${esc(h.note)}</div>` : ''}<time>${esc(ago(h.at))} — ${esc(h.by || 'System')}</time></li>`).join('')}</ul></section>
        </div>
        <div class="stack" style="--gap:1.25rem">
          <section class="card"><h2 style="margin-bottom:.7rem">Appointment</h2>
            <p class="appt-time">${esc(fmtDate(r.date))}</p><p>${fmtTime(r.slotStart)} – ${fmtTime(r.slotEnd)} <span class="countdown">${esc(whenWords(r.date))}</span></p>
            ${r.rescheduleCount ? `<p class="small muted" style="margin-top:.4rem">Moved ${r.rescheduleCount} time${r.rescheduleCount > 1 ? 's' : ''} by the student.</p>` : ''}
            ${r.status === 'missed' ? `<p class="small" style="margin-top:.4rem">On hold until ${esc(fmtDate(r.rescheduleDeadline))}.</p>` : ''}
            <a class="btn btn-sm" style="margin-top:.8rem" href="#/print/claim/${r.id}">${ico('printer')}Claim slip</a></section>
          <section class="card"><h2 style="margin-bottom:.7rem">Student</h2>
            <dl class="kv"><dt>Name</dt><dd>${esc(r.student.name)}</dd><dt>Student no.</dt><dd class="num">${esc(r.student.studentNo)}</dd><dt>Program</dt><dd>${esc(r.student.program) || '—'}${r.student.yearLevel ? ', year ' + r.student.yearLevel : ''}</dd>${r.student.email ? `<dt>Email</dt><dd>${esc(r.student.email)}</dd>` : ''}</dl></section>
          ${r.others.length ? `<section class="card"><h2 style="margin-bottom:.7rem">Other requests</h2><div class="list">${r.others.slice(0, 5).map((o) => `<a href="#/r/request/${o.id}" class="row between" style="text-decoration:none;color:inherit;padding:.4rem 0;border-bottom:1px solid var(--border)"><span class="small"><b>${esc(o.ref)}</b><br>${esc(o.docSummary)}</span>${pill(o.status, o.statusLabel)}</a>`).join('')}</div></section>` : ''}
        </div>
      </div></div>`;

    if (r.payment.hasReceipt) API.get(`/api/requests/${r.id}/receipt`).then((x) => {
      $('#rcpt').innerHTML = `<p class="label" style="margin-bottom:.4rem">Receipt photo</p><img class="receipt-thumb" src="${esc(x.image)}" alt="Receipt photo">`;
      $('#rcpt img').onclick = () => modal(`<img src="${esc(x.image)}" alt="Receipt photo" style="width:100%;border-radius:10px"><div class="modal-foot"><button class="btn" data-close>Close</button></div>`, { wide: true });
    }).catch(() => { $('#rcpt').innerHTML = ''; });

    const after = (msg) => { toast(msg, 'success'); App.route(); };
    $$('[data-to]').forEach((b) => (b.onclick = async () => {
      const to = b.dataset.to, note = ($('#snote') || {}).value || '';
      if (to === 'rejected') return declineModal(r, after);
      if (to === 'noshow' && !(await confirmBox({ title: 'Close as not claimed?', body: 'The student will need to submit a new request.', ok: 'Close it', danger: true }))) return;
      busy(b, async () => { await API.post(`/api/requests/${r.id}/transition`, { to, note }); after(`${ACTION[to][0]}: done. ${r.student.name.split(' ')[0]} was notified.`); });
    }));
    const ok = $('#payOk'), no = $('#payNo');
    if (ok) ok.onclick = () => busy(ok, async () => { await API.post(`/api/requests/${r.id}/verify-payment`, { ok: true }); after('Payment confirmed.'); });
    if (no) no.onclick = () => {
      const m = modal(`<h2>Receipt not accepted</h2><p class="muted small" style="margin:.3rem 0 1rem">Tell the student what to fix. They'll be asked to upload it again.</p>
        <div class="field"><label for="pnote">Reason</label><textarea class="input" id="pnote" placeholder="e.g. The photo is blurry. Please retake it so the OR number is readable."></textarea></div>
        <div class="modal-foot"><button class="btn" data-close>Go back</button><button class="btn btn-danger solid" id="pnSend">Send to student</button></div>`);
      $('#pnSend', m.el).onclick = (e) => busy(e.currentTarget, async () => { await API.post(`/api/requests/${r.id}/verify-payment`, { ok: false, note: $('#pnote', m.el).value }); m.close(); after('Student asked to re-upload.'); });
    };
  }, { role: 'staff' });

  function declineModal(r, after) {
    const m = modal(`<h2>Decline ${esc(r.ref)}</h2><p class="muted small" style="margin:.3rem 0 1rem">The student will see this reason.</p>
      <div class="stack" style="--gap:.5rem">${DECLINE_REASONS.map((x, i) => `<label class="choice"><input type="radio" name="dr" value="${i}"><span>${esc(x)}</span></label>`).join('')}</div>
      <div class="field" style="margin-top:.8rem"><label for="dtext">Reason</label><textarea class="input" id="dtext" placeholder="Pick one above or write your own"></textarea></div>
      <div class="modal-foot"><button class="btn" data-close>Go back</button><button class="btn btn-danger solid" id="dSend">Decline request</button></div>`);
    $$('input[name=dr]', m.el).forEach((i) => (i.onchange = () => { $('#dtext', m.el).value = DECLINE_REASONS[i.value]; }));
    $('#dSend', m.el).onclick = (e) => busy(e.currentTarget, async () => { await API.post(`/api/requests/${r.id}/transition`, { to: 'rejected', reason: $('#dtext', m.el).value }); m.close(); after('Request declined. The student was notified.'); });
  }
})();
