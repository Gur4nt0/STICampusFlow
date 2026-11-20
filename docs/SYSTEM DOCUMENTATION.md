# CampusFlow — Complete System Documentation

Office of the Registrar document request and appointment system
STI College Global City · 16 October 2026

---

## 1. What CampusFlow is

CampusFlow replaces the queue at the Registrar's window with a booked appointment
and a tracked request. A student picks the document they need, sees the fee before
paying, reserves a specific slot, and gets told by email when to come. The registrar
works from a live queue instead of a stack of forms.

It solves four problems students reported:

1. **Lining up twice.** You queue once to ask for the form, then again to claim it,
   often on a day the office turns out to be closed. CampusFlow books the claiming
   time up front and tells the student if the office status changes.
2. **Not knowing the fee.** Good Moral, Form 137, Form 138, TOR and CAV all cost
   money. The fee is shown before the request is placed, and the payslip is uploaded
   in the app so the registrar can verify it before the student travels.
3. **No notice of suspensions.** When classes are suspended for a typhoon the office
   is often still open. The registrar posts a notice and students with bookings in
   that window are emailed.
4. **Forms that look identical.** Each document has its own card with a colour-coded
   category, the fee, the preparation time, and whether it carries the signature.

## 2. How it is built

Node.js and nothing else. No npm install, no build step, no framework, no compiled
dependency. Everything ships inside Node: `node:http` serves pages, `node:sqlite`
is the database, `node:crypto` hashes passwords, `node:tls` talks to Gmail.

This was deliberate. An earlier version used `better-sqlite3`, which compiles C++
and needs Python plus Visual Studio Build Tools on Windows; it failed to install.
Dropping it removed that whole class of failure.

Three layers, kept apart:

| Layer   | Files | Responsible for |
|---------|-------|-----------------|
| Server  | `backend/server.js` | HTTP, static files, sessions, password hashing, email setup endpoints, QR signing |
| Logic   | `backend/core/logic.js`, `backend/core/mailer.js`, `backend/core/seed.js` | Every rule about requests, slots, statuses, notices. No HTTP, no SQL |
| Storage | `backend/core/repo-sqlite.js`, `backend/core/repo-memory.js`, `backend/database/schema.sql` | Reading and writing rows. No rules |

The logic layer never touches the database directly; it calls a repository passed
into it. That is why there are two: `repo-sqlite.js` is real, `repo-memory.js` holds
the same data in plain objects so `backend/tools/build-preview.js` can compile the whole
system into one offline HTML file.

The front end is plain scripts with no framework, organised in folders:
`frontend/js/core/` (routing, page frame, theming, icons, notifications),
`frontend/js/components/` (calendar, claiming board, slips, password fields) and
`frontend/js/pages/` (one file per screen, grouped into `auth`, `common`, `student`,
`registrar`, `slips`). CSS follows the same split under `frontend/css/`. Navigation is hash-based, so the app is one
page that never reloads.

## 3. Running the system

Extract the folder, then double-click `start.bat` (Windows) or `start.sh` (Mac,
Linux). The browser opens at `http://localhost:3000`. Keep the console window open.

The only requirement is Node.js 22 or newer, because `node:sqlite` arrived in that
version. If Node is missing, the launcher opens the download page.

On first run the system creates `data/campusflow.db`, applies `backend/database/schema.sql`,
and seeds 44 accounts, 11 documents, slots for 45 days, and requests in every status.
It also writes `data/.slip-secret`, the key that signs QR links.

| Setting | Value | Where |
|---|---|---|
| Port | 3000 | `backend/config.js` or `PORT` |
| Office hours | 08:00–17:00, lunch 12:00–13:00 | `backend/config.js` |
| Slot length | 60 minutes | `backend/config.js` |
| Students per slot | 8 | `backend/config.js` or the registrar's calendar |
| Booking window | 45 days ahead, 2 hours minimum lead | `backend/config.js` |
| Open requests per student | 3 | `backend/config.js` |
| Grace period | 30 minutes after the window closes | `backend/config.js` |
| Reminders | 24 hours and 2 hours before | `backend/config.js` |
| Demo data | on | `SEED_MODE=minimal` turns it off |

