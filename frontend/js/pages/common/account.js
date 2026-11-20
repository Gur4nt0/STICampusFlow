/* ==========================================================================
   pages/common/account.js — Account page (#/account): email notices, password, theme, pop-ups
   ========================================================================== */
(function () {
  'use strict';
  const { $, $$, esc, ico, toast, busy, S, frame, defineRoute } = App;

  /* ---- where email notices go: school Outlook address, a personal address, or nowhere */
  function drawNotify() {
    const box = $('#notifyCard');
    if (!box) return;
    const u = S.user;
    const serverEmail = S.cfg && S.cfg.emailNotifications;
    const usingPersonal = !!u.notifyEmail;
    const off = !u.emailNotify;
    box.innerHTML = `<h3>Email notices</h3>
      <p class="small muted" style="margin:.3rem 0 .9rem">Reminders and status updates always appear in the bell. Choose where they are also emailed.</p>
      ${serverEmail ? '' : `<div class="note info" style="margin-bottom:.9rem">${ico('info')}<div class="small">Email sending is not switched on for this server yet, so notices appear in the app only. Your choice here is saved for when it is.</div></div>`}
      <div class="stack" style="--gap:.6rem">
        <label class="choice"><input type="radio" name="notifyTo" value="school" ${!off && !usingPersonal ? 'checked' : ''}>
          <span><b>My school email</b><br><span class="small muted">${esc(u.email || 'No school email on file')}</span></span></label>
        <label class="choice"><input type="radio" name="notifyTo" value="personal" ${!off && usingPersonal ? 'checked' : ''}>
          <span><b>A personal email</b><br><span class="small muted">${usingPersonal ? esc(u.notifyEmail) : 'Gmail, Yahoo, or any address you check'}</span></span></label>
        <label class="choice"><input type="radio" name="notifyTo" value="off" ${off ? 'checked' : ''}>
          <span><b>Do not email me</b><br><span class="small muted">Notices stay inside CampusFlow only</span></span></label>
      </div>
      <div id="notifyExtra" style="margin-top:.9rem"></div>`;
    $$('input[name=notifyTo]', box).forEach((r) => (r.onchange = () => pickNotify(r.value)));
    drawNotifyExtra();
  }

  function drawNotifyExtra() {
    const box = $('#notifyExtra');
    if (!box) return;
    const u = S.user;
    const chosen = ($('input[name=notifyTo]:checked') || {}).value;
    if (u.notifyPending) {
      box.innerHTML = `<div class="note info">${ico('info')}<div class="small">We sent a 6-digit code to <b>${esc(u.notifyPending)}</b>. Type it below to start sending notices there. Check the spam folder if it has not arrived.</div></div>
        <form class="row" id="codeForm" style="gap:.5rem;margin-top:.7rem">
          <input class="input" id="notifyCode" inputmode="numeric" maxlength="6" placeholder="6-digit code" style="max-width:160px;letter-spacing:.2em;text-align:center" required>
          <button class="btn btn-primary" type="submit">Confirm</button>
          <button class="btn" type="button" id="cancelPending">Cancel</button></form>`;
      $('#codeForm').onsubmit = (e) => {
        e.preventDefault();
        busy($('#codeForm button[type=submit]'), async () => {
          const r = await API.post('/api/me/notify-email/confirm', { code: $('#notifyCode').value });
          S.user = r.user; toast('Confirmed. Notices will be sent there from now on.', 'success'); drawNotify();
        });
      };
      $('#cancelPending').onclick = () => busy($('#cancelPending'), async () => {
        const r = await API.post('/api/me/notify-email/clear'); S.user = r.user; drawNotify();
      });
      return;
    }
    if (chosen === 'personal') {
      box.innerHTML = `<form class="row" id="addrForm" style="gap:.5rem">
          <input class="input grow" id="notifyAddr" type="email" placeholder="yourname@gmail.com" value="${esc(u.notifyEmail || '')}" style="flex:1 1 220px" required>
          <button class="btn btn-primary" type="submit">${u.notifyEmail ? 'Change address' : 'Send code'}</button></form>
        <p class="hint small">We email a code to that address first, so nothing is sent anywhere by mistake.</p>`;
      $('#addrForm').onsubmit = (e) => {
        e.preventDefault();
        busy($('#addrForm button[type=submit]'), async () => {
          const r = await API.post('/api/me/notify-email', { email: $('#notifyAddr').value });
          S.user = r.user;
          toast(r.confirmed ? 'Switched back to your school email.' : 'Code sent. Check that inbox.', 'success');
          drawNotify();
        });
      };
      return;
    }
    box.innerHTML = '';
  }

  async function pickNotify(choice) {
    try {
      if (choice === 'off') {
        const r = await API.post('/api/me/email-notify', { enabled: false });
        S.user = r.user; toast('Email notices turned off.', 'success'); return drawNotify();
      }
      if (choice === 'school') {
        if (!S.user.emailNotify) { const r = await API.post('/api/me/email-notify', { enabled: true }); S.user = r.user; }
        if (S.user.notifyEmail || S.user.notifyPending) { const r2 = await API.post('/api/me/notify-email/clear'); S.user = r2.user; }
        toast('Notices will go to your school email.', 'success');
        return drawNotify();
      }
      if (!S.user.emailNotify) { const r = await API.post('/api/me/email-notify', { enabled: true }); S.user = r.user; }
      drawNotifyExtra();
    } catch (e) { toast(e.message, 'error'); }
  }

  /* ================================================================ account */
  defineRoute('/account', () => {
    const main = frame('Account');
    const u = S.user;
    const pref = App.store('cf_theme') || 'system';
    main.innerHTML = `<div class="page narrow stack" style="--gap:1.25rem">
      <div class="page-head" style="margin-bottom:0"><div><h1>Account</h1></div></div>
      <div class="card"><div class="row"><span class="avatar" style="width:56px;height:56px;font-size:1.1rem">${esc(App.initials(u.name))}</span>
        <div><h2>${esc(u.name)}</h2><p class="muted">${esc(u.loginId)}${u.program ? ' — ' + esc(u.program) : ''}${u.yearLevel ? ', year ' + u.yearLevel : ''}</p></div></div>
        ${u.email ? `<dl class="kv" style="margin-top:1rem"><dt>Email</dt><dd>${esc(u.email)}</dd></dl>` : ''}</div>
      <div class="card" id="notifyCard"></div>
      <div class="card"><h3>Password</h3>
        <p class="small muted" style="margin:.3rem 0 .8rem">Changing it signs you out on every other device.</p>
        <form class="stack" id="pwForm" novalidate style="--gap:.7rem">
          <div class="field"><label for="pw0">Current password</label><input class="input" id="pw0" name="currentPassword" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="pw1">New password</label><input class="input" id="pw1" name="newPassword" type="password" autocomplete="new-password" data-strength required></div>
          <div class="field"><label for="pw2">Repeat new password</label><input class="input" id="pw2" name="newPassword2" type="password" autocomplete="new-password" data-match="#pw1" required></div>
          <button class="btn btn-primary" type="submit">Save new password</button>
        </form></div>
      <div class="card"><h3>Appearance</h3><p class="small muted" style="margin:.3rem 0 .8rem">Dark mode is easier on the eyes at night.</p>
        <div class="grid-3" id="themeChoice">${[['light', 'Light'], ['dark', 'Dark'], ['system', 'Match my device']].map(([v, l]) => `<label class="choice"><input type="radio" name="theme" value="${v}" ${pref === v ? 'checked' : ''}><span><b>${l}</b></span></label>`).join('')}</div></div>
      <div class="card"><h3>Pop-up reminders</h3>
        <p class="small muted" style="margin:.3rem 0 .8rem">Get a pop-up a day before and on the day of your appointment, even when this tab is in the background. Reminders always appear in the bell too.</p>
        <div id="pushState"></div></div>
      ${API.demo ? `<div class="card"><h3>Live preview data</h3><p class="small muted" style="margin:.3rem 0 .8rem">This preview keeps its data in your browser. Reset it to start over with fresh demo data.</p><button class="btn btn-danger" id="resetDemo">${ico('refresh')}Reset demo data</button></div>` : ''}
      <button class="btn btn-lg" data-act="logout">${ico('logout')}Sign out</button>
    </div>`;
    drawNotify();
    $$('#themeChoice input').forEach((i) => (i.onchange = () => { App.store('cf_theme', i.value); App.applyTheme(i.value); App.renderThemeBtn(); }));
    const pf = $('#pwForm');
    if (pf) pf.onsubmit = (e) => {
      e.preventDefault();
      if (pf.newPassword.value !== pf.newPassword2.value) return toast('The two new passwords do not match.', 'error');
      if (App.passwordStrength(pf.newPassword.value).level === 0) { pf.newPassword.focus(); return toast('The new password is too weak. ' + App.passwordStrength(pf.newPassword.value).tip, 'error'); }
      busy(pf.querySelector('button[type=submit]'), async () => {
        await API.post('/api/me/password', { currentPassword: pf.currentPassword.value, newPassword: pf.newPassword.value });
        pf.reset();
        toast('Password saved. Other devices were signed out.', 'success');
      });
    };
    const ps = $('#pushState');
    const drawPush = () => {
      if (!('Notification' in window)) ps.innerHTML = '<p class="small">This browser does not support pop-ups. Check the bell icon instead.</p>';
      else if (Notification.permission === 'granted') ps.innerHTML = `<div class="note success">${ico('check')}<div>Pop-up reminders are on.</div></div>`;
      else { ps.innerHTML = `<button class="btn btn-primary" id="pushBtn">${ico('bell')}Turn on pop-up reminders</button>`; $('#pushBtn').onclick = async () => { await App.askNotifyPermission(); drawPush(); }; }
    };
    drawPush();
    const rd = $('#resetDemo');
    if (rd) rd.onclick = async () => { if (await App.confirmBox({ title: 'Reset demo data?', body: 'Everything you did in this preview will be erased.', ok: 'Reset', danger: true })) API.resetDemo(); };
  });
})();
