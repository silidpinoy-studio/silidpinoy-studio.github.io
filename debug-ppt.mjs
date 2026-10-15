import { getPlaywright } from './tests/helpers/playwright.mjs';
import { startServer } from './tests/helpers/server.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const server = await startServer(ROOT);
const pw = await getPlaywright();
let browser;
try { browser = await pw.chromium.launch({ channel: 'chrome', headless: true }); }
catch { browser = await pw.chromium.launch({ headless: true }); }

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
await page.goto(server.url + 'powerpoint.html', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);

console.log('STATE:', JSON.stringify(await page.evaluate(() => ({
  hasBtn: !!document.getElementById('settings-btn'),
  hasAPI: !!window.SilidAPI,
}))));

// 1. settings dropdown opens
await page.locator('#settings-btn').click();
await page.waitForTimeout(400);
const hidden = await page.locator('#settings-dropdown').evaluate((el) => el.classList.contains('hidden'));
console.log('dropdown hidden after click:', hidden);
console.log('key input visible:', await page.locator('#settings-key-input').isVisible());
await page.fill('#settings-key-input', 'TEST_KEY');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// 2. generate deck (mocked API)
await page.route('**/generativelanguage.googleapis.com/**', (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify([
    { title: 'Slide One', content: ['Point A', 'Point B'], notes: 'note 1', visualIdea: 'apple' },
    { title: 'Slide Two', content: ['Point C'], notes: 'note 2', visualIdea: 'book' }
  ]) }] } }] })
}));
await page.fill('#topic-input', 'Photosynthesis');
await page.fill('#topic-paste', 'This is sample lesson content long enough to pass the twenty character minimum check for the topic input.');
await page.locator('#btn-topic-generate').click();
await page.waitForTimeout(2500);

const panels = await page.evaluate(() => ({
  preview: !document.getElementById('panel-preview')?.classList.contains('hidden'),
  review: !document.getElementById('panel-review')?.classList.contains('hidden'),
  empty: !document.getElementById('panel-empty')?.classList.contains('hidden'),
  err: document.getElementById('error-box')?.innerText || document.querySelector('[id*=error]')?.innerText || ''
}));
console.log('PANELS:', JSON.stringify(panels).slice(0, 400));

// 3. download pptx (exercises the previously-broken build code)
if (panels.review) {
  await page.locator('#btn-review-build').click();
  await page.waitForTimeout(3000);
}
if (await page.locator('#btn-download').isVisible().catch(() => false)) {
  const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await page.locator('#btn-download').click();
  const d = await dl;
  console.log('DOWNLOAD:', d ? await d.suggestedFilename() : 'no download event');
  await page.waitForTimeout(1000);
}

console.log('PAGEERRORS:', JSON.stringify(errors));
await browser.close();
await server.close();
