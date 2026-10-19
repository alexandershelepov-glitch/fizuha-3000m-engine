/**
 * Before/after comparison of two runs of the 12-week audit (`npm run audit:12w` with AUDIT_12W_OUT=<dir>).
 *
 *   node --experimental-strip-types audit/compare12w.ts <before-dir> <after-dir> <out.md>
 *
 * Reads only the data files written by run12w.ts (data/findings.json, data/scenarios.json, data/workouts.json,
 * data/events.csv). Every number in the output is computed from those files. The detectors are NOT changed or
 * filtered here: a finding that remains after the fix is listed together with the reason it remains.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const [beforeDir, afterDir, outFile] = process.argv.slice(2);
if (!beforeDir || !afterDir || !outFile) throw new Error('usage: compare12w.ts <before-dir> <after-dir> <out.md>');

interface Finding {scenarioId: string; code: string; severity: string; week: number; actual: string}
interface Row {scenarioId: string; week: number; date: string; type: string; mode: string; doseValue: number; doseUnit: string; outcome: string; evaluation: string | null;
  paceFast: number | null; paceSlow: number | null; phase: string; gate: string; capacity: string; calibration: boolean; countsAsQuality: boolean;
  estMetersTotal: number; approvedWeekMeters: number | null}
interface Scenario {id: string; checks: {code: string; label: string; examined: number; violations: number}[]; engineErrors: unknown[]}
const load = <T>(dir: string, file: string): T => JSON.parse(readFileSync(join(dir, 'data', file), 'utf8')) as T;
const data = (dir: string) => ({findings: load<Finding[]>(dir, 'findings.json'), rows: load<Row[]>(dir, 'workouts.json'), scenarios: load<Scenario[]>(dir, 'scenarios.json'),
  events: readFileSync(join(dir, 'data', 'events.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(',').slice(0, 4))});
const B = data(beforeDir), A = data(afterDir);
const ids = A.scenarios.map(s => s.id);
const TITLE: Record<string, string> = {
  CHECKPOINT_REQUIRED_BUT_REFUSED: 'D-01 контроль требуется, но движок отказывает', CONTROL_RESETS_PROGRESS: 'D-02 контроль обнуляет прогресс', QUALITY_DOSE_NOT_PROGRESSING: 'D-03 доза качества не растёт',
  PACE_OUT_OF_BAND: 'D-04 темп вне полосы', VOLUME_AND_INTENSITY_RISE_TOGETHER: 'D-05 объём и интенсивность растут вместе', RETURN_TO_FULL_LOAD_AFTER_HOLD: 'D-06 возврат к полной нагрузке после паузы',
  HOLD_REMOVES_TRAINING: 'D-07 пауза забирает тренировки', LONG_RUN_NEVER_PRESCRIBED: 'D-08 длинная не назначается', FREQUENCY_NEVER_PROGRESSES: 'D-09 частота не растёт',
  SHORT_RECOVERY_FOR_LONG_REPEATS: 'D-10 короткий отдых', FAILED_TASK_REPEATED_UNCHANGED: 'D-11 неудача повторяется без изменений', CONTROL_DISPLACES_SESSION: 'D-12 контроль вытесняет занятие',
  WEEKLY_VOLUME_JUMP: 'D-13 скачок недельного объёма', NO_VOLUME_PROGRESSION: 'нет роста объёма (C08)',
};
const sev: Record<string, string> = {CRITICAL: 'К', METHODOLOGICAL: 'М', MINOR: 'Н'};
const T = (head: string[], rows: unknown[][]): string => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(v => String(v ?? '—').replaceAll('|', '/')).join(' | ')} |`)].join('\n');
const count = (f: Finding[], code: string): number => f.filter(x => x.code === code).length;
const scen = (f: Finding[], code: string): string[] => [...new Set(f.filter(x => x.code === code).map(x => x.scenarioId))];
const sumKM = (rows: Row[], id: string): number => Math.round(rows.filter(r => r.scenarioId === id && r.type !== 'REST').reduce((n, r) => n + r.estMetersTotal, 0) / 100) / 10;
const budget = (rows: Row[], id: string): number[] => rows.filter(r => r.scenarioId === id && r.approvedWeekMeters !== null).map(r => r.approvedWeekMeters as number);
const CEIL: Record<string, Record<string, number>> = {T0: {THRESHOLD: 12, VO2: 8}, T1: {THRESHOLD: 12, VO2: 8}, T2: {THRESHOLD: 20, VO2: 12}, T3: {THRESHOLD: 25, VO2: 18}};

let md = `# Сравнение до / после исправления D-01, D-02, D-03 (12-недельный аудит)\n\nСгенерировано \`audit/compare12w.ts\` из двух прогонов одного и того же набора \`npm run audit:12w\`: «до» — база \`feature/issue-24-calendar\` (результат совпадает с PR #35 побайтно), «после» — с исправлением. Всё поведение «пользователей» синтетическое; детекторы не менялись и не фильтровались.\n\n`;

// ---- A. finding codes
const codes = [...new Set([...B.findings, ...A.findings].map(f => f.code))].sort();
md += `## 1. Находки по видам\n\n` + T(['Вид', 'Серьёзность', 'До: случаев / сценариев', 'После: случаев / сценариев', 'Сценарии после'],
  codes.map(c => [`${c} — ${TITLE[c] ?? ''}`, sev[(B.findings.concat(A.findings)).find(f => f.code === c)!.severity], `${count(B.findings, c)} / ${scen(B.findings, c).length}`, `${count(A.findings, c)} / ${scen(A.findings, c).length}`, scen(A.findings, c).join(', ') || '—'])) + '\n\n';
const tally = (f: Finding[]) => ['CRITICAL', 'METHODOLOGICAL', 'MINOR'].map(s => f.filter(x => x.severity === s).length).join(' / ');
const checks = (s: Scenario[]) => ({examined: s.flatMap(x => x.checks).reduce((n, c) => n + c.examined, 0), violations: s.flatMap(x => x.checks).reduce((n, c) => n + c.violations, 0)});
md += `Итого: находок (после группировки по сценарию и коду) до ${B.findings.length}, после ${A.findings.length}; К/М/Н до ${tally(B.findings)}, после ${tally(A.findings)}; проверок применено до ${checks(B.scenarios).examined}, после ${checks(A.scenarios).examined}; нарушений до ${checks(B.scenarios).violations}, после ${checks(A.scenarios).violations}.\n\n`;

// ---- B. per scenario
md += `## 2. По сценариям (все 23; U1, U3, U4, U5, U6 — в фокусе)\n\n` + T(['Сценарий', 'Находок до → после', 'Исчезло', 'Появилось / стало видно', 'План км до → после (оценка рецензента)', 'Бюджет движка км, конец: до → после'],
  ids.map(id => {
    const b = new Set(B.findings.filter(f => f.scenarioId === id).map(f => f.code)), a = new Set(A.findings.filter(f => f.scenarioId === id).map(f => f.code));
    const gone = [...b].filter(c => !a.has(c)).map(c => c.split('_')[0] + '…' + (TITLE[c]?.split(' ')[0] ?? '')), appeared = [...a].filter(c => !b.has(c)).map(c => TITLE[c]?.split(' ')[0] ?? c);
    const bb = budget(B.rows, id), aa = budget(A.rows, id);
    return [id, `${b.size} → ${a.size}`, [...b].filter(c => !a.has(c)).map(c => TITLE[c]?.split(' ')[0] ?? c).join(', ') || '—', appeared.join(', ') || '—', `${sumKM(B.rows, id)} → ${sumKM(A.rows, id)}`, `${(bb.at(-1) ?? 0) / 1000} → ${(aa.at(-1) ?? 0) / 1000}`];
  })) + '\n\n';
void 0;

// ---- C. D-01
const evCount = (e: string[][], id: string, kind: string): number => e.filter(x => x[0] === id && x[3] === kind).length;
md += `## 3. D-01 · новичок без 3 км подряд (U1)\n\n` + T(['Сценарий', 'Дней с экраном «нужен контроль» (CONTROL_REFUSED) до → после', 'Ошибок движка на контроле до → после', 'Подтверждение 3 км (внешний ввод): дата', 'Контрольный результат принят после подтверждения (после)'],
  ids.filter(i => i.startsWith('U1')).map(id => [id, `${evCount(B.events, id, 'CONTROL_REFUSED')} → ${evCount(A.events, id, 'CONTROL_REFUSED')}`,
    `${B.scenarios.find(s => s.id === id)!.engineErrors.length} → ${A.scenarios.find(s => s.id === id)!.engineErrors.length}`,
    A.events.find(x => x[0] === id && x[3] === 'EXTERNAL_CONFIRM_CONTINUOUS_3K')?.[1] ?? '—', `${evCount(A.events, id, 'EXTERNAL_3K_CONTROL')} контр. принято`])) + '\n\n';
md += `Тупик исчез: экран контроля не показывается, пока 3 км подряд не подтверждены; после подтверждения контроль назначается обычными правилами и принимается. Новичок пока не получает вытеснения: после подтверждения 3 км экран контроля вытесняет EASY (D-12) — раньше эта находка была скрыта условием \`refused === 0\` в детекторе, то есть она не новая, а ставшая видимой.\n\n`;

// ---- D. D-02
md += `## 4. D-02 · фаза и gate вокруг контрольных забегов (по строкам назначений: последнее занятие до контроля → первое после)\n\n`;
const ctl = (rows: Row[], id: string): string[] => {
  const r = rows.filter(x => x.scenarioId === id); const out: string[] = [];
  r.forEach((x, i) => { if (x.type === 'CONTROL' && r[i - 1] && r[i + 1]) out.push(`${r[i - 1]!.phase}/${r[i - 1]!.gate} → ${r[i + 1]!.phase}/${r[i + 1]!.gate}`); });
  return out;
};
md += T(['Сценарий', 'Контрольных в плане', 'До: фаза/gate (до → после контроля)', 'После: фаза/gate (до → после контроля)', 'CONTROL_RESETS_PROGRESS до → после'],
  ids.filter(id => ctl(B.rows, id).length + ctl(A.rows, id).length > 0).map(id => [id, `${ctl(B.rows, id).length} → ${ctl(A.rows, id).length}`, ctl(B.rows, id).join('; ') || '—', ctl(A.rows, id).join('; ') || '—',
    `${B.findings.some(f => f.scenarioId === id && f.code === 'CONTROL_RESETS_PROGRESS') ? 'да' : 'нет'} → ${A.findings.some(f => f.scenarioId === id && f.code === 'CONTROL_RESETS_PROGRESS') ? 'да' : 'нет'}`])) + '\n\n';
md += `Контрольные забеги без слота CONTROL в плане (U1–U3) показываются экраном вместо занятия (D-12) и в этой таблице не видны. Фаза/gate в строках — на дату занятия; «после» берётся с первого занятия после контроля.\n\n`;

// ---- E. D-03
md += `## 5. D-03 · доза успешных качественных занятий (успешно выполненные ON_PLAN; доза в мин или м)\n\n`;
const qrows: string[][] = [];
for (const id of ids) for (const type of ['INTRO_QUALITY', 'THRESHOLD', 'VO2', 'SPECIFIC_3K']) {
  const seq = (rows: Row[]) => rows.filter(r => r.scenarioId === id && r.type === type && r.outcome === 'ON_PLAN');
  const b = seq(B.rows), a = seq(A.rows); if (b.length + a.length === 0) continue;
  const steps = (s: Row[]) => s.filter((r, i) => i > 0 && r.doseValue > s[i - 1]!.doseValue + 1e-9).length;
  const cap = a[0]?.capacity ?? b[0]?.capacity ?? 'T0'; const ceil = CEIL[cap]?.[type];
  const atCeil = ceil !== undefined && a.length > 0 && a.every(r => r.doseValue >= ceil - 1e-9);
  qrows.push([id, type, `${b.map(r => +r.doseValue.toFixed(1)).join(',') || '—'}`, `${a.map(r => +r.doseValue.toFixed(1)).join(',') || '—'}`, `${steps(b)} → ${steps(a)}`, atCeil ? `да: ${cap} потолок ${ceil}` : '—']);
}
md += T(['Сценарий', 'Тип', 'Доза до (по неделям выполнения)', 'Доза после', 'Шагов роста до → после', 'Доза на потолке движка с первого занятия'], qrows) + '\n\n';
md += `Строки «потолок»: доза T3 THRESHOLD=25 мин и VO2=18 мин задана начальной дозой уровня Q2 и равна \`qualityDoseCeiling\`; это защитное ограничение, а не сброс прогрессии, и детектор C08b для них всё равно срабатывает (детектор не менялся). Таблица потолков повторяет \`src/workouts.ts › qualityDoseCeiling\`.\n\n`;

// ---- F. checks
md += `## 6. Проверки ограничений и механизмов (сумма по 23 сценариям: применено / нарушений, до → после)\n\n`;
const byCode = (s: Scenario[]) => { const m = new Map<string, {label: string; ex: number; v: number}>(); for (const sc of s) for (const c of sc.checks) { const e = m.get(c.code) ?? {label: c.label, ex: 0, v: 0}; e.ex += c.examined; e.v += c.violations; m.set(c.code, e); } return m; };
const cb = byCode(B.scenarios), ca = byCode(A.scenarios);
md += T(['Код', 'Проверка', 'До', 'После'], [...new Set([...cb.keys(), ...ca.keys()])].sort().map(c => [c, (ca.get(c) ?? cb.get(c))!.label, `${cb.get(c)?.ex ?? 0} / ${cb.get(c)?.v ?? 0}`, `${ca.get(c)?.ex ?? 0} / ${ca.get(c)?.v ?? 0}`])) + '\n\n';

// ---- G. unchanged mechanisms
md += `## 7. Лёгкие занятия, калибровка, пропуски и неудачи (то, что исправление не должно менять)\n\n`;
const rowsOf = (d: typeof B, id: string, f: (r: Row) => boolean) => d.rows.filter(r => r.scenarioId === id && f(r));
let sameEasy = 0, diffEasy = 0, longB = 0, longA = 0, calB = 0, calA = 0, rwB = 0, rwA = 0;
for (const id of ids) {
  const eb = rowsOf(B, id, r => r.type === 'EASY' || r.type === 'LONG_EASY'), ea = rowsOf(A, id, r => r.type === 'EASY' || r.type === 'LONG_EASY');
  const key = (r: Row) => `${r.date}|${r.type}|${r.mode}|${r.doseValue.toFixed(0)}|${r.paceFast}|${r.paceSlow}`; const kb = new Set(eb.map(key));
  for (const r of ea) kb.has(key(r)) ? sameEasy++ : diffEasy++;
  longB += eb.filter(r => r.type === 'LONG_EASY').length; longA += ea.filter(r => r.type === 'LONG_EASY').length;
  calB += eb.filter(r => r.calibration).length; calA += ea.filter(r => r.calibration).length;
  rwB += eb.filter(r => r.mode === 'RUN_WALK').length; rwA += ea.filter(r => r.mode === 'RUN_WALK').length;
}
const outc = (d: typeof B, o: string) => d.rows.filter(r => r.outcome === o).length;
md += T(['Показатель', 'До', 'После'], [
  ['EASY/LONG_EASY назначений', B.rows.filter(r => r.type === 'EASY' || r.type === 'LONG_EASY').length, A.rows.filter(r => r.type === 'EASY' || r.type === 'LONG_EASY').length],
  ['…из них совпадает по дате, дозе и темпу с прогоном «до»', '—', `${sameEasy} из ${sameEasy + diffEasy}`],
  ['LONG_EASY назначений', longB, longA], ['калибровочных EASY', calB, calA], ['RUN_WALK EASY', rwB, rwA],
  ['SHORTFALL / SLOW_PACE (синтетические неудачи)', `${outc(B, 'SHORTFALL')} / ${outc(B, 'SLOW_PACE')}`, `${outc(A, 'SHORTFALL')} / ${outc(A, 'SLOW_PACE')}`],
  ['SKIPPED (пропуски В)', outc(B, 'SKIPPED'), outc(A, 'SKIPPED')], ['DISPLACED_BY_CONTROL', outc(B, 'DISPLACED_BY_CONTROL'), outc(A, 'DISPLACED_BY_CONTROL')], ['REST (защитная пауза)', outc(B, 'REST'), outc(A, 'REST')],
  ['качественных назначений (без CONTROL)', B.rows.filter(r => r.countsAsQuality && r.type !== 'CONTROL').length, A.rows.filter(r => r.countsAsQuality && r.type !== 'CONTROL').length],
  ['CONTROL назначений', B.rows.filter(r => r.type === 'CONTROL').length, A.rows.filter(r => r.type === 'CONTROL').length],
]) + '\n\n';
// ---- H. what changed in the assignments, matched by scenario and date
const byDate = new Map(B.rows.map(r => [`${r.scenarioId}|${r.date}`, r]));
const typeChange = new Map<string, number>(); let easyDiff = 0, easyFaster = 0, easyLonger = 0, matched = 0;
for (const r of A.rows) {
  const b = byDate.get(`${r.scenarioId}|${r.date}`); if (!b) continue; matched++;
  if (b.type !== r.type) { const k = `${b.type} → ${r.type}`; typeChange.set(k, (typeChange.get(k) ?? 0) + 1); continue; }
  if (r.type !== 'EASY' || (b.doseValue === r.doseValue && b.paceFast === r.paceFast && b.paceSlow === r.paceSlow)) continue;
  easyDiff++;
  if (r.paceFast !== null && b.paceFast !== null && r.paceFast < b.paceFast - 0.01) easyFaster++;
  if (r.doseValue > b.doseValue + 1) easyLonger++;
}
md += `## 8. Что изменилось в назначениях (сопоставление по сценарию и дате; назначений в обоих прогонах: ${matched})\n\n`;
md += T(['Изменение типа занятия в тот же день (до → после)', 'Случаев'], [...typeChange.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, v])) + '\n\n';
md += T(['EASY в тот же день (тип не менялся)', 'Значение'], [['отличается дозой или темпом', easyDiff], ['…с более быстрым верхним темпом, чем до', easyFaster], ['…с большей дозой, чем до (> +1 м)', easyLonger]]) + '\n\n';
md += `Смена типа — следствие того, что счётчики подтверждённых занятий теперь не обнуляются контролем: фаза SPECIFIC и очередность THRESHOLD/VO2/SPECIFIC_3K продолжаются, а у пользователей Q0 после двух вводных занятий идёт THRESHOLD. Доза EASY отличается там, где резерв бюджета под другое качественное занятие другой; недельные лимиты движка не менялись.\n`;
writeFileSync(outFile, md);
process.stdout.write(`written ${outFile}\n`);
