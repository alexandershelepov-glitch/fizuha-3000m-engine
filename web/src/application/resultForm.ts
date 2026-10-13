/**
 * The result form: a draft the user fills in, and its conversion into the exact `WorkoutResult` the
 * engine expects.
 *
 * Only structural checks happen here (is the field filled, is it a number, is the time well formed).
 * Every sport rule — the allowed ranges, the classification, the plan rebuild — stays with the engine.
 * No evaluation is ever computed on this side.
 */
import {parseTime} from './format.ts';
import type {SafetyData, Workout, WorkoutResult} from './engineGateway.ts';

/**
 * How much of the session was completed. The first four options are the approved wording of
 * docs/ui-copy.md §9.1; the last one lets the user state an exact share instead of a category.
 * The engine always receives a fraction, never a category.
 */
export const COMPLETION_PRESETS = Object.freeze(['FULL', 'MORE_THAN_HALF', 'HALF', 'LESS_THAN_HALF', 'EXACT'] as const);
export type CompletionPreset = (typeof COMPLETION_PRESETS)[number];
const PRESET_FRACTIONS = {FULL: 1, MORE_THAN_HALF: 0.75, HALF: 0.5, LESS_THAN_HALF: 0.25} as const;

export interface RepeatDraft {
  readonly seconds: string;
  readonly distanceMeters: string;
}

export interface ResultConditionsDraft {
  readonly heat: boolean;
  readonly wind: boolean;
  readonly surface: string;
  readonly notes: string;
}

/** A required, consciously chosen response in the UI. Older saved drafts have no response. */
export type SafetyResponse = 'UNANSWERED' | 'NO_SYMPTOMS' | 'SYMPTOMS';

/** Every engine safety flag must be considered, not just the pain scale. */
export function hasSafetyConcerns(safety: SafetyData): boolean {
  return safety.pain > 0 || safety.painIncreasing || safety.alteredMovement ||
    safety.painWalkingOrRest || safety.swelling || safety.acuteIllness ||
    safety.otherStop || safety.needsAssessment;
}

export interface ResultDraft {
  readonly completion: CompletionPreset;
  /** True only after the user deliberately chooses an answer, including FULL. */
  readonly completionConfirmed?: boolean;
  /** True only after the user deliberately chooses an RPE, including the suggested value. */
  readonly effortConfirmed?: boolean;
  /** Percent, used only with the exact option. */
  readonly completionPercent: string;
  readonly sessionRpe: number;
  readonly safety: SafetyData;
  readonly safetyResponse?: SafetyResponse;
  readonly durationMinutes: string;
  readonly distanceMeters: string;
  readonly repeats: readonly RepeatDraft[];
  readonly restSeconds: string;
  readonly conditions: ResultConditionsDraft;
  readonly unexpectedFatigue: boolean;
}

export type ResultField = 'completionPercent' | 'durationMinutes' | 'distanceMeters' | 'repeats' | 'restSeconds';
export interface ResultProblem {
  readonly field: ResultField;
  readonly kind: 'EMPTY' | 'FORMAT' | 'IMPOSSIBLE' | 'NOT_A_NUMBER' | 'NEGATIVE' | 'CONFLICT';
}

/** The B1 trigger: a prescribed pace range is what makes an empty repeats block cost accuracy. */
export function repeatsAffectEvaluation(workout: Workout): boolean {
  return workout.speedRangeMps !== null;
}

/** Whether the repeats block must be open and prominent instead of tucked away. */
export function repeatsBlockExpandedFor(workout: Workout): boolean {
  return repeatsAffectEvaluation(workout) || workout.main.mode === 'INTERVALS';
}

function defaultRepeats(workout: Workout): RepeatDraft[] {
  if (!repeatsBlockExpandedFor(workout)) return [];
  const count = Math.max(1, workout.main.repeats);
  return Array.from({length: count}, (_, index) => ({
    seconds: '',
    distanceMeters: String((index === count - 1 ? workout.main.finalRepeatMeters : null) ?? workout.main.repeatMeters ?? ''),
  }));
}

function plannedDuration(workout: Workout): number {
  const main = workout.main.dose.unit === 'MINUTES' ? workout.main.dose.value : 0;
  return workout.warmupMinutes + main + workout.cooldownMinutes;
}

/**
 * A started draft for this session. Defaults come from the prescription where the engine provides it
 * (repeats, rest, planned duration); nothing is invented for values the engine does not know, and the
 * total distance stays blank ("not measured") until the user states it.
 */
export function defaultResultDraft(workout: Workout): ResultDraft {
  return {
    completion: 'FULL',
    completionConfirmed: false,
    effortConfirmed: false,
    completionPercent: '',
    sessionRpe: Math.round((workout.targetRpe[0] + workout.targetRpe[1]) / 2),
    safety: {pain: 0, painIncreasing: false, alteredMovement: false, painWalkingOrRest: false, swelling: false, acuteIllness: false, otherStop: false, needsAssessment: false},
    safetyResponse: 'UNANSWERED',
    durationMinutes: String(plannedDuration(workout)),
    distanceMeters: '',
    repeats: defaultRepeats(workout),
    restSeconds: String(workout.restSeconds),
    conditions: {heat: false, wind: false, surface: '', notes: ''},
    unexpectedFatigue: false,
  };
}