To start clean: stop the server, delete the `data` folder. For real use, run with
`SEED_MODE=minimal` and `ADMIN_PASSWORD=<something strong>`.

## 4. Accounts and roles

Everyone signs in with a password, students included. Students use their 11-digit
student number or school email; staff use a staff ID like `REG-001`.

| Role | Who | Can do |
|---|---|---|
| `student` | Anyone who signs up with a school email | Request documents, book and move slots, upload payslips, view own slips and notifications |
| `staff` | Registrar clerks | The queue: approve, process, verify payments, release, post closures and announcements |
| `head` | Head registrar | All staff powers, plus slip signature and email setup |

Students self-register; only domains in `allowedEmailDomains` are accepted. Staff
accounts are never self-registered — `REG-001` comes from the seed, and further staff
are added by changing a user's `role` column. If staff could sign themselves up,
anyone could grant themselves the registrar's queue.

Demo accounts (when `seedMode` is `demo`):

| Sign in as | ID | Password |
|---|---|---|
| Student (Juan Dela Cruz) | `02000123456` | `Student@123` |
| Head registrar (Marissa Villanueva) | `REG-001` | `Registrar@123` |
| Staff clerks | `REG-002`, `REG-003` | `Registrar@123` |

## 5. What a student can do

**Request a document.** 11 documents in four categories: academic records,
certifications, permits and clearances, enrollment. Transcript of Records, Form 137,
Form 138, Good Moral, Honorable Dismissal, CAV, Certificate of Grades, Certificate
of Enrollment, second-copy Diploma, Examination Permit, Student Clearance Form.

**Pick a claiming time.** One-hour slots between 8 AM and 5 PM with lunch closed,
8 students each by default. Full windows and closed days are not offered. Bookings
must be at least 2 hours ahead and at most 45 days out. 3 open requests at a time.

**Pay and upload the receipt.** Payment runs `unpaid` → `submitted` → `verified`,
or `rejected` if unreadable.

**Carry a claim slip.** Each request has a reference like `CF-KK5HGF` and a QR code.
The QR points at a public slip page signed with HMAC, so it cannot be guessed or
forged.

**Move or cancel.** Two reschedules allowed; 7 days to pick a new time after missing.
Cancelling frees the seat immediately.

**See the claiming board.** Who is claiming at each hour today, student numbers
partly masked.

**Follow the status.** Waiting for review → approved → being prepared → ready to
claim → claimed. Or declined, cancelled, missed, not claimed.

## 6. What the registrar can do

**Dashboard.** Counts waiting, being prepared, ready, and payslips needing a check.

**The queue.** Requests move along a fixed path enforced in `TRANSITIONS`, so no step
can be skipped. Bulk-approve clears routine batches.

**Payments.** View the uploaded receipt, mark verified or rejected. The student is
emailed either way.

**The claiming list.** Everyone booked today in time order. Scanning a QR opens that
request directly.

**Closures and capacity.** Mark days closed, which removes those slots. Raise or
lower seats per day for enrollment week.

**Announcements.** Sidebar notices. This is how a suspension is handled: classes
cancelled but the office open, so students still come.

**Slip signature (head only).** Name, title and signature image printed on every
slip. Draw with a mouse or finger, or upload a photo with the background removed.

**Email setup (head only).** See section 7.

## 7. Email notices

Every bell notification is also emailed. One function does both:

```js
function notify(userId, title, body, kind, requestId) {
  repo.insertNotification({ ... });            // the bell
  const u = repo.getUser(userId);
  const to = u.email_notify !== 0 ? (u.notify_email || u.email) : '';
  if (to) mail.send({ to, name: u.full_name, title, body });
}
```

