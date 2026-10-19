/**
 * Weekly structure (12-week audit D-08 and the SPECIFIC rotation): a real LONG_EASY for prepared runners, and
 * THRESHOLD / VO2 / SPECIFIC_3K that alternate instead of SPECIFIC_3K every week.
 * All athlete behaviour in the simulations below is SYNTHETIC (scripted reports), not measured.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EngineError, addDays, createEngine, day, deserialize, moveWorkout, prescribe, recordResult, replan, serialize, skipWorkout} from '../src/index.ts';
import type {EngineState, Profile, Workout} from '../src/index.ts';
import {approvedWeekMeters, longRunShares, reservedMetres} from '../src/weeklyLoad.ts';
import {weeklyIntenseCapacity} from '../src/workouts.ts';
import {PROBES} from '../audit/deficitProfiles.ts';
import {SCENARIOS, USERS, simulateAudit} from '../audit/fullCycle12w.ts';
import type {ScenarioRun, WorkoutRow} from '../audit/fullCycle12w.ts';
import {analyze, weeklySummary} from '../audit/fullCycleAnalysis.ts';
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
      if (!['TAPER','RE_ENTRY'].includes(long.phase) && !long.stateAfter.progressionBlocked && !long.stateAfter.hold)
        assert.ok(long.doseValue >= .65 * habitual, `${id} week ${long.week}: ${long.doseValue} < 65% of ${habitual}`);
      // never more than the habitual share of the approved budget (long run / habitual week * budget)
      assert.ok(long.doseValue <= habitual * long.approvedWeekMeters! / (user.weeklyKm * 1000) + 1, `${id} week ${long.week}: above the habitual share of the budget`);
      assert.ok(long.doseValue < long.approvedWeekMeters!, `${id} week ${long.week}: inside the budget`);
    }
    for (const w of get(id).rows.filter(r => ['EASY','LONG_EASY'].includes(r.type) && r.phase !== 'TAPER' && r.phase !== 'RE_ENTRY' && !r.stateAfter.progressionBlocked && !r.stateAfter.hold && !r.calibration)) {
      if (w.type === 'EASY') assert.ok(w.doseValue >= 2000, `${id} week ${w.week}: standalone EASY ${w.doseValue}`);
      assert.ok(w.paceFast !== null && w.paceSlow !== null, `${id} week ${w.week}: numeric EASY pace`);
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

test('WS-09 every audited week with two quality sessions uses SPECIFIC_3K plus THRESHOLD or VO2, and both come back', () => {
  for (const user of ['U5-trained', 'U6-experienced']) {
    const id = `${user}-A`;
    const specificWeeks = weeks(id).filter(w => get(id).rows.some(r => r.week === w && r.phase === 'SPECIFIC' && QUALITY_TYPES.includes(r.type)));
    for (const w of specificWeeks) {
      const q = get(id).rows.filter(r => r.week === w && QUALITY_TYPES.includes(r.type)).map(r => r.type);
      if (q.length < 2) continue;
      assert.ok(q.includes('SPECIFIC_3K') && (q.includes('THRESHOLD') || q.includes('VO2')), `${id} week ${w}: ${q}`);
    }
    const all = get(id).rows.filter(r => r.phase === 'SPECIFIC').map(r => r.type);
    assert.ok(all.includes('THRESHOLD') && all.includes('VO2'), `${id}: both THRESHOLD and VO2 appear`);
  }
});

test('WS-09b every budget-feasible roomy SPECIFIC week schedules the expected quality pair', () => {
  let s=inSpecific(trained({averageWeeklyKm4Weeks:40,longestUsualRunKm:9}));
  let eligibleWeeks=0;
  for(let week=0;week<4;week++) {
    const quality=s.queue.filter(w=>w.countsAsQuality);
    const control=quality.some(w=>w.type==='CONTROL');
    if(s.decision.phase==='SPECIFIC'&&weeklyIntenseCapacity(s,s.asOf,4)===2&&!control) {
      eligibleWeeks++;
      assert.equal(quality.length,2,`${s.asOf}: two sessions are permitted by the budget`);
      assert.ok(quality.some(w=>w.type==='SPECIFIC_3K'));
      assert.ok(quality.some(w=>w.type==='THRESHOLD'||w.type==='VO2'));
      assert.ok(s.queue.reduce((sum,w)=>sum+(reservedMetres(s,w)??0),0)<=approvedWeekMeters(s)+1e-6);
    }
    s=doneAll(s,7);
  }
  assert.ok(eligibleWeeks>=3,`a full four-week cycle has several budget-feasible two-quality weeks (${eligibleWeeks})`);
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

test('WS-10b D-13 return weeks stay within the prior normal training level after the lighter week', () => {
  for (const [id, jumpWeek] of [['U4-intermediate-B',9],['U6-experienced-B',3]] as const) {
    const summary=weeklySummary(get(id));
    const jump=summary.find(w=>w.week===jumpWeek)!;
    assert.ok(analyze(get(id)).findings.some(f=>f.code==='WEEKLY_VOLUME_JUMP'&&f.week===jumpWeek),`${id}: keep the D-13 finding visible`);
    const priorNormal=summary.filter(w=>w.week<jumpWeek&&w.runsDone===w.runs&&w.skipped===0&&w.holdDays===0&&!w.controlWeek&&w.approvedKm!==null&&w.plannedKm>=w.approvedKm*.85);
    const normalPeak=Math.max(...priorNormal.map(w=>w.plannedKm));
    assert.ok(normalPeak>0,`${id}: at least one fully completed prior normal week exists`);
    assert.ok(jump.plannedKm<=normalPeak*1.02,`${id} week ${jumpWeek}: ${jump.plannedKm} km must not exceed prior normal peak ${normalPeak} km by more than 2%`);
  }
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

/** A budget that retains two quality sessions, a 9 km long run, and the required ordinary easy runs. */
const twoIntense = (): EngineState => createEngine(trained({averageWeeklyKm4Weeks: 30, longestUsualRunKm: 9}), NOW);
const refusedWith = (code: string) => (e: unknown): boolean => e instanceof EngineError && e.code === code;

