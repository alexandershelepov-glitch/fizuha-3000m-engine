/**
 * Independent 12-week methodology audit of the 3000 m engine (branch audit/3000m-full-cycle-12w).
 *
 * This EXTENDS the existing audit harness (audit/trainingSimulator.ts): it reuses SIM_START, healthySafety and the
 * synthetic result builder `makeResult`, and drives only the PUBLIC engine operations (createEngine, replan,
 * recordResult, skipWorkout, recordCheckpoint, recordFinalResult, resolveDiagnostic, updateTrainingData). It does NOT
 * contain a planner and does not change the methodology.
 *
 * EVERYTHING the "virtual users" do is SYNTHETIC. Nothing here predicts a real athlete's adaptation:
 *  - results of workouts are scripted by the behaviour (A/B/V), never measured;
 *  - 3000 m control results are EXTERNAL SCENARIO INPUT. In the required matrix a control equals the user's initial
 *    time (no invented improvement); only the explicitly labelled sensitivity scenarios (S) feed a different
 *    external time, and they are reported separately.
 */
import {
  EngineError, addDays, createEngine, recordCheckpoint, recordFinalResult, recordResult, replan, resolveDiagnostic,
  skipWorkout, updateTrainingData,
} from '../src/index.ts';
import type {EngineState, Evaluation, Profile, Workout, WorkoutResult, WorkoutType} from '../src/index.ts';
import {reservedMetres} from '../src/weeklyLoad.ts';
import {SIM_START, healthySafety, makeResult} from './trainingSimulator.ts';
import {deriveToday} from '../web/src/application/uiState.ts';
import {workoutInstruction, workoutIntervals} from '../web/src/ui/workoutInstructions.ts';
import type {WorkoutInstruction} from '../web/src/ui/workoutInstructions.ts';

export const CYCLE_WEEKS = 12;
export const CYCLE_DAYS = CYCLE_WEEKS * 7;

// ------------------------------------------------------------------------------------------------ virtual users
export interface AuditUser {
  id: string; n: number; label: string;
  /** null = the user has no current 3000 m result (novice). Never replaced by the goal. */
  currentSeconds: number | null;
  goalSeconds: number;
  /** True only for the novice: the goal time is a PLACEHOLDER (the brief gives no time, only "learn to cover the distance"). */
  goalIsPlaceholder: boolean;
  runsPerWeek: number; availableRunsPerWeek: number;
  weeklyKm: number; weeklyKmNote: string;
  longestKm: number; regularWeeks: number;
  qualitySessions: number; qualityWeeks: number; qualityTolerated: boolean;
  experience: {threshold: boolean; vo2: boolean; specific3k: boolean};
  canRun3Km: boolean;
  /** Questionnaire choices that the brief leaves open, written down so the audit is reproducible. */
  assumptions: string;
}

