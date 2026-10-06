/**
 * Regression tests for the final race-day decision (approved decision C1).
 *
 * 1. `raceDate` is the day of the final 3000 m race itself: the ordinary training queue covers
 *    only dates strictly before it. No post-race phase is introduced.
 * 2. The result of that race may be recorded on the race day or later, becomes Current
 *    Performance, closes the checkpoint and produces no training queue.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, day, deserialize, moveWorkout, recordCheckpoint, recordFinalResult, replan,
        serialize, skipWorkout, updateTrainingData, EventDatePassedError} from '../src/index.ts';
import type {EngineState, Profile, WorkoutType} from '../src/index.ts';
import {NOW, dateAfter, experienced, healthy, profile as baseProfile} from './helpers.ts';

/** Ordinary training session types, never prescribed on the race day itself. */
const ORDINARY: WorkoutType[] = ['EASY', 'LONG_EASY', 'STRIDES', 'INTRO_QUALITY', 'THRESHOLD', 'VO2', 'SPECIFIC_3K'];

const prepared = (o: Partial<Profile> = {}): Profile => baseProfile({
  ...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4,
  averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(30), ...o,
});
const isEventDatePassed = (e: unknown) => e instanceof EventDatePassedError && e.code === 'EVENT_DATE_PASSED';
/** Advance an active plan to the race day (allowed: `raceDate = now`). */
function atRaceDay(raceOffset = 5): EngineState {
  return replan(createEngine(prepared({raceDate: dateAfter(raceOffset)}), NOW), dateAfter(raceOffset));
}

// ==================== 1. raceDate is the day of the race itself ====================
test('RD01 raceDate = today leaves the ordinary training queue empty', () => {
  const s = createEngine(prepared({raceDate: NOW}), NOW);
  assert.deepEqual(s.queue, [], 'the race day is the event, not a training day');
  assert.equal(s.decision.phase, 'TAPER', 'the race day itself is the last day of the taper');
  assert.equal(s.finalResultRecorded, false);
});

test('RD02 raceDate = tomorrow plans sessions only for today', () => {
  const s = createEngine(prepared({raceDate: dateAfter(1)}), NOW);
  assert.ok(s.queue.length > 0, 'today can still be trained');
  for (const w of s.queue) {
    assert.equal(w.scheduledDate, NOW, `${w.type}@${w.scheduledDate} must fall on today only`);
    assert.ok(day(w.scheduledDate) < day(s.profile.raceDate));
  }
});

test('RD03 no ordinary session is ever scheduled on or after raceDate', () => {
  for (const raceOffset of [0, 1, 2, 3, 5, 7, 10, 14, 28, 60]) {
    for (const avail of [1, 2, 3, 4, 5, 7]) {
      const s = createEngine(baseProfile({
        ...experienced, availableRunsPerWeek: avail, actualRunsPerWeek: 4,
        averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(raceOffset),
      }), NOW);
      for (const w of s.queue) {
        assert.ok(day(w.scheduledDate) < day(s.profile.raceDate),
          `${w.type}@${w.scheduledDate} is not strictly before raceDate (offset=${raceOffset}, avail=${avail})`);
        assert.ok(!ORDINARY.includes(w.type) || day(w.scheduledDate) < day(s.profile.raceDate));
      }
      assert.deepEqual(s.queue.filter(w => w.scheduledDate === s.profile.raceDate), [],
        `nothing may be planned on the race day (offset=${raceOffset})`);
      if (raceOffset === 0) assert.deepEqual(s.queue, [], 'the race day alone leaves no plan');
    }
  }
});

