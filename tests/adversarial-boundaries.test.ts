/**
 * Adversarial audit — independent re-derivation of every declared boundary.
 *
 * Expectations are taken from docs/specification.txt and
 * docs/specification-decisions.md; the existing suite is deliberately not trusted.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBreak, assessCapacity, assessConfidence, assessFeasibility, assessQuality, assessSafety,
        classify, createEngine, replan, taperDays} from '../src/index.ts';
import type {EngineState, Profile, Workout, WorkoutResult} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, healthy, profile as baseProfile} from './helpers.ts';

const HEALTHY_WEEKS = 10; // raceDate = NOW + 70 days

/** Profile with an exactly controllable Goal Gap: performance = 1000 * (1 + gap). */
function gapProfile(gap: number, o: Partial<Profile> = {}): Profile {
  return baseProfile({
    performance: {timeSeconds: 1000 * (1 + gap), date: NOW, source: 'TEST_3K'},
    targetTimeSeconds: 1000, raceDate: dateAfter(7 * HEALTHY_WEEKS),
    regularRunningWeeks: 20, actualRunsPerWeek: 3, availableRunsPerWeek: 3,
    averageWeeklyKm4Weeks: 16, longestUsualRunKm: 6, qualitySessions8Weeks: 3, qualityWeeks8Weeks: 3, ...o,
  });
}
function breakAt(s: EngineState, days: number): EngineState {
  const now = dateAfter(days, s.asOf);
  return applyBreak(s, {days, endDate: now, reason: 'WORK'}, now);
}
function thresholdWorkout(): Workout {
  const s = createEngine(baseProfile({...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4,
    averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(90)}), NOW);
  const w = s.queue.find(x => x.type === 'THRESHOLD');
  assert.ok(w, 'precondition: a THRESHOLD session with a prescribed pace range');
  assert.ok(w.speedRangeMps, 'precondition: THRESHOLD carries a speed range');
  return w;
}
/** Result built from explicit per-repeat speeds so the in-range share is exact. */
function repeatResult(w: Workout, seconds: number[], overrides: Partial<WorkoutResult> = {}): WorkoutResult {
  const target = (w.targetRpe[0] + w.targetRpe[1]) / 2;
  return {
    date: w.scheduledDate, completionFraction: 1, sessionRpe: target, safety: healthy(),
    durationMinutes: 40, distanceMeters: seconds.length * 600,
    repeats: seconds.map(s => ({distanceMeters: 600, seconds: s})),
    restSeconds: seconds.map(() => w.restSeconds), conditions: {}, unexpectedFatigue: false, ...overrides,
  };
}

// ---------------------------------------------------------------- Goal Gap
test('B01 Target Pace Gate boundary exactly at 8% Goal Gap', () => {
  // spec 13: CLOSED is mandatory when Goal Gap > 8%
  for (const [gap, expected] of [[0.03, 'PARTIAL'], [0.05, 'PARTIAL'], [0.06, 'PARTIAL'],
                                 [0.079999, 'PARTIAL'], [0.08, 'PARTIAL'], [0.080001, 'CLOSED'],
                                 [0.10, 'CLOSED'], [0.15, 'CLOSED'], [0.150001, 'CLOSED']] as const) {
    const s = createEngine(gapProfile(gap), NOW);
    s.successfulQuality = 1; // one confirming quality session is already on record
    assert.equal(replan(s, NOW).decision.gate, expected, `gap=${gap} gate`);
  }
});

test('B02 Goal Feasibility boundaries exactly at 3/6/10/15%', () => {
  // T2 + Q1 + 3 available sessions + 10 weeks; only the gap changes.
  const expectations: readonly (readonly [number, string])[] = [
    [0.029999, 'PLAUSIBLE'], [0.03, 'PLAUSIBLE'], [0.030001, 'PLAUSIBLE'],
    [0.05, 'PLAUSIBLE'], [0.06, 'PLAUSIBLE'],   // (3%;6%] with >= 6 weeks
    [0.060001, 'PLAUSIBLE'],                    // (6%;10%] with >= 10 weeks and T2+
    [0.08, 'PLAUSIBLE'], [0.10, 'PLAUSIBLE'],
    [0.100001, 'LOW_PROBABILITY'],              // 10-15% needs >= 12 weeks
    [0.15, 'LOW_PROBABILITY'], [0.150001, 'LONG_TERM'],
  ];
  for (const [gap, expected] of expectations) {
    assert.equal(createEngine(gapProfile(gap), NOW).decision.feasibility, expected, `gap=${gap}`);
  }
});

