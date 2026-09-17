#!/usr/bin/env python3
"""
Generates static HTML previews of the CampusFlow screens.

These mirror the markup produced by the Razor views so the CSS can be checked in a
browser (and screenshotted for the manuscript) without installing the .NET SDK.
They are previews only - no data is live.
"""
import datetime
import os
import pathlib

OUT = pathlib.Path(__file__).parent

HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title} - STI CampusFlow</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="css/styles.css" />
<link rel="stylesheet" href="css/app.css" />
</head>
"""

ICON = {
    "home": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    "doc": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    "cal": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    "grid": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
    "list": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    "gear": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    "out": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    "bell": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    "file": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    "info": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    "clock": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    "peso": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    "search": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    "check": '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    "checkdark": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    "left": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    "right": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
}


def sidebar(role, active):
    if role == "staff":
        items = [("grid", "Dashboard", "registrar-dashboard.html"),
                 ("list", "Queue", "registrar-queue.html"),
                 ("cal", "Manifest", "registrar-manifest.html"),
                 ("gear", "Capacity", "registrar-schedule.html")]
        initials = "MV"
    else:
        items = [("home", "Home", "student-dashboard.html"),
                 ("doc", "Request", "student-documents.html"),
                 ("cal", "My requests", "student-request.html")]
        initials = "JD"

    dot = '<span class="dot"></span>'
    parts = []
    for key, label, href in items:
        cls = "active" if key == active else ""
        badge = dot if (role == "staff" and key == "list") else ""
        parts.append(f'<a class="side-btn {cls}" href="{href}" title="{label}">{ICON[key]}{badge}</a>')
    links = "".join(parts)

    return f"""<aside class="sidebar">
  <a class="side-mark" href="index.html" title="CampusFlow">CF</a>
  {links}
  <div class="side-spacer"></div>
  <button class="side-btn" title="Sign out">{ICON['out']}</button>
  <div class="side-avatar">{initials}</div>
</aside>"""


def topbar(crumb, title, name, role_label, initials, unread=3):
    badge = f'<span class="notif-badge">{unread}</span>' if unread else ""
    return f"""<header class="topbar">
  <div class="topbar-title">{crumb + " / " if crumb else ""}<b>{title}</b></div>
  <div class="topbar-right">
    <details class="notif">
      <summary class="icon-btn" title="Notifications">{ICON['bell']}{badge}</summary>
      <div class="notif-panel">
        <div class="notif-head"><b>Notifications</b><button class="link-btn">Mark all read</button></div>
        <ul class="notif-list">
          <li class="is-unread"><a href="#"><b>Your document is ready for pickup</b><span>CF-7K2M9Q is ready at the registrar counter.</span><em>Today, 10:42 AM</em></a></li>
          <li class="is-unread"><a href="#"><b>Your request was approved</b><span>CF-4TQW8N is confirmed for September 24 at 9:00 AM.</span><em>Yesterday, 3:15 PM</em></a></li>
          <li><a href="#"><b>Welcome to CampusFlow</b><span>Your account is ready.</span><em>Sep 2, 8:00 AM</em></a></li>
        </ul>
      </div>
    </details>
    <div class="who">
      <div><div class="name">{name}</div><div class="role">{role_label}</div></div>
      <div class="who-avatar">{initials}</div>
    </div>
  </div>
</header>"""


def shell(title, role, active, crumb, page_title, body, name, role_label, initials, flash=None):
    flash_html = ""
    if flash:
        kind, msg, icon = flash
        flash_html = (f'<div class="flash flash-{kind}"><span class="flash-icon">{icon}</span>'
                      f'<span>{msg}</span></div>')

    return (HEAD.format(title=title) + f"""<body>
<div class="app-shell">
{sidebar(role, active)}
<div class="main-col">
{topbar(crumb, page_title, name, role_label, initials)}
<main class="page">
{flash_html}
{body}
</main>
</div>
</div>
<script src="js/app.js"></script>
</body>
</html>
""")


# =====================================================================
# 1. Login
# =====================================================================
login = HEAD.format(title="Sign in") + """<body>
<div class="login-shell">
  <div class="login-bg"></div>
  <div class="hero-topbar">
    <div class="hero-mark">CF</div>
    <div class="hero-brand">STI CampusFlow<span>Office of the Registrar &middot; Global City</span></div>
  </div>
  <div class="hero-copy">
    <h1>Book the registrar. Skip the queue.</h1>
    <p>Request your transcript, certificate of enrolment or exam permit online, pick a time that fits
       your class schedule, and track it until it is ready for pickup.</p>
  </div>
  <div class="hero-stats">
    <div class="hero-stat"><b>8AM&ndash;5PM</b><span>Mon to Fri</span></div>
    <div class="hero-stat"><b>10</b><span>Documents offered</span></div>
    <div class="hero-stat"><b>&lt; 3 min</b><span>Average booking</span></div>
  </div>

  <div class="login-card-wrap">
    <div class="login-card">
      <div class="kicker">STI CampusFlow</div>
      <h2>Sign in</h2>
      <p class="sub">Use your 11-digit student number, or your staff ID if you work at the registrar.</p>
      <div class="role-tabs">
        <button type="button" class="role-tab active">Student</button>
        <button type="button" class="role-tab">Registrar staff</button>
      </div>
      <form onsubmit="return false">
        <div class="id-field">
          <label>Student number</label>
          <input value="02000123456" />
        </div>
        <div class="id-field">
          <label>Password</label>
          <input type="password" value="password" />
        </div>
        <label class="check-row"><input type="checkbox" /><span>Keep me signed in on this device</span></label>
        <button type="submit" class="btn btn-teal btn-block">Sign in</button>
      </form>
      <div class="divider-row"><span class="line"></span><span>new student?</span><span class="line"></span></div>
      <a class="btn btn-office btn-block" href="#">Create a student account</a>
      <div class="login-foot">Demo accounts for the defence:<br />
        <b>02000123456</b> / Student@123 &nbsp;&middot;&nbsp; <b>REG-001</b> / Registrar@123</div>
    </div>
  </div>
  <div class="login-copyright">&copy; 2026 STI College Global City</div>
</div>
<script src="js/app.js"></script>
</body></html>"""


# =====================================================================
# 2. Student dashboard
# =====================================================================
student_dashboard_body = """
<div class="greet">
  <h1>Good morning, Juan.</h1>
  <p>BS Information Technology &middot; IT-401 &middot; Student no. 02000123456</p>
</div>

<div class="queue-banner">
  <div class="qb-text">
    <h3>Your next appointment</h3>
    <p><b>Transcript of Records</b> &mdash; Thursday, September 24 at 9:00 AM &ndash; 10:00 AM.
       Reference <b>CF-7K2M9Q</b>. Status: Ready for pickup.</p>
  </div>
  <div class="qb-cta"><a class="btn btn-yellow" href="student-request.html">View details</a></div>
</div>

