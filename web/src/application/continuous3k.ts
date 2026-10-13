/**
 * Deliberate capability confirmation, not a timed performance test.
 * The UI only requests this transition; the engine still builds the next training plan.
 */
import {ApplicationError} from './appError.ts';
import {assessmentSnapshotOf} from './appState.ts';
import type {AppStateV1} from './appState.ts';
import {confirmContinuousThreeKm} from './engineGateway.ts';
import type {EngineState} from './engineGateway.ts';
import {assertClockAdvanceAllowed} from './invariants.ts';
import type {CycleRepository} from './storage.ts';
import {applyEngineTransition} from './transition.ts';
import type {TransitionOutcome} from './transition.ts';
import {toUiErrorFromUnknown} from './errorContract.ts';

export interface ConfirmContinuous3kRequest {
  readonly repo: CycleRepository;
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  readonly deviceToday: string;
  readonly at: string;
  readonly runDate: string;
  readonly ranAll3000WithoutWalking: boolean;
  readonly noUnusualSymptoms: boolean;
}

function validDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const date = new Date(raw + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === raw;
}

export function confirmContinuous3k(request: ConfirmContinuous3kRequest): TransitionOutcome {
  const {engineState: state, runDate, deviceToday} = request;
  const invalid = (code: 'CONTINUOUS_3K_UNCONFIRMED' | 'CONTINUOUS_3K_NOT_ALLOWED' | 'CONTINUOUS_3K_BAD_DATE'): TransitionOutcome =>
    ({ok:false, error: toUiErrorFromUnknown(new ApplicationError(code))});

  if (!request.ranAll3000WithoutWalking || !request.noUnusualSymptoms)
    return invalid('CONTINUOUS_3K_UNCONFIRMED');
  if (!validDate(runDate) || !validDate(deviceToday) ||
      runDate < state.cycleStartDate || runDate > deviceToday ||
      runDate >= state.profile.raceDate || deviceToday < state.asOf)
    return invalid('CONTINUOUS_3K_BAD_DATE');

  if (state.profile.canRun3Km || state.finalResultRecorded ||
      state.decision.safety !== 'OK' || state.diagnosticHold ||
      state.relatedYellow || state.progressionBlocked || state.reentry !== null ||
      state.profile.safety.needsAssessment)
    return invalid('CONTINUOUS_3K_NOT_ALLOWED');

  return applyEngineTransition({
    ...request,
    guard: () => assertClockAdvanceAllowed(state, deviceToday),
    transition: () => confirmContinuousThreeKm(state, deviceToday),
    event: next => ({
      type: 'CONTINUOUS_3K_CONFIRMED', at: request.at, runDate,
      decisionAfter: assessmentSnapshotOf(next.decision),
    }),
  });
}
