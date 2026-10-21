/**
 * Issue #51 — технический эксперимент полного прогнозного календаря.
 *
 * Экспериментальный модуль. НЕ production-код, НЕ второй планировщик: обе модели двигают только
 * изолированные глубокие копии состояния движка и используют исключительно публичные переходы
 * (`createEngine`, `replan`, `skipWorkout`, `recordResult`, `recordCheckpoint`, `recordFinalResult`).
 *
 * Две модели прогноза на весь цикл до даты норматива:
 *  - A (консервативная): будущие тренировки только занимают резерв нагрузки/восстановления.
 *    Каждая будущая позиция явно закрывается как пропуск (тот же переход `skipWorkout`, что и
 *    автоматический просроченный мисс — согласованное решение 2), поэтому ни одна будущая
 *    тренировка не становится результатом и не начисляет successStreak / easyProgression /
 *    qualityRotation / новые допуски / «омоложение» измерения. Обязательные контрольные точки
 *    честно показываются как неразрешённые: без реального измерения 3000 м движок не может
 *    подтвердить прогрессию.
 *  - Б (условный сценарий «при успешном выполнении»): в той же изолированной копии каждое
 *    назначенное занятие синтетически «выполняется» GREEN (makeResult из аудиторского
 *    симулятора, каждая запись помечена synthetic), контрольные 3000 м вводятся только как
 *    прежний известный результат (улучшение времени не предполагается), для новичка U1
 *    способность пробежать 3 км НЕ подтверждается и время первого 3000 м НЕ выдумывается.
 *    Это предположение модели, не доказательство переносимости и не допуск к нагрузке.
 *
 * Исходные параметры (документированы явно): старт цикла = SIM_START аудиторских сценариев
 * (2026-10-12), профили U1/U4/U5 из audit/fullCycle12w.ts без изменения анкетных значений,
 * горизонты 8 и 12 недель (raceDate = старт + недели×7).
 */
import {
  EngineError, addDays, createEngine, recordCheckpoint, recordFinalResult, recordResult, replan, skipWorkout,
} from '../../src/index.ts';
import type {
  Anchor, Capacity, Confidence, DoseUnit, EngineState, Gate, Phase, Profile, WorkoutGoal, WorkoutMainMode,
  WorkoutType,
} from '../../src/index.ts';
import {approvedWeekMeters, reservedMetres} from '../../src/weeklyLoad.ts';
import {USERS} from '../fullCycle12w.ts';
import type {AuditUser} from '../fullCycle12w.ts';
import {SIM_START, healthySafety, makeResult} from '../trainingSimulator.ts';

export const SPIKE_USERS: readonly AuditUser[] = USERS.filter(u => ['U1-novice', 'U4-intermediate', 'U5-trained'].includes(u.id));
export const SPIKE_HORIZONS: readonly number[] = [8, 12];

export type RowStatus = 'ISSUED' | 'CONSERVATIVE_FORECAST' | 'CONDITIONAL_FORECAST' | 'UNRESOLVED';

export interface ForecastRow {
  model: 'A' | 'B';
  profileId: string;
  horizonWeeks: number;
  date: string;
  offset: number;
  week: number;
  workoutId: string;
  type: WorkoutType;
  goal: WorkoutGoal;
  mode: WorkoutMainMode;
  countsAsQuality: boolean;
  doseUnit: DoseUnit;
  doseValue: number;
  warmupMinutes: number;
  cooldownMinutes: number;
  repeats: number;
  repeatMeters: number | null;
  restSeconds: number;
  targetRpe: [number, number];
  /** Только если подтверждено исходными данными (измеренный результат 3000 м / калибровка). */
  paceRangeSecondsPerKm: [number, number] | null;
  speedRangeKmh: [number, number] | null;
  anchor: Anchor;
  gateAtPrescription: Gate;
  phase: Phase;
  confidence: Confidence;
  capacity: Capacity;
  runWalkStage: number | null;
  calibration: boolean;
  /** Бронь планировочного пространства движка (НЕ фактические километры); null = не вычислима без измерения. */
  reservedMeters: number | null;
  /** Утверждённый недельный бюджет-бронь на момент назначения (не фактический объём). */
  approvedWeekMeters: number;
  status: RowStatus;
  note: string;
  /** Модель Б: оценка условного синтетического результата; null в модели А. */
  syntheticEvaluation: string | null;
}

