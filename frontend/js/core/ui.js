/* ==========================================================================
   core/ui.js — toasts, modal dialogs, confirm box, busy buttons, light/dark theme
   ========================================================================== */
(function () {
  'use strict';
  const { $, esc, ico, store } = App;

  /* ---------- toasts */
  function toast(msg, kind = '') {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = `${ico(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info')}<div>${esc(msg)}</div>`;
    box.appendChild(t);
    setTimeout(() => t.remove(), kind === 'error' ? 6000 : 4000);
  }

  /* ---------- modal: returns { el, close } */
  function modal(html, { wide = false, onClose = null, focus = null } = {}) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(back);
    const opener = document.activeElement;
    const close = () => {
      back.remove(); document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
      if (opener && opener.isConnected && opener.focus) opener.focus();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    const first = focus ? back.querySelector(focus) : back.querySelector('input, textarea, select, button:not([data-close])');
    if (first) setTimeout(() => first.focus(), 30);
    return { el: back.firstElementChild, close };
  }

  /* ---------- "Are you sure?" box. Resolves true only when the main button is pressed. */
  function confirmBox({ title, body, ok = 'Confirm', cancel = 'Go back', danger = false, icon = '' }) {
    return new Promise((resolve) => {
      let answer = false;
      const m = modal(`<div class="confirm ${danger ? 'danger' : ''}">
          ${icon ? `<span class="confirm-ic">${ico(icon)}</span>` : ''}
          <h2>${esc(title)}</h2><p class="muted" style="margin-top:.5rem">${body}</p></div>
        <div class="modal-foot"><button class="btn" data-close>${esc(cancel)}</button><button class="btn ${danger ? 'btn-danger solid' : 'btn-primary'}" data-ok>${esc(ok)}</button></div>`,
      { onClose: () => resolve(answer), focus: '[data-close]' });
      m.el.classList.add('small-modal');
      m.el.querySelector('[data-ok]').onclick = () => { answer = true; m.close(); };
    });
  }

  /* ---------- disables a button while an async job runs; shows errors as toasts */
  async function busy(btn, fn) {
    if (btn) { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.innerHTML = 'Please wait…'; }
    try { return await fn(); }
    catch (e) { toast(e.message, 'error'); if (e.status === 401) App.go('/login'); return undefined; }
    finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = btn.dataset.label; } }
  }

  /* ---------- theme (feedback: dark mode) */
  function applyTheme(pref) {
    const root = document.documentElement;
    if (pref === 'light' || pref === 'dark') root.dataset.theme = pref; else delete root.dataset.theme;
  }
  const effectiveTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  function renderThemeBtn() { const b = $('#themeBtn'); if (b) { b.innerHTML = ico(effectiveTheme() === 'dark' ? 'sun' : 'moon'); b.title = effectiveTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'; } }
  function toggleTheme() { const next = effectiveTheme() === 'dark' ? 'light' : 'dark'; store('cf_theme', next); applyTheme(next); renderThemeBtn(); }
  applyTheme(store('cf_theme'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderThemeBtn);

  Object.assign(App, { toast, modal, confirmBox, busy, applyTheme, effectiveTheme, renderThemeBtn, toggleTheme });
})();
