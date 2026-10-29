/**
 * Public value contract for the PWA.
 *
 * Every finite set of values that an external client must translate or handle exhaustively is
 * declared here as a frozen runtime catalog, and the corresponding TypeScript union is *derived*
 * from that catalog. A runtime list and a type therefore cannot drift apart: adding a value to a
 * catalog widens the union automatically, which makes an exhaustive UI mapping such as
 * `const labels = {...} satisfies Record<Phase, string>` fail to compile until the new value is
 * handled. That is the guarantee the UI contract relies on (UI-GAP-08).
 *
 * The catalogs are frozen so a consumer cannot mutate the shared contract, and the engine never
 * reads them for sport decisions: they describe values, they do not decide anything.
 */

// ---------------------------------------------------------------- assessment values
export const CONFIDENCES = Object.freeze(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const);
export type Confidence = (typeof CONFIDENCES)[number];

export const CAPACITIES = Object.freeze(['T0', 'T1', 'T2', 'T3'] as const);
export type Capacity = (typeof CAPACITIES)[number];

export const QUALITY_LEVELS = Object.freeze(['Q0', 'Q1', 'Q2'] as const);
export type QualityExperience = (typeof QUALITY_LEVELS)[number];

export const PHASES = Object.freeze(['FOUNDATION', 'DEVELOPMENT', 'SPECIFIC', 'RE_ENTRY', 'HOLD_DIAGNOSTIC', 'TAPER'] as const);
export type Phase = (typeof PHASES)[number];

export const SAFETY_STATUSES = Object.freeze(['OK', 'HOLD', 'STOP'] as const);
export type SafetyStatus = (typeof SAFETY_STATUSES)[number];

export const FEASIBILITIES = Object.freeze(['PLAUSIBLE', 'AMBITIOUS', 'LOW_PROBABILITY', 'LONG_TERM'] as const);
export type Feasibility = (typeof FEASIBILITIES)[number];

export const GATES = Object.freeze(['CLOSED', 'PARTIAL', 'OPEN'] as const);
export type Gate = (typeof GATES)[number];

// ---------------------------------------------------------------- workout values
export const WORKOUT_TYPES = Object.freeze(['EASY', 'LONG_EASY', 'STRIDES', 'INTRO_QUALITY', 'THRESHOLD', 'VO2', 'SPECIFIC_3K', 'CONTROL', 'REST'] as const);
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

/** Purpose code attached to a prescribed workout by the engine. */
export const WORKOUT_GOALS = Object.freeze(['AEROBIC_BASE', 'QUALITY_ADAPTATION', 'ASSESS_CURRENT_PERFORMANCE', 'RECOVERY'] as const);
export type WorkoutGoal = (typeof WORKOUT_GOALS)[number];

export const MAIN_MODES = Object.freeze(['CONTINUOUS', 'INTERVALS', 'RUN_WALK', 'REST'] as const);
export type WorkoutMainMode = (typeof MAIN_MODES)[number];

export const DOSE_UNITS = Object.freeze(['MINUTES', 'METERS'] as const);
export type DoseUnit = (typeof DOSE_UNITS)[number];

export const EFFORT_CUES = Object.freeze(['FULL_SENTENCES', 'CONTROLLED_BREATHING'] as const);
export type EffortCue = (typeof EFFORT_CUES)[number];

export const ANCHORS = Object.freeze(['CURRENT', 'EFFECTIVE', 'EFFORT', 'NONE'] as const);
export type Anchor = (typeof ANCHORS)[number];

/** Fields the engine expects back after a workout; the MVP result form is built from exactly these. */
export const FEEDBACK_FIELDS = Object.freeze(['completionFraction', 'sessionRpe', 'safety', 'durationMinutes', 'distanceMeters', 'repeats', 'restSeconds', 'conditions', 'unexpectedFatigue'] as const);
export type FeedbackField = (typeof FEEDBACK_FIELDS)[number];

// ---------------------------------------------------------------- result values
export const EVALUATIONS = Object.freeze(['GREEN_PLUS', 'GREEN', 'YELLOW', 'RED'] as const);
export type Evaluation = (typeof EVALUATIONS)[number];

