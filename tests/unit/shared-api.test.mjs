import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, fakeLocalStorage, plain } from '../helpers/sandbox.mjs';

/* ---------------------------------------------------------------
   helpers
   --------------------------------------------------------------- */

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const ok = (text) => reply(200, { candidates: [{ content: { parts: [{ text }] } }] });
const apiError = (status, message) => reply(status, { error: { message } });
const networkError = () => { throw new TypeError('Failed to fetch'); };

/** Steps are consumed in order; the last one repeats. */
function fakeFetch(steps) {
  const calls = [];
  const impl = (url, opts) => {
    const index = calls.length;
    calls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
    const step = steps[Math.min(index, steps.length - 1)];
    return Promise.resolve().then(() => (typeof step === 'function' ? step() : step));
  };
  return Object.assign(impl, { calls });
}

/** Loads shared-api.js with a stubbed fetch and instant retry timers. */
function loadApi({ fetchImpl, storedKeys = {} } = {}) {
  const sandbox = loadModule('shared-api.js', {
    localStorage: fakeLocalStorage(storedKeys),
    fetch: fetchImpl,
    // retries are backed by setTimeout in the module — fire them immediately
    setTimeout: (fn) => setTimeout(fn, 0)
  });
  return sandbox.SilidAPI;
}

/* ---------------------------------------------------------------
   basics
   --------------------------------------------------------------- */

test('callGemini rejects when no key is configured', async () => {
  const api = loadApi({ fetchImpl: fakeFetch([ok('hi')]) });
  await assert.rejects(() => api.callGemini({ prompt: 'x' }), /set your Gemini API key first/i);
});

test('callGemini returns the trimmed response text', async () => {
  const fetchImpl = fakeFetch([ok('   Hello there  ')]);
  const api = loadApi({ fetchImpl, storedKeys: { gemini_api_key: 'KEY_A' } });

  assert.equal(await api.callGemini({ prompt: 'say hi' }), 'Hello there');
  assert.equal(fetchImpl.calls.length, 1);
  assert.match(fetchImpl.calls[0].url, /key=KEY_A/);
  assert.equal(fetchImpl.calls[0].body.contents[0].parts[0].text, 'say hi');
});

test('callGemini forwards system instruction, temperature, inline data and schema', async () => {
  const fetchImpl = fakeFetch([ok('done')]);
  const api = loadApi({ fetchImpl, storedKeys: { gemini_api_key: 'K' } });

  await api.callGemini({
    prompt: 'p',
    systemPrompt: 'be terse',
    temperature: 0.2,
    inlineData: { mimeType: 'application/pdf', data: 'BASE64' }
  });

  const body = fetchImpl.calls[0].body;
  assert.equal(body.systemInstruction.parts[0].text, 'be terse');
  assert.equal(body.generationConfig.temperature, 0.2);
  assert.deepEqual(body.contents[0].parts[1], { inlineData: { mimeType: 'application/pdf', data: 'BASE64' } });
});

test('callGemini rejects an empty response', async () => {
  const api = loadApi({ fetchImpl: fakeFetch([ok('')]), storedKeys: { gemini_api_key: 'K' } });
  await assert.rejects(() => api.callGemini({ prompt: 'x' }), /empty response/i);
});

test('callGemini accepts a bare string prompt', async () => {
  const api = loadApi({ fetchImpl: fakeFetch([ok('ok')]), storedKeys: { gemini_api_key: 'K' } });
  assert.equal(await api.callGemini('just a prompt'), 'ok');
});

/* ---------------------------------------------------------------
   error mapping
   --------------------------------------------------------------- */

test('permanent errors fail fast with a friendly message', async () => {
  const fetchImpl = fakeFetch([apiError(400, 'API key not valid. Please pass a valid API key.')]);
  const api = loadApi({ fetchImpl, storedKeys: { gemini_api_key: 'K' } });

  await assert.rejects(() => api.callGemini({ prompt: 'x' }), /aistudio\.google\.com\/apikey/);
  assert.equal(fetchImpl.calls.length, 1, 'must not retry a permanent error');
});

test('a permission error points at the Generative Language API', async () => {
  const api = loadApi({
    fetchImpl: fakeFetch([apiError(403, 'Permission denied on resource')]),
    storedKeys: { gemini_api_key: 'K' }
  });
  await assert.rejects(() => api.callGemini({ prompt: 'x' }), /Generative Language API is enabled/i);
});

/* ---------------------------------------------------------------
   retry + fallback
   --------------------------------------------------------------- */

test('transient 429 responses are retried and then succeed', async () => {
  const fetchImpl = fakeFetch([apiError(429, 'high demand'), apiError(503, 'unavailable'), ok('recovered')]);
  const api = loadApi({ fetchImpl, storedKeys: { gemini_api_key: 'K' } });

  assert.equal(await api.callGemini({ prompt: 'x' }), 'recovered');
  assert.equal(fetchImpl.calls.length, 3);
});

test('transient network failures are retried', async () => {
  const fetchImpl = fakeFetch([networkError, networkError, ok('back online')]);
  const api = loadApi({ fetchImpl, storedKeys: { gemini_api_key: 'K' } });

  assert.equal(await api.callGemini({ prompt: 'x' }), 'back online');
  assert.equal(fetchImpl.calls.length, 3);
});

