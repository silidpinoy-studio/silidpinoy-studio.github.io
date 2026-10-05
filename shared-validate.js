/**
 * shared-validate.js — Validation helpers for generated outputs.
 *
 * Exposes window.SilidValidate with:
 *   validateTestOutput(text, config) → { valid, warnings }
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

  /**
   * validateTestOutput — checks that the generated test has expected structure.
   * @param {string} text - The raw Markdown output from Gemini
   * @param {object} config - { totalItems, types[] }
   * @returns {{ valid: boolean, warnings: string[] }}
   */
  function validateTestOutput(text, config) {
    var warnings = [];
    if (!text || typeof text !== 'string') {
      return { valid: false, warnings: ['No output received from the AI.'] };
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

    return { valid: warnings.length === 0, warnings: warnings };
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
