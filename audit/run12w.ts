/**
 * npm run audit:12w — independent 12-week methodology audit. Writes reports to audit/full-cycle-12w/.
 * All athlete behaviour is SYNTHETIC; nothing here predicts a real athlete's adaptation.
 */
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {BEHAVIOURS, CYCLE_WEEKS, NOVICE_CONTROL_SECONDS, SENSITIVITY_STEP, USERS, secondsText, simulateAll} from './fullCycle12w.ts';
import type {ScenarioRun, WorkoutRow} from './fullCycle12w.ts';
import {THRESHOLDS, analyze} from './fullCycleAnalysis.ts';
import type {Analysis, Finding, Severity} from './fullCycleAnalysis.ts';

// AUDIT_12W_OUT overrides the output directory (used to keep the before/after-fix runs of the same harness side by side).
const OUT = process.env.AUDIT_12W_OUT ? process.env.AUDIT_12W_OUT : join(dirname(fileURLToPath(import.meta.url)), 'full-cycle-12w');
const HEADER_NOTE = process.env.AUDIT_12W_NOTE ?? 'Ветка: `audit/3000m-full-cycle-12w` (от `feature/issue-24-calendar`). Движок и методика **не менялись**.';
const DATA = join(OUT, 'data');
mkdirSync(DATA, {recursive: true});

const runs = simulateAll();
const analyses: Analysis[] = runs.map(analyze);
const byId = new Map(analyses.map(a => [a.scenarioId, a]));

const safe = (v: unknown): string => String(v ?? '—').replaceAll('|', '/').replaceAll('\n', ' ');
const table = (head: string[], rows: unknown[][]): string => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(safe).join(' | ')} |`)].join('\n');
const csv = (head: string[], rows: unknown[][]): string => [head.join(','), ...rows.map(r => r.map(v => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t; }).join(','))].join('\n') + '\n';
const pct = (a: number, b: number): string => b === 0 ? '—' : `${Math.round(a / b * 100)} %`;
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const r1 = (v: number): number => Math.round(v * 10) / 10;

const allRows: WorkoutRow[] = runs.flatMap(r => r.rows);
const running = allRows.filter(r => r.type !== 'REST');
const allFindings: Finding[] = analyses.flatMap(a => a.findings);
const sevRank: Record<Severity, number> = {CRITICAL: 0, METHODOLOGICAL: 1, MINOR: 2};
const sevTitle: Record<Severity, string> = {CRITICAL: 'КРИТИЧЕСКИЕ ОШИБКИ', METHODOLOGICAL: 'МЕТОДИЧЕСКИЕ НЕДОСТАТКИ', MINOR: 'НЕЗНАЧИТЕЛЬНЫЕ ЗАМЕЧАНИЯ'};

// ------------------------------------------------------------------------------------------------ data files
writeFileSync(join(DATA, 'workouts.json'), JSON.stringify(allRows, null, 1) + '\n');
writeFileSync(join(DATA, 'workouts.csv'), csv(
  ['scenario', 'date', 'week', 'type', 'mode', 'dose', 'unit', 'est_km_total', 'pace_fast_s_km', 'pace_slow_s_km', 'speed_kmh_low', 'speed_kmh_high', 'rel_speed_low', 'rel_speed_high', 'repeats', 'repeat_m', 'repeat_s', 'rest_s', 'rpe', 'phase', 'gate', 'confidence', 'outcome', 'evaluation', 'yellow_reason', 'completion', 'actual_est_km', 'numeric_gap_class', 'numeric_gaps', 'headline'],
  allRows.map(r => [r.scenarioId, r.date, r.week, r.type, r.mode, r.doseValue, r.doseUnit, r1(r.estMetersTotal / 1000), r.paceFast, r.paceSlow, r.speedKmhLow, r.speedKmhHigh, r.relSpeedLow, r.relSpeedHigh, r.repeats, r.repeatMeters, r.perRepeatSeconds, r.restSeconds, r.targetRpe.join('-'), r.phase, r.gate, r.confidence, r.outcome, r.evaluation, r.yellowReason, r.completionFraction, r1(r.actualEstMeters / 1000), r.numeric.gapClass, r.numeric.gaps.join('; '), r.instruction.headline])));
writeFileSync(join(DATA, 'weekly.csv'), csv(
  ['scenario', 'week', 'planned_km_est', 'actual_km_synthetic_est', 'run_sessions', 'sessions_done', 'sessions_skipped_or_displaced', 'quality', 'quality_done', 'rest_days', 'controls', 'types', 'paces', 'load_change', 'phase', 'gate_end', 'hold_days', 'engine_budget_km'],
  analyses.flatMap(a => a.weekly.map(w => [w.scenarioId, w.week, w.plannedKm, w.actualKm, w.runs, w.runsDone, w.skipped, w.quality, w.qualityDone, w.restDays, w.controls, w.types, w.paces, w.loadChange, w.phase, w.gate, w.holdDays, w.approvedKm]))));
writeFileSync(join(DATA, 'findings.json'), JSON.stringify(allFindings, null, 1) + '\n');
writeFileSync(join(DATA, 'events.csv'), csv(['scenario', 'date', 'week', 'kind', 'detail', 'synthetic'], runs.flatMap(r => r.events.map(e => [r.scenario.id, e.date, e.week, e.kind, e.detail, 'yes']))));
writeFileSync(join(DATA, 'scenarios.json'), JSON.stringify(runs.map(r => ({
  id: r.scenario.id, user: r.scenario.user, behaviour: r.scenario.behaviour, required: r.scenario.required, synthetic: true, initialDecision: r.initial,
  controlSeconds: r.controlSeconds, finalResultSeconds: r.finalResultSeconds, finalPhase: r.finalState.decision.phase, engineErrors: r.engineErrors,
  checks: byId.get(r.scenario.id)!.checks, findingCount: byId.get(r.scenario.id)!.findings.length,
})), null, 1) + '\n');

// ------------------------------------------------------------------------------------------------ weekly tables
let weekly = `# Подробные таблицы по неделям — 12-недельный аудит «ФИЗУХА — 3000 м»

