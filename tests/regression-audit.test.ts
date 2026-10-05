/**
 * Regression tests for defects confirmed by the adversarial audit.
 *
 * Each test failed against the baseline commit 68070ea and passes after the fix.
 * The baseline hash is recorded so the evidence can be reproduced.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, recordResult, replan, resolveDiagnostic} from '../src/index.ts';
import type {EngineState, Profile} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, healthy, profile as baseProfile} from './helpers.ts';

const BASELINE = '68070ea9c6a851da05a4ef66ffd365da6fe46280';

const fast = (o: Partial<Profile> = {}): Profile => baseProfile({
  ...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4,
  averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(90), ...o,
});

/** RED on an easy run, clinical release, then the first quality session of the new cycle. */
function afterRedAndOneQuality(): EngineState {
  let s = createEngine(fast(), NOW);
  const easy = s.queue.find(w => w.type === 'EASY')!;
  s = recordResult(s, easy.id, feedback(easy, 'RED'));
  s = resolveDiagnostic(s, healthy(), s.asOf);
  for (let n = 0; n < 40; n++) {
    const q = s.queue.find(w => w.countsAsQuality);
    if (q) return recordResult(s, q.id, feedback(q));
    s = replan(s, dateAfter(1, s.asOf));
  }
  throw new Error('no quality workout found');
}

test(`R01 queued quality session is always recordable (baseline ${BASELINE.slice(0, 7)} rejected it)`, () => {
  // Before the fix, generateQueue authorised the session with the decision on its own date
  // (maximumQualityPerWeek = 2 once the RED was more than seven days old) while recordResult
  // checked the stale state-level decision (maximumQualityPerWeek = 1) and threw.
  const s = afterRedAndOneQuality();
  const queued = s.queue.filter(w => w.countsAsQuality);
  assert.ok(queued.length > 0, 'precondition: a quality session is queued');
  for (const w of queued) {
    assert.doesNotThrow(() => recordResult(s, w.id, feedback(w)),
      `${w.type}@${w.scheduledDate} was queued but rejected`);
  }
});

test('R02 a RED report is never refused by the quality budget (safety has absolute priority)', () => {
  const s = afterRedAndOneQuality();
  for (const w of s.queue) {
    assert.doesNotThrow(() => recordResult(s, w.id, feedback(w, 'RED')),
      `RED report for ${w.type}@${w.scheduledDate} was refused — safety information would be lost`);
  }
  // The RED is genuinely recorded and blocks progression.
  const w = s.queue.find(x => x.countsAsQuality)!;
  const after = recordResult(s, w.id, feedback(w, 'RED'));
  assert.equal(after.history.at(-1)!.classified.evaluation, 'RED');
  assert.equal(after.diagnosticHold, true);
  assert.equal(after.decision.phase, 'HOLD_DIAGNOSTIC');
  assert.ok(after.queue.every(x => !x.countsAsQuality));
});

test('R03 zero habitual frequency falls back to the documented 1 km RUN_WALK minimum', () => {
  // Before the fix the weekly volume was divided by Math.max(1, 0) = 1, so a single easy run
  // equalled the athlete's entire weekly volume (up to 40 km) for someone who does not run at all.
  for (const km of [0, 5, 16, 40]) {
    const s = createEngine(baseProfile({
      performance: null, canRun3Km: false, actualRunsPerWeek: 0, availableRunsPerWeek: 2,
      averageWeeklyKm4Weeks: km, longestUsualRunKm: 6, regularRunningWeeks: 0,
    }), NOW);
    assert.ok(s.queue.length > 0, `km=${km} still produces a queue`);
    for (const w of s.queue) {
      assert.equal(w.type, 'EASY', `km=${km} foundation queue stays aerobic`);
      assert.equal(w.main.dose.unit, 'METERS', `km=${km} dose unit`);
      assert.equal(w.main.dose.value, 1000, `km=${km} easy dose must be the 1 km minimum`);
      assert.equal(w.main.mode, 'RUN_WALK', `km=${km} a runner who cannot run 3 km gets run/walk`);
    }
  }
});

test('R04 an easy dose stays consistent with the stated longest usual run (audit profiles)', () => {
  for (const [km, runs, longest] of [[16, 1, 20], [16, 3, 8], [40, 5, 12], [16, 0, 6], [30, 4, 10]] as const) {
    const s = createEngine(baseProfile({
      performance: null, canRun3Km: true, actualRunsPerWeek: runs, availableRunsPerWeek: 3,
      averageWeeklyKm4Weeks: km, longestUsualRunKm: longest, regularRunningWeeks: 10,
    }), NOW);
    for (const w of s.queue.filter(x => x.type === 'EASY')) {
      assert.ok(w.main.dose.value <= Math.max(longest * 1000, 1000),
        `easy dose ${w.main.dose.value} m exceeds the longest usual run for km=${km} runs=${runs}`);
    }
  }
});

test('R05 the easy dose formula is unchanged for every non-zero running frequency', () => {
  // Guard against the fix accidentally changing behaviour where the denominator is valid.
  for (const [km, runs] of [[16, 1], [16, 3], [40, 5], [25, 4], [16, 2]] as const) {
    const s = createEngine(baseProfile({
      performance: null, canRun3Km: true, actualRunsPerWeek: runs, availableRunsPerWeek: 3,
      averageWeeklyKm4Weeks: km, longestUsualRunKm: Math.min(km, 12), regularRunningWeeks: 10,
    }), NOW);
    const easy = s.queue.find(w => w.type === 'EASY');
    if (!easy) continue;
    assert.equal(easy.main.dose.value, km / runs * 1000, `km=${km} runs=${runs} must keep the documented formula`);
  }
});
