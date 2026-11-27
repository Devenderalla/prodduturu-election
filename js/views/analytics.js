/* =========================================================
   views/analytics.js - neutral aggregate analysis.
   Scenario figures are arithmetic restatements of the
   assumptions the user types in. They are labelled
   HYPOTHETICAL throughout and are never attributed to a
   candidate, so the module cannot output a winner forecast.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};
  App.views = App.views || {};

  function historyDialog(existing) {
    var U = App.ui, t = U.t;
    var h = existing || { year: new Date().getFullYear() - 5, registered: '', turnout: '', winner: '', winnerVotes: '', runnerUp: '', runnerUpVotes: '' };
    var body = '<div class="stack">'
      + U.fieldNumber('hYear', t('an.year'), h.year, { min: 1900, max: 2100 })
      + U.fieldNumber('hReg', t('an.registeredThen'), h.registered, { min: 0 })
      + U.fieldNumber('hTurn', t('an.turnoutThen'), h.turnout, { min: 0 })
      + U.fieldText('hWin', t('an.winner'), h.winner, { maxlength: 60 })
      + U.fieldNumber('hWinV', t('an.winnerVotes'), h.winnerVotes, { min: 0 })
      + U.fieldText('hRun', t('an.runnerUp'), h.runnerUp, { maxlength: 60 })
      + U.fieldNumber('hRunV', t('an.runnerUpVotes'), h.runnerUpVotes, { min: 0 })
      + '</div>';

    U.openModal({
      title: existing ? t('common.edit') : t('an.addHistory'),
      bodyHtml: body, okLabel: t('common.save'),
      onOk: function () {
        var ok = true;
        ['hYear', 'hReg', 'hTurn'].forEach(function (id) { U.showErr(id, ''); });
        var year = U.intVal('hYear');
        if (year === null || isNaN(year) || year < 1900 || year > 2100) { U.showErr('hYear', t('common.invalidNumber')); ok = false; }
        var reg = U.intVal('hReg'); if (reg === null) reg = 0;
        var turn = U.intVal('hTurn'); if (turn === null) turn = 0;
        if (isNaN(reg) || reg < 0) { U.showErr('hReg', t('common.invalidNumber')); ok = false; }
        if (isNaN(turn) || turn < 0) { U.showErr('hTurn', t('common.invalidNumber')); ok = false; }
        if (ok && reg > 0 && turn > reg) { U.showErr('hTurn', t('turnout.errOverPart', { n: U.fmtInt(reg) })); ok = false; }
        if (!ok) return false;

        var rec = {
          year: year, registered: reg, turnout: turn,
          winner: U.val('hWin'), winnerVotes: Math.max(0, U.intVal('hWinV') || 0),
          runnerUp: U.val('hRun'), runnerUpVotes: Math.max(0, U.intVal('hRunV') || 0)
        };
        App.state.mutate(function (st) {
          if (existing) {
            var tgt = st.analytics.history.filter(function (x) { return x.id === existing.id; })[0];
            if (tgt) Object.keys(rec).forEach(function (k) { tgt[k] = rec[k]; });
          } else {
            rec.id = App.state.uid('h');
            st.analytics.history.push(rec);
          }
          st.analytics.history.sort(function (a, b) { return a.year - b.year; });
        });
        U.toast(t('common.saved'), 'ok');
        return true;
      }
    });
  }

  App.views.analytics = {
    titleKey: 'nav.analytics',

    render: function (root) {
      var U = App.ui, C = App.charts, t = U.t, S = App.state.get(), d = App.state.derived;
      var hist = S.analytics.history;
      var sc = S.analytics.scenario;
      var total = d.totalVoters();

      var html = '<div class="stack">';

      html += '<div class="notice notice-info"><div><b>' + U.esc(t('an.neutral')) + '</b><br>'
        + U.esc(t('an.neutralBody')) + '</div></div>';

      /* ---- historical turnout comparison ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('an.history')) + '</h2>'
        + (U.isAdmin() ? '<button class="btn btn-sm btn-ghost" id="addHist">+ ' + U.esc(t('an.addHistory')) + '</button>' : '')
        + '</div>';
      if (hist.length) {
        var groups = hist.map(function (h) {
          return { label: String(h.year), values: [h.registered, h.turnout] };
        });
        groups.push({ label: t('an.now'), values: [total, d.actualTurnout()] });
        html += '<div class="chart-wrap">' + C.groupedBars(groups,
          [{ label: t('an.registeredThen'), color: 'var(--c5)' }, { label: t('an.turnoutThen'), color: 'var(--c2)' }],
          { ariaLabel: t('an.history') }) + '</div>';

        var pts = hist.map(function (h) {
          return { label: String(h.year), value: h.registered ? (h.turnout / h.registered) * 100 : 0 };
        });
        pts.push({ label: t('an.now'), value: d.actualTurnoutPct() });
        html += '<div style="height:10px"></div>'
          + '<div class="stat-label">' + U.esc(t('an.turnoutPct')) + '</div>'
          + '<div class="chart-wrap">' + C.line(pts, {
            max: 100, reference: d.expectedTurnoutPct(), referenceLabel: t('an.thisElectionExp'), ariaLabel: t('an.turnoutPct')
          }) + '</div>';

        html += '<div class="table-scroll" style="margin-top:8px"><table><thead><tr>'
          + '<th>' + U.esc(t('an.year')) + '</th><th>' + U.esc(t('an.registeredThen')) + '</th>'
          + '<th>' + U.esc(t('an.turnoutThen')) + '</th><th>%</th></tr></thead><tbody>';
        hist.forEach(function (h) {
          html += '<tr><td>' + U.esc(h.year) + '</td><td><b>' + U.fmtInt(h.registered) + '</b></td>'
            + '<td><b>' + U.fmtInt(h.turnout) + '</b></td><td>' + U.fmtPct(d.pct(h.turnout, h.registered)) + '</td></tr>';
        });
        html += '<tr style="border-top:2px solid var(--line-strong)"><td><b>' + U.esc(t('an.thisElection')) + '</b></td>'
          + '<td><b>' + U.fmtInt(total) + '</b></td><td><b>' + U.fmtInt(d.actualTurnout()) + '</b></td>'
          + '<td><b>' + U.fmtPct(d.actualTurnoutPct()) + '</b></td></tr>';
        html += '</tbody></table></div>';
      } else {
        html += U.empty(t('an.noHistory'), t('an.noHistorySub'));
      }
      html += '</div>';

      /* ---- historical results ---- */
      if (hist.length) {
        html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('an.historyResults')) + '</h2></div><div class="list">';
        hist.slice().reverse().forEach(function (h) {
          var margin = h.winnerVotes - h.runnerUpVotes;
          html += '<div class="list-item"><div class="li-main">'
            + '<div class="li-title">' + U.esc(h.year) + (h.winner ? ' · ' + U.esc(h.winner) : '') + '</div>'
            + '<div class="li-meta">' + U.esc(t('an.winnerVotes')) + ': <b>' + U.fmtInt(h.winnerVotes) + '</b>'
            + (h.runnerUp ? ' · ' + U.esc(h.runnerUp) + ': <b>' + U.fmtInt(h.runnerUpVotes) + '</b>' : '') + '</div>'
            + '<div class="li-meta">' + U.esc(t('an.margin')) + ': <b>' + U.fmtInt(Math.abs(margin)) + '</b>'
            + ' · ' + U.esc(t('an.turnoutPct')) + ' ' + U.fmtPct(d.pct(h.turnout, h.registered)) + '</div>'
            + (U.isAdmin() ? '<div style="margin-top:8px;display:flex;gap:6px">'
              + '<button class="btn btn-sm btn-ghost" data-ehist="' + U.esc(h.id) + '">' + U.esc(t('common.edit')) + '</button>'
              + '<button class="btn btn-sm btn-ghost" style="color:var(--danger)" data-dhist="' + U.esc(h.id) + '">' + U.esc(t('common.delete')) + '</button>'
              + '</div>' : '')
            + '</div></div>';
        });
        html += '</div></div>';
      }

      /* ---- scenario analysis ---- */
      var scTurnout = Math.round(total * (sc.assumedTurnoutPct / 100));
      var scRejected = Math.round(scTurnout * (sc.assumedRejectPct / 100));
      var scValid = Math.max(0, scTurnout - scRejected);

      html += '<div class="card"><div class="card-head"><div><h2>' + U.esc(t('an.scenario')) + '</h2>'
        + '<p class="card-sub">' + U.esc(t('an.scenarioNote')) + '</p></div>'
        + '<span class="badge badge-hypo">' + U.esc(t('common.hypothetical')) + '</span></div>'
        + '<div class="field"><label for="scPct">' + U.esc(t('an.assumedTurnout')) + ': <b id="scPctOut">' + sc.assumedTurnoutPct + '%</b></label>'
        + '<input id="scPct" type="range" min="0" max="100" step="1" value="' + sc.assumedTurnoutPct + '" style="min-height:34px;padding:0">'
        + '</div>'
        + '<div class="field" style="margin-top:8px"><label for="scRej">' + U.esc(t('an.assumedRejectPct')) + ': <b id="scRejOut">' + sc.assumedRejectPct + '%</b></label>'
        + '<input id="scRej" type="range" min="0" max="15" step="0.5" value="' + sc.assumedRejectPct + '" style="min-height:34px;padding:0">'
        + '</div>'
        + '<div class="grid-3" style="margin-top:12px">'
        + '<div class="stat"><div class="stat-label">' + U.esc(t('an.scenarioVotes')) + '</div><div class="stat-value sm" id="scVotes">' + U.fmtInt(scTurnout) + '</div></div>'
        + '<div class="stat"><div class="stat-label">' + U.esc(t('an.projValid')) + '</div><div class="stat-value sm" id="scValid">' + U.fmtInt(scValid) + '</div></div>'
        + '<div class="stat"><div class="stat-label">' + U.esc(t('an.projRejected')) + '</div><div class="stat-value sm" id="scRejN">' + U.fmtInt(scRejected) + '</div></div>'
        + '</div>'
        + '<div style="margin-top:12px" id="scBar">'
        + C.progress(scTurnout, total, { label: t('an.assumedTurnout'), valueLabel: U.fmtInt(scTurnout) + ' / ' + U.fmtInt(total) })
        + '</div>'
        + '<div class="notice notice-warn" style="margin-top:12px"><div>' + U.esc(t('an.neutralBody')) + '</div></div>'
        + '</div>';

      /* ---- uncertainty ---- */
      var n = d.countedVotes();
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('an.uncertainty')) + '</h2>'
        + '<span class="badge">95%</span></div>';
      if (n > 0) {
        html += '<p class="card-sub" style="margin-bottom:10px">' + U.esc(t('an.uncertaintyBody', { n: U.fmtInt(n) })) + '</p>'
          + '<div class="table-scroll"><table><thead><tr><th>' + U.esc(t('an.shareAt')) + '</th>'
          + '<th>' + U.esc(t('an.moe')) + '</th></tr></thead><tbody>';
        [0.1, 0.25, 0.4, 0.5].forEach(function (p) {
          html += '<tr><td>' + (p * 100).toFixed(0) + '%</td><td><b>± ' + d.marginOfError(p, n).toFixed(2) + ' pp</b></td></tr>';
        });
        html += '</tbody></table></div>';
      } else {
        html += U.empty(t('an.uncertainty'), t('an.needCount'));
      }
      html += '</div>';

      html += '</div>';
      root.innerHTML = html;

      /* ---- live scenario recompute (no persistence until release) ---- */
      var pctIn = root.querySelector('#scPct');
      var rejIn = root.querySelector('#scRej');

      function recompute() {
        var p = parseFloat(pctIn.value), r = parseFloat(rejIn.value);
        var turn = Math.round(total * (p / 100));
        var rej = Math.round(turn * (r / 100));
        root.querySelector('#scPctOut').textContent = p + '%';
        root.querySelector('#scRejOut').textContent = r + '%';
        root.querySelector('#scVotes').textContent = U.fmtInt(turn);
        root.querySelector('#scValid').textContent = U.fmtInt(Math.max(0, turn - rej));
        root.querySelector('#scRejN').textContent = U.fmtInt(rej);
        root.querySelector('#scBar').innerHTML = C.progress(turn, total, {
          label: t('an.assumedTurnout'), valueLabel: U.fmtInt(turn) + ' / ' + U.fmtInt(total)
        });
      }
      function persist() {
        App.state.mutate(function (st) {
          st.analytics.scenario.assumedTurnoutPct = App.state.clamp(parseFloat(pctIn.value), 0, 100);
          st.analytics.scenario.assumedRejectPct = App.state.clamp(parseFloat(rejIn.value), 0, 100);
        }, { notify: false });
      }
      pctIn.addEventListener('input', recompute);
      rejIn.addEventListener('input', recompute);
      pctIn.addEventListener('change', persist);
      rejIn.addEventListener('change', persist);

      var ah = root.querySelector('#addHist');
      if (ah) ah.addEventListener('click', function () { historyDialog(null); });
      root.querySelectorAll('[data-ehist]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-ehist');
          var h = App.state.get().analytics.history.filter(function (x) { return x.id === id; })[0];
          if (h) historyDialog(h);
        });
      });
      root.querySelectorAll('[data-dhist]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-dhist');
          U.confirm({
            title: t('an.deleteHistory'), body: '', danger: true, okLabel: t('common.delete'),
            onOk: function () {
              App.state.mutate(function (st) {
                st.analytics.history = st.analytics.history.filter(function (x) { return x.id !== id; });
              });
              U.toast(t('common.deleted'), 'ok');
            }
          });
        });
      });
    }
  };
})(window);