**Все данные синтетические**: отчёты о тренировках сочинены поведением А/Б/В/S, а не измерены. «Плановый км» — оценка рецензента по назначенным занятиям недели (дистанция + разминка/заминка + восстановления; для занятий «по минутам» — минуты × назначенный/предполагаемый темп). Это НЕ значение движка. «Фактический км (синтет.)» = плановый × доля выполнения, у пропущенных = 0. «Бюджет движка» — \`approvedMetersPer7Days\` из состояния движка (защитный недельный потолок бронирования; не километры к выполнению).
Обозначения типов: E=EASY, L=LONG_EASY, T=THRESHOLD, V=VO2, S3=SPECIFIC_3K, IQ=INTRO_QUALITY, C=CONTROL, R=REST. «Пропущено» включает занятия, вытесненные экраном контрольного результата.
`;
for (const run of runs) {
  const a = byId.get(run.scenario.id)!; const sc = run.scenario;
  weekly += `\n## ${sc.id} — ${sc.user.label}, сценарий ${sc.behaviour}${sc.required ? '' : ' (чувствительность, дополнительный)'}\n\n`;
  weekly += `Старт: ${run.initial.capacity}/${run.initial.quality}, фаза ${run.initial.phase}, gate ${run.initial.gate}, достижимость цели ${run.initial.feasibility ?? '—'}${run.initial.goalGap === null ? '' : ` (разрыв ${Math.round(run.initial.goalGap * 1000) / 10} %)`}.\n\n`;
  weekly += table(['Нед', 'План км', 'Факт км (синт.)', 'Бег. занятий (план/вып./проп.)', 'Интенсивных (план/вып.)', 'Типы по порядку', 'Назначенные темпы, мин/км', 'Изменения нагрузки', 'Бюджет движка, км', 'Фаза / gate'],
    a.weekly.map(w => [w.week, w.plannedKm, w.actualKm, `${w.runs}/${w.runsDone}/${w.skipped}`, `${w.quality}/${w.qualityDone}`, w.types || '—', w.paces, w.loadChange, w.approvedKm ?? '—', `${w.phase} / ${w.gate}`])) + '\n';
  const ev = run.events.filter(e => e.kind !== 'EXTERNAL_3K_CONTROL' || true);
  if (ev.length > 0) weekly += `\nВнешние/синтетические события: ${ev.map(e => `${e.date} ${e.kind}`).join('; ')}.\n`;
  const fs = a.findings;
  if (fs.length > 0) weekly += `\nНаходки по сценарию: ${[...new Set(fs.map(f => f.code))].map(c => `${c}×${fs.filter(f => f.code === c).length}`).join(', ')}.\n`;
}
writeFileSync(join(OUT, 'weekly-tables.md'), weekly);

