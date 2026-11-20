/* ==========================================================================
   STI CampusFlow — core logic
   --------------------------------------------------------------------------
   Every business rule and every API endpoint lives here. It does not know
   whether it is talking to SQLite (server.js) or to the in-browser demo store
   (live preview) — it only talks to a "repo" object. That is the Repository
   pattern: swap the storage, keep the rules.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CampusCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- dates */
  const pad = (n) => String(n).padStart(2, '0');
  const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); };
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const isWeekend = (s) => { const w = parseDate(s).getDay(); return w === 0 || w === 6; };
  const isDateStr = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toDateStr(parseDate(s)) === s;
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (s) => { const d = parseDate(s); return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
  const fmtTime = (t) => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return m ? `${h}:${pad(m)} ${ap}` : `${h} ${ap}`; };
  const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ------------------------------------------------------------- statuses */
  const STATUS_LABEL = {
    pending: 'Waiting for review', approved: 'Approved', processing: 'Being prepared',
    ready: 'Ready to claim', released: 'Claimed', rejected: 'Declined',
    cancelled: 'Cancelled', missed: 'Missed — pick a new time', noshow: 'Not claimed',
  };
  const OPEN = ['pending', 'approved', 'processing', 'ready', 'missed'];
  const BOOKED = ['pending', 'approved', 'processing', 'ready', 'released']; // takes up a seat in a window
  const ACTIVE_APPT = ['pending', 'approved', 'processing', 'ready'];
  const TRANSITIONS = {
    pending: ['approved', 'rejected'],
    approved: ['processing', 'ready', 'rejected'],
    processing: ['ready'],
    ready: ['released'],
    missed: ['noshow'],
  };
  const PAYMENT_LABEL = { none: 'No fee', unpaid: 'Not paid yet', submitted: 'Receipt sent — checking', verified: 'Paid', rejected: 'Receipt not accepted' };
  const CATEGORY_LABEL = { records: 'Academic records', certification: 'Certifications', clearance: 'Permits and clearances', enrollment: 'Enrollment' };

  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const fail = (status, msg) => { throw new ApiError(status, msg); };

  function maskStudentNo(no, on) {
    if (!on || !no || no.length < 8) return no;
    return no.slice(0, 5) + '•••' + no.slice(-3);
  }

  /* =================================================================== core */
  function createCore({ repo, config, hash, verify, sign = (s) => s, now = () => new Date(), mail = null, needsRehash = null }) {
    const C = config;

    const nowParts = () => { const d = now(); return { d, today: toDateStr(d), min: d.getHours() * 60 + d.getMinutes() }; };

    function slotList() {
      const out = [];
      const open = toMin(C.openTime), close = toMin(C.closeTime), ls = toMin(C.lunchStart), le = toMin(C.lunchEnd);
      for (let m = open; m + C.slotMinutes <= close; m += C.slotMinutes) {
        if (m < le && m + C.slotMinutes > ls) continue; // overlaps lunch
        out.push({ start: fromMin(m), end: fromMin(m + C.slotMinutes) });
      }
      return out;
    }
    const SLOTS = slotList();

    function closureMap(from, to) {
      const m = {}; for (const c of repo.listClosures(from, to)) m[c.date] = c; return m;
    }
    function addWorkdays(start, n, closures) {
      let d = start, left = n;
      while (left > 0) { d = addDays(d, 1); if (!isWeekend(d) && !(closures[d] && closures[d].kind === 'closed')) left--; }
      return d;
    }
    function earliestFor(docs, fromDate) {
      const { today } = nowParts();
      const base = fromDate && fromDate > today ? fromDate : today;
      const days = Math.max(0, ...docs.map((d) => d.processing_days || 0));
      const closures = closureMap(today, addDays(today, 120));
      return { date: days ? addWorkdays(base, days, closures) : today, days };
    }

    /* ---- one day's windows with seats left */
    function slotsForDate(date, excludeId, capMap, bookedRows) {
      const { today, min } = nowParts();
      const cap = capMap && capMap[date] != null ? capMap[date] : C.defaultSlotCapacity;
      const counts = {};
      for (const r of bookedRows) counts[r.slot_start] = (counts[r.slot_start] || 0) + r.n;
      return SLOTS.map((s) => {
        const booked = counts[s.start] || 0;
        const left = Math.max(0, cap - booked);
        let available = left > 0, reason = left > 0 ? '' : 'Full';
        if (date === today && toMin(s.start) < min + C.minLeadHours * 60) { available = false; reason = 'Too soon'; }
        return { start: s.start, end: s.end, capacity: cap, booked, left, available, reason };
      });
    }

    function dayState(date, ctx) {
      const { today } = ctx;
      const closure = ctx.closures[date];
      if (date < today) return { state: 'past', reason: 'Past date' };
      if (isWeekend(date)) return { state: 'weekend', reason: 'Office closed on weekends' };
      if (closure && closure.kind === 'closed') return { state: 'closed', reason: closure.reason };
      if (date > addDays(today, C.maxAdvanceDays)) return { state: 'beyond', reason: `Booking opens ${C.maxAdvanceDays} days ahead` };
      if (ctx.earliest && date < ctx.earliest) return { state: 'soon', reason: 'Documents not ready yet' };
      if (ctx.mine && ctx.mine[date]) return { state: 'mine', reason: `You already have an appointment this day (${ctx.mine[date]})` };
      const booked = ctx.booked.filter((b) => b.appt_date === date);
      const slots = slotsForDate(date, null, ctx.capMap, booked);
      const left = slots.filter((s) => s.available).reduce((a, s) => a + s.left, 0);
      const note = closure && closure.kind === 'office_open' ? closure.reason : '';
      return left > 0 ? { state: 'open', left, note } : { state: 'full', reason: 'All windows are full', note };
    }

    function capMapFor(from, to) { const m = {}; for (const c of repo.getCapacityMap(from, to)) m[c.date] = c.capacity; return m; }

    function validateSlot(studentId, date, slot, earliest, excludeId) {
      if (!isDateStr(date)) fail(400, 'Pick a date on the calendar.');
      const { today } = nowParts();
      const ctx = { today, earliest, closures: closureMap(date, date), capMap: capMapFor(date, date), booked: [] };
      const st = dayState(date, ctx);
      if (st.state !== 'open' && st.state !== 'full') fail(409, `${fmtDate(date)} can't be booked: ${st.reason}.`);
      const slots = slotsForDate(date, excludeId, ctx.capMap, repo.bookedCounts(date, excludeId, BOOKED));
      const s = slots.find((x) => x.start === slot);
      if (!s) fail(400, 'Pick one of the listed time windows.');
      if (!s.available) fail(409, s.reason === 'Full'
        ? `The ${fmtTime(s.start)} window just filled up. Please pick another time.`
        : `The ${fmtTime(s.start)} window is too soon — book at least ${C.minLeadHours} hours ahead.`);
      const clash = repo.studentBookingOn(studentId, date, ACTIVE_APPT, excludeId);
      if (clash) fail(409, `You already have an appointment on ${fmtDate(date)} (${clash.ref_code}). Add documents to that one instead, or pick another day.`);
      return s;
    }

    /* ---- notifications */
    function notify(userId, title, body, kind, requestId) {
      repo.insertNotification({ user_id: userId, title, body, kind: kind || 'info', request_id: requestId || null, is_read: 0, created_at: now().toISOString() });
      /* Where the email goes:
         - a confirmed personal address (Gmail, Yahoo, anything) if the student added one
         - otherwise their school email
         - nowhere at all if they switched email off, in which case the notice
           still appears in the bell inside the app. */
      if (mail) {
        const u = repo.getUser(userId);
        const to = u && u.email_notify !== 0 ? (u.notify_email || u.email) : '';
        if (to) mail.send({ to, name: u.full_name, title, body, linkPath: requestId ? '/#/requests' : '/#/home' });
      }
    }
    function history(requestId, from, to, note, byId) {
      repo.addHistory({ request_id: requestId, from_status: from, to_status: to, note: note || '', by_user_id: byId || null, at: now().toISOString() });
    }

    /* ---- shaping rows for the client */
    function docSummary(items) {
      if (!items.length) return '';
      const first = items[0].name;
      return items.length > 1 ? `${first} + ${items.length - 1} more` : first;
    }
    function shape(r, items, extra) {
      const deadline = r.status === 'missed' && r.missed_at
        ? toDateStr(new Date(new Date(r.missed_at).getTime() + C.rescheduleWindowDays * 864e5)) : null;
      const out = {
        id: r.id, ref: r.ref_code, status: r.status, statusLabel: STATUS_LABEL[r.status],
        date: r.appt_date, slotStart: r.slot_start, slotEnd: r.slot_end,
        items: items.map((i) => ({ docId: i.doc_type_id, code: i.code, name: i.name, copies: i.copies, unitFee: i.unit_fee, category: i.category })),
        docSummary: docSummary(items),
        totalFee: r.total_fee,
        payment: { status: r.payment_status, label: PAYMENT_LABEL[r.payment_status], orNumber: r.or_number || '', note: r.payment_note || '', hasReceipt: !!r.receipt_image },
        purpose: r.purpose || '', studentNote: r.student_note || '', staffNote: r.staff_note || '', rejectReason: r.reject_reason || '',
        rescheduleCount: r.reschedule_count, freeReschedule: !!r.free_reschedule, rescheduleDeadline: deadline,
        createdAt: r.created_at, updatedAt: r.updated_at,
        slipToken: sign(r.ref_code),
        canCancel: ['pending', 'approved', 'missed'].includes(r.status),
        canReschedule: ACTIVE_APPT.includes(r.status) || r.status === 'missed',
        reschedulesLeft: Math.max(0, C.maxReschedules - r.reschedule_count),
        canPay: r.payment_status === 'unpaid' || r.payment_status === 'rejected',
        student: r.full_name ? { name: r.full_name, studentNo: r.login_id, program: r.program || '', yearLevel: r.year_level || null, email: r.email || '' } : undefined,
      };
      return Object.assign(out, extra || {});
    }
    function shapeMany(rows) {
      const items = rows.length ? repo.itemsFor(rows.map((r) => r.id)) : [];
      const by = {}; for (const i of items) (by[i.request_id] = by[i.request_id] || []).push(i);
      return rows.map((r) => shape(r, by[r.id] || []));
    }
    const publicUser = (u) => u && ({ id: u.id, loginId: u.login_id, name: u.full_name, role: u.role,
      program: u.program || '', yearLevel: u.year_level || null, email: u.email || '',
      notifyEmail: u.notify_email || '', notifyPending: u.notify_pending || '',
      emailNotify: u.email_notify !== 0, notifyTarget: u.email_notify === 0 ? '' : (u.notify_email || u.email || '') });

    function loadOwned(id, user) {
      const r = repo.getRequest(Number(id));
      if (!r) fail(404, 'Request not found.');
      if (user.role === 'student' && r.student_id !== user.id) fail(404, 'Request not found.');
      return r;
    }
    function detail(r, user) {
      const items = repo.getItems(r.id);
      const extra = { history: repo.listHistory(r.id).map((h) => ({ from: h.from_status, to: h.to_status, label: STATUS_LABEL[h.to_status] || h.to_status, note: h.note, by: h.by_name || '', at: h.at })) };
      if (user.role !== 'student') {
        extra.allowed = TRANSITIONS[r.status] || [];
        extra.others = shapeMany(repo.queryRequests({ studentId: r.student_id, limit: 10, offset: 0, sort: 'created' }).rows.filter((o) => o.id !== r.id));
      }
      return shape(r, items, extra);
    }

    /* ---- automatic jobs: reminders, grace period, no-shows */
    function tick() {
      const { d, today } = nowParts();
      const t = d.getTime();
      const closures = closureMap(today, addDays(today, 2));
      const soon = repo.requestsForTick(addDays(today, 2), ACTIVE_APPT);
      for (const r of soon) {
        const start = parseDate(r.appt_date); start.setMinutes(toMin(r.slot_start));
        const end = parseDate(r.appt_date); end.setMinutes(toMin(r.slot_end) + C.graceMinutes);
        const when = `${fmtDate(r.appt_date)}, ${fmtTime(r.slot_start)}–${fmtTime(r.slot_end)}`;
        if (t >= end.getTime()) {
          repo.tx(() => {
            repo.updateRequest(r.id, { status: 'missed', prev_status: r.status, missed_at: d.toISOString(), updated_at: d.toISOString() });
            history(r.id, r.status, 'missed', `No-show after the ${C.graceMinutes}-minute grace period`);
            notify(r.student_id, 'You missed your appointment',
              `Your window was ${when}. Your request is on hold, not cancelled — pick a new time within ${C.rescheduleWindowDays} days.`, 'warning', r.id);
          });
          continue;
        }
        const hoursLeft = (start.getTime() - t) / 36e5;
        const openNote = closures[r.appt_date] && closures[r.appt_date].kind === 'office_open'
          ? ` Classes are suspended that day, but the Registrar's Office is open.` : '';
        if (hoursLeft > 0 && hoursLeft <= C.secondReminderHoursBefore && r.reminder_stage < 2) {
          repo.updateRequest(r.id, { reminder_stage: 2 });
          notify(r.student_id, `Today at ${fmtTime(r.slot_start)}: claim your document`,
            `Please be at the Registrar's window by ${fmtTime(r.slot_start)}. Bring your claim slip${r.total_fee > 0 ? ' and official receipt' : ''}.${openNote}`, 'reminder', r.id);
        } else if (hoursLeft > C.secondReminderHoursBefore && hoursLeft <= C.reminderHoursBefore && r.reminder_stage < 1) {
          repo.updateRequest(r.id, { reminder_stage: 1 });
          notify(r.student_id, `Reminder: your appointment is ${r.appt_date === today ? 'today' : 'tomorrow'}`,
            `${when}. Come at your exact time so the line keeps moving — there's a ${C.graceMinutes}-minute allowance.${openNote}`, 'reminder', r.id);
        }
      }
      // missed requests that were never rescheduled
      for (const r of repo.requestsForTick(today, ['missed'])) {
        if (!r.missed_at) continue;
        const deadline = new Date(r.missed_at).getTime() + C.rescheduleWindowDays * 864e5;
        if (t > deadline) {
          repo.tx(() => {
            repo.updateRequest(r.id, { status: 'noshow', updated_at: d.toISOString() });
            history(r.id, 'missed', 'noshow', `Not rescheduled within ${C.rescheduleWindowDays} days`);
            notify(r.student_id, 'Request closed', `${r.ref_code} was closed because no new time was picked. You can submit a new request anytime.`, 'info', r.id);
          });
        }
      }
    }

    /* ---- school email and password rules */
    function emailAllowed(email) {
      const dom = String(email).split('@')[1] || '';
      const list = (C.allowedEmailDomains || []).map((d) => d.trim().toLowerCase()).filter(Boolean);
      return !!dom && (!list.length || list.some((d) => dom === d || dom.endsWith('.' + d)));
    }
    /* Checks a new password before it is hashed. The password itself is never
       written to the database, the log, or any email — only its hash is kept. */
    function passwordProblems(pw, person) {
      const min = C.minPasswordLength || 8;
      const out = [];
      if (typeof pw !== 'string' || pw.length < min) out.push(`Use at least ${min} characters.`);
      if (pw.length > 200) out.push('Keep it under 200 characters.');
      if (!/[A-Za-z]/.test(pw)) out.push('Include at least one letter.');
      if (!/[0-9]/.test(pw)) out.push('Include at least one number.');
      if (['password', 'password1', '12345678', 'qwerty123', 'student123', 'campusflow'].includes(String(pw).toLowerCase()))
        out.push('That password is too easy to guess.');
      if (person && person.studentNo && pw.includes(person.studentNo)) out.push('Do not use your student number as your password.');
      return out;
    }

    /* =============================================================== routes */
    const routes = [];
    const on = (method, pattern, roles, fn) => {
      const keys = [];
      const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
      routes.push({ method, re, keys, roles, fn });
    };
    const STAFF = ['staff', 'head'];

    // ---------- auth
    // Everyone signs in with a password: students with their student number or school
    // email, registrar staff with their staff ID. The password is checked against the
    // stored hash; the plain text is never kept anywhere.
    on('POST', '/api/auth/login', null, ({ body }) => {
      const raw = String(body.loginId || '').trim();
      if (!raw || !String(body.password || '')) fail(400, 'Enter your sign-in ID and password.');
      const u = raw.includes('@') ? repo.getUserByEmail(raw.toLowerCase()) : repo.getUserByLogin(raw.toUpperCase());
      /* A wrong password and an account that does not exist give the same answer,
         so nobody can use this page to find out who is registered. */
      if (!u || u.password_hash === '!' || !verify(String(body.password || ''), u.password_hash)) {
        fail(401, 'That ID, email, or password is incorrect.');
      }
      /* If the hashing was strengthened since this password was set, upgrade it quietly. */
      if (needsRehash && needsRehash(u.password_hash)) {
        repo.updateUser(u.id, { password_hash: hash(String(body.password)) });
      }
      return { data: { user: publicUser(u) }, login: u };
    });

    // New student account. Staff accounts are made by the head registrar, not here.
    on('POST', '/api/auth/register', null, ({ body }) => {
      const name = String(body.fullName || '').trim().slice(0, 80);
      const no = String(body.studentNo || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const pw = String(body.password || '');
      if (name.length < 3) fail(400, 'Enter your full name as it appears on your school records.');
      if (!/^\d{11}$/.test(no)) fail(400, 'Your student number should be 11 digits, like 02000123456.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Enter a valid email address.');
      if (!emailAllowed(email)) fail(400, `Please use your school email (${(C.allowedEmailDomains || []).map((d) => '@' + d.trim()).join(' or ')}).`);
      const problems = passwordProblems(pw, { studentNo: no });
      if (problems.length) fail(400, problems[0]);
      if (repo.getUserByLogin(no)) fail(409, 'That student number already has an account. Try signing in instead.');
      if (repo.getUserByEmail(email)) fail(409, 'That email already has an account. Try signing in instead.');
      const yl = Number(body.yearLevel) || null;
      /* An optional personal address can be given at sign-up. It still has to be
         confirmed by code before anything is sent there. */
      const personal = String(body.notifyEmail || '').trim().toLowerCase();
      const personalOk = personal && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(personal) && personal !== email;
      const code = personalOk ? String(Math.floor(Math.random() * 1000000)).padStart(6, '0') : null;
      const id = repo.insertUser({
        login_id: no, full_name: name, email, password_hash: hash(pw), role: 'student',
        program: String(body.program || '').trim().slice(0, 80),
        year_level: yl && yl >= 1 && yl <= 5 ? yl : null, created_at: now().toISOString(),
        notify_pending: personalOk ? personal : null,
        notify_code: code ? hash(code) : null,
        notify_expires: code ? new Date(now().getTime() + 20 * 60 * 1000).toISOString() : null,
      });
      if (code && mail) mail.send({ to: personal, name, title: 'Your CampusFlow confirmation code',
        body: `Type this code into CampusFlow to start receiving your Registrar notices here: ${code}. It works for 20 minutes.` });
      const u = repo.getUser(id);
      notify(u.id, 'Welcome to CampusFlow',
        'Your account is ready. Request a document, pick a time with open seats, and claim it at the Registrar. We will remind you a day before.', 'info');
      return { data: { user: publicUser(u) }, login: u };
    });

    // Changing a password signs out every other device, since the old one may be known.
    on('POST', '/api/me/password', ['student', 'staff', 'head'], ({ user, body }) => {
      const u = repo.getUser(user.id);
      if (!verify(String(body.currentPassword || ''), u.password_hash)) fail(400, 'Your current password is incorrect.');
      const next = String(body.newPassword || '');
      const problems = passwordProblems(next, { studentNo: u.role === 'student' ? u.login_id : '' });
      if (problems.length) fail(400, problems[0]);
      if (verify(next, u.password_hash)) fail(400, 'Choose a password you have not used here before.');
      repo.updateUser(u.id, { password_hash: hash(next) });
      notify(u.id, 'Your password was changed',
        'If this was not you, contact the Registrar right away.', 'warn');
      return { data: { ok: true }, resetSessions: u.id };
    });

    /* ---- where email notices are delivered
       The school email (Outlook) is the account itself and never changes here.
       A student may add a personal address instead — useful because mail from a
       Gmail sender often lands in a school Outlook Junk folder. A new address is
       only used once a code sent to it has been typed back in, so a typo cannot
       send someone's appointment details to a stranger. */
    on('POST', '/api/me/notify-email', ['student', 'staff', 'head'], ({ user, body }) => {
      const addr = String(body.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) fail(400, 'Enter a valid email address.');
      if (addr.length > 120) fail(400, 'That address is too long.');
      const u = repo.getUser(user.id);
      if (addr === String(u.email || '').toLowerCase()) {
        // same as the school address: just switch back to it
        repo.updateUser(u.id, { notify_email: null, notify_pending: null, notify_code: null, notify_expires: null, email_notify: 1 });
        return { data: { user: publicUser(repo.getUser(u.id)), confirmed: true } };
      }
      const code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
      repo.updateUser(u.id, {
        notify_pending: addr, notify_code: hash(code),
        notify_expires: new Date(now().getTime() + 20 * 60 * 1000).toISOString(),
      });
      /* the code goes to the new address, which is what proves it is reachable */
      if (mail) mail.send({ to: addr, name: u.full_name, title: 'Your CampusFlow confirmation code',
        body: `Type this code into CampusFlow to start receiving your Registrar notices here: ${code}. It works for 20 minutes.` });
      return { data: { user: publicUser(repo.getUser(u.id)), sentTo: addr } };
    });

    on('POST', '/api/me/notify-email/confirm', ['student', 'staff', 'head'], ({ user, body }) => {
      const u = repo.getUser(user.id);
      if (!u.notify_pending) fail(409, 'There is no address waiting to be confirmed.');
      if (!u.notify_expires || new Date(u.notify_expires) < now()) fail(400, 'That code has expired. Send a new one.');
      if (!verify(String(body.code || '').trim(), u.notify_code || '')) fail(400, 'That code does not match. Check the email and try again.');
      repo.updateUser(u.id, {
        notify_email: u.notify_pending, notify_pending: null, notify_code: null, notify_expires: null, email_notify: 1,
      });
      const fresh = repo.getUser(u.id);
      notify(fresh.id, 'Notices are now sent here',
        'From now on your Registrar reminders and updates arrive at this address. You can switch back to your school email anytime in Account.', 'success');
      return { data: { user: publicUser(fresh) } };
    });

    on('POST', '/api/me/notify-email/clear', ['student', 'staff', 'head'], ({ user }) => {
      repo.updateUser(user.id, { notify_email: null, notify_pending: null, notify_code: null, notify_expires: null });
      return { data: { user: publicUser(repo.getUser(user.id)) } };
    });

    // The switch that turns email off entirely. Notices still appear in the bell.
    on('POST', '/api/me/email-notify', ['student', 'staff', 'head'], ({ user, body }) => {
      repo.updateUser(user.id, { email_notify: body.enabled ? 1 : 0 });
      return { data: { user: publicUser(repo.getUser(user.id)) } };
    });

    // The student can keep their program and year level up to date.
    on('POST', '/api/me/profile', ['student'], ({ user, body }) => {
      const yl = Number(body.yearLevel) || null;
      repo.updateUser(user.id, {
        program: String(body.program || '').trim().slice(0, 80),
        year_level: yl && yl >= 1 && yl <= 5 ? yl : null,
      });
      return { data: { user: publicUser(repo.getUser(user.id)) } };
    });

    on('GET', '/api/me', ['student', 'staff', 'head'], ({ user }) => ({ data: { user: publicUser(user), unread: repo.unreadCount(user.id) } }));

    // ---------- public-ish info
    on('GET', '/api/config', null, () => ({ data: {
      officeName: C.officeName, campusName: C.campusName, openTime: C.openTime, closeTime: C.closeTime,
      lunchStart: C.lunchStart, lunchEnd: C.lunchEnd, slotMinutes: C.slotMinutes, defaultSlotCapacity: C.defaultSlotCapacity,
      maxAdvanceDays: C.maxAdvanceDays, minLeadHours: C.minLeadHours, graceMinutes: C.graceMinutes,
      rescheduleWindowDays: C.rescheduleWindowDays, maxReschedules: C.maxReschedules, maxOpenRequests: C.maxOpenRequests,
      today: nowParts().today, categories: CATEGORY_LABEL, publicUrl: C.publicUrl || '', demoAccounts: (C.seedMode || 'demo') === 'demo',
      emailDomains: C.allowedEmailDomains || [], emailNotifications: mail ? mail.enabled() : false,
      minPasswordLength: C.minPasswordLength || 8,
      demoStudent: (C.seedMode || 'demo') === 'demo' ? { loginId: '02000123456', password: C.demoPassword } : null,
    } }));
    on('GET', '/api/documents', ['student', 'staff', 'head'], () => ({ data: repo.listDocTypes().map((d) => ({
      id: d.id, code: d.code, name: d.name, description: d.description, category: d.category, fee: d.fee,
      processingDays: d.processing_days, maxCopies: d.max_copies,
    })) }));

    // ---------- availability
    function earliestForQuery(query, user) {
      if (query.request) {
        const r = loadOwned(query.request, user);
        if (r.status === 'ready' || r.prev_status === 'ready') return { date: nowParts().today, days: 0 };
        return earliestFor(repo.getItems(r.id).map((i) => ({ processing_days: i.processing_days })), r.created_at.slice(0, 10));
      }
      const ids = String(query.docs || '').split(',').map(Number).filter(Boolean);
      const docs = ids.map((i) => repo.getDocType(i)).filter(Boolean);
      return earliestFor(docs);
    }
    on('GET', '/api/availability', ['student', 'staff', 'head'], ({ query, user }) => {
      const month = /^\d{4}-\d{2}$/.test(query.month || '') ? query.month : nowParts().today.slice(0, 7);
      const first = month + '-01';
      const d = parseDate(first); d.setMonth(d.getMonth() + 1); d.setDate(0);
      const last = toDateStr(d);
      const { today } = nowParts();
      const earliest = earliestForQuery(query, user);
      const ctx = { today, earliest: earliest.date, closures: closureMap(first, last), capMap: capMapFor(first, last), booked: repo.bookedCountsRange(first, last, BOOKED), mine: {} };
      if (user.role === 'student') {
        for (const r of repo.queryRequests({ studentId: user.id, statuses: ACTIVE_APPT, from: first, to: last, limit: 50, offset: 0 }).rows) {
          if (String(r.id) !== String(query.request || '')) ctx.mine[r.appt_date] = r.ref_code;
        }
      }
      const days = [];
      for (let s = first; s <= last; s = addDays(s, 1)) days.push(Object.assign({ date: s }, dayState(s, ctx)));
      return { data: { month, earliest: earliest.date, processingDays: earliest.days, days } };
    });
    on('GET', '/api/slots', ['student', 'staff', 'head'], ({ query }) => {
      const date = query.date;
      if (!isDateStr(date)) fail(400, 'Invalid date.');
      const exclude = Number(query.exclude) || null;
      const slots = slotsForDate(date, exclude, capMapFor(date, date), repo.bookedCounts(date, exclude, BOOKED));
      const closure = repo.getClosure(date);
      return { data: { date, slots, note: closure && closure.kind === 'office_open' ? closure.reason : '' } };
    });

    // ---------- requests
    on('POST', '/api/requests', ['student'], ({ body, user }) => {
      const raw = Array.isArray(body.items) ? body.items : [];
      const merged = {};
      for (const it of raw) { const id = Number(it.docId); if (id) merged[id] = (merged[id] || 0) + (Number(it.copies) || 1); }
      const ids = Object.keys(merged).map(Number);
      if (!ids.length) fail(400, 'Choose at least one document.');
      const docs = ids.map((id) => { const d = repo.getDocType(id); if (!d || !d.is_active) fail(400, 'One of the documents is no longer offered.'); return d; });
      for (const d of docs) if (merged[d.id] < 1 || merged[d.id] > d.max_copies) fail(400, `${d.name}: you can request 1 to ${d.max_copies} ${d.max_copies > 1 ? 'copies' : 'copy'}.`);
      const open = repo.countOpenForStudent(user.id, OPEN);
      if (open >= C.maxOpenRequests) fail(409, `You already have ${open} open requests. Claim or cancel one before adding another.`);
      const earliest = earliestFor(docs);
      let result;
      repo.tx(() => {
        const slot = validateSlot(user.id, body.date, body.slot, earliest.date, null);
        const total = docs.reduce((a, d) => a + d.fee * merged[d.id], 0);
        let ref; do { ref = 'CF-' + Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[01OIL]/g, '7'); } while (repo.getRequestByRef(ref));
        const ts = now().toISOString();
        const id = repo.insertRequest({
          ref_code: ref, student_id: user.id, appt_date: body.date, slot_start: slot.start, slot_end: slot.end, status: 'pending',
          purpose: String(body.purpose || '').slice(0, 200), student_note: String(body.note || '').slice(0, 400), total_fee: total,
          payment_status: total > 0 ? 'unpaid' : 'none', reschedule_count: 0, free_reschedule: 0, reminder_stage: 0, created_at: ts, updated_at: ts,
        });
        for (const d of docs) repo.insertItem({ request_id: id, doc_type_id: d.id, copies: merged[d.id], unit_fee: d.fee });
        history(id, null, 'pending', 'Request submitted', user.id);
        notify(user.id, `Request ${ref} received`,
          total > 0
            ? `Next: print your payment slip, pay ${peso(total)} at the Cashier, then upload your official receipt here.`
            : `We'll let you know once the Registrar approves it. Your time: ${fmtDate(body.date)}, ${fmtTime(slot.start)}.`, 'success', id);
        result = detail(repo.getRequest(id), user);
      });
      return { status: 201, data: result };
    });

    on('GET', '/api/requests', ['student', 'staff', 'head'], ({ query, user }) => {
      const f = { limit: Math.min(100, Number(query.limit) || 20), offset: 0, sort: query.sort || 'appt' };
      f.offset = Math.max(0, (Number(query.page) || 1) - 1) * f.limit;
      if (user.role === 'student') { f.studentId = user.id; f.sort = query.sort || 'created'; }
      if (query.status === 'open') f.statuses = OPEN;
      else if (query.status && STATUS_LABEL[query.status]) f.statuses = [query.status];
      if (query.q) f.q = String(query.q).trim().slice(0, 60);
      if (isDateStr(query.date)) f.date = query.date;
      if (isDateStr(query.from)) f.from = query.from;
      if (isDateStr(query.to)) f.to = query.to;
      if (query.payment && PAYMENT_LABEL[query.payment]) f.payment = query.payment;
      const { rows, total } = repo.queryRequests(f);
      return { data: { rows: shapeMany(rows), total, page: f.offset / f.limit + 1, pages: Math.max(1, Math.ceil(total / f.limit)) } };
    });
    on('GET', '/api/requests/:id', ['student', 'staff', 'head'], ({ params, user }) => ({ data: detail(loadOwned(params.id, user), user) }));
    on('GET', '/api/requests/:id/receipt', ['student', 'staff', 'head'], ({ params, user }) => {
      const r = loadOwned(params.id, user);
      if (!r.receipt_image) fail(404, 'No receipt uploaded.');
      return { data: { image: r.receipt_image } };
    });

    on('POST', '/api/requests/:id/cancel', ['student'], ({ params, user, body }) => {
      const r = loadOwned(params.id, user);
      if (!['pending', 'approved', 'missed'].includes(r.status)) fail(409, 'This request can no longer be cancelled here. Please talk to the Registrar.');
      repo.tx(() => {
        repo.updateRequest(r.id, { status: 'cancelled', updated_at: now().toISOString() });
        history(r.id, r.status, 'cancelled', String(body.reason || 'Cancelled by student').slice(0, 200), user.id);
      });
      return { data: detail(repo.getRequest(r.id), user) };
    });

    on('POST', '/api/requests/:id/reschedule', ['student'], ({ params, user, body }) => {
      const r = loadOwned(params.id, user);
      if (!(ACTIVE_APPT.includes(r.status) || r.status === 'missed')) fail(409, 'This request can no longer be moved.');
      const free = r.status === 'missed' && r.free_reschedule;
      if (!free && r.reschedule_count >= C.maxReschedules) fail(409, `You've already moved this request ${C.maxReschedules} times. Please visit the Registrar.`);
      if (r.status === 'missed' && r.missed_at && now().getTime() > new Date(r.missed_at).getTime() + C.rescheduleWindowDays * 864e5) fail(409, 'The time to reschedule has passed.');
      const ready = r.status === 'ready' || r.prev_status === 'ready';
      const earliest = ready ? nowParts().today : earliestFor(repo.getItems(r.id).map((i) => ({ processing_days: i.processing_days })), r.created_at.slice(0, 10)).date;
      repo.tx(() => {
        const slot = validateSlot(user.id, body.date, body.slot, earliest, r.id);
        const newStatus = r.status === 'missed' ? (r.prev_status || 'pending') : r.status;
        repo.updateRequest(r.id, { appt_date: body.date, slot_start: slot.start, slot_end: slot.end, status: newStatus, prev_status: null, missed_at: null,
          reschedule_count: r.reschedule_count + (free ? 0 : 1), free_reschedule: 0, reminder_stage: 0, updated_at: now().toISOString() });
        history(r.id, r.status, newStatus, `Moved from ${fmtDate(r.appt_date)} ${fmtTime(r.slot_start)} to ${fmtDate(body.date)} ${fmtTime(slot.start)}`, user.id);
        notify(user.id, 'New time saved', `${r.ref_code}: ${fmtDate(body.date)}, ${fmtTime(slot.start)}–${fmtTime(slot.end)}.`, 'success', r.id);
      });
      return { data: detail(repo.getRequest(r.id), user) };
    });

    on('POST', '/api/requests/:id/payment', ['student'], ({ params, user, body }) => {
      const r = loadOwned(params.id, user);
      if (!(r.payment_status === 'unpaid' || r.payment_status === 'rejected')) fail(409, 'Payment was already sent for this request.');
      if (!OPEN.includes(r.status)) fail(409, 'This request is closed.');
      const or = String(body.orNumber || '').trim();
      if (!/^[A-Za-z0-9-]{4,30}$/.test(or)) fail(400, 'Type the OR number printed on your official receipt (letters, numbers and dashes).');
      const img = body.receiptImage ? String(body.receiptImage) : '';
      if (img && !/^data:image\/(png|jpe?g|webp);base64,/.test(img)) fail(400, 'Upload a photo of the receipt (JPG, PNG or WEBP).');
      if (img.length > 2_800_000) fail(413, 'That photo is too large. Try a smaller one (under 2 MB).');
      repo.updateRequest(r.id, { payment_status: 'submitted', or_number: or, receipt_image: img || null, payment_note: '', updated_at: now().toISOString() });
      history(r.id, r.status, r.status, `Payment receipt sent (OR ${or})`, user.id);
      return { data: detail(repo.getRequest(r.id), user) };
    });

    // ---------- registrar actions
    on('POST', '/api/requests/:id/transition', STAFF, ({ params, user, body }) => {
      const r = loadOwned(params.id, user);
      const to = String(body.to || '');
      if (!(TRANSITIONS[r.status] || []).includes(to)) fail(409, `A request that is "${STATUS_LABEL[r.status]}" can't be set to "${STATUS_LABEL[to] || to}".`);
      if (to === 'rejected' && String(body.reason || '').trim().length < 5) fail(400, 'Tell the student why it was declined.');
      if ((to === 'ready' || to === 'released') && r.total_fee > 0 && r.payment_status !== 'verified') fail(409, 'Verify the payment receipt first.');
      const ts = now().toISOString();
      const patch = { status: to, processed_by: user.id, updated_at: ts };
      if (to === 'approved') patch.approved_at = ts;
      if (to === 'ready') patch.ready_at = ts;
      if (to === 'released') patch.released_at = ts;
      if (to === 'rejected') patch.reject_reason = String(body.reason).trim().slice(0, 300);
      if (body.note) patch.staff_note = String(body.note).slice(0, 400);
      const when = `${fmtDate(r.appt_date)}, ${fmtTime(r.slot_start)}`;
      repo.tx(() => {
        repo.updateRequest(r.id, patch);
        history(r.id, r.status, to, to === 'rejected' ? patch.reject_reason : String(body.note || ''), user.id);
        const msg = {
          approved: ['Approved — see you soon', `${r.ref_code} is approved for ${when}.${r.total_fee > 0 && r.payment_status !== 'verified' ? ' Don\'t forget to pay and upload your receipt.' : ''}`, 'success'],
          processing: ['Your document is being prepared', `${r.ref_code}: the Registrar is working on it.`, 'info'],
          ready: ['Ready to claim', `${r.ref_code} is ready. Come on ${when} and bring your claim slip.`, 'success'],
          released: ['Claimed — thank you!', `${r.ref_code} was released to you.`, 'success'],
          rejected: ['Request declined', `${r.ref_code}: ${patch.reject_reason}`, 'warning'],
          noshow: ['Request closed', `${r.ref_code} was closed as not claimed.`, 'info'],
        }[to];
        notify(r.student_id, msg[0], msg[1], msg[2], r.id);
      });
      return { data: detail(repo.getRequest(r.id), user) };
    });
    on('POST', '/api/requests/bulk-approve', STAFF, ({ user, body }) => {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).slice(0, 100);
      let done = 0;
      for (const id of ids) {
        const r = repo.getRequest(id);
        if (!r || r.status !== 'pending') continue;
        repo.tx(() => {
          repo.updateRequest(id, { status: 'approved', approved_at: now().toISOString(), processed_by: user.id, updated_at: now().toISOString() });
          history(id, 'pending', 'approved', 'Bulk approved', user.id);
          notify(r.student_id, 'Approved — see you soon', `${r.ref_code} is approved for ${fmtDate(r.appt_date)}, ${fmtTime(r.slot_start)}.`, 'success', id);
        });
        done++;
      }
      return { data: { approved: done } };
    });
    on('POST', '/api/requests/:id/verify-payment', STAFF, ({ params, user, body }) => {
      const r = loadOwned(params.id, user);
      if (r.payment_status !== 'submitted') fail(409, 'There is no receipt waiting to be checked.');
      const ok = !!body.ok;
      if (!ok && String(body.note || '').trim().length < 5) fail(400, 'Tell the student what was wrong with the receipt.');
      repo.tx(() => {
        repo.updateRequest(r.id, { payment_status: ok ? 'verified' : 'rejected', payment_note: ok ? '' : String(body.note).trim().slice(0, 300), updated_at: now().toISOString() });
        history(r.id, r.status, r.status, ok ? `Payment verified (OR ${r.or_number})` : `Receipt not accepted: ${body.note}`, user.id);
        notify(r.student_id, ok ? 'Payment confirmed' : 'Please re-upload your receipt',
          ok ? `${r.ref_code}: we received ${peso(r.total_fee)}. Thank you!` : `${r.ref_code}: ${String(body.note).trim()}`, ok ? 'success' : 'warning', r.id);
      });
      return { data: detail(repo.getRequest(r.id), user) };
    });

    on('GET', '/api/registrar/dashboard', STAFF, () => {
      const { today } = nowParts();
      const wd = parseDate(today).getDay();
      const weekStart = addDays(today, -((wd + 6) % 7));
      const raw = repo.dashboardRaw({ today, weekStart, monthStart: today.slice(0, 8) + '01', since30: addDays(today, -30) });
      const todaySlots = slotsForDate(today, null, capMapFor(today, today), repo.bookedCounts(today, null, BOOKED));
      return { data: {
        pending: raw.byStatus.pending || 0, ready: raw.byStatus.ready || 0, missed: raw.byStatus.missed || 0,
        paymentsToCheck: raw.paymentsToCheck, todayTotal: raw.todayTotal, releasedWeek: raw.releasedWeek, feesMonth: raw.feesMonth,
        todaySlots: todaySlots.map((s) => ({ start: s.start, end: s.end, booked: s.booked, capacity: s.capacity })),
        topDocs: raw.topDocs,
        activity: raw.activity.map((a) => ({ ref: a.ref_code, id: a.request_id, student: a.student_name, to: a.to_status, label: STATUS_LABEL[a.to_status], note: a.note, by: a.by_name || 'System', at: a.at })),
      } };
    });
    on('GET', '/api/registrar/manifest', STAFF, ({ query }) => {
      const date = isDateStr(query.date) ? query.date : nowParts().today;
      const rows = shapeMany(repo.requestsOnDate(date, BOOKED));
      return { data: { date, rows, closure: repo.getClosure(date) || null } };
    });

    // ---------- closures, suspensions, capacity
    on('GET', '/api/closures', STAFF, () => {
      const { today } = nowParts();
      return { data: {
        closures: repo.listClosures(addDays(today, -30), addDays(today, 365)),
        capacity: repo.getCapacityMap(today, addDays(today, 120)),
      } };
    });
    on('POST', '/api/closures', STAFF, ({ user, body }) => {
      const { today } = nowParts();
      const date = body.date, kind = body.kind === 'office_open' ? 'office_open' : 'closed';
      const reason = String(body.reason || '').trim().slice(0, 160);
      if (!isDateStr(date) || date < today) fail(400, 'Pick today or a future date.');
      if (reason.length < 3) fail(400, 'Add a short reason students will see, e.g. "Typhoon signal no. 2".');
      if (repo.getClosure(date)) fail(409, 'That date already has a notice. Remove it first to change it.');
      let affected = 0;
      repo.tx(() => {
        repo.insertClosure({ date, kind, reason, created_by: user.id, created_at: now().toISOString() });
        const rows = repo.requestsOnDate(date, ACTIVE_APPT);
        for (const r of rows) {
          affected++;
          const when = `${fmtDate(date)}, ${fmtTime(r.slot_start)}`;
          if (kind === 'closed') {
            repo.updateRequest(r.id, { status: 'missed', prev_status: r.status, missed_at: now().toISOString(), free_reschedule: 1, updated_at: now().toISOString() });
            history(r.id, r.status, 'missed', `Office closed: ${reason}`, user.id);
            notify(r.student_id, 'Office closed on your appointment day',
              `The Registrar's Office is closed on ${fmtDate(date)} (${reason}). Please pick a new time — this move won't count against your reschedules.`, 'warning', r.id);
          } else {
            notify(r.student_id, 'Classes suspended, but the office is OPEN',
              `${reason}. The Registrar's Office is still open on ${fmtDate(date)}, so your appointment (${when}) stays. If you can't travel safely, reschedule it — no penalty.`, 'warning', r.id);
            repo.updateRequest(r.id, { free_reschedule: 1 });
          }
        }
        repo.insertAnnouncement({
          title: kind === 'closed' ? `Office closed on ${fmtDate(date)}` : `Office open on ${fmtDate(date)} despite class suspension`,
          body: kind === 'closed' ? `${reason}. Students booked that day were asked to pick a new time.` : `${reason}. Appointments push through as scheduled.`,
          kind: kind === 'closed' ? 'closure' : 'suspension', created_by: user.id, created_at: now().toISOString(), expires_on: date,
        });
      });
      return { status: 201, data: { affected } };
    });
    on('DELETE', '/api/closures/:id', STAFF, ({ params }) => { repo.deleteClosure(Number(params.id)); return { data: { ok: true } }; });
    on('POST', '/api/capacity', STAFF, ({ body }) => {
      if (!isDateStr(body.date)) fail(400, 'Pick a date.');
      const cap = body.capacity === null || body.capacity === '' ? null : Number(body.capacity);
      if (cap !== null && !(Number.isInteger(cap) && cap >= 0 && cap <= 50)) fail(400, 'Seats per window must be 0 to 50.');
      repo.setCapacity(body.date, cap);
      return { data: { ok: true } };
    });

    // ---------- announcements & claiming board
    on('GET', '/api/board', ['student', 'staff', 'head'], ({ user }) => {
      let { today, min } = nowParts();
      let date = today;
      const closures = closureMap(today, addDays(today, 14));
      const lastSlotEnd = toMin(SLOTS[SLOTS.length - 1].end);
      if (min >= lastSlotEnd) date = addDays(date, 1);
      for (let i = 0; i < 14 && (isWeekend(date) || (closures[date] && closures[date].kind === 'closed')); i++) date = addDays(date, 1);
      const rows = shapeMany(repo.requestsOnDate(date, ['approved', 'processing', 'ready', 'released']));
      const slots = slotsForDate(date, null, capMapFor(date, date), repo.bookedCounts(date, null, BOOKED));
      return { data: {
        date, isToday: date === today, notice: closures[date] || null,
        claims: rows.map((r) => ({ who: maskStudentNo(r.student.studentNo, C.maskStudentNumbers), mine: user.role === 'student' && r.student.studentNo === user.login_id,
          doc: r.docSummary, time: r.slotStart, claimed: r.status === 'released' })),
        slots: slots.map((s) => ({ start: s.start, left: s.left, capacity: s.capacity })),
        announcements: repo.listAnnouncements(today).map((a) => ({ id: a.id, title: a.title, body: a.body, kind: a.kind, at: a.created_at })),
      } };
    });
    on('POST', '/api/announcements', STAFF, ({ user, body }) => {
      const title = String(body.title || '').trim().slice(0, 120), text = String(body.body || '').trim().slice(0, 500);
      if (title.length < 3) fail(400, 'Add a title.');
      const exp = isDateStr(body.expiresOn) ? body.expiresOn : null;
      repo.insertAnnouncement({ title, body: text, kind: 'general', created_by: user.id, created_at: now().toISOString(), expires_on: exp });
      return { status: 201, data: { ok: true } };
    });
    on('DELETE', '/api/announcements/:id', STAFF, ({ params }) => { repo.deleteAnnouncement(Number(params.id)); return { data: { ok: true } }; });

    // ---------- public slip (opened by scanning the QR code — no sign-in needed, the token proves it's genuine)
    on('GET', '/api/public/slip/:ref', null, ({ params, query }) => {
      const ref = String(params.ref || '').toUpperCase();
      if (!/^CF-[A-Z0-9]{6}$/.test(ref) || String(query.t || '') !== sign(ref)) fail(404, 'This slip link is not valid. Ask the student to open it again from CampusFlow.');
      const row = repo.getRequestByRef(ref);
      const r = row && repo.getRequest(row.id);
      if (!r) fail(404, 'This slip link is not valid.');
      const st = repo.getSettings();
      const out = shape(r, repo.getItems(r.id));
      delete out.canCancel; delete out.canReschedule; delete out.canPay; delete out.studentNote; delete out.purpose;
      out.student = { name: r.full_name, studentNo: r.login_id, program: r.program || '' };
      return { data: { request: out, settings: { registrarName: st.registrarName || '', registrarTitle: st.registrarTitle || '', signature: st.signature || '' },
        office: { campusName: C.campusName, officeName: C.officeName, graceMinutes: C.graceMinutes } } };
    });

    // ---------- notifications
    on('GET', '/api/notifications', ['student', 'staff', 'head'], ({ user }) => ({ data: {
      unread: repo.unreadCount(user.id),
      items: repo.listNotifications(user.id, 40).map((n) => ({ id: n.id, title: n.title, body: n.body, kind: n.kind, requestId: n.request_id, read: !!n.is_read, at: n.created_at })),
    } }));
    on('POST', '/api/notifications/read', ['student', 'staff', 'head'], ({ user, body }) => { repo.markRead(user.id, body.id ? Number(body.id) : null); return { data: { ok: true } }; });

    // ---------- settings (registrar name + signature on slips)
    on('GET', '/api/settings', ['student', 'staff', 'head'], () => ({ data: repo.getSettings() }));
    on('POST', '/api/settings', ['head'], ({ body }) => {
      if (body.registrarName !== undefined) repo.setSetting('registrarName', String(body.registrarName).trim().slice(0, 80));
      if (body.registrarTitle !== undefined) repo.setSetting('registrarTitle', String(body.registrarTitle).trim().slice(0, 80));
      if (body.signature !== undefined) {
        const s = String(body.signature || '');
        if (s && (!/^data:image\/png;base64,/.test(s) || s.length > 400000)) fail(400, 'Signature must be a PNG drawing.');
        repo.setSetting('signature', s);
      }
      return { data: repo.getSettings() };
    });

    /* ------------------------------------------------------------- dispatch */
    function handle({ method, path, query = {}, body = {}, user = null }) {
      try {
        for (const rt of routes) {
          if (rt.method !== method) continue;
          const m = path.match(rt.re);
          if (!m) continue;
          if (rt.roles && !user) fail(401, 'Please sign in first.');
          if (rt.roles && !rt.roles.includes(user.role)) fail(403, 'You don\'t have access to that.');
          const params = {}; rt.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
          const res = rt.fn({ params, query, body: body || {}, user }) || {};
          return { status: res.status || 200, data: res.data, login: res.login, logout: res.logout };
        }
        return { status: 404, data: { error: 'Not found.' } };
      } catch (e) {
        if (e instanceof ApiError) return { status: e.status, data: { error: e.message } };
        console.error(e);
        return { status: 500, data: { error: 'Something went wrong on our side. Please try again.' } };
      }
    }

    return { handle, tick, slots: SLOTS, publicUser };
  }

  return { createCore, util: { toDateStr, parseDate, addDays, fmtDate, fmtTime, peso, isWeekend, toMin, fromMin, maskStudentNo, STATUS_LABEL, PAYMENT_LABEL, CATEGORY_LABEL, OPEN, BOOKED } };
});
