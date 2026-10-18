import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {
  BEHAVIOURS, CYCLE_WEEKS, NOVICE_CONTROL_SECONDS, SCENARIOS, SENSITIVITY_STEP, USERS, estimateMeters, simulateAudit, simulateAll,
} from '../audit/fullCycle12w.ts';
import {THRESHOLDS, analyze, weeklySummary} from '../audit/fullCycleAnalysis.ts';

const REPORT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'audit', 'full-cycle-12w');
const runs = simulateAll();
const analyses = runs.map(analyze);

test('AUD-01 six virtual users keep the exact questionnaire values from the brief; the goal never replaces the current result', () => {
  assert.equal(USERS.length, 6);
  const expected: [number | null, number | null, number | null][] = [[null, null, null], [1080, 896, 2], [990, 896, 3], [930, 870, 3], [870, 810, 4], [750, 720, null]];
  USERS.forEach((u, i) => {
    const [cur, goal, runsPerWeek] = expected[i]!;
    assert.equal(u.currentSeconds, cur, u.id);
    if (goal !== null) assert.equal(u.goalSeconds, goal, u.id);
    if (runsPerWeek !== null) assert.equal(u.runsPerWeek, runsPerWeek, u.id);
    if (u.currentSeconds !== null) assert.notEqual(u.currentSeconds, u.goalSeconds, `${u.id}: current result must not be replaced by the goal`);
  });
  assert.equal(USERS[0]!.currentSeconds, null);
  assert.equal(USERS[0]!.canRun3Km, false);
  assert.equal(USERS[0]!.goalIsPlaceholder, true);
  assert.ok(USERS.slice(1).every(u => !u.goalIsPlaceholder));
  assert.equal(USERS[5]!.runsPerWeek >= 4 && USERS[5]!.runsPerWeek <= 5, true);
});

test('AUD-02 scenario matrix: 6 users x A/B/V plus five explicit sensitivity scenarios; unique ids; behaviours documented', () => {
  assert.equal(SCENARIOS.length, 23);
  assert.equal(new Set(SCENARIOS.map(s => s.id)).size, 23);
  const required = SCENARIOS.filter(s => s.required);
  assert.equal(required.length, 18);
  for (const u of USERS) assert.deepEqual(required.filter(s => s.user.id === u.id).map(s => s.behaviour), ['A', 'B', 'V']);
  assert.deepEqual(SCENARIOS.filter(s => !s.required).map(s => s.behaviour), ['S', 'S', 'S', 'S', 'S']);
  for (const key of Object.keys(BEHAVIOURS) as (keyof typeof BEHAVIOURS)[]) assert.ok(BEHAVIOURS[key].description.length > 20);
});

test('AUD-03 every scenario covers 12 weeks, is deterministic and records the final race for users with a result', () => {
  for (const run of runs) {
    assert.ok(run.days.length >= CYCLE_WEEKS * 7, run.scenario.id);
    assert.equal(new Set(run.rows.map(r => r.week)).size >= 11, true, run.scenario.id);
    assert.ok(run.rows.length > 0 && run.rows.every(r => r.week >= 1 && r.week <= CYCLE_WEEKS), run.scenario.id);
    if (run.scenario.user.currentSeconds !== null) assert.equal(run.finalState.finalResultRecorded, true, run.scenario.id);
  }
  const s = SCENARIOS[10]!;
  assert.deepEqual(simulateAudit(s).rows, simulateAudit(s).rows);
  assert.deepEqual(analyze(simulateAudit(s)).findings, analyze(simulateAudit(s)).findings);
});

test('AUD-04 no automatic improvement: control and final results equal the last known result outside the explicit S sensitivity scenarios', () => {
  for (const run of runs) {
    const {user, behaviour} = run.scenario;
    if (user.currentSeconds === null) {
      assert.ok(run.controlSeconds.every(x => x === NOVICE_CONTROL_SECONDS), run.scenario.id);
      assert.ok(run.finalResultSeconds === null || run.finalResultSeconds === NOVICE_CONTROL_SECONDS, run.scenario.id);
      continue;
    }
    if (behaviour === 'S') {
      run.controlSeconds.forEach((x, i) => assert.ok(x < (i === 0 ? user.currentSeconds! : run.controlSeconds[i - 1]!), run.scenario.id));
      assert.ok(Math.abs(run.controlSeconds[0]! - user.currentSeconds * (1 - SENSITIVITY_STEP)) < 1.001, run.scenario.id);
    } else {
      assert.ok(run.controlSeconds.every(x => x === user.currentSeconds), run.scenario.id);
      assert.equal(run.finalResultSeconds, user.currentSeconds, run.scenario.id);
    }
  }
});