test('RD04 a workout cannot be moved onto or past the race day', () => {
  const s = createEngine(prepared({raceDate: dateAfter(3)}), NOW);
  const w = s.queue[0]!;
  assert.throws(() => moveWorkout(s, w.id, s.profile.raceDate), /horizon/, 'the race day is not a training slot');
  assert.throws(() => moveWorkout(s, w.id, dateAfter(1, s.profile.raceDate)), /horizon/);
  const withinWindow = [dateAfter(1), dateAfter(2)].filter(d => day(d) < day(s.profile.raceDate));
  assert.ok(withinWindow.length > 0, 'precondition: dates before the race exist inside the horizon');
  assert.equal(s.queue.some(x => day(x.scheduledDate) >= day(s.profile.raceDate)), false);
});

// ==================== 2. the final result of the race ====================
test('RD05 the final result can be recorded on the race day', () => {
  const before = atRaceDay(5);
  const race = before.profile.raceDate;
  const after = recordFinalResult(before, {timeSeconds: 880, date: race, source: 'TEST_3K'}, race);
  assert.equal(after.profile.performance!.timeSeconds, 880, 'the result becomes Current Performance');
  assert.equal(after.profile.performance!.date, race);
  assert.equal(after.profile.performance!.source, 'TEST_3K');
  assert.equal(after.finalResultRecorded, true, 'the cycle is marked as closed');
  assert.equal(after.checkpointRequired, false, 'the checkpoint is closed');
  assert.equal(after.lastAssessmentDate, race);
  assert.deepEqual(after.queue, [], 'no training queue exists after the event');
  assert.equal(after.decision.currentSpeedMps, 3000 / 880);
});

test('RD06 the final result dated on raceDate can be recorded the next day', () => {
  const before = atRaceDay(5);
  const race = before.profile.raceDate;
  const after = recordFinalResult(before, {timeSeconds: 900, date: race, source: 'OFFICIAL_3K'}, dateAfter(1, race));
  assert.equal(after.profile.performance!.timeSeconds, 900, 'a late submission is still saved');
  assert.equal(after.profile.performance!.source, 'OFFICIAL_3K');
  assert.equal(after.finalResultRecorded, true);
  assert.equal(after.checkpointRequired, false);
  assert.deepEqual(after.queue, []);
  assert.equal(after.asOf, dateAfter(1, race));
});

test('RD07 a performance dated after the race date is rejected', () => {
  const before = atRaceDay(5);
  const race = before.profile.raceDate;
  assert.throws(() => recordFinalResult(before, {timeSeconds: 880, date: dateAfter(1, race), source: 'TEST_3K'}, dateAfter(1, race)),
    /event date/);
  assert.throws(() => recordFinalResult(before, {timeSeconds: 880, date: dateAfter(-1, race), source: 'TEST_3K'}, race),
    /event date/);
  // The normal in-cycle checkpoint also refuses a result dated after the race.
  assert.throws(() => recordCheckpoint(before, {timeSeconds: 880, date: dateAfter(1, race), source: 'TEST_3K'}, race));
  // And the rejected calls leave the input state untouched.
  assert.equal(before.profile.performance!.date, NOW);
  assert.equal(before.finalResultRecorded, false);
});

test('RD08 an ordinary replan after raceDate is still EVENT_DATE_PASSED', () => {
  const before = atRaceDay(5);
  const race = before.profile.raceDate;
  assert.throws(() => replan(before, dateAfter(1, race)), isEventDatePassed);
  assert.throws(() => createEngine(prepared({raceDate: race}), dateAfter(1, race)), isEventDatePassed);
  // Operations that take a workout id reach the same guard as soon as they advance the clock.
  const active = createEngine(prepared({raceDate: dateAfter(5)}), NOW);
  assert.ok(active.queue.length > 0, 'precondition: the active plan still has sessions');
  const id = active.queue[0]!.id;
  const after = dateAfter(6, NOW);
  assert.throws(() => skipWorkout(active, id, after), isEventDatePassed);
  assert.throws(() => replan(active, after), isEventDatePassed);
  assert.throws(() => updateTrainingData(active, {regularRunningWeeks: 30}, after), isEventDatePassed);
  assert.throws(() => recordCheckpoint(active, {timeSeconds: 880, date: race, source: 'TEST_3K'}, after), isEventDatePassed);
});

