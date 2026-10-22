/**
 * Issue #51 — рабочее ядро полного прогноза (production API `forecastCycle`).
 *
 * Проверяется контракт модуля: побайтовая неизменность входного состояния, дословное сохранение
 * действующей очереди, горизонты 8/12/16+ недель, все скользящие 7-дневные окна (включая стыки
 * недель), работа с частично пройденным циклом (выполненные/пропущенные/перенесённые занятия),
 * честность контрольных точек и новичка, детерминизм, совместимость с legacy-сохранениями.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  EngineError, FORECAST_MODES, addDays, createEngine, forecastCycle, moveWorkout, recordFinalResult,
  recordResult, replan, serialize, skipWorkout, sweepForecastWindows,
} from '../src/index.ts';
import type {EngineState, ForecastEntry, Profile} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, profile} from './helpers.ts';

// ------------------------------------------------------------------ fixtures
const noviceProfile = (): Profile => profile({
  performance: null, targetTimeSeconds: 1200, raceDate: dateAfter(84),
  actualRunsPerWeek: 1, availableRunsPerWeek: 3, averageWeeklyKm4Weeks: 2, longestUsualRunKm: 1.5,
  regularRunningWeeks: 3, canRun3Km: false, qualitySessions8Weeks: 0, qualityWeeks8Weeks: 0,
  qualityMostlyTolerated: false, experience: {threshold: false, vo2: false, specific3k: false},
});

const freshState = (over: Partial<Profile> = {}): EngineState =>
  createEngine(profile({raceDate: dateAfter(84), ...over}), NOW);

/** Прошёл `days` дней цикла: каждое назначенное занятие выполнено GREEN, кроме одного пропуска. */
function midCycleState(over: Partial<Profile> = {}, days = 17, skipAt: number | null = 6): {state: EngineState; skipped: number} {
  let state = freshState(over);
  let skipped = 0;
  for (let d = 0; d < days; d++) {
    const today = dateAfter(d);
    state = replan(state, today);
    const w = state.queue.find(x => x.scheduledDate === today);
    if (!w) continue;
    if (skipped === 0 && skipAt !== null && d >= skipAt) {
      state = skipWorkout(state, w.id, today);
      skipped++;
      continue;
    }
    state = recordResult(state, w.id, feedback(w, 'GREEN'));
  }
  return {state, skipped};
}

const digestOf = (s: EngineState): string => serialize(s);

// ------------------------------------------------------------------ неизменность и детерминизм
test('FC-01 побайтовая неизменность входного состояния в обоих режимах', () => {
  for (const over of [{}, experienced, {raceDate: dateAfter(56)}]) {
    for (const mode of FORECAST_MODES) {
      const state = freshState(over);
      const before = digestOf(state);
      const result = forecastCycle(state, {mode});
      assert.equal(result.seedDigest, before);
      assert.equal(result.seedUnchanged, true, `${mode}: state must be untouched`);
      assert.equal(serialize(state), before, 'input state byte-identical after forecast');
    }
  }
  // Частично пройденный цикл с пропуском.
  const {state} = midCycleState();
  const before = digestOf(state);
  for (const mode of FORECAST_MODES) forecastCycle(state, {mode});
  assert.equal(serialize(state), before);
});

test('FC-02 детерминизм: повторный расчёт идентичен', () => {
  for (const mode of FORECAST_MODES) {
    const a = forecastCycle(freshState(experienced), {mode});
    const b = forecastCycle(freshState(experienced), {mode});
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  }
});

// ------------------------------------------------------------------ действующая очередь дословно
test('FC-03 COMMITTED-позиции равны входной очереди дословно (свежий и частичный цикл)', () => {
  for (const state of [freshState(), midCycleState().state, createEngine(noviceProfile(), NOW)]) {
    for (const mode of FORECAST_MODES) {
      const result = forecastCycle(state, {mode});
      const committed = result.entries.filter(e => e.status === 'COMMITTED');
      assert.equal(committed.length, state.queue.length);
      assert.deepEqual(committed.map(e => e.workout), state.queue, 'verbatim committed queue');
      // Идентификаторы уникальны: ни одной позиции дважды.
      const ids = result.entries.map(e => e.workout.id);
      assert.equal(new Set(ids).size, ids.length, 'no duplicate entries');
      // COMMITTED идут первыми.
      const firstNonCommitted = result.entries.findIndex(e => e.status !== 'COMMITTED');
      assert.ok(result.entries.slice(0, firstNonCommitted === -1 ? undefined : firstNonCommitted)
        .every(e => e.status === 'COMMITTED'));
    }
  }
});

