/* ==========================================================================
   core/router.js — hash router (#/home, #/r/dashboard …) and global buttons
   (theme toggle, bell dropdown, sign out with confirmation).
   Pages register themselves with App.defineRoute(pattern, view, options).
   ========================================================================== */
(function () {
  'use strict';
  const { $, esc, ico, S } = App;

  const currentPath = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const go = (p) => { if (location.hash === '#' + p) route(); else location.hash = p; };

  const ROUTES = [];
  /* options: { public: true } sign-in pages · { open: true } anyone · { role: 'student' | 'staff' } */
  function defineRoute(pattern, view, opts = {}) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    ROUTES.push({ re, keys, view, opts });
  }

  async function route() {
    const path = currentPath();
    const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
    App.closeNotifPanel();
    if (!S.cfg) S.cfg = await API.get('/api/config').catch(() => null);
    if (S.user === null) {
      try { const me = await API.get('/api/me'); S.user = me.user; S.unread = me.unread; App.startPolling(); } catch (e) { S.user = false; }
    }
    const home = S.user ? (S.user.role === 'student' ? '/home' : '/r/dashboard') : '/login';
    if (path === '/' || path === '') return go(home);
    for (const r of ROUTES) {
      const m = path.match(r.re);
      if (!m) continue;
      if (!r.opts.open && !r.opts.public && !S.user) return go('/login');
      if (!r.opts.open && r.opts.public && S.user) return go(home);
      if (r.opts.role === 'student' && S.user.role !== 'student') return go(home);
      if (r.opts.role === 'staff' && S.user.role === 'student') return go(home);
      const params = {}; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      window.scrollTo(0, 0);
      try { await r.view(params, q); }
      catch (e) {
        if (e.status === 401) { S.user = false; return go('/login'); }
        const main = $('#main') || App.frame('Error');
        main.innerHTML = `<div class="page narrow"><div class="note danger">${ico('alert')}<div><b>That page could not load.</b><br>${esc(e.message)}</div></div><p style="margin-top:1rem"><a class="btn" href="#${home}">Go home</a></p></div>`;
      }
      return;
    }
    go(home);
  }

  /* ---------- sign out, after asking first */
  async function logout() {
    const ok = await App.confirmBox({
      title: 'Sign out?',
      body: 'Are you sure you want to log out of CampusFlow? You will need your ID and password to sign in again.',
      ok: 'Yes, sign out', cancel: 'Stay signed in', danger: true, icon: 'logout',
    });
    if (!ok) return;
    await API.post('/api/auth/logout').catch(() => {});
    S.user = false; S.draft = null; S.unread = 0; clearInterval(S.pollTimer);
    App.toast('You have been signed out.', 'success');
    go('/login');
  }

  /* ---------- global buttons marked with data-act */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'theme') App.toggleTheme();
    if (a.dataset.act === 'notif') { e.preventDefault(); App.toggleNotifPanel(); }
    if (a.dataset.act === 'logout') logout();
  });
  window.addEventListener('hashchange', route);

  Object.assign(App, { currentPath, go, route, defineRoute, logout });
})();
