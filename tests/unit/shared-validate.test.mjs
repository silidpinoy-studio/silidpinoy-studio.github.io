import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, plain } from '../helpers/sandbox.mjs';

const { SilidValidate } = loadModule('shared-validate.js');

const GOOD_TEST = [
  '## Multiple Choice',
  '1. Which organelle makes food?',
  '2. What gas do plants take in?',
  '3. Where does photosynthesis happen?',
  '## True or False',
  '4. Plants need sunlight.',
  '5. Chlorophyll is green.',
  '6. Roots make food.',
  '## Answer Key',
  '1. A   2. B   3. C   4. True   5. True   6. False'
].join('\n');

const GOOD_ACTIVITY = '<h1>Activity: Sink or Float</h1>' +
  '<p>Directions: Read each item carefully then answer below. Work with your partner ' +
  'and write your answers on the space provided. Use the materials given by your teacher.</p>' +
  '<ol><li>Item one: describe what happens.</li><li>Item two: explain your answer.</li></ol>' +
  '<p>Remember to check your work before submitting it to your teacher at the end of the period.</p>';

const GOOD_LESSON = '<h1>Lesson Plan</h1>' +
  '<h2>Objectives</h2><p>At the end of the lesson the learners should be able to explain ' +
  'the content of the topic and demonstrate understanding through guided practice with peers.</p>' +
  '<h2>Content</h2><p>The topic covers the water cycle, including evaporation, condensation and ' +
  'precipitation, with examples drawn from everyday life in the Philippines for grade seven learners.</p>';

test('validateTestOutput accepts a complete, well-formed test', () => {
  const r = SilidValidate.validateTestOutput(GOOD_TEST, { types: ['mcq', 'tf'] });
  assert.equal(r.valid, true, r.warnings.join(' | '));
  assert.deepEqual(plain(r.warnings), []);
});

test('validateTestOutput rejects empty input', () => {
  const r = SilidValidate.validateTestOutput('', {});
  assert.equal(r.valid, false);
  assert.match(r.warnings[0], /No output received/i);
});

test('validateTestOutput flags a missing answer key and too few items', () => {
  const r = SilidValidate.validateTestOutput('Step one. Step two. Step three.', {});
  assert.equal(r.valid, false);
  assert.ok(r.warnings.some((w) => /Answer Key/i.test(w)));
  assert.ok(r.warnings.some((w) => /Fewer than 5 numbered items/i.test(w)));
});

test('validateTestOutput flags "Which of the following" stems', () => {
  const weak = GOOD_TEST.replace('1. Which organelle makes food?',
    '1. Which of the following organelles makes food?');
  const r = SilidValidate.validateTestOutput(weak, { types: ['mcq', 'tf'] });
  assert.equal(r.valid, false);
  assert.ok(r.warnings.some((w) => /Which of the following.*stem/i.test(w)), r.warnings.join(' | '));
});

test('validateTestOutput flags "Alin sa mga sumusunod" stems', () => {
  const weakFil = GOOD_TEST.replace('1. Which organelle makes food?',
    '1. Alin sa mga sumusunod ang gumagawa ng pagkain?');
  const r = SilidValidate.validateTestOutput(weakFil, { types: ['mcq', 'tf'] });
  assert.equal(r.valid, false);
  assert.ok(r.warnings.some((w) => /Which of the following.*stem/i.test(w)), r.warnings.join(' | '));
});

test('validateTestOutput counts every weak stem in one warning', () => {
  const weak = GOOD_TEST
    .replace('1. Which organelle makes food?', '1. Which of the following makes food?')
    .replace('2. What gas do plants take in?', '2. Alin sa mga sumusunod ang sinisinga ng halaman?');
  const r = SilidValidate.validateTestOutput(weak, { types: ['mcq', 'tf'] });
  const w = r.warnings.find((s) => /Which of the following.*stem/i.test(s));
  assert.ok(w, r.warnings.join(' | '));
  assert.ok(w.includes('2 '), w);
});