<div class="stat-row">
  <div class="stat-card"><div class="n">2</div><div class="l">Active requests</div></div>
  <div class="stat-card"><div class="n">1</div><div class="l">Ready for pickup</div></div>
  <div class="stat-card"><div class="n">7</div><div class="l">Released to date</div></div>
</div>

<div class="section-head"><h2>Recent requests</h2><a href="#">See all</a></div>
<div class="appt-list">
  <a class="appt-mini" href="student-request.html">
    <div class="date-chip"><div class="mo">Sep</div><div class="d">24</div></div>
    <div class="body"><h4>Transcript of Records</h4><p>9:00 AM &ndash; 10:00 AM &middot; CF-7K2M9Q &middot; 2 copies</p></div>
    <span class="status-pill is-ready">Ready for pickup</span>
  </a>
  <a class="appt-mini" href="student-request.html">
    <div class="date-chip"><div class="mo">Sep</div><div class="d">29</div></div>
    <div class="body"><h4>Good Moral Certificate +1 more</h4><p>1:00 PM &ndash; 2:00 PM &middot; CF-4TQW8N &middot; 3 copies</p></div>
    <span class="status-pill is-approved">Approved</span>
  </a>
  <a class="appt-mini" href="student-request.html">
    <div class="date-chip"><div class="mo">Aug</div><div class="d">28</div></div>
    <div class="body"><h4>Certificate of Enrollment</h4><p>10:00 AM &ndash; 11:00 AM &middot; CF-9NXH2D &middot; 1 copy</p></div>
    <span class="status-pill is-released">Released</span>
  </a>
  <a class="appt-mini" href="student-request.html">
    <div class="date-chip"><div class="mo">Aug</div><div class="d">12</div></div>
    <div class="body"><h4>Examination Permit</h4><p>3:00 PM &ndash; 4:00 PM &middot; CF-2RMK7V &middot; 1 copy</p></div>
    <span class="status-pill is-rejected">Rejected</span>
  </a>
</div>

<div class="section-head"><h2>Before you go to the office</h2></div>
<div class="req-grid">
  <div class="info-card"><h4>Bring your student ID</h4><p>The counter will not release a document without a valid ID or, if you are claiming for someone else, an authorisation letter.</p></div>
  <div class="info-card"><h4>Settle fees at the Cashier first</h4><p>Paid documents are only prepared once the Cashier has recorded your payment. Bring the receipt with your claim slip.</p></div>
  <div class="info-card"><h4>Arrive within your slot</h4><p>Slots run for one hour. If you miss your appointment, it is voided at the end of the day and you will need to book again.</p></div>
  <div class="info-card"><h4>Watch your status</h4><p>You will get a notification here the moment the registrar approves your request or marks the document ready.</p></div>
</div>
"""


# =====================================================================
# 3. Document picker
# =====================================================================
DOCS = [
    ("Academic records", [
        ("TOR", "Transcript of Records", "Official record of all subjects taken and grades earned. Required for transfers and board exams.", 5, "&#8369;350.00 per copy", 3, True, 2),
        ("COG", "Certificate of Grades", "Copy of your grades for a specific term, signed by the registrar.", 2, "&#8369;75.00 per copy", 5, False, 1),
        ("HDF", "Honorable Dismissal", "Clearance issued when transferring to another school.", 7, "&#8369;200.00 per copy", 1, False, 1),
        ("F137", "Form 137 / Permanent Record", "Permanent scholastic record forwarded directly to the receiving school.", 7, "&#8369;150.00 per copy", 1, False, 1),
    ]),
    ("Permits and clearances", [
        ("EXP", "Examination Permit", "Permit required to sit for midterm or final examinations.", 1, "Free of charge", 2, False, 1),
        ("CLR", "Student Clearance Form", "End-of-term clearance signed by all offices before grades are released.", 2, "Free of charge", 2, False, 1),
    ]),
    ("Certifications", [
        ("GMC", "Good Moral Certificate", "Certifies that you have no pending disciplinary record on campus.", 3, "&#8369;100.00 per copy", 3, True, 1),
        ("DIP", "Diploma (Second Copy)", "Replacement copy of your diploma. Requires an affidavit of loss.", 10, "&#8369;500.00 per copy", 1, False, 1),
        ("CAV", "CAV (Authentication)", "Certification, Authentication and Verification for overseas applications.", 10, "&#8369;450.00 per copy", 2, False, 1),
    ]),
    ("Enrolment", [
        ("COE", "Certificate of Enrollment", "Certifies that you are officially enrolled for the current term.", 1, "&#8369;50.00 per copy", 5, False, 1),
    ]),
]


def doc_card(code, name, desc, days, fee, maxc, selected, copies):
    return f"""<article class="req-card {'selected' if selected else ''}" data-doc-id="{code}" data-max-copies="{maxc}" tabindex="0">
  <div class="req-top">
    <div class="req-icon">{ICON['file']}</div>
    <div class="req-check">{ICON['check']}</div>
  </div>
  <h4>{name} <span class="doc-code">{code}</span></h4>
  <p>{desc}</p>
  <div class="req-meta">
    <span>{ICON['clock']} {days} working day{'' if days == 1 else 's'}</span>
    <span>{ICON['peso']} {fee}</span>
  </div>
  <div class="copies-row" data-stop>
    <span>Copies</span>
    <div class="stepper">
      <button type="button" class="step-btn">&minus;</button>
      <output class="step-value">{copies}</output>
      <button type="button" class="step-btn">+</button>
    </div>
    <small>max {maxc}</small>
  </div>
</article>"""


groups = "".join(
    f'<div class="req-group"><div class="req-group-label">{label}</div><div class="req-grid">'
    + "".join(doc_card(*d) for d in docs) + "</div></div>"
    for label, docs in DOCS)

student_documents_body = f"""
<div class="page-head">
  <div>
    <h1>What do you need from the registrar?</h1>
    <p>Pick one or more documents. You can raise the number of copies on each card.
       The next screen lets you choose the date and time you will drop by.</p>
  </div>
  <div class="step-chips"><span class="step-chip active">1 &middot; Documents</span><span class="step-chip">2 &middot; Schedule</span></div>
</div>

<div class="cashier-note">
  {ICON['info']}
  <div>Documents with a fee must be paid at the <b>Cashier's Office</b> before the registrar
       prepares them. Bring the official receipt together with your claim slip.</div>
</div>

{groups}

<div class="float-bar show">
  <div class="fb-text"><span>2 documents &middot; 3 copies</span> &middot; <span>&#8369;800.00</span></div>
  <a class="btn btn-yellow" id="fbProceed" href="student-booking.html">Choose a schedule &rarr;</a>
