/* ==========================================================================
   pages/auth/login.js — Sign in page (#/login) for students and registrar staff
   ========================================================================== */
(function () {
  'use strict';
  const { $, $$, esc, ico, busy, S, go, defineRoute, authFrame, signedIn, domainText } = App;

  defineRoute('/login', (p, q) => {
    const staffTab = q.as === 'staff';
    const demo = S.cfg && S.cfg.demoStudent;
    authFrame(`
      <h2 style="font-size:1.7rem">Sign in</h2>
      <div class="tabs" role="tablist" style="margin:1rem 0 1.2rem"><button class="${staffTab ? '' : 'on'}" data-as="student">Student</button><button class="${staffTab ? 'on' : ''}" data-as="staff">Registrar staff</button></div>
      ${q.error ? `<div class="note danger" style="margin-bottom:1rem">${ico('alert')}<div>${esc(q.error)}</div></div>` : ''}
      ${staffTab ? `
        <form class="stack" id="loginForm" novalidate>
          <div class="field"><label for="lid">Staff ID</label><input class="input" id="lid" name="loginId" autocomplete="username" placeholder="REG-001" required></div>
          <div class="field"><label for="pw">Password</label><input class="input" id="pw" name="password" type="password" autocomplete="current-password" required></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in</button>
        </form>
        <div class="card flat tight ${S.cfg && S.cfg.demoAccounts === false ? 'hidden' : ''}" style="margin-top:1.4rem;background:var(--surface-2)">
          <p class="label">Demo account</p><p class="small muted" style="margin:.2rem 0 .7rem">Tap to fill in the form.</p>
          <button class="btn btn-sm" data-demo="REG-001|Registrar@123">Registrar (head)</button></div>`
      : `
        <form class="stack" id="loginForm" novalidate>
          <div class="field"><label for="lid">Student number or school email</label><input class="input" id="lid" name="loginId" autocomplete="username" placeholder="02000123456" required></div>
          <div class="field"><label for="pw">Password</label><input class="input" id="pw" name="password" type="password" autocomplete="current-password" required></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in</button>
        </form>
        <p class="small muted" style="margin-top:1rem">New here? <a class="link-btn" href="#/register">Create your account</a> using your school email (${esc(domainText())}).</p>
        ${demo ? `<div class="card flat tight" style="margin-top:1.2rem;background:var(--surface-2)">
          <p class="label">Demo account</p><p class="small muted" style="margin:.2rem 0 .7rem">Tap to fill in the form.</p>
          <button class="btn btn-sm" data-demo="${esc(demo.loginId)}|${esc(demo.password)}">Juan Dela Cruz (student)</button></div>` : ''}`}`);
    $$('[data-as]').forEach((b) => (b.onclick = () => go('/login' + (b.dataset.as === 'staff' ? '?as=staff' : ''))));
    const f = $('#loginForm');
    $$('[data-demo]').forEach((b) => (b.onclick = () => { const [a, pw] = b.dataset.demo.split('|'); f.loginId.value = a; f.password.value = pw; f.querySelector('button[type=submit]').focus(); }));
    f.onsubmit = (e) => {
      e.preventDefault();
      busy(f.querySelector('button[type=submit]'), async () => { const r = await API.post('/api/auth/login', { loginId: f.loginId.value, password: f.password.value }); signedIn(r.user); });
    };
  }, { public: true });
})();
