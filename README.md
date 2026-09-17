# STI CampusFlow — Registrar Document Request & Appointment System

A working full-stack web application for STI College Global City: students request
registrar documents and book an appointment slot, and registrar staff review, approve,
process and release those requests from their own console.

Built on the stack in the capstone gameplan — **C# / ASP.NET Core 8 MVC**, **Entity
Framework Core**, **SQL Server** (with a SQLite fallback), and **vanilla JavaScript**
on the front end.

---

## 1. Running it

### Fastest path (no database setup at all)

1. Open `STICampusFlow.sln` in **Visual Studio 2022** (any edition, workload:
   *ASP.NET and web development*).
2. Press **F5**.

That's it. The default configuration uses SQLite, so the app creates
`campusflow.db` next to the executable on first run and fills it with demo data.
Nothing needs to be installed, and it works with the campus Wi-Fi down.

Visual Studio opens <https://localhost:7241> automatically (the profile lives in
`Properties/launchSettings.json`). If a console window appears without a browser, look for
the line `Now listening on: …` and open that address yourself.

The first HTTPS run may warn about the certificate. Fix it once, from a terminal:

```bash
dotnet dev-certs https --trust
```

Or pick the **CampusFlow (http only)** profile from the green run button's dropdown and use
<http://localhost:5241> instead — handy on lab machines where you cannot trust certificates.

### Command line

```bash
cd src/STICampusFlow.Web
dotnet restore
dotnet run
```

Then open the URL printed in the console (usually `https://localhost:7xxx`).

### Switching to SQL Server

Edit `src/STICampusFlow.Web/appsettings.json`:

```jsonc
"Database": {
  "Provider": "SqlServer"     // was "Sqlite"
},
"ConnectionStrings": {
  "SqlServer": "Server=(localdb)\\MSSQLLocalDB;Database=STICampusFlow;Trusted_Connection=True;TrustServerCertificate=True"
}
```

Run the app again — EF Core creates the schema and seeds it. If you would rather
build the database by hand (useful for the DBA role and the ERD chapter), run
`database/schema-sqlserver.sql` in SQL Server Management Studio first and set
`"SeedDemoData": false`.

### Resetting the demo data

The SQLite file is created once and then left alone. After any change to the entities or
the seeder, delete it and run again to get a fresh, reseeded database:

```
src\STICampusFlow.Web\bin\Debug\net8.0\campusflow.db
```

(Three files may be there — `campusflow.db`, `-shm`, `-wal`. Delete all three.)

### If it builds but won't start

> `You must install or update .NET to run this application.`
> `Framework: 'Microsoft.AspNetCore.App', version '8.0.0' — the following frameworks were found: 10.0.x`

That machine has a newer .NET than the one the project targets. The `.csproj` already
carries `<RollForward>LatestMajor</RollForward>`, which lets the .NET 8 build run on .NET 9,
10 or later — so if you hit this, the fix is simply to **rebuild** (Build → Rebuild
Solution) so the new setting is written into `STICampusFlow.Web.runtimeconfig.json`.

If you would rather match the runtime exactly, either install the
**ASP.NET Core Runtime 8.0** from <https://dotnet.microsoft.com/download/dotnet/8.0>, or
retarget the project by changing `<TargetFramework>net8.0</TargetFramework>` to your
installed version and bumping the three `Microsoft.EntityFrameworkCore.*` package versions
to the matching major (e.g. `10.0.0`).

Targeting .NET 8 is deliberate: it is the long-term-support release, so every member of
the team can build the project whether they have .NET 8, 9 or 10 installed.

---

## 2. Demo accounts

| Role | ID | Password |
| --- | --- | --- |
| Student | `02000123456` | `Student@123` |
| Registrar head | `REG-001` | `Registrar@123` |
| Registrar staff | `REG-002` | `Registrar@123` |
| Registrar staff | `REG-003` | `Registrar@123` |

The seeder also creates 63 more students (all with `Student@123`), 10 document
types, holiday closures, capacity overrides and roughly 120 requests spread across
past, present and future dates — so every screen has realistic data during the defence.

---

## 3. What the system does

### Student side

- **Register / sign in** with an 11-digit student number (PBKDF2-SHA256 hashed passwords).
- **Pick documents** from the catalogue, with a per-document copy stepper and live fee total.
- **Book a slot** on an interactive calendar that greys out weekends, holidays, past dates
  and full days, then shows the remaining capacity of each one-hour window.
- **Confirmation ticket** with a reference code, plus a **printable claim slip** carrying a
  scannable Code 39 barcode.
- **Track the request** through Submitted → Approved → Ready for pickup → Released,
  with a full activity log.
- **Cancel** an appointment while it is still pending or approved.
- **Notifications** whenever the registrar acts on a request.

### Registrar side

- **Dashboard** — pending count, today's appointment total, documents waiting at the
  counter, releases this week, fees collected this month, per-window load bars, the most
  requested documents, and a live activity feed.
- **Queue** — search by name, student number or reference code; filter by status, document
  type and date range; sort; paginate; **bulk-approve** selected pending requests.
- **Request detail** — everything about the request and the student, their other requests,
  and only the status transitions that are legal from the current state.