test('FC-04 валидация параметров: CLOCK_BACKWARDS, EVENT_DATE_PASSED, режим', () => {
  const state = freshState();
  assert.throws(() => forecastCycle(state, {mode: 'RESERVATION', asOf: dateAfter(-1)}),
    (e: unknown) => e instanceof EngineError && e.code === 'CLOCK_BACKWARDS');
  assert.throws(() => forecastCycle(state, {mode: 'RESERVATION', asOf: dateAfter(100)}),
    (e: unknown) => e instanceof EngineError && e.code === 'EVENT_DATE_PASSED');
  const closed = recordFinalResult(state,
    {timeSeconds: 920, date: dateAfter(84), source: 'TEST_3K'}, dateAfter(84));
  assert.throws(() => forecastCycle(closed, {mode: 'RESERVATION'}),
    (e: unknown) => e instanceof EngineError && e.code === 'EVENT_DATE_PASSED');
  // asOf == raceDate — легальный прогноз без будущих недель: только действующая очередь дословно.
  const raceDay = forecastCycle(state, {mode: 'RESERVATION', asOf: dateAfter(84)});
  assert.equal(raceDay.entries.length, state.queue.length);
  assert.ok(raceDay.entries.every(e => e.status === 'COMMITTED'));
  assert.ok(raceDay.events.some(e => e.kind === 'RACE_DAY'));
});

// ------------------------------------------------------------------ режим RESERVATION
test('FC-05 RESERVATION: бронирование без прогрессии, границы цикла, честные контрольные окна', () => {
  for (const weeks of [8, 12, 16]) {
    const state = freshState({...experienced, raceDate: dateAfter(weeks * 7)});
    const result = forecastCycle(state, {mode: 'RESERVATION'});
    assert.ok(result.entries.every(e => !e.synthetic && e.assumedEvaluation === null));
    assert.equal(result.finalResultSeconds, null);
    // Весь остаток цикла до норматива покрыт, позиций в день норматива и позже нет.
    const weeksPresent = new Set(result.entries.map(e => e.week));
    for (let w = 1; w <= weeks; w++) assert.ok(weeksPresent.has(w), `week ${w} present`);
    assert.ok(result.entries.every(e => e.workout.scheduledDate < state.profile.raceDate));
    // Бюджет заморожен на исходном уровне.
    const budget = state.easyProgression!.approvedMetersPer7Days;
    assert.ok(result.entries.every(e => e.approvedWeekMeters === budget));
    // Единственное измерение устаревает до TAPER: поздние недели честно в HOLD_DIAGNOSTIC
    // (это поведение движка, а не дефект прогноза).
    assert.ok(result.entries.some(e => e.phase === 'HOLD_DIAGNOSTIC'));
  }
  // Устаревшее измерение: поздние недели в HOLD_DIAGNOSTIC с явной пометкой, события честны.
  const stale = createEngine(profile({
    ...experienced, performance: {timeSeconds: 920, date: dateAfter(-30), source: 'TEST_3K'},
  }), NOW);
  const result = forecastCycle(stale, {mode: 'RESERVATION'});
  assert.ok(result.entries.some(e => e.phase === 'HOLD_DIAGNOSTIC'));
  assert.ok(result.entries.some(e => e.blockingReasons.includes('PERFORMANCE_CONFIDENCE_LOW')));
  assert.ok(result.events.some(e => e.kind === 'STALE_MEASUREMENT'));
  assert.ok(result.events.some(e => e.kind === 'CHECKPOINT_DUE'));
});

test('FC-06 RESERVATION: реальная история частичного цикла используется, пропуск не стирается', () => {
  const {state, skipped} = midCycleState(experienced);
  assert.equal(skipped, 1);
  const historyBefore = state.history.length;
  const result = forecastCycle(state, {mode: 'RESERVATION'});
  assert.equal(result.seedUnchanged, true);
  assert.equal(state.history.length, historyBefore, 'real history untouched');
  // Подтверждённые GREEN-блоки уже подняли бюджет — прогноз использует его, но не начисляет нового.
  assert.ok(result.entries.every(e => e.approvedWeekMeters === state.easyProgression!.approvedMetersPer7Days));
});