test('validateTestOutput flags a stem set that is almost all "Which"', () => {
  const allWhich = [
    '## Multiple Choice',
    '1. Which organelle makes food?',
    '2. Which gas do plants take in?',
    '3. Which part controls the cell?',
    '4. Which pigment traps sunlight?',
    '5. Which structure protects the leaf?',
    '## Answer Key',
    '1. A   2. B   3. C   4. D   5. A'
  ].join('\n');
  const r = SilidValidate.validateTestOutput(allWhich, { types: ['mcq'] });
  assert.equal(r.valid, false);
  assert.ok(r.warnings.some((w) => /Stem variety: 5 of 5/.test(w)), r.warnings.join(' | '));
});

test('validateTestOutput does not flag a varied stem set', () => {
  const r = SilidValidate.validateTestOutput(GOOD_TEST, { types: ['mcq', 'tf'] });
  assert.ok(!r.warnings.some((w) => /Stem variety/i.test(w)), r.warnings.join(' | '));
});

test('validateTestOutput flags a requested type whose markers are absent', () => {

  // The type check is keyword-based, matching the section heading in English or
  // Filipino (see TYPE_ALIASES), so it fires only when none of a type's markers
  // appear at all.
  const blanksOnly = [
    '## Fill in the Blanks',
    '1. Water is a ______ at room temperature.',
    '2. Ice is the ______ form of water.',
    '3. Water vapour is a ______.',
    '4. Clouds form by ______ of vapour.',
    '5. Rain falls as ______ from the clouds.',
    '## Answer Key',
    '1. liquid   2. solid   3. gas   4. condensation   5. precipitation'
  ].join('\n');

  const r = SilidValidate.validateTestOutput(blanksOnly, { types: ['mcq'] });
  assert.equal(r.valid, false);
  assert.deepEqual(plain(r.warnings), ['Expected "Multiple Choice" section was not found.']);

  // and the reverse: the same markers satisfy other requested types too
  const tf = SilidValidate.validateTestOutput(GOOD_TEST, { types: ['mcq', 'tf'] });
  assert.equal(tf.valid, true, tf.warnings.join(' | '));
});

test('validateTestOutput accepts Filipino section headings', () => {
  // Regression: the Test Maker may generate a Filipino test, which used to trip
  // "Expected Multiple Choice / Fill in the Blanks / Answer Key" false alarms.
  const filipino = [
    '## I. Maramihang Pagpipilian',
    '1. Alin ang gumagawa ng pagkain?',
    '2. Anong gas ang tinatanggap ng halaman?',
    '3. Saan nagaganap ang photosynthesis?',
    '4. Aling pigmento ang berde?',
    '5. Ano ang sinisipsip ng ugat?',
    '## II. Punan ang Patlang',
    '6. Ang tubig ay ______ sa temperatura ng silid.',
    '## Susi sa Pagwawasto',
    '1. A   2. B   3. C   4. D   5. A   6. likido'
  ].join('\n');
  const r = SilidValidate.validateTestOutput(filipino, { types: ['mcq', 'blanks'] });
  assert.equal(r.valid, true, r.warnings.join(' | '));
  assert.deepEqual(plain(r.warnings), []);
});

test('validateTestOutput accepts hyphenated English section headings', () => {
  const hyphenated = [
    '## Multiple-Choice Section',
    '1. Which organelle makes food?',
    '2. What gas do plants take in?',
    '3. Where does photosynthesis happen?',
    '4. Which pigment is green?',
    '5. What do roots absorb?',
    '## Fill-in-the-Blanks',
    '6. Water is a ______ at room temperature.',
    '## Answer-Key',
    '1. A   2. B   3. C   4. D   5. A   6. liquid'
  ].join('\n');
  const r = SilidValidate.validateTestOutput(hyphenated, { types: ['mcq', 'blanks'] });
  assert.equal(r.valid, true, r.warnings.join(' | '));
  assert.deepEqual(plain(r.warnings), []);
});

test('validateTestOutput accepts the whole type objects the Test Maker holds', () => {
  // Regression: index.html passes its selected types as objects ({ id, label,
  // count, ... }), which used to throw "t.toLowerCase is not a function" and
  // lose an already-generated test.
  const selected = [
    { id: 'mcq', label: 'Multiple Choice (MCQ)', selected: true, count: 5, style: 'regular' },
    { id: 'tf', label: 'True or False', selected: true, count: 5, style: undefined }
  ];
  const r = SilidValidate.validateTestOutput(GOOD_TEST, { types: selected });
  assert.equal(r.valid, true, r.warnings.join(' | '));
  assert.deepEqual(plain(r.warnings), []);
});

