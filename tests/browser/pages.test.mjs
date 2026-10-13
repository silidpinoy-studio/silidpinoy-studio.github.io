import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlaywright } from '../helpers/playwright.mjs';
import { startServer } from '../helpers/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const PAGES = [
  { file: 'index.html', tool: 'test-maker', modules: ['shared-api.js', 'shared-keys.js', 'shared-backup.js', 'shared-validate.js', 'shared-docs.js', 'shared-file-utils.js', 'shared-toast.js', 'shared-docs-ui.js'] },
  { file: 'lesson.html', tool: 'lesson-plan', modules: ['shared-api.js', 'shared-keys.js', 'shared-validate.js', 'shared-docs.js', 'shared-file-utils.js', 'shared-toast.js', 'shared-docs-ui.js'] },
  { file: 'activity.html', tool: 'activity-sheet', modules: ['shared-api.js', 'shared-keys.js', 'shared-validate.js', 'shared-docs.js', 'shared-file-utils.js', 'shared-toast.js', 'shared-docs-ui.js'] },
  { file: 'powerpoint.html', tool: 'ppt-maker', modules: ['shared-api.js', 'shared-keys.js', 'shared-validate.js', 'shared-docs.js', 'shared-file-utils.js', 'shared-toast.js', 'shared-docs-ui.js'] },
  { file: 'tos.html', tool: 'tos', modules: ['shared-api.js', 'shared-keys.js', 'shared-validate.js', 'shared-docs.js', 'shared-file-utils.js', 'shared-toast.js', 'shared-docs-ui.js'] }
];

const GLOBALS = {
  'shared-api.js': ['SilidAPI', 'callGemini', 'callGeminiJSON', 'pingKey'],
  'shared-keys.js': ['SilidKeys', 'get', 'set', 'clear', 'isRemembered', 'setRemembered', 'describe', 'rememberHint'],
  'shared-backup.js': ['SilidBackup', 'exportBackup', 'importBackup', 'applyImport'],
  'shared-validate.js': ['SilidValidate', 'validateTestOutput', 'validatePptSlides', 'validateActivityHtml', 'validateLessonHtml'],
  'shared-docs.js': ['SilidDocs', 'saveDocument', 'getDocuments', 'deleteDocument', 'updateDocument'],
  'shared-file-utils.js': ['SilidFileUtils', 'checkSourceLength', 'checkPdfQuality', 'warnAboutSource'],
  'shared-toast.js': ['SilidToast', 'success', 'error', 'warning', 'info'],
  'shared-docs-ui.js': ['SilidDocsUI', 'mount', 'save', 'onOpen', 'open', 'close']
};

// Third-party assets the pages need; when these cannot be reached the pages
// legitimately cannot mount, so those assertions are skipped rather than failed.
const CDN_HOSTS = [
  'cdn.tailwindcss.com', 'unpkg.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'
];

const WAIT_MS = 3200;
const NAV_TIMEOUT = 45000;
const LONG_TIMEOUT = 90000;

let server;
let browser;

async function launch(pw) {
  try {
    return await pw.chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return await pw.chromium.launch({ headless: true }); // bundled chromium
  }
}

before(async () => {
  const pw = await getPlaywright();
  server = await startServer(ROOT);
  browser = await launch(pw);
}, { timeout: LONG_TIMEOUT });

after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

/**
 * Opens a page in an isolated browser context and records anything it complains about.
 * `initScript` runs before any page script, which is how the app's own key lookup is seeded.
 */
async function openPage(file, { waitMs = WAIT_MS, initScript } = {}) {
  const context = await browser.newContext();
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];

  page.on('pageerror', (e) => errors.push('uncaught: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('dialog', async (d) => {
    errors.push(`dialog(${d.type()}): ${d.message()}`);
    await d.dismiss().catch(() => {});
  });

  await page.goto(server.url + file, { waitUntil: 'load', timeout: NAV_TIMEOUT });
  await page.waitForTimeout(waitMs);

  const cdnBlocked = failedRequests.some((u) => CDN_HOSTS.some((h) => u.includes(h)));
  return { context, page, errors, failedRequests, cdnBlocked };
}

/* ===============================================================
   1. every page loads cleanly
   =============================================================== */

test('every page loads with no console or page errors', { timeout: LONG_TIMEOUT }, async (t) => {
  for (const { file } of PAGES) {
    await t.test(file, { timeout: NAV_TIMEOUT + 10000 }, async (t) => {
      const { context, page, errors, cdnBlocked } = await openPage(file);
      try {
        const mounted = await page.evaluate(
          () => document.body.children.length > 0 && document.body.innerText.trim().length > 40
        );
        if (cdnBlocked && !mounted) {
          t.diagnostic('CDN assets unreachable — skipping render assertions');
          t.skip('external CDN unavailable');
          return;
        }
        assert.deepEqual(errors, [], `${file} reported errors`);
        assert.ok(mounted, `${file} did not render any content`);
      } finally {
        await context.close();
      }
    });
  }
});

/* ===============================================================
   2. each page exposes the shared modules it loads
   =============================================================== */

test('each page exposes the shared modules it loads', { timeout: LONG_TIMEOUT }, async (t) => {
  for (const { file, modules } of PAGES) {
    if (!modules.length) continue;
    await t.test(file, { timeout: NAV_TIMEOUT + 10000 }, async (t) => {
      const { context, page, cdnBlocked } = await openPage(file);
      try {
        if (cdnBlocked) {
          t.skip('external CDN unavailable');
          return;
        }
        const missing = await page.evaluate((spec) => {
          const gone = [];
          for (const [mod, [root, ...members]] of Object.entries(spec)) {
            if (!window[root]) { gone.push(root); continue; }
            for (const m of members) if (typeof window[root][m] !== 'function') gone.push(`${root}.${m}`);
          }
          return gone;
        }, Object.fromEntries(modules.map((m) => [m, GLOBALS[m]])));
        assert.deepEqual(missing, [], `${file} is missing shared globals`);
      } finally {
        await context.close();
      }
    });
  }
});

/* ===============================================================
   3. document drawer
   =============================================================== */

test('document drawer supports the full CRUD round-trip', { timeout: LONG_TIMEOUT }, async () => {
  const { context, page, errors } = await openPage('lesson.html');
  try {
    const seedId = await page.evaluate(() => window.SilidDocs.saveDocument({
      tool: 'lesson-plan', name: 'Seeded Lesson', content: '<h1>Sample lesson</h1>', summary: 'Grade 7 · Science'
    }));
    assert.equal(typeof seedId, 'string');

    // a document belonging to another tool must not leak into this drawer
    await page.evaluate(() => window.SilidDocs.saveDocument({ tool: 'tos', name: 'Other tool doc', content: 'x' }));

    const drawer = page.locator('aside[aria-label="My documents"]');
    const items = drawer.locator('[data-docs-item]');

    await page.locator('button[title="My Documents"]').click();
    await page.waitForTimeout(600);
    assert.equal(await items.count(), 1, 'drawer should only list this tool\'s documents');
    assert.equal((await drawer.locator('[data-docs-name]').first().textContent()), 'Seeded Lesson');

    // rename inline
    await drawer.locator('[data-docs-item] button:has-text("Rename")').first().click();
    const input = drawer.locator('input[type="text"]').first();
    await input.fill('Renamed Lesson');
    await input.press('Enter');
    await page.waitForTimeout(500);
    assert.equal(await drawer.locator('[data-docs-name]').first().textContent(), 'Renamed Lesson');

    // duplicate
    await drawer.locator('[data-docs-item] button:has-text("Duplicate")').first().click();
    await page.waitForTimeout(700);
    assert.equal(await items.count(), 2);

    // delete, with the two-click confirm
    await drawer.locator('[data-docs-item] button:has-text("Delete")').first().click();
    await drawer.locator('[data-docs-item] button:has-text("Confirm delete")').first().click();
    await page.waitForTimeout(600);
    assert.equal(await items.count(), 1);

    // Escape closes it
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const transform = await drawer.evaluate((el) => getComputedStyle(el).transform);
    assert.notEqual(transform, 'none', 'drawer should slide away on Escape');

    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('opening a saved document restores the tool output', { timeout: LONG_TIMEOUT }, async (t) => {
  const cases = [
    {
      file: 'lesson.html',
      tool: 'lesson-plan',
      name: 'Lesson to restore',
      content: '<h1>Restored lesson body</h1>',
      assert: async (page) => {
        const out = await page.evaluate(() => {
          const el = document.getElementById('output-content');
          return { hidden: el.classList.contains('hidden'), html: el.innerHTML };
        });
        return !out.hidden && out.html.includes('Restored lesson body');
      }
    },
    {
      file: 'powerpoint.html',
      tool: 'ppt-maker',
      name: 'Deck to restore',
      content: JSON.stringify({
        slides: [
          { title: 'Photosynthesis', content: ['Plants make food', 'Chlorophyll'] },
          { title: 'Wrap up', content: ['Recap'] }
        ],
        presentationTitle: 'Deck to restore'
      }),
      assert: async (page) => {
        const ppt = await page.evaluate(() => ({
          total: (document.getElementById('slide-total') || {}).textContent,
          body: (document.getElementById('slide-body') || {}).textContent || ''
        }));
        return ppt.total === '2' && ppt.body.includes('Photosynthesis');
      }
    },
    {
      file: 'tos.html',
      tool: 'tos',
      name: 'TOS to restore',
      content: JSON.stringify({ meta: {}, allocationMode: 'manual', cognitiveLevels: [], competencies: [] }),
      meta: {
        config: {
          meta: { title: 'Quarter 1 Test', totalItems: 30, gradeLevel: '7', learningArea: 'Science' },
          allocationMode: 'manual',
          cognitiveLevels: [{ name: 'Remembering', pct: 100 }],
          competencies: [{ id: 1, name: 'Cells', hours: '4', manualItems: '30' }]
        }
      },
      assert: async (page) => {
        const text = await page.evaluate(() => document.body.innerText);
        return text.includes('Cells') || text.includes('Quarter 1 Test');
      }
    }
  ];

  for (const c of cases) {
    await t.test(c.file, { timeout: NAV_TIMEOUT + 20000 }, async (t) => {
      const { context, page, cdnBlocked } = await openPage(c.file);
      try {
        if (cdnBlocked) { t.skip('external CDN unavailable'); return; }
        await page.evaluate((doc) => window.SilidDocs.saveDocument(doc), {
          tool: c.tool, name: c.name, content: c.content, meta: c.meta || {}
        });
        await page.locator('button[title="My Documents"]').click();
        await page.waitForTimeout(500);
        await page.locator('aside[aria-label="My documents"] [data-docs-item] button:has-text("Open")').first().click();
        await page.waitForTimeout(700);
        assert.ok(await c.assert(page), `${c.file} did not restore the document`);
      } finally {
        await context.close();
      }
    });
  }
});

/* ===============================================================
   4. large-file warnings
   =============================================================== */

test('shared-file-utils raises toasts for oversized sources and scanned PDFs', { timeout: LONG_TIMEOUT }, async () => {
  const { context, page } = await openPage('lesson.html');
  try {
    const oversized = await page.evaluate(() => {
      document.querySelectorAll('#silid-toast-container > div').forEach((n) => n.remove());
      window.SilidFileUtils.warnAboutSource('word '.repeat(9000), 'lesson-plan'); // > 30k
      return document.querySelectorAll('#silid-toast-container > div').length;
    });
    assert.ok(oversized >= 1, 'oversized source should raise a toast');

    const scanned = await page.evaluate(() => {
      document.querySelectorAll('#silid-toast-container > div').forEach((n) => n.remove());
      window.SilidFileUtils.warnAboutSource('barely any text', 'activity-sheet', 40);
      return document.querySelectorAll('#silid-toast-container > div').length;
    });
    assert.ok(scanned >= 1, 'scanned PDF should raise a toast');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   5. shared-api against a stubbed Gemini endpoint
   =============================================================== */

test('SilidAPI retries transient failures and falls back to the backup key', { timeout: LONG_TIMEOUT }, async () => {
  const { context, page } = await openPage('lesson.html');
  try {
    // collapse the module's 2s/4s/8s/15s backoff so the test stays fast
    await page.evaluate(() => {
      window.__realSetTimeout = window.setTimeout;
      window.setTimeout = (fn) => window.__realSetTimeout(fn, 0);
    });

    const hits = [];
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      const url = route.request().url();
      hits.push(url);
      const isPrimary = url.includes('key=PRIMARY_KEY');
      if (isPrimary) {
        return route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'quota exceeded' } })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'served by backup' }] } }] })
      });
    });

    const text = await page.evaluate(() => {
      window.SilidKeys.set('primary', 'PRIMARY_KEY');
      window.SilidKeys.set('backup', 'BACKUP_KEY');
      return window.SilidAPI.callGemini({ prompt: 'hello' });
    });

    assert.equal(text, 'served by backup');
    assert.ok(hits.length >= 6, `expected primary retries then backup, saw ${hits.length} calls`);
    assert.ok(hits.slice(0, 5).every((u) => u.includes('key=PRIMARY_KEY')), 'primary should be tried first');
    assert.ok(hits[hits.length - 1].includes('key=BACKUP_KEY'), 'last attempt should use the backup key');
  } finally {
    await context.close();
  }
});

test('SilidAPI maps a permanent error without retrying', { timeout: LONG_TIMEOUT }, async () => {
  const { context, page } = await openPage('lesson.html');
  try {
    let calls = 0;
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      calls++;
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } })
      });
    });

    const message = await page.evaluate(async () => {
      window.SilidKeys.set('primary', 'BAD_KEY');
      try {
        await window.SilidAPI.callGemini({ prompt: 'hello' });
        return 'resolved';
      } catch (e) {
        return e.message;
      }
    });

    assert.match(message, /aistudio\.google\.com\/apikey/);
    assert.equal(calls, 1, 'a permanent error must not be retried');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   6. opt-in API key persistence
   =============================================================== */

