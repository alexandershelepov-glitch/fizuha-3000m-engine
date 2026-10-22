/** Calendar is a read-only projection of engine facts: no prescriptions or safety decisions here. */
import type {EngineState, ForecastEntry, Workout, HistoryEntry} from './engineGateway.ts';
import {addDays} from './format.ts';

export type CalendarStatus = 'completed' | 'skipped' | 'planned' | 'moved' | 'forecast' | 'control' | 'unresolved' | 'rest' | 'unformed' | 'race';
/** Days of the preliminary forecast: never facts, never counted together with issued workouts. */
export const PRELIMINARY_STATUSES: readonly CalendarStatus[] = ['forecast', 'control', 'unresolved'];
export function isPreliminary(day: CalendarDay): boolean { return PRELIMINARY_STATUSES.includes(day.status); }
export interface CalendarDay {
  readonly date: string;
  readonly status: CalendarStatus;
  readonly workout: Workout | null;
  readonly result: HistoryEntry | null;
  /**
   * The forecast entry behind a 'forecast'/'control' day, if any. History and the issued queue never
   * need it: those days are facts and stay sourced from the engine state itself.
   */
  readonly forecast: ForecastEntry | null;
}
export interface CalendarSummary {
  /** Workouts actually issued by the engine (queue, history, skips). Preliminary forecast days are NOT included. */
  readonly assigned: number;
  readonly completed: number;
  readonly skipped: number;
  /** Known METERS in the main prescription; minute-based sessions cannot be added as distances. */
  readonly knownMainMeters: number;
  readonly sessionsWithoutPrescribedMeters: number;
  /** Only metres explicitly reported by the athlete, not inferred from a prescription. */
  readonly reportedMeters: number;
  readonly sessionsWithoutReportedMeters: number;
  /** Preliminary forecast workouts (status 'forecast' and 'control'); kept apart from issued ones. */
  readonly preliminary: number;
  /** Known METERS of the main part of preliminary workouts — a forecast, never added to planned or reported metres. */
  readonly preliminaryMainMeters: number;
  readonly preliminaryWithoutMeters: number;
  /** Forecast slots the engine could not resolve (UNRESOLVED): they need clarification and carry no volume. */
  readonly unresolved: number;
}