export interface ForecastEvent {
  date: string;
  offset: number;
  week: number;
  kind: string;
  detail: string;
  synthetic: boolean;
}

export interface WeekSummary {
  week: number;
  /** Число беговых занятий (без REST). */
  sessions: number;
  restDays: number;
  qualityCount: number;
  /** Сумма броней reservedMetres за неделю; null = часть броней не вычислима без измеренного результата. */
  plannedReservedMeters: number | null;
  approvedWeekMeters: number;
  phase: Phase;
  gate: Gate;
  confidence: Confidence;
  checkpointDue: boolean;
  types: string;
}

export interface ForecastRun {
  model: 'A' | 'B';
  user: AuditUser;
  horizonWeeks: number;
  startDate: string;
  raceDate: string;
  rows: ForecastRow[];
  events: ForecastEvent[];
  weeks: WeekSummary[];
  finalState: EngineState;
  finalResultSeconds: number | null;
  controlSeconds: number[];
  engineErrors: {date: string; code: string; detail: string}[];
  /** Нетронутое исходное состояние (доказательство неизменности проверяется тестами). */
  seed: EngineState;
  seedSerialized: string;
}

// ------------------------------------------------------------------------------------------------ profile factory
/** Анкета без изменений; отличается от аудиторской фабрики только параметром горизонта цикла. */
export function makeSpikeProfile(user: AuditUser, horizonWeeks: number): Profile {
  return {
    performance: user.currentSeconds === null ? null : {timeSeconds: user.currentSeconds, date: SIM_START, source: 'TEST_3K'},
    targetTimeSeconds: user.goalSeconds, raceDate: addDays(SIM_START, horizonWeeks * 7),
    regularRunningWeeks: user.regularWeeks, actualRunsPerWeek: user.runsPerWeek, availableRunsPerWeek: user.availableRunsPerWeek,
    averageWeeklyKm4Weeks: user.weeklyKm, longestUsualRunKm: user.longestKm, canRun3Km: user.canRun3Km,
    qualitySessions8Weeks: user.qualitySessions, qualityWeeks8Weeks: user.qualityWeeks, qualityMostlyTolerated: user.qualityTolerated,
    experience: {...user.experience}, breaks: [], safety: healthySafety(), performanceMismatch: 'NONE',
  };
}

const weekOf = (offset: number): number => Math.floor(offset / 7) + 1;
const round1 = (v: number): number => Math.round(v * 10) / 10;

function makeRow(
  model: 'A' | 'B', user: AuditUser, horizonWeeks: number, state: EngineState, offset: number,
  workout: Parameters<typeof makeResult>[0], status: RowStatus, note: string, syntheticEvaluation: string | null,
): ForecastRow {
  const d = state.decision;
  return {
    model, profileId: user.id, horizonWeeks,
    date: workout.scheduledDate, offset, week: weekOf(offset),
    workoutId: workout.id, type: workout.type, goal: workout.goal, mode: workout.main.mode,
    countsAsQuality: workout.countsAsQuality,
    doseUnit: workout.main.dose.unit, doseValue: round1(workout.main.dose.value),
    warmupMinutes: workout.warmupMinutes, cooldownMinutes: workout.cooldownMinutes,
    repeats: workout.main.repeats, repeatMeters: workout.main.repeatMeters, restSeconds: workout.restSeconds,
    targetRpe: [...workout.targetRpe] as [number, number],
    paceRangeSecondsPerKm: workout.paceRangeSecondsPerKm === null ? null : [...workout.paceRangeSecondsPerKm] as [number, number],
    speedRangeKmh: workout.speedRangeMps === null ? null : [round1(workout.speedRangeMps[0] * 3.6), round1(workout.speedRangeMps[1] * 3.6)],
    anchor: workout.anchor, gateAtPrescription: workout.gateAtPrescription,
    phase: d.phase, confidence: d.confidence, capacity: d.capacity,
    runWalkStage: workout.main.runWalk?.stage ?? null, calibration: workout.main.calibration === true,
    reservedMeters: reservedMetres(state, workout),
    approvedWeekMeters: approvedWeekMeters(state),
    status, note, syntheticEvaluation,
  };
}

