/**
 * shared-file-utils.js — Large-file handling utilities.
 *
 * Exposes window.SilidFileUtils with:
 *   checkSourceLength(text, tool) → { truncated, warning, charCount }
 *   showTruncationWarning(tool, charCount)
 */
(function () {
  'use strict';

  var LIMITS = {
    'test-maker': 40000,
    'lesson-plan': 30000,
    'activity-sheet': 30000,
    'ppt-maker': 40000,
    'tos': 50000
  };

  /**
   * checkSourceLength — checks if source text exceeds the recommended limit.
   * @param {string} text - The source text to check
   * @param {string} tool - The tool identifier
   * @returns {{ truncated: boolean, warning: string|null, charCount: number }}
   */
  function checkSourceLength(text, tool) {
    if (!text || typeof text !== 'string') {
      return { truncated: false, warning: null, charCount: 0 };
    }
    var charCount = text.length;
    var limit = LIMITS[tool] || 30000;

    if (charCount > limit) {
      return {
        truncated: true,
        warning: 'Source material is ' + charCount.toLocaleString() + ' characters (' + Math.round(charCount / 1000) + 'K). ' +
                 'It will be truncated to fit the AI context window. Consider splitting into smaller sections.',
        charCount: charCount
      };
    }

    return { truncated: false, warning: null, charCount: charCount };
  }

  /**
   * checkPdfQuality — checks if PDF text extraction quality is poor (scanned PDF).
   * @param {string} text - Extracted text from PDF
   * @param {number} pageCount - Number of pages in the PDF
   * @returns {{ quality: 'good'|'poor', warning: string|null, charsPerPage: number }}
   */
  function checkPdfQuality(text, pageCount) {
    if (!text || !pageCount || pageCount <= 0) {
      return { quality: 'good', warning: null, charsPerPage: 0 };
    }
    var charsPerPage = Math.round(text.length / pageCount);
    if (charsPerPage < 50) {
      return {
        quality: 'poor',
        warning: 'This PDF appears to be scanned or image-based. Only ' + charsPerPage + ' characters per page were extracted. ' +
                 'Try using a text-based PDF or OCR the document first.',
        charsPerPage: charsPerPage
      };
    }
    return { quality: 'good', warning: null, charsPerPage: charsPerPage };
  }

  /**
   * warnAboutSource — runs both checks and surfaces friendly toasts.
   * @param {string} text - Extracted source text
   * @param {string} tool - The tool identifier
   * @param {number} [pageCount] - Pages actually extracted (PDF only)
   * @returns {{ charCount: number, truncated: boolean, poorPdf: boolean }}
   */
  /** Flatten an HTML fragment into text, keeping table cells/rows distinguishable. */
  function htmlToText(html) {
    var spaced = String(html || '')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(td|th)>/gi, ' | ')
      .replace(/<\/(tr|table)>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n');
    var div = document.createElement('div');
    div.innerHTML = spaced;
    return (div.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** The <body> of an HTML document, with head and trailing markup removed. */
  function htmlBody(html) {
    var afterHead = String(html || '').replace(/[\s\S]*?<body[^>]*>/i, '');
    return (afterHead || html).replace(/<\/body>[\s\S]*/i, '');
  }

  /**
   * extractLegacyDocText — reads readable text out of a legacy .doc file.
   * The flat .doc these tools export (and Word's "Web Page" save) is really HTML, so it is
   * stripped the same way a .docx fallback would be. A binary Word 97–2003 file has no
   * readable text here, so it is reported instead of dumping control characters.
   * @param {string} raw - the .doc file read as text
   * @returns {{ text: string, error?: string }}
   */
  function extractLegacyDocText(raw) {
    raw = String(raw || '');
    if (raw.charCodeAt(0) === 0xD0 && raw.charCodeAt(1) === 0xCF) {
      return { text: '', error: 'this is a binary Word 97–2003 file — re-save it as .docx and upload that.' };
    }
    var looksHtml = /<\s*(html|body|table|div|p|meta|style|h[1-6])[\s>]/i.test(raw);
    if (!looksHtml) return { text: raw.replace(/\u0000/g, '').trim() };
    return { text: htmlToText(htmlBody(raw)) };
  }

  /** Read the quoted-printable HTML chunk html-docx-js stores inside a .docx. */
  function htmlFromAfchunk(buf) {
    if (!window.JSZip) return Promise.resolve('');
    return window.JSZip.loadAsync(buf).then(function (zip) {
      var chunk = zip.file('word/afchunk.mht');
      if (!chunk) return '';
      return chunk.async('string').then(function (mht) {
        var html = String(mht || '')
          .replace(/=\r?\n/g, '')
          .replace(/=([0-9A-Fa-f]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
        return htmlToText(htmlBody(html));
      });
    })['catch'](function () { return ''; });
  }

  /**
   * extractDocxText — reads the text out of a .docx file.
   * mammoth handles ordinary Word files; a .docx exported by these tools keeps its content in
   * word/afchunk.mht as quoted-printable HTML that mammoth cannot see, so that chunk is read
   * with JSZip whenever mammoth comes up short.
   * @param {ArrayBuffer} buf - the .docx bytes
   * @returns {Promise<string>} the extracted text (possibly empty)
   */
  function extractDocxText(buf) {
    var mammothRead = window.mammoth
      ? window.mammoth.extractRawText({ arrayBuffer: buf }).then(function (r) { return (r.value || '').trim(); })['catch'](function () { return ''; })
      : Promise.resolve('');
    return mammothRead.then(function (text) {
      if (text.length >= 30) return text;
      return htmlFromAfchunk(buf).then(function (fallback) { return fallback.length > text.length ? fallback : text; });
    });
  }

  function warnAboutSource(text, tool, pageCount) {
    var charCount = (text && text.length) || 0;
    var truncated = false;
    var poorPdf = false;

    function notify(kind, msg) {
      if (window.SilidToast && typeof window.SilidToast[kind] === 'function') {
        window.SilidToast[kind](msg);
      }
    }

    if (pageCount) {
      var q = checkPdfQuality(text, pageCount);
      if (q.quality === 'poor') {
        poorPdf = true;
        notify('warning', q.warning);
      }
    }

    var len = checkSourceLength(text, tool);
    if (len.truncated) {
      truncated = true;
      notify('warning', len.warning);
    }

    return { charCount: charCount, truncated: truncated, poorPdf: poorPdf };
  }

  // ---- expose ----
  window.SilidFileUtils = {
    checkSourceLength: checkSourceLength,
    checkPdfQuality: checkPdfQuality,
    warnAboutSource: warnAboutSource,
    extractLegacyDocText: extractLegacyDocText,
    extractDocxText: extractDocxText
  };
})();