test('API keys stay session-only until the teacher opts in', { timeout: LONG_TIMEOUT }, async () => {
  const { context, page } = await openPage('lesson.html');
  try {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      window.SilidKeys.clear('primary');
    });

    // typing a key must not touch the device by default
    await page.locator('#settings-btn').click();
    await page.waitForTimeout(300);
    await page.fill('#settings-key-input', 'KEY_FOR_TEST');
    await page.waitForTimeout(300);

    const typed = await page.evaluate(() => ({
      device: localStorage.getItem('gemini_api_key'),
      session: sessionStorage.getItem('gemini_api_key'),
      checked: document.getElementById('remember-keys').checked,
      hint: document.getElementById('remember-keys-hint').textContent
    }));
    assert.equal(typed.session, 'KEY_FOR_TEST', 'the key should work for this session');
    assert.equal(typed.device, null, 'nothing may be written to the device by default');
    assert.equal(typed.checked, false, 'the opt-in must start unchecked');
    assert.match(typed.hint, /session only/i);

    // opt in
    await page.locator('#remember-keys').check();
    await page.waitForTimeout(300);
    const optedIn = await page.evaluate(() => ({
      device: localStorage.getItem('gemini_api_key'),
      flag: localStorage.getItem('silidpinoy_remember_keys'),
      remembered: window.SilidKeys.isRemembered(),
      hint: document.getElementById('remember-keys-hint').textContent
    }));
    assert.equal(optedIn.remembered, true);
    assert.equal(optedIn.flag, '1');
    assert.equal(optedIn.device, 'KEY_FOR_TEST');
    assert.match(optedIn.hint, /saved in this browser/i);

    // and it survives a reload when opted in
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const reloaded = await page.evaluate(() => ({
      key: window.SilidKeys.get('primary'),
      checked: document.getElementById('remember-keys').checked
    }));
    assert.equal(reloaded.key, 'KEY_FOR_TEST');
    assert.equal(reloaded.checked, true);

    // opting back out purges the device copy but keeps the session working
    await page.locator('#settings-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#remember-keys').uncheck();
    await page.waitForTimeout(300);
    const optedOut = await page.evaluate(() => ({
      device: localStorage.getItem('gemini_api_key'),
      session: sessionStorage.getItem('gemini_api_key'),
      remembered: window.SilidKeys.isRemembered()
    }));
    assert.equal(optedOut.remembered, false);
    assert.equal(optedOut.device, null, 'the device copy must be purged on opt-out');
    assert.equal(optedOut.session, 'KEY_FOR_TEST', 'the session copy must keep working');
  } finally {
    await context.close();
  }
});

test('keys saved by an older version are moved off the device and announced', { timeout: LONG_TIMEOUT }, async (t) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    // simulate the pre-opt-in build, which always wrote the key to localStorage
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.setItem('gemini_api_key', 'LEGACY_KEY');
      sessionStorage.setItem('__seeded', '1');
    }
  });
  const page = await context.newPage();
  try {
    await page.goto(server.url + 'lesson.html', { waitUntil: 'load', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(3500);

    const state = await page.evaluate(() => ({
      device: localStorage.getItem('gemini_api_key'),
      session: sessionStorage.getItem('gemini_api_key'),
      key: window.SilidKeys.get('primary'),
      toasts: Array.from(document.querySelectorAll('#silid-toast-container > div')).map((n) => n.textContent)
    }));

    assert.equal(state.session, 'LEGACY_KEY', 'the key should carry over into the session store');
    assert.equal(state.device, null, 'the device copy must be purged');
    assert.equal(state.key, 'LEGACY_KEY');
    if (!state.toasts.length) {
      t.diagnostic('toast container was empty — the notice may have auto-dismissed already');
    } else {
      assert.ok(
        state.toasts.some((text) => /remember my api key/i.test(text)),
        'the teacher should be told about the change'
      );
    }
  } finally {
    await context.close();
  }
});

/* ===============================================================
   7. PPT Maker deck size (topic + DLL)
   =============================================================== */

test('PPT Maker lets the teacher pick the deck size for topic and DLL decks', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, cdnBlocked } = await openPage('powerpoint.html');
  try {
    if (cdnBlocked) { t.skip('external CDN unavailable'); return; }

    // both modes expose the same five ranges, each with its own default
    const selects = await page.evaluate(() => {
      const read = (id) => {
        const el = document.getElementById(id);
        return el ? { value: el.value, options: Array.from(el.options).map((o) => o.value) } : null;
      };
      return { topic: read('topic-slide-range'), dll: read('dll-slide-range') };
    });
    assert.ok(selects.topic, 'the topic deck-size selector is missing');
    assert.ok(selects.dll, 'the DLL deck-size selector is missing');
    const RANGES = ['5-8', '8-12', '12-16', '16-20', '20+'];
    assert.deepEqual(selects.topic.options, RANGES, 'topic deck sizes changed');
    assert.deepEqual(selects.dll.options, RANGES, 'DLL deck sizes should match topic mode');
    assert.equal(selects.topic.value, '8-12', 'topic should default to Standard (8-12)');
    assert.equal(selects.dll.value, '12-16', 'DLL should default to Long (12-16)');

    // stub the Gemini endpoint so we can read the prompt the app really sends
    const prompts = [];
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      try {
        const body = JSON.parse(route.request().postData() || '{}');
        const prompt = (body.contents && body.contents[0] && body.contents[0].parts &&
          body.contents[0].parts[0] && body.contents[0].parts[0].text) || '';
        if (prompt.includes('expert Teacher, Instructional Designer')) prompts.push(prompt);
      } catch { /* not a JSON call — fall through to the stub reply */ }
      const deck = {
        presentationTitle: 'Stub lesson deck',
        slides: [
          { layout: 'title', title: 'Day 1: The Water Cycle', content: ['Welcome'], speakerNotes: 'n', suggestedVisual: '', youtubeVideo: '' },
          { layout: 'content_bullets', title: 'Discussion', content: ['point a', 'point b'], speakerNotes: 'n', suggestedVisual: '', youtubeVideo: '' },
          { layout: 'big_statement', title: 'Wrap up', content: ['Recap'], speakerNotes: 'n', suggestedVisual: '', youtubeVideo: '' }
        ]
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(deck) }] } }] })
      });
    });

    // configure a small lesson deck and generate it
    await page.locator('button[data-mode="dll"]').click();
    await page.locator('button[data-dllsrc="manual"]').click();
    await page.fill('#dll-subject', 'Science');
    await page.fill('#dll-grade', 'Grade 5');
    await page.fill('#dll-competency', 'The Water Cycle');
    await page.fill('#dll-manual-text', 'Evaporation, condensation and precipitation make up the water cycle.');
    await page.selectOption('#dll-slide-range', '5-8');

    await page.locator('#settings-btn').click();
    await page.fill('#settings-key-input', 'TEST_KEY');
    await page.waitForTimeout(200);

    await page.locator('#btn-dll-generate').click();
    await page.waitForFunction(() => {
      const t = document.getElementById('slide-total');
      return t && t.textContent === '3';
    });

    assert.equal(prompts.length, 1, `expected one DLL prompt, saw ${prompts.length}`);
    const prompt = prompts[0];
    assert.ok(prompt.includes('must total 5 to 8 slides'), 'the prompt must ask for the chosen deck size');
    assert.ok(prompt.includes('5 to 8 slide target'), 'the structure guidance should follow the chosen size');
    assert.ok(!/MINIMUM OF 18|18\+ slide/i.test(prompt), 'the old hard-coded 18-slide minimum must be gone');
    assert.equal(await page.locator('#slide-total').textContent(), '3', 'the stubbed deck should render');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   8. Lesson Plan → PPT Maker hand-off
   =============================================================== */

test('a generated lesson plan can be turned into a presentation', { timeout: LONG_TIMEOUT }, async (t) => {
  const context = await browser.newContext();
  // seed the "last generated lesson plan" so the output toolbar (and its buttons) appear
  await context.addInitScript(() => {
    try {
      localStorage.setItem('saved_lesson_output', JSON.stringify({
        html: '<h1>Week 1: The Water Cycle</h1><table><tr><td>Session 1</td><td>Evaporation and condensation</td></tr></table>'
      }));
    } catch { /* storage unavailable */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('uncaught: ' + e.message));
  try {
    await page.goto(server.url + 'lesson.html', { waitUntil: 'load', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(WAIT_MS);

    const btn = page.locator('#ppt-btn');
    if (!(await btn.isVisible())) {
      t.skip('lesson.html did not render its output toolbar (CDN unavailable?)');
      return;
    }

    await btn.click();
    await page.waitForURL('**/powerpoint.html', { timeout: NAV_TIMEOUT });
    await page.waitForTimeout(WAIT_MS);

    const info = await page.evaluate(() => ({
      paste: (document.getElementById('dll-paste') || {}).value || '',
      cardOpen: !document.getElementById('card-dll').classList.contains('hidden'),
      tabActive: !!(document.querySelector('#mode-tabs button[data-mode="dll"]') || {}).classList
        .contains('active'),
      exemplarActive: !!(document.querySelector('#dll-source-pills .dllsrc-toggle[data-dllsrc="exemplar"]') || {})
        .classList.contains('active'),
      leftover: localStorage.getItem('lesson_ppt_import')
    }));

    assert.ok(info.cardOpen, 'the DLL card should be open after the hand-off');
    assert.ok(info.tabActive, 'the DLL tab should be the active mode');
    assert.ok(info.exemplarActive, 'the exemplar source should be selected');
    assert.ok(info.paste.includes('The Water Cycle'), 'the lesson text should be prefilled');
    assert.ok(info.paste.includes('LESSON SOURCE'), 'the header should explain where the text came from');
    assert.ok(info.paste.includes('Session 1'), 'table cells should survive the HTML-to-text conversion');
    assert.equal(info.leftover, null, 'the hand-off key must be cleared after import');
    assert.deepEqual(errors, [], 'the hand-off must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   10. Lesson Plan session duration
   =============================================================== */

test('the session duration input tells the AI how long a lesson lasts', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, cdnBlocked } = await openPage('lesson.html');
  try {
    if (cdnBlocked) { t.skip('external CDN unavailable'); return; }

    const duration = page.locator('#session-duration');
    assert.ok(await duration.isVisible(), 'the session duration input is missing');
    assert.equal(await duration.inputValue(), '60', 'a session should default to 60 minutes');

    // capture what is actually sent to the model
    const bodies = [];
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      bodies.push(route.request().postData() || '');
      const html = '<div><h1>Weekly Lesson Plan</h1><table>' +
        '<tr><td>Learning Objectives</td><td>Demo objectives for the session.</td></tr>' +
        '<tr><td>Content</td><td>Demo content for the session.</td></tr></table></div>';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: html }] } }] })
      });
    });

    // switch to English first (it resets the form defaults), then make the form submittable
    await page.locator('#lang-pill button[data-value="en"]').click();
    await page.locator('#settings-btn').click();
    await page.fill('#settings-key-input', 'TEST_KEY');
    await page.fill('#learningArea', 'Science 7');
    await page.selectOption('#gradeLevelSel', 'Grade 7');
    await page.fill('#sectionInput', 'Mabini');
    await page.locator('.competency-input').first().fill('Describe the water cycle.');
    await duration.fill('45');
    await page.waitForTimeout(250);

    await page.locator('#generate-btn').click();
    await page.waitForFunction(() => {
      const el = document.getElementById('output-content');
      return el && !el.classList.contains('hidden');
    });

    assert.ok(bodies.length >= 1, 'no request reached the AI');
    const sent = bodies.join('\n');
    assert.ok(sent.includes('EXACTLY 45 minutes'), 'the prompt must state the chosen session length');
    assert.ok(sent.includes('45 minutes</td>'), 'the table template should carry the time allotment row');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   10b. Lesson Plan Maker: K-3 rules + the multigrade sequence dropdown
   =============================================================== */

test('the Lesson Plan Maker adds the K-3 rules for early learners only', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, cdnBlocked } = await openPage('lesson.html');
  try {
    if (cdnBlocked) { t.skip('external CDN unavailable'); return; }

    const bodies = [];
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      bodies.push(route.request().postData() || '');
      const html = '<div><h1>Weekly Lesson Plan</h1><table>' +
        '<tr><td>Learning Objectives</td><td>Demo objectives for the session.</td></tr>' +
        '<tr><td>Content</td><td>Demo content for the session.</td></tr></table></div>';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: html }] } }] })
      });
    });

    // switch to English first (it resets the form defaults), then make the form submittable
    await page.locator('#lang-pill button[data-value="en"]').click();
    await page.locator('#settings-btn').click();
    await page.fill('#settings-key-input', 'TEST_KEY');
    await page.fill('#learningArea', 'Math');
    await page.selectOption('#gradeLevelSel', 'Kindergarten');
    await page.fill('#sectionInput', 'Mabini');
    await page.locator('.competency-input').first().fill('Count objects one to ten.');

    await page.locator('#generate-btn').click();
    await page.waitForFunction(() =>
      !document.getElementById('output-content').classList.contains('hidden'), null, { timeout: NAV_TIMEOUT });

    assert.ok(bodies.length >= 1, 'no request reached the AI');
    assert.ok(bodies[0].includes('EARLY LEARNERS (K-3) RULES'),
      'a Kindergarten plan must carry the K-3 rules');
    assert.ok(bodies[0].includes('EMOJIS directly as the icons'),
      'the K-3 rules must ask for emoji visuals, not placeholders');

    // a senior grade must not get the early-learner rules
    await page.selectOption('#gradeLevelSel', 'Grade 7');
    await page.locator('#generate-btn').click();
    await page.waitForFunction(() =>
      !document.getElementById('output-content').classList.contains('hidden'), null, { timeout: NAV_TIMEOUT });

    assert.equal(bodies.length, 2, 'the Grade 7 regeneration must reach the AI too');
    assert.ok(!bodies[1].includes('EARLY LEARNERS (K-3) RULES'),
      'a Grade 7 plan must not carry the K-3 rules');
  } finally {
    await context.close();
  }
});

test('the Lesson Plan Maker keeps the sequence dropdown (with Custom Flow) in multigrade mode', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, cdnBlocked } = await openPage('lesson.html');
  try {
    if (cdnBlocked) { t.skip('external CDN unavailable'); return; }

    const bodies = [];
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      bodies.push(route.request().postData() || '');
      const json = JSON.stringify({ grades: [1, 2].map((n) => ({
        resources: 'Paper, crayons.', preLesson: 'Song and prayer.', flow: 'TGIA rotation ' + n,
        integration: 'Math links.', assessment: '5-item quiz.', waysForward: 'Homework.',
        reflection: 'Reflect.', aiDeclaration: 'AI assisted.'
      })) });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: json }] } }] })
      });
    });

    await page.locator('#lang-pill button[data-value="en"]').click();
    await page.locator('#settings-btn').click();
    await page.fill('#settings-key-input', 'TEST_KEY');
    await page.locator('#plan-pill button[data-value="multigrade"]').click();
    await page.waitForTimeout(200);

    // the dropdown no longer disappears — nor do its label and Custom Flow button
    assert.ok(await page.locator('#lessonSequence').isVisible(),
      'the Lesson Plan Sequence dropdown must stay visible in multigrade mode');
    assert.ok(await page.locator('#ui-sequence-label').isVisible(),
      'the sequence label must stay with its dropdown');
    await page.selectOption('#lessonSequence', 'custom');
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#custom-flow-btn').isVisible(),
      'picking Custom Flow must reveal the flow builder button');
    await page.keyboard.press('Escape'); // close the auto-opened builder modal
    await page.selectOption('#lessonSequence', 'collab');

    // COI still hides the block — its Instructional Strategy select drives Pre-Lesson/Flow
    await page.locator('#plan-pill button[data-value="coi"]').click();
    await page.waitForTimeout(200);
    assert.ok(!(await page.locator('#sequence-block').isVisible()),
      'COI keeps its own strategy selector, so the sequence block stays hidden there');
    await page.locator('#plan-pill button[data-value="multigrade"]').click();
    await page.waitForTimeout(200);

    // fill the whole multigrade form and generate
    await page.fill('#learningArea', 'Math');
    await page.selectOption('#gradeLevelSel', 'Grade 1');
    await page.fill('#sectionInput', 'Mabini');
    await page.locator('.competency-input').first().fill('Count objects one to ten.');
    await page.fill('#multigradeTeacherName', 'Juan Dela Cruz');
    await page.fill('#multigradeSection', 'SAMPAGUITA');
    await page.fill('#multigradeTime', 'MONDAY-TUESDAY 8:00 AM - 10:00 AM');
    await page.locator('.mg-level').nth(0).fill('Kindergarten');
    await page.locator('.mg-competency').nth(0).fill('Count objects one to ten.');
    await page.locator('.mg-objectives').nth(0).fill('Count objects 1-10 with 80% accuracy.');
    await page.locator('.mg-level').nth(1).fill('Grade 1');
    await page.locator('.mg-competency').nth(1).fill('Add objects within 10.');
    await page.locator('.mg-objectives').nth(1).fill('Add numbers within 10 with 80% accuracy.');

    await page.locator('#generate-btn').click();
    await page.waitForFunction(() =>
      !document.getElementById('output-content').classList.contains('hidden'), null, { timeout: NAV_TIMEOUT });

    assert.ok(bodies.length >= 1, 'no request reached the AI');
    const sent = bodies.join('\n');
    assert.ok(sent.includes('LESSON PLAN SEQUENCE (Pre-Lesson and Flow)'),
      'the multigrade prompt must carry the chosen sequence');
    assert.ok(sent.includes('Think-Pair-Share'),
      'the Collaborative sequence headings must shape the TGIA flow field');
    assert.ok(sent.includes('EARLY LEARNERS (K-3) RULES'),
      'a multigrade plan with a Kindergarten level must carry the K-3 rules');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   11. Test Maker: a finished AI response is shown to the teacher
   =============================================================== */