</div>
"""


# =====================================================================
# 4. Booking
# =====================================================================
def calendar_grid():
    # September 2026: 1st is a Tuesday. Today = 18 (Friday).
    cells = []
    for _ in range(2):                       # Sun, Mon padding
        cells.append('<span class="cal-day pad"></span>')
    for day in range(1, 31):
        date = datetime.date(2026, 9, day)
        cls = "cal-day"
        title = ""
        if date.weekday() >= 5:
            cls += " disabled"
            title = "Weekend - office closed"
            cells.append(f'<span class="{cls}" title="{title}">{day}</span>')
            continue
        if day < 18:
            cells.append(f'<span class="cal-day disabled" title="Date has passed">{day}</span>')
            continue
        if day == 18:
            cells.append(f'<a class="cal-day open today" href="#" title="3 slots left">{day}</a>')
            continue
        if day == 24:
            cells.append(f'<a class="cal-day open selected" href="#" title="12 slots left">{day}</a>')
            continue
        if day == 30:
            cells.append(f'<span class="cal-day disabled full" title="Fully booked">{day}</span>')
            continue
        if day == 29:
            cells.append(f'<a class="cal-day open limited" href="#" title="2 slots left">{day}</a>')
            continue
        cells.append(f'<a class="cal-day open" href="#" title="8 slots left">{day}</a>')
    return "".join(cells)


SLOTS = [("8:00 AM", "5 left", False, False), ("9:00 AM", "3 left", True, False),
         ("10:00 AM", "8 left", False, False), ("11:00 AM", "1 left", False, False),
         ("1:00 PM", "full", False, True), ("2:00 PM", "6 left", False, False),
         ("3:00 PM", "8 left", False, False), ("4:00 PM", "4 left", False, False)]

slot_html = "".join(
    f'<button type="button" class="slot-btn {"selected" if sel else ""}" {"disabled" if dis else ""}>'
    f'{label}<small>{rem}</small></button>'
    for label, rem, sel, dis in SLOTS)

student_booking_body = f"""
<div class="page-head">
  <div>
    <h1>When can you drop by?</h1>
    <p>The registrar serves students from 8:00 AM to 5:00 PM on weekdays, with a lunch break
       from 12:00 to 1:00 PM. Greyed-out dates are weekends, holidays or already full.</p>
  </div>
  <div class="step-chips"><a class="step-chip" href="student-documents.html">1 &middot; Documents</a><span class="step-chip active">2 &middot; Schedule</span></div>
</div>

<div class="booking-grid">
  <section class="panel">
    <div class="cal-head">
      <div class="cal-month">September 2026</div>
      <div class="cal-nav">
        <a class="cal-nav-btn is-disabled" href="#">{ICON['left']}</a>
        <a class="cal-nav-btn" href="#">{ICON['right']}</a>
      </div>
    </div>
    <div class="cal-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
    <div class="cal-grid">{calendar_grid()}</div>
    <div class="cal-legend">
      <span><i style="background:var(--teal)"></i> Selected</span>
      <span><i style="background:var(--bg);border:1px solid var(--border)"></i> Open</span>
      <span><i style="background:var(--warn-bg);border:1px solid #F0DDAF"></i> Almost full</span>
      <span><i style="background:#EDEFF5"></i> Closed / full</span>
    </div>
    <div class="slot-wrap">
      <p class="hint">Available windows for <b>Thursday, September 24</b></p>
      <div class="slot-grid">{slot_html}</div>
    </div>
  </section>

  <aside class="panel summary-panel">
    <h3>Your request</h3>
    <div class="summary-list">
      <div class="summary-item">{ICON['file']}<div class="summary-item-body"><b>Transcript of Records</b><span>2 copies &middot; &#8369;700.00</span></div></div>
      <div class="summary-item">{ICON['file']}<div class="summary-item-body"><b>Good Moral Certificate</b><span>1 copy &middot; &#8369;100.00</span></div></div>
    </div>
    <div class="summary-divider"></div>
    <div class="summary-row"><span>Date</span><b>Sep 24, 2026</b></div>
    <div class="summary-row"><span>Time</span><b>9:00 AM &ndash; 10:00 AM</b></div>
    <div class="summary-row"><span>Processing</span><b>5 working days</b></div>
    <div class="summary-row"><span>Total fee</span><b>&#8369;800.00</b></div>
    <div class="summary-divider"></div>
    <div class="id-field">
      <label>What is it for?</label>
      <select><option>Board examination application</option></select>
    </div>
    <div class="id-field">
      <label>Note for the registrar <span class="optional">optional</span></label>
      <textarea rows="3">I need it before Friday for my PRC application.</textarea>
    </div>
    <div class="cashier-note" style="margin-top:4px">{ICON['info']}<div>Pay &#8369;800.00 at the Cashier before your appointment.</div></div>
    <button class="btn btn-teal btn-block">Confirm booking</button>
    <a class="btn btn-ghost btn-block" href="student-documents.html">&larr; Change documents</a>
  </aside>
</div>
"""


# =====================================================================
# 5. Student request detail
# =====================================================================
student_request_body = f"""
<div class="page-head">
  <div>
    <h1>Transcript of Records +1 more</h1>
    <p>Reference <b>CF-7K2M9Q</b> &middot; submitted September 15, 2026 at 8:42 AM</p>
  </div>
  <div class="head-actions">
    <span class="status-pill is-ready">Ready for pickup</span>
    <a class="btn btn-office" href="slip.html" target="_blank">Print claim slip</a>
  </div>
</div>

<div class="detail-grid">
  <section class="panel">
    <h3>Progress</h3>
    <ol class="tracker">
      <li class="tracker-step is-done"><span class="tracker-dot">&#10003;</span>
        <div class="tracker-body"><b>Submitted</b><span>Waiting for the registrar to review</span><em>Sep 15, 2026 &middot; 8:42 AM</em></div></li>
      <li class="tracker-step is-done"><span class="tracker-dot">&#10003;</span>
        <div class="tracker-body"><b>Approved</b><span>Requirements verified, slot confirmed</span><em>Sep 15, 2026 &middot; 2:10 PM</em></div></li>
      <li class="tracker-step is-done"><span class="tracker-dot">&#10003;</span>
        <div class="tracker-body"><b>Ready for pickup</b><span>Waiting at the registrar counter</span><em>Sep 18, 2026 &middot; 10:42 AM</em></div></li>
      <li class="tracker-step is-current"><span class="tracker-dot">4</span>
        <div class="tracker-body"><b>Released</b><span>Claimed by the student</span></div></li>
    </ol>
    <div class="summary-divider"></div>
    <h3>Activity log</h3>
    <ul class="timeline">
      <li><span class="timeline-dot"></span><div><b>Processing &rarr; Ready for pickup</b><p>Signed and waiting at the counter.</p><em>Sep 18, 2026 &middot; 10:42 AM &middot; Dennis Ocampo</em></div></li>
      <li><span class="timeline-dot"></span><div><b>Approved &rarr; Processing</b><p>Document is being prepared.</p><em>Sep 16, 2026 &middot; 9:05 AM &middot; Dennis Ocampo</em></div></li>
      <li><span class="timeline-dot"></span><div><b>Pending review &rarr; Approved</b><p>Requirements verified.</p><em>Sep 15, 2026 &middot; 2:10 PM &middot; Marissa Villanueva</em></div></li>
      <li><span class="timeline-dot"></span><div><b>Request submitted</b><p>Request submitted by the student.</p><em>Sep 15, 2026 &middot; 8:42 AM</em></div></li>
    </ul>
  </section>

  <aside class="panel">
    <h3>Appointment</h3>
    <div class="summary-row"><span>Date</span><b>Thursday, Sep 24, 2026</b></div>
    <div class="summary-row"><span>Time</span><b>9:00 AM &ndash; 10:00 AM</b></div>
    <div class="summary-row"><span>Where</span><b>Office of the Registrar</b></div>
    <div class="summary-divider"></div>
    <h3>Documents</h3>
    <div class="summary-list">
      <div class="summary-item">{ICON['file']}<div class="summary-item-body"><b>Transcript of Records</b><span>2 copies &middot; &#8369;700.00</span></div></div>
      <div class="summary-item">{ICON['file']}<div class="summary-item-body"><b>Good Moral Certificate</b><span>1 copy &middot; &#8369;100.00</span></div></div>
    </div>
    <div class="summary-row" style="margin-top:14px"><span>Total fee</span><b>&#8369;800.00</b></div>
    <div class="summary-divider"></div>
    <h3>Purpose</h3>
    <p class="muted-text">Board examination application</p>
    <h3 style="margin-top:14px">Your note</h3>
    <p class="muted-text">I need it before Friday for my PRC application.</p>
  </aside>
