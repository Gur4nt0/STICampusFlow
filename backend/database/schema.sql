-- ==========================================================================
-- STI CampusFlow — database schema (SQLite)
-- server.js runs this automatically on first start. It is also here for the
-- ERD chapter of the manuscript. It is standard SQL, so it ports to MySQL
-- with small changes (INTEGER PRIMARY KEY AUTOINCREMENT -> INT AUTO_INCREMENT).
-- ==========================================================================
PRAGMA foreign_keys = ON;

-- Students and registrar staff share one table. role: student | staff | head
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id      TEXT    NOT NULL UNIQUE,          -- 11-digit student number, or a staff ID like REG-001
  full_name     TEXT    NOT NULL,
  email         TEXT    UNIQUE,                   -- school email (Outlook); the account's identity
  notify_email  TEXT,                             -- optional personal address (e.g. Gmail) notices are sent to
  notify_pending TEXT,                            -- a personal address waiting to be confirmed by code
  notify_code   TEXT,                             -- hash of the confirmation code, never the code itself
  notify_expires TEXT,                            -- when that code stops working
  email_notify  INTEGER NOT NULL DEFAULT 1,       -- 0 = notices appear in the app only
  password_hash TEXT    NOT NULL,                 -- pbkdf2$iterations$salt$hash — never the password itself
  role          TEXT    NOT NULL DEFAULT 'student' CHECK (role IN ('student','staff','head')),
  program       TEXT,
  year_level    INTEGER CHECK (year_level IS NULL OR year_level BETWEEN 1 AND 5),
  created_at    TEXT    NOT NULL
);

-- The catalogue of documents the registrar issues
CREATE TABLE IF NOT EXISTS document_types (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT    NOT NULL UNIQUE,
  name            TEXT    NOT NULL,
  description     TEXT,
  category        TEXT    NOT NULL CHECK (category IN ('records','certification','clearance','enrollment')),
  fee             REAL    NOT NULL DEFAULT 0 CHECK (fee >= 0),
  processing_days INTEGER NOT NULL DEFAULT 1,
  max_copies      INTEGER NOT NULL DEFAULT 3 CHECK (max_copies BETWEEN 1 AND 20),
  is_active       INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

-- One appointment = one request, holding one or more documents
CREATE TABLE IF NOT EXISTS requests (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_code         TEXT    NOT NULL UNIQUE,
  student_id       INTEGER NOT NULL REFERENCES users(id),
  appt_date        TEXT    NOT NULL,              -- YYYY-MM-DD
  slot_start       TEXT    NOT NULL,              -- HH:MM
  slot_end         TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','processing','ready','released','rejected','cancelled','missed','noshow')),
  prev_status      TEXT,                          -- status before it became "missed" (restored on reschedule)
  purpose          TEXT,
  student_note     TEXT,
  staff_note       TEXT,
  reject_reason    TEXT,
  total_fee        REAL    NOT NULL DEFAULT 0,
  payment_status   TEXT    NOT NULL DEFAULT 'none' CHECK (payment_status IN ('none','unpaid','submitted','verified','rejected')),
  or_number        TEXT,                          -- official receipt number from the Cashier
  receipt_image    TEXT,                          -- photo of the receipt (data URL)
  payment_note     TEXT,
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  free_reschedule  INTEGER NOT NULL DEFAULT 0,    -- 1 when the office caused the move (closure/suspension)
  reminder_stage   INTEGER NOT NULL DEFAULT 0,    -- 0 none, 1 day-before sent, 2 same-day sent
  missed_at        TEXT,
  processed_by     INTEGER REFERENCES users(id),
  approved_at      TEXT,
  ready_at         TEXT,
  released_at      TEXT,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_requests_date_slot ON requests(appt_date, slot_start, status);
CREATE INDEX IF NOT EXISTS ix_requests_student   ON requests(student_id, status);

CREATE TABLE IF NOT EXISTS request_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  doc_type_id  INTEGER NOT NULL REFERENCES document_types(id),
  copies       INTEGER NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 20),
  unit_fee     REAL    NOT NULL DEFAULT 0,
  UNIQUE (request_id, doc_type_id)
);

-- Audit trail shown as the timeline on every request
CREATE TABLE IF NOT EXISTS status_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT    NOT NULL,
  note        TEXT,
  by_user_id  INTEGER REFERENCES users(id),
  at          TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_history_request ON status_history(request_id);

-- Holidays, closures and "classes suspended but office open" notices
CREATE TABLE IF NOT EXISTS closures (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL CHECK (kind IN ('closed','office_open')),
  reason     TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- Seats per window for a specific date (overrides the default)
CREATE TABLE IF NOT EXISTS capacity_overrides (
  date     TEXT PRIMARY KEY,
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 0 AND 50)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  kind       TEXT NOT NULL DEFAULT 'info',
  request_id INTEGER REFERENCES requests(id) ON DELETE SET NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT,
  kind       TEXT NOT NULL DEFAULT 'general',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_on TEXT                                  -- hidden after this date
);

-- Registrar name + signature printed on payment and claim slips
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