// ------------------------------------------------------------------------------------------------ main report
const required = runs.filter(r => r.scenario.required); const supplementary = runs.filter(r => !r.scenario.required);
const totalChecks = sum(analyses.flatMap(a => a.checks.map(c => c.examined)));
const totalViolations = sum(analyses.flatMap(a => a.checks.map(c => c.violations)));
const tally = (s: Severity): number => allFindings.filter(f => f.severity === s).length;
const skippedOrDisplaced = (rows: WorkoutRow[]): number => rows.filter(r => r.outcome === 'SKIPPED' || r.outcome === 'DISPLACED_BY_CONTROL').length;

let md = `# Независимая проверка методики ФИЗУХА · 3000 м на полных 12-недельных циклах

${HEADER_NOTE} Всё поведение «пользователей» — **синтетическое**: отчёты о занятиях придуманы сценарием, 3000 м-результат **не улучшается автоматически**.

## 0. Как читать

- Это проверка **методики** (что и как назначается, как реагирует на отчёты), а не дизайна. Проверяется то, что приложение показывает человеку (числа берутся из карточки тренировки \`web/src/ui/workoutInstructions.ts\`, из движка — только назначения).
- Техническая работоспособность ≠ доказанная тренировочная эффективность. Симулятор не моделирует физиологию, поэтому **не может показать, станет ли человек быстрее**. Он показывает, насколько назначения последовательны, конкретны, согласованы и как они меняются после отчётов.
- Пороги в проверках — **эвристики рецензента**, а не правила движка; они перечислены в разделе 7 и могут быть оспорены тренером. Находка — вопрос к автору методики, а не доказанный риск травмы.
- Защитные ограничения (hold, STOP, закрытый gate) **не считаются ошибкой сами по себе**; оценивается их влияние на подготовку.

## 1. Что выполнено (цифры из этого запуска)

${table(['Показатель', 'Значение'], [
  ['Виртуальных пользователей', USERS.length],
  ['Сценариев всего', `${runs.length} (обязательная матрица 6×3 = ${required.length}; дополнительно «S» — чувствительность к внешнему вводу — ${supplementary.length})`],
  ['Длина цикла', `${CYCLE_WEEKS} недель (84 дня + день старта; виртуальный старт 2026-10-12)`],
  ['Недель смоделировано', `${runs.length * CYCLE_WEEKS} (в обязательной матрице ${required.length * CYCLE_WEEKS})`],
  ['Назначений проверено (занятие в слоте дня)', allRows.length],
  ['  из них беговых', running.length],
  ['  из них REST (защитная пауза / день до старта)', allRows.length - running.length],
  ['  выполнено синтетически по плану', running.filter(r => r.outcome === 'ON_PLAN').length],
  ['  выполнено с неудачей (Б: недобор / медленный темп)', running.filter(r => r.outcome === 'SHORTFALL' || r.outcome === 'SLOW_PACE').length],
  ['  пропущено (В) или вытеснено экраном контроля', skippedOrDisplaced(running)],
  ['  контрольные забеги (сценарный ввод)', running.filter(r => r.outcome === 'CONTROL').length],
  ['Проверок применено (элементов проверки)', totalChecks],
  ['  из них нарушений (находок до группировки)', totalViolations],
  ['Находок после группировки по коду', new Set(allFindings.map(f => f.code)).size],
  ['  КРИТИЧЕСКИЕ / МЕТОДИЧЕСКИЕ / НЕЗНАЧИТЕЛЬНЫЕ (записей)', `${tally('CRITICAL')} / ${tally('METHODOLOGICAL')} / ${tally('MINOR')}`],
])}

Распределение назначенных занятий по типам (всего ${allRows.length}): ${[...new Set(allRows.map(r => r.type))].sort().map(t => `${t} ${allRows.filter(r => r.type === t).length}`).join(', ')}. **LONG_EASY и STRIDES не назначались ни в одном сценарии**: ${allRows.filter(r => r.type === 'LONG_EASY').length} и ${allRows.filter(r => r.type === 'STRIDES').length}.

## 2. Шесть виртуальных пользователей (анкета и оценка движка на день 0)

${table(['№', 'Уровень', '3000 м сейчас', 'Цель', 'Бегает/неделю (доступно)', 'Объём км/нед', 'Длинная, км', 'Квалиф. за 8 нед', 'Оценка движка', 'Достижимость цели'],
  USERS.map(u => { const i = runs.find(r => r.scenario.user.id === u.id)!.initial; return [u.n, u.label, u.currentSeconds === null ? 'нет (не может 3 км подряд)' : secondsText(u.currentSeconds), `${secondsText(u.goalSeconds)}${u.goalIsPlaceholder ? ' (заглушка)' : ''}`, `${u.runsPerWeek} (${u.availableRunsPerWeek})`, u.weeklyKmNote, u.longestKm, `${u.qualitySessions} / ${u.qualityWeeks} нед.`, `${i.capacity}/${i.quality}, фаза ${i.phase}`, `${i.feasibility ?? '—'}${i.goalGap === null ? '' : `, разрыв ${Math.round(i.goalGap * 1000) / 10} %`}`]; }))}

Допущения анкеты (то, что ТЗ оставляет открытым): ${USERS.map(u => `№${u.n}: ${u.assumptions}`).join(' ')} Текущий результат нигде не заменяется целевым; у новичка результата нет.

## 3. Три варианта поведения (все синтетические)

${table(['Вариант', 'Что делает виртуальный пользователь'], (Object.keys(BEHAVIOURS) as (keyof typeof BEHAVIOURS)[]).map(k => [BEHAVIOURS[k].title, BEHAVIOURS[k].description]))}

Общие правила оператора (внешний сценарный ввод, а не решения приложения): (1) «Нужен контрольный результат» (экран приложения) — пользователь сразу пробегает 3000 м и вводит время; в обязательной матрице оно **равно последнему известному** (без улучшения); у новичка первое время — ${secondsText(NOVICE_CONTROL_SECONDS)} (задано сценарием, поскольку исходного нет); в сценариях S время улучшается на ${SENSITIVITY_STEP * 100} % за каждый контроль. (2) Если в этот день по плану другая тренировка, она закрывается как «не выполнена» (приложение показывает экран контроля вместо карточки). (3) Защитная пауза (hold) снимается явной синтетической проверкой «симптомов нет» через 7 дней. (4) Новичок подтверждает «3 км без остановки» на 6-й неделе (А) или 8-й (Б, В), как только приложение это позволяет. (5) Итоговый результат на дне старта равен последнему известному (у новичка без результата не вводится).

## 4. Сводная таблица по пользователям и сценариям

Километры — оценка рецензента (см. weekly-tables.md); «Факт» — синтетический.

${table(['Сценарий', 'Бег. назначений', 'Выполнено', 'Пропущено/вытеснено', 'REST', 'CONTROL-слотов в плане', 'Контрольных результатов (ввод)', 'Интенсивных (вып.)', 'План км всего', 'Факт км (синт.)', 'YELLOW/RED', 'Дней hold', 'Фаза в конце', 'Находки К/М/Н'],
  runs.map(r => {
    const a = byId.get(r.scenario.id)!; const rr = r.rows.filter(x => x.type !== 'REST');
    const sev = (s: Severity): number => a.findings.filter(f => f.severity === s).length;
    return [r.scenario.id, rr.length, rr.filter(x => x.outcome !== 'SKIPPED' && x.outcome !== 'DISPLACED_BY_CONTROL').length, skippedOrDisplaced(rr), r.rows.length - rr.length, rr.filter(x => x.type === 'CONTROL').length, r.controlSeconds.length,
      `${rr.filter(x => x.countsAsQuality && x.type !== 'CONTROL').length} (${rr.filter(x => x.countsAsQuality && x.type !== 'CONTROL' && x.outcome !== 'SKIPPED' && x.outcome !== 'DISPLACED_BY_CONTROL').length})`,
      r1(sum(a.weekly.map(w => w.plannedKm))), r1(sum(a.weekly.map(w => w.actualKm))), `${rr.filter(x => x.evaluation === 'YELLOW').length}/${rr.filter(x => x.evaluation === 'RED').length}`,
      r.days.filter(d => d.hold).length, r.days.at(-1)?.phase ?? '—', `${sev('CRITICAL')}/${sev('METHODOLOGICAL')}/${sev('MINOR')}`];
  }))}

Итоговый результат на дне старта (внешний ввод, равен последнему известному): ${runs.map(r => `${r.scenario.id}: ${r.finalResultSeconds === null ? 'не вводился' : secondsText(r.finalResultSeconds)}`).join('; ')}.

## 5. Проверка занятий по типам (то, что показывает карточка)

Для каждого назначения проверены: тип, дистанция/длительность, темп (мин/км), скорость дорожки (км/ч), повторы, время отрезка, восстановление, соответствие неделе и изменение после отчёта. Полные строки — \`data/workouts.csv\`/\`workouts.json\`.

`;
const typeOrder = ['EASY', 'LONG_EASY', 'THRESHOLD', 'VO2', 'SPECIFIC_3K', 'INTRO_QUALITY', 'CONTROL', 'STRIDES'];
md += table(['Тип', 'Назначений', 'Сценариев', 'Доза (мин/макс)', 'Темп задан', 'Скорость дорожки задана', 'Доля скорости 3000 м (мин–макс)', 'Повторов (мин–макс)', 'Время отрезка', 'Отдых, с', 'Числа: ок / обоснованное исключение / недостаток'],
  typeOrder.map(t => {
    const rs = running.filter(r => r.type === t);
    if (rs.length === 0) return [t, 0, 0, '—', '—', '—', '—', '—', '—', '—', 'не назначался'];
    const unit = rs[0]!.doseUnit === 'METERS' ? 'м' : 'мин'; const doses = rs.map(r => r.doseValue);
    const rel = rs.filter(r => r.relSpeedLow !== null); const reps = rs.map(r => r.repeats); const t0 = rs.filter(r => r.perRepeatSeconds !== null).map(r => r.perRepeatSeconds as number);
    return [t, rs.length, new Set(rs.map(r => r.scenarioId)).size, `${Math.round(Math.min(...doses))}–${Math.round(Math.max(...doses))} ${unit}`, pct(rs.filter(r => r.instruction.paceText !== null).length, rs.length), pct(rs.filter(r => r.instruction.speedText !== null).length, rs.length),
      rel.length === 0 ? '—' : `${Math.round(Math.min(...rel.map(r => r.relSpeedLow as number)) * 100)}–${Math.round(Math.max(...rel.map(r => r.relSpeedHigh as number)) * 100)} %`,
      `${Math.min(...reps)}–${Math.max(...reps)}`, t0.length === 0 ? '—' : `${secondsText(Math.min(...t0))}–${secondsText(Math.max(...t0))}`, [...new Set(rs.map(r => r.restSeconds))].join('/'),
      `${rs.filter(r => r.numeric.gapClass === 'NONE').length} / ${rs.filter(r => r.numeric.gapClass === 'JUSTIFIED').length} / ${rs.filter(r => r.numeric.gapClass === 'DEFICIT').length}`];
  })) + '\n\n';
