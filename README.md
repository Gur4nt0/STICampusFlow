# STI CampusFlow v2 — Registrar Document Request & Appointment System

Rebuilt from the ASP.NET version into a plain **HTML + CSS + JavaScript** front end, a
**Node.js** backend and a **SQLite** database — with every item from the team's feedback
document (`minions_assemble.pdf`) built in.

**Nothing to install except Node.js.** No `npm install`, no XAMPP, no SQL Server. Node 22
has SQLite built in, so the whole backend runs from the standard library.

---

## 1. Run it

1. Install **Node.js 22.13 or newer** (the LTS from <https://nodejs.org> is fine — v24 works too).
2. Open this folder and double-click **`start.bat`** (Windows), or run:
   ```bash
   node backend/server.js
   ```
3. Open **<http://localhost:3000>**.

The first start creates `data/campusflow.db` and fills it with demo data.

**Open it on your phone:** the console also prints a link like `http://192.168.1.5:3000`.
Open that on a phone connected to the same Wi-Fi. (Allow Node through the Windows firewall
if Windows asks.)

**Fresh demo data:** stop the server, delete the `data` folder, start again (or `npm run reset`).

**Live preview (no server):** `node backend/tools/build-preview.js` builds
`dist/campusflow-preview.html` — the whole app in one file, running the same rules in the
browser with data saved in localStorage. Good for showing the design to the adviser.

### Settings file (`.env`) — connecting the front end and back end
All server settings live in **`.env`**. Add or change values there as needed;
`backend/server.js` reads it on start using Node's built-in loader, so there is still nothing to install.
Values set by a host (Render, Railway, Docker) override the file. `.env` is in `.gitignore`, so passwords never reach GitHub.

**Mode 1 — one server (default).** `node backend/server.js`, open <http://localhost:3000>. The server gives
out the front end *and* the API on the same address. Nothing to configure.

**Mode 2 — front end opened separately** (e.g. VS Code **Live Server** on port 5500):
1. Start the back end: `node backend/server.js` (keep it running).
2. In `.env`, check `API_URL` (where the back end runs, default `http://localhost:3000`) and
   `FRONTEND_URL` / `CORS_ORIGINS` (where the front end is opened, default port 5500).
3. Restart the server. It writes `frontend/env.js`, which tells the front end where the API is.
4. Open `frontend/index.html` with Live Server. Sign-in, requests and notifications go to the back end.

Only the addresses in `FRONTEND_URL` / `CORS_ORIGINS` may call the API; any other site is refused.

| Variable | What it does |
| --- | --- |
| `PORT` | Back-end port (3000) |
| `API_URL` | Back-end address the front end calls (Mode 2) |
| `FRONTEND_URL`, `CORS_ORIGINS` | Front-end addresses allowed to call the API (Mode 2) |
| `COOKIE_SAMESITE` | `Lax` locally; `None` only for different domains over https |
| `PUBLIC_URL` | Address printed in the slip QR codes |
| `DATA_DIR`, `DB_FILE` | Where the SQLite database is kept |
| `SEED_MODE`, `ADMIN_PASSWORD`, `DEMO_PASSWORD` | Demo data or real-use start |
| `SLIP_SECRET` | Key that signs QR links (blank = random, saved in `data/`) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_FROM_NAME`, `EMAIL_NOTIFICATIONS` | Email notices |
| `ALLOWED_EMAIL_DOMAINS` | School email domains allowed to sign up |

### Demo accounts

| Role | How to sign in |
| --- | --- |
| Student | **Student** tab → `02000123456` / `Student@123` (or tap the demo button to fill it in) |
| Registrar head | **Registrar staff** tab → `REG-001` / `Registrar@123` |
| Registrar staff | `REG-002`, `REG-003` / `Registrar@123` |

New students make their own account from **Create your account** on the sign-in page.
Typing a new `@…sti.edu.ph` email in the picker creates a new student, so you can show the first-time setup.

---

## 2. What changed, item by item (from the feedback doc)

### Features
| Feedback | What we built |
| --- | --- |
| **1.** Paid docs (Good Moral, Form 137 & 138) need a payslip with the doc types, registrar's name and signature | Every request with a fee gets a printable **Payment slip** (order of payment) listing codes, copies, unit fees and total, with the **registrar's name, title and signature** and a **QR code**. Student pays at the Cashier, then **uploads the OR number + a photo of the receipt**. Registrar checks it (*Payment is correct* / *Not accepted* with a reason). Paid documents can't be marked ready until the payment is confirmed. **Form 138** was added to the catalogue. The head registrar draws the signature once under **Slip signature**; it prints on every payment slip and claim slip. |
| **2.** Notify a day before, "make sure you come at the exact time" | Automatic reminders **24 hours before** and **2 hours before** each appointment (in the bell, as a toast, and as a **browser pop-up** if the student turns it on). |
| **2.** Typhoon: students think the office is closed too | Registrar → **Closures & notices** → *Classes suspended, office open*. Every student booked that day is notified that the office **is open** and their appointment stays (they may also move it for free). The day shows a warning dot on the calendar and a notice on the claiming board. *Office closed* is also available for holidays — booked students are asked to pick a new time at no penalty. |
| **3.** Side announcements with who's claiming, by student number | **Claiming board** on the right side of every page (its own tab on phones): *"02000•••456 — Good Moral Certificate — 2:30 PM"*, with the student's own row highlighted as **You**, crossed out once claimed, plus seats left per window and registrar announcements. Middle digits are hidden for privacy (set `maskStudentNumbers: false` in `backend/config.js` to show full numbers). |

### Design
| Feedback | What we built |
| --- | --- |
| **1.** Can't open on a phone | Fully responsive. Phones get a bottom tab bar, one-column layouts, bottom-sheet dialogs, big tap targets, and safe-area support for notched phones. Tested at 390 px and 1440 px wide. |
| **2.** Cards too white, can't tell forms apart | Cards now have a visible border and shadow on a tinted page background, plus a **mild colour stripe on the left side** per category (records, certifications, clearances, enrollment). A selected document gets a coloured outline, tinted fill and check mark. |
| **3.** Dark mode | Moon/sun button in the top bar; Light / Dark / Match my device under Account. Remembered per browser. |
| **4.** Font style | Body: **Atkinson Hyperlegible Next** (made for easy reading). Headings: **Bricolage Grotesque**. Falls back to Segoe UI if offline. |
| **5.** Centered when zoomed out | The whole app sits in a centered frame (max 1440 px), and page content is centered inside it. |

### System
| Feedback | What we built |
| --- | --- |
| **1.** Cancel right away or give extra time? | **Both, in steps.** A **30-minute grace period** after the window ends. If still not claimed, the request becomes **Missed — on hold** (not cancelled) and the student has **7 days** to pick a new time. Only after that is it closed as *Not claimed*. Students can move an appointment up to **2 times**. All numbers are in `backend/config.js`. |
| **2.** Limit so students don't conflict | **One-hour windows (8 AM, 9 AM, 10 AM… 4 PM) with 8 seats each** (configurable, and adjustable per day by the registrar). Seats are checked **on the server inside a database transaction**, so two students can't grab the last seat at once. A student can only have **one appointment per day** and **3 open requests**; the calendar marks days they already booked. The calendar also blocks days before the documents can be ready (e.g. Transcript needs 5 working days). |

---

### v2.1 changes
- **Hour-only time windows.** Students pick 8 AM, 9 AM, 10 AM… 4 PM (lunch 12–1 PM is closed). Times show without minutes ("2 PM to 3 PM"). Change `slotMinutes` / `defaultSlotCapacity` in `backend/config.js`.
- **QR code instead of a barcode** on both the payment slip and the claim slip. Scanning it opens a live, signed copy of that slip **without signing in**, showing the current status, so the Registrar can scan it at the window to confirm it's genuine. The link carries an HMAC token (`data/.slip-secret`), so slip links can't be guessed or faked.
- **Download as image.** Every slip has a *Download as image* button that saves a PNG (with the QR and signature) to the phone's Downloads/Photos, plus *Print or save as PDF*.
- The QR points to this computer's Wi-Fi address so phones on the same network can open it. Once hosted online, set `publicUrl` in `backend/config.js` (or the `PUBLIC_URL` environment variable) to the real address.
- **After updating from v2.0, delete the `data` folder once** so the demo data is recreated with hourly times.

### v2.2 — ready for web hosting
- **Hosting files:** `render.yaml` (Render), `Dockerfile` (Railway, Fly.io, any VPS), and **`DEPLOY.md`** with click-by-click steps.
- **Host detection:** on Render/Railway/Fly the QR codes automatically use the site's `https://` address.
- **Data folder setting:** `DATA_DIR` keeps the database on the host's persistent disk.
- **Real-use mode:** `SEED_MODE=minimal` starts with only the document list and the head registrar account (`ADMIN_PASSWORD`), and hides the demo buttons on the sign-in page.
- **Public-site safety:** change password (Account page), login throttling, Secure cookies + HSTS over https, `/health` check, clean shutdown on redeploy.

### v2.3
- **Everyone signs in with a password.** Students use their student number or school email, staff use their staff ID. Passwords are hashed with PBKDF2-SHA256 at 210,000 iterations with a random salt for each account, so the database never holds a usable password. Sign-ups only accept school email domains (`ALLOWED_EMAIL_DOMAINS`).
- **Email notices through Gmail, with the student choosing where.** Every notification in the app is also emailed. In **Account → Email notices** a student picks one of three: their **school email** (the Outlook address they signed up with), a **personal email** such as Gmail, or **no email at all**, in which case notices stay in the bell. A personal address only starts receiving mail after a 6-digit code sent to it is typed back in, so a typo cannot send appointment details to a stranger. This matters because mail from a Gmail sender often lands in a school Outlook Junk folder. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` (see DEPLOY.md); leave them blank and the messages print in the console instead.
- **Registrar staff** keep staff ID + password, on their own tab.
- **"Change password" removed** for everyone.
- **Registrar can upload a signature image.** The paper background is removed automatically; drawing still works too.

### v2.4
- **Show/hide password.** Every password box has an eye button to show or hide what you typed.
- **Password strength meter.** Create account and Change password show *Weak / Fair / Strong / Very strong* as you type, plus a tip, and say whether the repeated password matches. Weak passwords are stopped before they reach the server.
- **Top header hides while scrolling down** and comes back as soon as you scroll up, so there is more room for content (especially on phones).
- **Small notification dropdown (like eLMS).** The bell opens a compact panel with the latest notices, *Mark all as read*, and *See all notifications*. The full Notifications page uses the same compact rows.
- **Sign-out confirmation.** "Are you sure you want to log out?" pop-up before signing out, from the sidebar or the Account page.
- **Calendar:** days before today are shown in **red** and can't be clicked; only today onward can be booked (the server also refuses past dates).
- **Dashboard header:** the registrar dashboard opens with a header banner (greeting, date, what needs attention, quick buttons).
- **Folder structure:** the app has separate `backend/` and `frontend/` folders. Each is split into clear subfolders so code is quick to find. See section 3.

## 3. Project structure

The full technical reference is in [`docs/SYSTEM DOCUMENTATION.md`](docs/SYSTEM%20DOCUMENTATION.md).

```
backend/                  Server, configuration, business logic, storage and database schema
  server.js               HTTP server and API
  config.js               Office rules and settings defaults
  core/                   Business rules, repositories, seed data and mailer
  database/schema.sql     Database tables, keys, indexes and checks
  tools/                  Backend utilities, including the preview builder
frontend/                 Browser app
  index.html              App shell; env.js is generated from .env
  css/                    Base, layout, component and page styles
  js/                     Browser logic, shared components and screens
data/                     Runtime database and secret files (created on first start)
docs/                     System documentation
.env                      Local settings (ignored by Git)
README.md, DEPLOY.md       Setup and deployment guides
Dockerfile, render.yaml   Hosting setup
```

**Architecture in one sentence (for the panel):** a single-page front end talks to a JSON
REST API; the API's rules live in `backend/core/logic.js` and reach the database only through a
repository object, so the same rules run against SQLite on the server and against memory in
the preview.

### Tables
`users`, `document_types`, `requests`, `request_items`, `status_history`, `closures`,
`capacity_overrides`, `notifications`, `announcements`, `settings`. See `backend/database/schema.sql`.

### Request statuses
`pending → approved → processing → ready → released`, plus `rejected`, `cancelled`,
`missed` (on hold, can be rescheduled) and `noshow` (closed). Payment has its own track:
`none | unpaid → submitted → verified` (or `rejected` → re-upload).

### Main API endpoints
| Method | Path | Who |
| --- | --- | --- |
| POST | `/api/auth/login` (staff), `/api/auth/logout`, `/api/me/profile` (student number, once) | — |
| GET | `/api/documents`, `/api/availability?month=&docs=`, `/api/slots?date=` | signed in |
| GET/POST | `/api/requests`, `/api/requests/:id` | student (own) / registrar (all) |
| POST | `/api/requests/:id/cancel`, `/reschedule`, `/payment` | student |
| POST | `/api/requests/:id/transition`, `/verify-payment`, `/api/requests/bulk-approve` | registrar |
| GET | `/api/board` | signed in (claiming board) |
| GET | `/api/public/slip/:ref?t=token` | anyone with the QR link |
| GET | `/api/registrar/dashboard`, `/api/registrar/manifest?date=` | registrar |
| GET/POST/DELETE | `/api/closures`, `/api/capacity`, `/api/announcements` | registrar |
| GET/POST | `/api/notifications`, `/api/notifications/read` | signed in |
| GET/POST | `/api/settings` (registrar name + signature) | read: all · write: head |

---

## 4. Security notes (for the manuscript)
- Passwords: **PBKDF2-SHA256, 210,000 iterations, 16-byte random salt per account**, compared with `timingSafeEqual`. Raising the work factor upgrades each password automatically on its owner's next sign-in. A wrong password and an unknown account return the same message, so the page cannot be used to discover who is registered.
- Staff passwords: **PBKDF2-SHA256, 100,000 iterations, random salt per user**, constant-time compare.
- Sessions: random 256-bit token in an **HttpOnly, SameSite=Lax** cookie, 8-hour sliding expiry.
- **CSRF**: every write must carry the `X-Requested-With: CampusFlow` header, which a
  cross-site form cannot send.
- **SQL injection**: every query uses `?` placeholders (`backend/core/repo-sqlite.js`).
- **XSS**: all user text is escaped before it touches the page (`esc()` in `frontend/js/core/helpers.js`).
- Students can only open, pay, move or cancel **their own** requests; role checks on every endpoint.
- Login gives one generic error for wrong ID or wrong password.
- Receipt photos are shrunk in the browser and size-limited on the server.

## 5. Changing the rules
Edit `backend/config.js` and restart: opening hours, window length, seats per window, lunch break,
booking range, lead time, grace period, reschedule window, reminder timing, masking.

## 6. Moving to MySQL later
`backend/database/schema.sql` is standard SQL. Swap `backend/core/repo-sqlite.js` for a MySQL version with the
same function names (e.g. using `mysql2`) — nothing in `backend/core/logic.js` or the front end changes.
