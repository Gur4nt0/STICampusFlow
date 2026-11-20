/* ==========================================================================
   API client
   - Normal mode: talks to server.js over fetch (real SQLite database).
   - Demo mode (window.CAMPUSFLOW_DEMO = true): runs the SAME core logic inside
     the browser and saves data in localStorage. Used by the live preview.
   ========================================================================== */
(function () {
  'use strict';
  const DEMO = !!window.CAMPUSFLOW_DEMO;

  // Back-end address from env.js (made from .env → API_URL).
  // Blank means the back end is the same server that gave us this page.
  const BASE = String((window.CAMPUSFLOW_ENV || {}).apiUrl || '').replace(/\/+$/, '');
  const SAME = !BASE || BASE === location.origin;

  async function serverCall(method, path, body) {
    let res;
    try {
      res = await fetch((SAME ? '' : BASE) + path, {
        method, credentials: SAME ? 'same-origin' : 'include',
        headers: body ? { 'Content-Type': 'application/json', 'X-Requested-With': 'CampusFlow' } : { 'X-Requested-With': 'CampusFlow' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      const err = new Error(`Can't reach the CampusFlow server${SAME ? '' : ' at ' + BASE}. Make sure it is running (node backend/server.js) and that this address is allowed in .env (FRONTEND_URL / CORS_ORIGINS).`);
      err.status = 0; throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) { const err = new Error((data && data.error) || `Request failed (${res.status})`); err.status = res.status; throw err; }
    return data;
  }

  /* ---------- demo mode */
  let demo = null;
  function store(key, val) { try { if (val === undefined) return localStorage.getItem(key); if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (e) { return null; } }
  function initDemo() {
    const KEY = 'cf_demo_v2';
    const config = window.CAMPUSFLOW_CONFIG;
    let saved = null;
    try { saved = JSON.parse(store(KEY) || 'null'); } catch (e) { saved = null; }
    let timer = null;
    const repo = CampusMemoryRepo.createMemoryRepo(saved, (state) => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ } }, 150);
    });
    const hash = (pw) => 'demo$' + pw; // demo only — the real server uses PBKDF2
    const verify = (pw, h) => h === 'demo$' + pw;
    const sign = (ref) => { let h = 5381; for (const ch of 'cf-demo|' + ref) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(16).padStart(8, '0') + ref.length; };
    const core = CampusCore.createCore({ repo, config, hash, verify, sign });
    if (repo.isEmpty()) CampusSeed.seed(repo, { hash, now: () => new Date(), slots: core.slots, config });
    core.tick();
    setInterval(() => core.tick(), 30000);
    demo = { core, repo, KEY };
  }
  function demoCall(method, path, body) {
    if (!demo) initDemo();
    const u = new URL(path, 'http://demo');
    const uid = Number(store('cf_demo_session')) || null;
    const user = uid ? demo.repo.getUser(uid) : null;
    const out = demo.core.handle({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: body ? JSON.parse(JSON.stringify(body)) : {}, user });
    if (out.login) store('cf_demo_session', String(out.login.id));
    if (out.logout) store('cf_demo_session', null);
    return new Promise((resolve, reject) => setTimeout(() => {
      if (out.status >= 400) { const e = new Error(out.data.error); e.status = out.status; reject(e); } else resolve(out.data);
    }, 60));
  }

  window.API = {
    demo: DEMO,
    base: BASE,
    call: (method, path, body) => (DEMO ? demoCall(method, path, body) : serverCall(method, path, body)),
    get: (p) => window.API.call('GET', p),
    post: (p, b) => window.API.call('POST', p, b || {}),
    del: (p) => window.API.call('DELETE', p),
    resetDemo() { store('cf_demo_v2', null); store('cf_demo_session', null); location.hash = '#/login'; location.reload(); },
  };
})();
