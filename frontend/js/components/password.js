/* ==========================================================================
   components/password.js — password field helpers, applied automatically:
   • every <input type="password"> gets a show/hide (eye) button
   • add  data-strength            → shows a Weak / Fair / Strong / Very strong meter
   • add  data-match="#otherInput" → shows whether the two passwords match
   ========================================================================== */
(function () {
  'use strict';
  const { $, $$, ico, S } = App;

  const COMMON = ['password', 'password1', 'password123', '12345678', '123456789', 'qwerty123', 'student123', 'campusflow', 'iloveyou', 'abc12345', 'sti12345', 'admin123', 'letmein1'];
  const LEVELS = [
    { key: 'weak', label: 'Weak' },
    { key: 'fair', label: 'Fair' },
    { key: 'strong', label: 'Strong' },
    { key: 'very-strong', label: 'Very strong' },
  ];

  /* Scores a password from 0 (weak) to 3 (very strong).
     It mirrors the server rules: below the minimum length, or without both a
     letter and a number, the password is always "Weak" because it will be refused. */
  function strength(pw) {
    const min = (S.cfg && S.cfg.minPasswordLength) || 8;
    const tips = [];
    if (pw.length < min) tips.push(`at least ${min} characters`);
    if (!/[A-Za-z]/.test(pw)) tips.push('a letter');
    if (!/[0-9]/.test(pw)) tips.push('a number');
    if (COMMON.includes(pw.toLowerCase())) return { level: 0, tip: 'That password is too common. Pick something else.' };
    if (tips.length) return { level: 0, tip: 'Add ' + tips.join(', ') + '.' };

    const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
    let pts = kinds;                         // 2 to 4
    if (pw.length >= 12) pts++;
    if (pw.length >= 16) pts++;
    if (/(.)\1\1/.test(pw)) pts--;           // aaa, 111
    if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/i.test(pw)) pts--;
    const level = pts <= 2 ? 1 : pts <= 4 ? 2 : 3;
    const tip = level === 3 ? 'Great password.'
      : level === 2 ? (pw.length < 12 ? 'Make it 12+ characters for a very strong password.' : 'Add a symbol like ! or # for a very strong password.')
      : 'Mix UPPER and lower case, and add a symbol like ! or #.';
    return { level, tip };
  }

  function drawMeter(input) {
    const box = input.closest('.field') || input.parentElement;
    let m = $('.pw-meter', box);
    if (!m) {
      m = document.createElement('div');
      m.className = 'pw-meter';
      m.setAttribute('aria-live', 'polite');
      m.innerHTML = '<div class="pw-bars"><i></i><i></i><i></i><i></i></div><div class="pw-text"><b></b><span></span></div>';
      input.closest('.pw-wrap').insertAdjacentElement('afterend', m);
    }
    const v = input.value;
    if (!v) { m.hidden = true; return; }
    m.hidden = false;
    const s = strength(v);
    m.dataset.level = LEVELS[s.level].key;
    $$('.pw-bars i', m).forEach((bar, i) => bar.classList.toggle('on', i <= s.level));
    $('.pw-text b', m).textContent = 'Password strength: ' + LEVELS[s.level].label;
    $('.pw-text span', m).textContent = s.tip;
  }

  function drawMatch(input) {
    const other = document.querySelector(input.dataset.match);
    const box = input.closest('.field') || input.parentElement;
    let m = $('.pw-match', box);
    if (!m) { m = document.createElement('div'); m.className = 'pw-match'; m.setAttribute('aria-live', 'polite'); input.closest('.pw-wrap').insertAdjacentElement('afterend', m); }
    if (!input.value || !other) { m.hidden = true; return; }
    const same = input.value === other.value;
    m.hidden = false;
    m.className = 'pw-match ' + (same ? 'ok' : 'bad');
    m.innerHTML = `${ico(same ? 'check' : 'x')}<span>${same ? 'Passwords match' : 'Passwords do not match yet'}</span>`;
  }

  /* Wraps one password input with the eye button (runs once per input). */
  function enhance(input) {
    if (input.dataset.pw) return;
    input.dataset.pw = '1';
    const wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';
    btn.setAttribute('aria-label', 'Show password');
    btn.title = 'Show password';
    btn.innerHTML = ico('eye');
    btn.onclick = () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = ico(show ? 'eyeOff' : 'eye');
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.title = show ? 'Hide password' : 'Show password';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      input.focus();
      const end = input.value.length; try { input.setSelectionRange(end, end); } catch (e) { /* ignore */ }
    };
    wrap.appendChild(btn);

    if (input.hasAttribute('data-strength')) input.addEventListener('input', () => drawMeter(input));
    if (input.dataset.match) {
      input.addEventListener('input', () => drawMatch(input));
      const other = document.querySelector(input.dataset.match);
      if (other) other.addEventListener('input', () => drawMatch(input));
    }
    // When a form is reset after saving, hide the meters again.
    if (input.form) input.form.addEventListener('reset', () => setTimeout(() => {
      input.type = 'password'; btn.innerHTML = ico('eye');
      $$('.pw-meter, .pw-match', input.form).forEach((x) => (x.hidden = true));
    }));
  }

  function scan(root) { $$('input[type=password]', root).forEach(enhance); }

  // Apply to every password field the app draws, including ones inside dialogs.
  new MutationObserver((list) => {
    for (const rec of list) for (const n of rec.addedNodes) if (n.nodeType === 1) {
      if (n.matches && n.matches('input[type=password]')) enhance(n); else scan(n);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => scan(document));

  Object.assign(App, { passwordStrength: strength });
})();