test('B03 modifiers apply only above 3%, scale caps at LOW_PROBABILITY, LONG_TERM never steps down', () => {
  assert.equal(assessFeasibility(0.03, 6, 'T0', 'Q0', 2), 'PLAUSIBLE');
  assert.equal(assessFeasibility(0.04, 6, 'T1', 'Q1', 3), 'AMBITIOUS');
  assert.equal(assessFeasibility(0.04, 6, 'T1', 'Q0', 2), 'LOW_PROBABILITY');
  assert.equal(assessFeasibility(0.2, 20, 'T0', 'Q0', 2), 'LONG_TERM');
  assert.equal(assessFeasibility(null, 20, 'T3', 'Q2', 5), null);
  assert.equal(assessFeasibility(0.05, 6, 'T2', 'Q1', 2), 'AMBITIOUS');   // only two sessions steps down
  assert.equal(assessFeasibility(0.05, 6, 'T2', 'Q1', 3), 'PLAUSIBLE');
});

// -------------------------------------------------------- Performance age
test('B04 performance age boundaries 21/22 and 42/43 days', () => {
  const at = (age: number) => assessConfidence(baseProfile({performance: {timeSeconds: 920, date: dateAfter(-age), source: 'TEST_3K'}}), NOW);
  assert.equal(at(0), 'HIGH');
  assert.equal(at(21), 'HIGH');
  assert.equal(at(22), 'MEDIUM');
  assert.equal(at(42), 'MEDIUM');
  assert.equal(at(43), 'LOW');
  assert.equal(at(400), 'LOW');
});

test('B05 no 3 km result yields UNKNOWN, never LOW (approved decision, spec 6)', () => {
  assert.equal(assessConfidence(baseProfile({performance: null}), NOW), 'UNKNOWN');
  const s = createEngine(baseProfile({performance: null}), NOW);
  assert.equal(s.decision.confidence, 'UNKNOWN');
  assert.equal(s.decision.phase, 'FOUNDATION');
  assert.equal(s.decision.gate, 'CLOSED');
  assert.ok(s.decision.reasons.includes('FOUNDATION_NO_3K_RESULT'));
});

// ----------------------------------------------------------------- Breaks
test('B06 healthy break boundaries 3/4 and 14/15 days', () => {
  const aged = (days: number) => assessConfidence(baseProfile({
    performance: {timeSeconds: 920, date: dateAfter(-40), source: 'TEST_3K'},
    breaks: [{days, endDate: NOW, reason: 'WORK'}],
  }), NOW);
  assert.equal(aged(4), 'MEDIUM');
  assert.equal(aged(14), 'MEDIUM');
  assert.equal(aged(15), 'LOW');
  const fresh = (days: number) => assessConfidence(baseProfile({
    performance: {timeSeconds: 920, date: NOW, source: 'TEST_3K'},
    breaks: [{days, endDate: NOW, reason: 'WORK'}],
  }), NOW);
  assert.equal(fresh(3), 'HIGH');
  assert.equal(fresh(4), 'MEDIUM');
  assert.equal(fresh(7), 'MEDIUM');
  assert.equal(fresh(8), 'MEDIUM');
  assert.equal(fresh(14), 'MEDIUM');
  assert.equal(fresh(15), 'LOW');
});

