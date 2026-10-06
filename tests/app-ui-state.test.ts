/**
 * UI-state derivation: a pure reading of what the engine already decided. The tests check the
 * documented selection order and that no state is invented.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, recordFinalResult, recordResult} from '../src/index.ts';
import type {EngineState} from '../src/index.ts';
import {deriveCycleStatus, deriveToday, TODAY_STATES} from '../web/src/application/uiState.ts';
import {deserializeEngineState, serializeEngineState} from '../web/src/application/engineGateway.ts';
import {TODAY_LABELS} from './helpers-app.ts';
import {NOW, dateAfter, feedback, healthy, profile} from './helpers.ts';

const engineState = (overrides: Parameters<typeof profile>[0] = {}, today = NOW): EngineState =>
  createEngine(profile(overrides), today);

test('UI-01 every engine-driven Today state is reachable through real data', () => {
  // A workout is planned for today.
  assert.equal(deriveToday(engineState({availableRunsPerWeek: 4}), NOW).state, 'WORKOUT_TODAY');

  // Today's session is already recorded, so nothing is left for today.
  const withTakenWorkout = engineState({availableRunsPerWeek: 4});
  const done = recordResult(withTakenWorkout, withTakenWorkout.queue[0]!.id, feedback(withTakenWorkout.queue[0]!));
  assert.equal(deriveToday(done, NOW).state, 'REST_DAY');

  // The clock moved past an unrecorded session: INV-1 territory.
  assert.equal(deriveToday(engineState({availableRunsPerWeek: 4}), dateAfter(2)).state, 'PENDING_RESULT');

  // No result yet: the engine asks for a checkpoint.
  assert.equal(deriveToday(engineState({performance: null}), NOW).state, 'CHECKPOINT_REQUIRED');

  // Safety flags put the plan on hold.
  assert.equal(deriveToday(engineState({safety: {...healthy(), pain: 3}}), NOW).state, 'TRAINING_HOLD');

  // Close to the race the engine switches to the taper phase.
  assert.equal(deriveToday(engineState({raceDate: dateAfter(3)}), NOW).state, 'TAPER');

  // Race day itself.
  assert.equal(deriveToday(engineState({raceDate: NOW}), NOW).state, 'RACE_DAY');

  // The race date passed without a result, and every session before it was dealt with.
  const beforeRace = engineState({raceDate: dateAfter(1)});
  const closed = recordResult(beforeRace, beforeRace.queue[0]!.id, feedback(beforeRace.queue[0]!));
  assert.equal(deriveToday(closed, dateAfter(2)).state, 'AWAITING_FINAL_RESULT');
  // The terminal form must remain reachable even with old unresolved sessions; INV-1 still guards normal updates.
  assert.equal(deriveToday(engineState({raceDate: dateAfter(2)}), dateAfter(3)).state, 'AWAITING_FINAL_RESULT');

  // A completed cycle.
  const racing = engineState({raceDate: NOW});
  const finished = recordFinalResult(racing, {timeSeconds: 900, date: racing.profile.raceDate, source: 'TEST_3K'}, NOW);
  assert.equal(deriveToday(finished, NOW).state, 'COMPLETED');
  assert.equal(deriveToday(finished, dateAfter(10)).state, 'COMPLETED', 'a finished cycle stays finished');

  // An empty queue before the race: not produced by normal flows, but the renderer must handle it.
  const tampered = JSON.parse(serializeEngineState(engineState())) as EngineState;
  tampered.queue = [];
  assert.equal(deriveToday(deserializeEngineState(JSON.stringify(tampered)), NOW).state, 'EMPTY_QUEUE');
});

test('UI-02 the selection order is the documented one', () => {
  assert.deepEqual([...TODAY_STATES], [
    'COMPLETED', 'AWAITING_FINAL_RESULT', 'RACE_DAY', 'PENDING_RESULT', 'TRAINING_HOLD',
    'TAPER', 'CHECKPOINT_REQUIRED', 'WORKOUT_TODAY', 'EMPTY_QUEUE', 'REST_DAY',
  ]);
  // A pending result outranks the taper: the plan is not recalculated before the result is recorded.
  const taperWithPending = engineState({raceDate: dateAfter(3), availableRunsPerWeek: 4});
  assert.equal(deriveToday(taperWithPending, dateAfter(2)).state, 'PENDING_RESULT');
  // A finished cycle outranks everything.
  const racing = engineState({raceDate: dateAfter(2)});
  const finished = recordFinalResult(racing, {timeSeconds: 900, date: racing.profile.raceDate, source: 'TEST_3K'}, dateAfter(3));
  assert.equal(deriveToday(finished, dateAfter(3)).state, 'COMPLETED');
});

test('UI-03 the view exposes only engine data', () => {
  const state = engineState({availableRunsPerWeek: 4});
  const view = deriveToday(state, NOW);
  assert.equal(view.workout?.id, state.queue[0]!.id);
  assert.ok(view.nextWorkout === null || view.nextWorkout.scheduledDate > NOW);
  assert.deepEqual(view.pendingWorkouts, []);
  assert.equal(view.daysToRace, 42);
  assert.deepEqual(Object.keys(view).sort(), ['daysToRace', 'deviceToday', 'nextWorkout', 'pendingWorkouts', 'state', 'workout']);
});

test('UI-04 the cycle status follows the architecture, not a stored field', () => {
  assert.equal(deriveCycleStatus(engineState(), NOW), 'ACTIVE');
  assert.equal(deriveCycleStatus(engineState({raceDate: NOW}), NOW), 'ACTIVE', 'race day itself is still active');
  assert.equal(deriveCycleStatus(engineState({raceDate: dateAfter(2)}), dateAfter(3)), 'AWAITING_FINAL_RESULT');
  const racing = engineState({raceDate: NOW});
  assert.equal(deriveCycleStatus(recordFinalResult(racing, {timeSeconds: 900, date: NOW, source: 'TEST_3K'}, NOW), NOW), 'COMPLETED');
});

test('UI-05 every state has Russian text in the copy layer', () => {
  for (const state of TODAY_STATES) {
    assert.ok(TODAY_LABELS[state], `${state} has no copy`);
    assert.ok(TODAY_LABELS[state].length > 0);
  }
});
