/**
 * The onboarding questionnaire: the draft the user fills in, and the conversion into the exact
 * `Profile` the engine expects.
 *
 * Only structural checks happen here (is the field filled, is it a number, is the time well formed).
 * Ranges, cross-field rules and calendar rules stay with the engine and are reported by code.
 */
import {parseTime} from './format.ts';
import {suggestedRaceDate} from './engineGateway.ts';
import type {BreakReason, EngineErrorCode, PerformanceMismatch, PerformanceSource, Profile, SafetyData} from './engineGateway.ts';

export const QUESTIONNAIRE_STEPS = Object.freeze(['RESULT', 'VOLUME', 'QUALITY', 'SAFETY', 'BREAKS', 'AVAILABILITY', 'GOAL', 'RACE_DATE'] as const);
export type QuestionnaireStep = (typeof QUESTIONNAIRE_STEPS)[number];

export const STEP_INDEX: Record<QuestionnaireStep, number> = {
  RESULT: 1, VOLUME: 2, QUALITY: 3, SAFETY: 4, BREAKS: 5, AVAILABILITY: 6, GOAL: 7, RACE_DATE: 8,
};

export interface BreakEntryDraft {
  readonly reason: BreakReason;
  readonly days: string;
  readonly endDate: string;
}

export type QualityRecall = 'NONE' | 'SOMETIMES' | 'REGULAR' | 'UNKNOWN' | 'EXACT';

export interface QuestionnaireDraft {
  readonly hasResult: boolean;
  readonly resultTime: string;
  /** Blank until the user picks a date: the confirmed baseline must never be a silent default. */
  readonly resultDate: string;
  readonly resultSource: PerformanceSource;
  /** Null until the user answers: continuous 3 km capability gates the whole beginner path. */
  readonly canRun3Km: boolean | null;
  readonly regularRunningWeeks: string;
  /** The three baseline numbers start blank: they lock the weekly load budget for the cycle. */
  readonly actualRunsPerWeek: string;
  readonly averageWeeklyKm4Weeks: string;
  readonly longestUsualRunKm: string;
  readonly qualityRecall?: QualityRecall;
  readonly qualitySessions8Weeks: string;
  readonly qualityWeeks8Weeks: string;
  readonly qualityMostlyTolerated: boolean;
  readonly experience: {readonly threshold: boolean; readonly vo2: boolean; readonly specific3k: boolean};
  readonly safety: SafetyData;
  readonly hasBreaks: boolean;
  readonly breaks: readonly BreakEntryDraft[];
  readonly availableRunsPerWeek: string;
  /** Null until the user answers: this decides whether the saved result still describes the runner. */
  readonly performanceMismatch: PerformanceMismatch | null;
  readonly targetTime: string;
  readonly startDate?: string;
  readonly raceDate: string;
  /** Date explicitly reviewed by the user; the eight-week suggestion is not a decision. */
  readonly raceDateConfirmed?: boolean;
}

export function healthySafety(): SafetyData {
  return {pain: 0, painIncreasing: false, alteredMovement: false, painWalkingOrRest: false, swelling: false, acuteIllness: false, otherStop: false, needsAssessment: false};
}

export function defaultDraft(today: string): QuestionnaireDraft {
  return {
    hasResult: true,
    resultTime: '',
    resultDate: '',
    resultSource: 'TEST_3K',
    canRun3Km: null,
    regularRunningWeeks: '',
    actualRunsPerWeek: '',
    averageWeeklyKm4Weeks: '',
    longestUsualRunKm: '',
    qualityRecall: 'UNKNOWN',
    qualitySessions8Weeks: '0',
    qualityWeeks8Weeks: '0',
    qualityMostlyTolerated: true,
    experience: {threshold: false, vo2: false, specific3k: false},
    safety: healthySafety(),
    hasBreaks: false,
    breaks: [],
    availableRunsPerWeek: '3',
    performanceMismatch: null,
    targetTime: '',
    startDate: today,
    // The app's own proposal must be a date its engine will actually serve: the event belongs to
    // the last week of the approved eight-week cycle. A +56 default once fell one day outside the
    // enrollment window, so accepting the suggestion silently produced the legacy plan.
    raceDate: suggestedRaceDate(today),
    raceDateConfirmed: false,
  };
}