test('B07 RE_ENTRY boundary 7/8 days plus the 1-3 / 4-7 / 8-14 / >14 branches', () => {
  // 1-3 days: continue the programme, nothing to catch up
  for (const days of [1, 2, 3]) {
    const after = breakAt(createEngine(baseProfile({...experienced, raceDate: dateAfter(100)}), NOW), days);
    assert.equal(after.reentry, null, `days=${days}`);
    assert.notEqual(after.decision.phase, 'RE_ENTRY', `days=${days}`);
    assert.equal(after.decision.gate, 'CLOSED', `days=${days}`);
  }
  // 4-7 days: first easy 0.8, first quality 0.85, no RE_ENTRY phase
  for (const days of [4, 5, 6, 7]) {
    const after = breakAt(createEngine(baseProfile({...experienced, raceDate: dateAfter(120)}), NOW), days);
    assert.equal(after.reentry?.easyFactor, 0.8, `days=${days} easyFactor`);
    assert.equal(after.reentry?.qualityFactor, 0.85, `days=${days} qualityFactor`);
    assert.notEqual(after.decision.phase, 'RE_ENTRY', `days=${days} phase`);
    assert.equal(after.reentry?.easyRemaining, 0, `days=${days} no mandatory easy block`);
  }
  // 8-14 days: RE_ENTRY, gate CLOSED, two mandatory easy sessions, no quality
  for (const days of [8, 10, 14]) {
    const after = breakAt(createEngine(baseProfile({...experienced, raceDate: dateAfter(120)}), NOW), days);
    assert.equal(after.decision.phase, 'RE_ENTRY', `days=${days} phase`);
    assert.equal(after.decision.gate, 'CLOSED', `days=${days} gate`);
    assert.equal(after.reentry?.easyRemaining, 2, `days=${days} easyRemaining`);
    assert.equal(after.reentry?.easyFactor, 0.7, `days=${days} easyFactor`);
    assert.equal(after.reentry?.qualityFactor, 0.75, `days=${days} qualityFactor`);
    assert.equal(after.reentry?.diagnosticRequired, false, `days=${days}`);
    assert.ok(after.queue.every(w => !w.countsAsQuality), `days=${days} must not queue quality`);
  }
  // >14 days: diagnostic branch before quality may resume
  const long = breakAt(createEngine(baseProfile({...experienced, raceDate: dateAfter(150)}), NOW), 15);
  assert.equal(long.reentry?.diagnosticRequired, true);
  assert.equal(long.decision.maximumQualityPerWeek, 0);
  assert.equal(long.decision.gate, 'CLOSED');
  assert.equal(long.decision.confidence, 'LOW');
});

// -------------------------------------------------------------- Capacity
test('B08 Training Capacity: exact thresholds qualify, one step below does not', () => {
  const t1 = {regularRunningWeeks: 4, actualRunsPerWeek: 2, averageWeeklyKm4Weeks: 8, longestUsualRunKm: 3, canRun3Km: true};
  const t2 = {regularRunningWeeks: 8, actualRunsPerWeek: 3, averageWeeklyKm4Weeks: 15, longestUsualRunKm: 6, canRun3Km: true};
  const t3 = {regularRunningWeeks: 12, actualRunsPerWeek: 4, averageWeeklyKm4Weeks: 25, longestUsualRunKm: 8, canRun3Km: true};
  assert.equal(assessCapacity(baseProfile(t1)), 'T1');
  assert.equal(assessCapacity(baseProfile(t2)), 'T2');
  assert.equal(assessCapacity(baseProfile(t3)), 'T3');
  assert.equal(assessCapacity(baseProfile({...t1, regularRunningWeeks: 3.99})), 'T0');
  assert.equal(assessCapacity(baseProfile({...t2, regularRunningWeeks: 7.99})), 'T1');
  assert.equal(assessCapacity(baseProfile({...t3, regularRunningWeeks: 11.99})), 'T2');
  assert.equal(assessCapacity(baseProfile({...t1, actualRunsPerWeek: 1.99})), 'T0');
  assert.equal(assessCapacity(baseProfile({...t2, actualRunsPerWeek: 2.99})), 'T1');
  assert.equal(assessCapacity(baseProfile({...t3, actualRunsPerWeek: 3.99})), 'T2');
  assert.equal(assessCapacity(baseProfile({...t1, averageWeeklyKm4Weeks: 7.99})), 'T0');
  assert.equal(assessCapacity(baseProfile({...t2, averageWeeklyKm4Weeks: 14.99})), 'T1');
  assert.equal(assessCapacity(baseProfile({...t3, averageWeeklyKm4Weeks: 24.99})), 'T2');
  assert.equal(assessCapacity(baseProfile({...t2, longestUsualRunKm: 5.99})), 'T1');
  assert.equal(assessCapacity(baseProfile({...t3, longestUsualRunKm: 7.99})), 'T2');
  // Approved decision 3: continuous 3 km ability is mandatory for every category above T0 and
  // overrides regular weeks, session count, weekly mileage and longest run.
  for (const thresholds of [t1, t2, t3])
    assert.equal(assessCapacity(baseProfile({...thresholds, canRun3Km: false})), 'T0',
      `canRun3Km=false must force T0 for ${JSON.stringify(thresholds)}`);
  const notContinuous = baseProfile({...t3, canRun3Km: false, longestUsualRunKm: 12, averageWeeklyKm4Weeks: 60});
  const contained = createEngine(notContinuous, NOW);
  assert.equal(contained.decision.capacity, 'T0');
  assert.equal(contained.decision.phase, 'FOUNDATION');
  assert.equal(contained.decision.gate, 'CLOSED');
  assert.equal(contained.decision.maximumQualityPerWeek, 0);
  assert.ok(contained.queue.every(w => !w.countsAsQuality));
  assert.ok(contained.queue.every(w => !['VO2', 'SPECIFIC_3K'].includes(w.type)));
});

