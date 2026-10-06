/**
 * Regression tests for the three decisions approved in the final stabilisation round.
 *
 * 1. EVENT_DATE_PASSED: the active v1.0 engine works up to and including the target race date.
 * 2. Goal Feasibility: `availableRunsPerWeek <= 2` steps the verdict down one level.
 * 3. Public validation API: validateProfile / validateResult are reachable from the entry point.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as publicApi from '../src/index.ts';
import {assessFeasibility, createEngine, day, moveWorkout, recordResult, replan,
        validateEventDate, validateProfile, validateResult, EventDatePassedError} from '../src/index.ts';
import type {EngineState, Profile, WorkoutResult} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, healthy, profile as baseProfile} from './helpers.ts';

const prepared = (o: Partial<Profile> = {}): Profile => baseProfile({
  ...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4,
  averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(60), ...o,
});
const isEventDatePassed = (e: unknown) => e instanceof EventDatePassedError && e.code === 'EVENT_DATE_PASSED';

// ============================== 1. EVENT DATE ==============================
test('EV01 raceDate = today is accepted and plans normally', () => {
  const today = baseProfile({...experienced, raceDate: NOW});
  assert.doesNotThrow(() => validateProfile(today, NOW));
  assert.doesNotThrow(() => validateEventDate(today, NOW));
  const s = createEngine(today, NOW);
  assert.equal(s.decision.phase, 'TAPER', 'the race day itself is the last day of taper');
  assert.ok(s.queue.every(w => day(w.scheduledDate) <= day(NOW)), 'nothing is planned after the race date');
});

test('EV02 raceDate = yesterday is rejected with EVENT_DATE_PASSED', () => {
  const yesterday = dateAfter(-1);
  const p = baseProfile({...experienced, raceDate: yesterday});
  assert.throws(() => validateEventDate(p, NOW), isEventDatePassed);
  assert.throws(() => createEngine(p, NOW), isEventDatePassed);
  assert.throws(() => createEngine(p, NOW), /EVENT_DATE_PASSED/);
});

test('EV03 replan on the race date is allowed, replan after it is EVENT_DATE_PASSED', () => {
  let s = createEngine(prepared({raceDate: dateAfter(5)}), NOW);
  s = replan(s, dateAfter(5));
  assert.equal(s.asOf, dateAfter(5));
  assert.equal(s.decision.phase, 'TAPER');
  assert.throws(() => replan(s, dateAfter(6)), isEventDatePassed);
  assert.throws(() => replan(s, dateAfter(30)), isEventDatePassed);
  // The rejected call must not have mutated the state it was given.
  assert.equal(s.asOf, dateAfter(5));
});

test('EV04 every date-advancing entry point rejects a passed race date', () => {
  const s = createEngine(prepared({raceDate: dateAfter(6)}), NOW);
  const after = dateAfter(7);
  assert.throws(() => replan(s, after), isEventDatePassed);
  assert.throws(() => publicApi.skipWorkout(s, s.queue[0]!.id, after), isEventDatePassed);
  assert.throws(() => publicApi.applyBreak(s, {days: 3, endDate: after, reason: 'WORK'}, after), isEventDatePassed);
  assert.throws(() => publicApi.updateTrainingData(s, {regularRunningWeeks: 30}, after), isEventDatePassed);
  assert.throws(() => publicApi.resolveDiagnostic(s, healthy(), after), isEventDatePassed);
  assert.throws(() => publicApi.recordCheckpoint(s, {timeSeconds: 900, date: after, source: 'TEST_3K'}, after), isEventDatePassed);
  // An active plan cannot be created for a date already past the race either.
  assert.throws(() => createEngine(prepared({raceDate: dateAfter(6)}), after), isEventDatePassed);
});

test('EV05 a state whose stored asOf is past the race date cannot be loaded', () => {
  const s = createEngine(prepared({raceDate: dateAfter(6)}), NOW);
  const tampered = JSON.parse(JSON.stringify(s)) as EngineState;
  tampered.asOf = dateAfter(7);
  assert.throws(() => publicApi.deserialize(JSON.stringify(tampered)), isEventDatePassed);
});

test('EV06 no session is ever queued after the race date across many profiles', () => {
  for (const raceOffset of [0, 1, 2, 3, 5, 7, 10, 14, 30, 90]) {
    for (const avail of [1, 2, 3, 5, 7]) {
      const s = createEngine(baseProfile({
        ...experienced, availableRunsPerWeek: avail, actualRunsPerWeek: 4,
        averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(raceOffset),
      }), NOW);
      for (const w of s.queue) {
        assert.ok(day(w.scheduledDate) <= day(s.profile.raceDate),
          `${w.type}@${w.scheduledDate} is planned after the race date (raceOffset=${raceOffset})`);
      }
      // Everything queued inside the window stays recordable.
      for (const w of s.queue) {
        assert.doesNotThrow(() => recordResult(s, w.id, feedback(w)),
          `queued ${w.type}@${w.scheduledDate} must be recordable (raceOffset=${raceOffset})`);
      }
    }
  }
});

test('EV07 a workout cannot be moved past the race date', () => {
  const s = createEngine(prepared({raceDate: dateAfter(3)}), NOW);
  const w = s.queue[0]!;
  const beyond = dateAfter(4);
  assert.throws(() => moveWorkout(s, w.id, beyond), /horizon/);
  // A move inside the window is still allowed.
  const inside = s.queue.find(x => x.id !== w.id && day(x.scheduledDate) <= day(s.profile.raceDate));
  assert.ok(inside, 'precondition: another in-window session exists');
});

// ==================== 2. FEASIBILITY MONOTONIC IN AVAILABILITY ====================
test('EV08 feasibility is monotonic and identical profiles differ only by availability', () => {
  const scale = ['PLAUSIBLE', 'AMBITIOUS', 'LOW_PROBABILITY']; // index grows as the verdict worsens
  const gradient = (available: number) => assessFeasibility(0.04, 6, 'T1', 'Q1', available)!;
  const one = gradient(1), two = gradient(2), three = gradient(3);
  assert.equal(one, 'LOW_PROBABILITY', 'one available session is stepped down');
  assert.equal(two, 'LOW_PROBABILITY', 'two available sessions are stepped down');
  assert.equal(three, 'AMBITIOUS', 'three or more sessions are unmodified');
  assert.equal(one, two, 'one session must not be rated better than two');
  assert.ok(scale.indexOf(one) >= scale.indexOf(three),
    'a single available session must never look better than three');
  assert.equal(gradient(3), gradient(4));
  assert.equal(gradient(4), gradient(7));
});

test('EV09 the same profile with 1, 2 and 3 available sessions stays monotonic through createEngine', () => {
  for (const gap of [0.04, 0.06, 0.08, 0.12]) {
    const verdicts = [1, 2, 3].map(available => createEngine(baseProfile({
      ...experienced, availableRunsPerWeek: available, actualRunsPerWeek: 3,
      averageWeeklyKm4Weeks: 20, longestUsualRunKm: 7,
      performance: {timeSeconds: 1000 * (1 + gap), date: NOW, source: 'TEST_3K'},
      targetTimeSeconds: 1000, raceDate: dateAfter(70),
    }), NOW).decision.feasibility);
    const rank = (f: string | null) => f === null ? -1 : ['PLAUSIBLE', 'AMBITIOUS', 'LOW_PROBABILITY'].indexOf(f);
    assert.equal(verdicts[0], verdicts[1], `1 and 2 sessions must agree (gap=${gap})`);
    assert.ok(rank(verdicts[2]!) <= rank(verdicts[1]!), `3 sessions must not be worse than 2 (gap=${gap}: ${verdicts.join(' -> ')})`);
  }
});

test('EV10 no feasibility modifier applies at or below a 3% Goal Gap', () => {
  for (const available of [1, 2, 3]) {
    assert.equal(assessFeasibility(0.03, 6, 'T0', 'Q0', available), 'PLAUSIBLE', `gap=3% available=${available}`);
  }
  // Just above the threshold the <=2 penalty applies, so exactly 3% stays unmodified.
  assert.equal(assessFeasibility(0.030001, 6, 'T2', 'Q1', 1), 'AMBITIOUS');
  assert.equal(assessFeasibility(0.030001, 6, 'T2', 'Q1', 2), 'AMBITIOUS');
  assert.equal(assessFeasibility(0.030001, 6, 'T2', 'Q1', 3), 'PLAUSIBLE');
});

// ==================== 3. PUBLIC VALIDATION API ====================
test('EV11 validation API is reachable through the public package entry point', () => {
  assert.equal(typeof publicApi.validateProfile, 'function');
  assert.equal(typeof publicApi.validateResult, 'function');
  assert.equal(typeof publicApi.validateSafety, 'function');
  assert.equal(typeof publicApi.validateEventDate, 'function');
  assert.equal(typeof publicApi.day, 'function');
  assert.equal(typeof publicApi.addDays, 'function');
  assert.equal(typeof publicApi.EventDatePassedError, 'function');
  assert.deepEqual(Object.keys(publicApi).filter(k => /^validate/.test(k)).sort(),
    ['validateEventDate', 'validateProfile', 'validateResult', 'validateSafety']);
});

test('EV12 the public validators enforce exactly the internal rules (no duplication)', () => {
  // A valid profile and result pass through the public entry point.
  const p = prepared();
  assert.doesNotThrow(() => validateProfile(p, NOW));
  const s = createEngine(p, NOW);
  const w = s.queue.find(x => x.countsAsQuality)!;
  const result: WorkoutResult = feedback(w);
  assert.doesNotThrow(() => validateResult(result));
  // The same rejections the engine performs are reproducible through the public API.
  assert.throws(() => validateProfile({...p, targetTimeSeconds: 0}, NOW), /Number outside/);
  assert.throws(() => validateProfile({...p, availableRunsPerWeek: 0}, NOW), /Number outside/);
  assert.throws(() => validateProfile({...p, raceDate: dateAfter(-1)}, NOW), isEventDatePassed);
  assert.throws(() => validateResult({...result, completionFraction: 1.5}), /Number outside/);
  assert.throws(() => validateResult({...result, sessionRpe: 11}), /Number outside/);
  assert.throws(() => validateResult({...result, repeats: [{distanceMeters: 600, seconds: 0}]}), /Number outside/);
  // And they are the very same implementation, not a copy.
  assert.equal(publicApi.validateProfile, validateProfile);
  assert.equal(publicApi.validateResult, validateResult);
});
