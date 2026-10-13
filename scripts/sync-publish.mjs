/**
 * Refresh the `publish/` snapshot from the project root.
 *
 * `publish/` is what gets uploaded to GitHub Pages, so it must never lag behind
 * the app. Run this after changing any site file:
 *
 *     npm run publish:sync
 *
 * `tests/browser/subpath.test.mjs` fails if the snapshot is stale, so a
 * forgotten sync is caught before it can ship old code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAYLOAD } from './publish-payload.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLISH = path.join(ROOT, 'publish');

fs.mkdirSync(PUBLISH, { recursive: true });

const written = [];
const unchanged = [];
const missing = [];

for (const file of PAYLOAD) {
  const from = path.join(ROOT, file);
  const to = path.join(PUBLISH, file);

  if (!fs.existsSync(from)) {
    missing.push(file);
    continue;
  }

  const next = fs.readFileSync(from);
  if (fs.existsSync(to) && fs.readFileSync(to).equals(next)) {
    unchanged.push(file);
    continue;
  }

  fs.writeFileSync(to, next);
  written.push(file);
}

// GitHub Pages skips its Jekyll build when this file is present.
const nojekyll = path.join(PUBLISH, '.nojekyll');
if (!fs.existsSync(nojekyll)) fs.writeFileSync(nojekyll, '');

if (missing.length) {
  console.error(`missing at the project root: ${missing.join(', ')}`);
  process.exitCode = 1;
}

console.log(`publish/: ${written.length} written, ${unchanged.length} already current`);
if (written.length) console.log(`  updated: ${written.join(', ')}`);
console.log(`  files:   ${PAYLOAD.length + 1} (payload + .nojekyll)`);