export const YELLOW_REASONS = Object.freeze(['EXECUTION', 'RECOVERY', 'ENVIRONMENT', 'ILLNESS', 'PAIN', 'PACE_PRESCRIPTION', 'OTHER'] as const);
export type YellowReason = (typeof YELLOW_REASONS)[number];

/** Machine-readable explanations attached to a decision; the UI translates them statically. */
export const REASON_CODES = Object.freeze(['GOAL_GAP_TOO_LARGE', 'TARGET_GATE_CLOSED', 'LOW_QUALITY_EXPERIENCE', 'REENTRY_AFTER_BREAK', 'SECOND_QUALITY_NOT_ALLOWED', 'TWO_RELATED_YELLOW', 'CHECKPOINT_AFTER_GREEN_PLUS', 'SAFETY_STOP', 'SAFETY_HOLD', 'TAPER_STARTED', 'PERFORMANCE_CONFIDENCE_LOW', 'FOUNDATION_NO_3K_RESULT', 'CHECKPOINT_DUE', 'CHECKPOINT_AFTER_REENTRY', 'CONTRADICTORY_PERFORMANCE', 'PROGRESSION_ALLOWED', 'PROGRESSION_BLOCKED', 'HEALTH_REVIEW_REQUIRED', 'FOUNDATION_LONG_TERM_CONFLICT'] as const);
export type ReasonCode = (typeof REASON_CODES)[number];

// ---------------------------------------------------------------- profile input values
export const PERFORMANCE_SOURCES = Object.freeze(['TEST_3K', 'OFFICIAL_3K'] as const);
export type PerformanceSource = (typeof PERFORMANCE_SOURCES)[number];

export const BREAK_REASONS = Object.freeze(['WORK', 'OTHER_HEALTHY', 'ILLNESS', 'INJURY'] as const);
export type BreakReason = (typeof BREAK_REASONS)[number];

export const PERFORMANCE_MISMATCH_LEVELS = Object.freeze(['NONE', 'MODERATE', 'CLEAR'] as const);
export type PerformanceMismatch = (typeof PERFORMANCE_MISMATCH_LEVELS)[number];

