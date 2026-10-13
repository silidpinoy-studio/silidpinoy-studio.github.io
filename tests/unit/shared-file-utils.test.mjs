import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, fakeToast, plain } from '../helpers/sandbox.mjs';

test('checkSourceLength passes short text through untouched', () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js');
  const r = SilidFileUtils.checkSourceLength('hello world', 'lesson-plan');
  assert.deepEqual(plain(r), { truncated: false, warning: null, charCount: 11 });
});

test('checkSourceLength flags text above the per-tool limit', () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js');
  const text = 'a'.repeat(30001);
  const r = SilidFileUtils.checkSourceLength(text, 'lesson-plan'); // limit 30,000
  assert.equal(r.truncated, true);
  assert.equal(r.charCount, 30001);
  assert.match(r.warning, /truncated to fit the AI context window/i);
});

test('checkSourceLength honours each tool limit and the 30k default', () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js');

  // tos allows 50k, so 40k is fine there
  assert.equal(SilidFileUtils.checkSourceLength('a'.repeat(40000), 'tos').truncated, false);
  // test-maker allows 40k
  assert.equal(SilidFileUtils.checkSourceLength('a'.repeat(40000), 'test-maker').truncated, false);
  assert.equal(SilidFileUtils.checkSourceLength('a'.repeat(40001), 'test-maker').truncated, true);
  // unknown tool falls back to 30k
  assert.equal(SilidFileUtils.checkSourceLength('a'.repeat(30001), 'mystery-tool').truncated, true);
});

test('checkSourceLength tolerates non-strings', () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js');
  for (const value of [null, undefined, 42, {}]) {
    assert.deepEqual(plain(SilidFileUtils.checkSourceLength(value, 'tos')), {
      truncated: false, warning: null, charCount: 0
    });
  }
});

test('checkPdfQuality flags scanned / image-only PDFs', () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js');
  const r = SilidFileUtils.checkPdfQuality('x'.repeat(100), 20); // 5 chars per page
  assert.equal(r.quality, 'poor');
  assert.equal(r.charsPerPage, 5);
  assert.match(r.warning, /scanned or image-based/i);
});

test('checkPdfQuality accepts text-based PDFs', () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js');
  const r = SilidFileUtils.checkPdfQuality('x'.repeat(2000), 10); // 200 chars per page
  assert.deepEqual(plain(r), { quality: 'good', warning: null, charsPerPage: 200 });
});

test('checkPdfQuality is a no-op without a page count', () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js');
  for (const pages of [0, null, undefined]) {
    assert.equal(SilidFileUtils.checkPdfQuality('some text', pages).quality, 'good');
  }
});

test('warnAboutSource stays silent for healthy sources', () => {
  const toast = fakeToast();
  const { SilidFileUtils } = loadModule('shared-file-utils.js', { SilidToast: toast.SilidToast });
  const r = SilidFileUtils.warnAboutSource('a short, healthy source', 'lesson-plan');
  assert.deepEqual(plain(r), { charCount: 23, truncated: false, poorPdf: false });
  assert.equal(toast.calls.length, 0);
});

test('warnAboutSource raises a warning toast for oversized sources', () => {
  const toast = fakeToast();
  const { SilidFileUtils } = loadModule('shared-file-utils.js', { SilidToast: toast.SilidToast });
  const r = SilidFileUtils.warnAboutSource('a'.repeat(31000), 'lesson-plan');
  assert.equal(r.truncated, true);
  assert.equal(r.poorPdf, false);
  assert.equal(toast.calls.length, 1);
  assert.equal(toast.calls[0].kind, 'warning');
});

test('warnAboutSource raises a warning toast for scanned PDFs', () => {
  const toast = fakeToast();
  const { SilidFileUtils } = loadModule('shared-file-utils.js', { SilidToast: toast.SilidToast });
  const r = SilidFileUtils.warnAboutSource('tiny', 'activity-sheet', 40);
  assert.equal(r.poorPdf, true);
  assert.equal(toast.calls.length, 1);
  assert.match(toast.calls[0].message, /scanned or image-based/i);
});