function summarizeWeeks(rows: ForecastRow[], events: ForecastEvent[], horizonWeeks: number): WeekSummary[] {
  return Array.from({length: horizonWeeks}, (_, i) => {
    const week = i + 1;
    const wRows = rows.filter(r => r.week === week);
    const running = wRows.filter(r => r.type !== 'REST');
    const unknownReserve = running.some(r => r.reservedMeters === null);
    const byType = new Map<string, number>();
    for (const r of running) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    const last = wRows.at(-1);
    return {
      week,
      sessions: running.length,
      restDays: wRows.filter(r => r.type === 'REST').length,
      qualityCount: running.filter(r => r.countsAsQuality).length,
      plannedReservedMeters: unknownReserve ? null : running.reduce((n, r) => n + (r.reservedMeters ?? 0), 0),
      approvedWeekMeters: last?.approvedWeekMeters ?? 0,
      phase: last?.phase ?? 'FOUNDATION',
      gate: last?.gateAtPrescription ?? 'CLOSED',
      confidence: last?.confidence ?? 'UNKNOWN',
      checkpointDue: events.some(e => e.week === week && e.kind.includes('CHECKPOINT')),
      types: [...byType.entries()].map(([t, n]) => `${t}×${n}`).join(', ') || '—',
    };
  });
}

function controlResult(w: {scheduledDate: string; warmupMinutes: number; cooldownMinutes: number}, seconds: number) {
  return {
    date: w.scheduledDate, completionFraction: 1, sessionRpe: 8.5, safety: healthySafety(),
    durationMinutes: w.warmupMinutes + w.cooldownMinutes + seconds / 60, distanceMeters: 3000,
    repeats: [], restSeconds: [], conditions: {}, unexpectedFatigue: false, feedbackConfirmed: true,
  };
}

// ------------------------------------------------------------------------------------------------ model A
/**
 * Консервативная проекция: реальные факты только на asOf; каждая будущая позиция явно закрывается
 * как пропуск (тот же переход, что автоматический мисс), поэтому прогрессия не начисляется.
 */
