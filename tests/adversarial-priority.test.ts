/**
 * Adversarial audit — precedence when several conditions hold at once.
 *
 * spec 11 fixes the order: Safety -> no performance / cannot run 3 km -> T0 ->
 * significant healthy break -> LOW confidence -> taper -> SPECIFIC -> DEVELOPMENT.
 * These tests force collisions and pin which rule actually wins.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBreak, createEngine, deserialize, moveWorkout, recordResult, replan, resolveDiagnostic, serialize} from '../src/index.ts';
import type {EngineState, Profile, WorkoutType} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, healthy, profile as baseProfile} from './helpers.ts';

const fast = (o: Partial<Profile> = {}): Profile => baseProfile({
  ...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4,
  averageWeeklyKm4Weeks: 30, longestUsualRunKm: 9, raceDate: dateAfter(90), ...o,
});
/** Drive the public API until the Target Pace Gate is genuinely OPEN. */
function reachGateOpen(): EngineState {
  let s = createEngine(baseProfile({
    ...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4, averageWeeklyKm4Weeks: 30,
    longestUsualRunKm: 9, performance: {timeSeconds: 900, date: NOW, source: 'TEST_3K'},
    targetTimeSeconds: 880, raceDate: dateAfter(90),
  }), NOW);
  const perform = (type?: WorkoutType) => {
    for (let n = 0; n < 90; n++) {
      const w = s.queue.find(x => x.countsAsQuality && (!type || x.type === type));
      if (w) { s = recordResult(s, w.id, feedback(w)); return; }
      s = replan(s, dateAfter(1, s.asOf));
    }
    throw new Error(`no quality workout of type ${type}`);
  };
  for (let i = 0; i < 3; i++) perform();
  for (let i = 0; i < 8 && s.decision.gate !== 'OPEN'; i++) perform('SPECIFIC_3K' as WorkoutType);
  return s;
}

test('C01 Safety STOP outranks an imminent start (TAPER)', () => {
  const s = createEngine(baseProfile({safety: {...healthy(), otherStop: true}, raceDate: dateAfter(2)}), NOW);
  assert.equal(s.decision.safety, 'STOP');
  assert.equal(s.decision.phase, 'HOLD_DIAGNOSTIC');
  assert.equal(s.decision.gate, 'CLOSED');
  assert.equal(s.decision.maximumQualityPerWeek, 0);
  assert.ok(s.queue.every(w => !w.countsAsQuality));
  assert.ok(s.decision.reasons.includes('SAFETY_STOP'));
});

test('C02 Safety HOLD outranks an imminent start and offers only REST', () => {
  const s = createEngine(baseProfile({safety: {...healthy(), pain: 3}, raceDate: dateAfter(2)}), NOW);
  assert.equal(s.decision.phase, 'HOLD_DIAGNOSTIC');
  assert.ok(s.queue.every(w => w.type === 'REST'));
  assert.ok(s.decision.reasons.includes('SAFETY_HOLD'));
});

test('C03 significant healthy break outranks an imminent start (RE_ENTRY before TAPER)', () => {
  let s = createEngine(baseProfile({...experienced, raceDate: dateAfter(3)}), NOW);
  assert.equal(s.decision.phase, 'TAPER', 'precondition: the taper window is already open');
  s = applyBreak(s, {days: 9, endDate: NOW, reason: 'WORK'}, NOW);
  assert.equal(s.decision.phase, 'RE_ENTRY');
  assert.equal(s.decision.gate, 'CLOSED');
  assert.ok(s.decision.reasons.includes('REENTRY_AFTER_BREAK'));
});

