import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, fakeLocalStorage, plain } from '../helpers/sandbox.mjs';

const REMEMBER = 'silidpinoy_remember_keys';

/** Loads shared-keys.js against two isolated stores. */
function loadKeys({ localValues = {}, sessionValues = {} } = {}) {
  const local = fakeLocalStorage(localValues);
  const session = fakeLocalStorage(sessionValues);
  const sandbox = loadModule('shared-keys.js', { localStorage: local, sessionStorage: session });
  return { SilidKeys: sandbox.SilidKeys, local, session };
}

/* ------------------------------------------------------------------
   default: session only
   ------------------------------------------------------------------ */

test('by default a key is written to the session store, never to the device', () => {
  const { SilidKeys, local, session } = loadKeys();

  SilidKeys.set('primary', 'KEY_ONE');

  assert.equal(session.getItem('gemini_api_key'), 'KEY_ONE');
  assert.equal(local.getItem('gemini_api_key'), null, 'nothing may be persisted by default');
  assert.equal(SilidKeys.get('primary'), 'KEY_ONE');
  assert.equal(SilidKeys.isRemembered(), false);
});

test('the backup key is tracked separately', () => {
  const { SilidKeys, local, session } = loadKeys();

  SilidKeys.set('backup', 'KEY_TWO');

  assert.equal(session.getItem('gemini_api_key_2'), 'KEY_TWO');
  assert.equal(session.getItem('gemini_api_key'), null);
  assert.equal(local.getItem('gemini_api_key_2'), null);
  assert.equal(SilidKeys.get('backup'), 'KEY_TWO');
});

test('values are trimmed and blank values clear the key', () => {
  const { SilidKeys, local, session } = loadKeys();

  SilidKeys.set('primary', '  spaced  ');
  assert.equal(SilidKeys.get('primary'), 'spaced');

  SilidKeys.set('primary', '');
  assert.equal(SilidKeys.get('primary'), '');
  assert.equal(session.getItem('gemini_api_key'), null);
  assert.equal(local.getItem('gemini_api_key'), null);
});

test('an unknown key name falls back to the primary key', () => {
  const { SilidKeys, session } = loadKeys();
  SilidKeys.set('nonsense', 'VALUE');
  assert.equal(session.getItem('gemini_api_key'), 'VALUE');
});

/* ------------------------------------------------------------------
   opt in / opt out
   ------------------------------------------------------------------ */

test('opting in moves the session key into device storage', () => {
  const { SilidKeys, local, session } = loadKeys();

  SilidKeys.set('primary', 'KEY_ONE');
  SilidKeys.set('backup', 'KEY_TWO');
  SilidKeys.setRemembered(true);

  assert.equal(SilidKeys.isRemembered(), true);
  assert.equal(local.getItem(REMEMBER), '1');
  assert.equal(local.getItem('gemini_api_key'), 'KEY_ONE');
  assert.equal(local.getItem('gemini_api_key_2'), 'KEY_TWO');
  // the session copy stays so the page keeps working
  assert.equal(session.getItem('gemini_api_key'), 'KEY_ONE');
});

test('a key set while opted in is persisted immediately', () => {
  const { SilidKeys, local, session } = loadKeys({ localValues: { [REMEMBER]: '1' } });

  SilidKeys.set('primary', 'KEY_ONE');

  assert.equal(local.getItem('gemini_api_key'), 'KEY_ONE');
  assert.equal(session.getItem('gemini_api_key'), 'KEY_ONE');
  assert.equal(SilidKeys.get('primary'), 'KEY_ONE');
});

test('opting out moves the key back to the session and purges the device', () => {
  const { SilidKeys, local, session } = loadKeys({
    localValues: { [REMEMBER]: '1', gemini_api_key: 'PERSISTED', gemini_api_key_2: 'PERSISTED_2' }
  });

  SilidKeys.setRemembered(false);

  assert.equal(SilidKeys.isRemembered(), false);
  assert.equal(local.getItem(REMEMBER), null);
  assert.equal(local.getItem('gemini_api_key'), null, 'device copy must be removed');
  assert.equal(local.getItem('gemini_api_key_2'), null);
  // still usable for this session
  assert.equal(session.getItem('gemini_api_key'), 'PERSISTED');
  assert.equal(SilidKeys.get('primary'), 'PERSISTED');
});

