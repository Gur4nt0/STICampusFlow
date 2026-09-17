# Defence notes — STI CampusFlow

Everything below is meant to be read out loud, adapted, or pasted into the manuscript.

---

## 1. One-paragraph system description

STI CampusFlow is an ASP.NET Core 8 MVC web application that lets enrolled students of
STI College Global City request registrar documents online and reserve a one-hour
appointment window to claim them, while registrar staff review, approve, prepare and
release those requests from a separate console. The system replaces the walk-in queue
with a scheduled one: the office knows in advance how many students are coming, what
each of them is claiming, and how much has to be collected, while the student always
knows where their document stands.

---

## 2. Architecture (Chapter 3 material)

Three layers, all inside one ASP.NET Core MVC project:

**Presentation** — Razor views and a small amount of vanilla JavaScript. No SPA
framework: the calendar and the document picker enhance ordinary HTML forms rather than
replacing them, so every screen still works if JavaScript fails on a campus machine.

**Application / business** — three services registered in the DI container:

- `SchedulingService` owns every scheduling rule: which windows exist, which dates are
  open, how full each slot is, and whether a proposed booking is legal.
- `RequestService` owns the request lifecycle: creating a request, moving it through the
  status machine, cancelling it, writing the audit trail and pushing notifications.
- `NotificationService` writes in-app messages, behind an interface so SMS or e-mail can
  be added later without touching the controllers.

**Data** — Entity Framework Core with a provider switch. `AppDbContext` maps eight
entities and declares the indexes and delete behaviours. Because EF Core builds
parameterised queries, the application has no hand-written SQL string concatenation.

### Why a service layer instead of logic in the controllers

The booking rules are needed in three places: the calendar that paints availability, the
JSON endpoint the calendar refreshes from, and the POST that finally saves the request.
Putting them in one service means those three can never disagree — which is exactly the
failure mode that produces a double-booked slot.

---

## 3. The scheduling algorithm

`SchedulingService.GetSlotStarts()` builds the window grid from configuration:

```
for t = OpenTime; t + SlotLength <= CloseTime; t += SlotLength
    skip t if [t, t+SlotLength) overlaps the lunch break
```

With the defaults (08:00–17:00, 60-minute windows, 12:00–13:00 lunch) that yields eight
windows: 8, 9, 10, 11, 13, 14, 15, 16.

`ValidateBookingAsync` then applies nine checks in order, collecting every failure so the
student sees all problems at once rather than one per attempt:

| # | Rule | Why it exists |
| --- | --- | --- |
| 1 | Slot must be in the generated grid | Blocks a hand-crafted POST with `SlotStart=03:00` |
| 2 | No weekends | The office is closed |
| 3 | No blocked dates | Holidays and campus closures |
| 4 | No past dates | Cannot attend an appointment that already happened |
| 5 | Same-day needs 2 h lead time | Gives the office time to see the request |
| 6 | Max 45 days ahead | Keeps the calendar meaningful |
| 7 | Slot capacity not exceeded | The counter can only serve so many per hour |
| 8 | One appointment per student per day | **This is the anti-double-booking rule** |
| 9 | Max 3 open requests per student | Stops one student flooding the queue |

Only four statuses occupy a seat — Pending, Approved, Processing, ReadyForPickup — so a
cancelled or released request immediately frees its slot.

**Complexity.** Painting a month used to be a query per day; `GetMonthAsync` instead runs
three queries for the whole month (bookings grouped by date+slot, capacity overrides,
closures) and does the arithmetic in memory. For a 31-day month that is 3 round trips
instead of 31 × 8.

---

## 4. The status state machine

```
Pending ──► Approved ──► Processing ──► ReadyForPickup ──► Released
   │            │             │                │
   ▼            ▼             ▼                ▼
Rejected    Rejected       NoShow           NoShow
                └──────► NoShow
Pending/Approved ──► Cancelled   (student action only)
```

The legal transitions are declared once, on the enum, in
`RequestStatusExtensions.AllowedNextStatuses`. `RequestService.TransitionAsync` refuses
anything outside that map, and the detail view renders only the buttons the map allows —
so the UI and the server can never disagree about what is possible. Every transition
writes a `StatusHistory` row, which is what both the student tracker and the staff
activity log read from.

---

## 5. Likely panel questions

**"How do you stop two students booking the same slot?"**
Capacity, not exclusivity — a window holds eight students by default. The count is taken
inside `ValidateBookingAsync` at POST time, not from what the browser was showing, so a
slot that filled while the student was deciding is caught. Separately, one student cannot
hold two appointments on the same day. If you want strict one-student-per-slot, set the
capacity to 1 in `appsettings.json`; no code changes.

**"What if the student edits the HTML and posts a Sunday at 3 AM?"**
Every rule runs again on the server. The client-side calendar is a convenience; the
`BookingValidation` object is the authority. Try it during the demo — post a blocked date
and the form comes back with the reason.

**"Why one Users table for students and staff?"**
Both need the same identity fields, and the alternative — two tables — would need a union
for anything that touches both (audit trails, notifications, "who processed this"). The
`Role` column plus policy-based authorization keeps them apart, and every student action
also checks ownership, so a student cannot read another student's request even by ID.

**"How are passwords stored?"**
PBKDF2-SHA256, 100,000 iterations, a fresh 128-bit salt per user, verified with
`CryptographicOperations.FixedTimeEquals`. The stored format is
`iterations.salt.hash`, so the work factor can be raised later without invalidating
existing passwords. Nothing reversible is stored.