</div>
"""


# =====================================================================
# 6. Registrar dashboard
# =====================================================================
LOAD = [("8:00 AM", 6, 8), ("9:00 AM", 8, 8), ("10:00 AM", 7, 8), ("11:00 AM", 3, 8),
        ("1:00 PM", 5, 8), ("2:00 PM", 2, 8), ("3:00 PM", 1, 8), ("4:00 PM", 0, 8)]

load_html = "".join(
    f'<li><span class="load-label">{label}</span><span class="load-bar">'
    f'<i style="width:{round(b / c * 100)}%" class="{"is-full" if b >= c else "is-high" if b / c >= 0.8 else ""}"></i>'
    f'</span><span class="load-value">{b}/{c}</span></li>'
    for label, b, c in LOAD)

TOPDOCS = [("TOR", 24), ("COE", 18), ("GMC", 11), ("EXP", 9), ("COG", 6)]
topdoc_html = "".join(
    f'<li><span class="load-label">{code}</span><span class="load-bar">'
    f'<i style="width:{round(n / 24 * 100)}%"></i></span><span class="load-value">{n}</span></li>'
    for code, n in TOPDOCS)

MANIFEST = [
    ("8:00 AM", "Ana Cruz", "02024000088", "Transcript of Records", "CF-3HQD7K", 2, "is-ready", "Ready for pickup"),
    ("8:00 AM", "Mark Reyes", "02023001102", "Certificate of Enrollment", "CF-9WKM2T", 1, "is-ready", "Ready for pickup"),
    ("9:00 AM", "Patricia Santos", "02025004410", "Good Moral Certificate +1 more", "CF-2NXV8R", 3, "is-processing", "Processing"),
    ("9:00 AM", "Kyle Mendoza", "02022009913", "Examination Permit", "CF-6TFJ4L", 1, "is-approved", "Approved"),
    ("10:00 AM", "Bea Torres", "02024007725", "Form 137 / Permanent Record", "CF-8DRQ3M", 1, "is-pending", "Pending review"),
    ("1:00 PM", "Nathaniel Flores", "02023003340", "CAV (Authentication)", "CF-5LWH9P", 2, "is-approved", "Approved"),
]
manifest_rows = "".join(
    f'<tr><td class="nowrap"><b>{t}</b></td>'
    f'<td><div class="cell-strong">{name}</div><div class="cell-sub">{sid}</div></td>'
    f'<td><div class="cell-strong">{doc}</div><div class="cell-sub">{ref} &middot; {c} cop{"y" if c == 1 else "ies"}</div></td>'
    f'<td><span class="status-pill {cls}">{label}</span></td>'
    f'<td class="nowrap"><a class="btn-link" href="registrar-request.html">Open</a></td></tr>'
    for t, name, sid, doc, ref, c, cls, label in MANIFEST)

PENDING = [
    ("Bea Torres", "02024007725", "Form 137 / Permanent Record", "CF-8DRQ3M", "Sep 18", "10:00 AM", "5d", True),
    ("Erika Navarro", "02025001180", "Transcript of Records", "CF-7VQK2X", "Sep 21", "9:00 AM", "4d", True),
    ("Paolo Gonzales", "02022006654", "Diploma (Second Copy)", "CF-3MJT9W", "Sep 22", "2:00 PM", "2d", False),
    ("Hannah Lim", "02024002298", "Certificate of Grades", "CF-4XPB6H", "Sep 23", "11:00 AM", "1d", False),
    ("Lorenzo Dizon", "02023008871", "Good Moral Certificate", "CF-9KRW5N", "Sep 25", "3:00 PM", "today", False),
]
pending_rows = "".join(
    f'<tr><td class="check-col"><input type="checkbox" class="row-check" /></td>'
    f'<td><div class="cell-strong">{name}</div><div class="cell-sub">{sid}</div></td>'
    f'<td><div class="cell-strong">{doc}</div><div class="cell-sub">{ref}</div></td>'
    f'<td class="nowrap"><div class="cell-strong">{d}</div><div class="cell-sub">{t}</div></td>'
    f'<td class="nowrap"><span class="wait-badge {"wait-late" if late else ""}">{w}</span></td>'
    f'<td class="nowrap"><a class="btn-link" href="registrar-request.html">Open</a></td></tr>'
    for name, sid, doc, ref, d, t, w, late in PENDING)

registrar_dashboard_body = f"""
<div class="greet">
  <h1>Good day, Marissa.</h1>
  <p>Friday, September 18, 2026 &middot; Registrar Head</p>
</div>

<div class="queue-banner">
  <div class="qb-text">
    <h3>14 requests waiting for review</h3>
    <p>The oldest has been waiting since September 13. Approve or decline them so students know where they stand.</p>
  </div>
  <div class="qb-cta"><a class="btn btn-yellow" href="registrar-queue.html">Open the queue</a></div>
</div>

<div class="stat-row stat-row-4">
  <div class="stat-card"><div class="n">14</div><div class="l">Pending review</div></div>
  <div class="stat-card"><div class="n">9</div><div class="l">Appointments today</div></div>
  <div class="stat-card"><div class="n">6</div><div class="l">Waiting at the counter</div></div>
  <div class="stat-card"><div class="n">23</div><div class="l">Released this week</div></div>
</div>

