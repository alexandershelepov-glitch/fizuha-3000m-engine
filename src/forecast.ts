/**
 * Многонедельный прогноз тренировочного цикла до даты норматива (issue #51).
 *
 * Чистый API поверх существующего движка: принимает настоящий `EngineState` (в том числе частично
 * пройденный цикл с выполненными, пропущенными и перенесёнными занятиями) и дату расчёта, возвращает
 * календарь до `raceDate`, не изменяя входное состояние и не обращаясь к пользовательскому
 * хранилищу. Это не второй планировщик: всё спортивное содержание вычисляется действующими
 * публичными операциями и чистыми функциями ядра.
 *
 * Два режима (по результатам эксперимента, ветка experiment/issue-51-forecast-spike):
 *  - RESERVATION (модель А): консервативное бронирование. После загрузки состояния не выполняется
 *    ни одного перехода: ни результатов, ни пропусков. Каждая будущая цикл-неделя генерируется
 *    `generateQueue` на замороженном состоянии, а `guardWeeklyLoad` проверяет брони против всей
 *    накопленной цепочки (та же роль, что `history` в реальном rebuildQueue). Будущие назначения
 *    резервируют нагрузку и восстановление, но не начисляют успехи и не становятся пропусками.
 *  - CONDITIONAL (модель Б): условный сценарий «при успешном выполнении» в изолированной копии.
 *    Каждое назначенное занятие синтетически «выполняется» успешно; контрольные 3000 м и итоговый
 *    результат вводятся только как прежний известный результат — улучшение времени не
 *    предполагается, способность новичка пробежать 3 км не подтверждается. Это предположение
 *    сценария, а не допуск к нагрузке; синтетические результаты никогда не записываются во входное
 *    состояние.
 *
 * Происхождение каждой позиции явно (ForecastEntryStatus): COMMITTED — действующая очередь,
 * возвращается дословно; CONSERVATIVE/CONDITIONAL — прогнозные задания; UNRESOLVED — слот, который
 * движок не смог разрешить. Контрольные точки, требующие измерения, помечаются blockingReasons.
 */
import type {
  EngineState, Evaluation, Gate, Phase, ReasonCode, Workout, WorkoutResult, Confidence,
} from './models.ts';
import {EngineError} from './errors.ts';
import {
  deserialize, recordCheckpoint, recordFinalResult, recordResult, replan, serialize, skipWorkout,
} from './engine.ts';
import {decide} from './assessment.ts';
import {generateQueue, guardWeeklyLoad} from './workouts.ts';
import {addDays, day} from './validation.ts';
import {approvedWeekMeters, reservedMetres} from './weeklyLoad.ts';

// ------------------------------------------------------------------------------------------------ contract
export const FORECAST_MODES = Object.freeze(['RESERVATION', 'CONDITIONAL'] as const);
export type ForecastMode = (typeof FORECAST_MODES)[number];

export const FORECAST_ENTRY_STATUSES = Object.freeze(['COMMITTED', 'CONSERVATIVE', 'CONDITIONAL', 'UNRESOLVED'] as const);
export type ForecastEntryStatus = (typeof FORECAST_ENTRY_STATUSES)[number];

export interface ForecastEntry {
  /** Происхождение позиции. */
  status: ForecastEntryStatus;
  /** Неделя цикла (недели отсчитываются от cycleStartDate). */
  week: number;
  /** Назначение дословно как его выдал движок (COMMITTED — дословно из входной очереди). */
  workout: Workout;
  /** Решение движка на дату назначения. */
  phase: Phase;
  gate: Gate;
  confidence: Confidence;
  /** Планировочная бронь нагрузки (НЕ фактические километры); null = не вычислима без измерения. */
  reservationMeters: number | null;
  /** Утверждённый недельный бюджет-бронь на момент планирования. */
  approvedWeekMeters: number;
  /** true: результат предположен сценарием (только CONDITIONAL). */
  synthetic: boolean;
  /** Оценка условного результата (только CONDITIONAL). */
  assumedEvaluation: Evaluation | null;
  /** Неразрешённые зависимости (например CHECKPOINT_DUE — требуется реальное измерение 3000 м). */
  blockingReasons: ReasonCode[];
  note: string;
}

