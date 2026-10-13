/**
 * Public API contract tests (UI-GAP-06 error codes, UI-GAP-08 runtime catalogs).
 *
 * These tests lock the external contract only: they exercise the package entry point and assert
 * what a PWA can rely on. They deliberately do not reach into engine internals.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.ts';
import {
  ANCHORS, BREAK_REASONS, CAPACITIES, CONFIDENCES, DOSE_UNITS, EFFORT_CUES, ERROR_CODES, EVALUATIONS,
  FEASIBILITIES, FEEDBACK_FIELDS, GATES, MAIN_MODES, PERFORMANCE_MISMATCH_LEVELS, PERFORMANCE_SOURCES,
  PHASES, QUALITY_LEVELS, REASON_CODES, SAFETY_STATUSES, WORKOUT_GOALS, WORKOUT_TYPES, YELLOW_REASONS,
  createEngine, day, deserialize, moveWorkout, prescribe, recordCheckpoint, recordFinalResult, recordResult,
  replan, serialize, skipWorkout, updateTrainingData, validateProfile, validateResult, validateSafety,
  EngineError, EventDatePassedError,
} from '../src/index.ts';
import type {
  Anchor, BreakReason, Capacity, Confidence, DoseUnit, EffortCue, EngineErrorCode, Evaluation,
  Feasibility, FeedbackField, Gate, PerformanceMismatch, PerformanceSource, Phase,
  QualityExperience, ReasonCode, SafetyStatus, WorkoutGoal, WorkoutMainMode, WorkoutType, YellowReason,
} from '../src/index.ts';
import {NOW, dateAfter, experienced, profile as baseProfile} from './helpers.ts';

// ------------------------------------------------------------------ fixtures
const healthy = () => ({pain: 0, painIncreasing: false, alteredMovement: false, painWalkingOrRest: false, swelling: false, acuteIllness: false, otherStop: false, needsAssessment: false});
const newState = (o: Parameters<typeof baseProfile>[0] = {}) => createEngine(baseProfile({...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4, averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(60), ...o}), NOW);
const qualityOf = (s: ReturnType<typeof newState>) => s.queue.find(w => w.countsAsQuality)!;
const validResult = (date = NOW, rpe = 6.5) => ({date, completionFraction: 1, sessionRpe: rpe, safety: healthy(), durationMinutes: 40, distanceMeters: 6000, repeats: [], restSeconds: [], conditions: {}, unexpectedFatigue: false});
const resultFor = (w: ReturnType<typeof qualityOf>) => ({...validResult(w.scheduledDate, (w.targetRpe[0] + w.targetRpe[1]) / 2), repeats: w.speedRangeMps ? [{distanceMeters: 600, seconds: 600 / ((w.speedRangeMps[0] + w.speedRangeMps[1]) / 2)}] : [], restSeconds: [w.restSeconds]});

/** A stored plan that disagrees with its own history: only reachable through `deserialize`. */
function inconsistentStoredPlan() {
  const s = newState();
  const w = qualityOf(s);
  const after = recordResult(s, w.id, resultFor(w));
  const tampered = JSON.parse(serialize(after)) as typeof after;
  const injected = {...tampered.history[0]!.workout, id: 'injected', scheduledDate: dateAfter(1, w.scheduledDate)};
  tampered.queue = [injected];
  return {state: deserialize(JSON.stringify(tampered)), workout: injected};
}

/** Two quality sessions three days apart, so a move can violate recovery without breaking the limit. */
function twoQualityPlan() {
  const s = newState({raceDate: dateAfter(90)});
  const quality = s.queue.filter(w => w.countsAsQuality);
  assert.ok(quality.length >= 2, 'precondition: two quality sessions are queued');
  return {state: s, first: quality[0]!, second: quality[1]!};
}

