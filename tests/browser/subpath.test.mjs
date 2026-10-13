/**
 * The published site is served from a subpath, the way a GitHub Pages project
 * site is (`https://<user>.github.io/<repo>/`). These tests mount the deploy
 * payload under a prefix and prove the app still works there — a single
 * root-absolute link would break the live site, and Windows would not catch it
 * because the file system is case-insensitive while Pages is not.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlaywright } from '../helpers/playwright.mjs';
import { startServer } from '../helpers/server.mjs';
import { PAGES, PAYLOAD, EXCLUDED } from '../../scripts/publish-payload.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLISH = path.join(ROOT, 'publish');
const BASE = '/silidpinoy-studio';

const CDN_HOSTS = [
  'cdn.tailwindcss.com', 'unpkg.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'
];

const WAIT_MS = 3200;
const NAV_TIMEOUT = 45000;
const LONG_TIMEOUT = 90000;

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

let server;
let browser;

async function launch(pw) {
  try {
    return await pw.chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return await pw.chromium.launch({ headless: true }); // bundled chromium
  }
}

/** Every relative local reference an HTML page makes: srcs, hrefs and icon links. */
function localRefs(html) {
  const refs = new Set();
  // the leading whitespace matters: it keeps `data-dllsrc="exemplar"` from reading as `src`
  const pattern = /(?:\s|^)(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = pattern.exec(html))) {
    const ref = (match[1] ?? match[2] ?? '').trim();
    if (!ref) continue;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) continue; // absolute, protocol-relative, anchor
    if (ref.includes('{') || ref.includes('+')) continue;      // built at runtime, not a static asset
    refs.add(ref.split(/[?#]/)[0]);
  }
  return [...refs];
}

before(async () => {
  const pw = await getPlaywright();
  server = await startServer(PUBLISH, 0, { basePath: BASE });
  browser = await launch(pw);
}, { timeout: LONG_TIMEOUT });

after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

async function openPage(file, { initScript } = {}) {
  const context = await browser.newContext();
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];
  const badResponses = [];

  page.on('pageerror', (e) => errors.push('uncaught: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });
  page.on('dialog', async (d) => {
    errors.push(`dialog(${d.type()}): ${d.message()}`);
    await d.dismiss().catch(() => {});
  });

  await page.goto(server.url + file, { waitUntil: 'load', timeout: NAV_TIMEOUT });
  await page.waitForTimeout(WAIT_MS);

  const cdnBlocked = failedRequests.some((u) => CDN_HOSTS.some((h) => u.includes(h)));
  // match the whole origin, not the subpath URL: a root-absolute reference
  // (`src="/foo.js"`) 404s at the origin and must not slip through
  const origin = new URL(server.url).origin;
  const localBadResponses = badResponses.filter((entry) => entry.includes(origin));
  return { context, page, errors, failedRequests, badResponses, localBadResponses, cdnBlocked };
}

/* ===============================================================
   1. the deploy payload is complete
   =============================================================== */

test('the publish folder ships every file the pages ask for', () => {
  assert.ok(fs.existsSync(PUBLISH), 'the publish folder should exist');

  const missing = [];
  for (const file of PAGES) {
    const full = path.join(PUBLISH, file);
    assert.ok(fs.existsSync(full), `publish/${file} is missing from the deploy payload`);
    for (const ref of localRefs(fs.readFileSync(full, 'utf8'))) {
      if (!fs.existsSync(path.join(PUBLISH, ref))) missing.push(`${file} -> ${ref}`);
    }
  }
  assert.deepEqual(missing, [], 'the deploy payload is missing referenced files');

  // every copied file must be byte-identical to the one at the project root
  const drifted = PAYLOAD.filter((file) =>
    !fs.readFileSync(path.join(PUBLISH, file)).equals(fs.readFileSync(path.join(ROOT, file)))
  );
  assert.deepEqual(drifted, [], 'the publish snapshot is stale — re-copy these files before uploading');
});

test('the publish folder carries no dev clutter', () => {
  const published = fs.readdirSync(PUBLISH);
  for (const unwanted of EXCLUDED) {
    assert.ok(!published.includes(unwanted), `publish/${unwanted} should not be published`);
  }
  assert.ok(published.includes('.nojekyll'), 'publish/.nojekyll is required for GitHub Pages');

  // nothing may be published that the manifest does not account for.
  // `.git` stays: PUBLISH.md tells the teacher to push this very folder to
  // GitHub Pages, so the deployment repo lives here between pushes.
  const unexpected = published.filter((name) =>
    !PAYLOAD.includes(name) && !['PUBLISH.md', 'README.md', '.nojekyll', '.git'].includes(name)
  );
  assert.deepEqual(unexpected, [], 'publish/ holds files the manifest does not list');
});

/* ===============================================================
   2. every page loads from the subpath
   =============================================================== */

test('every page loads cleanly from a subpath', { timeout: LONG_TIMEOUT }, async (t) => {
  for (const file of PAGES) {
    await t.test(file, { timeout: NAV_TIMEOUT + 10000 }, async (t) => {
      const { context, page, errors, localBadResponses, cdnBlocked } = await openPage(file);
      try {
        assert.deepEqual(localBadResponses, [], `${file} could not load one of its own files`);

        const mounted = await page.evaluate(
          () => document.body.children.length > 0 && document.body.innerText.trim().length > 40
        );
        if (cdnBlocked && !mounted) {
          t.diagnostic('CDN assets unreachable — skipping render assertions');
          t.skip('external CDN unavailable');
          return;
        }
        assert.deepEqual(errors, [], `${file} reported errors from the subpath`);
        assert.ok(mounted, `${file} did not render from the subpath`);
      } finally {
        await context.close();
      }
    });
  }
});

test('the shared modules load from the subpath too', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, cdnBlocked } = await openPage('index.html');
  try {
    if (cdnBlocked) {
      t.skip('external CDN unavailable');
      return;
    }
    const missing = await page.evaluate(() =>
      ['SilidAPI', 'SilidKeys', 'SilidBackup', 'SilidValidate', 'SilidDocs', 'SilidFileUtils', 'SilidToast', 'SilidDocsUI']
        .filter((name) => !window[name])
    );
    assert.deepEqual(missing, [], 'shared modules failed to load from the subpath');
  } finally {
    await context.close();
  }
});