const noPace = running.filter(r => r.instruction.paceText === null);
const category = (r: WorkoutRow): string => r.mode === 'RUN_WALK' ? 'RUN_WALK (новичок: бег/шаг по схеме, темпа нет по замыслу)'
  : r.numeric.note.startsWith('калибровочная') ? 'калибровочная пробежка (темп скрыт до двух измеренных EASY)'
  : r.type === 'INTRO_QUALITY' ? 'INTRO_QUALITY (вводное качество по RPE; темп не задан по замыслу)'
  : r.type === 'CONTROL' ? 'CONTROL (максимальное усилие; целевого темпа нет по замыслу)' : `ПРОПУСК: ${r.type} (${r.numeric.note || 'нет причины'})`;
const cats = new Map<string, number>(); for (const r of noPace) cats.set(category(r), (cats.get(category(r)) ?? 0) + 1);
md += `### Занятия без темпа (классификация: обоснованное исключение или методический недостаток)

Из ${running.length} беговых назначений темп и скорость дорожки отсутствуют у ${noPace.length}:

${table(['Категория', 'Назначений', 'Классификация'], [...cats].map(([c, n]) => [c, n, c.startsWith('ПРОПУСК') ? 'МЕТОДИЧЕСКИЙ НЕДОСТАТОК' : 'обоснованное исключение']))}

Для INTRO_QUALITY (по RPE) допущение спорно: при известном результате 3000 м темп можно было бы показать, но по замыслу движка вводное качество намеренно не привязано к темпу — это вопрос к автору методики, а не ошибка. Остальные числа (дистанция/время, повторы, время отрезка, отдых, RPE) присутствуют везде, где применимы.
`;

