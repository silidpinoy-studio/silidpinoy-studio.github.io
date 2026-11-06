/**
 * analytics-config.js — where the visitor numbers come from.
 *
 * The studio uses Umami Cloud (free Hobby plan) because it needs no server of
 * its own and its API can be read straight from a static page.
 *
 * To switch tracking on:
 *   1. Sign up at https://cloud.umami.is and add a website.
 *   2. Website domain: silidpinoy-studio.github.io
 *   3. Copy the website ID (a UUID, shown under Settings → Websites) into
 *      `websiteId` below, then run `npm run publish:sync` and deploy.
 *
 * With no `websiteId`, shared-analytics.js loads nothing and no visitor data
 * leaves the browser.
 *
 * The insights page is intentionally not deployed: it is left out of the
 * publish payload and the service-worker cache, so it lives only in the repo
 * and on the owner's machine. It never contains an API key — it asks for one
 * on whichever device opens it.
 */
window.SILID_ANALYTICS = {
  websiteId: '03747b13-c926-4225-98b4-5d5c05cdf225',
  scriptUrl: 'https://cloud.umami.is/script.js',
  apiBase: 'https://api.umami.is/v1',
  siteDomain: 'silidpinoy-studio.github.io'
};
