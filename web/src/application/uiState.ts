/**
 * Derivation of the UI state from engine data (docs/wireframes.md §2).
 *
 * This is a pure mapping, not a decision: it only reads what the engine already decided
 * (`decision`, `queue`, `checkpointRequired`, `finalResultRecorded`). No thresholds, no prediction,
 * and no plan is ever computed here.
 */
import {daysBetween, deviceToday} from './format.ts';
import {pendingResults} from './invariants.ts';
import type {EngineState, Workout} from './engineGateway.ts';

/**
 * Every state of the Today screen. The order below is the documented selection order: the first
 * matching entry wins. States that this slice does not render yet are still derived, so adding them
 * later is a rendering change rather than an architectural one.
 */
export const TODAY_STATES = Object.freeze([
  'COMPLETED',
  'AWAITING_FINAL_RESULT',
  'RACE_DAY',
  'PENDING_RESULT',
  'TRAINING_HOLD',
  'PERFORMANCE_REVIEW',
  'TAPER',
  'CHECKPOINT_REQUIRED',
  'WORKOUT_TODAY',
  'EMPTY_QUEUE',
  'REST_DAY',
] as const);
export type TodayState = (typeof TODAY_STATES)[number];

export interface TodayView {
  readonly state: TodayState;
  readonly deviceToday: string;
  /** The workout scheduled for today, when the engine placed one. */
  readonly workout: Workout | null;
  /** The next known session after today, taken from the engine queue only. */
  readonly nextWorkout: Workout | null;
  /** Days until the race; negative once the date has passed. */
  readonly daysToRace: number;
  /** Workouts dated before today that are neither recorded nor skipped (INV-1). */
  readonly pendingWorkouts: readonly Workout[];
}

/** Distinguish a genuine safety block from the need to repeat a stale 3000 m test. */
export function isSafetyHold(s: EngineState): boolean {
  return s.decision.safety !== 'OK' || s.diagnosticHold || s.relatedYellow;
}

export function needsPerformanceReview(s: EngineState): boolean {
  return !isSafetyHold(s) && s.decision.confidence === 'LOW' &&
    s.decision.phase === 'HOLD_DIAGNOSTIC';
}

export function deriveToday(engineState: EngineState, today: string = deviceToday()): TodayView {
  const workout = engineState.queue.find(entry => entry.scheduledDate === today) ?? null;
  const nextWorkout = engineState.queue.find(entry => entry.scheduledDate > today) ?? null;
  const pending = pendingResults(engineState, today);
  const daysToRace = daysBetween(today, engineState.profile.raceDate);

  const state = selectState(engineState, today, workout, pending);
  return {state, deviceToday: today, workout, nextWorkout, daysToRace, pendingWorkouts: pending};
}

function selectState(engineState: EngineState, today: string, workout: Workout | null, pending: readonly Workout[]): TodayState {
  if (engineState.finalResultRecorded) return 'COMPLETED';
  if (today > engineState.profile.raceDate) return 'AWAITING_FINAL_RESULT';
  if (today === engineState.profile.raceDate) return 'RACE_DAY';
  if (pending.length > 0) return 'PENDING_RESULT';
  if (isSafetyHold(engineState)) return 'TRAINING_HOLD';
  if (needsPerformanceReview(engineState)) return 'PERFORMANCE_REVIEW';
  if (engineState.decision.phase === 'TAPER') return 'TAPER';
  if (engineState.checkpointRequired) return 'CHECKPOINT_REQUIRED';
  if (workout !== null) return 'WORKOUT_TODAY';
  if (engineState.queue.length === 0) return 'EMPTY_QUEUE';
  return 'REST_DAY';
}

/** Cycle status, derived exactly as pwa-architecture.md §3 prescribes. */
export type CycleStatus = 'ACTIVE' | 'AWAITING_FINAL_RESULT' | 'COMPLETED';

export function deriveCycleStatus(engineState: EngineState, today: string = deviceToday()): CycleStatus {
  if (engineState.finalResultRecorded) return 'COMPLETED';
  if (today > engineState.profile.raceDate) return 'AWAITING_FINAL_RESULT';
  return 'ACTIVE';
}
