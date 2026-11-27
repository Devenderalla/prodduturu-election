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

  var engine = 'memory';
  var idb = null;
  var memory = null;

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

  function idbGet() {
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(STORE, 'readonly');
      var req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbPut(value) {
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  }
  function idbDel() {
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
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
        return idbGet().catch(function () { return null; });
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
        return idbPut(copy).catch(function () {
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

    clear: function () {
      memory = null;
      try { if (hasLS()) global.localStorage.removeItem(LS_KEY); } catch (e) {}
      if (engine === 'IndexedDB') return idbDel().catch(function () { return true; });
      return Promise.resolve(true);
    }
  };
})(window);