export interface ForecastEvent {
  date: string;
  kind: string;
  detail: string;
  synthetic: boolean;
}

export interface ForecastWindowViolation {
  kind: 'BUDGET' | 'RECOVERY' | 'UNKNOWN_RESERVE';
  windowEnd: string;
  detail: string;
}

export interface ForecastResult {
  mode: ForecastMode;
  asOf: string;
  cycleStartDate: string;
  raceDate: string;
  /** JSON входного состояния на момент расчёта (контракт неизменности). */
  seedDigest: string;
  /** Постусловие: serialize(state) побайтово совпадает с seedDigest. */
  seedUnchanged: boolean;
  /** COMMITTED-позиции идут первыми и равны входной очереди; далее прогнозные по датам. */
  entries: ForecastEntry[];
  events: ForecastEvent[];
  /** Только CONDITIONAL: итог норматива как прежний известный результат (иначе null). */
  finalResultSeconds: number | null;
  /** Отказы движка при условном проходе (например лимит восстановления): слот закрыт как пропуск. */
  engineErrors: {date: string; code: string; detail: string}[];
  /** Сквозная проверка всех скользящих 7-дневных окон (включая стыки недель). Пусто = чисто. */
  windowViolations: ForecastWindowViolation[];
}

export interface ForecastOptions {
  mode: ForecastMode;
  /** Дата расчёта; по умолчанию state.asOf. Должна быть >= state.asOf и <= raceDate. */
  asOf?: string;
}

// ------------------------------------------------------------------------------------------------ scenario result (модель Б)
const assumedSafety = () => ({
  pain: 0, painIncreasing: false, alteredMovement: false, painWalkingOrRest: false,
  swelling: false, acuteIllness: false, otherStop: false, needsAssessment: false,
});

/**
 * Синтетический успешный отчёт для условного сценария. Это ЯВНОЕ предположение режима CONDITIONAL
 * (предполагаемое выполнение по выданному коридору), а не измерение: оно никогда не попадает во
 * входное состояние и используется только внутри изолированной копии. Не-paced работа получает
 * документированную обозначенную скорость 3.2 м/с (сценарное допущение, не назначение).
 */
function conditionalResult(w: Workout): WorkoutResult {
  const speed = w.speedRangeMps === null ? 3.2 : (w.speedRangeMps[0] + w.speedRangeMps[1]) / 2;
  const repeats: {distanceMeters: number; seconds: number}[] = [];
  let mainSeconds = 0;
  let distance = 0;
  if (w.main.mode === 'INTERVALS') {
    mainSeconds = w.main.dose.unit === 'MINUTES' ? w.main.dose.value * 60 : 0;
    for (let i = 0; i < w.main.repeats; i++) {
      const meters = w.main.repeatMeters === null
        ? speed * mainSeconds / w.main.repeats
        : i === w.main.repeats - 1 ? w.main.finalRepeatMeters ?? w.main.repeatMeters : w.main.repeatMeters;
      repeats.push({distanceMeters: meters, seconds: meters / speed});
      distance += meters;
    }
    if (w.main.dose.unit === 'METERS') mainSeconds = distance / speed;
  } else if (w.type !== 'REST' && w.main.mode !== 'REST') {
    mainSeconds = w.main.dose.unit === 'MINUTES' ? w.main.dose.value * 60 : w.main.dose.value / speed;
    distance = w.main.dose.unit === 'METERS' ? w.main.dose.value : speed * mainSeconds;
    if (w.speedRangeMps !== null) repeats.push({distanceMeters: distance, seconds: mainSeconds});
  }
  const rests = w.main.mode === 'INTERVALS' ? Math.max(0, w.main.repeats - 1) : 0;
  // Итог не округляется ниже суммы измеренных отрезков (иначе RESULT_DISTANCE_CONFLICT).
  const totalMeters = repeats.length > 0 ? repeats.reduce((n, r) => n + r.distanceMeters, 0) : Math.round(distance * 1000) / 1000;
  return {
    date: w.scheduledDate, completionFraction: 1, sessionRpe: (w.targetRpe[0] + w.targetRpe[1]) / 2,
    safety: assumedSafety(),
    durationMinutes: w.warmupMinutes + w.cooldownMinutes + mainSeconds / 60 + rests * w.restSeconds / 60,
    distanceMeters: totalMeters,
    repeats, restSeconds: Array.from({length: rests}, () => w.restSeconds),
    conditions: {}, unexpectedFatigue: false, feedbackConfirmed: true,
  };
}