// reaction table
type Reaction = {n: number; dose: Record<string, number>; pace: Record<string, number>};
const reaction = new Map<string, Reaction>();
for (const run of runs) {
  const rr = run.rows.filter(r => r.type !== 'REST');
  rr.forEach((r, i) => {
    if (r.evaluation !== 'GREEN' && r.evaluation !== 'YELLOW') return;
    if (r.type === 'CONTROL' || r.outcome === 'CONTROL') return;
    const next = rr.slice(i + 1).find(x => x.type === r.type && x.outcome !== 'DISPLACED_BY_CONTROL' && (Date.parse(x.date) - Date.parse(r.date)) / 86400000 <= 21);
    if (!next) return;
    const key = `${r.evaluation}|${r.type}`; const e = reaction.get(key) ?? {n: 0, dose: {}, pace: {}}; e.n++;
    const d = next.doseValue > r.doseValue * 1.01 ? 'доза ↑' : next.doseValue < r.doseValue * 0.99 ? 'доза ↓' : 'доза =';
    e.dose[d] = (e.dose[d] ?? 0) + 1;
    const hi = (x: WorkoutRow): number | null => x.speedKmhHigh;
    const p = hi(r) === null || hi(next) === null ? 'темпа нет' : (hi(next) as number) > (hi(r) as number) + 0.05 ? 'темп быстрее' : (hi(next) as number) < (hi(r) as number) - 0.05 ? 'темп медленнее' : 'темп =';
    e.pace[p] = (e.pace[p] ?? 0) + 1; reaction.set(key, e);
  });
}
md += `
### Изменение назначения после отчёта

Для каждого выполненного занятия (GREEN или YELLOW по классификации движка) взято **следующее назначение того же типа в пределах 21 дня** и сравнены доза и верхняя граница скорости. Это ответ на «как план реагирует на отчёт».

${table(['Оценка движка', 'Тип', 'Случаев', 'Доза следующего', 'Темп следующего'], [...reaction].sort().map(([k, v]) => { const [ev, t] = k.split('|'); return [ev, t, v.n, Object.entries(v.dose).map(([a, b]) => `${a}: ${b}`).join(', '), Object.entries(v.pace).map(([a, b]) => `${a}: ${b}`).join(', ')]; }))}

`;

