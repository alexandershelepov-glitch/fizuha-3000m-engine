/**
 * A restart is an explicit data deletion, not a planner operation.
 * It must never affect archived cycles or a newer plan in another tab.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resetActiveCycle} from '../web/src/application/resetCycle.ts';
import {createRepository, ACTIVE_CYCLE_KEY, QUESTIONNAIRE_DRAFT_KEY, RESULT_DRAFT_KEY} from '../web/src/application/storage.ts';
import {ARCHIVED_CYCLES_KEY} from '../web/src/application/archiveStorage.ts';
import {appCycle} from './helpers-app.ts';

test('RESET-01 explicit reset clears exactly the active cycle and drafts, never the archive', () => {
  const c = appCycle();
  const archive = JSON.stringify({formatVersion: 1, cycles: []});
  c.storage.setItem(ARCHIVED_CYCLES_KEY, archive);
  c.storage.setItem(QUESTIONNAIRE_DRAFT_KEY, '{"draft":1}');
  c.storage.setItem(RESULT_DRAFT_KEY, '{"draft":2}');
  const result = resetActiveCycle({repo: c.repo, storage: c.storage, appState: c.appState, engineState: c.engineState});
  assert.deepEqual(result, {ok: true});
  assert.equal(c.storage.getItem(ACTIVE_CYCLE_KEY), null);
  assert.equal(c.storage.getItem(QUESTIONNAIRE_DRAFT_KEY), null);
  assert.equal(c.storage.getItem(RESULT_DRAFT_KEY), null);
  assert.equal(c.storage.getItem(ARCHIVED_CYCLES_KEY), archive);
});

test('RESET-02 stale window cannot delete changed persisted plan', () => {
  const c = appCycle();
  const revised = JSON.stringify({...c.appState, events: [...c.appState.events, {type: 'OTHER_WINDOW_CHANGED'}]});
  c.storage.setItem(ACTIVE_CYCLE_KEY, revised);
  c.storage.setItem(RESULT_DRAFT_KEY, 'untouched');
  const outcome = resetActiveCycle({repo: c.repo, storage: c.storage, appState: c.appState, engineState: c.engineState});
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error.code, 'RESET_STALE_CYCLE');
  assert.equal(c.storage.getItem(ACTIVE_CYCLE_KEY), revised);
  assert.equal(c.storage.getItem(RESULT_DRAFT_KEY), 'untouched');
});

test('RESET-03 a storage read exception is not corrupted state and deletes nothing', () => {
  const c = appCycle();
  const storage = {...c.storage, getItem: (_key: string): string | null => {throw new Error('SecurityError');}};
  const outcome = resetActiveCycle({repo: createRepository(storage), storage, appState: c.appState, engineState: c.engineState});
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error.code, 'STORAGE_UNAVAILABLE');
  assert.equal(c.storage.getItem(ACTIVE_CYCLE_KEY), c.raw);
});

test('RESET-04 a draft cleanup error prevents deleting the active plan', () => {
  const c = appCycle();
  const storage = {...c.storage, removeItem: (_key: string): void => {throw new Error('not allowed');}};
  const outcome = resetActiveCycle({repo: createRepository(storage), storage, appState: c.appState, engineState: c.engineState});
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error.code, 'STORAGE_UNAVAILABLE');
  assert.equal(c.storage.getItem(ACTIVE_CYCLE_KEY), c.raw);
});

test('RESET-05 a clear failure does not pretend reset succeeded', () => {
  const c = appCycle();
  const repo = {read: () => c.storage.getItem(ACTIVE_CYCLE_KEY), write: (_raw: string) => {}, clear: () => {throw new Error('blocked');}};
  const outcome = resetActiveCycle({repo, storage: c.storage, appState: c.appState, engineState: c.engineState});
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error.code, 'STORAGE_UNAVAILABLE');
  assert.equal(c.storage.getItem(ACTIVE_CYCLE_KEY), c.raw);
});

test('RESET-06 silent failure to clear is detected by readback', () => {
  const c = appCycle();
  const repo = {read: () => c.storage.getItem(ACTIVE_CYCLE_KEY), write: (_raw: string) => {}, clear: () => {}};
  const outcome = resetActiveCycle({repo, storage: c.storage, appState: c.appState, engineState: c.engineState});
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error.code, 'RESET_NOT_CONFIRMED');
  assert.equal(c.storage.getItem(ACTIVE_CYCLE_KEY), c.raw);
});

test('RESET-07 completed cycle cannot bypass archiving through reset', () => {
  const c = appCycle();
  const outcome = resetActiveCycle({repo: c.repo, storage: c.storage, appState: c.appState, engineState: {...c.engineState, finalResultRecorded: true}});
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error.code, 'CYCLE_COMPLETED');
  assert.equal(c.storage.getItem(ACTIVE_CYCLE_KEY), c.raw);
});
