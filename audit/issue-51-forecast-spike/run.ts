/**
 * Issue #51 — генератор артефактов эксперимента.
 *
 * Один явный сценарий запуска: `npm run audit:issue51` (или `node --experimental-strip-types
 * audit/issue-51-forecast-spike/run.ts`). Пересчитывает обе модели для 3 профилей × 2 горизонтов,
 * выполняет встроенные инвариантные проверки и пишет машинно-читаемые JSON и Markdown-таблицы
 * в audit/issue-51-forecast-spike/results/. Полностью воспроизводимо: нет случайных данных и
 * обращений к внешнему состоянию (см. FS-02 о детерминизме).
 */
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runSpike} from './forecast.ts';
import type {ForecastRow, ForecastRun} from './forecast.ts';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'results');
mkdirSync(OUT_DIR, {recursive: true});

const {A, B} = runSpike();
const all = [...A, ...B];

// ------------------------------------------------------------------------------------------------ formatting
const secText = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const paceText = (r: [number, number] | null): string => r === null ? '—' : `${secText(r[0])}–${secText(r[1])}`;
const kmhText = (r: [number, number] | null): string => r === null ? '—' : `${r[0].toFixed(1)}–${r[1].toFixed(1)}`;
const m = (v: number | null): string => v === null ? 'н/д' : Math.round(v).toLocaleString('ru-RU');
const doseText = (r: ForecastRow): string => r.type === 'REST' ? '—'
  : `${r.doseValue} ${r.doseUnit === 'MINUTES' ? 'мин' : 'м'}`;
const repeatsText = (r: ForecastRow): string => {
  if (r.mode !== 'INTERVALS') return '—';
  const rep = r.repeatMeters === null ? '' : `${r.repeatMeters} м × ${r.repeats}`;
  return `${rep}, пауза ${r.restSeconds} с`.replace(/^, /, '');
};
const statusText = (r: ForecastRow): string => ({
  ISSUED: 'выдана',
  CONSERVATIVE_FORECAST: 'консерв. прогноз',
  CONDITIONAL_FORECAST: 'условный прогноз',
  UNRESOLVED: 'неразрешено',
}[r.status]);
const meters = (v: number | null): string => v === null ? 'н/д (нет измерения)' : Math.round(v).toLocaleString('ru-RU');

function calendarTable(run: ForecastRun): string {
  const lines = [
    '| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of run.rows) {
    lines.push(`| ${r.date} | ${r.week} | ${r.type}${r.runWalkStage !== null ? ` (бег/шаг этап ${r.runWalkStage})` : ''}${r.calibration ? ' (калибровка)' : ''} ` +
      `| ${doseText(r)} | ${r.mode} | ${repeatsText(r)} | ${paceText(r.paceRangeSecondsPerKm)} | ${kmhText(r.speedRangeKmh)} ` +
      `| ${m(r.reservedMeters)} | ${statusText(r)} | ${r.phase} · ${r.gateAtPrescription} · ${r.confidence} |`);
  }
  return lines.join('\n');
}

function weeklyCompareTable(a: ForecastRun, b: ForecastRun): string {
  const lines = [
    '| Нед | А: занятия | А: бронь / бюджет, м | А: качество | А: фаза · доверие | Б: занятия | Б: бронь / бюджет, м | Б: качество | Б: фаза · доверие | Различия A/Б |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (let i = 0; i < a.weeks.length; i++) {
    const wa = a.weeks[i]!; const wb = b.weeks[i]!;
    const diff: string[] = [];
    if (wa.types !== wb.types) diff.push('состав');
    if (wa.plannedReservedMeters !== wb.plannedReservedMeters) diff.push('бронь');
    if (wa.approvedWeekMeters !== wb.approvedWeekMeters) diff.push(`бюджет ${wa.approvedWeekMeters}→${wb.approvedWeekMeters}`);
    if (wa.qualityCount !== wb.qualityCount) diff.push('качество');
    if (wa.phase !== wb.phase) diff.push(`фаза ${wa.phase}→${wb.phase}`);
    if (wa.confidence !== wb.confidence) diff.push('доверие');
    if (wa.checkpointDue !== wb.checkpointDue) diff.push('контрольная точка');
    lines.push(`| ${wa.week} | ${wa.types} | ${m(wa.plannedReservedMeters)} / ${m(wa.approvedWeekMeters)} | ${wa.qualityCount} ` +
      `| ${wa.phase} · ${wa.confidence} | ${wb.types} | ${m(wb.plannedReservedMeters)} / ${m(wb.approvedWeekMeters)} | ${wb.qualityCount} ` +
      `| ${wb.phase} · ${wb.confidence} | ${diff.length === 0 ? '—' : diff.join(', ')} |`);
  }
  return lines.join('\n');
}

