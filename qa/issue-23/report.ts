/**
 * Aggregates the real outputs of a QA run into the issue-23 deliverables. Every number comes from
 *   reports/qa-issue-23/data/*.json   (per-profile / per-scenario journals written by the specs)
 *   reports/qa-issue-23/raw/playwright-results.json   (Playwright JSON reporter)
 *   reports/qa-issue-23/screenshots/**   (actual files)
 * Run: npm run qa:report   (after npm run qa:issue23)
 */
import {existsSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {toCsv} from './journal.ts';
import {CATALOG, EXTRA_OBSERVATIONS, RETRACTED} from './defect-catalog.ts';
import {PROFILES, QA_START_DATE} from './profiles.ts';

const ROOT = process.env.QA_REPORT_DIR ?? 'reports/qa-issue-23';
const DATA = join(ROOT, 'data');
const RAW = process.env.QA_PLAYWRIGHT_JSON ?? join(ROOT, 'raw/playwright-results.json');
const SHOTS = join(ROOT, 'screenshots');

interface Check {profile_id: string; seed: number; id: string; description: string; verdict: 'PASS' | 'FAIL' | 'KNOWN_FAIL'; detail: string; date: string; defect?: string}
interface Journal {profileId: string; seed: number; meta: Record<string, unknown>; counters: Record<string, unknown>; weekly: Record<string, number>[]; rows: Record<string, string | number>[]; checks: Check[]}

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const journals: Journal[] = readdirSync(DATA).filter((f) => f.endsWith('.json')).sort().map((f) => readJson<Journal>(join(DATA, f)));
const full = journals.filter((j) => PROFILES.some((p) => p.id === j.profileId));
const cross = journals.filter((j) => j.profileId.startsWith('cross-'));

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
const shots = walk(SHOTS).filter((f) => f.endsWith('.png'));

// ---- Playwright results
interface PwTest {title: string; status: string; expectedStatus: string; results: {status: string; duration: number}[]}
interface PwSuite {title: string; file?: string; specs?: {title: string; tests: PwTest[]}[]; suites?: PwSuite[]}
interface PwRoot {config?: {version?: string}; stats?: {duration?: number}; suites?: PwSuite[]}
const pw = {passed: 0, failed: 0, skipped: 0, flaky: 0, expectedFailures: 0, unexpectedPasses: 0, total: 0, durationMs: 0, tests: [] as {title: string; outcome: string; ms: number}[], version: '', raw: false};
if (existsSync(RAW)) {
  pw.raw = true;
  const j = readJson<PwRoot>(RAW);
  pw.version = j.config?.version ?? '';
  pw.durationMs = Math.round(j.stats?.duration ?? 0);
  const visit = (suite: PwSuite, prefix: string): void => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        const ms = t.results.reduce((a, r) => a + r.duration, 0);
        let outcome = 'passed';
        if (t.status === 'skipped') outcome = 'skipped';
        else if (t.status === 'flaky') outcome = 'flaky';
        else if (t.status === 'unexpected') outcome = t.expectedStatus === 'failed' ? 'unexpected-pass' : 'failed';
        else if (t.status === 'expected') outcome = t.expectedStatus === 'failed' ? 'expected-failure' : 'passed';
        pw.total += 1;
        if (outcome === 'passed') pw.passed += 1; else if (outcome === 'failed') pw.failed += 1; else if (outcome === 'skipped') pw.skipped += 1;
        else if (outcome === 'flaky') pw.flaky += 1; else if (outcome === 'expected-failure') pw.expectedFailures += 1; else pw.unexpectedPasses += 1;
        pw.tests.push({title: `${prefix}${spec.title}`, outcome, ms});
      }
    }
    for (const s of suite.suites ?? []) visit(s, `${prefix}${s.title && !s.file ? s.title + ' › ' : ''}`);
  };
  for (const s of j.suites ?? []) visit(s, '');
}