test('clearing a key removes it from both stores', () => {
  const { SilidKeys, local, session } = loadKeys({
    localValues: { [REMEMBER]: '1', gemini_api_key: 'PERSISTED' },
    sessionValues: { gemini_api_key: 'PERSISTED' }
  });

  SilidKeys.clear('primary');

  assert.equal(SilidKeys.get('primary'), '');
  assert.equal(local.getItem('gemini_api_key'), null);
  assert.equal(session.getItem('gemini_api_key'), null);
});

/* ------------------------------------------------------------------
   legacy migration
   ------------------------------------------------------------------ */

test('keys persisted by an older version are moved into the session store', () => {
  const { SilidKeys, local, session } = loadKeys({
    localValues: { gemini_api_key: 'LEGACY', gemini_api_key_2: 'LEGACY_2' }
  });

  assert.equal(session.getItem('gemini_api_key'), 'LEGACY');
  assert.equal(session.getItem('gemini_api_key_2'), 'LEGACY_2');
  assert.equal(local.getItem('gemini_api_key'), null, 'the device copy must be purged');
  assert.equal(local.getItem('gemini_api_key_2'), null);
  assert.equal(SilidKeys.get('primary'), 'LEGACY');
  assert.equal(SilidKeys.get('backup'), 'LEGACY_2');
  // nothing left to migrate on a second pass
  assert.equal(SilidKeys.migrateLegacy(), false);
});

test('migration leaves opted-in keys alone', () => {
  const { SilidKeys, local, session } = loadKeys({
    localValues: { [REMEMBER]: '1', gemini_api_key: 'PERSISTED' }
  });

  assert.equal(local.getItem('gemini_api_key'), 'PERSISTED');
  assert.equal(session.getItem('gemini_api_key'), null);
  assert.equal(SilidKeys.migrateLegacy(), false);
});

test('migration does not overwrite a value already in the session', () => {
  const { SilidKeys, local, session } = loadKeys({
    localValues: { gemini_api_key: 'OLDER' },
    sessionValues: { gemini_api_key: 'NEWER' }
  });

  assert.equal(session.getItem('gemini_api_key'), 'NEWER');
  assert.equal(SilidKeys.get('primary'), 'NEWER');
  assert.equal(local.getItem('gemini_api_key'), null);
});

/* ------------------------------------------------------------------
   UI copy + state description
   ------------------------------------------------------------------ */

test('rememberHint explains both states', () => {
  const { SilidKeys } = loadKeys();
  assert.match(SilidKeys.rememberHint(false), /session only/i);
  assert.match(SilidKeys.rememberHint(false), /never written/i);
  assert.match(SilidKeys.rememberHint(true), /saved in this browser/i);
});

test('describe reports scope and which keys are set', () => {
  const { SilidKeys } = loadKeys();

  assert.deepEqual(plain(SilidKeys.describe()), {
    remembered: false, scope: 'session', hasPrimary: false, hasBackup: false
  });

  SilidKeys.set('primary', 'A');
  SilidKeys.setRemembered(true);

  assert.deepEqual(plain(SilidKeys.describe()), {
    remembered: true, scope: 'device', hasPrimary: true, hasBackup: false
  });
});

/* ------------------------------------------------------------------
   resilience
   ------------------------------------------------------------------ */

test('a storage that throws does not break the module', () => {
  const broken = {
    getItem() { throw new Error('quota'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('quota'); }
  };
  const sandbox = loadModule('shared-keys.js', { localStorage: broken, sessionStorage: broken });
  const { SilidKeys } = sandbox;

  assert.doesNotThrow(() => SilidKeys.set('primary', 'X'));
  assert.equal(SilidKeys.get('primary'), '');
  assert.equal(SilidKeys.isRemembered(), false);
});

test('warns the teacher once when legacy keys are migrated on load', () => {
  const messages = [];
  const local = fakeLocalStorage({ gemini_api_key: 'LEGACY' });
  loadModule('shared-keys.js', {
    localStorage: local,
    sessionStorage: fakeLocalStorage(),
    SilidToast: { info: (m) => messages.push(m) }
  });

  // the notice is deferred to DOMContentLoaded / next tick
  return new Promise((resolve) => setTimeout(resolve, 5)).then(() => {
    assert.equal(messages.length, 1);
    assert.match(messages[0], /remember my api key/i);
  });
});
