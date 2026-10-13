# Tests

Automated checks for SilidPinoy Studio. The app itself is static HTML with no build
step — `package.json` exists **only** so this suite can be run on demand.

## Running

```bash
npm test              # everything
npm run test:unit     # shared modules in Node (fast, no browser)
npm run test:browser  # real pages in Chrome
```

No install is strictly required. The browser tests resolve Playwright from, in order:
the project's `node_modules`, the global install, then any `npx` cache that already
downloaded it. If none exist:

```bash
npm install                  # adds node_modules (playwright is the only devDependency)
# or, to reuse a cached copy:
npx playwright --version
```

The browser tests need **Google Chrome** installed (they launch `channel: 'chrome'`
and fall back to Playwright's bundled Chromium). The pages also pull Tailwind, React
and PDF.js from CDNs; when those are unreachable the affected assertions are reported
as *skipped* rather than failed.

## What is covered

### `tests/unit/` — no browser

| File | Covers |
| --- | --- |
| `shared-validate.test.mjs` | Test/PPT/activity/lesson output validators, including the warning text each one produces |
| `shared-file-utils.test.mjs` | Per-tool source-length limits, the 30k default, scanned-PDF detection, and the `warnAboutSource` toasts |
| `shared-api.test.mjs` | Key lookup, request shaping, friendly error mapping, transient retry, network retry, backup-key fallback, JSON mode, and `pingKey` |

These load the real module files into a `node:vm` sandbox with stubbed `localStorage`,
`fetch` and `setTimeout` (see `tests/helpers/sandbox.mjs`), so the browser globals are
exercised unmodified. Retry backoff is collapsed to 0 ms so the suite stays fast.

### `tests/browser/` — real Chrome, real HTTP origin

`pages.test.mjs` serves the project over an ephemeral port (IndexedDB needs a real
origin) and checks:

- every page loads with **no console errors, page errors, failed requests or alerts**
- each page exposes the shared modules it loads (`SilidAPI`, `SilidDocs`, `SilidToast`, …)
- the **My Documents** drawer: per-tool scoping, inline rename, duplicate, two-click
  delete, and Escape-to-close
- **Open** restores real output on Lesson Plan, PPT Maker and TOS
- oversized sources and scanned PDFs raise warning toasts
- `SilidAPI` retries a 429 and then falls back to the backup key (Gemini is stubbed
  with `page.route`), while a permanent 400 error fails immediately without retrying

## Adding tests

Drop a `*.test.mjs` file under `tests/unit/` or `tests/browser/` — `node --test`
discovers them automatically. Helpers live in `tests/helpers/` and are not treated
as tests.
