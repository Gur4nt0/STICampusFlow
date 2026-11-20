/* ==========================================================================
   pages/auth/auth-frame.js — two-column sign-in layout shared by Sign in and Create account
   ========================================================================== */
(function () {
  'use strict';
  const { $, esc, fmtTime, S, go, startPolling } = App;

  function authFrame(inner) {
    const root = $('#root');
    root.className = 'shell no-chrome';
    root.innerHTML = `<div class="auth">
      <section class="auth-art">
        <div class="row"><span class="brand-mark">CF</span><b style="font:700 1.15rem var(--font-head)">CampusFlow</b><span class="small" style="color:#C4D2EA">${esc(S.cfg ? S.cfg.campusName : '')}</span></div>
        <div>
          <h1>Get your school documents without the long line.</h1>
          <p>Request from the Registrar online, pick a time that has open seats, and we'll remind you the day before.</p>
          <div class="ticket-demo" aria-hidden="true"><span class="small">Your claim slip</span><b>Good Moral Certificate</b><span>Thu, 2 PM to 3 PM</span></div>
        </div>
        <p class="small" style="color:#8FA3C6">${esc(S.cfg ? S.cfg.officeName : '')}, open ${S.cfg ? fmtTime(S.cfg.openTime) + ' to ' + fmtTime(S.cfg.closeTime) : ''}, Monday to Friday</p>
      </section>
      <section class="auth-form"><div class="auth-card">${inner}</div></section>
    </div>
    <button class="icon-btn" id="themeBtn" data-act="theme" aria-label="Change theme" style="position:fixed;top:calc(1rem + env(safe-area-inset-top,0px));right:1rem"></button>`;
    App.renderThemeBtn();
  }
  function signedIn(user) {
    S.user = user; S.unread = 0; startPolling();
    go(user.role === 'student' ? '/home' : '/r/dashboard');
  }
  const domainText = () => (S.cfg && S.cfg.emailDomains && S.cfg.emailDomains.length ? S.cfg.emailDomains.map((d) => '@' + d).join(' or ') : 'your school email');

  Object.assign(App, { authFrame, signedIn, domainText });
})();
