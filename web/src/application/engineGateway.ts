/**
 * The single gateway between the PWA and the sport engine (INV-2).
 *
 * This is the only module in the frontend allowed to import the engine. Everything above it
 * (application services, UI) talks to the engine through these functions and the types re-exported
 * here, so the boundary is explicit and machine-checkable (see tests/app-boundary.test.ts).
 *
 * Nothing here makes a sport decision: it validates, delegates and translates. The engine remains
 * the only planner.
 */
import {
  EngineError,
  createEngine,
  deserialize,
  replan,
  serialize,
  taperDays,
  validateProfile,
} from '../../../src/index.ts';
import type {
  Anchor,
  BreakReason,
  Capacity,
  ClassifiedResult,
  Confidence,
  Decision,
  Dose,
  DoseUnit,
  EffortCue,
  EngineErrorCode,
  EngineState,
  Evaluation,
  Feasibility,
  FeedbackField,
  Gate,
  PerformanceMismatch,
  PerformanceSnapshot,
  PerformanceSource,
  Phase,
  Profile,
  QualityExperience,
  ReasonCode,
  SafetyData,
  SafetyStatus,
  Workout,
  WorkoutGoal,
  WorkoutMainMode,
  WorkoutResult,
  WorkoutType,
  YellowReason,
} from '../../../src/index.ts';

export {EngineError};

/** A safe, mechanical view of a thrown value. */
export interface EngineErrorView {
  code: EngineErrorCode | 'UNKNOWN';
  params: {min?: number; max?: number; value?: number};
  /** False when the value was not raised by the engine at all. */
  fromEngine: boolean;
}
export type {
  Anchor, BreakReason, Capacity, ClassifiedResult, Confidence, Decision, Dose, DoseUnit, EffortCue,
  EngineErrorCode, EngineState, Evaluation, Feasibility, FeedbackField, Gate, PerformanceMismatch, PerformanceSnapshot,
  PerformanceSource, Phase, Profile, QualityExperience, ReasonCode, SafetyData, SafetyStatus, Workout,
  WorkoutGoal, WorkoutMainMode, WorkoutResult, WorkoutType, YellowReason,
};

/** Create the engine state for a new cycle. The engine decides everything sport-related. */
export function createEngineState(profile: Profile, deviceToday: string): EngineState {
  return createEngine(profile, deviceToday);
}

/** Validation of a profile through the public API, including the event-date rule. */
export function checkProfile(profile: Profile, deviceToday: string): void {
  validateProfile(profile, deviceToday);
}

/**
 * Length of the taper block before the race, as computed by the engine. A reader, not a rule:
 * the application never derives taper length itself.
 */
export function taperDaysFor(capacity: Capacity, quality: QualityExperience): number {
  return taperDays(capacity, quality);
}

/** Rebuild the plan for the same or a later date. The engine decides the new queue. */
export function replanTo(state: EngineState, deviceToday: string): EngineState {
  return replan(state, deviceToday);
}

/** Opaque persistence of the engine state: exactly `serialize()`, never edited by hand. */
export function serializeEngineState(state: EngineState): string {
  return serialize(state);
}

/** The official reader for a stored engine state. */
export function deserializeEngineState(raw: string): EngineState {
  return deserialize(raw);
}

/** Mirror of the engine state version, kept in the envelope for a cheap compatibility check. */
export function engineStateVersion(state: EngineState): number {
  return state.version;
}

/** True when the value is an error raised by the engine. */
export function isEngineError(value: unknown): value is EngineError {
  return value instanceof EngineError;
}

/**
 * The mechanical part of error handling: extract the stable code and its structured parameters.
 * Deliberately contains no prose and no policy — user-facing text lives in the UI copy layer, the
 * retry policy lives in the application error contract, and `message` is never inspected.
 */
export function viewEngineError(value: unknown): EngineErrorView {
  if (isEngineError(value)) return {code: value.code, params: value.details, fromEngine: true};
  return {code: 'UNKNOWN', params: {}, fromEngine: false};
}
