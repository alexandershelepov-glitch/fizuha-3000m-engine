/**
 * Regression tests for the 12-week methodology audit (PR #35) defects D-01, D-02 and D-03.
 *
 *  D-01  a novice who cannot run 3000 m continuously must not be asked for a mandatory checkpoint (it is refused);
 *  D-02  a routine checkpoint must not wipe the confirmed progression (counters, quality progression, gate/phase);
 *  D-03  confirmed THRESHOLD/VO2/SPECIFIC_3K successes must reach the existing dose step instead of being reset.
 *
 * Each test asserts the CORRECT behaviour; they fail on feature/issue-24-calendar without the engine change.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBreak, createEngine, prescribe, recordCheckpoint, recordResult, replan, updateTrainingData} from '../src/index.ts';
import type {EngineState} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, nextQuality, performQuality, profile} from './helpers.ts';

// ------------------------------------------------------------------------------------------------ D-01
const novice = () => createEngine(profile({performance: null, canRun3Km: false, regularRunningWeeks: 3, actualRunsPerWeek: 1, availableRunsPerWeek: 3,
  averageWeeklyKm4Weeks: 3, longestUsualRunKm: 1.5, qualitySessions8Weeks: 0, qualityWeeks8Weeks: 0, qualityMostlyTolerated: false, raceDate: dateAfter(84)}), NOW);

test('D01-1 a novice without continuous 3 km never has a mandatory checkpoint, also after 21+ days', () => {
  const s = novice();
  assert.equal(s.checkpointRequired, false);
  for (const days of [7, 21, 22, 35, 60]) {
    const later = replan(s, dateAfter(days));
    assert.equal(later.checkpointRequired, false, `day ${days}`);
    assert.ok(!later.decision.reasons.includes('CHECKPOINT_DUE'), `day ${days}: no CHECKPOINT_DUE`);
    assert.ok(later.queue.every(w => w.type !== 'CONTROL'), `day ${days}: no CONTROL slot`);
  }
  // ... and the engine keeps refusing the time trial it does not require
  assert.throws(() => recordCheckpoint(replan(s, dateAfter(24)), {timeSeconds: 1170, date: dateAfter(24), source: 'TEST_3K'}, dateAfter(24)), /Checkpoint not permitted/);
});

test('D01-2 the same holds on the result/skip paths of a running novice (not only on replan)', () => {
  let s = novice();
  for (let d = 0; d <= 30; d++) {
    s = replan(s, dateAfter(d));
    const w = s.queue.find(x => x.scheduledDate === dateAfter(d));
    if (w && w.type !== 'REST') s = recordResult(s, w.id, feedback(w, 'GREEN', {feedbackConfirmed: true}));
    assert.equal(s.checkpointRequired, false, `day ${d}`);
  }
});

test('D01-3 after continuous 3 km is confirmed the existing checkpoint rules apply again and the result is accepted', () => {
  const late = replan(novice(), dateAfter(24));
  const confirmed = updateTrainingData(late, {canRun3Km: true}, dateAfter(24));
  assert.equal(confirmed.checkpointRequired, true, 'the checkpoint is due as soon as it is possible');
  const done = recordCheckpoint(confirmed, {timeSeconds: 1170, date: dateAfter(24), source: 'TEST_3K'}, dateAfter(24));
  assert.equal(done.checkpointRequired, false);
  assert.equal(done.profile.performance?.timeSeconds, 1170);
  assert.equal(replan(done, dateAfter(24 + 21)).checkpointRequired, true, 'the 21-day rule applies to the measured result');
});

test('D01-4 a runner with confirmed 3 km keeps the 21-day checkpoint rule unchanged', () => {
  const s = createEngine(profile(), NOW);
  assert.equal(s.checkpointRequired, false);
  assert.equal(replan(s, dateAfter(20)).checkpointRequired, false);
  assert.equal(replan(s, dateAfter(21)).checkpointRequired, true);
});

// ------------------------------------------------------------------------------------------------ D-02
/** A prepared T3/Q2 runner whose result is close enough to the goal to reach SPECIFIC. */
const prepared = () => createEngine(profile({...experienced, actualRunsPerWeek: 4, availableRunsPerWeek: 4, averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9,
  performance: {timeSeconds: 900, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 870, raceDate: dateAfter(120)}), NOW);
const progressed = (): EngineState => {
  let s = prepared();
  for (let n = 0; n < 3; n++) s = performQuality(s);
  return s;
};
const checkpointAt = (s: EngineState, seconds: number): EngineState => {
  const date = dateAfter(2, s.asOf);
  return recordCheckpoint(replan(s, date), {timeSeconds: seconds, date, source: 'TEST_3K'}, date);
};

test('D02-1 precondition: three confirmed quality sessions reach SPECIFIC with an open partial gate', () => {
  const s = progressed();
  assert.ok(s.successfulQuality >= 3);
  assert.equal(s.decision.phase, 'SPECIFIC');
  assert.notEqual(s.decision.gate, 'CLOSED');
});

test('D02-2 a checkpoint that confirms the previous result keeps counters, streaks, phase and gate', () => {
  const before = progressed();
  const after = checkpointAt(before, 900);
  assert.equal(after.successfulQuality, before.successfulQuality);
  assert.equal(after.successfulIntro, before.successfulIntro);
  assert.equal(after.successfulSpecificPartial, before.successfulSpecificPartial);
  assert.deepEqual(after.successStreak, before.successStreak);
  assert.deepEqual(after.confirmedDoses, before.confirmedDoses);
  assert.equal(after.decision.phase, 'SPECIFIC', 'phase is not rolled back to DEVELOPMENT');
  assert.equal(after.decision.gate, before.decision.gate, 'gate is not closed again');
  assert.equal(after.checkpointRequired, false);
  assert.equal(after.lastAssessmentDate, after.asOf);
  assert.equal(after.greenPlusIds.length, 0, 'the GREEN_PLUS trigger of the checkpoint is consumed');
});

test('D02-3 an improved result recomputes paces and goal gap, but keeps the confirmed preparation', () => {
  const before = progressed();
  const after = checkpointAt(before, 885);
  assert.equal(after.profile.performance!.timeSeconds, 885);
  assert.equal(after.decision.currentSpeedMps, 3000 / 885, 'current speed is recomputed from the new result');
  assert.ok(after.decision.goalGap! < before.decision.goalGap!);
  assert.equal(after.successfulQuality, before.successfulQuality);
  assert.deepEqual(after.successStreak, before.successStreak);
  assert.equal(after.successfulSpecificPartial, before.successfulSpecificPartial, 'a better result keeps the SPECIFIC_3K gate evidence');
  const threshold = prescribe(after, 'THRESHOLD', dateAfter(1, after.asOf), 'p-new');
  const old = prescribe(before, 'THRESHOLD', dateAfter(1, before.asOf), 'p-old');
  assert.ok(threshold.speedRangeMps![1] > old.speedRangeMps![1], 'prescribed THRESHOLD pace follows the new result');
});

test('D02-4 a slower result recomputes paces and availability; the pace-anchored gate evidence is restarted, experience is kept', () => {
  const before = progressed();
  assert.ok(before.successfulSpecificPartial >= 0);
  before.successfulSpecificPartial = 2; // evidence for opening the target-pace gate
  const after = checkpointAt(before, 960); // ~6.7 % slower
  assert.equal(after.decision.currentSpeedMps, 3000 / 960);
  assert.ok(after.decision.goalGap! > before.decision.goalGap!);
  assert.equal(after.successfulSpecificPartial, 0, 'slower runner: the target-pace evidence no longer applies');
  assert.equal(after.successfulQuality, before.successfulQuality, 'completed quality sessions are not erased');
  assert.deepEqual(after.successStreak, before.successStreak);
  const far = checkpointAt(progressed(), 1000); // goal gap > 8 %: gate and SPECIFIC close by the existing rules
  assert.equal(far.decision.gate, 'CLOSED');
  assert.notEqual(far.decision.phase, 'SPECIFIC');
});

test('D02-5 restart is preserved when the checkpoint closes a break (re-entry): counters are reset as before', () => {
  let s = progressed();
  s = applyBreak(s, {days: 6, endDate: s.asOf, reason: 'WORK'}, s.asOf);
  assert.ok(s.reentry !== null);
  assert.ok(s.successfulQuality > 0, 'precondition: counter present before the checkpoint');
  const easy = s.queue.find(w => w.type === 'EASY')!;
  s = recordResult(s, easy.id, feedback(easy));
  const after = checkpointAt(s, 905);
  assert.equal(after.successfulQuality, 0);
  assert.equal(after.successfulIntro, 0);
  assert.equal(after.successfulSpecificPartial, 0);
  assert.deepEqual(after.successStreak, {});
  assert.equal(after.reentry, null);
});

test('D02-6 restart is preserved when the previous result was stale (confidence LOW): counters are reset as before', () => {
  const s = prepared();
  s.profile.performance = {timeSeconds: 900, date: dateAfter(-50), source: 'TEST_3K'};
  s.lastAssessmentDate = dateAfter(-50);
  s.successfulQuality = 2; s.successStreak = {THRESHOLD: 1};
  const after = recordCheckpoint(s, {timeSeconds: 895, date: NOW, source: 'TEST_3K'}, NOW);
  assert.equal(after.successfulQuality, 0);
  assert.deepEqual(after.successStreak, {});
});

test('D02-7 a failure still resets the streak and the checkpoint does not bring it back', () => {
  let s = performQuality(prepared());
  const next = nextQuality(s);
  s = recordResult(next.state, next.workout.id, feedback(next.workout, 'YELLOW'));
  assert.deepEqual(s.successStreak, {}, 'a YELLOW result clears the streak');
  s = checkpointAt(replan(s, dateAfter(7, s.asOf)), 900);
  assert.deepEqual(s.successStreak, {});
});

// ------------------------------------------------------------------------------------------------ D-03
const developing = () => createEngine(profile({actualRunsPerWeek: 3, availableRunsPerWeek: 3, regularRunningWeeks: 10, averageWeeklyKm4Weeks: 19, longestUsualRunKm: 8,
  qualitySessions8Weeks: 4, qualityWeeks8Weeks: 3, qualityMostlyTolerated: false, experience: {threshold: true, vo2: false, specific3k: false},
  // goal gap above 8 %: the plan stays in DEVELOPMENT, so THRESHOLD and VO2 alternate (the SPECIFIC phase is not involved)
  performance: {timeSeconds: 930, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 800, raceDate: dateAfter(120)}), NOW);

test('D03-1 two confirmed THRESHOLD sessions reach the existing dose step even when a checkpoint lies between them', () => {
  // T2/Q1 on purpose: THRESHOLD starts at 12 min, below the T2 ceiling (20), so a step is possible.
  let s = developing();
  assert.equal(s.decision.capacity, 'T2'); assert.equal(s.decision.quality, 'Q1'); assert.equal(s.decision.phase, 'DEVELOPMENT');
  const first = nextQuality(s); assert.equal(first.workout.type, 'THRESHOLD');
  s = recordResult(first.state, first.workout.id, feedback(first.workout));
  assert.equal(s.successStreak.THRESHOLD, 1);
  s = checkpointAt(s, 930);                                  // routine checkpoint confirming the result
  assert.equal(s.successStreak.THRESHOLD, 1, 'the success before the checkpoint still counts');
  s = performQuality(s);                                     // VO2 in between (rotation)
  const second = nextQuality(s, 'THRESHOLD');
  const executed = second.workout.main.dose.value;
  s = recordResult(second.state, second.workout.id, feedback(second.workout));
  assert.equal(s.confirmedDoses.THRESHOLD!.value, executed);
  assert.equal(s.doses.THRESHOLD!.value, executed + 3, 'Q1 step of the existing progression rule (+3 min, volume only)');
  assert.equal(s.doses.THRESHOLD!.unit, 'MINUTES');
});

test('D03-1b the SPECIFIC_3K dose also steps after confirmed sessions that straddle a checkpoint', () => {
  let s = createEngine(profile({actualRunsPerWeek: 3, availableRunsPerWeek: 3, regularRunningWeeks: 10, averageWeeklyKm4Weeks: 19, longestUsualRunKm: 8,
    qualitySessions8Weeks: 4, qualityWeeks8Weeks: 3, qualityMostlyTolerated: false, experience: {threshold: true, vo2: false, specific3k: false},
    performance: {timeSeconds: 930, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 870, raceDate: dateAfter(120)}), NOW);
  const types: string[] = [];
  for (let n = 0; n < 5 && !s.doses.SPECIFIC_3K; n++) {
    const next = nextQuality(s); types.push(next.workout.type);
    s = recordResult(next.state, next.workout.id, feedback(next.workout));
    if (n === 1) { assert.equal(s.decision.phase, 'SPECIFIC'); s = checkpointAt(s, 930); assert.equal(s.decision.phase, 'SPECIFIC'); }
  }
  const spec = nextQuality(s, 'SPECIFIC_3K');
  s = recordResult(spec.state, spec.workout.id, feedback(spec.workout));
  assert.ok(s.doses.SPECIFIC_3K!.value > s.confirmedDoses.SPECIFIC_3K!.value, `SPECIFIC_3K stepped after ${types.join(',')}`);
});

test('D03-2 a Q0 runner moves from INTRO_QUALITY to THRESHOLD and its dose grows across 21-day checkpoints', () => {
  let s = createEngine(profile({performance: {timeSeconds: 990, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 930, raceDate: dateAfter(120), actualRunsPerWeek: 3, availableRunsPerWeek: 3,
    averageWeeklyKm4Weeks: 13.5, longestUsualRunKm: 6, regularRunningWeeks: 12, qualitySessions8Weeks: 0, qualityWeeks8Weeks: 0, qualityMostlyTolerated: false}), NOW);
  assert.equal(s.decision.quality, 'Q0');
  const types: string[] = [];
  for (let n = 0; n < 6; n++) {
    const next = nextQuality(s); types.push(next.workout.type);
    s = recordResult(next.state, next.workout.id, feedback(next.workout));
    if (n === 2) s = checkpointAt(s, 990);
  }
  assert.deepEqual(types.slice(0, 2), ['INTRO_QUALITY', 'INTRO_QUALITY']);
  assert.ok(types.slice(2).every(t => t === 'THRESHOLD'), `after two confirmed introductions Q0 moves on to THRESHOLD: ${types.join(',')}`);
  const doses = s.confirmedDoses.THRESHOLD!.value;
  assert.ok(doses > 6, `THRESHOLD dose progressed beyond the introductory 6 minutes (got ${doses})`);
});

test('D03-3 a stale introductory dose of a Q0 runner who moved on to THRESHOLD no longer blocks the volume step', () => {
  const state = createEngine(profile({
    actualRunsPerWeek: 3, availableRunsPerWeek: 3, regularRunningWeeks: 40, averageWeeklyKm4Weeks: 13.5, longestUsualRunKm: 6,
    performance: {timeSeconds: 990, date: NOW, source: 'TEST_3K'}, qualitySessions8Weeks: 0, qualityWeeks8Weeks: 0, qualityMostlyTolerated: false, raceDate: dateAfter(110),
  }), NOW);
  state.history = []; state.queue = [];
  for (const offset of [0, 2, 4, 7, 9, 11]) {
    const w = prescribe(state, 'EASY', dateAfter(offset), 'verified-' + offset);
    state.history.push({workout: w, result: feedback(w, 'GREEN', {feedbackConfirmed: true, distanceMeters: w.main.dose.value, repeats: []}),
      classified: {evaluation: 'GREEN', yellowReason: null, sessionLoad: 100, inRangeFraction: 1, speedDropFraction: 0}});
  }
  // INTRO_QUALITY was raised 4 → 6 and never run again; THRESHOLD started from that 6 and was confirmed at 6
  state.doses.INTRO_QUALITY = {unit: 'MINUTES', value: 6}; state.confirmedDoses.INTRO_QUALITY = {unit: 'MINUTES', value: 4};
  state.doses.THRESHOLD = {unit: 'MINUTES', value: 6}; state.confirmedDoses.THRESHOLD = {unit: 'MINUTES', value: 6};
  const reviewed = replan(state, dateAfter(14));
  assert.equal(reviewed.easyProgression?.lastReviewedBlock, 0, 'the verified block is reviewed');
  assert.ok(reviewed.easyProgression!.approvedMetersPer7Days > 13500, 'and the volume step is granted');
  // a genuinely pending quality increase still occupies the step (existing rule, AUDIT-N2)
  const pending = structuredClone(state);
  pending.doses.THRESHOLD = {unit: 'MINUTES', value: 8};
  assert.equal(replan(pending, dateAfter(14)).easyProgression?.approvedMetersPer7Days, 13500);
});
