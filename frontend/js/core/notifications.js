/* ==========================================================================
   core/notifications.js — polling for new notifications, browser pop-ups,
   and the small bell dropdown (like eLMS) in the top header.
   ========================================================================== */
(function () {
  'use strict';
  const { $, $$, esc, ico, ago, S } = App;
  const ICON = { reminder: 'clock', warning: 'alert', success: 'check', info: 'info' };
  const PANEL_COUNT = 6;

  /* ---------- browser pop-ups */
  function canBrowserNotify() { return 'Notification' in window && Notification.permission === 'granted'; }
  async function askNotifyPermission() {
    if (!('Notification' in window)) { App.toast('This browser does not support pop-up notifications. You will still see them in the bell.', 'error'); return false; }
    try { const p = await Notification.requestPermission(); if (p === 'granted') { App.toast('Reminders turned on.', 'success'); return true; } } catch (e) { /* blocked */ }
    App.toast('Pop-ups are blocked. You can allow them in your browser settings.', 'error');
    return false;
  }

  /* ---------- unread badge on the bell and in the sidebar */
  function drawBadges() {
    $$('.dot-badge, .nav-badge').forEach((b) => b.remove());
    if (!S.unread) return;
    const bell = $('#bellBtn'); if (bell) bell.insertAdjacentHTML('beforeend', `<span class="dot-badge">${S.unread > 99 ? '99+' : S.unread}</span>`);
    const link = $('.sidebar a[href="#/notifications"]'); if (link) link.insertAdjacentHTML('beforeend', `<span class="nav-badge">${S.unread}</span>`);
  }

  /* ---------- polling every 30 seconds */
  async function poll(initial) {
    if (!S.user) return;
    try {
      const n = await API.get('/api/notifications');
      const newest = n.items.length ? n.items[0].id : 0;
      if (!initial) {
        const fresh = n.items.filter((i) => i.id > S.lastNotifId && !i.read).reverse();
        for (const f of fresh) {
          App.toast(`${f.title} — ${f.body}`, f.kind === 'warning' ? 'error' : '');
          if (canBrowserNotify()) { try { new Notification(f.title, { body: f.body, tag: 'cf-' + f.id }); } catch (e) { /* ignore */ } }
        }
      }
      S.lastNotifId = Math.max(S.lastNotifId, newest);
      if (n.unread !== S.unread) { S.unread = n.unread; drawBadges(); }
    } catch (e) { /* offline — try again later */ }
  }
  function startPolling() { clearInterval(S.pollTimer); poll(true); S.pollTimer = setInterval(() => poll(false), 30000); }

  /* ---------- one compact notification row (used by the dropdown and the full page) */
  function notifItem(i, { compact = false } = {}) {
    const base = App.isStaff() ? '#/r/request/' : '#/request/';
    return `<a class="notif ${compact ? 'compact' : ''} ${i.read ? '' : 'unread'} ${esc(i.kind)}" href="${i.requestId ? base + i.requestId : '#/notifications'}" data-nid="${i.id}">
      <span class="ic">${ico(ICON[i.kind] || 'info')}</span>
      <span class="nb"><b>${esc(i.title)}</b><span class="body">${esc(i.body)}</span><time>${esc(ago(i.at))}</time></span>
      ${i.read ? '' : '<span class="unread-dot" aria-label="Unread"></span>'}
    </a>`;
  }
  function markReadOnClick(scope) {
    $$('.notif[data-nid]', scope).forEach((a) => a.addEventListener('click', () => {
      closeNotifPanel();
      API.post('/api/notifications/read', { id: Number(a.dataset.nid) }).then(() => poll(true)).catch(() => {});
    }));
  }

  /* ---------- the bell dropdown */
  let panel = null;
  const notifPanelOpen = () => !!panel;
  function closeNotifPanel() {
    if (!panel) return;
    panel.remove(); panel = null;
    const b = $('#bellBtn'); if (b) b.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', onKey);
  }
  function outside(e) { if (panel && !panel.contains(e.target) && !e.target.closest('#bellBtn')) closeNotifPanel(); }
  function onKey(e) { if (e.key === 'Escape') { closeNotifPanel(); const b = $('#bellBtn'); if (b) b.focus(); } }

  async function toggleNotifPanel() {
    if (panel) return closeNotifPanel();
    const anchor = $('.notif-anchor'); if (!anchor) return App.go('/notifications');
    panel = document.createElement('div');
    panel.className = 'notif-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Notifications');
    panel.innerHTML = `<div class="np-head"><b>Notifications</b></div><div class="np-list"><div class="np-empty">Loading…</div></div>`;
    anchor.appendChild(panel);
    $('#bellBtn').setAttribute('aria-expanded', 'true');
    setTimeout(() => { document.addEventListener('click', outside, true); document.addEventListener('keydown', onKey); }, 0);
    await drawPanel();
  }
  async function drawPanel() {
    if (!panel) return;
    let n;
    try { n = await API.get('/api/notifications'); }
    catch (e) { if (panel) $('.np-list', panel).innerHTML = `<div class="np-empty">${esc(e.message)}</div>`; return; }
    if (!panel) return;
    S.unread = n.unread; drawBadges();
    const items = n.items.slice(0, PANEL_COUNT);
    panel.innerHTML = `
      <div class="np-head"><b>Notifications</b>${n.unread ? `<span class="np-count">${n.unread} new</span>` : ''}<span class="spacer"></span>
        ${n.unread ? '<button class="link-btn small" data-np="readall">Mark all as read</button>' : ''}</div>
      <div class="np-list">${items.length ? items.map((i) => notifItem(i, { compact: true })).join('') : `<div class="np-empty">${ico('bell')}<span>You're all caught up.</span></div>`}</div>
      <a class="np-foot" href="#/notifications">See all notifications${n.items.length > PANEL_COUNT ? ` (${n.items.length})` : ''}</a>`;
    markReadOnClick(panel);
    $('.np-foot', panel).onclick = () => closeNotifPanel();
    const ra = $('[data-np=readall]', panel);
    if (ra) ra.onclick = async (e) => { e.stopPropagation(); await API.post('/api/notifications/read', {}).catch(() => {}); await poll(true); drawPanel(); };
  }

  Object.assign(App, { poll, startPolling, askNotifyPermission, canBrowserNotify, drawBadges, notifItem, markReadOnClick, toggleNotifPanel, closeNotifPanel, notifPanelOpen });
})();
