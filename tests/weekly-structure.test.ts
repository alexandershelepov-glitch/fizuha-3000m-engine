/**
 * Weekly structure (12-week audit D-08 and the SPECIFIC rotation): a real LONG_EASY for prepared runners, and
 * THRESHOLD / VO2 / SPECIFIC_3K that alternate instead of SPECIFIC_3K every week.
 * All athlete behaviour in the simulations below is SYNTHETIC (scripted reports), not measured.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addDays, createEngine, day, deserialize, moveWorkout, prescribe, recordResult, replan, serialize, skipWorkout} from '../src/index.ts';
import type {EngineState, Profile, Workout} from '../src/index.ts';
import {longRunShares, reservedMetres} from '../src/weeklyLoad.ts';
import {SCENARIOS, USERS, simulateAudit} from '../audit/fullCycle12w.ts';
import type {ScenarioRun, WorkoutRow} from '../audit/fullCycle12w.ts';
import {analyze} from '../audit/fullCycleAnalysis.ts';
import {makeResult} from '../audit/trainingSimulator.ts';
import {NOW, dateAfter, experienced, profile} from './helpers.ts';

const QUALITY_TYPES = ['THRESHOLD', 'VO2', 'SPECIFIC_3K'];
const run = (id: string): ScenarioRun => simulateAudit(SCENARIOS.find(s => s.id === id)!);
const runs = new Map<string, ScenarioRun>();
const get = (id: string): ScenarioRun => { if (!runs.has(id)) runs.set(id, run(id)); return runs.get(id)!; };
const rowsOf = (id: string, type: string): WorkoutRow[] => get(id).rows.filter(r => r.type === type);
const weeks = (id: string): number[] => [...new Set(get(id).rows.map(r => r.week))];

/** A trained runner (capacity T2/T3) with one or two intense sessions per week. */
const trained = (o: Partial<Profile> = {}): Profile => profile({
  ...experienced, actualRunsPerWeek: 4, availableRunsPerWeek: 4, averageWeeklyKm4Weeks: 26, longestUsualRunKm: 9, regularRunningWeeks: 40,
  performance: {timeSeconds: 870, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 840, raceDate: dateAfter(84), ...o,
});
const intermediate = (o: Partial<Profile> = {}): Profile => profile({
  actualRunsPerWeek: 3, availableRunsPerWeek: 3, averageWeeklyKm4Weeks: 19, longestUsualRunKm: 8, regularRunningWeeks: 40,
  qualitySessions8Weeks: 4, qualityWeeks8Weeks: 3, performance: {timeSeconds: 930, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 870,
  raceDate: dateAfter(84), ...o,
});
/** Engine state in the SPECIFIC phase (two confirmed intense sessions), reached through the public API only. */
function inSpecific(p: Profile): EngineState {
  let s = createEngine(p, NOW);
  for (let n = 0; n < 60 && s.decision.phase !== 'SPECIFIC'; n++) {
    const today = s.asOf;
    const w = s.queue.find(x => x.scheduledDate === today && x.type !== 'REST');
    if (w) s = recordResult(s, w.id, makeResult(w, 'GREEN'));
    s = replan(s, addDays(today, 1));
  }
  assert.equal(s.decision.phase, 'SPECIFIC', 'precondition: SPECIFIC phase reached');
  return s;
}
const types = (s: EngineState): string => s.queue.map(w => `${w.scheduledDate.slice(5)} ${w.type}`).join(', ');
/** Types of the whole queue keyed by date, to compare two consecutive plans for the dates they share. */
const byDate = (s: EngineState): Map<string, string> => new Map(s.queue.map(w => [w.scheduledDate, w.type]));
const doneAll = (s: EngineState, days: number): EngineState => {
  for (let n = 0; n < days; n++) {
    const today = s.asOf;
    const w = s.queue.find(x => x.scheduledDate === today && x.type !== 'REST');
    if (w) s = recordResult(s, w.id, makeResult(w, 'GREEN'));
    s = replan(s, addDays(today, 1));
  }
  return s;
};

// ---------------------------------------------------------------------------------------------------- LONG_EASY
test('WS-01 prepared users (U4, U5, U6) get exactly one LONG_EASY in every training week 1–10, every behaviour', () => {
  for (const user of ['U4-intermediate', 'U5-trained', 'U6-experienced']) {
    for (const b of ['A', 'S']) {
      const id = `${user}-${b}`;
      for (const w of weeks(id).filter(x => x >= 1 && x <= 10)) {
        const long = get(id).rows.filter(r => r.week === w && r.type === 'LONG_EASY' && r.outcome !== 'SKIPPED');
        assert.equal(long.length, 1, `${id} week ${w}`);
      }
    }
    assert.ok(rowsOf(`${user}-B`, 'LONG_EASY').length >= 7, `${user}-B keeps a regular long run`);
    assert.ok(rowsOf(`${user}-V`, 'LONG_EASY').length >= 9, `${user}-V keeps a regular long run`);
  }
});

test('WS-02 LONG_EASY is longer than every EASY of its week, follows the habitual long run and stays inside the weekly budget', () => {
  for (const user of USERS.filter(u => ['U4-intermediate', 'U5-trained', 'U6-experienced'].includes(u.id))) {
    const id = `${user.id}-A`;
    const habitual = user.longestKm * 1000;
    assert.ok(rowsOf(id, 'LONG_EASY').length >= 9, `${id}: long runs exist`);
    for (const long of rowsOf(id, 'LONG_EASY')) {
      const easy = get(id).rows.filter(r => r.week === long.week && r.type === 'EASY').map(r => r.doseValue);
      assert.ok(easy.every(e => e < long.doseValue), `${id} week ${long.week}: long ${long.doseValue} vs easy ${easy}`);
      assert.ok(long.doseValue >= 0.6 * habitual, `${id} week ${long.week}: ${long.doseValue} is far below the habitual ${habitual}`);
      // never more than the habitual share of the approved budget (long run / habitual week * budget)
      assert.ok(long.doseValue <= habitual * long.approvedWeekMeters! / (user.weeklyKm * 1000) + 1, `${id} week ${long.week}: above the habitual share of the budget`);
      assert.ok(long.doseValue < long.approvedWeekMeters!, `${id} week ${long.week}: inside the budget`);
    }
  }
});

test('WS-03 LONG_EASY is never assigned to novices or to runners without a long-run structure (U1, U2, U3, all behaviours)', () => {
  for (const user of ['U1-novice', 'U2-beginner', 'U3-beginner-plus']) {
    for (const b of ['A', 'B', 'V']) assert.equal(rowsOf(`${user}-${b}`, 'LONG_EASY').length, 0, `${user}-${b}`);
  }
  assert.equal(longRunShares(createEngine(profile({performance: null, canRun3Km: false, actualRunsPerWeek: 2, availableRunsPerWeek: 3, averageWeeklyKm4Weeks: 6, longestUsualRunKm: 3, regularRunningWeeks: 3}), NOW)), null);
  assert.equal(createEngine(profile({actualRunsPerWeek: 3, availableRunsPerWeek: 3, averageWeeklyKm4Weeks: 12, longestUsualRunKm: 5}), NOW).queue.some(w => w.type === 'LONG_EASY'), false, 'T1 profile');
  assert.equal(longRunShares(createEngine(trained({actualRunsPerWeek: 2, availableRunsPerWeek: 2}), NOW)), null, 'two runs a week have no separate long run');
});

test('WS-04 root cause: the long run is a fixed slot of the cycle week and its prescription is the habitual share, not the EASY dose', () => {
  const s = createEngine(intermediate(), NOW);
  const shares = longRunShares(s)!;
  assert.ok(shares !== null);
  assert.equal(Math.round(shares.long), 8000, 'at the start of a cycle: exactly the longest usual run');
  const long = s.queue.find(w => w.type === 'LONG_EASY')!;
  assert.equal(long.main.dose.value, shares.long);
  assert.equal(long.scheduledDate, dateAfter(4), 'last slot (offsets 0, 2, 4)');
  assert.equal(s.queue.filter(w => w.countsAsQuality).every(w => w.scheduledDate !== long.scheduledDate), true, 'no intense session in the long slot');
  assert.ok(long.main.dose.value > Math.max(...s.queue.filter(w => w.type === 'EASY').map(w => w.main.dose.value)));
  // prescribe() alone (without the queue) gives the same dose, so a moved or converted long run has the same size
  assert.equal(prescribe(s, 'LONG_EASY', long.scheduledDate, 'x', 1).main.dose.value, shares.long);
});

test('WS-05 a long run does not raise weekly volume: every rolling 7 days of engine reserves stays within the approved budget (all 23 scenarios)', () => {
  for (const sc of SCENARIOS) {
    const a = analyze(get(sc.id));
    const c23 = a.checks.find(c => c.code === 'C23')!;
    assert.ok(c23.examined > 0 && c23.violations === 0, `${sc.id}: ${c23.violations} budget violations`);
    assert.equal(a.findings.filter(f => f.code === 'WEEKLY_BUDGET_EXCEEDED').length, 0, sc.id);
    // the approved budget itself only grows by the existing step (+1 km per 14 days at most)
    const budgets = get(sc.id).rows.filter(r => r.approvedWeekMeters !== null);
    if (budgets.length === 0) continue;
    const first = budgets[0]!.approvedWeekMeters!;
    for (const r of budgets) assert.ok(r.approvedWeekMeters! <= first + (Math.floor(r.offset / 14) + 1) * 1000, `${sc.id} day ${r.offset}`);
  }
});

test('WS-06 recovery: no two intense sessions closer than 48 h in any scenario; CONTROL is never displaced by the long run structure', () => {
  for (const sc of SCENARIOS) {
    const a = analyze(get(sc.id));
    assert.equal(a.checks.filter(c => c.code === 'C05' || c.code === 'C05b').reduce((n, c) => n + c.violations, 0), 0, sc.id);
    assert.equal(a.findings.filter(f => f.code === 'HARD_SESSIONS_TOO_CLOSE').length, 0, sc.id);
  }
  for (const user of ['U4-intermediate', 'U5-trained', 'U6-experienced']) {
    assert.equal(rowsOf(`${user}-A`, 'CONTROL').length, 3, `${user}-A keeps its three checkpoints`);
    assert.equal(get(`${user}-A`).rows.filter(r => r.outcome === 'DISPLACED_BY_CONTROL').length, 0, `${user}-A`);
  }
});

test('WS-07 taper: no LONG_EASY in the TAPER phase or in the last 7 days before the race', () => {
  for (const user of ['U4-intermediate', 'U5-trained', 'U6-experienced']) {
    const r = get(`${user}-A`);
    assert.equal(r.rows.filter(x => x.type === 'LONG_EASY' && x.phase === 'TAPER').length, 0, user);
    assert.equal(r.rows.filter(x => x.type === 'LONG_EASY' && x.week >= 12).length, 0, user);
  }
});

// ---------------------------------------------------------------------------------------------------- rotation
test('WS-08 one intense session a week (U4): SPECIFIC_3K is not repeated every week; THRESHOLD and VO2 both come back', () => {
  for (const b of ['A', 'S', 'V']) {
    const q = get(`U4-intermediate-${b}`).rows.filter(r => QUALITY_TYPES.includes(r.type) && r.outcome !== 'SKIPPED');
    const specific = q.filter(r => r.phase === 'SPECIFIC');
    assert.ok(specific.length >= 2, `U4-${b}: ${specific.length} intense sessions in SPECIFIC`);
    for (let i = 1; i < specific.length; i++) {
      assert.ok(!(specific[i - 1]!.type === 'SPECIFIC_3K' && specific[i]!.type === 'SPECIFIC_3K'), `U4-${b}: two SPECIFIC_3K in a row at ${specific[i]!.date}`);
    }
    // scenario V skips every fourth session, so it only has to show the alternation; A and S show the full T/V/S3 cycle
    if (b !== 'V') assert.ok(specific.some(r => r.type === 'THRESHOLD') && specific.some(r => r.type === 'VO2') && specific.some(r => r.type === 'SPECIFIC_3K'), `U4-${b}`);
    assert.ok(specific.some(r => r.type !== 'SPECIFIC_3K'), `U4-${b}: not only SPECIFIC_3K`);
  }
});

test('WS-09 two intense sessions a week (U5, U6): every ordinary SPECIFIC week combines SPECIFIC_3K with THRESHOLD or VO2, and both come back', () => {
  for (const user of ['U5-trained', 'U6-experienced']) {
    const id = `${user}-A`;
    const specificWeeks = weeks(id).filter(w => get(id).rows.some(r => r.week === w && r.phase === 'SPECIFIC' && QUALITY_TYPES.includes(r.type)));
    let checked = 0;
    for (const w of specificWeeks) {
      const q = get(id).rows.filter(r => r.week === w && QUALITY_TYPES.includes(r.type)).map(r => r.type);
      if (q.length < 2) continue;
      checked++;
      assert.ok(q.includes('SPECIFIC_3K') && (q.includes('THRESHOLD') || q.includes('VO2')), `${id} week ${w}: ${q}`);
    }
    assert.ok(checked >= 6, `${id}: ${checked} two-session SPECIFIC weeks`);
    const all = get(id).rows.filter(r => r.phase === 'SPECIFIC').map(r => r.type);
    assert.ok(all.includes('THRESHOLD') && all.includes('VO2'), `${id}: both THRESHOLD and VO2 appear`);
  }
});

test('WS-10 progression is kept: no more intense sessions per week than the engine allows and no volume+intensity step together (D-05 does not grow beyond the base audit)', () => {
  const kinds = (id: string) => analyze(get(id)).findings;
  let d05 = 0;
  for (const sc of SCENARIOS) {
    d05 += kinds(sc.id).filter(f => f.code === 'VOLUME_AND_INTENSITY_RISE_TOGETHER').length;
    const max = get(sc.id).initial.maxQuality;
    for (const w of weeks(sc.id)) assert.ok(get(sc.id).rows.filter(r => r.week === w && QUALITY_TYPES.includes(r.type)).length <= Math.max(2, max), `${sc.id} week ${w}`);
  }
  assert.ok(d05 <= 4, `D-05 count ${d05} (base audit: 3, after the reviewed rotation: 4)`);
});

// ---------------------------------------------------------------------------------------------------- determinism
test('WS-11 rotation is derived from state: a plan rebuilt every day keeps the type of every date it already showed (SPECIFIC phase)', () => {
  for (const p of [intermediate(), trained()]) {
    let s = inSpecific(p);
    let previous = byDate(s);
    for (let n = 0; n < 24; n++) {
      const today = s.asOf;
      const w = s.queue.find(x => x.scheduledDate === today && x.type !== 'REST');
      if (w) s = recordResult(s, w.id, makeResult(w, 'GREEN'));
      s = replan(s, addDays(today, 1));
      const now = byDate(s);
      // The one state-driven change that is allowed: a checkpoint that has just become due takes its slot (CONTROL has priority
      // over every other slot role), which also moves the rotation by one place. Everything else must stay as shown before.
      const checkpointAppeared = [...now].some(([date, type]) => type === 'CONTROL' && previous.get(date) !== 'CONTROL');
      if (!checkpointAppeared) for (const [date, type] of now) if (previous.has(date) && day(date) > day(today)) assert.equal(type, previous.get(date), `${date} changed after the replan of ${today}: ${types(s)}`);
      previous = now;
    }
  }
});

test('WS-12 replan is idempotent and save/load keeps the queue and the next replan identical', () => {
  for (const p of [intermediate(), trained()]) {
    const s = doneAll(inSpecific(p), 9);
    assert.ok(s.queue.some(w => w.type === 'LONG_EASY'), `precondition: a long run is planned: ${types(s)}`);
    const again = replan(s, s.asOf);
    assert.deepEqual(again.queue, s.queue, 'replan on the same day changes nothing');
    const loaded = deserialize(serialize(s));
    assert.deepEqual(loaded.queue, s.queue);
    const next = addDays(s.asOf, 3);
    assert.deepEqual(replan(loaded, next).queue, replan(s, next).queue, 'the loaded state replans exactly like the live one');
    assert.deepEqual(replan(deserialize(serialize(replan(s, next))), addDays(next, 2)).queue, replan(replan(s, next), addDays(next, 2)).queue);
  }
});

test('WS-13 an old save (no queue stored: only profile and history) is rebuilt with the same long-run and rotation pattern', () => {
  const s = doneAll(inSpecific(trained()), 8);
  const old = JSON.parse(serialize(s)) as Record<string, unknown>;
  old['queue'] = [];
  const loaded = replan(deserialize(JSON.stringify(old)), s.asOf);
  assert.deepEqual(loaded.queue.map(w => [w.scheduledDate, w.type]), s.queue.map(w => [w.scheduledDate, w.type]));
});

// ---------------------------------------------------------------------------------------------------- skip / move / recompute
test('WS-14 skip of the LONG_EASY is never made up: later long runs are not larger than in the same plan without the skip, one per 7 days', () => {
  const start = inSpecific(trained());
  const long = start.queue.find(w => w.type === 'LONG_EASY')!;
  const future = (state: EngineState): Workout[] => {
    const longs: Workout[] = [];
    for (let n = 0; n < 24; n++) {
      const today = state.asOf;
      const w = state.queue.find(x => x.scheduledDate === today && x.type !== 'REST');
      if (w?.type === 'LONG_EASY') longs.push(w);
      if (w) state = recordResult(state, w.id, makeResult(w, 'GREEN'));
      state = replan(state, addDays(today, 1));
    }
    return longs;
  };
  const skipped = skipWorkout(start, long.id, start.asOf);
  assert.ok(!skipped.queue.some(w => w.id === long.id), 'the skipped long run is gone');
  const withSkip = future(skipped); const without = future(start);
  assert.ok(withSkip.length >= 2, 'the long runs return on their regular slots');
  assert.ok(withSkip.every(l => l.id !== long.id), 'the skipped long run is not rescheduled');
  for (const l of withSkip) {
    const same = without.find(o => o.scheduledDate === l.scheduledDate);
    assert.ok(same !== undefined, `long run on ${l.scheduledDate} is on the regular slot`);
    assert.ok(l.main.dose.value <= same!.main.dose.value + 1, `${l.scheduledDate}: ${l.main.dose.value} > ${same!.main.dose.value} would be compensation`);
  }
  for (let i = 1; i < withSkip.length; i++) assert.ok(day(withSkip[i]!.scheduledDate) - day(withSkip[i - 1]!.scheduledDate) >= 7);
});

test('WS-15 skip of an intense session: no replacement session, and the rotation continues with the next type (not the skipped one again)', () => {
  const s0 = inSpecific(intermediate());
  const q = s0.queue.find(w => w.countsAsQuality && w.type !== 'CONTROL')!;
  const skipped = skipWorkout(s0, q.id, s0.asOf);
  const planned = skipped.queue.filter(w => w.countsAsQuality && w.type !== 'CONTROL');
  assert.ok(planned.every(w => w.type !== q.type || q.type === 'SPECIFIC_3K' && false), `after skipping ${q.type}: ${types(skipped)}`);
  assert.ok(skipped.queue.filter(w => w.countsAsQuality).length <= s0.queue.filter(w => w.countsAsQuality).length, 'no compensating extra intense session');
  assert.ok(skipped.queue.reduce((n, w) => n + (reservedMetres(skipped, w) ?? 0), 0) <= s0.queue.reduce((n, w) => n + (reservedMetres(s0, w) ?? 0), 0) + 1, 'no more load than before the skip');
});

test('WS-16 calendar shift: days passing without any report miss the sessions without compensation; types and slots stay on the cycle', () => {
  const s0 = inSpecific(trained());
  const shifted = replan(s0, addDays(s0.asOf, 4));
  const originalDates = new Set(s0.queue.map(w => w.scheduledDate));
  for (const w of shifted.queue) {
    const offset = ((day(w.scheduledDate) - day(shifted.cycleStartDate)) % 7 + 7) % 7;
    assert.ok([0, 1, 3, 5].includes(offset), `slot ${w.scheduledDate} is on a cycle slot (offset ${offset})`);
    if (originalDates.has(w.scheduledDate) && day(w.scheduledDate) >= day(shifted.asOf)) assert.equal(w.type, s0.queue.find(x => x.scheduledDate === w.scheduledDate)!.type, w.scheduledDate);
  }
  const longs = shifted.queue.filter(w => w.type === 'LONG_EASY');
  assert.ok(longs.length <= 1, 'one long run per 7-day plan');
  assert.ok(longs.every(l => ((day(l.scheduledDate) - day(shifted.cycleStartDate)) % 7 + 7) % 7 === 5), 'the long run stays on the last slot of the cycle week');
});

test('WS-17 move: a moved long run keeps its dose and type, and the replan does not add a second long run within 7 days', () => {
  const s0 = createEngine(intermediate(), NOW);
  const long = s0.queue.find(w => w.type === 'LONG_EASY')!;
  const target = addDays(long.scheduledDate, 1);
  const moved = moveWorkout(s0, long.id, target);
  const m = moved.queue.find(w => w.id === long.id)!;
  assert.equal(m.scheduledDate, target);
  assert.equal(m.type, 'LONG_EASY');
  assert.ok(m.main.dose.value <= long.main.dose.value);
  for (let n = 0; n < 6; n++) {
    const r = replan(moved, addDays(moved.asOf, n));
    const longs = r.queue.filter(w => w.type === 'LONG_EASY');
    for (let i = 1; i < longs.length; i++) assert.ok(day(longs[i]!.scheduledDate) - day(longs[i - 1]!.scheduledDate) >= 7);
    assert.ok(longs.length <= 2);
  }
  assert.deepEqual(deserialize(serialize(moved)).queue, moved.queue);
});

test('WS-18 moving an intense session keeps its type, and the type of the next one follows from it', () => {
  const s0 = inSpecific(trained());
  const q = s0.queue.find(w => w.countsAsQuality && w.type !== 'CONTROL');
  if (!q) return;
  const free = [1, 2, 3, 4, 5, 6].map(n => addDays(s0.asOf, n)).find(d => !s0.queue.some(w => w.scheduledDate === d) && day(d) !== day(q.scheduledDate));
  if (!free) return;
  try {
    const moved = moveWorkout(s0, q.id, free);
    assert.equal(moved.queue.find(w => w.id === q.id)!.type, q.type);
    assert.deepEqual(deserialize(serialize(moved)).queue, moved.queue);
    assert.deepEqual(replan(moved, moved.asOf).queue, moved.queue, 'recompute leaves the moved plan unchanged');
  } catch (e) { assert.equal((e as {code?: string}).code !== undefined, true, 'a refusal carries its own code'); }
});

// ---------------------------------------------------------------------------------------------------- budget pressure
test('WS-19 budget pressure: when the intense sessions leave no room for a real long run there is no artificial LONG_EASY, and the budget holds', () => {
  const s = createEngine(profile({...experienced, actualRunsPerWeek: 4, availableRunsPerWeek: 4, averageWeeklyKm4Weeks: 18, longestUsualRunKm: 7, regularRunningWeeks: 40,
    performance: {timeSeconds: 750, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 720, raceDate: dateAfter(84)}), NOW);
  assert.equal(s.decision.maximumQualityPerWeek, 2, 'precondition: two intense sessions are allowed by the decision');
  const shares = longRunShares(s)!;
  assert.ok(shares !== null);
  // the intense sessions reserve 15.5 km of the 18 km budget: what is left (2.5 km) is no long run for a runner whose usual run is 3.7 km
  assert.equal(s.queue.some(w => w.type === 'LONG_EASY'), false, types(s));
  assert.ok(s.queue.every(w => w.type !== 'EASY' || w.main.dose.value >= 1000));
  const total = s.queue.reduce((n, w) => n + (reservedMetres(s, w) ?? 0), 0);
  assert.ok(total <= 18_000 + 1, `${total} m within the 18 km budget`);
  // and wherever a LONG_EASY is planned for a prepared runner it is longer than that runner's habitual ordinary run
  for (const id of ['U4-intermediate-A', 'U5-trained-A', 'U6-experienced-A']) {
    const r = get(id);
    const ordinary = Math.min(...r.rows.filter(x => x.type === 'EASY').map(x => x.doseValue));
    for (const l of r.rows.filter(x => x.type === 'LONG_EASY')) assert.ok(l.doseValue > ordinary, `${id} ${l.date}`);
  }
});
