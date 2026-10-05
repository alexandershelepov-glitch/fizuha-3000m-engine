/**
 * Regression tests for the three decisions approved after the adversarial audit.
 *
 * 1. FOUNDATION outranks RE_ENTRY; a break acts as a load modifier, not as a phase.
 * 2. An explicit skip and an automatic past-due miss are the same operation.
 * 3. Continuous 3 km ability is mandatory for T1, T2 and T3.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBreak, assessCapacity, createEngine, deserialize, recordResult, replan, serialize, skipWorkout} from '../src/index.ts';
import type {EngineState, Profile} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, profile as baseProfile} from './helpers.ts';

const prepared = (o: Partial<Profile> = {}): Profile => baseProfile({
  ...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4,
  averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(120), ...o,
});
function healthyBreak(s: EngineState, days: number): EngineState {
  const now = dateAfter(days, s.asOf);
  return applyBreak(s, {days, endDate: now, reason: 'WORK'}, now);
}
function anyQuality(s: EngineState): EngineState {
  for (let n = 0; n < 120; n++) {
    const w = s.queue.find(x => x.countsAsQuality);
    if (w) return recordResult(s, w.id, feedback(w));
    s = replan(s, dateAfter(1, s.asOf));
  }
  throw new Error('no quality workout available');
}
const planOf = (s: EngineState) => s.queue.map(w => ({id: w.id, type: w.type, date: w.scheduledDate, dose: w.main.dose.value, quality: w.countsAsQuality}));

// ============================ Decision 1: FOUNDATION over RE_ENTRY ============================
test('AD01 no valid Current Performance keeps FOUNDATION and applies the break as a modifier', () => {
  let s = createEngine(baseProfile({...experienced, performance: null, raceDate: dateAfter(120)}), NOW);
  assert.equal(s.decision.phase, 'FOUNDATION');
  s = healthyBreak(s, 9);
  assert.equal(s.decision.phase, 'FOUNDATION', 'FOUNDATION must not be replaced by a separate RE_ENTRY phase');
  assert.notEqual(s.reentry, null, 'the RE_ENTRY load restriction is still tracked');
  assert.equal(s.reentry!.easyRemaining, 2);
  assert.equal(s.reentry!.easyFactor, 0.7);
  assert.equal(s.decision.gate, 'CLOSED');
  assert.equal(s.decision.maximumQualityPerWeek, 0);
  assert.ok(s.queue.every(w => !w.countsAsQuality));
  assert.ok(s.decision.reasons.includes('REENTRY_AFTER_BREAK'));
  for (let i = 0; i < 2; i++) {
    const w = s.queue[0]!;
    assert.equal(w.type, 'EASY', `mandatory easy session ${i + 1}`);
    assert.equal(w.volumeFactor, 0.7, `mandatory easy reduction ${i + 1}`);
    s = recordResult(s, w.id, feedback(w));
  }
  assert.equal(s.decision.phase, 'FOUNDATION', 'still FOUNDATION after completing the RE_ENTRY easies');
  assert.equal(s.reentry!.easyRemaining, 0);
});

test('AD02 cannot run 3 km continuously keeps FOUNDATION after a significant break', () => {
  let s = createEngine(baseProfile({...experienced, performance: null, canRun3Km: false}), NOW);
  assert.equal(s.decision.capacity, 'T0');
  assert.equal(s.decision.phase, 'FOUNDATION');
  s = healthyBreak(s, 9);
  assert.equal(s.decision.phase, 'FOUNDATION');
  assert.equal(s.decision.gate, 'CLOSED');
  assert.equal(s.decision.maximumQualityPerWeek, 0);
});

test('AD03 T0 keeps FOUNDATION after a significant break', () => {
  let s = createEngine(baseProfile({
    performance: {timeSeconds: 1200, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 1100,
    regularRunningWeeks: 2, actualRunsPerWeek: 1, availableRunsPerWeek: 2,
    averageWeeklyKm4Weeks: 5, longestUsualRunKm: 3, raceDate: dateAfter(120),
  }), NOW);
  assert.equal(s.decision.capacity, 'T0');
  assert.equal(s.decision.phase, 'FOUNDATION');
  s = healthyBreak(s, 9);
  assert.equal(s.decision.phase, 'FOUNDATION');
  assert.equal(s.decision.gate, 'CLOSED');
});

test('AD04 LONG_TERM + T1 + Q0 keeps FOUNDATION after a significant break', () => {
  const p = baseProfile({
    performance: {timeSeconds: 1100, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 810, raceDate: dateAfter(90),
    regularRunningWeeks: 8, actualRunsPerWeek: 2, availableRunsPerWeek: 2,
    averageWeeklyKm4Weeks: 9, longestUsualRunKm: 4,
  });
  let s = createEngine(p, NOW);
  assert.equal(s.decision.feasibility, 'LONG_TERM');
  assert.equal(s.decision.capacity, 'T1');
  assert.equal(s.decision.quality, 'Q0');
  assert.equal(s.decision.phase, 'FOUNDATION');
  s = healthyBreak(s, 9);
  assert.equal(s.decision.phase, 'FOUNDATION');
  assert.ok(s.decision.reasons.includes('FOUNDATION_LONG_TERM_CONFLICT'));
  assert.notEqual(s.reentry, null, 'the break still modifies the load');
  assert.equal(s.decision.gate, 'CLOSED');
});

test('AD05 RE_ENTRY still applies to a returning prepared runner', () => {
  // base phase would be DEVELOPMENT
  let d = createEngine(prepared(), NOW);
  assert.equal(d.decision.phase, 'DEVELOPMENT');
  d = healthyBreak(d, 10);
  assert.equal(d.decision.phase, 'RE_ENTRY');
  assert.equal(d.decision.gate, 'CLOSED');
  assert.equal(d.reentry!.easyRemaining, 2);
  // base phase would be SPECIFIC
  let sp = createEngine(prepared({
    performance: {timeSeconds: 900, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 880, raceDate: dateAfter(90),
  }), NOW);
  sp = anyQuality(sp); sp = anyQuality(sp);
  assert.equal(sp.decision.phase, 'SPECIFIC');
  sp = healthyBreak(sp, 10);
  assert.equal(sp.decision.phase, 'RE_ENTRY');
  assert.equal(sp.decision.gate, 'CLOSED');
  assert.ok(sp.queue.every(w => !w.countsAsQuality));
});

// ==================== Decision 2: explicit skip === automatic miss ====================
test('AD06 an explicit skip and an automatic past-due miss are the same operation', () => {
  const s = createEngine(prepared(), NOW);
  const victim = s.queue.find(w => w.countsAsQuality)!;
  const survivors = planOf(s).filter(w => w.id !== victim.id);
  const dosesBefore = JSON.stringify(s.doses);
  const streakBefore = JSON.stringify(s.successStreak);

  const skipped = skipWorkout(s, victim.id, s.asOf);   // explicit request on the same day
  const missed = replan(s, dateAfter(1, s.asOf));      // the clock simply moved past the date

  for (const [label, after] of [['skip', skipped], ['miss', missed]] as const) {
    assert.equal(after.queue.some(w => w.id === victim.id), false, `${label}: deleted from the current queue`);
    assert.equal(after.history.length, 0, `${label}: not a completed session`);
    assert.equal(after.history.some(h => h.workout.id === victim.id), false, `${label}: not counted as quality`);
    assert.equal(JSON.stringify(after.doses), dosesBefore, `${label}: no progression`);
    assert.equal(JSON.stringify(after.successStreak), streakBefore, `${label}: no confirmation recorded`);
    assert.equal(after.successfulQuality, 0, `${label}: quality counter untouched`);
    assert.ok(after.skippedIds.includes(victim.id), `${label}: recorded as skipped`);
    assert.ok(after.skippedWorkouts.some(w => w.id === victim.id), `${label}: skipped session retained for the budget`);
    assert.ok(after.queue.length <= after.profile.availableRunsPerWeek, `${label}: no training debt`);
    assert.equal(after.queue.some(w => w.scheduledDate === victim.scheduledDate), false,
      `${label}: no compensating session on the missed day`);
  }
  // Every session that existed before the miss keeps exactly the prescription already committed.
  // Only sessions that existed before the miss are compared: the automatic path is evaluated one
  // day later, so its rolling horizon naturally includes one extra slot.
  const survivorsOf = (a: EngineState) => a.queue
    .filter(w => survivors.some(sv => sv.id === w.id))
    .map(w => ({id: w.id, type: w.type, date: w.scheduledDate, dose: w.main.dose.value, quality: w.countsAsQuality}));
  assert.deepEqual(survivorsOf(skipped), survivors, 'an explicit skip must not change the committed plan');
  assert.deepEqual(survivorsOf(missed), survivors, 'an automatic miss must not change the committed plan');
  assert.deepEqual(survivorsOf(skipped), survivorsOf(missed), 'both paths must agree on the surviving plan');
  // An explicit skip on the same date adds no replacement session at all.
  assert.ok(skipped.queue.every(w => survivors.some(sv => sv.id === w.id)),
    'a skip must not add a replacement session');
  // The automatic miss may only pick up the slot that entered the rolling horizon as the clock moved.
  const addedByMiss = missed.queue.filter(w => !survivors.some(sv => sv.id === w.id));
  for (const w of addedByMiss) {
    assert.notEqual(w.id, victim.id);
    assert.ok(w.scheduledDate > victim.scheduledDate, 'a new slot must not fall on the missed day');
  }
});

test('AD07 after a miss a new quality session appears only by the standard limit and recovery rules', () => {
  const s = createEngine(prepared(), NOW);
  const victim = s.queue.find(w => w.countsAsQuality)!;
  let t = skipWorkout(s, victim.id, s.asOf);
  for (let day = 0; day < 12; day++) {
    t = replan(t, dateAfter(1, t.asOf));
    assert.equal(t.queue.some(w => w.countsAsQuality && w.scheduledDate === victim.scheduledDate), false,
      'the missed day is never refilled with a quality session');
    const dates = [...t.history.filter(h => h.workout.countsAsQuality).map(h => h.result.date),
                   ...t.queue.filter(w => w.countsAsQuality).map(w => w.scheduledDate)].sort();
    for (const date of dates) {
      const inWindow = dates.filter(x => Date.parse(x) <= Date.parse(date) && Date.parse(date) - Date.parse(x) < 7 * 86400000).length;
      assert.ok(inWindow <= 2, `weekly quality budget exceeded: ${dates.join(',')}`);
    }
    for (let i = 1; i < dates.length; i++) {
      assert.ok(Date.parse(dates[i]!) - Date.parse(dates[i - 1]!) >= 48 * 3600000, `48h recovery violated: ${dates.join(',')}`);
    }
  }
});

test('AD08 a saved state never resurrects a missed session on load', () => {
  const s = createEngine(prepared(), NOW);
  const victim = s.queue.find(w => w.countsAsQuality)!;
  const skipped = skipWorkout(s, victim.id, s.asOf);
  const restored = deserialize(serialize(skipped));
  assert.equal(serialize(restored), serialize(skipped), 'save/load must be exact');
  assert.equal(restored.queue.some(w => w.id === victim.id), false);
  assert.equal(restored.queue.some(w => w.scheduledDate === victim.scheduledDate), false);
  assert.ok(restored.skippedIds.includes(victim.id));

  const missed = replan(s, dateAfter(1, s.asOf));
  const restoredMiss = deserialize(serialize(missed));
  assert.equal(serialize(restoredMiss), serialize(missed));
  assert.equal(restoredMiss.queue.some(w => w.scheduledDate === victim.scheduledDate), false);
});

// ==================== Decision 3: can_run_3k is mandatory above T0 ====================
test('AD09 canRun3Km=false forces T0 over mileage, frequency and longest run', () => {
  const t1 = {regularRunningWeeks: 4, actualRunsPerWeek: 2, averageWeeklyKm4Weeks: 8, longestUsualRunKm: 3};
  const t2 = {regularRunningWeeks: 8, actualRunsPerWeek: 3, averageWeeklyKm4Weeks: 15, longestUsualRunKm: 6};
  const t3 = {regularRunningWeeks: 208, actualRunsPerWeek: 5, averageWeeklyKm4Weeks: 60, longestUsualRunKm: 15};
  for (const thresholds of [t1, t2, t3]) {
    assert.equal(assessCapacity(baseProfile({...thresholds, canRun3Km: false})), 'T0',
      `canRun3Km=false must force T0 for ${JSON.stringify(thresholds)}`);
  }
  const s = createEngine(baseProfile({...experienced, ...t3, canRun3Km: false}), NOW);
  assert.equal(s.decision.capacity, 'T0');
  assert.equal(s.decision.phase, 'FOUNDATION');
  assert.equal(s.decision.gate, 'CLOSED');
  assert.equal(s.decision.maximumQualityPerWeek, 0);
  assert.ok(s.queue.every(w => !w.countsAsQuality));
  assert.ok(s.queue.every(w => !['VO2', 'SPECIFIC_3K'].includes(w.type)));
});

test('AD10 canRun3Km=false keeps the runner at T0 even with a fresh valid performance', () => {
  const s = createEngine(baseProfile({
    performance: {timeSeconds: 900, date: NOW, source: 'TEST_3K'}, canRun3Km: false,
  }), NOW);
  assert.equal(s.decision.confidence, 'HIGH', 'the result itself is fresh and trustworthy');
  assert.equal(s.decision.capacity, 'T0');
  assert.equal(s.decision.phase, 'FOUNDATION');
  assert.equal(s.decision.gate, 'CLOSED');
  assert.equal(s.decision.maximumQualityPerWeek, 0);
  // T0 is not the "trained" branch of Goal Feasibility either.
  assert.equal(s.decision.effectiveSpeedMps, s.decision.currentSpeedMps);
});

test('AD11 canRun3Km=true leaves the T1/T2/T3 thresholds exactly as before', () => {
  const t1 = {regularRunningWeeks: 4, actualRunsPerWeek: 2, averageWeeklyKm4Weeks: 8, longestUsualRunKm: 3};
  const t2 = {regularRunningWeeks: 8, actualRunsPerWeek: 3, averageWeeklyKm4Weeks: 15, longestUsualRunKm: 6};
  const t3 = {regularRunningWeeks: 12, actualRunsPerWeek: 4, averageWeeklyKm4Weeks: 25, longestUsualRunKm: 8};
  assert.equal(assessCapacity(baseProfile({...t1, canRun3Km: true})), 'T1');
  assert.equal(assessCapacity(baseProfile({...t2, canRun3Km: true})), 'T2');
  assert.equal(assessCapacity(baseProfile({...t3, canRun3Km: true})), 'T3');
  assert.equal(assessCapacity(baseProfile({...t3, canRun3Km: true, longestUsualRunKm: 7.99})), 'T2');
});
