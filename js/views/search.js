/* =========================================================
   views/search.js - volunteer-facing read-only search demo.
   Scope limits are deliberate: roll information only.
   No support classification, no payments, no per-voter
   attendance tracking is modelled or stored anywhere here.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};
  App.views = App.views || {};

  var query = '';
  var partFilter = 'all';

  App.views.search = {
    titleKey: 'nav.search',

    render: function (root) {
      var U = App.ui, t = U.t, S = App.state.get();
      var lang = App.i18n.get();

      var parts = [{ value: 'all', label: t('common.all') }].concat(
        S.election.parts.map(function (p) { return { value: p.id, label: p.name }; })
      );

      var html = '<div class="stack">';

      html += '<div class="notice notice-warn"><div><b>' + U.esc(t('search.demoBanner')) + '</b><br>'
        + U.esc(t('search.demoBannerBody')) + '</div></div>';

      html += '<div class="card">'
        + '<div class="card-head"><div><h2>' + U.esc(t('search.title')) + '</h2>'
        + '<p class="card-sub">' + U.esc(t('search.hint')) + '</p></div>'
        + '<span class="badge badge-demo">' + U.esc(t('common.demo')) + '</span></div>'
        + '<div class="search-wrap">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2a8 8 0 1 1-4.9 14.3l-3 3-1.4-1.4 3-3A8 8 0 0 1 10 2zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"/></svg>'
        + '<input id="voterQuery" type="search" inputmode="search" autocomplete="off" enterkeyhint="search"'
        + ' aria-label="' + U.esc(t('search.placeholder')) + '"'
        + ' placeholder="' + U.esc(t('search.placeholder')) + '" value="' + U.esc(query) + '">'
        + '</div>'
        + '<div style="height:10px"></div>'
        + '<div class="seg" role="group" aria-label="' + U.esc(t('common.part')) + '">'
        + parts.map(function (p) {
          return '<button type="button" data-part="' + U.esc(p.value) + '"'
            + (partFilter === p.value ? ' class="is-active"' : '') + '>' + U.esc(p.label) + '</button>';
        }).join('')
        + '</div>'
        + '<div style="height:10px"></div>'
        + '<div class="btn-grid">'
        + '<button class="btn btn-ghost" id="clearSearch">' + U.esc(t('search.clearAll')) + '</button>'
        + '<button class="btn btn-primary" id="runSearch">' + U.esc(t('search.go')) + '</button>'
        + '</div>'
        + '</div>';

      html += '<div id="searchResults"></div>';

      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('search.readonly')) + '</h2></div>'
        + '<p style="font-size:12.5px;color:var(--ink-3)">' + U.esc(t('search.scope')) + '</p></div>';

      html += '</div>';
      root.innerHTML = html;

      var input = root.querySelector('#voterQuery');
      var resultsEl = root.querySelector('#searchResults');

      function draw() {
        var results = App.demoVoters.search(query, { part: partFilter, limit: 30 });
        if (query.trim().length < 2) {
          resultsEl.innerHTML = U.empty(t('search.start'), t('search.startSub'));
          return;
        }
        if (!results.length) {
          resultsEl.innerHTML = U.empty(t('search.noResults'), t('search.noResultsSub'));
          return;
        }
        var out = '<div class="card"><div class="card-head"><h2>'
          + U.esc(t('search.resultsCount', { n: results.length })) + '</h2>'
          + '<span class="badge badge-demo">' + U.esc(t('common.demo')) + '</span></div><div class="list">';
        results.forEach(function (r) {
          var shown = lang === 'te' && r.nameTe ? r.nameTe : r.name;
          var secondary = lang === 'te' && r.nameTe ? r.name : r.nameTe;
          out += '<div class="list-item"><div class="li-main">'
            + '<div class="li-title">' + U.esc(shown) + '</div>'
            + (secondary ? '<div class="li-meta">' + U.esc(secondary) + '</div>' : '')
            + '<div class="li-meta">' + U.esc(t('search.serial')) + ' <b>' + U.esc(r.serial) + '</b>'
            + ' · ' + U.esc(t('common.part')) + ' <b>' + U.esc(r.part) + '</b>'
            + ' · ' + (r.wardVerified
              ? U.esc(t('search.ward')) + ' <b>' + U.esc(r.ward) + '</b>'
              : '<span style="color:var(--warn)">' + U.esc(t('search.wardUnverified')) + '</span>')
            + '</div></div>'
            + '<span class="badge badge-demo">' + U.esc(t('common.demo')) + '</span>'
            + '</div>';
        });
        out += '</div></div>';
        resultsEl.innerHTML = out;
      }

      var debounce = null;
      input.addEventListener('input', function () {
        query = input.value;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(draw, 120);
      });
      input.addEventListener('search', function () { query = input.value; draw(); });
      input.form && input.form.addEventListener('submit', function (e) { e.preventDefault(); });

      root.querySelector('#runSearch').addEventListener('click', function () {
        query = input.value; draw(); input.blur();
      });
      root.querySelector('#clearSearch').addEventListener('click', function () {
        query = ''; partFilter = 'all'; input.value = '';
        App.views.search.render(root);
      });
      root.querySelectorAll('[data-part]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          partFilter = btn.getAttribute('data-part');
          root.querySelectorAll('[data-part]').forEach(function (b) { b.classList.remove('is-active'); });
          btn.classList.add('is-active');
          draw();
        });
      });

      draw();
    }
  };
})(window);
