/* =========================================================
   db.js - local persistence
   Tries IndexedDB, falls back to localStorage, then memory.
   The whole application state is one record, which keeps
   saving atomic and makes JSON backup/restore trivial.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  var DB_NAME = 'prodduturu-election';
  var DB_VERSION = 1;
  var STORE = 'app';
  var KEY = 'state';
  var LS_KEY = 'prodduturu-election-state';
  /* The voter roll lives under its own key, never inside the app state.
     That keeps real voter data out of every JSON backup the app exports. */
  var ROLL_KEY = 'roll';
  var LS_ROLL_KEY = 'prodduturu-election-roll';

  var engine = 'memory';
  var idb = null;
  var memory = null;
  var memoryRoll = null;

  function hasIDB() {
    try { return !!global.indexedDB; } catch (e) { return false; }
  }
  function hasLS() {
    try {
      var k = '__pe_test__';
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  function openIDB() {
    return new Promise(function (resolve, reject) {
      var req;
      try { req = global.indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { return reject(e); }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      // Safari/private-mode can hang the open request silently.
      setTimeout(function () { reject(new Error('indexedDB open timeout')); }, 2500);
    });
  }

  function idbGet(key) {
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(STORE, 'readonly');
      var req = tx.objectStore(STORE).get(key);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbPut(key, value) {
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  }
  function idbDel(key) {
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  App.db = {
    engine: function () { return engine; },

    init: function () {
      if (hasIDB()) {
        return openIDB().then(function (db) {
          idb = db; engine = 'IndexedDB'; return engine;
        }).catch(function () {
          engine = hasLS() ? 'localStorage' : 'memory';
          return engine;
        });
      }
      engine = hasLS() ? 'localStorage' : 'memory';
      return Promise.resolve(engine);
    },

    load: function () {
      if (engine === 'IndexedDB') {
        return idbGet(KEY).catch(function () { return null; });
      }
      if (engine === 'localStorage') {
        try {
          var raw = global.localStorage.getItem(LS_KEY);
          return Promise.resolve(raw ? JSON.parse(raw) : null);
        } catch (e) { return Promise.resolve(null); }
      }
      return Promise.resolve(memory);
    },

    save: function (state) {
      var copy = JSON.parse(JSON.stringify(state));
      if (engine === 'IndexedDB') {
        return idbPut(KEY, copy).catch(function () {
          // if IDB write fails mid-session, degrade rather than lose the edit
          engine = hasLS() ? 'localStorage' : 'memory';
          return App.db.save(copy);
        });
      }
      if (engine === 'localStorage') {
        try {
          global.localStorage.setItem(LS_KEY, JSON.stringify(copy));
          return Promise.resolve(true);
        } catch (e) {
          engine = 'memory'; memory = copy;
          return Promise.resolve(false);
        }
      }
      memory = copy;
      return Promise.resolve(true);
    },

    /* ---- voter roll: separate key, never part of a state backup ---- */
    loadRoll: function () {
      if (engine === 'IndexedDB') return idbGet(ROLL_KEY).catch(function () { return null; });
      if (engine === 'localStorage') {
        try {
          var raw = global.localStorage.getItem(LS_ROLL_KEY);
          return Promise.resolve(raw ? JSON.parse(raw) : null);
        } catch (e) { return Promise.resolve(null); }
      }
      return Promise.resolve(memoryRoll);
    },

    saveRoll: function (payload) {
      if (engine === 'IndexedDB') {
        return idbPut(ROLL_KEY, payload).then(function () { return true; })
          .catch(function () { memoryRoll = payload; return false; });
      }
      if (engine === 'localStorage') {
        try {
          global.localStorage.setItem(LS_ROLL_KEY, JSON.stringify(payload));
          return Promise.resolve(true);
        } catch (e) {
          // a full roll can exceed the ~5MB localStorage quota
          memoryRoll = payload;
          return Promise.reject(new Error('quota'));
        }
      }
      memoryRoll = payload;
      return Promise.resolve(true);
    },

    clearRoll: function () {
      memoryRoll = null;
      try { if (hasLS()) global.localStorage.removeItem(LS_ROLL_KEY); } catch (e) {}
      if (engine === 'IndexedDB') return idbDel(ROLL_KEY).catch(function () { return true; });
      return Promise.resolve(true);
    },

    clear: function () {
      memory = null;
      try { if (hasLS()) global.localStorage.removeItem(LS_KEY); } catch (e) {}
      if (engine === 'IndexedDB') return idbDel(KEY).catch(function () { return true; });
      return Promise.resolve(true);
    }
  };
})(window);
