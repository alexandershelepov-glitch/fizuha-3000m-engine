/**
 * Safety recheck must never erase a cycle, manufacture permission or silently skip past sessions.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recheckSafety} from '../web/src/application/safetyRecheck.ts';
import {previewGoalDecision} from '../web/src/application/engineGateway.ts';
import {loadActiveCycle} from '../web/src/application/storage.ts';
import {buildProfile, healthySafety, defaultDraft} from '../web/src/application/questionnaire.ts';
import {appCycle} from './helpers-app.ts';
import {NOW, dateAfter} from './helpers.ts';

const at = NOW + 'T12:00:00.000Z';
const hold = {...healthySafety(), pain: 3};

test('RECOVERY-01 a new healthy report is re-assessed by engine, saved and event logged', () => {
  const c = appCycle({safety: hold});
  assert.equal(c.engineState.decision.safety, 'HOLD');
  assert.ok(c.engineState.queue.every(w => w.type === 'REST'));
  const result = recheckSafety({repo: c.repo, appState: c.appState, engineState: c.engineState, safety: healthySafety(), medicalReviewConfirmed: true, deviceToday: NOW, at});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.done.engineState.decision.safety, 'OK');
  assert.equal(result.done.appState.cycle.cycleId, c.appState.cycle.cycleId);
  assert.deepEqual(result.done.appState.cycle.baseline, c.appState.cycle.baseline);
  assert.deepEqual(result.done.engineState.history, c.engineState.history);
  const event = result.done.appState.events.at(-1);
  assert.equal(event?.type, 'SAFETY_REASSESSED');
  assert.ok(result.done.engineState.queue.some(w => w.type !== 'REST'));
  assert.equal(loadActiveCycle(c.repo).kind, 'READY');
});

test('RECOVERY-02 continuing symptoms preserve the hold and keep cycle', () => {
  const c = appCycle({safety: hold});
  const result = recheckSafety({repo: c.repo, appState: c.appState, engineState: c.engineState, safety: hold, medicalReviewConfirmed: true, deviceToday: NOW, at});
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.done.engineState.decision.safety, 'HOLD');
    assert.ok(result.done.engineState.queue.every(w => w.type === 'REST'));
  }
});

test('RECOVERY-03 missing medical-review affirmation cannot save a changed state', () => {
  const c = appCycle({safety: hold});
  const result = recheckSafety({repo: c.repo, appState: c.appState, engineState: c.engineState, safety: healthySafety(), medicalReviewConfirmed: false, deviceToday: NOW, at});
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'SAFETY_REVIEW_NOT_CONFIRMED');
  assert.equal(c.storage.map.get('fizuha.activeCycle'), c.raw);
});

test('RECOVERY-04 past sessions must be closed before rechecking: no silent misses', () => {
  const c = appCycle({safety: hold});
  const result = recheckSafety({repo: c.repo, appState: c.appState, engineState: c.engineState, safety: healthySafety(), medicalReviewConfirmed: true, deviceToday: dateAfter(2), at});
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'PENDING_RESULT_BLOCKED');
  assert.equal(c.storage.map.get('fizuha.activeCycle'), c.raw);
});

test('RECOVERY-05 goal preview is exactly the engine verdict, never a second formula', () => {
  const draft = {...defaultDraft(NOW), regularRunningWeeks: '20', resultTime: '15:20', targetTime: '14:30', raceDate: dateAfter(56)};
  const built = buildProfile(draft);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const c = appCycle();
  const preview = previewGoalDecision(built.profile, NOW);
  assert.equal(preview.feasibility, c.engineState.decision.feasibility);
});