test('C04 LONG_TERM plus a fresh result still never trains off the target pace', () => {
  const s = createEngine(baseProfile({
    performance: {timeSeconds: 1100, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 810,
    raceDate: dateAfter(60), regularRunningWeeks: 30, actualRunsPerWeek: 4,
    availableRunsPerWeek: 4, averageWeeklyKm4Weeks: 30, longestUsualRunKm: 9,
    qualitySessions8Weeks: 4, qualityWeeks8Weeks: 4,
  }), NOW);
  assert.equal(s.decision.feasibility, 'LONG_TERM');
  assert.equal(s.decision.gate, 'CLOSED');
  assert.equal(s.decision.confidence, 'HIGH');
  assert.equal(s.decision.effectiveSpeedMps, s.decision.currentSpeedMps);
  assert.equal(s.decision.effectiveSpeedMps, 3000 / 1100);
  assert.ok(s.decision.reasons.includes('GOAL_GAP_TOO_LARGE'));
  assert.ok(s.queue.every(w => w.anchor !== 'EFFECTIVE'), 'no workout may be anchored to the target');
  // VO2 is legitimately faster than the current 3 km pace (spec 15: 97-103% of current speed),
  // but the unreachable target speed must never appear inside any prescribed range.
  const targetSpeed = 3000 / s.profile.targetTimeSeconds;
  assert.ok(s.queue.every(w => !w.speedRangeMps || w.speedRangeMps[1] < targetSpeed),
    'no prescribed speed range may reach the target speed while the gate is CLOSED');
});

test('C05 LOW confidence outranks SPECIFIC eligibility', () => {
  // Every SPECIFIC precondition except a trustworthy result (the test is 43 days old).
  const s = createEngine(baseProfile({
    ...experienced, performance: {timeSeconds: 900, date: dateAfter(-43), source: 'TEST_3K'},
    targetTimeSeconds: 880, raceDate: dateAfter(56), regularRunningWeeks: 52, actualRunsPerWeek: 4,
    availableRunsPerWeek: 4, averageWeeklyKm4Weeks: 30, longestUsualRunKm: 9,
  }), NOW);
  s.successfulQuality = 2;
  const after = replan(s, NOW);
  assert.equal(after.decision.confidence, 'LOW');
  assert.equal(after.decision.capacity, 'T3');
  assert.equal(after.decision.quality, 'Q2');
  assert.notEqual(after.decision.phase, 'SPECIFIC');
  assert.equal(after.decision.phase, 'HOLD_DIAGNOSTIC');
  assert.equal(after.decision.gate, 'CLOSED');
  assert.ok(after.decision.reasons.includes('PERFORMANCE_CONFIDENCE_LOW'));
});

test('C06 T0 outranks an imminent start (FOUNDATION before TAPER)', () => {
  const s = createEngine(baseProfile({
    performance: null, canRun3Km: false, regularRunningWeeks: 1, actualRunsPerWeek: 1,
    availableRunsPerWeek: 2, averageWeeklyKm4Weeks: 3, longestUsualRunKm: 2, raceDate: dateAfter(2),
  }), NOW);
  assert.equal(s.decision.phase, 'FOUNDATION');
  assert.equal(s.decision.gate, 'CLOSED');
  assert.ok(s.queue.every(w => !['VO2', 'SPECIFIC_3K'].includes(w.type)));
});

test('C07 RED cancels quality already planned into the future, including moved workouts', () => {
  let s = createEngine(fast(), NOW);
  const qualities = s.queue.filter(w => w.countsAsQuality);
  assert.ok(qualities.length >= 2, 'precondition: two quality sessions were planned');
  const occupied = new Set([...s.queue.map(w => w.scheduledDate), ...s.history.map(h => h.result.date)]);
  const free = Array.from({length: 7}, (_, i) => dateAfter(i, s.asOf)).find(d => !occupied.has(d))!;
  s = moveWorkout(s, qualities[1]!.id, free);
  s = replan(s, s.asOf);
  const first = s.queue.find(w => w.countsAsQuality)!;
  s = recordResult(s, first.id, feedback(first, 'RED'));
  assert.equal(s.decision.phase, 'HOLD_DIAGNOSTIC');
  assert.ok(s.queue.every(w => !w.countsAsQuality));
  assert.ok(deserialize(serialize(s)).queue.every(w => !w.countsAsQuality), 'RED must not be undone by a replan');
  assert.ok(s.movedWorkouts.every(() => !s.queue.some(q => q.countsAsQuality)));
});

test('C08 two related YELLOW outrank an approaching start', () => {
  let s = createEngine(baseProfile({...experienced, raceDate: dateAfter(30)}), NOW);
  const perform = (kind: 'GREEN' | 'YELLOW') => {
    for (let n = 0; n < 90; n++) {
      const w = s.queue.find(x => x.countsAsQuality);
      if (w) { s = recordResult(s, w.id, feedback(w, kind, kind === 'YELLOW' ? {unexpectedFatigue: true} : {})); return; }
      s = replan(s, dateAfter(1, s.asOf));
    }
    throw new Error('no quality');
  };
  perform('YELLOW');
  for (let n = 0; n < 90; n++) {
    const easy = s.queue.find(x => x.type === 'EASY');
      if (easy) { s = recordResult(s, easy.id, feedback(easy, 'YELLOW', {unexpectedFatigue: true})); break; }
    s = replan(s, dateAfter(1, s.asOf));
  }
  assert.equal(s.relatedYellow, true);
  assert.notEqual(s.decision.phase, 'HOLD_DIAGNOSTIC');
  assert.equal(s.decision.gate, 'CLOSED');
  assert.equal(s.decision.maximumQualityPerWeek, 0);
  assert.ok(s.queue.every(w => !w.countsAsQuality));
  assert.ok(s.decision.reasons.includes('TWO_RELATED_YELLOW'));
});

test('C09 an OPEN gate is closed again by a long healthy break', () => {
  const open = reachGateOpen();
  assert.equal(open.decision.gate, 'OPEN', 'precondition: the gate is genuinely OPEN');
  const after = applyBreak(open, {days: 9, endDate: dateAfter(9, open.asOf), reason: 'WORK'}, dateAfter(9, open.asOf));
  assert.equal(after.decision.gate, 'CLOSED');
  assert.equal(after.decision.phase, 'RE_ENTRY');
  assert.ok(after.queue.every(w => !w.countsAsQuality));
});

test('C10 an OPEN gate is closed again by a new YELLOW', () => {
  const open = reachGateOpen();
  const w = open.queue.find(x => x.countsAsQuality)!;
  const after = recordResult(open, w.id, feedback(w, 'YELLOW', {unexpectedFatigue: true}));
  assert.equal(after.decision.gate, 'CLOSED');
  assert.equal(after.progressionBlocked, true);
  assert.equal(after.decision.effectiveSpeedMps, after.decision.currentSpeedMps, 'CLOSED must fall back to current speed');
});

test('C11 an OPEN gate is closed again by RED, with no quality left anywhere', () => {
  const open = reachGateOpen();
  const w = open.queue[0]!;
  const after = recordResult(open, w.id, feedback(w, 'RED'));
  assert.equal(after.decision.phase, 'HOLD_DIAGNOSTIC');
  assert.equal(after.decision.gate, 'CLOSED');
  assert.equal(after.decision.maximumQualityPerWeek, 0);
  assert.ok(after.queue.every(w => !w.countsAsQuality));
});

test('C12 TAPER suppresses the diagnostic CONTROL workout without losing the checkpoint request', () => {
  const inTaper = createEngine(baseProfile({raceDate: dateAfter(4)}), NOW);
  assert.equal(inTaper.decision.phase, 'TAPER');
  assert.ok(!inTaper.queue.some(w => w.type === 'CONTROL'), 'no 3 km time trial inside the taper');
  assert.ok(inTaper.queue.length > 0, 'the taper still plans sessions');
  assert.ok(inTaper.queue.every(w => w.scheduledDate <= inTaper.profile.raceDate), 'nothing is planned after the race date');
  assert.ok(inTaper.queue.every(w => w.type === 'REST' || w.volumeFactor <= 0.6),
    'taper reduces active sessions and can replace the eve of the race with rest');
  // The checkpoint request itself survives inside the active window.
  const carried = replan(inTaper, inTaper.profile.raceDate);
  assert.equal(carried.decision.phase, 'TAPER');
  assert.ok(!carried.queue.some(w => w.type === 'CONTROL'));
});

test('C13 RED outranks the diagnostic-hold release path: an ordinary GREEN REST cannot clear it', () => {
  let s = createEngine(fast(), NOW);
  const w = s.queue[0]!;
  s = recordResult(s, w.id, feedback(w, 'RED'));
  assert.equal(s.diagnosticHold, true);
  const rest = s.queue[0]!;
  assert.equal(rest.type, 'REST');
  s = recordResult(s, rest.id, feedback(rest));
  assert.equal(s.diagnosticHold, true);
  assert.equal(s.decision.phase, 'HOLD_DIAGNOSTIC');
  assert.ok(s.queue.every(w => !w.countsAsQuality));
  // only the explicit clinical/training exit may release it
  const released = resolveDiagnostic(s, healthy(), s.asOf);
  assert.notEqual(released.decision.phase, 'HOLD_DIAGNOSTIC');
});
