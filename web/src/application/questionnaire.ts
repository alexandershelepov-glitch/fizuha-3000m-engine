/**
 * The onboarding questionnaire: the draft the user fills in, and the conversion into the exact
 * `Profile` the engine expects.
 *
 * Only structural checks happen here (is the field filled, is it a number, is the time well formed).
 * Ranges, cross-field rules and calendar rules stay with the engine and are reported by code.
 */
import {parseTime} from './format.ts';
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

export interface QuestionnaireDraft {
  readonly hasResult: boolean;
  readonly resultTime: string;
  readonly resultDate: string;
  readonly resultSource: PerformanceSource;
  readonly canRun3Km: boolean;
  readonly regularRunningWeeks: string;
  readonly actualRunsPerWeek: string;
  readonly averageWeeklyKm4Weeks: string;
  readonly longestUsualRunKm: string;
  readonly qualitySessions8Weeks: string;
  readonly qualityWeeks8Weeks: string;
  readonly qualityMostlyTolerated: boolean;
  readonly experience: {readonly threshold: boolean; readonly vo2: boolean; readonly specific3k: boolean};
  readonly safety: SafetyData;
  readonly hasBreaks: boolean;
  readonly breaks: readonly BreakEntryDraft[];
  readonly availableRunsPerWeek: string;
  readonly performanceMismatch: PerformanceMismatch;
  readonly targetTime: string;
  readonly raceDate: string;
}

export function healthySafety(): SafetyData {
  return {pain: 0, painIncreasing: false, alteredMovement: false, painWalkingOrRest: false, swelling: false, acuteIllness: false, otherStop: false, needsAssessment: false};
}

export function defaultDraft(today: string): QuestionnaireDraft {
  return {
    hasResult: true,
    resultTime: '',
    resultDate: today,
    resultSource: 'TEST_3K',
    canRun3Km: true,
    regularRunningWeeks: '8',
    actualRunsPerWeek: '3',
    averageWeeklyKm4Weeks: '15',
    longestUsualRunKm: '5',
    qualitySessions8Weeks: '0',
    qualityWeeks8Weeks: '0',
    qualityMostlyTolerated: true,
    experience: {threshold: false, vo2: false, specific3k: false},
    safety: healthySafety(),
    hasBreaks: false,
    breaks: [],
    availableRunsPerWeek: '3',
    performanceMismatch: 'NONE',
    targetTime: '',
    raceDate: addDaysIso(today, 56),
  };
}

function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
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
    else performance = {timeSeconds: time.seconds, date: draft.resultDate, source: draft.resultSource};
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

  const profile: Profile = {
    performance,
    targetTimeSeconds: target.ok ? target.seconds : 0,
    raceDate: draft.raceDate,
    regularRunningWeeks: numberField(draft.regularRunningWeeks, 'regularRunningWeeks', problems),
    actualRunsPerWeek: numberField(draft.actualRunsPerWeek, 'actualRunsPerWeek', problems),
    availableRunsPerWeek: numberField(draft.availableRunsPerWeek, 'availableRunsPerWeek', problems),
    averageWeeklyKm4Weeks: numberField(draft.averageWeeklyKm4Weeks, 'averageWeeklyKm4Weeks', problems),
    longestUsualRunKm: numberField(draft.longestUsualRunKm, 'longestUsualRunKm', problems),
    canRun3Km: draft.canRun3Km,
    qualitySessions8Weeks: numberField(draft.qualitySessions8Weeks, 'qualitySessions8Weeks', problems),
    qualityWeeks8Weeks: numberField(draft.qualityWeeks8Weeks, 'qualityWeeks8Weeks', problems),
    qualityMostlyTolerated: draft.qualityMostlyTolerated,
    experience: {...draft.experience},
    breaks,
    safety: {...draft.safety},
    performanceMismatch: draft.performanceMismatch,
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
