/**
 * The enrollment window of methodology v4 is one rule, not three.
 *
 * A real iPhone report: the questionnaire proposed an event date 56 days out, `eligibleForV4`
 * accepted 56, `createEngine` enrolled only up to 55, and the app silently built the legacy
 * nine-week plan instead of the approved eight-week one. These tests pin the single rule and the
 * explanations derived from it.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  V4_LENGTH_MAX, V4_LENGTH_MIN, V4_RACE_OFFSET,
  createEngine, eligibleForV4, forecastCycle, suggestedRaceDate, v4InEffect, v4Status,
} from '../src/index.ts';
import {v4Blockers} from '../src/methodologyV4.ts';
import {addDays, day} from '../src/validation.ts';
import {healthy, profile} from './helpers.ts';

const START = '2026-11-01';
const NOW = START;

function v4Profile(overrides: Parameters<typeof profile>[0] = {}) {
  return profile({
    performance: {timeSeconds: 870, date: START, source: 'TEST_3K'},
    targetTimeSeconds: 840,
    raceDate: suggestedRaceDate(START),
    regularRunningWeeks: 20,
    actualRunsPerWeek: 3,
    availableRunsPerWeek: 3,
    averageWeeklyKm4Weeks: 16,
    longestUsualRunKm: 6,
    ...overrides,
  });
}

test('V4-WINDOW-01 the approved window is 53–55 days and the suggestion sits inside it', () => {
  assert.equal(V4_LENGTH_MIN, 53);
  assert.equal(V4_LENGTH_MAX, 55);
  assert.equal(V4_RACE_OFFSET, 54);
  assert.equal(day(suggestedRaceDate(START)) - day(START), 54);
});

test('V4-WINDOW-02 eligibility and enrollment use exactly the same window', () => {
  for (const length of [51, 52, 53, 54, 55, 56, 57]) {
    const p = v4Profile({raceDate: addDays(START, length)});
    const eligible = eligibleForV4(p, START);
    const state = createEngine(p, NOW, START);
    assert.equal(eligible, length >= V4_LENGTH_MIN && length <= V4_LENGTH_MAX, `eligibility at ${length} days`);
    assert.equal(state.methodology !== undefined, eligible, `enrollment at ${length} days must match eligibility`);
    if (!eligible) assert.ok(v4Blockers(p, START).includes('CYCLE_LENGTH'), `reason at ${length} days`);
  }
});

test('V4-WINDOW-03 the date the app suggests produces the approved cycle, not the legacy plan', () => {
  const state = createEngine(v4Profile(), NOW, START);
  assert.deepEqual(state.methodology?.id, 'V4_8W_1430');
  assert.equal(day(state.profile.raceDate) - day(state.cycleStartDate), 54);
  const forecast = forecastCycle(state, {mode: 'CONDITIONAL', asOf: state.asOf});
  const entries = forecast.entries.filter(entry => entry.workout.type !== 'REST');
  // 8 quality + 8 easy + 7 long runs + the final 3000 m event.
  assert.equal(entries.length, 24);
  assert.equal(entries.filter(entry => entry.workout.type === 'CONTROL').length, 1);
  // The plan starts at the chosen date and ends on the event itself.
  assert.equal(entries[0]?.workout.scheduledDate.split('-').length, 3);
  assert.ok(entries.every(entry => day(entry.workout.scheduledDate) >= day(START)));
  assert.equal(entries.at(-1)?.workout.scheduledDate, state.profile.raceDate);
});

test('V4-WINDOW-04 every unmet condition is reported, and they are distinguishable', () => {
  assert.deepEqual(v4Status(v4Profile(), START).blockers, []);
  assert.deepEqual(v4Status(v4Profile({raceDate: addDays(START, 56)}), START).blockers, ['CYCLE_LENGTH']);
  assert.ok(v4Status(v4Profile({performance: null}), START).blockers.includes('RESULT_REQUIRED'));
  assert.ok(v4Status(v4Profile({averageWeeklyKm4Weeks: 8}), START).blockers.includes('BASE_VOLUME'));
  assert.ok(v4Status(v4Profile({longestUsualRunKm: 4}), START).blockers.includes('BASE_LONG_RUN'));
  assert.ok(v4Status(v4Profile({regularRunningWeeks: 4}), START).blockers.includes('BASE_WEEKS'));
  assert.ok(v4Status(v4Profile({availableRunsPerWeek: 2}), START).blockers.includes('AVAILABILITY'));
  assert.ok(v4Status(v4Profile({performanceMismatch: 'CLEAR'}), START).blockers.includes('RESULT_MISMATCH'));
  assert.ok(v4Status(v4Profile({safety: {...healthy(), pain: 3}}), START).blockers.includes('SAFETY'));
  assert.ok(v4Blockers(v4Profile({performance: {timeSeconds: 900, date: START, source: 'TEST_3K'}}), START).includes('RESULT_TIME'));
});

test('V4-WINDOW-05 the date explanation names the suggested date, and invalid dates never throw', () => {
  const status = v4Status(v4Profile({raceDate: addDays(START, 60)}), START);
  assert.equal(status.suggestedRaceDate, suggestedRaceDate(START));
  assert.equal(status.lengthDays, 60);
  const invalid = v4Status(v4Profile({raceDate: addDays(START, 54)}), '2026-13-45');
  assert.ok(invalid.blockers.includes('INVALID_DATES'));
  assert.equal(invalid.eligible, false);
});

test('V4-WINDOW-06 a legacy cycle is never migrated, and its enrollment is reported honestly', () => {
  // A cycle saved before the fix: 56 days, legacy plan, no enrollment.
  const legacy = createEngine(v4Profile({raceDate: addDays(START, 56)}), NOW, START);
  assert.equal(legacy.methodology, undefined);
  assert.equal(v4InEffect(legacy), false);
  assert.ok(v4Status(legacy.profile, legacy.cycleStartDate).blockers.includes('CYCLE_LENGTH'));

  // An enrolled cycle keeps its label and stays in effect.
  const enrolled = createEngine(v4Profile(), NOW, START);
  assert.equal(v4InEffect(enrolled), true);
  assert.equal(v4Status(enrolled.profile, enrolled.cycleStartDate).eligible, true);
});
