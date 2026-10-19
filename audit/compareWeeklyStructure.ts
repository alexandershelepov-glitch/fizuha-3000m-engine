/**
 * Comparison of three runs of the 12-week audit for the weekly-structure change (LONG_EASY, SPECIFIC rotation).
 *
 *   node --experimental-strip-types audit/compareWeeklyStructure.ts <original-dir> <before-dir> <after-dir> <out.md>
 *
 * original = the first audit (audit/full-cycle-12w), before = engine on feature/issue-24-calendar @ 79b0621 with the extended harness
 * (reservedMeters, check C23), after = the weekly-structure branch. Reads only data/*.json written by run12w.ts; every number is computed
 * here from those files. Detectors and scenarios are not changed or filtered. All athlete behaviour in the data is SYNTHETIC.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {USERS} from './fullCycle12w.ts';

const [origDir, beforeDir, afterDir, outFile] = process.argv.slice(2);
if (!origDir || !beforeDir || !afterDir || !outFile) throw new Error('usage: compareWeeklyStructure.ts <original> <before> <after> <out.md>');

interface Finding {scenarioId: string; code: string; severity: string; week: number}
interface Row {scenarioId: string; userId: string; behaviour: string; week: number; date: string; offset: number; type: string; countsAsQuality: boolean; doseUnit: string; doseValue: number;
  estMetersTotal: number; phase: string; outcome: string; approvedWeekMeters: number | null; mode: string}
interface Scenario {id: string; checks: {code: string; label: string; examined: number; violations: number}[]}
const load = <T>(dir: string, file: string): T => JSON.parse(readFileSync(join(dir, 'data', file), 'utf8')) as T;
const data = (dir: string) => ({findings: load<Finding[]>(dir, 'findings.json'), rows: load<Row[]>(dir, 'workouts.json'), scenarios: load<Scenario[]>(dir, 'scenarios.json')});
const O = data(origDir), B = data(beforeDir), A = data(afterDir);
const ids = A.scenarios.map(s => s.id);
type D = typeof A;
const T = (head: string[], rows: unknown[][]): string => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(v => String(v ?? '—').replaceAll('|', '/')).join(' | ')} |`)].join('\n');
const km = (m: number): string => (Math.round(m / 100) / 10).toFixed(1).replace('.', ',');
const sev: Record<string, string> = {CRITICAL: 'К', METHODOLOGICAL: 'М', MINOR: 'Н'};
const rowsFor = (d: D, id: string): Row[] => d.rows.filter(r => r.scenarioId === id);
const executed = (r: Row): boolean => r.outcome !== 'SKIPPED' && r.outcome !== 'DISPLACED_BY_CONTROL';
const QUALITY = ['THRESHOLD', 'VO2', 'SPECIFIC_3K'];
const count = (d: D, id: string, type: string, onlyExecuted = false): number => rowsFor(d, id).filter(r => r.type === type && (!onlyExecuted || executed(r))).length;
const longest = (d: D, id: string): number => Math.max(0, ...rowsFor(d, id).filter(r => (r.type === 'EASY' || r.type === 'LONG_EASY') && r.doseUnit === 'METERS').map(r => r.doseValue));
/** Weeks (with at least one intense session besides CONTROL) whose only intense session is SPECIFIC_3K, and how many of them directly repeat the previous such week. */
function soleSpecific(d: D, id: string): {sole: number; repeated: number; weeksWithQuality: number} {
  const byWeek = new Map<number, string[]>();
  for (const r of rowsFor(d, id)) if (QUALITY.includes(r.type)) byWeek.set(r.week, [...(byWeek.get(r.week) ?? []), r.type]);
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  let sole = 0, repeated = 0, previousSole = false;
  for (const w of weeks) {
    const isSole = byWeek.get(w)!.length === 1 && byWeek.get(w)![0] === 'SPECIFIC_3K';
    if (isSole) { sole++; if (previousSole) repeated++; }
    previousSole = isSole;
  }
  return {sole, repeated, weeksWithQuality: weeks.length};
}
const checkSum = (d: D, id: string, codes: string[]): number | null => {
  const cs = d.scenarios.find(s => s.id === id)!.checks.filter(c => codes.includes(c.code));
  return cs.length === 0 ? null : cs.reduce((n, c) => n + c.violations, 0);
};
const prepared = (id: string): boolean => /^U[456]/.test(id);

