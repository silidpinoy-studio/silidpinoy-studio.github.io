/**
 * shared-docs.js — IndexedDB-backed document history for all SilidPinoy tools.
 *
 * Exposes window.SilidDocs with:
 *   openDB() → Promise<IDBDatabase>
 *   saveDocument(doc) → Promise<id>
 *   getDocuments(tool) → Promise<doc[]>
 *   getDocument(id) → Promise<doc>
 *   deleteDocument(id) → Promise<void>
 *   updateDocument(id, changes) → Promise<void>
 *   migrateFromLocalStorage() → Promise<{ migrated: number }>
 */
(function () {
  'use strict';

  var DB_NAME = 'silidpinoy_docs';
  var DB_VERSION = 1;
  var STORE_NAME = 'documents';

  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          var store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('tool', 'tool', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
    return dbPromise;
  }

  function generateId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * saveDocument(doc) → Promise<string>
   *   doc: { tool, name, content, summary?, meta? }
   *   Returns the generated id.
   */
  function saveDocument(doc) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var record = {
          id: generateId(),
          tool: doc.tool || 'unknown',
          name: doc.name || 'Untitled',
          content: doc.content || '',
          summary: doc.summary || '',
          meta: doc.meta || {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).add(record);
        tx.oncomplete = function () { resolve(record.id); };
        tx.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  /**
   * getDocuments(tool) → Promise<doc[]>
   *   Returns all documents for a given tool, newest first.
   */
  function getDocuments(tool) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var idx = tx.objectStore(STORE_NAME).index('tool');
        var req = idx.getAll(tool);
        req.onsuccess = function () {
          var docs = req.result || [];
          docs.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
          resolve(docs);
        };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  /**
   * getDocument(id) → Promise<doc>
   */
  function getDocument(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  /**
   * deleteDocument(id) → Promise<void>
   */
  function deleteDocument(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  /**
   * updateDocument(id, changes) → Promise<void>
   *   changes: { name?, content?, summary?, meta? }
   */
  function updateDocument(id, changes) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var req = store.get(id);
        req.onsuccess = function () {
          var doc = req.result;
          if (!doc) { reject(new Error('Document not found')); return; }
          if (changes.name !== undefined) doc.name = changes.name;
          if (changes.content !== undefined) doc.content = changes.content;
          if (changes.summary !== undefined) doc.summary = changes.summary;
          if (changes.meta !== undefined) doc.meta = changes.meta;
          doc.updatedAt = new Date().toISOString();
          store.put(doc);
        };
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  /**
   * migrateFromLocalStorage() → Promise<{ migrated: number }>
   *   One-time migration of existing localStorage saved outputs to IndexedDB.
   */
  function migrateFromLocalStorage() {
    var MIGRATION_KEY = 'silidpinoy_docs_migrated';
    if (localStorage.getItem(MIGRATION_KEY)) {
      return Promise.resolve({ migrated: 0 });
    }

    var mappings = [
      { key: 'saved_test_output', tool: 'test-maker', name: 'Generated Test' },
      { key: 'saved_ppt_output', tool: 'ppt-maker', name: 'Generated Presentation' },
      { key: 'saved_activity_output', tool: 'activity-sheet', name: 'Generated Activity Sheet' },
      { key: 'saved_lesson_output', tool: 'lesson-plan', name: 'Generated Lesson Plan' }
    ];

    var toMigrate = [];
    mappings.forEach(function (m) {
      var raw = localStorage.getItem(m.key);
      if (raw && raw.trim().length > 0) {
        toMigrate.push({ tool: m.tool, name: m.name, content: raw });
      }
    });

    if (toMigrate.length === 0) {
      localStorage.setItem(MIGRATION_KEY, '1');
      return Promise.resolve({ migrated: 0 });
    }

    var promises = toMigrate.map(function (item) {
      return saveDocument(item);
    });

    return Promise.all(promises).then(function () {
      localStorage.setItem(MIGRATION_KEY, '1');
      return { migrated: toMigrate.length };
    });
  }

  // ---- expose ----
  window.SilidDocs = {
    openDB: openDB,
    saveDocument: saveDocument,
    getDocuments: getDocuments,
    getDocument: getDocument,
    deleteDocument: deleteDocument,
    updateDocument: updateDocument,
    migrateFromLocalStorage: migrateFromLocalStorage
  };
})();
