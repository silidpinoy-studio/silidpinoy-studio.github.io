/**
 * shared-validate.js — Validation helpers for generated outputs.
 *
 * Exposes window.SilidValidate with:
 *   validateTestOutput(text, config) → { valid, warnings, details }
 *   validatePptSlides(slides, config) → { valid, warnings }
 *   validateActivityHtml(html) → { valid, warnings }
 *   validateLessonHtml(html) → { valid, warnings }
 */
(function () {
  'use strict';

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Fold a heading down to something comparable: case-insensitive, with dashes,
   * underscores and slashes treated as spaces. That way "Multiple-Choice",
   * "Fill_in_the_Blanks" and "T/F" all match their plain spellings.
   */
  function normaliseText(s) {
    return String(s)
      .toLowerCase()
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[-_/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Section markers per question type, in both English and Filipino. A test may
   * be written in either language (the prompt allows Filipino output), so a
   * missing marker must never be reported for a section that is actually there.
   */
  var TYPE_ALIASES = {
    'mcq': ['multiple choice', 'mcq', 'maramihang pagpipilian'],
    'multiple choice': ['multiple choice', 'mcq', 'maramihang pagpipilian'],
    'tf': ['true or false', 't/f', 'tama o mali'],
    'true or false': ['true or false', 't/f', 'tama o mali'],
    'modified tf': ['modified true or false', 'binagong tama o mali'],
    'modified true or false': ['modified true or false', 'binagong tama o mali'],
    'matching': ['matching type', 'matching', 'pagtutugma', 'pagtatambal'],
    'matching type': ['matching type', 'matching', 'pagtutugma', 'pagtatambal'],
    'blanks': ['fill in the blanks', 'fill in the blank', 'punan ang patlang', 'punan ang blangko'],
    'fill in the blanks': ['fill in the blanks', 'fill in the blank', 'punan ang patlang', 'punan ang blangko'],
    'identification': ['identification', 'pagkakakilanlan', 'kilalanin'],
    'enumeration': ['enumeration', 'pagbilang', 'isahin'],
    'analogy': ['analogy', 'analohiya'],
    'error id': ['error identification', 'pagkilala ng mali'],
    'error identification': ['error identification', 'pagkilala ng mali'],
    'constructed': ['constructed response', 'tugon'],
    'constructed response': ['constructed response', 'tugon'],
    'short answer': ['short answer', 'maikling sagot'],
    'essay': ['essay', 'sanaysay'],
    'problem solving': ['problem solving', 'paglutas ng suliranin'],
    'explanation': ['explanation', 'paliwanag'],
    'reflection': ['reflection', 'pagninilay']
  };

  var ANSWER_KEY_ALIASES = ['answer key', 'susi sa pagwawasto', 'batayan ng sagot'];

  function aliasesFor(key) {
    var k = normaliseText(key);
    return TYPE_ALIASES[k] || [k];
  }

  /**
   * Calls come from several tools, so a requested type may arrive as an id
   * ('mcq'), a label ('Multiple Choice'), or the whole type object the UI holds
   * ({ id, label, count, ... }). Normalise all of those to a lowercase id and
   * quietly drop anything unusable — validation must never break a generation.
   */
  function normaliseTypes(types) {
    if (!Array.isArray(types)) return [];
    return types.map(function (t) {
      if (typeof t === 'string') return t;
      if (t && typeof t === 'object') return String(t.id || t.name || t.label || '');
      return '';
    }).map(function (t) {
      return t.trim().toLowerCase();
    }).filter(Boolean);
  }

  var TYPE_LABELS = {
    mcq: 'Multiple Choice',
    'multiple choice': 'Multiple Choice',
    tf: 'True or False',
    modified_tf: 'Modified True or False',
    matching: 'Matching Type',
    blanks: 'Fill in the Blanks',
    identification: 'Identification',
    enumeration: 'Enumeration',
    analogy: 'Analogy',
    error_id: 'Error Identification',
    constructed: 'Constructed Response',
    short_answer: 'Short Answer',
    essay: 'Essay',
    problem_solving: 'Problem Solving',
    explanation: 'Explanation',
    reflection: 'Reflection'
  };

  /** First ~44 characters of a formula, for a warning that shows what broke. */
  function excerpt(s) {
    return s.length > 44 ? s.slice(0, 41) + '…' : s;
  }

  /** 0-based line number of `index` in `src`. */
  function lineOf(src, index) {
    var line = 0;
    for (var i = 0; i < index && i < src.length; i++) {
      if (src.charCodeAt(i) === 10) line++;
    }
    return line;
  }

  /**
   * checkMathFormatting — the Test Maker's MATH FORMATTING rules, re-checked on
   * the raw output so a model that ignores them still surfaces a warning instead
   * of a silently broken test. Pure string logic: this module also runs in Node
   * unit tests, where MathJax does not exist.
   *
   * Returns [{ message, line }] — `line` is the 0-based source line the finding
   * sits on (null when the finding is about the whole document), so the UI can
   * show the chip next to the offending item instead of only in the top banner.
   * The caller turns these into `warnings` (one string per unique message).
   *
   * Only called when the caller says math mode is on (`config.math`), so a
   * non-math test may keep prices like "$5" without being nagged.
   */
  function checkMathFormatting(text) {
    var details = [];
    var src = String(text || '');

    /* Blank a match down to spaces while keeping its newlines, so line numbers
       in the blanked text still map 1:1 onto the source. */
    var blank = function (m) { return m.replace(/[^\n]/g, ' '); };

    // 1. delimiter balance. Display pairs may span lines, so parity is tracked
    //    across the whole document; inline math never crosses a newline (the
    //    preview's own pairing forbids it), so each line is judged on its own.
    var noDisplay = src.replace(/\$\$[\s\S]*?\$\$/g, blank);
    var displayParity = 0, displayLine = -1;
    noDisplay.split('\n').forEach(function (line, i) {
      if ((line.match(/\$\$/g) || []).length % 2 === 1) {
        displayParity ^= 1;
        if (displayParity === 1) displayLine = i;
      }
    });
    if (displayParity === 1) {
      details.push({
        message: 'A $$ display formula is left unclosed — the display delimiters do not pair up.',
        line: displayLine
      });
    }
    noDisplay.split('\n').forEach(function (line, i) {
      if ((line.match(/\$/g) || []).length % 2 === 1) {
        details.push({
          message: 'A $ formula is left unclosed — the number of $ delimiters does not pair up.',
          line: i
        });
      }
    });

    // collect the spans exactly the way the preview pairs them (one alternation
    // so "$$" is never mistaken for an inline pair), each with its source line
    var spans = [];
    src.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*?\$/g, function (m, off) {
      spans.push({ raw: m, line: lineOf(src, off) });
      return m;
    });

    if (!spans.length) {
      details.push({
        message: 'Math mode is on but the output contains no $...$ formulas — the math formatting rules were ignored.',
        line: null
      });
      return details;
    }

    // 2. per-formula sanity, grouped by the line the formula starts on: braces
    //    that MathJax needs balanced to parse at all, and the "*" the prompt
    //    bans inside math (it would render as an asterisk, not a multiplication).
    var braceByLine = {}, starByLine = {};
    spans.forEach(function (sp) {
      var display = sp.raw.indexOf('$$') === 0;
      var tex = display ? sp.raw.slice(2, -2) : sp.raw.slice(1, -1);
      if ((tex.match(/{/g) || []).length !== (tex.match(/}/g) || []).length) {
        (braceByLine[sp.line] = braceByLine[sp.line] || []).push(sp.raw);
      }
      if (tex.indexOf('*') !== -1) {
        (starByLine[sp.line] = starByLine[sp.line] || []).push(sp.raw);
      }
    });
    Object.keys(braceByLine).forEach(function (line) {
      var group = braceByLine[line];
      details.push({
        message: 'A formula has unbalanced braces and will not render: ' + excerpt(group[0]) +
          (group.length > 1 ? ' (and ' + (group.length - 1) + ' more)' : ''),
        line: Number(line)
      });
    });
    Object.keys(starByLine).forEach(function (line) {
      var group = starByLine[line];
      details.push({
        message: 'An asterisk inside a formula (e.g. ' + excerpt(group[0]) +
          ') — the math rules ban * inside $...$; write multiplication as \\cdot or leave it juxtaposed.' +
          (group.length > 1 ? ' (' + group.length + ' formulas affected)' : ''),
        line: Number(line)
      });
    });

    // 3. plain-text math in the prose left behind after every span is blanked;
    //    findings that share a line share one message (and one chip)
    var prose = src.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*?\$/g, blank);
    var shorthand = [
      { label: 'exponents like x^2', re: /[A-Za-z0-9)\]]\s*\^[A-Za-z0-9{]/ },
      { label: 'bare fractions like 3/4', re: /\b\d{1,3}\s*\/\s*\d{1,3}\b/ },
      { label: 'square roots like sqrt(25) or √', re: /\bsqrt\s*\(|\u221A/ },
      { label: 'unicode superscripts or fractions like x² or ½', re: /[\u00B2\u00B3\u00B9\u2070\u2074-\u2079\u00BC-\u00BE]/ }
    ];
    var byLine = {}, lineOrder = [];
    shorthand.forEach(function (s) {
      var m = s.re.exec(prose);
      if (!m) return;
      var ln = lineOf(prose, m.index);
      if (!byLine[ln]) { byLine[ln] = []; lineOrder.push(ln); }
      byLine[ln].push(s.label);
    });
    lineOrder.forEach(function (ln) {
      details.push({
        message: 'Plain-text math outside $...$: ' + byLine[ln].join(', ') +
          ' — every formula must be LaTeX between $...$.',
        line: ln
      });
    });
    return details;
  }

  /**
   * validateTestOutput — checks that the generated test has expected structure.
   * @param {string} text - The raw Markdown output from Gemini
   * @param {object} config - { totalItems, types[], math }
   * @returns {{ valid: boolean, warnings: string[], details: Array<{message: string, line: number|null}> }}
   */
  function validateTestOutput(text, config) {
    var warnings = [];
    if (!text || typeof text !== 'string') {
      return { valid: false, warnings: ['No output received from the AI.'], details: [] };
    }
    var trimmed = text.trim();
    if (trimmed.length < 100) {
      warnings.push('The output is very short — the AI may have returned incomplete content.');
    }

    // Fold the output once so punctuation and spacing do not hide a real section
    var hay = normaliseText(trimmed);

    // Check for answer key section (English or Filipino)
    var hasAnswerKey = ANSWER_KEY_ALIASES.some(function (alias) { return hay.indexOf(alias) !== -1; });
    if (!hasAnswerKey) {
      warnings.push('No "Answer Key" section was found in the output.');
    }

    // Check for question numbers
    var numberedItems = trimmed.match(/^\s*\d+[\.\)]\s/gm) || [];
    if (numberedItems.length < 5) {
      warnings.push('Fewer than 5 numbered items detected — the output may be incomplete.');
    }

    // Check for expected question types if provided
    if (config && config.types && Array.isArray(config.types)) {
      normaliseTypes(config.types).forEach(function(t) {
        var label = TYPE_LABELS[t] || t;
        var pattern = new RegExp(aliasesFor(t).map(normaliseText).map(escapeRe).join('|'), 'i');
        if (!pattern.test(hay)) {
          warnings.push('Expected "' + label + '" section was not found.');
        }
      });
    }

    // Math mode: re-check the MATH FORMATTING rules on the raw output. The
    // banner gets one string per unique message; `details` keeps the per-line
    // findings so the preview can show each chip next to its own item.
    var details = [];
    if (config && config.math) {
      details = checkMathFormatting(text);
      details.forEach(function (d) {
        if (warnings.indexOf(d.message) === -1) warnings.push(d.message);
      });
    }

    return { valid: warnings.length === 0, warnings: warnings, details: details };
  }

  /**
   * validatePptSlides — checks that the generated slides JSON is valid.
   * @param {Array} slides - Parsed slide objects
   * @param {object} config - { minSlides }
   * @returns {{ valid: boolean, warnings: string[] }}
   */
  function validatePptSlides(slides, config) {
    var warnings = [];
    if (!slides || !Array.isArray(slides)) {
      return { valid: false, warnings: ['No slides data received from the AI.'] };
    }
    var minSlides = (config && config.minSlides) || 5;
    if (slides.length < minSlides) {
      warnings.push('Only ' + slides.length + ' slide(s) generated (expected at least ' + minSlides + ').');
    }
    slides.forEach(function(s, i) {
      if (!s.title || !s.title.trim()) {
        warnings.push('Slide ' + (i + 1) + ' has no title.');
      }
      if (!s.bullets || !Array.isArray(s.bullets) || s.bullets.length === 0) {
        warnings.push('Slide ' + (i + 1) + ' has no bullet points.');
      }
    });
    return { valid: warnings.length === 0, warnings: warnings };
  }

  /**
   * validateActivityHtml — checks that the generated activity HTML is valid.
   * @param {string} html - The raw HTML output
   * @returns {{ valid: boolean, warnings: string[] }}
   */
  function validateActivityHtml(html) {
    var warnings = [];
    if (!html || typeof html !== 'string') {
      return { valid: false, warnings: ['No activity content received from the AI.'] };
    }
    var trimmed = html.trim();
    if (trimmed.length < 200) {
      warnings.push('The activity content is very short.');
    }
    // Check for common activity sections
    var hasDirections = /direction|instruction|puntunan/gi.test(trimmed);
    var hasQuestions = /question|pangutana|item/gi.test(trimmed);
    var hasHeading = /<h[1-6]|<strong|<b/gi.test(trimmed);
    if (!hasDirections) {
      warnings.push('No directions/instructions section found.');
    }
    if (!hasQuestions) {
      warnings.push('No questions or items found.');
    }
    return { valid: warnings.length === 0, warnings: warnings };
  }

  /**
   * validateLessonHtml — checks that the generated lesson HTML is valid.
   * @param {string} html - The raw HTML output
   * @returns {{ valid: boolean, warnings: string[] }}
   */
  function validateLessonHtml(html) {
    var warnings = [];
    if (!html || typeof html !== 'string') {
      return { valid: false, warnings: ['No lesson content received from the AI.'] };
    }
    var trimmed = html.trim();
    if (trimmed.length < 300) {
      warnings.push('The lesson content is very short.');
    }
    var hasObjectives = /objective|layunin|goal/gi.test(trimmed);
    var hasContent = /content|nilalaman|topic/gi.test(trimmed);
    var hasHeading = /<h[1-6]|<strong|<b/gi.test(trimmed);
    if (!hasObjectives) {
      warnings.push('No objectives/goals section found.');
    }
    if (!hasContent) {
      warnings.push('No content/topic section found.');
    }
    return { valid: warnings.length === 0, warnings: warnings };
  }

  // ---- expose ----
  window.SilidValidate = {
    validateTestOutput: validateTestOutput,
    validatePptSlides: validatePptSlides,
    validateActivityHtml: validateActivityHtml,
    validateLessonHtml: validateLessonHtml
  };
})();