// ------------------------------------------------------------------------------------------------ entry helpers
function makeEntry(
  status: ForecastEntryStatus, week: number, workout: Workout, decision: EngineState,
  synthetic: boolean, assumedEvaluation: Evaluation | null, blockingReasons: ReasonCode[], note: string,
): ForecastEntry {
  const d = decision.decision;
  return {
    status, week, workout: structuredClone(workout),
    phase: d.phase, gate: d.gate, confidence: d.confidence,
    reservationMeters: reservedMetres(decision, workout),
    approvedWeekMeters: approvedWeekMeters(decision),
    synthetic, assumedEvaluation, blockingReasons, note,
  };
}

const weekOf = (state: EngineState, date: string): number =>
  Math.floor((day(date) - day(state.cycleStartDate)) / 7) + 1;

// ------------------------------------------------------------------------------------------------ sliding windows
/**
 * Сквозная проверка ВСЕХ последовательных 7-дневных интервалов календаря прогноза, включая стыки
 * календарных недель. Для каждого конца окна E: сумма броней занятий в (E−7, E] не превышает
 * утверждённого бюджета (максимум в окне — бюджет неубывающий, движок проверяет окно в момент
 * планирования самого позднего занятия), а любые два качественных занятия в окне разнесены не
 * менее чем на minimumRecoveryHoursBeforeQuality. Неизвестный резерв (null) НЕ считается нулевым:
 * такое окно возвращается отдельно как UNKNOWN_RESERVE, а не проходит проверку молча.
 */
export function sweepForecastWindows(entries: readonly ForecastEntry[]): ForecastWindowViolation[] {
  const violations: ForecastWindowViolation[] = [];
  const sessions = entries.filter(e => e.workout.type !== 'REST')
    .sort((a, b) => day(a.workout.scheduledDate) - day(b.workout.scheduledDate));
  if (sessions.length === 0) return violations;
  const first = day(sessions[0]!.workout.scheduledDate);
  const last = day(sessions.at(-1)!.workout.scheduledDate);
  // Все окна, содержащие хотя бы одно занятие: конец от даты первого занятия до даты последнего + 6.
  for (let end = first; end <= last + 6; end++) {
    const inWindow = sessions.filter(e => {
      const d = day(e.workout.scheduledDate);
      return d > end - 7 && d <= end;
    });
    if (inWindow.length === 0) continue;
    const unknown = inWindow.filter(e => e.reservationMeters === null);
    if (unknown.length > 0) {
      violations.push({kind: 'UNKNOWN_RESERVE', windowEnd: addDays(sessions[0]!.workout.scheduledDate, end - first),
        detail: `окно до ${addDays(sessions[0]!.workout.scheduledDate, end - first)}: резерв не вычислим (${unknown.map(e => `${e.workout.scheduledDate} ${e.workout.type}`).join(', ')})`});
      continue;
    }
    const budget = Math.max(...inWindow.map(e => e.approvedWeekMeters));
    const reserve = inWindow.reduce((n, e) => n + (e.reservationMeters ?? 0), 0);
    if (reserve > budget + 1e-6) {
      violations.push({kind: 'BUDGET', windowEnd: addDays(sessions[0]!.workout.scheduledDate, end - first),
        detail: `окно до ${addDays(sessions[0]!.workout.scheduledDate, end - first)}: бронь ${Math.round(reserve)} м > бюджета ${Math.round(budget)} м`});
    }
    const quality = inWindow.filter(e => e.workout.countsAsQuality);
    for (let i = 0; i < quality.length; i++) {
      for (let j = i + 1; j < quality.length; j++) {
        const hours = Math.abs(day(quality[i]!.workout.scheduledDate) - day(quality[j]!.workout.scheduledDate)) * 24;
        const needed = Math.min(quality[i]!.workout.minimumRecoveryHoursBeforeQuality, quality[j]!.workout.minimumRecoveryHoursBeforeQuality);
        if (hours < needed - 1e-9) {
          violations.push({kind: 'RECOVERY', windowEnd: addDays(sessions[0]!.workout.scheduledDate, end - first),
            detail: `окно до ${addDays(sessions[0]!.workout.scheduledDate, end - first)}: ${quality[i]!.workout.type} ${quality[i]!.workout.scheduledDate} и ${quality[j]!.workout.type} ${quality[j]!.workout.scheduledDate} через ${hours} ч (< ${needed} ч)`});
        }
      }
    }
  }
  return violations;
}

