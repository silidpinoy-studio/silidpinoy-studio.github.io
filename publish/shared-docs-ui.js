/**
 * shared-docs-ui.js — "My Documents" drawer for all SilidPinoy tools.
 *
 * Backed by window.SilidDocs (shared-docs.js) and window.SilidToast (shared-toast.js).
 *
 * Usage (vanilla or React pages):
 *   window.SilidDocsUI.mount({ tool: 'lesson-plan', label: 'Lesson Plan' });
 *   window.SilidDocsUI.onOpen(function (doc) { ...restore doc.content... });
 *   window.SilidDocsUI.save({ name, content, summary, meta });
 *
 * The button is injected into the first element carrying [data-silid-docs-slot].
 * If no slot exists, a floating button is appended to <body> so nothing breaks.
 *
 * Exposes: window.SilidDocsUI
 */
(function () {
  'use strict';

  var TOOL_LABELS = {
    'test-maker': 'Test',
    'tos': 'TOS',
    'lesson-plan': 'Lesson Plan',
    'ppt-maker': 'Presentation',
    'activity-sheet': 'Activity Sheet'
  };

  var state = {
    tool: null,
    label: '',
    docs: [],
    mounted: false,
    open: false,
    onOpenHandlers: [],
    panel: null,
    listEl: null,
    countEl: null,
    button: null
  };

  /* ---------------------------------------------------------------
     helpers
     --------------------------------------------------------------- */

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch (_) { return ''; }
  }

  function toast(kind, msg) {
    var fn = window.SilidToast && window.SilidToast[kind];
    if (typeof fn === 'function') fn.call(window.SilidToast, msg);
  }

  function defaultName() {
    var stamp = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return (TOOL_LABELS[state.tool] || 'Document') + ' — ' + stamp;
  }

  /* ---------------------------------------------------------------
     DOM construction
     --------------------------------------------------------------- */

  function buildButton() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'My Documents';
    btn.setAttribute('aria-label', 'Open my documents');
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:0.4rem;border:0;cursor:pointer;' +
      'border-radius:9999px;background:rgba(255,255,255,0.9);box-shadow:0 1px 2px rgba(0,0,0,0.06);' +
      'padding:0.55rem 0.9rem;font:600 0.8rem/1 "Plus Jakarta Sans",system-ui,sans-serif;color:#3f3a52;';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>' +
      '<span>My Documents</span><span data-docs-count style="display:none;min-width:1.1rem;height:1.1rem;' +
      'border-radius:9999px;background:#5B46E8;color:#fff;font-size:0.65rem;line-height:1.1rem;text-align:center;padding:0 0.25rem;"></span>';
    btn.addEventListener('click', function () { state.open ? close() : open(); });
    return btn;
  }

  function buildPanel() {
    var backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(11,10,18,0.35);' +
      'opacity:0;pointer-events:none;transition:opacity .25s ease;';

    var panel = document.createElement('aside');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'My documents');
    panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;z-index:9999;width:23rem;max-width:92vw;' +
      'background:#fff;box-shadow:-24px 0 60px -30px rgba(11,10,18,0.45);display:flex;flex-direction:column;' +
      'transform:translateX(100%);transition:transform .3s cubic-bezier(0.22,1,0.36,1);' +
      'font-family:"Plus Jakarta Sans",system-ui,sans-serif;';

    panel.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:1.1rem 1.25rem;border-bottom:1px solid rgba(0,0,0,0.06);">' +
        '<div><p style="margin:0;font-size:0.7rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(11,10,18,0.4);">My Documents</p>' +
        '<p data-docs-subtitle style="margin:0.15rem 0 0;font-size:0.9rem;font-weight:600;color:#0B0A12;"></p></div>' +
        '<button type="button" data-docs-close aria-label="Close" style="border:0;background:rgba(0,0,0,0.05);border-radius:9999px;width:2rem;height:2rem;cursor:pointer;font-size:1rem;line-height:1;color:#0B0A12;">&times;</button>' +
      '</div>' +
      '<div data-docs-list style="flex:1;overflow-y:auto;padding:1rem 1.25rem;display:flex;flex-direction:column;gap:0.6rem;"></div>';

    backdrop.addEventListener('click', close);
    panel.querySelector('[data-docs-close]').addEventListener('click', close);

    var wrap = document.createElement('div');
    /* Pages hide this root when printing so the drawer never lands on paper. */
    wrap.id = 'silid-docs-root';
    wrap.appendChild(backdrop);
    wrap.appendChild(panel);
    document.body.appendChild(wrap);
    return { backdrop: backdrop, panel: panel };
  }

  function itemHtml(doc) {
    return '' +
      '<div data-docs-item style="border:1px solid rgba(0,0,0,0.07);border-radius:0.9rem;padding:0.75rem 0.85rem;background:#fff;">' +
        '<div style="display:flex;align-items:flex-start;gap:0.5rem;">' +
          '<div style="flex:1;min-width:0;">' +
            '<p data-docs-name style="margin:0;font-size:0.85rem;font-weight:600;color:#0B0A12;word-break:break-word;"></p>' +
            '<p style="margin:0.15rem 0 0;font-size:0.7rem;color:rgba(11,10,18,0.45);">' + esc(fmtDate(doc.createdAt)) + '</p>' +
          '</div>' +
        '</div>' +
        '<div data-docs-actions style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.6rem;"></div>' +
      '</div>';
  }

  function actionBtn(label, kind) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    var color = kind === 'danger' ? '#b91c1c' : kind === 'primary' ? '#4632C9' : '#3f3a52';
    var bg = kind === 'danger' ? 'rgba(185,28,28,0.08)' : kind === 'primary' ? 'rgba(91,70,232,0.1)' : 'rgba(0,0,0,0.05)';
    b.style.cssText = 'border:0;cursor:pointer;border-radius:9999px;padding:0.3rem 0.65rem;' +
      'font:600 0.7rem/1 "Plus Jakarta Sans",system-ui,sans-serif;color:' + color + ';background:' + bg + ';';
    return b;
  }

  function renderList() {
    var list = state.listEl;
    if (!list) return;
    list.innerHTML = '';

    if (!state.docs.length) {
      list.innerHTML = '<p style="margin:2rem 0;text-align:center;font-size:0.82rem;color:rgba(11,10,18,0.45);">' +
        'No saved documents yet.<br>Generated ' + esc(state.label || 'documents') + ' will appear here.</p>';
      if (state.countEl) state.countEl.style.display = 'none';
      return;
    }

    if (state.countEl) {
      state.countEl.style.display = 'inline-block';
      state.countEl.textContent = String(state.docs.length);
    }

    state.docs.forEach(function (doc) {
      var wrap = document.createElement('div');
      wrap.innerHTML = itemHtml(doc);
      var node = wrap.firstChild;
      node.querySelector('[data-docs-name]').textContent = doc.name || 'Untitled';

      var actions = node.querySelector('[data-docs-actions]');

      var openBtn = actionBtn('Open', 'primary');
      openBtn.addEventListener('click', function () { openDoc(doc); });
      actions.appendChild(openBtn);

      var renameBtn = actionBtn('Rename');
      renameBtn.addEventListener('click', function () { startRename(node, doc); });
      actions.appendChild(renameBtn);

      var dupBtn = actionBtn('Duplicate');
      dupBtn.addEventListener('click', function () { duplicateDoc(doc); });
      actions.appendChild(dupBtn);

      var delBtn = actionBtn('Delete', 'danger');
      var armed = false;
      delBtn.addEventListener('click', function () {
        if (!armed) {
          armed = true;
          delBtn.textContent = 'Confirm delete';
          setTimeout(function () { if (armed) { armed = false; delBtn.textContent = 'Delete'; } }, 4000);
          return;
        }
        deleteDoc(doc);
      });
      actions.appendChild(delBtn);

      list.appendChild(node);
    });
  }

  function startRename(node, doc) {
    var nameEl = node.querySelector('[data-docs-name]');
    var input = document.createElement('input');
    input.type = 'text';
    input.value = doc.name || '';
    input.style.cssText = 'width:100%;border:1px solid rgba(91,70,232,0.4);border-radius:0.5rem;' +
      'padding:0.3rem 0.45rem;font:600 0.82rem "Plus Jakarta Sans",system-ui,sans-serif;';
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    var done = false;
    function commit(save) {
      if (done) return;
      done = true;
      var value = input.value.trim();
      if (!save || !value || value === doc.name) { renderList(); return; }
      window.SilidDocs.updateDocument(doc.id, { name: value }).then(function () {
        toast('success', 'Renamed.');
        refresh();
      }).catch(function (e) { toast('error', 'Could not rename: ' + e.message); renderList(); });
    }
    input.addEventListener('blur', function () { commit(true); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(true); }
      else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
    });
  }

  function openDoc(doc) {
    if (!state.onOpenHandlers.length) {
      toast('warning', 'This tool cannot open saved documents on this page yet.');
      return;
    }
    state.onOpenHandlers.forEach(function (fn) {
      try { fn(doc); } catch (e) { toast('error', 'Could not open document: ' + e.message); }
    });
    close();
  }

  function duplicateDoc(doc) {
    window.SilidDocs.saveDocument({
      tool: doc.tool,
      name: (doc.name || 'Untitled') + ' (copy)',
      content: doc.content,
      summary: doc.summary,
      meta: doc.meta
    }).then(function () {
      toast('success', 'Duplicated.');
      refresh();
    }).catch(function (e) { toast('error', 'Could not duplicate: ' + e.message); });
  }

  function deleteDoc(doc) {
    window.SilidDocs.deleteDocument(doc.id).then(function () {
      state.docs = state.docs.filter(function (d) { return d.id !== doc.id; });
      toast('success', 'Deleted.');
      renderList();
    }).catch(function (e) { toast('error', 'Could not delete: ' + e.message); });
  }

  /* ---------------------------------------------------------------
     panel open / close
     --------------------------------------------------------------- */

  function setOpen(open) {
    if (!state.panel) return;
    state.open = open;
    state.panel.panel.style.transform = open ? 'translateX(0)' : 'translateX(100%)';
    state.panel.backdrop.style.opacity = open ? '1' : '0';
    state.panel.backdrop.style.pointerEvents = open ? 'auto' : 'none';
    if (open) { refresh(); syncSubtitle(); }
  }

  function syncSubtitle() {
    var sub = state.panel && state.panel.panel.querySelector('[data-docs-subtitle]');
    if (sub) sub.textContent = state.label || 'Saved documents';
  }

  function open() { setOpen(true); }
  function close() { setOpen(false); }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.open) close();
  });

  /* ---------------------------------------------------------------
     data
     --------------------------------------------------------------- */

  function refresh() {
    if (!window.SilidDocs) return Promise.resolve([]);
    return window.SilidDocs.getDocuments(state.tool).then(function (docs) {
      state.docs = docs || [];
      renderList();
      return state.docs;
    }).catch(function (e) {
      // the drawer would otherwise look empty and hide a broken document store
      console.warn('Could not read saved documents:', e);
      return [];
    });
  }

  /**
   * save({ tool?, name?, content, summary?, meta? }) → Promise<id|null>
   */
  function save(opts) {
    opts = opts || {};
    if (!window.SilidDocs) return Promise.resolve(null);
    if (!opts.content) return Promise.resolve(null);

    var doc = {
      tool: opts.tool || state.tool,
      name: opts.name || defaultName(),
      content: opts.content,
      summary: opts.summary || '',
      meta: opts.meta || {}
    };

    return window.SilidDocs.saveDocument(doc).then(function (id) {
      if (state.mounted) refresh();
      return id;
    }).catch(function (e) {
      toast('error', 'Could not save document: ' + e.message);
      return null;
    });
  }

  function onOpen(cb) {
    if (typeof cb === 'function') state.onOpenHandlers.push(cb);
  }

  /**
   * mount({ tool, label?, slot? })
   *   tool  — one of test-maker | tos | lesson-plan | ppt-maker | activity-sheet
   *   label — human label shown in the drawer header
   *   slot  — optional selector for the container to inject the button into
   */
  function mount(opts) {
    opts = opts || {};
    state.tool = opts.tool || state.tool;
    state.label = opts.label || TOOL_LABELS[state.tool] || 'Documents';
    if (state.mounted) return api;

    state.button = buildButton();
    var slotEl = document.querySelector(opts.slot || '[data-silid-docs-slot]');
    if (slotEl) {
      slotEl.appendChild(state.button);
    } else {
      state.button.style.position = 'fixed';
      state.button.style.bottom = '1.25rem';
      state.button.style.right = '1.25rem';
      state.button.style.zIndex = '9990';
      document.body.appendChild(state.button);
    }
    state.countEl = state.button.querySelector('[data-docs-count]');

    state.panel = buildPanel();
    state.listEl = state.panel.panel.querySelector('[data-docs-list]');
    state.mounted = true;
    syncSubtitle();
    refresh();

    return api;
  }

  var api = {
    mount: mount,
    save: save,
    onOpen: onOpen,
    refresh: refresh,
    open: open,
    close: close
  };

  window.SilidDocsUI = api;
})();
