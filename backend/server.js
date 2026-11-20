/* ==========================================================================
   STI CampusFlow — server
   Local:   node backend/server.js   →  http://localhost:3000   (Node.js 22.13+, nothing to install)
   Hosted:  see DEPLOY.md. Reads PORT, DATA_DIR, PUBLIC_URL, SEED_MODE, ADMIN_PASSWORD.
   Settings come from the root .env file; real environment variables win.
   ========================================================================== */
/* ---------- .env: load it first, before anything reads process.env */
const path = require('node:path');
const PROJECT_ROOT = path.resolve(__dirname, '..');
try { process.loadEnvFile(path.join(PROJECT_ROOT, '.env')); }
catch (e) { if (e.code !== 'ENOENT') console.warn('  Could not read .env:', e.message); }
process.env.TZ = process.env.TZ || 'Asia/Manila';

const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');

const config = require('./config');
const { createCore } = require('./core/logic');
const { createSqliteRepo } = require('./core/repo-sqlite');
const { seed } = require('./core/seed');
const { createMailer } = require('./core/mailer');

const DATA_DIR = path.resolve(PROJECT_ROOT, config.dataDir);
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- passwords: PBKDF2-SHA256, random salt per user
   Nothing here can be reversed. Signing in re-runs the same calculation on what
   was typed and compares the result, so the database never holds a usable
   password. ITER is the work factor; raise it on faster hardware and every
   password upgrades itself the next time its owner signs in. */
const ITER = 210000;
function hash(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.pbkdf2Sync(pw, salt, ITER, 32, 'sha256').toString('hex');
  return `pbkdf2$${ITER}$${salt}$${key}`;
}
function verify(pw, stored) {
  const [alg, iter, salt, key] = String(stored).split('$');
  if (alg !== 'pbkdf2') return false;
  const test = crypto.pbkdf2Sync(pw, salt, Number(iter), 32, 'sha256');
  const want = Buffer.from(key, 'hex');
  // timingSafeEqual compares every byte, so the time taken never hints at how much matched
  return want.length === test.length && crypto.timingSafeEqual(want, test);
}
function needsRehash(stored) {
  const [alg, iter] = String(stored).split('$');
  return alg !== 'pbkdf2' || Number(iter) < ITER;
}

/* ---------- slip links: HMAC so a QR code can't be guessed or forged */
const SECRET_FILE = path.join(DATA_DIR, '.slip-secret');
if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
const SLIP_SECRET = process.env.SLIP_SECRET || fs.readFileSync(SECRET_FILE, 'utf8').trim();
const sign = (ref) => crypto.createHmac('sha256', SLIP_SECRET).update(String(ref)).digest('hex').slice(0, 20);

/* ---------- Gmail set up from inside the app (Registrar > Email setup)
   The App Password is stored encrypted (AES-256-GCM) in the data folder, never in
   the web-served folders, and is never sent back to the browser. */
const MAIL_FILE = path.join(DATA_DIR, '.mail-settings.json');
const MAIL_KEY = crypto.createHash('sha256').update('mail|' + SLIP_SECRET).digest();
function lockText(text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', MAIL_KEY, iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return { iv: iv.toString('hex'), tag: c.getAuthTag().toString('hex'), data: data.toString('hex') };
}
function unlockText(o) {
  const d = crypto.createDecipheriv('aes-256-gcm', MAIL_KEY, Buffer.from(o.iv, 'hex'));
  d.setAuthTag(Buffer.from(o.tag, 'hex'));
  return Buffer.concat([d.update(Buffer.from(o.data, 'hex')), d.final()]).toString('utf8');
}
let mailSource = (config.gmail.user && config.gmail.appPassword) ? 'config' : 'none';
try {
  const saved = JSON.parse(fs.readFileSync(MAIL_FILE, 'utf8'));
  if (saved.user && saved.enc) { config.gmail.user = saved.user; config.gmail.appPassword = unlockText(saved.enc); mailSource = 'app'; }
} catch (e) { /* nothing saved yet */ }

/* ---------- the address printed inside QR codes
   1. PUBLIC_URL / config.publicUrl if set   2. the host's own URL (Render, Railway)
   3. this computer's Wi-Fi address (local use) */
