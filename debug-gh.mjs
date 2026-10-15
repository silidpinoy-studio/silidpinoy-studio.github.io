import { getPlaywright } from './tests/helpers/playwright.mjs';

const pw = await getPlaywright();
let browser;
try { browser = await pw.chromium.launch({ channel: 'chrome', headless: true }); }
catch { browser = await pw.chromium.launch({ headless: true }); }

const pages = ['index.html', 'lesson.html', 'powerpoint.html', 'activity.html', 'tos.html'];
const withGear = new Set(['lesson.html', 'powerpoint.html', 'activity.html']);
let anyFail = false;

for (const p of pages) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  try {
    await page.goto('https://silidpinoy-studio.github.io/' + p, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    const btn = await page.locator('#settings-btn').count();
    let dropdownOpens = 'no-button';
    if (btn && withGear.has(p)) {
      await page.locator('#settings-btn').click();
      await page.waitForTimeout(300);
      dropdownOpens = String(!(await page.locator('#settings-dropdown').evaluate((el) => el.classList.contains('hidden'))));
    }
    const ok = errors.length === 0 && dropdownOpens !== 'false';
    if (!ok) anyFail = true;
    console.log(`${p}: pageerrors=${errors.length} dropdownOpens=${dropdownOpens} ${ok ? 'OK' : 'FAIL ' + JSON.stringify(errors)}`);
  } catch (e) {
    anyFail = true;
    console.log(`${p}: NAV FAIL ${e.message.slice(0, 150)}`);
  }
  await page.close();
}
console.log(anyFail ? 'RESULT: SOME FAILURES' : 'RESULT: ALL OK');
await browser.close();