// ------------------------------------------------------------------------------------------------ mode A: reservation
function forecastReservation(base: EngineState, asOf: string, digest: string): ForecastResult {
  const committed = structuredClone(base.queue);
  const entries: ForecastEntry[] = committed.map(w => makeEntry(
    'COMMITTED', weekOf(base, w.scheduledDate), w, base, false, null, [],
    'Действующая очередь движка на момент расчёта; возвращена без изменений.'));
  const displayed = new Set(committed.map(w => w.id));
  const events: ForecastEvent[] = [];
  const engineErrors: ForecastResult['engineErrors'] = [];

  // Цепочка броней: выданная очередь + сгенерированные недели. Версии из цепочки используются для
  // контроля бюджета; на экран COMMITTED всегда попадает исходная очередь дословно.
  let chain: Workout[] = [...committed];
  const asOfDay = day(asOf);
  const raceDay = day(base.profile.raceDate);
  const cycleStart = day(base.cycleStartDate);
  const logged = new Set<string>();
  const logOnce = (date: string, kind: string, detail: string): void => {
    if (logged.has(kind)) return;
    logged.add(kind);
    events.push({date, kind, detail, synthetic: false});
  };

  for (let W = cycleStart + 7 * (Math.floor((asOfDay - cycleStart) / 7) + 1); W < raceDay; W += 7) {
    const monday = addDays(base.cycleStartDate, W - cycleStart);
    // Правило rebuildQuery на момент фиксации слота в реальной 7-дневной очереди (понедельник − 6):
    const commitDay = W - 6;
    const checkpointRequired = base.profile.canRun3Km &&
      (commitDay - day(base.lastAssessmentDate) >= 21 || base.profile.performanceMismatch === 'CLEAR');
    const planning: EngineState = {...base, checkpointRequired, decision: decide(base, monday)};
    let generated: Workout[];
    try {
      generated = generateQueue(planning, monday);
    } catch (error) {
      if (!(error instanceof EngineError)) throw error;
      engineErrors.push({date: monday, code: error.code, detail: `generateQueue week of ${monday}`});
      continue;
    }
    const proposed = [...chain, ...generated.filter(g => !chain.some(c => c.id === g.id))]
      .sort((a, b) => day(a.scheduledDate) - day(b.scheduledDate));
    const guarded = guardWeeklyLoad(planning, proposed);
    const dropped = chain.filter(c => !guarded.some(g => g.id === c.id));
    if (dropped.length > 0) {
      logOnce(monday, 'RESERVATION_RELEASED',
        `Движок снял ранее зарезервированные слоты при пересмотре (${dropped.map(w => `${w.scheduledDate} ${w.type}`).join(', ')}): бронь недоступна.`);
    }
    chain = guarded;

    if (checkpointRequired) {
      logOnce(monday, 'CHECKPOINT_DUE',
        'Обязательная контрольная точка (правило 21 дня после последнего измерения): слот контроля зарезервирован, ' +
        'но без реального измерения 3000 м подтверждение прогрессии невозможно.');
    }
    for (const workout of guarded) {
      const d = day(workout.scheduledDate);
      if (d < W || d >= W + 7 || d <= asOfDay || displayed.has(workout.id)) continue;
      displayed.add(workout.id);
      const rowState: EngineState = {...planning, decision: decide(base, workout.scheduledDate)};
      if (rowState.decision.confidence === 'LOW') {
        logOnce(workout.scheduledDate, 'STALE_MEASUREMENT',
          'Результат 3000 м устарел (>42 дней): доверие LOW, фаза HOLD_DIAGNOSTIC — интенсивные назначения закрыты до нового измерения.');
      }
      if (rowState.decision.phase === 'TAPER') logOnce(workout.scheduledDate, 'TAPER', 'Начат TAPER по правилам движка (дни до норматива).');
      entries.push(makeEntry(
        'CONSERVATIVE', weekOf(base, workout.scheduledDate), workout, rowState, false, null,
        workout.type === 'CONTROL' ? ['CHECKPOINT_DUE']
          : rowState.decision.phase === 'HOLD_DIAGNOSTIC' ? ['PERFORMANCE_CONFIDENCE_LOW'] : [],
        workout.type === 'CONTROL'
          ? 'Консервативная бронь слота контрольной точки: без реального измерения 3000 м неразрешено.'
          : 'Консервативное бронирование без перехода: резерв нагрузки/восстановления, не результат и не пропуск; прогрессия не начисляется.'));
    }
  }
  const raceDate = base.profile.raceDate;
  events.push({date: raceDate, kind: 'RACE_DAY', detail: 'День норматива; итоговый результат без реального забега не вводится.', synthetic: false});
  return {
    mode: 'RESERVATION', asOf, cycleStartDate: base.cycleStartDate, raceDate,
    seedDigest: digest, seedUnchanged: true,
    entries, events, finalResultSeconds: null, engineErrors,
    windowViolations: sweepForecastWindows(entries),
  };
}

