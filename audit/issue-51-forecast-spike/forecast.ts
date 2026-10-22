/**
 * Issue #51 — технический эксперимент полного прогнозного календаря.
 *
 * Экспериментальный модуль. НЕ production-код, НЕ второй планировщик: обе модели используют
 * исключительно публичные операции движка и никогда не мутируют исходное состояние.
 *
 * Две модели прогноза на весь цикл до даты норматива:
 *  - A (консервативное бронирование): исходное состояние заморожено; для каждой будущей недели
 *    чистая генерация недельной очереди движком (`generateQueue` на клоне с решением `decide` на
 *    дату недели и флагом контрольной точки по правилу 21 дня из rebuildQueue). Будущие назначения
 *    резервируют нагрузку и восстановление (guardWeeklyLoad внутри generateQueue), но НЕ становятся
 *    ни результатами, ни пропусками: ни один переход skipWorkout/recordResult не выполняется,
 *    history/skippedWorkouts/successStreak не трогаются. Это бронирование, а не моделирование
 *    пропусков.
 *  - Б (условный сценарий «при успешном выполнении»): в изолированной копии каждое назначенное
 *    занятие синтетически «выполняется» GREEN; контрольные 3000 м вводятся только как прежний
 *    известный результат (улучшение не предполагается); для U1 способность пробежать 3 км НЕ
 *    подтверждается и время первого 3000 м НЕ выдумывается. Не допуск к нагрузке.
 *
 * Замечание 1 (сохранение утверждённой очереди): неделя 1 в обеих моделях отображается из
 * неизменяемого снапшота seed.queue, снятого на момент расчёта; виртуальное выполнение сценария
 * не может изменить представление уже выданных назначений (доказательство — FS-15).
 *
 * Замечание 3 (скользящие окна): sweepRollingWindows проверяет ВСЕ последовательные 7-дневные
 * интервалы прогнозного календаря, включая стыки недель (бюджет броней + 48 ч восстановления).
 *
 * Исходные параметры: старт = SIM_START аудиторских сценариев (2026-10-12), анкеты U1/U4/U5 из
 * audit/fullCycle12w.ts без изменений, горизонты 8 и 12 недель (raceDate = старт + недели×7).
 */
import {
  EngineError, addDays, createEngine, decide, generateQueue, guardWeeklyLoad, recordCheckpoint, recordFinalResult,
  recordResult, replan, skipWorkout,
} from '../../src/index.ts';
import type {
  Anchor, Capacity, Confidence, DoseUnit, EngineState, Gate, Phase, Profile, Workout, WorkoutGoal, WorkoutMainMode,
  WorkoutType,
} from '../../src/index.ts';
import {approvedWeekMeters, reservedMetres, withinRollingWeekBudget} from '../../src/weeklyLoad.ts';
import {day} from '../../src/validation.ts';
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
  finalRepeatMeters: number | null;
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
  minimumRecoveryHoursBeforeQuality: number;
  volumeFactor: number;
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

