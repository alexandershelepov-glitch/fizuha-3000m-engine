/** Collects everything one QA run observed and writes machine-readable artefacts (JSON + CSV). */
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export interface Row {
  profile_id: string; seed: number; week: number; date: string; day_index: number;
  event: string; workout_id: string; assignment: string; purpose: string;
  planned_load: string; planned_reserved_m: string;
  entered_result: string; engine_evaluation: string; change_reason: string;
  phase: string; safety: string; warnings: string;
}
export interface CheckRecord {
  profile_id: string; seed: number; id: string; description: string; verdict: 'PASS' | 'FAIL' | 'KNOWN_FAIL'; detail: string; date: string; defect?: string;
}
export interface Counters {
  virtualDays: number; weeksSpanned: number; workoutsPlannedTotal: number; workoutsRecorded: number; workoutsSkipped: number; workoutsMoved: number;
  incompleteSessions: number; symptomReports: number; checkpoints: number; examDateChanges: number; reloads: number;
  expectedBlocks: number; uiTransitions: number; screenshots: number;
  byEvaluation: Record<string, number>; byType: Record<string, number>;
}

export const emptyCounters = (): Counters => ({
  virtualDays: 0, weeksSpanned: 0, workoutsPlannedTotal: 0, workoutsRecorded: 0, workoutsSkipped: 0, workoutsMoved: 0,
  incompleteSessions: 0, symptomReports: 0, checkpoints: 0, examDateChanges: 0, reloads: 0,
  expectedBlocks: 0, uiTransitions: 0, screenshots: 0, byEvaluation: {}, byType: {},
});

export class Journal {
  rows: Row[] = [];
  checks: CheckRecord[] = [];
  counters: Counters = emptyCounters();
  meta: Record<string, unknown> = {};
  weekly: unknown[] = [];
  trace: Record<string, unknown>[] = [];
  constructor(public profileId: string, public seed: number) {}

  row(partial: Partial<Row> & Pick<Row, 'date' | 'event'> & {week: number; day_index: number}): void {
    this.rows.push({
      profile_id: this.profileId, seed: this.seed, workout_id: '', assignment: '', purpose: '', planned_load: '', planned_reserved_m: '',
      entered_result: '', engine_evaluation: '', change_reason: '', phase: '', safety: '', warnings: '', ...partial,
    });
  }

  check(id: string, description: string, ok: boolean, detail: string, date: string, defect?: string): CheckRecord {
    const rec: CheckRecord = {profile_id: this.profileId, seed: this.seed, id, description, verdict: ok ? 'PASS' : defect ? 'KNOWN_FAIL' : 'FAIL', detail, date, ...(defect ? {defect} : {})};
    this.checks.push(rec);
    return rec;
  }

  get failures(): CheckRecord[] { return this.checks.filter((c) => c.verdict === 'FAIL'); }

  write(dir: string): void {
    mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, `${this.profileId}.json`), JSON.stringify({profileId: this.profileId, seed: this.seed, meta: this.meta, counters: this.counters, weekly: this.weekly, trace: this.trace, rows: this.rows, checks: this.checks}, null, 2));
    writeFileSync(join(dir, `${this.profileId}.csv`), toCsv(this.rows));
  }
}

export function toCsv(rows: readonly object[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(','))].join('\n') + '\n';
}
