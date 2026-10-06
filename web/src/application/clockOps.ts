/**
 * The only place in the application allowed to advance the engine clock.
 *
 * Ordering is fixed: the invariant is checked first, the engine computes the new plan, and the result
 * is written to storage before anything is shown (INV-4). A failure leaves the previous state intact,
 * so the UI never displays a plan that was not persisted.
 */
import {assertClockAdvanceAllowed} from './invariants.ts';
import {replanTo} from './engineGateway.ts';
import type {EngineState} from './engineGateway.ts';
import {applyEngineState} from './cycle.ts';
import type {AppStateV1} from './appState.ts';
import {toUiErrorFromUnknown} from './errorContract.ts';
import type {UiError} from './errorContract.ts';
import {saveActiveCycle} from './storage.ts';
import type {CycleRepository} from './storage.ts';

export interface ClockAdvanceRequest {
  readonly repo: CycleRepository;
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  readonly deviceToday: string;
}

export type ClockAdvanceResult =
  | {ok: true; appState: AppStateV1; engineState: EngineState}
  | {ok: false; error: UiError};

/**
 * Rebuild the plan for the current device date. Refuses to run while unrecorded past sessions exist,
 * so a pending result can never be written off as a past-due miss by a side effect.
 */
export function refreshPlan(request: ClockAdvanceRequest): ClockAdvanceResult {
  try {
    assertClockAdvanceAllowed(request.engineState, request.deviceToday);
  } catch (error) {
    return {ok: false, error: toUiErrorFromUnknown(error)};
  }

  try {
    const next = replanTo(request.engineState, request.deviceToday);
    const envelope = applyEngineState(request.appState, next);
    saveActiveCycle(request.repo, envelope);
    return {ok: true, appState: envelope, engineState: next};
  } catch (error) {
    return {ok: false, error: toUiErrorFromUnknown(error)};
  }
}