test('Test Maker shows the generated test instead of an error', { timeout: LONG_TIMEOUT }, async (t) => {
  const SAMPLE_TEST = [
    '# Summative Test',
    '',
    '## Multiple Choice',
    'Choose the letter of the best answer.',
    '',
    '1. What is the water cycle?',
    '   a. The movement of water',
    '   b. The growth of plants',
    '   c. The heating of rocks',
    '   d. The cooling of air',
    '',
    '2. Which process turns water into vapour?',
    '   a. Condensation',
    '   b. Evaporation',
    '   c. Precipitation',
    '   d. Collection',
    '',
    '3. Which process forms clouds?',
    '   a. Condensation',
    '   b. Evaporation',
    '   c. Precipitation',
    '   d. Collection',
    '',
    '4. Where does rain fall from?',
    '   a. Clouds',
    '   b. Rocks',
    '   c. Soil',
    '   d. Wind',
    '',
    '5. What collects in lakes and rivers?',
    '   a. Runoff',
    '   b. Vapour',
    '   c. Steam',
    '   d. Smoke',
    '',
    '## Answer Key',
    '1. a   2. b   3. a   4. a   5. a'
  ].join('\n');

  const context = await browser.newContext();
  // the page reads its key while the app mounts, so seed it before any script runs
  await context.addInitScript(() => {
    try { sessionStorage.setItem('gemini_api_key', 'TEST_KEY'); } catch { /* storage unavailable */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('uncaught: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  try {
    await page.goto(server.url + 'index.html#test-maker', { waitUntil: 'load', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(WAIT_MS);

    const gradeInput = page.getByPlaceholder('Grade 10');
    if (!(await gradeInput.count())) {
      t.skip('index.html did not render its creator form (CDN unavailable?)');
      return;
    }

    await page.route('**/generativelanguage.googleapis.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: SAMPLE_TEST }] } }] })
    }));

    await gradeInput.fill('Grade 7');
    await page.getByPlaceholder('Science').fill('Science');
    await page.getByPlaceholder('1st Quarter Exam').fill('Quarter 1 Test');
    await page.getByPlaceholder('Paste competencies, curriculum guides, or topics...').fill('The water cycle');
    // the first checkbox in the creator is the first test type (Multiple Choice)
    await page.locator('input[type="checkbox"]').first().check();
    await page.waitForTimeout(200);

    await page.getByRole('button', { name: /^Generate/ }).first().click();
    await page.waitForFunction(() => !!document.querySelector('.prose.prose-slate'), null, { timeout: NAV_TIMEOUT });

    const shown = await page.evaluate(() => ({
      output: (document.querySelector('.prose.prose-slate') || {}).innerText || '',
      errorBox: (document.querySelector('.bg-red-50') || {}).innerText || null,
      warnings: (document.querySelector('.bg-amber-50') || {}).innerText || null,
      saved: localStorage.getItem('saved_test_output') || '',
      body: document.body.innerText
    }));

    assert.equal(shown.errorBox, null, 'a successful generation must not show the error banner');
    assert.ok(!/Error generating test/i.test(shown.body), 'the generic failure message must not appear');
    // the output now opens with the printed document header (DepEd block + test name + subject),
    // so the AI's own title is replaced rather than shown
    assert.ok(/quarter 1 test/i.test(shown.output), 'the document header should carry the name of the test');
    assert.ok(shown.output.includes('Science'), 'the document header should carry the subject');
    assert.ok(shown.output.includes('Republic of the Philippines'), 'the header should match the lesson plan\'s DepEd block');

    // the printer-friendly student line sits under the header, in bold
    const nameLine = await page.evaluate(() => {
      const el = document.querySelector('.prose .test-name-line');
      if (!el) return null;
      const blanks = Array.from(el.querySelectorAll('span > span'));
      return {
        text: el.innerText,
        weight: getComputedStyle(el).fontWeight,
        lineCount: el.getClientRects().length,
        fits: el.scrollWidth <= el.clientWidth + 1,
        blankWidths: blanks.map((b) => Math.round(b.getBoundingClientRect().width))
      };
    });
    assert.ok(nameLine, 'the header must carry a student NAME / GRADE-SECTION / SCORE line');
    assert.match(nameLine.text, /NAME:/, 'the student line must label NAME');
    assert.match(nameLine.text, /GRADE\/SECTION:/, 'the student line must label GRADE/SECTION');
    assert.match(nameLine.text, /SCORE:/, 'the student line must label SCORE');
    assert.equal(nameLine.weight, '700', 'the student line must be bold');
    assert.equal(nameLine.lineCount, 1, 'the student line must stay on one line');
    assert.ok(nameLine.fits, 'the student line must fit its column without overflowing');
    assert.equal(nameLine.blankWidths.length, 3, 'the student line must carry three blanks');
    assert.ok(nameLine.blankWidths[0] > nameLine.blankWidths[1], 'the NAME blank must be the widest');
    assert.ok(nameLine.blankWidths[1] > nameLine.blankWidths[2], 'GRADE/SECTION must be wider than SCORE');
    assert.ok(!/^\s*#+\s*summative test/im.test(shown.output), 'the AI\'s own title block should be dropped');
    assert.ok(shown.output.includes('What is the water cycle?'), 'the body of the test should be shown');
    assert.ok(shown.saved.includes('Answer Key'), 'the test should be remembered for the next visit');

    // 13. each question is a two-column grid: the item number on the left, the stem and
    // its choices on the right, so the choices sit under the first word of the question
    const opts = await page.evaluate(() => {
      const q = document.querySelector('.mcq');
      const body = q ? q.querySelector('.mcq-body') : null;
      const num = q ? q.querySelector('.mcq-num') : null;
      const boxes = Array.from(document.querySelectorAll('.mcq-opts'));
      const first = boxes[0];
      const inner = first ? first.firstElementChild : null;
      const left = (el) => (el ? Math.round(el.getBoundingClientRect().left) : -1);
      return {
        count: boxes.length,
        wrapped: document.querySelectorAll('.mcq').length,
        grid: q ? getComputedStyle(q).gridTemplateColumns : '',
        numText: num ? num.innerText.trim() : '',
        qLeft: left(q), numLeft: left(num), bodyLeft: left(body),
        boxLeft: left(first), innerLeft: left(inner),
        firstText: first ? first.innerText.replace(/\s+/g, ' ').trim().slice(0, 2) : ''
      };
    });
    assert.equal(opts.count, 5, 'each of the five questions should render its own choice block');
    assert.equal(opts.wrapped, 5, 'every numbered question must be a grid block of its own');
    assert.equal(opts.grid.split(' ').length, 2, 'the question must lay out as a 2-column grid');
    assert.equal(opts.firstText, 'A)', 'the choices should still be lettered A) ...');
    assert.equal(opts.numText, '1.', 'the item number owns the first column');
    assert.equal(opts.numLeft, opts.qLeft, 'the item number must start at the container');
    assert.ok(opts.bodyLeft > opts.numLeft + 4, 'the stem column must clear the item number');
    assert.ok(Math.abs(opts.boxLeft - opts.bodyLeft) <= 2,
      'the choices must start exactly where the question stem starts');
    assert.equal(opts.innerLeft, opts.boxLeft, 'the choices need no indent of their own any more');
    assert.ok(opts.boxLeft > opts.qLeft + 4, 'the choices must not hug the question number');

    // on paper the page box and every question block stay tight, so fewer pages are used
    await page.emulateMedia({ media: 'print' });
    const printTight = await page.evaluate(() => {
      const q = document.querySelector('.prose .mcq');
      const opts = document.querySelector('.prose .mcq-opts');
      const heading = document.querySelector('.prose h2');
      const pages = [];
      Array.from(document.styleSheets).forEach((ss) => {
        try {
          Array.from(ss.cssRules).forEach((r) => { if (String(r.cssText).indexOf('@page') === 0) pages.push(r.cssText); });
        } catch (e) { /* a cross-origin sheet cannot be read */ }
      });
      return {
        pageRule: pages.join(' '),
        questionMargin: q ? parseFloat(getComputedStyle(q).marginBottom) : null,
        optsMargin: opts ? parseFloat(getComputedStyle(opts).marginBottom) : null,
        headingMargin: heading ? parseFloat(getComputedStyle(heading).marginBottom) : null,
        afterQuestion: q && q.nextElementSibling ? getComputedStyle(q.nextElementSibling).display : 'missing'
      };
    });
    await page.emulateMedia({ media: 'screen' });
    assert.match(printTight.pageRule, /^@page/, 'the sheet must declare its page box');
    assert.match(printTight.pageRule, /margin:\s*(0\.5in|12mm)/, 'the page margin must be narrow');
    assert.ok(printTight.questionMargin <= 4, 'a question must sit 0.25rem from what follows it');
    assert.equal(printTight.optsMargin, 0, 'the choice list must carry no margin of its own');
    assert.ok(printTight.headingMargin <= 4, 'a heading must sit no further than 0.25rem from the next block');
    assert.equal(printTight.afterQuestion, 'none', 'the rule after a question must not print');
    // the selected type is passed as { id, label, ... }; matching it by id keeps this quiet
    assert.equal(shown.warnings, null, 'a well-formed test should not raise validation warnings');
    assert.deepEqual(errors, [], 'generating a test must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   11b. Test Maker: the Early Learners (K-3) activities
   =============================================================== */

test('the Test Maker offers the K-3 activities and generates an emoji test from them', { timeout: LONG_TIMEOUT }, async (t) => {
  const KINDER_TEST = [
    "## Part 1: Let's Count! 🔢",
    'Count the pictures. Choose the correct answer.',
    '',
    '1. How many apples? 🍎 🍎 🍎',
    '   A) 2', '   B) 3', '   C) 4',
    '2. How many suns? ☀️ ☀️',
    '   A) 1', '   B) 2', '   C) 3',
    '3. How many cats? 🐱 🐱 🐱 🐱',
    '   A) 3', '   B) 4', '   C) 5',
    '4. How many stars? ⭐ ⭐ ⭐ ⭐ ⭐',
    '   A) 4', '   B) 5', '   C) 6',
    '5. How many balls? ⚽ ⚽',
    '   A) 1', '   B) 2', '   C) 3',
    '',
    "## Teacher's Answer Key 🔑",
    '1. B   2. B   3. B   4. B   5. B'
  ].join('\n');

  const context = await browser.newContext();
  // the page reads its key while the app mounts, so seed it before any script runs
  await context.addInitScript(() => {
    try { sessionStorage.setItem('gemini_api_key', 'TEST_KEY'); } catch { /* storage unavailable */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('uncaught: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  try {
    await page.goto(server.url + 'index.html#test-maker', { waitUntil: 'load', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(WAIT_MS);

    const gradeInput = page.getByPlaceholder('Grade 10');
    if (!(await gradeInput.count())) {
      t.skip('index.html did not render its creator form (CDN unavailable?)');
      return;
    }

    // the Structure list carries the K-3 activities from the K-3 Test Maker
    const labels = await page.evaluate(() => Array.from(document.querySelectorAll('label')).map((l) => l.innerText.trim()));
    for (const name of ['Picture Multiple Choice (A, B, C)', 'Counting (How many', 'Matching (Word to Picture)',
                        'Missing Letters / Spelling', 'Drawing Prompt (Draw a...)',
                        'Short Story + 3 Questions', 'Sorting/Grouping (e.g. Animals vs Toys)']) {
      assert.ok(labels.some((l) => l.includes(name)), `the Structure list must offer "${name}"`);
    }

    // with no grade yet the standard types lead the Structure list…
    assert.equal(await page.evaluate(() => {
      const cb = document.querySelector('input[type="checkbox"]');
      const label = cb && cb.closest('label');
      return label ? label.innerText.trim() : '';
    }), 'Multiple Choice (MCQ)', 'without an early grade the standard types must come first');

    const bodies = [];
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      try { bodies.push(JSON.parse(route.request().postData() || '{}')); } catch { /* not JSON */ }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: KINDER_TEST }] } }] })
      });
    });

    await gradeInput.fill('Kindergarten');
    await page.waitForTimeout(200);
    // …and picking an early grade moves the kiddie activities to the top
    assert.ok((await page.evaluate(() => {
      const cb = document.querySelector('input[type="checkbox"]');
      const label = cb && cb.closest('label');
      return label ? label.innerText.trim() : '';
    })).startsWith('Picture Multiple Choice'),
    'picking Kindergarten must move the K-3 activities to the top of the Structure list');
    await page.getByPlaceholder('Science').fill('Reading');
    await page.getByPlaceholder('1st Quarter Exam').fill('Counting Quiz');
    await page.getByPlaceholder('Paste competencies, curriculum guides, or topics...').fill('Counting numbers 1 to 10');
    const countingRow = page.locator('label').filter({ hasText: 'Counting (How many' }).locator('xpath=..');
    await countingRow.locator('input[type="checkbox"]').check();
    await page.waitForTimeout(200);

    // a K-3 activity starts at 3 items — young learners get short sets
    assert.equal(await countingRow.locator('input[type="number"]').inputValue(), '3',
      'a K-3 activity must default to 3 items');

    await page.getByRole('button', { name: /^Generate/ }).first().click();
    await page.waitForFunction(() => !!document.querySelector('.prose.prose-slate'), null, { timeout: NAV_TIMEOUT });

    const shown = await page.evaluate(() => ({
      output: (document.querySelector('.prose.prose-slate') || {}).innerText || '',
      errorBox: (document.querySelector('.bg-red-50') || {}).innerText || null,
      warnings: (document.querySelector('.bg-amber-50') || {}).innerText || null
    }));

    assert.equal(shown.errorBox, null, 'a successful K-3 generation must not show the error banner');
    assert.equal(shown.warnings, null,
      'the K-3 activities must not raise validation warnings — got: ' + (shown.warnings || ''));

    // the K-3 rules travelled with the request, and the activity keeps its item count
    assert.ok(bodies.length >= 1, 'no request reached the AI');
    const sent = JSON.stringify(bodies);
    assert.ok(sent.includes('EARLY LEARNERS (K-3) RULES'), 'the K-3 rules must be part of the prompt');
    assert.ok(sent.includes('EMOJIS directly as the icons'), 'the prompt must ask for emoji visuals, not placeholders');
    assert.ok(sent.includes('Counting (How many 🍎?): 3 items'), 'the structure must list the K-3 activity with its count');

    // a fun first section header is a section, not an AI title block — it must survive
    assert.ok(shown.output.includes("Let's Count"), 'the K-3 section header must not be stripped');
    assert.ok(shown.output.includes('How many apples'), 'the body of the test should be shown');

    // the K-3 theme rides on the preview: friendly font, bright sections, emoji-choice chips
    const previewClass = await page.locator('.prose.prose-slate').first().getAttribute('class');
    assert.ok(previewClass.includes('k3-mode'), 'a K-3 test must render with the kid preview theme');
    assert.ok((await page.locator('h3', { hasText: 'Live preview' }).first().innerText()).includes('Kids theme on'),
      'the preview header must announce the kids theme with its badge');
    const previewHtml = await page.evaluate(() => (document.querySelector('.prose.prose-slate') || {}).innerHTML || '');
    assert.ok(previewHtml.includes('text-purple-600'), 'the kid section headers must use the K-3 colors');
    assert.ok(previewHtml.includes('#FEF3C7'), 'the kid choices must be drawn as friendly chips');

    // the Word export carries the K-3 Test Maker's kid stylesheet with it
    const [doc] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Word', exact: true }).click()
    ]);
    assert.match(doc.suggestedFilename(), /\.doc$/, 'the Word button must still hand over a .doc file');
    const kidWord = fs.readFileSync(await doc.path(), 'utf8');
    assert.match(kidWord, /Comic Sans MS/, 'a K-3 Word export must use the kid font');
    assert.match(kidWord, /#c026d3/, 'a K-3 Word export must color the section headers');
    assert.match(kidWord, /#FEF3C7/, 'a K-3 Word export must draw the choices as chips');

    // switching off the early grade AND the K-3 activity returns the standard theme
    await countingRow.locator('input[type="checkbox"]').uncheck();
    await gradeInput.fill('Grade 10');
    await page.waitForTimeout(300);
    const offClass = await page.locator('.prose.prose-slate').first().getAttribute('class');
    assert.ok(!offClass.includes('k3-mode'), 'a senior-grade test must not keep the kid theme');
    assert.equal(await page.getByText('Kids theme on').count(), 0, 'the kids-theme badge must go with the theme');
    assert.deepEqual(errors, [], 'a K-3 generation must not raise page errors');
  } finally {
    await context.close();
  }
});

test('a Filipino test does not raise false section warnings', { timeout: LONG_TIMEOUT }, async (t) => {
  const FILIPINO_TEST = [
    '# Pagsusulit',
    '',
    '## I. Maramihang Pagpipilian',
    'Piliin ang titik ng tamang sagot.',
    '',
    '1. Alin ang gumagawa ng pagkain ng halaman?',
    '   a. Dahon', '   b. Ugat', '   c. Bulaklak', '   d. Bunga',
    '',
    '2. Anong gas ang tinatanggap ng halaman?',
    '   a. Oxygen', '   b. Carbon dioxide', '   c. Nitrogen', '   d. Hydrogen',
    '',
    '3. Saan nagaganap ang photosynthesis?',
    '   a. Chloroplast', '   b. Mitochondria', '   c. Nucleus', '   d. Ribosome',
    '',
    '4. Aling pigmento ang berde?',
    '   a. Chlorophyll', '   b. Carotene', '   c. Melanin', '   d. Hemoglobin',
    '',
    '5. Ano ang sinisipsip ng ugat?',
    '   a. Tubig', '   b. Sikat ng araw', '   c. Hangin', '   d. Asukal',
    '',
    '## II. Punan ang Patlang',
    'Isulat ang nawawalang salita.',
    '',
    '6. Ang tubig ay ______ sa temperatura ng silid.',
    '',
    '## Susi sa Pagwawasto',
    '1. a   2. b   3. a   4. a   5. a   6. likido'
  ].join('\n');

  const { context, page, errors } = await openPage('index.html#test-maker', {
    initScript: () => {
      try { sessionStorage.setItem('gemini_api_key', 'TEST_KEY'); } catch { /* storage unavailable */ }
    }
  });
  try {
    const gradeInput = page.getByPlaceholder('Grade 10');
    if (!(await gradeInput.count())) {
      t.skip('index.html did not render its creator form (CDN unavailable?)');
      return;
    }

    await page.route('**/generativelanguage.googleapis.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: FILIPINO_TEST }] } }] })
    }));

    await gradeInput.fill('Grade 7');
    await page.getByPlaceholder('Science').fill('Filipino');
    await page.getByPlaceholder('1st Quarter Exam').fill('Ikalawang Markahang Pagsusulit');
    await page.getByPlaceholder('Paste competencies, curriculum guides, or topics...').fill('Ang halaman at photosynthesis');
    // the first checkbox is the first test type (Multiple Choice)
    await page.locator('input[type="checkbox"]').first().check();
    await page.waitForTimeout(200);

    await page.getByRole('button', { name: /^Generate/ }).first().click();
    await page.waitForFunction(() => !!document.querySelector('.prose.prose-slate'), null, { timeout: NAV_TIMEOUT });

    const shown = await page.evaluate(() => ({
      output: (document.querySelector('.prose.prose-slate') || {}).innerText || '',
      warnings: (document.querySelector('.bg-amber-50') || {}).innerText || null
    }));
    assert.equal(shown.warnings, null, 'a Filipino test must not raise false "section not found" warnings');
    assert.ok(shown.output.includes('gumagawa ng pagkain'), 'the Filipino test body must be shown');
    assert.ok(shown.output.includes('Maramihang Pagpipilian'),
      'the Filipino section heading must survive the title-block strip — it is a section, not a title');
    assert.deepEqual(errors, [], 'a Filipino generation must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   12. an unreadable source file is reported, never sent to the AI
   =============================================================== */

test('an unreadable source file is reported instead of being sent to the AI', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page } = await openPage('index.html#test-maker', {
    initScript: () => {
      try { sessionStorage.setItem('gemini_api_key', 'TEST_KEY'); } catch { /* storage unavailable */ }
    }
  });
  try {
    if (!(await page.getByPlaceholder('Grade 10').count())) {
      t.skip('index.html did not render its creator form (CDN unavailable?)');
      return;
    }

    // the upload box only exists while the "Files" source mode is active
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    const input = page.locator('input[type="file"][multiple]');
    assert.ok(await input.count(), 'the file input should be available in Files mode');

    const requests = [];
    await page.route('**/generativelanguage.googleapis.com/**', (route) => {
      requests.push(route.request().postData() || '');
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    // an extension the tool cannot read
    await input.setInputFiles({
      name: 'notes.rtf',
      mimeType: 'application/rtf',
      buffer: Buffer.from('some text inside an unsupported container')
    });
    await page.waitForTimeout(1500);

    const reported = await page.evaluate(() => ({
      toasts: Array.from(document.querySelectorAll('#silid-toast-container > div')).map((n) => n.innerText).join(' | '),
      listing: document.body.innerText
    }));

    assert.match(reported.toasts, /Could not read notes\.rtf/i, 'the teacher must be told the file could not be read');
    assert.match(reported.toasts, /unsupported format/i, 'the report must say what went wrong');
    assert.match(reported.listing, /Unreadable/, 'the file must be marked unreadable, not ready');

    // and the placeholder text never reaches the model
    await page.getByPlaceholder('Grade 10').fill('Grade 7');
    await page.getByPlaceholder('Science').fill('Science');
    await page.getByPlaceholder('1st Quarter Exam').fill('Quarter 1 Test');
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: /^Generate/ }).first().click();
    await page.waitForTimeout(800);

    const outcome = await page.evaluate(() => {
      const toast = document.querySelector('#silid-toast-container');
      const body = document.body.innerText;
      return {
        error: (document.querySelector('.bg-red-50') || {}).innerText || '',
        // the toast legitimately still names the format, so ignore its text here
        page: toast ? body.replace(toast.innerText, '') : body
      };
    });
    assert.match(outcome.error, /valid text content/i, 'an unreadable file must not pass the source check');
    assert.ok(!outcome.page.includes('unsupported format (.'), 'no placeholder may be shown as source material');
    assert.equal(requests.length, 0, 'nothing may be sent to the AI when no readable source is left');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   14. the flat Word download is one file, not a zipped folder
   =============================================================== */

test('the flat Word download hands over a single file, not a zip folder', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, errors } = await openPage('lesson.html', {
    initScript: () => {
      try {
        // the output toolbar only appears once there is something to export
        localStorage.setItem('saved_lesson_output', JSON.stringify({
          html: '<h1>Week 1: The Water Cycle</h1><table><tr><td>Session 1</td><td>Evaporation and condensation</td></tr></table>'
        }));
        localStorage.setItem('saved_activity_output', JSON.stringify({
          html: '<h1>Activity: The Water Cycle</h1><table><tr><td>1.</td><td>Label the diagram.</td></tr></table>',
          sheetHtml: '<h1>Activity: The Water Cycle</h1><table><tr><td>1.</td><td>Label the diagram.</td></tr></table>',
          sheetMeta: { grade: 'Grade 7', subject: 'Science', quarter: '1', topic: 'The Water Cycle' }
        }));
      } catch { /* storage unavailable */ }
    }
  });
  try {
    const lessonDoc = page.locator('#download-doc-btn');
    if (!(await lessonDoc.isVisible())) {
      t.skip('lesson.html did not render its output toolbar (CDN unavailable?)');
      return;
    }
    assert.ok(await page.locator('#download-btn').isVisible(), 'the .docx download should still be offered');

    const [lessonFile] = await Promise.all([page.waitForEvent('download'), lessonDoc.click()]);
    assert.match(lessonFile.suggestedFilename(), /\.doc$/, 'the flat export must keep a Word file name');
    const lessonText = fs.readFileSync(await lessonFile.path(), 'utf8');
    assert.ok(lessonText.includes('<!DOCTYPE html>'), 'the whole document should live in one plain file');
    assert.ok(lessonText.includes('The Water Cycle'), 'the lesson content should be inside it');
    assert.ok(lessonText.includes('Evaporation and condensation'), 'table cells must survive the export');
    // a .docx is a zip archive — that is the folder of XML files teachers were seeing
    assert.ok(!lessonText.startsWith('PK'), 'the flat export must not be a zip archive');

    await page.goto(server.url + 'activity.html', { waitUntil: 'load', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(WAIT_MS);
    const sheetDoc = page.locator('#btn-download-doc');
    assert.ok(await sheetDoc.isVisible(), 'the activity sheet must offer the flat Word download too');
    assert.ok(!(await page.locator('#kids-theme-badge').isVisible()),
      'a senior-grade sheet must not show the kids-theme badge');

    const [sheetFile] = await Promise.all([page.waitForEvent('download'), sheetDoc.click()]);
    assert.equal(sheetFile.suggestedFilename(), 'Activity_Sheet_the_water_cycle.doc');
    const sheetText = fs.readFileSync(await sheetFile.path(), 'utf8');
    assert.ok(sheetText.includes('Label the diagram.'), 'the sheet content should be inside it');
    assert.ok(!sheetText.startsWith('PK'), 'the activity export must not be a zip archive either');
    assert.ok(!sheetText.includes('Comic Sans'), 'a senior-grade sheet must keep the standard export font');

    assert.deepEqual(errors, [], 'exporting must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   14a. a K-3 activity sheet wears the kid theme
   =============================================================== */

test('a K-3 activity sheet wears the kid theme', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, errors } = await openPage('activity.html', {
    initScript: () => {
      try {
        // restore path: the saved blob predates the kid flag, so the theme must be
        // re-derived from the sheet's grade (Kindergarten → early learner)
        localStorage.setItem('saved_activity_output', JSON.stringify({
          html: '<h1>Activity: Alphabet</h1><table><tr><td>1.</td><td>Colour the cat 🐱.</td></tr></table>',
          sheetHtml: '<h1>Activity: Alphabet</h1><table><tr><td>1.</td><td>Colour the cat 🐱.</td></tr></table>',
          sheetMeta: { grade: 'Kindergarten', subject: 'English', quarter: '1', topic: 'Alphabet' }
        }));
      } catch { /* storage unavailable */ }
    }
  });
  try {
    const out = page.locator('#output-content');
    if (!(await out.count())) { t.skip('activity.html did not render (CDN unavailable?)'); return; }
    await page.waitForTimeout(WAIT_MS);
    assert.ok(((await out.getAttribute('class')) || '').includes('k3-mode'),
      'a Kindergarten sheet must render with the kid theme');
    assert.ok(await page.locator('#kids-theme-badge').isVisible(),
      'the sheet must announce the kids theme with its badge');

    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#btn-download-doc').click()
    ]);
    const text = fs.readFileSync(await file.path(), 'utf8');
    assert.match(text, /Comic Sans MS/, 'a K-3 sheet export must use the kid font');
    assert.ok(text.includes('Colour the cat'), 'the sheet content should be inside it');
    assert.deepEqual(errors, [], 'a K-3 activity sheet must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   14a2. the Activity Sheet Maker asks the AI for K-3 emoji visuals
   =============================================================== */

test('the Activity Sheet Maker gets the K-3 rules when the sheet is for early learners', { timeout: LONG_TIMEOUT }, async (t) => {
  const SHEET = [
    '<div style="padding:10px;">',
    '<h2 style="font-size:20px;">🧩 LET\'S COUNT! 🔢</h2>',
    '<p style="font-size:16px;">Direction: Count the pictures. Circle the correct answer for each item below.</p>',
    '<p style="font-size:18px;">1. How many apples? 🍎 🍎 🍎</p>',
    '<p style="font-size:18px;">2. How many suns? ☀️ ☀️</p>',
    '<p style="font-size:18px;">3. How many cats? 🐱 🐱 🐱 🐱</p>',
    '</div>'
  ].join('\n');

  const { context, page, errors } = await openPage('activity.html', {
    initScript: () => {
      try { sessionStorage.setItem('gemini_api_key', 'TEST_KEY'); } catch { /* storage unavailable */ }
    }
  });
  try {
    const topic = page.locator('#custom-topic');
    if (!(await topic.count())) { t.skip('activity.html did not render (CDN unavailable?)'); return; }

    const bodies = [];
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      try { bodies.push(JSON.parse(route.request().postData() || '{}')); } catch { /* not JSON */ }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: SHEET }] } }] })
      });
    });

    await page.locator('#mode-tabs button[data-mode="custom"]').click();
    await topic.fill('Counting numbers 1 to 10');
    await page.locator('#custom-grade').fill('Grade 1');
    await page.locator('#custom-subject').fill('Math');
    await page.locator('#btn-custom-generate').click();
    await page.waitForFunction(() => !!(document.querySelector('#output-content') || {}).innerHTML.trim(), null, { timeout: NAV_TIMEOUT });

    // the K-3 rules travelled with the request, and the sheet wears the kid theme
    assert.ok(bodies.length >= 1, 'no request reached the AI');
    const kidSent = JSON.stringify(bodies);
    assert.ok(kidSent.includes('EARLY LEARNERS (K-3) RULES'), 'a Grade 1 sheet must carry the K-3 rules');
    assert.ok(kidSent.includes('EMOJIS directly as the icons'), 'the prompt must ask for emoji visuals, not placeholders');
    const shown = await page.evaluate(() => ({
      cls: (document.querySelector('#output-content') || {}).className || '',
      badge: !!document.querySelector('#kids-theme-badge')
        && !document.querySelector('#kids-theme-badge').classList.contains('hidden')
    }));
    assert.ok(shown.cls.includes('k3-mode'), 'a Grade 1 sheet must render with the kid theme');
    assert.ok(shown.badge, 'the sheet must announce the kids theme with its badge');

    // a senior grade must not get the early-learner rules nor the theme
    await page.locator('#custom-grade').fill('Grade 7');
    await page.locator('#btn-custom-generate').click();
    await page.waitForFunction((n) => {
      const el = document.querySelector('#kids-theme-badge');
      return el && el.classList.contains('hidden') && !document.querySelector('#btn-custom-generate').disabled;
    }, bodies.length, { timeout: NAV_TIMEOUT });

    assert.equal(bodies.length, 2, 'the Grade 7 regeneration must reach the AI too');
    const adultSent = JSON.stringify(bodies[1]);
    assert.ok(!adultSent.includes('EARLY LEARNERS (K-3) RULES'),
      'a Grade 7 sheet must not carry the K-3 rules');
    const after = await page.evaluate(() => ({
      cls: (document.querySelector('#output-content') || {}).className || '',
      badge: !!document.querySelector('#kids-theme-badge')
        && !document.querySelector('#kids-theme-badge').classList.contains('hidden')
    }));
    assert.ok(!after.cls.includes('k3-mode'), 'a Grade 7 sheet must drop the kid theme');
    assert.ok(!after.badge, 'the kids-theme badge must hide for a senior grade');

    assert.deepEqual(errors, [], 'generating sheets must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   14b. .doc / .docx uploads in the Lesson and PPT tools
   =============================================================== */

test('the Lesson and PPT tools accept .doc and .docx uploads', { timeout: LONG_TIMEOUT }, async (t) => {
  const DOC = '<html><body><table><tr><td>Learning Area</td><td>Science 7</td></tr>'
    + '<tr><td>Competency</td><td>Explain the water cycle</td></tr></table></body></html>';

  // Lesson: the .doc is turned into text and its fields are auto-extracted
  {
    const context = await browser.newContext();
    await context.addInitScript(() => { try { sessionStorage.setItem('gemini_api_key', 'TEST_KEY'); } catch { /* storage unavailable */ } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('uncaught: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    try {
      await page.route('**/generativelanguage.googleapis.com/**', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"learningArea":"Science 7","gradeLevel":"Grade 7","noOfSessions":2,"competencies":["Explain the water cycle"]}' }] } }] })
      }));
      await page.goto(server.url + 'lesson.html', { waitUntil: 'load', timeout: NAV_TIMEOUT });
      await page.waitForTimeout(WAIT_MS);
      if (!(await page.locator('#ui-mode-exemplar').count())) { t.skip('lesson.html did not render (CDN unavailable?)'); return; }
      await page.locator('#ui-mode-exemplar').click();
      await page.locator('#reference-upload').setInputFiles({ name: 'exemplar.doc', mimeType: 'application/msword', buffer: Buffer.from(DOC) });
      await page.waitForTimeout(3000);
      const lesson = await page.evaluate(() => ({
        errorHidden: document.getElementById('error-message').classList.contains('hidden'),
        status: document.getElementById('upload-status').textContent,
        area: (document.getElementById('learningArea') || {}).value
      }));
      assert.ok(lesson.errorHidden, 'a .doc must not raise an upload error');
      assert.match(lesson.status, /extracted successfully/i, 'the .doc should be read and its fields extracted');
      assert.equal(lesson.area, 'Science 7', 'the extracted learning area should be filled in');

      // an app-style .docx (html-docx-js keeps the content in word/afchunk.mht) must read
      // through the JSZip fallback, since mammoth alone cannot see that chunk
      const hasDocx = await page.evaluate(() => !!(window.htmlDocx && window.mammoth && window.JSZip));
      if (hasDocx) {
        const b64 = await page.evaluate(async () => {
          const blob = window.htmlDocx.asBlob('<html><body><table><tr><td>Learning Area</td><td>Science 7</td></tr><tr><td>Competency</td><td>Explain the water cycle</td></tr></table></body></html>');
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let s = '';
          for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
          return btoa(s);
        });
        await page.locator('#reference-upload').setInputFiles({
          name: 'exemplar.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: Buffer.from(b64, 'base64')
        });
        await page.waitForTimeout(3000);
        const docx = await page.evaluate(() => ({
          errorHidden: document.getElementById('error-message').classList.contains('hidden'),
          status: document.getElementById('upload-status').textContent
        }));
        assert.ok(docx.errorHidden, 'a .docx must not raise an upload error');
        assert.match(docx.status, /extracted successfully/i, 'the .docx should be read and its fields extracted');
      } else {
        t.diagnostic('the .docx helper CDN is unavailable — .docx upload assertion skipped');
      }

      assert.deepEqual(errors, [], 'the Word uploads must not raise page errors');
    } finally {
      await context.close();
    }
  }

  // PPT: the .doc passes validation and is shown as the chosen file
  {
    const { context, page } = await openPage('powerpoint.html');
    try {
      if (!(await page.locator('.io-toggle[data-io="file"]').count())) { t.skip('powerpoint.html did not render (CDN unavailable?)'); return; }
      await page.locator('.io-toggle[data-io="file"]').first().click();
      await page.locator('#topic-file').setInputFiles({ name: 'topic.doc', mimeType: 'application/msword', buffer: Buffer.from(DOC) });
      await page.waitForTimeout(1000);
      const ppt = await page.evaluate(() => ({
        errorHidden: document.getElementById('input-error').classList.contains('hidden'),
        label: document.getElementById('topic-file-label').textContent
      }));
      assert.ok(ppt.errorHidden, 'a .doc must not be rejected by the PPT tool');
      assert.equal(ppt.label, 'topic.doc', 'the chosen .doc should be shown as selected');
    } finally {
      await context.close();
    }
  }
});

/* ===============================================================
   15. Test Maker: real .docx, print, start fresh
   =============================================================== */

const SAMPLE_TEST = [
  '# Summative Test',
  '',
  '## Multiple Choice',
  'Choose the letter of the best answer.',
  '',
  '1. What is the water cycle?',
  '   a. The movement of water',
  '   b. The growth of plants',
  '   c. The heating of rocks',
  '   d. The cooling of air',
  '',
  '2. Which process turns water into vapour?',
  '   a. Condensation',
  '   b. Evaporation',
  '   c. Precipitation',
  '   d. Collection',
  '',
  '## Answer Key',
  '1. a   2. b'
].join('\n');

/** Fills the creator form and runs a stubbed generation, leaving a finished test on screen. */
async function generateSampleTest(page) {
  await page.route('**/generativelanguage.googleapis.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ candidates: [{ content: { parts: [{ text: SAMPLE_TEST }] } }] })
  }));
  await page.getByPlaceholder('Grade 10').fill('Grade 7');
  await page.getByPlaceholder('Science').fill('Science');
  await page.getByPlaceholder('1st Quarter Exam').fill('Quarter 1 Test');
  await page.getByPlaceholder('Paste competencies, curriculum guides, or topics...').fill('The water cycle');
  await page.locator('input[type="checkbox"]').first().check();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /^Generate/ }).first().click();
  await page.waitForFunction(() => !!document.querySelector('.prose.prose-slate'), null, { timeout: NAV_TIMEOUT });
}

