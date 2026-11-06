/**
 * shared-store.js — IndexedDB home for the large "last output" payloads.
 *
 * Teachers were hitting the browser's ~5 MB localStorage budget because every
 * tool kept its last generated output there (a lesson plan with a table, a
 * deck, a test with an answer key). Those payloads now live in IndexedDB, which
 * gets a much larger quota.
 *
 * The pages read their payloads synchronously, so this module keeps an
 * in-memory cache and exposes a localStorage-shaped API:
 *
 *   SilidStore.ready            Promise resolved once the cache is hydrated
 *   SilidStore.getItem(key)     string | null   (sync, from the cache)
 *   SilidStore.setItem(key, v)  Promise
 *   SilidStore.removeItem(key)  Promise
 *   SilidStore.keys()           string[]
 *   SilidStore.sizeBytes()      number          (UTF-16, like localStorage)
 *   SilidStore.isManaged(key)   boolean
 *
 * A page must wait for `ready` before its first read (React pages: before
 * mounting), then every existing synchronous read site keeps working untouched.
 *
 * Writes update the cache immediately and persist to IndexedDB in the
 * background. Existing localStorage copies are moved on first load and only
 * deleted once the IndexedDB write has committed; if IndexedDB is unavailable
 * the module quietly falls back to localStorage so no data is ever lost.
 *
 * Version: v1 (2026-11-06)
 */
(function () {
  'use strict';

  var DB_NAME = 'silidpinoy_store';
  var DB_VERSION = 1;
  var STORE_NAME = 'kv';

  /* Keys this module owns. Small things (API keys, school info, short
     suggestion lists) stay in localStorage, where a sync read costs nothing. */
  var MANAGED = [
    'tos_current',
    'tos_current_school',
    'tos_saved_configs',
    'tos_make_test',
    'saved_test_output',
    'saved_test_config',
    'saved_lesson_output',
    'saved_activity_output',
    'saved_ppt_output',
    'lesson_activity_sheet',
    'lesson_ppt_import'
  ];

  var MANAGED_PREFIXES = ['custom_lesson_flow_'];

  var cache = Object.create(null);
  var dbPromise = null;
  var fallback = false;

  function isManaged(key) {
    if (!key) return false;
    if (MANAGED.indexOf(key) !== -1) return true;
    for (var i = 0; i < MANAGED_PREFIXES.length; i++) {
      if (key.indexOf(MANAGED_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB unavailable')); };
      req.onblocked = function () { reject(new Error('IndexedDB blocked')); };
    });
  }

  function getAll(db) {
    return new Promise(function (resolve, reject) {
      var out = {};
      var req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).openCursor();
      req.onsuccess = function () {
        var cursor = req.result;
        if (!cursor) { resolve(out); return; }
        out[cursor.key] = String(cursor.value);
        cursor.continue();
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  function put(db, key, value) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
  }

  function del(db, key) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
  }

  function legacyKeys() {
    var keys = [];
    try {
      var ls = window.localStorage;
      for (var i = 0; i < ls.length; i++) {
        var key = ls.key(i);
        if (isManaged(key)) keys.push(key);
      }
    } catch (e) { /* storage blocked — nothing to migrate */ }
    return keys;
  }

  /* Move the old localStorage copies into IndexedDB, deleting each one only
     after its write committed. IndexedDB wins if both copies exist. */
  function migrateLegacy(db) {
    return Promise.all(legacyKeys().map(function (key) {
      var value;
      try { value = window.localStorage.getItem(key); } catch (e) { return null; }
      if (value === null) return null;
      if (!(key in cache)) cache[key] = value;
      return put(db, key, cache[key]).then(function () {
        try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
      }).catch(function () { /* keep the legacy copy for next time */ });
    }));
  }

  var ready = openDB().then(function (db) {
    dbPromise = Promise.resolve(db);
    return getAll(db).then(function (rows) {
      Object.keys(rows).forEach(function (key) { cache[key] = rows[key]; });
      return migrateLegacy(db);
    }).catch(function () { /* unreadable: legacy reads still work */ });
  }).catch(function () {
    fallback = true;
  });

  function getItem(key) {
    if (key in cache) return cache[key];
    /* Before `ready` resolves — or with no IndexedDB — the legacy copy is still
       the truth, so an early synchronous read never comes back empty. */
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function setItem(key, value) {
    var next = String(value);
    cache[key] = next;
    return ready.then(function () {
      if (fallback || !dbPromise) {
        try { window.localStorage.setItem(key, next); } catch (e) { /* ignore */ }
        return;
      }
      return dbPromise.then(function (db) { return put(db, key, next); }).catch(function () {});
    });
  }

  function removeItem(key) {
    delete cache[key];
    return ready.then(function () {
      /* Clear the legacy copy too, so a stale value cannot resurface. */
      try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
      if (fallback || !dbPromise) return;
      return dbPromise.then(function (db) { return del(db, key); }).catch(function () {});
    });
  }

  function keys() {
    return Object.keys(cache);
  }

  function sizeBytes() {
    var total = 0;
    Object.keys(cache).forEach(function (key) {
      total += (key.length + String(cache[key]).length) * 2;
    });
    return total;
  }

  window.SilidStore = {
    ready: ready,
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    keys: keys,
    sizeBytes: sizeBytes,
    isManaged: isManaged,
    MANAGED: MANAGED.slice()
  };
})();