test('warnAboutSource survives a missing toast module', () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js'); // no SilidToast
  assert.equal(SilidFileUtils.warnAboutSource('a'.repeat(31000), 'lesson-plan').truncated, true);
});

/* ---- legacy .doc extraction ---- */

/** Minimal DOM stand-in: enough for createElement('div').textContent to work. */
function fakeDocument() {
  return {
    createElement() {
      return {
        innerHTML: '',
        get textContent() {
          return String(this.innerHTML)
            .replace(/<[^>]*>/g, '')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
        }
      };
    }
  };
}

test('extractLegacyDocText rejects a binary Word 97-2003 file', () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js');
  const raw = String.fromCharCode(0xD0, 0xCF, 0x11, 0xE0) + 'garbage';
  const r = SilidFileUtils.extractLegacyDocText(raw);
  assert.equal(r.text, '');
  assert.match(r.error, /binary Word 97/i);
});

test('extractLegacyDocText passes plain text through untouched', () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js');
  assert.deepEqual(plain(SilidFileUtils.extractLegacyDocText('  just some notes\n  ')), { text: 'just some notes' });
});

test('extractLegacyDocText strips an HTML (.doc) export into readable text', () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js', { document: fakeDocument() });
  const html = '<html><head><style>td{color:red}</style></head><body>'
    + '<table><tr><td>Discuss values</td><td>5</td><td>3</td></tr>'
    + '<tr><td>Perform a task</td><td>2</td><td>1</td></tr></table></body></html>';
  const r = SilidFileUtils.extractLegacyDocText(html);
  assert.equal(r.error, undefined);
  assert.match(r.text, /Discuss values \| 5 \| 3/);
  assert.match(r.text, /Perform a task \| 2 \| 1/);
  assert.ok(!/color:red|<td>/.test(r.text), 'tags and styles must not survive');
});

test('extractLegacyDocText tolerates empty input', () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js', { document: fakeDocument() });
  for (const value of [null, undefined, '']) {
    assert.deepEqual(plain(SilidFileUtils.extractLegacyDocText(value)), { text: '' });
  }
});

/* ---- .docx extraction ---- */

const MHT = 'Content-Type: text/html\r\n\r\n'
  + '<html><body><table><tr><td>Learning Area</td><td>Science 7</td></tr>'
  + '<tr><td>Competency</td><td>Explain the water cycle</td></tr></table></body></html>';

function fakeZip(withChunk = true) {
  return {
    loadAsync: () => Promise.resolve({
      file: (name) => (withChunk && name === 'word/afchunk.mht' ? { async: () => Promise.resolve(MHT) } : null)
    })
  };
}

test('extractDocxText uses mammoth when it reads a real Word file', async () => {
  const long = 'Word file text '.repeat(4);
  const { SilidFileUtils } = loadModule('shared-file-utils.js', {
    document: fakeDocument(),
    mammoth: { extractRawText: () => Promise.resolve({ value: long }) },
    JSZip: { loadAsync: () => { throw new Error('JSZip should not be needed'); } }
  });
  assert.equal(await SilidFileUtils.extractDocxText(new ArrayBuffer(0)), long.trim());
});

test('extractDocxText falls back to the html-docx chunk when mammoth reads little', async () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js', {
    document: fakeDocument(),
    mammoth: { extractRawText: () => Promise.resolve({ value: 'too short' }) },
    JSZip: fakeZip()
  });
  const text = await SilidFileUtils.extractDocxText(new ArrayBuffer(0));
  assert.match(text, /Learning Area \| Science 7/);
  assert.match(text, /Competency \| Explain the water cycle/);
});

test('extractDocxText survives a missing mammoth library', async () => {
  const { SilidFileUtils } = loadModule('shared-file-utils.js', {
    document: fakeDocument(),
    JSZip: fakeZip(false)
  });
  assert.equal(await SilidFileUtils.extractDocxText(new ArrayBuffer(0)), '');
});
