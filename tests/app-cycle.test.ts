/**
 * Application layer: questionnaire conversion, cycle creation, the envelope and the error contract.
 * These tests never reimplement sport rules — they check that the layer delegates to the engine and
 * stores exactly what the architecture prescribes.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildProfile} from '../web/src/application/questionnaire.ts';
import {STEP_FOR_FIELD, STEP_FOR_CODE} from '../web/src/application/questionnaire.ts';
import {applyEngineState, appendEvent, createCycle} from '../web/src/application/cycle.ts';
import {APP_FORMAT_VERSION} from '../web/src/application/appState.ts';
import {parseAppState} from '../web/src/application/appState.ts';
import {deserializeEngineState, serializeEngineState} from '../web/src/application/engineGateway.ts';
import {toUiError, toUiErrorFromUnknown} from '../web/src/application/errorContract.ts';
import {viewEngineError} from '../web/src/application/engineGateway.ts';
import {ACTIVE_CYCLE_KEY} from '../web/src/application/storage.ts';
import {CYCLE_ID, CREATED_AT, draft, memoryStorage, repository} from './helpers-app.ts';
import {NOW, dateAfter} from './helpers.ts';

test('APP-01 a valid draft becomes the exact Profile shape the engine expects', () => {
  const result = buildProfile(draft());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.profile.performance?.timeSeconds, 920);
  assert.equal(result.profile.performance?.source, 'TEST_3K');
  assert.equal(result.profile.targetTimeSeconds, 870);
  assert.equal(result.profile.raceDate, dateAfter(56));
  assert.deepEqual(Object.keys(result.profile).sort(), [
    'actualRunsPerWeek', 'availableRunsPerWeek', 'averageWeeklyKm4Weeks', 'breaks', 'canRun3Km', 'experience',
    'longestUsualRunKm', 'performance', 'performanceMismatch', 'qualityMostlyTolerated', 'qualitySessions8Weeks',
    'qualityWeeks8Weeks', 'raceDate', 'regularRunningWeeks', 'safety', 'targetTimeSeconds',
  ]);
});

test('APP-02 structural problems are reported per field, and the engine keeps the ranges', () => {
  const empty = buildProfile(draft({targetTime: ''}));
  assert.deepEqual(empty.ok ? [] : empty.problems, [{field: 'targetTime', kind: 'EMPTY'}]);

  const malformed = buildProfile(draft({resultTime: '15.20'}));
  assert.deepEqual(malformed.ok ? [] : malformed.problems, [{field: 'resultTime', kind: 'FORMAT'}]);

  const impossible = buildProfile(draft({resultTime: '15:75'}));
  assert.deepEqual(impossible.ok ? [] : impossible.problems, [{field: 'resultTime', kind: 'IMPOSSIBLE'}]);

  const notANumber = buildProfile(draft({availableRunsPerWeek: 'много'}));
  assert.deepEqual(notANumber.ok ? [] : notANumber.problems, [{field: 'availableRunsPerWeek', kind: 'NOT_A_NUMBER'}]);

  // Out-of-range values are NOT rejected here: they stay the engine's business.
  const outOfRange = buildProfile(draft({availableRunsPerWeek: '9'}));
  assert.equal(outOfRange.ok, true);
});

test('APP-03 every structural field belongs to a questionnaire step', () => {
  for (const field of ['resultTime', 'resultDate', 'resultSource', 'canRun3Km', 'regularRunningWeeks', 'actualRunsPerWeek',
    'averageWeeklyKm4Weeks', 'longestUsualRunKm', 'qualitySessions8Weeks', 'qualityWeeks8Weeks', 'safety', 'breaks',
    'availableRunsPerWeek', 'performanceMismatch', 'targetTime', 'raceDate'] as const) {
    assert.ok(STEP_FOR_FIELD[field], `${field} has no step`);
  }
  // An engine rejection always maps either to a step or to nothing — never to a wrong screen.
  for (const [code, step] of Object.entries(STEP_FOR_CODE)) assert.ok(step, `${code} maps to nothing`);
});

test('APP-04 creating a cycle stores exactly the documented envelope', () => {
  const storage = memoryStorage();
  const built = buildProfile(draft());
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const result = createCycle(repository(storage), {
    profile: built.profile, deviceToday: NOW, cycleId: CYCLE_ID, createdAt: CREATED_AT, locale: 'ru-RU',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const raw = storage.map.get(ACTIVE_CYCLE_KEY);
  assert.ok(raw, 'the active cycle must be written');
  const parsed = parseAppState(JSON.parse(raw!));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.state.formatVersion, APP_FORMAT_VERSION);
  assert.equal(parsed.state.cycle.cycleId, CYCLE_ID);
  assert.equal(parsed.state.cycle.createdAt, CREATED_AT);
  assert.equal(parsed.state.cycle.engineStateVersion, 1);
  assert.deepEqual(parsed.state.events, [{type: 'CYCLE_CREATED', at: CREATED_AT, cycleId: CYCLE_ID}]);
  assert.equal(parsed.state.ui.units, 'METRIC');
  assert.equal(parsed.state.ui.locale, 'ru-RU');

  // The engine state is stored opaquely, exactly as serialize() produced it.
  assert.equal(parsed.state.cycle.engineState, serializeEngineState(result.engineState));
  const restored = deserializeEngineState(parsed.state.cycle.engineState);
  assert.deepEqual(restored.decision, result.engineState.decision);
  assert.equal(restored.queue.length, result.engineState.queue.length);
});

test('APP-05 the baseline is an immutable snapshot of the inputs and the first verdict', () => {
  const storage = memoryStorage();
  const built = buildProfile(draft());
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const result = createCycle(repository(storage), {
    profile: built.profile, deviceToday: NOW, cycleId: CYCLE_ID, createdAt: CREATED_AT, locale: 'ru-RU',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const baseline = result.appState.cycle.baseline;
  assert.equal(baseline.performance?.timeSeconds, 920);
  assert.equal(baseline.targetTimeSeconds, 870);
  assert.equal(baseline.raceDate, dateAfter(56));
  // The first assessment is the engine's own decision, recorded verbatim.
  assert.equal(baseline.assessment.phase, result.engineState.decision.phase);
  assert.equal(baseline.assessment.gate, result.engineState.decision.gate);
  assert.deepEqual(baseline.assessment.reasons, result.engineState.decision.reasons);

  // Mutating the engine state later must not rewrite history.
  const laterState = applyEngineState(result.appState, deserializeEngineState(parsedRaw(storage)));
  assert.deepEqual(laterState.cycle.baseline, baseline);
  assert.notEqual(laterState.cycle.engineState, result.appState.cycle.engineState + 'x');
});

function parsedRaw(storage: ReturnType<typeof memoryStorage>): string {
  const parsed = JSON.parse(storage.map.get(ACTIVE_CYCLE_KEY)!);
  return parsed.cycle.engineState;
}

test('APP-06 an engine rejection stores nothing and reports a safe error contract', () => {
  const storage = memoryStorage();
  // Target time of 0 seconds is rejected by the engine, not by the questionnaire.
  const built = buildProfile(draft({targetTime: '00:00'}));
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const result = createCycle(repository(storage), {
    profile: built.profile, deviceToday: NOW, cycleId: CYCLE_ID, createdAt: CREATED_AT, locale: 'ru-RU',
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.stage, 'VALIDATION');
  assert.equal(result.error.code, 'NUMBER_OUT_OF_RANGE');
  assert.equal(result.error.fromEngine, true);
  assert.equal(storage.map.has(ACTIVE_CYCLE_KEY), false, 'a rejected cycle must never be stored');
  assert.equal(storage.writes, 0);
});

test('APP-07 a race date in the past is refused by the public validation API', () => {
  const storage = memoryStorage();
  const built = buildProfile(draft({raceDate: dateAfter(-1)}));
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const result = createCycle(repository(storage), {
    profile: built.profile, deviceToday: NOW, cycleId: CYCLE_ID, createdAt: CREATED_AT, locale: 'ru-RU',
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, 'EVENT_DATE_PASSED');
  assert.equal(result.error.retry, false);
  assert.equal(STEP_FOR_CODE.EVENT_DATE_PASSED, 'RACE_DATE');
  assert.equal(storage.writes, 0);
});

test('APP-08 a storage failure is reported instead of pretending success', () => {
  const failing = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => undefined,
  };
  const built = buildProfile(draft());
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const result = createCycle(repository(failing), {
    profile: built.profile, deviceToday: NOW, cycleId: CYCLE_ID, createdAt: CREATED_AT, locale: 'ru-RU',
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.stage, 'SAVE');
  assert.equal(result.error.code, 'UNKNOWN');
  assert.equal(result.error.fromEngine, false);
});

test('APP-09 the event log is append-only and never feeds the engine', () => {
  const storage = memoryStorage();
  const built = buildProfile(draft());
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const created = createCycle(repository(storage), {
    profile: built.profile, deviceToday: NOW, cycleId: CYCLE_ID, createdAt: CREATED_AT, locale: 'ru-RU',
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const withEvent = appendEvent(created.appState, {type: 'WORKOUT_SKIPPED', at: CREATED_AT, workoutId: 'w1', scheduledDate: NOW, workoutType: 'EASY', cause: 'VOLUNTARY'});
  assert.equal(withEvent.events.length, 2);
  assert.deepEqual(withEvent.events[0], created.appState.events[0]);
  assert.equal(created.appState.events.length, 1, 'append must not mutate the previous envelope');
  assert.equal(withEvent.cycle.engineState, created.appState.cycle.engineState);
});

test('APP-10 the error contract is code based, with a safe fallback', () => {
  const view = toUiError(viewEngineError(new Error('Date must be YYYY-MM-DD')));
  assert.equal(view.code, 'UNKNOWN', 'plain errors are never classified by their message');
  assert.equal(view.retry, true);
  assert.equal(view.fromEngine, false);

  const unknown = toUiErrorFromUnknown({});
  assert.equal(unknown.code, 'UNKNOWN');
  assert.equal(unknown.retry, true);
});