<div class="dash-grid">
  <section>
    <div class="section-head"><h2>Today's manifest</h2><a href="registrar-manifest.html">Full manifest</a></div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Time</th><th>Student</th><th>Documents</th><th>Status</th><th></th></tr></thead>
        <tbody>{manifest_rows}</tbody>
      </table>
    </div>

    <div class="section-head"><h2>Longest waiting</h2><a href="registrar-queue.html">Review all</a></div>
    <form onsubmit="return false">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th class="check-col"><input type="checkbox" id="checkAll" /></th><th>Student</th><th>Documents</th><th>Appointment</th><th>Waiting</th><th></th></tr></thead>
          <tbody>{pending_rows}</tbody>
        </table>
      </div>
      <button type="submit" class="btn btn-teal bulk-btn" id="bulkBtn" disabled>Approve selected</button>
    </form>
  </section>

  <aside>
    <div class="panel">
      <h3>Today's load</h3>
      <p class="panel-sub">How full each window is right now.</p>
      <ul class="load-list">{load_html}</ul>
    </div>
    <div class="panel">
      <h3>Most requested</h3>
      <p class="panel-sub">Across all live requests.</p>
      <ul class="load-list">{topdoc_html}</ul>
    </div>
    <div class="panel">
      <h3>Fees this month</h3>
      <div class="big-figure">&#8369;18,450.00</div>
      <p class="panel-sub">From documents already released.</p>
    </div>
    <div class="panel">
      <h3>Recent activity</h3>
      <ul class="timeline timeline-compact">
        <li><span class="timeline-dot"></span><div><b>CF-3HQD7K &rarr; Ready for pickup</b><p>Ana Cruz</p><em>Sep 18, 10:42 AM &middot; Dennis</em></div></li>
        <li><span class="timeline-dot"></span><div><b>CF-6TFJ4L &rarr; Approved</b><p>Kyle Mendoza</p><em>Sep 18, 9:15 AM &middot; Katrina</em></div></li>
        <li><span class="timeline-dot"></span><div><b>CF-1PQZ8C &rarr; Released</b><p>Camille Aquino</p><em>Sep 17, 4:02 PM &middot; Dennis</em></div></li>
        <li><span class="timeline-dot"></span><div><b>CF-5JHV2B &rarr; Rejected</b><p>Rafael Ramos</p><em>Sep 17, 2:20 PM &middot; Marissa</em></div></li>
      </ul>
    </div>
  </aside>
</div>
"""


# =====================================================================
# 7. Registrar queue
# =====================================================================
QUEUE = [
    ("CF-8DRQ3M", "Bea Torres", "02024007725", "BS Accountancy", "Form 137 / Permanent Record", 1, "Sep 18, 2026", "10:00 AM", "150.00", "is-pending", "Pending review", True),
    ("CF-3HQD7K", "Ana Cruz", "02024000088", "BS Information Technology", "Transcript of Records", 2, "Sep 18, 2026", "8:00 AM", "700.00", "is-ready", "Ready for pickup", True),
    ("CF-9WKM2T", "Mark Reyes", "02023001102", "BS Computer Science", "Certificate of Enrollment", 1, "Sep 18, 2026", "8:00 AM", "50.00", "is-ready", "Ready for pickup", True),
    ("CF-2NXV8R", "Patricia Santos", "02025004410", "BS Tourism Management", "Good Moral Certificate +1 more", 3, "Sep 18, 2026", "9:00 AM", "250.00", "is-processing", "Processing", True),
    ("CF-7VQK2X", "Erika Navarro", "02025001180", "BS Multimedia Arts", "Transcript of Records", 1, "Sep 21, 2026", "9:00 AM", "350.00", "is-pending", "Pending review", False),
    ("CF-3MJT9W", "Paolo Gonzales", "02022006654", "BS Computer Engineering", "Diploma (Second Copy)", 1, "Sep 22, 2026", "2:00 PM", "500.00", "is-pending", "Pending review", False),
    ("CF-4XPB6H", "Hannah Lim", "02024002298", "BS Business Administration", "Certificate of Grades", 2, "Sep 23, 2026", "11:00 AM", "150.00", "is-approved", "Approved", False),
    ("CF-9KRW5N", "Lorenzo Dizon", "02023008871", "BS Hospitality Management", "Good Moral Certificate", 1, "Sep 25, 2026", "3:00 PM", "100.00", "is-pending", "Pending review", False),
]
CHECKBOX = '<input type="checkbox" class="row-check" />'

_queue_parts = []
for ref, name, sid, prog, doc, c, d, t, fee, cls, label, today in QUEUE:
    row_cls = "row-today" if today else ""
    check = CHECKBOX if cls == "is-pending" else ""
    copies = "copy" if c == 1 else "copies"
    _queue_parts.append(
        f'<tr class="{row_cls}">'
        f'<td class="check-col">{check}</td>'
        f'<td class="nowrap"><code class="ref-chip">{ref}</code></td>'
        f'<td><div class="cell-strong">{name}</div><div class="cell-sub">{sid} &middot; {prog}</div></td>'
        f'<td><div class="cell-strong">{doc}</div><div class="cell-sub">{c} {copies}</div></td>'
        f'<td class="nowrap"><div class="cell-strong">{d}</div><div class="cell-sub">{t}</div></td>'
        f'<td class="num nowrap">{fee}</td>'
        f'<td><span class="status-pill {cls}">{label}</span></td>'
        f'<td class="nowrap"><a class="btn-link" href="registrar-request.html">Open</a></td></tr>')
queue_rows = "".join(_queue_parts)

registrar_queue_body = f"""
<div class="page-head">
  <div><h1>Request queue</h1><p>128 results &middot; 14 pending &middot; 6 waiting at the counter</p></div>
  <a class="btn btn-office" href="registrar-manifest.html">Today's manifest</a>
</div>

<form class="filter-bar" onsubmit="return false">
  <div class="filter-search">{ICON['search']}
    <input type="search" placeholder="Search name, 11-digit student number or reference code&hellip;" />
  </div>
  <select><option>All documents</option></select>
  <input type="date" value="2026-09-18" />
  <input type="date" value="2026-10-31" />
  <select><option>Sort: appointment date</option></select>
  <button type="submit" class="btn btn-teal">Apply</button>
  <a class="btn btn-ghost" href="#">Reset</a>
</form>

<div class="filter-tabs">
  <a class="filter-tab active" href="#">Active</a>
  <a class="filter-tab" href="#">Pending <span>14</span></a>
  <a class="filter-tab" href="#">Approved</a>
  <a class="filter-tab" href="#">Processing</a>
  <a class="filter-tab" href="#">Ready <span>6</span></a>
  <a class="filter-tab" href="#">Released</a>
  <a class="filter-tab" href="#">Rejected</a>
  <a class="filter-tab" href="#">All <span>128</span></a>
</div>