/** Monday-based week, with UTC arithmetic to avoid DST and browser time-zone drift. */
export function mondayOf(date: string): string {
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export function weekDates(anyDay: string): string[] {
  const monday = mondayOf(anyDay);
  return Array.from({length: 7}, (_, i) => addDays(monday, i));
}

/**
 * The calendar always displays whole ISO weeks, including leading/trailing month days.
 * `periodWeeks` lists the Monday of every week from the cycle start to the race week (inclusive):
 * the "Весь период" view stacks these weeks without inventing days beyond the cycle.
 */
export function periodWeeks(state: EngineState): string[] {
  const first = mondayOf(state.cycleStartDate);
  const last = mondayOf(state.profile.raceDate);
  const count = Math.round((Date.parse(last + 'T00:00:00Z') - Date.parse(first + 'T00:00:00Z')) / 86400000) / 7 + 1;
  return Array.from({length: count}, (_, i) => addDays(first, i * 7));
}

/** The calendar always displays whole ISO weeks, including leading/trailing month days. */
export function monthDates(anyDay: string): string[] {
  const first = anyDay.slice(0, 7) + '-01';
  const year = Number(first.slice(0, 4));
  const month = Number(first.slice(5, 7));
  const last = `${year}-${String(month).padStart(2, '0')}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  const begin = mondayOf(first);
  const end = addDays(mondayOf(last), 6);
  const count = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(begin + 'T00:00:00Z')) / 86400000) + 1;
  return Array.from({length: count}, (_, i) => addDays(begin, i));
}

/**
 * One day, three strictly separated sources of truth, in priority order:
 * 1. history — real completed workouts (facts);
 * 2. skippedWorkouts — real misses (facts);
 * 3. the issued queue — the engine's current committed prescriptions (facts);
 * 4. the forecast map (CONDITIONAL entries only) — preliminary future plan, never facts.
 * A forecast entry never overrides a fact, and committed entries are excluded from the map upstream.
 */
export function calendarDay(state: EngineState, today: string, date: string, movedIds: ReadonlySet<string> = new Set(),
  forecast: ReadonlyMap<string, ForecastEntry> = new Map()): CalendarDay {
  // Completed and skipped entries keep their original factual dates, even after replanning.
  const result = state.history.find(item => item.workout.type !== 'REST' && item.workout.scheduledDate === date) ?? null;
  if (result) return {date, status: 'completed', workout: result.workout, result, forecast: null};
  const skipped = state.skippedWorkouts.find(item => item.type !== 'REST' && item.scheduledDate === date) ?? null;
  if (skipped) return {date, status: 'skipped', workout: skipped, result: null, forecast: null};
  const planned = state.queue.find(item => item.type !== 'REST' && item.scheduledDate === date) ?? null;
  if (planned) return {date, status: movedIds.has(planned.id) ? 'moved' : 'planned', workout: planned, result: null, forecast: null};
  if (date === state.profile.raceDate) return {date, status: 'race', workout: null, result: null, forecast: null};
  // Preliminary forecast: workouts the engine would issue under the conditional scenario. The
  // checkpoint CONTROL slots needing a real measurement are marked separately. Forecast REST
  // placeholders are plain rest days, exactly like REST entries in the issued queue.
  const projected = forecast.get(date) ?? null;
  if (projected) {
    if (projected.workout.type === 'REST') return {date, status: 'rest', workout: null, result: null, forecast: null};
    // UNRESOLVED: the engine could not resolve this slot; it is shown as needing clarification, never as a normal workout.
    if (projected.status === 'UNRESOLVED') return {date, status: 'unresolved', workout: projected.workout, result: null, forecast: projected};
    return {date, status: projected.workout.type === 'CONTROL' ? 'control' : 'forecast',
      workout: projected.workout, result: null, forecast: projected};
  }
  // The queue describes only an issued seven-day horizon; do not fake a future schedule.
  if (date > today && date > addDays(state.asOf, 6)) return {date, status: 'unformed', workout: null, result: null, forecast: null};
  return {date, status: 'rest', workout: null, result: null, forecast: null};
}

/** Index forecast entries by date, excluding COMMITTED ones (the issued queue is the only source for them). */
export function forecastByDate(entries: readonly ForecastEntry[]): Map<string, ForecastEntry> {
  return new Map(entries.filter(entry => entry.status !== 'COMMITTED').map(entry => [entry.workout.scheduledDate, entry]));
}

export function weekSummary(days: readonly CalendarDay[]): CalendarSummary {
  const issued = days.filter(day => day.workout !== null && !isPreliminary(day));
  const known = issued.filter(day => day.workout!.main.dose.unit === 'METERS');
  const completed = issued.filter(day => day.status === 'completed');
  const withMeters = completed.filter(day => (day.result?.result.distanceMeters ?? 0) > 0);
  const preliminary = days.filter(day => day.workout !== null && (day.status === 'forecast' || day.status === 'control'));
  const preliminaryKnown = preliminary.filter(day => day.workout!.main.dose.unit === 'METERS');
  return {
    assigned: issued.length,
    completed: completed.length,
    skipped: issued.filter(day => day.status === 'skipped').length,
    knownMainMeters: known.reduce((total, day) => total + day.workout!.main.dose.value, 0),
    sessionsWithoutPrescribedMeters: issued.length - known.length,
    reportedMeters: withMeters.reduce((total, day) => total + day.result!.result.distanceMeters, 0),
    sessionsWithoutReportedMeters: completed.length - withMeters.length,
    preliminary: preliminary.length,
    preliminaryMainMeters: preliminaryKnown.reduce((total, day) => total + day.workout!.main.dose.value, 0),
    preliminaryWithoutMeters: preliminary.length - preliminaryKnown.length,
    unresolved: days.filter(day => day.status === 'unresolved').length,
  };
}