// ---------------------------------------------------------------- shapes
export interface SafetyData {
  pain: number; painIncreasing: boolean; alteredMovement: boolean; painWalkingOrRest: boolean;
  swelling: boolean; acuteIllness: boolean; otherStop: boolean; needsAssessment: boolean;
}
export interface PerformanceSnapshot { timeSeconds: number; date: string; source: PerformanceSource }
export interface TrainingBreak { days: number; endDate: string; reason: BreakReason }
export interface Profile {
  performance: PerformanceSnapshot | null; targetTimeSeconds: number; raceDate: string;
  regularRunningWeeks: number; actualRunsPerWeek: number; availableRunsPerWeek: number;
  averageWeeklyKm4Weeks: number; longestUsualRunKm: number; canRun3Km: boolean;
  qualitySessions8Weeks: number; qualityWeeks8Weeks: number; qualityMostlyTolerated: boolean;
  experience: { threshold: boolean; vo2: boolean; specific3k: boolean };
  breaks: TrainingBreak[]; safety: SafetyData; performanceMismatch: PerformanceMismatch;
}
export interface Dose { unit: DoseUnit; value: number }
/** Optional additive distance protocol; absent in legacy v1 prescriptions. */
export interface WorkoutProtocol {
  methodology: 'V4_8W_1430'; week: number; role: 'QUALITY'|'EASY'|'LONG'|'FINAL';
  intensity: 'E'|'T'|'I'|'R'|'CONTROL'; easyPaceSecondsPerKm: [number,number];
  warmupMeters: number; dynamicMinutes: [number,number]|null; cooldownMeters: number;
  recovery: {dose: {unit:'METERS'|'SECONDS'; value:number}; mode:'JOG'|'JOG_OR_WALK_UNTIL_RECOVERED'; betweenOnly:true}|null;
  strides: {repeats:number; seconds:number|null; meters:number|null; insideDistance:boolean; minimumRecoverySeconds:number|null; fullRecovery:boolean}|null;
  repeatSeconds: number|null; firstLastKmEasy:boolean;
  stage:'BUILD'|'DELOAD'|'PEAK'|'TAPER';
}
export interface Workout {
  protocol?: WorkoutProtocol;
  id: string; scheduledDate: string; type: WorkoutType; goal: WorkoutGoal; priority: number;
  countsAsQuality: boolean; warmupMinutes: number; cooldownMinutes: number;
  main: { mode: WorkoutMainMode; dose: Dose; repeats: number; repeatMeters: number | null; finalRepeatMeters: number | null;
    /** Engine-approved alternating steps for RUN_WALK; older saved workouts may omit it. */
    runWalk?: {stage: number; runSeconds: number; walkSeconds: number};
    /** Numeric EASY pace cannot be inferred yet: execute the short measured calibration task. */
    calibration?: boolean };
  targetRpe: [number, number]; effortCues: EffortCue[]; speedRangeMps: [number, number] | null; paceRangeSecondsPerKm: [number, number] | null;
  anchor: Anchor; gateAtPrescription: Gate;
  restSeconds: number; minimumRecoveryHoursBeforeQuality: number;
  requiredFeedback: FeedbackField[]; removable: boolean; movable: boolean; volumeFactor: number;
}
export interface WorkoutResult {
  date: string; completionFraction: number; sessionRpe: number; safety: SafetyData;
  durationMinutes: number; distanceMeters: number; repeats: { distanceMeters: number; seconds: number }[];
  restSeconds: number[]; yellowReason?: YellowReason; conditions: { heat?: boolean; wind?: boolean; surface?: string; notes?: string };
  unexpectedFatigue: boolean;
  /** True only when the user actively confirmed completion and perceived effort, not defaults. */
  feedbackConfirmed?: boolean;
}
export interface ClassifiedResult { evaluation: Evaluation; yellowReason: YellowReason | null; sessionLoad: number; inRangeFraction: number; speedDropFraction: number }
export interface HistoryEntry { workout: Workout; result: WorkoutResult; classified: ClassifiedResult }
export interface Decision {
  confidence: Confidence; capacity: Capacity; quality: QualityExperience; phase: Phase; safety: SafetyStatus;
  goalGap: number | null; feasibility: Feasibility | null; gate: Gate; currentSpeedMps: number | null;
  effectiveSpeedMps: number | null; maximumQualityPerWeek: number; reasons: ReasonCode[];
}
export interface EngineState {
  methodology?: {id:'V4_8W_1430'; performanceDate:string; raceDate:string};
  version: 1; profile: Profile; cycleStartDate: string; asOf: string; decision: Decision;
  queue: Workout[]; history: HistoryEntry[]; skippedIds: string[]; skippedWorkouts: Workout[]; movedWorkouts: Workout[];
  successfulQuality: number; successfulIntro: number; successfulSpecificPartial: number;
  greenPlusIds: string[]; checkpointRequired: boolean; lastAssessmentDate: string;
  relatedYellow: boolean; reducedQualityUntilConfirmed: boolean; diagnosticHold: boolean; progressionBlocked: boolean;
  /** Healthy non-medical repeat YELLOW: require one confirmed easy before quality can return. */
  yellowEasyRequired?: boolean;
  /** Existing re-entry coefficient carried through the required easy confirmation. */
  pendingQualityFactor?: number | null;
  doses: Partial<Record<WorkoutType, Dose>>; confirmedDoses: Partial<Record<WorkoutType, Dose>>;
  successStreak: Partial<Record<WorkoutType, number>>; qualityRotation: number;
  reentry: { breakDays: number; easyRemaining: number; easyReductionPending: boolean; easyFactor: number; qualityFactor: number; diagnosticRequired: boolean } | null;
  /**
   * Terminal marker, not a training phase: the result of the final 3000 m race has been recorded
   * and the cycle is closed. No plan exists after the event date, so this only unlocks loading a
   * state whose clock has passed `raceDate`.
   */
  finalResultRecorded: boolean;
  /** Additive v1 extension: older serialized cycles without this field remain loadable. */
  easyProgression?: { approvedMetersPer7Days: number; lastReviewedBlock: number; lastIncreaseDate: string | null };
  /** Additive v1 extension. Missing on legacy saves: initialize at beginner stage, no retroactive credit. */
  runWalkProgression?: {stage: number};
}
