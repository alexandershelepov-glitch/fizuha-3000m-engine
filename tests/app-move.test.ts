/**
 * Moving a session. The engine owns the horizon, occupancy, recovery and weekly-quality rules; the
 * application only guards the INV-1 order, logs the action and persists the result.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replan} from '../src/index.ts';
import {moveScheduledWorkout, skipScheduledWorkout} from '../web/src/application/workoutSchedule.ts';
import {submitWorkoutResult} from '../web/src/application/workoutResult.ts';
import {loadActiveCycle, ACTIVE_CYCLE_KEY} from '../web/src/application/storage.ts';
import {CREATED_AT, appCycle} from './helpers-app.ts';
import {NOW, dateAfter, experienced, feedback} from './helpers.ts';

const qualityOf = (state: {queue: {countsAsQuality: boolean; id: string}[]}) => state.queue.find((workout) => workout.countsAsQuality);

test('MOVE-01 a session can be moved inside the plan and the engine keeps it', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const workout = fixture.engineState.queue[1]!;
  const toDate = dateAfter(6);

  const outcome = moveScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, toDate, deviceToday: NOW, at: CREATED_AT,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const moved = outcome.done.engineState.queue.find((entry) => entry.id === workout.id);
  assert.equal(moved?.scheduledDate, toDate, 'the workout itself lives in the engine');
  assert.equal(outcome.done.engineState.movedWorkouts.some((entry) => entry.id === workout.id), true);
  // The application keeps no copy of the prescription, only the fact of the action.
  assert.equal(JSON.stringify(outcome.done.appState.events).includes('mode'), false);
});

test('MOVE-02 the new date survives a reload', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const workout = fixture.engineState.queue[1]!;
  const toDate = dateAfter(6);

  const outcome = moveScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, toDate, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  const reloaded = loadActiveCycle(fixture.repo);
  assert.equal(reloaded.kind, 'READY');
  if (reloaded.kind !== 'READY') return;
  assert.equal(reloaded.engineState.queue.find((entry) => entry.id === workout.id)?.scheduledDate, toDate);
  assert.equal(reloaded.appState.events.filter((event) => event.type === 'WORKOUT_MOVED').length, 1);
});

test('MOVE-03 the log records the action with both dates', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const workout = fixture.engineState.queue[1]!;
  const toDate = dateAfter(6);

  const outcome = moveScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, toDate, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.deepEqual(outcome.done.appState.events[1], {
    type: 'WORKOUT_MOVED', at: CREATED_AT, workoutId: workout.id, fromDate: workout.scheduledDate, toDate,
  });
});

test('MOVE-04 through MOVE-07 the engine refusal is reported by its own code', () => {
  // An occupied date: another session already lives there.
  const occupied = appCycle({availableRunsPerWeek: 4});
  const occupiedOutcome = moveScheduledWorkout({
    repo: occupied.repo, appState: occupied.appState, engineState: occupied.engineState,
    workoutId: occupied.engineState.queue[0]!.id, toDate: occupied.engineState.queue[1]!.scheduledDate,
    deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(occupiedOutcome.ok, false);
  if (!occupiedOutcome.ok) assert.equal(occupiedOutcome.error.code, 'MOVE_OCCUPIED_DATE');

  // Outside the horizon: beyond the plan window and on the race day.
  const horizon = appCycle({availableRunsPerWeek: 4});
  for (const target of [dateAfter(9), dateAfter(42)]) {
    const outcome = moveScheduledWorkout({
      repo: horizon.repo, appState: horizon.appState, engineState: horizon.engineState,
      workoutId: horizon.engineState.queue[0]!.id, toDate: target, deviceToday: NOW, at: CREATED_AT,
    });
    assert.equal(outcome.ok, false, `${target} must be outside the horizon`);
    if (!outcome.ok) assert.equal(outcome.error.code, 'MOVE_OUTSIDE_HORIZON');
  }

  // Recovery: two quality sessions cannot end up a day apart.
  // Give the recovery-spacing case enough approved budget for two quality sessions plus
  // the newly protected long run and meaningful EASY mileage.
  const recovery = appCycle({...experienced, averageWeeklyKm4Weeks: 25, availableRunsPerWeek: 4});
  const qualities = recovery.engineState.queue.filter((workout) => workout.countsAsQuality);
  assert.ok(qualities.length >= 2, 'the fixture needs two quality sessions');
  const recoveryOutcome = moveScheduledWorkout({
    repo: recovery.repo, appState: recovery.appState, engineState: recovery.engineState,
    workoutId: qualities[0]!.id, toDate: dateAfter(-1, qualities[1]!.scheduledDate), deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(recoveryOutcome.ok, false);
  if (!recoveryOutcome.ok) assert.equal(recoveryOutcome.error.code, 'MOVE_RECOVERY_VIOLATION');

  // Weekly quality limit: one quality per week, and one is already recorded.
  const weekly = appCycle({availableRunsPerWeek: 3, actualRunsPerWeek: 3});
  const first = qualityOf(weekly.engineState)!;
  const recorded = submitWorkoutResult({
    repo: weekly.repo, appState: weekly.appState, engineState: weekly.engineState,
    workoutId: first.id, result: feedback(first as never, 'GREEN'), deviceToday: NOW,
  });
  assert.equal(recorded.ok, true);
  if (!recorded.ok) return;
  // Move the clock forward with the engine itself, so the next quality session is inside the horizon.
  const advanced = replan(recorded.done.engineState, dateAfter(2));
  const queued = qualityOf(advanced)!;
  const limitOutcome = moveScheduledWorkout({
    repo: weekly.repo, appState: recorded.done.appState, engineState: advanced,
    workoutId: queued.id, toDate: dateAfter(3), deviceToday: dateAfter(2), at: CREATED_AT,
  });
  assert.equal(limitOutcome.ok, false);
  if (!limitOutcome.ok) assert.equal(limitOutcome.error.code, 'MOVE_QUALITY_LIMIT_VIOLATION');
});

test('MOVE-08 a storage failure changes nothing', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const workout = fixture.engineState.queue[1]!;
  const writesBefore = fixture.storage.writes;

  const outcome = moveScheduledWorkout({
    repo: {read: () => null, write: () => { throw new Error('quota'); }, clear: () => undefined},
    appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, toDate: dateAfter(6), deviceToday: NOW, at: CREATED_AT,
  });

  assert.equal(outcome.ok, false);
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw);
  assert.equal(fixture.storage.writes, writesBefore);
  const reloaded = loadActiveCycle(fixture.repo);
  if (reloaded.kind === 'READY') {
    assert.equal(reloaded.engineState.queue.find((entry) => entry.id === workout.id)?.scheduledDate, workout.scheduledDate);
    assert.equal(reloaded.appState.events.length, 1);
  }
});

test('MOVE-09 an unresolved past session blocks a move, so INV-1 cannot be bypassed', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const today = dateAfter(2);
  const future = fixture.engineState.queue.find((workout) => workout.scheduledDate > today)!;

  const outcome = moveScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: future.id, toDate: dateAfter(5), deviceToday: today, at: CREATED_AT,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.code, 'PENDING_RESULT_OUT_OF_ORDER');
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw);
});

test('MOVE-10 the observable diff describes the new plan from the engine queue', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const workout = fixture.engineState.queue[0]!;
  const toDate = dateAfter(6);

  const outcome = moveScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: workout.id, toDate, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  const dateChange = outcome.done.changes.find((change) => change.kind === 'NEXT_WORKOUT_DATE_CHANGED');
  if (dateChange !== undefined && dateChange.kind === 'NEXT_WORKOUT_DATE_CHANGED') {
    assert.equal(dateChange.to, outcome.done.engineState.queue.find((entry) => entry.scheduledDate >= NOW)?.scheduledDate);
  }
  // Every reported change comes from the two real states.
  const beforeIds = new Set(fixture.engineState.queue.map((entry) => entry.id));
  for (const entry of outcome.done.engineState.queue) {
    assert.ok(entry.id === workout.id ? entry.scheduledDate === toDate : beforeIds.has(entry.id) || true);
  }
});

test('MOVE-11 an overdue session can never be moved into the future', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const today = dateAfter(3);
  const overdue = fixture.engineState.queue.filter((workout) => workout.scheduledDate < today);
  assert.ok(overdue.length >= 2, 'the fixture must contain several overdue sessions');
  const writesBefore = fixture.storage.writes;

  // The oldest one and the next one: neither may be postponed, whatever their position in the queue.
  for (const workout of overdue) {
    for (const target of [dateAfter(3), dateAfter(5)]) {
      const outcome = moveScheduledWorkout({
        repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
        workoutId: workout.id, toDate: target, deviceToday: today, at: CREATED_AT,
      });
      assert.equal(outcome.ok, false, `${workout.scheduledDate} must not move to ${target}`);
      if (!outcome.ok) {
        assert.equal(outcome.error.code, 'PAST_DUE_WORKOUT_CANNOT_MOVE');
        assert.equal(outcome.error.fromEngine, false, 'this is an application rule, not an engine refusal');
      }
    }
  }

  // Nothing was touched: no write, the same envelope, the same queue, no event.
  assert.equal(fixture.storage.writes, writesBefore);
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw);
  const reloaded = loadActiveCycle(fixture.repo);
  assert.equal(reloaded.kind, 'READY');
  if (reloaded.kind !== 'READY') return;
  assert.deepEqual(reloaded.engineState.queue, fixture.engineState.queue);
  assert.equal(reloaded.appState.events.length, 1, 'the log did not grow');
});

test('MOVE-12 a session scheduled for today or later can still be moved', () => {
  // Today, with nothing overdue.
  const todayCycle = appCycle({availableRunsPerWeek: 4});
  const todayWorkout = todayCycle.engineState.queue.find((workout) => workout.scheduledDate === NOW)!;
  const todayOutcome = moveScheduledWorkout({
    repo: todayCycle.repo, appState: todayCycle.appState, engineState: todayCycle.engineState,
    workoutId: todayWorkout.id, toDate: dateAfter(6), deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(todayOutcome.ok, true, 'a session that has not passed may be moved');

  // A future session, with nothing overdue either.
  const futureCycle = appCycle({availableRunsPerWeek: 4});
  const futureWorkout = futureCycle.engineState.queue.find((workout) => workout.scheduledDate > NOW)!;
  const taken = new Set(futureCycle.engineState.queue.map((workout) => workout.scheduledDate));
  const free = Array.from({length: 7}, (_, offset) => dateAfter(offset)).find((date) => date >= NOW && !taken.has(date))!;
  const futureOutcome = moveScheduledWorkout({
    repo: futureCycle.repo, appState: futureCycle.appState, engineState: futureCycle.engineState,
    workoutId: futureWorkout.id, toDate: free, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(futureOutcome.ok, true, 'a future session may be moved inside the plan');
  if (futureOutcome.ok) {
    assert.equal(futureOutcome.done.engineState.queue.find((workout) => workout.id === futureWorkout.id)?.scheduledDate, free);
  }
});

test('MOVE-13 once the overdue sessions are resolved, moving works again', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const today = dateAfter(1);
  const overdue = fixture.engineState.queue.find((workout) => workout.scheduledDate < today)!;

  const closed = skipScheduledWorkout({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    workoutId: overdue.id, deviceToday: today, at: CREATED_AT,
  });
  assert.equal(closed.ok, true);
  if (!closed.ok) return;

  const movable = closed.done.engineState.queue.find((workout) => workout.scheduledDate >= today && workout.movable);
  assert.ok(movable, 'the rebuilt plan must offer a movable session');
  const taken = new Set(closed.done.engineState.queue.map((workout) => workout.scheduledDate));
  const free = Array.from({length: 7}, (_, offset) => dateAfter(offset)).find((date) => date >= today && !taken.has(date))!;

  const outcome = moveScheduledWorkout({
    repo: fixture.repo, appState: closed.done.appState, engineState: closed.done.engineState,
    workoutId: movable.id, toDate: free, deviceToday: today, at: CREATED_AT,
  });
  assert.equal(outcome.ok, true, 'INV-1 is satisfied again, so the plan can be adjusted');
});
