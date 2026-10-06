/**
 * Regression tests for the three defects fixed in the app shell.
 *
 * D1 — a pending result could be written off by a side effect of `replan` (an INV-1 violation).
 * D2 — a damaged record left the user stuck on the error screen.
 * D3 — an unavailable Web Storage was silently replaced with temporary memory.
 *
 * The first two are enforced in the application layer, so they are checked here as well as through
 * the UI: hiding a button is not a fix.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCycle} from '../web/src/application/cycle.ts';
import {refreshPlan} from '../web/src/application/clockOps.ts';
import {assertClockAdvanceAllowed, hasPendingResults, pendingResults} from '../web/src/application/invariants.ts';
import {discardActiveCycle, loadActiveCycle, saveActiveCycle} from '../web/src/application/storage.ts';
import {ACTIVE_CYCLE_KEY} from '../web/src/application/storage.ts';
import {buildProfile} from '../web/src/application/questionnaire.ts';
import {deriveToday} from '../web/src/application/uiState.ts';
import {deserializeEngineState} from '../web/src/application/engineGateway.ts';
import {CYCLE_ID, CREATED_AT, draft, memoryStorage, repository} from './helpers-app.ts';
import {NOW, dateAfter} from './helpers.ts';

/** A stored cycle created two days ago, so its queue still holds unrecorded sessions. */
function staleCycle() {
  const storage = memoryStorage();
  const built = buildProfile(draft({resultDate: dateAfter(-10)}));
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error('fixture');
  const created = createCycle(repository(storage), {
    profile: built.profile, deviceToday: dateAfter(-2), cycleId: CYCLE_ID, createdAt: CREATED_AT, locale: 'ru-RU',
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('fixture');
  const loaded = loadActiveCycle(repository(storage));
  assert.equal(loaded.kind, 'READY');
  if (loaded.kind !== 'READY') throw new Error('fixture');
  return {storage, appState: loaded.appState, engineState: loaded.engineState, raw: storage.map.get(ACTIVE_CYCLE_KEY)!};
}

test('D1-01 a pending result is derived from the queue, and the UI agrees with the guard', () => {
  const {engineState} = staleCycle();
  const today = NOW;

  const pending = pendingResults(engineState, today);
  assert.ok(pending.length > 0, 'the fixture must contain unrecorded past sessions');
  assert.equal(hasPendingResults(engineState, today), true);
  assert.equal(deriveToday(engineState, today).state, 'PENDING_RESULT');
  assert.deepEqual(deriveToday(engineState, today).pendingWorkouts.map((workout) => workout.id), pending.map((workout) => workout.id));

  // Once the clock is at the queue's own date there is nothing pending.
  assert.equal(hasPendingResults(engineState, engineState.asOf), false);
  assert.doesNotThrow(() => assertClockAdvanceAllowed(engineState, engineState.asOf));
  assert.throws(() => assertClockAdvanceAllowed(engineState, today), {name: 'ApplicationError'});
});

test('D1-02 replan is refused while a pending result exists, from any caller', () => {
  const {storage, appState, engineState, raw} = staleCycle();
  const repo = repository(storage);
  const writesBefore = storage.writes;

  const result = refreshPlan({repo, appState, engineState, deviceToday: NOW});

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, 'PENDING_RESULT_BLOCKED');
  assert.equal(result.error.retry, false, 'repeating the same request cannot help');
  assert.equal(result.error.fromEngine, false, 'this is an application invariant, not an engine error');

  // Nothing was recomputed, nothing was written, and the stored record is byte-identical.
  assert.equal(storage.writes, writesBefore, 'a refused operation must not touch storage');
  assert.equal(storage.map.get(ACTIVE_CYCLE_KEY), raw);
  const reloaded = loadActiveCycle(repo);
  assert.equal(reloaded.kind, 'READY');
  if (reloaded.kind !== 'READY') return;
  assert.deepEqual(reloaded.engineState.queue, engineState.queue);
  assert.deepEqual(reloaded.engineState.skippedWorkouts, engineState.skippedWorkouts);

  // The unrecorded session is still pending, not written off as a past-due miss.
  assert.deepEqual(pendingResults(reloaded.engineState, NOW).map((workout) => workout.id), pendingResults(engineState, NOW).map((workout) => workout.id));
  assert.equal(deriveToday(reloaded.engineState, NOW).state, 'PENDING_RESULT');
});

test('D1-03 a caller cannot get around the guard with a freshly deserialized state', () => {
  const {storage, appState, engineState} = staleCycle();
  // A state read back from disk is the same state, so it must be blocked in the same way.
  const restored = deserializeEngineState(JSON.stringify(engineState));
  const result = refreshPlan({repo: repository(storage), appState, engineState: restored, deviceToday: dateAfter(5)});
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'PENDING_RESULT_BLOCKED');
});

test('D1-04 with nothing pending the same operation does run and is persisted before display', () => {
  const {storage, appState, engineState} = staleCycle();
  const repo = repository(storage);
  const before = storage.writes;

  const result = refreshPlan({repo, appState, engineState, deviceToday: engineState.asOf});

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(storage.writes, before + 1, 'the new state must be saved');
  assert.equal(storage.map.get(ACTIVE_CYCLE_KEY), JSON.stringify(result.appState));
  const reloaded = loadActiveCycle(repo);
  assert.equal(reloaded.kind, 'READY');
  if (reloaded.kind === 'READY') assert.deepEqual(reloaded.engineState.queue, result.engineState.queue);
});

test('D2-01 reading never removes a damaged record; only an explicit discard does', () => {
  const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: '{not json'});
  const repo = repository(storage);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.deepEqual(loadActiveCycle(repo), {kind: 'DAMAGED', detail: 'JSON'});
    assert.equal(storage.map.get(ACTIVE_CYCLE_KEY), '{not json');
  }

  // The discard is a separate, explicit decision.
  discardActiveCycle(repo);
  assert.equal(storage.map.has(ACTIVE_CYCLE_KEY), false);
  assert.deepEqual(loadActiveCycle(repo), {kind: 'EMPTY'});
});

test('D3-01 a storage that silently drops the write is reported, not accepted', () => {
  const {appState} = staleCycle();

  // A storage that accepts setItem and keeps nothing: exactly the case a memory fallback would hide.
  const amnesiac = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  const repo = repository(amnesiac);

  assert.throws(() => saveActiveCycle(repo, appState), (error: unknown) => {
    assert.equal((error as {name: string}).name, 'ApplicationError');
    assert.equal((error as {code: string}).code, 'STORAGE_UNAVAILABLE');
    return true;
  });

  // The write was rejected, so the application never believes the cycle is stored.
  assert.deepEqual(loadActiveCycle(repo), {kind: 'EMPTY'});
});

test('D3-02 creating a cycle fails loudly when the device cannot keep it', () => {
  const built = buildProfile(draft());
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const amnesiac = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };

  const result = createCycle(repository(amnesiac), {
    profile: built.profile, deviceToday: NOW, cycleId: CYCLE_ID, createdAt: CREATED_AT, locale: 'ru-RU',
  });

  assert.equal(result.ok, false, 'a cycle that cannot be stored must not be reported as created');
  if (result.ok) return;
  assert.equal(result.stage, 'SAVE');
  assert.equal(result.error.code, 'STORAGE_UNAVAILABLE');
  assert.equal(result.error.fromEngine, false);
});