export const USERS: readonly AuditUser[] = [
  {id: 'U1-novice', n: 1, label: 'Новичок', currentSeconds: null, goalSeconds: 1200, goalIsPlaceholder: true,
    runsPerWeek: 1, availableRunsPerWeek: 3, weeklyKm: 2, weeklyKmNote: 'минимальный (допущение 2 км)', longestKm: 1.5, regularWeeks: 3,
    qualitySessions: 0, qualityWeeks: 0, qualityTolerated: false, experience: {threshold: false, vo2: false, specific3k: false}, canRun3Km: false,
    assumptions: 'Нет результата 3000 м, не может бежать 3 км подряд. Цель во времени в ТЗ не задана — подставлено 20:00 как техническая заглушка. 1 пробежка/нед фактически, 3 доступно, 3 недели регулярного бега.'},
  {id: 'U2-beginner', n: 2, label: 'Начинающий', currentSeconds: 1080, goalSeconds: 896, goalIsPlaceholder: false,
    runsPerWeek: 2, availableRunsPerWeek: 2, weeklyKm: 9, weeklyKmNote: '8–10 км → 9', longestKm: 5, regularWeeks: 12,
    qualitySessions: 0, qualityWeeks: 0, qualityTolerated: false, experience: {threshold: false, vo2: false, specific3k: false}, canRun3Km: true,
    assumptions: 'Середина диапазона 8–10 км = 9 км; доступно столько же пробежек, сколько бегает (2); качественных тренировок за 8 недель нет.'},
  {id: 'U3-beginner-plus', n: 3, label: 'Начинающий+', currentSeconds: 990, goalSeconds: 896, goalIsPlaceholder: false,
    runsPerWeek: 3, availableRunsPerWeek: 3, weeklyKm: 13.5, weeklyKmNote: '12–15 км → 13,5', longestKm: 6, regularWeeks: 20,
    qualitySessions: 0, qualityWeeks: 0, qualityTolerated: false, experience: {threshold: false, vo2: false, specific3k: false}, canRun3Km: true,
    assumptions: 'Середина диапазона 12–15 км = 13,5 км; доступно 3 пробежки; качественных за 8 недель нет.'},
  {id: 'U4-intermediate', n: 4, label: 'Средний уровень', currentSeconds: 930, goalSeconds: 870, goalIsPlaceholder: false,
    runsPerWeek: 3, availableRunsPerWeek: 3, weeklyKm: 19, weeklyKmNote: '18–20 км → 19', longestKm: 8, regularWeeks: 40,
    qualitySessions: 4, qualityWeeks: 3, qualityTolerated: true, experience: {threshold: true, vo2: false, specific3k: false}, canRun3Km: true,
    assumptions: 'Середина диапазона 18–20 км = 19 км; 3 пробежки; 4 качественные за 8 недель в 3 неделях, переносились нормально; опыт темповых.'},
  {id: 'U5-trained', n: 5, label: 'Подготовленный', currentSeconds: 870, goalSeconds: 810, goalIsPlaceholder: false,
    runsPerWeek: 4, availableRunsPerWeek: 4, weeklyKm: 25, weeklyKmNote: '25 км', longestKm: 9, regularWeeks: 40,
    qualitySessions: 6, qualityWeeks: 4, qualityTolerated: true, experience: {threshold: true, vo2: false, specific3k: false}, canRun3Km: true,
    assumptions: '4 пробежки, 25 км, длинная 9 км; 6 качественных за 8 недель в 4 неделях; опыт темповых.'},
  {id: 'U6-experienced', n: 6, label: 'Опытный', currentSeconds: 750, goalSeconds: 720, goalIsPlaceholder: false,
    runsPerWeek: 5, availableRunsPerWeek: 5, weeklyKm: 37.5, weeklyKmNote: '35–40 км → 37,5', longestKm: 15, regularWeeks: 150,
    qualitySessions: 16, qualityWeeks: 8, qualityTolerated: true, experience: {threshold: true, vo2: true, specific3k: true}, canRun3Km: true,
    assumptions: 'Из «4–5 раз в неделю» взято верхнее значение 5 (чтобы отличаться от №5); 37,5 км; длинная 15 км; 16 качественных за 8 недель в 8 неделях; опыт всех типов.'},
];

export function makeAuditProfile(u: AuditUser): Profile {
  return {
    performance: u.currentSeconds === null ? null : {timeSeconds: u.currentSeconds, date: SIM_START, source: 'TEST_3K'},
    targetTimeSeconds: u.goalSeconds, raceDate: addDays(SIM_START, CYCLE_DAYS),
    regularRunningWeeks: u.regularWeeks, actualRunsPerWeek: u.runsPerWeek, availableRunsPerWeek: u.availableRunsPerWeek,
    averageWeeklyKm4Weeks: u.weeklyKm, longestUsualRunKm: u.longestKm, canRun3Km: u.canRun3Km,
    qualitySessions8Weeks: u.qualitySessions, qualityWeeks8Weeks: u.qualityWeeks, qualityMostlyTolerated: u.qualityTolerated,
    experience: {...u.experience}, breaks: [], safety: healthySafety(), performanceMismatch: 'NONE',
  };
}