let md = `# Сравнение: недельная структура (LONG_EASY, ротация SPECIFIC) — 12-недельный аудит

Сгенерировано \`audit/compareWeeklyStructure.ts\` из трёх прогонов \`npm run audit:12w\` (все данные синтетические: поведение «пользователей» сочинено, не измерено):

- **исходный** — первый аудит \`audit/full-cycle-12w\` (до исправления D-01…D-03);
- **до** — база \`feature/issue-24-calendar\` @ 79b0621 (с исправлением D-01…D-03), прогнан тем же расширенным стендом, что и «после» (поле \`reservedMeters\`, проверка C23); совпадает с \`audit/full-cycle-12w-after-fix/after/data\` во всех назначениях и находках;
- **после** — ветка \`feature/12w-weekly-structure\`.

Сценарии и пороги детекторов не менялись.

`;

// ---- 1. totals by type
const total = (d: D, f: (r: Row) => boolean): number => d.rows.filter(f).length;
md += `## 1. Итого по 23 сценариям\n\n` + T(['Показатель', 'Исходный', 'До', 'После'], [
  ['сценариев / недель / назначений', `${O.scenarios.length} / ${new Set(O.rows.map(r => `${r.scenarioId}|${r.week}`)).size} / ${O.rows.length}`, `${B.scenarios.length} / ${new Set(B.rows.map(r => `${r.scenarioId}|${r.week}`)).size} / ${B.rows.length}`, `${A.scenarios.length} / ${new Set(A.rows.map(r => `${r.scenarioId}|${r.week}`)).size} / ${A.rows.length}`],
  ['LONG_EASY назначено (все / выполнено)', ...[O, B, A].map(d => `${total(d, r => r.type === 'LONG_EASY')} / ${total(d, r => r.type === 'LONG_EASY' && executed(r))}`)],
  ['THRESHOLD назначено', ...[O, B, A].map(d => total(d, r => r.type === 'THRESHOLD'))],
  ['VO2 назначено', ...[O, B, A].map(d => total(d, r => r.type === 'VO2'))],
  ['SPECIFIC_3K назначено', ...[O, B, A].map(d => total(d, r => r.type === 'SPECIFIC_3K'))],
  ['CONTROL назначено', ...[O, B, A].map(d => total(d, r => r.type === 'CONTROL'))],
  ['EASY назначено', ...[O, B, A].map(d => total(d, r => r.type === 'EASY'))],
  ['находок (К/М/Н)', ...[O, B, A].map(d => `${d.findings.length} (${['CRITICAL', 'METHODOLOGICAL', 'MINOR'].map(s => d.findings.filter(f => f.severity === s).length).join('/')})`)],
  ['проверок применено / нарушений', ...[O, B, A].map(d => `${d.scenarios.flatMap(s => s.checks).reduce((n, c) => n + c.examined, 0)} / ${d.scenarios.flatMap(s => s.checks).reduce((n, c) => n + c.violations, 0)}`)],
]) + '\n\n';