test('validateTestOutput maps a type object to its label for the warning text', () => {
  const r = SilidValidate.validateTestOutput('# Nothing here', { types: [{ id: 'mcq', label: 'Multiple Choice (MCQ)' }] });
  assert.ok(r.warnings.includes('Expected "Multiple Choice" section was not found.'), r.warnings.join(' | '));
});

/* ---- Early Learners (K-3) activity types (the K-3 Test Maker activities) ---- */

const K3_TEST = [
  '## Picture Multiple Choice',
  '1. Which one is a cat? 🐱',
  '   A) 🐶', '   B) 🐱', '   C) 🐰',
  '2. What color is the apple? 🍎',
  '   A) 🔴', '   B) 🔵', '   C) 🟢',
  "## Part 1: Let's Count! 🔢",
  '3. How many apples? 🍎 🍎 🍎',
  '4. How many suns? ☀️ ☀️',
  '## Sorting / Grouping',
  '5. Draw a circle around the animals.',
  "## Teacher's Answer Key 🔑",
  '1. B   2. A   3. 3   4. 2   5. animals'
].join('\n');

test('validateTestOutput accepts a K-3 test with emoji activities', () => {
  // The K-3 activities arrive as ids like picture_mcq / counting / sorting; each
  // needs aliases so a section heading written in the model's own words (even a
  // fun one like "Part 1: Let's Count! 🔢") still counts as present.
  const r = SilidValidate.validateTestOutput(K3_TEST, { types: ['picture_mcq', 'counting', 'drawing', 'sorting'] });
  assert.equal(r.valid, true, r.warnings.join(' | '));
  assert.deepEqual(plain(r.warnings), []);
});

test('validateTestOutput flags a K-3 activity whose section is missing', () => {
  const r = SilidValidate.validateTestOutput(K3_TEST, { types: ['counting', 'reading_comp'] });
  assert.equal(r.valid, false);
  assert.deepEqual(plain(r.warnings), ['Expected "Short Story + Questions" section was not found.']);
});

test('validateTestOutput labels a missing K-3 section with its friendly name', () => {
  const selected = [{ id: 'picture_mcq', label: 'Picture Multiple Choice (A, B, C)', selected: true, count: 3 }];
  const r = SilidValidate.validateTestOutput(GOOD_TEST, { types: selected });
  assert.ok(r.warnings.includes('Expected "Picture Multiple Choice" section was not found.'), r.warnings.join(' | '));
});

test('validateTestOutput never throws on unusable type entries', () => {
  const junk = [null, undefined, 42, {}, [], { id: '' }, { label: '' }, true];
  const r = SilidValidate.validateTestOutput(GOOD_TEST, { types: junk });
  assert.equal(r.valid, true, r.warnings.join(' | '));
  assert.deepEqual(plain(r.warnings), []);
});

test('validateTestOutput ignores a non-array types value', () => {
  for (const types of ['mcq', { id: 'mcq' }, 7, null]) {
    const r = SilidValidate.validateTestOutput(GOOD_TEST, { types });
    assert.equal(r.valid, true, r.warnings.join(' | '));
  }
});

/* ---- math mode: the MATH FORMATTING rules re-checked on the raw output ---- */

const GOOD_MATH = [
  '## Multiple Choice',
  'Choose the letter of the best answer.',
  '',
  '1. What is $2x + 3$ when $x = 2$?',
  '   a. $7$', '   b. $6$', '   c. $8$', '   d. $5$',
  '2. Simplify $\\frac{6}{8}$.',
  '   a. $\\frac{3}{4}$', '   b. $\\frac{2}{3}$', '   c. $\\frac{1}{2}$', '   d. $\\frac{4}{5}$',
  '3. Solve for $x$: $x^{2} = 9$.',
  '   a. $x = 3$', '   b. $x = -3$', '   c. $x = \\pm 3$', '   d. $x = 9$',
  '4. The area of a circle is $A = \\pi r^{2}$. Find $A$ when $r = 2$.',
  '   a. $4\\pi$', '   b. $2\\pi$', '   c. $8\\pi$', '   d. $\\pi$',
  '5. What is $\\sqrt{49} + \\sqrt{16}$?',
  '   a. $11$', '   b. $10$', '   c. $12$', '   d. $13$',
  '',
  '## Answer Key',
  '1. a   2. a   3. c   4. a   5. a'
].join('\n');

