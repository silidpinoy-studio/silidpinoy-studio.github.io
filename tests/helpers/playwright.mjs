import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function npxCacheRoots() {
  const roots = [
    process.env.npm_config_cache && path.join(process.env.npm_config_cache, '_npx'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm-cache', '_npx'),
    path.join(os.homedir(), '.npm', '_npx')
  ];
  return roots.filter(Boolean);
}

/**
 * Resolve `playwright` from, in order:
 *   1. the project's node_modules (after `npm install`)
 *   2. a globally installed copy
 *   3. any `npx` cache entry that already downloaded it
 *
 * That last one means the browser tests work out of the box on a machine where
 * Playwright has ever been run via npx, without adding node_modules to the repo.
 */
export async function getPlaywright() {
  try {
    return await import('playwright');
  } catch { /* not installed in the project */ }

  try {
    return require('playwright');
  } catch { /* not resolvable from here */ }

  for (const root of npxCacheRoots()) {
    let entries;
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(root, entry, 'node_modules', 'playwright');
      if (fs.existsSync(path.join(candidate, 'package.json'))) {
        return require(candidate);
      }
    }
  }

  throw new Error(
    'Playwright is required for the browser tests but was not found.\n' +
    'Install it with `npm install`, or run any Playwright-based command once via `npx playwright --version`.'
  );
}
