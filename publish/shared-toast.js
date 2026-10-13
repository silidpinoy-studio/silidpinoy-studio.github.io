/**
 * shared-toast.js — Inline toast notifications replacing alert() calls.
 *
 * Exposes window.SilidToast with:
 *   show(message, type?, duration?)
 *   success(message, duration?)
 *   error(message, duration?)
 *   warning(message, duration?)
 *   info(message, duration?)
 */
(function () {
  'use strict';

  var container = null;
  var queue = [];
  var MAX_VISIBLE = 3;

  function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.id = 'silid-toast-container';
    container.style.cssText = 'position:fixed;top:1.5rem;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:0.5rem;pointer-events:none;max-width:90vw;width:28rem;';
    document.body.appendChild(container);
    return container;
  }

  var STYLES = {
    success: { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46', icon: '✓' },
    error:   { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', icon: '✕' },
    warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', icon: '⚠' },
    info:    { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', icon: 'ℹ' }
  };

  function show(message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;
    var style = STYLES[type] || STYLES.info;

    var toast = document.createElement('div');
    toast.style.cssText = 'pointer-events:auto;display:flex;align-items:flex-start;gap:0.75rem;padding:0.875rem 1.25rem;border-radius:0.75rem;box-shadow:0 10px 25px -5px rgba(0,0,0,0.15);font-size:0.875rem;line-height:1.4;transition:all 0.3s ease;opacity:0;transform:translateY(-0.5rem);cursor:pointer;';
    toast.style.backgroundColor = style.bg;
    toast.style.borderLeft = '4px solid ' + style.border;
    toast.style.color = style.text;

    toast.innerHTML = '<span style="font-size:1rem;font-weight:600;">' + style.icon + '</span><span style="flex:1;">' + message + '</span>';

    toast.addEventListener('click', function () { removeToast(toast); });

    var c = ensureContainer();
    c.appendChild(toast);

    // Animate in
    requestAnimationFrame(function () {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    // Auto-remove
    if (duration > 0) {
      setTimeout(function () { removeToast(toast); }, duration);
    }

    return toast;
  }

  function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-0.5rem)';
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }

  function success(msg, dur) { return show(msg, 'success', dur); }
  function error(msg, dur) { return show(msg, 'error', dur || 6000); }
  function warning(msg, dur) { return show(msg, 'warning', dur || 5000); }
  function info(msg, dur) { return show(msg, 'info', dur); }

  // ---- expose ----
  window.SilidToast = {
    show: show,
    success: success,
    error: error,
    warning: warning,
    info: info
  };
})();
