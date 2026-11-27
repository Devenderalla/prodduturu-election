/* =========================================================
   ui.js - shared UI helpers: toasts, confirm/form dialogs,
   number formatting, CSV/JSON download, PIN hashing.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};
  var t = function (k, v) { return App.i18n.t(k, v); };

  /* ---------------- formatting ---------------- */
  function fmtInt(n) {
    if (n == null || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-IN');
  }
  function fmtPct(n, dp) {
    if (n == null || !isFinite(n)) return '—';
    return n.toFixed(dp == null ? 1 : dp) + '%';
  }
  function fmtMoney(n) {
    if (n == null || !isFinite(n)) return '—';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }
  function fmtDateTime(iso) {
    if (!iso) return t('common.never');
    var d = new Date(iso);
    if (isNaN(d.getTime())) return t('common.never');
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function fmtDate(s) {
    if (!s) return '—';
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function todayISO() {
    var d = new Date(), p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function nowHHMM() {
    var d = new Date(), p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  var esc = function (s) { return App.charts.esc(s); };

  /* ---------------- toasts ---------------- */
  function toast(message, kind) {
    var stack = document.getElementById('toastStack');
    if (!stack) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind === 'ok' ? ' is-ok' : kind === 'err' ? ' is-err' : '');
    el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .2s';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, kind === 'err' ? 3600 : 2300);
  }

  /* ---------------- modal ---------------- */
  var modalState = { onOk: null, onCancel: null, lastFocus: null };

  function closeModal() {
    var bd = document.getElementById('modalBackdrop');
    bd.hidden = true;
    document.getElementById('modalBody').innerHTML = '';
    modalState.onOk = null;
    modalState.onCancel = null;
    if (modalState.lastFocus && modalState.lastFocus.focus) {
      try { modalState.lastFocus.focus(); } catch (e) {}
    }
  }

  /**
   * openModal({ title, bodyHtml, okLabel, cancelLabel, danger, onOk, onMount })
   * onOk returns false to keep the dialog open (used for validation).
   */
  function openModal(cfg) {
    var bd = document.getElementById('modalBackdrop');
    var titleEl = document.getElementById('modalTitle');
    var bodyEl = document.getElementById('modalBody');
    var okBtn = document.getElementById('modalOk');
    var cancelBtn = document.getElementById('modalCancel');

    modalState.lastFocus = document.activeElement;
    titleEl.textContent = cfg.title || '';
    bodyEl.innerHTML = cfg.bodyHtml || '';
    okBtn.textContent = cfg.okLabel || t('common.confirm');
    cancelBtn.textContent = cfg.cancelLabel || t('common.cancel');
    okBtn.className = 'btn ' + (cfg.danger ? 'btn-danger' : 'btn-primary');
    okBtn.hidden = cfg.hideOk === true;
    modalState.onOk = cfg.onOk || null;
    modalState.onCancel = cfg.onCancel || null;
    bd.hidden = false;
    if (cfg.onMount) cfg.onMount(bodyEl);
    var firstInput = bodyEl.querySelector('input,select,textarea');
    if (firstInput && cfg.autofocus !== false) { try { firstInput.focus(); } catch (e) {} }
    else { try { okBtn.focus(); } catch (e) {} }
  }

  function confirm(cfg) {
    openModal({
      title: cfg.title,
      bodyHtml: '<p style="font-size:13.5px;color:var(--ink-2)">' + esc(cfg.body || '') + '</p>'
        + (cfg.extraHtml || ''),
      okLabel: cfg.okLabel || t('common.confirm'),
      danger: cfg.danger,
      onOk: function () { if (cfg.onOk) cfg.onOk(); return true; }
    });
  }

  function bindModalChrome() {
    document.getElementById('modalOk').addEventListener('click', function () {
      var keepOpen = modalState.onOk ? modalState.onOk() === false : false;
      if (!keepOpen) closeModal();
    });
    document.getElementById('modalCancel').addEventListener('click', function () {
      if (modalState.onCancel) modalState.onCancel();
      closeModal();
    });
    document.getElementById('modalBackdrop').addEventListener('click', function (e) {
      if (e.target === this) {
        if (modalState.onCancel) modalState.onCancel();
        closeModal();
      }
    });
    document.addEventListener('keydown', function (e) {
      var bd = document.getElementById('modalBackdrop');
      if (e.key === 'Escape' && bd && !bd.hidden) closeModal();
    });
  }

  /* ---------------- form field builders (used inside modals) ---------------- */
  function fieldNumber(id, label, value, opts) {
    opts = opts || {};
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>'
      + '<input id="' + id + '" type="number" inputmode="numeric" '
      + (opts.min != null ? 'min="' + opts.min + '" ' : 'min="0" ')
      + (opts.max != null ? 'max="' + opts.max + '" ' : '')
      + (opts.step != null ? 'step="' + opts.step + '" ' : '')
      + 'value="' + (value == null ? '' : esc(value)) + '" '
      + (opts.placeholder ? 'placeholder="' + esc(opts.placeholder) + '" ' : '') + '>'
      + (opts.help ? '<span class="help">' + esc(opts.help) + '</span>' : '')
      + '<span class="inline-err" id="' + id + 'Err" hidden></span></div>';
  }
  function fieldText(id, label, value, opts) {
    opts = opts || {};
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>'
      + '<input id="' + id + '" type="' + (opts.type || 'text') + '" value="' + (value == null ? '' : esc(value)) + '" '
      + (opts.placeholder ? 'placeholder="' + esc(opts.placeholder) + '" ' : '')
      + (opts.maxlength ? 'maxlength="' + opts.maxlength + '" ' : '')
      + (opts.inputmode ? 'inputmode="' + opts.inputmode + '" ' : '') + '>'
      + (opts.help ? '<span class="help">' + esc(opts.help) + '</span>' : '')
      + '<span class="inline-err" id="' + id + 'Err" hidden></span></div>';
  }
  function fieldSelect(id, label, value, options, opts) {
    opts = opts || {};
    var o = options.map(function (op) {
      return '<option value="' + esc(op.value) + '"' + (String(op.value) === String(value) ? ' selected' : '') + '>' + esc(op.label) + '</option>';
    }).join('');
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>'
      + '<select id="' + id + '">' + o + '</select>'
      + (opts.help ? '<span class="help">' + esc(opts.help) + '</span>' : '')
      + '<span class="inline-err" id="' + id + 'Err" hidden></span></div>';
  }
  function showErr(id, msg) {
    var el = document.getElementById(id + 'Err');
    if (!el) return;
    if (msg) { el.textContent = msg; el.hidden = false; }
    else { el.textContent = ''; el.hidden = true; }
  }
  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function intVal(id) {
    var raw = val(id);
    if (raw === '') return null;
    var n = parseFloat(raw);
    return isFinite(n) ? Math.round(n) : NaN;
  }
  function floatVal(id) {
    var raw = val(id);
    if (raw === '') return null;
    var n = parseFloat(raw);
    return isFinite(n) ? n : NaN;
  }

  /* ---------------- empty state ---------------- */
  function empty(title, sub) {
    return '<div class="empty">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v4H4zm0 6h16v10H4zm3 3h10v2H7z"/></svg>'
      + '<b>' + esc(title) + '</b><span>' + esc(sub || '') + '</span></div>';
  }

  /* ---------------- downloads ---------------- */
  function download(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1200);
      return true;
    } catch (e) {
      toast('Export failed: ' + e.message, 'err');
      return false;
    }
  }
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(rows) {
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }
  function stamp() {
    return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  }

  /* ---------------- file picker ---------------- */
  function pickFile(accept) {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      // '*/*' on purpose for data imports: Android's picker hides .json
      // behind a strict filter, leaving the file unselectable.
      input.accept = accept || '*/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        document.body.removeChild(input);
        if (!f) return resolve(null);
        var reader = new FileReader();
        reader.onload = function () { resolve({ name: f.name, text: String(reader.result) }); };
        reader.onerror = function () { resolve(null); };
        reader.readAsText(f);
      });
      input.click();
    });
  }

  /* ---------------- admin PIN ---------------- */
  function hashPin(pin) {
    var text = 'prodduturu:' + pin;
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      try {
        return global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
          var arr = Array.prototype.slice.call(new Uint8Array(buf));
          return { algo: 'sha256', hash: arr.map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('') };
        });
      } catch (e) { /* fall through */ }
    }
    // Fallback for file:// contexts where crypto.subtle is unavailable.
    var h = 5381;
    for (var i = 0; i < text.length; i++) { h = ((h * 33) ^ text.charCodeAt(i)) >>> 0; }
    return Promise.resolve({ algo: 'weak-djb2', hash: h.toString(16) });
  }

  /* ---------------- admin gate card ---------------- */
  function adminGate() {
    return '<div class="card"><div class="notice notice-warn"><div><b>' + esc(t('mode.adminOnly')) + '</b><br>'
      + esc(t('mode.adminOnlyBody')) + '</div></div>'
      + '<button class="btn btn-primary btn-block" style="margin-top:12px" data-act="go-admin">'
      + esc(t('mode.switchToAdmin')) + '</button></div>';
  }
  function isAdmin() { return App.state.get().settings.mode === 'admin'; }

  App.ui = {
    t: t, esc: esc,
    fmtInt: fmtInt, fmtPct: fmtPct, fmtMoney: fmtMoney, fmtDateTime: fmtDateTime, fmtDate: fmtDate,
    todayISO: todayISO, nowHHMM: nowHHMM,
    toast: toast, openModal: openModal, closeModal: closeModal, confirm: confirm, bindModalChrome: bindModalChrome,
    fieldNumber: fieldNumber, fieldText: fieldText, fieldSelect: fieldSelect,
    showErr: showErr, val: val, intVal: intVal, floatVal: floatVal,
    empty: empty, download: download, toCsv: toCsv, stamp: stamp, pickFile: pickFile,
    hashPin: hashPin, adminGate: adminGate, isAdmin: isAdmin
  };
})(window);
