/* =========================================================
   views/results.js - officially reported candidate counts.
   This module stores and displays numbers that have been
   officially reported at the counting centre. It never
   estimates or projects a winner.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};
  App.views = App.views || {};

  function candidateLabel(c) {
    var lang = App.i18n.get();
    return (lang === 'te' && c.nameTe ? c.nameTe : c.name) || '—';
  }
  function symbolLabel(c) {
    var lang = App.i18n.get();
    return (lang === 'te' && c.symbolTe ? c.symbolTe : c.symbol) || '—';
  }

  function editCandidatesDialog() {
    var U = App.ui, t = U.t, S = App.state.get();
    var body = '<div class="stack">';
    S.candidates.forEach(function (c, i) {
      body += '<div style="border:1px solid var(--line);border-radius:12px;padding:10px">'
        + '<div class="stat-label" style="margin-bottom:8px">' + U.esc(t('res.candidate')) + ' ' + (i + 1) + '</div>'
        + U.fieldText('cn_' + c.id, t('res.name'), c.name, { maxlength: 60 })
        + '<div style="height:8px"></div>'
        + U.fieldText('cnt_' + c.id, t('res.nameTe'), c.nameTe, { maxlength: 60 })
        + '<div style="height:8px"></div>'
        + U.fieldText('cs_' + c.id, t('res.symbol'), c.symbol, { maxlength: 40, help: t('res.symbolHint') })
        + '<div style="height:8px"></div>'
        + U.fieldText('cst_' + c.id, t('res.symbol') + ' (తెలుగు)', c.symbolTe, { maxlength: 40 })
        + '</div>';
    });
    body += '</div>';

    U.openModal({
      title: t('res.editCandidates'), bodyHtml: body, okLabel: t('common.save'),
      onOk: function () {
        var ok = true;
        S.candidates.forEach(function (c) {
          U.showErr('cn_' + c.id, '');
          if (!U.val('cn_' + c.id)) { U.showErr('cn_' + c.id, t('common.required')); ok = false; }
        });
        if (!ok) return false;
        App.state.mutate(function (st) {
          st.candidates.forEach(function (c) {
            c.name = U.val('cn_' + c.id);
            c.nameTe = U.val('cnt_' + c.id);
            c.symbol = U.val('cs_' + c.id);
            c.symbolTe = U.val('cst_' + c.id);
          });
        });
        U.toast(t('common.saved'), 'ok');
        return true;
      }
    });
  }

  function enterVotesDialog() {
    var U = App.ui, t = U.t, S = App.state.get(), d = App.state.derived;
    var body = '<div class="stack">'
      + '<div class="notice notice-accent"><div><b>' + U.esc(t('res.officialNote')) + '</b><br>'
      + U.esc(t('res.officialNoteBody')) + '</div></div>';
    S.candidates.forEach(function (c) {
      body += U.fieldNumber('v_' + c.id, candidateLabel(c) + ' (' + symbolLabel(c) + ')', c.votes, { min: 0, placeholder: '0' });
    });
    body += U.fieldNumber('v_rejected', t('res.rejected'), S.counting.rejected, { min: 0 });
    body += U.fieldSelect('v_status', t('res.status'), S.counting.status, [
      { value: 'not_started', label: t('res.statusNotStarted') },
      { value: 'counting', label: t('res.statusCounting') },
      { value: 'final', label: t('res.statusFinal') }
    ]);
    body += '</div>';

    U.openModal({
      title: t('res.enterVotes'), bodyHtml: body, okLabel: t('common.save'),
      onOk: function () {
        var ok = true, votes = {};
        S.candidates.forEach(function (c) {
          var id = 'v_' + c.id;
          U.showErr(id, '');
          var v = U.intVal(id);
          if (v === null) { votes[c.id] = null; return; }
          if (isNaN(v)) { U.showErr(id, t('common.invalidNumber')); ok = false; return; }
          if (v < 0) { U.showErr(id, t('res.errVotes')); ok = false; return; }
          votes[c.id] = v;
        });
        U.showErr('v_rejected', '');
        var rej = U.intVal('v_rejected');
        if (rej === null) rej = 0;
        if (isNaN(rej) || rej < 0) { U.showErr('v_rejected', t('res.errVotes')); ok = false; }
        if (!ok) return false;

        var status = U.val('v_status');
        App.state.mutate(function (st) {
          st.candidates.forEach(function (c) { c.votes = votes[c.id]; });
          st.counting.rejected = rej;
          st.counting.status = status;
        });

        // Consistency warning only - official counts may legitimately arrive
        // before the turnout log is brought up to date.
        var counted = d.countedVotes(), actual = d.actualTurnout();
        if (actual > 0 && counted > actual) {
          U.toast(t('res.overTurnout', { a: U.fmtInt(counted), b: U.fmtInt(actual) }), 'err');
        } else {
          U.toast(t('common.saved'), 'ok');
        }
        return true;
      }
    });
  }

  App.views.results = {
    titleKey: 'nav.results',

    render: function (root) {
      var U = App.ui, C = App.charts, t = U.t, S = App.state.get(), d = App.state.derived;
      var standings = d.standings();
      var valid = d.validVotes();
      var rejected = d.rejectedVotes();
      var lead = d.leadMargin();
      var entered = d.anyVotesEntered();

      var statusLabel = S.counting.status === 'final' ? t('res.statusFinal')
        : S.counting.status === 'counting' ? t('res.statusCounting') : t('res.statusNotStarted');

      var html = '<div class="stack">';

      html += '<div class="notice notice-accent"><div><b>' + U.esc(t('res.officialNote')) + '</b><br>'
        + U.esc(t('res.officialNoteBody')) + '</div></div>';

      /* ---- summary stats ---- */
      html += '<div class="grid-2">'
        + '<div class="stat tone-brand"><div class="stat-label">' + U.esc(t('res.validVotes')) + '</div>'
        + '<div class="stat-value">' + (entered ? U.fmtInt(valid) : '—') + '</div>'
        + '<div class="stat-foot">' + U.esc(t('res.status')) + ': ' + U.esc(statusLabel) + '</div></div>'
        + '<div class="stat tone-danger"><div class="stat-label">' + U.esc(t('res.rejected')) + '</div>'
        + '<div class="stat-value">' + U.fmtInt(rejected) + '</div>'
        + '<div class="stat-foot">' + (d.countedVotes() ? U.fmtPct(d.pct(rejected, d.countedVotes())) : '—') + '</div></div>'
        + '</div>';

      html += '<div class="grid-2">'
        + '<div class="stat"><div class="stat-label">' + U.esc(t('res.lead')) + '</div>'
        + '<div class="stat-value">' + (entered && valid ? (lead.tie ? U.esc(t('res.tie')) : U.fmtInt(lead.margin)) : '—') + '</div>'
        + '<div class="stat-foot">' + (entered && valid && lead.leader && !lead.tie
            ? U.esc(t('res.leader')) + ': ' + U.esc(C.truncate(candidateLabel(lead.leader), 18)) : '—') + '</div></div>'
        + '<div class="stat"><div class="stat-label">' + U.esc(t('res.progress')) + '</div>'
        + '<div class="stat-value">' + U.fmtPct(d.countingProgressPct()) + '</div>'
        + '<div class="stat-foot">' + U.fmtInt(d.countedVotes()) + ' / ' + U.fmtInt(d.actualTurnout() || d.expectedTurnout()) + '</div></div>'
        + '</div>';

      html += '<div class="card">'
        + C.progress(d.countedVotes(), d.actualTurnout() || d.expectedTurnout(), {
          label: t('res.progress'), valueLabel: U.fmtPct(d.countingProgressPct()), tone: 'warn'
        }) + '</div>';

      /* ---- admin actions ---- */
      if (U.isAdmin()) {
        html += '<div class="btn-grid">'
          + '<button class="btn btn-primary" id="enterVotes">' + U.esc(t('res.enterVotes')) + '</button>'
          + '<button class="btn" id="editCands">' + U.esc(t('res.editCandidates')) + '</button>'
          + '</div>';
      }

      /* ---- candidate comparison ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('res.compare')) + '</h2>'
        + '<span class="badge badge-official">' + U.esc(t('common.official')) + '</span></div>';
      if (entered && valid > 0) {
        html += '<div class="chart-wrap">' + C.hbars(standings.map(function (c) {
          return {
            label: candidateLabel(c), value: c.votes,
            valueLabel: U.fmtInt(c.votes), sub: symbolLabel(c) + ' · ' + U.fmtPct(c.share)
          };
        }), { ariaLabel: t('res.compare') }) + '</div>';
      } else {
        html += U.empty(t('res.noVotes'), t('res.noVotesSub'));
      }
      html += '</div>';

      /* ---- share donut ---- */
      if (entered && valid > 0) {
        var segs = standings.map(function (c, i) {
          return { label: candidateLabel(c) + ' (' + symbolLabel(c) + ')', value: c.votes };
        });
        html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('res.share')) + '</h2></div>'
          + '<div class="chart-wrap" style="max-width:210px;margin:0 auto">'
          + C.donut(segs, { centerValue: U.fmtInt(valid), centerLabel: t('res.validVotes'), ariaLabel: t('res.share') })
          + '</div>' + C.legend(segs) + '</div>';
      }

      /* ---- candidate table ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('res.candidate')) + '</h2>'
        + '<span class="hint">' + S.candidates.length + '</span></div>'
        + '<div class="table-scroll"><table><thead><tr>'
        + '<th>' + U.esc(t('res.candidate')) + '</th><th>' + U.esc(t('res.symbol')) + '</th>'
        + '<th>' + U.esc(t('res.votes')) + '</th><th>' + U.esc(t('res.share')) + '</th></tr></thead><tbody>';
      S.candidates.forEach(function (c) {
        var v = c.votes == null ? null : c.votes;
        html += '<tr><td>' + U.esc(candidateLabel(c)) + '</td><td>' + U.esc(symbolLabel(c)) + '</td>'
          + '<td><b>' + (v == null ? '—' : U.fmtInt(v)) + '</b></td>'
          + '<td>' + (v == null || !valid ? '—' : U.fmtPct(d.pct(v, valid))) + '</td></tr>';
      });
      html += '<tr style="border-top:2px solid var(--line-strong)"><td><b>' + U.esc(t('res.validVotes')) + '</b></td><td></td>'
        + '<td><b>' + (entered ? U.fmtInt(valid) : '—') + '</b></td><td><b>' + (valid ? '100.0%' : '—') + '</b></td></tr>'
        + '<tr><td>' + U.esc(t('res.rejected')) + '</td><td></td><td><b>' + U.fmtInt(rejected) + '</b></td><td>—</td></tr>'
        + '</tbody></table></div></div>';

      if (!U.isAdmin()) {
        html += '<div class="notice notice-info"><div>' + U.esc(t('mode.adminOnlyBody')) + '</div></div>';
      }

      html += '</div>';
      root.innerHTML = html;

      var ev = root.querySelector('#enterVotes');
      if (ev) ev.addEventListener('click', enterVotesDialog);
      var ec = root.querySelector('#editCands');
      if (ec) ec.addEventListener('click', editCandidatesDialog);
    }
  };
})(window);
