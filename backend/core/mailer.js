/* ==========================================================================
   STI CampusFlow — Gmail delivery
   Every notification a student sees in the app is also sent to their school
   email. Written with Node's own TLS support, so there is nothing to install.
   It talks to smtp.gmail.com on port 465 and signs in with the App Password
   from config.js. The Gmail account's real password is never used.
   ========================================================================== */
const tls = require('node:tls');
const crypto = require('node:crypto');

const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* The look of the email: same navy and yellow as the site. */
function wrap({ officeName, campusName, title, body, linkUrl, linkLabel }) {
  return `<!doctype html><html><body style="margin:0;background:#EEF2F8;padding:22px 12px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
   <table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #D8E0EC;border-radius:14px;overflow:hidden">
    <tr><td style="background:#0B2E5B;padding:16px 22px">
      <span style="color:#FFC53D;font-weight:700;font-size:15px;letter-spacing:.3px">CampusFlow</span>
      <span style="color:#C4D2EA;font-size:12px"> &nbsp;${esc(officeName)}${campusName ? ', ' + esc(campusName) : ''}</span>
    </td></tr>
    <tr><td style="padding:22px">
      <h1 style="margin:0 0 10px;font-size:18px;color:#0E1B2A">${esc(title)}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#2B3A4B">${esc(body)}</p>
      ${linkUrl ? `<p style="margin:20px 0 0"><a href="${esc(linkUrl)}" style="background:#0B2E5B;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;display:inline-block;font-weight:600;font-size:14px">${esc(linkLabel || 'Open CampusFlow')}</a></p>` : ''}
    </td></tr>
    <tr><td style="padding:13px 22px;background:#F6F8FC;color:#64748B;font-size:12px;line-height:1.5">
      Sent automatically by CampusFlow. The Registrar will never ask for your password by email.
    </td></tr>
   </table></td></tr></table></body></html>`;
}

/* One SMTP conversation: greet, sign in, hand over the message, quit. */
function sendSmtp({ user, pass, fromName, to, subject, text, html }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(465, 'smtp.gmail.com', { servername: 'smtp.gmail.com' });
    const boundary = 'cf' + crypto.randomBytes(8).toString('hex');
    const headerDate = new Date().toUTCString();
    const message = [
      `From: "${fromName}" <${user}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${headerDate}`,
      `Message-ID: <${crypto.randomUUID()}@campusflow>`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', '', text,
      `--${boundary}`, 'Content-Type: text/html; charset=utf-8', '', html,
      `--${boundary}--`, '',
    ].join('\r\n');

    const steps = [
      'EHLO campusflow',
      'AUTH LOGIN',
      Buffer.from(user).toString('base64'),
      Buffer.from(pass).toString('base64'),
      `MAIL FROM:<${user}>`,
      `RCPT TO:<${to}>`,
      'DATA',
      message.replace(/\r\n\./g, '\r\n..') + '\r\n.',
      'QUIT',
    ];

    let step = -1, buffer = '', finished = false;
    const done = (err, val) => { if (finished) return; finished = true; socket.destroy(); err ? reject(err) : resolve(val); };
    socket.setTimeout(20000, () => done(new Error('Gmail did not answer in time.')));
    socket.on('error', done);
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      if (!/\r\n$/.test(buffer)) return;
      const lines = buffer.trim().split('\r\n');
      const last = lines[lines.length - 1];
      if (/^\d{3}-/.test(last)) return;           // reply continues on the next line
      const code = Number(last.slice(0, 3));
      buffer = '';
      if (code >= 400) return done(new Error('Gmail refused the message: ' + last));
      step += 1;
      if (step >= steps.length) return done(null, 'sent');
      socket.write(steps[step] + '\r\n');
    });
  });
}

function createMailer(config) {
  const on = () => config.emailNotifications !== false && !!(config.gmail && config.gmail.user && config.gmail.appPassword);
  const mode = () => (config.emailNotifications === false ? 'off' : on() ? 'gmail' : 'console');

  /* Sending never blocks the page: if Gmail is slow or down, the student still
     sees the notification in the app and the error is only logged here. */
  function send({ to, name, title, body, linkPath }) {
    if (config.emailNotifications === false) return Promise.resolve('off');
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) return Promise.resolve('no-address');
    const greeting = name ? `Hi ${String(name).split(' ')[0]}, ` : '';
    const text = greeting + body;
    const linkUrl = config.publicUrl ? config.publicUrl + (linkPath || '/#/home') : '';
    const html = wrap({ officeName: config.officeName, campusName: config.campusName, title, body: text, linkUrl, linkLabel: 'Open CampusFlow' });

    if (!on()) {
      console.log(`\n  [email not sent — Gmail is not set up yet]\n  To:      ${to}\n  Subject: ${title}\n  ${text}\n`);
      return Promise.resolve('console');
    }
    return sendSmtp({
      user: String(config.gmail.user).trim(), pass: String(config.gmail.appPassword).replace(/\s+/g, ''),
      fromName: config.gmail.fromName || 'CampusFlow', to, subject: title, text, html,
    }).catch((err) => { console.error(`  [email] could not send to ${to}: ${err.message}`); return 'failed'; });
  }

  /* Used by the in-app Email setup page: tries the given Gmail + App Password
     and says in plain words what went wrong, instead of only logging it. */
  function friendly(msg) {
    if (/535|not accepted|BadCredentials|Application-specific|5\.7\.8/i.test(msg)) return 'Gmail did not accept that sign-in. Check the Gmail address and the 16-character App Password, and make sure 2-Step Verification is turned on for that Gmail.';
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|did not answer/i.test(msg)) return 'This computer could not reach Gmail. Check the internet connection. Some school Wi-Fi networks block email, so try a phone hotspot.';
    return msg;
  }
  async function test({ user, pass, to }) {
    const title = 'CampusFlow test email';
    const text = 'Gmail is connected. CampusFlow confirmation codes and notices will now be sent from this account.';
    const html = wrap({ officeName: config.officeName, campusName: config.campusName, title, body: text });
    try {
      await sendSmtp({ user: String(user).trim(), pass: String(pass).replace(/\s+/g, ''), fromName: (config.gmail && config.gmail.fromName) || 'CampusFlow', to, subject: title, text, html });
      return { ok: true };
    } catch (err) { return { ok: false, error: friendly(err.message) }; }
  }

  return { send, mode, enabled: on, test };
}

module.exports = { createMailer };
