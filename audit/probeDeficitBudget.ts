/**
 * Probe for the weekly-structure follow-up: profiles whose weekly budget is small relative to two intense sessions
 * (e.g. 18 km a week, longest run 7 km, 4 runs, 12:30 for 3 km). Runs the SAME 12-week synthetic harness as `audit:12w`
 * (scenario behaviour A, i.e. everything done as prescribed) with additional virtual users. The 23 audit scenarios and the
 * detector thresholds are not touched. All athlete behaviour is SYNTHETIC.
 *
 *   node --experimental-strip-types audit/probeDeficitBudget.ts <out.json>
 */
import {writeFileSync} from 'node:fs';
import {simulateAudit} from './fullCycle12w.ts';
import type {WorkoutRow} from './fullCycle12w.ts';
import {PROBES} from './deficitProfiles.ts';
import {analyze} from './fullCycleAnalysis.ts';

const short = (t: string): string => ({EASY: 'E', LONG_EASY: 'L', THRESHOLD: 'T', VO2: 'V', SPECIFIC_3K: 'S3', INTRO_QUALITY: 'IQ', CONTROL: 'C'} as Record<string, string>)[t] ?? t;
const out = PROBES.map(user => {
  const run = simulateAudit({id: user.id, user, behaviour: 'A', required: false});
  const a = analyze(run);
  const rows = run.rows.filter(r => r.type !== 'REST');
  const km = (xs: number[]): string => xs.length === 0 ? '—' : `${(Math.min(...xs) / 1000).toFixed(1)}–${(Math.max(...xs) / 1000).toFixed(1)}`;
  const dose = (t: string): number[] => rows.filter(r => r.type === t && r.doseUnit === 'METERS').map(r => r.doseValue);
  const weeks = [...new Set(rows.map(r => r.week))].sort((x, y) => x - y);
  const budget = run.rows.find(r => r.approvedWeekMeters !== null)?.approvedWeekMeters ?? 0;
  return {
    id: user.id, budgetStartKm: budget / 1000, habitualLongKm: user.longestKm,
    counts: Object.fromEntries(['LONG_EASY', 'EASY', 'THRESHOLD', 'VO2', 'SPECIFIC_3K', 'CONTROL', 'INTRO_QUALITY'].map(t => [t, rows.filter(r => r.type === t).length])),
    easyKm: km(dose('EASY')), longKm: km(dose('LONG_EASY')),
    intensePerWeek: weeks.map(w => rows.filter(r => r.week === w && r.countsAsQuality && r.type !== 'CONTROL').length),
    weeksText: weeks.map(w => `${w}: ` + rows.filter(r => r.week === w).map((r: WorkoutRow) => `${short(r.type)}${r.doseUnit === 'METERS' ? (r.doseValue / 1000).toFixed(1) : Math.round(r.doseValue) + 'm'}`).join(' ')),
    checks: Object.fromEntries(['C23', 'C05', 'C05b'].map(c => [c, a.checks.filter(x => x.code === c).reduce((n, x) => n + x.violations, 0)])),
    findings: a.findings.length, findingCodes: Object.fromEntries([...new Set(a.findings.map(f => f.code))].sort().map(c => [c, a.findings.filter(f => f.code === c).length])),
    endBudgetKm: (run.rows.filter(r => r.approvedWeekMeters !== null).at(-1)?.approvedWeekMeters ?? 0) / 1000,
    planKm: Math.round(rows.reduce((n, r) => n + r.estMetersTotal, 0) / 100) / 10,
    engineErrors: run.engineErrors.length,
  };
});
writeFileSync(process.argv[2] ?? '/dev/stdout', JSON.stringify(out, null, 1) + '\n');
