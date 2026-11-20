/* ==========================================================================
   components/board.js — the claiming board (who is claiming today, seats left,
   announcements). Shown in the right rail and on the Board page.
   ========================================================================== */
(function () {
  'use strict';
  const { esc, fmtDate, fmtTime, ago } = App;

  /* ---------- claiming board (feedback item 3) */
  async function renderBoard(el, { compact = false } = {}) {
    if (!el) return;
    el.innerHTML = '<div class="skeleton"></div>';
    let b;
    try { b = await App.API_board(); } catch (e) { el.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; return; }
    const cap = b.slots.length ? b.slots[0].capacity : 5;
    const notice = b.notice ? `<div class="announce ${b.notice.kind === 'closed' ? 'closure' : 'suspension'}"><b>${b.notice.kind === 'closed' ? 'Office closed' : 'Classes suspended — office open'}</b><p>${esc(b.notice.reason)}</p></div>` : '';
    el.innerHTML = `
      <div class="stack" style="--gap:1.1rem">
        <div>
          <div class="board-head"><h3>${b.isToday ? 'Claiming today' : 'Claiming on ' + esc(fmtDate(b.date))}</h3><span class="board-live">Live</span></div>
          <p class="small muted" style="margin-bottom:.7rem">Student numbers are partly hidden for privacy. Look for yours to see your turn.</p>
          ${notice}
          ${b.claims.length ? `<ul class="claims" style="margin-top:.6rem">${b.claims.slice(0, compact ? 12 : 60).map((c) => `
            <li class="${c.mine ? 'mine' : ''} ${c.claimed ? 'done' : ''}">
              <span class="t">${fmtTime(c.time)}</span>
              <span class="cw"><b>${esc(c.who)}</b>${c.mine ? '<span class="you">You</span>' : ''}<span>${esc(c.doc)}</span></span>
              ${c.claimed ? `<span class="ok">Claimed</span>` : '<span></span>'}
            </li>`).join('')}</ul>${compact && b.claims.length > 12 ? `<p class="small" style="margin-top:.4rem"><a href="#/board">See all ${b.claims.length}</a></p>` : ''}`
            : '<div class="empty small">No one is scheduled yet.</div>'}
        </div>
        <div>
          <h3 style="font-size:.95rem">Seats left per window</h3>
          <div class="load">${b.slots.map((s) => `<div class="${s.left === 0 ? 'full' : s.left <= Math.ceil(cap / 3) ? 'low' : ''}">${fmtTime(s.start).replace(' ', '')}<span>${s.left === 0 ? 'Full' : s.left + ' left'}</span></div>`).join('')}</div>
        </div>
        <div>
          <h3 style="font-size:.95rem;margin-bottom:.6rem">Announcements</h3>
          <div class="stack" style="--gap:.6rem">${b.announcements.length ? b.announcements.map((a) => `<div class="announce ${esc(a.kind)}"><b>${esc(a.title)}</b>${a.body ? `<p>${esc(a.body)}</p>` : ''}<p class="tiny">${esc(ago(a.at))}</p></div>`).join('') : '<p class="small muted">No announcements right now.</p>'}</div>
        </div>
      </div>`;
  }
  App.API_board = () => API.get('/api/board');
  App.renderBoard = renderBoard;
})();