/** At most one quality per week, one already completed: a move into the same window breaks the limit. */
function weeklyLimitPlan() {
  let s = newState({availableRunsPerWeek: 3, actualRunsPerWeek: 3});
  const first = qualityOf(s);
  const firstDate = first.scheduledDate;                       // completed quality, now in history
  s = recordResult(s, first.id, resultFor(first));
  s = replan(s, dateAfter(2, NOW));                            // clock moves on inside the same week
  const queued = s.queue.find(w => w.countsAsQuality);
  assert.ok(queued, 'precondition: a quality session is queued inside the new horizon');
  // 72 h after the completed quality (recovery holds) but still inside its seven-day window (limit breaks).
  const target = dateAfter(3, NOW);
  assert.ok(day(target) >= day(s.asOf), 'precondition: the target is inside the queue horizon');
  assert.equal(day(firstDate), day(NOW), 'precondition: the completed quality is dated on the cycle start');
  assert.ok(!s.queue.some(w => w.scheduledDate === target), 'precondition: the target date is free');
  return {state: s, workout: queued!, target};
}

// ------------------------------------------------------------------ 1/2/4/6: one case per publicly reachable code
type Case = {code: EngineErrorCode; message: string; trigger: () => unknown};
const CASES: Case[] = [
  {code: 'INVALID_DATE_FORMAT', message: 'Date must be YYYY-MM-DD', trigger: () => day('05-10-2026')},
  {code: 'INVALID_CALENDAR_DATE', message: 'Invalid calendar date', trigger: () => day('2026-02-30')},
  {code: 'NUMBER_OUT_OF_RANGE', message: 'Number outside 1..Infinity', trigger: () => validateProfile({...baseProfile(), targetTimeSeconds: 0}, NOW)},
  {code: 'INVALID_SAFETY_FLAG', message: 'Invalid safety flag', trigger: () => validateSafety({...healthy(), swelling: 'yes'} as never)},
  {code: 'INVALID_PROFILE_FLAG', message: 'Invalid profile flag', trigger: () => validateProfile({...baseProfile(), canRun3Km: 'yes'} as never, NOW)},
  {code: 'INVALID_QUALITY_WEEKS', message: 'Invalid quality weeks', trigger: () => validateProfile({...baseProfile(), qualityWeeks8Weeks: 3, qualitySessions8Weeks: 2}, NOW)},
  {code: 'INVALID_MISMATCH', message: 'Invalid mismatch', trigger: () => validateProfile({...baseProfile(), performanceMismatch: 'MAYBE'} as never, NOW)},
  {code: 'INVALID_PERFORMANCE_SOURCE', message: 'Invalid performance source', trigger: () => validateProfile({...baseProfile(), performance: {timeSeconds: 900, date: NOW, source: 'GUESS'} as never}, NOW)},
  {code: 'INVALID_BREAK_REASON', message: 'Invalid break reason', trigger: () => validateProfile({...baseProfile(), breaks: [{days: 3, endDate: NOW, reason: 'HOLIDAY'} as never]}, NOW)},
  {code: 'INVALID_BREAK', message: 'Invalid break', trigger: () => validateProfile({...baseProfile(), breaks: [{days: 3, endDate: dateAfter(1), reason: 'WORK'}]}, NOW)},
  {code: 'FUTURE_PERFORMANCE', message: 'Future performance', trigger: () => validateProfile({...baseProfile(), performance: {timeSeconds: 900, date: dateAfter(1), source: 'TEST_3K'}}, NOW)},
  {code: 'AVAILABILITY_NOT_INTEGER', message: 'Availability must be integer', trigger: () => validateProfile({...baseProfile(), availableRunsPerWeek: 2.5}, NOW)},
  {code: 'INVALID_YELLOW_REASON', message: 'Invalid yellow reason', trigger: () => validateResult({...validResult(), yellowReason: 'LAZY'} as never)},
  {code: 'INVALID_FATIGUE_FLAG', message: 'Invalid fatigue flag', trigger: () => validateResult({...validResult(), unexpectedFatigue: 'yes'} as never)},
  {code: 'INVALID_FEEDBACK_CONFIRMATION', message: 'Invalid explicit feedback confirmation', trigger: () => validateResult({...validResult(), feedbackConfirmed: 'yes'} as never)},
  {code: 'RESULT_DISTANCE_CONFLICT', message: 'Reported total distance is less than measured splits', trigger: () => validateResult({...validResult(), distanceMeters: 0, repeats: [{distanceMeters: 400, seconds: 90}]})},
  {code: 'EVENT_DATE_PASSED', message: 'EVENT_DATE_PASSED: the active plan works only up to and including the target race date', trigger: () => createEngine(baseProfile({raceDate: dateAfter(-1)}), NOW)},
  {code: 'CLOCK_BACKWARDS', message: 'Clock cannot move backwards', trigger: () => replan(newState(), dateAfter(-1))},
  {code: 'UNSUPPORTED_STATE_VERSION', message: 'Unsupported state version', trigger: () => deserialize(JSON.stringify({...newState(), version: 2}))},
  {code: 'WORKOUT_BLOCKED_BY_PHASE_OR_SAFETY', message: 'Workout blocked by phase or safety', trigger: () => prescribe(createEngine(baseProfile({performance: null}), NOW), 'VO2', NOW, 'probe')},
  {code: 'UNKNOWN_WORKOUT', message: 'Unknown workout', trigger: () => skipWorkout(newState(), 'nope')},
  {code: 'UNKNOWN_OR_COMPLETED_WORKOUT', message: 'Unknown or completed workout', trigger: () => recordResult(newState(), 'nope', validResult())},
  {code: 'RESULT_PRECEDES_STATE', message: 'Result precedes prescription or state', trigger: () => { const s = newState(); const w = qualityOf(s); return recordResult(s, w.id, {...resultFor(w), date: dateAfter(-1, w.scheduledDate)}); }},
  {code: 'RECOVERY_OR_QUALITY_LIMIT', message: 'Recovery or quality limit violated', trigger: () => { const {state, workout} = inconsistentStoredPlan(); return recordResult(state, workout.id, resultFor(workout)); }},
  {code: 'PROTECTED_FIELD', message: 'Protected field', trigger: () => updateTrainingData(newState(), {safety: healthy()} as never, NOW)},
  {code: 'CHECKPOINT_NOT_PERMITTED', message: 'Checkpoint not permitted', trigger: () => recordCheckpoint(newState(), {timeSeconds: 900, date: NOW, source: 'GUESS'} as never, NOW)},
  {code: 'INVALID_CHECKPOINT_DATE', message: 'Invalid checkpoint date', trigger: () => recordCheckpoint(newState(), {timeSeconds: 900, date: dateAfter(5), source: 'TEST_3K'}, NOW)},
  {code: 'FINAL_RESULT_NOT_ON_EVENT_DATE', message: 'Final result must be dated on the event date', trigger: () => { const s = replan(newState({raceDate: dateAfter(3)}), dateAfter(3)); return recordFinalResult(s, {timeSeconds: 880, date: dateAfter(1, s.profile.raceDate), source: 'TEST_3K'}, dateAfter(1, s.profile.raceDate)); }},
  {code: 'FINAL_RESULT_BEFORE_EVENT', message: 'Final result cannot be recorded before the event date', trigger: () => { const s = replan(newState({raceDate: dateAfter(3)}), dateAfter(3)); return recordFinalResult(s, {timeSeconds: 880, date: s.profile.raceDate, source: 'TEST_3K'}, dateAfter(-1, s.profile.raceDate)); }},
  {code: 'MOVE_OUTSIDE_HORIZON', message: 'Move outside queue horizon', trigger: () => { const s = newState(); return moveWorkout(s, s.queue[0]!.id, dateAfter(9)); }},
  {code: 'MOVE_OCCUPIED_DATE', message: 'Occupied date', trigger: () => { const s = newState(); return moveWorkout(s, s.queue[0]!.id, s.queue[1]!.scheduledDate); }},
  {code: 'MOVE_RECOVERY_VIOLATION', message: 'Move violates recovery', trigger: () => { const {state, first, second} = twoQualityPlan(); return moveWorkout(state, first.id, dateAfter(-1, second.scheduledDate)); }},
  {code: 'MOVE_QUALITY_LIMIT_VIOLATION', message: 'Move violates weekly quality limit', trigger: () => { const {state, workout, target} = weeklyLimitPlan(); return moveWorkout(state, workout.id, target); }},
];

