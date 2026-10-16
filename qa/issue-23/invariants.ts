/**
 * Independent oracle checks over a persisted engine state (read back from the browser's localStorage).
 * They state methodology rules documented in docs/*.md and issue #23; they never alter the state.
 */
import type {EngineState, Workout} from '../../src/models.ts';
import {decide} from '../../src/assessment.ts';
import {approvedWeekMeters, reservedMetres} from '../../src/weeklyLoad.ts';

export interface Violation {id: string; detail: string}

const DAY = 86_400_000;
export const dayNum = (iso: string): number => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
export const addDaysIso = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export const EASY_TYPES = new Set(['EASY', 'LONG_EASY', 'STRIDES']);

/** All non-REST sessions the athlete is, or was, scheduled for (done + still planned; skipped ones are removed). */
export function scheduled(state: EngineState): Workout[] {
  const done = state.history.map((h) => h.workout);
  const ids = new Set(done.map((w) => w.id));
  return [...done, ...state.queue.filter((w) => !ids.has(w.id))].filter((w) => w.type !== 'REST');
}

export function isSafetyHold(state: EngineState): boolean {
  return state.decision.safety !== 'OK' || state.diagnosticHold || state.relatedYellow;
}

export function checkState(state: EngineState, today: string): Violation[] {
  const out: Violation[] = [];
  const all = scheduled(state);

  // 1. never two sessions on one calendar day
  const seen = new Map<string, string>();
  for (const w of all) {
    const prev = seen.get(w.scheduledDate);
    if (prev !== undefined && prev !== w.id) out.push({id: 'INV_ONE_SESSION_PER_DAY', detail: `${w.scheduledDate}: ${prev} и ${w.id}`});
    seen.set(w.scheduledDate, w.id);
  }

  // 2. no session on or after the exam date; no queue entry before the cycle start
  for (const w of state.queue) {
    if (w.type !== 'REST' && w.scheduledDate >= state.profile.raceDate) out.push({id: 'INV_NO_SESSION_ON_OR_AFTER_RACE_DAY', detail: `${w.id} ${w.scheduledDate} >= ${state.profile.raceDate}`});
    if (w.scheduledDate < state.cycleStartDate) out.push({id: 'INV_NO_SESSION_BEFORE_START', detail: `${w.id} ${w.scheduledDate}`});
  }

  // 3. quality frequency per rolling 7 days (global ceiling 2; current decision limit for windows with future sessions)
  const quality = all.filter((w) => w.countsAsQuality).map((w) => dayNum(w.scheduledDate)).sort((a, b) => a - b);
  for (let i = 0; i < quality.length; i += 1) {
    const inWindow = quality.filter((d) => d >= quality[i]! && d < quality[i]! + 7).length;
    if (inWindow > 2) out.push({id: 'INV_QUALITY_PER_7_DAYS_GLOBAL', detail: `${inWindow} quality в окне от ${addDaysIso('1970-01-01', quality[i]!)}`});
  }
  // The engine authorises every queued slot against the decision *on the slot's own date* (src/engine.ts recordResult comment,
  // src/assessment.ts `recentRed` = RED within 7 days of that date), so the limit for a future session is decide(state, thatDate),
  // not today's decision. (Our first version used today's limit and produced false positives — see defect-log.md, "retracted".)
  const futureQuality = state.queue.filter((w) => w.countsAsQuality).map((w) => dayNum(w.scheduledDate));
  for (const start of futureQuality) {
    const inWindow = quality.filter((d) => d > start - 7 && d <= start).length;
    const iso = addDaysIso('1970-01-01', start);
    const limit = decide(state, iso).maximumQualityPerWeek;
    if (inWindow > limit) out.push({id: 'INV_QUALITY_PER_7_DAYS_DECISION', detail: `${inWindow} > maximumQualityPerWeek(${iso})=${limit}`});
  }

  // 3b. a mandatory checkpoint is a 3000 m time trial: it may only be required when it can be recorded (DEF-002)
  if (state.checkpointRequired && !state.profile.canRun3Km) out.push({id: 'INV_CHECKPOINT_ONLY_WHEN_AVAILABLE', detail: 'checkpointRequired при canRun3Km=false'});

  // 4. at least 48 h between quality sessions
  for (let i = 1; i < quality.length; i += 1) {
    if (quality[i]! - quality[i - 1]! < 2) out.push({id: 'INV_QUALITY_RECOVERY_48H', detail: `${addDaysIso('1970-01-01', quality[i - 1]!)} → ${addDaysIso('1970-01-01', quality[i]!)}`});
  }

  // 5. no run sessions while safety stop/hold or diagnostic hold is active
  if (isSafetyHold(state)) {
    const runs = state.queue.filter((w) => w.type !== 'REST' && w.scheduledDate >= today);
    if (runs.length > 0) out.push({id: 'INV_NO_TRAINING_DURING_STOP', detail: `safety=${state.decision.safety} diagnosticHold=${state.diagnosticHold} relatedYellow=${state.relatedYellow}; в очереди ${runs.map((w) => `${w.scheduledDate}:${w.type}`).join(', ')}`});
  }

  // 6. rolling 7-day planning reservation never above the approved weekly budget
  const budget = approvedWeekMeters(state);
  const items = all.map((w) => ({d: dayNum(w.scheduledDate), m: reservedMetres(state, w)}));
  if (items.every((x) => x.m !== null)) {
    for (const end of items.map((x) => x.d)) {
      const total = items.filter((x) => x.d <= end && x.d > end - 7).reduce((s, x) => s + (x.m ?? 0), 0);
      if (total > budget + 1e-6) out.push({id: 'INV_WEEKLY_RESERVATION_WITHIN_BUDGET', detail: `${Math.round(total)} м > ${Math.round(budget)} м в окне, заканчивающемся ${addDaysIso('1970-01-01', end)}`});
    }
  }

  // 7. a skipped/removed session never reappears in history or queue
  // (`skippedIds` also holds slot reservations and ids of MOVED sessions by design, so the real misses are `skippedWorkouts`.)
  for (const m of state.skippedWorkouts) {
    if (state.history.some((h) => h.workout.id === m.id)) out.push({id: 'INV_SKIPPED_NOT_IN_HISTORY', detail: m.id});
    if (state.queue.some((w) => w.id === m.id)) out.push({id: 'INV_SKIPPED_NOT_IN_QUEUE', detail: m.id});
  }

  // 8. history entries are chronological and unique
  const ids = state.history.map((h) => h.workout.id);
  if (new Set(ids).size !== ids.length) out.push({id: 'INV_HISTORY_UNIQUE', detail: 'duplicate workout id in history'});
  return out;
}