// ------------------------------------------------------------------------------------------------ behaviours / scenarios
export type BehaviourId = 'A' | 'B' | 'V' | 'S';
export const BEHAVIOURS: Record<BehaviourId, {title: string; description: string}> = {
  A: {title: 'А. Успешное выполнение', description: 'Каждое назначенное занятие выполняется по плану (синтетический отчёт GREEN: темп в коридоре, RPE по середине цели). Контрольные 3000 м = исходное время (внешний ввод, без улучшения).'},
  B: {title: 'Б. Периодические неудачи', description: 'Каждое третье беговое занятие не удаётся: нечётные неудачи — недобор дистанции (70 %, усталость), чётные — темп медленнее коридора на ~12 %. Остальные выполнены по плану. Контрольные = исходное время.'},
  V: {title: 'В. Пропуски отдельных тренировок', description: 'Каждое четвёртое назначенное беговое занятие пропускается (явный skipWorkout), остальные выполняются по плану. Контрольные = исходное время.'},
  S: {title: 'S. Чувствительность (дополнительно)', description: 'Как А, но внешний ввод контрольных 3000 м улучшается на 2 % за каждый контрольный забег (сценарный ввод, НЕ прогноз). Нужен, чтобы увидеть реакцию плана на результат, а не только на выполнение.'},
};
export const NOVICE_CONTROL_SECONDS = 1260; // EXTERNAL scenario input: novice's first timed 3000 m after attesting continuous 3 km (21:00)
export const SENSITIVITY_STEP = 0.02;

export interface AuditScenario {id: string; user: AuditUser; behaviour: BehaviourId; required: boolean}
export const SCENARIOS: readonly AuditScenario[] = [
  ...USERS.flatMap(user => (['A', 'B', 'V'] as const).map(behaviour => ({id: `${user.id}-${behaviour}`, user, behaviour, required: true}))),
  ...USERS.filter(u => u.currentSeconds !== null).map(user => ({id: `${user.id}-S`, user, behaviour: 'S' as const, required: false})),
];

// ------------------------------------------------------------------------------------------------ records
export type Outcome = 'ON_PLAN' | 'SHORTFALL' | 'SLOW_PACE' | 'SKIPPED' | 'REST' | 'CONTROL' | 'DISPLACED_BY_CONTROL';
export interface NumericCheck {
  hasQuantity: boolean; hasPace: boolean; hasTreadmill: boolean; hasRepeatCount: boolean; hasRepeatTime: boolean; hasRest: boolean;
  gaps: string[]; gapClass: 'NONE' | 'JUSTIFIED' | 'DEFICIT';
  note: string;
}
export interface WorkoutRow {
  scenarioId: string; userId: string; behaviour: BehaviourId;
  date: string; offset: number; week: number; weekday: number;
  workoutId: string; type: WorkoutType; mode: string; goal: string; countsAsQuality: boolean;
  doseUnit: string; doseValue: number;
  /** Reviewer's estimate of distance incl. warm-up/cool-down/recoveries. NOT an engine value. */
  estMetersTotal: number; estMetersMain: number; estBasis: string;
  warmupMinutes: number; cooldownMinutes: number;
  paceFast: number | null; paceSlow: number | null; speedKmhLow: number | null; speedKmhHigh: number | null;
  relSpeedLow: number | null; relSpeedHigh: number | null;
  repeats: number; repeatMeters: number | null; finalRepeatMeters: number | null; perRepeatSeconds: number | null;
  restSeconds: number; targetRpe: [number, number]; anchor: string; gate: string; phase: string; confidence: string; capacity: string;
  runWalk: string | null; calibration: boolean; reasons: string[];
  instruction: {headline: string; steps: string[]; paceText: string | null; speedText: string | null; splits: string[]};
  numeric: NumericCheck;
  outcome: Outcome; evaluation: Evaluation | null; yellowReason: string | null;
  reportedRpe: number | null; completionFraction: number; reportedMeters: number | null;
  /** Synthetic: est total metres × completion fraction (0 when skipped). */
  actualEstMeters: number;
  approvedWeekMeters: number | null;
  /** The ENGINE's own weekly-booking reservation for this session (`reservedMetres`), at the state the session was planned in. A protective ceiling, not a distance. */
  reservedMeters: number | null;
  stateAfter: {phase: string; gate: string; hold: boolean; progressionBlocked: boolean; checkpointRequired: boolean; maxQuality: number};
}
export interface DayRow {
  date: string; offset: number; week: number; state: string; phase: string; gate: string; confidence: string;
  hold: boolean; progressionBlocked: boolean; checkpointRequired: boolean; approvedWeekMeters: number | null; queueTypes: string[];
}
export interface EventRow {date: string; offset: number; week: number; kind: string; detail: string; synthetic: true}
export interface ScenarioRun {
  scenario: AuditScenario; rows: WorkoutRow[]; days: DayRow[]; events: EventRow[]; engineErrors: {date: string; code: string; detail: string}[];
  /** The engine's own assessment of the user on day 0 (before any workout). */
  initial: {capacity: string; quality: string; phase: string; gate: string; feasibility: string | null; goalGap: number | null; confidence: string; maxQuality: number; reasons: string[]};
  finalState: EngineState; finalResultSeconds: number | null; controlSeconds: number[];
}