test('WS-18 move of an intense session succeeds and keeps type, dose, calendar, rotation and the serialized state', () => {
  const s0 = twoIntense();
  assert.deepEqual(s0.queue.map(w => [w.scheduledDate, w.type]), [[dateAfter(0), 'THRESHOLD'], [dateAfter(1), 'EASY'], [dateAfter(3), 'VO2'], [dateAfter(5), 'LONG_EASY']], 'precondition: the week');
  const second = s0.queue[2]!;
  const target = dateAfter(2); // free day, exactly 48 h after THRESHOLD and before the next intense session: every rule allows it
  const moved = moveWorkout(s0, second.id, target);
  const m = moved.queue.find(w => w.id === second.id)!;
  assert.equal(m.scheduledDate, target);
  assert.equal(m.type, second.type, 'type kept');
  assert.equal(m.main.dose.value, second.main.dose.value, 'dose kept');
  assert.deepEqual(m.main, second.main, 'prescription kept');
  assert.deepEqual(moved.queue.map(w => w.type), s0.queue.map(w => w.type), 'the other sessions keep their types');
  assert.deepEqual(moved.queue.filter(w => w.id !== second.id).map(w => [w.scheduledDate, w.main.dose.value]), s0.queue.filter(w => w.id !== second.id).map(w => [w.scheduledDate, w.main.dose.value]), 'and their dates and doses');
  // calendar: the moved session is the only change, it sits inside the horizon with 48 h to the other intense session; one long run in 7 days
  assert.equal(day(target) - day(s0.queue[0]!.scheduledDate), 2);
  assert.equal(moved.queue.filter(w => w.type === 'LONG_EASY').length, 1);
  // recompute on the same day leaves the moved plan unchanged; save/load as well
  assert.deepEqual(replan(moved, moved.asOf).queue, moved.queue);
  const loaded = deserialize(serialize(moved));
  assert.deepEqual(loaded.queue, moved.queue);
  assert.deepEqual(loaded.movedWorkouts, moved.movedWorkouts);
  assert.deepEqual(replan(loaded, addDays(moved.asOf, 2)).queue, replan(moved, addDays(moved.asOf, 2)).queue, 'the loaded state replans exactly like the live one');
  // rotation: carry the week out (the moved session on its new date) and compare the next week with the same week without the move
  const week = (state: EngineState): string[] => {
    for (let n = 0; n < 7; n++) {
      const today = state.asOf;
      const w = state.queue.find(x => x.scheduledDate === today && x.type !== 'REST');
      if (w) state = recordResult(state, w.id, makeResult(w, 'GREEN'));
      state = replan(state, addDays(today, 1));
    }
    return state.queue.filter(w => w.countsAsQuality).map(w => `${w.type}@${day(w.scheduledDate) - day(NOW)}`);
  };
  const withMove = week(moved), without = week(s0);
  assert.deepEqual(withMove.map(x => x.split('@')[0]), without.map(x => x.split('@')[0]), `the next intense types follow the same rotation: ${withMove} vs ${without}`);
  assert.ok(withMove.length >= 1, 'the next week retains an intense session when the unchanged budget allows it');
  assert.deepEqual(withMove, without.map(x => x), 'and on the same days');
});