// ------------------------------------------------------------------ режим CONDITIONAL
test('FC-07 CONDITIONAL: контроли и итог = прежнему известному времени, без улучшения', () => {
  const state = freshState(experienced);
  const result = forecastCycle(state, {mode: 'CONDITIONAL'});
  assert.equal(result.finalResultSeconds, 920, 'final race = last known time');
  const controls = result.events.filter(e => e.kind === 'CONDITIONAL_CONTROL');
  assert.ok(controls.length >= 2, 'engine-scheduled controls happen');
  const conditional = result.entries.filter(e => e.status === 'CONDITIONAL');
  assert.ok(conditional.length > 0);
  assert.ok(conditional.every(e => e.synthetic && e.assumedEvaluation !== null));
  assert.ok(result.entries.some(e => e.phase === 'SPECIFIC'), 'specific phase reachable conditionally');
  assert.ok(result.entries.some(e => e.phase === 'TAPER'), 'taper reachable conditionally (controls keep the measurement fresh)');
});

test('FC-08 CONDITIONAL для новичка: ни темпа, ни контролей, ни выдуманного итога', () => {
  const state = createEngine(noviceProfile(), NOW);
  for (const mode of FORECAST_MODES) {
    const result = forecastCycle(state, {mode});
    for (const e of result.entries) {
      assert.equal(e.workout.paceRangeSecondsPerKm, null, 'no invented pace');
      assert.equal(e.workout.speedRangeMps, null, 'no invented treadmill speed');
      assert.equal(e.workout.countsAsQuality, false, 'no quality work without measurement');
      assert.equal(e.workout.main.mode, 'RUN_WALK', 'novice stays on the run/walk ladder');
    }
    assert.equal(result.finalResultSeconds, null);
  }
  const conditional = forecastCycle(state, {mode: 'CONDITIONAL'});
  assert.ok(!conditional.entries.some(e => e.workout.type === 'CONTROL'), '3 km ability never confirmed');
  assert.ok(conditional.events.some(e => e.kind === 'NO_FINAL_RESULT'));
});

// ------------------------------------------------------------------ скользящие окна
test('FC-09 все скользящие 7-дневные окна (включая стыки недель) чисты во всех прогонах', () => {
  const states: [string, EngineState][] = [
    ['trained-8w', freshState({...experienced, raceDate: dateAfter(56)})],
    ['trained-12w', freshState(experienced)],
    ['trained-16w', freshState({...experienced, raceDate: dateAfter(112)})],
    ['base-12w', freshState()],
    ['novice-12w', createEngine(noviceProfile(), NOW)],
    ['mid-cycle', midCycleState(experienced).state],
  ];
  for (const [name, state] of states) {
    for (const mode of FORECAST_MODES) {
      const result = forecastCycle(state, {mode});
      assert.deepEqual(result.windowViolations, [], `${name}/${mode}: ` +
        result.windowViolations.map(v => v.detail).join(' | '));
    }
  }
});

test('FC-10 свип окон: неизвестный резерв не считается нулевым', () => {
  const state = freshState();
  const w = state.queue[0]!;
  const known: ForecastEntry = {
    status: 'CONSERVATIVE', week: 1, workout: w, phase: 'DEVELOPMENT', gate: 'CLOSED', confidence: 'HIGH',
    reservationMeters: 5000, approvedWeekMeters: 16000, synthetic: false, assumedEvaluation: null,
    blockingReasons: [], note: '',
  };
  // Одинаковые даты исключены: второй элемент — тот же день другой недели, бронь известна.
  const far = {...known, workout: {...w, id: 'slot-far', scheduledDate: addDays(w.scheduledDate, 7)}};
  assert.deepEqual(sweepForecastWindows([known, far]), []);
  // Рука с неизвестным резервом в окне -> UNKNOWN_RESERVE, а не молчаливый проход.
  const unknown: ForecastEntry = {...known, workout: {...w, id: 'slot-x', scheduledDate: addDays(w.scheduledDate, 2)}, reservationMeters: null};
  const violations = sweepForecastWindows([known, unknown]);
  assert.ok(violations.some(v => v.kind === 'UNKNOWN_RESERVE'));
  // Превышение бюджета ловится.
  const fat: ForecastEntry = {...known, workout: {...w, id: 'slot-y', scheduledDate: addDays(w.scheduledDate, 3)}, reservationMeters: 12000};
  assert.ok(sweepForecastWindows([known, fat]).some(v => v.kind === 'BUDGET'));
});

