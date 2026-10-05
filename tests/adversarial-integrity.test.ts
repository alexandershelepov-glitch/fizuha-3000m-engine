/**
 * Adversarial audit — determinism, immutability, serialisation, calendar safety
 * and dose coherence. spec 5, 19, 20, 23, 26 and invariant 14.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBreak, createEngine, deserialize, moveWorkout, recordCheckpoint, recordResult,
        replan, serialize, skipWorkout} from '../src/index.ts';
// NOTE: src/index.ts does not re-export validation.ts, so the calendar helpers are
// imported from their own module. Recorded in the audit report as an API-surface gap.
import {addDays, day} from '../src/validation.ts';
import type {EngineState, PerformanceSnapshot, Profile, TrainingBreak, WorkoutResult} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, profile as baseProfile} from './helpers.ts';

const fast = (o: Partial<Profile> = {}): Profile => baseProfile({
  ...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4,
  averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(90), ...o,
});
function step(s: EngineState, kind: 'GREEN' | 'GREEN_PLUS' | 'YELLOW' = 'GREEN'): EngineState {
  for (let n = 0; n < 120; n++) {
    const w = s.queue.find(x => x.countsAsQuality);
    if (w) return recordResult(s, w.id, feedback(w, kind));
    s = replan(s, dateAfter(1, s.asOf));
  }
  throw new Error('no quality workout available');
}

// ----------------------------------------------------------- Determinism
test('F01 identical inputs and identical event streams give byte-identical states', () => {
  const p = fast();
  const stream: (readonly ['quality' | 'advance' | 'skip', number])[] = [
    ['quality', 0], ['advance', 3], ['quality', 0], ['advance', 4], ['skip', 0],
    ['advance', 5], ['quality', 0], ['advance', 2],
  ];
  const run = (): EngineState => {
    let s = createEngine(p, NOW);
    for (const [op, n] of stream) {
      if (op === 'quality') s = step(s);
      else if (op === 'advance') s = replan(s, dateAfter(n, s.asOf));
      else { const w = s.queue[0]!; s = skipWorkout(s, w.id, s.asOf); }
    }
    return s;
  };
  const a = run(), b = run();
  assert.equal(serialize(a), serialize(b));
  assert.deepEqual(a.decision, b.decision);
  assert.deepEqual(a.queue, b.queue);
});

test('F02 repeating the same decision fifty times never drifts', () => {
  const s = createEngine(fast(), NOW);
  const first = serialize(replan(s, NOW));
  for (let i = 0; i < 50; i++) assert.equal(serialize(replan(s, NOW)), first);
});

test('F03 the source never reads a clock or a random source', async () => {
  const {readFileSync, readdirSync} = await import('node:fs');
  const dir = new URL('../src/', import.meta.url);
  for (const file of readdirSync(dir)) {
    const text = readFileSync(new URL(file, dir), 'utf8');
    for (const banned of ['Date.now', 'new Date()', 'Math.random', 'process.env', 'performance.now']) {
      assert.ok(!text.includes(banned), `${file} uses ${banned}`);
    }
  }
});

// --------------------------------------------------------- Immutability
test('F04 no public operation mutates its arguments', () => {
  const p = fast();
  const pSnapshot = JSON.stringify(p);
  const brk: TrainingBreak = {days: 9, endDate: NOW, reason: 'WORK'};
  const brkSnapshot = JSON.stringify(brk);
  const perf: PerformanceSnapshot = {timeSeconds: 940, date: NOW, source: 'TEST_3K'};
  const perfSnapshot = JSON.stringify(perf);

  let s = createEngine(p, NOW);
  s = replan(s, dateAfter(1, s.asOf));
  const beforeResult = JSON.stringify(s);
  const w = s.queue.find(x => x.id === 'slot-' + s.asOf) ?? s.queue[0]!;
  const result: WorkoutResult = feedback(w);
  const rSnapshot = JSON.stringify(result);
  recordResult(s, w.id, result);
  assert.equal(JSON.stringify(s), beforeResult, 'recordResult mutated the input state');
  assert.equal(JSON.stringify(result), rSnapshot, 'recordResult mutated the result argument');
  skipWorkout(s, s.queue[0]!.id, s.asOf);
  assert.equal(JSON.stringify(s), beforeResult, 'skipWorkout mutated the input state');
  applyBreak(s, brk, s.asOf);
  assert.equal(JSON.stringify(s), beforeResult, 'applyBreak mutated the input state');
  recordCheckpoint(s, perf, s.asOf);
  assert.equal(JSON.stringify(s), beforeResult, 'recordCheckpoint mutated the input state');
  const occupied = new Set([...s.queue.map(x => x.scheduledDate), ...s.history.map(h => h.result.date)]);
  const free = Array.from({length: 7}, (_, i) => dateAfter(i, s.asOf)).find(d => !occupied.has(d));
  if (free) { moveWorkout(s, s.queue[0]!.id, free); assert.equal(JSON.stringify(s), beforeResult, 'moveWorkout mutated the input state'); }

  assert.equal(JSON.stringify(p), pSnapshot, 'the profile argument was mutated');
  assert.equal(JSON.stringify(result), rSnapshot, 'the result argument was mutated');
  assert.equal(JSON.stringify(brk), brkSnapshot, 'the break argument was mutated');
  assert.equal(JSON.stringify(perf), perfSnapshot, 'the performance argument was mutated');
});

test('F05 serialisation round trip is exact, idempotent and still validated', () => {
  let s = createEngine(fast(), NOW);
  s = step(s); s = replan(s, dateAfter(4, s.asOf)); s = step(s);
  const json = serialize(s);
  const back = deserialize(json);
  assert.equal(serialize(back), json, 'round trip must be byte identical');
  assert.deepEqual(back.decision, s.decision);
  assert.deepEqual(back.queue, s.queue);
  assert.deepEqual(back.history, s.history);
  // Tampering with a persisted field must be caught on load.
  const tampered = JSON.parse(json) as EngineState;
  tampered.profile.targetTimeSeconds = 0;
  assert.throws(() => deserialize(JSON.stringify(tampered)), /Number outside/);
  const tamperedDate = JSON.parse(json) as EngineState;
  tamperedDate.profile.raceDate = '2026-02-30';
  assert.throws(() => deserialize(JSON.stringify(tamperedDate)));
});

// ----------------------------------------------------------- Calendar
test('F06 calendar arithmetic is pure UTC and survives DST and leap boundaries', () => {
  const pairs: readonly (readonly [string, string])[] = [
    ['2026-03-28', '2026-03-29'], // European DST switch
    ['2026-03-29', '2026-03-30'],
    ['2026-03-08', '2026-03-09'], // US DST switch
    ['2026-10-24', '2026-10-25'], // European DST switch back
    ['2026-12-31', '2027-01-01'],
    ['2028-02-28', '2028-02-29'], // leap day
    ['2028-02-29', '2028-03-01'],
  ];
  for (const [from, to] of pairs) {
    assert.equal(addDays(from, 1), to, `${from} + 1 day`);
    assert.equal(addDays(to, -1), from, `${to} - 1 day`);
    assert.equal(day(to) - day(from), 1, `${from} -> ${to} is one calendar day`);
  }
  assert.equal(day('2026-03-29') - day('2026-03-28'), 1);
  assert.equal(addDays('2026-10-25', 0), '2026-10-25');
  // A 7-day horizon must always cover exactly seven distinct dates.
  for (const start of ['2026-03-25', '2026-10-20', '2026-12-29']) {
    const dates = new Set(Array.from({length: 7}, (_, i) => addDays(start, i)));
    assert.equal(dates.size, 7, `seven distinct dates from ${start}`);
  }
});

test('F07 results must be submitted in chronological order', () => {
  const s = createEngine(fast(), NOW);
  const w = s.queue[0]!;
  // A result dated before the state is refused outright.
  assert.throws(() => recordResult(s, w.id, feedback(w, 'GREEN', {date: dateAfter(-1)})), /precedes/);
  // Recording a later session first pushes the clock forward, so the earlier one is gone.
  const second = s.queue.find(x => x.scheduledDate !== w.scheduledDate);
  assert.ok(second, 'precondition: a second date is queued');
  const later = recordResult(s, second!.id, feedback(second!));
  assert.throws(() => recordResult(later, w.id, feedback(w)));
});

// -------------------------------------------------------- Dose coherence
test('F08 working doses never fall below the last confirmed dose and reasons agree', () => {
  let s = createEngine(fast(), NOW);
  for (let i = 0; i < 8; i++) {
    s = step(s);
    for (const [type, dose] of Object.entries(s.doses)) {
      const confirmed = s.confirmedDoses[type as keyof typeof s.confirmedDoses];
      if (!confirmed) continue;
      assert.ok(dose!.value >= confirmed.value, `${type} working dose below the confirmed dose`);
      assert.equal(dose!.unit, confirmed.unit, `${type} dose unit changed`);
    }
    const anyGrowth = Object.entries(s.doses).some(([type, dose]) =>
      dose!.value > (s.confirmedDoses[type as keyof typeof s.confirmedDoses]?.value ?? dose!.value));
    assert.equal(s.decision.reasons.includes('PROGRESSION_ALLOWED'), anyGrowth,
      'PROGRESSION_ALLOWED must exactly mirror "working dose above confirmed dose"');
    assert.equal(s.decision.reasons.includes('PROGRESSION_BLOCKED'), s.progressionBlocked);
  }
});

test('F09 an explicit skip never changes the following prescription', () => {
  for (const avail of [2, 3, 4, 5, 7]) {
    const s = createEngine(baseProfile({...experienced, availableRunsPerWeek: avail, actualRunsPerWeek: 4,
      averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(90)}), NOW);
    if (s.queue.length < 2) continue;
    const second = s.queue[1]!;
    const skipped = skipWorkout(s, s.queue[0]!.id, s.asOf);
    const kept = skipped.queue.find(w => w.id === second.id);
    if (kept) assert.deepEqual(kept, second, `skip changed the following prescription (avail=${avail})`);
  }
});

test('F09b an explicit skip and an automatic past-due miss produce the same state (approved decision 2)', () => {
  const s = createEngine(baseProfile({...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 3,
    averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(90)}), NOW);
  const first = s.queue[0]!;
  const second = s.queue[1]!;
  assert.equal(first.countsAsQuality, true, 'precondition: the first slot is a quality session');
  assert.equal(second.countsAsQuality, false, 'precondition: the second slot is aerobic');

  const skipped = skipWorkout(s, first.id, s.asOf);        // explicit request, same day
  const overdue = replan(s, dateAfter(1, s.asOf));         // the clock simply moved past the date

  for (const [label, after] of [['skip', skipped], ['miss', overdue]] as const) {
    assert.ok(!after.queue.some(w => w.id === first.id), `${label}: the missed session leaves the queue`);
    assert.ok(after.skippedIds.includes(first.id), `${label}: the missed session is recorded as skipped`);
    assert.equal(after.history.some(h => h.workout.id === first.id), false, `${label}: not counted as completed`);
    const kept = after.queue.find(w => w.id === second.id)!;
    assert.equal(kept.countsAsQuality, false, `${label}: the next load must not rise`);
    assert.equal(kept.type, second.type, `${label}: the next session keeps its type`);
    assert.equal(kept.main.dose.value, second.main.dose.value, `${label}: the next session keeps its dose`);
    assert.equal(kept.scheduledDate, second.scheduledDate, `${label}: the next session is not pulled forward`);
  }
  // The two paths differ only in the clock they were evaluated at.
  const nextOf = (a: EngineState) => a.queue.filter(w => w.id === second.id)
    .map(w => ({type: w.type, dose: w.main.dose.value, quality: w.countsAsQuality}));
  assert.deepEqual(nextOf(skipped), nextOf(overdue), 'both skip paths must agree');

  // No compensating session appears on the day of the miss, and the budget still holds.
  for (const after of [skipped, overdue]) {
    assert.equal(after.queue.some(w => w.scheduledDate === first.scheduledDate), false,
      'a missed session must not be replayed on the same day');
    const dates = [...after.history.filter(h => h.workout.countsAsQuality).map(h => h.result.date),
                   ...after.queue.filter(w => w.countsAsQuality).map(w => w.scheduledDate)].sort();
    for (const date of dates) {
      const inWindow = dates.filter(x => Date.parse(x) <= Date.parse(date) && Date.parse(date) - Date.parse(x) < 7 * 86400000).length;
      assert.ok(inWindow <= 2, 'the weekly quality budget still holds after a miss');
    }
  }
});

test('F10 quality sessions queued in the future never exceed the session budget for their own date', () => {
  const s = createEngine(fast(), NOW);
  const dates = s.queue.filter(w => w.countsAsQuality).map(w => w.scheduledDate);
  for (const date of dates) {
    const inWindow = dates.filter(d => Date.parse(d) <= Date.parse(date) && Date.parse(date) - Date.parse(d) < 7 * 86400000).length;
    assert.ok(inWindow <= s.decision.maximumQualityPerWeek, `quality budget exceeded on ${date}`);
  }
});