// ------------------------------------------------------------------------------------------------ helpers
const isRunning = (w: Workout): boolean => w.type !== 'REST';
const weekOf = (offset: number): number => Math.floor(offset / 7) + 1;
export const secondsText = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Reviewer's distance estimate. Engine reservations are NOT used: they are a protective ceiling, not an expected distance. */
export function estimateMeters(w: Workout, performanceSeconds: number | null): {main: number; total: number; basis: string} {
  if (w.type === 'REST') return {main: 0, total: 0, basis: 'rest'};
  const race = performanceSeconds === null ? null : 3000 / performanceSeconds;
  const easy = race === null ? (w.main.mode === 'RUN_WALK' ? 1.5 : 2.2) : race * 0.65;
  let main = 0; let basis = 'distance';
  if (w.main.dose.unit === 'METERS') main = w.main.dose.value;
  else {
    const speed = w.speedRangeMps !== null ? (w.speedRangeMps[0] + w.speedRangeMps[1]) / 2 : race !== null ? race * 0.97 : 2.5;
    basis = w.speedRangeMps !== null ? 'minutes×prescribed pace' : 'minutes×assumed speed';
    main = w.main.dose.value * 60 * speed;
  }
  const recoveries = w.main.mode === 'INTERVALS' ? Math.max(0, w.main.repeats - 1) * w.restSeconds * 0.5 * easy : 0;
  const total = main + (w.warmupMinutes + w.cooldownMinutes) * 60 * easy + recoveries;
  return {main, total, basis};
}