const byCode = new Map(CASES.map(c => [c.code, c]));

for (const code of ERROR_CODES) {
  test(`API-01 ${code} is raised as EngineError with a stable code and the original message`, () => {
    const entry = byCode.get(code);
    assert.ok(entry, `no public trigger is covered for ${code}`);
    let raised: unknown;
    try { entry.trigger(); } catch (error) { raised = error; }
    assert.ok(raised instanceof Error, `${code}: nothing was thrown`);
    assert.ok(raised instanceof EngineError, `${code}: not an EngineError`);
    assert.equal((raised as EngineError).code, code);
    assert.equal((raised as EngineError).message, entry.message, `${code}: message changed`);
  });
}

// ------------------------------------------------------------------ 3: structured parameters
test('API-02 a dynamic error carries its parameters instead of forcing string parsing', () => {
  let raised: unknown;
  try { validateProfile({...baseProfile(), availableRunsPerWeek: 9}, NOW); } catch (error) { raised = error; }
  assert.ok(raised instanceof EngineError);
  assert.equal(raised.code, 'NUMBER_OUT_OF_RANGE');
  assert.equal(raised.message, 'Number outside 1..7');
  assert.deepEqual(raised.details, {min: 1, max: 7, value: 9});
});

test('API-03 an unbounded range reports Infinity rather than dropping the parameter', () => {
  let raised: unknown;
  try { validateProfile({...baseProfile(), targetTimeSeconds: -1}, NOW); } catch (error) { raised = error; }
  assert.ok(raised instanceof EngineError);
  assert.equal(raised.message, 'Number outside 1..Infinity');
  assert.deepEqual(raised.details, {min: 1, max: Infinity, value: -1});
});