Because every reminder and status change already called `notify()`, nothing else had
to change to add email.

### Where each student's mail goes

School mailboxes are on Outlook, and mail from a Gmail account to a Microsoft tenant
is often filed as junk. So the student chooses, in Account → Email notices:

1. **Their school email** — the Outlook address they signed up with. Default.
2. **A personal email** — Gmail or similar, one they actually check.
3. **No email** — notices stay in the bell.

A personal address is not used until a 6-digit code sent to it is typed back in. The
code is hashed, expires in 20 minutes, and is checked with the same comparison used
for passwords. Without this, a typo would send appointment details to a stranger.

### Setting up Gmail from inside the app

The head registrar opens **Email setup**, follows the on-screen steps to create a
Google App Password, and enters the address and 16-character code. Three properties
matter:

- **It tests before saving.** Wrong credentials are never written.
- **The App Password is encrypted at rest** with AES-256-GCM, keyed from the slip
  secret, stored at `data/.mail-settings.json` with file mode `0600`, outside any
  web-served folder, never returned to a browser.
- **Errors are specific.** A rejected sign-in points at 2-Step Verification; an
  unreachable server suggests the network is blocking email; a short code says how
  many characters were typed.

A 4-second cooldown sits between test sends.

### How the mail is sent

`backend/core/mailer.js` speaks SMTP directly over `node:tls`. It connects to
`smtp.gmail.com` on port 465, authenticates with AUTH LOGIN, and sends a multipart
message with plain-text and HTML versions styled in navy and yellow.

With no credentials set, messages print to the console, which makes the flow testable
without a real account. Sending is fire-and-forget: `notify()` does not wait, and
failures are logged rather than thrown, so a Gmail outage can never block a booking.

## 8. Security

**Passwords are hashed, not encrypted.** Encryption reverses with a key; hashing does
not reverse at all. PBKDF2-SHA256, 210,000 iterations, fresh 16-byte salt per account:

```
pbkdf2$210000$b869dc8145462966...$34b1e41ba991d...
```

Sign-in re-runs the calculation and compares with `timingSafeEqual`, which examines
every byte so timing never hints at how much matched. Nobody can read a password back
out. Raising the iteration count upgrades each password at its owner's next sign-in.

**No account enumeration.** A wrong password and an unknown account give the same
message.

**Sessions** are random tokens in an HttpOnly cookie, Secure over HTTPS, 8 hours,
and every other session is destroyed when a password changes.

**CSRF blocked** by requiring `X-Requested-With: CampusFlow` on every write. Another
website cannot set that header.

**Brute force throttled** per IP address, with lockout after repeated failures.

**SQL injection structurally impossible** — every query uses bound parameters, so
`' OR 1=1 --` is treated as text.

**The App Password is encrypted at rest** (AES-256-GCM), since unlike a user password
it must be replayed to Gmail and cannot be hashed.

**QR links are signed** with an HMAC of the reference code.

**Student numbers are masked** on the public board: first four and last two digits.

**Role checks run server-side.** A student calling a registrar endpoint is refused.

## 9. The database

One SQLite file, `data/campusflow.db`, built from `backend/database/schema.sql`. Ten tables.

| Table | Holds | Notable columns |
|---|---|---|
| `users` | Accounts | `login_id`, `email`, `notify_email`, `notify_pending`, `notify_code`, `email_notify`, `password_hash`, `role` |
| `document_types` | The catalog | `code`, `fee`, `processing_days`, `max_copies`, `category`, `is_active` |
| `requests` | One per booking | `ref_code`, `appt_date`, `slot_start`, `status`, `prev_status`, `payment_status`, `or_number`, `receipt_image`, `reschedule_count`, `reminder_stage` |
| `request_items` | Documents inside a request | `doc_type_id`, `copies`, `unit_fee` |
| `status_history` | Every status change | `from_status`, `to_status`, `by_user_id`, `at` |
| `closures` | Closed or open-despite-suspension days | `date`, `kind`, `reason` |
| `capacity_overrides` | Per-day seat changes | `date`, `capacity` |
| `notifications` | The bell | `title`, `body`, `kind`, `request_id`, `is_read` |
| `announcements` | Sidebar notices | `title`, `body`, `expires_on` |
| `settings` | Key/value | Registrar name, title, signature image |