- **Approve / decline / start processing / mark ready / release / mark no-show**, with
  canned decline reasons and a required explanation that the student sees.
- **Daily manifest** grouped by time window, printable, and exportable as CSV.
- **Capacity & closures** — close a date (students booked on it are notified automatically)
  and override the capacity of a whole day or a single window.

---

## 4. Business rules enforced

Every rule below lives in `Services/SchedulingService.cs` and is checked **on the server**
when the form is posted, not only in the browser — so the calendar cannot be bypassed.

1. Operating hours 8:00 AM – 5:00 PM, in one-hour windows.
2. The 12:00–1:00 PM lunch break is not bookable.
3. Weekends are closed.
4. Holidays and campus closures come from the `BlockedDates` table.
5. No bookings in the past; same-day bookings need at least 2 hours' lead time.
6. Bookings open at most 45 days ahead.
7. Each window holds 8 students by default, overridable per date or per window.
8. One appointment per student per day — this is what blocks double-booking.
9. A student may hold at most 3 open requests at once.
10. Copies per document are capped by the document's own `MaxCopies`.
11. Status transitions follow a fixed state machine; anything else is rejected.
12. Appointments that pass without being released are auto-voided as no-shows on startup.

All of these are configurable in `appsettings.json` under `"Registrar"` — the campus can
change its hours or capacity without touching code.

---

## 5. Looking at the design without installing anything

`preview/index.html` opens in any browser and links to static copies of all eleven
screens, built from the same `styles.css` + `app.css` the application uses. Nothing there
is connected to the database — it exists so the team (and the UI designer) can review the
design before the .NET SDK is installed. `preview/shots/` already holds desktop and mobile
PNGs of every screen for the manuscript; regenerate them with `python preview/build.py`
after a CSS change.

---

## 6. Project structure

```
STICampusFlow.sln
├── database/
│   └── schema-sqlserver.sql          Hand-written DDL + reporting views (for the ERD chapter)
├── docs/
│   └── defense-notes.md              Panel Q&A, architecture summary, test cases
└── src/STICampusFlow.Web/
    ├── Program.cs                    Startup, DI, auth, provider switch
    ├── appsettings.json              Office rules and connection strings
    ├── Controllers/
    │   ├── AccountController.cs      Login, registration, logout
    │   ├── StudentController.cs      Dashboard, picker, booking, tracking, slip
    │   ├── RegistrarController.cs    Queue, detail, transitions, manifest, capacity
    │   └── ApiController.cs          JSON availability endpoints for the calendar
    ├── Data/
    │   ├── AppDbContext.cs           EF Core mappings, indexes, delete behaviours
    │   └── DbSeeder.cs               Demo data generator (deterministic)
    ├── Models/
    │   ├── Entities/                 User, DocumentType, DocumentRequest, RequestItem,
    │   │                             StatusHistory, BlockedDate, SlotCapacity, Notification
    │   ├── Enums.cs                  Roles, statuses, the transition state machine
    │   └── ViewModels/
    ├── Services/
    │   ├── SchedulingService.cs      The scheduling engine (availability + validation)
    │   ├── RequestService.cs         Create, transition, cancel, audit, notify
    │   ├── NotificationService.cs
    │   └── PasswordHasher.cs         PBKDF2-SHA256, 100k iterations, per-user salt
    ├── Views/                        Razor views, one folder per controller
    └── wwwroot/
        ├── css/styles.css            The design system (from the team's Figma work)
        ├── css/app.css               Application styles built on those tokens
        └── js/app.js
```

---

## 7. Security notes (for the manuscript)

- Passwords are never stored in plain text. `PasswordHasher` derives a 256-bit key with
  PBKDF2-SHA256 over 100,000 iterations and a 128-bit per-user salt, and verifies with a
  fixed-time comparison. The iteration count is stored with the hash so it can be raised later.
- Authentication uses an HttpOnly, SameSite=Lax cookie with a 4-hour sliding expiry.
- Authorization is policy-based: `StudentOnly`, `RegistrarOnly`, `RegistrarHeadOnly`.
- Every POST is CSRF-protected — `AutoValidateAntiforgeryToken` is registered globally.
- All data access goes through EF Core with parameterised queries, so string
  concatenation into SQL never happens (no SQL-injection surface).
- Ownership is checked on every student action: a student can only open, print or cancel
  their own requests.
- The login form returns one generic error for both "unknown ID" and "wrong password",
  so it cannot be used to enumerate valid student numbers.
- Razor escapes all output by default, which covers stored XSS from note fields.

---

## 8. Where each team member's work lives

| Role | Files to own |
| --- | --- |
| Backend lead | `Services/`, `Controllers/`, `Program.cs` |
| Frontend lead | `Views/`, `wwwroot/css/app.css`, `wwwroot/js/app.js` |
| DBA & QA | `Data/`, `database/schema-sqlserver.sql`, `docs/defense-notes.md` (test cases) |
| Tech writer / UI | `wwwroot/css/styles.css`, `Views/Shared/Slip.cshtml`, screenshots |
| Project manager | Branching, merges, `README.md`, the timeline |