const lanIp = (() => {
  const nets = require('node:os').networkInterfaces();
  const n = Object.values(nets).flat().find((x) => x && x.family === 'IPv4' && !x.internal);
  return n ? n.address : 'localhost';
})();
const HOSTED = !!(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME || process.env.HOSTED);
config.publicUrl = config.publicUrl
  || process.env.RENDER_EXTERNAL_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
  || (process.env.FLY_APP_NAME ? `https://${process.env.FLY_APP_NAME}.fly.dev` : '')
  || `http://${lanIp}:${config.port}`;

/* ---------- front end <-> back end connection (see .env)
   Same address (default): the server hands out the front end AND the API.
   Separate front end (e.g. Live Server on :5500): it reads frontend/env.js to find
   API_URL, and only origins in FRONTEND_URL / CORS_ORIGINS may call the API. */
const trimSlash = (u) => String(u || '').trim().replace(/\/+$/, '');
const API_URL = trimSlash(process.env.API_URL) || `http://localhost:${config.port}`;
const ALLOWED_ORIGINS = new Set([process.env.FRONTEND_URL, ...String(process.env.CORS_ORIGINS || '').split(',')].map(trimSlash).filter(Boolean));
const SAME_SITE = /^(strict|lax|none)$/i.test(process.env.COOKIE_SAMESITE || '') ? process.env.COOKIE_SAMESITE[0].toUpperCase() + process.env.COOKIE_SAMESITE.slice(1).toLowerCase() : 'Lax';
/* Browsers only send the sign-in cookie between "localhost" and "localhost" (or
   127.0.0.1 and 127.0.0.1), so a local API address follows whichever one the page uses. */
const envJs = (apiUrl) => `/* Generated by server.js from .env (API_URL) — do not edit by hand. */
window.CAMPUSFLOW_ENV = (function (env) {
  try {
    var u = new URL(env.apiUrl), local = /^(localhost|127\\.0\\.0\\.1)$/;
    if (local.test(u.hostname) && local.test(location.hostname)) { u.hostname = location.hostname; env.apiUrl = u.origin; }
  } catch (e) { /* blank = same server as this page */ }
  return env;
})(${JSON.stringify({ apiUrl })});
`;
// A copy on disk for front ends served by another tool (VS Code Live Server, a static host).
try {
  const f = path.join(PROJECT_ROOT, 'frontend', 'env.js');
  const want = envJs(API_URL);
  if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== want) fs.writeFileSync(f, want);
} catch (e) { /* read-only disk on some hosts: the /env.js route below still works */ }
function cors(req, res) {
  const origin = trimSlash(req.headers.origin);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Vary', 'Origin');
  return true;
}
// SameSite=None is only accepted by browsers together with Secure (https).
const cookieFlags = (req) => `HttpOnly; SameSite=${SAME_SITE === 'None' && !isHttps(req) ? 'Lax' : SAME_SITE}; Path=/${isHttps(req) ? '; Secure' : ''}`;

/* ---------- database */
const repo = createSqliteRepo(path.join(DATA_DIR, config.databaseFile));
const mail = createMailer(config);
const core = createCore({ repo, config, hash, verify, sign, mail, needsRehash });
if (repo.isEmpty()) {
  let adminPassword = config.adminPassword;
  if (config.seedMode !== 'demo' && !adminPassword) {
    adminPassword = crypto.randomBytes(9).toString('base64url');
    console.log(`\n  !!  No ADMIN_PASSWORD set. Temporary password for REG-001: ${adminPassword}\n`);
  }
  console.log(`First run: creating ${config.seedMode === 'demo' ? 'demo' : 'starter'} data…`);
  seed(repo, { hash, now: () => new Date(), slots: core.slots, config, mode: config.seedMode, adminPassword });
}
core.tick();
const ticker = setInterval(() => core.tick(), 60 * 1000); // reminders, grace period, no-shows

