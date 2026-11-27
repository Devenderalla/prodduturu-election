/* =========================================================
   state.js - single source of truth + derived statistics
   All election figures held here are AGGREGATE figures.
   No per-voter political data is modelled anywhere.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  var APP_VERSION = '1.0.0';
  var SCHEMA_VERSION = 1;

  var CATEGORIES = ['printing', 'publicity', 'transport', 'meetings', 'audio', 'refresh', 'office', 'staff', 'fees', 'other'];

  function defaults() {
    return {
      schema: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      updatedAt: null,
      settings: {
        lang: 'en',
        theme: 'light',
        mode: 'volunteer',
        adminPin: null          // {hash, algo} - device-local gate only
      },
      election: {
        village: 'Prodduturu',
        mandal: 'Kankipadu',
        district: 'NTR',
        state: 'Andhra Pradesh',
        type: 'Village President (Sarpanch)',
        ac: '78-Penamaluru',
        rollId: 'Draft Electoral Roll of Special Intensive Revision, 2026',
        rollPublished: '2026-07-31',
        ageAsOn: '2026-07-01',
        pollDate: '',
        originalEstimate: 2700,     // original estimated voter count
        officialTotal: null,        // set after verification of the final roll
        useOfficialTotal: false,
        expectedAbsentees: 300,     // editable
        /* Verified 2026-11-27 against the SUMMARY OF ELECTORS page of each
           supplied draft-roll PDF. Aggregate counts only - no elector records. */
        parts: [
          { id: '235', name: 'Part 235', voters: 1096, male: 522, female: 574, thirdGender: 0 },
          { id: '236', name: 'Part 236', voters: 1018, male: 490, female: 528, thirdGender: 0 }
        ]
      },
      candidates: [
        { id: 'c1', name: 'Candidate 1', nameTe: '', symbol: 'Scissors', symbolTe: 'కత్తెర', votes: null },
        { id: 'c2', name: 'Candidate 2', nameTe: '', symbol: '', symbolTe: '', votes: null },
        { id: 'c3', name: 'Candidate 3', nameTe: '', symbol: '', symbolTe: '', votes: null },
        { id: 'c4', name: 'Candidate 4', nameTe: '', symbol: '', symbolTe: '', votes: null }
      ],
      counting: { rejected: 0, status: 'not_started' },  // not_started | counting | final
      turnout: { readings: [] },  // [{ id, time:'HH:MM', counts:{partId:cumulative} }]
      expenses: [],               // [{ id, date, category, description, amount, receiptRef, payee, payeeType }]
      analytics: {
        history: [],              // [{ id, year, registered, turnout, winner, winnerVotes, runnerUp, runnerUpVotes }]
        scenario: { assumedTurnoutPct: 78, assumedRejectPct: 2 }
      }
    };
  }

  var state = defaults();
  var subs = [];
  var saveTimer = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }
  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- merge a loaded/imported object onto defaults ---------- */
  function hydrate(raw) {
    var d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    var s = clone(d);
    if (raw.settings) {
      ['lang', 'theme', 'mode'].forEach(function (k) {
        if (typeof raw.settings[k] === 'string') s.settings[k] = raw.settings[k];
      });
      if (raw.settings.adminPin && raw.settings.adminPin.hash) s.settings.adminPin = raw.settings.adminPin;
    }
    if (raw.election) {
      ['village', 'mandal', 'district', 'state', 'type', 'pollDate',
       'ac', 'rollId', 'rollPublished', 'ageAsOn'].forEach(function (k) {
        if (typeof raw.election[k] === 'string') s.election[k] = raw.election[k];
      });
      if (raw.election.originalEstimate != null) s.election.originalEstimate = Math.max(0, Math.round(num(raw.election.originalEstimate, 2700)));
      s.election.officialTotal = raw.election.officialTotal == null ? null : Math.max(0, Math.round(num(raw.election.officialTotal, 0)));
      s.election.useOfficialTotal = !!raw.election.useOfficialTotal;
      if (raw.election.expectedAbsentees != null) s.election.expectedAbsentees = Math.max(0, Math.round(num(raw.election.expectedAbsentees, 300)));
      if (Array.isArray(raw.election.parts) && raw.election.parts.length) {
        s.election.parts = raw.election.parts.map(function (p, i) {
          return {
            id: String(p.id != null ? p.id : i + 1),
            name: String(p.name || ('Part ' + (p.id != null ? p.id : i + 1))),
            voters: Math.max(0, Math.round(num(p.voters, 0))),
            male: Math.max(0, Math.round(num(p.male, 0))),
            female: Math.max(0, Math.round(num(p.female, 0))),
            thirdGender: Math.max(0, Math.round(num(p.thirdGender, 0)))
          };
        });
      }
    }
    if (Array.isArray(raw.candidates) && raw.candidates.length) {
      s.candidates = raw.candidates.slice(0, 8).map(function (c, i) {
        return {
          id: String(c.id || ('c' + (i + 1))),
          name: String(c.name || ('Candidate ' + (i + 1))),
          nameTe: String(c.nameTe || ''),
          symbol: String(c.symbol || ''),
          symbolTe: String(c.symbolTe || ''),
          votes: c.votes == null || c.votes === '' ? null : Math.max(0, Math.round(num(c.votes, 0)))
        };
      });
    }
    if (raw.counting) {
      s.counting.rejected = Math.max(0, Math.round(num(raw.counting.rejected, 0)));
      if (['not_started', 'counting', 'final'].indexOf(raw.counting.status) >= 0) s.counting.status = raw.counting.status;
    }
    if (raw.turnout && Array.isArray(raw.turnout.readings)) {
      var partIds = s.election.parts.map(function (p) { return p.id; });
      s.turnout.readings = raw.turnout.readings.map(function (r) {
        var counts = {};
        partIds.forEach(function (pid) {
          counts[pid] = Math.max(0, Math.round(num(r.counts && r.counts[pid], 0)));
        });
        return { id: String(r.id || uid('tr')), time: String(r.time || '00:00'), counts: counts };
      }).sort(byTime);
    }
    if (Array.isArray(raw.expenses)) {
      s.expenses = raw.expenses.map(function (e) {
        return {
          id: String(e.id || uid('ex')),
          date: String(e.date || ''),
          category: CATEGORIES.indexOf(e.category) >= 0 ? e.category : 'other',
          description: String(e.description || ''),
          amount: Math.max(0, num(e.amount, 0)),
          receiptRef: String(e.receiptRef || ''),
          payee: String(e.payee || ''),
          payeeType: e.payeeType === 'staff' ? 'staff' : 'vendor'
        };
      });
    }
    if (raw.analytics) {
      if (Array.isArray(raw.analytics.history)) {
        s.analytics.history = raw.analytics.history.map(function (h) {
          return {
            id: String(h.id || uid('h')),
            year: Math.round(num(h.year, 0)),
            registered: Math.max(0, Math.round(num(h.registered, 0))),
            turnout: Math.max(0, Math.round(num(h.turnout, 0))),
            winner: String(h.winner || ''),
            winnerVotes: Math.max(0, Math.round(num(h.winnerVotes, 0))),
            runnerUp: String(h.runnerUp || ''),
            runnerUpVotes: Math.max(0, Math.round(num(h.runnerUpVotes, 0)))
          };
        }).sort(function (a, b) { return a.year - b.year; });
      }
      if (raw.analytics.scenario) {
        s.analytics.scenario.assumedTurnoutPct = clamp(num(raw.analytics.scenario.assumedTurnoutPct, 78), 0, 100);
        s.analytics.scenario.assumedRejectPct = clamp(num(raw.analytics.scenario.assumedRejectPct, 2), 0, 100);
      }
    }
    s.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
    s.appVersion = APP_VERSION;
    s.schema = SCHEMA_VERSION;
    return s;
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function byTime(a, b) { return String(a.time).localeCompare(String(b.time)); }

  /* ---------- derived statistics ---------- */
  function draftTotal() {
    return state.election.parts.reduce(function (s, p) { return s + p.voters; }, 0);
  }
  /* Aggregate gender totals as printed on the official roll summary pages. */
  function genderTotals() {
    return state.election.parts.reduce(function (acc, p) {
      acc.male += num(p.male, 0);
      acc.female += num(p.female, 0);
      acc.thirdGender += num(p.thirdGender, 0);
      return acc;
    }, { male: 0, female: 0, thirdGender: 0 });
  }
  function totalVoters() {
    var e = state.election;
    if (e.useOfficialTotal && e.officialTotal != null && e.officialTotal > 0) return e.officialTotal;
    return draftTotal();
  }
  function expectedTurnout() {
    return Math.max(0, totalVoters() - state.election.expectedAbsentees);
  }
  function pct(part, whole) {
    if (!whole) return 0;
    return (part / whole) * 100;
  }
  function latestReading() {
    var r = state.turnout.readings;
    return r.length ? r[r.length - 1] : null;
  }
  function partTurnout(partId) {
    var r = latestReading();
    return r ? num(r.counts[partId], 0) : 0;
  }
  function actualTurnout() {
    var r = latestReading();
    if (!r) return 0;
    return state.election.parts.reduce(function (s, p) { return s + num(r.counts[p.id], 0); }, 0);
  }
  function validVotes() {
    return state.candidates.reduce(function (s, c) { return s + (c.votes == null ? 0 : c.votes); }, 0);
  }
  function anyVotesEntered() {
    return state.candidates.some(function (c) { return c.votes != null; });
  }
  function countedVotes() { return validVotes() + num(state.counting.rejected, 0); }

  function standings() {
    return state.candidates.map(function (c) {
      var v = c.votes == null ? 0 : c.votes;
      return {
        id: c.id, name: c.name, nameTe: c.nameTe, symbol: c.symbol, symbolTe: c.symbolTe,
        votes: v, entered: c.votes != null, share: pct(v, validVotes())
      };
    }).sort(function (a, b) { return b.votes - a.votes; });
  }
  function leadMargin() {
    var s = standings();
    if (s.length < 2 || !validVotes()) return { margin: 0, leader: null, tie: false };
    return { margin: s[0].votes - s[1].votes, leader: s[0], tie: s[0].votes === s[1].votes };
  }
  function expenseTotal() {
    return state.expenses.reduce(function (s, e) { return s + e.amount; }, 0);
  }
  function expensesByCategory() {
    var map = {};
    state.expenses.forEach(function (e) { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.keys(map).map(function (k) { return { category: k, amount: map[k] }; })
      .sort(function (a, b) { return b.amount - a.amount; });
  }

  var derived = {
    draftTotal: draftTotal,
    genderTotals: genderTotals,
    totalVoters: totalVoters,
    expectedTurnout: expectedTurnout,
    expectedTurnoutPct: function () { return pct(expectedTurnout(), totalVoters()); },
    actualTurnout: actualTurnout,
    actualTurnoutPct: function () { return pct(actualTurnout(), totalVoters()); },
    remainingTurnout: function () { return Math.max(0, expectedTurnout() - actualTurnout()); },
    turnoutVsExpectedPct: function () { return pct(actualTurnout(), expectedTurnout()); },
    partTurnout: partTurnout,
    validVotes: validVotes,
    anyVotesEntered: anyVotesEntered,
    rejectedVotes: function () { return num(state.counting.rejected, 0); },
    countedVotes: countedVotes,
    countingProgressPct: function () {
      var denom = actualTurnout() || expectedTurnout();
      return clamp(pct(countedVotes(), denom), 0, 100);
    },
    standings: standings,
    leadMargin: leadMargin,
    latestReading: latestReading,
    expenseTotal: expenseTotal,
    expensesByCategory: expensesByCategory,
    pct: pct,
    /* 95% CI half-width for a share p measured on n counted votes. */
    marginOfError: function (p, n) {
      if (!n || n <= 0) return 0;
      var prop = clamp(p, 0, 1);
      return 1.96 * Math.sqrt((prop * (1 - prop)) / n) * 100;
    }
  };

  /* ---------- persistence ---------- */
  function notify() { subs.forEach(function (fn) { fn(state); }); }

  function touchAndSave() {
    state.updatedAt = new Date().toISOString();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      App.db.save(state);
    }, 150);
  }

  App.state = {
    APP_VERSION: APP_VERSION,
    CATEGORIES: CATEGORIES,
    defaults: defaults,
    hydrate: hydrate,
    uid: uid,
    num: num,
    clamp: clamp,
    get: function () { return state; },
    derived: derived,
    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },

    /* mutate(fn) - fn receives the live state; saves + notifies afterwards. */
    mutate: function (fn, opts) {
      fn(state);
      if (!opts || opts.persist !== false) touchAndSave();
      if (!opts || opts.notify !== false) notify();
    },

    replaceAll: function (raw) {
      state = hydrate(raw);
      state.updatedAt = new Date().toISOString();
      return App.db.save(state).then(function () { notify(); return state; });
    },

    load: function () {
      return App.db.load().then(function (raw) {
        state = hydrate(raw);
        if (!raw) { state.updatedAt = new Date().toISOString(); return App.db.save(state).then(function () { return state; }); }
        return state;
      });
    },

    reset: function () {
      return App.db.clear().then(function () {
        var keepLang = state.settings.lang, keepTheme = state.settings.theme;
        state = defaults();
        state.settings.lang = keepLang;
        state.settings.theme = keepTheme;
        state.updatedAt = new Date().toISOString();
        return App.db.save(state).then(function () { notify(); return state; });
      });
    },

    exportObject: function () {
      var o = clone(state);
      o.exportedAt = new Date().toISOString();
      o.exportedBy = 'Prodduturu Election Analytics ' + APP_VERSION;
      if (o.settings) delete o.settings.adminPin;   // never travel a PIN in a backup file
      return o;
    }
  };
})(window);