test('AUD-05 synthetic labelling: every event is an operator input, and the report and data files say so', () => {
  const kinds = new Set(runs.flatMap(r => r.events.map(e => e.kind)));
  assert.ok(kinds.has('EXTERNAL_FINAL_RACE'));
  for (const run of runs) for (const e of run.events) assert.ok(e.detail.length > 10, `${run.scenario.id} ${e.kind}`);
  if (existsSync(join(REPORT_DIR, 'report.md'))) {
    const text = readFileSync(join(REPORT_DIR, 'report.md'), 'utf8');
    assert.match(text, /синтетическ/i);
    assert.match(text, /не улучшается автоматически/);
    const scenarios = JSON.parse(readFileSync(join(REPORT_DIR, 'data', 'scenarios.json'), 'utf8')) as {synthetic: boolean}[];
    assert.equal(scenarios.length, 23);
    assert.ok(scenarios.every(s => s.synthetic === true));
  }
});

test('AUD-06 numeric instructions: no workout lacks a number the methodology should give, and pace/speed/arithmetic agree', () => {
  const rows = runs.flatMap(r => r.rows).filter(r => r.type !== 'REST');
  assert.ok(rows.length > 800);
  assert.equal(rows.filter(r => r.numeric.gapClass === 'DEFICIT').length, 0);
  for (const r of rows) {
    assert.ok(r.numeric.hasQuantity, `${r.scenarioId} ${r.date}`);
    if (r.paceFast !== null && r.speedKmhHigh !== null) assert.ok(Math.abs(3600 / r.paceFast - r.speedKmhHigh) < 0.15, `${r.scenarioId} ${r.date}`);
    if (r.mode === 'INTERVALS') { assert.ok(r.repeats >= 1 && r.restSeconds > 0, `${r.scenarioId} ${r.date}`); }
  }
  for (const type of ['EASY', 'THRESHOLD', 'VO2', 'SPECIFIC_3K'] as const) assert.ok(rows.some(r => r.type === type), type);
});

test('AUD-07 hard sessions are not adjacent and are limited to two per rolling seven days in every scenario', () => {
  for (const a of analyses) {
    assert.equal(a.findings.filter(f => f.code === 'HARD_SESSIONS_TOO_CLOSE' || f.code === 'TOO_MANY_HARD_IN_WEEK').length, 0, a.scenarioId);
  }
});

test('AUD-08 findings are well formed: scenario, week, workout, expected, actual, why, severity and recommendation are all present', () => {
  const ids = new Set(SCENARIOS.map(s => s.id));
  for (const f of analyses.flatMap(a => a.findings)) {
    assert.ok(ids.has(f.scenarioId));
    assert.ok(['CRITICAL', 'METHODOLOGICAL', 'MINOR'].includes(f.severity), f.code);
    for (const field of [f.code, f.workout, f.expected, f.actual, f.why, f.recommendation]) assert.ok(field.length > 3, `${f.code} ${f.scenarioId}`);
    assert.ok(f.week >= 0 && f.week <= CYCLE_WEEKS, f.code);
  }
  for (const a of analyses) {
    for (const c of a.checks) assert.ok(c.violations <= c.examined && c.examined > 0, `${a.scenarioId} ${c.code}`);
  }
});

test('AUD-09 a refused-but-required checkpoint is reported exactly when the simulation saw the engine refuse it', () => {
  for (const run of runs) {
    const refused = run.events.filter(e => e.kind === 'CONTROL_REFUSED').length;
    const found = analyses.find(a => a.scenarioId === run.scenario.id)!.findings.some(f => f.code === 'CHECKPOINT_REQUIRED_BUT_REFUSED');
    assert.equal(found, refused >= 14, run.scenario.id);
  }
});

test('AUD-10 weekly summaries cover 12 weeks and reconcile with the workout rows', () => {
  for (const run of runs) {
    const weekly = weeklySummary(run);
    assert.equal(weekly.length, CYCLE_WEEKS);
    const running = run.rows.filter(r => r.type !== 'REST');
    assert.equal(weekly.reduce((n, w) => n + w.runs, 0), running.length, run.scenario.id);
    assert.equal(weekly.reduce((n, w) => n + w.restDays, 0), run.rows.length - running.length, run.scenario.id);
    for (const w of weekly) assert.ok(w.actualKm <= w.plannedKm + 1e-9, `${run.scenario.id} w${w.week}`);
  }
});

test('AUD-11 reviewer heuristics are declared and the distance estimator is conservative and non-negative', () => {
  assert.ok(Object.keys(THRESHOLDS).length >= 8);
  for (const run of runs) for (const r of run.rows) assert.ok(r.estMetersTotal >= 0 && r.estMetersMain <= r.estMetersTotal + 1e-9, `${run.scenario.id} ${r.date}`);
  assert.equal(typeof estimateMeters, 'function');
});