// ---- aggregate
const sum = (js: Journal[], k: string): number => js.reduce((a, j) => a + (Number(j.counters[k]) || 0), 0);
const allChecks = journals.flatMap((j) => j.checks);
const byVerdict = {PASS: 0, FAIL: 0, KNOWN_FAIL: 0};
for (const c of allChecks) byVerdict[c.verdict] += 1;
const checkTable = new Map<string, {pass: number; fail: number; known: number; defect: string}>();
for (const c of allChecks) {
  const e = checkTable.get(c.id) ?? {pass: 0, fail: 0, known: 0, defect: ''};
  if (c.verdict === 'PASS') e.pass += 1; else if (c.verdict === 'FAIL') e.fail += 1; else { e.known += 1; e.defect = c.defect ?? ''; }
  checkTable.set(c.id, e);
}
const uncatalogued = [...new Set(allChecks.filter((c) => c.verdict === 'KNOWN_FAIL').map((c) => c.defect + ':' + c.id))].filter((k) => !CATALOG.some((d) => d.id === k.split(':')[0]));

const evalTotals: Record<string, number> = {}; const typeTotals: Record<string, number> = {};
for (const j of full) {
  for (const [k, v] of Object.entries(j.counters.byEvaluation ?? {})) evalTotals[k] = (evalTotals[k] ?? 0) + Number(v);
  for (const [k, v] of Object.entries(j.counters.byType ?? {})) typeTotals[k] = (typeTotals[k] ?? 0) + Number(v);
}

const events = (j: Journal, e: string): number => j.rows.filter((r) => r.event === e).length;
const sessionsPlanned = sum(full, 'workoutsPlannedTotal');
const summary = {
  generatedAtMsk: new Date().toLocaleString('sv-SE', {timeZone: 'Europe/Moscow'}) + ' MSK',
  startDate: QA_START_DATE,
  scenarios: {fullCycleProfiles: full.length, crossCuttingScenarios: cross.length, knownDefectRepros: pw.tests.filter((t) => t.title.startsWith('DEF-')).length},
  weeks: Object.fromEntries(full.map((j) => [j.profileId, {weeksSpanned: j.counters.weeksSpanned, virtualDays: j.counters.virtualDays, raceDate: j.meta.raceDateAtEnd}])),
  sessions: {
    plannedInQueueAtSomePoint: sessionsPlanned, recorded: sum(full, 'workoutsRecorded'), skipped: sum(full, 'workoutsSkipped'), moved: sum(full, 'workoutsMoved'),
    incomplete: sum(full, 'incompleteSessions'), withSymptoms: sum(full, 'symptomReports'), byEvaluation: evalTotals, byType: typeTotals,
  },
  other: {checkpoints: sum(full, 'checkpoints'), examDateChanges: sum(full, 'examDateChanges'), reloads: sum(journals, 'reloads'), expectedBlocks: sum(journals, 'expectedBlocks'), uiTransitions: sum(journals, 'uiTransitions'), screenshotFiles: shots.length, finalResults: full.filter((j) => j.meta.finalSeconds !== null && j.meta.finalSeconds !== undefined).length},
  checks: {...byVerdict, total: allChecks.length},
  playwright: {...pw, tests: undefined},
  uncataloguedKnownFails: uncatalogued,
};
writeFileSync(join(ROOT, 'summary.json'), JSON.stringify({...summary, playwrightTests: pw.tests}, null, 2));

// ---- merged CSVs (week, date, assignment, planned load, entered result, reason for change, warnings, …)
writeFileSync(join(DATA, 'all-profiles.csv'), toCsv(full.flatMap((j) => j.rows)));
writeFileSync(join(DATA, 'weekly-load.csv'), toCsv(full.flatMap((j) => j.weekly.map((w) => ({profile_id: j.profileId, seed: j.seed, ...w})))));
writeFileSync(join(DATA, 'checks.csv'), toCsv(allChecks.filter((c) => c.id !== 'INVARIANTS_HOLD' && !c.id.startsWith('NO_HIDDEN') && c.id !== 'UI_TODAY_MATCHES_ENGINE')));