export function projectModelA(user: AuditUser, horizonWeeks: number): ForecastRun {
  const profile = makeSpikeProfile(user, horizonWeeks);
  const seed = createEngine(profile, SIM_START);
  const seedSerialized = JSON.stringify(seed);
  const issuedIds = new Set(seed.queue.map(w => w.id));
  let state = structuredClone(seed);
  const days = horizonWeeks * 7;
  const rows: ForecastRow[] = []; const events: ForecastRun['events'] = []; const engineErrors: ForecastRun['engineErrors'] = [];
  const logged = new Set<string>();
  const log = (offset: number, kind: string, detail: string, synthetic = false): void => {
    if (logged.has(kind)) return;
    logged.add(kind);
    events.push({date: addDays(SIM_START, offset), offset, week: weekOf(offset), kind, detail, synthetic});
  };

  for (let offset = 0; offset < days; offset++) {
    const today = addDays(SIM_START, offset);
    state = replan(state, today);

    if (state.checkpointRequired && state.profile.canRun3Km) {
      log(offset, 'CHECKPOINT_WINDOW_UNRESOLVED',
        'Обязательная контрольная точка (измерение 3000 м просрочено/требуется). В модели А нет внешнего измерения: ' +
        'слот контроля закрывается как пропуск, подтверждение прогрессии невозможно, план остаётся на базовом уровне.');
    }
    if (state.decision.confidence === 'LOW') {
      log(offset, 'STALE_MEASUREMENT',
        'Результат 3000 м устарел (>42 дней): доверие LOW, фаза HOLD_DIAGNOSTIC — интенсивные назначения закрыты до нового измерения.');
    }
    if (state.decision.phase === 'TAPER') log(offset, 'TAPER', 'Начат TAPER по правилам движка (дни до норматива).');

    const workout = state.queue.find(w => w.scheduledDate === today) ?? null;
    if (workout !== null) {
      const status: RowStatus = issuedIds.has(workout.id) ? 'ISSUED' : 'CONSERVATIVE_FORECAST';
      rows.push(makeRow('A', user, horizonWeeks, state, offset, workout, status,
        'Будущее занятие занимает резерв нагрузки/восстановления; результат не подтверждён — слот закрыт как пропуск (согласованное решение 2), прогрессия не начислена.', null));
      try {
        state = skipWorkout(state, workout.id, today);
      } catch (error) {
        if (!(error instanceof EngineError)) throw error;
        engineErrors.push({date: today, code: error.code, detail: `skip ${workout.type} ${workout.id}`});
      }
    }
  }
  const raceDay = addDays(SIM_START, days);
  events.push({date: raceDay, offset: days, week: horizonWeeks, kind: 'RACE_DAY',
    detail: 'День норматива. Итоговый результат в модели А не вводится: без реального забега нет факта.', synthetic: false});
  return {
    model: 'A', user, horizonWeeks, startDate: SIM_START, raceDate: profile.raceDate,
    rows, events, weeks: summarizeWeeks(rows, events, horizonWeeks), finalState: state,
    finalResultSeconds: null, controlSeconds: [], engineErrors, seed, seedSerialized,
  };
}

// ------------------------------------------------------------------------------------------------ model B
/**
 * Условный сценарий «при успешном выполнении» в изолированной копии. Каждый результат —
 * синтетическое предположение (syntheticEvaluation), контрольные 3000 м — только прежний известный
 * результат (никакого улучшения времени). Для U1 способность пробежать 3 км не подтверждается и
 * время первого 3000 м не выдумывается — контрольных забегов и итогового результата у U1 нет.
 */
