/**
 * The application operation that closes a workout.
 *
 * It must let the engine decide, persist before returning, and never invent a verdict or a reason.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCycle} from '../web/src/application/cycle.ts';
import {submitWorkoutResult} from '../web/src/application/workoutResult.ts';
import {diffPlan, nextWorkout, summariseWorkout} from '../web/src/application/planDiff.ts';
import {loadActiveCycle, ACTIVE_CYCLE_KEY} from '../web/src/application/storage.ts';
import {buildProfile} from '../web/src/application/questionnaire.ts';
import {deriveToday} from '../web/src/application/uiState.ts';
import {hasPendingResults, earliestPending} from '../web/src/application/invariants.ts';
import {deserializeEngineState} from '../web/src/application/engineGateway.ts';
import type {EngineState} from '../web/src/application/engineGateway.ts';
import {CYCLE_ID, CREATED_AT, draft, memoryStorage, repository} from './helpers-app.ts';
import {NOW, dateAfter, experienced, feedback, profile} from './helpers.ts';

function cycleFixture(overrides: Parameters<typeof profile>[0] = {}, createdOn = NOW) {
  const storage = memoryStorage();
  const built = buildProfile(draft({resultDate: createdOn}));
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error('fixture');
  const created = createCycle(repository(storage), {
    profile: profile({...built.profile, ...overrides}),
    deviceToday: createdOn,
    cycleId: CYCLE_ID,
    createdAt: CREATED_AT,
    locale: 'ru-RU',
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('fixture');
  return {
    storage,
    repo: repository(storage),
    appState: created.appState,
    engineState: created.engineState,
    raw: storage.map.get(ACTIVE_CYCLE_KEY)!,
  };
}

const firstWorkout = (state: EngineState) => state.queue[0]!;

test('RESULT-01 a successful session is classified GREEN by the engine and stored', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);

  const outcome = submitWorkoutResult({
    repo: fixture.repo,
    appState: fixture.appState,
    engineState: fixture.engineState,
    workoutId: workout.id,
    result: feedback(workout, 'GREEN'),
    deviceToday: NOW,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.done.evaluation, 'GREEN');
  assert.equal(outcome.done.yellowReason, null);

  // The new engine state is the one that was serialized and stored (INV-4).
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), JSON.stringify(outcome.done.appState));
  const reloaded = loadActiveCycle(fixture.repo);
  assert.equal(reloaded.kind, 'READY');
  if (reloaded.kind !== 'READY') return;
  assert.deepEqual(reloaded.engineState.history.map((entry) => entry.workout.id), [workout.id]);
  assert.equal(reloaded.engineState.history[0]!.classified.evaluation, 'GREEN');
  assert.equal(reloaded.engineState.queue.some((entry) => entry.id === workout.id), false, 'the session left the queue');
});

test('RESULT-02 GREEN_PLUS comes from the engine, not from the UI', () => {
  const fixture = cycleFixture({...experienced, availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);

  const outcome = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, result: feedback(workout, 'GREEN_PLUS'), deviceToday: NOW,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.done.evaluation, 'GREEN_PLUS');
});

test('RESULT-03 an incomplete session is YELLOW and carries the engine reason', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);

  const outcome = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id,
    result: feedback(workout, 'YELLOW', {unexpectedFatigue: true}),
    deviceToday: NOW,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.done.evaluation, 'YELLOW');
  assert.notEqual(outcome.done.yellowReason, null);
  assert.equal(outcome.done.engineState.history[0]!.classified.yellowReason, outcome.done.yellowReason);
});

test('RESULT-04 a safety flag makes the engine stop the usual load', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);

  const outcome = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id,
    result: feedback(workout, 'RED'),
    deviceToday: NOW,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.done.evaluation, 'RED');
  assert.notEqual(outcome.done.engineState.decision.safety, 'OK');
  assert.equal(outcome.done.engineState.diagnosticHold, true);
});

test('RESULT-05 an engine rejection leaves everything as it was', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);
  const writesBefore = fixture.storage.writes;

  const outcome = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: 'no-such-workout',
    result: feedback(workout, 'GREEN'),
    deviceToday: NOW,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.code, 'UNKNOWN_OR_COMPLETED_WORKOUT');
  assert.equal(outcome.error.fromEngine, true);
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw, 'storage is untouched');
  assert.equal(fixture.storage.writes, writesBefore, 'nothing was written');
});

test('RESULT-06 a storage failure is reported and the previous state stays active', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);
  const broken = {
    read: () => null,
    write: () => { throw new Error('quota'); },
    clear: () => undefined,
  };

  const outcome = submitWorkoutResult({
    repo: broken, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, result: feedback(workout, 'GREEN'), deviceToday: NOW,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  // The caller received no new state, so nothing can be shown as saved.
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw);
  const reloaded = loadActiveCycle(fixture.repo);
  assert.equal(reloaded.kind, 'READY');
  if (reloaded.kind === 'READY') {
    assert.equal(reloaded.engineState.history.length, 0);
    assert.equal(reloaded.engineState.queue.some((entry) => entry.id === workout.id), true);
  }
});

test('RESULT-07 the stored state is a real engine state that reads back', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);

  const outcome = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, result: feedback(workout, 'GREEN'), deviceToday: NOW,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  const envelope = JSON.parse(fixture.storage.map.get(ACTIVE_CYCLE_KEY)!) as {cycle: {engineState: string; engineStateVersion: number}};
  assert.equal(envelope.cycle.engineStateVersion, 1);
  const restored = deserializeEngineState(envelope.cycle.engineState);
  assert.deepEqual(restored.history.map((entry) => entry.workout.id), [workout.id]);
  assert.deepEqual(restored.queue, outcome.done.engineState.queue);
});

test('RESULT-08 a pending session can be closed, and then it is no longer pending', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  // Exactly one session is overdue on this date.
  const today = dateAfter(1);
  const pending = earliestPending(fixture.engineState, today);
  assert.ok(pending, 'the fixture must have an unresolved session');
  assert.equal(fixture.engineState.queue.filter((workout) => workout.scheduledDate < today).length, 1);

  const outcome = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: pending.id, result: feedback(pending, 'GREEN'), deviceToday: today,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(deriveToday(fixture.engineState, today).state, 'PENDING_RESULT');
  assert.equal(hasPendingResults(outcome.done.engineState, today), false, 'the only overdue session is closed');
  assert.notEqual(deriveToday(outcome.done.engineState, today).state, 'PENDING_RESULT');
});

test('RESULT-08b while another overdue session remains, the state stays PENDING_RESULT', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const today = dateAfter(2);
  const overdue = fixture.engineState.queue.filter((workout) => workout.scheduledDate < today);
  assert.ok(overdue.length >= 2, 'the fixture must have several overdue sessions');

  const outcome = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: overdue[0]!.id, result: feedback(overdue[0]!, 'GREEN'), deviceToday: today,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  // Closing the earliest moves the pointer to the next one instead of unlocking the clock.
  assert.equal(deriveToday(outcome.done.engineState, today).state, 'PENDING_RESULT');
  assert.equal(deriveToday(outcome.done.engineState, today).pendingWorkouts[0]!.id, overdue[1]!.id);
});

test('RESULT-09 several unresolved sessions are closed in chronological order', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const today = dateAfter(4);
  const pending = fixture.engineState.queue.filter((workout) => workout.scheduledDate < today);
  assert.ok(pending.length >= 2, `expected several past sessions, got ${pending.length}`);

  // Jumping ahead is refused by the application, whatever the caller does.
  const outOfOrder = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: pending[1]!.id, result: feedback(pending[1]!, 'GREEN'), deviceToday: today,
  });
  assert.equal(outOfOrder.ok, false);
  if (!outOfOrder.ok) assert.equal(outOfOrder.error.code, 'PENDING_RESULT_OUT_OF_ORDER');
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw);

  // The earliest one is accepted, and then the next one becomes the earliest.
  const first = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: pending[0]!.id, result: feedback(pending[0]!, 'GREEN'), deviceToday: today,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(earliestPending(first.done.engineState, today)?.id, pending[1]!.id);
  assert.equal(hasPendingResults(first.done.engineState, today), true);
});

test('RESULT-10 the completed workout is not duplicated in the application event log', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);

  const outcome = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, result: feedback(workout, 'GREEN'), deviceToday: NOW,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  // Only the creation event exists: the session lives in the engine history, which is the single
  // source of truth for it.
  assert.deepEqual(outcome.done.appState.events.map((event) => event.type), ['CYCLE_CREATED']);
});

test('RESULT-11 the diff reports only differences that really exist', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);

  // A state compared with itself has nothing to report.
  assert.deepEqual(diffPlan(fixture.engineState, fixture.engineState, NOW), []);

  const outcome = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, result: feedback(workout, 'GREEN'), deviceToday: NOW,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  const kinds = outcome.done.changes.map((change) => change.kind);
  assert.equal(kinds[0], 'WORKOUT_RECORDED');
  assert.equal(kinds.includes('WORKOUT_RECORDED'), true);

  const nextChange = outcome.done.changes.find((change) => change.kind === 'NEXT_WORKOUT_CHANGED');
  if (nextChange !== undefined && nextChange.kind === 'NEXT_WORKOUT_CHANGED') {
    if (nextChange.from === null) {
      assert.deepEqual(nextChange.to, summariseWorkout(nextWorkout(outcome.done.engineState, NOW)!));
    } else {
      // Every reported change matches the two states exactly.
      assert.deepEqual(nextChange.from, summariseWorkout(nextWorkout(fixture.engineState, NOW)!));
    }
  }

  // Only observable facts, never an internal coefficient.
  const allowed = new Set(['WORKOUT_RECORDED', 'NEXT_WORKOUT_CHANGED', 'NEXT_WORKOUT_TYPE_CHANGED', 'NEXT_WORKOUT_DATE_CHANGED', 'NEXT_WORKOUT_VOLUME_CHANGED', 'NEXT_WORKOUT_PACE_CHANGED', 'CONTROL_SCHEDULED', 'PHASE_CHANGED', 'GATE_CHANGED', 'FEASIBILITY_CHANGED', 'SAFETY_CHANGED', 'CHECKPOINT_REQUIRED', 'QUEUE_BECAME_EMPTY']);
  for (const kind of kinds) assert.ok(allowed.has(kind), `unexpected change kind ${kind}`);
  for (const change of outcome.done.changes) {
    assert.equal(Object.prototype.hasOwnProperty.call(change, 'reason'), false, 'the diff must not carry a reason of its own');
  }
});

test('RESULT-12 a second submission of the same workout is refused by the engine', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);

  const first = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, result: feedback(workout, 'GREEN'), deviceToday: NOW,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const second = submitWorkoutResult({
    repo: fixture.repo, appState: first.done.appState, engineState: first.done.engineState,
    workoutId: workout.id, result: feedback(workout, 'GREEN'), deviceToday: NOW,
  });
  assert.equal(second.ok, false);
  if (second.ok) return;
  assert.equal(second.error.code, 'UNKNOWN_OR_COMPLETED_WORKOUT');
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), JSON.stringify(first.done.appState));
});