// ---- defect log
const occurrences = (checkIds: string[]): Check[] => allChecks.filter((c) => c.verdict !== 'PASS' && checkIds.includes(c.id));
let dl = `# Журнал дефектов и наблюдений — QA issue #23\n\nСгенерировано \`npm run qa:report\` (${summary.generatedAtMsk}) из реальных прогонов. Методика, health-проверки и STOP не менялись. Данные вымышленные.\n\n`;
dl += `Короткие повторы дефектов — \`qa/issue-23/defects.spec.ts\` (Playwright \`test.fail\`: в отчёте это «ожидаемый отказ», не зелёный тест). \`QA_DEFECT_RAW=1\` запускает их как обычные и показывает реальный отказ.\n\n`;
dl += `| ID | Тип | Важность | Суть | Наблюдений в прогонах |\n|---|---|---|---|---|\n`;
for (const d of CATALOG) dl += `| ${d.id} | ${d.kind === 'DEFECT' ? 'дефект' : 'наблюдение'} | ${d.severity} | ${d.title} | ${occurrences(d.checkIds).length} |\n`;
dl += '\n';
for (const d of CATALOG) {
  const occ = occurrences(d.checkIds);
  dl += `## ${d.id} — ${d.title}\n\n- **Тип / важность:** ${d.kind === 'DEFECT' ? 'дефект' : 'наблюдение'} / ${d.severity}\n- **Сценарий и seed:** ${d.scenario}\n- **Ожидалось:** ${d.expected}\n- **Фактически:** ${d.actual}\n- **Код:** ${d.codeRefs.join('; ')}\n`;
  if (d.reproTest) dl += `- **Короткий повтор:** \`${d.reproTest}\`\n`;
  if (d.note) dl += `- **Примечание:** ${d.note}\n`;
  dl += `- **Где проявилось в этом прогоне (${occ.length}):**\n`;
  if (occ.length === 0) dl += `  - не воспроизвелось в этом прогоне (проверьте, не исправлено ли)\n`;
  for (const o of occ) dl += `  - \`${o.profile_id}\` seed ${o.seed}, ${o.date}: ${o.detail.replace(/\n/g, ' ').slice(0, 260)}\n`;
  dl += '\n';
}
dl += `## Снятые ложные срабатывания (исправлена проверка, не методика)\n\n`;
for (const r of RETRACTED) dl += `- **${r.id}.** ${r.text}\n`;
dl += `\n## Прочие наблюдения\n\n`;
for (const o of EXTRA_OBSERVATIONS) dl += `- ${o}\n`;
if (uncatalogued.length) dl += `\n## ВНИМАНИЕ: известные отказы без записи в каталоге\n\n${uncatalogued.map((u) => `- ${u}`).join('\n')}\n`;
const realFailures = allChecks.filter((c) => c.verdict === 'FAIL');
if (realFailures.length) { dl += `\n## ВНИМАНИЕ: непроанализированные отказы проверок (FAIL)\n\n`; for (const f of realFailures) dl += `- \`${f.profile_id}\` seed ${f.seed}, ${f.date}: **${f.id}** — ${f.detail.slice(0, 260)}\n`; }
writeFileSync(join(ROOT, 'defect-log.md'), dl);