**"Is it safe from SQL injection?"**
All data access is EF Core LINQ, which parameterises everything. There is no raw SQL in
the application. The search box in the queue compiles to a parameterised `LIKE`.

**"Why SQLite and SQL Server?"**
One line of configuration switches between them. SQL Server is the production target;
SQLite means the system boots on any laptop with no server installed — insurance for
defence day. The domain code does not know the difference.

**"What happens to missed appointments?"**
`MarkMissedAppointmentsAsync` runs at startup and voids any appointment whose date has
passed while still open, writing a system entry in the audit trail. In production this
would move to a hosted background service running nightly.

**"What would you add next?"**
E-mail and SMS notifications (the interface is already there), an online payment link for
the Cashier step, a QR code on the claim slip for counter scanning, and a reporting screen
built on the three SQL views in `schema-sqlserver.sql`.

---

## 6. Test cases (Chapter 4 material)

| # | Scenario | Steps | Expected result | Status |
| --- | --- | --- | --- | --- |
| TC-01 | Valid booking | Pick TOR ×1, choose a weekday 3 days out, pick 9 AM, submit | Request created, reference code shown, status Pending | Pass |
| TC-02 | Weekend blocked | Navigate the calendar to a Saturday | Date is greyed out and not clickable | Pass |
| TC-03 | Weekend blocked (server) | POST a Saturday date directly | Rejected: "The registrar is closed on weekends." | Pass |
| TC-04 | Holiday blocked | Try to book a date in `BlockedDates` | Rejected with the closure reason | Pass |
| TC-05 | Past date | POST yesterday's date | Rejected: "…date that has already passed." | Pass |
| TC-06 | Lead time | Book today at a window less than 2 h away | Slot shown as unavailable; POST rejected | Pass |
| TC-07 | Full slot | Fill a window to capacity, then book it again | Slot shows "full"; POST rejected with the count | Pass |
| TC-08 | Double booking | Book two requests on the same date as one student | Second rejected: "You already have an appointment on …" | Pass |
| TC-09 | Open request cap | Hold 3 open requests, try a fourth | Rejected with the limit explained | Pass |
| TC-10 | Copy limit | Request 5 copies of a document whose max is 3 | Rejected naming the document and its limit | Pass |
| TC-11 | Invalid student number | Register with 10 digits | Client and server both reject: "exactly 11 digits" | Pass |
| TC-12 | Duplicate registration | Register an existing student number | Rejected: "An account already exists…" | Pass |
| TC-13 | Wrong password | Sign in with a bad password | Generic "That ID or password is not correct." | Pass |
| TC-14 | Illegal transition | POST `Release` on a Pending request | Rejected: cannot move Pending → Released | Pass |
| TC-15 | Decline without reason | Submit the decline form empty | Rejected: "A reason is required…" | Pass |
| TC-16 | Cross-student access | Student A opens Student B's request ID | 404 Not Found | Pass |
| TC-17 | Role separation | Student opens `/Registrar` | Redirected to Access denied | Pass |
| TC-18 | CSRF | POST without the antiforgery token | 400 Bad Request | Pass |
| TC-19 | Closing a booked date | Close a date that already has appointments | Date closed; every affected student is notified | Pass |
| TC-20 | Capacity override | Set a window to capacity 0 | The window shows as closed on the student calendar | Pass |
| TC-21 | Cancel then rebook | Cancel a pending request, book the same slot | Succeeds — the cancelled request freed the seat | Pass |
| TC-22 | Search | Type a reference code in the queue search | Only that request is listed | Pass |
| TC-23 | Bulk approve | Select 3 pending requests, bulk approve | All 3 move to Approved, each student notified | Pass |
| TC-24 | Manifest export | Export the CSV for a busy date | File downloads with one row per appointment | Pass |
| TC-25 | Print slip | Print a claim slip | Barcode and reference code render; navigation hidden | Pass |

---

## 7. Demo script for defence day (about 6 minutes)

1. **Login as a student** (`02000123456` / `Student@123`). Point out the dashboard:
   next appointment, active requests, ready for pickup.
2. **Request a document.** Pick *Transcript of Records*, raise it to 2 copies, note the
   live fee total in the floating bar. Continue.
3. **The calendar.** Point at a greyed-out weekend, then at the holiday, then hover a day
   to show remaining slots. Pick a date; the windows load without a page reload.
4. **Try to break it.** Open dev tools, change the hidden date field to a Sunday, submit.
   The server rejects it with a reason. *(This is the moment that wins the panel.)*
5. **Book properly.** Show the confirmation ticket and the reference code, then open the
   printable claim slip with the barcode.
6. **Switch to the registrar** (`REG-001` / `Registrar@123`). Dashboard: pending count,
   today's manifest, per-window load bars.
7. **Approve the request you just made.** Search for the reference code, open it, approve.
8. **Back to the student tab.** Refresh — the tracker has advanced and a notification is
   waiting.
9. **Close a date** on the Capacity & closures screen and show the students who were
   booked on it being notified.
10. **Export the manifest** as CSV to finish.

---

## 8. Known limitations (say these before the panel finds them)

- Notifications are in-app only; e-mail and SMS are designed for but not wired up.
- Payment is recorded as a fee amount, not an online transaction — the Cashier step stays
  manual by design, matching current campus practice.
- The no-show sweep runs at application startup rather than on a nightly schedule.
- There is no password reset flow; the registrar head would reset accounts in practice.
- The barcode is Code 39, chosen because it prints reliably on office printers; a QR code
  would carry more data but needs a library.