test('RD09 saving the final result never creates a queue, and none can be created afterwards', () => {
  const before = atRaceDay(5);
  const race = before.profile.raceDate;
  const after = recordFinalResult(before, {timeSeconds: 875, date: race, source: 'TEST_3K'}, dateAfter(3, race));
  assert.deepEqual(after.queue, [], 'the terminal state holds no workouts');
  assert.deepEqual(after.movedWorkouts, [], 'no workout is carried over');
  assert.throws(() => replan(after, dateAfter(4, race)), isEventDatePassed, 'no plan can be rebuilt after the event');
  assert.throws(() => replan(after), isEventDatePassed, 'even the default replan is refused, since its clock is past the event');
});

test('RD10 the terminal state survives serialisation while active states keep the guard', () => {
  const before = atRaceDay(5);
  const race = before.profile.raceDate;
  const terminal = recordFinalResult(before, {timeSeconds: 870, date: race, source: 'TEST_3K'}, dateAfter(2, race));
  const restored = deserialize(serialize(terminal));
  assert.equal(serialize(restored), serialize(terminal), 'save/load is exact');
  assert.equal(restored.finalResultRecorded, true);
  assert.deepEqual(restored.queue, []);
  assert.equal(restored.profile.performance!.timeSeconds, 870);
  // An active state whose clock has passed the race is still refused.
  const tampered = JSON.parse(serialize(before)) as EngineState;
  tampered.asOf = dateAfter(1, race);
  assert.throws(() => deserialize(JSON.stringify(tampered)), isEventDatePassed);
});

test('RD11 the final result is rejected for invalid input and never mutates its arguments', () => {
  const before = atRaceDay(5);
  const race = before.profile.raceDate;
  const snapshot = serialize(before);
  assert.throws(() => recordFinalResult(before, {timeSeconds: 880, date: race, source: 'GUESS' as never}, race), /source/);
  assert.throws(() => recordFinalResult(before, {timeSeconds: 0, date: race, source: 'TEST_3K'}, race), /Number outside/);
  assert.throws(() => recordFinalResult(before, {timeSeconds: NaN, date: race, source: 'TEST_3K'}, race), /Number outside/);
  assert.throws(() => recordFinalResult(before, {timeSeconds: 880, date: race, source: 'TEST_3K'}, dateAfter(-1, race)),
    /before the event date/);
  assert.equal(serialize(before), snapshot, 'the input state is never mutated');
});

test('RD12 the final result is a record of the event, and safety still drives the decision', () => {
  // The race is a fact of the calendar: a lingering safety flag must not prevent saving its result.
  const injured = createEngine(prepared({raceDate: dateAfter(3), safety: {...healthy(), pain: 3}}), NOW);
  const race = injured.profile.raceDate;
  const after = recordFinalResult(injured, {timeSeconds: 890, date: race, source: 'TEST_3K'}, race);
  assert.equal(after.profile.performance!.timeSeconds, 890);
  assert.equal(after.profile.safety.pain, 3, 'the reported safety state is preserved verbatim');
  assert.equal(after.decision.safety, 'HOLD', 'safety still governs the assessment');
  assert.equal(after.decision.phase, 'HOLD_DIAGNOSTIC');
  assert.deepEqual(after.queue, [], 'and still nothing is prescribed');
});

test('RD13 the terminal state never opens the gate towards the target pace', () => {
  const before = atRaceDay(5);
  const race = before.profile.raceDate;
  // Even with confirmations already on record, the closed cycle prescribes nothing.
  before.successfulQuality = 2;
  const after = recordFinalResult(before, {timeSeconds: 1000, date: race, source: 'TEST_3K'}, race);
  assert.equal(after.decision.gate, 'CLOSED');
  assert.equal(after.decision.effectiveSpeedMps, after.decision.currentSpeedMps);
  assert.deepEqual(after.queue, [], 'the gate state is moot because no plan exists');
});
