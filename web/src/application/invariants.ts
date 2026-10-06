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

export function assertRecordingOrder(engineState: EngineState, workoutId: string, today: string): void {
  const earliest = earliestPending(engineState, today);
  if (earliest !== null && earliest.id !== workoutId) {
    throw new ApplicationError('PENDING_RESULT_OUT_OF_ORDER', `the earlier session ${earliest.scheduledDate} is still open`);
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