// ---- 2. per scenario
md += `## 2. По сценариям (все 23)\n\nСтолбцы «до → после»; «исходный» показан только там, где важно (LONG_EASY был 0 и в исходном, и в «до» во всех сценариях). «S3 единственная» — недели, где единственное интенсивное занятие — SPECIFIC_3K / из них повторяют такую же предыдущую неделю подряд. «Бюджет» — нарушения C23 (сумма резервов движка за любые 7 дней > утверждённого бюджета; в исходном прогоне проверки не было). «Восстановление» — нарушения C05/C05b (интервал между интенсивными ≥ 48 ч). «Самая длинная» — максимальная дистанция EASY/LONG_EASY в метрах, км.\n\n`;
md += T(['Сценарий', 'LONG_EASY', 'THRESHOLD', 'VO2', 'SPECIFIC_3K', 'S3 единственная / подряд', 'Самая длинная, км (исх. → до → после)', 'Бюджет C23', 'Восстановление C05'],
  ids.map(id => {
    const bs = soleSpecific(B, id), as = soleSpecific(A, id);
    return [id, `${count(B, id, 'LONG_EASY')} → ${count(A, id, 'LONG_EASY')}`, `${count(B, id, 'THRESHOLD')} → ${count(A, id, 'THRESHOLD')}`, `${count(B, id, 'VO2')} → ${count(A, id, 'VO2')}`, `${count(B, id, 'SPECIFIC_3K')} → ${count(A, id, 'SPECIFIC_3K')}`,
      `${bs.sole}/${bs.repeated} → ${as.sole}/${as.repeated}`, `${km(longest(O, id))} → ${km(longest(B, id))} → ${km(longest(A, id))}`,
      `${checkSum(B, id, ['C23']) ?? '—'} → ${checkSum(A, id, ['C23']) ?? '—'}`, `${checkSum(B, id, ['C05', 'C05b']) ?? '—'} → ${checkSum(A, id, ['C05', 'C05b']) ?? '—'}`];
  })) + '\n\n';
const sum = (d: D, f: (id: string) => number | null): number => ids.reduce((n, id) => n + (f(id) ?? 0), 0);
md += `Сумма по 23 сценариям: нарушений бюджета C23 до ${sum(B, id => checkSum(B, id, ['C23']))} → после ${sum(A, id => checkSum(A, id, ['C23']))}; нарушений восстановления C05/C05b до ${sum(B, id => checkSum(B, id, ['C05', 'C05b']))} → после ${sum(A, id => checkSum(A, id, ['C05', 'C05b']))}.\n\n`;

// ---- 3. S3-only weeks, focus users
const focus = ids.filter(id => /^U[456]/.test(id));
md += `## 3. SPECIFIC_3K: ротация (U4, U5, U6)\n\nЧисло недель с интенсивными занятиями и доли типов в этих неделях (по назначениям).\n\n` + T(['Сценарий', 'Недель с интенсивными (до → после)', 'Недель, где SPECIFIC_3K единственная (до → после)', '…из них подряд (до → после)', 'T / V / S3 до', 'T / V / S3 после'],
  focus.map(id => { const b = soleSpecific(B, id), a = soleSpecific(A, id); return [id, `${b.weeksWithQuality} → ${a.weeksWithQuality}`, `${b.sole} → ${a.sole}`, `${b.repeated} → ${a.repeated}`, `${count(B, id, 'THRESHOLD')} / ${count(B, id, 'VO2')} / ${count(B, id, 'SPECIFIC_3K')}`, `${count(A, id, 'THRESHOLD')} / ${count(A, id, 'VO2')} / ${count(A, id, 'SPECIFIC_3K')}`]; })) + '\n\n';

// ---- 4. long vs habitual and budget
md += `## 4. LONG_EASY относительно привычной длинной и недельного бюджета (после; сценарии U4–U6)\n\nПривычная длинная — из анкеты виртуального пользователя. «Бюджет» — \`approvedWeekMeters\` движка на дату занятия. Доля — доза LONG_EASY / бюджет.\n\n`;
md += T(['Сценарий', 'Привычная длинная, км', 'Бюджет на старте → в конце, км', 'LONG_EASY, км (мин – макс)', '% привычной (мин – макс)', '% бюджета (мин – макс)', 'Недель с LONG_EASY / недель с бегом'],
  focus.map(id => {
    const u = USERS.find(x => x.id === A.rows.find(r => r.scenarioId === id)!.userId)!; const r = rowsFor(A, id); const long = r.filter(x => x.type === 'LONG_EASY' && x.doseUnit === 'METERS');
    const budgets = r.filter(x => x.approvedWeekMeters !== null).map(x => x.approvedWeekMeters!);
    const pc = (xs: number[]): string => xs.length === 0 ? '—' : `${Math.round(Math.min(...xs))} – ${Math.round(Math.max(...xs))} %`;
    return [id, km(u.longestKm * 1000), `${km(budgets[0] ?? 0)} → ${km(budgets.at(-1) ?? 0)}`, long.length === 0 ? '—' : `${km(Math.min(...long.map(x => x.doseValue)))} – ${km(Math.max(...long.map(x => x.doseValue)))}`,
      pc(long.map(x => x.doseValue / (u.longestKm * 1000) * 100)), pc(long.map(x => x.doseValue / x.approvedWeekMeters! * 100)),
      `${new Set(long.map(x => x.week)).size} / ${new Set(r.map(x => x.week)).size}`];
  })) + '\n\n';