// findings
const groups = new Map<string, Finding[]>();
for (const f of allFindings) groups.set(f.code, [...(groups.get(f.code) ?? []), f]);
const catalogue = [...groups.entries()].map(([code, fs]) => ({code, fs, severity: fs.map(f => f.severity).sort((a, b) => sevRank[a] - sevRank[b])[0]!})).sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.fs.length - a.fs.length);
md += `## 6. Обнаруженные недостатки

Каждый недостаток — группа однотипных находок: показаны первый случай (сценарий, неделя, конкретная тренировка), число случаев и список сценариев. Все случаи — \`data/findings.json\`.

`;
let counter = 0;
for (const sev of ['CRITICAL', 'METHODOLOGICAL', 'MINOR'] as Severity[]) {
  md += `### ${sevTitle[sev]}\n\n`;
  const items = catalogue.filter(c => c.severity === sev);
  if (items.length === 0) md += 'Не обнаружено в проверенных сценариях.\n\n';
  for (const c of items) {
    counter++; const f = c.fs[0]!; const scenarios = [...new Set(c.fs.map(x => x.scenarioId))];
    md += `**D-${String(counter).padStart(2, '0')} · ${c.code}** — ${c.fs.length} случ. в ${scenarios.length} сценар.\n\n- **Сценарий и неделя (первый случай):** ${f.scenarioId}, неделя ${f.week}${f.date ? ` (${f.date})` : ''}\n- **Конкретная тренировка/место:** ${f.workout}\n- **Ожидаемое поведение:** ${f.expected}\n- **Фактическое поведение:** ${f.actual}\n- **Почему это проблема:** ${f.why}\n- **Серьёзность:** ${sevTitle[c.severity].toLowerCase()}${new Set(c.fs.map(x => x.severity)).size > 1 ? ' (в части случаев ниже)' : ''}\n- **Рекомендуемое исправление:** ${f.recommendation}\n- **Где встретилось:** ${scenarios.join(', ')}\n\n`;
  }
}

