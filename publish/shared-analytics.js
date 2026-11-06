/**
 * shared-analytics.js — loads the visitor tracker when analytics-config.js has
 * a website ID.
 *
 * Exposes window.SilidAnalytics with { enabled, websiteId, config } so the
 * owner's local insights page can tell whether tracking is switched on. With
 * no website ID configured nothing is fetched and nothing is sent.
 *
 * Version: v1 (2026-11-06)
 */
(function () {
  'use strict';

  var config = window.SILID_ANALYTICS || {};
  var websiteId = String(config.websiteId || '').trim();
  /* Umami website IDs are UUIDs; anything else is a half-finished paste. */
  var enabled = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(websiteId);

  if (enabled) {
    var script = document.createElement('script');
    script.src = config.scriptUrl || 'https://cloud.umami.is/script.js';
    script.defer = true;
    script.setAttribute('data-website-id', websiteId);
    /* Only count the real site, not local previews or file:// pages. */
    if (config.siteDomain) script.setAttribute('data-domains', config.siteDomain);
    document.head.appendChild(script);
  }

  window.SilidAnalytics = {
    enabled: enabled,
    websiteId: enabled ? websiteId : '',
    config: config
  };
})();
