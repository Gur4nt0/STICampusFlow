/* ==========================================================================
   SQLite repository — every SQL statement in the system lives in this file.
   All queries use ? placeholders (parameterised), so user input is never
   pasted into SQL. No SQL injection surface.
   ========================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const REQ_SELECT = `SELECT r.*, u.full_name, u.login_id, u.program, u.year_level, u.email
  FROM requests r JOIN users u ON u.id = r.student_id`;
const ITEM_SELECT = `SELECT i.*, d.code, d.name, d.category, d.processing_days
  FROM request_items i JOIN document_types d ON d.id = i.doc_type_id`;
const marks = (a) => a.map(() => '?').join(',');

function createSqliteRepo(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
  // upgrade older databases in place
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  for (const [col, decl] of [['notify_email', 'TEXT'], ['notify_pending', 'TEXT'], ['notify_code', 'TEXT'],
    ['notify_expires', 'TEXT'], ['email_notify', 'INTEGER NOT NULL DEFAULT 1']]) {
    if (!cols.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${decl}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS ix_users_email ON users(lower(email))');

  const cache = new Map();
  const q = (sql) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
  const all = (sql, ...p) => q(sql).all(...p);
  const get = (sql, ...p) => q(sql).get(...p) || null;
  const run = (sql, ...p) => q(sql).run(...p);
  const insert = (table, row) => {
    const keys = Object.keys(row);
    return Number(run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${marks(keys)})`, ...keys.map((k) => row[k])).lastInsertRowid);
  };
  const plain = (r) => (r ? Object.assign({}, r) : r);

  let depth = 0;
  const repo = {
    db,
    tx(fn) {
      if (depth > 0) return fn();
      depth++;
      db.exec('BEGIN IMMEDIATE');
      try { const out = fn(); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      finally { depth--; }
    },
    isEmpty: () => get('SELECT COUNT(*) AS n FROM users').n === 0,

    // users
    getUserByLogin: (id) => plain(get('SELECT * FROM users WHERE login_id = ?', id)),
    getUser: (id) => plain(get('SELECT * FROM users WHERE id = ?', id)),
    getUserByEmail: (e) => plain(get('SELECT * FROM users WHERE lower(email) = lower(?)', e)),
    insertUser: (u) => insert('users', u),
    updateUser(id, patch) { const k = Object.keys(patch); run(`UPDATE users SET ${k.map((x) => x + ' = ?').join(', ')} WHERE id = ?`, ...k.map((x) => patch[x]), id); },

    // documents
    listDocTypes: () => all('SELECT * FROM document_types WHERE is_active = 1 ORDER BY sort_order, name').map(plain),
    getDocType: (id) => plain(get('SELECT * FROM document_types WHERE id = ?', id)),
    insertDocType: (d) => insert('document_types', d),

    // requests
    insertRequest: (r) => insert('requests', r),
    insertItem: (i) => insert('request_items', i),
    getRequest: (id) => plain(get(`${REQ_SELECT} WHERE r.id = ?`, id)),
    getRequestByRef: (ref) => plain(get('SELECT id FROM requests WHERE ref_code = ?', ref)),
    getItems: (id) => all(`${ITEM_SELECT} WHERE i.request_id = ? ORDER BY d.sort_order`, id).map(plain),
    itemsFor: (ids) => all(`${ITEM_SELECT} WHERE i.request_id IN (${marks(ids)}) ORDER BY d.sort_order`, ...ids).map(plain),
    updateRequest(id, patch) {
      const keys = Object.keys(patch);
      run(`UPDATE requests SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`, ...keys.map((k) => patch[k]), id);
    },
    queryRequests(f) {
      const where = [], p = [];
      if (f.studentId) { where.push('r.student_id = ?'); p.push(f.studentId); }
      if (f.statuses) { where.push(`r.status IN (${marks(f.statuses)})`); p.push(...f.statuses); }
      if (f.q) { where.push('(r.ref_code LIKE ? OR u.full_name LIKE ? OR u.login_id LIKE ?)'); const like = `%${f.q}%`; p.push(like, like, like); }
      if (f.date) { where.push('r.appt_date = ?'); p.push(f.date); }
      if (f.from) { where.push('r.appt_date >= ?'); p.push(f.from); }
      if (f.to) { where.push('r.appt_date <= ?'); p.push(f.to); }
      if (f.payment) { where.push('r.payment_status = ?'); p.push(f.payment); }
      const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
      const order = f.sort === 'created' ? 'r.created_at DESC' : 'r.appt_date ASC, r.slot_start ASC';
      const total = db.prepare(`SELECT COUNT(*) AS n FROM requests r JOIN users u ON u.id = r.student_id${w}`).get(...p).n;
      const rows = db.prepare(`${REQ_SELECT}${w} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...p, f.limit, f.offset).map(plain);
      return { rows, total };
    },
    bookedCounts(date, excludeId, st) {
      return db.prepare(`SELECT slot_start, COUNT(*) AS n FROM requests WHERE appt_date = ? AND id <> ? AND status IN (${marks(st)}) GROUP BY slot_start`)
        .all(date, excludeId || 0, ...st).map(plain);
    },
    bookedCountsRange(from, to, st) {
      return db.prepare(`SELECT appt_date, slot_start, COUNT(*) AS n FROM requests WHERE appt_date BETWEEN ? AND ? AND status IN (${marks(st)}) GROUP BY appt_date, slot_start`)
        .all(from, to, ...st).map(plain);
    },
    countOpenForStudent: (sid, st) => db.prepare(`SELECT COUNT(*) AS n FROM requests WHERE student_id = ? AND status IN (${marks(st)})`).get(sid, ...st).n,
    studentBookingOn: (sid, date, st, excludeId) => plain(db.prepare(`SELECT * FROM requests WHERE student_id = ? AND appt_date = ? AND id <> ? AND status IN (${marks(st)})`).get(sid, date, excludeId || 0, ...st)),
    requestsOnDate: (date, st) => db.prepare(`${REQ_SELECT} WHERE r.appt_date = ? AND r.status IN (${marks(st)}) ORDER BY r.slot_start, u.full_name`).all(date, ...st).map(plain),
    requestsForTick: (maxDate, st) => db.prepare(`SELECT * FROM requests WHERE appt_date <= ? AND status IN (${marks(st)})`).all(maxDate, ...st).map(plain),

    // history
    addHistory: (h) => insert('status_history', h),
    listHistory: (id) => all(`SELECT h.*, u.full_name AS by_name FROM status_history h LEFT JOIN users u ON u.id = h.by_user_id WHERE h.request_id = ? ORDER BY h.at, h.id`, id).map(plain),

    dashboardRaw({ today, weekStart, monthStart, since30 }) {
      const byStatus = {};
      for (const r of all('SELECT status, COUNT(*) AS n FROM requests GROUP BY status')) byStatus[r.status] = r.n;
      return {
        byStatus,
        paymentsToCheck: get(`SELECT COUNT(*) AS n FROM requests WHERE payment_status = 'submitted' AND status NOT IN ('cancelled','rejected','noshow')`).n,
        todayTotal: get(`SELECT COUNT(*) AS n FROM requests WHERE appt_date = ? AND status IN ('pending','approved','processing','ready','released')`, today).n,
        releasedWeek: get(`SELECT COUNT(*) AS n FROM requests WHERE status = 'released' AND substr(released_at,1,10) >= ?`, weekStart).n,
        feesMonth: get(`SELECT COALESCE(SUM(total_fee),0) AS s FROM requests WHERE payment_status = 'verified' AND substr(updated_at,1,10) >= ?`, monthStart).s,
        topDocs: all(`SELECT d.name, d.code, SUM(i.copies) AS copies FROM request_items i JOIN requests r ON r.id = i.request_id
                      JOIN document_types d ON d.id = i.doc_type_id WHERE substr(r.created_at,1,10) >= ? AND r.status NOT IN ('cancelled','rejected')
                      GROUP BY d.id ORDER BY copies DESC LIMIT 5`, since30).map(plain),
        activity: all(`SELECT h.*, r.ref_code, s.full_name AS student_name, b.full_name AS by_name FROM status_history h
                       JOIN requests r ON r.id = h.request_id JOIN users s ON s.id = r.student_id LEFT JOIN users b ON b.id = h.by_user_id
                       ORDER BY h.at DESC, h.id DESC LIMIT 12`).map(plain),
      };
    },

    // closures & capacity
    listClosures: (from, to) => all('SELECT * FROM closures WHERE date BETWEEN ? AND ? ORDER BY date', from, to).map(plain),
    getClosure: (date) => plain(get('SELECT * FROM closures WHERE date = ?', date)),
    insertClosure: (c) => insert('closures', c),
    deleteClosure: (id) => run('DELETE FROM closures WHERE id = ?', id),
    getCapacityMap: (from, to) => all('SELECT * FROM capacity_overrides WHERE date BETWEEN ? AND ? ORDER BY date', from, to).map(plain),
    setCapacity(date, cap) {
      if (cap === null) run('DELETE FROM capacity_overrides WHERE date = ?', date);
      else run('INSERT INTO capacity_overrides (date, capacity) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET capacity = excluded.capacity', date, cap);
    },

    // notifications
    insertNotification: (n) => insert('notifications', n),
    listNotifications: (uid, limit) => all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?', uid, limit).map(plain),
    unreadCount: (uid) => get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', uid).n,
    markRead(uid, id) {
      if (id) run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?', uid, id);
      else run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', uid);
    },

    // announcements
    listAnnouncements: (today) => all('SELECT * FROM announcements WHERE expires_on IS NULL OR expires_on >= ? ORDER BY created_at DESC LIMIT 8', today).map(plain),
    insertAnnouncement: (a) => insert('announcements', a),
    deleteAnnouncement: (id) => run('DELETE FROM announcements WHERE id = ?', id),

    // settings
    getSettings() { const o = {}; for (const r of all('SELECT * FROM settings')) o[r.key] = r.value; return o; },
    setSetting: (k, v) => run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, v),
  };
  return repo;
}

module.exports = { createSqliteRepo };