// ---- 5. weekly budget growth
const sumKm = (d: D, id: string): number => rowsFor(d, id).filter(r => r.type !== 'REST').reduce((n, r) => n + r.estMetersTotal, 0);
md += `## 5. Недельный объём не растёт из-за LONG_EASY\n\nБюджет движка (\`approvedWeekMeters\`, км) на старте и в конце цикла и сумма плана за 12 недель (оценка рецензента, включая разминку/заминку и восстановления). U1/U2/U3 не получают LONG_EASY.\n\n` + T(['Сценарий', 'Бюджет старт → конец до', 'Бюджет старт → конец после', 'План за цикл, км до → после', 'LONG_EASY у непрепарированных (U1–U3)'],
  ids.map(id => {
    const bb = rowsFor(B, id).filter(r => r.approvedWeekMeters !== null).map(r => r.approvedWeekMeters!), aa = rowsFor(A, id).filter(r => r.approvedWeekMeters !== null).map(r => r.approvedWeekMeters!);
    return [id, `${km(bb[0] ?? 0)} → ${km(bb.at(-1) ?? 0)}`, `${km(aa[0] ?? 0)} → ${km(aa.at(-1) ?? 0)}`, `${km(sumKm(B, id))} → ${km(sumKm(A, id))}`, prepared(id) ? '—' : count(A, id, 'LONG_EASY')];
  })) + '\n\n';
md += `Максимум одной недели (оценка плана, км, до → после) по всем сценариям: ${km(Math.max(...ids.map(id => Math.max(...[...new Set(rowsFor(B, id).map(r => r.week))].map(w => rowsFor(B, id).filter(r => r.week === w && r.type !== 'REST').reduce((n, r) => n + r.estMetersTotal, 0))))))} → ${km(Math.max(...ids.map(id => Math.max(...[...new Set(rowsFor(A, id).map(r => r.week))].map(w => rowsFor(A, id).filter(r => r.week === w && r.type !== 'REST').reduce((n, r) => n + r.estMetersTotal, 0))))))}.\n\n`;

// ---- 6. findings by kind
const TITLE: Record<string, string> = {
  CHECKPOINT_REQUIRED_BUT_REFUSED: 'D-01', CONTROL_RESETS_PROGRESS: 'D-02', QUALITY_DOSE_NOT_PROGRESSING: 'D-03', PACE_OUT_OF_BAND: 'D-04', VOLUME_AND_INTENSITY_RISE_TOGETHER: 'D-05', RETURN_TO_FULL_LOAD_AFTER_HOLD: 'D-06',
  HOLD_REMOVES_TRAINING: 'D-07', LONG_RUN_NEVER_PRESCRIBED: 'D-08', FREQUENCY_NEVER_PROGRESSES: 'D-09', SHORT_RECOVERY_FOR_LONG_REPEATS: 'D-10', FAILED_TASK_REPEATED_UNCHANGED: 'D-11', CONTROL_DISPLACES_SESSION: 'D-12',
  WEEKLY_VOLUME_JUMP: 'D-13', NO_VOLUME_PROGRESSION: 'C08', WEEKLY_BUDGET_EXCEEDED: 'C23', HARD_SESSIONS_TOO_CLOSE: 'C05',
};
const codes = [...new Set([...O.findings, ...B.findings, ...A.findings].map(f => f.code))].sort();
const cnt = (d: D, c: string): string => `${d.findings.filter(f => f.code === c).length} / ${new Set(d.findings.filter(f => f.code === c).map(f => f.scenarioId)).size}`;
md += `## 6. Находки по видам (случаев / сценариев)\n\n` + T(['Вид', 'Код', 'Серьёзность', 'Исходный', 'До', 'После'],
  codes.map(c => [c, TITLE[c] ?? '', sev[[...O.findings, ...B.findings, ...A.findings].find(f => f.code === c)!.severity], cnt(O, c), cnt(B, c), cnt(A, c)])) + '\n\n';