export interface WeekLoad {
  week: number; from: string; to: string;
  sessions: number; easy: number; quality: number;
  warmupMin: number; mainMin: number; mainMeters: number; cooldownMin: number; recoveryMin: number;
  reservedMeters: number | null;
}

/** Weekly planned-load table from everything that was scheduled (done or still planned). */
export function weeklyLoad(state: EngineState, startDate: string, weeks: number): WeekLoad[] {
  const all = scheduled(state);
  const rows: WeekLoad[] = [];
  for (let k = 0; k < weeks; k += 1) {
    const from = addDaysIso(startDate, k * 7);
    const to = addDaysIso(startDate, k * 7 + 6);
    const ws = all.filter((w) => w.scheduledDate >= from && w.scheduledDate <= to);
    let reserved: number | null = 0;
    for (const w of ws) {
      const m = reservedMetres(state, w);
      reserved = reserved === null || m === null ? null : reserved + m;
    }
    rows.push({
      week: k + 1, from, to, sessions: ws.length,
      easy: ws.filter((w) => EASY_TYPES.has(w.type)).length,
      quality: ws.filter((w) => w.countsAsQuality).length,
      warmupMin: ws.reduce((s, w) => s + w.warmupMinutes, 0),
      mainMin: ws.reduce((s, w) => s + (w.main.dose.unit === 'MINUTES' ? w.main.dose.value : 0), 0),
      mainMeters: Math.round(ws.reduce((s, w) => s + (w.main.dose.unit === 'METERS' ? w.main.dose.value : 0), 0)),
      cooldownMin: ws.reduce((s, w) => s + w.cooldownMinutes, 0),
      recoveryMin: Math.round(ws.reduce((s, w) => s + (w.main.mode === 'INTERVALS' ? Math.max(0, w.main.repeats - 1) * w.restSeconds / 60 : 0), 0) * 10) / 10,
      reservedMeters: reserved === null ? null : Math.round(reserved),
    });
  }
  return rows;
}
