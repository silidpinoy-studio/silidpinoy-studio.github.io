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
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('PAGE-ERROR:', String(e).slice(0, 400)));
await page.goto(server.url + 'lesson.html', { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(3200);

await page.route('**/generativelanguage.googleapis.com/**', (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"grades":[{"resources":"r","preLesson":"p","flow":"f","integration":"i","assessment":"a","waysForward":"w","reflection":"r","aiDeclaration":"d"},{"resources":"r","preLesson":"p","flow":"f","integration":"i","assessment":"a","waysForward":"w","reflection":"r","aiDeclaration":"d"}]}' }] } }] })
}));

await page.locator('#lang-pill button[data-value="en"]').click();
await page.locator('#settings-btn').click();
await page.fill('#settings-key-input', 'TEST_KEY');
await page.locator('#plan-pill button[data-value="multigrade"]').click();
await page.waitForTimeout(200);
await page.selectOption('#lessonSequence', 'custom');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.selectOption('#lessonSequence', 'collab');
await page.locator('#plan-pill button[data-value="coi"]').click();
await page.waitForTimeout(200);
await page.locator('#plan-pill button[data-value="multigrade"]').click();
await page.waitForTimeout(200);

await page.fill('#learningArea', 'Math');
await page.selectOption('#gradeLevelSel', 'Grade 1');
await page.fill('#sectionInput', 'Mabini');
await page.locator('.competency-input').first().fill('Count objects one to ten.');
await page.fill('#multigradeTime', 'MONDAY-TUESDAY 8:00 AM - 10:00 AM');
await page.locator('.mg-level').nth(0).fill('Kindergarten');
await page.locator('.mg-competency').nth(0).fill('Count objects one to ten.');
await page.locator('.mg-objectives').nth(0).fill('Count objects 1-10 with 80% accuracy.');
await page.locator('.mg-level').nth(1).fill('Grade 1');
await page.locator('.mg-competency').nth(1).fill('Add objects within 10.');
await page.locator('.mg-objectives').nth(1).fill('Add numbers within 10 with 80% accuracy.');

const report = await page.evaluate(() => {
  const form = document.getElementById('generate-btn').closest('form');
  const invalid = [];
  if (form) {
    form.querySelectorAll('input, textarea, select').forEach((el) => {
      if (el.disabled || el.closest('[class*="hidden"]')) return;
      const v = el.validity;
      if (!v.valid) invalid.push({ id: el.id || el.className.slice(0, 40), reason: v.valueMissing ? 'required-empty' : v.message || 'other' });
    });
  }
  return { hasForm: !!form, novalidate: form ? form.noValidate : null, invalid };
});
console.log('REPORT:', JSON.stringify(report, null, 2));

// also click and see what happens
await page.locator('#generate-btn').click();
await page.waitForTimeout(4000);
const after = await page.evaluate(() => ({
  outputHidden: document.getElementById('output-content').classList.contains('hidden'),
  errBox: (document.querySelector('.bg-red-50') || {}).innerText || null,
  loadingHidden: document.getElementById('loading-state')?.classList.contains('hidden')
}));
console.log('AFTER CLICK:', JSON.stringify(after));
await browser.close();
await server.close();