<form onsubmit="return false">
  <div class="table-wrap">
    <table class="data-table">
      <thead><tr><th class="check-col"><input type="checkbox" id="checkAll" /></th><th>Reference</th><th>Student</th><th>Documents</th><th>Appointment</th><th class="num">Fee</th><th>Status</th><th></th></tr></thead>
      <tbody>{queue_rows}</tbody>
    </table>
  </div>
  <button type="submit" class="btn btn-teal bulk-btn" id="bulkBtn" disabled>Approve selected</button>
</form>

<nav class="pager">
  <span class="pager-info">Page 1 of 7</span>
  <a class="btn btn-office" href="#">Next &rarr;</a>
</nav>
"""


# =====================================================================
# 8. Registrar request detail
# =====================================================================
registrar_request_body = f"""
<div class="page-head">
  <div>
    <h1>Bea Torres</h1>
    <p><code class="ref-chip">CF-8DRQ3M</code> &middot; 02024007725 &middot; BS Accountancy, Year 3 ACT-301</p>
  </div>
  <div class="head-actions">
    <span class="status-pill is-pending">Pending review</span>
    <a class="btn btn-office" href="slip.html" target="_blank">Print office copy</a>
  </div>
</div>

<div class="detail-grid">
  <section>
    <div class="panel">
      <h3>Requested documents</h3>
      <div class="table-wrap">
        <table class="data-table compact">
          <thead><tr><th>Code</th><th>Document</th><th class="num">Copies</th><th class="num">Unit</th><th class="num">Amount</th><th>Processing</th></tr></thead>
          <tbody>
            <tr><td><code class="ref-chip">F137</code></td><td>Form 137 / Permanent Record</td><td class="num">1</td><td class="num">150.00</td><td class="num">150.00</td><td class="nowrap">7 days</td></tr>
          </tbody>
          <tfoot><tr><td colspan="4" class="num"><b>Total</b></td><td class="num"><b>&#8369;150.00</b></td><td></td></tr></tfoot>
        </table>
      </div>
      <div class="cashier-note">{ICON['info']}<div>Verify the Cashier's receipt for &#8369;150.00 before releasing.</div></div>
    </div>

    <div class="panel">
      <h3>Actions</h3>
      <p class="panel-sub">From <b>Pending review</b> you can move this request to: Approved, Rejected</p>
      <div class="action-row">
        <form class="action-form" onsubmit="return false"><button class="btn btn-teal">&#10003; Approve</button></form>
      </div>
      <details class="reject-box" open>
        <summary>Decline this request</summary>
        <form onsubmit="return false">
          <div class="id-field">
            <label>Reason (the student will see this)</label>
            <textarea rows="3" placeholder="e.g. Outstanding balance with the Cashier. Please settle first."></textarea>
          </div>
          <div class="reason-chips">
            <button type="button" class="chip">Unpaid balance</button>
            <button type="button" class="chip">Incomplete requirements</button>
            <button type="button" class="chip">Duplicate</button>
            <button type="button" class="chip">Record on hold</button>
          </div>
          <button type="submit" class="btn btn-danger">Decline request</button>
        </form>
      </details>
    </div>

    <div class="panel">
      <h3>Activity log</h3>
      <ul class="timeline">
        <li><span class="timeline-dot"></span><div><b>Request submitted</b><p>Request submitted by the student.</p><em>Sep 13, 2026 &middot; 4:18 PM</em></div></li>
      </ul>
    </div>
  </section>

  <aside>
    <div class="panel">
      <h3>Appointment</h3>
      <div class="summary-row"><span>Date</span><b>Fri, Sep 18, 2026</b></div>
      <div class="summary-row"><span>Window</span><b>10:00 AM &ndash; 11:00 AM</b></div>
      <div class="summary-row"><span>Submitted</span><b>Sep 13, 4:18 PM</b></div>
      <div class="summary-row"><span>Last update</span><b>Sep 13, 4:18 PM</b></div>
    </div>
    <div class="panel">
      <h3>Student</h3>
      <div class="summary-row"><span>Name</span><b>Bea Torres</b></div>
      <div class="summary-row"><span>Student no.</span><b>02024007725</b></div>
      <div class="summary-row"><span>Program</span><b>BS Accountancy</b></div>
      <div class="summary-row"><span>Year / section</span><b>3 &middot; ACT-301</b></div>
      <div class="summary-row"><span>E-mail</span><b>btorres.02024007725@sti.edu.ph</b></div>
      <div class="summary-row"><span>Mobile</span><b>0917-555-0188</b></div>
    </div>
    <div class="panel">
      <h3>Other requests by this student</h3>
      <ul class="mini-list">
        <li><a href="#"><b>CF-1PQZ8C</b><span>Aug 20, 2026</span></a><span class="status-pill is-released">Released</span></li>
        <li><a href="#"><b>CF-6BHN4R</b><span>Jun 04, 2026</span></a><span class="status-pill is-released">Released</span></li>
      </ul>
    </div>
  </aside>
</div>
"""


# =====================================================================
# 9. Manifest
# =====================================================================
def manifest_group(time, rows):
    parts = []
    for ref, name, sid, prog, docs, fee, cls, label in rows:
        doc_html = "".join('<div class="cell-sub">' + d + '</div>' for d in docs)
        parts.append(
            f'<tr><td class="nowrap"><code class="ref-chip">{ref}</code></td>'
            f'<td><div class="cell-strong">{name}</div><div class="cell-sub">{sid}</div></td>'
            f'<td class="cell-sub">{prog}</td>'
            f'<td>{doc_html}</td>'
            f'<td class="num nowrap">{fee}</td>'
            f'<td><span class="status-pill {cls}">{label}</span></td>'
            f'<td class="nowrap no-print"><a class="btn-link" href="registrar-request.html">Open</a></td></tr>')
    body = "".join(parts)
    return f"""<div class="manifest-block">
  <div class="manifest-slot"><b>{time}</b><span>{len(rows)} booked of 8</span></div>
  <div class="table-wrap"><table class="data-table compact">
    <thead><tr><th>Reference</th><th>Student</th><th>Program</th><th>Documents</th><th class="num">Fee</th><th>Status</th><th class="no-print"></th></tr></thead>
    <tbody>{body}</tbody>
  </table></div>
</div>"""


registrar_manifest_body = f"""
<div class="page-head no-print">
  <div><h1>Friday, September 18, 2026</h1><p>9 appointments &middot; &#8369;2,150.00 expected in fees</p></div>
  <div class="head-actions">
    <a class="btn btn-office" href="#">&larr;</a>
    <form class="inline-date" onsubmit="return false"><input type="date" value="2026-09-18" /></form>
    <a class="btn btn-office" href="#">&rarr;</a>
    <a class="btn btn-office" href="#">Export CSV</a>
    <button class="btn btn-teal" onclick="window.print()">Print</button>
  </div>
</div>

<div class="print-head only-print">
  <b>STI College Global City &middot; Office of the Registrar</b>
  <span>Daily appointment manifest &mdash; Friday, September 18, 2026</span>
</div>