test('API-04 errors without parameters still expose an (empty) details object', () => {
  let raised: unknown;
  try { skipWorkout(newState(), 'nope'); } catch (error) { raised = error; }
  assert.ok(raised instanceof EngineError);
  assert.deepEqual(raised.details, {});
});

// ------------------------------------------------------------------ 5/6: EventDatePassedError compatibility
test('API-05 EventDatePassedError stays a distinct class with the same code, message and instanceof chain', () => {
  let raised: unknown;
  try { createEngine(baseProfile({raceDate: dateAfter(-1)}), NOW); } catch (error) { raised = error; }
  assert.ok(raised instanceof EventDatePassedError, 'instanceof EventDatePassedError');
  assert.ok(raised instanceof EngineError, 'instanceof EngineError');
  assert.ok(raised instanceof Error, 'instanceof Error');
  assert.equal((raised as EventDatePassedError).code, 'EVENT_DATE_PASSED');
  assert.equal((raised as EventDatePassedError).name, 'EventDatePassedError');
  assert.match((raised as Error).message, /^EVENT_DATE_PASSED:/);
  // The same class is used by every event-date guard, and the class is exported from the package.
  assert.equal(api.EventDatePassedError, EventDatePassedError);
  assert.throws(() => api.validateEventDate(baseProfile({raceDate: dateAfter(-1)}), NOW), EventDatePassedError);
  assert.throws(() => replan(newState({raceDate: dateAfter(2)}), dateAfter(3)), EventDatePassedError);
});

