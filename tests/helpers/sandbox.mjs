import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Load one of the app's browser modules (an IIFE that attaches itself to
 * `window`) into a fresh sandbox, and hand back the sandbox global object.
 *
 *   const { SilidValidate } = loadModule('shared-validate.js');
 *
 * Anything the module needs from the browser (localStorage, fetch, document,
 * setTimeout, …) is passed via `globals`. Calling `sandbox.setTimeout` etc.
 * inside a test reaches the stub, because the sandbox global *is* `window`.
 */
export function loadModule(relativePath, globals = {}) {
  const file = path.resolve(ROOT, relativePath);
  const code = fs.readFileSync(file, 'utf8');

  const sandbox = {
    console,
    Promise,
    Map,
    Set,
    JSON,
    Date,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    isNaN,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    btoa,
    atob,
    ...globals
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  return sandbox;
}

/**
 * Copy a value out of the sandbox into the host realm.
 *
 * Objects and arrays created inside a vm context have that context's
 * `Object.prototype` / `Array.prototype`, so `assert.deepEqual` (strict) rejects
 * them as "not equal" even when every field matches. Round-tripping through JSON
 * gives an ordinary host value that compares normally.
 */
export function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** In-memory stand-in for window.localStorage. */
export function fakeLocalStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    clear: () => { map.clear(); },
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
    _map: map
  };
}

/** Collects SilidToast-level calls so tests can assert on user-visible warnings. */
export function fakeToast() {
  const calls = [];
  const record = (kind) => (message, duration) => { calls.push({ kind, message, duration }); };
  return {
    calls,
    SilidToast: {
      show: (message, type) => calls.push({ kind: type || 'info', message }),
      success: record('success'),
      error: record('error'),
      warning: record('warning'),
      info: record('info')
    }
  };
}
