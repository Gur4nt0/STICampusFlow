/* ==========================================================================
   pages/common/board.js — Claiming board page (#/board), mainly for phones
   ========================================================================== */
(function () {
  'use strict';
  const { $, ico, frame, defineRoute, renderBoard } = App;

  /* ================================================================ board page (mobile) */
  defineRoute('/board', () => {
    const main = frame('Claiming board');
    main.innerHTML = `<div class="page narrow"><div class="page-head"><div><h1>Claiming board</h1><p>Who is claiming and when, so you can plan your trip and avoid the crowd.</p></div>
      <button class="btn" id="refreshBoard">${ico('refresh')}Refresh</button></div><div id="boardFull"></div></div>`;
    renderBoard($('#boardFull'));
    $('#refreshBoard').onclick = () => renderBoard($('#boardFull'));
  });
})();
