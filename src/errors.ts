/**
 * Public error contract for the PWA (UI-GAP-06).
 *
 * Every error the engine raises during normal operation through the public API carries a stable
 * machine-readable `code`, so a client never has to match English prose to identify a failure.
 * Messages are produced from a single code -> message table, which keeps the historical wording
 * byte-for-byte identical while removing the possibility of a code and a text drifting apart.
 *
 * Nothing here participates in a sport decision: errors are raised on rejection paths only and are
 * never stored in the engine state.
 */

/**
 * All error codes the public API can raise, grouped by origin. The array is the single source of
 * truth for `EngineErrorCode`, so adding a code here widens the union automatically and an
 * exhaustive client `switch` stops compiling until the new code is handled.
 */
export const ERROR_CODES = Object.freeze([
  // profile / result validation
  'INVALID_DATE_FORMAT',
  'INVALID_CALENDAR_DATE',
  'NUMBER_OUT_OF_RANGE',
  'INVALID_SAFETY_FLAG',
  'INVALID_PROFILE_FLAG',
  'INVALID_QUALITY_WEEKS',
  'INVALID_MISMATCH',
  'INVALID_PERFORMANCE_SOURCE',
  'INVALID_BREAK_REASON',
  'INVALID_BREAK',
  'FUTURE_PERFORMANCE',
  'AVAILABILITY_NOT_INTEGER',
  'INVALID_YELLOW_REASON',
  'INVALID_FATIGUE_FLAG',
  'INVALID_FEEDBACK_CONFIRMATION',
  'INVALID_PROGRESSION_STATE',
  'RESULT_DISTANCE_CONFLICT',
  // lifecycle
  'EVENT_DATE_PASSED',
  'CLOCK_BACKWARDS',
  'UNSUPPORTED_STATE_VERSION',
  'WORKOUT_BLOCKED_BY_PHASE_OR_SAFETY',
  // workout and transition
  'UNKNOWN_WORKOUT',
  'UNKNOWN_OR_COMPLETED_WORKOUT',
  'RESULT_PRECEDES_STATE',
  'RECOVERY_OR_QUALITY_LIMIT',
  'PROTECTED_FIELD',
  'CHECKPOINT_NOT_PERMITTED',
  'INVALID_CHECKPOINT_DATE',
  'FINAL_RESULT_NOT_ON_EVENT_DATE',
  'FINAL_RESULT_BEFORE_EVENT',
  'MOVE_OUTSIDE_HORIZON',
  'MOVE_OCCUPIED_DATE',
  'MOVE_RECOVERY_VIOLATION',
  'MOVE_QUALITY_LIMIT_VIOLATION',
  'MOVE_WEEKLY_LOAD_LIMIT',
] as const);
export type EngineErrorCode = (typeof ERROR_CODES)[number];

/** Canonical, unchanged human-readable text for every code. */
const MESSAGES = {
  INVALID_DATE_FORMAT: 'Date must be YYYY-MM-DD',
  INVALID_CALENDAR_DATE: 'Invalid calendar date',
  // Only a fallback: `number()` always supplies bounds, and the concrete text is built from them.
  NUMBER_OUT_OF_RANGE: 'Number outside the allowed range',
  INVALID_SAFETY_FLAG: 'Invalid safety flag',
  INVALID_PROFILE_FLAG: 'Invalid profile flag',
  INVALID_QUALITY_WEEKS: 'Invalid quality weeks',
  INVALID_MISMATCH: 'Invalid mismatch',
  INVALID_PERFORMANCE_SOURCE: 'Invalid performance source',
  INVALID_BREAK_REASON: 'Invalid break reason',
  INVALID_BREAK: 'Invalid break',
  FUTURE_PERFORMANCE: 'Future performance',
  AVAILABILITY_NOT_INTEGER: 'Availability must be integer',
  INVALID_YELLOW_REASON: 'Invalid yellow reason',
  INVALID_FATIGUE_FLAG: 'Invalid fatigue flag',
  INVALID_FEEDBACK_CONFIRMATION: 'Invalid explicit feedback confirmation',
  INVALID_PROGRESSION_STATE: 'Invalid saved training progression',
  RESULT_DISTANCE_CONFLICT: 'Reported total distance is less than measured splits',
  EVENT_DATE_PASSED: 'EVENT_DATE_PASSED: the active plan works only up to and including the target race date',
  CLOCK_BACKWARDS: 'Clock cannot move backwards',
  UNSUPPORTED_STATE_VERSION: 'Unsupported state version',
  WORKOUT_BLOCKED_BY_PHASE_OR_SAFETY: 'Workout blocked by phase or safety',
  UNKNOWN_WORKOUT: 'Unknown workout',
  UNKNOWN_OR_COMPLETED_WORKOUT: 'Unknown or completed workout',
  RESULT_PRECEDES_STATE: 'Result precedes prescription or state',
  RECOVERY_OR_QUALITY_LIMIT: 'Recovery or quality limit violated',
  PROTECTED_FIELD: 'Protected field',
  CHECKPOINT_NOT_PERMITTED: 'Checkpoint not permitted',
  INVALID_CHECKPOINT_DATE: 'Invalid checkpoint date',
  FINAL_RESULT_NOT_ON_EVENT_DATE: 'Final result must be dated on the event date',
  FINAL_RESULT_BEFORE_EVENT: 'Final result cannot be recorded before the event date',
  MOVE_OUTSIDE_HORIZON: 'Move outside queue horizon',
  MOVE_OCCUPIED_DATE: 'Occupied date',
  MOVE_RECOVERY_VIOLATION: 'Move violates recovery',
  MOVE_QUALITY_LIMIT_VIOLATION: 'Move violates weekly quality limit',
  MOVE_WEEKLY_LOAD_LIMIT: 'Move exceeds the approved rolling weekly load',
} as const satisfies Record<EngineErrorCode, string>;

/**
 * Structured parameters for errors whose text alone is not enough for a client to react.
 * Currently only `NUMBER_OUT_OF_RANGE` carries them; `max` may be `Infinity` when unbounded.
 */
export interface EngineErrorDetails {
  readonly min?: number;
  readonly max?: number;
  readonly value?: number;
}

/** Canonical message for a code, given its structured details. */
export function engineErrorMessage(code: EngineErrorCode, details: EngineErrorDetails = {}): string {
  if (code === 'NUMBER_OUT_OF_RANGE' && details.min !== undefined) return `Number outside ${details.min}..${details.max}`;
  return MESSAGES[code];
}

/**
 * Base class for every rejection raised by the public API.
 *
 * Usage:
 * ```ts
 * try { recordResult(state, id, result); }
 * catch (error) {
 *   if (error instanceof EngineError) switch (error.code) { ... }
 * }
 * ```
 * It extends `Error`, so existing `instanceof Error` handling and message matching keep working.
 */
export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly details: EngineErrorDetails;
  constructor(code: EngineErrorCode, details: EngineErrorDetails = {}, message?: string) {
    super(message ?? engineErrorMessage(code, details));
    this.name = 'EngineError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Raised when an active plan would operate after the target race date. Kept as its own class for
 * backwards compatibility: `instanceof EventDatePassedError`, `code === 'EVENT_DATE_PASSED'` and
 * the original message are all preserved.
 */
export class EventDatePassedError extends EngineError {
  constructor(message?: string) {
    super('EVENT_DATE_PASSED', {}, message);
    this.name = 'EventDatePassedError';
  }
}