test('B09 Quality Experience boundaries: 2/3 sessions and 5/6 weeks', () => {
  assert.equal(assessQuality(baseProfile({qualitySessions8Weeks: 2, qualityWeeks8Weeks: 2})), 'Q0');
  assert.equal(assessQuality(baseProfile({qualitySessions8Weeks: 3, qualityWeeks8Weeks: 3})), 'Q1');
  assert.equal(assessQuality(baseProfile({qualitySessions8Weeks: 7, qualityWeeks8Weeks: 5})), 'Q1');
  assert.equal(assessQuality(baseProfile({qualitySessions8Weeks: 8, qualityWeeks8Weeks: 5})), 'Q1');
  assert.equal(assessQuality(baseProfile({qualitySessions8Weeks: 8, qualityWeeks8Weeks: 6})), 'Q2');
  assert.equal(assessQuality(baseProfile({qualitySessions8Weeks: 8, qualityWeeks8Weeks: 6, qualityMostlyTolerated: false})), 'Q1');
  assert.equal(assessQuality(baseProfile({qualitySessions8Weeks: 12, qualityWeeks8Weeks: 4})), 'Q1');
});

// -------------------------------------------------------------- Feedback
test('B10 completion boundary 94.9% / 95%', () => {
  const w = thresholdWorkout();
  assert.equal(classify(w, feedback(w, 'GREEN', {completionFraction: 0.949})).evaluation, 'YELLOW');
  assert.equal(classify(w, feedback(w, 'GREEN', {completionFraction: 0.9499999})).evaluation, 'YELLOW');
  assert.equal(classify(w, feedback(w, 'GREEN', {completionFraction: 0.95})).evaluation, 'GREEN');
  assert.equal(classify(w, feedback(w, 'GREEN', {completionFraction: 1})).evaluation, 'GREEN');
});

test('B11 repetitions-in-range boundary 80% (79.9% is not representable with discrete repeats)', () => {
  const w = thresholdWorkout();
  const [lo, hi] = w.speedRangeMps!;
  const mid = (lo + hi) / 2;
  const inRange = 600 / mid;
  const outOfRange = 600 / (lo * 0.5); // far too slow; first and last stay in range so fade is 0
  const build = (outCount: number) => {
    const seconds = Array.from({length: 10}, () => inRange);
    for (let i = 1; i <= outCount; i++) seconds[i] = outOfRange;
    return repeatResult(w, seconds);
  };
  assert.equal(classify(w, build(0)).inRangeFraction, 1);
  assert.equal(classify(w, build(2)).inRangeFraction, 0.8);
  assert.equal(classify(w, build(2)).evaluation, 'GREEN');
  assert.equal(classify(w, build(3)).inRangeFraction, 0.7);
  assert.equal(classify(w, build(3)).evaluation, 'YELLOW');
});

