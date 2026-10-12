/**
 * The application envelope (docs/pwa-architecture.md §4).
 *
 * It stores only what the engine does not keep: identity, immutable baseline snapshots, the opaque
 * serialized engine state and an append-only event log. Anything derivable from the engine state is
 * deliberately not stored — a second source of truth is forbidden (INV-3).
 */
import type {Decision, PerformanceSnapshot} from './engineGateway.ts';

/** Version of the application envelope. Present from the first version (UI-GAP-09). */
export const APP_FORMAT_VERSION = 1;

/** Immutable copy of the engine's verdict at the moment the cycle was created. */
export interface AssessmentSnapshot {
  readonly capacity: string;
  readonly quality: string;
  readonly confidence: string;
  readonly feasibility: string | null;
  readonly gate: string;
  readonly phase: string;
  readonly reasons: readonly string[];
}

/** Immutable snapshots of the inputs, because the engine overwrites them later. */
export interface CycleBaseline {
  readonly performance: PerformanceSnapshot | null;
  readonly targetTimeSeconds: number;
  readonly raceDate: string;
  readonly assessment: AssessmentSnapshot;
}

/** Append-only log of what the engine state cannot reconstruct (docs/pwa-architecture.md §5). */
export type CycleEvent =
  | {type: 'CYCLE_CREATED'; at: string; cycleId: string}
  | {type: 'WORKOUT_SKIPPED'; at: string; workoutId: string; scheduledDate: string; workoutType: string; cause: 'VOLUNTARY' | 'PAST_DUE'}
  | {type: 'WORKOUT_MOVED'; at: string; workoutId: string; fromDate: string; toDate: string}
  | {type: 'CHECKPOINT_RECORDED'; at: string; result: {timeSeconds: number; date: string; source: string}; previousPerformance: number | null; decisionAfter: AssessmentSnapshot}
  | {type: 'TRAINING_PARAMETERS_CHANGED'; at: string; from: Record<string, unknown>; to: Record<string, unknown>}
  | {type: 'SAFETY_REASSESSED'; at: string; safety: import('./engineGateway.ts').SafetyData; decisionAfter: AssessmentSnapshot}
  | {type: 'FINAL_RESULT_RECORDED'; at: string; result: {timeSeconds: number; date: string; source: string}};

export interface AppStateV1 {
  readonly formatVersion: typeof APP_FORMAT_VERSION;
  readonly cycle: {
    readonly cycleId: string;
    readonly createdAt: string;
    readonly engineStateVersion: number;
    /** Exactly `serialize(engineState)`. Opaque: never parsed or edited outside the gateway. */
    readonly engineState: string;
    readonly baseline: CycleBaseline;
  };
  readonly events: CycleEvent[];
  readonly ui: {readonly units: 'METRIC'; readonly locale: string};
}

export function assessmentSnapshotOf(decision: Decision): AssessmentSnapshot {
  return {
    capacity: decision.capacity,
    quality: decision.quality,
    confidence: decision.confidence,
    feasibility: decision.feasibility,
    gate: decision.gate,
    phase: decision.phase,
    reasons: [...decision.reasons],
  };
}

export type AppStateParseResult =
  | {ok: true; state: AppStateV1}
  | {ok: false; reason: 'MALFORMED'}
  | {ok: false; reason: 'UNSUPPORTED_FORMAT_VERSION'; formatVersion: number};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function parsePerformance(value: unknown): PerformanceSnapshot | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const {timeSeconds, date, source} = value;
  if (typeof timeSeconds !== 'number' || !isNonEmptyString(date)) return undefined;
  if (source !== 'TEST_3K' && source !== 'OFFICIAL_3K') return undefined;
  return {timeSeconds, date, source};
}

/**
 * Strict structural check. A damaged envelope is reported, never repaired: the application must be
 * able to show an explicit load error instead of guessing (docs/pwa-architecture.md §8.2).
 */
export function parseAppState(raw: unknown): AppStateParseResult {
  if (!isRecord(raw)) return {ok: false, reason: 'MALFORMED'};
  const version = raw['formatVersion'];
  if (typeof version !== 'number') return {ok: false, reason: 'MALFORMED'};
  if (version !== APP_FORMAT_VERSION) return {ok: false, reason: 'UNSUPPORTED_FORMAT_VERSION', formatVersion: version};

  const cycle = raw['cycle'];
  if (!isRecord(cycle)) return {ok: false, reason: 'MALFORMED'};
  const {cycleId, createdAt, engineStateVersion, engineState, baseline} = cycle;
  if (!isNonEmptyString(cycleId) || !isNonEmptyString(createdAt)) return {ok: false, reason: 'MALFORMED'};
  if (typeof engineStateVersion !== 'number' || !isNonEmptyString(engineState)) return {ok: false, reason: 'MALFORMED'};
  if (!isRecord(baseline)) return {ok: false, reason: 'MALFORMED'};

  const performance = parsePerformance(baseline['performance']);
  const {targetTimeSeconds, raceDate} = baseline;
  if (performance === undefined) return {ok: false, reason: 'MALFORMED'};
  if (typeof targetTimeSeconds !== 'number' || !isNonEmptyString(raceDate)) return {ok: false, reason: 'MALFORMED'};
  const assessment = baseline['assessment'];
  if (!isRecord(assessment)) return {ok: false, reason: 'MALFORMED'};
  for (const key of ['capacity', 'quality', 'confidence', 'gate', 'phase']) {
    if (!isNonEmptyString(assessment[key])) return {ok: false, reason: 'MALFORMED'};
  }
  if (assessment['feasibility'] !== null && !isNonEmptyString(assessment['feasibility'])) return {ok: false, reason: 'MALFORMED'};
  if (!Array.isArray(assessment['reasons'])) return {ok: false, reason: 'MALFORMED'};

  const events = raw['events'];
  if (!Array.isArray(events)) return {ok: false, reason: 'MALFORMED'};
  const ui = raw['ui'];
  if (!isRecord(ui) || ui['units'] !== 'METRIC' || !isNonEmptyString(ui['locale'])) return {ok: false, reason: 'MALFORMED'};

  return {ok: true, state: raw as unknown as AppStateV1};
}

export interface NewCycleInput {
  cycleId: string;
  createdAt: string;
  engineStateVersion: number;
  engineState: string;
  profile: {performance: PerformanceSnapshot | null; targetTimeSeconds: number; raceDate: string};
  assessment: AssessmentSnapshot;
  locale: string;
}

/** Build the envelope for a brand-new cycle. Pure: persistence happens in the application service. */
export function buildAppStateV1(input: NewCycleInput): AppStateV1 {
  return {
    formatVersion: APP_FORMAT_VERSION,
    cycle: {
      cycleId: input.cycleId,
      createdAt: input.createdAt,
      engineStateVersion: input.engineStateVersion,
      engineState: input.engineState,
      baseline: {
        performance: input.profile.performance === null ? null : {...input.profile.performance},
        targetTimeSeconds: input.profile.targetTimeSeconds,
        raceDate: input.profile.raceDate,
        assessment: {...input.assessment, reasons: [...input.assessment.reasons]},
      },
    },
    events: [{type: 'CYCLE_CREATED', at: input.createdAt, cycleId: input.cycleId}],
    ui: {units: 'METRIC', locale: input.locale},
  };
}
