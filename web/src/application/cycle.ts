/**
 * Application services for the cycle: creation, persistence ordering and engine-state updates.
 *
 * The order is fixed by INV-4: the new engine state is written to storage *before* anything is shown.
 * If the engine or the storage rejects the operation, no cycle is stored as successful.
 */
import {buildAppStateV1, assessmentSnapshotOf} from './appState.ts';
import type {AppStateV1, CycleEvent, NewCycleInput} from './appState.ts';
import {checkProfile, createEngineState, engineStateVersion, serializeEngineState} from './engineGateway.ts';
import type {EngineState, Profile} from './engineGateway.ts';
import {toUiErrorFromUnknown} from './errorContract.ts';
import type {UiError} from './errorContract.ts';
import {saveActiveCycle} from './storage.ts';
import type {CycleRepository} from './storage.ts';

export interface NewCycleRequest {
  profile: Profile;
  deviceToday: string;
  cycleId: string;
  createdAt: string;
  locale: string;
}

export type NewCycleResult =
  | {ok: true; appState: AppStateV1; engineState: EngineState}
  | {ok: false; error: UiError; stage: 'VALIDATION' | 'CREATE' | 'SAVE'};

/**
 * Validate, create and store a cycle. Atomic from the user's point of view: either the full envelope
 * is stored and returned, or nothing is stored and a safe error contract is returned.
 */
export function createCycle(repo: CycleRepository, request: NewCycleRequest): NewCycleResult {
  try {
    checkProfile(request.profile, request.deviceToday);
  } catch (error) {
    return {ok: false, error: toUiErrorFromUnknown(error), stage: 'VALIDATION'};
  }

  let engineState: EngineState;
  try {
    engineState = createEngineState(request.profile, request.deviceToday);
  } catch (error) {
    return {ok: false, error: toUiErrorFromUnknown(error), stage: 'CREATE'};
  }

  const serialized = serializeEngineState(engineState);
  const appState = buildAppStateV1({
    cycleId: request.cycleId,
    createdAt: request.createdAt,
    engineStateVersion: engineStateVersion(engineState),
    engineState: serialized,
    profile: {
      performance: request.profile.performance,
      targetTimeSeconds: request.profile.targetTimeSeconds,
      raceDate: request.profile.raceDate,
    },
    assessment: assessmentSnapshotOf(engineState.decision),
    locale: request.locale,
  } satisfies NewCycleInput);

  try {
    saveActiveCycle(repo, appState);
  } catch (error) {
    return {ok: false, error: toUiErrorFromUnknown(error), stage: 'SAVE'};
  }

  return {ok: true, appState, engineState};
}

/**
 * The only place where a fresh engine state is written into the envelope. Keeps the documented
 * invariant "engineState is exactly serialize()" true for every later operation too.
 */
export function applyEngineState(appState: AppStateV1, engineState: EngineState): AppStateV1 {
  return {
    ...appState,
    cycle: {...appState.cycle, engineStateVersion: engineStateVersion(engineState), engineState: serializeEngineState(engineState)},
  };
}

/** Append-only event log: existing records are never modified or removed. */
export function appendEvent(appState: AppStateV1, event: CycleEvent): AppStateV1 {
  return {...appState, events: [...appState.events, event]};
}