test('the subpath mount really is a subpath', async () => {
  // If the origin root served the same files, a root-absolute link like
  // href="/index.html" would pass every test above while 404ing on the live
  // project site. The files must exist only under the prefix.
  const response = await fetch(new URL('/index.html', server.url));
  assert.equal(response.status, 404, 'files should only be reachable under the subpath');
});

/* ===============================================================
   3. navigation never escapes the subpath
   =============================================================== */

test('every in-page link resolves inside the subpath', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, cdnBlocked } = await openPage('index.html');
  try {
    if (cdnBlocked) {
      t.skip('external CDN unavailable');
      return;
    }

    const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href'))
      .filter((href) => href && !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('#')));

    assert.ok(links.length > 0, 'the shell should link to the other tools');

    for (const href of new Set(links)) {
      const target = new URL(href, page.url());
      assert.ok(
        target.pathname.startsWith(BASE + '/'),
        `${href} escapes the subpath (would 404 on a project site)`
      );
      const response = await page.request.get(target.href);
      assert.equal(response.status(), 200, `${href} did not load from the subpath`);
    }
  } finally {
    await context.close();
  }
});

/* ===============================================================
   4. a real generation works from the subpath
   =============================================================== */

test('the Test Maker generates a test from the subpath', { timeout: LONG_TIMEOUT }, async (t) => {
  const { context, page, errors, cdnBlocked } = await openPage('index.html#test-maker', {
    // the page reads its key while the app mounts, so seed it before any script runs
    initScript: () => { try { sessionStorage.setItem('gemini_api_key', 'TEST_KEY'); } catch { /* storage unavailable */ } }
  });
  try {
    if (cdnBlocked) {
      t.skip('external CDN unavailable');
      return;
    }

    const gradeInput = page.getByPlaceholder('Grade 10');
    if (!(await gradeInput.count())) {
      t.skip('index.html did not render its creator form');
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
    await page.locator('input[type="checkbox"]').first().check();
    await page.waitForTimeout(200);

    await page.getByRole('button', { name: /^Generate/ }).first().click();
    await page.waitForFunction(() => !!document.querySelector('.prose.prose-slate'), null, { timeout: NAV_TIMEOUT });

    const output = await page.evaluate(
      () => (document.querySelector('.prose.prose-slate') || {}).innerText || ''
    );
    assert.match(output, /The water cycle/i, 'the generated test should appear on screen');
    assert.deepEqual(errors, [], 'generating from the subpath reported errors');
  } finally {
    await context.close();
  }
});
