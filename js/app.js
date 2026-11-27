/* =========================================================
   app.js - boot, router, mode/theme/language control.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  var ROUTES = ['dashboard', 'search', 'turnout', 'analytics', 'results', 'expenses', 'settings'];
  var current = 'dashboard';
  var rendering = false;

  function rootEl() { return document.getElementById('screenRoot'); }

  function renderCurrent(scrollTop) {
    var view = App.views[current];
    if (!view) return;
    rendering = true;
    var root = rootEl();
    try {
      view.render(root);
    } catch (e) {
      root.innerHTML = '<div class="notice notice-danger"><div><b>Render error</b><br>'
        + App.charts.esc(e && e.message ? e.message : String(e)) + '</div></div>';
      if (global.console) console.error(e);
    }
    rendering = false;
    document.getElementById('screenTitle').textContent =
      App.i18n.t(typeof view.titleKeyFor === 'function' ? view.titleKeyFor() : view.titleKey);
    if (scrollTop) global.scrollTo(0, 0);
    syncChrome();
  }

  function syncNav() {
    var items = document.querySelectorAll('.nav-item');
    for (var i = 0; i < items.length; i++) {
      var active = items[i].getAttribute('data-route') === current;
      items[i].classList.toggle('is-active', active);
      items[i].setAttribute('aria-current', active ? 'page' : 'false');
    }
  }

  function syncChrome() {
    var S = App.state.get(), t = App.i18n.t;
    var isAdmin = S.settings.mode === 'admin';
    var chip = document.getElementById('modeChip');
    chip.textContent = t(isAdmin ? 'mode.admin' : 'mode.volunteer');
    chip.className = 'chip ' + (isAdmin ? 'chip-admin' : 'chip-mode');
    document.getElementById('storageChip').textContent = App.db.engine();
    var upd = document.getElementById('updatedChip');
    upd.textContent = App.ui.fmtDateTime(S.updatedAt);
    upd.setAttribute('title', t('common.lastUpdated'));
    document.getElementById('langBtnLabel').textContent = App.i18n.get() === 'en' ? 'తె' : 'EN';
    document.getElementById('modeBtn').setAttribute('title',
      t(isAdmin ? 'mode.switchToVolunteer' : 'mode.switchToAdmin'));
    syncNav();
  }

  App.router = {
    go: function (route) {
      if (ROUTES.indexOf(route) < 0) route = 'dashboard';
      current = route;
      try { global.location.hash = '#' + route; } catch (e) {}
      renderCurrent(true);
    },
    current: function () { return current; }
  };

  /* ---------------- theme ---------------- */
  function applyTheme(theme) {
    var effective = theme;
    if (theme === 'auto') {
      var dark = global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
      effective = dark ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effective);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effective === 'dark' ? '#0c1118' : '#ffffff');
  }

  App.setTheme = function (theme) {
    if (['light', 'dark', 'auto'].indexOf(theme) < 0) theme = 'light';
    App.state.mutate(function (st) { st.settings.theme = theme; }, { notify: false });
    applyTheme(theme);
    renderCurrent(false);
  };

  App.setLang = function (lang) {
    App.state.mutate(function (st) { st.settings.lang = lang; }, { notify: false });
    App.i18n.set(lang);
    renderCurrent(false);
  };

  /* ---------------- mode switching ---------------- */
  function enterAdmin() {
    var U = App.ui, t = App.i18n.t, S = App.state.get();
    if (!S.settings.adminPin) {
      // No device PIN configured: offer to set one, but allow access so a
      // fresh install is usable. Settings explains the limitation.
      U.openModal({
        title: t('mode.switchToAdmin'),
        bodyHtml: '<div class="stack"><div class="notice notice-warn"><div>'
          + U.esc(t('set.pinInactive')) + '<br>' + U.esc(t('mode.pinNote')) + '</div></div></div>',
        okLabel: t('mode.switchToAdmin'),
        onOk: function () { setMode('admin'); return true; }
      });
      return;
    }
    U.openModal({
      title: t('mode.pinPrompt'),
      bodyHtml: '<div class="stack">'
        + U.fieldText('authPin', t('mode.pinPrompt'), '', { type: 'password', inputmode: 'numeric', maxlength: 8 })
        + '</div>',
      okLabel: t('common.confirm'),
      onOk: function () {
        var pin = U.val('authPin');
        U.showErr('authPin', '');
        U.hashPin(pin).then(function (h) {
          if (h.hash === S.settings.adminPin.hash && h.algo === S.settings.adminPin.algo) {
            U.closeModal();
            setMode('admin');
          } else {
            U.showErr('authPin', t('mode.pinWrong'));
          }
        });
        return false;   // keep the dialog open until the async check resolves
      }
    });
  }

  function setMode(mode) {
    App.state.mutate(function (st) { st.settings.mode = mode; }, { notify: false });
    App.ui.toast(App.i18n.t(mode === 'admin' ? 'mode.adminOn' : 'mode.volunteerOn'), 'ok');
    renderCurrent(false);
  }

  /* ---------------- boot ---------------- */
  function bindChrome() {
    document.getElementById('bottomNav').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.nav-item') : null;
      if (btn) App.router.go(btn.getAttribute('data-route'));
    });
    document.getElementById('langBtn').addEventListener('click', function () {
      App.setLang(App.i18n.other());
    });
    document.getElementById('themeBtn').addEventListener('click', function () {
      var cur = App.state.get().settings.theme;
      App.setTheme(cur === 'dark' ? 'light' : 'dark');
    });
    document.getElementById('modeBtn').addEventListener('click', function () {
      if (App.state.get().settings.mode === 'admin') setMode('volunteer');
      else enterAdmin();
    });
    global.addEventListener('hashchange', function () {
      var r = (global.location.hash || '').replace('#', '');
      if (r && ROUTES.indexOf(r) >= 0 && r !== current) {
        current = r;
        renderCurrent(true);
      }
    });
    // Views delegate "switch to admin" buttons rendered by App.ui.adminGate()
    document.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-act="go-admin"]') : null;
      if (el) enterAdmin();
    });
  }

  function registerSW() {
    // Service worker needs a secure context; silently skipped on file://
    if (!('serviceWorker' in global.navigator)) return;
    if (global.location.protocol === 'file:') return;
    global.navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
  }

  function boot() {
    App.ui.bindModalChrome();
    bindChrome();

    App.db.init().then(function () {
      return App.state.load();
    }).then(function (S) {
      // the roll this device already holds, then a roll.json sitting beside
      // the app (only ever present when serving the folder locally)
      return App.roll.init()
        .then(function () { return App.roll.initLocal(); })
        .then(function (n) {
          if (n) App.ui.toast(App.i18n.t('dash.rollOk', { n: App.ui.fmtInt(n) }), 'ok');
          return S;
        });
    }).then(function (S) {
      App.i18n.set(S.settings.lang || 'en');
      applyTheme(S.settings.theme || 'light');
      if (global.matchMedia) {
        try {
          global.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
            if (App.state.get().settings.theme === 'auto') applyTheme('auto');
          });
        } catch (e) { /* older Safari */ }
      }

      var hash = (global.location.hash || '').replace('#', '');
      current = ROUTES.indexOf(hash) >= 0 ? hash : 'dashboard';

      // Re-render on any state change, except while a render is in flight.
      App.state.subscribe(function () { if (!rendering) renderCurrent(false); });
      App.i18n.onChange(function () { /* chrome labels refreshed by renderCurrent */ });

      renderCurrent(false);
      registerSW();
    }).catch(function (e) {
      rootEl().innerHTML = '<div class="notice notice-danger"><div><b>Startup failed</b><br>'
        + App.charts.esc(e && e.message ? e.message : String(e)) + '</div></div>';
      if (global.console) console.error(e);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