const key = (f: Finding): string => `${f.scenarioId}|${f.code}|${f.week}`;
const bk = new Set(B.findings.map(key)), ak = new Set(A.findings.map(key));
const fmt = (k: string): string => { const [s, c, w] = k.split('|'); return `${s} ${TITLE[c!] ?? c} (нед. ${w})`; };
md += `**Новые находки после изменения (нет в «до», по сценарию+виду+неделе):** ${[...ak].filter(k => !bk.has(k)).map(fmt).join('; ') || 'нет'}.\n\n`;
md += `**Исчезли:** ${[...bk].filter(k => !ak.has(k)).map(fmt).join('; ') || 'нет'}.\n\n`;
const newCodes = codes.filter(c => !B.findings.some(f => f.code === c) && A.findings.some(f => f.code === c));
const worse = codes.filter(c => A.findings.filter(f => f.code === c).length > B.findings.filter(f => f.code === c).length);
md += `Виды, которых не было «до»: ${newCodes.join(', ') || 'нет'}. Виды, где случаев стало больше: ${worse.map(c => `${TITLE[c] ?? c} (${B.findings.filter(f => f.code === c).length} → ${A.findings.filter(f => f.code === c).length})`).join(', ') || 'нет'}.\n\n`;

// ---- 7. weeks
const L: Record<string, string> = {EASY: 'E', LONG_EASY: 'L', THRESHOLD: 'T', VO2: 'V', SPECIFIC_3K: 'S3', INTRO_QUALITY: 'IQ', CONTROL: 'C', REST: 'R', STRIDES: 'ST'};
const cell = (r: Row): string => {
  const dose = r.doseUnit === 'METERS' ? (r.doseValue / 1000).toFixed(1).replace('.', ',') + ' км' : `${Math.round(r.doseValue)} мин`;
  return `${L[r.type] ?? r.type} ${r.type === 'CONTROL' ? '3 км' : r.type === 'VO2' || r.type === 'SPECIFIC_3K' || r.type === 'THRESHOLD' ? (r.doseUnit === 'METERS' ? dose : dose) : dose}${r.outcome === 'SKIPPED' ? ' (пропуск)' : r.outcome === 'DISPLACED_BY_CONTROL' ? ' (вытеснено)' : ''}`;
};
md += `## 7. Реальные недели (сценарий A — «как назначено»; в скобках пропуск/вытеснение)\n\nE — EASY, L — LONG_EASY, T — THRESHOLD, V — VO2, S3 — SPECIFIC_3K, IQ — вводное качество, C — CONTROL. Дозы: километры для EASY/LONG_EASY/S3, минуты для THRESHOLD/VO2. Данные синтетические.\n\n`;
for (const id of ['U4-intermediate-A', 'U5-trained-A', 'U6-experienced-A']) {
  md += `### ${id}\n\n` + T(['Неделя', 'До', 'После', 'Бюджет движка после, км'], [...new Set(rowsFor(A, id).map(r => r.week))].sort((a, b) => a - b).map(w => [w,
    rowsFor(B, id).filter(r => r.week === w && r.type !== 'REST').map(cell).join(' · ') || '—', rowsFor(A, id).filter(r => r.week === w && r.type !== 'REST').map(cell).join(' · ') || '—',
    km(rowsFor(A, id).find(r => r.week === w && r.approvedWeekMeters !== null)?.approvedWeekMeters ?? 0)])) + '\n\n';
}
writeFileSync(outFile, md);
process.stdout.write(`written ${outFile}\n`);
