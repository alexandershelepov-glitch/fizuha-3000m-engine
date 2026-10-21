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
        rows: r.rows, events: r.events, weeks: r.weeks,
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
test('FS-05 модель А не начисляет успех, прогрессию, допуски и «омоложение» измерения', () => {
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
    assert.deepEqual(s.doses, {}, 'no dose progression');
    assert.equal(s.history.length, 0, 'model A never fabricates HistoryEntry records');
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
  // Нюанс (не нарушение): движок намеренно не требует восстановления после ПРОПУЩЕННОЙ сессии
  // (skipped → hours=0), поэтому в модели А интенсивный слот может стоять на следующий день после
  // прогнозного пропуска. Требование 48 ч проверяется против реально записанных результатов — см. FS-10.
});

test('FS-07 модель А: после обязательной контрольной точки интенсивные назначения законно заканчиваются', () => {
  for (const userId of ['U4-intermediate', 'U5-trained']) {
    for (const weeks of [8, 12]) {
      const run = byId(A, userId, weeks);
      const intense = run.rows.filter(r => QUALITY_TYPES.includes(r.type));
      assert.ok(intense.length > 0, 'initial queue contains authorised quality work');
      assert.ok(intense.every(r => r.week <= 3), `${userId}: no new quality after the checkpoint window opens`);
      assert.ok(run.rows.some(r => r.type === 'CONTROL' && r.week >= 4),
        'checkpoint CONTROL slots appear and are honestly shown as skipped projections');
      assert.ok(run.rows.some(r => r.phase === 'HOLD_DIAGNOSTIC'), 'stale measurement leads to HOLD_DIAGNOSTIC');
      assert.ok(run.events.some(e => e.kind === 'CHECKPOINT_WINDOW_UNRESOLVED'), 'checkpoint window is reported');
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
