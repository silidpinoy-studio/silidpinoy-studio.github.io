/**
 * The single source of truth for what gets published.
 *
 * `publish/` is a snapshot of the site that gets uploaded to GitHub Pages, and
 * `tests/browser/subpath.test.mjs` serves that snapshot from a subpath. Both the
 * sync script and the test read this list, so the two can never disagree about
 * what the deploy payload contains.
 */

/** The pages of the app. */
export const PAGES = [
  'index.html',
  'lesson.html',
  'activity.html',
  'powerpoint.html',
  'tos.html'
];

/** Everything copied straight from the project root into `publish/`. */
export const PAYLOAD = PAGES.concat([
  'shared-api.js',
  'shared-keys.js',
  'shared-backup.js',
  'shared-validate.js',
  'shared-docs.js',
  'shared-docs-ui.js',
  'shared-file-utils.js',
  'shared-toast.js',
  'deped-options.js',
  'favicon.svg',
  'apple-touch-icon.png',
  'layout.html',
  'app.js',
  'shared-icons.js',
  'sw.js',
  'manifest.webmanifest'
]);

/** Files that document the deploy payload itself, and so live only in `publish/`. */
export const PUBLISH_ONLY = ['PUBLISH.md', 'README.md', '.nojekyll'];

/** Deliberately not published: test harness, dev notes, and the npm manifest. */
export const EXCLUDED = [
  'tests',
  'node_modules',
  'package.json',
  'package-lock.json',
  'blueprint.txt',
  'script.md',
  'implementation_plan.md',
  'TOS _MAKER APP.txt'
];