{manifest_group("8:00 AM", [
    ("CF-3HQD7K", "Ana Cruz", "02024000088", "BS Information Technology", ["TOR &times; 2"], "700.00", "is-ready", "Ready for pickup"),
    ("CF-9WKM2T", "Mark Reyes", "02023001102", "BS Computer Science", ["COE &times; 1"], "50.00", "is-ready", "Ready for pickup"),
])}
{manifest_group("9:00 AM", [
    ("CF-2NXV8R", "Patricia Santos", "02025004410", "BS Tourism Management", ["GMC &times; 2", "COG &times; 1"], "275.00", "is-processing", "Processing"),
    ("CF-6TFJ4L", "Kyle Mendoza", "02022009913", "BS Computer Engineering", ["EXP &times; 1"], "&mdash;", "is-approved", "Approved"),
])}
{manifest_group("10:00 AM", [
    ("CF-8DRQ3M", "Bea Torres", "02024007725", "BS Accountancy", ["F137 &times; 1"], "150.00", "is-pending", "Pending review"),
])}
{manifest_group("1:00 PM", [
    ("CF-5LWH9P", "Nathaniel Flores", "02023003340", "BS Business Administration", ["CAV &times; 2"], "900.00", "is-approved", "Approved"),
])}

<div class="manifest-total"><span>Total for the day</span><b>9 appointments &middot; &#8369;2,150.00</b></div>
"""


# =====================================================================
# 10. Schedule settings
# =====================================================================
registrar_schedule_body = """
<div class="page-head">
  <div>
    <h1>Capacity &amp; closures</h1>
    <p>Close a date so no one can book it, or change how many students a window can hold.
       Students see these changes on the booking calendar immediately.</p>
  </div>
</div>

<div class="rule-grid">
  <div class="rule-card"><small>Operating hours</small><b>8:00 AM &ndash; 5:00 PM</b><span>Monday to Friday</span></div>
  <div class="rule-card"><small>Lunch break</small><b>12:00 PM &ndash; 1:00 PM</b><span>Not bookable</span></div>
  <div class="rule-card"><small>Default capacity</small><b>8 per window</b><span>8 windows a day</span></div>
  <div class="rule-card"><small>Booking horizon</small><b>45 days ahead</b><span>Min. 2 h lead time</span></div>
</div>

<p class="panel-sub" style="margin-top:12px">These defaults come from <code>appsettings.json</code> under the
   <code>Registrar</code> section &mdash; change them there to adjust the whole office at once.</p>

<div class="detail-grid">
  <section class="panel">
    <h3>Closed dates</h3>
    <p class="panel-sub">Holidays, campus events, inventory days.</p>
    <form class="stack-form" onsubmit="return false">
      <div class="field-row">
        <div class="id-field"><label>Date</label><input type="date" /></div>
        <div class="id-field"><label>Reason</label><input type="text" placeholder="e.g. All Saints' Day" /></div>
      </div>
      <button class="btn btn-teal">Close this date</button>
    </form>
    <div class="summary-divider"></div>
    <ul class="mini-list">
      <li><div><b>Wed, Sep 30, 2026</b><span>Annual records inventory &mdash; office closed</span></div><button class="btn-link btn-link-danger">Reopen</button></li>
      <li><div><b>Sun, Nov 01, 2026</b><span>All Saints' Day</span></div><button class="btn-link btn-link-danger">Reopen</button></li>
      <li><div><b>Mon, Nov 30, 2026</b><span>Bonifacio Day</span></div><button class="btn-link btn-link-danger">Reopen</button></li>
      <li><div><b>Fri, Dec 25, 2026</b><span>Christmas Day</span></div><button class="btn-link btn-link-danger">Reopen</button></li>
    </ul>
  </section>

  <section class="panel">
    <h3>Capacity overrides</h3>
    <p class="panel-sub">Use this when you are short-staffed, or when enrolment week needs extra room.</p>
    <form class="stack-form" onsubmit="return false">
      <div class="field-row">
        <div class="id-field"><label>Date</label><input type="date" /></div>
        <div class="id-field"><label>Window</label><select><option>Every window that day</option><option>8:00 AM</option><option>9:00 AM</option></select></div>
        <div class="id-field id-field-narrow"><label>Capacity</label><input type="number" value="8" /></div>
      </div>
      <button class="btn btn-teal">Save override</button>
    </form>
    <div class="summary-divider"></div>
    <ul class="mini-list">
      <li><div><b>Fri, Sep 25, 2026</b><span>All windows &middot; capacity 16</span></div><button class="btn-link btn-link-danger">Remove</button></li>
      <li><div><b>Mon, Sep 28, 2026</b><span>3:00 PM &middot; capacity 2</span></div><button class="btn-link btn-link-danger">Remove</button></li>
    </ul>
  </section>
</div>
"""


# =====================================================================
# 11. Printable slip (with the Code 39 barcode)
# =====================================================================
CODE39 = {
    '0': "nnnwwnwnn", '1': "wnnwnnnnw", '2': "nnwwnnnnw", '3': "wnwwnnnnn",
    '4': "nnnwwnnnw", '5': "wnnwwnnnn", '6': "nnwwwnnnn", '7': "nnnwnnwnw",
    '8': "wnnwnnwnn", '9': "nnwwnnwnn", 'A': "wnnnnwnnw", 'B': "nnwnnwnnw",
    'C': "wnwnnwnnn", 'D': "nnnnwwnnw", 'E': "wnnnwwnnn", 'F': "nnwnwwnnn",
    'G': "nnnnnwwnw", 'H': "wnnnnwwnn", 'I': "nnwnnwwnn", 'J': "nnnnwwwnn",
    'K': "wnnnnnnww", 'L': "nnwnnnnww", 'M': "wnwnnnnwn", 'N': "nnnnwnnww",
    'O': "wnnnwnnwn", 'P': "nnwnwnnwn", 'Q': "nnnnnnwww", 'R': "wnnnnnwwn",
    'S': "nnwnnnwwn", 'T': "nnnnwnwwn", 'U': "wwnnnnnnw", 'V': "nwwnnnnnw",
    'W': "wwwnnnnnn", 'X': "nwnnwnnnw", 'Y': "wwnnwnnnn", 'Z': "nwwnwnnnn",
    '-': "nwnnnnwnw", '*': "nwnnwnwnn",
}


def barcode(text):
    payload = "*" + text.upper() + "*"
    out = []
    for ch in payload:
        pattern = CODE39.get(ch)
        if not pattern:
            continue
        for i, el in enumerate(pattern):
            kind = "barcode-bar" if i % 2 == 0 else "barcode-space"
            width = "barcode-wide" if el == "w" else "barcode-narrow"
            out.append(f'<span class="{kind} {width}"></span>')
        out.append('<span class="barcode-space barcode-narrow"></span>')
    return "".join(out), payload


bars, payload = barcode("CF-7K2M9Q")

slip = HEAD.format(title="Claim slip CF-7K2M9Q") + f"""<body class="slip-body">
<div class="slip-toolbar no-print">
  <a href="student-request.html" class="btn btn-office">&larr; Back</a>
  <button type="button" class="btn btn-teal" onclick="window.print()">Print this slip</button>