Three design points worth defending:

**A request can hold several documents.** `request_items` is separate so one
appointment can cover a TOR and a Good Moral, each with its own copies and unit fee.

**`status_history` is append-only.** It answers who approved what and when.

**`prev_status` is how missed appointments recover.** On expiry the status becomes
`missed` and the old one is kept; rescheduling within 7 days restores it rather than
starting over.

Constraints live in the schema, not just in code: `role` and `payment_status` are
`CHECK`ed, `year_level` must be 1–5, `copies` 1–20, and deletes cascade.

## 10. The API

JSON throughout. Writes require `X-Requested-With: CampusFlow`. Roles checked per route.

**Accounts**

| Method and path | Who | Purpose |
|---|---|---|
| `POST /api/auth/login` | anyone | Sign in with student number, email or staff ID plus password |
| `POST /api/auth/register` | anyone | Create a student account |
| `GET /api/me` | signed in | Current account |
| `POST /api/me/password` | signed in | Change password; clears other sessions |
| `POST /api/me/profile` | student | Update program and year level |
| `GET /api/config` | anyone | Office hours, categories, demo flag, email status |

**Email delivery choice**

| Method and path | Purpose |
|---|---|
| `POST /api/me/notify-email` | Add a personal address; sends the 6-digit code |
| `POST /api/me/notify-email/confirm` | Confirm it |
| `POST /api/me/notify-email/clear` | Back to the school address |
| `POST /api/me/email-notify` | Turn email notices on or off |

**Requests and booking**

| Method and path | Who | Purpose |
|---|---|---|
| `GET /api/documents` | signed in | Catalog with fees |
| `GET /api/availability`, `GET /api/slots` | signed in | Open days and seats left |
| `POST /api/requests` | student | Place a request and book a slot |
| `GET /api/requests`, `GET /api/requests/:id` | signed in | Own requests; staff see all |
| `GET /api/requests/:id/receipt` | signed in | Payment slip |
| `POST /api/requests/:id/cancel` | student | Cancel and free the seat |
| `POST /api/requests/:id/reschedule` | student | Move to another window |
| `POST /api/requests/:id/payment` | student | Submit OR number and receipt image |
| `GET /api/public/slip/:ref` | signed link | The QR claim slip |

**Registrar**

| Method and path | Purpose |
|---|---|
| `GET /api/registrar/dashboard` | Counts and today's workload |
| `GET /api/registrar/manifest` | Claiming list for a day |
| `POST /api/requests/:id/transition` | Move along the status path |
| `POST /api/requests/bulk-approve` | Approve several at once |
| `POST /api/requests/:id/verify-payment` | Accept or reject a receipt |
| `GET`, `POST /api/closures`, `DELETE /api/closures/:id` | Office closures |
| `POST /api/capacity` | Seats for a day |
| `POST`, `DELETE /api/announcements` | Sidebar notices |
| `GET`, `POST /api/settings` | Registrar name, title, signature |

**Email setup (head only)** — in `backend/server.js`, because these touch the file system
and the mail transport rather than the database.

| Method and path | Purpose |
|---|---|
| `GET /api/admin/email` | Whether Gmail is connected, and which address |
| `POST /api/admin/email` | Test credentials, save only if the test passes |
| `POST /api/admin/email/test` | Send another test with the saved account |
| `DELETE /api/admin/email` | Disconnect and delete stored credentials |