// ---- short report
const pct = (a: number, b: number): string => (b ? Math.round((100 * a) / b) + ' %' : '—');
let md = `# QA issue #23 — автономный прогон полного цикла подготовки 8–12 недель\n\n`;
md += `Сгенерировано ${summary.generatedAtMsk}. Все числа взяты из сохранённых результатов прогона (\`raw/playwright-results.json\`, \`data/*.json\`), а не вписаны вручную. Данные вымышленные; прогресс «спортсменов» — только поведение модели, не реальные успехи.\n\n`;
md += `## Что запускалось\n\n- Тестовая сборка (\`VITE_TEST_MODE=1\`, \`npm run build:testing\`), локальный \`vite preview\` на :4176; боевой сайт и реальный localStorage не затрагивались.\n- Реальный браузер: Playwright ${pw.version || ''}, Chrome, мобильный профиль Pixel 7. Виртуальная дата — панель «Тестовый календарь» (+1 день / +7 дней).\n- Старт цикла ${QA_START_DATE} (понедельник); у каждого профиля свой seed (см. \`qa/issue-23/README.md\`).\n\n`;
md += `## Результаты прогона\n\n`;
md += `| Показатель | Значение |\n|---|---|\n`;
md += `| Сценариев полного цикла (профилей) | ${full.length} |\n| Сквозных сценариев (двойные клики, перезагрузки, +7 дней, повреждённое хранилище, ранний итог) | ${cross.length} |\n| Коротких повторов известных дефектов | ${summary.scenarios.knownDefectRepros} |\n`;
md += `| Playwright-тестов всего | ${pw.total} (пройдено ${pw.passed}, упало ${pw.failed}, пропущено ${pw.skipped}, нестабильных ${pw.flaky}, **ожидаемых отказов** ${pw.expectedFailures}, неожиданно прошло ${pw.unexpectedPasses}) |\n`;
md += `| Длительность Playwright | ${(pw.durationMs / 1000).toFixed(0)} с |\n`;
md += `| Виртуальных дней / недель в полных циклах | ${sum(full, 'virtualDays')} дн. / ${full.map((j) => j.counters.weeksSpanned).join('+')} = ${sum(full, 'weeksSpanned')} нед. |\n`;
md += `| Тренировок: внесено результатов / пропущено / перенесено | ${sum(full, 'workoutsRecorded')} / ${sum(full, 'workoutsSkipped')} / ${sum(full, 'workoutsMoved')} |\n`;
md += `| Из них неполных (PARTIAL) / с симптомами | ${sum(full, 'incompleteSessions')} / ${sum(full, 'symptomReports')} |\n`;
md += `| Вердикты движка по внесённым | ${Object.entries(evalTotals).map(([k, v]) => `${k}: ${v}`).join(', ')} |\n`;
md += `| Типы внесённых | ${Object.entries(typeTotals).map(([k, v]) => `${k}: ${v}`).join(', ')} |\n`;
md += `| Контрольных результатов / смен даты экзамена / итоговых результатов | ${sum(full, 'checkpoints')} / ${sum(full, 'examDateChanges')} / ${summary.other.finalResults} |\n`;
md += `| Перезагрузок страницы с проверкой хранилища | ${sum(journals, 'reloads')} |\n| Ожидаемых блокировок (STOP, INV-1, порядок, перенос) | ${sum(journals, 'expectedBlocks')} |\n| Переходов по экранам (UI) | ${sum(journals, 'uiTransitions')} |\n`;
md += `| Проверок (checks) всего | ${allChecks.length}: PASS ${byVerdict.PASS}, KNOWN_FAIL ${byVerdict.KNOWN_FAIL}, FAIL ${byVerdict.FAIL} |\n| Скриншотов (файлов) | ${shots.length} |\n\n`;
md += `Пояснение: «внесено результатов» = реальные нажатия «Сохранить результат» через UI. «Пропущено» — нажатия «Я её не выполнял»/отказ заранее. Тренировки со служебным типом REST в счёт не идут.\n\n`;
md += `## Профили\n\n| Профиль | Seed | Недель | Дней | Внесено | Пропущено | Перенос | Контроль | EASY / quality (в журнале) | Итог | Старт |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const j of full) {
  const easy = (j.weekly ?? []).reduce((a, w) => a + (w.easy ?? 0), 0); const q = (j.weekly ?? []).reduce((a, w) => a + (w.quality ?? 0), 0);
  md += `| ${j.meta.title} | ${j.seed} | ${j.counters.weeksSpanned} | ${j.counters.virtualDays} | ${j.counters.workoutsRecorded} | ${j.counters.workoutsSkipped} | ${j.counters.workoutsMoved} | ${j.counters.checkpoints} | ${easy} / ${q} (${pct(q, easy + q)}) | ${events(j, 'FINAL_RESULT') ? 'внесён' : 'нет'} | ${j.meta.raceDateAtEnd} |\n`;
}
md += `\n(EASY/quality в столбце — все назначенные занятия по неделям, включая пропущенные; подробно — \`data/weekly-load.csv\`.)\n\n`;
md += `## Проверки (сводка по id)\n\n| Проверка | PASS | KNOWN_FAIL | FAIL |\n|---|---|---|---|\n`;
const hide = new Set(['INVARIANTS_HOLD']);
for (const [id, e] of [...checkTable.entries()].sort()) if (!hide.has(id)) md += `| ${id}${e.defect ? ` (${e.defect})` : ''} | ${e.pass} | ${e.known} | ${e.fail} |\n`;
const inv = checkTable.get('INVARIANTS_HOLD'); if (inv) md += `| INVARIANTS_HOLD (все независимые инварианты за день) | ${inv.pass} | ${inv.known} | ${inv.fail} |\n`;
md += `\nИнварианты (\`invariants.ts\`) считаются независимо от движка по сохранённому состоянию: один бег в день; нет бега в день старта и позже; ≤2 quality за 7 дней и ≤ лимита решения на дату слота; 48 ч между quality; нет бега при STOP/паузе; суммарная нагрузка скользящих 7 дней ≤ утверждённой; пропущенные не попадают в историю/очередь; уникальные id.\n\n`;
md += `## Найденные проблемы\n\n`;
for (const d of CATALOG) md += `- **${d.id}** (${d.kind === 'DEFECT' ? 'дефект' : 'наблюдение'}, ${d.severity}): ${d.title} — наблюдений в прогонах: ${occurrences(d.checkIds).length}.\n`;
md += `\nПолное описание (сценарий, seed, ожидалось/фактически): \`defect-log.md\`.\n\n`;
md += `## Ограничения проверки\n\n`;
for (const l of [
  'Только 5 вымышленных профилей × по 1 seed; это не статистика по популяции и не доказательство пригодности методики.',
  'Поведение пользователя — гипотетическая модель (ON_PLAN / PARTIAL / SYMPTOMS / TOO_HARD): без физиологической адаптации; замеры (контроль, итог) намеренно НЕ улучшаются — подставляется то же вымышленное время.',
  'Запрошенные дни недели анкета не принимает (только число бегов в неделю), поэтому «доступные дни» описаны в фикстурах, но проверялись как число запусков, а не как конкретные дни.',
  'Только Chrome (channel chrome), мобильный размер Pixel 7; Safari/Firefox и реальные устройства не проверялись. Часы не реальные: используется виртуальный календарь тестовой сборки.',
  'Медицинское подтверждение — вымышленный чекбокс; реальная оценка состояния и допуск врача не моделируются.',
  'Двойной клик моделируется Playwright dblclick (клики без паузы) — быстрее живого человека.',
  'Счётчики «тренировок» — это занятия, которые реально были в очереди/внесены в данном прогоне; плановые будущие недели, которые не наступили из-за смены даты экзамена, не входят.',
  'Для запуска на машине использовался Node 22 (на машине был 20); проект требует ≥22.18.',
  'Не проверялись: боевой сайт, реальный localStorage, push/офлайн-режим PWA, несколько вкладок одновременно, GPS/реальное время.',
]) md += `- ${l}\n`;
md += `\n## Файлы\n\n- Данные: \`reports/qa-issue-23/data/<профиль>.json|.csv\` (по строке на событие: неделя, дата, назначение, плановая нагрузка, введённый результат, вердикт, причина изменения, предупреждения), \`all-profiles.csv\`, \`weekly-load.csv\` (разминка/основная/заминка по неделям), \`checks.csv\`.\n- Скриншоты: \`reports/qa-issue-23/screenshots/<профиль>/NN-имя.png\`.\n- Сырой вывод Playwright: \`reports/qa-issue-23/raw/playwright-results.json\` (+ \`playwright-list.txt\`).\n- Журнал дефектов: \`reports/qa-issue-23/defect-log.md\`; аудит покрытия: \`docs/qa-issue-23-coverage-audit.md\`.\n`;
writeFileSync(join(ROOT, 'report.md'), md);
console.log(`report written: ${join(ROOT, 'report.md')} · tests ${pw.total} (passed ${pw.passed}, failed ${pw.failed}, expected-fail ${pw.expectedFailures}) · checks ${allChecks.length}`);
