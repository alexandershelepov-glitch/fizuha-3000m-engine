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
 * A service day: the engine puts a zero-dose `REST` entry on the calendar (for example while a safety
 * hold is active, or the day before the race). There is nothing to run, nothing to report and nothing
 * to miss, so it is never an unresolved result and must not be turned into a "skipped workout"
 * (QA issue #23, DEF-001). Real sessions are unaffected.
 */
export function isServiceDay(workout: Workout): boolean {
  return workout.type === 'REST';
}

/**
 * Sessions the engine still holds for past dates: recorded and skipped ones have already left the
 * queue, so whatever remains is an unresolved result. Past service days (REST) are not results; the
 * engine drops them on the next replan.
 */
export function pendingResults(engineState: EngineState, today: string): Workout[] {
  return engineState.queue.filter((workout) => workout.scheduledDate < today && !isServiceDay(workout));
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
 * The clock-sensitive actions a user can take on one scheduled session.
 * `RESULT` describes a session that happened; `SKIP` and `MOVE` are decisions about the plan.
 */
export type WorkoutAction = 'RESULT' | 'SKIP' | 'MOVE';

/**
 * Why an action is or is not allowed right now. A single source of truth for the guards and for the
 * screens: the UI only mirrors this, it never decides it.
 */
export type ActionAvailability = 'AVAILABLE' | 'BEFORE_SCHEDULED_DATE' | 'PAST_DUE_CANNOT_MOVE' | 'OUT_OF_ORDER';

/** A session whose date is already behind the device date is overdue, whatever the queue says. */
export function isOverdue(workout: Workout, today: string): boolean {
  return workout.scheduledDate < today;
}

export function actionAvailability(engineState: EngineState, workoutId: string, today: string, action: WorkoutAction): ActionAvailability {
  const workout = engineState.queue.find((entry) => entry.id === workoutId);
  // An unknown or already handled session is the engine's business: this guard must not replace the
  // engine's own UNKNOWN_WORKOUT / UNKNOWN_OR_COMPLETED_WORKOUT checks.
  if (workout === undefined) return 'AVAILABLE';

  // A result describes a session that has already happened, so it cannot be entered in advance.
  // Skipping or moving a future session is a legitimate decision about the plan.
  if (action === 'RESULT' && workout.scheduledDate > today) return 'BEFORE_SCHEDULED_DATE';

  // An overdue session is resolved by its result or by marking it as not done. Moving it into the
  // future would reopen a session the user has already passed, which INV-1 forbids: a miss must be
  // accounted for, not postponed. This is checked before the order rule so the reason is precise.
  if (action === 'MOVE' && isOverdue(workout, today)) return 'PAST_DUE_CANNOT_MOVE';

  // INV-1: while an older session is unresolved, no newer one may be resolved, moved or replanned.
  const earliest = earliestPending(engineState, today);
  if (earliest !== null && earliest.id !== workoutId) return 'OUT_OF_ORDER';

  return 'AVAILABLE';
}

export function resultAvailability(engineState: EngineState, workoutId: string, today: string): ActionAvailability {
  return actionAvailability(engineState, workoutId, today, 'RESULT');
}

export function assertWorkoutActionAllowed(engineState: EngineState, workoutId: string, today: string, action: WorkoutAction): void {
  const availability = actionAvailability(engineState, workoutId, today, action);
  if (availability === 'BEFORE_SCHEDULED_DATE') {
    throw new ApplicationError('WORKOUT_RESULT_BEFORE_SCHEDULED_DATE', `the session is scheduled for ${today} or later`);
  }
  if (availability === 'PAST_DUE_CANNOT_MOVE') {
    throw new ApplicationError('PAST_DUE_WORKOUT_CANNOT_MOVE', 'an overdue session is resolved by its result or by marking it as not done');
  }
  if (availability === 'OUT_OF_ORDER') {
    const earliest = earliestPending(engineState, today);
    throw new ApplicationError('PENDING_RESULT_OUT_OF_ORDER', `the earlier session ${earliest?.scheduledDate ?? ''} is still open`);
  }
}

export function assertWorkoutResultAllowed(engineState: EngineState, workoutId: string, today: string): void {
  assertWorkoutActionAllowed(engineState, workoutId, today, 'RESULT');
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
