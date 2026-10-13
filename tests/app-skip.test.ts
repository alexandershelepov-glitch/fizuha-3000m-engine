/**
 * Skipping a session. The engine resolves exactly one session; the reason lives in the application
 * log, because the engine deliberately does not distinguish a voluntary skip from a miss.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {skipCauseFor, skipScheduledWorkout} from '../web/src/application/workoutSchedule.ts';
import {loadActiveCycle, ACTIVE_CYCLE_KEY} from '../web/src/application/storage.ts';
import {deriveToday} from '../web/src/application/uiState.ts';
import {earliestPending, hasPendingResults} from '../web/src/application/invariants.ts';
import {CREATED_AT, appCycle} from './helpers-app.ts';
import {NOW, dateAfter} from './helpers.ts';

const firstWorkout = (state: {queue: {id: string; scheduledDate: string; type: string}[]}) => state.queue[0]!;

test('SKIP-01 a voluntary skip removes the session from the queue and logs the reason', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);

  const outcome = skipScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, deviceToday: NOW, at: CREATED_AT,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.done.engineState.queue.some((entry) => entry.id === workout.id), false, 'the engine rebuilt the queue');
  assert.equal(outcome.done.engineState.history.length, 0, 'a skip is not a completed session');

  const events = outcome.done.appState.events;
  assert.equal(events.length, 2);
  assert.deepEqual(events[1], {type: 'WORKOUT_SKIPPED', at: CREATED_AT, workoutId: workout.id, scheduledDate: workout.scheduledDate, workoutType: workout.type, cause: 'VOLUNTARY'}, 'a session scheduled for today is a voluntary decision');
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), JSON.stringify(outcome.done.appState));
});

test('SKIP-02 a past-due skip is logged with its own cause', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const today = dateAfter(1);
  const pending = earliestPending(fixture.engineState, today)!;

  const outcome = skipScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: pending.id, deviceToday: today, at: CREATED_AT,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const event = outcome.done.appState.events[1];
  assert.equal(event?.type, 'WORKOUT_SKIPPED');
  if (event?.type === 'WORKOUT_SKIPPED') {
    assert.equal(event.cause, 'PAST_DUE');
    assert.equal(event.workoutId, pending.id);
    assert.equal(event.scheduledDate, pending.scheduledDate);
  }
  // The reason is never written into the engine.
  assert.equal(JSON.stringify(outcome.done.engineState).includes('PAST_DUE'), false);
});

test('SKIP-03 the cause follows the session date and only the application states it', () => {
  const causeOf = (events: readonly {type: string; cause?: string}[]) => events.find((event) => event.type === 'WORKOUT_SKIPPED')?.cause;

  // The session is scheduled for the device date: a decision about today.
  const todayCycle = appCycle({availableRunsPerWeek: 4});
  const todayOutcome = skipScheduledWorkout({
    repo: todayCycle.repo, appState: todayCycle.appState, engineState: todayCycle.engineState,
    workoutId: firstWorkout(todayCycle.engineState).id, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(todayOutcome.ok, true);
  if (!todayOutcome.ok) return;
  assert.equal(causeOf(todayOutcome.done.appState.events), 'VOLUNTARY');

  // The same session, seen the next day: it is overdue, and the log says so.
  const overdueCycle = appCycle({availableRunsPerWeek: 4});
  const overdueOutcome = skipScheduledWorkout({
    repo: overdueCycle.repo, appState: overdueCycle.appState, engineState: overdueCycle.engineState,
    workoutId: firstWorkout(overdueCycle.engineState).id, deviceToday: dateAfter(1), at: CREATED_AT,
  });
  assert.equal(overdueOutcome.ok, true);
  if (!overdueOutcome.ok) return;
  assert.equal(causeOf(overdueOutcome.done.appState.events), 'PAST_DUE');

  // Both produced the same engine transition: the engine does not know about the reason.
  assert.deepEqual(todayOutcome.done.engineState.skippedIds, overdueOutcome.done.engineState.skippedIds);
});

test('SKIP-04 only the chosen session is resolved, never the other overdue ones', () => {
  const fixture = appCycle({availableRunsPerWeek: 4, actualRunsPerWeek: 4});
  const today = dateAfter(2);
  const overdue = fixture.engineState.queue.filter((workout) => workout.scheduledDate < today);
  assert.ok(overdue.length >= 2, 'the fixture must contain several overdue sessions');

  const outcome = skipScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: overdue[0]!.id, deviceToday: today, at: CREATED_AT,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  // Exactly one session was written off, and the state is still waiting for the next one.
  assert.equal(outcome.done.engineState.skippedWorkouts.length, 1);
  assert.equal(deriveToday(outcome.done.engineState, today).state, 'PENDING_RESULT');
  assert.equal(earliestPending(outcome.done.engineState, today)?.id, overdue[1]!.id);
  assert.equal(outcome.done.engineState.asOf, fixture.engineState.asOf, 'the clock did not move');
});

test('SKIP-05 an older unresolved session blocks a newer one, whatever the cause', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const today = dateAfter(3);
  const overdue = fixture.engineState.queue.filter((workout) => workout.scheduledDate < today);
  const future = fixture.engineState.queue.find((workout) => workout.scheduledDate > today)!;

  for (const target of [overdue[1]!, future]) {
    const outcome = skipScheduledWorkout({
      repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
      workoutId: target.id, deviceToday: today, at: CREATED_AT,
    });
    assert.equal(outcome.ok, false, `${target.scheduledDate} must not be resolvable yet`);
    if (!outcome.ok) assert.equal(outcome.error.code, 'PENDING_RESULT_OUT_OF_ORDER');
    assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw);
  }
});

test('SKIP-06 skipping the same session twice is refused by the engine', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);

  const first = skipScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const second = skipScheduledWorkout({
    repo: fixture.repo, appState: first.done.appState, engineState: first.done.engineState,
    workoutId: workout.id, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(second.ok, false);
  if (second.ok) return;
  assert.equal(second.error.code, 'UNKNOWN_WORKOUT');
  assert.equal(second.error.fromEngine, true);
  // The log grew by exactly one event in total.
  assert.equal(first.done.appState.events.length, 2);
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), JSON.stringify(first.done.appState));
});

test('SKIP-07 a storage failure leaves the previous state active and unlogged', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const workout = firstWorkout(fixture.engineState);
  const writesBefore = fixture.storage.writes;

  const outcome = skipScheduledWorkout({
    repo: {read: () => null, write: () => { throw new Error('quota'); }, clear: () => undefined},
    appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, deviceToday: NOW, at: CREATED_AT,
  });

  assert.equal(outcome.ok, false);
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw);
  assert.equal(fixture.storage.writes, writesBefore);
  const reloaded = loadActiveCycle(fixture.repo);
  assert.equal(reloaded.kind, 'READY');
  if (reloaded.kind === 'READY') {
    assert.equal(reloaded.appState.events.length, 1, 'no event was recorded');
    assert.equal(reloaded.engineState.queue.some((entry) => entry.id === workout.id), true, 'the session is still scheduled');
  }
});

test('SKIP-08 repeated pending sessions are resolved oldest first', () => {
  const fixture = appCycle({availableRunsPerWeek: 4, actualRunsPerWeek: 4});
  const today = dateAfter(2);
  const overdue = fixture.engineState.queue.filter((workout) => workout.scheduledDate < today);

  const first = skipScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: overdue[0]!.id, deviceToday: today, at: CREATED_AT,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const second = skipScheduledWorkout({
    repo: fixture.repo, appState: first.done.appState, engineState: first.done.engineState,
    workoutId: overdue[1]!.id, deviceToday: today, at: CREATED_AT,
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.deepEqual(second.done.engineState.skippedWorkouts.map((workout) => workout.id), [overdue[0]!.id, overdue[1]!.id]);
  assert.equal(hasPendingResults(second.done.engineState, today), false);
  assert.equal(second.done.appState.events.filter((event) => event.type === 'WORKOUT_SKIPPED').length, 2);
});

test('SKIP-09 a skip is not a result: the engine history stays empty', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const outcome = skipScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: firstWorkout(fixture.engineState).id, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.deepEqual(outcome.done.engineState.history, []);
  // And the observable diff mentions the changed next session only because it really changed.
  assert.ok(outcome.done.changes.length > 0);
  assert.equal(outcome.done.changes[0]!.kind, 'NEXT_WORKOUT_CHANGED');
});

test('SKIP-10 a future session is a voluntary decision, never a miss', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const future = fixture.engineState.queue.find((workout) => workout.scheduledDate > NOW)!;

  const outcome = skipScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: future.id, deviceToday: NOW, at: CREATED_AT,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const event = outcome.done.appState.events.find((entry) => entry.type === 'WORKOUT_SKIPPED');
  assert.equal(event?.type === 'WORKOUT_SKIPPED' ? event.cause : null, 'VOLUNTARY');
  assert.equal(event?.type === 'WORKOUT_SKIPPED' ? event.scheduledDate : null, future.scheduledDate);
});

test('SKIP-11 the cause is derived, so a false reason cannot be written', () => {
  // The operation's interface has no cause at all: the only source is the session's own date.
  const request: Parameters<typeof skipScheduledWorkout>[0] = {
    repo: appCycle({availableRunsPerWeek: 4}).repo,
    appState: appCycle({availableRunsPerWeek: 4}).appState,
    engineState: appCycle({availableRunsPerWeek: 4}).engineState,
    workoutId: 'irrelevant',
    deviceToday: NOW,
    at: CREATED_AT,
  };
  assert.equal(Object.prototype.hasOwnProperty.call(request, 'cause'), false);

  // And the derived reason matches the date for every case.
  assert.equal(skipCauseFor({scheduledDate: dateAfter(-3)} as never, NOW), 'PAST_DUE');
  assert.equal(skipCauseFor({scheduledDate: NOW} as never, NOW), 'VOLUNTARY');
  assert.equal(skipCauseFor({scheduledDate: dateAfter(2)} as never, NOW), 'VOLUNTARY');

  // The engine state never carries an application cause.
  const fixture = appCycle({availableRunsPerWeek: 4});
  const outcome = skipScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: firstWorkout(fixture.engineState).id, deviceToday: dateAfter(1), at: CREATED_AT,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(JSON.stringify(outcome.done.engineState).includes('PAST_DUE'), false);
  assert.equal(JSON.stringify(outcome.done.engineState).includes('VOLUNTARY'), false);
});
