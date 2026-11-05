/**
 * shared-assets.js — IndexedDB storage for the school logos.
 *
 * Logos are large base64 data URLs. Keeping them inside `school_info` burned
 * the ~5 MB localStorage budget that the saved outputs also need, so they live
 * here instead. Every tool reads them through this module (or the
 * `silid:logos-ready` event) and never from localStorage.
 *
 * Existing installs migrate automatically: logos found in the saved
 * `school_info` are copied into IndexedDB and removed from localStorage, so
 * upgrading teachers keep their logos without any action.
 *
 * Exposes: window.SilidAssets
 *   load()                  → Promise<{schoolLogo1, schoolLogo2}> (starts on load)
 *   ready                   → the same Promise
 *   getLogos()              → {schoolLogo1, schoolLogo2} from the in-memory cache
 *   setLogo(field, dataUrl) → Promise; '' deletes the logo
 *   removeLogo(field)       → Promise
 *
 * Fires `silid:logos-ready` on window once the logos are available.
 */
(function () {
  'use strict';

  var DB_NAME = 'silidpinoy_assets';
  var DB_VERSION = 1;
  var STORE_NAME = 'assets';
  var LOGO_KEYS = ['schoolLogo1', 'schoolLogo2'];

  var dbPromise = null;
  var cache = { schoolLogo1: '', schoolLogo2: '' };
  var started = null;

  function hasIDB() {
    try { return !!window.indexedDB; } catch (e) { return false; }
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
      req.onblocked = function () { reject(new Error('The logo store is blocked by another tab.')); };
    });
    return dbPromise;
  }

  function read(key) {
    if (!hasIDB()) return Promise.resolve(cache[key] || '');
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = function () { resolve(typeof req.result === 'string' ? req.result : ''); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function write(key, value) {
    if (!hasIDB()) return Promise.resolve();
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  function remove(key) {
    if (!hasIDB()) return Promise.resolve();
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function getLogos() {
    return { schoolLogo1: cache.schoolLogo1 || '', schoolLogo2: cache.schoolLogo2 || '' };
  }

  /**
   * Move logos left inside `school_info` by older versions into IndexedDB.
   * The text fields stay in localStorage — only the two data URLs move.
   */
  function migrateLegacyLogos() {
    var raw = null;
    try { raw = window.localStorage.getItem('school_info'); } catch (e) { return Promise.resolve(); }
    if (!raw) return Promise.resolve();

    var si;
    try { si = JSON.parse(raw); } catch (e) { return Promise.resolve(); }
    if (!si || typeof si !== 'object') return Promise.resolve();

    var found = LOGO_KEYS.filter(function (k) {
      return typeof si[k] === 'string' && si[k].length > 0;
    });
    if (!found.length) return Promise.resolve();

    // Keep the cache warm even if IndexedDB is unavailable in this browser.
    if (si.schoolLogo1) cache.schoolLogo1 = si.schoolLogo1;
    if (si.schoolLogo2) cache.schoolLogo2 = si.schoolLogo2;

    return Promise.all(found.map(function (k) {
      return read(k).then(function (existing) {
        return existing ? null : write(k, si[k]);
      });
    })).then(function () {
      // Only strip the localStorage copy once IndexedDB really has the logo —
      // otherwise a failed migration would lose it on the next reload.
      LOGO_KEYS.forEach(function (k) { delete si[k]; });
      try { window.localStorage.setItem('school_info', JSON.stringify(si)); } catch (e) {}
    }).catch(function () { /* leave the legacy copy in place; cache still has it */ });
  }

  function start() {
    if (started) return started;
    started = migrateLegacyLogos()
      .then(function () { return Promise.all(LOGO_KEYS.map(read)); })
      .then(function (values) {
        cache.schoolLogo1 = values[0] || cache.schoolLogo1 || '';
        cache.schoolLogo2 = values[1] || cache.schoolLogo2 || '';
      })
      .catch(function () { /* IndexedDB unavailable — keep whatever was migrated */ })
      .then(function () {
        try {
          window.dispatchEvent(new CustomEvent('silid:logos-ready', { detail: getLogos() }));
        } catch (e) { /* old browser */ }
        return getLogos();
      });
    return started;
  }

  function setLogo(field, dataUrl) {
    if (LOGO_KEYS.indexOf(field) === -1) return Promise.resolve(getLogos());
    var value = typeof dataUrl === 'string' ? dataUrl : '';
    cache[field] = value;
    var saved = value ? write(field, value) : remove(field);
    return saved.then(getLogos).catch(getLogos);
  }

  function removeLogo(field) { return setLogo(field, ''); }

  /* ---- export <img> tags -------------------------------------------------
     Word ignores CSS sizing when it imports an exported document (the .docx
     carries the HTML as an altChunk), so a 1400px logo is drawn at 1050pt and
     each logo lands on a page of its own. Word does honour the width/height
     *attributes*, so measure the data URL and emit both, keeping the aspect
     ratio. Formats we cannot measure fall back to the height attribute alone. */
  function dataUrlSize(src) {
    try {
      var m = /^data:image\/([a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(src);
      if (!m) return null;
      var kind = m[1].toLowerCase();
      var bin = atob(m[2].replace(/\s+/g, ''));
      function u8(i) { return bin.charCodeAt(i) & 0xff; }
      function be16(i) { return (u8(i) << 8) | u8(i + 1); }
      function be32(i) { return ((u8(i) << 24) | (u8(i + 1) << 16) | (u8(i + 2) << 8) | u8(i + 3)) >>> 0; }
      function le16(i) { return u8(i) | (u8(i + 1) << 8); }
      if (kind === 'png' && bin.length > 24) return { width: be32(16), height: be32(20) };
      if (kind === 'gif' && bin.length > 10) return { width: le16(6), height: le16(8) };
      if (kind === 'jpg' || kind === 'jpeg') {
        var i = 2;
        while (i + 9 < bin.length) {
          if (u8(i) !== 0xff) { i++; continue; }
          var marker = u8(i + 1);
          if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
          if (marker === 0xd9 || marker === 0xda) break;
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { width: be16(i + 7), height: be16(i + 5) };
          }
          i += 2 + be16(i + 2);
        }
        return null;
      }
      return null;
    } catch (e) { return null; }
  }

  function logoImgHtml(src, heightPx, margin) {
    if (!src) return '';
    var h = Math.max(1, Math.round(heightPx));
    var size = dataUrlSize(src);
    var w = size && size.height > 0 ? Math.max(1, Math.round(h * size.width / size.height)) : 0;
    var m = margin || '0 10px';
    return '<img src="' + src + '" alt="" height="' + h + '"' + (w ? ' width="' + w + '"' : '') +
      ' style="height:' + h + 'px;' + (w ? 'width:' + w + 'px;' : '') +
      'margin:' + m + ';vertical-align:middle;">';
  }

  window.SilidAssets = {
    load: start,
    ready: start(),
    getLogos: getLogos,
    setLogo: setLogo,
    removeLogo: removeLogo,
    logoImgHtml: logoImgHtml
  };
})();
