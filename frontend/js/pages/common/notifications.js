/* ==========================================================================
   pages/common/notifications.js — full Notifications page (#/notifications)
   Uses the same compact rows as the bell dropdown (App.notifItem).
   ========================================================================== */
(function () {
  'use strict';
  const { $, ico, busy, frame, defineRoute } = App;

  defineRoute('/notifications', async () => {
    const main = frame('Notifications', { rail: !App.isStaff() });
    main.innerHTML = '<div class="page narrow"><div class="skeleton"></div></div>';
    const n = await API.get('/api/notifications');
    main.innerHTML = `<div class="page narrow">
      <div class="page-head"><div><h1>Notifications</h1><p>Reminders, status updates and office notices.</p></div>
        <div class="row">${!App.canBrowserNotify() && 'Notification' in window ? `<button class="btn btn-sm" id="enablePush">${ico('bell')}Turn on pop-up reminders</button>` : ''}
        ${n.unread ? `<button class="btn btn-sm" id="readAll">${ico('check')}Mark all as read</button>` : ''}</div></div>
      ${n.items.length ? `<div class="notif-list">${n.items.map((i) => App.notifItem(i, { compact: true })).join('')}</div>`
        : '<div class="empty">Nothing here yet. We\'ll let you know when something changes.</div>'}</div>`;
    const ra = $('#readAll');
    if (ra) ra.onclick = () => busy(ra, async () => { await API.post('/api/notifications/read', {}); await App.poll(true); App.route(); });
    const ep = $('#enablePush');
    if (ep) ep.onclick = async () => { if (await App.askNotifyPermission()) ep.remove(); };
    App.markReadOnClick(main);
  });
})();
