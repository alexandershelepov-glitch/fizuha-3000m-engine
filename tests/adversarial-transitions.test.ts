/**
 * Adversarial audit — required state-transition sequences, re-derived independently.
 * spec 19/20/21/23/25 and the "ПРОВЕРКА" section of docs/specification.txt.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBreak, createEngine, prescribe, recordCheckpoint, recordResult, replan, skipWorkout} from '../src/index.ts';
import type {EngineState, Gate, Profile, WorkoutType, WorkoutResult} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, profile as baseProfile} from './helpers.ts';

const fast = (o: Partial<Profile> = {}): Profile => baseProfile({
  ...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4,
  averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(90), ...o,
});

/** Record the next quality session of a given type, advancing the clock if needed. */
function nextOfType(s: EngineState, type: WorkoutType,
                    kind: 'GREEN' | 'GREEN_PLUS' | 'YELLOW' | 'RED' = 'GREEN',
                    over: Partial<WorkoutResult> = {}): {state: EngineState; workout: EngineState['queue'][number]} {
  for (let n = 0; n < 150; n++) {
    const w = s.queue.find(x => x.countsAsQuality && x.type === type);
    if (w) return {workout: w, state: recordResult(s, w.id, feedback(w, kind, over))};
    s = replan(s, dateAfter(1, s.asOf));
  }
  throw new Error(`no ${type} workout available`);
}
/** Record the next quality session of whatever type is scheduled. */
function anyQuality(s: EngineState, kind: 'GREEN' | 'GREEN_PLUS' | 'YELLOW' | 'RED' = 'GREEN',
                    over: Partial<WorkoutResult> = {}): EngineState {
  for (let n = 0; n < 150; n++) {
    const w = s.queue.find(x => x.countsAsQuality);
    if (w) return recordResult(s, w.id, feedback(w, kind, over));
    s = replan(s, dateAfter(1, s.asOf));
  }
  throw new Error('no quality workout available');
}
function easyStep(s: EngineState): EngineState {
  for (let n = 0; n < 60; n++) {
    const w = s.queue.find(x => x.type === 'EASY');
    if (w) return recordResult(s, w.id, feedback(w));
    s = replan(s, dateAfter(1, s.asOf));
  }
  throw new Error('no easy workout available');
}

test('D01 GREEN then GREEN progresses exactly one volume step and nothing else', () => {
  let s = createEngine(baseProfile(), NOW);            // Q0 -> INTRO_QUALITY, step is 2 minutes
  const first = s.queue.find(x => x.countsAsQuality)!;
  const type = first.type;
  const base = first.main.dose.value;
  s = recordResult(s, first.id, feedback(first));
  assert.equal(s.doses[type]!.value, base, 'one GREEN alone must not progress');
  const second = nextOfType(s, type);
  assert.equal(second.state.doses[type]!.value, base + 2, 'the second confirmation adds one step');
  const compare = prescribe(second.state, type, second.state.asOf, 'audit-compare');
  assert.deepEqual(compare.speedRangeMps, second.workout.speedRangeMps, 'speed must not change with volume');
  assert.equal(compare.main.repeatMeters, second.workout.main.repeatMeters, 'repeat length must not change');
  assert.equal(compare.restSeconds, second.workout.restSeconds, 'recovery must not be shortened');
  assert.equal(compare.minimumRecoveryHoursBeforeQuality, second.workout.minimumRecoveryHoursBeforeQuality);
  assert.equal(compare.main.dose.unit, second.workout.main.dose.unit, 'the dose unit must not change');
  assert.equal(second.state.successStreak[type], 0, 'the confirmation counter resets after a step');
});

test('D02 a success in one workout type never progresses a different type', () => {
  let s = createEngine(fast(), NOW);
  s = nextOfType(s, 'THRESHOLD').state;
  const others = new Map(Object.entries(s.doses)
    .filter(([type]) => type !== 'THRESHOLD')
    .map(([type, dose]) => [type, dose!.value]));
  s = nextOfType(s, 'THRESHOLD').state;
  assert.equal(s.doses.THRESHOLD!.value, s.confirmedDoses.THRESHOLD!.value + 4, 'THRESHOLD advances by its own Q2 step');
  for (const [type, value] of others) {
    assert.equal(s.doses[type as WorkoutType]!.value, value, `${type} must not grow because THRESHOLD succeeded`);
  }
});

test('D03 GREEN_PLUS then GREEN_PLUS requests a checkpoint and never rewrites performance', () => {
  let s = createEngine(baseProfile(), NOW);
  const before = structuredClone(s.profile.performance);
  s = anyQuality(s, 'GREEN_PLUS');
  assert.equal(s.checkpointRequired, false);
  assert.deepEqual(s.profile.performance, before);
  s = anyQuality(s, 'GREEN_PLUS');
  assert.equal(s.checkpointRequired, true);
  assert.deepEqual(s.profile.performance, before, 'two GREEN_PLUS sessions still predict nothing');
  assert.ok(s.greenPlusIds.length >= 2);
  assert.ok(s.decision.reasons.includes('CHECKPOINT_AFTER_GREEN_PLUS'));
});

