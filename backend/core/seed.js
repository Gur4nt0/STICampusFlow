/* ==========================================================================
   Demo data — runs once when the database is empty. Deterministic, so every
   team member sees the same data during the defense.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.CampusSeed = factory(root.CampusCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';
  const { toDateStr, addDays, isWeekend } = Core.util;

  const DOCS = [
    ['TOR', 'Transcript of Records', 'records', 350, 5, 3, 'Full list of subjects and grades. Needed for transfers and board exams.'],
    ['COG', 'Certificate of Grades', 'records', 75, 2, 5, 'Your grades for one term, signed by the Registrar.'],
    ['F137', 'Form 137 (Permanent Record)', 'records', 150, 7, 1, 'Your permanent school record, sent to the school you are moving to.'],
    ['F138', 'Form 138 (Report Card)', 'records', 100, 3, 1, 'Your report card for the school year.'],
    ['HDF', 'Honorable Dismissal', 'records', 200, 7, 1, 'Needed when you transfer to another school.'],
    ['GMC', 'Good Moral Certificate', 'certification', 100, 3, 3, 'Shows you have no pending disciplinary case on campus.'],
    ['DIP', 'Diploma (Second Copy)', 'certification', 500, 10, 1, 'Replacement diploma. Bring an affidavit of loss.'],
    ['CAV', 'CAV (Authentication)', 'certification', 450, 10, 2, 'Certification, authentication and verification for use abroad.'],
    ['EXP', 'Examination Permit', 'clearance', 0, 1, 2, 'Needed to take your midterm or final exams.'],
    ['CLR', 'Student Clearance Form', 'clearance', 0, 2, 2, 'End-of-term clearance signed by each office.'],
    ['COE', 'Certificate of Enrollment', 'enrollment', 50, 1, 5, 'Proof that you are enrolled this term.'],
  ];
  const FIRST = ['Andrea', 'Paolo', 'Bea', 'Miguel', 'Kyla', 'Joshua', 'Trisha', 'Carlo', 'Nicole', 'Renz', 'Angel', 'Mark', 'Janine', 'Kevin', 'Aira', 'Jerome', 'Shane', 'Lance', 'Ella', 'Rafael'];
  const LAST = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres', 'Flores', 'Villanueva', 'Ramos', 'Aquino', 'Navarro', 'Castillo', 'Soriano', 'Pascual'];
  const PROGRAMS = ['BS Information Technology', 'BS Computer Science', 'BS Tourism Management', 'BS Business Administration', 'BS Accountancy', 'BS Hospitality Management'];
  const PURPOSES = ['Scholarship application', 'Employment', 'Transfer to another school', 'Internship requirement', 'Board exam', 'Personal copy'];

  function seed(repo, { hash, now, slots, config, mode = 'demo', adminPassword = 'Registrar@123' }) {
    let s = 20260923;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const d0 = now();
    const today = toDateStr(d0);
    const iso = (date, hh = 9, mm = 0) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d, hh, mm).toISOString(); };
    const nextWorkday = (from, n = 1) => { let d = from; while (n > 0) { d = addDays(d, 1); if (!isWeekend(d)) n--; } return d; };

    repo.tx(() => {
      const docIds = {};
      DOCS.forEach((d, i) => {
        docIds[d[0]] = repo.insertDocType({ code: d[0], name: d[1], category: d[2], fee: d[3], processing_days: d[4], max_copies: d[5], description: d[6], is_active: 1, sort_order: i + 1 });
      });
      const docs = repo.listDocTypes();
      const byCode = {}; docs.forEach((d) => (byCode[d.code] = d));

      const staffHash = hash(mode === 'demo' ? 'Registrar@123' : adminPassword);
      const head = repo.insertUser({ login_id: 'REG-001', full_name: 'Marissa Villanueva', role: 'head', email: 'registrar@globalcity.sti.edu.ph', password_hash: staffHash, created_at: iso(addDays(today, -200)) });
      if (mode !== 'demo') { // real use: catalogue + head registrar only, no fake students
        repo.setSetting('registrarName', 'Marissa Villanueva');
        repo.setSetting('registrarTitle', 'School Registrar');
        repo.setSetting('signature', '');
        return;
      }
      const staff = [head,
        repo.insertUser({ login_id: 'REG-002', full_name: 'Dennis Ocampo', role: 'staff', password_hash: staffHash, created_at: iso(addDays(today, -200)) }),
        repo.insertUser({ login_id: 'REG-003', full_name: 'Katrina Bautista', role: 'staff', password_hash: staffHash, created_at: iso(addDays(today, -200)) })];

      /* Sample students can sign in with the demo password. Each one is hashed
         on its own, so no two accounts share a salt. */
      const studentPassword = (config && config.demoPassword) || 'Student@123';
      const juan = repo.insertUser({ login_id: '02000123456', full_name: 'Juan Dela Cruz', role: 'student', email: 'delacruz.123456@globalcity.sti.edu.ph',
        program: 'BS Information Technology', year_level: 3, password_hash: hash(studentPassword), created_at: iso(addDays(today, -150)) });
      const students = [];
      /* The 40 background students exist only to fill the queue and the claiming
         board for the demo. They share one hash so the first start stays quick. */
      const crowdHash = hash(studentPassword);
      for (let i = 0; i < 40; i++) {
        const no = '0200' + String(1000000 + Math.floor(rnd() * 8999999)).slice(0, 7), fn = pick(FIRST), ln = pick(LAST);
        students.push(repo.insertUser({ login_id: no, full_name: `${fn} ${ln}`, role: 'student', email: `${ln.toLowerCase()}.${no.slice(-6)}@globalcity.sti.edu.ph`,
          program: pick(PROGRAMS), year_level: 1 + Math.floor(rnd() * 4), password_hash: crowdHash, created_at: iso(addDays(today, -120)) }));
      }

      repo.setSetting('registrarName', 'Marissa Villanueva');
      repo.setSetting('registrarTitle', 'School Registrar');
      repo.setSetting('signature', '');

      const taken = {}; // date|slot -> count, and date|student
      let refN = 0;
      const makeRequest = (sid, date, slot, codes, status, opts = {}) => {
        const key = date + '|' + slot.start;
        taken[key] = (taken[key] || 0) + 1; taken[date + '|s' + sid] = 1;
        const items = codes.map((c) => ({ d: byCode[c], copies: 1 + (rnd() < 0.2 && byCode[c].max_copies > 1 ? 1 : 0) }));
        const total = items.reduce((a, i) => a + i.d.fee * i.copies, 0);
        const lead = Math.max(...items.map((i) => i.d.processing_days)) + 2;
        const created = iso(addDays(date, -lead - Math.floor(rnd() * 3)), 8 + Math.floor(rnd() * 8), Math.floor(rnd() * 60));
        const createdAt = created > d0.toISOString() ? new Date(d0.getTime() - (2 + Math.floor(rnd() * 70)) * 36e5).toISOString() : created;
        let pay = total > 0 ? (opts.pay || (['approved', 'processing'].includes(status) ? pick(['unpaid', 'submitted', 'verified']) : ['ready', 'released', 'missed', 'noshow'].includes(status) ? 'verified' : 'unpaid')) : 'none';
        refN++;
        const ref = 'CF-' + (0x3a9c1 + refN * 7919).toString(36).toUpperCase().slice(-6).padStart(6, 'K');
        const by = pick(staff);
        const id = repo.insertRequest({
          ref_code: ref, student_id: sid, appt_date: date, slot_start: slot.start, slot_end: slot.end, status,
          prev_status: opts.prev || null, purpose: pick(PURPOSES), student_note: '', total_fee: total, payment_status: pay,
          or_number: ['submitted', 'verified'].includes(pay) ? 'OR-' + (48000 + refN * 13) : null, receipt_image: null,
          reschedule_count: 0, free_reschedule: 0, reminder_stage: date < today ? 2 : 0, missed_at: opts.missedAt || null,
          processed_by: status === 'pending' ? null : by, reject_reason: status === 'rejected' ? 'Incomplete requirements: please bring your clearance.' : null,
          approved_at: status !== 'pending' ? createdAt : null, released_at: status === 'released' ? iso(date, +slot.start.slice(0, 2), 10) : null,
          created_at: createdAt, updated_at: createdAt,
        });
        items.forEach((i) => repo.insertItem({ request_id: id, doc_type_id: i.d.id, copies: i.copies, unit_fee: i.d.fee }));
        repo.addHistory({ request_id: id, from_status: null, to_status: 'pending', note: 'Request submitted', by_user_id: sid, at: createdAt });
        const path = { approved: ['approved'], processing: ['approved', 'processing'], ready: ['approved', 'processing', 'ready'], released: ['approved', 'processing', 'ready', 'released'],
          rejected: ['rejected'], cancelled: ['cancelled'], noshow: ['approved', 'missed', 'noshow'], missed: ['approved', 'missed'] }[status] || [];
        let prev = 'pending', t = new Date(createdAt).getTime();
        for (const st of path) {
          t += 36e5 * (4 + Math.floor(rnd() * 20));
          const at = new Date(Math.min(t, d0.getTime() - 60000)).toISOString();
          const system = st === 'missed' || st === 'noshow';
          repo.addHistory({ request_id: id, from_status: prev, to_status: st, note: st === 'rejected' ? 'Incomplete requirements: please bring your clearance.' : st === 'missed' ? 'No-show after the grace period' : '', by_user_id: system ? null : st === 'cancelled' ? sid : by, at });
          prev = st;
        }
        return id;
      };

      // Juan's requests — these match the examples in the feedback document
      const tmr = nextWorkday(today);
      const gmcSlot = slots.find((x) => x.start === '14:00') || slots[slots.length - 2];
      const rGmc = makeRequest(juan, tmr, gmcSlot, ['GMC'], 'ready', { pay: 'verified' });
      makeRequest(juan, nextWorkday(today, 9), slots.find((x) => x.start === '09:00') || slots[1], ['F137', 'F138'], 'pending', { pay: 'unpaid' });
      makeRequest(juan, addDays(today, -21), slots[2], ['COG'], 'released');
      repo.insertNotification({ user_id: juan, title: 'Ready to claim', body: 'Your Good Moral Certificate is ready. Bring your claim slip.', kind: 'success', request_id: rGmc, is_read: 0, created_at: new Date(d0.getTime() - 3 * 36e5).toISOString() });

      // everybody else (the holiday stays empty)
      const hol = nextWorkday(today, 7);
      for (let off = -20; off <= 12; off++) {
        const date = addDays(today, off);
        if (isWeekend(date) || date === hol) continue;
        const n = off === 0 || off === 1 ? 9 : 2 + Math.floor(rnd() * 5);
        for (let k = 0; k < n; k++) {
          const sid = pick(students);
          if (taken[date + '|s' + sid]) continue;
          let slot = pick(slots), tries = 0;
          while ((taken[date + '|' + slot.start] || 0) >= config.defaultSlotCapacity - 1 && tries++ < 10) slot = pick(slots);
          const codes = [pick(docs).code]; if (rnd() < 0.25) { const c2 = pick(docs).code; if (c2 !== codes[0]) codes.push(c2); }
          let status;
          const slotPassed = off < 0 || (off === 0 && Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3)) + config.graceMinutes < d0.getHours() * 60 + d0.getMinutes());
          if (slotPassed) status = off < -config.rescheduleWindowDays ? pick(['released', 'released', 'released', 'released', 'noshow', 'cancelled', 'rejected']) : pick(['released', 'released', 'released', 'missed', 'cancelled']);
          else if (off <= 1) status = pick(['approved', 'ready', 'ready', 'processing', 'pending']);
          else status = pick(['pending', 'pending', 'approved', 'processing']);
          const opts = status === 'missed' ? { prev: 'ready', missedAt: iso(date, 17, 30) } : {};
          makeRequest(sid, date, slot, codes, status, opts);
        }
      }

      // a holiday and a notice
      repo.insertClosure({ date: hol, kind: 'closed', reason: 'Special non-working holiday', created_by: head, created_at: iso(today) });
      repo.insertAnnouncement({ title: 'Claiming hours for exam permits', body: 'Examination permits are released from 8 AM to 12 NN only this week. Bring your student ID.',
        kind: 'general', created_by: head, created_at: new Date(d0.getTime() - 26 * 36e5).toISOString(), expires_on: addDays(today, 6) });
    });
  }

  return { seed };
});