test('validateTestOutput stays quiet on a clean math test', () => {
  const r = SilidValidate.validateTestOutput(GOOD_MATH, { types: ['mcq'], math: true });
  assert.equal(r.valid, true, r.warnings.join(' | '));
  assert.deepEqual(plain(r.warnings), []);
});

test('validateTestOutput flags an unclosed $ formula in math mode', () => {
  const broken = GOOD_MATH.replace('$x = 2$', '$x = 2'); // drop one delimiter
  const r = SilidValidate.validateTestOutput(broken, { math: true });
  assert.equal(r.valid, false);
  assert.ok(r.warnings.some((w) => /number of \$ delimiters does not pair up/.test(w)), r.warnings.join(' | '));
});

test('validateTestOutput flags an unclosed $$ display block', () => {
  const broken = GOOD_MATH + '\n$$\n2x = 10';
  const r = SilidValidate.validateTestOutput(broken, { math: true });
  assert.equal(r.valid, false);
  assert.ok(r.warnings.some((w) => /display formula is left unclosed/.test(w)), r.warnings.join(' | '));
});

test('validateTestOutput flags plain-text math left outside $...$', () => {
  const sloppy = GOOD_MATH + '\nWrite x^2 and 3/4 as sqrt(9), or just use ½ directly.';
  const r = SilidValidate.validateTestOutput(sloppy, { math: true });
  assert.equal(r.valid, false);
  const w = r.warnings.find((s) => /Plain-text math outside/.test(s));
  assert.ok(w, r.warnings.join(' | '));
  assert.ok(w.includes('exponents like x^2'), w);
  assert.ok(w.includes('bare fractions like 3/4'), w);
  assert.ok(w.includes('square roots'), w);
  assert.ok(w.includes('½'), w);
});

test('validateTestOutput flags formulas MathJax cannot parse or would render badly', () => {
  const broken = GOOD_MATH
    .replace('$\\frac{6}{8}$', '$\\frac{6}{8$')   // unbalanced braces
    .replace('   a. $7$', '   a. $a*b$');          // banned asterisk
  const r = SilidValidate.validateTestOutput(broken, { math: true });
  assert.equal(r.valid, false);
  assert.ok(r.warnings.some((w) => /unbalanced braces and will not render/.test(w)), r.warnings.join(' | '));
  assert.ok(r.warnings.some((w) => /asterisk inside a formula/.test(w)), r.warnings.join(' | '));
});

test('validateTestOutput flags math mode that produced no formulas at all', () => {
  const r = SilidValidate.validateTestOutput(GOOD_TEST, { types: ['mcq', 'tf'], math: true });
  assert.equal(r.valid, false);
  assert.deepEqual(plain(r.warnings), [
    'Math mode is on but the output contains no $...$ formulas — the math formatting rules were ignored.'
  ]);
});

test('validateTestOutput reports the line of each math finding', () => {
  // `details` powers the inline chips: [{ message, line }] with the 0-based
  // source line, while `warnings` stays an array of plain strings for the banner.
  const base = GOOD_MATH.split('\n');
  const sloppy = GOOD_MATH + '\nWrite x^2 and 3/4 as sqrt(9), or just use ½ directly.';
  const r = SilidValidate.validateTestOutput(sloppy, { math: true });
  assert.ok(Array.isArray(r.details), 'details must accompany the string warnings');
  assert.ok(r.details.length > 0);
  assert.ok(r.details.every((d) => typeof d.message === 'string'), 'every detail message must stay a string');
  const shorthand = r.details.find((d) => /Plain-text math/.test(d.message));
  assert.ok(shorthand, r.warnings.join(' | '));
  assert.equal(shorthand.line, base.length, 'the chip belongs on the appended line');

  const starry = GOOD_MATH.replace('   a. $7$', '   a. $a*b$');
  const r2 = SilidValidate.validateTestOutput(starry, { math: true });
  const star = r2.details.find((d) => /asterisk/.test(d.message));
  assert.ok(star, r2.warnings.join(' | '));
  assert.equal(star.line, base.indexOf('   a. $7$'), 'the chip belongs on the offending option line');
});