/** What a person can actually do from the card shown by the app, and whether a missing number is justified by design. */
export function numericCheck(w: Workout, ins: WorkoutInstruction, perf: number | null, confidence: string): NumericCheck {
  const intervals = workoutIntervals(w);
  const hasQuantity = w.main.mode === 'REST' || w.main.dose.value > 0;
  const hasPace = ins.paceText !== null; const hasTreadmill = ins.speedText !== null;
  const interval = w.main.mode === 'INTERVALS';
  const hasRepeatCount = !interval || w.main.repeats >= 1;
  const hasRepeatTime = !interval || ins.splits.length > 0 || (intervals?.perRepeatSeconds ?? null) !== null;
  const hasRest = !interval || w.restSeconds > 0;
  const gaps: string[] = []; let gapClass: NumericCheck['gapClass'] = 'NONE'; let note = '';
  if (w.type === 'REST') return {hasQuantity, hasPace, hasTreadmill, hasRepeatCount, hasRepeatTime, hasRest, gaps, gapClass, note: 'день отдыха'};
  if (!hasQuantity) gaps.push('нет дистанции/длительности');
  if (interval && !hasRepeatTime) gaps.push('нет времени отрезка');
  if (interval && !hasRest) gaps.push('нет восстановления');
  const paceRequired = w.type === 'EASY' || w.type === 'LONG_EASY' || w.type === 'THRESHOLD' || w.type === 'VO2' || w.type === 'SPECIFIC_3K' || w.type === 'STRIDES';
  if (paceRequired && w.main.mode !== 'RUN_WALK' && !hasPace) {
    gaps.push('нет целевого темпа (мин/км)'); if (!hasTreadmill) gaps.push('нет скорости дорожки (км/ч)');
  }
  if (gaps.length === 0) return {hasQuantity, hasPace, hasTreadmill, hasRepeatCount, hasRepeatTime, hasRest, gaps, gapClass, note};
  if (w.main.calibration === true) { gapClass = 'JUSTIFIED'; note = 'калибровочная пробежка: темп намеренно не задаётся, пока нет двух измеренных EASY'; }
  else if (w.type === 'INTRO_QUALITY') { gapClass = 'JUSTIFIED'; note = 'вводное качество по ощущениям (RPE 5–6): темп не задан намеренно'; }
  else if (w.type === 'CONTROL') { gapClass = 'JUSTIFIED'; note = 'контрольный забег 3000 м — максимальное усилие без целевого темпа'; }
  else if ((w.type === 'EASY' || w.type === 'LONG_EASY') && perf === null && !w.main.calibration) { gapClass = 'DEFICIT'; note = 'нет 3 км результата и не калибровка: бегун получает дистанцию, но не получает темп'; }
  else { gapClass = 'DEFICIT'; note = perf !== null && confidence !== 'HIGH' && confidence !== 'MEDIUM' ? `результат 3000 м есть, но доверие «${confidence}» — темп скрыт` : 'числовое указание отсутствует без объяснимой причины'; }
  return {hasQuantity, hasPace, hasTreadmill, hasRepeatCount, hasRepeatTime, hasRest, gaps, gapClass, note};
}

function controlResult(w: Workout, seconds: number): WorkoutResult {
  return {
    date: w.scheduledDate, completionFraction: 1, sessionRpe: 8.5, safety: healthySafety(),
    durationMinutes: w.warmupMinutes + w.cooldownMinutes + seconds / 60, distanceMeters: 3000,
    repeats: [], restSeconds: [], conditions: {}, unexpectedFatigue: false, feedbackConfirmed: true,
  };
}
/** Synthetic: the same measurement as an on-plan result, but covered ~12 % slower (below the prescribed corridor). */
function slowPaceResult(w: Workout): WorkoutResult {
  const base = makeResult(w, 'GREEN');
  const f = 1 / 0.88;
  const target = (w.targetRpe[0] + w.targetRpe[1]) / 2;
  return {...base, repeats: base.repeats.map(r => ({distanceMeters: r.distanceMeters, seconds: r.seconds * f})),
    durationMinutes: base.durationMinutes + (base.repeats.reduce((n, r) => n + r.seconds, 0) * (f - 1)) / 60,
    sessionRpe: Math.min(10, target + 1.5), unexpectedFatigue: false};
}

function snapshot(s: EngineState): ScenarioRun['rows'][number]['stateAfter'] {
  return {phase: s.decision.phase, gate: s.decision.gate, hold: s.decision.safety !== 'OK' || s.diagnosticHold || s.relatedYellow,
    progressionBlocked: s.progressionBlocked, checkpointRequired: s.checkpointRequired, maxQuality: s.decision.maximumQualityPerWeek};
}