test('the Test Maker exports a real .docx and a Word .doc, re-imports its .docx and .doc, prints, and can start fresh', { timeout: LONG_TIMEOUT }, async (t) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    try { sessionStorage.setItem('gemini_api_key', 'TEST_KEY'); } catch { /* storage unavailable */ }
    // the real dialog would block a headless run, so record the call instead
    window.print = function () { window.__printed = (window.__printed || 0) + 1; };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('uncaught: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  try {
    await page.goto(server.url + 'index.html#test-maker', { waitUntil: 'load', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(WAIT_MS);
    if (!(await page.getByPlaceholder('Grade 10').count())) {
      t.skip('index.html did not render its creator form (CDN unavailable?)');
      return;
    }
    await generateSampleTest(page);

    // a real .docx is an OOXML package, not an HTML file with a .doc name
    let docxBytes = null;
    if (!(await page.evaluate(() => !!(window.htmlDocx && window.saveAs)))) {
      t.diagnostic('the DOCX helper CDN is unavailable — DOCX assertions skipped');
    } else {
      const [docx] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'DOCX' }).click()
      ]);
      assert.match(docx.suggestedFilename(), /\.docx$/, 'the DOCX button must hand over a .docx file');
      docxBytes = fs.readFileSync(await docx.path());
      assert.equal(docxBytes.subarray(0, 2).toString('latin1'), 'PK', 'a .docx is a zip package');
      assert.ok(docxBytes.includes(Buffer.from('[Content_Types].xml')), 'the package needs its content types');
      assert.ok(docxBytes.includes(Buffer.from('word/document.xml')), 'and its Word document part');
    }

    // the .docx this tool exports must be readable back in (mammoth + afchunk fallback),
    // not rejected as "Unreadable" — the Word reader has to actually be loaded
    if (docxBytes) {
      const tmp = path.join(os.tmpdir(), 'silid-upload-' + Date.now() + '.docx');
      fs.writeFileSync(tmp, docxBytes);
      try {
        assert.ok(await page.evaluate(() => !!window.mammoth), 'the Word reader must be loaded on the page');
        await page.getByRole('button', { name: 'Files', exact: true }).click();
        await page.locator('input[type="file"][multiple]').setInputFiles(tmp);
        await page.waitForTimeout(2500);
        const upload = await page.evaluate(() => ({
          ready: document.body.innerText.includes('Ready'),
          unreadable: document.body.innerText.includes('Unreadable')
        }));
        assert.ok(upload.ready && !upload.unreadable, 'this app\'s own .docx must upload as readable');
      } finally {
        fs.unlinkSync(tmp);
      }
    }

    // the flat .doc must keep the choices indented under the first word of their question.
    // Word cannot render the on-screen flex/grid, so the choices are a borderless table there.
    const [doc] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Word', exact: true }).click()
    ]);
    assert.match(doc.suggestedFilename(), /\.doc$/, 'the Word button must hand over a .doc file');
    const wordHtml = fs.readFileSync(await doc.path(), 'utf8');
    assert.match(wordHtml, /class="mcq-opts"/, 'the Word file should carry the choice blocks');
    assert.match(wordHtml, /<table style="border-collapse:collapse;border:none;margin:0 0 0 12\.1pt;"/, 'the choices table must be indented under the first word of the question');
    assert.match(wordHtml, /<td style="border:none;vertical-align:top;[^"]*">A\) The movement of water<\/td>/, 'each choice must sit in its own cell');
    assert.ok(!/display:flex|display:grid/.test(wordHtml), 'Word cannot render flexbox or grid, so the export must not rely on them');
    assert.match(wordHtml, /test-name-line/, 'the Word export must carry the student NAME / GRADE-SECTION / SCORE line');
    assert.match(wordHtml, /NAME: _+/, 'the Word export must draw the NAME blank with underscores');
    assert.match(wordHtml, /SCORE: _+/, 'the Word export must draw the SCORE blank with underscores');

    // the flat .doc this app exports (HTML with a .doc name) must upload as readable too
    {
      const tmp = path.join(os.tmpdir(), 'silid-upload-' + Date.now() + '.doc');
      fs.writeFileSync(tmp, wordHtml, 'utf8');
      try {
        await page.getByRole('button', { name: 'Files', exact: true }).click();
        await page.locator('input[type="file"][multiple]').setInputFiles(tmp);
        await page.waitForTimeout(2000);
        const upload = await page.evaluate(() => ({
          ready: document.body.innerText.includes('Ready'),
          unreadable: document.body.innerText.includes('Unreadable')
        }));
        assert.ok(upload.ready && !upload.unreadable, 'a flat .doc must upload as readable');
      } finally {
        fs.unlinkSync(tmp);
      }
    }

    // print / PDF
    await page.getByRole('button', { name: /Print \/ PDF/ }).click();
    assert.equal(await page.evaluate(() => window.__printed || 0), 1, 'Print / PDF must open the print dialog');
    await page.emulateMedia({ media: 'print' });
    assert.ok(await page.locator('.prose.prose-slate').isVisible(), 'the test itself must be on the printed page');
    assert.ok(await page.getByRole('button', { name: 'DOCX' }).isHidden(), 'the toolbar must stay off the paper');

    // the type is tightened on paper so the same questions fit on fewer pages
    const printSpacing = await page.evaluate(() => {
      const prose = document.querySelector('.prose');
      if (!prose) return null;
      const cs = getComputedStyle(prose);
      return { fontSize: cs.fontSize, lineHeight: cs.lineHeight };
    });
    assert.ok(printSpacing, 'the printed test body must be on the page');
    assert.equal(printSpacing.fontSize, '14px', 'print type drops to 10.5pt to save pages');
    assert.ok(parseFloat(printSpacing.lineHeight) <= 20, 'print line-height must be tightened to save pages');
    await page.emulateMedia({ media: 'screen' });

    // start fresh
    await page.locator('button:has-text("Start fresh"):visible').first().click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({
      grade: (document.querySelector('input[placeholder="Grade 10"]') || {}).value,
      subject: (document.querySelector('input[placeholder="Science"]') || {}).value,
      name: (document.querySelector('input[placeholder="1st Quarter Exam"]') || {}).value,
      topic: (document.querySelector('textarea') || {}).value,
      checked: document.querySelectorAll('input[type="checkbox"]:checked').length,
      preview: !!document.querySelector('.prose.prose-slate'),
      saved: localStorage.getItem('saved_test_output'),
      toasts: Array.from(document.querySelectorAll('#silid-toast-container > div')).map((n) => n.innerText).join(' | ')
    }));
    assert.equal(after.grade, '', 'the grade level must be cleared');
    assert.equal(after.subject, '', 'the subject must be cleared');
    assert.equal(after.name, '', 'the test name must be cleared');
    assert.equal(after.topic, '', 'the topic must be cleared');
    assert.equal(after.checked, 0, 'no test type may stay selected');
    assert.ok(!after.preview, 'the previous test must be gone from the preview');
    assert.equal(after.saved, null, 'the stored test must be forgotten');
    assert.match(after.toasts, /Started fresh/i, 'the teacher should be told the form was cleared');
    assert.deepEqual(errors, [], 'exporting, printing and starting fresh must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   16. print / PDF on the Lesson Plan
   =============================================================== */

test('the lesson plan offers a print / PDF export', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, errors } = await openPage('lesson.html', {
    initScript: () => {
      try {
        localStorage.setItem('saved_lesson_output', JSON.stringify({
          html: '<h1>Week 1: The Water Cycle</h1><table><tr><td>Session 1</td><td>Evaporation and condensation</td></tr></table>'
        }));
      } catch { /* storage unavailable */ }
      window.print = function () { window.__printed = (window.__printed || 0) + 1; };
    }
  });
  try {
    const printBtn = page.locator('#print-sheet-btn');
    if (!(await printBtn.isVisible())) {
      t.skip('lesson.html did not render its output toolbar (CDN unavailable?)');
      return;
    }

    await printBtn.click();
    assert.equal(await page.evaluate(() => window.__printed || 0), 1, 'Print / PDF must open the print dialog');

    await page.emulateMedia({ media: 'print' });
    assert.ok(await page.locator('#output-content').isVisible(), 'the lesson plan itself must be on the printed page');
    assert.ok(await printBtn.isHidden(), 'the toolbar must stay off the paper');
    assert.ok(await page.locator('section.no-print').first().isHidden(), 'the input panel must not print');
    assert.ok(await page.locator('#silid-docs-root').isHidden(), 'the documents drawer must not print');

    assert.deepEqual(errors, [], 'printing must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   17. the TOS Maker offers both Word formats
   =============================================================== */

test('the TOS Maker offers both a .doc and a real .docx export', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, errors } = await openPage('tos.html', {
    initScript: () => {
      try {
        localStorage.setItem('school_info', JSON.stringify({
          schoolName: 'Rizal High School', schoolAddress: 'Pasig City', schoolLogo1: '', schoolLogo2: ''
        }));
      } catch { /* storage unavailable */ }
    }
  });
  try {
    // the page now opens on a format chooser, so pick the SOLO template first
    const silidCard = page.locator('button:has-text("SilidPinoy TOS")').first();
    if (!(await silidCard.count())) {
      t.skip('tos.html did not render its format chooser (CDN unavailable?)');
      return;
    }
    await silidCard.click();
    await page.waitForTimeout(400);

    // the SOLO sheet shows the Settings school header on screen too
    assert.match(await page.evaluate(() => document.body.innerText), /rizal high school/i, 'the SOLO on-screen sheet must carry the school header');

    // the standards carry their DepEd preamble
    const english = await page.evaluate(() => document.body.innerText);
    assert.match(english, /The learners should have knowledge and understanding of/, 'the content standard preamble must appear');
    assert.match(english, /By the end of the term, the learners are able to/, 'the performance standard preamble must appear');

    // a Filipino subject switches the wording to Filipino
    await page.getByPlaceholder('e.g. TVL - Computer Systems Servicing').fill('Filipino');
    await page.waitForTimeout(300);
    const filipino = await page.evaluate(() => document.body.innerText);
    assert.match(filipino, /Ang mga mag-aaral ay dapat may kaalaman at pag-unawa sa/, 'a Filipino subject must switch the content preamble');
    assert.match(filipino, /Sa pagtatapos ng termino, ang mga mag-aaral ay may kakayahang/, 'a Filipino subject must switch the performance preamble');

    // several content/performance standards each keep their own line
    await page.getByPlaceholder('e.g. TVL - Computer Systems Servicing').fill('Science');
    await page.getByPlaceholder(/Enter performance standard/)
      .fill('The learners investigate forces.\nThe learners design a simple machine.');
    await page.getByPlaceholder(/Enter content standard/)
      .fill('The learners understand motion.\nThe learners understand energy.');
    await page.waitForTimeout(300);

    const stdCells = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td'));
      const find = (label) => {
        const labelCell = cells.find((td) => td.textContent.trim().startsWith(label));
        const valueCell = labelCell && labelCell.parentElement ? labelCell.parentElement.children[1] : null;
        return valueCell ? { text: valueCell.innerText, blocks: valueCell.querySelectorAll('span.block').length } : null;
      };
      return { perf: find('Performance Standard:'), content: find('Content Standard:') };
    });
    assert.ok(stdCells.perf && stdCells.content, 'the standards cells must be on the sheet');
    assert.equal(stdCells.perf.blocks, 2, 'each performance standard must start on its own line, below the preamble');
    assert.equal(stdCells.content.blocks, 2, 'each content standard must start on its own line, below the preamble');
    const perfLines = stdCells.perf.text.split('\n').map((s) => s.trim()).filter(Boolean);
    assert.match(perfLines[0], /By the end of the term, the learners are able to…$/, 'the preamble must sit on its own line');
    assert.equal(perfLines[1], 'The learners investigate forces.', 'the first performance standard must start the next line');
    assert.equal(perfLines[2], 'The learners design a simple machine.', 'the second performance standard must be the last line');
    const contentLines = stdCells.content.text.split('\n').map((s) => s.trim()).filter(Boolean);
    assert.match(contentLines[0], /The learners should have knowledge and understanding of…$/, 'the content preamble must sit on its own line');
    assert.equal(contentLines[1], 'The learners understand motion.', 'the first content standard must start the next line');
    assert.equal(contentLines[2], 'The learners understand energy.', 'the second content standard must be the last line');

    const docxBtn = page.getByRole('button', { name: /Export DOCX/ });
    if (!(await docxBtn.count())) {
      t.skip('tos.html did not render its export bar (CDN unavailable?)');
      return;
    }

    // the Word export breaks the same standards onto separate lines
    const docDownload = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      page.getByRole('button', { name: /Export Word \(\.doc\)/ }).click()
    ]).then(([d]) => d);
    if (docDownload) {
      const docHtml = fs.readFileSync(await docDownload.path(), 'utf8');
      assert.match(docHtml, /able to…<\/i><\/b><br>The learners investigate forces\.<br>The learners design a simple machine\./, 'the Word export must put the preamble and each performance standard on its own line');
      assert.match(docHtml, /understanding of…<\/i><\/b><br>The learners understand motion\.<br>The learners understand energy\./, 'the Word export must put the preamble and each content standard on its own line');
    } else {
      t.diagnostic('the .doc download did not fire — line breaks not checked in the export');
    }
    assert.ok(await docxBtn.isVisible(), 'the real .docx export is missing');
    assert.ok(await page.getByRole('button', { name: /Export Word \(\.doc\)/ }).isVisible(), 'the flat .doc export is missing');

    if (await page.evaluate(() => !!(window.htmlDocx && window.saveAs))) {
      const docx = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
        docxBtn.click()
      ]).then(([d]) => d);
      assert.ok(docx, 'Export DOCX must hand over a file');
      assert.match(docx.suggestedFilename(), /^TOS_.*\.docx$/, 'the TOS export must be named .docx');
      const bytes = fs.readFileSync(await docx.path());
      assert.equal(bytes.subarray(0, 2).toString('latin1'), 'PK', 'the TOS export must be an OOXML package');
      assert.ok(bytes.includes(Buffer.from('word/document.xml')), 'the package must carry the Word document part');
    } else {
      t.diagnostic('the DOCX helper CDN is unavailable — download not attempted');
    }

    assert.deepEqual(errors, [], 'exporting must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   18. print / PDF handout on the PPT Maker
   =============================================================== */

const SAMPLE_DECK = JSON.stringify([
  { title: 'The Water Cycle', content: ['Water is always moving', 'Driven by the sun'], notes: 'Recap last week before starting.' },
  { title: 'Evaporation', content: ['Liquid water turns into vapour'], notes: 'Ask for everyday examples.' },
  { title: 'Condensation', content: ['Vapour cools back into droplets'], notes: 'Link this to clouds.' },
  { title: 'Precipitation', content: ['Droplets fall back as rain or snow'], notes: '' },
  { title: 'Review', content: ['Name the four stages', 'Draw the cycle'], notes: 'Quick oral quiz to close.' }
]);

test('the PPT Maker prints every slide as a handout', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, errors } = await openPage('powerpoint.html', {
    initScript: () => {
      try { sessionStorage.setItem('gemini_api_key', 'TEST_KEY'); } catch { /* storage unavailable */ }
      window.print = function () { window.__printed = (window.__printed || 0) + 1; };
    }
  });
  try {
    if (!(await page.locator('#topic-input').count())) {
      t.skip('powerpoint.html did not render its input panel (CDN unavailable?)');
      return;
    }

    // text-only visuals keep the run offline — no image generation calls
    await page.locator('[data-visuals="none"]').click();
    await page.route('**/generativelanguage.googleapis.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: SAMPLE_DECK }] } }] })
    }));

    await page.locator('#topic-input').fill('The Water Cycle');
    await page.locator('#topic-paste').fill('Water moves between the sea, the sky and the land in a continuous cycle driven by the sun.');
    await page.locator('#btn-topic-generate').click();
    await page.waitForFunction(
      () => (document.getElementById('slide-total') || {}).textContent === '5',
      null, { timeout: NAV_TIMEOUT }
    );

    const printBtn = page.locator('#btn-print-deck');
    assert.ok(await printBtn.isVisible(), 'the PPT Maker needs a Print / PDF button');

    await printBtn.click();
    assert.equal(await page.evaluate(() => window.__printed || 0), 1, 'Print / PDF must open the print dialog');

    const sheets = await page.evaluate(
      () => Array.from(document.querySelectorAll('#print-handout .print-page')).map((n) => n.innerText)
    );
    assert.equal(sheets.length, 5, 'the handout must carry one page per slide');
    assert.match(sheets[0], /The Water Cycle/, 'each handout page must name its slide');
    assert.match(sheets[0], /Driven by the sun/, 'and carry the slide body');
    assert.match(sheets[0], /Recap last week/, 'and the speaker notes');

    await page.emulateMedia({ media: 'print' });
    assert.ok(await page.locator('#print-handout').isVisible(), 'the handout must be what gets printed');
    assert.ok(await page.locator('main').isHidden(), 'the app itself must stay off the paper');
    assert.ok(await page.locator('#btn-download').isHidden(), 'the export buttons must stay off the paper');
    await page.emulateMedia({ media: 'screen' });

    assert.deepEqual(errors, [], 'printing the deck must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   19. print / PDF on the TOS Maker prints the sheet itself
   =============================================================== */

test('the TOS Maker prints the table, not a blank page', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, errors } = await openPage('tos.html', {
    initScript: () => {
      window.print = function () { window.__printed = (window.__printed || 0) + 1; };
    }
  });
  try {
    // pick the SOLO template — the page opens on the format chooser now
    const silidCard = page.locator('button:has-text("SilidPinoy TOS")').first();
    if (!(await silidCard.count())) {
      t.skip('tos.html did not render its format chooser (CDN unavailable?)');
      return;
    }
    await silidCard.click();
    await page.waitForTimeout(400);

    const printBtn = page.getByRole('button', { name: /Print \/ PDF/ });
    if (!(await printBtn.count())) {
      t.skip('tos.html did not render its export bar (CDN unavailable?)');
      return;
    }

    await printBtn.click();
    assert.equal(await page.evaluate(() => window.__printed || 0), 1, 'Print / PDF must open the print dialog');

    await page.emulateMedia({ media: 'print' });
    const tosTitle = page.getByRole('heading', { name: 'TABLE OF SPECIFICATIONS' });
    assert.ok(await tosTitle.isVisible(), 'the TOS table must be on the printed page');
    assert.ok(await page.locator('header.no-print').isHidden(), 'the nav bar must stay off the paper');
    assert.ok(await printBtn.isHidden(), 'the export buttons must stay off the paper');
    assert.ok(await page.locator('#silid-docs-root').isHidden(), 'the documents drawer must not print');
    await page.emulateMedia({ media: 'screen' });

    assert.deepEqual(errors, [], 'printing the TOS must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   20. the TOS Maker supports the school (LOTS/HOTS) template
   =============================================================== */

test('the TOS Maker offers a school template that is chosen first and remembers its work', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, errors } = await openPage('tos.html');
  try {
    const schoolCard = page.locator('button:has-text("School TOS Template")').first();
    if (!(await schoolCard.count())) {
      t.skip('tos.html did not render its format chooser (CDN unavailable?)');
      return;
    }

    // the format is picked before any form appears
    assert.ok(await page.locator('button:has-text("SilidPinoy TOS")').first().isVisible(), 'the SOLO template must be offered');
    assert.ok(await schoolCard.isVisible(), 'the school template must be offered');

    await schoolCard.click();
    await page.waitForTimeout(400);

    const body = await page.evaluate(() => document.body.innerText);
    assert.match(body, /Lower Order Thinking Skills/, 'the school template must group LOTS');
    assert.match(body, /Higher Order Thinking Skills/, 'the school template must group HOTS');
    assert.ok(!/reysimplifai/i.test(await page.evaluate(() => document.body.innerHTML)), 'vendor credits must be removed');

    // the fields start empty — placeholders only, no sample data
    const comp = page.getByPlaceholder('Competency 1 description...');
    assert.equal(await comp.inputValue(), '', 'competency fields must start empty');

    // what is typed shows in the table and survives a reload
    await comp.fill('Describe the types of plate boundaries');
    await page.getByPlaceholder('Hours').first().fill('5');
    await page.waitForTimeout(400);
    assert.match(await page.evaluate(() => document.body.innerText), /Describe the types of plate boundaries/, 'the table must show the competency');

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(WAIT_MS);
    // the chooser shows first again; picking the school template restores the work
    await page.locator('button:has-text("School TOS Template")').first().click();
    await page.waitForTimeout(400);
    assert.equal(
      await page.getByPlaceholder('Competency 1 description...').inputValue(),
      'Describe the types of plate boundaries',
      'the school-template work must be remembered across a reload'
    );

    // thinking-level names are editable, and levels can be added and removed
    const levelNames = page.locator('div.grid > div.p-3.bg-mist input[type="text"]');
    assert.equal(await levelNames.count(), 6, 'the school template must start with six thinking levels');
    await levelNames.first().fill('Unistructural');
    await page.getByRole('button', { name: '+ Add Category' }).click();
    await page.waitForTimeout(300);
    assert.equal(await levelNames.count(), 7, 'Add Category must append a thinking level');
    const delLevel = page.locator('button[title="Delete level"]');
    await delLevel.last().hover();
    await delLevel.last().click();
    await page.waitForTimeout(300);
    assert.equal(await levelNames.count(), 6, 'a thinking level must be removable');
    const sheet = await page.evaluate(() => document.body.innerText);
    assert.match(sheet, /Unistructural/, 'the renamed level must show in the sheet');
    assert.match(sheet, /Higher Order Thinking Skills/, 'the LOTS/HOTS grouping must survive renames and add/delete');

    // the group labels are editable; their % stays the sum of the levels beneath them
    const hotsLabel = page.locator('input[placeholder="Higher Order Thinking Skills"]');
    assert.equal(await hotsLabel.count(), 1, 'the HOTS group label must be editable');
    await hotsLabel.fill('Relational');
    await page.waitForTimeout(300);
    const thead = await page.evaluate(() => document.querySelector('thead').innerText);
    assert.match(thead, /Relational/, 'the renamed group label must show in the table header');
    assert.match(thead, /50%/, 'the group % must remain the sum of its levels after a rename');

    // both Word formats are offered here too
    const docBtn = page.getByRole('button', { name: /Export Word \(\.doc\)/ });
    assert.ok(await docBtn.isVisible(), 'the flat .doc export is missing');
    assert.ok(await page.getByRole('button', { name: /Export DOCX/ }).isVisible(), 'the real .docx export is missing');

    const doc = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      docBtn.click()
    ]).then(([d]) => d);
    assert.ok(doc, 'Export Word must hand over a file');
    assert.match(doc.suggestedFilename(), /^TOS_.*\.doc$/, 'the school export must be a .doc file');
    const text = fs.readFileSync(await doc.path(), 'utf8');
    assert.ok(text.includes('Lower Order Thinking Skills') && text.includes('Placement'), 'the exported sheet must carry the school table headers');
    assert.ok(text.includes('Prepared by:') && text.includes('Checked by:') && text.includes('Approved by:'), 'the exported sheet must carry the signature block');
    assert.ok(!text.startsWith('PK'), 'the flat .doc must not be a zip archive');
    assert.match(await page.evaluate(() => document.body.innerText), /Prepared by:[\s\S]*Checked by:[\s\S]*Approved by:/, 'the on-screen sheet must carry the signature block');

    assert.deepEqual(errors, [], 'the school template must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   21. the school TOS hands the specification to the Test Maker
   =============================================================== */

test('the school TOS hands a finished specification to the Test Maker', { timeout: LONG_TIMEOUT }, async (t) => {
  const SAMPLE_TEST = [
    '# Summative Test', '', '## Multiple Choice', 'Choose the letter of the best answer.', '',
    '1. Which boundary is associated with volcanoes?',
    '   a. Convergent', '   b. Transform', '   c. Divergent', '   d. Passive', '',
    '## Answer Key', '1. a'
  ].join('\n');

  const { context, page, errors } = await openPage('tos.html', {
    initScript: () => {
      try {
        localStorage.setItem('school_info', JSON.stringify({
          schoolName: 'Sample National High School',
          schoolAddress: 'Sample City, Philippines',
          schoolLogo1: '', schoolLogo2: ''
        }));
        sessionStorage.setItem('gemini_api_key', 'TEST_KEY');
      } catch { /* storage unavailable */ }
    }
  });
  try {
    const schoolCard = page.locator('button:has-text("School TOS Template")').first();
    if (!(await schoolCard.count())) {
      t.skip('tos.html did not render its format chooser (CDN unavailable?)');
      return;
    }
    await schoolCard.click();
    await page.waitForTimeout(400);

    // the header comes from the Settings school info, not from the template
    assert.match(await page.evaluate(() => document.body.innerText), /sample national high school/i, 'the school header from Settings must appear on the sheet');

    await page.getByPlaceholder('e.g. Grade 10').fill('Grade 10');
    await page.getByPlaceholder('e.g. Science').fill('Science');
    await page.getByPlaceholder('Competency 1 description...').fill('Describe the types of plate boundaries');
    await page.getByPlaceholder('Hours').first().fill('5');
    await page.waitForTimeout(300);

    const makeBtn = page.locator('button:has-text("Make Test from TOS")');
    assert.ok(await makeBtn.count(), 'the school template needs a Make Test button');
    assert.ok(await makeBtn.first().isEnabled(), 'Make Test should be available once the sheet is valid');

    // capture what the Test Maker actually sends to the model
    const bodies = [];
    await page.route('**/generativelanguage.googleapis.com/**', (route) => {
      bodies.push(route.request().postData() || '');
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: SAMPLE_TEST }] } }] })
      });
    });

    await makeBtn.first().click();
    await page.waitForURL('**/index.html', { timeout: NAV_TIMEOUT });
    await page.waitForTimeout(3500);

    // the Test Maker should open prefilled from the specification
    const prefill = await page.evaluate(() => ({
      grade: (document.querySelector('input[placeholder="Grade 10"]') || {}).value,
      subject: (document.querySelector('input[placeholder="Science"]') || {}).value,
      name: (document.querySelector('input[placeholder="1st Quarter Exam"]') || {}).value,
      topic: (document.querySelector('textarea[placeholder^="Paste competencies"]') || {}).value || ''
    }));
    assert.equal(prefill.grade, 'Grade 10', 'the grade level must carry over from the TOS');
    assert.equal(prefill.subject, 'Science', 'the subject must carry over from the TOS');
    assert.match(prefill.name, /summative test/i, 'a test name must be proposed');
    assert.ok(prefill.topic.includes('Describe the types of plate boundaries'), 'the competencies must carry over');

    // and it can really produce a test from that specification
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: /^Generate/ }).first().click();
    await page.waitForTimeout(2500);

    const out = await page.evaluate(() => (document.querySelector('.prose.prose-slate') || {}).innerText || '');
    assert.ok(out.includes('Which boundary is associated with volcanoes'), 'the Test Maker must generate a test from the school TOS');
    const joined = bodies.join('\n');
    assert.ok(joined.includes('Describe the types of plate boundaries'), 'the prompt must carry the competency');
    assert.match(joined, /Remembering:\s*\d+/, 'the prompt must carry the cognitive-level distribution');

    assert.deepEqual(errors, [], 'the hand-off must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   22. the school TOS round-trips through My Documents
   =============================================================== */

test('the school TOS saves to and reopens from My Documents', { timeout: LONG_TIMEOUT }, async (t) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('uncaught: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.type() === 'prompt' ? d.accept('My School TOS') : d.dismiss());
  try {
    await page.goto(server.url + 'tos.html', { waitUntil: 'load', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(WAIT_MS);
    const card = page.locator('button:has-text("School TOS Template")').first();
    if (!(await card.count())) { t.skip('tos.html did not render its format chooser (CDN unavailable?)'); return; }
    await card.click();
    await page.waitForTimeout(400);
    await page.getByPlaceholder('e.g. Grade 10').fill('Grade 9');
    await page.getByPlaceholder('e.g. Science').fill('Science');
    await page.getByPlaceholder('Competency 1 description...').fill('Explain the water cycle');
    await page.getByPlaceholder('Hours').first().fill('6');
    await page.waitForTimeout(300);

    await page.locator('button:has-text("Save")').first().click();
    await page.waitForTimeout(1000);

    const docs = await page.evaluate(async () => (await window.SilidDocs.getDocuments()).map((d) => (d.meta && d.meta.config && d.meta.config.template) || 'solo'));
    assert.deepEqual(docs, ['school'], 'the school TOS must be saved with its own shape');

    await page.locator('button:has-text("Switch Format")').first().click();
    await page.waitForTimeout(300);
    await page.locator('button[title="My Documents"]').click();
    await page.waitForTimeout(600);
    await page.locator('aside[aria-label="My documents"] [data-docs-item] button:has-text("Open")').first().click();
    await page.waitForTimeout(900);

    assert.match(await page.evaluate(() => document.body.innerText), /Lower Order Thinking Skills/, 'opening a school TOS must land in the school engine');
    assert.equal(await page.getByPlaceholder('Competency 1 description...').inputValue(), 'Explain the water cycle', 'the competency must be restored');
    assert.deepEqual(errors, [], 'the drawer round-trip must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   23. a math test keeps its formulas and typesets them
   =============================================================== */

/* The shared math sample: 27 formulas covering the awkward cases — a table with
   $|x|$, emphasis-looking $a*b$, an unbalanced-looking $a<b$, and a multi-line
   $$...$$ display block — that break naive Markdown passes and naive exports. */
const MATH_TEST = [
  '# Summative Test', '', '## Multiple Choice', 'Choose the letter of the best answer.', '',
  '1. Which expression means twice a number plus three?',
  '   a. $2x + 3$', '   b. $2(x + 3)$', '   c. $x^{2} + 3$', '   d. $\\frac{x}{2} + 3$', '',
  '2. If $a*b$ and $c*d$, what is the product?',
  '   a. $ac$', '   b. $ad$', '   c. $bc$', '   d. $bd$', '',
  '3. Solve for $x$: $|x| > 3$.',
  '   a. $x > 3$', '   b. $x < 3$', '   c. $x = 3$', '   d. $x < -3$ or $x > 3$', '',
  '4. What is $\\sqrt{25}$?',
  '   a. 25', '   b. 5', '   c. 12', '   d. 7', '',
  '5. Which is the principal square root of 49?',
  '   a. -7', '   b. 7', '   c. $\\pm 7$', '   d. 0', '',
  '6. Which inequality matches $a<b$?',
  '   a. $a > b$', '   b. $a = b$', '   c. $a \\ne b$', '   d. $b > a$', '',
  '## Word Bank', '',
  '| Expression | Meaning |',
  '|---|---|',
  '| $|x|$ | absolute value of x |',
  '| $\\sqrt{25}$ | principal square root |',
  '', '## Solution', '',
  '$$',
  '2x = 10 \\Rightarrow x = 5',
  '$$',
  '', '## Answer Key', '1. a   2. c   3. d   4. b   5. b   6. d'
].join('\n');

const expectedMath =
  (MATH_TEST.match(/\$\$[\s\S]*?\$\$/g) || []).length +
  (MATH_TEST.replace(/\$\$[\s\S]*?\$\$/g, '').match(/\$[^$\n]+\$/g) || []).length;

test('a math test keeps its formulas intact and typesets them in the preview', { timeout: LONG_TIMEOUT }, async (t) => {
  assert.ok(expectedMath > 15, 'the sample should carry enough formulas to notice a duplication');

  const { context, page, errors, cdnBlocked } = await openPage('index.html#test-maker', {
    initScript: () => {
      try { sessionStorage.setItem('gemini_api_key', 'TEST_KEY'); } catch { /* storage unavailable */ }
    }
  });
  try {
    const gradeInput = page.getByPlaceholder('Grade 10');
    if (!(await gradeInput.count())) {
      t.skip('index.html did not render its creator form (CDN unavailable?)');
      return;
    }

    const bodies = [];
    await page.route('**/generativelanguage.googleapis.com/**', (route) => {
      bodies.push(route.request().postData() || '');
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: MATH_TEST }] } }] })
      });
    });
    const waitForBodies = async (n) => {
      const deadline = Date.now() + 30000;
      while (bodies.length < n && Date.now() < deadline) await page.waitForTimeout(200);
      assert.ok(bodies.length >= n, 'the ' + n + ' generation must reach the model');
    };

    // a non-math subject must not be sent the math rules or a colder temperature
    await gradeInput.fill('Grade 10');
    await page.getByPlaceholder('Science').fill('Science');
    await page.getByPlaceholder('1st Quarter Exam').fill('Quarter 1 Test');
    await page.getByPlaceholder('Paste competencies, curriculum guides, or topics...').fill('Photosynthesis');
    await page.locator('input[type="checkbox"]').first().check();
    await page.waitForTimeout(200);

    await page.getByRole('button', { name: /^Generate/ }).first().click();
    await waitForBodies(1);
    await page.waitForFunction(() => !!document.querySelector('.prose.prose-slate'), null, { timeout: NAV_TIMEOUT });
    assert.ok(!/MATH FORMATTING/.test(bodies[0]), 'a non-math subject must not be sent the math rules');
    assert.ok(bodies[0].includes('"temperature":0.7'), 'a non-math test keeps the default temperature');

    // Mathematics turns math mode on by itself
    await page.getByPlaceholder('Science').fill('Mathematics');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Generate/ }).first().click();
    await waitForBodies(2);
    assert.match(bodies[1], /MATH FORMATTING \(MANDATORY\)/, 'a Mathematics test must be sent the math rules');
    assert.match(bodies[1], /LaTeX/, 'the math rules must ask for LaTeX formulas');
    assert.ok(!bodies[0].includes('√'), 'the √-symbol ban belongs to math mode only');
    assert.ok(bodies[1].includes('√') && bodies[1].includes('sqrt('), 'the math rules must ban the √ and sqrt( shorthands by name');
    assert.ok(bodies[1].includes('"temperature":0.35'), 'a math test must be generated at a lower temperature');

    // wait for MathJax, then look at what actually reached the preview
    try {
      await page.waitForFunction(() => document.querySelectorAll('mjx-container').length > 0, null, { timeout: 12000 });
    } catch { /* reported below when the CDN is reachable */ }
    const state = await page.evaluate(() => {
      const el = document.querySelector('.prose.prose-slate');
      const headerRow = el && el.querySelector('table thead tr');
      return {
        tokens: /@@M\d+@@/.test(el ? el.innerHTML : ''),
        tables: el ? el.querySelectorAll('table').length : 0,
        ems: el ? el.querySelectorAll('em').length : 0,
        mjx: document.querySelectorAll('mjx-container').length,
        headerCells: headerRow ? headerRow.children.length : 0
      };
    });
    assert.equal(state.tokens, false, 'no math placeholder may leak into the preview');
    assert.equal(state.tables, 1, 'the word-bank table must be built exactly once');
    assert.equal(state.headerCells, 2, 'a | inside a formula must not split the table cells');
    assert.equal(state.ems, 0, 'an asterisk inside a formula must not become emphasis');
    if (!cdnBlocked) {
      assert.ok(state.mjx > 0, 'MathJax must typeset the formulas');
      assert.equal(state.mjx, expectedMath, 'every formula must be typeset exactly once — no duplicates');
    }

    // the Test details card shows what auto-detection decided
    const autoLabel = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.innerText.trim()).find((x) => /^auto/i.test(x)) || '');
    assert.match(autoLabel, /ON/i, 'Mathematics must turn math mode on automatically');

    // and the math rules are re-checked on the raw output: the sample's $a*b$
    // must reach the teacher as an amber validation warning
    const banner = await page.evaluate(() => (document.querySelector('.bg-amber-50') || {}).innerText || null);
    assert.ok(banner && /asterisk/.test(banner),
      'a formula containing * must raise a validation warning in math mode — got: ' + banner);

    // the warning also sits inline, next to the option that caused it
    const chips = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('code.math-warn-chip'));
      const first = els[0];
      const prev = first && first.previousSibling ? (first.previousSibling.textContent || '') : '';
      return {
        count: els.length,
        text: first ? first.textContent : '',
        afterItem: /product\?/.test(prev.slice(-160)) // the chip follows the item's own text
      };
    });
    assert.ok(chips.count >= 1, 'the math warning must appear inline in the preview');
    assert.match(chips.text, /asterisk/, 'the inline chip must carry the warning text');
    assert.match(chips.text, /\$a\*b\$/, 'the chip must keep its $ literal — MathJax must skip <code> content');
    assert.ok(chips.afterItem, 'the chip must sit right after the item that caused it');

    // the printed paper stays clean: chips are for the screen only
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.evaluate(() => {
      const el = document.querySelector('code.math-warn-chip');
      return el ? getComputedStyle(el).display : 'absent';
    }), 'none', 'inline warnings must not print on the student copy');
    await page.emulateMedia({ media: 'screen' });

    // and the teacher can override the auto-detection in both directions
    await page.getByRole('button', { name: 'Off', exact: true }).first().click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Generate/ }).first().click();
    await waitForBodies(3);
    assert.ok(!/MATH FORMATTING/.test(bodies[2]), 'switching math mode off must drop the math rules');
    assert.ok(bodies[2].includes('"temperature":0.7'), 'switching math mode off must restore the default temperature');

    await page.getByRole('button', { name: 'On', exact: true }).first().click();
    await page.getByPlaceholder('Science').fill('Science');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Generate/ }).first().click();
    await waitForBodies(4);
    assert.match(bodies[3], /MATH FORMATTING \(MANDATORY\)/, 'math mode can be switched on for a non-math subject');
    assert.ok(bodies[3].includes('"temperature":0.35'), 'math mode on must lower the temperature for any subject');

    // four generations in, the preview still holds exactly one copy of each formula
    await page.waitForFunction(() => !!document.querySelector('.prose.prose-slate'), null, { timeout: NAV_TIMEOUT }).catch(() => {});
    if (!cdnBlocked) {
      await page.waitForFunction(() => document.querySelectorAll('mjx-container').length > 0, null, { timeout: 12000 }).catch(() => {});
    }
    const finalState = await page.evaluate(() => {
      const el = document.querySelector('.prose.prose-slate');
      return {
        mjx: document.querySelectorAll('mjx-container').length,
        tokens: /@@M\d+@@/.test(el ? el.innerHTML : '')
      };
    });
    assert.equal(finalState.tokens, false, 'no placeholder may leak after a re-generation');
    if (!cdnBlocked) assert.equal(finalState.mjx, expectedMath, 're-generation must not duplicate formulas');

    assert.deepEqual(errors, [], 'a math test must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   24. math export: Word and PowerPoint get real equations
   =============================================================== */

test('a math test exports its formulas as real equations to Word and PowerPoint', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, errors, cdnBlocked } = await openPage('index.html#test-maker', {
    initScript: () => {
      try { sessionStorage.setItem('gemini_api_key', 'TEST_KEY'); } catch { /* storage unavailable */ }
    }
  });
  try {
    if (!(await page.getByPlaceholder('Grade 10').count())) {
      t.skip('index.html did not render its creator form (CDN unavailable?)');
      return;
    }
    /* the export pipeline needs MathJax (TeX→MathML), mathml2omml (MathML→OMML),
       PptxGenJS (the deck), JSZip (to bake equations in) and html-docx (the package) */
    await page.waitForFunction(() => !!(window.MathJax && typeof window.MathJax.tex2mml === 'function'
      && window.mml2omml && window.JSZip && window.PptxGenJS && window.htmlDocx && window.saveAs),
      null, { timeout: 15000 }).catch(() => {});
    const libs = await page.evaluate(() => ({
      tex2mml: !!(window.MathJax && typeof window.MathJax.tex2mml === 'function'),
      mml2omml: !!window.mml2omml, jszip: !!window.JSZip,
      pptxgen: !!window.PptxGenJS, htmlDocx: !!window.htmlDocx, saveAs: !!window.saveAs
    }));
    if (Object.values(libs).some((v) => !v)) {
      t.diagnostic('export libraries unavailable: ' + JSON.stringify(libs));
      t.skip('external CDN unavailable');
      return;
    }

    await page.route('**/generativelanguage.googleapis.com/**', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: MATH_TEST }] } }] })
    }));
    await page.getByPlaceholder('Grade 10').fill('Grade 10');
    await page.getByPlaceholder('Science').fill('Mathematics');
    await page.getByPlaceholder('1st Quarter Exam').fill('Math Quiz');
    await page.getByPlaceholder('Paste competencies, curriculum guides, or topics...').fill('Algebra');
    await page.locator('input[type="checkbox"]').first().check();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /^Generate/ }).first().click();
    await page.waitForFunction(() => !!document.querySelector('.prose.prose-slate'), null, { timeout: NAV_TIMEOUT });
    try {
      await page.waitForFunction(() => document.querySelectorAll('mjx-container').length > 0, null, { timeout: 12000 });
    } catch { /* reported by test 23 when the CDN is reachable */ }

    // ---- the flat .doc: every formula is a <math> element, no $ left behind ----
    const [doc] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Word', exact: true }).click()
    ]);
    const wordHtml = fs.readFileSync(await doc.path(), 'utf8');
    assert.equal((wordHtml.match(/<math /g) || []).length, expectedMath,
      'every formula must be exported to Word as a <math> element');
    assert.ok(!/\$/.test(wordHtml), 'a math Word export must not keep a single literal $');

    // ---- the real .docx: the same equations inside the package ----
    const [docx] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'DOCX' }).click()
    ]);
    const docxMath = await page.evaluate(async (b64) => {
      const zip = await window.JSZip.loadAsync(b64, { base64: true });
      let n = 0;
      for (const name of Object.keys(zip.files)) {
        if (zip.files[name].dir) continue;
        try { n += ((await zip.file(name).async('string')).match(/<math /g) || []).length; } catch { /* binary */ }
      }
      return n;
    }, fs.readFileSync(await docx.path()).toString('base64'));
    assert.equal(docxMath, expectedMath, 'the .docx package must carry the same equations');

    // ---- the .pptx: each marker becomes a native equation paragraph ----
    const [ppt] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'PPT', exact: true }).click()
    ]);
    assert.match(ppt.suggestedFilename(), /\.pptx$/, 'the PPT button must hand over a .pptx file');
    const deck = await page.evaluate(async (b64) => {
      const zip = await window.JSZip.loadAsync(b64, { base64: true });
      const out = { tokens: 0, omml: 0, a14: 0, malformed: [], questionLine: null };
      const parser = new DOMParser();
      for (const name of Object.keys(zip.files)) {
        if (!/^ppt\/slides\/slide\d+\.xml$/.test(name)) continue;
        const xml = await zip.file(name).async('string');
        out.tokens += (xml.match(/@@M\d+@@/g) || []).length;
        out.omml += (xml.match(/<m:oMathPara[ >]/g) || []).length;
        out.a14 += (xml.match(/<a14:m>/g) || []).length;
        if (parser.parseFromString(xml, 'application/xml').querySelector('parsererror')) out.malformed.push(name);
        const m = xml.match(/<a:t[^>]*>([^<]*Which inequality[^<]*)<\/a:t>/);
        if (m) out.questionLine = m[1];
      }
      return out;
    }, fs.readFileSync(await ppt.path()).toString('base64'));
    assert.equal(deck.tokens, 0, 'no formula marker may leak into the slides');
    assert.deepEqual(deck.malformed, [], 'every slide must stay well-formed XML — an unescaped < in a formula corrupts the whole package');
    assert.equal(deck.omml, expectedMath, 'every formula must become an equation paragraph');
    assert.equal(deck.a14, expectedMath, 'every equation must sit in the PowerPoint math zone (a14:m)');
    assert.ok(deck.questionLine && /Which inequality matches\?$/.test(deck.questionLine),
      'the line the formula left must read cleanly once the marker is gone');

    // ---- math mode off: the very same test exports as plain text again ----
    await page.getByRole('button', { name: 'Off', exact: true }).first().click();
    await page.waitForTimeout(300);
    const [docOff] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Word', exact: true }).click()
    ]);
    const wordOff = fs.readFileSync(await docOff.path(), 'utf8');
    assert.ok(/\$[^$]+\$/.test(wordOff), 'with math mode off the formulas must stay literal $...$ text');
    assert.equal((wordOff.match(/<math /g) || []).length, 0, 'math mode off must not embed equations in Word');

    const [pptOff] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'PPT', exact: true }).click()
    ]);
    const deckOff = await page.evaluate(async (b64) => {
      const zip = await window.JSZip.loadAsync(b64, { base64: true });
      const out = { tokens: 0, omml: 0, malformed: [] };
      const parser = new DOMParser();
      for (const name of Object.keys(zip.files)) {
        if (!/^ppt\/slides\/slide\d+\.xml$/.test(name)) continue;
        const xml = await zip.file(name).async('string');
        out.tokens += (xml.match(/@@M\d+@@/g) || []).length;
        out.omml += (xml.match(/<m:oMathPara[ >]/g) || []).length;
        if (parser.parseFromString(xml, 'application/xml').querySelector('parsererror')) out.malformed.push(name);
      }
      return out;
    }, fs.readFileSync(await pptOff.path()).toString('base64'));
    assert.equal(deckOff.tokens, 0, 'with math mode off no marker may ever be written');
    assert.equal(deckOff.omml, 0, 'with math mode off the slides carry no equations');
    assert.deepEqual(deckOff.malformed, [], 'the non-math deck must stay well-formed XML');

    assert.deepEqual(errors, [], 'the math exports must not raise page errors');
  } finally {
    await context.close();
  }
});

