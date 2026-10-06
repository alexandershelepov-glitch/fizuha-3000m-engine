export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type Capacity = 'T0' | 'T1' | 'T2' | 'T3';
export type QualityExperience = 'Q0' | 'Q1' | 'Q2';
export type Phase = 'FOUNDATION' | 'DEVELOPMENT' | 'SPECIFIC' | 'RE_ENTRY' | 'HOLD_DIAGNOSTIC' | 'TAPER';
export type SafetyStatus = 'OK' | 'HOLD' | 'STOP';
export type Feasibility = 'PLAUSIBLE' | 'AMBITIOUS' | 'LOW_PROBABILITY' | 'LONG_TERM';
export type Gate = 'CLOSED' | 'PARTIAL' | 'OPEN';
export type WorkoutType = 'EASY' | 'LONG_EASY' | 'STRIDES' | 'INTRO_QUALITY' | 'THRESHOLD' | 'VO2' | 'SPECIFIC_3K' | 'CONTROL' | 'REST';
export type Evaluation = 'GREEN_PLUS' | 'GREEN' | 'YELLOW' | 'RED';
export type YellowReason = 'EXECUTION' | 'RECOVERY' | 'ENVIRONMENT' | 'ILLNESS' | 'PAIN' | 'PACE_PRESCRIPTION' | 'OTHER';
export type ReasonCode = 'GOAL_GAP_TOO_LARGE' | 'TARGET_GATE_CLOSED' | 'LOW_QUALITY_EXPERIENCE' | 'REENTRY_AFTER_BREAK' | 'SECOND_QUALITY_NOT_ALLOWED' | 'TWO_RELATED_YELLOW' | 'CHECKPOINT_AFTER_GREEN_PLUS' | 'SAFETY_STOP' | 'SAFETY_HOLD' | 'TAPER_STARTED' | 'PERFORMANCE_CONFIDENCE_LOW' | 'FOUNDATION_NO_3K_RESULT' | 'CHECKPOINT_DUE' | 'CHECKPOINT_AFTER_REENTRY' | 'CONTRADICTORY_PERFORMANCE' | 'PROGRESSION_ALLOWED' | 'PROGRESSION_BLOCKED' | 'HEALTH_REVIEW_REQUIRED' | 'FOUNDATION_LONG_TERM_CONFLICT';
export interface SafetyData {
  pain: number; painIncreasing: boolean; alteredMovement: boolean; painWalkingOrRest: boolean;
  swelling: boolean; acuteIllness: boolean; otherStop: boolean; needsAssessment: boolean;
}
export interface PerformanceSnapshot { timeSeconds: number; date: string; source: 'TEST_3K' | 'OFFICIAL_3K' }
export interface TrainingBreak { days: number; endDate: string; reason: 'WORK' | 'OTHER_HEALTHY' | 'ILLNESS' | 'INJURY' }
export interface Profile {
  performance: PerformanceSnapshot | null; targetTimeSeconds: number; raceDate: string;
  regularRunningWeeks: number; actualRunsPerWeek: number; availableRunsPerWeek: number;
  averageWeeklyKm4Weeks: number; longestUsualRunKm: number; canRun3Km: boolean;
  qualitySessions8Weeks: number; qualityWeeks8Weeks: number; qualityMostlyTolerated: boolean;
  experience: { threshold: boolean; vo2: boolean; specific3k: boolean };
  breaks: TrainingBreak[]; safety: SafetyData; performanceMismatch: 'NONE' | 'MODERATE' | 'CLEAR';
}
export interface Dose { unit: 'MINUTES' | 'METERS'; value: number }
export interface Workout {
  id: string; scheduledDate: string; type: WorkoutType; goal: string; priority: number;
  countsAsQuality: boolean; warmupMinutes: number; cooldownMinutes: number;
  main: { mode: 'CONTINUOUS' | 'INTERVALS' | 'RUN_WALK' | 'REST'; dose: Dose; repeats: number; repeatMeters: number | null; finalRepeatMeters: number | null };
  targetRpe: [number, number]; effortCues: string[]; speedRangeMps: [number, number] | null; paceRangeSecondsPerKm: [number, number] | null;
  anchor: 'CURRENT' | 'EFFECTIVE' | 'EFFORT' | 'NONE'; gateAtPrescription: Gate;
  restSeconds: number; minimumRecoveryHoursBeforeQuality: number;
  requiredFeedback: string[]; removable: boolean; movable: boolean; volumeFactor: number;
}
export interface WorkoutResult {
  date: string; completionFraction: number; sessionRpe: number; safety: SafetyData;
  durationMinutes: number; distanceMeters: number; repeats: { distanceMeters: number; seconds: number }[];
  restSeconds: number[]; yellowReason?: YellowReason; conditions: { heat?: boolean; wind?: boolean; surface?: string; notes?: string };
  unexpectedFatigue: boolean;
}
export interface ClassifiedResult { evaluation: Evaluation; yellowReason: YellowReason | null; sessionLoad: number; inRangeFraction: number; speedDropFraction: number }
export interface HistoryEntry { workout: Workout; result: WorkoutResult; classified: ClassifiedResult }
export interface Decision {
  confidence: Confidence; capacity: Capacity; quality: QualityExperience; phase: Phase; safety: SafetyStatus;
  goalGap: number | null; feasibility: Feasibility | null; gate: Gate; currentSpeedMps: number | null;
  effectiveSpeedMps: number | null; maximumQualityPerWeek: number; reasons: ReasonCode[];
}
export interface EngineState {
  version: 1; profile: Profile; cycleStartDate: string; asOf: string; decision: Decision;
  queue: Workout[]; history: HistoryEntry[]; skippedIds: string[]; skippedWorkouts: Workout[]; movedWorkouts: Workout[];
  successfulQuality: number; successfulIntro: number; successfulSpecificPartial: number;
  greenPlusIds: string[]; checkpointRequired: boolean; lastAssessmentDate: string;
  relatedYellow: boolean; reducedQualityUntilConfirmed: boolean; diagnosticHold: boolean; progressionBlocked: boolean;
  doses: Partial<Record<WorkoutType, Dose>>; confirmedDoses: Partial<Record<WorkoutType, Dose>>;
  successStreak: Partial<Record<WorkoutType, number>>; qualityRotation: number;
  reentry: { breakDays: number; easyRemaining: number; easyReductionPending: boolean; easyFactor: number; qualityFactor: number; diagnosticRequired: boolean } | null;
  /**
   * Terminal marker, not a training phase: the result of the final 3000 m race has been recorded
   * and the cycle is closed. No plan exists after the event date, so this only unlocks loading a
   * state whose clock has passed `raceDate`.
   */
  finalResultRecorded: boolean;
}
