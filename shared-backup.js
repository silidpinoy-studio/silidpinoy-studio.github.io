/**
 * shared-backup.js — Export/import all localStorage data as a portable JSON file.
 *
 * Exposes window.SilidBackup with:
 *   exportBackup(options) → triggers browser download
 *   importBackup(file) → Promise<importResult>
 *
 * Version: v1 (2026-09-07)
 */
(function () {
  'use strict';

  var BACKUP_VERSION = 1;

  // Keys that hold user data (excludes transient / internal keys)
  var DATA_KEYS = [
    'school_info',
    'tos_saved_configs',
    'tos_current',
    'tos_make_test',
    'saved_lesson_output',
    'saved_activity_output',
    'saved_ppt_output',
    'saved_test_output',
    'lesson_suggestions_tests',
    'lesson_suggestions_DLLs',
    'lesson_suggestions_lessonPlans'
  ];

  var API_KEY_KEYS = ['gemini_api_key', 'gemini_api_key_2'];

  var API_KEY_WHICH = { gemini_api_key: 'primary', gemini_api_key_2: 'backup' };

  // ---- api keys ----
  // shared-keys.js decides whether a key is session-only or written to the
  // device; the backup file itself stays the teacher's own copy either way.

  function readApiKey(name) {
    try {
      if (window.SilidKeys) return window.SilidKeys.get(API_KEY_WHICH[name]) || '';
      return localStorage.getItem(name) || '';
    } catch (_) { return ''; }
  }

  function writeApiKey(name, value) {
    try {
      if (window.SilidKeys) { window.SilidKeys.set(API_KEY_WHICH[name], value); return; }
      localStorage.setItem(name, value);
    } catch (_) { /* storage unavailable */ }
  }

  function clearApiKey(name) {
    try {
      if (window.SilidKeys) { window.SilidKeys.clear(API_KEY_WHICH[name]); return; }
      localStorage.removeItem(name);
    } catch (_) { /* storage unavailable */ }
  }

  // ---- helpers ----

  function nowISO() { return new Date().toISOString(); }

  function safeGetJSON(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return undefined;
      try { return JSON.parse(raw); }
      catch (_) { return raw; } // plain-text values (e.g. markdown) are kept as-is, not dropped
    } catch (_) { return undefined; }
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // ---- public API ----

  function exportBackup(options) {
    options = options || {};
    var includeKeys = !!options.includeApiKeys;
    var data = {};
    DATA_KEYS.forEach(function (k) {
      var v = safeGetJSON(k);
      if (v !== undefined) data[k] = v;
    });
    if (includeKeys) {
      API_KEY_KEYS.forEach(function (k) {
        var v = readApiKey(k);
        if (v) data[k] = v;
      });
    }

    var payload = {
      version: BACKUP_VERSION,
      exportedAt: nowISO(),
      includeApiKeys: includeKeys,
      data: data
    };

    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var ts = nowISO().replace(/[:.]/g, '-').slice(0, 19);
    triggerDownload(blob, 'silidpinoy-backup-' + ts + '.json');

    return { ok: true, size: blob.size, keys: Object.keys(data) };
  }

  /**
   * importBackup(file) → Promise<{ ok, action, data, warnings }>
   *   action: 'replace' | 'merge' | 'cancel'
   *   data: the parsed backup payload (or null on error)
   *   warnings: array of strings
   */
  function importBackup(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('No file selected.')); return; }

      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read the file.')); };
      reader.onload = function () {
        try {
          var payload = JSON.parse(reader.result);
          var warnings = [];

          // version check
          if (!payload || typeof payload.version !== 'number') {
            reject(new Error('This does not appear to be a valid SilidPinoy backup file.')); return;
          }
          if (payload.version > BACKUP_VERSION) {
            reject(new Error('This backup was created with a newer version of SilidPinoy. Please update your app first.')); return;
          }

          var data = payload.data || {};

          // check if keys are present
          if (!payload.includeApiKeys) {
            warnings.push('API keys were not included in this backup. You will need to set them again after import.');
          }

          // detect generated images in PPT output
          var pptData = data.saved_ppt_output;
          if (pptData && typeof pptData === 'string' && pptData.indexOf('data:image') !== -1) {
            warnings.push('PPT output contains embedded images which were excluded from the backup to save space.');
          }

          resolve({ ok: true, action: 'pending', data: payload, warnings: warnings });
        } catch (e) {
          reject(new Error('Invalid JSON in backup file: ' + e.message));
        }
      };
      reader.readAsText(file);
    });
  }

  /**
   * applyImport(payload, mode) — writes data to localStorage.
   *   mode: 'replace' (clear first) | 'merge' (overwrite only present keys)
   */
  function applyImport(payload, mode) {
    if (!payload || !payload.data) return { ok: false, error: 'No data in backup.' };
    var data = payload.data;

    if (mode === 'replace') {
      // clear only our known keys (don't touch unrelated localStorage)
      DATA_KEYS.forEach(function (k) { localStorage.removeItem(k); });
      API_KEY_KEYS.forEach(function (k) { clearApiKey(k); });
    }

    // write data keys (strings were plain text in storage; objects were JSON)
    DATA_KEYS.forEach(function (k) {
      if (data[k] !== undefined) {
        var v = data[k];
        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    });

    // write API keys only if they were included
    if (payload.includeApiKeys) {
      API_KEY_KEYS.forEach(function (k) {
        if (data[k]) writeApiKey(k, data[k]);
      });
    }

    return { ok: true, keysWritten: Object.keys(data) };
  }

  // ---- expose ----

  window.SilidBackup = {
    exportBackup: exportBackup,
    importBackup: importBackup,
    applyImport: applyImport
  };
})();
