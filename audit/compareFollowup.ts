/**
 * Before/after comparison for the WS-19 follow-up (weekly intense capacity), generated from saved data only.
 *
 *   node --experimental-strip-types audit/compareFollowup.ts <followup-dir> <out.md>
 *
 * <followup-dir>/{before,after}/data/*.json are two runs of `npm run audit:12w` (before = PR #37 commit 270b203, after = follow-up) and
 * <followup-dir>/{before,after}/probes.json are two runs of `audit/probeDeficitBudget.ts`. All athlete behaviour is SYNTHETIC.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const [dir, outFile] = process.argv.slice(2);
if (!dir || !outFile) throw new Error('usage: compareFollowup.ts <followup-dir> <out.md>');
interface Finding {scenarioId: string; code: string; week: number}
interface Row {scenarioId: string; week: number; type: string; countsAsQuality: boolean; doseUnit: string; doseValue: number; outcome: string}
interface Scenario {id: string; checks: {code: string; violations: number}[]}
interface Probe {id: string; budgetStartKm: number; habitualLongKm: number; counts: Record<string, number>; easyKm: string; longKm: string; intensePerWeek: number[]; weeksText: string[];
  checks: Record<string, number>; findings: number; findingCodes: Record<string, number>; endBudgetKm: number; planKm: number; engineErrors: number}
const load = <T>(k: string, f: string): T => JSON.parse(readFileSync(join(dir, k, f), 'utf8')) as T;
const D = (k: string) => ({findings: load<Finding[]>(k, 'data/findings.json'), rows: load<Row[]>(k, 'data/workouts.json'), scenarios: load<Scenario[]>(k, 'data/scenarios.json'), probes: load<Probe[]>(k, 'probes.json')});
const B = D('before'), A = D('after');
const T = (head: string[], rows: unknown[][]): string => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(v => String(v ?? '—').replaceAll('|', '/')).join(' | ')} |`)].join('\n');
const km = (xs: number[]): string => xs.length === 0 ? '—' : `${(Math.min(...xs) / 1000).toFixed(1)}–${(Math.max(...xs) / 1000).toFixed(1)}`;
const FIND: Record<string, string> = {VOLUME_AND_INTENSITY_RISE_TOGETHER: 'D-05', RETURN_TO_FULL_LOAD_AFTER_HOLD: 'D-06', HOLD_REMOVES_TRAINING: 'D-07'};
const dsum = (d: typeof A, id: string, codes: string[]): number => d.scenarios.find(s => s.id === id)!.checks.filter(c => codes.includes(c.code)).reduce((n, c) => n + c.violations, 0);
const comp = (d: typeof A, id: string): string => ['THRESHOLD', 'VO2', 'SPECIFIC_3K', 'CONTROL'].map(t => `${{THRESHOLD: 'T', VO2: 'V', SPECIFIC_3K: 'S3', CONTROL: 'C'}[t]}${d.rows.filter(r => r.scenarioId === id && r.type === t).length}`).join(' ');
const dnum = (d: typeof A, id: string, code: string): number => d.findings.filter(f => f.scenarioId === id && (FIND[f.code] ?? f.code) === code).length;
const ids = A.scenarios.map(s => s.id).filter(id => /^U[456]/.test(id));
const same = JSON.stringify(B.rows) === JSON.stringify(A.rows) && JSON.stringify(B.findings) === JSON.stringify(A.findings);

let md = `# Сравнение «до / после» для дополнения к PR #37 (WS-19 и WS-18)

Сгенерировано \`audit/compareFollowup.ts\` из сохранённых данных \`before/\` и \`after/\` (все данные **синтетические**: поведение «пользователей» сочинено, не измерено).
«До» — коммит PR #37 270b203; «после» — рабочее дерево дополнения. Оба прогона сделаны одним и тем же стендом (\`reservedMeters\` с точностью до 3 знаков).

## 1. Основные 23 сценария аудита (U4/U5/U6 и остальные)

Назначения (\`workouts.json\`) и находки (\`findings.json\`) во всех 23 сценариях ${same ? '**совпадают побайтно**: дополнение их не меняет, ухудшений нет (и улучшений тоже)' : '**различаются**, см. таблицу'}.

${T(['Сценарий', 'LONG_EASY до→после', 'EASY, км до→после', 'LONG_EASY, км до→после', 'Интенсивные до', 'Интенсивные после', 'C23 д→п', 'C05+C05b д→п', 'D-05 д→п', 'D-06 д→п', 'D-07 д→п', 'Находок д→п'],
  ids.map(id => {
    const r = (d: typeof A, t: string) => d.rows.filter(x => x.scenarioId === id && x.type === t);
    const e = (d: typeof A, t: string) => km(r(d, t).filter(x => x.doseUnit === 'METERS').map(x => x.doseValue));
    const f = (d: typeof A) => d.findings.filter(x => x.scenarioId === id).length;
    return [id, `${r(B, 'LONG_EASY').length}→${r(A, 'LONG_EASY').length}`, `${e(B, 'EASY')}→${e(A, 'EASY')}`, `${e(B, 'LONG_EASY')}→${e(A, 'LONG_EASY')}`, comp(B, id), comp(A, id),
      `${dsum(B, id, ['C23'])}→${dsum(A, id, ['C23'])}`, `${dsum(B, id, ['C05', 'C05b'])}→${dsum(A, id, ['C05', 'C05b'])}`,
      `${dnum(B, id, 'D-05')}→${dnum(A, id, 'D-05')}`, `${dnum(B, id, 'D-06')}→${dnum(A, id, 'D-06')}`, `${dnum(B, id, 'D-07')}→${dnum(A, id, 'D-07')}`, `${f(B)}→${f(A)}`];
  }))}

Итого по 23 сценариям: LONG_EASY ${B.rows.filter(r => r.type === 'LONG_EASY').length}→${A.rows.filter(r => r.type === 'LONG_EASY').length}; находок ${B.findings.length}→${A.findings.length}; нарушений проверок ${B.scenarios.reduce((n, s) => n + s.checks.reduce((m, c) => m + c.violations, 0), 0)}→${A.scenarios.reduce((n, s) => n + s.checks.reduce((m, c) => m + c.violations, 0), 0)}.

## 2. WS-19: профили с дефицитным недельным бюджетом (синтетические зонды P1–P6, поведение A)

Зонды не входят в 23 сценария (сценарии и пороги детекторов не менялись); профили описаны в \`audit/deficitProfiles.ts\`. Формат недели: \`T18m\` — пороговая, \`V12m\` — VO2, \`S3\` — специфическая 3 км, \`C\` — контрольная, \`E\` — лёгкая, \`L\` — LONG_EASY (км).

${T(['Зонд', 'LONG_EASY д→п', 'EASY, км д→п', 'LONG_EASY, км д→п', 'Интенсивных в неделю (по неделям) до', 'после', 'Бюджет старт→конец, км (до)', 'Бюджет старт→конец, км (после)', 'C23 д→п', 'C05+C05b д→п', 'Находок д→п', 'Коды находок до', 'Коды находок после'],
  A.probes.map((a, i) => { const b = B.probes[i]!; const codes = (p: Probe) => Object.entries(p.findingCodes).map(([c, n]) => `${c}×${n}`).join(', ') || '—';
    return [a.id, `${b.counts.LONG_EASY}→${a.counts.LONG_EASY}`, `${b.easyKm}→${a.easyKm}`, `${b.longKm}→${a.longKm}`, b.intensePerWeek.join(' '), a.intensePerWeek.join(' '), `${b.budgetStartKm}→${b.endBudgetKm}`, `${a.budgetStartKm}→${a.endBudgetKm}`,
      `${b.checks.C23}→${a.checks.C23}`, `${b.checks.C05! + b.checks.C05b!}→${a.checks.C05! + a.checks.C05b!}`, `${b.findings}→${a.findings}`, codes(b), codes(a)]; }))}

Состав интенсивных (счётчики за 12 недель):

${T(['Зонд', 'T д→п', 'V д→п', 'S3 д→п', 'C д→п', 'EASY д→п'], A.probes.map((a, i) => { const b = B.probes[i]!; const c = (t: string) => `${b.counts[t]}→${a.counts[t]}`; return [a.id, c('THRESHOLD'), c('VO2'), c('SPECIFIC_3K'), c('CONTROL'), c('EASY')]; }))}

### Недели зонда P1 (18 км, самый длинный бег 7 км, 4 бега, 3 км за 12:30)

До:
\`\`\`
${B.probes[0]!.weeksText.join('\n')}
\`\`\`
После:
\`\`\`
${A.probes[0]!.weeksText.join('\n')}
\`\`\`
`;
writeFileSync(outFile, md);