test('D04 YELLOW then GREEN clears isolated fatigue and restores the level without growth', () => {
  let s = createEngine(fast(), NOW);
  s = nextOfType(s, 'THRESHOLD').state;                 // one confirmation: streak 1, no growth
  const confirmed = s.confirmedDoses.THRESHOLD!.value;
  s = nextOfType(s, 'THRESHOLD', 'YELLOW', {unexpectedFatigue: true}).state;
  assert.equal(s.progressionBlocked, true);
  assert.ok(s.queue.every(w => !w.countsAsQuality));
  assert.equal(s.successStreak.THRESHOLD, undefined, 'a yellow clears the confirmation counter');
  s = easyStep(s);
  assert.equal(s.progressionBlocked, false);
  assert.equal(s.relatedYellow, false);
  s = nextOfType(s, 'THRESHOLD').state;
  assert.equal(s.doses.THRESHOLD!.value, confirmed, 'after a yellow one GREEN restores, never grows');
});

test('D05 YELLOW then YELLOW with the same family becomes a related pair and rolls the dose back', () => {
  let s = createEngine(fast(), NOW);
  s = nextOfType(s, 'THRESHOLD').state;
  s = nextOfType(s, 'THRESHOLD').state;                 // progressed and confirmed
  const confirmed = structuredClone(s.confirmedDoses);
  const performance = structuredClone(s.profile.performance);
  s = nextOfType(s, 'THRESHOLD', 'YELLOW', {unexpectedFatigue: true}).state;
  s = easyStep(s);
  s = nextOfType(s, 'THRESHOLD', 'YELLOW', {unexpectedFatigue: true}).state;
  assert.equal(s.relatedYellow, true);
  assert.equal(s.decision.phase, 'HOLD_DIAGNOSTIC');
  assert.deepEqual(s.doses, confirmed, 'working doses return to the last confirmed values');
  assert.equal(s.reducedQualityUntilConfirmed, true);
  assert.deepEqual(s.profile.performance, performance, 'Current Performance is never lowered automatically');
});

test('D06 YELLOW then YELLOW with unrelated reasons stays unrelated', () => {
  let s = createEngine(fast(), NOW);
  s = nextOfType(s, 'THRESHOLD', 'YELLOW', {yellowReason: 'ENVIRONMENT', conditions: {heat: true}}).state;
  s = easyStep(s);
  s = nextOfType(s, 'THRESHOLD', 'YELLOW', {yellowReason: 'RECOVERY', unexpectedFatigue: true}).state;
  assert.equal(s.relatedYellow, false);
  assert.equal(s.reducedQualityUntilConfirmed, false);
});

test('D07 RE_ENTRY runs two easy sessions, then a reduced quality, then normal training', () => {
  let s = createEngine(fast({raceDate: dateAfter(150)}), NOW);
  s = anyQuality(s, 'GREEN');
  const now = dateAfter(9, s.asOf);
  s = applyBreak(s, {days: 9, endDate: now, reason: 'WORK'}, now);
  assert.equal(s.decision.phase, 'RE_ENTRY');
  assert.equal(s.reentry?.easyRemaining, 2);
  for (let i = 0; i < 2; i++) {
    const w = s.queue[0]!;
    assert.equal(w.type, 'EASY', `mandatory easy session ${i + 1}`);
    assert.ok(w.volumeFactor >= 0.6 && w.volumeFactor <= 0.8, `easy reduction ${w.volumeFactor}`);
    s = recordResult(s, w.id, feedback(w));
  }
  assert.equal(s.checkpointRequired, true, 'completing a significant RE_ENTRY requests a checkpoint');
  let resumed: EngineState | null = null;
  for (let n = 0; n < 90; n++) {
    const w = s.queue.find(x => x.countsAsQuality);
    if (w) {
      assert.equal(w.gateAtPrescription, 'CLOSED', 'the gate must stay closed for the first quality session');
      assert.ok(w.volumeFactor >= 0.7 && w.volumeFactor <= 0.8, `quality reduction ${w.volumeFactor}`);
      resumed = recordResult(s, w.id, feedback(w));
      break;
    }
    s = replan(s, dateAfter(1, s.asOf));
  }
  assert.ok(resumed, 'a reduced quality session follows the mandatory easies');
  assert.equal(resumed!.reentry, null, 'RE_ENTRY ends after the first successful quality');
  assert.notEqual(resumed!.decision.phase, 'RE_ENTRY');
});