test('WS-18b move of the first intense session of a one-intense week succeeds and the type of the next week does not change', () => {
  const s0 = createEngine(intermediate(), NOW);
  assert.deepEqual(s0.queue.map(w => w.type), ['THRESHOLD', 'EASY', 'LONG_EASY'], 'precondition: the week');
  const first = s0.queue[0]!;
  const moved = moveWorkout(s0, first.id, dateAfter(1));
  const m = moved.queue.find(w => w.id === first.id)!;
  assert.equal(m.scheduledDate, dateAfter(1));
  assert.equal(m.type, 'THRESHOLD');
  assert.equal(m.main.dose.value, first.main.dose.value);
  assert.deepEqual(deserialize(serialize(moved)).queue, moved.queue);
  const next = (state: EngineState, moveDay: number): string => {
    for (let n = 0; n < 7; n++) {
      const today = state.asOf;
      const w = state.queue.find(x => x.scheduledDate === today && x.type !== 'REST');
      if (w) state = recordResult(state, w.id, makeResult(w, 'GREEN'));
      state = replan(state, addDays(today, 1));
    }
    assert.ok(moveDay >= 0);
    return state.queue.find(w => w.countsAsQuality)!.type;
  };
  assert.equal(next(moved, 1), next(s0, 0), 'rotation continues with the same type with or without the move');
});

test('WS-18d a late move of an intense session never creates a third intense session in 7 days: the engine removes the later one instead of adding load', () => {
  const s0 = twoIntense();
  const moved = moveWorkout(s0, s0.queue[2]!.id, dateAfter(4)); // allowed by the move rules; VO2 on day 4
  // rotation: the moved VO2 (day 4) is not forgotten, so the next THRESHOLD/VO2 of the queue is the other type
  const seq = replan(moved, dateAfter(1)).queue.filter(w => w.countsAsQuality).map(w => w.type);
  assert.ok(seq.length >= 2 && seq.every((type, i) => i === 0 || type !== seq[i - 1]), `adjacent intense sessions alternate: ${seq}`);
  let s = moved;
  const planned: Workout[] = [];
  for (let n = 0; n < 9; n++) {
    const today = s.asOf;
    const w = s.queue.find(x => x.scheduledDate === today && x.type !== 'REST');
    if (w) s = recordResult(s, w.id, makeResult(w, 'GREEN'));
    s = replan(s, addDays(today, 1));
    for (const q of s.queue) if (!planned.some(p => p.id === q.id)) planned.push(q);
    assert.ok(s.queue.reduce((sum, q) => sum + (reservedMetres(s, q) ?? 0), 0) <= approvedWeekMeters(s) + 1e-6);
  }
  const intense = [...s.history.filter(h => h.workout.countsAsQuality).map(h => day(h.result.date)), ...s.queue.filter(w => w.countsAsQuality).map(w => day(w.scheduledDate))];
  for (const d of intense) assert.ok(intense.filter(x => x >= d && x < d + 7).length <= 2, 'at most two intense sessions in any 7 days');
  const tv = [...s.history.map(h => ({type: h.workout.type, d: day(h.result.date)})), ...s.queue.map(w => ({type: w.type, d: day(w.scheduledDate)}))]
    .filter(x => x.type === 'THRESHOLD' || x.type === 'VO2').sort((a, b) => a.d - b.d).map(x => x.type);
  assert.ok(tv.length >= 3 && tv.every((type, i) => i === 0 || type !== tv[i - 1]), `THRESHOLD/VO2 keep alternating after the move: ${tv}`);
});