test('API-06 existing plain-Error handling keeps working for every code', () => {
  for (const entry of CASES) {
    assert.throws(entry.trigger, Error, `${entry.code}: assert.throws(fn, Error) must still pass`);
    assert.throws(entry.trigger, new RegExp(entry.message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${entry.code}: message regex must still match`);
  }
});

// ------------------------------------------------------------------ 9: uniqueness
test('API-07 error codes are unique and every one has a covered public trigger', () => {
  assert.equal(new Set(ERROR_CODES).size, ERROR_CODES.length, 'duplicate error code');
  assert.equal(new Set(CASES.map(c => c.code)).size, CASES.length, 'duplicate case');
  assert.deepEqual(CASES.map(c => c.code).sort(), [...ERROR_CODES].sort(), 'ERROR_CODES and the covered cases diverge');
});

// ------------------------------------------------------------------ 7/8/10: catalogs
/** Compile-time exhaustiveness check: a missing or unknown key fails the build. */
function complete<T extends string>(values: readonly T[], labels: Record<T, string>): Record<T, string> {
  assert.deepEqual(Object.keys(labels).sort(), [...values].sort(), 'labels must cover exactly the catalog');
  return labels;
}

/**
 * Labels are the values themselves on purpose: this asserts the *mechanism* that makes an
 * exhaustive mapping verifiable by the compiler. The real Russian copy is a product artifact and
 * is still an open question (B3 in docs/pwa-architecture.md) - it must not be invented here.
 */
const LABELS = {
  confidences: complete(CONFIDENCES, {HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', UNKNOWN: 'UNKNOWN'}),
  capacities: complete(CAPACITIES, {T0: 'T0', T1: 'T1', T2: 'T2', T3: 'T3'}),
  quality: complete(QUALITY_LEVELS, {Q0: 'Q0', Q1: 'Q1', Q2: 'Q2'}),
  phases: complete(PHASES, {FOUNDATION: 'FOUNDATION', DEVELOPMENT: 'DEVELOPMENT', SPECIFIC: 'SPECIFIC', RE_ENTRY: 'RE_ENTRY', HOLD_DIAGNOSTIC: 'HOLD_DIAGNOSTIC', TAPER: 'TAPER'}),
  safety: complete(SAFETY_STATUSES, {OK: 'OK', HOLD: 'HOLD', STOP: 'STOP'}),
  feasibility: complete(FEASIBILITIES, {PLAUSIBLE: 'PLAUSIBLE', AMBITIOUS: 'AMBITIOUS', LOW_PROBABILITY: 'LOW_PROBABILITY', LONG_TERM: 'LONG_TERM'}),
  gates: complete(GATES, {CLOSED: 'CLOSED', PARTIAL: 'PARTIAL', OPEN: 'OPEN'}),
  workoutTypes: complete(WORKOUT_TYPES, {EASY: 'EASY', LONG_EASY: 'LONG_EASY', STRIDES: 'STRIDES', INTRO_QUALITY: 'INTRO_QUALITY', THRESHOLD: 'THRESHOLD', VO2: 'VO2', SPECIFIC_3K: 'SPECIFIC_3K', CONTROL: 'CONTROL', REST: 'REST'}),
  goals: complete(WORKOUT_GOALS, {AEROBIC_BASE: 'AEROBIC_BASE', QUALITY_ADAPTATION: 'QUALITY_ADAPTATION', ASSESS_CURRENT_PERFORMANCE: 'ASSESS_CURRENT_PERFORMANCE', RECOVERY: 'RECOVERY'}),
  modes: complete(MAIN_MODES, {CONTINUOUS: 'CONTINUOUS', INTERVALS: 'INTERVALS', RUN_WALK: 'RUN_WALK', REST: 'REST'}),
  units: complete(DOSE_UNITS, {MINUTES: 'MINUTES', METERS: 'METERS'}),
  cues: complete(EFFORT_CUES, {FULL_SENTENCES: 'FULL_SENTENCES', CONTROLLED_BREATHING: 'CONTROLLED_BREATHING'}),
  anchors: complete(ANCHORS, {CURRENT: 'CURRENT', EFFECTIVE: 'EFFECTIVE', EFFORT: 'EFFORT', NONE: 'NONE'}),
  feedback: complete(FEEDBACK_FIELDS, {completionFraction: 'completionFraction', sessionRpe: 'sessionRpe', safety: 'safety', durationMinutes: 'durationMinutes', distanceMeters: 'distanceMeters', repeats: 'repeats', restSeconds: 'restSeconds', conditions: 'conditions', unexpectedFatigue: 'unexpectedFatigue'}),
  evaluations: complete(EVALUATIONS, {GREEN_PLUS: 'GREEN_PLUS', GREEN: 'GREEN', YELLOW: 'YELLOW', RED: 'RED'}),
  yellow: complete(YELLOW_REASONS, {EXECUTION: 'EXECUTION', RECOVERY: 'RECOVERY', ENVIRONMENT: 'ENVIRONMENT', ILLNESS: 'ILLNESS', PAIN: 'PAIN', PACE_PRESCRIPTION: 'PACE_PRESCRIPTION', OTHER: 'OTHER'}),
  reasons: complete(REASON_CODES, {
    GOAL_GAP_TOO_LARGE: 'GOAL_GAP_TOO_LARGE', TARGET_GATE_CLOSED: 'TARGET_GATE_CLOSED', LOW_QUALITY_EXPERIENCE: 'LOW_QUALITY_EXPERIENCE',
    REENTRY_AFTER_BREAK: 'REENTRY_AFTER_BREAK', SECOND_QUALITY_NOT_ALLOWED: 'SECOND_QUALITY_NOT_ALLOWED', TWO_RELATED_YELLOW: 'TWO_RELATED_YELLOW',
    CHECKPOINT_AFTER_GREEN_PLUS: 'CHECKPOINT_AFTER_GREEN_PLUS', SAFETY_STOP: 'SAFETY_STOP', SAFETY_HOLD: 'SAFETY_HOLD', TAPER_STARTED: 'TAPER_STARTED',
    PERFORMANCE_CONFIDENCE_LOW: 'PERFORMANCE_CONFIDENCE_LOW', FOUNDATION_NO_3K_RESULT: 'FOUNDATION_NO_3K_RESULT', CHECKPOINT_DUE: 'CHECKPOINT_DUE',
    CHECKPOINT_AFTER_REENTRY: 'CHECKPOINT_AFTER_REENTRY', CONTRADICTORY_PERFORMANCE: 'CONTRADICTORY_PERFORMANCE', PROGRESSION_ALLOWED: 'PROGRESSION_ALLOWED',
    PROGRESSION_BLOCKED: 'PROGRESSION_BLOCKED', HEALTH_REVIEW_REQUIRED: 'HEALTH_REVIEW_REQUIRED', FOUNDATION_LONG_TERM_CONFLICT: 'FOUNDATION_LONG_TERM_CONFLICT',
  }),
  sources: complete(PERFORMANCE_SOURCES, {TEST_3K: 'TEST_3K', OFFICIAL_3K: 'OFFICIAL_3K'}),
  breaks: complete(BREAK_REASONS, {WORK: 'WORK', OTHER_HEALTHY: 'OTHER_HEALTHY', ILLNESS: 'ILLNESS', INJURY: 'INJURY'}),
  mismatch: complete(PERFORMANCE_MISMATCH_LEVELS, {NONE: 'NONE', MODERATE: 'MODERATE', CLEAR: 'CLEAR'}),
} as const;

/** Compile-time check that each catalog's element type is exactly the exported union. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type _CatalogMatchesTypes = [
  Assert<Same<(typeof CONFIDENCES)[number], Confidence>>,
  Assert<Same<(typeof CAPACITIES)[number], Capacity>>,
  Assert<Same<(typeof QUALITY_LEVELS)[number], QualityExperience>>,
  Assert<Same<(typeof PHASES)[number], Phase>>,
  Assert<Same<(typeof SAFETY_STATUSES)[number], SafetyStatus>>,
  Assert<Same<(typeof FEASIBILITIES)[number], Feasibility>>,
  Assert<Same<(typeof GATES)[number], Gate>>,
  Assert<Same<(typeof WORKOUT_TYPES)[number], WorkoutType>>,
  Assert<Same<(typeof WORKOUT_GOALS)[number], WorkoutGoal>>,
  Assert<Same<(typeof MAIN_MODES)[number], WorkoutMainMode>>,
  Assert<Same<(typeof DOSE_UNITS)[number], DoseUnit>>,
  Assert<Same<(typeof EFFORT_CUES)[number], EffortCue>>,
  Assert<Same<(typeof ANCHORS)[number], Anchor>>,
  Assert<Same<(typeof FEEDBACK_FIELDS)[number], FeedbackField>>,
  Assert<Same<(typeof EVALUATIONS)[number], Evaluation>>,
  Assert<Same<(typeof YELLOW_REASONS)[number], YellowReason>>,
  Assert<Same<(typeof REASON_CODES)[number], ReasonCode>>,
  Assert<Same<(typeof PERFORMANCE_SOURCES)[number], PerformanceSource>>,
  Assert<Same<(typeof BREAK_REASONS)[number], BreakReason>>,
  Assert<Same<(typeof PERFORMANCE_MISMATCH_LEVELS)[number], PerformanceMismatch>>,
];
const _catalogMatchesTypes: _CatalogMatchesTypes | null = null;
void _catalogMatchesTypes;

const CATALOGS: [string, readonly string[]][] = [
  ['CONFIDENCES', CONFIDENCES], ['CAPACITIES', CAPACITIES], ['QUALITY_LEVELS', QUALITY_LEVELS], ['PHASES', PHASES],
  ['SAFETY_STATUSES', SAFETY_STATUSES], ['FEASIBILITIES', FEASIBILITIES], ['GATES', GATES], ['WORKOUT_TYPES', WORKOUT_TYPES],
  ['WORKOUT_GOALS', WORKOUT_GOALS], ['MAIN_MODES', MAIN_MODES], ['DOSE_UNITS', DOSE_UNITS], ['EFFORT_CUES', EFFORT_CUES],
  ['ANCHORS', ANCHORS], ['FEEDBACK_FIELDS', FEEDBACK_FIELDS], ['EVALUATIONS', EVALUATIONS], ['YELLOW_REASONS', YELLOW_REASONS],
  ['REASON_CODES', REASON_CODES], ['PERFORMANCE_SOURCES', PERFORMANCE_SOURCES], ['BREAK_REASONS', BREAK_REASONS],
  ['PERFORMANCE_MISMATCH_LEVELS', PERFORMANCE_MISMATCH_LEVELS], ['ERROR_CODES', ERROR_CODES],
];

test('API-08 every catalog is exported, frozen, non-empty, duplicate-free and made of strings', () => {
  for (const [name, values] of CATALOGS) {
    assert.ok(values.length > 0, `${name} is empty`);
    assert.equal(new Set(values).size, values.length, `${name} contains duplicates`);
    assert.ok(values.every(v => typeof v === 'string' && v.length > 0), `${name} contains a non-string value`);
    assert.ok(Object.isFrozen(values), `${name} is not frozen and could be mutated by a consumer`);
    assert.equal((api as unknown as Record<string, unknown>)[name], values, `${name} is not exported from the entry point`);
  }
});

test('API-09 exhaustive label maps are complete at runtime and verified by the compiler', () => {
  assert.equal(Object.keys(LABELS.phases).length, PHASES.length);
  assert.equal(Object.keys(LABELS.reasons).length, REASON_CODES.length);
  for (const labels of Object.values(LABELS)) {
    for (const [key, value] of Object.entries(labels)) {
      assert.equal(value, key, 'identity labels are expected in this contract test');
      assert.ok(value.length > 0);
    }
  }
  // The catalogs the PWA must translate are the ones above; a new value in any of them makes the
  // matching `complete(...)` call above fail to compile until the value is handled.
  assert.equal(Object.keys(LABELS).length, CATALOGS.length - 1, 'every catalog except ERROR_CODES has a label map');
});

test('API-10 the value sets the engine actually emits are members of the published catalogs', () => {
  const s = newState();
  assert.ok(WORKOUT_TYPES.includes(s.queue[0]!.type));
  assert.ok(WORKOUT_GOALS.includes(s.queue[0]!.goal));
  assert.ok(MAIN_MODES.includes(s.queue[0]!.main.mode));
  assert.ok(DOSE_UNITS.includes(s.queue[0]!.main.dose.unit));
  assert.ok(ANCHORS.includes(s.queue[0]!.anchor));
  assert.ok(GATES.includes(s.queue[0]!.gateAtPrescription));
  assert.ok(PHASES.includes(s.decision.phase));
  assert.ok(CAPACITIES.includes(s.decision.capacity));
  assert.ok(QUALITY_LEVELS.includes(s.decision.quality));
  assert.ok(CONFIDENCES.includes(s.decision.confidence));
  assert.ok(SAFETY_STATUSES.includes(s.decision.safety));
  assert.ok(GATES.includes(s.decision.gate));
  assert.ok(s.decision.feasibility === null || FEASIBILITIES.includes(s.decision.feasibility));
  for (const reason of s.decision.reasons) assert.ok(REASON_CODES.includes(reason), `unknown reason code ${reason}`);
  for (const field of s.queue[0]!.requiredFeedback) assert.ok(FEEDBACK_FIELDS.includes(field), `unknown feedback field ${field}`);
  assert.ok(PERFORMANCE_SOURCES.includes(s.profile.performance!.source));
});
