/**
 * Application invariants that must hold no matter which screen triggered the operation.
 *
 * INV-1 (docs/pwa-architecture.md §6): unrecorded results come first, and only then may the engine
 * clock move. A UI that merely hides a button is not enough — the check lives here so that every
 * caller, present or future, is stopped in the same place.
 */
import {ApplicationError} from './appError.ts';
import type {EngineState, Workout} from './engineGateway.ts';

/**
 * Sessions the engine still holds for past dates: recorded and skipped ones have already left the
 * queue, so whatever remains is an unresolved result.
 */
export function pendingResults(engineState: EngineState, today: string): Workout[] {
  return engineState.queue.filter((workout) => workout.scheduledDate < today);
}

export function hasPendingResults(engineState: EngineState, today: string): boolean {
  return pendingResults(engineState, today).length > 0;
}

/**
 * The earliest unresolved session. Results are closed in chronological order, so recording a later
 * training while an earlier one is still open is refused rather than silently reordering INV-1.
 */
export function earliestPending(engineState: EngineState, today: string): Workout | null {
  return pendingResults(engineState, today)[0] ?? null;
}

/**
 * Why a result can or cannot be recorded right now. A single source of truth for the guard and for
 * the screens: the UI only mirrors this, it never decides it.
 */
export type ResultAvailability = 'AVAILABLE' | 'BEFORE_SCHEDULED_DATE' | 'OUT_OF_ORDER';

export function resultAvailability(engineState: EngineState, workoutId: string, today: string): ResultAvailability {
  const workout = engineState.queue.find((entry) => entry.id === workoutId);
  // An unknown or already recorded session is the engine's business: this guard must not replace the
  // engine's own UNKNOWN_OR_COMPLETED_WORKOUT check.
  if (workout === undefined) return 'AVAILABLE';

  // A result describes a session that has already happened, so it cannot be entered in advance.
  if (workout.scheduledDate > today) return 'BEFORE_SCHEDULED_DATE';

  // INV-1: results are closed from the oldest unresolved session, never out of order.
  const earliest = earliestPending(engineState, today);
  if (earliest !== null && earliest.id !== workoutId) return 'OUT_OF_ORDER';

  return 'AVAILABLE';
}

export function assertWorkoutResultAllowed(engineState: EngineState, workoutId: string, today: string): void {
  const availability = resultAvailability(engineState, workoutId, today);
  if (availability === 'BEFORE_SCHEDULED_DATE') {
    throw new ApplicationError('WORKOUT_RESULT_BEFORE_SCHEDULED_DATE', `the session is scheduled for ${today} or later`);
  }
  if (availability === 'OUT_OF_ORDER') {
    const earliest = earliestPending(engineState, today);
    throw new ApplicationError('PENDING_RESULT_OUT_OF_ORDER', `the earlier session ${earliest?.scheduledDate ?? ''} is still open`);
  }
}

/**
 * Gate in front of every clock-advancing operation (`replan` and, later, the flows that move the
 * clock for other reasons).
 *
 * The block is cleared by resolving the pending sessions themselves — recording their results or
 * marking them as not done — because that removes them from the queue. There is deliberately no flag
 * to bypass the check: passing `today` forward is exactly what INV-1 forbids until the queue for the
 * past is empty.
 */
export function assertClockAdvanceAllowed(engineState: EngineState, today: string): void {
  const pending = pendingResults(engineState, today);
  if (pending.length > 0) {
    throw new ApplicationError('PENDING_RESULT_BLOCKED', `pending results: ${pending.map((workout) => workout.scheduledDate).join(', ')}`);
  }
}
