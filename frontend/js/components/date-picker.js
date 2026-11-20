/* ==========================================================================
   components/date-picker.js — calendar + time windows with live seat counts.
   Past days are shown in red and cannot be picked; only today onward is bookable.
   ========================================================================== */
(function () {
  'use strict';
  const { $, $$, esc, ico, fmtDate, fmtTime, MONTHS_LONG, todayStr, S } = App;

  /* ---------- date & time picker (calendar + windows with live seat counts) */
  function picker(el, { query, exclude, onChange, reasonText }) {
    let month = '', avail = null, selDate = null, selSlot = null, first = true, slotsData = null;
    const nowMonth = todayStr().slice(0, 7);
    el.innerHTML = `<div class="split" style="align-items:start"><div class="card cal" id="pkCal"><div class="skeleton"></div></div><div class="card" id="pkSlots"></div></div>`;
    const calEl = $('#pkCal', el), slotEl = $('#pkSlots', el);
    drawSlots();

    async function load() {
      calEl.innerHTML = '<div class="skeleton"></div>';
      try { avail = await API.get(`/api/availability?month=${month}&${query}`); }
      catch (e) { calEl.innerHTML = `<div class="note danger">${ico('alert')}<div>${esc(e.message)}</div></div>`; return; }
      month = avail.month;
      if (first) {
        first = false;
        if (!avail.days.some((d) => d.state === 'open') && avail.earliest.slice(0, 7) > month) { month = avail.earliest.slice(0, 7); return load(); }
      }
      drawCal();
    }
    function drawCal() {
      const [y, m] = month.split('-').map(Number);
      const lead = new Date(y, m - 1, 1).getDay();
      const cells = [];
      const today = todayStr();
      for (let i = 0; i < lead; i++) cells.push('<div></div>');
      for (const d of avail.days) {
        const n = Number(d.date.slice(8));
        // Days before today are always red and disabled: only today onward can be booked.
        const past = d.state === 'past' || d.date < today;
        const pickable = d.state === 'open' && !past;
        const off = !pickable && d.state !== 'full';
        const cls = ['cal-day', pickable ? 'open' : '', past ? 'past' : '', !past && d.state === 'full' ? 'full off' : '', off ? 'off' : '', !past && d.state === 'closed' ? 'closed' : '', !past && d.state === 'mine' ? 'mine' : '', d.date === today ? 'today' : '', d.date === selDate ? 'sel' : ''].join(' ');
        const label = past ? '' : d.state === 'open' ? `${d.left} seats` : d.state === 'full' ? 'Full' : d.state === 'mine' ? 'Booked' : '';
        const title = past ? `${fmtDate(d.date)}: this day has passed` : d.state === 'open' ? `${fmtDate(d.date)}: ${d.left} seats left${d.note ? ' — ' + d.note : ''}` : `${fmtDate(d.date)}: ${d.reason}`;
        cells.push(`<button type="button" class="${cls}" data-date="${d.date}" ${pickable ? '' : 'disabled aria-disabled="true"'} title="${esc(title)}" aria-label="${esc(title)}">${n}${label ? `<small>${label}</small>` : ''}${d.note && !past ? '<span class="flag"></span>' : ''}</button>`);
      }
      const earliestNote = avail.processingDays > 0
        ? `Earliest claim date: <b>${esc(fmtDate(avail.earliest))}</b>. ${esc(reasonText || `Your documents need ${avail.processingDays} working day${avail.processingDays > 1 ? 's' : ''} to prepare.`)}`
        : 'Pick any open day.';
      calEl.innerHTML = `
        <div class="cal-head">
          <button class="icon-btn" data-nav="-1" aria-label="Previous month" ${month <= nowMonth ? 'disabled' : ''}>${ico('left')}</button>
          <h3>${MONTHS_LONG[m - 1]} ${y}</h3>
          <button class="icon-btn" data-nav="1" aria-label="Next month">${ico('right')}</button>
        </div>
        <p class="small muted" style="margin-bottom:.8rem">${earliestNote}</p>
        <div class="cal-grid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}${cells.join('')}</div>
        <div class="cal-legend"><span><i style="border-color:var(--success)"></i>Open</span><span><i class="lg-past"></i>Past date (can't pick)</span><span><i class="lg-closed"></i>Full or closed</span><span><i style="border-style:dashed"></i>Not available</span><span><i style="background:var(--primary-soft);border-color:var(--primary)"></i>You already have a visit</span><span><i style="background:var(--warn);border-color:var(--warn);border-radius:50%"></i>Notice for that day</span></div>`;
      $$('[data-nav]', calEl).forEach((b) => (b.onclick = () => {
        const d = new Date(y, m - 1 + Number(b.dataset.nav), 1);
        month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; load();
      }));
      $$('[data-date]', calEl).forEach((b) => (b.onclick = () => { if (!b.disabled && b.dataset.date >= today) pickDate(b.dataset.date); }));
    }
    async function pickDate(date) {
      selDate = date; selSlot = null; onChange(null); drawCal();
      slotEl.innerHTML = '<div class="skeleton"></div>';
      try { slotsData = await API.get(`/api/slots?date=${date}${exclude ? '&exclude=' + exclude : ''}`); }
      catch (e) { slotEl.innerHTML = `<p>${esc(e.message)}</p>`; return; }
      drawSlots();
      if (window.innerWidth < 1024) slotEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function slotBtn(s) {
      const meter = s.capacity <= 12 ? `<div class="seats">${Array.from({ length: s.capacity }, (_, i) => `<i class="${i < s.booked ? 'taken' : ''}"></i>`).join('')}</div>` : '';
      const text = !s.available ? (s.reason === 'Full' ? 'Full' : 'Too soon to book') : `${s.left} of ${s.capacity} seats left`;
      return `<button type="button" class="slot ${selSlot === s.start ? 'sel' : ''} ${s.available && s.left <= Math.ceil(s.capacity / 3) ? 'low' : ''}" data-slot="${s.start}" ${s.available ? '' : 'disabled'}>
        <b>${fmtTime(s.start)} <small>to ${fmtTime(s.end)}</small></b>${meter}<span class="seat-text">${text}</span></button>`;
    }
    function drawSlots() {
      if (!selDate) { slotEl.innerHTML = `<h3>Pick a time</h3><p class="muted small" style="margin-top:.4rem">Choose a day on the calendar first. Each ${S.cfg ? S.cfg.slotMinutes : 30}-minute window only takes a few students, so the line stays short.</p>`; return; }
      const am = slotsData.slots.filter((s) => s.start < '12:00'), pm = slotsData.slots.filter((s) => s.start >= '12:00');
      slotEl.innerHTML = `
        <h3>${esc(fmtDate(selDate))}</h3>
        ${slotsData.note ? `<div class="note warn" style="margin-top:.7rem">${ico('alert')}<div><b>Classes suspended, office open.</b> ${esc(slotsData.note)}</div></div>` : ''}
        <p class="label" style="margin:1rem 0 .5rem">Morning</p><div class="slots">${am.map(slotBtn).join('') || '<p class="small muted">None</p>'}</div>
        <p class="label" style="margin:1rem 0 .5rem">Afternoon <span class="muted small">(closed ${fmtTime(S.cfg.lunchStart)}–${fmtTime(S.cfg.lunchEnd)} for lunch)</span></p><div class="slots">${pm.map(slotBtn).join('')}</div>`;
      $$('[data-slot]', slotEl).forEach((b) => (b.onclick = () => {
        selSlot = b.dataset.slot;
        const s = slotsData.slots.find((x) => x.start === selSlot);
        drawSlots(); onChange({ date: selDate, slot: s });
      }));
    }
    load();
  }
  App.picker = picker;
})();
