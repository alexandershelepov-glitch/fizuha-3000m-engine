/**
 * Persistence: reading, failure classes and the guarantee that stored data is never repaired or
 * discarded silently (docs/pwa-architecture.md §8.2).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVE_CYCLE_KEY, createRepository, loadActiveCycle, saveActiveCycle} from '../web/src/application/storage.ts';
import {createCycle} from '../web/src/application/cycle.ts';
import {buildProfile} from '../web/src/application/questionnaire.ts';
import {APP_FORMAT_VERSION} from '../web/src/application/appState.ts';
import {CYCLE_ID, CREATED_AT, draft, memoryStorage, repository} from './helpers-app.ts';
import {NOW, dateAfter} from './helpers.ts';

/** The parts of the stored record these tests deliberately damage. */
interface StoredEnvelope {
  formatVersion: number;
  cycle: {cycleId: string; createdAt: string; engineStateVersion: number; engineState: string; baseline: Record<string, unknown>};
  events: unknown;
  ui: {units: string; locale: string};
}

function storedCycle() {
  const storage = memoryStorage();
  const built = buildProfile(draft());
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error('fixture');
  const created = createCycle(repository(storage), {
    profile: built.profile, deviceToday: NOW, cycleId: CYCLE_ID, createdAt: CREATED_AT, locale: 'ru-RU',
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('fixture');
  return {storage, envelope: JSON.parse(storage.map.get(ACTIVE_CYCLE_KEY)!) as StoredEnvelope};
}

test('STORE-01 an empty storage means there is no active cycle', () => {
  assert.deepEqual(loadActiveCycle(repository(memoryStorage())), {kind: 'EMPTY'});
});

test('STORE-02 a stored cycle is restored through the official reader', () => {
  const {storage, envelope} = storedCycle();
  const result = loadActiveCycle(repository(storage));
  assert.equal(result.kind, 'READY');
  if (result.kind !== 'READY') return;
  assert.equal(result.appState.cycle.cycleId, CYCLE_ID);
  assert.equal(result.engineState.queue.length > 0, true);
  assert.equal(result.engineState.asOf, NOW);
  // Reading does not modify what is on disk.
  assert.deepEqual(JSON.parse(storage.map.get(ACTIVE_CYCLE_KEY)!), envelope);
  assert.equal(storage.writes, 1);
});

test('STORE-03 broken JSON is reported as damaged, never repaired', () => {
  const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: '{not json'});
  assert.deepEqual(loadActiveCycle(repository(storage)), {kind: 'DAMAGED', detail: 'JSON'});
  assert.equal(storage.map.get(ACTIVE_CYCLE_KEY), '{not json');
});

test('STORE-04 a structurally wrong envelope is damaged and kept as is', () => {
  for (const broken of [
    {formatVersion: 1},
    {formatVersion: 1, cycle: {cycleId: 'c', createdAt: 'x', engineStateVersion: 1, engineState: '', baseline: {}}},
    {...storedCycle().envelope, cycle: {...storedCycle().envelope.cycle, engineState: 42}},
    {...storedCycle().envelope, events: 'nope'},
    {...storedCycle().envelope, ui: {units: 'IMPERIAL', locale: 'ru-RU'}},
  ]) {
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: JSON.stringify(broken)});
    const result = loadActiveCycle(repository(storage));
    assert.ok(result.kind === 'DAMAGED' || result.kind === 'UNSUPPORTED_FORMAT', `unexpected ${result.kind}`);
    assert.ok(storage.map.has(ACTIVE_CYCLE_KEY), 'the record must not be deleted');
  }
});

test('STORE-05 a newer envelope version is refused without deleting the data', () => {
  const {storage, envelope} = storedCycle();
  envelope.formatVersion = APP_FORMAT_VERSION + 1;
  storage.map.set(ACTIVE_CYCLE_KEY, JSON.stringify(envelope));

  const result = loadActiveCycle(repository(storage));
  assert.deepEqual(result, {kind: 'UNSUPPORTED_FORMAT', formatVersion: APP_FORMAT_VERSION + 1});
  assert.ok(storage.map.get(ACTIVE_CYCLE_KEY)!.includes('formatVersion'));
});

test('STORE-06 a newer engine state version is refused without deleting the data', () => {
  const {storage, envelope} = storedCycle();
  const engineState = JSON.parse(envelope.cycle.engineState);
  engineState.version = 2;
  envelope.cycle.engineState = JSON.stringify(engineState);
  storage.map.set(ACTIVE_CYCLE_KEY, JSON.stringify(envelope));

  assert.deepEqual(loadActiveCycle(repository(storage)), {kind: 'UNSUPPORTED_ENGINE_STATE'});
  assert.ok(storage.map.has(ACTIVE_CYCLE_KEY));
});

test('STORE-07 an engine state whose clock is past the race date is reported, not guessed', () => {
  const {storage, envelope} = storedCycle();
  const engineState = JSON.parse(envelope.cycle.engineState);
  // Legitimately unreachable through the public API: the clock cannot pass the race date without a
  // terminal marker. The reader must still classify it instead of crashing.
  engineState.asOf = dateAfter(1, engineState.profile.raceDate);
  engineState.finalResultRecorded = false;
  envelope.cycle.engineState = JSON.stringify(engineState);
  storage.map.set(ACTIVE_CYCLE_KEY, JSON.stringify(envelope));

  assert.deepEqual(loadActiveCycle(repository(storage)), {kind: 'IMPOSSIBLE_STATE'});
  assert.ok(storage.map.has(ACTIVE_CYCLE_KEY));
});

test('STORE-08 saving writes one record under one documented key', () => {
  const {storage} = storedCycle();
  assert.deepEqual([...storage.map.keys()], [ACTIVE_CYCLE_KEY]);
  const envelope = JSON.parse(storage.map.get(ACTIVE_CYCLE_KEY)!);
  const repo = createRepository(storage);
  saveActiveCycle(repo, {...envelope, events: []});
  assert.deepEqual(JSON.parse(storage.map.get(ACTIVE_CYCLE_KEY)!).events, []);
  assert.equal(storage.writes, 2);
});