// checks table
const checkAgg = new Map<string, {label: string; examined: number; violations: number}>();
for (const a of analyses) for (const c of a.checks) { const e = checkAgg.get(c.code) ?? {label: c.label, examined: 0, violations: 0}; e.examined += c.examined; e.violations += c.violations; checkAgg.set(c.code, e); }
md += `### Проверки, выполненные во всех сценариях (в т.ч. без нарушений)

${table(['Код', 'Проверка', 'Применена раз', 'Нарушений'], [...checkAgg].sort().map(([k, v]) => [k, v.label, v.examined, v.violations]))}

## 7. Пороги эвристик рецензента

${table(['Параметр', 'Значение'], Object.entries(THRESHOLDS).map(([k, v]) => [k, Array.isArray(v) ? v.join('–') : v]))}

## 8. Ограничения проверки

- Все отчёты синтетические; нет физиологии, нет реальных людей, нет реального улучшения результата. Вывод «план разумен» означает «согласован и проходит проверки», а не «улучшает 3000 м».
- По одному сценарию на пару «пользователь × поведение»; без случайности (детерминированно). Реальные варианты поведения шире.
- Километры — оценка рецензента; движок не публикует ожидаемый километраж, а только бюджет бронирования.
- Для пользователей №1 и №6 выбраны значения, которые ТЗ оставляет открытыми (частота 1/нед у новичка, 5 пробежек у опытного); анкета №3 (середина диапазона 12–15 км = 13,5 км/нед) даёт T1, потому что T2 требует среднего объёма ≥ 15 км/нед (src/assessment.ts); при 15 км профиль мог бы получить T2, поэтому выводы по U3 зависят от этого допущения.
- Ветка \`feature/issue-24-calendar\` не содержит исправлений DEF-001…004 из QA Issue #23 (они в отдельной ветке); поэтому DEF-002 воспроизводится здесь и учтён в находках.
- Приложение (UI) здесь не запускалось в браузере: используется тот же код карточки тренировки (\`workoutInstruction\`) и тот же \`deriveToday\`, но не реальный экран.
- Тренировочные пороги (доли скорости, отдых для повторов, долю хард-дней) нужно подтвердить тренером; здесь это вопросы, а не вердикты.
`;

