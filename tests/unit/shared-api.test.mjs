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
/** pingKey validates against GET /v1beta/models, which answers with a models array. */
const modelsList = () => reply(200, { models: [{ name: 'models/gemini-2.0-flash' }] });
const networkError = () => { throw new TypeError('Failed to fetch'); };

/** Steps are consumed in order; the last one repeats. */
function fakeFetch(steps) {
  const calls = [];
  const impl = (url, opts) => {
    const index = calls.length;
    calls.push({
      url,
      headers: (opts && opts.headers) || {},
      body: opts && opts.body ? JSON.parse(opts.body) : null
    });
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
  // the key rides the request as the x-goog-api-key header, not a ?key= URL param
  assert.equal(fetchImpl.calls[0].headers['x-goog-api-key'], 'KEY_A');
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
  const keys = fetchImpl.calls.map((c) => c.headers['x-goog-api-key']);
  assert.ok(keys.slice(0, 5).every((k) => k === 'PRIMARY'), 'primary tried first');
  assert.equal(keys[5], 'BACKUP', 'last attempt uses the backup key');
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
  assert.equal(fetchImpl.calls[0].headers['x-goog-api-key'], 'EXPLICIT');
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
  const api = loadApi({ fetchImpl: fakeFetch([modelsList()]) });
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

/* ---------------------------------------------------------------
   generateImage (PowerPoint slide art)
   --------------------------------------------------------------- */

const imageReply = (b64 = 'QUJD', mime = 'image/png') =>
  reply(200, { interaction: { outputImage: { mimeType: mime, data: b64 } } });

test('generateImage hits the interactions endpoint and returns a data URI', async () => {
  const fetchImpl = fakeFetch([imageReply('AAAA')]);
  const api = loadApi({ fetchImpl, storedKeys: { gemini_api_key: 'K' } });

  const img = await api.generateImage({ prompt: 'a bright classroom' });
  assert.equal(img.dataUri, 'data:image/png;base64,AAAA');
  assert.equal(img.mimeType, 'image/png');
  assert.match(fetchImpl.calls[0].url, /\/v1beta\/interactions$/);
  assert.equal(fetchImpl.calls[0].headers['x-goog-api-key'], 'K');
  assert.equal(fetchImpl.calls[0].body.model, 'gemini-3.1-flash-lite-image');
  assert.deepEqual(fetchImpl.calls[0].body.input, [{ type: 'text', text: 'a bright classroom' }]);
});

test('generateImage never touches the text model endpoint', async () => {
  const fetchImpl = fakeFetch([imageReply()]);
  const api = loadApi({ fetchImpl, storedKeys: { gemini_api_key: 'K' } });

  await api.generateImage({ prompt: 'x' });
  assert.ok(fetchImpl.calls.every((c) => !/generateContent/.test(c.url)),
    'image calls must keep their own endpoint — the text model powers every tool');
  assert.equal(fetchImpl.calls.length, 1, 'a successful image must not be retried');
});

test('generateImage requires a key and a prompt', async () => {
  const noKey = loadApi({ fetchImpl: fakeFetch([imageReply()]) });
  await assert.rejects(() => noKey.generateImage({ prompt: 'x' }), /set your Gemini API key first/i);

  const api = loadApi({ fetchImpl: fakeFetch([imageReply()]), storedKeys: { gemini_api_key: 'K' } });
  await assert.rejects(() => api.generateImage({ prompt: '   ' }), /no image prompt/i);
  assert.equal((api.generateImage ? 1 : 0), 1, 'generateImage must be exported');
});

test('generateImage falls back to the backup key on quota errors', async () => {
  const fetchImpl = fakeFetch([
    apiError(429, 'quota exceeded'),
    apiError(429, 'quota exceeded'),
    apiError(429, 'quota exceeded'),
    imageReply('BACKUP')
  ]);
  const api = loadApi({
    fetchImpl,
    storedKeys: { gemini_api_key: 'PRIMARY', gemini_api_key_2: 'BACKUP_KEY' }
  });

  const img = await api.generateImage({ prompt: 'x' });
  assert.equal(img.dataUri, 'data:image/png;base64,BACKUP');
  const keys = fetchImpl.calls.map((c) => c.headers['x-goog-api-key']);
  assert.ok(keys.slice(0, 3).every((k) => k === 'PRIMARY'), 'primary tried first (initial + 2 retries)');
  assert.equal(keys[3], 'BACKUP_KEY', 'the backup key serves the fallback call');
});

test('generateImage reports a response that carries no image', async () => {
  const api = loadApi({
    fetchImpl: fakeFetch([reply(200, { interaction: {} })]),
    storedKeys: { gemini_api_key: 'K' }
  });
  await assert.rejects(() => api.generateImage({ prompt: 'x' }), /returned no image/i);
});

test('generateImage reads snake_case responses too', async () => {
  const api = loadApi({
    fetchImpl: fakeFetch([reply(200, { interaction: { output_image: { mime_type: 'image/jpeg', data: 'Zm9v' } } })]),
    storedKeys: { gemini_api_key: 'K' }
  });
  const img = await api.generateImage({ prompt: 'x' });
  assert.equal(img.dataUri, 'data:image/jpeg;base64,Zm9v');
});
