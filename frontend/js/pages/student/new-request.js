/* ==========================================================================
   pages/student/new-request.js — "Request a document" wizard (#/new): documents → date & time → review
   ========================================================================== */
(function () {
  'use strict';
  const { U, $, $$, esc, ico, fmtDate, fmtTime, whenWords, busy, S, frame, defineRoute, dateBox } = App;
  const PURPOSES = ['Scholarship application', 'Employment', 'Transfer to another school', 'Internship requirement', 'Board exam', 'Visa or travel', 'Personal copy', 'Other'];

  /* ================================================================ new request wizard */
  defineRoute('/new', async (params, q) => {
    const main = frame('Request a document');
    if (!S.docs) S.docs = await API.get('/api/documents');
    if (!S.draft) S.draft = { items: {}, step: 1, date: null, slot: null, purpose: '', note: '' };
    if (q.doc && S.docs.some((d) => d.code === q.doc)) { const d = S.docs.find((x) => x.code === q.doc); S.draft.items[d.id] = S.draft.items[d.id] || 1; }
    render();

    function totals() {
      const ids = Object.keys(S.draft.items).map(Number);
      const docs = ids.map((id) => S.docs.find((d) => d.id === id)).filter(Boolean);
      const total = docs.reduce((a, d) => a + d.fee * S.draft.items[d.id], 0);
      const copies = docs.reduce((a, d) => a + S.draft.items[d.id], 0);
      return { docs, total, copies };
    }
    function stepsBar() {
      const st = S.draft.step;
      return `<ol class="steps">${['Documents', 'Date and time', 'Review'].map((l, i) => `<li class="${i + 1 < st ? 'done' : i + 1 === st ? 'current' : ''}">${l}</li>`).join('')}</ol>`;
    }
    function render() {
      const st = S.draft.step;
      if (st === 1) step1(); else if (st === 2) step2(); else step3();
    }

    function step1() {
      const t = totals();
      const cats = ['records', 'certification', 'clearance', 'enrollment'];
      main.innerHTML = `<div class="page">
        ${stepsBar()}
        <div class="page-head"><div><h1>What do you need?</h1><p>Tap a card to choose it. You can pick more than one and set how many copies.</p></div></div>
        <div class="note warn">${ico('coins')}<div><b>Some documents have a fee</b> (for example Good Moral, Form 137 and Form 138). After you submit, you'll get a <b>payment slip</b> to bring to the Cashier. Then upload your official receipt here.</div></div>
        ${cats.map((c) => {
          const docs = S.docs.filter((d) => d.category === c);
          if (!docs.length) return '';
          return `<h2 class="section-title"><span class="swatch" style="background:var(--cat-${c})"></span>${esc(S.cfg.categories[c])}</h2>
            <div class="grid-2">${docs.map(docCard).join('')}</div>`;
        }).join('')}
        <div class="summary-bar" role="region" aria-label="Selection summary">
          <div class="sum-text">${t.docs.length ? `<b>${t.docs.length} document${t.docs.length > 1 ? 's' : ''}, ${t.copies} cop${t.copies > 1 ? 'ies' : 'y'}</b><span>${t.total > 0 ? 'To pay at the Cashier: ' + U.peso(t.total) : 'Free of charge'}</span>` : '<b>Nothing chosen yet</b><span>Pick at least one document</span>'}</div>
          <button class="btn btn-accent btn-lg" id="toStep2" ${t.docs.length ? '' : 'disabled'}>Next: pick a time</button>
        </div></div>`;
      $$('.doc-card', main).forEach((card) => {
        const id = Number(card.dataset.id);
        card.addEventListener('click', (e) => {
          if (e.target.closest('.stepper')) return;
          if (S.draft.items[id]) delete S.draft.items[id]; else S.draft.items[id] = 1;
          S.draft.date = null; S.draft.slot = null; step1();
          const again = $(`.doc-card[data-id="${id}"]`); if (again) again.focus();
        });
        card.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); card.click(); } });
      });
      $$('.stepper button', main).forEach((b) => (b.onclick = (e) => {
        e.stopPropagation();
        const id = Number(b.dataset.id), d = S.docs.find((x) => x.id === id);
        const v = (S.draft.items[id] || 0) + Number(b.dataset.step);
        if (v < 1) delete S.draft.items[id]; else S.draft.items[id] = Math.min(d.maxCopies, v);
        step1();
      }));
      $('#toStep2').onclick = () => { S.draft.step = 2; render(); window.scrollTo(0, 0); };
    }
    function docCard(d) {
      const n = S.draft.items[d.id] || 0;
      return `<div class="doc-card ${n ? 'selected' : ''}" data-cat="${d.category}" data-id="${d.id}" tabindex="0" role="checkbox" aria-checked="${n ? 'true' : 'false'}">
        <div class="doc-top"><div class="grow"><div class="doc-name">${esc(d.name)} <span class="tag">${esc(d.code)}</span></div><p class="doc-desc">${esc(d.description)}</p></div>
          <span class="check">${ico('check')}</span></div>
        <div class="doc-meta"><span>${ico('clock')}${d.processingDays} working day${d.processingDays > 1 ? 's' : ''} to prepare</span>
          <span class="${d.fee > 0 ? 'fee-strong' : ''}">${ico('coins')}${d.fee > 0 ? U.peso(d.fee) + ' per copy' : 'Free'}</span></div>
        <div class="doc-foot"><span class="small muted">Copies (max ${d.maxCopies})</span>
          <span class="stepper"><button type="button" data-id="${d.id}" data-step="-1" aria-label="Fewer copies" ${n ? '' : 'disabled'}>−</button><output>${n || 0}</output><button type="button" data-id="${d.id}" data-step="1" aria-label="More copies" ${n >= d.maxCopies ? 'disabled' : ''}>+</button></span></div>
      </div>`;
    }

    function step2() {
      const t = totals();
      const slowest = t.docs.slice().sort((a, b) => b.processingDays - a.processingDays)[0];
      main.innerHTML = `<div class="page">
        ${stepsBar()}
        <div class="page-head"><div><h1>When will you claim it?</h1><p>Green days have open seats. Each time window only takes ${S.cfg.defaultSlotCapacity} students, so nobody waits long.</p></div>
          <button class="btn" id="back1">${ico('back')}Change documents</button></div>
        <div id="pk"></div>
        <div class="summary-bar"><div class="sum-text" id="sum2"></div><button class="btn btn-accent btn-lg" id="toStep3" disabled>Next: review</button></div>
      </div>`;
      const drawSum = () => {
        $('#sum2').innerHTML = S.draft.slot ? `<b>${esc(fmtDate(S.draft.date))}, ${fmtTime(S.draft.slot.start)}</b><span>${t.docs.length} document${t.docs.length > 1 ? 's' : ''}</span>` : '<b>Pick a day, then a time</b><span>Grey days are closed or full</span>';
        $('#toStep3').disabled = !S.draft.slot;
      };
      S.draft.slot = null; drawSum();
      App.picker($('#pk'), {
        query: 'docs=' + t.docs.map((d) => d.id).join(','),
        reasonText: slowest && slowest.processingDays ? `${slowest.name} takes ${slowest.processingDays} working day${slowest.processingDays > 1 ? 's' : ''} to prepare.` : '',
        onChange: (v) => { S.draft.date = v ? v.date : null; S.draft.slot = v ? v.slot : null; drawSum(); },
      });
      $('#back1').onclick = () => { S.draft.step = 1; render(); };
      $('#toStep3').onclick = () => { S.draft.step = 3; render(); window.scrollTo(0, 0); };
    }

    function step3() {
      const t = totals();
      const s = S.draft.slot;
      main.innerHTML = `<div class="page narrow">
        ${stepsBar()}
        <div class="page-head"><div><h1>Check and submit</h1><p>Make sure everything is right. You can still move your time later.</p></div></div>
        <div class="card stack">
          <div class="appt">${dateBox(S.draft.date)}<div><div class="appt-time">${fmtTime(s.start)} – ${fmtTime(s.end)}</div><div class="countdown">${esc(whenWords(S.draft.date))}</div>
            <button class="link-btn small" id="chgTime" style="margin-top:.3rem">Change date or time</button></div></div>
          <table class="data" style="font-size:.95rem"><thead><tr><th>Document</th><th>Copies</th><th style="text-align:right">Fee</th></tr></thead>
            <tbody>${t.docs.map((d) => `<tr><td>${esc(d.name)}</td><td>${S.draft.items[d.id]}</td><td style="text-align:right">${d.fee > 0 ? U.peso(d.fee * S.draft.items[d.id]) : 'Free'}</td></tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="2"><b>Total to pay at the Cashier</b></td><td style="text-align:right"><b>${t.total > 0 ? U.peso(t.total) : 'Free'}</b></td></tr></tfoot></table>
          <div class="field"><label for="purp">What is it for?</label><select class="input" id="purp"><option value="">Choose one (optional)</option>${PURPOSES.map((p) => `<option ${S.draft.purpose === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
          <div class="field"><label for="note">Note to the Registrar (optional)</label><textarea class="input" id="note" maxlength="400" placeholder="e.g. Please include my second semester grades">${esc(S.draft.note)}</textarea></div>
        </div>
        <div class="note info" style="margin-top:1rem">${ico('clock')}<div><b>Please come on time.</b> You have a ${S.cfg.graceMinutes}-minute allowance. If you miss your window, your request is kept on hold for ${S.cfg.rescheduleWindowDays} days so you can pick a new time — it is not cancelled right away.</div></div>
        ${t.total > 0 ? `<div class="note warn" style="margin-top:.75rem">${ico('coins')}<div>After submitting, print or save your <b>payment slip</b>, pay ${U.peso(t.total)} at the Cashier, then upload the receipt. The Registrar prepares paid documents after the payment is confirmed.</div></div>` : ''}
        <div class="row between" style="margin-top:1.25rem">
          <button class="btn" id="back2">${ico('back')}Back</button>
          <button class="btn btn-accent btn-lg" id="submitReq">Submit request</button>
        </div></div>`;
      const save = () => { S.draft.purpose = $('#purp').value; S.draft.note = $('#note').value; };
      $('#chgTime').onclick = $('#back2').onclick = () => { save(); S.draft.step = 2; render(); };
      $('#submitReq').onclick = (e) => busy(e.currentTarget, async () => {
        save();
        const r = await API.post('/api/requests', { items: t.docs.map((d) => ({ docId: d.id, copies: S.draft.items[d.id] })), date: S.draft.date, slot: s.start, purpose: S.draft.purpose, note: S.draft.note });
        S.draft = null;
        App.poll(true);
        done(r);
      }).then(() => {});
    }

    function done(r) {
      window.scrollTo(0, 0);
      main.innerHTML = `<div class="page narrow stack" style="--gap:1.25rem">
        <div class="note success">${ico('check')}<div><b>Request sent!</b> Your reference number is <b>${esc(r.ref)}</b>.</div></div>
        <div class="card">
          <h2>What happens next</h2>
          <ol class="todo" style="margin-top:.9rem">
            ${r.totalFee > 0 ? `<li class="now"><div><b>Pay ${U.peso(r.totalFee)} at the Cashier</b><br><span class="small muted">Show your payment slip. Keep the official receipt.</span>
              <div class="row" style="margin-top:.6rem"><a class="btn btn-sm btn-primary" href="#/print/payment/${r.id}">${ico('printer')}Open payment slip</a></div></div></li>
              <li><div><b>Upload the receipt</b><br><span class="small muted">Type the OR number and add a photo on your request page.</span></div></li>` : ''}
            <li class="${r.totalFee > 0 ? '' : 'now'}"><div><b>Wait for approval</b><br><span class="small muted">We'll notify you, and remind you a day before your visit.</span></div></li>
            <li><div><b>Claim on ${esc(fmtDate(r.date))} at ${fmtTime(r.slotStart)}</b><br><span class="small muted">Bring your claim slip${r.totalFee > 0 ? ' and receipt' : ''}.</span></div></li>
          </ol>
        </div>
        <div class="row"><a class="btn btn-primary btn-lg" href="#/request/${r.id}">Go to my request</a><a class="btn btn-lg" href="#/print/claim/${r.id}">${ico('printer')}Claim slip</a></div>
      </div>`;
    }
  }, { role: 'student' });
})();