// conclusion
const chk = (code: string): {examined: number; violations: number} => checkAgg.get(code) ?? {examined: 0, violations: 0};
const crit = catalogue.filter(c => c.severity === 'CRITICAL'); const meth = catalogue.filter(c => c.severity === 'METHODOLOGICAL'); const minor = catalogue.filter(c => c.severity === 'MINOR');
const idOf = (code: string): string => { let n = 0; for (const sev of ['CRITICAL', 'METHODOLOGICAL', 'MINOR'] as Severity[]) for (const c of catalogue.filter(x => x.severity === sev)) { n++; if (c.code === code) return `D-${String(n).padStart(2, '0')}`; } return '—'; };
md += `
## 9. Заключение: можно ли использовать методику для реальной самостоятельной подготовки к 3000 м

### 9.1 Что показали прогоны (техническая работоспособность)

- Все ${runs.length} сценариев (${runs.length * CYCLE_WEEKS} недель, ${allRows.length} назначений) прошли весь цикл без падений движка; отказов движка на синтетические результаты контроля, кроме тупика новичка (${idOf('CHECKPOINT_REQUIRED_BUT_REFUSED')}), нет (проверка C17: ${chk('C17').violations} нарушений из ${chk('C17').examined}).
- Числовые инструкции: в ${chk('C06').examined} беговых назначениях методологических пропусков чисел — ${chk('C06').violations}; отсутствие темпа допустимо и объяснено только у калибровочных/вводных/контрольных/RUN_WALK занятий (раздел 5).
- Интервалы: арифметика повторов и согласованность «темп ↔ км/ч» — ${chk('C13').violations} нарушений из ${chk('C13').examined} проверок; интенсивные занятия не ближе 48 ч и не более двух в скользящие 7 дней — ${chk('C05').violations} и ${chk('C05b').violations} нарушений.
- Пропуски (В) не компенсируются: пропущенное качественное занятие назначается заново, нагрузка вслед за пропуском не растёт (проверка C10: ${chk('C10').violations} нарушений из ${chk('C10').examined}).
- Честность цели: движок сообщает «цель на длительный срок/сложна» (U2, U3) и выстраивает базу вместо недостижимого целевого темпа; это защитное ограничение, и оно не считается ошибкой.

### 9.2 Что не позволяет назвать это полноценным личным тренером

${[...crit, ...meth].map(c => `- **${idOf(c.code)} ${c.code}** (${sevTitle[c.severity].toLowerCase()}): ${c.fs[0]!.why}`).join('\n')}

Прочие замечания (${minor.map(c => idOf(c.code)).join(', ') || 'нет'}) — незначительные и сами по себе применимость не ограничивают.

### 9.3 Вывод

1. **Новичок без 3 км подряд (U1): в проверяемой базе работает не полностью.** Критический дефект ${idOf('CHECKPOINT_REQUIRED_BUT_REFUSED')} (экран требует контрольный результат, который движок запрещает принять) воспроизведён во всех трёх сценариях новичка. Исправление, по записям QA Issue #23, лежит в отдельной ветке и в базу этой проверки не входит. Кроме того, частота не растёт (${idOf('FREQUENCY_NEVER_PROGRESSES')}).
2. **Остальные пятеро (U2–U6): план исполним и последователен как осторожный структурированный план**, но методика ведёт себя как «движок осторожного поддержания и закрытия рисков», а не как тренер, наращивающий подготовку к цели: контрольный забег каждые 21 день сбрасывает накопленный прогресс (${idOf('CONTROL_RESETS_PROGRESS')}), доза качества застревает (${idOf('QUALITY_DOSE_NOT_PROGRESSING')}), у опытных нет длинной пробежки (${idOf('LONG_RUN_NEVER_PRESCRIBED')}), а защитная пауза при неудачах без симптомов забирает до ${Math.max(0, ...runs.map(r => r.rows.filter(x => x.type === 'REST').length))} назначений подряд и возвращает полный объём без градации (${idOf('HOLD_REMOVES_TRAINING')}, ${idOf('RETURN_TO_FULL_LOAD_AFTER_HOLD')}).
3. **Рекомендация:** использовать как справочный, осторожный самостоятельный план можно только после устранения критического дефекта и с явным предупреждением, что приложение **не доказало**, что приводит к улучшению 3000 м; прежде чем называть его «личным тренером», нужно исправить методические недостатки из раздела 6 (в первую очередь ${idOf('CONTROL_RESETS_PROGRESS')}, ${idOf('QUALITY_DOSE_NOT_PROGRESSING')}, ${idOf('LONG_RUN_NEVER_PRESCRIBED')}) и подтвердить их тренером.
4. **Техническая работоспособность ≠ эффективность.** Эта проверка не измеряла ни улучшение результата, ни риск травм, ни индивидуальную реакцию: результат контрольных у нас задан сценарием. Эффективность можно доказать только наблюдением за реальными людьми.
`;

writeFileSync(join(OUT, 'report.md'), md);

// console summary
for (const r of runs) {
  const a = byId.get(r.scenario.id)!;
  process.stdout.write(`${r.scenario.id}: rows=${r.rows.length}; run=${r.rows.filter(x => x.type !== 'REST').length}; skipped=${skippedOrDisplaced(r.rows)}; rest=${r.rows.filter(x => x.type === 'REST').length}; controls=${r.controlSeconds.length}; findings=${a.findings.length}; final=${r.finalResultSeconds ?? 'none'}\n`);
}
process.stdout.write(`SCENARIOS=${runs.length} WEEKS=${runs.length * CYCLE_WEEKS} WORKOUTS=${allRows.length} RUNNING=${running.length} CHECKS=${totalChecks} VIOLATIONS=${totalViolations} FINDING_CODES=${new Set(allFindings.map(f => f.code)).size}\n`);
process.stdout.write(`Reports: ${OUT}\n`);