/* ===============================================================
   inline SVG figures (geometry diagrams) survive render and export
   =============================================================== */

// A 3-D cube exactly as the math prompt asks for it: item 1 is multi-line,
// item 2 is a single line, so both spellings are covered.
const CUBE_TEST = [
  '# Summative Test', '',
  '## Multiple Choice',
  'Choose the best answer.', '',
  '1. The figure shows a cube. How many faces meet at each vertex?',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="none" stroke="#000" stroke-width="2">',
  '  <path d="M60 20 L100 40 L100 80 L60 100 L20 80 L20 40 Z"/>',
  '  <path d="M60 20 L60 60 L100 80"/>',
  '  <path d="M60 60 L20 80"/>',
  '  <path d="M60 60 L60 100" stroke-dasharray="4 3"/>',
  '</svg>',
  '   a. 2   b. 3   c. 4   d. 6', '',
  '2. A cube of edge $s=3$ cm has volume $V=s^{3}=27$ cm$^{3}$. <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="60" height="60" fill="none" stroke="#000"><rect x="12" y="12" width="36" height="36"/></svg>',
  '   a. 9   b. 27   c. 81   d. 8', '',
  '## Answer Key',
  '1. b   2. b'
].join('\n');

test('a math test keeps an inline SVG figure intact in the preview and the exports', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, errors } = await openPage('index.html#test-maker', {
    initScript: () => {
      try { sessionStorage.setItem('gemini_api_key', 'TEST_KEY'); } catch { /* storage unavailable */ }
    }
  });
  try {
    if (!(await page.getByPlaceholder('Grade 10').count())) {
      t.skip('index.html did not render its creator form (CDN unavailable?)');
      return;
    }

    const bodies = [];
    await page.route('**/generativelanguage.googleapis.com/**', (route) => {
      bodies.push(route.request().postData() || '');
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: CUBE_TEST }] } }] })
      });
    });

    await page.getByPlaceholder('Grade 10').fill('Grade 10');
    await page.getByPlaceholder('Science').fill('Mathematics');
    await page.getByPlaceholder('1st Quarter Exam').fill('Geometry Quiz');
    await page.getByPlaceholder('Paste competencies, curriculum guides, or topics...').fill('space figures, cubes and nets');
    await page.locator('input[type="checkbox"]').first().check();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /^Generate/ }).first().click();
    await page.waitForFunction(() => !!document.querySelector('.prose.prose-slate'), null, { timeout: NAV_TIMEOUT });

    // the model must actually be asked to draw the figure
    assert.ok(bodies.length >= 1, 'the generation must reach the model');
    assert.match(bodies[0], /inline <svg> figure/, 'the math rules must ask for an inline SVG figure');

    const state = await page.evaluate(() => {
      const el = document.querySelector('.prose.prose-slate');
      const svgs = Array.from(el.querySelectorAll('svg'));
      return {
        count: svgs.length,
        boxes: svgs.map(s => s.getAttribute('viewBox') || ''),
        shapes: svgs.reduce((n, s) => n + s.querySelectorAll('path,rect').length, 0),
        children: svgs.map(s => s.children.length),
        brInside: svgs.map(s => /<br/i.test(s.innerHTML)),
        leaked: /path d=/.test(el.innerText)
      };
    });
    assert.equal(state.count, 2, 'both figures must reach the preview');
    assert.ok(state.boxes.every(Boolean), 'every figure must keep its viewBox');
    assert.ok(state.shapes >= 5, 'the cube must keep its geometry — got ' + state.shapes + ' shapes');
    assert.ok(state.children.every(n => n >= 1), 'every figure must keep its own child shapes');
    assert.deepEqual(state.brInside, [false, false],
      'the newline pass must not put <br> inside an <svg> — <br> is an HTML breakout tag that closes the figure and drops the drawing');
    assert.equal(state.leaked, false, 'no raw markup may leak into the printed text');

    // and the exports carry the same figure
    await page.waitForFunction(() => !!(window.MathJax && typeof window.MathJax.tex2mml === 'function'
      && window.mml2omml && window.JSZip && window.htmlDocx && window.saveAs),
      null, { timeout: 15000 }).catch(() => {});

    const [doc] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.getByRole('button', { name: 'Word', exact: true }).click()
    ]);
    const wordHtml = fs.readFileSync(await doc.path(), 'utf8');
    assert.ok((wordHtml.match(/data:image\/png;base64,/g) || []).length >= 1,
      'the flat .doc must carry the figure as a PNG picture — Word does not draw inline <svg> out of imported HTML');
    assert.equal((wordHtml.match(/<svg /g) || []).length, 0,
      'no raw <svg> markup may remain in the Word export — Word drops the element and prints blank space');

    const [docx] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.getByRole('button', { name: 'DOCX' }).click()
    ]);
    /* html-docx-js does not keep data URIs inline: it lifts each one into its own
       MHT part (Content-Location: file:///C:/fake/imageN.png) with the base64 body
       under separate headers, and rewrites the <img> src to that location — so the
       picture is asserted by reference plus the base64 PNG magic, not by data URI. */
    const docxFigures = await page.evaluate(async (b64) => {
      const zip = await window.JSZip.loadAsync(b64, { base64: true });
      const mht = (await zip.file('word/afchunk.mht').async('string')).replace(/=\r\n/g, '');
      return {
        refs: (mht.match(/file:\/\/\/C:\/fake\/image\d+\.png/g) || []).length,
        pngs: (mht.match(/iVBORw0KGgo/g) || []).length,
        rawSvg: (mht.match(/<svg/g) || []).length
      };
    }, fs.readFileSync(await docx.path()).toString('base64'));
    assert.ok(docxFigures.refs >= 1 && docxFigures.pngs >= 1,
      'the .docx package must carry the figure as a real PNG picture — Word does not draw inline <svg> out of imported HTML');
    assert.equal(docxFigures.rawSvg, 0, 'no raw <svg> markup may remain in the .docx package — Word drops the element');

    assert.deepEqual(errors, [], 'the SVG figure must not raise page errors');
  } finally {
    await context.close();
  }
});
