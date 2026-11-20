/* Shared URL-hash navigation for the tool pages.
 *
 * Each page names its panes (modes, formats, the settings panel) and keeps the
 * active one in the hash, so a pane can be linked, reloaded straight into, and
 * reached with Back/Forward — the same behaviour index.html has for its views.
 *
 * pushState is used rather than assigning location.hash so the writer does not
 * also receive a hashchange; the page decides when to re-render.
 */
(function (window) {
  'use strict';

  function read() {
    return String(window.location.hash || '').replace(/^#\/?/, '');
  }

  function write(token, replace) {
    var next = token ? '#' + token : '';
    if (String(window.location.hash || '') === next) return;
    /* Absolute URLs keep file:// pages working — a path-only URL is a new origin. */
    var url = next || window.location.href.replace(/#.*$/, '');
    try {
      window.history[replace ? 'replaceState' : 'pushState']({ view: token || '' }, '', url);
    } catch (e) { /* history unavailable */ }
  }

  /* fn(token) runs on Back/Forward and on hand-edited hashes. */
  function listen(fn) {
    var run = function () { fn(read()); };
    window.addEventListener('hashchange', run);
    window.addEventListener('popstate', run);
    return function () {
      window.removeEventListener('hashchange', run);
      window.removeEventListener('popstate', run);
    };
  }

  window.SilidHashNav = { read: read, write: write, listen: listen };
})(window);
