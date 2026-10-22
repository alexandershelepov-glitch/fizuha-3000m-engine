/**
 * Issue #51 — автоматические проверки эксперимента полного прогнозного календаря.
 *
 * Проверяются только инварианты, заявленные в постановке: неизменность исходного состояния,
 * детерминизм, отсутствие тренировок в день норматива, честный статус будущих позиций,
 * отсутствие прогрессии в модели А, условность и неулучшение результатов в модели Б,
 * соблюдение недельного бюджета и восстановления, отсутствие выдуманного темпа/времени у новичка.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectModelA, projectModelB, runSpike, spikeConfigs} from '../audit/issue-51-forecast-spike/forecast.ts';
import type {ForecastRun} from '../audit/issue-51-forecast-spike/forecast.ts';

const {A, B} = runSpike();
const all = [...A, ...B];
const byId = (runs: ForecastRun[], userId: string, weeks: number): ForecastRun =>
  runs.find(r => r.user.id === userId && r.horizonWeeks === weeks)!;
const QUALITY_TYPES = ['INTRO_QUALITY', 'THRESHOLD', 'VO2', 'SPECIFIC_3K'];

// ------------------------------------------------------------------ исходное состояние неизменно
test('FS-01 многонедельный просмотр не изменяет исходный EngineState (побайтовая неизменность)', () => {
  for (const run of all) {
    assert.equal(JSON.stringify(run.seed), run.seedSerialized,
      `${run.model}/${run.user.id}/${run.horizonWeeks}w: seed changed after projection`);
    assert.deepEqual(run.seed, JSON.parse(run.seedSerialized), 'structural identity of seed');
  }
});

test('FS-02 повторный расчёт с теми же входами полностью идентичен', () => {
  for (const cfg of spikeConfigs()) {
    for (const project of [projectModelA, projectModelB]) {
      const first = project(cfg.user, cfg.horizonWeeks);
      const second = project(cfg.user, cfg.horizonWeeks);
      const strip = (r: ForecastRun) => JSON.stringify({
        rows: r.rows, events: r.events, weeks: r.weeks, windowViolations: r.windowViolations,
        issuedSnapshot: r.issuedSnapshot,
        finalResultSeconds: r.finalResultSeconds, controlSeconds: r.controlSeconds, engineErrors: r.engineErrors,
      });
      assert.equal(strip(first), strip(second), `${first.model}/${cfg.user.id}/${cfg.horizonWeeks}w not deterministic`);
    }
  }
});

// ------------------------------------------------------------------ календарные границы
test('FS-03 ни одной тренировки в день норматива и позже; очередь модели Б пуста после финиша', () => {
  for (const run of all) {
    const days = run.horizonWeeks * 7;
    for (const row of run.rows) {
      assert.ok(row.offset < days, `${run.model}/${run.user.id}: workout on/after race day (${row.date})`);
      assert.ok(row.date < run.raceDate, 'row date before raceDate');
    }
    if (run.model === 'B' && run.finalResultSeconds !== null) {
      assert.equal(run.finalState.queue.length, 0, 'cycle closed: empty queue after final result');
      assert.equal(run.finalState.finalResultRecorded, true);
    }
  }
});

test('FS-04 у каждой позиции явный статус; неделя 1 помечена как реально выданная очередь', () => {
  for (const run of all) {
    const allowed = run.model === 'A'
      ? ['ISSUED', 'CONSERVATIVE_FORECAST']
      : ['ISSUED', 'CONDITIONAL_FORECAST', 'UNRESOLVED'];
    for (const row of run.rows) {
      assert.ok(allowed.includes(row.status), `${run.model}: unexpected status ${row.status}`);
      assert.ok(row.note.length > 10, 'every row carries an explicit origin note');
    }
    assert.ok(run.rows.some(r => r.status === 'ISSUED'), 'week-1 rows come from the real committed queue');
  }
});

// ------------------------------------------------------------------ модель А: никакой прогрессии
test('FS-05 модель А: ни успехов, ни пропусков — только бронирование', () => {
  for (const run of A) {
    const s = run.finalState;
    assert.equal(s.successfulQuality, 0);
    assert.equal(s.successfulIntro, 0);
    assert.deepEqual(s.successStreak, {});
    assert.equal(s.qualityRotation, 0);
    assert.equal(s.easyProgression!.approvedMetersPer7Days, run.seed.easyProgression!.approvedMetersPer7Days,
      'approved weekly budget unchanged');
    assert.deepEqual(s.profile.performance, run.seed.profile.performance,
      'no measurement refresh/rejuvenation');
    assert.deepEqual(s.doses, run.seed.doses, 'no dose progression');
    assert.equal(s.history.length, 0, 'model A never fabricates HistoryEntry records');
    // Замечание 2: бронирование не имитируется пропусками.
    assert.equal(s.skippedWorkouts.length, 0, 'no fabricated misses');
    assert.deepEqual(s.skippedIds, run.seed.skippedIds, 'skippedIds untouched');
    assert.deepEqual(s.movedWorkouts, run.seed.movedWorkouts, 'movedWorkouts untouched');
    assert.deepEqual(s.queue, run.seed.queue, 'the real committed queue is untouched');
  }
});

test('FS-06 модель А: будущие брони укладываются в недельный бюджет', () => {
  for (const run of A) {
    for (const w of run.weeks) {
      if (w.plannedReservedMeters !== null) {
        assert.ok(w.plannedReservedMeters <= w.approvedWeekMeters + 1e-6,
          `${run.user.id} week ${w.week}: reserve ${w.plannedReservedMeters} > budget ${w.approvedWeekMeters}`);
      }
    }
  }
});

test('FS-07 модель А: ритм бронирования движка и законная граница данных', () => {
  for (const userId of ['U4-intermediate', 'U5-trained']) {
    for (const weeks of [8, 12]) {
      const run = byId(A, userId, weeks);
      // Недели 2–4 повторяют выданный ритм (резерв без прогрессии).
      const issuedTypes = run.rows.filter(r => r.status === 'ISSUED').map(r => r.type).sort();
      for (const week of [2, 3, 4]) {
        const types = run.rows.filter(r => r.week === week).map(r => r.type).sort();
        assert.deepEqual(types, issuedTypes, `${userId} week ${week}: baseline rhythm reserved`);
      }
      // С недели 5 — обязательное окно контрольной точки: слот CONTROL зарезервирован, но не выполнен.
      assert.ok(run.rows.some(r => r.type === 'CONTROL' && r.week >= 5 && r.status === 'CONSERVATIVE_FORECAST'),
        'checkpoint CONTROL slots are reserved, not executed and not missed');
      // После устаревания измерения (>42 дней, неделя 7+) интенсивные назначения законно заканчиваются.
      assert.ok(run.rows.filter(r => QUALITY_TYPES.includes(r.type)).every(r => r.week <= 7),
        `${userId}: no quality reservations after the measurement goes stale`);
      assert.ok(run.rows.some(r => r.phase === 'HOLD_DIAGNOSTIC'), 'stale measurement leads to HOLD_DIAGNOSTIC');
      assert.ok(run.events.some(e => e.kind === 'CHECKPOINT_WINDOW_UNRESOLVED'), 'checkpoint window is reported');
      // Дозы базовых недель не прогрессируют относительно выданной недели.
      for (const type of QUALITY_TYPES) {
        const issuedDose = run.rows.find(r => r.status === 'ISSUED' && r.type === type)?.doseValue;
        if (issuedDose === undefined) continue;
        for (const row of run.rows.filter(r => r.type === type && r.week >= 2 && r.week <= 4)) {
          assert.equal(row.doseValue, issuedDose, `${type} dose stays at the issued baseline`);
        }
      }
    }
  }
});

// ------------------------------------------------------------------ модель Б: условность и неулучшение
test('FS-08 модель Б: каждый результат синтетический, контрольные 3000 м не улучшают прежнее время', () => {
  for (const run of B) {
    if (run.user.currentSeconds === null) continue;
    assert.ok(run.controlSeconds.length >= 2, 'controls scheduled by the engine');
    for (const seconds of run.controlSeconds) {
      assert.equal(seconds, run.user.currentSeconds, 'control equals the last known time, never better');
    }
    assert.equal(run.finalResultSeconds, run.user.currentSeconds, 'final race = last known time');
    for (const row of run.rows) {
      if (row.status === 'CONDITIONAL_FORECAST') {
        assert.ok(row.syntheticEvaluation !== null, 'conditional rows carry the assumed evaluation');
      }
    }
  }
});

test('FS-09 модель Б: контраст с А — прогрессия начисляется только на синтетические подтверждения', () => {
  // Внимание: recordFinalResult по спецификации движка обнуляет счётчики успеха, поэтому
  // доказательством служат недельные сводки и состав очереди, а не finalState.successfulQuality.
  const a = byId(A, 'U5-trained', 12);
  const b = byId(B, 'U5-trained', 12);
  const aQuality = a.rows.filter(r => r.countsAsQuality && r.type !== 'CONTROL' && r.status !== 'ISSUED').length;
  const bQuality = b.rows.filter(r => r.countsAsQuality && r.type !== 'CONTROL' && r.status !== 'ISSUED').length;
  assert.ok(bQuality > aQuality, 'conditional model continues quality work beyond the issued week');
  assert.ok(b.weeks.at(-1)!.approvedWeekMeters > a.weeks.at(-1)!.approvedWeekMeters,
    'approved weekly budget grows only under confirmed completions (model B) and stays frozen (model A)');
  assert.ok(b.rows.some(r => r.phase === 'SPECIFIC') && !a.rows.some(r => r.phase === 'SPECIFIC'),
    'SPECIFIC phase reachable only under the conditional scenario');
  assert.ok(b.controlSeconds.length > 0 && a.controlSeconds.length === 0,
    'checkpoint controls happen only in the conditional model');
});

test('FS-10 модель Б: недельные брони в бюджете и восстановление соблюдены', () => {
  for (const run of B) {
    for (const w of run.weeks) {
      if (w.plannedReservedMeters !== null) {
        assert.ok(w.plannedReservedMeters <= w.approvedWeekMeters + 1e-6,
          `${run.user.id} week ${w.week}: reserve ${w.plannedReservedMeters} > budget ${w.approvedWeekMeters}`);
      }
    }
    const quality = run.rows.filter(r => r.countsAsQuality);
    for (let i = 0; i < quality.length; i++) {
      for (let j = i + 1; j < quality.length; j++) {
        const gapDays = Math.abs(quality[i]!.offset - quality[j]!.offset);
        if (gapDays < 7) assert.ok(gapDays * 24 >= 48, 'quality recovery violated');
      }
    }
    // TAPER: никаких интенсивных занятий в последние 3 дня перед нормативом.
    const days = run.horizonWeeks * 7;
    for (const row of run.rows) {
      if (days - row.offset <= 3) {
        assert.ok(!row.countsAsQuality || row.type === 'REST', `intense work inside final 3 days (${row.date})`);
      }
    }
  }
});

// ------------------------------------------------------------------ новичок U1: ничего не выдумано
test('FS-11 U1: ни в одной модели нет числового темпа, быстрых тренировок, контрольных и итогового времени', () => {
  for (const weeks of [8, 12]) {
    for (const runs of [A, B]) {
      const run = byId(runs, 'U1-novice', weeks);
      for (const row of run.rows) {
        assert.equal(row.paceRangeSecondsPerKm, null, 'no invented pace');
        assert.equal(row.speedRangeKmh, null, 'no invented treadmill speed');
        assert.equal(row.countsAsQuality, false, 'no quality sessions without a measured result');
        assert.equal(row.type, 'EASY', 'only aerobic run/walk work');
        assert.equal(row.mode, 'RUN_WALK', 'novice stays on the run/walk ladder');
      }
      assert.equal(run.controlSeconds.length, 0, 'no control run: 3 km ability never confirmed');
      assert.equal(run.finalResultSeconds, null, 'no invented final result');
    }
    const b = byId(B, 'U1-novice', weeks);
    assert.ok(b.rows.some(r => r.doseValue > byId(A, 'U1-novice', weeks).rows[0]!.doseValue),
      'model B shows conditional budget growth for the novice; model A stays frozen');
    assert.ok(byId(A, 'U1-novice', weeks).rows.every(r => r.runWalkStage === 0),
      'model A: run/walk stage frozen without confirmed completions');
  }
});

test('FS-12 модель Б U1: объёмный резерв растёт только условно, в пределах правил движка', () => {
  const b12 = byId(B, 'U1-novice', 12);
  const first = b12.weeks[0]!.approvedWeekMeters;
  const last = b12.weeks.at(-1)!.approvedWeekMeters;
  assert.equal(first, 2000, 'initial approved budget = questionnaire volume');
  assert.ok(last > first && last <= 2000 + 6 * 200, 'fortnightly +≤200 protective steps only');
});

// ------------------------------------------------------------------ замечание 3: скользящие окна
test('FS-13 все скользящие 7-дневные окна (включая стыки недель) в бюджете, восстановление соблюдено', () => {
  for (const run of all) {
    assert.deepEqual(run.windowViolations, [],
      `${run.model}/${run.user.id}/${run.horizonWeeks}w: ` +
      run.windowViolations.map(v => v.detail).join(' | '));
  }
});

// ------------------------------------------------------------------ замечание 1: сохранение выданной очереди
test('FS-14 утверждённая очередь отображается дословно и не зависит от сценария', () => {
  for (const run of all) {
    // Снапшот идентичен очереди, выданной движком на момент расчёта.
    assert.deepEqual(run.issuedSnapshot, run.seed.queue, 'snapshot == engine-issued queue');
    const snapshotById = new Map(run.issuedSnapshot.map(w => [w.id, w]));
    const issuedRows = run.rows.filter(r => r.status === 'ISSUED');
    assert.equal(issuedRows.length, run.issuedSnapshot.length, 'every issued workout is displayed');
    // Побайтовая идентичность повторной выдачи движка (стабильность расчёта).
    assert.equal(JSON.stringify(run.issuedSnapshot), JSON.stringify(run.seed.queue));
    for (const row of issuedRows) {
      const w = snapshotById.get(row.workoutId);
      assert.ok(w, `issued row ${row.workoutId} has a snapshot source`);
      // Даты, типы, дозировки, интервалы, темпы и остальные отображаемые параметры — из снапшота.
      assert.equal(row.date, w.scheduledDate);
      assert.equal(row.type, w.type);
      assert.equal(row.goal, w.goal);
      assert.equal(row.mode, w.main.mode);
      assert.equal(row.doseUnit, w.main.dose.unit);
      assert.equal(row.doseValue, Math.round(w.main.dose.value * 10) / 10);
      assert.equal(row.warmupMinutes, w.warmupMinutes);
      assert.equal(row.cooldownMinutes, w.cooldownMinutes);
      assert.equal(row.repeats, w.main.repeats);
      assert.equal(row.repeatMeters, w.main.repeatMeters);
      assert.equal(row.finalRepeatMeters, w.main.finalRepeatMeters === null ? null : Math.round(w.main.finalRepeatMeters * 10) / 10);
      assert.equal(row.restSeconds, w.restSeconds);
      assert.deepEqual(row.targetRpe, w.targetRpe);
      assert.deepEqual(row.paceRangeSecondsPerKm, w.paceRangeSecondsPerKm);
      assert.deepEqual(row.speedRangeKmh,
        w.speedRangeMps === null ? null : [Math.round(w.speedRangeMps[0] * 3.6 * 10) / 10, Math.round(w.speedRangeMps[1] * 3.6 * 10) / 10]);
      assert.equal(row.anchor, w.anchor);
      assert.equal(row.gateAtPrescription, w.gateAtPrescription);
      assert.equal(row.minimumRecoveryHoursBeforeQuality, w.minimumRecoveryHoursBeforeQuality);
      assert.equal(row.volumeFactor, w.volumeFactor);
      assert.equal(row.calibration, w.main.calibration === true);
      assert.equal(row.runWalkStage, w.main.runWalk?.stage ?? null);
    }
  }
  // Модель Б: виртуальное выполнение изменило живое состояние (дозы/фаза), но строки ISSUED
  // по-прежнему равны снапшоту, а не живой очереди.
  const b = byId(B, 'U5-trained', 12);
  const liveByDate = new Map(b.finalState.queue.map(w => [w.scheduledDate, w]));
  const issuedRows = b.rows.filter(r => r.status === 'ISSUED');
  assert.ok(issuedRows.length > 0);
  const liveDiverged = issuedRows.some(r => {
    const live = liveByDate.get(r.date);
    return live !== undefined &&
      (live.type !== r.type || Math.abs(live.main.dose.value - r.doseValue) > 1e-9);
  });
  if (liveDiverged) {
    for (const r of issuedRows) {
      const live = liveByDate.get(r.date);
      if (live === undefined) continue;
      const snapshot = b.issuedSnapshot.find(w => w.id === r.workoutId)!;
      assert.equal(r.type, snapshot.type, 'displayed type follows the snapshot, not the live queue');
      assert.equal(r.doseValue, Math.round(snapshot.main.dose.value * 10) / 10, 'displayed dose follows the snapshot');
    }
  }
});
