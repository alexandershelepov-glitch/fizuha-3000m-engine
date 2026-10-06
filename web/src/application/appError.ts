/**
 * Application-level error codes.
 *
 * They are deliberately separate from the engine's `EngineErrorCode`: these are failures of the
 * application's own rules (an invariant it must not break, a device that cannot store data), not
 * rejections produced by the sport engine or by profile validation.
 */
export const APP_ERROR_CODES = Object.freeze(['PENDING_RESULT_BLOCKED', 'PENDING_RESULT_OUT_OF_ORDER', 'WORKOUT_RESULT_BEFORE_SCHEDULED_DATE', 'PAST_DUE_WORKOUT_CANNOT_MOVE', 'STORAGE_UNAVAILABLE', 'CYCLE_COMPLETED', 'ACTIVE_CYCLE_EXISTS', 'INVALID_PARAMETERS', 'ARCHIVE_UNAVAILABLE', 'UNSUPPORTED_ARCHIVE_VERSION', 'ARCHIVE_DAMAGED', 'ARCHIVE_CONFLICT', 'CYCLE_NOT_COMPLETED', 'ACTIVE_CLEAR_FAILED'] as const);
export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class ApplicationError extends Error {
  readonly code: AppErrorCode;
  constructor(code: AppErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ApplicationError';
    this.code = code;
  }
}
