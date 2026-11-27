/* =========================================================
   views/dashboard.js - aggregate election dashboard
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};
  App.views = App.views || {};

  App.views.dashboard = {
    titleKey: 'nav.dashboard',

    render: function (root) {
      var U = App.ui, C = App.charts, t = U.t, S = App.state.get(), d = App.state.derived;

      var total = d.totalVoters();
      var absent = S.election.expectedAbsentees;
      var expTurnout = d.expectedTurnout();
      var expPct = d.expectedTurnoutPct();
      var actual = d.actualTurnout();
      var actualPct = d.actualTurnoutPct();
      var remaining = d.remainingTurnout();
      var valid = d.validVotes();
      var rejected = d.rejectedVotes();
      var latest = d.latestReading();

      var statusKey = S.counting.status === 'final' ? 'dash.statusFinal'
        : S.counting.status === 'counting' ? 'dash.statusCounting' : 'dash.statusNotStarted';
      var statusTone = S.counting.status === 'final' ? 'notice-accent'
        : S.counting.status === 'counting' ? 'notice-info' : 'notice';

      var html = '<div class="stack">';

      /* ---- roll status, first thing on the screen ----
         The commonest confusion is a device searching the demo records
         without realising the real roll was never imported on it. */
      if (App.roll.isLoaded()) {
        html += '<div class="notice notice-accent"><div><b>'
          + U.esc(t('dash.rollOk', { n: U.fmtInt(App.roll.count()) })) + '</b></div></div>';
      } else {
        html += '<div class="card" style="border-color:var(--warn)">'
          + '<div class="notice notice-warn"><div><b>' + U.esc(t('dash.noRoll')) + '</b><br>'
          + U.esc(t('dash.noRollBody')) + '</div></div>'
          + '<button class="btn btn-primary btn-block" id="dashImport" style="margin-top:12px">'
          + U.esc(t('dash.importNow')) + '</button></div>';
      }

      /* ---- status + election identity ---- */
      html += '<div class="card">'
        + '<div class="card-head"><div><h2>' + U.esc(t('app.electionType')) + '</h2>'
        + '<p class="card-sub">' + U.esc(t('app.place')) + (S.election.pollDate ? ' · ' + U.esc(U.fmtDate(S.election.pollDate)) : '') + '</p></div>'
        + '<span class="badge badge-official">' + U.esc(t('set.candidateCount')) + '</span></div>'
        + '<div class="notice ' + statusTone + '" style="' + (statusTone === 'notice' ? 'background:var(--bg-sunken);color:var(--ink-2)' : '') + '">'
        + '<div><b>' + U.esc(t(statusKey)) + '</b></div></div>'
        + '</div>';

      /* ---- primary stat grid ---- */
      html += '<div class="grid-2">'
        + stat(t('dash.registered'), U.fmtInt(total), S.election.useOfficialTotal && S.election.officialTotal ? t('common.official') : t('dash.rollSource'), 'tone-brand')
        + stat(t('dash.absentees'), U.fmtInt(absent), U.fmtPct(d.pct(absent, total)) + ' ' + t('dash.ofRegistered'), 'tone-warn')
        + stat(t('dash.expTurnout'), U.fmtInt(expTurnout), t('dash.expTurnoutPct') + ' ' + U.fmtPct(expPct), '')
        + stat(t('dash.actualTurnout'), U.fmtInt(actual), U.fmtPct(actualPct) + ' ' + t('dash.ofRegistered'), 'tone-accent')
        + stat(t('dash.remaining'), U.fmtInt(remaining), t('dash.ofExpected'), '')
        + stat(t('dash.validVotes'), d.anyVotesEntered() ? U.fmtInt(valid) : '—', t('res.officialNote'), '')
        + '</div>';

      html += '<div class="grid-2">'
        + stat(t('dash.rejected'), U.fmtInt(rejected), d.countedVotes() ? U.fmtPct(d.pct(rejected, d.countedVotes())) + ' ' + t('common.of') + ' ' + U.fmtInt(d.countedVotes()) : '—', 'tone-danger')
        + stat(t('dash.countProgress'), U.fmtPct(d.countingProgressPct()), U.fmtInt(d.countedVotes()) + ' / ' + U.fmtInt(actual || expTurnout), '')
        + '</div>';

      /* ---- donut: roll breakdown ---- */
      var pending = Math.max(0, total - absent - actual);
      var segs = [
        { label: t('dash.voted'), value: actual, color: 'var(--c2)' },
        { label: t('dash.notVoted'), value: pending, color: 'var(--c1)' },
        { label: t('dash.absent'), value: absent, color: 'var(--c3)' }
      ];
      html += '<div class="card">'
        + '<div class="card-head"><h2>' + U.esc(t('dash.breakdown')) + '</h2>'
        + '<span class="hint">' + U.esc(U.fmtInt(total) + ' ' + t('common.voters')) + '</span></div>'
        + '<div class="chart-wrap" style="max-width:220px;margin:0 auto">'
        + C.donut(segs, { centerValue: U.fmtPct(actualPct, actualPct >= 10 ? 1 : 1), centerLabel: t('dash.actualTurnout'), ariaLabel: t('dash.breakdown') })
        + '</div>'
        + C.legend(segs)
        + '</div>';

      /* ---- progress card ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('dash.turnoutProgress')) + '</h2></div>'
        + C.progress(actual, expTurnout, { label: t('turnout.actual') + ' / ' + t('turnout.expected'), valueLabel: U.fmtInt(actual) + ' / ' + U.fmtInt(expTurnout), tone: 'accent' })
        + '<div style="height:12px"></div>'
        + C.progress(actual, total, { label: t('dash.ofRegistered'), valueLabel: U.fmtPct(actualPct) })
        + '<div style="height:12px"></div>'
        + C.progress(d.countedVotes(), actual || expTurnout, { label: t('dash.countProgress'), valueLabel: U.fmtPct(d.countingProgressPct()), tone: 'warn' })
        + '</div>';

      /* ---- part-wise totals ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('dash.partTotals')) + '</h2>'
        + '<span class="hint">' + U.esc(t('dash.rollSource')) + '</span></div>'
        + '<div class="table-scroll"><table><thead><tr>'
        + '<th>' + U.esc(t('common.part')) + '</th><th>' + U.esc(t('common.voters')) + '</th>'
        + '<th>' + U.esc(t('common.male')) + '</th><th>' + U.esc(t('common.female')) + '</th>'
        + '<th>' + U.esc(t('turnout.actual')) + '</th><th>%</th></tr></thead><tbody>';
      S.election.parts.forEach(function (p) {
        var pt = d.partTurnout(p.id);
        html += '<tr><td>' + U.esc(p.name) + '</td><td><b>' + U.fmtInt(p.voters) + '</b></td>'
          + '<td>' + U.fmtInt(p.male) + '</td><td>' + U.fmtInt(p.female) + '</td>'
          + '<td><b>' + U.fmtInt(pt) + '</b></td><td>' + U.fmtPct(d.pct(pt, p.voters)) + '</td></tr>';
      });
      var gt = d.genderTotals();
      html += '<tr style="border-top:2px solid var(--line-strong)"><td><b>' + U.esc(t('common.total')) + '</b></td>'
        + '<td><b>' + U.fmtInt(d.draftTotal()) + '</b></td>'
        + '<td><b>' + U.fmtInt(gt.male) + '</b></td><td><b>' + U.fmtInt(gt.female) + '</b></td>'
        + '<td><b>' + U.fmtInt(actual) + '</b></td>'
        + '<td><b>' + U.fmtPct(d.pct(actual, d.draftTotal())) + '</b></td></tr>';
      html += '</tbody></table></div>';
      html += '<div class="notice notice-accent" style="margin-top:10px"><div>'
        + U.esc(t('set.verifiedRoll')) + '</div></div>';
      html += '<div class="notice notice-info" style="margin-top:10px"><div>'
        + U.esc(t('dash.rollNote', { n: U.fmtInt(S.election.originalEstimate), m: U.fmtInt(d.draftTotal()) }))
        + '</div></div></div>';

      /* ---- gender breakdown (aggregate, from the official summary) ---- */
      var g = d.genderTotals();
      if (g.male + g.female + g.thirdGender > 0) {
        var gsegs = [
          { label: t('common.male'), value: g.male, color: 'var(--c1)' },
          { label: t('common.female'), value: g.female, color: 'var(--c4)' }
        ];
        if (g.thirdGender > 0) gsegs.push({ label: t('common.thirdGender'), value: g.thirdGender, color: 'var(--c3)' });
        html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('dash.genderBreakdown')) + '</h2>'
          + '<span class="badge badge-official">' + U.esc(t('common.official')) + '</span></div>'
          + '<div class="chart-wrap" style="max-width:210px;margin:0 auto">'
          + C.donut(gsegs, { centerValue: U.fmtInt(g.male + g.female + g.thirdGender), centerLabel: t('common.voters'), ariaLabel: t('dash.genderBreakdown') })
          + '</div>' + C.legend(gsegs) + '</div>';
      }

      /* ---- latest reading / empty state ---- */
      if (latest) {
        html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('turnout.latest')) + '</h2>'
          + '<span class="badge">' + U.esc(latest.time) + '</span></div>'
          + C.hbars(S.election.parts.map(function (p, i) {
            return { label: p.name, value: App.state.num(latest.counts[p.id], 0), sub: U.fmtPct(d.pct(App.state.num(latest.counts[p.id], 0), p.voters)) + ' ' + t('dash.ofRegistered') };
          }), { max: Math.max.apply(null, S.election.parts.map(function (p) { return p.voters; })), ariaLabel: t('turnout.partStats') })
          + '</div>';
      } else {
        html += U.empty(t('dash.noTurnout'), t('dash.noTurnoutSub'));
      }

      /* ---- quick actions ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('dash.quick')) + '</h2></div>'
        + '<div class="btn-grid">'
        + '<button class="btn btn-primary" data-goto="turnout">' + U.esc(t('nav.turnout')) + '</button>'
        + '<button class="btn" data-goto="results">' + U.esc(t('nav.results')) + '</button>'
        + '<button class="btn" data-goto="analytics">' + U.esc(t('nav.analytics')) + '</button>'
        + '<button class="btn" data-goto="expenses">' + U.esc(t('nav.expenses')) + '</button>'
        + '</div></div>';

      html += '</div>';
      root.innerHTML = html;

      var di = root.querySelector('#dashImport');
      if (di) di.addEventListener('click', function () { App.router.go('settings'); });

      root.querySelectorAll('[data-goto]').forEach(function (btn) {
        btn.addEventListener('click', function () { App.router.go(btn.getAttribute('data-goto')); });
      });

      function stat(label, value, foot, tone) {
        return '<div class="stat ' + (tone || '') + '"><div class="stat-label">' + U.esc(label) + '</div>'
          + '<div class="stat-value">' + U.esc(value) + '</div>'
          + '<div class="stat-foot">' + U.esc(foot || '') + '</div></div>';
      }
    }
  };
})(window);