test('D08 PARTIAL becomes OPEN only after two successful SPECIFIC_3K sessions at PARTIAL', () => {
  let s = createEngine(baseProfile({
    ...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4, averageWeeklyKm4Weeks: 28,
    longestUsualRunKm: 9, performance: {timeSeconds: 900, date: NOW, source: 'TEST_3K'},
    targetTimeSeconds: 880, raceDate: dateAfter(90),
  }), NOW);
  assert.equal(s.decision.gate, 'CLOSED');
  let guard = 0;
  while (s.decision.phase !== 'SPECIFIC' && guard++ < 10) s = anyQuality(s, 'GREEN');
  assert.equal(s.decision.phase, 'SPECIFIC');
  assert.equal(s.decision.gate, 'PARTIAL');
  const first = nextOfType(s, 'SPECIFIC_3K');
  assert.equal(first.workout.gateAtPrescription, 'PARTIAL', 'the first specific session must be prescribed under PARTIAL');
  s = first.state;
  assert.ok(s.successfulSpecificPartial >= 1);
  assert.equal(s.decision.gate, 'PARTIAL', 'one specific session is not enough to open the gate');
  let previousDose = s.doses.SPECIFIC_3K?.value ?? null;
  let previousGate: Gate = s.decision.gate;
  while (s.decision.gate !== 'OPEN' && guard++ < 30) {
    previousDose = s.doses.SPECIFIC_3K?.value ?? null;
    previousGate = s.decision.gate;
    s = nextOfType(s, 'SPECIFIC_3K').state;
  }
  assert.equal(s.decision.gate, 'OPEN');
  assert.equal(previousGate, 'PARTIAL', 'the gate must pass through PARTIAL');
  assert.ok(s.successfulSpecificPartial >= 2, 'OPEN requires at least two successful SPECIFIC_3K at PARTIAL');
  assert.equal(s.decision.effectiveSpeedMps, 3000 / s.profile.targetTimeSeconds);
  if (previousDose !== null) assert.equal(s.doses.SPECIFIC_3K!.value, previousDose, 'opening the gate must not raise the dose in the same step');
});

test('D09 RED blocks progression and cannot be cleared by time, skip or a healthy break', () => {
  let s = createEngine(fast(), NOW);
  s = recordResult(s, s.queue[0]!.id, feedback(s.queue[0]!, 'RED'));
  assert.equal(s.progressionBlocked, true);
  assert.equal(s.diagnosticHold, true);
  const later = replan(s, dateAfter(30));
  assert.equal(later.diagnosticHold, true);
  assert.ok(later.queue.every(w => !w.countsAsQuality));
  const afterBreak = applyBreak(s, {days: 9, endDate: dateAfter(9, s.asOf), reason: 'WORK'}, dateAfter(9, s.asOf));
  assert.equal(afterBreak.diagnosticHold, true);
  assert.ok(afterBreak.queue.every(w => !w.countsAsQuality));
  const afterSkip = skipWorkout(s, s.queue[0]!.id, s.asOf);
  assert.equal(afterSkip.diagnosticHold, true);
  assert.ok(afterSkip.queue.every(w => !w.countsAsQuality));
});

test('D10 CONTROL feedback alone never becomes a new Current Performance', () => {
  let s = createEngine(baseProfile(), NOW);
  const before = structuredClone(s.profile.performance);
  s = replan(s, dateAfter(21));
  const control = s.queue.find(w => w.type === 'CONTROL');
  assert.ok(control, 'precondition: a checkpoint time trial is queued');
  s = recordResult(s, control.id, feedback(control));
  assert.deepEqual(s.profile.performance, before, 'CONTROL must not rewrite Current Performance');
  assert.equal(s.checkpointRequired, true, 'the checkpoint request survives until a valid test is submitted');
});

test('D11 a new valid 3 km test updates performance, replans and keeps T/Q', () => {
  let s = createEngine(fast(), NOW);
  const capacity = s.decision.capacity, quality = s.decision.quality;
  s = recordCheckpoint(s, {timeSeconds: 940, date: s.asOf, source: 'TEST_3K'}, s.asOf);
  assert.equal(s.profile.performance!.timeSeconds, 940);
  assert.equal(s.decision.currentSpeedMps, 3000 / 940);
  assert.equal(s.decision.capacity, capacity, 'Training Capacity comes from training data, not from one test');
  assert.equal(s.decision.quality, quality, 'Quality Experience comes from training data, not from one test');
  assert.equal(s.checkpointRequired, false);
  assert.equal(s.successfulQuality, 0, 'a new test restarts the confirmation cycle');
});

test('D12 SPECIFIC then TAPER by date, and the event date itself stays in TAPER', () => {
  let s = createEngine(baseProfile({...experienced, raceDate: dateAfter(20)}), NOW);
  s = anyQuality(s, 'GREEN');
  s = anyQuality(s, 'GREEN');
  assert.equal(s.decision.phase, 'SPECIFIC');
  const race = s.profile.raceDate;
  const taperStart = dateAfter(-7, race);
  let t = s;
  for (let n = 0; n < 40 && t.asOf < taperStart; n++) t = replan(t, dateAfter(1, t.asOf));
  assert.equal(t.decision.phase, 'TAPER', `taper must start 7 days before the race (${taperStart})`);
  assert.ok(t.queue.filter(w => w.scheduledDate >= taperStart).every(w => w.volumeFactor === 0.6));
  assert.equal(replan(t, race).decision.phase, 'TAPER', 'the event date itself is still taper');
});
