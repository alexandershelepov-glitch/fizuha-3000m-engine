/**
 * The single application-level error contract for engine rejections.
 *
 * Everything that crosses into the UI is expressed as `UiError`: a stable code, structured
 * parameters and a policy flag. User-facing Russian text is attached later by the UI copy layer, so
 * no module ever classifies an error by its English `message`.
 */
import {viewEngineError} from './engineGateway.ts';
import type {EngineErrorCode, EngineErrorView} from './engineGateway.ts';

export interface UiError {
  readonly code: EngineErrorCode | 'UNKNOWN';
  readonly params: {min?: number; max?: number; value?: number};
  /** False when repeating the same action cannot succeed (ui-copy §10.4). */
  readonly retry: boolean;
  /** True when the failure came from the engine rather than from the browser or storage. */
  readonly fromEngine: boolean;
}

/**
 * Codes that move the user to a different scenario instead of offering a plain retry.
 * Mirrors ui-copy §10.4.
 */
const NON_RETRYABLE: readonly string[] = [
  'EVENT_DATE_PASSED',
  'UNSUPPORTED_STATE_VERSION',
  'UNKNOWN_OR_COMPLETED_WORKOUT',
  'RESULT_PRECEDES_STATE',
  'RECOVERY_OR_QUALITY_LIMIT',
  'PROTECTED_FIELD',
  'CHECKPOINT_NOT_PERMITTED',
  'FINAL_RESULT_BEFORE_EVENT',
  'WORKOUT_BLOCKED_BY_PHASE_OR_SAFETY',
];

export function toUiError(view: EngineErrorView): UiError {
  return {code: view.code, params: view.params, retry: !NON_RETRYABLE.includes(view.code), fromEngine: view.fromEngine};
}

/** Safe conversion for anything thrown anywhere in the application. */
export function toUiErrorFromUnknown(error: unknown): UiError {
  return toUiError(viewEngineError(error));
}