/* ---------- sessions (HttpOnly cookie; Secure when served over https) */
const sessions = new Map();
const SESSION_MS = config.sessionHours * 36e5;
function readCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function sessionUser(req) {
  const tok = readCookie(req, 'cf_session');
  const s = tok && sessions.get(tok);
  if (!s || s.expires < Date.now()) { if (tok) sessions.delete(tok); return null; }
  s.expires = Date.now() + SESSION_MS; // sliding expiry
  return repo.getUser(s.userId);
}
setInterval(() => { const now = Date.now(); for (const [k, s] of sessions) if (s.expires < now) sessions.delete(k); }, 10 * 60 * 1000).unref();
const isHttps = (req) => (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

function newSessionCookie(req, userId) {
  const tok = crypto.randomBytes(32).toString('hex');
  sessions.set(tok, { userId, expires: Date.now() + SESSION_MS });
  return `cf_session=${tok}; ${cookieFlags(req)}; Max-Age=${SESSION_MS / 1000}`;
}

/* ---------- login throttling: 10 tries per 15 minutes per address (the site is public now) */
const attempts = new Map();
function tooManyLogins(ip) {
  const now = Date.now(), a = attempts.get(ip) || { n: 0, reset: now + 15 * 60 * 1000 };
  if (now > a.reset) { a.n = 0; a.reset = now + 15 * 60 * 1000; }
  a.n++; attempts.set(ip, a);
  return a.n > 10;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of attempts) if (now > a.reset) attempts.delete(k); }, 15 * 60 * 1000).unref();

/* ---------- static files */
const PUBLIC = path.join(PROJECT_ROOT, 'frontend');
const CORE_DIR = path.join(__dirname, 'core');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function serveStatic(req, res, urlPath) {
  let base = PUBLIC, rel = urlPath;
  if (urlPath.startsWith('/core/')) { base = CORE_DIR; rel = urlPath.slice(5); } // shared logic is readable by the browser
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) {
      if (base === PUBLIC && !path.extname(rel)) return serveStatic(req, res, '/index.html');
      res.writeHead(404); return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

function send(res, status, data, headers = {}) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(JSON.stringify(data));
}

/* ---------- Email setup endpoints (head registrar only) */
let lastMailTest = 0;
const emailState = () => ({
  connected: !!(config.gmail.user && config.gmail.appPassword),
  user: config.gmail.user || '',
  source: mailSource,
  switchedOff: config.emailNotifications === false,
});
async function emailAdmin(req, res, pathname, body, user) {
  if (!user) return send(res, 401, { error: 'Please sign in again.' });
  if (user.role !== 'head') return send(res, 403, { error: 'Only the head registrar can change the email setup.' });
  if (req.method === 'GET' && pathname === '/api/admin/email') return send(res, 200, emailState());

  if (req.method === 'DELETE' && pathname === '/api/admin/email') {
    try { fs.rmSync(MAIL_FILE, { force: true }); } catch (e) { /* ignore */ }
    config.gmail.user = ''; config.gmail.appPassword = ''; mailSource = 'none';
    return send(res, 200, emailState());
  }

  if (req.method === 'POST' && (pathname === '/api/admin/email' || pathname === '/api/admin/email/test')) {
    if (Date.now() - lastMailTest < 4000) return send(res, 429, { error: 'Please wait a few seconds before trying again.' });
    lastMailTest = Date.now();
    const saving = pathname === '/api/admin/email';
    const gUser = String(saving ? body.user : config.gmail.user).trim().toLowerCase();
    const gPass = String(saving ? body.appPassword : config.gmail.appPassword).replace(/\s+/g, '');
    if (!/^[^@\s]+@(gmail|googlemail)\.com$/.test(gUser)) return send(res, 400, { error: 'Enter the Gmail address, like name@gmail.com.' });
    if (gPass.length !== 16) return send(res, 400, { error: saving ? `The App Password has 16 letters. You typed ${gPass.length}. Copy it again from Google (spaces are fine).` : 'Gmail is not connected yet.' });
    const to = String((!saving && body.to) || gUser).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return send(res, 400, { error: 'Enter a valid email address to send the test to.' });
    // Try it first. Wrong details are never saved.
    const r = await mail.test({ user: gUser, pass: gPass, to });
    if (!r.ok) return send(res, 200, { ok: false, error: r.error, ...emailState() });
    if (saving) {
      fs.writeFileSync(MAIL_FILE, JSON.stringify({ user: gUser, enc: lockText(gPass) }), { mode: 0o600 });
      config.gmail.user = gUser; config.gmail.appPassword = gPass; mailSource = 'app';
    }
    return send(res, 200, { ok: true, sentTo: to, ...emailState() });
  }
  return send(res, 404, { error: 'Not found.' });
}

