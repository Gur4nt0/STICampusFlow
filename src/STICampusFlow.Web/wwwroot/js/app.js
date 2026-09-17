/* ==========================================================================
   STI CampusFlow — shared client-side behaviour
   Page-specific scripts live in each view's Scripts section.
   ========================================================================== */
(function () {
    'use strict';

    // ----------------------------------------------------------------
    // Bulk selection in the registrar queue
    // ----------------------------------------------------------------
    var checkAll = document.getElementById('checkAll');
    var bulkBtn = document.getElementById('bulkBtn');

    function rowChecks() {
        return Array.prototype.slice.call(document.querySelectorAll('.row-check'));
    }

    function syncBulk() {
        if (!bulkBtn) return;

        var checked = rowChecks().filter(function (c) { return c.checked; });
        bulkBtn.disabled = checked.length === 0;
        bulkBtn.textContent = checked.length === 0
            ? 'Approve selected'
            : 'Approve ' + checked.length + ' selected';

        if (checkAll) {
            var all = rowChecks();
            checkAll.checked = all.length > 0 && checked.length === all.length;
            checkAll.indeterminate = checked.length > 0 && checked.length < all.length;
        }
    }

    if (checkAll) {
        checkAll.addEventListener('change', function () {
            rowChecks().forEach(function (c) { c.checked = checkAll.checked; });
            syncBulk();
        });
    }

    rowChecks().forEach(function (c) { c.addEventListener('change', syncBulk); });
    syncBulk();

    // ----------------------------------------------------------------
    // Close the notification dropdown when clicking elsewhere
    // ----------------------------------------------------------------
    document.addEventListener('click', function (e) {
        document.querySelectorAll('details.notif[open]').forEach(function (d) {
            if (!d.contains(e.target)) d.removeAttribute('open');
        });
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('details.notif[open]').forEach(function (d) {
            d.removeAttribute('open');
        });
    });

    // ----------------------------------------------------------------
    // Auto-dismiss flash messages
    // ----------------------------------------------------------------
    var flash = document.querySelector('.flash');
    if (flash) {
        setTimeout(function () {
            flash.style.transition = 'opacity .4s ease, transform .4s ease';
            flash.style.opacity = '0';
            flash.style.transform = 'translateY(-6px)';
            setTimeout(function () { flash.remove(); }, 420);
        }, 6000);
    }

    // ----------------------------------------------------------------
    // Guard against double submits (a second click would otherwise
    // create a duplicate booking while the first POST is in flight)
    // ----------------------------------------------------------------
    document.querySelectorAll('form').forEach(function (form) {
        form.addEventListener('submit', function () {
            var button = form.querySelector('button[type="submit"]');
            if (!button || button.disabled) return;

            setTimeout(function () {
                button.disabled = true;
                button.dataset.originalText = button.textContent;
                button.textContent = 'Working…';
            }, 0);
        });
    });
})();
