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
import type {AppStateV1} from './appState.ts';
import {recordWorkoutResult as engineRecord} from './engineGateway.ts';
import type {EngineState, Evaluation, WorkoutResult, YellowReason} from './engineGateway.ts';
import type {UiError} from './errorContract.ts';
import {assertWorkoutResultAllowed} from './invariants.ts';
import {diffPlan} from './planDiff.ts';
import type {PlanChange} from './planDiff.ts';
import {applyEngineTransition} from './transition.ts';
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
  const outcome = applyEngineTransition({
    repo: request.repo,
    appState: request.appState,
    engineState: request.engineState,
    deviceToday: request.deviceToday,
    // A result describes a session that already happened, and INV-1 closes them oldest first.
    guard: () => assertWorkoutResultAllowed(request.engineState, request.workoutId, request.deviceToday),
    transition: () => engineRecord(request.engineState, request.workoutId, request.result),
  });
  if (!outcome.ok) return outcome;

  // The verdict is read from the history entry the engine just wrote, never derived here.
  const entry = outcome.done.engineState.history.find((item) => item.workout.id === request.workoutId);
  if (entry === undefined) return {ok: false, error: {code: 'UNKNOWN', params: {}, retry: true, fromEngine: false}};

  return {
    ok: true,
    done: {
      appState: outcome.done.appState,
      engineState: outcome.done.engineState,
      evaluation: entry.classified.evaluation,
      yellowReason: entry.classified.yellowReason,
      // Compare the NEXT pending workout to the NEXT pending workout. The session just closed
      // is not a "changed next prescription": it was completed. diffPlan's general-purpose
      // comparison is correct for checkpoints, but misleading here without this exclusion.
      changes: [
        {kind: 'WORKOUT_RECORDED', workoutId: request.workoutId},
        ...diffPlan(
          {...request.engineState, queue: request.engineState.queue.filter(w => w.id !== request.workoutId)},
          outcome.done.engineState,
          request.deviceToday,
        ),
      ],
    },
  };
}
