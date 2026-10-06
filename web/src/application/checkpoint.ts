/**
 * The application operation that records a new 3000 m assessment.
 *
 * A checkpoint is not a workout result: the engine overwrites Current Performance and rebuilds the
 * plan, which is why the previous value is captured here *before* the engine is asked anything. The
 * immutable baseline of the cycle is never touched — it belongs to the archive, not to the current
 * form (docs/pwa-architecture.md §4, UI-GAP-02).
 *
 * `recordCheckpoint` replans internally, so this is a clock-advancing operation and INV-1 applies.
 */
import {assessmentSnapshotOf} from './appState.ts';
import type {AppStateV1} from './appState.ts';
import {assertClockAdvanceAllowed} from './invariants.ts';
import {recordCheckpoint} from './engineGateway.ts';
import type {EngineState, PerformanceSnapshot} from './engineGateway.ts';
import type {PlanChange} from './planDiff.ts';
import type {CycleRepository} from './storage.ts';
import {applyEngineTransition} from './transition.ts';
import type {UiError} from './errorContract.ts';

export interface CheckpointRequest {
  readonly repo: CycleRepository;
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  readonly performance: PerformanceSnapshot;
  readonly deviceToday: string;
  readonly at: string;
}

export interface CheckpointDone {
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  /** Current Performance as it was before this assessment. */
  readonly previousPerformance: number | null;
  readonly changes: readonly PlanChange[];
}

export type CheckpointOutcome = {ok: true; done: CheckpointDone} | {ok: false; error: UiError};

export function submitCheckpoint(request: CheckpointRequest): CheckpointOutcome {
  // Captured before the engine call: `recordCheckpoint` overwrites it, and the third checkpoint needs
  // the second one rather than the initial baseline.
  const previousPerformance = request.engineState.profile.performance?.timeSeconds ?? null;

  const outcome = applyEngineTransition({
    repo: request.repo,
    appState: request.appState,
    engineState: request.engineState,
    deviceToday: request.deviceToday,
    guard: () => assertClockAdvanceAllowed(request.engineState, request.deviceToday),
    transition: () => recordCheckpoint(request.engineState, request.performance, request.deviceToday),
    // The decision is read from the state the engine just produced, so the event keeps the engine's
    // own verdict verbatim rather than a summary written here.
    event: (next) => ({
      type: 'CHECKPOINT_RECORDED',
      at: request.at,
      result: {timeSeconds: request.performance.timeSeconds, date: request.performance.date, source: request.performance.source},
      previousPerformance,
      decisionAfter: assessmentSnapshotOf(next.decision),
    }),
  });

  if (!outcome.ok) return outcome;
  return {
    ok: true,
    done: {
      appState: outcome.done.appState,
      engineState: outcome.done.engineState,
      previousPerformance,
      changes: outcome.done.changes,
    },
  };
}