export interface WindowViolation {
  kind: 'BUDGET' | 'RECOVERY';
  windowEndOffset: number;
  detail: string;
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
  /** Скользящие 7-дневные окна (включая стыки недель): пусто = нарушений нет. */
  windowViolations: WindowViolation[];
  finalState: EngineState;
  finalResultSeconds: number | null;
  controlSeconds: number[];
  engineErrors: {date: string; code: string; detail: string}[];
  /** Нетронутое исходное состояние (доказательство неизменности — FS-01). */
  seed: EngineState;
  seedSerialized: string;
  /** Замороженная копия очереди, выданной движком на момент расчёта (неделя 1 отображается из неё). */
  issuedSnapshot: Workout[];
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
  workout: Workout, status: RowStatus, note: string, syntheticEvaluation: string | null,
): ForecastRow {
  const d = state.decision;
  return {
    model, profileId: user.id, horizonWeeks,
    date: workout.scheduledDate, offset, week: weekOf(offset),
    workoutId: workout.id, type: workout.type, goal: workout.goal, mode: workout.main.mode,
    countsAsQuality: workout.countsAsQuality,
    doseUnit: workout.main.dose.unit, doseValue: round1(workout.main.dose.value),
    warmupMinutes: workout.warmupMinutes, cooldownMinutes: workout.cooldownMinutes,
    repeats: workout.main.repeats, repeatMeters: workout.main.repeatMeters,
    finalRepeatMeters: workout.main.finalRepeatMeters === null ? null : round1(workout.main.finalRepeatMeters),
    restSeconds: workout.restSeconds,
    targetRpe: [...workout.targetRpe] as [number, number],
    paceRangeSecondsPerKm: workout.paceRangeSecondsPerKm === null ? null : [...workout.paceRangeSecondsPerKm] as [number, number],
    speedRangeKmh: workout.speedRangeMps === null ? null : [round1(workout.speedRangeMps[0] * 3.6), round1(workout.speedRangeMps[1] * 3.6)],
    anchor: workout.anchor, gateAtPrescription: workout.gateAtPrescription,
    phase: d.phase, confidence: d.confidence, capacity: d.capacity,
    minimumRecoveryHoursBeforeQuality: workout.minimumRecoveryHoursBeforeQuality,
    volumeFactor: workout.volumeFactor,
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

// ------------------------------------------------------------------------------------------------ remark 3: sliding windows
/**
 * Проверка ВСЕХ последовательных 7-дневных интервалов прогнозного календаря, включая стыки
 * календарных недель. Для каждого конца окна E: сумма броней занятий в (E−7, E] ≤ бюджета
 * (максимум из бюджетов строк окна; в модели А бюджет константен, в модели Б неубывающий —
 * строгая проверка для А, повторная сверху генерационной проверки движка для Б), и любые два
 * качественных занятия в окне разнесены не менее чем на 48 часов (правило восстановления движка).
 */
export function sweepRollingWindows(rows: ForecastRow[]): WindowViolation[] {
  const violations: WindowViolation[] = [];
  const sorted = [...rows].filter(r => r.type !== 'REST').sort((a, b) => a.offset - b.offset);
  if (sorted.length === 0) return violations;
  const maxOffset = Math.max(...sorted.map(r => r.offset));
  for (let end = Math.min(...sorted.map(r => r.offset)) + 6; end <= maxOffset; end++) {
    const inWindow = sorted.filter(r => r.offset > end - 7 && r.offset <= end);
    if (inWindow.length === 0) continue;
    const budget = Math.max(...inWindow.map(r => r.approvedWeekMeters));
    const reserve = inWindow.reduce((n, r) => n + (r.reservedMeters ?? 0), 0);
    if (reserve > budget + 1e-6) {
      violations.push({kind: 'BUDGET', windowEndOffset: end,
        detail: `окно до смещения ${end}: бронь ${Math.round(reserve)} м > бюджета ${Math.round(budget)} м (${inWindow.map(r => `${r.date} ${r.type}`).join(', ')})`});
    }
    const quality = inWindow.filter(r => r.countsAsQuality);
    for (let i = 0; i < quality.length; i++) {
      for (let j = i + 1; j < quality.length; j++) {
        const hours = Math.abs(quality[i]!.offset - quality[j]!.offset) * 24;
        const needed = Math.min(quality[i]!.minimumRecoveryHoursBeforeQuality, quality[j]!.minimumRecoveryHoursBeforeQuality);
        if (hours < needed - 1e-9) {
          violations.push({kind: 'RECOVERY', windowEndOffset: end,
            detail: `окно до смещения ${end}: ${quality[i]!.type} ${quality[i]!.date} и ${quality[j]!.type} ${quality[j]!.date} через ${hours} ч (< ${needed} ч)`});
        }
      }
    }
  }
  return violations;
}

function controlResult(w: {scheduledDate: string; warmupMinutes: number; cooldownMinutes: number}, seconds: number) {
  return {
    date: w.scheduledDate, completionFraction: 1, sessionRpe: 8.5, safety: healthySafety(),
    durationMinutes: w.warmupMinutes + w.cooldownMinutes + seconds / 60, distanceMeters: 3000,
    repeats: [], restSeconds: [], conditions: {}, unexpectedFatigue: false, feedbackConfirmed: true,
  };
}

// ------------------------------------------------------------------------------------------------ model A (reservation)
/**
 * Консервативное бронирование. Ни один переход состояния после createEngine не выполняется:
 * ни результатов, ни пропусков — history/skippedWorkouts/successStreak не трогаются.
 *
 * Генерация выполняется помнедельно (слоты цикла выровнены по неделям от cycleStart). В отличие
 * от независимой генерации «в вакууме», так воспроизводится ритм реальной очереди: каждый новый
 * слот видит внутри своей недели уже занятые брони, а сквозной массив резервирований подаётся
 * в guardWeeklyLoad вместе с новыми кандидатами (та же роль, что history выполненных/пропущенных
 * в реальном rebuildQueue) — скользящие окна на стыках недель проверяются самим движком, бронь не
 * «освобождается» задним числом. Флаг обязательной контрольной точки вычисляется на момент
 * фиксации слота (понедельник − 6 дней 7-дневного горизонта), как в реальной ежедневной очереди.
 *
 * Занятия резервируют нагрузку и восстановление, но не начисляют успехи и не становятся пропусками:
 * только публичные чистые функции ядра (generateQueue, guardWeeklyLoad, decide) на замороженном
 * клоне состояния.
 */
export function projectModelA(user: AuditUser, horizonWeeks: number): ForecastRun {
  const profile = makeSpikeProfile(user, horizonWeeks);
  const seed = createEngine(profile, SIM_START);
  const seedSerialized = JSON.stringify(seed);
  const issuedSnapshot = structuredClone(seed.queue);
  // Замороженная планировочная база: используется только для чтения, никогда не мутируется.
  const base = structuredClone(seed);
  const days = horizonWeeks * 7;
  const rows: ForecastRow[] = []; const events: ForecastRun['events'] = []; const engineErrors: ForecastRun['engineErrors'] = [];
  const logged = new Set<string>();
  const logOnce = (offset: number, kind: string, detail: string): void => {
    if (logged.has(kind)) return;
    logged.add(kind);
    events.push({date: addDays(SIM_START, offset), offset, week: weekOf(offset), kind, detail, synthetic: false});
  };
  const emit = (workout: Workout, status: RowStatus, note: string, decision: EngineState): void => {
    rows.push(makeRow('A', user, horizonWeeks, decision, day(workout.scheduledDate) - day(SIM_START),
      workout, status, note, null));
  };

  // Неделя 1 (замечание 1): дословно очередь, выданная движком на момент расчёта.
  for (const workout of issuedSnapshot) {
    emit(workout, 'ISSUED', 'Выданная движком очередь на момент расчёта; зафиксирована снапшотом и не изменяется сценарием.', seed);
  }

  // Все зарезервированные назначения удерживаются сквозь весь расчёт.
  let committedAll: Workout[] = [...issuedSnapshot];
  for (let week = 2; week <= horizonWeeks; week++) {
    const mondayOffset = (week - 1) * 7;
    const monday = addDays(SIM_START, mondayOffset);
    // Правило rebuildQuery, вычисленное на момент фиксации слота в реальной 7-дневной очереди
    // (слот понедельника фиксируется за 6 дней до даты):
    const commitDay = addDays(SIM_START, mondayOffset - 6);
    const checkpointRequired = base.profile.canRun3Km &&
      (day(commitDay) - day(base.lastAssessmentDate) >= 21 || base.profile.performanceMismatch === 'CLEAR');
    const planning: EngineState = {...base, checkpointRequired, decision: decide(base, monday)};
    let weekQueue: Workout[];
    try {
      const generated = generateQueue(planning, monday);
      // Вся ранее забронированная цепочка участвует в проверке броней (как history в реальном
      // guardWeeklyLoad); прошлые недели не пересекаются с новой по датам.
      weekQueue = guardWeeklyLoad(planning, [...committedAll, ...generated].sort((a, b) => day(a.scheduledDate) - day(b.scheduledDate)));
    } catch (error) {
      if (!(error instanceof EngineError)) throw error;
      engineErrors.push({date: monday, code: error.code, detail: `generateQueue week ${week}`});
      continue;
    }
    const dropped = committedAll.filter(c => !weekQueue.some(n => n.id === c.id));
    if (dropped.length > 0) {
      logOnce(mondayOffset, 'RESERVATION_RELEASED',
        `Движок снял ранее зарезервированные слоты при последующем пересмотре (${dropped.map(w => `${w.scheduledDate} ${w.type}`).join(', ')}): бронь недоступна.`);
    }
    committedAll = weekQueue;

    if (checkpointRequired) {
      logOnce(mondayOffset, 'CHECKPOINT_WINDOW_UNRESOLVED',
        'Обязательная контрольная точка (правило 21 дня после последнего измерения). В модели А нет внешнего измерения: ' +
        'слот контроля зарезервирован, подтверждение прогрессии невозможно, план остаётся на базовом уровне.');
    }

    for (const workout of weekQueue) {
      if (day(workout.scheduledDate) - day(SIM_START) < mondayOffset) continue; // прошлые недели уже отображены
      const rowState: EngineState = {...planning, decision: decide(base, workout.scheduledDate)};
      if (rowState.decision.confidence === 'LOW') {
        logOnce(mondayOffset, 'STALE_MEASUREMENT',
          'Результат 3000 м устарел (>42 дней): доверие LOW, фаза HOLD_DIAGNOSTIC — интенсивные назначения закрыты до нового измерения.');
      }
      if (rowState.decision.phase === 'TAPER') logOnce(mondayOffset, 'TAPER', 'Начат TAPER по правилам движка (дни до норматива).');
      emit(workout, 'CONSERVATIVE_FORECAST',
        'Бронирование без перехода: занятие резервирует нагрузку/восстановление (генерация движка на замороженном состоянии, ' +
        'скользящие окна контролируются guardWeeklyLoad с учётом всей цепочки броней); не результат, не пропуск, прогрессия не начисляется.', rowState);
    }
  }
  const raceDay = addDays(SIM_START, days);
  events.push({date: raceDay, offset: days, week: horizonWeeks, kind: 'RACE_DAY',
    detail: 'День норматива. Итоговый результат в модели А не вводится: без реального забега нет факта.', synthetic: false});
  return {
    model: 'A', user, horizonWeeks, startDate: SIM_START, raceDate: profile.raceDate,
    rows, events, weeks: summarizeWeeks(rows, events, horizonWeeks),
    windowViolations: sweepRollingWindows(rows),
    finalState: base, finalResultSeconds: null, controlSeconds: [], engineErrors, seed, seedSerialized, issuedSnapshot,
  };
}

// ------------------------------------------------------------------------------------------------ model B
/**
 * Условный сценарий «при успешном выполнении» в изолированной копии. Каждый результат —
 * синтетическое предположение (syntheticEvaluation), контрольные 3000 м — только прежний известный
 * результат (никакого улучшения времени). Для U1 способность пробежать 3 км не подтверждается и
 * время первого 3000 м не выдумывается — контрольных забегов и итогового результата у U1 нет.
 * Неделя 1 отображается из снапшота seed.queue и не зависит от сценарного выполнения (FS-15).
 */
export function projectModelB(user: AuditUser, horizonWeeks: number): ForecastRun {
  const profile = makeSpikeProfile(user, horizonWeeks);
  const seed = createEngine(profile, SIM_START);
  const seedSerialized = JSON.stringify(seed);
  const issuedSnapshot = structuredClone(seed.queue);
  const issuedById = new Map(issuedSnapshot.map(w => [w.id, w]));
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
    // Замечание 1: уже выданные назначения показываем дословно из снапшота на момент расчёта,
    // даже если сценарное выполнение изменило живую очередь (адаптация доз, ротация).
    const issued = issuedById.get(workout.id);
    const note = 'Условный прогноз: предполагается успешное выполнение (синтетический GREEN). Это не допуск к нагрузке и не доказательство переносимости.';

    if (workout.type === 'CONTROL') {
      const known = state.profile.performance;
      if (known === null) throw new Error('CONTROL without measured performance must not be scheduled by the engine');
      const seconds = known.timeSeconds; // явно условный сценарный ввод = прежний известный результат
      const before = state;
      rows.push(makeRow('B', user, horizonWeeks, before, offset, workout, 'CONDITIONAL_FORECAST',
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

    const status: RowStatus = issued !== undefined ? 'ISSUED' : 'CONDITIONAL_FORECAST';
    const displayState = issued !== undefined ? seed : state;
    const displayWorkout = issued ?? workout;

    if (workout.type === 'REST') {
      rows.push(makeRow('B', user, horizonWeeks, displayState, offset, displayWorkout, status,
        issued !== undefined ? `${note} Назначение отображено из снапшота выданной очереди на момент расчёта.` : note, 'GREEN'));
      state = recordResult(state, workout.id, makeResult(workout, 'GREEN'));
      continue;
    }

    const result = makeResult(workout, 'GREEN');
    try {
      state = recordResult(state, workout.id, result);
      const classified = state.history.find(h => h.workout.id === workout.id)?.classified ?? null;
      rows.push(makeRow('B', user, horizonWeeks, displayState, offset, displayWorkout, status,
        issued !== undefined ? `${note} Назначение отображено из снапшота выданной очереди на момент расчёта.` : note,
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
    rows, events, weeks: summarizeWeeks(rows, events, horizonWeeks),
    windowViolations: sweepRollingWindows(rows),
    finalState: state, finalResultSeconds, controlSeconds, engineErrors, seed, seedSerialized, issuedSnapshot,
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

export {withinRollingWeekBudget};
