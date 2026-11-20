/* ==========================================================================
   pages/registrar/signature.js — registrar name, title and signature for slips (#/r/settings)
   ========================================================================== */
(function () {
  'use strict';
  const { $, esc, ico, toast, busy, S, frame, defineRoute, signBlock } = App;

  /* ================================================================ signature settings */
  defineRoute('/r/settings', async () => {
    const main = frame('Slip signature');
    const st = await API.get('/api/settings');
    const head = S.user.role === 'head';
    main.innerHTML = `<div class="page narrow stack" style="--gap:1.25rem">
      <div class="page-head" style="margin-bottom:0"><div><h1>Registrar signature</h1><p>Printed on every payment slip and claim slip.</p></div></div>
      ${head ? '' : `<div class="note info">${ico('info')}<div>Only the head registrar can change this.</div></div>`}
      <section class="card stack">
        <div class="form-grid"><div class="field"><label for="sn">Registrar name</label><input class="input" id="sn" value="${esc(st.registrarName || '')}" ${head ? '' : 'disabled'}></div>
          <div class="field"><label for="stt">Title</label><input class="input" id="stt" value="${esc(st.registrarTitle || '')}" ${head ? '' : 'disabled'}></div></div>
        <div class="field"><span class="label">Signature</span>
          <span class="hint">${head ? 'Upload a photo or scan of the signature (dark ink on white paper works best), or sign inside the box with a mouse, finger or stylus.' : ''}</span>
          <canvas class="sigpad" id="sig" width="900" height="260" aria-label="Signature pad"></canvas></div>
        ${head ? `<div class="row between"><div class="row">
            <label class="btn btn-primary" for="sigFile" tabindex="0">${ico('upload')}Upload signature image</label><input type="file" id="sigFile" accept="image/png,image/jpeg,image/webp" class="sr-only">
            <button class="btn" id="sigClear">Clear</button></div>
          <button class="btn btn-accent" id="sigSave">Save signature</button></div>
          <p class="tiny muted">The white paper background is removed automatically so only the ink prints on slips.</p>` : ''}
      </section>
      <section><h2 class="section-title">How it looks on slips</h2><div class="slip"><div class="slip-body">${signBlock(st)}</div></div></section>
    </div>`;
    const cv = $('#sig'), ctx = cv.getContext('2d');
    let dirty = false, drawing = false;
    if (st.signature) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, cv.width, cv.height); im.src = st.signature; }
    if (!head) return;
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#13307a';
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
    cv.onpointerdown = (e) => { drawing = true; dirty = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); };
    cv.onpointermove = (e) => { if (!drawing) return; ctx.lineTo(...pos(e)); ctx.stroke(); };
    cv.onpointerup = cv.onpointercancel = () => { drawing = false; };
    $('#sigClear').onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); dirty = true; };
    const lbl = $('label[for=sigFile]');
    lbl.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#sigFile').click(); } };
    $('#sigFile').onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return toast('Choose a PNG, JPG or WEBP image.', 'error');
      const rd = new FileReader();
      rd.onload = () => {
        const im = new Image();
        im.onload = () => {
          // fit the image inside the pad, keep proportions
          const k = Math.min((cv.width - 40) / im.width, (cv.height - 30) / im.height);
          const w = im.width * k, h = im.height * k;
          ctx.clearRect(0, 0, cv.width, cv.height);
          ctx.drawImage(im, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
          // remove the paper: light pixels become transparent, ink stays
          const d = ctx.getImageData(0, 0, cv.width, cv.height), px = d.data;
          for (let i = 0; i < px.length; i += 4) {
            const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            if (lum > 185) px[i + 3] = 0; else if (lum > 140) px[i + 3] = Math.round(px[i + 3] * (185 - lum) / 45);
          }
          ctx.putImageData(d, 0, 0);
          ctx.strokeStyle = '#13307a';
          dirty = true; e.target.value = '';
          toast('Signature loaded. Check it, then tap Save signature.', 'success');
        };
        im.onerror = () => toast('That image could not be opened.', 'error');
        im.src = rd.result;
      };
      rd.readAsDataURL(file);
    };
    $('#sigSave').onclick = (e) => busy(e.currentTarget, async () => {
      const blank = !ctx.getImageData(0, 0, cv.width, cv.height).data.some((v, i) => i % 4 === 3 && v);
      await API.post('/api/settings', { registrarName: $('#sn').value, registrarTitle: $('#stt').value, signature: dirty ? (blank ? '' : cv.toDataURL('image/png')) : undefined });
      toast('Saved. New slips will use this signature.', 'success'); App.route();
    });
  }, { role: 'staff' });
})();
