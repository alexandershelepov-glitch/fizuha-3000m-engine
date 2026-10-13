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
import {hasPendingResults, earliestPending, resultAvailability} from '../web/src/application/invariants.ts';
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
      // A recorded workout is not the previously planned "next" workout after it is closed.
      // Compare to the next still-uncompleted session, not to the workout just recorded.
      const pendingBefore = fixture.engineState.queue.find(w => w.id !== workout.id && w.scheduledDate >= NOW);
      assert.ok(pendingBefore);
      assert.deepEqual(nextChange.from, summariseWorkout(pendingBefore));
    }
  }

  // Only observable facts, never an internal coefficient.
  const allowed = new Set(['WORKOUT_RECORDED', 'NEXT_WORKOUT_CHANGED', 'NEXT_WORKOUT_TYPE_CHANGED', 'NEXT_WORKOUT_DATE_CHANGED', 'NEXT_WORKOUT_VOLUME_CHANGED', 'NEXT_WORKOUT_PACE_CHANGED', 'CONTROL_SCHEDULED', 'PHASE_CHANGED', 'GATE_CHANGED', 'FEASIBILITY_CHANGED', 'SAFETY_CHANGED', 'CHECKPOINT_REQUIRED', 'QUEUE_BECAME_EMPTY']);
  for (const kind of kinds) assert.ok(allowed.has(kind), `unexpected change kind ${kind}`);
  for (const change of outcome.done.changes) {
    assert.equal(Object.prototype.hasOwnProperty.call(change, 'reason'), false, 'the diff must not carry a reason of its own');
  }
});

test('RESULT-11b closing a routine workout is not misreported as next-workout adaptation', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const closed = firstWorkout(fixture.engineState);
  const beforeNext = fixture.engineState.queue.find(w => w.id !== closed.id)!;
  const outcome = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: closed.id, result: feedback(closed, 'GREEN'), deviceToday: NOW,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const afterNext = outcome.done.engineState.queue.find(w => w.id === beforeNext.id);
  assert.ok(afterNext);
  assert.equal(afterNext.type, beforeNext.type);
  assert.equal(afterNext.main.dose.value, beforeNext.main.dose.value);
  assert.equal(outcome.done.changes.some(change => change.kind === 'NEXT_WORKOUT_CHANGED'), false,
    'moving to the next scheduled workout must not count as a plan correction');
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

test('FUTURE-01 a result for a session that has not happened yet is refused', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const future = fixture.engineState.queue.find((workout) => workout.scheduledDate > NOW);
  assert.ok(future, 'the fixture must contain a future session');
  const writesBefore = fixture.storage.writes;

  const outcome = submitWorkoutResult({
    repo: fixture.repo,
    appState: fixture.appState,
    engineState: fixture.engineState,
    workoutId: future.id,
    result: feedback(future, 'GREEN'),
    deviceToday: NOW,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.code, 'WORKOUT_RESULT_BEFORE_SCHEDULED_DATE');
  assert.equal(outcome.error.fromEngine, false, 'this is an application rule, not an engine rejection');
  assert.equal(outcome.error.retry, false, 'tomorrow the same request becomes valid, but not by repeating it now');

  // Nothing changed anywhere: engine state, queue, history, envelope and storage.
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw);
  assert.equal(fixture.storage.writes, writesBefore, 'a refused request must not write');
  const reloaded = loadActiveCycle(fixture.repo);
  assert.equal(reloaded.kind, 'READY');
  if (reloaded.kind !== 'READY') return;
  assert.deepEqual(reloaded.engineState.queue, fixture.engineState.queue);
  assert.deepEqual(reloaded.engineState.history, []);
  assert.deepEqual(reloaded.appState.cycle, fixture.appState.cycle);
  assert.deepEqual(reloaded.appState.events, fixture.appState.events);
});