/**
 * The reported part of the repeats block is the time: without it there is no speed to evaluate, so a
 * prefilled distance alone means "not reported" rather than "half filled".
 */
export function draftHasNoRepeats(draft: ResultDraft): boolean {
  return draft.repeats.every((repeat) => repeat.seconds.trim() === '');
}

export function draftHasPartialRepeats(draft: ResultDraft): boolean {
  const reported = draft.repeats.filter((repeat) => repeat.seconds.trim() !== '').length;
  return reported > 0 && reported < draft.repeats.length;
}

/** Digit-only checks: a typing mistake is not a range violation, and ranges belong to the engine. */
function toNumber(raw: string): number | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (!/^-?\d+(?:[.,]\d+)?$/.test(value)) return Number.NaN;
  return Number(value.replace(',', '.'));
}

function numberField(raw: string, field: ResultField, problems: ResultProblem[], allowZero = true): number {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    problems.push({field, kind: 'EMPTY'});
    return 0;
  }
  const parsed = toNumber(trimmed);
  if (parsed === null || Number.isNaN(parsed)) {
    problems.push({field, kind: 'NOT_A_NUMBER'});
    return 0;
  }
  if (!allowZero && parsed === 0) {
    problems.push({field, kind: 'EMPTY'});
    return 0;
  }
  if (parsed < 0) {
    problems.push({field, kind: 'NEGATIVE'});
    return 0;
  }
  return parsed;
}

export type BuildResultOutcome = {ok: true; result: WorkoutResult} | {ok: false; problems: readonly ResultProblem[]};

export function buildWorkoutResult(workout: Workout, draft: ResultDraft): BuildResultOutcome {
  const problems: ResultProblem[] = [];

  let completionFraction: number;
  if (draft.completion === 'EXACT') {
    const percent = numberField(draft.completionPercent, 'completionPercent', problems, false);
    if (!problems.some((problem) => problem.field === 'completionPercent') && (percent > 99 || !Number.isInteger(percent))) {
      problems.push({field: 'completionPercent', kind: 'IMPOSSIBLE'});
    }
    completionFraction = percent / 100;
  } else {
    completionFraction = PRESET_FRACTIONS[draft.completion];
  }

  const durationMinutes = numberField(draft.durationMinutes, 'durationMinutes', problems);
  // A blank total is not a measured zero. Keep this separate from a deliberate "0".
  const totalDistanceWasProvided = draft.distanceMeters.trim() !== '';
  const enteredTotalDistance = totalDistanceWasProvided
    ? numberField(draft.distanceMeters, 'distanceMeters', problems)
    : 0;
  const rawRest = numberField(draft.restSeconds, 'restSeconds', problems);

  const repeats: {distanceMeters: number; seconds: number}[] = [];
  for (const repeat of draft.repeats) {
    const secondsRaw = repeat.seconds.trim();
    const metersRaw = repeat.distanceMeters.trim();
    // A row without a time is not reported: the prescription prefills the distance, and leaving the
    // time empty must lead to the B1 warning rather than to an error.
    if (secondsRaw === '') continue;
    const time = parseTime(secondsRaw);
    if (!time.ok) problems.push({field: 'repeats', kind: time.error});
    else if (time.seconds <= 0) problems.push({field: 'repeats', kind: 'IMPOSSIBLE'});
    if (metersRaw === '') problems.push({field: 'repeats', kind: 'EMPTY'});
    else {
      const meters = toNumber(metersRaw);
      if (meters === null || Number.isNaN(meters)) problems.push({field: 'repeats', kind: 'NOT_A_NUMBER'});
      else if (meters <= 0) problems.push({field: 'repeats', kind: 'EMPTY'});
      else if (time.ok) repeats.push({distanceMeters: meters, seconds: time.seconds});
    }
  }

  const knownRepeatMeters = repeats.reduce((sum, part) => sum + part.distanceMeters, 0);
  if (totalDistanceWasProvided && knownRepeatMeters > enteredTotalDistance + 1e-6) {
    problems.push({field: 'distanceMeters', kind: 'CONFLICT'});
  }
  if (problems.length > 0) return {ok: false, problems};
  // Only measured splits can support this lower bound; we do not invent warmup/cooldown distance.
  const distanceMeters = totalDistanceWasProvided ? enteredTotalDistance : knownRepeatMeters;

  const conditions: WorkoutResult['conditions'] = {heat: draft.conditions.heat, wind: draft.conditions.wind};
  if (draft.conditions.surface.trim() !== '') conditions.surface = draft.conditions.surface.trim();
  if (draft.conditions.notes.trim() !== '') conditions.notes = draft.conditions.notes.trim();

  return {
    ok: true,
    result: {
      date: workout.scheduledDate,
      completionFraction,
      sessionRpe: draft.sessionRpe,
      safety: {...draft.safety},
      durationMinutes,
      distanceMeters,
      repeats,
      // The prescription has one rest value; the engine accepts one entry per repeat and validates each.
      restSeconds: Array.from({length: Math.max(1, repeats.length)}, () => rawRest),
      conditions,
      unexpectedFatigue: draft.unexpectedFatigue,
      ...(draft.completionConfirmed === true && draft.effortConfirmed === true ? {feedbackConfirmed: true} : {}),
    },
  };
}