test('a persistently failing network gives one clear message', async () => {
  const api = loadApi({ fetchImpl: fakeFetch([networkError]), storedKeys: { gemini_api_key: 'K' } });
  await assert.rejects(() => api.callGemini({ prompt: 'x' }), /Check your internet connection/i);
});

test('exhausted quota falls back to the backup key', async () => {
  // primary always says "quota"; backup answers
  const fetchImpl = fakeFetch([
    apiError(429, 'quota exceeded'),
    apiError(429, 'quota exceeded'),
    apiError(429, 'quota exceeded'),
    apiError(429, 'quota exceeded'),
    apiError(429, 'quota exceeded'),
    ok('served by backup')
  ]);
  const api = loadApi({
    fetchImpl,
    storedKeys: { gemini_api_key: 'PRIMARY', gemini_api_key_2: 'BACKUP' }
  });

  assert.equal(await api.callGemini({ prompt: 'x' }), 'served by backup');
  const urls = fetchImpl.calls.map((c) => c.url);
  assert.ok(urls.slice(0, 5).every((u) => u.includes('key=PRIMARY')), 'primary tried first');
  assert.ok(urls[5].includes('key=BACKUP'), 'last attempt uses the backup key');
});

test('the backup key is not used for permanent errors', async () => {
  const fetchImpl = fakeFetch([apiError(400, 'API key not valid')]);
  const api = loadApi({
    fetchImpl,
    storedKeys: { gemini_api_key: 'PRIMARY', gemini_api_key_2: 'BACKUP' }
  });

  await assert.rejects(() => api.callGemini({ prompt: 'x' }), /aistudio/);
  assert.equal(fetchImpl.calls.length, 1);
});

test('explicit apiKey / backupKey options override localStorage', async () => {
  const fetchImpl = fakeFetch([ok('fine')]);
  const api = loadApi({ fetchImpl, storedKeys: { gemini_api_key: 'STORED' } });

  await api.callGemini({ prompt: 'x', apiKey: 'EXPLICIT', backupKey: 'EXPLICIT_2' });
  assert.match(fetchImpl.calls[0].url, /key=EXPLICIT/);
});

/* ---------------------------------------------------------------
   JSON mode
   --------------------------------------------------------------- */

test('callGeminiJSON parses JSON and strips code fences', async () => {
  const fetchImpl = fakeFetch([ok('```json\n{"slides":[{"title":"A"}]}\n```')]);
  const api = loadApi({ fetchImpl, storedKeys: { gemini_api_key: 'K' } });

  assert.deepEqual(plain(await api.callGeminiJSON({ prompt: 'x' })), { slides: [{ title: 'A' }] });
  assert.equal(fetchImpl.calls[0].body.generationConfig.responseMimeType, 'application/json');
});

test('callGeminiJSON passes a response schema through', async () => {
  const schema = { type: 'OBJECT', properties: { title: { type: 'STRING' } } };
  const fetchImpl = fakeFetch([ok('{"title":"T"}')]);
  const api = loadApi({ fetchImpl, storedKeys: { gemini_api_key: 'K' } });

  await api.callGeminiJSON({ prompt: 'x', schema });
  assert.deepEqual(fetchImpl.calls[0].body.generationConfig.responseSchema, schema);
});

test('callGeminiJSON rejects invalid JSON with a friendly error', async () => {
  const api = loadApi({ fetchImpl: fakeFetch([ok('not json at all')]), storedKeys: { gemini_api_key: 'K' } });
  await assert.rejects(() => api.callGeminiJSON({ prompt: 'x' }), /invalid JSON/i);
});

/* ---------------------------------------------------------------
   pingKey
   --------------------------------------------------------------- */

test('pingKey reports ok for a working key', async () => {
  const api = loadApi({ fetchImpl: fakeFetch([ok('OK')]) });
  assert.deepEqual(plain(await api.pingKey('KEY')), { ok: true });
});

test('pingKey short-circuits on a blank key', async () => {
  const fetchImpl = fakeFetch([ok('OK')]);
  const api = loadApi({ fetchImpl });
  assert.deepEqual(plain(await api.pingKey('   ')), { ok: false, friendly: 'Please paste your API key first.' });
  assert.equal(fetchImpl.calls.length, 0);
});

test('pingKey maps an invalid key to a friendly message', async () => {
  const api = loadApi({ fetchImpl: fakeFetch([apiError(400, 'API key not valid')]) });
  const r = await api.pingKey('BAD');
  assert.equal(r.ok, false);
  assert.match(r.friendly, /not valid/i);
});

test('pingKey reports an unreachable Google', async () => {
  const api = loadApi({ fetchImpl: fakeFetch([networkError]) });
  const r = await api.pingKey('KEY');
  assert.equal(r.ok, false);
  assert.match(r.friendly, /Cannot reach Google/i);
});

test('pingKey does not retry', async () => {
  const fetchImpl = fakeFetch([apiError(429, 'high demand')]);
  const api = loadApi({ fetchImpl });
  await api.pingKey('KEY');
  assert.equal(fetchImpl.calls.length, 1);
});
