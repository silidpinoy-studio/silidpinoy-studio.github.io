/**
 * analytics-config.js — where the visitor numbers come from.
 *
 * The studio uses Umami Cloud (free Hobby plan) because it needs no server of
 * its own. The numbers are read on cloud.umami.is — the free plan has no API
 * access, so nothing here tries to call the API.
 *
 * To switch tracking on:
 *   1. Sign up at https://cloud.umami.is and add a website.
 *   2. Website domain: silidpinoy-studio.github.io
 *   3. Copy the website ID (a UUID, shown under Settings → Websites) into
 *      `websiteId` below, then run `npm run publish:sync` and deploy.
 *
 * With no `websiteId`, shared-analytics.js loads nothing and no visitor data
 * leaves the browser.
 */
window.SILID_ANALYTICS = {
  websiteId: '03747b13-c926-4225-98b4-5d5c05cdf225',
  scriptUrl: 'https://cloud.umami.is/script.js',
  siteDomain: 'silidpinoy-studio.github.io'
};
