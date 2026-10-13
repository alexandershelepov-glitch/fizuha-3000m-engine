/**
 * Cross-PR regression: weekly-distance/frequency guard and the easy-effort
 * classification must work simultaneously without opening a false health hold.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, recordResult, replan} from '../src/index.ts';
import {NOW, dateAfter, feedback, profile} from './helpers.ts';

test('combined: seven free days and 10 km / two habitual runs yield two EASY sessions; RPE 4 remains GREEN', () => {
  let state = createEngine(profile({
    canRun3Km: false,
    performance: null,
    actualRunsPerWeek: 2,
    availableRunsPerWeek: 7,
    regularRunningWeeks: 4,
    averageWeeklyKm4Weeks: 10,
    longestUsualRunKm: 6,
    raceDate: dateAfter(80),
  }), NOW);

  const initial = [...state.queue];
  assert.equal(initial.length, 2);
  assert.ok(initial.every(w => w.type === 'EASY' && w.main.mode === 'RUN_WALK'));
  for (const w of initial) assert.deepEqual(w.targetRpe, [2, 4]);
  assert.equal(initial.reduce((sum, w) => sum + w.main.dose.value, 0), 10000);

  for (const workout of initial) {
    const current = state.queue.find(w => w.id === workout.id);
    assert.ok(current, 'remaining workout must not disappear after a normal report');
    state = recordResult(state, current.id, feedback(current, 'GREEN', {
      sessionRpe: 4,
      completionFraction: 1,
      distanceMeters: current.main.dose.value,
      durationMinutes: 35,
      repeats: [],
    }));
    assert.equal(state.history.at(-1)?.classified.evaluation, 'GREEN');
    assert.equal(state.relatedYellow, false);
    assert.equal(state.diagnosticHold, false);
    assert.equal(state.decision.safety, 'OK');
  }

  const followingWeek = replan(state, dateAfter(7));
  assert.ok(followingWeek.queue.filter(w => w.type !== 'REST').length <= 2);
  const totalMeters = followingWeek.queue
    .filter(w => w.main.dose.unit === 'METERS')
    .reduce((sum, w) => sum + w.main.dose.value, 0);
  assert.ok(totalMeters <= 10000);
});

test('combined: normal RPE 4 never overrides an acute illness STOP', () => {
  const state = createEngine(profile({
    performance: null, canRun3Km: false, actualRunsPerWeek: 2,
    availableRunsPerWeek: 7, averageWeeklyKm4Weeks: 10,
    longestUsualRunKm: 6, raceDate: dateAfter(80),
  }), NOW);
  const workout = state.queue[0]!;
  const ill = recordResult(state, workout.id, feedback(workout, 'GREEN', {
    sessionRpe: 4,
    safety: {...workoutSafety(), acuteIllness: true},
  }));
  assert.equal(ill.history.at(-1)?.classified.evaluation, 'RED');
  assert.equal(ill.decision.safety, 'STOP');
  assert.ok(ill.queue.every(w => !w.countsAsQuality));
});

function workoutSafety() {
  return {
    pain: 0, painIncreasing: false, alteredMovement: false,
    painWalkingOrRest: false, swelling: false, acuteIllness: false,
    otherStop: false, needsAssessment: false,
  };
}