// ------------------------------------------------------------------------------------------------ mode B: conditional
function forecastConditional(base: EngineState, asOf: string, digest: string): ForecastResult {
  // Действующая очередь возвращается дословно из входного состояния (виртуальный сценарий её
  // не меняет); проход выполняется на изолированной копии.
  const committed = structuredClone(base.queue);
  const entries: ForecastEntry[] = committed.map(w => makeEntry(
    'COMMITTED', weekOf(base, w.scheduledDate), w, base, false, null, [],
    'Действующая очередь движка на момент расчёта; возвращена без изменений.'));
  const displayed = new Set(committed.map(w => w.id));
  const events: ForecastEvent[] = [];
  const engineErrors: ForecastResult['engineErrors'] = [];
  const secText = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  let state = base;
  const raceDay = day(base.profile.raceDate);
  for (let d = day(asOf); d < raceDay; d++) {
    const today = addDays(asOf, d - day(asOf));
    state = replan(state, today);
    const workout = state.queue.find(w => w.scheduledDate === today) ?? null;
    if (workout === null) continue;
    const note = 'Условный прогноз: предполагается успешное выполнение (синтетический отчёт). Это не допуск к нагрузке и не доказательство переносимости.';

    if (workout.type === 'CONTROL') {
      // Контрольный 3000 м: только прежний известный результат, улучшение не предполагается.
      const known = state.profile.performance;
      if (known === null) {
        engineErrors.push({date: today, code: 'CHECKPOINT_NOT_PERMITTED', detail: 'CONTROL without measured performance'});
        state = skipWorkout(state, workout.id, today);
        continue;
      }
      if (!displayed.has(workout.id)) {
        displayed.add(workout.id);
        entries.push(makeEntry('CONDITIONAL', weekOf(state, today), workout, state, true, 'GREEN', [],
          `${note} Контрольный 3000 м: условный ввод = прежний известный результат ${secText(known.timeSeconds)}, улучшение не предполагается.`));
      }
      state = recordResult(state, workout.id, {
        date: today, completionFraction: 1, sessionRpe: 8.5, safety: assumedSafety(),
        durationMinutes: workout.warmupMinutes + workout.cooldownMinutes + known.timeSeconds / 60,
        distanceMeters: 3000, repeats: [], restSeconds: [], conditions: {}, unexpectedFatigue: false,
        feedbackConfirmed: true,
      });
      state = recordCheckpoint(state, {timeSeconds: known.timeSeconds, date: today, source: 'TEST_3K'}, today);
      events.push({date: today, kind: 'CONDITIONAL_CONTROL',
        detail: `Условный ввод контрольных 3000 м: ${secText(known.timeSeconds)} (= прежний известный результат).`, synthetic: true});
      continue;
    }

    try {
      const before = state;
      state = recordResult(state, workout.id, conditionalResult(workout));
      const classified = state.history.find(h => h.workout.id === workout.id)?.classified ?? null;
      if (!displayed.has(workout.id)) {
        displayed.add(workout.id);
        entries.push(makeEntry('CONDITIONAL', weekOf(state, today), workout, before, true,
          classified?.evaluation ?? null, [], note));
      }
    } catch (error) {
      if (!(error instanceof EngineError)) throw error;
      engineErrors.push({date: today, code: error.code, detail: `${workout.type} ${workout.id}`});
      state = skipWorkout(state, workout.id, today);
      if (!displayed.has(workout.id)) {
        displayed.add(workout.id);
        entries.push(makeEntry('UNRESOLVED', weekOf(state, today), workout, state, false, null, [],
          `Движок отказал в записи условного результата (${error.code}); слот закрыт как пропуск.`));
      }
    }
  }

  // День норматива: итог только как прежний известный результат; без измерения — не выдумывается.
  const raceDate = base.profile.raceDate;
  const perf = state.profile.performance;
  let finalResultSeconds: number | null = null;
  if (perf === null) {
    events.push({date: raceDate, kind: 'NO_FINAL_RESULT',
      detail: 'Нет измеренного результата 3000 м: итоговый результат не придумывается.', synthetic: false});
  } else {
    state = recordFinalResult(state, {timeSeconds: perf.timeSeconds, date: raceDate, source: 'TEST_3K'}, raceDate);
    finalResultSeconds = perf.timeSeconds;
    events.push({date: raceDate, kind: 'CONDITIONAL_FINAL_RACE',
      detail: `Итоговый результат = прежний известный (${secText(perf.timeSeconds)}); улучшение не предполагается.`, synthetic: true});
  }
  return {
    mode: 'CONDITIONAL', asOf, cycleStartDate: base.cycleStartDate, raceDate,
    seedDigest: digest, seedUnchanged: true,
    entries, events, finalResultSeconds, engineErrors,
    windowViolations: sweepForecastWindows(entries),
  };
}

