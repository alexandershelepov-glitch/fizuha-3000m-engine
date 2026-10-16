/**
 * QA issue #23, DEF-001: REST placeholders of a safety hold are service days, not missed sessions.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, replan, skipWorkout} from '../src/index.ts';
import {NOW, dateAfter, healthy, profile} from './helpers.ts';

const held = () => createEngine(profile({availableRunsPerWeek: 4, safety: {...healthy(), pain: 3}}), NOW);

test('DEF-001 engine: past REST service days are dropped on replan without creating misses', () => {
  const s = held();
  assert.ok(s.queue.length > 0 && s.queue.every(w => w.type === 'REST'));
  const later = replan(s, dateAfter(3));
  assert.deepEqual(later.skippedWorkouts, []);
  assert.deepEqual(later.skippedIds, []);
  assert.ok(later.queue.every(w => w.scheduledDate >= dateAfter(3)), 'stale REST days leave the queue');
});

test('DEF-001 engine: skipping a REST day registers no miss', () => {
  const s = held();
  const out = skipWorkout(s, s.queue[0]!.id, NOW);
  assert.deepEqual(out.skippedWorkouts, []);
  assert.deepEqual(out.skippedIds, []);
});

test('DEF-001 engine: a really missed session is still registered as a miss exactly as before', () => {
  const s = createEngine(profile({availableRunsPerWeek: 4}), NOW);
  const first = s.queue.find(w => w.type !== 'REST')!;
  const later = replan(s, dateAfter(2));
  assert.ok(later.skippedWorkouts.some(w => w.id === first.id));
  assert.ok(later.skippedIds.includes(first.id));
});