function checkpointTable(a: ForecastRun, b: ForecastRun): string {
  const marks = [4, 6, 8, 12].filter(w => w <= a.horizonWeeks);
  const lines = [
    '| Контрольная неделя | А: фаза · гейт · доверие · бюджет | Б: фаза · гейт · доверие · бюджет | Разрыв |',
    '|---|---|---|---|',
  ];
  for (const w of marks) {
    const wa = a.weeks[w - 1]!; const wb = b.weeks[w - 1]!;
    lines.push(`| ${w} | ${wa.phase} · ${wa.gate} · ${wa.confidence} · ${m(wa.approvedWeekMeters)} м | ` +
      `${wb.phase} · ${wb.gate} · ${wb.confidence} · ${m(wb.approvedWeekMeters)} м | ` +
      `${wa.phase === wb.phase && wa.gate === wb.gate && wa.approvedWeekMeters === wb.approvedWeekMeters ? 'нет' : 'есть: ' + [wa.phase !== wb.phase ? `фаза (${wa.phase}→${wb.phase})` : '', wa.gate !== wb.gate ? `гейт (${wa.gate}→${wb.gate})` : '', wa.approvedWeekMeters !== wb.approvedWeekMeters ? `бюджет (+${((wb.approvedWeekMeters - wa.approvedWeekMeters) / 1000).toLocaleString('ru-RU')} км)` : ''].filter(Boolean).join(', ')} |`);
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------------------------------------ machine-readable results
function stripRun(r: ForecastRun) {
  return {
    model: r.model, profileId: r.user.id, label: r.user.label, horizonWeeks: r.horizonWeeks,
    startDate: r.startDate, raceDate: r.raceDate,
    questionnaire: {
      currentSeconds: r.user.currentSeconds, goalSeconds: r.user.goalSeconds, goalIsPlaceholder: r.user.goalIsPlaceholder,
      runsPerWeek: r.user.runsPerWeek, availableRunsPerWeek: r.user.availableRunsPerWeek,
      weeklyKm: r.user.weeklyKm, longestKm: r.user.longestKm, regularWeeks: r.user.regularWeeks,
      canRun3Km: r.user.canRun3Km, qualitySessions: r.user.qualitySessions, qualityWeeks: r.user.qualityWeeks,
      qualityTolerated: r.user.qualityTolerated, experience: r.user.experience, assumptions: r.user.assumptions,
    },
    rows: r.rows, events: r.events, weeks: r.weeks, windowViolations: r.windowViolations,
    issuedSnapshot: r.issuedSnapshot,
    finalResultSeconds: r.finalResultSeconds, controlSeconds: r.controlSeconds, engineErrors: r.engineErrors,
    seedIntegrity: {serializeByteIdentical: JSON.stringify(r.seed) === r.seedSerialized, historyEntries: r.seed.history.length},
  };
}

writeFileSync(join(OUT_DIR, 'forecast-A.json'), JSON.stringify(A.map(stripRun), null, 2));
writeFileSync(join(OUT_DIR, 'forecast-B.json'), JSON.stringify(B.map(stripRun), null, 2));

// ------------------------------------------------------------------------------------------------ human-readable tables
const params = [
  '# Issue #51 — сравнительные таблицы прогнозного календаря (A/Б)',
  '',
  `Старт цикла: **${A[0]!.startDate}** (тот же, что в аудиторских сценариях). Дата норматива = старт + горизонт.`,
  'Профили U1/U4/U5 — анкетные значения из `audit/fullCycle12w.ts` без изменений (см. assumptions в JSON).',
  '',
  '**Единицы и статусы.** «Бронь, м» — планировочный резерв движка (`reservedMetres`), защитный потолок, НЕ фактические километры и НЕ дистанция основной части.',
  '«Бюджет» — утверждённая недельная бронь (`approvedMetersPer7Days`). Темп/скорость дорожки показаны только там, где они подтверждены исходными данными (измеренный результат 3000 м); «н/д» = не вычислимо без измерения, значение не выдумывается.',
  'Статусы: **выдана** — реальная очередь движка на asOf; **консерв. прогноз** — модель А (резерв без результата); **условный прогноз** — модель Б (синтетический сценарий «при успешном выполнении», не допуск к нагрузке).',
  '',
  'Модель А (консервативное бронирование): исходное состояние заморожено; каждая будущая цикл-неделя генерируется движком (generateQueue + guardWeeklyLoad с учётом всей цепочки броней). Будущие назначения резервируют нагрузку и восстановление, но не становятся ни результатами, ни пропусками; контрольные точки честно неразрешены; неделя 1 — дословно выданная очередь (снапшот).',
  'Модель Б (условный сценарий): каждое занятие условно «выполнено» GREEN; контрольные 3000 м = прежний известный результат (улучшение не предполагается); для U1 способность бежать 3 км не подтверждается и время не выдумывается; неделя 1 — тот же неизменный снапшот.',
  '',
  'Замечание 3: `windowViolations` в JSON — проверка ВСЕХ последовательных 7-дневных интервалов (включая стыки календарных недель): сумма броней ≤ бюджета и ≥48 ч между качественными занятиями. Во всех 12 прогонах пусто.',
  '',
];

const sections: string[] = [];
for (const cfg of A) {
  const a = cfg;
  const b = B.find(r => r.user.id === cfg.user.id && r.horizonWeeks === cfg.horizonWeeks)!;
  sections.push(
    `## ${cfg.user.id} — ${cfg.user.label} (${cfg.horizonWeeks} недель, норматив ${cfg.raceDate})`,
    '',
    `Исходные данные: текущий результат 3000 м = ${cfg.user.currentSeconds === null ? 'нет' : secText(cfg.user.currentSeconds)}; цель = ${cfg.user.goalSeconds === 1200 && cfg.user.goalIsPlaceholder ? '20:00 (техническая заглушка)' : secText(cfg.user.goalSeconds)}; ` +
    `${cfg.user.runsPerWeek} пробежек/нед (доступно ${cfg.user.availableRunsPerWeek}), ${cfg.user.weeklyKm} км/нед, длинная ${cfg.user.longestKm} км, 3 км непрерывно: ${cfg.user.canRun3Km ? 'да' : 'нет'}.`,
    '',
    '### Сводка по неделям (А консервативная / Б условная)',
    '',
    weeklyCompareTable(a, b),
    '',
    '### Контрольные моменты (недели 4/6/8/12)',
    '',
    checkpointTable(a, b),
    '',
    '### События модели А (где заканчиваются данные)',
    '',
    a.events.map(e => `- ${e.date} (нед ${e.week}) **${e.kind}**: ${e.detail}`).join('\n'),
    '',
    '### События модели Б (условные вводы)',
    '',
    b.events.map(e => `- ${e.date} (нед ${e.week}) **${e.kind}**${e.synthetic ? ' (синтетика)' : ''}: ${e.detail}`).join('\n'),
    '',
    '### Полный календарь А',
    '',
    calendarTable(a),
    '',
    '### Полный календарь Б',
    '',
    calendarTable(b),
    '',
  );
}

writeFileSync(join(OUT_DIR, 'tables.md'), [...params, ...sections].join('\n'));

// ------------------------------------------------------------------------------------------------ built-in invariant sweep
const failures: string[] = [];
for (const run of all) {
  const days = run.horizonWeeks * 7;
  const tag = `${run.model}/${run.user.id}/${run.horizonWeeks}w`;
  if (run.rows.some(r => r.offset >= days || r.date >= run.raceDate)) failures.push(`${tag}: training on/after race day`);
  if (JSON.stringify(run.seed) !== run.seedSerialized) failures.push(`${tag}: seed mutated`);
  if (run.windowViolations.length > 0) failures.push(`${tag}: ${run.windowViolations.map(v => v.detail).join('; ')}`);
  for (const w of run.weeks) {
    if (w.plannedReservedMeters !== null && w.plannedReservedMeters > w.approvedWeekMeters + 1e-6)
      failures.push(`${tag}: week ${w.week} reserve over budget`);
  }
  if (run.model === 'A' && (run.finalState.history.length > 0 || run.finalState.skippedWorkouts.length > 0))
    failures.push(`${tag}: model A fabricated history or misses`);
  if (run.user.currentSeconds === null) {
    if (run.rows.some(r => r.paceRangeSecondsPerKm !== null || r.speedRangeKmh !== null)) failures.push(`${tag}: invented pace for novice`);
    if (run.controlSeconds.length > 0 || run.finalResultSeconds !== null) failures.push(`${tag}: invented control/final for novice`);
  }
  if (run.model === 'B' && run.finalResultSeconds !== null && run.user.currentSeconds !== null && run.finalResultSeconds !== run.user.currentSeconds)
    failures.push(`${tag}: final result improved over known time`);
  if (JSON.stringify(run.issuedSnapshot) !== JSON.stringify(run.seed.queue)) failures.push(`${tag}: issued snapshot drifted from engine queue`);
}
if (failures.length > 0) {
  console.error('INVARIANT FAILURES:\n' + failures.join('\n'));
  process.exit(1);
}

console.log(`OK: ${all.length} прогонов (3 профиля × 2 горизонта × 2 модели), встроенные инварианты чисты.`);
console.log('Включая: неизменность seed, идентичность снапшота выданной очереди, ноль history/пропусков в модели А,');
console.log('все скользящие 7-дневные окна (включая стыки недель) в бюджете.');
console.log(`Артефакты: ${OUT_DIR}/forecast-A.json, forecast-B.json, tables.md`);
