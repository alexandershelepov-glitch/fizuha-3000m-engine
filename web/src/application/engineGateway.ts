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
  finalRaceWorkout,
  isV4Candidate,
  taperStartDate,
  EngineError,
  PERFORMANCE_SOURCES,
  createEngine,
  deserialize,
  forecastCycle as engineForecastCycle,
  moveWorkout as engineMoveWorkout,
  recordCheckpoint as engineRecordCheckpoint,
  recordFinalResult as engineRecordFinalResult,
  updateTrainingData as engineUpdateTrainingData,
  recordResult as engineRecordResult,
  replan,
  resolveDiagnostic as engineResolveDiagnostic,
  serialize,
  skipWorkout as engineSkipWorkout,
  taperDays,
  validateProfile,
} from '../../../src/index.ts';
import {ApplicationError} from './appError.ts';
import type {AppErrorCode} from './appError.ts';
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
  ForecastEntry,
  ForecastEntryStatus,
  ForecastEvent,
  ForecastMode,
  ForecastOptions,
  ForecastResult,
  ForecastWindowViolation,
  Gate,
  HistoryEntry,
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

export {EngineError, PERFORMANCE_SOURCES, finalRaceWorkout, taperStartDate, isV4Candidate};

/** A safe, mechanical view of a thrown value. */
export interface EngineErrorView {
  code: EngineErrorCode | AppErrorCode | 'UNKNOWN';
  params: {min?: number; max?: number; value?: number};
  /** False when the value was not raised by the engine at all. */
  fromEngine: boolean;
}
export type {
  Anchor, BreakReason, Capacity, ClassifiedResult, Confidence, Decision, Dose, DoseUnit, EffortCue,
  EngineErrorCode, EngineState, Evaluation, Feasibility, FeedbackField, Gate, HistoryEntry, PerformanceMismatch, PerformanceSnapshot,
  PerformanceSource, Phase, Profile, QualityExperience, ReasonCode, SafetyData, SafetyStatus, Workout,
  WorkoutGoal, WorkoutMainMode, WorkoutResult, WorkoutType, YellowReason,
  ForecastEntry, ForecastEntryStatus, ForecastEvent, ForecastMode, ForecastOptions, ForecastResult,
  ForecastWindowViolation,
};

/** Create the engine state for a new cycle. The engine decides everything sport-related. */
export function createEngineState(profile: Profile, deviceToday: string, startDate = deviceToday): EngineState {
  return createEngine(profile, deviceToday, startDate);
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

/**
 * Record a completed session. The engine classifies it and rebuilds the queue; the application never
 * derives an evaluation, never edits the queue and never creates a workout.
 */
export function recordWorkoutResult(state: EngineState, workoutId: string, result: WorkoutResult): EngineState {
  return engineRecordResult(state, workoutId, result);
}

/**
 * Skip a scheduled session. The clock is deliberately left where the state already is: the engine
 * writes off every past-due session when it is asked to advance to `now`, and an explicit decision
 * about one session must never resolve the others (INV-1).
 */
export function skipWorkout(state: EngineState, workoutId: string, now: string): EngineState {
  return engineSkipWorkout(state, workoutId, now);
}

/** Move a session to another date. The engine owns horizon, occupancy, recovery and quality rules. */
export function moveWorkout(state: EngineState, workoutId: string, date: string): EngineState {
  return engineMoveWorkout(state, workoutId, date);
}

/**
 * Record a new 3000 m assessment. The engine overwrites Current Performance and rebuilds the plan.
 */
export function recordCheckpoint(state: EngineState, performance: PerformanceSnapshot, now: string): EngineState {
  return engineRecordCheckpoint(state, performance, now);
}

/** Dedicated capability-only transition; it never records a race time. Caller must verify an explicit
 * attestation and a current safe state before delegating to the engine. */
export function confirmContinuousThreeKm(state: EngineState, now: string): EngineState {
  return engineUpdateTrainingData(state, {canRun3Km: true}, now);
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
  if (value instanceof ApplicationError) return {code: value.code, params: {}, fromEngine: false};
  return {code: 'UNKNOWN', params: {}, fromEngine: false};
}

/** Public delegates; only the corresponding application operations may call these. */
export function updateTrainingData(state: EngineState, data: {targetTimeSeconds?: number; raceDate?: string}, now: string): EngineState {
  return engineUpdateTrainingData(state, data, now);
}
export function recordFinalResult(state: EngineState, performance: PerformanceSnapshot, now: string): EngineState {
  return engineRecordFinalResult(state, performance, now);
}

/** Only the engine decides when diagnostic restrictions can be lifted. */
export function resolveCurrentSafety(state: EngineState, safety: SafetyData, now: string): EngineState {
  return engineResolveDiagnostic(state, safety, now);
}
/** Non-persisted preview of the real engine verdict. */
export function previewGoalDecision(profile: Profile, today: string): Decision {
  return createEngineState(profile, today).decision;
}

/**
 * Full-cycle forecast to the race date (issue #51). Pure read-only projection: the input state is
 * never advanced or mutated, nothing is persisted, and the engine remains the only planner. The
 * application refreshes this whenever the confirmed engine state changes; the UI never calls the
 * engine directly and never writes forecast entries back.
 */
export function forecastCycle(state: EngineState, options: ForecastOptions): ForecastResult {
  return engineForecastCycle(state, options);
}
