/**
 * A guarded safety reassessment of an active cycle.
 * Only the sport engine may lift a diagnostic hold. The prior plan/history/baseline remain intact.
 */
import {ApplicationError} from './appError.ts';
import {assessmentSnapshotOf} from './appState.ts';
import type {AppStateV1} from './appState.ts';
import {resolveCurrentSafety} from './engineGateway.ts';
import type {EngineState, SafetyData} from './engineGateway.ts';
import {assertClockAdvanceAllowed} from './invariants.ts';
import {applyEngineTransition} from './transition.ts';
import type {TransitionOutcome} from './transition.ts';
import type {CycleRepository} from './storage.ts';
import {toUiErrorFromUnknown} from './errorContract.ts';

export function recheckSafety(request: {
  repo: CycleRepository;
  appState: AppStateV1;
  engineState: EngineState;
  safety: SafetyData;
  medicalReviewConfirmed: boolean;
  deviceToday: string;
  at: string;
}): TransitionOutcome {
  if (request.engineState.finalResultRecorded) {
    return {ok: false, error: toUiErrorFromUnknown(new ApplicationError('CYCLE_COMPLETED'))};
  }
  if (!request.medicalReviewConfirmed) {
    return {ok: false, error: toUiErrorFromUnknown(new ApplicationError('SAFETY_REVIEW_NOT_CONFIRMED'))};
  }
  return applyEngineTransition({
    ...request,
    guard: () => assertClockAdvanceAllowed(request.engineState, request.deviceToday),
    transition: () => resolveCurrentSafety(request.engineState, request.safety, request.deviceToday),
    event: (next) => ({
      type: 'SAFETY_REASSESSED',
      at: request.at,
      safety: structuredClone(request.safety),
      decisionAfter: assessmentSnapshotOf(next.decision),
    }),
  });
}