**Other.** `GET /api/board` is the masked claiming board. `GET /api/notifications`
and `POST /api/notifications/read` drive the bell. `GET /health` is a platform check.

## 11. File-by-file guide

Front-end code is split into folders (see README section 3).

| File | Lines | What it holds |
|---|---|---|
| `backend/core/logic.js` | 789 | Every rule: status path, slot availability, fee totals, reminders, all API routes except email setup. Read this first |
| `frontend/js/pages/registrar/` | 456 | Registrar screens: dashboard (with header), queue, request review, claiming list, closures, announcements, signature pad, email setup |
| `frontend/js/pages/student/` | 329 | Student screens: home, request wizard, my requests, request detail (pay, move, cancel) |
| `frontend/js/pages/auth/, common/, slips/` | 658 | Sign in, create account, account, notifications page, board page, slip pages |
| `frontend/js/core/` | 563 | api client, helpers + icons, toasts/modals, layout (auto-hiding header), notifications + bell dropdown, router + sign-out confirmation |
| `frontend/js/components/` | 456 | Calendar picker (past days red), claiming board, slips, request widgets, password eye + strength meter |
| `frontend/css/ (19 files)` | 624 | The visual design, split into base, layout, components, pages, responsive, print |
| `backend/server.js` | 288 | HTTP, static files, sessions, PBKDF2, QR signing, email setup endpoints, App Password encryption |
| `backend/core/repo-sqlite.js` | 158 | Every SQL statement; also migrates older databases on startup |
| `backend/core/seed.js` | 154 | Demo and minimal seeding |
| `backend/database/schema.sql` | 138 | The ten tables and their constraints |
| `backend/core/repo-memory.js` | 135 | Same interface backed by objects, for the offline preview |
| `backend/core/mailer.js` | 130 | SMTP client, email template, friendly error messages |
| `backend/config.js` | 74 | Every setting |
| `frontend/index.html` | 76 | The single page everything renders into |
| `backend/tools/build-preview.js` | 27 | Compiles the system into one offline HTML file |
| `start.bat`, `start.sh` | — | Launchers that check for Node and open the browser |

Also present: `Dockerfile`, `render.yaml`, `.dockerignore` for hosting; `README.md`
and `DEPLOY.md`. The `data/` folder is created at runtime and holds `campusflow.db`,
`.slip-secret` and `.mail-settings.json`; it is excluded from version control and
should never be shared.

## 12. One request, start to finish

1. **Sign in.** `POST /api/auth/login` finds the account, runs PBKDF2 on the typed
   password, compares with `timingSafeEqual`. A random session token goes into an
   HttpOnly cookie.
2. **Pick the document.** `GET /api/documents` returns the catalog with the fee.
3. **Choose a time.** `GET /api/availability` builds slots from office hours,
   subtracts `closures`, applies `capacity_overrides`, counts existing bookings, and
   drops windows that are full, past, or inside the 2-hour lead time.
4. **Submit.** `POST /api/requests` re-checks everything server-side, writes the
   `requests` row with a generated `ref_code`, the documents into `request_items`,
   and the first `status_history` entry. A fee means `payment_status` starts
   `unpaid`. `notify()` writes the bell entry and sends the email.
5. **Pay.** `POST /api/requests/:id/payment` stores the OR number and receipt image;
   payment becomes `submitted`.
6. **Registrar reviews.** `verify-payment` marks it verified; `transition` moves the
   status along `TRANSITIONS`. Each writes history and notifies.
7. **Reminders.** A timer calls `core.tick()`. It finds appointments 24 hours out and
   sends the first reminder, then 2 hours out for the second, tracking
   `reminder_stage` so neither repeats.
8. **Claim.** The registrar scans the QR, which opens the signed slip page, and
   transitions to released. `released_at` is stamped and a final notice sent.

**If they do not arrive**, `tick()` finds the request past its window plus the grace
period, saves the status into `prev_status`, marks it `missed`, and frees the seat.
The student has 7 days to rebook, which restores the saved status.

