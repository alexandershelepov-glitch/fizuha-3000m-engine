/**
 * Copy completeness: every public value set the UI can meet has Russian text, and no map may list a
 * value the engine does not have. Compile-time exhaustiveness comes from `satisfies Record<...>` in
 * the copy layer; this test checks the same thing at runtime and against the real catalogs.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  ANCHORS, BREAK_REASONS, CAPACITIES, CONFIDENCES, DOSE_UNITS, EFFORT_CUES, ERROR_CODES, EVALUATIONS,
  FEASIBILITIES, FEEDBACK_FIELDS, GATES, MAIN_MODES, PERFORMANCE_MISMATCH_LEVELS, PERFORMANCE_SOURCES,
  PHASES, QUALITY_LEVELS, REASON_CODES, SAFETY_STATUSES, WORKOUT_GOALS, WORKOUT_TYPES, YELLOW_REASONS,
} from '../src/index.ts';
import {
  anchorText, breakReasonText, capacityText, confidenceText, doseUnitText, effortCueText, evaluationSign,
  evaluationText, feasibilityText, feedbackFieldText, gateText, mainModeText, mismatchText, performanceSourceText,
  phaseText, phaseWhy, qualityText, reasonText, safetyStatusText, workoutGoalText, workoutTypeText, yellowReasonText,
} from '../web/src/ui/copy/values.ts';
import {errorCopy, UNKNOWN_ERROR_COPY} from '../web/src/ui/copy/errors.ts';

/** A copy entry is either one string or an object with text fields. */
interface EntryShape {label?: string; description?: string; title?: string; cta?: string}
const maps: [string, Record<string, string | EntryShape | null>, readonly string[]][] = [
  ['phaseText', phaseText, PHASES],
  ['phaseWhy', phaseWhy, PHASES],
  ['feasibilityText', feasibilityText, FEASIBILITIES],
  ['gateText', gateText, GATES],
  ['confidenceText', confidenceText, CONFIDENCES],
  ['capacityText', capacityText, CAPACITIES],
  ['qualityText', qualityText, QUALITY_LEVELS],
  ['workoutTypeText', workoutTypeText, WORKOUT_TYPES],
  ['workoutGoalText', workoutGoalText, WORKOUT_GOALS],
  ['mainModeText', mainModeText, MAIN_MODES],
  ['effortCueText', effortCueText, EFFORT_CUES],
  ['anchorText', anchorText, ANCHORS],
  ['doseUnitText', doseUnitText, DOSE_UNITS],
  ['performanceSourceText', performanceSourceText, PERFORMANCE_SOURCES],
  ['breakReasonText', breakReasonText, BREAK_REASONS],
  ['mismatchText', mismatchText, PERFORMANCE_MISMATCH_LEVELS],
  ['safetyStatusText', safetyStatusText, SAFETY_STATUSES],
  ['reasonText', reasonText, REASON_CODES],
  ['evaluationText', evaluationText, EVALUATIONS],
  ['evaluationSign', evaluationSign, EVALUATIONS],
  ['yellowReasonText', yellowReasonText, YELLOW_REASONS],
  ['feedbackFieldText', feedbackFieldText, FEEDBACK_FIELDS],
  ['errorCopy', errorCopy, ERROR_CODES],
];

test('COPY-01 every public value set has Russian text and no extra keys', () => {
  for (const [name, map, catalog] of maps) {
    assert.deepEqual(Object.keys(map).sort(), [...catalog].sort(), `${name} does not match its catalog`);
  }
});

test('COPY-02 no text is a bare engine code and nothing is empty', () => {
  for (const [name, map, catalog] of maps) {
    for (const value of catalog) {
      const entry = map[value];
      assert.ok(entry !== undefined && entry !== null, `${name}.${value} is missing`);
      const texts = typeof entry === 'string'
        ? [entry]
        : [entry.label, entry.description, entry.title, entry.cta].filter((text): text is string => typeof text === 'string');
      assert.ok(texts.length > 0, `${name}.${value} has no text`);
      for (const text of texts) {
        assert.ok(text.trim().length > 0, `${name}.${value} is empty`);
        assert.notEqual(text, value, `${name}.${value} shows the technical code`);
      }
    }
  }
});

test('COPY-03 error texts never leak the technical code and use the parameters', () => {
  for (const code of ERROR_CODES) {
    const entry = errorCopy[code];
    assert.ok(entry.title.length > 0 && entry.cta.length > 0, `${code} lacks a title or CTA`);
    assert.notEqual(entry.title, code);
    assert.equal(typeof entry.text, 'function');
    assert.ok(entry.text({}).length > 0, `${code} produced no text`);
  }
  assert.equal(errorCopy.NUMBER_OUT_OF_RANGE.text({min: 1, max: 7}), 'Введите значение от 1 до 7.');
  assert.equal(errorCopy.NUMBER_OUT_OF_RANGE.text({min: 1, max: Infinity}), 'Введите значение не меньше 1.');
  assert.ok(UNKNOWN_ERROR_COPY.title.length > 0);
});

test('COPY-04 the retry policy in the copy matches the application contract', () => {
  // ui-copy §10.4: these codes move the user to another scenario instead of offering a plain retry.
  for (const code of ['EVENT_DATE_PASSED', 'UNSUPPORTED_STATE_VERSION', 'UNKNOWN_OR_COMPLETED_WORKOUT', 'RESULT_PRECEDES_STATE', 'RECOVERY_OR_QUALITY_LIMIT', 'PROTECTED_FIELD', 'CHECKPOINT_NOT_PERMITTED', 'FINAL_RESULT_BEFORE_EVENT', 'WORKOUT_BLOCKED_BY_PHASE_OR_SAFETY'] as const) {
    assert.equal(errorCopy[code].retry, false, `${code} must not offer a plain retry`);
  }
  for (const code of ['NUMBER_OUT_OF_RANGE', 'INVALID_DATE_FORMAT', 'FUTURE_PERFORMANCE', 'MOVE_OCCUPIED_DATE'] as const) {
    assert.equal(errorCopy[code].retry, true, `${code} must be repeatable`);
  }
});
