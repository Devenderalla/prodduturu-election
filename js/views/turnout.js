/* =========================================================
   views/turnout.js - aggregate hourly turnout.
   Readings are CUMULATIVE votes cast per polling part at a
   given clock time. Validation keeps the series monotonic
   and inside the registered-voter ceiling for each part.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};
  App.views = App.views || {};

  function sumCounts(parts, counts) {
    return parts.reduce(function (s, p) { return s + App.state.num(counts[p.id], 0); }, 0);
  }

  /** Highest cumulative value recorded for a part, excluding one reading id. */
  function priorMax(partId, exceptId) {
    var S = App.state.get(), max = 0;
    S.turnout.readings.forEach(function (r) {
      if (r.id === exceptId) return;
      var v = App.state.num(r.counts[partId], 0);
      if (v > max) max = v;
    });
    return max;
  }

  function readingDialog(existing) {
    var U = App.ui, t = U.t, S = App.state.get();
    var parts = S.election.parts;
    var isEdit = !!existing;

    var body = '<div class="stack">'
      + U.fieldText('rTime', t('turnout.readingTime'), existing ? existing.time : U.nowHHMM(), { type: 'time' })
      + '<p class="help" style="margin:0">' + U.esc(t('turnout.cumulative')) + '</p>';
    parts.forEach(function (p) {
      body += U.fieldNumber('rC_' + p.id, p.name, existing ? App.state.num(existing.counts[p.id], 0) : priorMax(p.id, null),
        { min: 0, max: p.voters, help: U.fmtInt(p.voters) + ' ' + t('common.voters') });
    });
    body += '</div>';

    U.openModal({
      title: isEdit ? t('turnout.editReading') : t('turnout.addReading'),
      bodyHtml: body,
      okLabel: t('common.save'),
      onOk: function () {
        var time = U.val('rTime');
        var ok = true;
        U.showErr('rTime', '');
        if (!time) { U.showErr('rTime', t('turnout.errTime')); ok = false; }
        else {
          var dup = S.turnout.readings.some(function (r) {
            return r.time === time && (!existing || r.id !== existing.id);
          });
          if (dup) { U.showErr('rTime', t('turnout.errDupTime')); ok = false; }
        }
        var counts = {};
        parts.forEach(function (p) {
          var id = 'rC_' + p.id;
          U.showErr(id, '');
          var v = U.intVal(id);
          if (v == null) v = 0;
          if (isNaN(v)) { U.showErr(id, t('common.invalidNumber')); ok = false; return; }
          if (v < 0) { U.showErr(id, t('turnout.errNegative')); ok = false; return; }
          if (v > p.voters) { U.showErr(id, t('turnout.errOverPart', { n: U.fmtInt(p.voters) })); ok = false; return; }
          // monotonic check against readings at earlier times only
          var earlierMax = 0;
          S.turnout.readings.forEach(function (r) {
            if (existing && r.id === existing.id) return;
            if (String(r.time) < String(time)) {
              var pv = App.state.num(r.counts[p.id], 0);
              if (pv > earlierMax) earlierMax = pv;
            }
          });
          if (v < earlierMax) { U.showErr(id, t('turnout.errDecrease', { n: U.fmtInt(earlierMax) })); ok = false; return; }
          counts[p.id] = v;
        });
        if (!ok) return false;

        App.state.mutate(function (st) {
          if (isEdit) {
            var r = st.turnout.readings.filter(function (x) { return x.id === existing.id; })[0];
            if (r) { r.time = time; r.counts = counts; }
          } else {
            st.turnout.readings.push({ id: App.state.uid('tr'), time: time, counts: counts });
          }
          st.turnout.readings.sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); });
        });
        U.toast(t('common.saved'), 'ok');
        return true;
      }
    });
  }

  App.views.turnout = {
    titleKey: 'nav.turnout',

    render: function (root) {
      var U = App.ui, C = App.charts, t = U.t, S = App.state.get(), d = App.state.derived;
      var parts = S.election.parts;
      var readings = S.turnout.readings;
      var actual = d.actualTurnout();
      var expTurnout = d.expectedTurnout();
      var total = d.totalVoters();

      var html = '<div class="stack">';

      /* ---- headline stats ---- */
      html += '<div class="grid-2">'
        + '<div class="stat tone-accent"><div class="stat-label">' + U.esc(t('dash.actualTurnout')) + '</div>'
        + '<div class="stat-value">' + U.fmtInt(actual) + '</div>'
        + '<div class="stat-foot">' + U.fmtPct(d.actualTurnoutPct()) + ' ' + U.esc(t('dash.ofRegistered')) + '</div></div>'
        + '<div class="stat"><div class="stat-label">' + U.esc(t('dash.expTurnout')) + '</div>'
        + '<div class="stat-value">' + U.fmtInt(expTurnout) + '</div>'
        + '<div class="stat-foot">' + U.fmtPct(d.expectedTurnoutPct()) + '</div></div>'
        + '</div>';

      html += '<div class="card">'
        + C.progress(actual, expTurnout, {
          label: t('turnout.actual') + ' / ' + t('turnout.expected'),
          valueLabel: U.fmtPct(d.turnoutVsExpectedPct()), tone: 'accent'
        })
        + '<div class="stat-foot" style="margin-top:8px">' + U.esc(t('dash.remaining')) + ': <b>' + U.fmtInt(d.remainingTurnout()) + '</b></div>'
        + '</div>';

      /* ---- admin-only entry ---- */
      if (U.isAdmin()) {
        html += '<button class="btn btn-primary btn-block" id="addReading">+ ' + U.esc(t('turnout.addReading')) + '</button>';
      } else {
        html += '<div class="notice notice-info"><div>' + U.esc(t('mode.adminOnlyBody')) + '</div></div>';
      }

      /* ---- trend ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('turnout.trend')) + '</h2>'
        + '<span class="hint">' + U.esc(t('turnout.expected')) + ': ' + U.fmtInt(expTurnout) + '</span></div>';
      if (readings.length) {
        var pts = readings.map(function (r) {
          return { label: r.time, value: sumCounts(parts, r.counts) };
        });
        html += '<div class="chart-wrap">' + C.line(pts, {
          max: Math.max(expTurnout, pts[pts.length - 1].value),
          reference: expTurnout, referenceLabel: t('turnout.expected'),
          ariaLabel: t('turnout.trend')
        }) + '</div>';
      } else {
        html += U.empty(t('turnout.noReadings'), t('turnout.noReadingsSub'));
      }
      html += '</div>';

      /* ---- expected vs actual ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('turnout.compare')) + '</h2></div>'
        + '<div class="chart-wrap">'
        + C.groupedBars(
          parts.map(function (p) {
            var pExp = Math.max(0, Math.round(p.voters * (d.expectedTurnoutPct() / 100)));
            return { label: p.name, values: [pExp, d.partTurnout(p.id)] };
          }).concat([{ label: t('common.total'), values: [expTurnout, actual] }]),
          [{ label: t('turnout.expected'), color: 'var(--c3)' }, { label: t('turnout.actual'), color: 'var(--c2)' }],
          { ariaLabel: t('turnout.compare') }
        )
        + '</div>'
        + C.legend([{ label: t('turnout.expected'), value: expTurnout, color: 'var(--c3)' },
                    { label: t('turnout.actual'), value: actual, color: 'var(--c2)' }], { showPct: false })
        + '</div>';

      /* ---- part-wise stats ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('turnout.partStats')) + '</h2></div>'
        + '<div class="table-scroll"><table><thead><tr><th>' + U.esc(t('common.part')) + '</th>'
        + '<th>' + U.esc(t('common.voters')) + '</th><th>' + U.esc(t('turnout.actual')) + '</th>'
        + '<th>%</th><th>' + U.esc(t('dash.remaining')) + '</th></tr></thead><tbody>';
      parts.forEach(function (p) {
        var pt = d.partTurnout(p.id);
        var pExp = Math.max(0, Math.round(p.voters * (d.expectedTurnoutPct() / 100)));
        html += '<tr><td>' + U.esc(p.name) + '</td><td><b>' + U.fmtInt(p.voters) + '</b></td>'
          + '<td><b>' + U.fmtInt(pt) + '</b></td><td>' + U.fmtPct(d.pct(pt, p.voters)) + '</td>'
          + '<td>' + U.fmtInt(Math.max(0, pExp - pt)) + '</td></tr>';
      });
      html += '<tr style="border-top:2px solid var(--line-strong)"><td><b>' + U.esc(t('common.total')) + '</b></td>'
        + '<td><b>' + U.fmtInt(total) + '</b></td><td><b>' + U.fmtInt(actual) + '</b></td>'
        + '<td><b>' + U.fmtPct(d.actualTurnoutPct()) + '</b></td><td><b>' + U.fmtInt(d.remainingTurnout()) + '</b></td></tr>'
        + '</tbody></table></div></div>';

      /* ---- readings list ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('turnout.readings')) + '</h2>'
        + '<span class="hint">' + readings.length + '</span></div>';
      if (readings.length) {
        html += '<div class="list">';
        readings.slice().reverse().forEach(function (r, idx) {
          var tot = sumCounts(parts, r.counts);
          var revIndex = readings.length - 1 - idx;
          var prev = revIndex > 0 ? sumCounts(parts, readings[revIndex - 1].counts) : 0;
          html += '<div class="list-item"><div class="li-main">'
            + '<div class="li-title">' + U.esc(r.time) + ' · ' + U.fmtInt(tot) + ' ' + U.esc(t('common.votes')) + '</div>'
            + '<div class="li-meta">' + parts.map(function (p) {
              return U.esc(p.name) + ': ' + U.fmtInt(App.state.num(r.counts[p.id], 0));
            }).join(' · ') + '</div>'
            + '<div class="li-meta">' + U.esc(t('turnout.perHour')) + ': <b>+' + U.fmtInt(Math.max(0, tot - prev)) + '</b>'
            + ' · ' + U.fmtPct(d.pct(tot, total)) + '</div>'
            + '</div>'
            + (U.isAdmin() ? '<div style="display:grid;gap:6px">'
              + '<button class="btn btn-sm btn-ghost" data-edit="' + U.esc(r.id) + '">' + U.esc(t('common.edit')) + '</button>'
              + '<button class="btn btn-sm btn-ghost" style="color:var(--danger)" data-del="' + U.esc(r.id) + '">' + U.esc(t('common.delete')) + '</button>'
              + '</div>' : '')
            + '</div>';
        });
        html += '</div>';
      } else {
        html += U.empty(t('turnout.noReadings'), t('turnout.noReadingsSub'));
      }
      html += '</div></div>';

      root.innerHTML = html;

      var add = root.querySelector('#addReading');
      if (add) add.addEventListener('click', function () { readingDialog(null); });

      root.querySelectorAll('[data-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-edit');
          var r = App.state.get().turnout.readings.filter(function (x) { return x.id === id; })[0];
          if (r) readingDialog(r);
        });
      });
      root.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-del');
          U.confirm({
            title: t('turnout.deleteReading'), body: '', danger: true, okLabel: t('common.delete'),
            onOk: function () {
              App.state.mutate(function (st) {
                st.turnout.readings = st.turnout.readings.filter(function (x) { return x.id !== id; });
              });
              U.toast(t('common.deleted'), 'ok');
            }
          });
        });
      });
    }
  };
})(window);