test('validateTestOutput marks document-wide math findings with a null line', () => {
  const r = SilidValidate.validateTestOutput(GOOD_TEST, { types: ['mcq', 'tf'], math: true });
  assert.equal(r.details.length, 1);
  assert.equal(r.details[0].line, null, 'a document-wide finding has no line to chip onto');
  assert.ok(r.warnings.every((w) => typeof w === 'string'), 'the banner still renders plain strings');
  // without math mode no details are produced at all
  const off = SilidValidate.validateTestOutput(GOOD_TEST, {});
  assert.deepEqual(plain(off.details || []), []);
  assert.deepEqual(plain(SilidValidate.validateTestOutput('', {}).details), []);
});

test('validateTestOutput never applies the math rules to a non-math test', () => {
  // Gating matters: a science test may mention "$5", and a test generated with
  // math mode off must keep its old, warning-free behaviour exactly.
  const sloppy = GOOD_MATH + '\nWrite x^2 and 3/4 as sqrt(9), or just use ½ directly.';
  for (const config of [{}, { types: ['mcq'] }, { math: false }]) {
    const r = SilidValidate.validateTestOutput(sloppy, config);
    assert.equal(r.valid, true, r.warnings.join(' | '));
    assert.deepEqual(plain(r.warnings), []);
  }
});

test('validateTestOutput accepts a subscript inside a formula', () => {
  // $x_1$ is valid LaTeX — only "*" is banned inside math, never "_"
  const sub = GOOD_MATH.replace('   a. $7$', '   a. $x_1$');
  const r = SilidValidate.validateTestOutput(sub, { math: true });
  assert.equal(r.valid, true, r.warnings.join(' | '));
  assert.deepEqual(plain(r.warnings), []);
});

test('validatePptSlides accepts a slide deck of at least minSlides', () => {
  const slides = Array.from({ length: 5 }, (_, i) => ({ title: 'Slide ' + (i + 1), bullets: ['a', 'b'] }));
  assert.deepEqual(plain(SilidValidate.validatePptSlides(slides, { minSlides: 5 })), { valid: true, warnings: [] });
});

test('validatePptSlides rejects non-array input', () => {
  const r = SilidValidate.validatePptSlides(null, {});
  assert.equal(r.valid, false);
  assert.match(r.warnings[0], /No slides data/i);
});

test('validatePptSlides flags a short deck and malformed slides', () => {
  const r = SilidValidate.validatePptSlides([{ title: '', bullets: [] }], { minSlides: 5 });
  assert.equal(r.valid, false);
  assert.ok(r.warnings.some((w) => /at least 5/.test(w)));
  assert.ok(r.warnings.some((w) => /Slide 1 has no title/.test(w)));
  assert.ok(r.warnings.some((w) => /Slide 1 has no bullet points/.test(w)));
});

test('validateActivityHtml accepts a complete activity sheet', () => {
  const r = SilidValidate.validateActivityHtml(GOOD_ACTIVITY);
  assert.equal(r.valid, true, r.warnings.join(' | '));
});

test('validateActivityHtml flags content without directions or questions', () => {
  const r = SilidValidate.validateActivityHtml('<h1>Title</h1>' + 'x'.repeat(400));
  assert.equal(r.valid, false);
  assert.ok(r.warnings.some((w) => /directions/i.test(w)));
  assert.ok(r.warnings.some((w) => /questions or items/i.test(w)));
});

test('validateLessonHtml accepts a complete lesson plan', () => {
  const r = SilidValidate.validateLessonHtml(GOOD_LESSON);
  assert.equal(r.valid, true, r.warnings.join(' | '));
});

test('validateLessonHtml flags a lesson with no objectives section', () => {
  const r = SilidValidate.validateLessonHtml('<h1>Topic</h1>' + '<p>The content is long enough here.</p>'.repeat(20));
  assert.equal(r.valid, false);
  assert.deepEqual(plain(r.warnings), ['No objectives/goals section found.']);
});

test('validateLessonHtml rejects a null input', () => {
  const r = SilidValidate.validateLessonHtml(null);
  assert.equal(r.valid, false);
  assert.match(r.warnings[0], /No lesson content/i);
});