export function projectModelB(user: AuditUser, horizonWeeks: number): ForecastRun {
  const profile = makeSpikeProfile(user, horizonWeeks);
  const seed = createEngine(profile, SIM_START);
  const seedSerialized = JSON.stringify(seed);
  const issuedIds = new Set(seed.queue.map(w => w.id));
  let state = structuredClone(seed);
  const days = horizonWeeks * 7;
  const rows: ForecastRow[] = []; const events: ForecastRun['events'] = []; const engineErrors: ForecastRun['engineErrors'] = [];
  const controlSeconds: number[] = [];
  const logged = new Set<string>();
  const logOnce = (offset: number, kind: string, detail: string, synthetic = false): void => {
    if (logged.has(kind)) return;
    logged.add(kind);
    events.push({date: addDays(SIM_START, offset), offset, week: weekOf(offset), kind, detail, synthetic});
  };
  const secText = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  for (let offset = 0; offset < days; offset++) {
    const today = addDays(SIM_START, offset);
    state = replan(state, today);

    const workout = state.queue.find(w => w.scheduledDate === today) ?? null;
    if (workout === null) continue;
    const status: RowStatus = issuedIds.has(workout.id) ? 'ISSUED' : 'CONDITIONAL_FORECAST';
    const note = 'Условный прогноз: предполагается успешное выполнение (синтетический GREEN). Это не допуск к нагрузке и не доказательство переносимости.';

    // Контрольный 3000 м, назначенный движком (только у профилей с подтверждённой способностью).
    if (workout.type === 'CONTROL') {
      const known = state.profile.performance;
      if (known === null) throw new Error('CONTROL without measured performance must not be scheduled by the engine');
      const seconds = known.timeSeconds; // явно условный сценарный ввод = прежний известный результат
      const before = state;
      rows.push(makeRow('B', user, horizonWeeks, before, offset, workout, status,
        `${note} Контрольный 3000 м: условный ввод = прежний известный результат ${secText(seconds)}, улучшение не предполагается.`,
        'GREEN'));
      state = recordResult(state, workout.id, controlResult(workout, seconds));
      state = recordCheckpoint(state, {timeSeconds: seconds, date: today, source: 'TEST_3K'}, today);
      controlSeconds.push(seconds);
      events.push({date: today, offset, week: weekOf(offset), kind: 'EXTERNAL_3K_CONTROL_CONDITIONAL',
        detail: `Условный сценарный ввод контрольных 3000 м: ${secText(seconds)} (= прежний известный результат, улучшение не предполагается).`,
        synthetic: true});
      continue;
    }

    if (workout.type === 'REST') {
      rows.push(makeRow('B', user, horizonWeeks, state, offset, workout, status, note, 'GREEN'));
      state = recordResult(state, workout.id, makeResult(workout, 'GREEN'));
      continue;
    }

    const result = makeResult(workout, 'GREEN');
    try {
      const before = state;
      state = recordResult(state, workout.id, result);
      const classified = state.history.find(h => h.workout.id === workout.id)?.classified ?? null;
      rows.push(makeRow('B', user, horizonWeeks, before, offset, workout, status, note,
        classified?.evaluation ?? null));
    } catch (error) {
      if (!(error instanceof EngineError)) throw error;
      engineErrors.push({date: today, code: error.code, detail: `${workout.type} ${workout.id}`});
      state = skipWorkout(state, workout.id, today);
      rows.push(makeRow('B', user, horizonWeeks, state, offset, workout, 'UNRESOLVED',
        `Движок отказал в записи условного результата (${error.code}); слот закрыт как пропуск.`, null));
    }
  }

  // День норматива: итог только как прежний известный результат; для U1 — не выдумывается.
  const raceDay = addDays(SIM_START, days);
  const perf = state.profile.performance;
  let finalResultSeconds: number | null = null;
  if (perf === null) {
    events.push({date: raceDay, offset: days, week: horizonWeeks, kind: 'NO_FINAL_RESULT',
      detail: 'Нет измеренного результата 3000 м: итоговый результат НЕ придумывается (условный сценарий не вводит его).',
      synthetic: false});
  } else {
    state = recordFinalResult(state, {timeSeconds: perf.timeSeconds, date: raceDay, source: 'TEST_3K'}, raceDay);
    finalResultSeconds = perf.timeSeconds;
    events.push({date: raceDay, offset: days, week: horizonWeeks, kind: 'EXTERNAL_FINAL_RACE_CONDITIONAL',
      detail: `Итоговый результат = прежний известный (${secText(perf.timeSeconds)}); улучшение не предполагается.`,
      synthetic: true});
  }
  return {
    model: 'B', user, horizonWeeks, startDate: SIM_START, raceDate: profile.raceDate,
    rows, events, weeks: summarizeWeeks(rows, events, horizonWeeks), finalState: state,
    finalResultSeconds, controlSeconds, engineErrors, seed, seedSerialized,
  };
}

// ------------------------------------------------------------------------------------------------ matrix
export interface SpikeConfig {user: AuditUser; horizonWeeks: number}

export function spikeConfigs(): SpikeConfig[] {
  return SPIKE_USERS.flatMap(user => SPIKE_HORIZONS.map(horizonWeeks => ({user, horizonWeeks})));
}

export function runSpike(): {A: ForecastRun[]; B: ForecastRun[]} {
  const A = spikeConfigs().map(c => projectModelA(c.user, c.horizonWeeks));
  const B = spikeConfigs().map(c => projectModelB(c.user, c.horizonWeeks));
  return {A, B};
}
