/**
 * shared-api.js — Centralized Gemini API client for all SilidPinoy tools.
 *
 * Exposes: window.SilidAPI
 *
 * Features:
 *  - Primary + automatic backup key fallback on quota/transient errors
 *  - Exponential backoff retry for transient failures (429, 5xx, network)
 *  - AbortController signal support for cancellation
 *  - Standardized friendly error messages
 *  - Plain text and JSON response modes
 *  - Optional system instruction and inline data (file attachments)
 */
(function () {
  'use strict';

  var API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';

  var DELAYS = [2000, 4000, 8000, 15000];

  /* ---------------------------------------------------------------
     Internal helpers
     --------------------------------------------------------------- */

  function getKeys() {
    // shared-keys.js owns where keys live (session by default, device when opted in)
    if (window.SilidKeys) {
      return { primary: window.SilidKeys.get('primary'), backup: window.SilidKeys.get('backup') };
    }
    var primary = (localStorage.getItem('gemini_api_key') || '').trim();
    var backup = (localStorage.getItem('gemini_api_key_2') || '').trim();
    return { primary: primary, backup: backup };
  }

  function isTransient(status, msg) {
    return status === 429 || status >= 500 ||
      /high demand|overloaded|resource exhausted|too many requests|temporar|unavailable/i.test(msg);
  }

  function friendlyError(msg) {
    if (!msg) return 'Something went wrong. Please check your key and try again.';
    if (msg.indexOf('API key not valid') !== -1) return 'Your API key is not valid. Get a new one at aistudio.google.com/apikey and update it in Settings.';
    if (msg.indexOf('Permission denied') !== -1) return 'Permission denied. Make sure the Generative Language API is enabled for your Google account.';
    if (msg.indexOf('quota') !== -1) return 'You have used up your free Gemini quota for today. Try again tomorrow, or use a backup key.';
    if (msg.indexOf('not found') !== -1) return 'This API key does not have access to Gemini. Create a new key at aistudio.google.com/apikey.';
    if (msg.indexOf('Invalid JSON') !== -1 || msg.indexOf('Unexpected token') !== -1) return 'The AI returned an invalid response. Please try again.';
    return msg;
  }

  function extractResponseText(data) {
    return data && data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text || '';
  }

  /* ---------------------------------------------------------------
     Core fetch with retry
     --------------------------------------------------------------- */

  function fetchWithRetry(url, body, opts) {
    var retries = opts.retries !== undefined ? opts.retries : 4;
    var signal = opts.signal || null;
    var attempt = 0;

    function doFetch() {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: signal
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            var msg = (data.error && data.error.message) || ('HTTP error ' + res.status);
            if (!isTransient(res.status, msg)) throw new Error(friendlyError(msg));
            if (attempt < retries) {
              var wait = DELAYS[attempt]; attempt++;
              return new Promise(function (resolve) { setTimeout(resolve, wait); }).then(doFetch);
            }
            throw new Error(friendlyError(msg));
          }
          return data;
        });
      }, function (err) {
        if (err.name === 'AbortError') throw err;
        if (attempt < retries) {
          var wait = DELAYS[attempt]; attempt++;
          return new Promise(function (resolve) { setTimeout(resolve, wait); }).then(doFetch);
        }
        throw new Error('Network error while contacting the Gemini API. Check your internet connection and try again.');
      });
    }

    return doFetch();
  }

  /* ---------------------------------------------------------------
     Public API
     --------------------------------------------------------------- */

  function callGeminiRaw(opts) {
    var keys = getKeys();
    var key = opts.apiKey || keys.primary;
    var backupKey = opts.backupKey || keys.backup;
    var systemPrompt = opts.systemPrompt || '';
    var prompt = opts.prompt || '';
    var temperature = typeof opts.temperature === 'number' ? opts.temperature : 0.7;
    var signal = opts.signal || null;

    if (!key) {
      return Promise.reject(new Error('Please set your Gemini API key first — click the gear icon in the header.'));
    }

    var parts = [{ text: prompt }];
    if (opts.inlineData) {
      parts.push({ inlineData: opts.inlineData });
    }

    var payload = { contents: [{ parts: parts }] };
    if (systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    var genConfig = { temperature: temperature };
    if (opts.responseMimeType) genConfig.responseMimeType = opts.responseMimeType;
    // callers pass either `schema` (documented API) or `responseSchema` (wire name)
    var schema = opts.responseSchema || opts.schema;
    if (schema) genConfig.responseSchema = schema;
    payload.generationConfig = genConfig;

    var url = API_BASE + '?key=' + encodeURIComponent(key);

    return fetchWithRetry(url, payload, { signal: signal, retries: 4 }).catch(function (err) {
      var msg = (err && err.message) || '';
      var isQuotaOrBusy = /quota|high demand|overloaded|resource exhausted|too many requests|temporar|unavailable|429/i.test(msg);
      if (backupKey && backupKey !== key && isQuotaOrBusy) {
        var backupUrl = API_BASE + '?key=' + encodeURIComponent(backupKey);
        return fetchWithRetry(backupUrl, payload, { signal: signal, retries: 4 });
      }
      throw err;
    });
  }

  /**
   * Call Gemini and return plain text.
   *
   * opts: { prompt, systemPrompt?, temperature?, signal?, apiKey?, backupKey?, inlineData? }
   * Returns: Promise<string>
   */
  function callGemini(opts) {
    if (typeof opts === 'string') opts = { prompt: opts };
    return callGeminiRaw(opts).then(function (data) {
      var text = extractResponseText(data);
      if (!text) throw new Error('The AI returned an empty response. Please try again.');
      return text.trim();
    });
  }

  /**
   * Call Gemini and return parsed JSON.
   *
   * opts: { prompt, systemPrompt?, temperature?, schema?, signal?, apiKey?, backupKey?, inlineData? }
   * Returns: Promise<object>
   */
  function callGeminiJSON(opts) {
    if (typeof opts === 'string') opts = { prompt: opts };
    opts.responseMimeType = 'application/json';
    return callGeminiRaw(opts).then(function (data) {
      var text = extractResponseText(data);
      if (!text) throw new Error('The AI returned an empty response. Please try again.');
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('The AI returned invalid JSON. Please try again.');
      }
    });
  }

  /**
   * Test whether an API key is valid.
   *
   * key: string
   * signal: AbortSignal (optional)
   * Returns: Promise<{ ok: boolean, friendly?: string }>
   */
  function pingKey(key, signal) {
    if (!key || !key.trim()) {
      return Promise.resolve({ ok: false, friendly: 'Please paste your API key first.' });
    }
    var url = API_BASE + '?key=' + encodeURIComponent(key.trim());
    var payload = { contents: [{ parts: [{ text: 'Say OK' }] }] };

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: signal
    }).then(function (r) {
      return r.json().then(function (data) {
        if (r.ok && data.candidates) return { ok: true };
        return { ok: false, friendly: friendlyError((data.error && data.error.message) || '') };
      });
    }, function () {
      return { ok: false, friendly: 'Cannot reach Google. Check your internet connection and try again.' };
    });
  }

  /* ---------------------------------------------------------------
     Expose
     --------------------------------------------------------------- */

  window.SilidAPI = {
    callGemini: callGemini,
    callGeminiJSON: callGeminiJSON,
    pingKey: pingKey
  };
})();