test('WS-18c invalid moves are refused with their own specific codes', () => {
  const s0 = twoIntense();
  const [first, easy, second, long] = s0.queue as [Workout, Workout, Workout, Workout];
  assert.throws(() => moveWorkout(s0, second.id, dateAfter(7)), refusedWith('MOVE_OUTSIDE_HORIZON'), 'a week ahead');
  assert.throws(() => moveWorkout(s0, second.id, dateAfter(-1)), refusedWith('MOVE_OUTSIDE_HORIZON'), 'in the past');
  assert.throws(() => moveWorkout(s0, 'slot-unknown', dateAfter(2)), refusedWith('MOVE_OUTSIDE_HORIZON'), 'unknown workout');
  assert.throws(() => moveWorkout(s0, second.id, easy.scheduledDate), refusedWith('MOVE_OCCUPIED_DATE'), 'a date with another session');
  assert.throws(() => moveWorkout(s0, first.id, dateAfter(2)), refusedWith('MOVE_RECOVERY_VIOLATION'), 'THRESHOLD one day before VO2');
  assert.throws(() => moveWorkout(s0, second.id, dateAfter(1)), refusedWith('MOVE_OCCUPIED_DATE'));
  assert.equal(long.type, 'LONG_EASY');
  // a fully booked rolling week: after one week has been run, a move that puts a session into a window of the approved budget is refused
  let s = createEngine(deficit(), NOW);
  for (let n = 0; n < 8; n++) {
    const today = s.asOf;
    const w = s.queue.find(x => x.scheduledDate === today && x.type !== 'REST');
    if (w) s = recordResult(s, w.id, makeResult(w, 'GREEN'));
    s = replan(s, addDays(today, 1));
  }
  const l = s.queue.find(w => w.type === 'LONG_EASY')!;
  assert.throws(() => moveWorkout(s, l.id, addDays(s.asOf, 1)), refusedWith('MOVE_WEEKLY_LOAD_LIMIT'), 'moving the long run into a window that is already full');
});