// ------------------------------------------------------------------------------------------------ public API
/**
 * Прогноз тренировочного цикла до даты норматива.
 *
 * Входное состояние не изменяется (побайтовая неизменность возвращается в seedUnchanged). Старые
 * сохранённые состояния нормализуются тем же путём, что при загрузке приложения (`deserialize`),
 * поэтому legacy-сохранения без аддитивных полей поддерживаются. Детерминировано: повторный вызов
 * с теми же входами даёт идентичный результат.
 *
 * @throws EngineError CLOCK_BACKWARDS — asOf раньше state.asOf;
 *         EVENT_DATE_PASSED — цикл закрыт итоговым результатом или asOf позже raceDate.
 */
export function forecastCycle(state: EngineState, options: ForecastOptions): ForecastResult {
  if (!FORECAST_MODES.includes(options.mode)) throw new EngineError('INVALID_PROFILE_FLAG');
  const asOf = options.asOf ?? state.asOf;
  day(asOf);
  if (day(asOf) < day(state.asOf)) throw new EngineError('CLOCK_BACKWARDS');
  if (state.finalResultRecorded || day(asOf) > day(state.profile.raceDate)) throw new EngineError('EVENT_DATE_PASSED');
  const digest = serialize(state);
  // Нормализация + валидация тем же путём, что загрузка сохранения в приложении.
  const base = deserialize(digest);
  const result = options.mode === 'RESERVATION'
    ? forecastReservation(base, asOf, digest)
    : forecastConditional(base, asOf, digest);
  result.seedUnchanged = serialize(state) === digest;
  return result;
}
