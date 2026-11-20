/* ==========================================================================
   pages/registrar/email-setup.js — Gmail sending setup, head registrar only (#/r/email)
   ========================================================================== */
(function () {
  'use strict';
  const { $, esc, ico, toast, confirmBox, busy, S, frame, defineRoute } = App;

  /* ================================================================ email setup (Gmail, set up inside the app) */
  defineRoute('/r/email', async () => {
    const main = frame('Email setup');
    const head = S.user.role === 'head';
    let st = null;
    if (head) { try { st = await API.get('/api/admin/email'); } catch (e) { st = null; } }
    const draw = () => {
      main.innerHTML = `<div class="page narrow stack" style="--gap:1.25rem">
        <div class="page-head" style="margin-bottom:0"><div><h1>Email setup</h1><p>The Gmail account CampusFlow uses to send confirmation codes and notices.</p></div></div>
        ${!head ? `<div class="note info">${ico('info')}<div>Only the head registrar can change this.</div></div>` : !st ? `<div class="note warn">${ico('alert')}<div>This page needs the real CampusFlow server. It is not available in the preview.</div></div>` : `
        ${st.connected
          ? `<div class="note success">${ico('check')}<div><b>Connected.</b> Emails are sent from <b>${esc(st.user)}</b>.${st.switchedOff ? ' Email is switched off by the server setting EMAIL_NOTIFICATIONS=off.' : ''}</div></div>`
          : `<div class="note info">${ico('info')}<div><b>Not connected yet.</b> Confirmation codes are not being emailed. Connect a Gmail account below.</div></div>`}
        <section class="card stack">
          <h3>${st.connected ? 'Change the Gmail account' : 'Connect a Gmail account'}</h3>
          <ol class="small" style="margin:0;padding-left:1.2rem;line-height:1.7">
            <li>Open the Gmail account you want to send from and turn on <b>2-Step Verification</b> (Google Account, Security).</li>
            <li>Open <a class="link-btn" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">Google App passwords</a>, create one named <b>CampusFlow</b>, and copy the 16-letter code.</li>
            <li>Type the Gmail address and paste the code below. CampusFlow sends a test email first and only saves it if it works.</li>
          </ol>
          <form class="stack" id="mailForm" novalidate style="--gap:.8rem">
            <div class="field"><label for="gm1">Gmail address</label><input class="input" id="gm1" type="email" autocomplete="off" placeholder="yourname@gmail.com" value="${esc(st.user)}" required></div>
            <div class="field"><label for="gm2">App Password</label><input class="input" id="gm2" type="password" autocomplete="new-password" placeholder="abcd efgh ijkl mnop" required>
              <span class="hint">This is the 16-letter App Password from Google, not your normal Gmail password. Spaces are fine.</span></div>
            <div id="mailMsg" role="status"></div>
            <div class="row"><button class="btn btn-primary" type="submit">Save and send test email</button></div>
          </form>
        </section>
        ${st.connected ? `<section class="card stack"><h3>Check it again</h3>
          <p class="small muted">Sends a test email using the saved account.</p>
          <div class="row" style="gap:.5rem"><input class="input" id="gmTo" type="email" value="${esc(st.user)}" style="flex:1 1 220px" aria-label="Send the test to">
            <button class="btn" id="mailTest">Send test email</button>
            ${st.source === 'app' ? '<button class="btn btn-danger" id="mailOff">Disconnect</button>' : ''}</div></section>` : ''}
        <p class="tiny muted">The App Password is stored encrypted on the server and is never shown again. You can revoke it any time in your Google account.</p>`}
      </div>`;
      if (!head || !st) return;
      const msg = (ok, text) => { $('#mailMsg').innerHTML = `<div class="note ${ok ? 'success' : 'danger'}">${ico(ok ? 'check' : 'alert')}<div>${esc(text)}</div></div>`; };
      const done = (r) => { st = r; S.cfg = Object.assign({}, S.cfg, { emailNotifications: r.connected && !r.switchedOff }); };
      $('#mailForm').onsubmit = (e) => {
        e.preventDefault();
        busy(e.currentTarget.querySelector('button[type=submit]'), async () => {
          try {
            const r = await API.post('/api/admin/email', { user: $('#gm1').value, appPassword: $('#gm2').value });
            if (!r.ok) return msg(false, r.error);
            done(r); toast('Gmail connected. Check ' + r.sentTo + ' for the test email.', 'success'); draw();
          } catch (err) { msg(false, err.message); }
        });
      };
      const t = $('#mailTest');
      if (t) t.onclick = () => busy(t, async () => {
        try {
          const r = await API.post('/api/admin/email/test', { to: $('#gmTo').value });
          if (r.ok) toast('Test email sent to ' + r.sentTo + '. Check the inbox and Spam.', 'success'); else toast(r.error, 'error');
        } catch (err) { toast(err.message, 'error'); }
      });
      const off = $('#mailOff');
      if (off) off.onclick = async () => {
        if (!(await confirmBox({ title: 'Disconnect Gmail?', body: 'CampusFlow will stop emailing codes and notices until you connect an account again.', ok: 'Disconnect', danger: true }))) return;
        busy(off, async () => { done(await API.del('/api/admin/email')); draw(); });
      };
    };
    draw();
  }, { role: 'staff' });
})();
