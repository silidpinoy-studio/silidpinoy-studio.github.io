/**
 * shared-keys.js — opt-in storage for the Gemini API keys.
 *
 * Default (nothing ticked): a key lives in sessionStorage only. It survives
 * navigation between the SilidPinoy tools inside the same tab, but disappears
 * when the browser closes and is never written to disk.
 *
 * Opted in ("Remember my API key on this device"): the key is also written to
 * localStorage so the teacher does not have to paste it again next time.
 *
 * Keys written by earlier versions (always localStorage) are moved into the
 * session store on first load and the teacher is told about it.
 *
 * Exposes: window.SilidKeys
 */
(function () {
  'use strict';

  var NAMES = { primary: 'gemini_api_key', backup: 'gemini_api_key_2' };
  var REMEMBER_KEY = 'silidpinoy_remember_keys';

  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  function ls() { return safe(function () { return window.localStorage; }, null); }
  function ss() { return safe(function () { return window.sessionStorage; }, null); }
  function nameFor(which) { return NAMES[which] || NAMES.primary; }

  function isRemembered() {
    var store = ls();
    return !!store && safe(function () { return store.getItem(REMEMBER_KEY); }, null) === '1';
  }

  /**
   * Move keys persisted by earlier versions out of localStorage.
   * @returns {boolean} true when something was actually moved
   */
  function migrateLegacy() {
    if (isRemembered()) return false;
    var store = ls();
    var session = ss();
    if (!store || !session) return false;

    var moved = false;
    Object.keys(NAMES).forEach(function (which) {
      var name = NAMES[which];
      var persisted = safe(function () { return store.getItem(name); }, null);
      if (!persisted) return;
      if (!safe(function () { return session.getItem(name); }, null)) {
        safe(function () { session.setItem(name, persisted); }, null);
      }
      safe(function () { store.removeItem(name); }, null);
      moved = true;
    });
    return moved;
  }

  /** Read a key. Session store wins; localStorage is only consulted when opted in. */
  function get(which) {
    var name = nameFor(which);
    var session = ss();
    var value = safe(function () { return session && session.getItem(name); }, null);
    if (!value && isRemembered()) {
      var store = ls();
      value = safe(function () { return store && store.getItem(name); }, null);
    }
    return (value || '').trim();
  }

  /** Write or clear a key in whichever store is active. */
  function set(which, value) {
    var name = nameFor(which);
    var clean = String(value === undefined || value === null ? '' : value).trim();
    var session = ss();
    var store = ls();
    if (!session) return clean;

    if (clean) {
      safe(function () { session.setItem(name, clean); }, null);
      if (isRemembered() && store) safe(function () { store.setItem(name, clean); }, null);
      else if (store) safe(function () { store.removeItem(name); }, null);
    } else {
      safe(function () { session.removeItem(name); }, null);
      if (store) safe(function () { store.removeItem(name); }, null);
    }
    return clean;
  }

  function clear(which) { return set(which, ''); }

  /** Turn persistence on or off, moving any existing key to the right store. */
  function setRemembered(flag) {
    var store = ls();
    var session = ss();

    if (!store) return false;

    Object.keys(NAMES).forEach(function (which) {
      var name = NAMES[which];
      if (flag) {
        var sessionValue = safe(function () { return session && session.getItem(name); }, null);
        if (sessionValue) safe(function () { store.setItem(name, sessionValue); }, null);
      } else {
        var persisted = safe(function () { return store.getItem(name); }, null);
        if (persisted && session) safe(function () { session.setItem(name, persisted); }, null);
        safe(function () { store.removeItem(name); }, null);
      }
    });

    if (flag) safe(function () { store.setItem(REMEMBER_KEY, '1'); }, null);
    else safe(function () { store.removeItem(REMEMBER_KEY); }, null);

    return isRemembered();
  }

  /** Everything the settings UI needs to describe the current state. */
  function describe() {
    var remembered = isRemembered();
    return {
      remembered: remembered,
      scope: remembered ? 'device' : 'session',
      hasPrimary: !!get('primary'),
      hasBackup: !!get('backup')
    };
  }

  /** Helper copy shown under the opt-in checkbox. */
  function rememberHint(remembered) {
    return remembered
      ? 'On — your key is saved in this browser so you do not have to paste it again after restarting.'
      : 'Off — your key is kept for this browser session only and is never written to your device.';
  }

  /* ---------------------------------------------------------------
     Tell existing users their persisted key was moved
     --------------------------------------------------------------- */

  var movedOnLoad = safe(migrateLegacy, false);

  if (movedOnLoad) {
    var announce = function () {
      if (window.SilidToast && typeof window.SilidToast.info === 'function') {
        window.SilidToast.info(
          'For your safety, your API key is no longer saved to this device — it is now kept for this ' +
          'browser session only. Tick "Remember my API key on this device" in Settings to save it again.',
          9000
        );
      }
    };
    if (typeof document !== 'undefined' && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', announce);
    } else {
      setTimeout(announce, 0);
    }
  }

  window.SilidKeys = {
    get: get,
    set: set,
    clear: clear,
    isRemembered: isRemembered,
    setRemembered: setRemembered,
    describe: describe,
    rememberHint: rememberHint,
    migrateLegacy: migrateLegacy
  };
})();
