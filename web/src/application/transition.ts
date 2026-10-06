/**
 * The shared shape of every engine-driven change of the active cycle.
 *
 * All of them follow the same order, which is the point of having this in one place: consult the
 * application invariant, let the engine decide, compare the two states, append the application event,
 * write the envelope and only then hand the result back. A failure returns no new state, so nothing
 * can be shown as saved and the previous state stays active.
 */
import {appendEvent} from './cycle.ts';
import {applyEngineState} from './cycle.ts';
import type {AppStateV1, CycleEvent} from './appState.ts';
import type {EngineState} from './engineGateway.ts';
import {toUiErrorFromUnknown} from './errorContract.ts';
import type {UiError} from './errorContract.ts';
import {diffPlan} from './planDiff.ts';
import type {PlanChange} from './planDiff.ts';
import {saveActiveCycle} from './storage.ts';
import type {CycleRepository} from './storage.ts';

export interface TransitionRequest {
  readonly repo: CycleRepository;
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  readonly deviceToday: string;
  /** Consulted before the engine is called. Throws an application error when the action is not allowed. */
  readonly guard?: () => void;
  /** The engine call. Its result is the only source of the new plan. */
  readonly transition: () => EngineState;
  /**
   * Application event describing what the user did, for the data the engine does not keep itself.
   * It receives the state the engine produced, so an event can quote the engine's own verdict.
   */
  readonly event?: (next: EngineState) => CycleEvent | null;
}

export interface TransitionDone {
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  readonly changes: readonly PlanChange[];
}

export type TransitionOutcome = {ok: true; done: TransitionDone} | {ok: false; error: UiError};

export function applyEngineTransition(request: TransitionRequest): TransitionOutcome {
  try {
    request.guard?.();
  } catch (error) {
    return {ok: false, error: toUiErrorFromUnknown(error)};
  }

  let next: EngineState;
  try {
    next = request.transition();
  } catch (error) {
    return {ok: false, error: toUiErrorFromUnknown(error)};
  }

  const changes = diffPlan(request.engineState, next, request.deviceToday);
  let envelope = applyEngineState(request.appState, next);
  const event = request.event?.(next) ?? null;
  if (event !== null) envelope = appendEvent(envelope, event);

  try {
    saveActiveCycle(request.repo, envelope);
  } catch (error) {
    return {ok: false, error: toUiErrorFromUnknown(error)};
  }

  return {ok: true, done: {appState: envelope, engineState: next, changes}};
}
