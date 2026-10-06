/**
 * Engine value types used by the copy layer. They are re-exported through the application gateway,
 * which is the only module allowed to touch the engine directly.
 */
export type {
  Anchor, BreakReason, Capacity, Confidence, DoseUnit, EffortCue, Evaluation, Feasibility, FeedbackField, Gate,
  PerformanceMismatch, PerformanceSource, Phase, QualityExperience, ReasonCode, SafetyStatus,
  WorkoutGoal, WorkoutMainMode, WorkoutType, YellowReason,
} from '../../application/engineGateway.ts';
