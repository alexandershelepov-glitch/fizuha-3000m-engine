/**
 * The application operation that closes a workout.
 *
 * The UI never calls the engine's `recordResult` itself: this operation enforces the INV-1 ordering,
 * lets the engine classify and rebuild, computes the observable diff, writes the new opaque engine
 * state into the envelope and persists it — all before anything is returned to the UI. A failure
 * leaves the previous state active, because nothing is returned and nothing was overwritten.
 *
 * No event is appended: the completed workout already lives in the engine history, and duplicating it
 * would create a second source of truth (docs/pwa-architecture.md §5).
 */
import {applyEngineState} from './cycle.ts';
import type {AppStateV1} from './appState.ts';
import {recordWorkoutResult as engineRecord} from './engineGateway.ts';
import type {EngineState, Evaluation, WorkoutResult, YellowReason} from './engineGateway.ts';
import {toUiErrorFromUnknown} from './errorContract.ts';
import type {UiError} from './errorContract.ts';
import {assertRecordingOrder} from './invariants.ts';
import {diffPlan} from './planDiff.ts';
import type {PlanChange} from './planDiff.ts';
import {saveActiveCycle} from './storage.ts';
import type {CycleRepository} from './storage.ts';

export interface RecordWorkoutRequest {
  readonly repo: CycleRepository;
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  readonly workoutId: string;
  readonly result: WorkoutResult;
  readonly deviceToday: string;
}

export interface RecordWorkoutDone {
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  /** The engine's own verdict, read from the history entry it just wrote. */
  readonly evaluation: Evaluation;
  readonly yellowReason: YellowReason | null;
  /** Observable differences between the previous and the new state, plus the closure itself. */
  readonly changes: readonly PlanChange[];
}

export type RecordWorkoutOutcome = {ok: true; done: RecordWorkoutDone} | {ok: false; error: UiError};

export function submitWorkoutResult(request: RecordWorkoutRequest): RecordWorkoutOutcome {
  // 1. INV-1: results are closed in chronological order.
  try {
    assertRecordingOrder(request.engineState, request.workoutId, request.deviceToday);
  } catch (error) {
    return {ok: false, error: toUiErrorFromUnknown(error)};
  }

  // 2. The engine alone decides the verdict and the new plan.
  let next: EngineState;
  try {
    next = engineRecord(request.engineState, request.workoutId, request.result);
  } catch (error) {
    return {ok: false, error: toUiErrorFromUnknown(error)};
  }

  const entry = next.history.find((item) => item.workout.id === request.workoutId);
  if (entry === undefined) return {ok: false, error: {code: 'UNKNOWN', params: {}, retry: true, fromEngine: false}};

  // 3. Only what actually differs between the two states.
  const changes: PlanChange[] = [{kind: 'WORKOUT_RECORDED', workoutId: request.workoutId}, ...diffPlan(request.engineState, next, request.deviceToday)];

  // 4. Persist before returning: the caller cannot show a result that is not stored (INV-4).
  const appState = applyEngineState(request.appState, next);
  try {
    saveActiveCycle(request.repo, appState);
  } catch (error) {
    return {ok: false, error: toUiErrorFromUnknown(error)};
  }

  return {
    ok: true,
    done: {appState, engineState: next, evaluation: entry.classified.evaluation, yellowReason: entry.classified.yellowReason, changes},
  };
}