/** Draft field that a problem refers to, used to focus the input and to report errors inline. */
export type FieldKey =
  | 'resultTime' | 'resultDate' | 'resultSource'
  | 'canRun3Km' | 'regularRunningWeeks' | 'actualRunsPerWeek' | 'averageWeeklyKm4Weeks' | 'longestUsualRunKm'
  | 'qualitySessions8Weeks' | 'qualityWeeks8Weeks'
  | 'safety'
  | 'breaks'
  | 'availableRunsPerWeek' | 'performanceMismatch'
  | 'targetTime'
  | 'raceDate';

export interface FieldProblem {
  readonly field: FieldKey;
  readonly kind: 'EMPTY' | 'FORMAT' | 'IMPOSSIBLE' | 'NOT_A_NUMBER';
}

export type BuildProfileResult =
  | {ok: true; profile: Profile}
  | {ok: false; problems: readonly FieldProblem[]};

/** Digits only, no sign, no exponent: anything else is a typing problem, not a range problem. */
function toNumber(raw: string): number | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (!/^\d+(?:[.,]\d+)?$/.test(value)) return null;
  return Number(value.replace(',', '.'));
}

function numberField(raw: string, field: FieldKey, problems: FieldProblem[]): number {
  const parsed = toNumber(raw);
  if (parsed === null) {
    problems.push({field, kind: raw.trim().length === 0 ? 'EMPTY' : 'NOT_A_NUMBER'});
    return 0;
  }
  return parsed;
}

/**
 * Assemble a `Profile` from the draft. Returns every structural problem at once so the UI can mark
 * all offending fields; engine validation runs afterwards on the assembled profile.
 */
export function buildProfile(draft: QuestionnaireDraft): BuildProfileResult {
  const problems: FieldProblem[] = [];

  let performance: Profile['performance'] = null;
  if (draft.hasResult) {
    const time = parseTime(draft.resultTime);
    if (!time.ok) problems.push({field: 'resultTime', kind: time.error});
    // The baseline date is as material as the time: an empty or malformed date is caught here,
    // while calendar rules (not in the future, not stale) stay with the engine.
    if (draft.resultDate.trim().length === 0) problems.push({field: 'resultDate', kind: 'EMPTY'});
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.resultDate)) problems.push({field: 'resultDate', kind: 'FORMAT'});
    if (time.ok) performance = {timeSeconds: time.seconds, date: draft.resultDate, source: draft.resultSource};
  }

  const target = parseTime(draft.targetTime);
  if (!target.ok) problems.push({field: 'targetTime', kind: target.error});

  const breaks: Profile['breaks'] = draft.hasBreaks
    ? draft.breaks.map((entry) => {
        const days = numberField(entry.days, 'breaks', problems);
        if (entry.endDate.trim().length === 0) problems.push({field: 'breaks', kind: 'EMPTY'});
        else if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.endDate)) problems.push({field: 'breaks', kind: 'FORMAT'});
        return {days, endDate: entry.endDate, reason: entry.reason};
      })
    : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.raceDate)) problems.push({field: 'raceDate', kind: draft.raceDate.trim().length === 0 ? 'EMPTY' : 'FORMAT'});

  // Unanswered capability/mismatch questions are problems, not silent defaults: they decide the
  // beginner path and whether the stored result may be trusted.
  if (draft.canRun3Km === null) problems.push({field: 'canRun3Km', kind: 'EMPTY'});
  // The mismatch question is about the stored result, so the no-result path never asks it.
  if (draft.hasResult && draft.performanceMismatch === null) problems.push({field: 'performanceMismatch', kind: 'EMPTY'});

  // Inexact recollections are never treated as confirmed fast-training counts.
  const exactQuality = draft.qualityRecall === 'EXACT' || draft.qualityRecall === undefined;
  const profile: Profile = {
    performance,
    targetTimeSeconds: target.ok ? target.seconds : 0,
    raceDate: draft.raceDate,
    regularRunningWeeks: numberField(draft.regularRunningWeeks, 'regularRunningWeeks', problems),
    actualRunsPerWeek: numberField(draft.actualRunsPerWeek, 'actualRunsPerWeek', problems),
    availableRunsPerWeek: numberField(draft.availableRunsPerWeek, 'availableRunsPerWeek', problems),
    averageWeeklyKm4Weeks: numberField(draft.averageWeeklyKm4Weeks, 'averageWeeklyKm4Weeks', problems),
    longestUsualRunKm: numberField(draft.longestUsualRunKm, 'longestUsualRunKm', problems),
    canRun3Km: draft.canRun3Km === true,
    qualitySessions8Weeks: exactQuality ? numberField(draft.qualitySessions8Weeks, 'qualitySessions8Weeks', problems) : 0,
    qualityWeeks8Weeks: exactQuality ? numberField(draft.qualityWeeks8Weeks, 'qualityWeeks8Weeks', problems) : 0,
    qualityMostlyTolerated: exactQuality ? draft.qualityMostlyTolerated : false,
    experience: {...draft.experience},
    breaks,
    safety: {...draft.safety},
    performanceMismatch: draft.performanceMismatch ?? 'NONE',
  };

  return problems.length > 0 ? {ok: false, problems} : {ok: true, profile};
}