</div>
<div class="slip-sheet">
  <header class="slip-head">
    <div class="slip-brand">
      <div class="slip-mark">CF</div>
      <div><b>STI College Global City</b><span>Office of the Registrar &middot; CampusFlow</span></div>
    </div>
    <div class="slip-kind">Student claim slip</div>
  </header>

  <div class="slip-ref">
    <div><small>Reference code</small><div class="slip-code">CF-7K2M9Q</div></div>
    <div class="slip-status is-ready">Ready for pickup</div>
  </div>

  <div class="barcode">{bars}</div>
  <div class="barcode-text">{payload}</div>

  <table class="slip-table">
    <tr><th>Student</th><td><b>Juan Dela Cruz</b><br />02000123456 &middot; BS Information Technology &middot; Year 4</td></tr>
    <tr><th>Appointment</th><td><b>Thursday, September 24, 2026</b><br />9:00 AM &ndash; 10:00 AM</td></tr>
    <tr><th>Purpose</th><td>Board examination application</td></tr>
    <tr><th>Requested on</th><td>September 15, 2026 at 8:42 AM</td></tr>
  </table>

  <table class="slip-items">
    <thead><tr><th>Code</th><th>Document</th><th class="num">Copies</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
    <tbody>
      <tr><td><code>TOR</code></td><td>Transcript of Records</td><td class="num">2</td><td class="num">350.00</td><td class="num">700.00</td></tr>
      <tr><td><code>GMC</code></td><td>Good Moral Certificate</td><td class="num">1</td><td class="num">100.00</td><td class="num">100.00</td></tr>
    </tbody>
    <tfoot><tr><td colspan="4" class="num"><b>Total</b></td><td class="num"><b>&#8369;800.00</b></td></tr></tfoot>
  </table>

  <p class="slip-note"><b>Payment required.</b> Settle &#8369;800.00 at the Cashier's Office and present the
     official receipt together with this slip.</p>
  <p class="slip-note">Bring a valid student ID. Arrive within your time window &mdash; appointments not claimed
     on the scheduled date are voided at the end of the day.</p>

  <footer class="slip-foot">Generated September 18, 2026 at 11:04 AM &middot; STI CampusFlow &middot; Processed by Dennis Ocampo</footer>
</div>
</body></html>"""


# =====================================================================
# Index
# =====================================================================
PAGES = [
    ("login.html", "Sign in", "Student and staff entry point"),
    ("student-dashboard.html", "Student &middot; Dashboard", "Next appointment, stats, recent requests"),
    ("student-documents.html", "Student &middot; Pick documents", "Catalogue with copy steppers and live total"),
    ("student-booking.html", "Student &middot; Book a slot", "Calendar with capacity, time windows, summary"),
    ("student-request.html", "Student &middot; Track a request", "Status tracker and activity log"),
    ("slip.html", "Printable claim slip", "Code 39 barcode, print-ready"),
    ("registrar-dashboard.html", "Registrar &middot; Dashboard", "Queue pressure, today's manifest, load bars"),
    ("registrar-queue.html", "Registrar &middot; Queue", "Search, filter, sort, bulk approve"),
    ("registrar-request.html", "Registrar &middot; Request detail", "Legal transitions and decline reasons"),
    ("registrar-manifest.html", "Registrar &middot; Daily manifest", "Grouped by window, printable, CSV export"),
    ("registrar-schedule.html", "Registrar &middot; Capacity &amp; closures", "Close dates, override capacity"),
]

index = HEAD.format(title="Screen previews") + """<body class="slip-body">
<div class="slip-sheet" style="max-width:820px">
  <header class="slip-head">
    <div class="slip-brand">
      <div class="slip-mark">CF</div>
      <div><b>STI CampusFlow</b><span>Static screen previews</span></div>
    </div>
    <div class="slip-kind">Preview only</div>
  </header>
  <p class="slip-note" style="margin-top:18px">
    These pages are static copies of the Razor views, built with the same CSS, so the design can be
    reviewed and screenshotted without installing the .NET SDK. Nothing here is connected to the
    database &mdash; run the real application for working data.
  </p>
  <ul class="mini-list" style="margin-top:12px">
""" + "".join(
    f'<li><a href="{href}"><b>{title}</b><span>{desc}</span></a>'
    f'<span class="status-pill is-approved">Open</span></li>'
    for href, title, desc in PAGES) + """
  </ul>
</div>
</body></html>"""


# =====================================================================
# Write everything
# =====================================================================
files = {
    "index.html": index,
    "login.html": login,
    "slip.html": slip,
    "student-dashboard.html": shell("Home", "student", "home", "", "Home", student_dashboard_body,
                                    "Juan Dela Cruz", "BS Information Technology &middot; 02000123456", "JD"),
    "student-documents.html": shell("Request a document", "student", "doc", "Step 1 of 2", "Request a document",
                                    student_documents_body, "Juan Dela Cruz",
                                    "BS Information Technology &middot; 02000123456", "JD"),
    "student-booking.html": shell("Choose a schedule", "student", "doc", "Step 2 of 2", "Choose a schedule",
                                  student_booking_body, "Juan Dela Cruz",
                                  "BS Information Technology &middot; 02000123456", "JD"),
    "student-request.html": shell("CF-7K2M9Q", "student", "cal", "My requests", "CF-7K2M9Q",
                                  student_request_body, "Juan Dela Cruz",
                                  "BS Information Technology &middot; 02000123456", "JD",
                                  flash=("success", "Your document is ready for pickup.", "&#10003;")),
    "registrar-dashboard.html": shell("Dashboard", "staff", "grid", "", "Dashboard", registrar_dashboard_body,
                                      "Marissa Villanueva", "Registrar Head", "MV"),
    "registrar-queue.html": shell("Request queue", "staff", "list", "", "Request queue", registrar_queue_body,
                                  "Marissa Villanueva", "Registrar Head", "MV"),
    "registrar-request.html": shell("CF-8DRQ3M", "staff", "list", "Queue", "CF-8DRQ3M", registrar_request_body,
                                    "Marissa Villanueva", "Registrar Head", "MV"),
    "registrar-manifest.html": shell("Daily manifest", "staff", "cal", "", "Daily manifest",
                                     registrar_manifest_body, "Marissa Villanueva", "Registrar Head", "MV"),
    "registrar-schedule.html": shell("Capacity & closures", "staff", "gear", "", "Capacity & closures",
                                     registrar_schedule_body, "Marissa Villanueva", "Registrar Head", "MV"),
}

for name, html in files.items():
    (OUT / name).write_text(html, encoding="utf-8")
    print("wrote", name, len(html), "bytes")