## 13. Deployment

**On a laptop**, `start.bat` is enough. Other devices on the same Wi-Fi reach it at
the local address printed on startup. Two common blockers: Windows Firewall (allow
it, tick Private networks) and campus Wi-Fi client isolation (use a phone hotspot).

**Hosted**, the folder carries a `Dockerfile` and `render.yaml`. Render needs a
persistent disk mounted at `DATA_DIR`, or the database is wiped on redeploy.

| Variable | Why |
|---|---|
| `SEED_MODE=minimal` | No demo accounts or sample requests |
| `ADMIN_PASSWORD` | The head registrar's first password |
| `PUBLIC_URL` | The real address, so QR codes point at it |
| `DATA_DIR` | The mounted disk |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Optional; the in-app page is easier |

**QR codes** resolve their address in order: `PUBLIC_URL`, the hosting platform's
URL, then the computer's Wi-Fi address.

**Backups** are a copy of the `data` folder. Losing `.slip-secret` invalidates every
printed slip; losing the database loses everything.

**Before handing the project in**, delete the `data` folder. It contains both the
encrypted App Password and the key that decrypts it.

## 14. Known limits and future work

- **Mail is sent from a Gmail account, not the school domain.** Microsoft often files
  such mail as junk, which is why students can redirect notices. The proper fix is a
  school-domain sender with SPF and DKIM records, which needs STI's IT department.
- **Gmail sending uses port 465 only.** A network blocking that port breaks email.
  STARTTLS on port 587 would allow Outlook, Brevo and most relays — roughly fifteen
  lines in `backend/core/mailer.js`.
- **A free Gmail account caps at ~500 messages a day.** Fine for one office.
- **Receipt images are stored as data URLs in the database**, which keeps deployment
  simple but grows the file. Real installations should use disk or object storage.
- **Staff accounts are promoted by editing the database.** Safe, but inconvenient.
- **No password reset by email.** The 6-digit code machinery already exists and could
  be reused for it.
- **Sessions are held in memory**, so a restart signs everyone out.
- **Three demo staff accounts share a password hash.** `backend/core/seed.js` computes
  `staffHash` once for `REG-001`, `REG-002`, `REG-003`. They share a password anyway,
  so nothing new leaks, but unique salts exist to hide exactly that. Calling `hash()`
  separately for each is a one-line fix.

**Recommended next steps:** a school-domain sender, STARTTLS support, receipt files
on disk, a staff management screen, self-service password reset, and an export of
released documents for the registrar's monthly report.

## 15. Testing record

Run against this code on 16 October 2026; all passed.

| What was tested | Result |
|---|---|
| All 17 JavaScript files parse | No syntax errors |
| Server starts and seeds a fresh database | 44 accounts, 11 documents, slots, sample requests |
| Student sign-in by student number and by email | Both accepted |
| Head registrar sign-in | Accepted |
| Wrong password | Rejected, same message as an unknown account |
| Password storage | Every account `pbkdf2$210000$…`, no plaintext |
| Student registration | Created; school-domain rule enforced |
| Password change | Old password stops working, other sessions dropped |
| Student calling a registrar endpoint | Refused with 403 |
| Email setup page as a student | Refused: head registrar only |
| Gmail address validation | Non-Gmail address rejected clearly |
| App Password length check | Caught before any connection attempt |
| Test-send cooldown | Second attempt within 4 seconds refused |
| Personal notification address | Code sent to the new address, not the school one |
| Wrong confirmation code | Rejected |
| Correct confirmation code | Delivery switched to the personal address |
| Switching back to the school address | Delivery target changed back |
| Email switched off | Nothing sent; notice still appeared in the bell |
| Phone number field | Absent from schema, API and every screen |
| Document catalog and request list | Returned correctly for a signed-in student |

The only finding was the shared staff salt noted above, cosmetic in demo data.
