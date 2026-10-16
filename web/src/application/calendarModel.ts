/** Calendar is a read-only projection of engine facts: no prescriptions or safety decisions here. */
import type {EngineState, Workout, HistoryEntry} from './engineGateway.ts';
import {addDays} from './format.ts';

export type CalendarStatus = 'completed' | 'skipped' | 'planned' | 'moved' | 'rest' | 'unformed' | 'race';
export interface CalendarDay {
  readonly date: string;
  readonly status: CalendarStatus;
  readonly workout: Workout | null;
  readonly result: HistoryEntry | null;
}
export interface CalendarSummary {
  readonly assigned: number;
  readonly completed: number;
  readonly skipped: number;
  /** Known METERS in the main prescription; minute-based sessions cannot be added as distances. */
  readonly knownMainMeters: number;
  readonly sessionsWithoutPrescribedMeters: number;
  /** Only metres explicitly reported by the athlete, not inferred from a prescription. */
  readonly reportedMeters: number;
  readonly sessionsWithoutReportedMeters: number;
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

export function calendarDay(state: EngineState, today: string, date: string, movedIds: ReadonlySet<string> = new Set()): CalendarDay {
  // Completed and skipped entries keep their original factual dates, even after replanning.
  const result = state.history.find(item => item.workout.type !== 'REST' && item.workout.scheduledDate === date) ?? null;
  if (result) return {date, status: 'completed', workout: result.workout, result};
  const skipped = state.skippedWorkouts.find(item => item.type !== 'REST' && item.scheduledDate === date) ?? null;
  if (skipped) return {date, status: 'skipped', workout: skipped, result: null};
  const planned = state.queue.find(item => item.type !== 'REST' && item.scheduledDate === date) ?? null;
  if (planned) return {date, status: movedIds.has(planned.id) ? 'moved' : 'planned', workout: planned, result: null};
  if (date === state.profile.raceDate) return {date, status: 'race', workout: null, result: null};
  // The queue describes only an issued seven-day horizon; do not fake a future schedule.
  if (date > today && date > addDays(state.asOf, 6)) return {date, status: 'unformed', workout: null, result: null};
  return {date, status: 'rest', workout: null, result: null};
}

export function weekSummary(days: readonly CalendarDay[]): CalendarSummary {
  const workouts = days.filter(day => day.workout !== null);
  const known = workouts.filter(day => day.workout!.main.dose.unit === 'METERS');
  const completed = workouts.filter(day => day.status === 'completed');
  const withMeters = completed.filter(day => (day.result?.result.distanceMeters ?? 0) > 0);
  return {
    assigned: workouts.length,
    completed: completed.length,
    skipped: workouts.filter(day => day.status === 'skipped').length,
    knownMainMeters: known.reduce((total, day) => total + day.workout!.main.dose.value, 0),
    sessionsWithoutPrescribedMeters: workouts.length - known.length,
    reportedMeters: withMeters.reduce((total, day) => total + day.result!.result.distanceMeters, 0),
    sessionsWithoutReportedMeters: completed.length - withMeters.length,
  };
}
