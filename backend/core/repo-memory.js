/* ==========================================================================
   In-memory repository — same functions as repo-sqlite.js, backed by plain
   arrays. Used only by the live preview (runs fully inside the browser) and
   by the automated tests. The real system uses SQLite.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CampusMemoryRepo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TABLES = ['users', 'document_types', 'requests', 'request_items', 'status_history', 'closures', 'capacity_overrides', 'notifications', 'announcements'];

  function createMemoryRepo(initial, onChange) {
    let S = initial || null;
    if (!S) { S = { seq: {}, settings: {} }; TABLES.forEach((t) => (S[t] = [])); }
    const changed = () => onChange && onChange(S);
    const insert = (t, row) => { S.seq[t] = (S.seq[t] || 0) + 1; const r = Object.assign({ id: S.seq[t] }, row); S[t].push(r); changed(); return r.id; };
    const copy = (r) => (r ? Object.assign({}, r) : null);
    const user = (id) => S.users.find((u) => u.id === id);
    const doc = (id) => S.document_types.find((d) => d.id === id);
    const joinReq = (r) => { const u = user(r.student_id) || {}; return Object.assign({}, r, { full_name: u.full_name, login_id: u.login_id, program: u.program, year_level: u.year_level, email: u.email }); };
    const joinItem = (i) => { const d = doc(i.doc_type_id) || {}; return Object.assign({}, i, { code: d.code, name: d.name, category: d.category, processing_days: d.processing_days, _sort: d.sort_order }); };
    const bySlot = (a, b) => (a.appt_date + a.slot_start).localeCompare(b.appt_date + b.slot_start);
    let depth = 0;

    return {
      state: () => S,
      tx(fn) {
        if (depth > 0) return fn();
        const snap = JSON.stringify(S);
        depth++;
        try { return fn(); } catch (e) { S = JSON.parse(snap); throw e; } finally { depth--; changed(); }
      },
      isEmpty: () => S.users.length === 0,

      getUserByLogin: (id) => copy(S.users.find((u) => u.login_id === id)),
      getUser: (id) => copy(user(id)),
      getUserByEmail: (e) => copy(S.users.find((u) => (u.email || '').toLowerCase() === String(e).toLowerCase())),
      insertUser: (u) => insert('users', u),
      updateUser(id, patch) { const u = user(id); if (u) Object.assign(u, patch); changed(); },

      listDocTypes: () => S.document_types.filter((d) => d.is_active).sort((a, b) => a.sort_order - b.sort_order).map(copy),
      getDocType: (id) => copy(doc(id)),
      insertDocType: (d) => insert('document_types', d),

      insertRequest: (r) => insert('requests', r),
      insertItem: (i) => insert('request_items', i),
      getRequest: (id) => { const r = S.requests.find((x) => x.id === id); return r ? joinReq(r) : null; },
      getRequestByRef: (ref) => copy(S.requests.find((x) => x.ref_code === ref)),
      getItems: (id) => S.request_items.filter((i) => i.request_id === id).map(joinItem).sort((a, b) => a._sort - b._sort),
      itemsFor: (ids) => S.request_items.filter((i) => ids.includes(i.request_id)).map(joinItem).sort((a, b) => a._sort - b._sort),
      updateRequest(id, patch) { const r = S.requests.find((x) => x.id === id); if (r) Object.assign(r, patch); changed(); },
      queryRequests(f) {
        let rows = S.requests.map(joinReq);
        if (f.studentId) rows = rows.filter((r) => r.student_id === f.studentId);
        if (f.statuses) rows = rows.filter((r) => f.statuses.includes(r.status));
        if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter((r) => [r.ref_code, r.full_name, r.login_id].some((v) => String(v).toLowerCase().includes(q))); }
        if (f.date) rows = rows.filter((r) => r.appt_date === f.date);
        if (f.from) rows = rows.filter((r) => r.appt_date >= f.from);
        if (f.to) rows = rows.filter((r) => r.appt_date <= f.to);
        if (f.payment) rows = rows.filter((r) => r.payment_status === f.payment);
        rows.sort(f.sort === 'created' ? (a, b) => b.created_at.localeCompare(a.created_at) : bySlot);
        return { rows: rows.slice(f.offset, f.offset + f.limit), total: rows.length };
      },
      bookedCounts(date, ex, st) {
        const m = {};
        for (const r of S.requests) if (r.appt_date === date && r.id !== ex && st.includes(r.status)) m[r.slot_start] = (m[r.slot_start] || 0) + 1;
        return Object.keys(m).map((k) => ({ slot_start: k, n: m[k] }));
      },
      bookedCountsRange(from, to, st) {
        const m = {};
        for (const r of S.requests) if (r.appt_date >= from && r.appt_date <= to && st.includes(r.status)) { const k = r.appt_date + '|' + r.slot_start; m[k] = (m[k] || 0) + 1; }
        return Object.keys(m).map((k) => ({ appt_date: k.split('|')[0], slot_start: k.split('|')[1], n: m[k] }));
      },
      countOpenForStudent: (sid, st) => S.requests.filter((r) => r.student_id === sid && st.includes(r.status)).length,
      studentBookingOn: (sid, date, st, ex) => copy(S.requests.find((r) => r.student_id === sid && r.appt_date === date && r.id !== ex && st.includes(r.status))),
      requestsOnDate: (date, st) => S.requests.filter((r) => r.appt_date === date && st.includes(r.status)).map(joinReq)
        .sort((a, b) => a.slot_start.localeCompare(b.slot_start) || String(a.full_name).localeCompare(b.full_name)),
      requestsForTick: (max, st) => S.requests.filter((r) => r.appt_date <= max && st.includes(r.status)).map(copy),

      addHistory: (h) => insert('status_history', h),
      listHistory: (id) => S.status_history.filter((h) => h.request_id === id).sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id)
        .map((h) => Object.assign({}, h, { by_name: (user(h.by_user_id) || {}).full_name })),

      dashboardRaw({ today, weekStart, monthStart, since30 }) {
        const byStatus = {};
        for (const r of S.requests) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        const live = ['pending', 'approved', 'processing', 'ready', 'released'];
        const tally = {};
        for (const i of S.request_items) {
          const r = S.requests.find((x) => x.id === i.request_id);
          if (!r || r.created_at.slice(0, 10) < since30 || ['cancelled', 'rejected'].includes(r.status)) continue;
          tally[i.doc_type_id] = (tally[i.doc_type_id] || 0) + i.copies;
        }
        const reqById = {}; S.requests.forEach((r) => (reqById[r.id] = r));
        return {
          byStatus,
          paymentsToCheck: S.requests.filter((r) => r.payment_status === 'submitted' && !['cancelled', 'rejected', 'noshow'].includes(r.status)).length,
          todayTotal: S.requests.filter((r) => r.appt_date === today && live.includes(r.status)).length,
          releasedWeek: S.requests.filter((r) => r.status === 'released' && (r.released_at || '').slice(0, 10) >= weekStart).length,
          feesMonth: S.requests.filter((r) => r.payment_status === 'verified' && r.updated_at.slice(0, 10) >= monthStart).reduce((a, r) => a + r.total_fee, 0),
          topDocs: Object.keys(tally).map((id) => ({ name: doc(+id).name, code: doc(+id).code, copies: tally[id] })).sort((a, b) => b.copies - a.copies).slice(0, 5),
          activity: S.status_history.slice().sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id).slice(0, 12).map((h) => {
            const r = reqById[h.request_id] || {};
            return Object.assign({}, h, { ref_code: r.ref_code, student_name: (user(r.student_id) || {}).full_name, by_name: (user(h.by_user_id) || {}).full_name });
          }),
        };
      },

      listClosures: (from, to) => S.closures.filter((c) => c.date >= from && c.date <= to).sort((a, b) => a.date.localeCompare(b.date)).map(copy),
      getClosure: (date) => copy(S.closures.find((c) => c.date === date)),
      insertClosure: (c) => insert('closures', c),
      deleteClosure(id) { S.closures = S.closures.filter((c) => c.id !== id); changed(); },
      getCapacityMap: (from, to) => S.capacity_overrides.filter((c) => c.date >= from && c.date <= to).map(copy),
      setCapacity(date, cap) {
        S.capacity_overrides = S.capacity_overrides.filter((c) => c.date !== date);
        if (cap !== null) S.capacity_overrides.push({ date, capacity: cap });
        changed();
      },

      insertNotification: (n) => insert('notifications', n),
      listNotifications: (uid, limit) => S.notifications.filter((n) => n.user_id === uid).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, limit).map(copy),
      unreadCount: (uid) => S.notifications.filter((n) => n.user_id === uid && !n.is_read).length,
      markRead(uid, id) { S.notifications.forEach((n) => { if (n.user_id === uid && (!id || n.id === id)) n.is_read = 1; }); changed(); },

      listAnnouncements: (today) => S.announcements.filter((a) => !a.expires_on || a.expires_on >= today).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8).map(copy),
      insertAnnouncement: (a) => insert('announcements', a),
      deleteAnnouncement(id) { S.announcements = S.announcements.filter((a) => a.id !== id); changed(); },

      getSettings: () => Object.assign({}, S.settings),
      setSetting(k, v) { S.settings[k] = v; changed(); },
    };
  }
  return { createMemoryRepo };
});
