/**
 * npm run audit:training
 * Writes machine-readable and human-readable results outside the app. No athlete data is read.
 */
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {SIM_START, simulateAll} from './trainingSimulator.ts';
import type {Event, Finding, RunReport} from './trainingSimulator.ts';

const outputDirectory = join(dirname(fileURLToPath(import.meta.url)), 'reports');
const reports = simulateAll();
const safe = (value: unknown): string => String(value ?? '—').replaceAll('|', '/').replaceAll('\n', ' ');
const table = (rows: readonly (readonly unknown[])[]): string =>
  rows.map(row => '| ' + row.map(safe).join(' | ') + ' |').join('\n');

function weekTable(r: RunReport): string {
  return table([
    ['Неделя', 'Назначено', 'Выполнено', 'Отдых', 'Пропущено', 'Быстрых', 'Сообщено км', 'Фазы', 'GREEN+ / GREEN / YELLOW / RED'],
    ['---', '---:', '---:', '---:', '---:', '---:', '---:', '---', '---'],
    ...r.weeks.map(w => [w.week, w.prescribed, w.completed, w.rest, w.skipped,
      w.qualityCompleted, (w.reportedMeters / 1000).toFixed(1),
      w.firstPhase === w.lastPhase ? w.lastPhase : `${w.firstPhase} → ${w.lastPhase}`,
      `${w.evaluations.GREEN_PLUS}/${w.evaluations.GREEN}/${w.evaluations.YELLOW}/${w.evaluations.RED}`,
    ]),
  ]);
}
function eventsTable(events: Event[]): string {
  return table([
    ['Дата', 'Событие', 'Назначение', 'Результат', 'RPE', 'Следующее', 'Фаза', 'Причина/смысл'],
    ['---', '---', '---', '---', '---:', '---', '---', '---'],
    ...events.filter(e => e.action !== 'ABSENT_WORK_BREAK').map(e => [
      e.day, e.action,
      e.workoutType === null ? '—' : `${e.workoutType} / ${e.plannedDose}`,
      e.evaluation ?? '—', e.actualRpe ?? '—', e.nextWorkoutType ?? '—',
      `${e.phase}/${e.gate}`, e.comment,
    ]),
  ]);
}
function findingsTable(findings: Finding[]): string {
  return findings.length === 0
    ? 'Автоматические проверки симулятора не выявили нарушений заданных инвариантов. Это не оценка научной эффективности методики.\n'
    : table([
      ['Уровень', 'Код', 'Дата', 'Наблюдение'],
      ['---', '---', '---', '---'],
      ...findings.map(f=>[f.severity,f.code,f.day,f.detail]),
    ]);
}

const front = `# Аудит долгосрочной адаптации «ФИЗУХА — 3000 м»

Дата виртуального старта: **${SIM_START}**. Сценариев: **${reports.length}**.

**Важные ограничения.** Это детерминированные, *гипотетические* отчёты, переданные в настоящий публичный спортивный движок. Реальное улучшение результата на 3000 м **не моделируется и не утверждается**: в контрольных точках и на итоговом забеге внешнее измерение намеренно оставлено равным исходному. Приложение не может предсказать адаптацию организма без реальных тренировок и тестов. Не использованы персональные данные, localStorage, браузерные даты или новый спортивный планировщик.

События **EXTERNAL_*** означают введённые оператором теста внешние факты; успешные GREEN/GREEN_PLUS означают заданную в симуляторе переносимость, **не** подтверждённую человеком. Если отмечено **INCONSISTENT_REPORT_ACCEPTED**, валидатор допустил несогласованные фактические показатели, и таким отчётам нельзя безоговорочно доверять.

## Сводка

${table([
['Сценарий', 'Исходно→цель', 'Длина', 'Тренировок', 'Пропусков', 'YELLOW / RED', 'Контрольные', 'Нарушения ERROR/WARNING'],
['---','---','---:','---:','---:','---','---:','---'],
...reports.map(r=>[
r.scenario.id,
`${r.baselineSeconds}→${r.targetSeconds} с`,
`${r.scenario.weeks} недель`,
r.weeks.reduce((n,w)=>n+w.completed,0),
r.weeks.reduce((n,w)=>n+w.skipped,0),
`${r.weeks.reduce((n,w)=>n+w.evaluations.YELLOW,0)}/${r.weeks.reduce((n,w)=>n+w.evaluations.RED,0)}`,
r.events.filter(x=>x.action==='EXTERNAL_3K_CHECKPOINT_UNCHANGED').length,
`${r.findings.filter(x=>x.severity==='ERROR').length}/${r.findings.filter(x=>x.severity==='WARNING').length}`,
]),
])}

Везде итоговый результат совпадает с исходным *по намерению сценария*, а не потому, что тренировки бесполезны. Мы тестируем правила и границы, а не физиологию.
`;

let md = front;
for(const r of reports){
  md += `\n---\n\n## ${r.scenario.id}\n\nНачальный результат ${r.baselineSeconds} с; цель ${r.targetSeconds} с; оценка осуществимости ${r.feasibility ?? 'не задана'}; финальный внешний результат ${r.finalRaceSeconds} с. Сценарий: ${r.scenario.behaviour}.\n\n### По неделям\n\n${weekTable(r)}\n\n### Что движок изменял и что произошло\n\n${eventsTable(r.events)}\n\n### Наблюдения и нарушения\n\n${findingsTable(r.findings)}\n`;
}

mkdirSync(outputDirectory, {recursive: true});
const summary = reports.map(r=>({
  scenario: r.scenario, initialTimeSeconds:r.baselineSeconds, targetTimeSeconds:r.targetSeconds,
  feasibility:r.feasibility, weeks:r.weeks, events:r.events, findings:r.findings,
  finalRaceSeconds:r.finalRaceSeconds,
  finalPhase:r.lastState.decision.phase, finalGate:r.lastState.decision.gate,
  completedCount:r.lastState.history.length,
  skips:r.lastState.skippedIds.length, finalRecorded:r.lastState.finalResultRecorded,
}));
writeFileSync(join(outputDirectory,'training-audit.json'),JSON.stringify(summary,null,2)+'\n','utf8');
writeFileSync(join(outputDirectory,'training-audit.md'),md,'utf8');

for(const r of reports){
  const errors=r.findings.filter(f=>f.severity==='ERROR');
  const warnings=r.findings.filter(f=>f.severity==='WARNING');
  process.stdout.write(`${r.scenario.id}: history=${r.lastState.history.length}; skips=${r.lastState.skippedIds.length}; `+
    `errors=${errors.length}; warnings=${warnings.length}; final=${r.finalRaceSeconds}s\n`);
  for(const f of [...errors,...warnings])process.stdout.write(`  [${f.severity}] ${f.day} ${f.code}: ${f.detail}\n`);
}
process.stdout.write(`Reports: ${join(outputDirectory,'training-audit.md')} and training-audit.json\n`);