// ------------------------------------------------------------------------------------------------ simulation
export function simulateAudit(scenario: AuditScenario): ScenarioRun {
  const {user, behaviour} = scenario;
  const profile = makeAuditProfile(user);
  let state = createEngine(profile, SIM_START);
  const d0 = state.decision;
  const initial = {capacity: d0.capacity, quality: d0.quality, phase: d0.phase, gate: d0.gate, feasibility: d0.feasibility, goalGap: d0.goalGap === null ? null : Math.round(d0.goalGap * 1000) / 1000, confidence: d0.confidence, maxQuality: d0.maximumQualityPerWeek, reasons: [...d0.reasons]};
  const rows: WorkoutRow[] = []; const days: DayRow[] = []; const events: EventRow[] = [];
  const engineErrors: ScenarioRun['engineErrors'] = [];
  const controlSeconds: number[] = [];
  let runIndex = 0; let failKind = 0; let holdSince: number | null = null; let confirmDone = false; let confirmGiveUp = false;
  const log = (offset: number, kind: string, detail: string): void => {events.push({date: addDays(SIM_START, offset), offset, week: weekOf(offset), kind, detail, synthetic: true});};

  const controlTime = (): number => {
    const k = controlSeconds.length + 1;
    if (user.currentSeconds === null) return state.profile.performance?.timeSeconds ?? NOVICE_CONTROL_SECONDS;
    if (behaviour === 'S') return Math.round(user.currentSeconds * (1 - SENSITIVITY_STEP * k));
    // required matrix: the external control equals the user's last known time → no invented improvement
    return state.profile.performance?.timeSeconds ?? user.currentSeconds;
  };

  const addRow = (offset: number, today: string, w: Workout, outcome: Outcome, result: WorkoutResult | null, before: EngineState): void => {
    const d = before.decision; const perf = before.profile.performance?.timeSeconds ?? null;
    const ins = workoutInstruction(w);
    const est = estimateMeters(w, perf);
    const classified = result === null ? null : state.history.find(h => h.workout.id === w.id)?.classified ?? null;
    const race = perf === null ? null : 3000 / perf;
    const iv = workoutIntervals(w);
    const perRepeat = w.main.mode !== 'INTERVALS' ? null : iv?.perRepeatSeconds ?? (w.speedRangeMps !== null && w.main.repeatMeters !== null ? w.main.repeatMeters / ((w.speedRangeMps[0] + w.speedRangeMps[1]) / 2) : null);
    const completion = outcome === 'SKIPPED' || outcome === 'DISPLACED_BY_CONTROL' ? 0 : result?.completionFraction ?? 1;
    rows.push({
      scenarioId: scenario.id, userId: user.id, behaviour, date: today, offset, week: weekOf(offset), weekday: offset % 7,
      workoutId: w.id, type: w.type, mode: w.main.mode, goal: w.goal, countsAsQuality: w.countsAsQuality,
      doseUnit: w.main.dose.unit, doseValue: round1(w.main.dose.value),
      estMetersTotal: Math.round(est.total), estMetersMain: Math.round(est.main), estBasis: est.basis,
      warmupMinutes: w.warmupMinutes, cooldownMinutes: w.cooldownMinutes,
      paceFast: w.paceRangeSecondsPerKm?.[0] ?? null, paceSlow: w.paceRangeSecondsPerKm?.[1] ?? null,
      speedKmhLow: w.speedRangeMps ? round1(w.speedRangeMps[0] * 3.6) : null, speedKmhHigh: w.speedRangeMps ? round1(w.speedRangeMps[1] * 3.6) : null,
      relSpeedLow: w.speedRangeMps && race ? Math.round(w.speedRangeMps[0] / race * 1000) / 1000 : null,
      relSpeedHigh: w.speedRangeMps && race ? Math.round(w.speedRangeMps[1] / race * 1000) / 1000 : null,
      repeats: w.main.repeats, repeatMeters: w.main.repeatMeters, finalRepeatMeters: w.main.finalRepeatMeters === null ? null : round1(w.main.finalRepeatMeters),
      perRepeatSeconds: perRepeat === null ? null : Math.round(perRepeat),
      restSeconds: w.restSeconds, targetRpe: w.targetRpe, anchor: w.anchor, gate: w.gateAtPrescription, phase: d.phase, confidence: d.confidence, capacity: d.capacity,
      runWalk: w.main.runWalk ? `${w.main.runWalk.runSeconds}с бег / ${w.main.runWalk.walkSeconds}с шаг (этап ${w.main.runWalk.stage})` : null,
      calibration: w.main.calibration === true, reasons: [...d.reasons],
      instruction: {headline: ins.headline, steps: [...ins.steps], paceText: ins.paceText, speedText: ins.speedText, splits: ins.splits.map(x => x.text)},
      numeric: numericCheck(w, ins, perf, d.confidence),
      outcome, evaluation: classified?.evaluation ?? null, yellowReason: classified?.yellowReason ?? null,
      reportedRpe: result?.sessionRpe ?? null, completionFraction: completion, reportedMeters: result?.distanceMeters ?? null,
      actualEstMeters: Math.round(est.total * completion),
      approvedWeekMeters: before.easyProgression?.approvedMetersPer7Days ?? null,
      reservedMeters: (() => { const v = reservedMetres(before, w); return v === null ? null : Math.round(v); })(),
      stateAfter: snapshot(state),
    });
  };

  for (let offset = 0; offset <= CYCLE_DAYS; offset++) {
    const today = addDays(SIM_START, offset);
    if (offset === CYCLE_DAYS) {
      state = replan(state, today);
      const perf = state.profile.performance;
      if (perf === null) {
        log(offset, 'NO_FINAL_RESULT', 'У пользователя нет текущего результата 3000 м; итоговый результат НЕ придумывается (синтетический сценарий не вводит его).');
      } else {
        // EXTERNAL scenario input: the race result equals the last known measured time (no automatic improvement).
        state = recordFinalResult(state, {timeSeconds: perf.timeSeconds, date: today, source: 'TEST_3K'}, today);
        log(offset, 'EXTERNAL_FINAL_RACE', `Итоговый результат = последний известный (${secondsText(perf.timeSeconds)}); улучшение не предполагается.`);
      }
      days.push({date: today, offset, week: weekOf(offset), state: deriveToday(state, today).state, phase: state.decision.phase, gate: state.decision.gate, confidence: state.decision.confidence, hold: false, progressionBlocked: state.progressionBlocked, checkpointRequired: state.checkpointRequired, approvedWeekMeters: state.easyProgression?.approvedMetersPer7Days ?? null, queueTypes: []});
      break;
    }
    state = replan(state, today);

    // ---- external scenario inputs
    if (user.currentSeconds === null && !confirmDone && !confirmGiveUp) {
      const attemptFrom = behaviour === 'A' ? 42 : 56;
      if (offset >= attemptFrom) {
        const blocked = state.decision.safety !== 'OK' || state.diagnosticHold || state.relatedYellow || state.progressionBlocked || state.reentry !== null;
        if (!blocked) {
          state = updateTrainingData(state, {canRun3Km: true}, today); confirmDone = true;
          log(offset, 'EXTERNAL_CONFIRM_CONTINUOUS_3K', 'Синтетическое подтверждение: пользователь заявляет, что пробежал 3 км без остановки (ввод оператора, не измерение).');
        } else if (offset >= 77) { confirmGiveUp = true; log(offset, 'CONFIRM_3K_NEVER_ALLOWED', 'С дня 56 подтверждение 3 км недоступно из-за блокировок (hold/progressionBlocked) до конца окна попыток.'); }
      }
    }
    const inHold = state.decision.safety !== 'OK' || state.diagnosticHold || state.relatedYellow;
    if (inHold) {
      holdSince ??= offset;
      if (offset - holdSince >= 7) {
        state = resolveDiagnostic(state, healthySafety(), today); holdSince = null;
        log(offset, 'EXTERNAL_HOLD_CLEARED', 'Синтетически: через 7 дней виртуальный пользователь сообщает об отсутствии симптомов (явная проверка, не автоматическое снятие).');
      }
    } else holdSince = null;

    const view = deriveToday(state, today);
    const todays = state.queue.find(w => w.scheduledDate === today) ?? null;
    days.push({date: today, offset, week: weekOf(offset), state: view.state, phase: state.decision.phase, gate: state.decision.gate, confidence: state.decision.confidence,
      hold: state.decision.safety !== 'OK' || state.diagnosticHold || state.relatedYellow, progressionBlocked: state.progressionBlocked,
      checkpointRequired: state.checkpointRequired, approvedWeekMeters: state.easyProgression?.approvedMetersPer7Days ?? null, queueTypes: state.queue.map(w => w.type)});

    // ---- control run demanded by the app (CHECKPOINT_REQUIRED / PERFORMANCE_REVIEW) is the day's session
    if (view.state === 'CHECKPOINT_REQUIRED' || view.state === 'PERFORMANCE_REVIEW') {
      const before = state;
      const seconds = controlTime();
      try {
        // Probe first (the engine is pure): if the control result would be refused, nothing about today's plan changes.
        recordCheckpoint(before, {timeSeconds: seconds, date: today, source: 'TEST_3K'}, today);
        if (todays !== null && todays.type === 'CONTROL') {
          const r = controlResult(todays, seconds);
          state = recordResult(state, todays.id, r); addRow(offset, today, todays, 'CONTROL', r, before);
        } else if (todays !== null && todays.type !== 'REST') {
          state = skipWorkout(state, todays.id, today); addRow(offset, today, todays, 'DISPLACED_BY_CONTROL', null, before);
          log(offset, 'WORKOUT_DISPLACED_BY_CONTROL', `Приложение показывает экран «контрольный результат» вместо карточки ${todays.type}; сессия закрывается как «не выполнена».`);
        }
        state = recordCheckpoint(state, {timeSeconds: seconds, date: today, source: 'TEST_3K'}, today);
        controlSeconds.push(seconds);
        log(offset, 'EXTERNAL_3K_CONTROL', `Внешний сценарный ввод контрольных 3000 м: ${secondsText(seconds)} (${user.currentSeconds === null ? 'первый хронометрируемый результат новичка — заданное значение' : behaviour === 'S' ? `сценарий S: −${SENSITIVITY_STEP * 100}% за контроль` : 'равен исходному, улучшение не предполагается'}).`);
        continue;
      } catch (error) {
        if (!(error instanceof EngineError)) throw error;
        engineErrors.push({date: today, code: error.code, detail: `экран «${view.state}» требует контрольный результат, движок отказал`});
        if (!events.some(e => e.kind === 'CONTROL_REFUSED' && e.date === today)) log(offset, 'CONTROL_REFUSED', `Экран ${view.state} требует контрольный результат, движок отказал: ${error.code}`);
      }
    }

    const workout = state.queue.find(w => w.scheduledDate === today) ?? null;
    if (workout === null) continue;
    const before = state;

    if (workout.type === 'REST') {
      const r = makeResult(workout, 'GREEN');
      state = recordResult(state, workout.id, r);
      addRow(offset, today, workout, 'REST', r, before);
      continue;
    }
    if (workout.type === 'CONTROL') {
      // CONTROL scheduled but the app state did not show the checkpoint screen (e.g. progression blocked): treat as a normal session
      const r = controlResult(workout, controlTime());
      state = recordResult(state, workout.id, r);
      addRow(offset, today, workout, 'CONTROL', r, before);
      continue;
    }
    runIndex++;
    if (behaviour === 'V' && runIndex % 4 === 0) {
      state = skipWorkout(state, workout.id, today);
      addRow(offset, today, workout, 'SKIPPED', null, before);
      continue;
    }
    let outcome: Outcome = 'ON_PLAN'; let result: WorkoutResult;
    if (behaviour === 'B' && runIndex % 3 === 0) {
      failKind++;
      if (failKind % 2 === 1) { outcome = 'SHORTFALL'; result = makeResult(workout, 'YELLOW'); }
      else { outcome = 'SLOW_PACE'; result = slowPaceResult(workout); }
    } else result = makeResult(workout, 'GREEN');
    try {
      state = recordResult(state, workout.id, result);
    } catch (error) {
      if (!(error instanceof EngineError)) throw error;
      engineErrors.push({date: today, code: error.code, detail: `${workout.type} ${workout.id}`});
      state = skipWorkout(state, workout.id, today);
      addRow(offset, today, workout, 'SKIPPED', null, before);
      continue;
    }
    addRow(offset, today, workout, outcome, result, before);
  }
  const lastControl = controlSeconds.at(-1) ?? null;
  return {scenario, rows, days, events, engineErrors, initial, finalState: state,
    finalResultSeconds: state.finalResultRecorded ? state.profile.performance?.timeSeconds ?? null : null, controlSeconds: lastControl === null ? [] : controlSeconds};
}

export function simulateAll(): ScenarioRun[] { return SCENARIOS.map(simulateAudit); }
export {isRunning};
