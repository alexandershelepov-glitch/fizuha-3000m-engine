/**
 * Human-readable diff of two engine states.
 *
 * This is a comparison of observable facts only: it never derives a reason, never touches internal
 * coefficients and never predicts anything. When the engine gives a reason code, the UI shows it;
 * otherwise the UI states the fact of the change and nothing more (docs/ui-copy.md §3).
 */
import type {DoseUnit, EngineState, Feasibility, Gate, Phase, SafetyStatus, Workout, WorkoutMainMode, WorkoutType} from './engineGateway.ts';

/** The parts of a prescription the product diff compares, kept free of any formatting. */
export interface WorkoutSummary {
  readonly id: string;
  readonly date: string;
  readonly type: WorkoutType;
  readonly mode: WorkoutMainMode;
  readonly doseValue: number;
  readonly doseUnit: DoseUnit;
  readonly repeats: number;
  readonly repeatMeters: number | null;
  readonly finalRepeatMeters: number | null;
  readonly paceRangeSecondsPerKm: readonly [number, number] | null;
}

export type PlanChange =
  | {kind: 'WORKOUT_RECORDED'; workoutId: string}
  | {kind: 'NEXT_WORKOUT_CHANGED'; from: WorkoutSummary | null; to: WorkoutSummary | null}
  | {kind: 'NEXT_WORKOUT_TYPE_CHANGED'; from: WorkoutType; to: WorkoutType}
  | {kind: 'NEXT_WORKOUT_DATE_CHANGED'; from: string; to: string}
  | {kind: 'NEXT_WORKOUT_VOLUME_CHANGED'; from: WorkoutSummary; to: WorkoutSummary}
  | {kind: 'NEXT_WORKOUT_PACE_CHANGED'; from: readonly [number, number] | null; to: readonly [number, number] | null}
  | {kind: 'CONTROL_SCHEDULED'; workout: WorkoutSummary}
  | {kind: 'PHASE_CHANGED'; from: Phase; to: Phase}
  | {kind: 'GATE_CHANGED'; from: Gate; to: Gate}
  | {kind: 'FEASIBILITY_CHANGED'; from: Feasibility | null; to: Feasibility | null}
  | {kind: 'SAFETY_CHANGED'; from: SafetyStatus; to: SafetyStatus}
  | {kind: 'CHECKPOINT_REQUIRED'}
  | {kind: 'QUEUE_BECAME_EMPTY'};

export function summariseWorkout(workout: Workout): WorkoutSummary {
  return {
    id: workout.id,
    date: workout.scheduledDate,
    type: workout.type,
    mode: workout.main.mode,
    doseValue: workout.main.dose.value,
    doseUnit: workout.main.dose.unit,
    repeats: workout.main.repeats,
    repeatMeters: workout.main.repeatMeters,
    finalRepeatMeters: workout.main.finalRepeatMeters,
    paceRangeSecondsPerKm: workout.paceRangeSecondsPerKm === null ? null : [workout.paceRangeSecondsPerKm[0], workout.paceRangeSecondsPerKm[1]],
  };
}

/** The next session the engine actually has, read exactly like the Today screen reads it. */
export function nextWorkout(engineState: EngineState, today: string): Workout | null {
  return engineState.queue.find((workout) => workout.scheduledDate >= today) ?? null;
}

function sameVolume(a: WorkoutSummary, b: WorkoutSummary): boolean {
  return a.doseValue === b.doseValue && a.doseUnit === b.doseUnit && a.repeats === b.repeats
    && a.repeatMeters === b.repeatMeters && a.finalRepeatMeters === b.finalRepeatMeters;
}

function samePace(a: readonly [number, number] | null, b: readonly [number, number] | null): boolean {
  if (a === null || b === null) return a === b;
  return a[0] === b[0] && a[1] === b[1];
}

function sameSummary(a: WorkoutSummary, b: WorkoutSummary): boolean {
  return a.type === b.type && a.date === b.date && a.mode === b.mode && sameVolume(a, b) && samePace(a.paceRangeSecondsPerKm, b.paceRangeSecondsPerKm);
}

/** Every change is a fact observed between the two states, in a stable order. */
export function diffPlan(before: EngineState, after: EngineState, today: string): PlanChange[] {
  const changes: PlanChange[] = [];
  const decisionBefore = before.decision;
  const decisionAfter = after.decision;

  if (decisionBefore.phase !== decisionAfter.phase) changes.push({kind: 'PHASE_CHANGED', from: decisionBefore.phase, to: decisionAfter.phase});
  if (decisionBefore.gate !== decisionAfter.gate) changes.push({kind: 'GATE_CHANGED', from: decisionBefore.gate, to: decisionAfter.gate});
  if (decisionBefore.feasibility !== decisionAfter.feasibility) changes.push({kind: 'FEASIBILITY_CHANGED', from: decisionBefore.feasibility, to: decisionAfter.feasibility});
  if (decisionBefore.safety !== decisionAfter.safety) changes.push({kind: 'SAFETY_CHANGED', from: decisionBefore.safety, to: decisionAfter.safety});
  if (!before.checkpointRequired && after.checkpointRequired) changes.push({kind: 'CHECKPOINT_REQUIRED'});

  const nextBefore = nextWorkout(before, today);
  const nextAfter = nextWorkout(after, today);
  const summaryBefore = nextBefore === null ? null : summariseWorkout(nextBefore);
  const summaryAfter = nextAfter === null ? null : summariseWorkout(nextAfter);

  if (summaryBefore === null && summaryAfter !== null) {
    changes.push({kind: 'NEXT_WORKOUT_CHANGED', from: null, to: summaryAfter});
  } else if (summaryBefore !== null && summaryAfter === null) {
    changes.push({kind: 'NEXT_WORKOUT_CHANGED', from: summaryBefore, to: null});
  } else if (summaryBefore !== null && summaryAfter !== null && !sameSummary(summaryBefore, summaryAfter)) {
    changes.push({kind: 'NEXT_WORKOUT_CHANGED', from: summaryBefore, to: summaryAfter});
    if (summaryBefore.type !== summaryAfter.type) changes.push({kind: 'NEXT_WORKOUT_TYPE_CHANGED', from: summaryBefore.type, to: summaryAfter.type});
    if (summaryBefore.date !== summaryAfter.date) changes.push({kind: 'NEXT_WORKOUT_DATE_CHANGED', from: summaryBefore.date, to: summaryAfter.date});
    if (!sameVolume(summaryBefore, summaryAfter)) changes.push({kind: 'NEXT_WORKOUT_VOLUME_CHANGED', from: summaryBefore, to: summaryAfter});
    if (!samePace(summaryBefore.paceRangeSecondsPerKm, summaryAfter.paceRangeSecondsPerKm)) {
      changes.push({kind: 'NEXT_WORKOUT_PACE_CHANGED', from: summaryBefore.paceRangeSecondsPerKm, to: summaryAfter.paceRangeSecondsPerKm});
    }
  }

  const controlBefore = before.queue.some((workout) => workout.type === 'CONTROL');
  const control = after.queue.find((workout) => workout.type === 'CONTROL');
  if (!controlBefore && control !== undefined) changes.push({kind: 'CONTROL_SCHEDULED', workout: summariseWorkout(control)});

  if (before.queue.length > 0 && after.queue.length === 0) changes.push({kind: 'QUEUE_BECAME_EMPTY'});

  return changes;
}