/** Step that owns a draft field, so an engine rejection can send the user to the right screen. */
export const STEP_FOR_FIELD: Record<FieldKey, QuestionnaireStep> = {
  resultTime: 'RESULT', resultDate: 'RESULT', resultSource: 'RESULT',
  canRun3Km: 'VOLUME', regularRunningWeeks: 'VOLUME', actualRunsPerWeek: 'VOLUME',
  averageWeeklyKm4Weeks: 'VOLUME', longestUsualRunKm: 'VOLUME',
  qualitySessions8Weeks: 'QUALITY', qualityWeeks8Weeks: 'QUALITY',
  safety: 'SAFETY', breaks: 'BREAKS',
  availableRunsPerWeek: 'AVAILABILITY', performanceMismatch: 'AVAILABILITY',
  targetTime: 'GOAL', raceDate: 'RACE_DATE',
};

/**
 * Best-effort attribution of an engine code to a questionnaire step. Only unambiguous codes are
 * mapped; anything else is shown on the review screen without pointing at a field, rather than
 * guessing. The engine stays the authority on what is wrong.
 */
export const FIELD_FOR_CODE: Partial<Record<EngineErrorCode, FieldKey>> = {
  AVAILABILITY_NOT_INTEGER: 'availableRunsPerWeek',
  INVALID_QUALITY_WEEKS: 'qualityWeeks8Weeks',
  INVALID_MISMATCH: 'performanceMismatch',
  INVALID_PERFORMANCE_SOURCE: 'resultSource',
  FUTURE_PERFORMANCE: 'resultDate',
  INVALID_BREAK_REASON: 'breaks',
  INVALID_BREAK: 'breaks',
  EVENT_DATE_PASSED: 'raceDate',
};

export const STEP_FOR_CODE: Partial<Record<EngineErrorCode, QuestionnaireStep>> = {
  ...Object.fromEntries(Object.entries(FIELD_FOR_CODE).map(([code, field]) => [code, STEP_FOR_FIELD[field]])),
  INVALID_PROFILE_FLAG: 'VOLUME',
  INVALID_SAFETY_FLAG: 'SAFETY',
  NUMBER_OUT_OF_RANGE: 'VOLUME',
  INVALID_DATE_FORMAT: 'RACE_DATE',
  INVALID_CALENDAR_DATE: 'RACE_DATE',
} as Partial<Record<EngineErrorCode, QuestionnaireStep>>;
