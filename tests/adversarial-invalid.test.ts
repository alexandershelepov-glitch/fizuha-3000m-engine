/**
 * Adversarial audit — invalid, contradictory and hostile input.
 *
 * Two groups:
 *  - "rejected": the engine must refuse the input.
 *  - "documented gap": input that is still accepted. These are pinned so that any future
 *    change is visible; each one records a remaining, deliberately unpatched weakness.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, createEngine, deserialize, moveWorkout, recordCheckpoint, recordResult,
        replan, updateTrainingData, validateResult, EventDatePassedError} from '../src/index.ts';
import type {Workout, WorkoutResult} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, healthy, profile as baseProfile} from './helpers.ts';

function thresholdWorkout(): Workout {
  const s = createEngine(baseProfile({...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4,
    averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9}), NOW);
  return s.queue.find(x => x.type === 'THRESHOLD')!;
}
const rejects = (fn: () => unknown, label: string) => assert.throws(fn, Error, label);

// ------------------------------------------------------------ Profile input
test('E01 rejected profile numbers', () => {
  rejects(() => createEngine(baseProfile({targetTimeSeconds: 0}), NOW), 'target 0');
  rejects(() => createEngine(baseProfile({targetTimeSeconds: -100}), NOW), 'negative target');
  rejects(() => createEngine(baseProfile({targetTimeSeconds: NaN}), NOW), 'NaN target');
  rejects(() => createEngine(baseProfile({targetTimeSeconds: Infinity}), NOW), 'Infinity target');
  rejects(() => createEngine(baseProfile({averageWeeklyKm4Weeks: -5}), NOW), 'negative weekly km');
  rejects(() => createEngine(baseProfile({averageWeeklyKm4Weeks: NaN}), NOW), 'NaN weekly km');
  rejects(() => createEngine(baseProfile({longestUsualRunKm: -1}), NOW), 'negative long run');
  rejects(() => createEngine(baseProfile({regularRunningWeeks: -1}), NOW), 'negative weeks');
  rejects(() => createEngine(baseProfile({actualRunsPerWeek: -1}), NOW), 'negative runs');
  rejects(() => createEngine(baseProfile({actualRunsPerWeek: 8}), NOW), 'runs above 7');
  rejects(() => createEngine(baseProfile({availableRunsPerWeek: 0}), NOW), 'zero available sessions');
  rejects(() => createEngine(baseProfile({availableRunsPerWeek: 8}), NOW), 'eight available sessions');
  rejects(() => createEngine(baseProfile({availableRunsPerWeek: 2.5}), NOW), 'fractional available sessions');
  rejects(() => createEngine(baseProfile({qualitySessions8Weeks: -1}), NOW), 'negative quality sessions');
  rejects(() => createEngine(baseProfile({qualityWeeks8Weeks: 3, qualitySessions8Weeks: 2}), NOW), 'more quality weeks than sessions');
  rejects(() => createEngine(baseProfile({qualityWeeks8Weeks: 0.5}), NOW), 'fractional quality weeks');
});

test('E02 rejected dates and calendar values', () => {
  rejects(() => createEngine(baseProfile(), '2026-02-30'), 'impossible calendar date');
  rejects(() => createEngine(baseProfile(), '2026-13-01'), 'month 13');
  rejects(() => createEngine(baseProfile(), '05-10-2026'), 'wrong date format');
  rejects(() => createEngine(baseProfile(), '2026/10/05'), 'slash separated date');
  rejects(() => createEngine(baseProfile(), ''), 'empty date');
  rejects(() => createEngine(baseProfile({performance: {timeSeconds: 900, date: dateAfter(1), source: 'TEST_3K'}}), NOW), 'future test result');
  rejects(() => createEngine(baseProfile({performance: {timeSeconds: 0, date: NOW, source: 'TEST_3K'}}), NOW), 'zero performance time');
  rejects(() => createEngine(baseProfile({performance: {timeSeconds: 900, date: NOW, source: 'GUESS' as never}}), NOW), 'invalid performance source');
  rejects(() => createEngine(baseProfile({breaks: [{days: 0, endDate: NOW, reason: 'WORK'}]}), NOW), 'zero length break');
  rejects(() => createEngine(baseProfile({breaks: [{days: 3, endDate: dateAfter(1), reason: 'WORK'}]}), NOW), 'break ending in the future');
  rejects(() => createEngine(baseProfile({breaks: [{days: 3, endDate: NOW, reason: 'HOLIDAY' as never}]}), NOW), 'invalid break reason');
  rejects(() => createEngine(baseProfile({breaks: [{days: 1.5, endDate: NOW, reason: 'WORK'}]}), NOW), 'fractional break length');
  rejects(() => createEngine(baseProfile({performanceMismatch: 'MAYBE' as never}), NOW), 'invalid mismatch');
});

test('E03 rejected safety data', () => {
  rejects(() => createEngine(baseProfile({safety: {...healthy(), pain: -1}}), NOW), 'negative pain');
  rejects(() => createEngine(baseProfile({safety: {...healthy(), pain: 11}}), NOW), 'pain above 10');
  rejects(() => createEngine(baseProfile({safety: {...healthy(), pain: NaN}}), NOW), 'NaN pain');
  rejects(() => createEngine(baseProfile({safety: {...healthy(), swelling: 'yes' as never}}), NOW), 'non-boolean safety flag');
  rejects(() => createEngine(baseProfile({safety: undefined as never}), NOW), 'missing safety block');
});

test('E04 rejected workout results', () => {
  const w = thresholdWorkout();
  const cases: [string, Partial<WorkoutResult>][] = [
    ['completion below 0', {completionFraction: -0.1}],
    ['completion above 1', {completionFraction: 1.1}],
    ['completion NaN', {completionFraction: NaN}],
    ['RPE below 0', {sessionRpe: -1}],
    ['RPE above 10', {sessionRpe: 11}],
    ['RPE NaN', {sessionRpe: NaN}],
    ['RPE Infinity', {sessionRpe: Infinity}],
    ['negative duration', {durationMinutes: -5}],
    ['negative distance', {distanceMeters: -1}],
    ['NaN distance', {distanceMeters: NaN}],
    ['zero repeat distance', {repeats: [{distanceMeters: 0, seconds: 100}]}],
    ['zero repeat seconds', {repeats: [{distanceMeters: 600, seconds: 0}]}],
    ['negative rest', {restSeconds: [-1]}],
    ['invalid yellow reason', {yellowReason: 'LAZINESS' as never}],
    ['non-boolean fatigue flag', {unexpectedFatigue: 'yes' as never}],
    ['missing safety', {safety: undefined as never}],
  ];
  for (const [label, over] of cases) rejects(() => classify(w, feedback(w, 'GREEN', over)), `classify: ${label}`);
  rejects(() => validateResult(feedback(w, 'GREEN', {date: 'nonsense'})), 'malformed result date');
});

// ---------------------------------------------------------- Lifecycle input
test('E05 rejected lifecycle operations', () => {
  const s = createEngine(baseProfile(), NOW);
  const w = s.queue[0]!;
  rejects(() => recordResult(s, 'does-not-exist', feedback(w)), 'unknown workout id');
  rejects(() => recordResult(s, w.id, feedback(w, 'GREEN', {date: dateAfter(3)})), 'result date differs from prescription');
  rejects(() => recordResult(s, w.id, feedback(w, 'GREEN', {date: dateAfter(-1)})), 'result predates the state');
  const done = recordResult(s, w.id, feedback(w));
  rejects(() => recordResult(done, w.id, feedback(w)), 'duplicate submission of one workout');
  rejects(() => replan(s, dateAfter(-1)), 'clock moving backwards');
  rejects(() => recordCheckpoint(s, {timeSeconds: 900, date: dateAfter(5), source: 'TEST_3K'}, NOW), 'future checkpoint date');
  rejects(() => recordCheckpoint(s, {timeSeconds: 900, date: NOW, source: 'GUESS' as never}, NOW), 'invalid checkpoint source');
  rejects(() => updateTrainingData(s, {performance: {timeSeconds: 700, date: NOW, source: 'TEST_3K'}} as never, NOW), 'performance via updateTrainingData');
  rejects(() => updateTrainingData(s, {safety: healthy()} as never, NOW), 'safety via updateTrainingData');
  rejects(() => updateTrainingData(s, {breaks: []} as never, NOW), 'breaks via updateTrainingData');
  rejects(() => moveWorkout(s, w.id, dateAfter(7)), 'move beyond the queue horizon');
  rejects(() => moveWorkout(s, w.id, dateAfter(-1)), 'move into the past');
  rejects(() => moveWorkout(s, s.queue[1]!.id, w.scheduledDate), 'move onto an occupied date');
  rejects(() => deserialize(JSON.stringify({...s, version: 2})), 'unsupported state version');
  const ill = createEngine(baseProfile({safety: {...healthy(), acuteIllness: true}}), NOW);
  rejects(() => recordCheckpoint(ill, {timeSeconds: 900, date: NOW, source: 'TEST_3K'}, NOW), 'checkpoint while safety is not OK');
});

// ------------------------------------------------------- Documented gaps
test('E06 contradictory profile data are accepted, but LONG_EASY load is now constrained', () => {
  // A 40 km long run inside a 10 km training week, and 6 runs a week with 1 available slot.
  const contradictory = createEngine(baseProfile({
    averageWeeklyKm4Weeks: 10, longestUsualRunKm: 40, actualRunsPerWeek: 6, availableRunsPerWeek: 1,
  }), NOW);
  // Capacity stays conservative (the 10 km/week band caps it at T1), so the contradiction
  // does not inflate Training Capacity — but nothing rejects the input either.
  assert.equal(contradictory.decision.capacity, 'T1');
  // The profile still accepts inconsistent self-reports; conservative planning must not
  // repeat the 40 km error just because "longest ever run" is contradictory.
  const withLong = createEngine(baseProfile({
    averageWeeklyKm4Weeks: 10, longestUsualRunKm: 40, actualRunsPerWeek: 3, availableRunsPerWeek: 3, raceDate: dateAfter(60),
  }), NOW);
  const long = withLong.queue.find(w => w.type === 'LONG_EASY');
  // There is NO obligation to keep a "long" session when doing so would exceed the
  // week's reserved load (quality, warm-up and cool-down now take part of that budget).
  if (long) assert.ok(long.main.dose.value <= 10000, 'never prescribe 40 km inside a 10 km training week');
  assert.ok(withLong.queue.every(w => w.main.dose.unit !== 'METERS' || w.main.dose.value <= 10000));
  assert.ok(withLong.queue.filter(w=>w.main.dose.unit==='METERS').reduce((n,w)=>n+w.main.dose.value,0)<=10000);
  // Profile-level contradictions are still not rejected: input quality is a separate issue.
  assert.doesNotThrow(() => createEngine(baseProfile({averageWeeklyKm4Weeks: 5, longestUsualRunKm: 50}), NOW));
  assert.doesNotThrow(() => createEngine(baseProfile({actualRunsPerWeek: 6, availableRunsPerWeek: 1}), NOW));
});

test('E07 a race date in the past is rejected with EVENT_DATE_PASSED (approved decision 1)', () => {
  // The gap is closed: there is deliberately no post-race phase, so a passed race date is refused.
  for (const offset of [-1, -10, -400]) {
    assert.throws(() => createEngine(baseProfile({...experienced, raceDate: dateAfter(offset)}), NOW),
      (e: unknown) => e instanceof EventDatePassedError && (e as EventDatePassedError).code === 'EVENT_DATE_PASSED',
      `raceDate ${dateAfter(offset)} must be rejected`);
  }
  // The message carries the machine-readable code as well.
  assert.throws(() => createEngine(baseProfile({raceDate: dateAfter(-1)}), NOW), /EVENT_DATE_PASSED/);
});

test('E08 feasibility is monotonic in the number of available sessions (approved decision 2)', async () => {
  // <= 2 available sessions step the verdict down one level; 3 or more do not.
  const {assessFeasibility} = await import('../src/index.ts');
  // The scale index grows as the verdict gets worse, so a larger index means a less favourable goal.
  const scale = ['PLAUSIBLE', 'AMBITIOUS', 'LOW_PROBABILITY'];
  for (const [gap, weeks, t, q] of [[0.04, 6, 'T1', 'Q1'], [0.05, 8, 'T2', 'Q1'], [0.08, 10, 'T2', 'Q2'], [0.12, 14, 'T2', 'Q2']] as const) {
    const values = [1, 2, 3, 4, 5, 6, 7].map(available => assessFeasibility(gap, weeks, t as never, q as never, available)!);
    assert.equal(values[0], values[1], `one and two available sessions must agree (gap=${gap})`);
    for (let i = 0; i < values.length - 1; i++) {
      assert.ok(scale.indexOf(values[i]!) >= scale.indexOf(values[i + 1]!),
        `the verdict must not worsen as availability grows: ${values.join(' -> ')} (gap=${gap})`);
    }
    assert.equal(scale.indexOf(values[0]!) - scale.indexOf(values[2]!), 1,
      `<=2 sessions step the verdict down exactly one level (gap=${gap})`);
    assert.equal(values[2], values[6], `3+ sessions are unaffected (gap=${gap})`);
  }
  // The 3+ branch is untouched: exactly the previous behaviour.
  assert.equal(assessFeasibility(0.05, 6, 'T2', 'Q1', 2), 'AMBITIOUS');
  assert.equal(assessFeasibility(0.05, 6, 'T2', 'Q1', 3), 'PLAUSIBLE');
  assert.equal(assessFeasibility(0.03, 6, 'T0', 'Q0', 1), 'PLAUSIBLE', 'no modifier at or below the 3% threshold');
});

test('E09 no scenario or persona identifiers drive the engine logic', async () => {
  const {readFileSync, readdirSync} = await import('node:fs');
  const dir = new URL('../src/', import.meta.url);
  const banned = ['scenario', 'persona', 'character', 'персонаж', 'сценар'];
  for (const file of readdirSync(dir)) {
    // Comments may cite the originating task text; only executable code must be free of
    // character numbering. Such comments are reported separately as a code-quality note.
    const code = readFileSync(new URL(file, dir), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    for (const token of banned) {
      assert.ok(!code.toLowerCase().includes(token.toLowerCase()), `${file} uses "${token}" in executable code`);
    }
    assert.ok(!/\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\s*,\s*6/.test(code), `${file} contains a numbered character table`);
  }
});
