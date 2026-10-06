/**
 * The checkpoint operation: a new 3000 m assessment recorded through the public engine API.
 *
 * The engine overwrites Current Performance, so the application captures the previous value first and
 * keeps it in the event log. The immutable baseline of the cycle is never touched.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submitCheckpoint} from '../web/src/application/checkpoint.ts';
import {loadActiveCycle, ACTIVE_CYCLE_KEY} from '../web/src/application/storage.ts';
import {deriveToday} from '../web/src/application/uiState.ts';
import {submitWorkoutResult} from '../web/src/application/workoutResult.ts';
import {CREATED_AT, appCycle} from './helpers-app.ts';
import {NOW, dateAfter, feedback, healthy} from './helpers.ts';

test('CHECK-01 a required checkpoint can be recorded and it clears the requirement', () => {
  const fixture = appCycle({performance: null});
  assert.equal(fixture.engineState.checkpointRequired, true, 'the fixture must ask for an assessment');
  assert.equal(deriveToday(fixture.engineState, NOW).state, 'CHECKPOINT_REQUIRED');

  const outcome = submitCheckpoint({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    performance: {timeSeconds: 900, date: NOW, source: 'TEST_3K'}, deviceToday: NOW, at: CREATED_AT,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.done.engineState.profile.performance?.timeSeconds, 900, 'the new value comes from the engine');
  assert.equal(outcome.done.engineState.checkpointRequired, false, 'the engine clears its own flag');
  assert.equal(outcome.done.previousPerformance, null);
  assert.notEqual(deriveToday(outcome.done.engineState, NOW).state, 'CHECKPOINT_REQUIRED');
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), JSON.stringify(outcome.done.appState));
});

test('CHECK-02 the previous Current Performance is kept in the log, not replaced by the baseline', () => {
  // The cycle starts with 920 s; the first checkpoint sets 900 s, the second 880 s.
  const fixture = appCycle({availableRunsPerWeek: 4});
  const initial = fixture.engineState.profile.performance?.timeSeconds;
  assert.equal(initial, 920);

  const first = submitCheckpoint({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    performance: {timeSeconds: 900, date: NOW, source: 'TEST_3K'}, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  // The plan placed a session for the day of the first assessment; INV-1 requires it to be resolved
  // before the clock moves on, so the next checkpoint waits until it is.
  const blocked = submitCheckpoint({
    repo: fixture.repo, appState: first.done.appState, engineState: first.done.engineState,
    performance: {timeSeconds: 880, date: dateAfter(1), source: 'OFFICIAL_3K'}, deviceToday: dateAfter(1), at: CREATED_AT,
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.error.code, 'PENDING_RESULT_BLOCKED');

  const session = first.done.engineState.queue.find((entry) => entry.scheduledDate === NOW);
  assert.ok(session, 'the rebuilt plan schedules the day of the assessment');
  const closed = submitWorkoutResult({
    repo: fixture.repo, appState: first.done.appState, engineState: first.done.engineState,
    workoutId: session.id, result: feedback(session, 'GREEN'), deviceToday: NOW,
  });
  assert.equal(closed.ok, true);
  if (!closed.ok) return;

  const second = submitCheckpoint({
    repo: fixture.repo, appState: closed.done.appState, engineState: closed.done.engineState,
    performance: {timeSeconds: 880, date: dateAfter(1), source: 'OFFICIAL_3K'}, deviceToday: dateAfter(1), at: CREATED_AT,
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;

  assert.equal(second.done.previousPerformance, 900, 'the second checkpoint refers to the first, not to the baseline');
  const events = second.done.appState.events.filter((event) => event.type === 'CHECKPOINT_RECORDED');
  assert.equal(events.length, 2, 'the full history survives');
  assert.deepEqual(events.map((event) => event.type === 'CHECKPOINT_RECORDED' ? [event.previousPerformance, event.result.timeSeconds] : null), [[920, 900], [900, 880]]);
});

test('CHECK-03 the immutable baseline is never rewritten', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const baseline = fixture.appState.cycle.baseline;

  const outcome = submitCheckpoint({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    performance: {timeSeconds: 900, date: NOW, source: 'TEST_3K'}, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  assert.deepEqual(outcome.done.appState.cycle.baseline, baseline, 'the archive baseline is untouched');
  assert.equal(outcome.done.appState.cycle.baseline.performance?.timeSeconds, 920);
  assert.equal(outcome.done.engineState.profile.performance?.timeSeconds, 900);
});

test('CHECK-04 the new assessment and the plan survive a reload', () => {
  const fixture = appCycle({performance: null});
  const outcome = submitCheckpoint({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    performance: {timeSeconds: 895, date: NOW, source: 'OFFICIAL_3K'}, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  const reloaded = loadActiveCycle(fixture.repo);
  assert.equal(reloaded.kind, 'READY');
  if (reloaded.kind !== 'READY') return;
  assert.equal(reloaded.engineState.profile.performance?.timeSeconds, 895);
  assert.equal(reloaded.engineState.profile.performance?.source, 'OFFICIAL_3K');
  assert.equal(reloaded.engineState.checkpointRequired, false);
  assert.equal(reloaded.appState.events.filter((event) => event.type === 'CHECKPOINT_RECORDED').length, 1);
  assert.deepEqual(reloaded.engineState.queue, outcome.done.engineState.queue);
});

test('CHECK-05 an impossible date is refused by the engine and nothing is written', () => {
  const fixture = appCycle({availableRunsPerWeek: 4});
  const writesBefore = fixture.storage.writes;

  const outcome = submitCheckpoint({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    performance: {timeSeconds: 900, date: dateAfter(1), source: 'TEST_3K'}, deviceToday: NOW, at: CREATED_AT,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.code, 'INVALID_CHECKPOINT_DATE');
  assert.equal(outcome.error.fromEngine, true);
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw);
  assert.equal(fixture.storage.writes, writesBefore);
});

test('CHECK-06 a checkpoint the engine does not permit is refused, with no event', () => {
  const fixture = appCycle({performance: null, safety: {...healthy(), pain: 3}});

  const outcome = submitCheckpoint({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    performance: {timeSeconds: 900, date: NOW, source: 'TEST_3K'}, deviceToday: NOW, at: CREATED_AT,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.code, 'CHECKPOINT_NOT_PERMITTED');
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw);
  const reloaded = loadActiveCycle(fixture.repo);
  if (reloaded.kind === 'READY') {
    assert.equal(reloaded.appState.events.length, 1, 'the log did not grow');
    assert.equal(reloaded.engineState.profile.performance, null);
  }
});

test('CHECK-07 a storage failure leaves the previous assessment active', () => {
  const fixture = appCycle({performance: null});
  const outcome = submitCheckpoint({
    repo: {read: () => null, write: () => { throw new Error('quota'); }, clear: () => undefined},
    appState: fixture.appState, engineState: fixture.engineState,
    performance: {timeSeconds: 900, date: NOW, source: 'TEST_3K'}, deviceToday: NOW, at: CREATED_AT,
  });

  assert.equal(outcome.ok, false);
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw);
  const reloaded = loadActiveCycle(fixture.repo);
  if (reloaded.kind === 'READY') {
    assert.equal(reloaded.engineState.profile.performance, null);
    assert.equal(reloaded.appState.events.length, 1);
  }
});

test('CHECK-08 an unresolved past session blocks a checkpoint, because it would advance the clock', () => {
  const fixture = appCycle({performance: null});
  const today = dateAfter(2);

  const outcome = submitCheckpoint({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    performance: {timeSeconds: 900, date: today, source: 'TEST_3K'}, deviceToday: today, at: CREATED_AT,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.code, 'PENDING_RESULT_BLOCKED');
  assert.equal(fixture.storage.map.get(ACTIVE_CYCLE_KEY), fixture.raw);
  assert.equal(fixture.engineState.asOf, NOW, 'the clock did not move');
});

test('CHECK-09 the event records the engine verdict after the assessment', () => {
  const fixture = appCycle({performance: null});
  const outcome = submitCheckpoint({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    performance: {timeSeconds: 900, date: NOW, source: 'TEST_3K'}, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  const event = outcome.done.appState.events.find((entry) => entry.type === 'CHECKPOINT_RECORDED');
  assert.ok(event);
  if (event?.type !== 'CHECKPOINT_RECORDED') return;
  assert.deepEqual(event.result, {timeSeconds: 900, date: NOW, source: 'TEST_3K'});
  assert.equal(event.previousPerformance, null);
  // Exactly the engine's own decision after the checkpoint.
  assert.equal(event.decisionAfter.phase, outcome.done.engineState.decision.phase);
  assert.equal(event.decisionAfter.gate, outcome.done.engineState.decision.gate);
  assert.deepEqual(event.decisionAfter.reasons, outcome.done.engineState.decision.reasons);
});

test('CHECK-10 the operation logs nothing else and keeps no copy of the queue', () => {
  const fixture = appCycle({performance: null});
  const outcome = submitCheckpoint({
    repo: fixture.repo, appState: fixture.appState, engineState: fixture.engineState,
    performance: {timeSeconds: 900, date: NOW, source: 'TEST_3K'}, deviceToday: NOW, at: CREATED_AT,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  assert.deepEqual(outcome.done.appState.events.map((event) => event.type), ['CYCLE_CREATED', 'CHECKPOINT_RECORDED']);
  // The queue lives only in the engine state.
  assert.equal(JSON.stringify(outcome.done.appState.events).includes('scheduledDate'), false);
});