/* ---------- HTTP */
const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  const url = new URL(req.url, 'http://localhost');

  // health check used by hosting platforms
  if (url.pathname === '/health') {
    try { repo.db.prepare('SELECT 1').get(); return send(res, 200, { ok: true, time: new Date().toISOString() }); }
    catch (e) { return send(res, 503, { ok: false }); }
  }
  // Same address as the API, so the front end talks to it directly (apiUrl '').
  if (url.pathname === '/env.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(envJs(''));
  }
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

  // Separate front end: answer the browser's permission check (CORS preflight).
  const allowed = cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(allowed ? 204 : 403); return res.end(); }

  // CSRF protection: API writes must come from our own page
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'CampusFlow') return send(res, 403, { error: 'Blocked request.' });
  if (url.pathname === '/api/auth/login' && req.method === 'POST' && tooManyLogins(clientIp(req))) {
    return send(res, 429, { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' });
  }

  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > 4 * 1024 * 1024) { send(res, 413, { error: 'Upload too large.' }); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    if (res.writableEnded) return;
    let body = {};
    if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { error: 'Invalid JSON.' }); } }
    const user = sessionUser(req);
    if (url.pathname === '/api/admin/email' || url.pathname === '/api/admin/email/test') {
      emailAdmin(req, res, url.pathname, body, user).catch(() => send(res, 500, { error: 'Something went wrong. Please try again.' }));
      return;
    }
    const out = core.handle({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, user });
    const headers = {};
    if (out.login) {
      attempts.delete(clientIp(req));
      headers['Set-Cookie'] = newSessionCookie(req, out.login.id);
    }
    if (out.resetSessions) {
      // a new password invalidates every other device straight away
      const keep = readCookie(req, 'cf_session');
      for (const [tok, sess] of sessions) if (sess.userId === out.resetSessions && tok !== keep) sessions.delete(tok);
    }
    if (out.logout) {
      const tok = readCookie(req, 'cf_session'); if (tok) sessions.delete(tok);
      headers['Set-Cookie'] = `cf_session=; ${cookieFlags(req)}; Max-Age=0`;
    }
    send(res, out.status, out.data, headers);
  });
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`\n  STI CampusFlow is running`);
  if (HOSTED) console.log(`  Public address:     ${config.publicUrl}`);
  else {
    console.log(`  On this computer:   http://localhost:${config.port}`);
    if (lanIp !== 'localhost') console.log(`  On your phone:      http://${lanIp}:${config.port}   (same Wi-Fi)`);
  }
  console.log(`  QR codes on slips open: ${config.publicUrl}`);
  console.log(`  Settings file: ${fs.existsSync(path.join(PROJECT_ROOT, '.env')) ? '.env' : 'none (set environment variables)'}`);
  if (ALLOWED_ORIGINS.size) console.log(`  Separate front ends allowed: ${[...ALLOWED_ORIGINS].join(', ')}  →  API ${API_URL}`);
  console.log(`  Database: ${path.join(DATA_DIR, config.databaseFile)}`);
  const mode = mail.mode();
  console.log(`  Email notices: ${mode === 'gmail' ? 'Gmail (' + config.gmail.user + ')'
    : mode === 'off' ? 'turned off in config.js'
    : 'not set up yet — messages print in this window'}`);
  if (config.seedMode === 'demo') {
    console.log(`\n  Sample sign-ins (both need a password):`);
    console.log(`  Student    02000123456  /  ${config.demoPassword}`);
    console.log(`  Registrar  REG-001      /  Registrar@123\n`);
  }
});

/* ---------- clean shutdown: hosts send SIGTERM before restarting, so save everything first */
function shutdown(sig) {
  console.log(`\n${sig} received, closing…`);
  clearInterval(ticker);
  server.close(() => {
    try { repo.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); repo.db.close(); } catch (e) { /* already closed */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
