/* ==========================================================================
   core/layout.js — the page frame: sidebar, top header, claiming-board rail,
   phone tab bar. Also hides the top header while scrolling down.
   ========================================================================== */
(function () {
  'use strict';
  const { $, esc, ico, initials, S, isStaff } = App;

  /* ---------- navigation menu for each role */
  const NAV = {
    student: [
      { path: '/home', label: 'Home', icon: 'home', tab: true },
      { path: '/new', label: 'Request a document', short: 'Request', icon: 'filePlus', tab: true, cta: true },
      { path: '/requests', label: 'My requests', short: 'Requests', icon: 'list', tab: true },
      { path: '/board', label: 'Claiming board', short: 'Board', icon: 'board', tab: true },
      { path: '/notifications', label: 'Notifications', icon: 'bell', badge: true },
      { path: '/account', label: 'Account', icon: 'user', tab: true },
    ],
    staff: [
      { path: '/r/dashboard', label: 'Dashboard', icon: 'grid', tab: true },
      { path: '/r/queue', label: 'Requests', icon: 'inbox', tab: true },
      { path: '/r/manifest', label: 'Claiming list', short: 'Today', icon: 'clipboard', tab: true },
      { path: '/r/calendar', label: 'Closures & notices', short: 'Notices', icon: 'calX', tab: true },
      { path: '/r/announcements', label: 'Announcements', icon: 'board' },
      { path: '/r/settings', label: 'Slip signature', icon: 'pen' },
      { path: '/r/email', label: 'Email setup', icon: 'bell', headOnly: true },
      { path: '/notifications', label: 'Notifications', icon: 'bell', badge: true },
      { path: '/account', label: 'Account', icon: 'user', tab: true },
    ],
  };

  function frame(title, { rail = false, chrome = true } = {}) {
    const root = $('#root');
    App.closeNotifPanel();
    if (!chrome) { root.className = 'shell no-chrome'; root.innerHTML = '<main class="main" id="main"></main>'; return $('#main'); }
    const nav = NAV[isStaff() ? 'staff' : 'student'];
    const path = App.currentPath();
    const active = (p) => path === p || path.startsWith(p + '/') || (p === '/requests' && path.startsWith('/request/')) || (p === '/r/queue' && path.startsWith('/r/request/'));
    const badge = S.unread ? `<span class="nav-badge">${S.unread}</span>` : '';
    const homePath = isStaff() ? '/r/dashboard' : '/home';
    root.className = 'shell' + (rail ? ' has-rail' : '');
    root.innerHTML = `
      <aside class="sidebar" aria-label="Main">
        <a class="brand" href="#${homePath}"><span class="brand-mark">CF</span><span><span class="brand-name">CampusFlow</span><br><span class="brand-sub">${esc(S.cfg ? S.cfg.campusName : 'STI College')}</span></span></a>
        ${!isStaff() ? `<a class="btn btn-accent nav-cta" href="#/new">${ico('plus')}Request a document</a>` : ''}
        ${nav.filter((n) => !n.cta && (!n.headOnly || S.user.role === 'head')).map((n) => `<a class="nav-link ${active(n.path) ? 'active' : ''}" href="#${n.path}">${ico(n.icon)}<span>${esc(n.label)}</span>${n.badge ? badge : ''}</a>`).join('')}
        <div class="sidebar-foot">
          <button class="nav-link" style="background:none;border:0;cursor:pointer;width:100%;text-align:left" data-act="logout">${ico('logout')}<span>Sign out</span></button>
        </div>
      </aside>
      <div class="main" id="mainCol">
        <header class="topbar" id="topbar">
          <a class="mobile-brand" href="#${homePath}"><span class="brand-mark">CF</span><b>CampusFlow</b></a>
          <div class="topbar-title">${esc(title)}</div>
          <div class="spacer"></div>
          <button class="icon-btn" id="themeBtn" data-act="theme" aria-label="Change theme"></button>
          <div class="notif-anchor">
            <button class="icon-btn" id="bellBtn" data-act="notif" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">${ico('bell')}${S.unread ? `<span class="dot-badge">${S.unread}</span>` : ''}</button>
          </div>
          <div class="who"><b>${esc(S.user.name)}</b><span>${esc(isStaff() ? (S.user.role === 'head' ? 'Registrar (head)' : 'Registrar staff') : S.user.loginId)}</span></div>
          <a class="avatar" href="#/account" aria-label="Account" style="text-decoration:none">${esc(initials(S.user.name))}</a>
        </header>
        <main id="main"></main>
      </div>
      ${rail ? '<aside class="rail" id="rail" aria-label="Claiming board"></aside>' : ''}
      <nav class="tabbar" aria-label="Main">
        ${nav.filter((n) => n.tab).map((n) => `<a class="${active(n.path) ? 'active' : ''} ${n.cta ? 'cta' : ''}" href="#${n.path}">${ico(n.icon)}<span>${esc(n.short || n.label)}</span></a>`).join('')}
      </nav>`;
    App.renderThemeBtn();
    lastY = window.scrollY;
    if (rail) App.renderBoard($('#rail'), { compact: true });
    return $('#main');
  }

  /* ---------- hide the top header while scrolling down, bring it back when scrolling up */
  let lastY = 0, ticking = false;
  function onScroll() {
    const bar = $('#topbar');
    if (!bar) return;
    const y = window.scrollY;
    const delta = y - lastY;
    if (Math.abs(delta) < 6) return;                 // ignore tiny jitters
    const hide = delta > 0 && y > 90 && !App.notifPanelOpen();
    bar.classList.toggle('is-hidden', hide);
    lastY = y;
  }
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; onScroll(); });
  }, { passive: true });
  // Keyboard users: show the header again when something inside it gets focus.
  document.addEventListener('focusin', (e) => { const bar = e.target.closest && e.target.closest('#topbar'); if (bar) bar.classList.remove('is-hidden'); });

  Object.assign(App, { NAV, frame });
})();