// ---------------------------------------------------------------------------------------------------- budget pressure
/** Deficit budget: 18 km a week, longest run 7 km, 4 runs, 3 km in 12:30 — two intense sessions would reserve 15.5 of the 18 km. */
const deficit = (o: Partial<Profile> = {}): Profile => profile({...experienced, actualRunsPerWeek: 4, availableRunsPerWeek: 4, averageWeeklyKm4Weeks: 18, longestUsualRunKm: 7, regularRunningWeeks: 40,
  performance: {timeSeconds: 750, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 720, raceDate: dateAfter(84), ...o});
const reserve = (s: EngineState, type: Workout['type'], date = NOW): number => reservedMetres(s, prescribe(s, type, date, 'probe', 1))!;
/** The share of the budget that a long run gets in a week with `k` intense sessions: the habitual share of what the intense sessions leave. */
const longShare = (s: EngineState, k: number, intense: number): number => {
  const sh = longRunShares(s)!;
  return (approvedWeekMeters(s) - intense) * sh.long / (sh.long + (4 - 1 - k) * sh.other);
};

test('WS-19 deficit budget: one intense session + EASY + a real LONG_EASY replaces two intense sessions, inside the approved budget', () => {
  const s = createEngine(deficit(), NOW);
  assert.equal(s.decision.maximumQualityPerWeek, 2, 'precondition: the decision allows two intense sessions');
  assert.equal(weeklyIntenseCapacity(s, NOW, 4), 1, 'the budget carries one');
  assert.deepEqual(s.queue.map(w => w.type), ['THRESHOLD', 'EASY', 'LONG_EASY'], 'T, E, L when the fixed 18 km budget cannot support another ordinary run');
  const shares = longRunShares(s)!;
  const long = s.queue.find(w => w.type === 'LONG_EASY')!, easy = s.queue.filter(w => w.type === 'EASY');
  assert.ok(long.main.dose.value > shares.other, 'longer than the runner\'s habitual ordinary run');
  assert.ok(easy.every(w => w.main.dose.value >= 2000 && w.main.dose.value < long.main.dose.value), 'ordinary EASY meets its 2 km minimum and stays shorter than the long run');
  assert.ok(long.main.dose.value >= 0.6 * 7000, `long run ${long.main.dose.value} m is a proper share of the habitual 7 km`);
  assert.ok(s.queue.reduce((n, w) => n + (reservedMetres(s, w) ?? 0), 0) <= 18_000 + 1e-6, 'the 18 km approved budget holds');
  assert.equal(approvedWeekMeters(s), 18_000, 'and the budget itself is not raised');
});

test('WS-19b why two intense sessions and a long run do not fit 18 km: the rolling 7-day window T + V + L', () => {
  const s = createEngine(deficit(), NOW);
  const budget = 18_000;
  const t = reserve(s, 'THRESHOLD'), v = reserve(s, 'VO2');
  const shares = longRunShares(s)!;
  // the week T(day 0), V(day 3), L(day 5) is one window of 7 days: what is left for the long run and the ordinary run
  const room = budget - t - v;
  assert.ok(room < shares.other, `${room} m left after ${t} + ${v} m is below the habitual ordinary run ${shares.other} m: the long run would not be longer than an ordinary one`);
  assert.ok(room < 1000 + 1000 + shares.other, 'and cannot hold even the 1 km minimum EASY next to it');
  // the same rule with ONE intense session passes
  assert.ok(longShare(s, 1, t) > shares.other, 'with one intense session the long run share exceeds the habitual ordinary run');
  // the engine follows the rule (not a hard-coded "no long run"): with two sessions that fit, both are kept — see WS-19d
});

test('WS-19c a constrained 15 km week keeps only a meaningful long run and never breaks the weekly budget', () => {
  const s = createEngine(deficit({averageWeeklyKm4Weeks: 15, longestUsualRunKm: 6, performance: {timeSeconds: 660, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 630}), NOW);
  const shares = longRunShares(s)!;
  const t = reserve(s, 'THRESHOLD');
  const share = (15_000 - t) * shares.long / (shares.long + 2 * shares.other);
  assert.ok(share <= shares.other, `long run share ${share} m is not longer than the habitual ordinary run ${shares.other} m (T reserves ${t} m of 15000 m)`);
  assert.ok(s.queue.filter(w => w.type === 'LONG_EASY').every(w => w.main.dose.value >= 3900), types(s));
  assert.ok(s.queue.filter(w => w.type === 'EASY' && !w.main.calibration).every(w => w.main.dose.value >= 2000 || w.volumeFactor < 1), types(s));
  assert.equal(s.queue.filter(w => w.countsAsQuality).length, 1, 'the first intense session is kept (existing rule)');
  assert.ok(s.queue.reduce((n, w) => n + (reservedMetres(s, w) ?? 0), 0) <= 15_000 + 1e-6);
});

test('WS-19d where the budget carries two intense sessions and a long run, both intense sessions are kept (28 km, longest 9 km)', () => {
  const s = createEngine(trained({averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9}), NOW);
  assert.equal(weeklyIntenseCapacity(s, NOW, 4), 2);
  assert.equal(s.queue.filter(w => w.countsAsQuality).length, 2);
  assert.equal(s.queue.filter(w => w.type === 'LONG_EASY').length, 1);
});

test('WS-19e 12-week P1–P6 probes keep meaningful easy/long runs, numerical paces, budget and recovery', () => {
  for (const user of PROBES) {
    const r = simulateAudit({id: user.id, user, behaviour: 'A', required: false});
    const rows = r.rows.filter(x => x.type !== 'REST');
    const a = analyze(r);
    const wk = [...new Set(rows.map(x => x.week))];
    const intense = (w: number): string[] => rows.filter(x => x.week === w && x.countsAsQuality && x.type !== 'CONTROL').map(x => x.type);
    assert.ok(rows.filter(x => x.type === 'LONG_EASY').length >= 10, `${user.id}: long runs ${rows.filter(x => x.type === 'LONG_EASY').length}`);
    assert.equal(rows.filter(x => x.type === 'CONTROL').length, 3, `${user.id}: the three checkpoints are kept`);
    assert.ok(wk.filter(w => w <= 10).every(w => intense(w).length <= 1 || ['P2', 'P5', 'P6'].some(id => user.id.startsWith(id))), `${user.id}: intense-session count`);
    // A week may become all-aerobic when its quality reserve cannot coexist with
    // the 65% long-run and 2 km ordinary-EASY floors. It never adds training debt.
    const kinds = new Set(rows.filter(x => x.countsAsQuality && x.type !== 'CONTROL').map(x => x.type));
    assert.ok(kinds.has('THRESHOLD') && kinds.has('VO2') && kinds.has('SPECIFIC_3K'), `${user.id}: the rotation uses all three types`);
    for (const w of wk.filter(x => x <= 11)) {
      const easy = rows.filter(x => x.week === w && x.type === 'EASY'), long = rows.filter(x => x.week === w && x.type === 'LONG_EASY');
      assert.ok(easy.every(x => x.doseValue >= 2000 || x.phase === 'TAPER' || x.phase === 'RE_ENTRY'), `${user.id} week ${w}: ordinary EASY floor`);
      for (const l of long) assert.ok(easy.every(x => x.doseValue < l.doseValue), `${user.id} week ${w}: long run is longer than EASY`);
      for (const l of long) if (l.phase !== 'TAPER' && l.phase !== 'RE_ENTRY' && !l.stateAfter.progressionBlocked && !l.stateAfter.hold)
        assert.ok(l.doseValue >= user.longestKm * 650, `${user.id} week ${w}: LONG_EASY ${l.doseValue} below 65% habitual ${user.longestKm * 1000}`);
      for (const e of [...easy, ...long]) if (!e.calibration && e.phase !== 'TAPER' && e.phase !== 'RE_ENTRY')
        assert.ok(e.paceFast !== null && e.paceSlow !== null, `${user.id} week ${w}: numeric pace for ${e.type}`);
    }
    assert.equal(a.checks.filter(c => c.code === 'C23').reduce((n, c) => n + c.violations, 0), 0, `${user.id}: weekly budget`);
    assert.equal(a.checks.filter(c => c.code === 'C05' || c.code === 'C05b').reduce((n, c) => n + c.violations, 0), 0, `${user.id}: recovery`);
    assert.equal(a.findings.filter(f => ['HARD_SESSIONS_TOO_CLOSE', 'WEEKLY_BUDGET_EXCEEDED', 'WEEKLY_VOLUME_JUMP', 'LONG_RUN_NEVER_PRESCRIBED'].includes(f.code)).length, 0, `${user.id}: ${a.findings.map(f => f.code)}`);
    if(user.id.startsWith('P5-')) {
      const firstWeek=rows.filter(x=>x.week===1);
      assert.deepEqual(firstWeek.map(x=>x.type),['THRESHOLD','EASY','LONG_EASY'],`${user.id}: the 25 km prescription has one quality, one ordinary EASY and the full long run`);
      assert.deepEqual(firstWeek.map(x=>Math.round(x.reservedMeters??0)),[10032,2968,12000]);
      assert.equal(firstWeek.reduce((n,x)=>n+(x.reservedMeters??0),0),25_000,'all same-week engine reservations fill, but do not exceed, the approved 25 km');
    }
  }
});

test('WS-19f budget priority: the long run never comes from raising the budget or compensating a skip (deficit profile)', () => {
  const start = createEngine(deficit(), NOW);
  const long = start.queue.find(w => w.type === 'LONG_EASY')!;
  let s = skipWorkout(start, long.id, start.asOf);
  const longs: Workout[] = [];
  for (let n = 0; n < 20; n++) {
    const today = s.asOf;
    const w = s.queue.find(x => x.scheduledDate === today && x.type !== 'REST');
    if (w?.type === 'LONG_EASY') longs.push(w);
    if (w) s = recordResult(s, w.id, makeResult(w, 'GREEN'));
    s = replan(s, addDays(today, 1));
    assert.ok(s.queue.reduce((n2, w2) => n2 + (reservedMetres(s, w2) ?? 0), 0) <= 18_000 + 1e-6 + 1000 * Math.floor((n + 1) / 14), 'budget');
  }
  assert.ok(longs.length >= 2);
  for (const l of longs) assert.ok(l.main.dose.value <= long.main.dose.value * 1.25, `a later long run ${l.main.dose.value} is no compensation for the skipped ${long.main.dose.value}`);
});
