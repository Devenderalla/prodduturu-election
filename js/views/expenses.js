/* =========================================================
   views/expenses.js - lawful campaign expenditure register.
   Entries record what was paid, to which authorised vendor
   or campaign staff member, and against which receipt.
   There is no field anywhere that links a payment to a
   voter or to voting behaviour, by design.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};
  App.views = App.views || {};

  function catOptions() {
    var t = App.ui.t;
    return App.state.CATEGORIES.map(function (c) {
      return { value: c, label: t('exp.cat.' + c) };
    });
  }

  function expenseDialog(existing) {
    var U = App.ui, t = U.t;
    var e = existing || { date: U.todayISO(), category: 'printing', description: '', amount: '', receiptRef: '', payee: '', payeeType: 'vendor' };

    var body = '<div class="stack">'
      + U.fieldSelect('eCat', t('common.category'), e.category, catOptions())
      + U.fieldText('eDesc', t('common.description'), e.description, { maxlength: 140 })
      + U.fieldNumber('eAmt', t('common.amount') + ' (₹)', e.amount === '' ? '' : e.amount, { min: 0, step: '0.01' })
      + U.fieldText('eDate', t('common.date'), e.date, { type: 'date' })
      + U.fieldText('eRcpt', t('exp.receipt'), e.receiptRef, { maxlength: 60 })
      + U.fieldText('ePayee', t('exp.payee'), e.payee, { maxlength: 80 })
      + U.fieldSelect('ePType', t('exp.payeeType'), e.payeeType, [
        { value: 'vendor', label: t('exp.payeeVendor') },
        { value: 'staff', label: t('exp.payeeStaff') }
      ])
      + '<div class="notice notice-info"><div>' + U.esc(t('exp.lawfulBody')) + '</div></div>'
      + '</div>';

    U.openModal({
      title: existing ? t('exp.editOne') : t('exp.add'),
      bodyHtml: body, okLabel: t('common.save'),
      onOk: function () {
        var ok = true;
        ['eAmt', 'eCat', 'eDesc'].forEach(function (id) { U.showErr(id, ''); });
        var amt = U.floatVal('eAmt');
        if (amt === null || isNaN(amt) || amt <= 0) { U.showErr('eAmt', t('exp.errAmount')); ok = false; }
        var cat = U.val('eCat');
        if (!cat) { U.showErr('eCat', t('exp.errCategory')); ok = false; }
        var desc = U.val('eDesc');
        if (!desc) { U.showErr('eDesc', t('common.required')); ok = false; }
        if (!ok) return false;

        var rec = {
          date: U.val('eDate') || U.todayISO(),
          category: cat, description: desc,
          amount: Math.round(amt * 100) / 100,
          receiptRef: U.val('eRcpt'),
          payee: U.val('ePayee'),
          payeeType: U.val('ePType') === 'staff' ? 'staff' : 'vendor'
        };
        App.state.mutate(function (st) {
          if (existing) {
            var target = st.expenses.filter(function (x) { return x.id === existing.id; })[0];
            if (target) Object.keys(rec).forEach(function (k) { target[k] = rec[k]; });
          } else {
            rec.id = App.state.uid('ex');
            st.expenses.push(rec);
          }
          st.expenses.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
        });
        U.toast(t('common.saved'), 'ok');
        return true;
      }
    });
  }

  function exportCsv() {
    var U = App.ui, t = U.t, S = App.state.get(), d = App.state.derived;
    var rows = [[
      'Date', 'Category', 'Description', 'Amount (INR)', 'Receipt reference', 'Payee', 'Payee type'
    ]];
    S.expenses.forEach(function (e) {
      rows.push([e.date, t('exp.cat.' + e.category), e.description, e.amount.toFixed(2), e.receiptRef, e.payee, e.payeeType]);
    });
    rows.push([]);
    rows.push(['Total expenditure (INR)', '', '', d.expenseTotal().toFixed(2)]);
    rows.push(['Entries', '', '', String(S.expenses.length)]);
    rows.push(['Generated', new Date().toISOString()]);
    rows.push(['Village', S.election.village + ', ' + S.election.mandal + ', ' + S.election.state]);
    U.download('prodduturu-expenses-' + U.stamp() + '.csv', U.toCsv(rows), 'text/csv');
    U.toast(t('common.export') + ' ✓', 'ok');
  }

  App.views.expenses = {
    titleKey: 'nav.expenses',

    render: function (root) {
      var U = App.ui, C = App.charts, t = U.t, S = App.state.get(), d = App.state.derived;
      var byCat = d.expensesByCategory();
      var total = d.expenseTotal();
      var count = S.expenses.length;
      var largest = S.expenses.reduce(function (m, e) { return e.amount > m ? e.amount : m; }, 0);

      var html = '<div class="stack">';

      html += '<div class="notice notice-info"><div><b>' + U.esc(t('exp.lawful')) + '</b><br>'
        + U.esc(t('exp.lawfulBody')) + '</div></div>';

      html += '<div class="grid-2">'
        + '<div class="stat tone-brand"><div class="stat-label">' + U.esc(t('exp.total')) + '</div>'
        + '<div class="stat-value sm">' + U.esc(U.fmtMoney(total)) + '</div>'
        + '<div class="stat-foot">' + count + ' ' + U.esc(t('exp.count')) + '</div></div>'
        + '<div class="stat"><div class="stat-label">' + U.esc(t('exp.avg')) + '</div>'
        + '<div class="stat-value sm">' + U.esc(count ? U.fmtMoney(total / count) : '—') + '</div>'
        + '<div class="stat-foot">' + U.esc(t('exp.largest')) + ': ' + U.esc(largest ? U.fmtMoney(largest) : '—') + '</div></div>'
        + '</div>';

      if (U.isAdmin()) {
        html += '<div class="btn-grid">'
          + '<button class="btn btn-primary" id="addExp">+ ' + U.esc(t('exp.add')) + '</button>'
          + '<button class="btn" id="expCsv"' + (count ? '' : ' disabled') + '>' + U.esc(t('exp.exportCsv')) + '</button>'
          + '</div>';
      } else {
        html += '<div class="notice notice-warn"><div>' + U.esc(t('mode.adminOnlyBody')) + '</div></div>';
      }

      /* ---- category chart ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('exp.byCategory')) + '</h2>'
        + '<span class="hint">' + U.esc(U.fmtMoney(total)) + '</span></div>';
      if (byCat.length) {
        var segs = byCat.map(function (c) { return { label: t('exp.cat.' + c.category), value: c.amount }; });
        html += '<div class="chart-wrap" style="max-width:210px;margin:0 auto">'
          + C.donut(segs, { centerValue: U.fmtMoney(total).replace('₹', '₹'), centerLabel: t('exp.total'), ariaLabel: t('exp.byCategory') })
          + '</div>'
          + '<div class="legend">' + segs.map(function (s, i) {
            return '<div class="legend-item"><span class="legend-dot" style="background:' + C.PALETTE[i % C.PALETTE.length] + '"></span>'
              + '<span class="lg-name">' + U.esc(s.label) + '</span>'
              + '<span class="lg-val">' + U.esc(U.fmtMoney(s.value)) + ' <span style="color:var(--ink-3);font-weight:500">('
              + (total ? (s.value / total * 100).toFixed(1) : '0.0') + '%)</span></span></div>';
          }).join('') + '</div>';
      } else {
        html += U.empty(t('exp.noExpenses'), t('exp.noExpensesSub'));
      }
      html += '</div>';

      /* ---- entries ---- */
      html += '<div class="card"><div class="card-head"><h2>' + U.esc(t('exp.title')) + '</h2>'
        + '<span class="hint">' + count + '</span></div>';
      if (count) {
        html += '<div class="list">';
        S.expenses.forEach(function (e) {
          html += '<div class="list-item"><div class="li-main">'
            + '<div class="li-title">' + U.esc(e.description) + '</div>'
            + '<div class="li-meta">' + U.esc(t('exp.cat.' + e.category)) + ' · ' + U.esc(U.fmtDate(e.date)) + '</div>'
            + '<div class="li-meta">' + (e.payee ? U.esc(e.payee) + ' (' + U.esc(t(e.payeeType === 'staff' ? 'exp.payeeStaff' : 'exp.payeeVendor')) + ')' : '—')
            + (e.receiptRef ? ' · ' + U.esc(t('exp.receipt')) + ' ' + U.esc(e.receiptRef) : '') + '</div>'
            + (U.isAdmin() ? '<div style="margin-top:8px;display:flex;gap:6px">'
              + '<button class="btn btn-sm btn-ghost" data-edit="' + U.esc(e.id) + '">' + U.esc(t('common.edit')) + '</button>'
              + '<button class="btn btn-sm btn-ghost" style="color:var(--danger)" data-del="' + U.esc(e.id) + '">' + U.esc(t('common.delete')) + '</button>'
              + '</div>' : '')
            + '</div>'
            + '<div class="li-amount">' + U.esc(U.fmtMoney(e.amount)) + '</div>'
            + '</div>';
        });
        html += '</div>';
      } else {
        html += U.empty(t('exp.noExpenses'), t('exp.noExpensesSub'));
      }
      html += '</div></div>';

      root.innerHTML = html;

      var a = root.querySelector('#addExp');
      if (a) a.addEventListener('click', function () { expenseDialog(null); });
      var c = root.querySelector('#expCsv');
      if (c) c.addEventListener('click', exportCsv);

      root.querySelectorAll('[data-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-edit');
          var e = App.state.get().expenses.filter(function (x) { return x.id === id; })[0];
          if (e) expenseDialog(e);
        });
      });
      root.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-del');
          U.confirm({
            title: t('exp.deleteOne'), body: '', danger: true, okLabel: t('common.delete'),
            onOk: function () {
              App.state.mutate(function (st) {
                st.expenses = st.expenses.filter(function (x) { return x.id !== id; });
              });
              U.toast(t('common.deleted'), 'ok');
            }
          });
        });
      });
    }
  };
})(window);
