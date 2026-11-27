/* =========================================================
   views/settings.js - configuration, backup, restore, reset.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};
  App.views = App.views || {};

  /* ---------------- election config dialog ---------------- */
  function electionDialog() {
    var U = App.ui, t = U.t, S = App.state.get(), d = App.state.derived;
    var body = '<div class="stack">'
      + U.fieldText('elDate', t('turnout.pollDate'), S.election.pollDate, { type: 'date' })
      + U.fieldNumber('elEst', t('set.originalEstimate'), S.election.originalEstimate, { min: 0 })
      + U.fieldNumber('elAbs', t('set.absentees'), S.election.expectedAbsentees, { min: 0, max: d.totalVoters() })
      + U.fieldNumber('elOff', t('set.officialTotal'), S.election.officialTotal, { min: 0, help: t('set.officialHelp'), placeholder: t('common.notSet') })
      + U.fieldSelect('elUse', t('set.useOfficial'), S.election.useOfficialTotal ? '1' : '0', [
        { value: '0', label: t('common.no') }, { value: '1', label: t('common.yes') }
      ])
      + '<div class="notice notice-info"><div>' + U.esc(t('set.draftTotal')) + ': <b>' + U.fmtInt(d.draftTotal()) + '</b></div></div>'
      + '</div>';

    U.openModal({
      title: t('set.election'), bodyHtml: body, okLabel: t('common.save'),
      onOk: function () {
        var ok = true;
        ['elEst', 'elAbs', 'elOff'].forEach(function (id) { U.showErr(id, ''); });
        var est = U.intVal('elEst'); if (est === null) est = 0;
        if (isNaN(est) || est < 0) { U.showErr('elEst', t('common.invalidNumber')); ok = false; }
        var off = U.intVal('elOff');
        if (off !== null && (isNaN(off) || off < 0)) { U.showErr('elOff', t('common.invalidNumber')); ok = false; }
        var useOff = U.val('elUse') === '1';
        var effectiveTotal = (useOff && off) ? off : d.draftTotal();
        var abs = U.intVal('elAbs'); if (abs === null) abs = 0;
        if (isNaN(abs) || abs < 0 || abs > effectiveTotal) {
          U.showErr('elAbs', t('set.errAbsentees', { n: U.fmtInt(effectiveTotal) })); ok = false;
        }
        if (useOff && !off) { U.showErr('elOff', t('common.required')); ok = false; }
        if (!ok) return false;

        App.state.mutate(function (st) {
          st.election.pollDate = U.val('elDate');
          st.election.originalEstimate = est;
          st.election.expectedAbsentees = abs;
          st.election.officialTotal = off;
          st.election.useOfficialTotal = useOff;
        });
        U.toast(t('common.saved'), 'ok');
        return true;
      }
    });
  }

  /* ---------------- roll parts dialog ---------------- */
  function partsDialog() {
    var U = App.ui, t = U.t, S = App.state.get();
    var body = '<div class="stack">';
    S.election.parts.forEach(function (p) {
      body += '<div style="border:1px solid var(--line);border-radius:12px;padding:10px">'
        + U.fieldText('pn_' + p.id, t('set.partName'), p.name, { maxlength: 40 })
        + '<div style="height:8px"></div>'
        + U.fieldNumber('pv_' + p.id, t('set.partVoters'), p.voters, { min: 0 })
        + '<div style="height:8px"></div>'
        + U.fieldNumber('pm_' + p.id, t('common.male'), p.male, { min: 0 })
        + '<div style="height:8px"></div>'
        + U.fieldNumber('pf_' + p.id, t('common.female'), p.female, { min: 0 })
        + '</div>';
    });
    body += '<p class="help">' + U.esc(t('set.officialHelp')) + '</p></div>';

    U.openModal({
      title: t('set.rollParts'), bodyHtml: body, okLabel: t('common.save'),
      onOk: function () {
        var ok = true, next = {};
        S.election.parts.forEach(function (p) {
          U.showErr('pv_' + p.id, ''); U.showErr('pn_' + p.id, '');
          var name = U.val('pn_' + p.id);
          if (!name) { U.showErr('pn_' + p.id, t('common.required')); ok = false; }
          var v = U.intVal('pv_' + p.id);
          if (v === null) v = 0;
          if (isNaN(v) || v < 0) { U.showErr('pv_' + p.id, t('set.errPartVoters')); ok = false; }
          var mv = U.intVal('pm_' + p.id); if (mv === null || isNaN(mv) || mv < 0) mv = 0;
          var fv = U.intVal('pf_' + p.id); if (fv === null || isNaN(fv) || fv < 0) fv = 0;
          next[p.id] = { name: name, voters: v, male: mv, female: fv };
        });
        if (!ok) return false;
        App.state.mutate(function (st) {
          st.election.parts.forEach(function (p) {
            if (next[p.id]) {
              p.name = next[p.id].name; p.voters = next[p.id].voters;
              p.male = next[p.id].male; p.female = next[p.id].female;
            }
          });
          // keep absentees inside the new ceiling
          var tot = st.election.parts.reduce(function (s, p) { return s + p.voters; }, 0);
          var ceiling = (st.election.useOfficialTotal && st.election.officialTotal) ? st.election.officialTotal : tot;
          if (st.election.expectedAbsentees > ceiling) st.election.expectedAbsentees = ceiling;
        });
        U.toast(t('common.saved'), 'ok');
        return true;
      }
    });
  }

  /* ---------------- PIN dialog ---------------- */
  function pinDialog() {
    var U = App.ui, t = U.t;
    U.openModal({
      title: t('set.setPin'),
      bodyHtml: '<div class="stack">'
        + U.fieldText('pin1', t('mode.pinSet'), '', { type: 'password', inputmode: 'numeric', maxlength: 8 })
        + U.fieldText('pin2', t('common.confirm'), '', { type: 'password', inputmode: 'numeric', maxlength: 8 })
        + '<div class="notice notice-warn"><div>' + U.esc(t('mode.pinNote')) + '</div></div></div>',
      okLabel: t('common.save'),
      onOk: function () {
        U.showErr('pin1', ''); U.showErr('pin2', '');
        var a = U.val('pin1'), b = U.val('pin2');
        if (!/^\d{4,8}$/.test(a)) { U.showErr('pin1', t('set.errPin')); return false; }
        if (a !== b) { U.showErr('pin2', t('mode.pinWrong')); return false; }
        U.hashPin(a).then(function (h) {
          App.state.mutate(function (st) { st.settings.adminPin = h; });
          U.toast(t('mode.pinSaved'), 'ok');
        });
        return true;
      }
    });
  }

  /* ---------------- CSV report export ---------------- */
  function exportCsvReports() {
    var U = App.ui, t = U.t, S = App.state.get(), d = App.state.derived;
    var rows = [];
    rows.push(['Prodduturu Election Analytics - aggregate report']);
    rows.push(['Generated', new Date().toISOString()]);
    rows.push(['Village', S.election.village, 'Mandal', S.election.mandal, 'State', S.election.state]);
    rows.push(['Election', S.election.type, 'Polling date', S.election.pollDate || '']);
    rows.push(['Assembly constituency', S.election.ac || '']);
    rows.push(['Roll identification', S.election.rollId || '']);
    rows.push(['Roll published', S.election.rollPublished || '', 'Age as on', S.election.ageAsOn || '']);
    rows.push([]);
    rows.push(['AGGREGATE FIGURES']);
    rows.push(['Metric', 'Value']);
    rows.push(['Original estimated voters', S.election.originalEstimate]);
    rows.push(['Draft roll total', d.draftTotal()]);
    rows.push(['Final official total', S.election.officialTotal == null ? 'not set' : S.election.officialTotal]);
    rows.push(['Registered voters in use', d.totalVoters()]);
    rows.push(['Expected absentees', S.election.expectedAbsentees]);
    rows.push(['Expected turnout', d.expectedTurnout()]);
    rows.push(['Expected turnout %', d.expectedTurnoutPct().toFixed(2)]);
    rows.push(['Actual aggregate turnout', d.actualTurnout()]);
    rows.push(['Actual turnout %', d.actualTurnoutPct().toFixed(2)]);
    rows.push(['Remaining turnout', d.remainingTurnout()]);
    rows.push(['Valid votes counted', d.validVotes()]);
    rows.push(['Rejected votes', d.rejectedVotes()]);
    rows.push(['Counting status', S.counting.status]);
    rows.push([]);
    rows.push(['ELECTORAL ROLL PARTS']);
    rows.push(['Part', 'Registered voters', 'Male', 'Female', 'Third gender', 'Aggregate turnout', 'Turnout %']);
    S.election.parts.forEach(function (p) {
      var pt = d.partTurnout(p.id);
      rows.push([p.name, p.voters, p.male, p.female, p.thirdGender, pt, d.pct(pt, p.voters).toFixed(2)]);
    });
    var gt = d.genderTotals();
    rows.push(['Total', d.draftTotal(), gt.male, gt.female, gt.thirdGender, d.actualTurnout(), d.actualTurnoutPct().toFixed(2)]);
    rows.push([]);
    rows.push(['CANDIDATES (officially reported counts)']);
    rows.push(['Candidate', 'Symbol', 'Reported votes', 'Vote share %']);
    S.candidates.forEach(function (c) {
      rows.push([c.name, c.symbol, c.votes == null ? '' : c.votes,
        c.votes == null || !d.validVotes() ? '' : d.pct(c.votes, d.validVotes()).toFixed(2)]);
    });
    rows.push([]);
    rows.push(['HOURLY AGGREGATE TURNOUT']);
    rows.push(['Time'].concat(S.election.parts.map(function (p) { return p.name; })).concat(['Total']));
    S.turnout.readings.forEach(function (r) {
      var vals = S.election.parts.map(function (p) { return App.state.num(r.counts[p.id], 0); });
      rows.push([r.time].concat(vals).concat([vals.reduce(function (a, b) { return a + b; }, 0)]));
    });
    rows.push([]);
    rows.push(['CAMPAIGN EXPENSES']);
    rows.push(['Date', 'Category', 'Description', 'Amount (INR)', 'Receipt', 'Payee', 'Payee type']);
    S.expenses.forEach(function (e) {
      rows.push([e.date, t('exp.cat.' + e.category), e.description, e.amount.toFixed(2), e.receiptRef, e.payee, e.payeeType]);
    });
    rows.push(['Total expenditure', '', '', d.expenseTotal().toFixed(2)]);
    rows.push([]);
    rows.push(['HISTORICAL ELECTIONS']);
    rows.push(['Year', 'Registered', 'Votes cast', 'Turnout %', 'Winner', 'Winner votes', 'Runner-up', 'Runner-up votes']);
    S.analytics.history.forEach(function (h) {
      rows.push([h.year, h.registered, h.turnout, d.pct(h.turnout, h.registered).toFixed(2),
        h.winner, h.winnerVotes, h.runnerUp, h.runnerUpVotes]);
    });

    U.download('prodduturu-report-' + U.stamp() + '.csv', U.toCsv(rows), 'text/csv');
    U.toast(t('common.export') + ' ✓', 'ok');
  }

  function exportJson() {
    var U = App.ui, t = U.t;
    var obj = App.state.exportObject();
    U.download('prodduturu-backup-' + U.stamp() + '.json', JSON.stringify(obj, null, 2), 'application/json');
    U.toast(t('common.export') + ' ✓', 'ok');
  }

  function importJson() {
    var U = App.ui, t = U.t;
    U.pickFile('*/*').then(function (file) {
      if (!file) return;
      var parsed;
      try { parsed = JSON.parse(file.text); }
      catch (e) { U.toast(t('set.importBad'), 'err'); return; }
      if (!parsed || typeof parsed !== 'object' || (!parsed.election && !parsed.candidates)) {
        U.toast(t('set.importBad'), 'err'); return;
      }
      U.confirm({
        title: t('set.importConfirm'),
        body: t('set.importConfirmBody', { d: U.fmtDateTime(parsed.exportedAt || parsed.updatedAt) }),
        danger: true, okLabel: t('common.import'),
        onOk: function () {
          App.state.replaceAll(parsed).then(function () {
            U.toast(t('set.importDone'), 'ok');
            App.router.go('dashboard');
          });
        }
      });
    });
  }

  App.views.settings = {
    titleKey: 'nav.settings',

    render: function (root) {
      var U = App.ui, t = U.t, S = App.state.get(), d = App.state.derived;

      var html = '<div class="stack">';

      /* ---- figures in use ---- */
      html += '<div class="card"><div class="card-head"><div><h2>' + U.esc(t('set.election')) + '</h2>'
        + '<p class="card-sub">' + U.esc(t('app.place')) + '</p></div>'
        + (U.isAdmin() ? '<button class="btn btn-sm btn-ghost" id="editElection">' + U.esc(t('common.edit')) + '</button>' : '')
        + '</div>'
        + '<div class="table-scroll"><table><tbody>'
        + row(t('set.registered'), U.fmtInt(d.totalVoters()))
        + row(t('set.originalEstimate'), U.fmtInt(S.election.originalEstimate))
        + row(t('set.draftTotal'), U.fmtInt(d.draftTotal()))
        + row(t('set.officialTotal'), S.election.officialTotal == null ? t('common.notSet') : U.fmtInt(S.election.officialTotal))
        + row(t('set.useOfficial'), S.election.useOfficialTotal ? t('common.yes') : t('common.no'))
        + row(t('set.absentees'), U.fmtInt(S.election.expectedAbsentees))
        + row(t('dash.expTurnout'), U.fmtInt(d.expectedTurnout()) + ' (' + U.fmtPct(d.expectedTurnoutPct()) + ')')
        + row(t('turnout.pollDate'), S.election.pollDate ? U.fmtDate(S.election.pollDate) : t('common.notSet'))
        + '</tbody></table></div></div>';

      /* ---- official roll details ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('set.rollMeta')) + '</h2>'
        + '<span class="badge badge-official">' + U.esc(t('common.official')) + '</span></div>'
        + '<div class="table-scroll"><table><tbody>'
        + row(t('set.ac'), S.election.ac || t('common.notSet'))
        + row(t('set.rollId'), S.election.rollId || t('common.notSet'), false, true)
        + row(t('set.rollPublished'), S.election.rollPublished ? U.fmtDate(S.election.rollPublished) : t('common.notSet'))
        + row(t('set.ageAsOn'), S.election.ageAsOn ? U.fmtDate(S.election.ageAsOn) : t('common.notSet'))
        + row(t('common.male'), U.fmtInt(d.genderTotals().male))
        + row(t('common.female'), U.fmtInt(d.genderTotals().female))
        + '</tbody></table></div>'
        + '<div class="notice notice-accent" style="margin-top:10px"><div>' + U.esc(t('set.verifiedRoll')) + '</div></div>'
        + '</div>';

      /* ---- parts ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('set.rollParts')) + '</h2>'
        + (U.isAdmin() ? '<button class="btn btn-sm btn-ghost" id="editParts">' + U.esc(t('common.edit')) + '</button>' : '')
        + '</div><div class="table-scroll"><table><tbody>';
      S.election.parts.forEach(function (p) { html += row(p.name, U.fmtInt(p.voters) + ' ' + t('common.voters')); });
      html += row('<b>' + U.esc(t('common.total')) + '</b>', '<b>' + U.fmtInt(d.draftTotal()) + '</b>', true);
      html += '</tbody></table></div></div>';

      /* ---- candidates ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('set.candidates')) + '</h2>'
        + '<span class="hint">' + U.esc(t('set.candidateCount')) + '</span></div>'
        + '<div class="table-scroll"><table><tbody>';
      S.candidates.forEach(function (c) {
        html += row(U.esc(c.name) + (c.nameTe ? ' · ' + U.esc(c.nameTe) : ''), c.symbol ? U.esc(c.symbol) : t('common.notSet'), true);
      });
      html += '</tbody></table></div>'
        + (U.isAdmin() ? '<button class="btn btn-ghost btn-block" style="margin-top:10px" data-goto="results">'
          + U.esc(t('res.editCandidates')) + '</button>' : '')
        + '</div>';

      /* ---- appearance ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('set.appearance')) + '</h2></div>'
        + '<div class="field"><label>' + U.esc(t('set.language')) + '</label>'
        + '<div class="seg">'
        + '<button type="button" data-lang="en"' + (App.i18n.get() === 'en' ? ' class="is-active"' : '') + '>English</button>'
        + '<button type="button" data-lang="te"' + (App.i18n.get() === 'te' ? ' class="is-active"' : '') + '>తెలుగు</button>'
        + '</div></div>'
        + '<div class="field" style="margin-top:12px"><label>' + U.esc(t('set.theme')) + '</label>'
        + '<div class="seg">'
        + '<button type="button" data-theme="light"' + (S.settings.theme === 'light' ? ' class="is-active"' : '') + '>' + U.esc(t('set.themeLight')) + '</button>'
        + '<button type="button" data-theme="dark"' + (S.settings.theme === 'dark' ? ' class="is-active"' : '') + '>' + U.esc(t('set.themeDark')) + '</button>'
        + '<button type="button" data-theme="auto"' + (S.settings.theme === 'auto' ? ' class="is-active"' : '') + '>' + U.esc(t('set.themeAuto')) + '</button>'
        + '</div></div></div>';

      /* ---- admin PIN ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('set.security')) + '</h2>'
        + '<span class="badge ' + (S.settings.adminPin ? 'badge-official' : 'badge-demo') + '">'
        + U.esc(S.settings.adminPin ? t('set.pinActive') : t('common.notSet')) + '</span></div>'
        + '<p class="card-sub" style="margin-bottom:10px">' + U.esc(S.settings.adminPin ? t('mode.pinNote') : t('set.pinInactive')) + '</p>'
        + '<div class="btn-grid">'
        + '<button class="btn btn-primary" id="setPin">' + U.esc(t('set.setPin')) + '</button>'
        + '<button class="btn btn-ghost" id="clearPin"' + (S.settings.adminPin ? '' : ' disabled') + '>' + U.esc(t('set.clearPin')) + '</button>'
        + '</div></div>';

      /* ---- data & backup ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('set.data')) + '</h2>'
        + '<span class="badge">' + U.esc(App.db.engine()) + '</span></div>'
        + '<div class="table-scroll"><table><tbody>'
        + row(t('set.storage'), U.esc(App.db.engine()), true)
        + row(t('common.lastUpdated'), U.esc(U.fmtDateTime(S.updatedAt)), true)
        + row(t('set.version'), U.esc(S.appVersion), true)
        + row(t('turnout.readings'), U.fmtInt(S.turnout.readings.length), true)
        + row(t('exp.count'), U.fmtInt(S.expenses.length), true)
        + '</tbody></table></div>'
        + '<div class="btn-grid" style="margin-top:12px">'
        + '<button class="btn btn-primary" id="expJson">' + U.esc(t('set.exportJson')) + '</button>'
        + '<button class="btn" id="impJson">' + U.esc(t('set.importJson')) + '</button>'
        + '<button class="btn" id="expCsvAll">' + U.esc(t('set.exportCsv')) + '</button>'
        + '<button class="btn btn-danger" id="resetAll">' + U.esc(t('set.resetAll')) + '</button>'
        + '</div>'
        + '<div class="notice notice-warn" style="margin-top:12px"><div><b>' + U.esc(t('set.deviceNote')) + '</b><br>'
        + U.esc(t('set.deviceNoteBody')) + '</div></div>'
        + '</div>';

      /* ---- voter roll (local only) ---- */
      var rollMeta = App.roll.meta();
      var rollCounts = App.roll.partCounts();
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('set.roll')) + '</h2>'
        + '<span class="badge ' + (rollMeta ? 'badge-official' : 'badge-demo') + '">'
        + U.esc(rollMeta ? t('set.rollLoaded', { n: U.fmtInt(rollMeta.count) }) : t('common.notSet')) + '</span></div>';
      if (rollMeta) {
        html += '<div class="table-scroll"><table><tbody>'
          + row(t('common.total'), U.fmtInt(rollMeta.count))
          + Object.keys(rollCounts).sort().map(function (k) {
              return row(t('common.part') + ' ' + k, U.fmtInt(rollCounts[k]));
            }).join('')
          + row(t('set.rollGenerated'), rollMeta.generatedAt ? U.fmtDateTime(rollMeta.generatedAt) : '—')
          + '</tbody></table></div>';
        if (rollMeta.includesEpic) {
          html += '<div class="notice notice-warn" style="margin-top:10px"><div>' + U.esc(t('set.rollEpicWarn')) + '</div></div>';
        }
      } else {
        html += '<p class="card-sub">' + U.esc(t('set.rollNone')) + '</p>';
      }
      html += '<div class="btn-grid" style="margin-top:12px">'
        + '<button class="btn btn-primary" id="rollImport">' + U.esc(t('set.rollImport')) + '</button>'
        + '<button class="btn btn-ghost" id="rollClear"' + (rollMeta ? '' : ' disabled') + '>' + U.esc(t('set.rollClear')) + '</button>'
        + '</div>'
        + '<div class="notice notice-warn" style="margin-top:12px"><div>' + U.esc(t('set.rollHelp')) + '</div></div>'
        + '</div>';

      /* ---- future phase ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('set.future')) + '</h2>'
        + '<span class="badge badge-future">' + U.esc(t('common.future')) + '</span></div>'
        + '<div class="list">'
        + ['ocr', 'anon', 'auth', 'cloud', 'sync', 'roles', 'audit', 'pwa'].map(function (k) {
          return '<div class="list-item"><div class="li-main"><div class="li-title" style="font-size:13px">'
            + U.esc(t('set.f.' + k)) + '</div></div>'
            + '<span class="badge badge-future">' + U.esc(t('common.future')) + '</span></div>';
        }).join('')
        + '</div><p class="card-sub" style="margin-top:10px">' + U.esc(t('set.futureBody')) + '</p></div>';

      html += '</div>';
      root.innerHTML = html;

      function row(label, value, raw, wrap) {
        return '<tr><td style="color:var(--ink-2)">' + (raw ? label : U.esc(label)) + '</td>'
          + '<td' + (wrap ? ' class="wrap"' : '') + '><b>' + (raw ? value : U.esc(value)) + '</b></td></tr>';
      }

      /* ---- wiring ---- */
      bind('#editElection', electionDialog);
      bind('#editParts', partsDialog);
      bind('#setPin', pinDialog);
      bind('#expJson', exportJson);
      bind('#impJson', importJson);
      bind('#expCsvAll', exportCsvReports);
      bind('#clearPin', function () {
        U.confirm({
          title: t('set.clearPin'), body: t('mode.pinNote'), danger: true, okLabel: t('common.delete'),
          onOk: function () {
            App.state.mutate(function (st) { st.settings.adminPin = null; });
            U.toast(t('set.pinRemoved'), 'ok');
          }
        });
      });
      bind('#rollImport', function () {
        U.pickFile('*/*').then(function (file) {
          if (!file) return;
          var parsed;
          try { parsed = JSON.parse(file.text); }
          catch (e) { U.toast(t('set.rollBad'), 'err'); return; }
          App.roll.set(parsed).then(function (n) {
            U.toast(t('set.rollDone') + ' (' + U.fmtInt(n) + ')', 'ok');
            App.router.go('settings');
          }).catch(function (err) {
            U.toast(/quota/i.test(err && err.message) ? t('set.rollQuota') : t('set.rollBad'), 'err');
          });
        });
      });
      bind('#rollClear', function () {
        U.confirm({
          title: t('set.rollConfirmClear'), body: t('set.rollHelp'), danger: true, okLabel: t('common.delete'),
          onOk: function () {
            App.roll.clear().then(function () {
              U.toast(t('set.rollRemoved'), 'ok');
              App.router.go('settings');
            });
          }
        });
      });
      bind('#resetAll', function () {
        U.confirm({
          title: t('set.resetConfirm'), body: t('set.resetConfirmBody'), danger: true, okLabel: t('common.reset'),
          onOk: function () {
            App.state.reset().then(function () {
              U.toast(t('set.resetDone'), 'ok');
              App.router.go('dashboard');
            });
          }
        });
      });

      root.querySelectorAll('[data-lang]').forEach(function (b) {
        b.addEventListener('click', function () { App.setLang(b.getAttribute('data-lang')); });
      });
      root.querySelectorAll('[data-theme]').forEach(function (b) {
        b.addEventListener('click', function () { App.setTheme(b.getAttribute('data-theme')); });
      });
      root.querySelectorAll('[data-goto]').forEach(function (b) {
        b.addEventListener('click', function () { App.router.go(b.getAttribute('data-goto')); });
      });

      function bind(sel, fn) {
        var el = root.querySelector(sel);
        if (el) el.addEventListener('click', fn);
      }
    }
  };
})(window);