test('B12 pace-fade boundary 4.9% / 5% / just above 5%', () => {
  const w = thresholdWorkout();
  const top = w.speedRangeMps![1];
  const build = (drop: number) => {
    const seconds = Array.from({length: 5}, () => 600 / top);
    seconds[4] = 600 / (top * (1 - drop));
    return repeatResult(w, seconds);
  };
  assert.ok(classify(w, build(0.049)).speedDropFraction < 0.05);
  assert.equal(classify(w, build(0.049)).evaluation, 'GREEN');
  assert.equal(classify(w, build(0.05)).evaluation, 'GREEN');
  assert.equal(classify(w, build(0.050001)).evaluation, 'YELLOW');
  assert.equal(classify(w, build(0.050001)).yellowReason, 'EXECUTION');
});

test('B13 pain boundaries 1 / 2 / 3 / 4 without explicit stop flags', () => {
  const w = thresholdWorkout();
  const withPain = (pain: number) => ({...healthy(), pain});
  assert.equal(assessSafety(withPain(0)), 'OK');
  assert.equal(assessSafety(withPain(1)), 'OK');
  assert.equal(assessSafety(withPain(2)), 'HOLD');
  assert.equal(assessSafety(withPain(3)), 'HOLD');
  assert.equal(assessSafety(withPain(4)), 'HOLD');
  assert.equal(classify(w, feedback(w, 'GREEN', {safety: withPain(1)})).evaluation, 'GREEN');
  for (const pain of [2, 3, 4]) {
    const c = classify(w, feedback(w, 'GREEN', {safety: withPain(pain)}));
    assert.equal(c.evaluation, 'YELLOW', `pain=${pain}`);
    assert.equal(c.yellowReason, 'PAIN', `pain=${pain}`);
  }
});

test('B14 RPE boundary between GREEN, GREEN_PLUS and YELLOW', () => {
  const w = thresholdWorkout();
  const target = (w.targetRpe[0] + w.targetRpe[1]) / 2; // 6.5 for THRESHOLD
  const at = (rpe: number) => classify(w, feedback(w, 'GREEN', {sessionRpe: rpe}));
  assert.equal(at(target - 1).evaluation, 'GREEN_PLUS');   // <= target - 1
  assert.equal(at(target - 1 + 0.1).evaluation, 'GREEN');  // inside +-1
  assert.equal(at(target + 1).evaluation, 'GREEN');
  assert.equal(at(target + 1.1).evaluation, 'YELLOW');     // outside +-1, no named trigger
  assert.equal(at(target + 1.1).yellowReason, 'OTHER');
  assert.equal(at(target + 2).evaluation, 'YELLOW');       // >= target + 2
  assert.equal(at(target + 2).yellowReason, 'RECOVERY');
});

test('B15 RED always wins over every other feedback signal', () => {
  const w = thresholdWorkout();
  const red = {...healthy(), alteredMovement: true};
  assert.equal(classify(w, feedback(w, 'GREEN_PLUS', {safety: red})).evaluation, 'RED');
  assert.equal(classify(w, feedback(w, 'GREEN', {safety: {...red, pain: 4}, yellowReason: 'ENVIRONMENT'})).evaluation, 'RED');
});

// ----------------------------------------------------------------- Taper
test('B16 taper length by capacity and quality', () => {
  assert.equal(taperDays('T0', 'Q0'), 5);
  assert.equal(taperDays('T1', 'Q1'), 5);
  assert.equal(taperDays('T2', 'Q1'), 7);
  assert.equal(taperDays('T2', 'Q2'), 7);
  assert.equal(taperDays('T3', 'Q1'), 7);
  assert.equal(taperDays('T3', 'Q2'), 10);
});