test('FUTURE-02 the same session becomes recordable on its own day, in order', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const tomorrow = dateAfter(1);
  const earlier = fixture.engineState.queue.find((workout) => workout.scheduledDate === NOW)!;
  const session = fixture.engineState.queue.find((workout) => workout.scheduledDate === tomorrow)!;

  // Refused the day before, because the session has not happened yet.
  const refused = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: session.id, result: feedback(session, 'GREEN'), deviceToday: NOW,
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error.code, 'WORKOUT_RESULT_BEFORE_SCHEDULED_DATE');

  // On its own day the date rule no longer applies; INV-1 still does, because yesterday is open.
  const blocked = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: session.id, result: feedback(session, 'GREEN'), deviceToday: tomorrow,
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.error.code, 'PENDING_RESULT_OUT_OF_ORDER');

  // Once the earlier session is closed, the very same request is accepted.
  const closed = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: earlier.id, result: feedback(earlier, 'GREEN'), deviceToday: tomorrow,
  });
  assert.equal(closed.ok, true);
  if (!closed.ok) return;

  const accepted = submitWorkoutResult({
    repo: fixture.repo, appState: closed.done.appState, engineState: closed.done.engineState,
    workoutId: session.id, result: feedback(session, 'GREEN'), deviceToday: tomorrow,
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.deepEqual(accepted.done.engineState.history.map((entry) => entry.workout.id), [earlier.id, session.id]);
});

test('FUTURE-03 a session scheduled for today is recordable', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const today = fixture.engineState.queue.find((workout) => workout.scheduledDate === NOW);
  assert.ok(today, 'the fixture must contain a session for today');

  const outcome = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: today.id, result: feedback(today, 'GREEN'), deviceToday: NOW,
  });
  assert.equal(outcome.ok, true);
});

test('FUTURE-04 an overdue session is still closed in chronological order, not by date only', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const today = dateAfter(4);
  const overdue = fixture.engineState.queue.filter((workout) => workout.scheduledDate < today);
  assert.ok(overdue.length >= 2, 'the fixture must contain several overdue sessions');
  assert.ok(fixture.engineState.queue.some((workout) => workout.scheduledDate > today), 'and one in the future');

  // The oldest one is allowed...
  const first = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: overdue[0]!.id, result: feedback(overdue[0]!, 'GREEN'), deviceToday: today,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  // ...the next overdue one is allowed after it...
  const second = submitWorkoutResult({
    repo: fixture.repo, appState: first.done.appState, engineState: first.done.engineState,
    workoutId: overdue[1]!.id, result: feedback(overdue[1]!, 'GREEN'), deviceToday: today,
  });
  assert.equal(second.ok, true);

  // ...and a future session is still refused, however many were closed.
  const future = (second.ok ? second.done.engineState : first.done.engineState).queue.find((workout) => workout.scheduledDate > today)!;
  const refused = submitWorkoutResult({
    repo: fixture.repo,
    appState: second.ok ? second.done.appState : first.done.appState,
    engineState: second.ok ? second.done.engineState : first.done.engineState,
    workoutId: future.id, result: feedback(future, 'GREEN'), deviceToday: today,
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error.code, 'WORKOUT_RESULT_BEFORE_SCHEDULED_DATE');
});

test('FUTURE-05 the guard does not replace the engine check for an unknown session', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);

  const outcome = submitWorkoutResult({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: 'no-such-workout', result: feedback(workout, 'GREEN'), deviceToday: NOW,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  // The engine's own code, not an application code invented by the guard.
  assert.equal(outcome.error.code, 'UNKNOWN_OR_COMPLETED_WORKOUT');
  assert.equal(outcome.error.fromEngine, true);
});

test('FUTURE-06 availability is one decision shared by the guard and the screens', () => {
  const fixture = cycleFixture({availableRunsPerWeek: 4});
  const today = dateAfter(2);
  const overdue = fixture.engineState.queue.filter((workout) => workout.scheduledDate < today);
  const future = fixture.engineState.queue.find((workout) => workout.scheduledDate > today)!;

  assert.equal(resultAvailability(fixture.engineState, overdue[0]!.id, today), 'AVAILABLE');
  assert.equal(resultAvailability(fixture.engineState, overdue[1]!.id, today), 'OUT_OF_ORDER');
  assert.equal(resultAvailability(fixture.engineState, future.id, today), 'BEFORE_SCHEDULED_DATE');
  assert.equal(resultAvailability(fixture.engineState, 'unknown-id', today), 'AVAILABLE', 'the engine owns that case');
});