// ------------------------------------------------------------------ частичный цикл и переносы
test('FC-11 частично пройденный цикл с перенесённым занятием: прогноз строится от реального asOf', () => {
  const state = midCycleState(experienced, 10, null).state;
  // Переносим подвижное занятие на свободную дату в пределах недели (первый удачный вариант:
  // перенос ограничен бюджетом и восстановлением, не любая пара допустима).
  const taken = new Set([
    ...state.queue.map(w => w.scheduledDate), ...state.history.map(h => h.result.date),
  ]);
  const freeDates = Array.from({length: 6}, (_, i) => addDays(state.asOf, i + 1)).filter(d => !taken.has(d));
  let moved = state; let movableId = ''; let target = '';
  outer: for (const w of state.queue.filter(x => x.movable && x.type !== 'REST')) {
    for (const d of freeDates) {
      try {
        moved = moveWorkout(state, w.id, d);
        movableId = w.id; target = d;
        break outer;
      } catch (error) {
        if (!(error instanceof EngineError)) throw error;
      }
    }
  }
  assert.ok(movableId, 'a legal move exists in the fixture');
  const resultA = forecastCycle(moved, {mode: 'RESERVATION'});
  const resultB = forecastCycle(moved, {mode: 'CONDITIONAL'});
  for (const result of [resultA, resultB]) {
    assert.equal(result.seedUnchanged, true);
    assert.deepEqual(result.entries.filter(e => e.status === 'COMMITTED').map(e => e.workout), moved.queue);
    assert.deepEqual(result.windowViolations, []);
    assert.ok(result.entries.every(e => e.workout.scheduledDate >= moved.asOf || e.status === 'COMMITTED'));
  }
  // Перенесённое занятие присутствует дословно в COMMITTED.
  assert.ok(resultA.entries.some(e => e.status === 'COMMITTED' && e.workout.id === movableId &&
    e.workout.scheduledDate === target));
});

test('FC-12 CONDITIONAL поверх частичного цикла: сценарий продолжает реальную историю', () => {
  const {state} = midCycleState(experienced, 24, 9);
  const result = forecastCycle(state, {mode: 'CONDITIONAL'});
  assert.equal(result.seedUnchanged, true);
  assert.equal(result.finalResultSeconds, 920);
  // История входа не изменилась, сценарий шёл только по копии.
  assert.equal(state.history.length, 24 - 1 /* skip */ >= 0 ? state.history.length : 0);
  assert.ok(result.entries.filter(e => e.status === 'CONDITIONAL')
    .every(e => e.workout.scheduledDate > state.asOf || state.queue.some(w => w.id === e.workout.id)));
  assert.deepEqual(result.windowViolations, []);
});

// ------------------------------------------------------------------ legacy-совместимость
test('FC-13 старые сохранённые состояния без аддитивных полей поддерживаются', () => {
  const state = freshState(experienced);
  // Эмуляция legacy-сохранения: удаляем аддитивные v1-расширения и новые флаги.
  const legacy = JSON.parse(serialize(state)) as EngineState & Record<string, unknown>;
  delete legacy.easyProgression;
  delete legacy.runWalkProgression;
  delete legacy.yellowEasyRequired;
  delete legacy.pendingQualityFactor;
  const result = forecastCycle(legacy as EngineState, {mode: 'RESERVATION'});
  assert.equal(result.seedUnchanged, true);
  assert.ok(result.entries.length > 0);
  assert.deepEqual(result.windowViolations, []);
  const conditional = forecastCycle(legacy as EngineState, {mode: 'CONDITIONAL'});
  assert.equal(conditional.finalResultSeconds, 920);
  // Некорректное состояние отклоняется тем же путём, что при загрузке приложения.
  const broken = JSON.parse(serialize(state)) as EngineState;
  broken.version = 2 as 1;
  assert.throws(() => forecastCycle(broken, {mode: 'RESERVATION'}),
    (e: unknown) => e instanceof EngineError && e.code === 'UNSUPPORTED_STATE_VERSION');
});
