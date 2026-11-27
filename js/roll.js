/* =========================================================
   roll.js - the real electoral roll, held locally.

   This data NEVER ships with the app and never leaves the
   device: it is produced by extract_roll.py on the organiser's
   machine, imported once per phone, and stored under its own
   database key so JSON state backups cannot carry it.

   Scope is unchanged: roll lookup only. Nothing here records
   political support, payments, or whether anyone has voted.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  var loaded = null;
  var index = null;

  function normalise(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function buildIndex() {
    index = loaded ? loaded.records.map(function (r) {
      return normalise(r.name) + ' ' + normalise(r.relName) + ' ' + String(r.serial);
    }) : null;
  }

  function validate(payload) {
    if (!payload || typeof payload !== 'object') return 'not an object';
    var recs = payload.records;
    if (!Array.isArray(recs) || !recs.length) return 'no records array';
    var bad = 0;
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r || typeof r.name !== 'string' || !r.name || r.serial == null || isNaN(+r.serial)) bad++;
      if (bad > 5) return 'records are missing name or serial';
    }
    return null;
  }

  App.roll = {
    isLoaded: function () { return !!(loaded && loaded.records && loaded.records.length); },
    count: function () { return loaded && loaded.records ? loaded.records.length : 0; },
    meta: function () {
      if (!loaded) return null;
      return {
        generatedAt: loaded.generatedAt || null,
        source: loaded.source || '',
        count: App.roll.count(),
        includesEpic: !!loaded.includesEpic
      };
    },
    partCounts: function () {
      var m = {};
      if (loaded && loaded.records) {
        loaded.records.forEach(function (r) { m[r.part] = (m[r.part] || 0) + 1; });
      }
      return m;
    },

    init: function () {
      return App.db.loadRoll().then(function (payload) {
        if (payload && !validate(payload)) { loaded = payload; buildIndex(); }
        return App.roll.isLoaded();
      }).catch(function () { return false; });
    },

    /**
     * Pick up a roll.json sitting beside the app.
     *
     * On the published site this always 404s - the roll is not and will
     * not be there. It only finds anything when the app is served from a
     * folder the operator put the file in themselves, which makes working
     * on a laptop a single step instead of a file-picker dance.
     */
    initLocal: function () {
      if (App.roll.isLoaded()) return Promise.resolve(false);
      return fetch('roll.json', { cache: 'no-store' }).then(function (res) {
        if (!res.ok) return false;
        return res.json().then(function (payload) {
          if (validate(payload)) return false;
          return App.roll.set(payload).then(function (n) { return n; });
        });
      }).catch(function () { return false; });
    },

    set: function (payload) {
      var err = validate(payload);
      if (err) return Promise.reject(new Error(err));
      payload.records = payload.records.map(function (r) {
        return {
          serial: +r.serial,
          name: String(r.name),
          relType: r.relType ? String(r.relType) : '',
          relName: r.relName ? String(r.relName) : '',
          house: r.house ? String(r.house) : '',
          age: r.age == null ? null : +r.age,
          gender: r.gender ? String(r.gender) : '',
          part: String(r.part == null ? '' : r.part),
          section: r.section ? String(r.section) : ''
        };
      });
      return App.db.saveRoll(payload).then(function () {
        loaded = payload; buildIndex();
        return App.roll.count();
      });
    },

    clear: function () {
      return App.db.clearRoll().then(function () {
        loaded = null; index = null;
        return true;
      });
    },

    /**
     * Browse the roll with no query, so a volunteer can scroll a part
     * instead of having to guess a spelling. Paged: 2,000+ rows at once
     * is slow on a cheap phone.
     */
    list: function (opts) {
      opts = opts || {};
      if (!App.roll.isLoaded()) return { total: 0, items: [] };
      var part = opts.part && opts.part !== 'all' ? String(opts.part) : null;
      var pool = part
        ? loaded.records.filter(function (r) { return r.part === part; })
        : loaded.records.slice();
      pool.sort(function (a, b) {
        if (a.part !== b.part) return a.part < b.part ? -1 : 1;
        return a.serial - b.serial;
      });
      var limit = opts.limit || 50;
      return { total: pool.length, items: pool.slice(0, limit) };
    },

    /**
     * Full result set for a query, with the total before any cap.
     * The UI needs the real total: reporting a capped count as if it were
     * the whole answer hides records from the person searching.
     */
    find: function (query, opts) {
      opts = opts || {};
      if (!App.roll.isLoaded()) return { total: 0, items: [] };
      var q = normalise(query);
      if (q.length < 2) return { total: 0, items: [] };
      var part = opts.part && opts.part !== 'all' ? String(opts.part) : null;
      var digits = /^[0-9]+$/.test(q);
      var recs = loaded.records, hits = [];

      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (part && r.part !== part) continue;
        if (digits) {
          if (String(r.serial) === q || String(r.serial).indexOf(q) === 0) hits.push(r);
        } else if (index[i].indexOf(q) >= 0) {
          hits.push(r);
        }
      }
      hits.sort(function (a, b) {
        if (a.part !== b.part) return a.part < b.part ? -1 : 1;
        return a.serial - b.serial;
      });
      var limit = opts.limit || 50;
      return { total: hits.length, items: hits.slice(0, limit) };
    },

    search: function (query, opts) {
      opts = opts || {};
      if (!App.roll.isLoaded()) return [];
      var q = normalise(query);
      if (q.length < 2) return [];
      var limit = opts.limit || 30;
      var part = opts.part && opts.part !== 'all' ? String(opts.part) : null;
      var digits = /^[0-9]+$/.test(q);
      var recs = loaded.records, out = [];

      for (var i = 0; i < recs.length && out.length < limit; i++) {
        var r = recs[i];
        if (part && r.part !== part) continue;
        if (digits) {
          if (String(r.serial) === q || String(r.serial).indexOf(q) === 0) out.push(r);
        } else if (index[i].indexOf(q) >= 0) {
          out.push(r);
        }
      }
      out.sort(function (a, b) {
        if (a.part !== b.part) return a.part < b.part ? -1 : 1;
        return a.serial - b.serial;
      });
      return out;
    }
  };
})(window);
