/**
 * Analysis layer of the 12-week audit: weekly tables and methodology checks.
 *
 * The checks below are a REVIEWER'S heuristics, not engine rules. Every threshold is declared in THRESHOLDS and printed
 * in the report so a coach can dispute it. A finding is a question for the methodology owner, not a proven injury risk.
 */
import type {ScenarioRun, WorkoutRow} from './fullCycle12w.ts';
import {secondsText} from './fullCycle12w.ts';

export const THRESHOLDS = {
  weeklyJumpRatio: 1.10, weeklyJumpMinKm: 1.5, weeklyJumpBigRatio: 1.30, weeklyJumpBigKm: 3,
  simultaneousKmRatio: 1.10, simultaneousQualityRatio: 1.15,
  easyMaxRelSpeed: 0.80, easyMinRelSpeed: 0.55,
  thresholdBand: [0.85, 0.95] as const, vo2Band: [0.95, 1.05] as const,
  qualityGapDays: 2, maxQualityIn7Days: 2,
  flatGrowthRatio: 1.05, restToWorkMin: 0.5, longRunShareMax: 0.5,
  taperMaxShareOfPeak: 0.85, taperMinShareOfPeak: 0.30,
} as const;

export type Severity = 'CRITICAL' | 'METHODOLOGICAL' | 'MINOR';
export interface Finding {
  code: string; severity: Severity; scenarioId: string; week: number; date: string;
  workout: string; expected: string; actual: string; why: string; recommendation: string;
}
export interface WeekSummary {
  scenarioId: string; week: number;
  plannedKm: number; actualKm: number; runs: number; runsDone: number; skipped: number; quality: number; qualityDone: number; restDays: number; controls: number; controlWeek: boolean;
  types: string; paces: string; loadChange: string; phase: string; gate: string; holdDays: number; approvedKm: number | null;
}

const km = (m: number): number => Math.round(m / 100) / 10;
const paceRange = (r: WorkoutRow): string => r.paceFast === null || r.paceSlow === null ? '' : `${secondsText(r.paceFast)}–${secondsText(r.paceSlow)}`;
const shortType: Record<string, string> = {EASY: 'E', LONG_EASY: 'L', STRIDES: 'ST', INTRO_QUALITY: 'IQ', THRESHOLD: 'T', VO2: 'V', SPECIFIC_3K: 'S3', CONTROL: 'C', REST: 'R'};
const isQuality = (r: WorkoutRow): boolean => r.countsAsQuality;

export function weeklySummary(run: ScenarioRun): WeekSummary[] {
  const out: WeekSummary[] = [];
  for (let week = 1; week <= 12; week++) {
    const rows = run.rows.filter(r => r.week === week);
    const running = rows.filter(r => r.type !== 'REST');
    const days = run.days.filter(d => d.week === week);
    const plannedKm = km(running.reduce((n, r) => n + r.estMetersTotal, 0));
    const actualKm = km(running.reduce((n, r) => n + r.actualEstMeters, 0));
    const paceSet = new Map<string, string>();
    for (const r of running) { const p = paceRange(r); if (p !== '' && !paceSet.has(r.type)) paceSet.set(r.type, p); }
    const phases = [...new Set(days.map(d => d.phase))];
    out.push({
      scenarioId: run.scenario.id, week, plannedKm, actualKm, runs: running.length,
      runsDone: running.filter(r => r.outcome !== 'SKIPPED' && r.outcome !== 'DISPLACED_BY_CONTROL').length,
      skipped: running.filter(r => r.outcome === 'SKIPPED' || r.outcome === 'DISPLACED_BY_CONTROL').length,
      quality: running.filter(isQuality).length, qualityDone: running.filter(r => isQuality(r) && r.outcome !== 'SKIPPED' && r.outcome !== 'DISPLACED_BY_CONTROL').length,
      restDays: rows.filter(r => r.type === 'REST').length, controls: running.filter(r => r.type === 'CONTROL').length, controlWeek: running.some(r => r.type === 'CONTROL' || r.outcome === 'DISPLACED_BY_CONTROL' || r.outcome === 'CONTROL'),
      types: running.map(r => shortType[r.type] ?? r.type).join(' '),
      paces: [...paceSet].map(([t, p]) => `${shortType[t] ?? t} ${p}`).join('; ') || '—',
      loadChange: '', phase: phases.join('→'), gate: days.at(-1)?.gate ?? '', holdDays: days.filter(d => d.hold).length,
      approvedKm: days[0]?.approvedWeekMeters === null || days[0]?.approvedWeekMeters === undefined ? null : km(days[0].approvedWeekMeters),
    });
  }
  // load change text, from the PLAN (planned km of scheduled sessions), plus dose changes by type
  for (let i = 0; i < out.length; i++) {
    const cur = out[i]!; const prev = out[i - 1];
    const parts: string[] = [];
    if (prev) {
      if (prev.plannedKm > 0) { const d = Math.round((cur.plannedKm / prev.plannedKm - 1) * 100); parts.push(`объём ${d >= 0 ? '+' : ''}${d}%`); }
      else parts.push(`объём ${cur.plannedKm} км после 0`);
    }
    const dosesNow = doseByType(run.rows.filter(r => r.week === cur.week));
    const dosesPrev = prev ? doseByType(run.rows.filter(r => r.week === prev.week)) : new Map<string, string>();
    for (const [t, d] of dosesNow) { const was = dosesPrev.get(t); if (was !== undefined && was !== d) parts.push(`${shortType[t] ?? t}: ${was}→${d}`); }
    if (cur.holdDays > 0) parts.push(`пауза-hold ${cur.holdDays} дн.`);
    cur.loadChange = parts.join('; ') || '—';
  }
  return out;
}
function doseByType(rows: WorkoutRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) if (r.type !== 'REST' && !m.has(r.type)) m.set(r.type, r.doseUnit === 'METERS' ? `${Math.round(r.doseValue)} м` : `${r.doseValue} мин`);
  return m;
}

// ------------------------------------------------------------------------------------------------ checks
export interface CheckCounter {code: string; label: string; examined: number; violations: number}
export interface Analysis {scenarioId: string; findings: Finding[]; checks: CheckCounter[]; weekly: WeekSummary[]}

function mk(run: ScenarioRun, r: WorkoutRow | null, f: Omit<Finding, 'scenarioId' | 'week' | 'date' | 'workout'> & {week?: number; date?: string; workout?: string}): Finding {
  return {scenarioId: run.scenario.id, week: f.week ?? r?.week ?? 0, date: f.date ?? r?.date ?? '', workout: f.workout ?? (r ? describe(r) : '—'),
    code: f.code, severity: f.severity, expected: f.expected, actual: f.actual, why: f.why, recommendation: f.recommendation};
}
export function describe(r: WorkoutRow): string {
  const dose = r.doseUnit === 'METERS' ? `${Math.round(r.doseValue)} м` : `${r.doseValue} мин`;
  const iv = r.mode === 'INTERVALS' ? ` ${r.repeats}×${r.repeatMeters ?? (r.perRepeatSeconds === null ? '?' : secondsText(r.perRepeatSeconds))}` : '';
  const pace = paceRange(r);
  return `${r.date} ${r.type} ${dose}${iv}${pace ? ` @${pace}` : ''}`;
}

export function analyze(run: ScenarioRun): Analysis {
  const T = THRESHOLDS;
  const findings: Finding[] = []; const counters = new Map<string, CheckCounter>();
  const count = (code: string, label: string, violated: boolean): void => {
    const c = counters.get(code) ?? {code, label, examined: 0, violations: 0}; c.examined++; if (violated) c.violations++; counters.set(code, c);
  };
  const weekly = weeklySummary(run);
  const rows = run.rows; const running = rows.filter(r => r.type !== 'REST');
  const user = run.scenario.user; const behaviour = run.scenario.behaviour;
  const perf0 = user.currentSeconds;

  // ---- C01 weekly volume jump (planned km of scheduled sessions)
  for (let i = 1; i < 11; i++) { // weeks 2..11 (12th is the taper week by design)
    const prev = weekly[i - 1]!; const cur = weekly[i]!;
    if (prev.plannedKm < 2 || prev.restDays > 0 || prev.controlWeek || cur.controlWeek) continue;
    const jump = cur.plannedKm > prev.plannedKm * T.weeklyJumpRatio && cur.plannedKm - prev.plannedKm >= T.weeklyJumpMinKm;
    count('C01', 'Недельный план км не растёт скачком (> +10 % и ≥ 1,5 км)', jump);
    if (jump) {
      const big = cur.plannedKm > prev.plannedKm * T.weeklyJumpBigRatio && cur.plannedKm - prev.plannedKm >= T.weeklyJumpBigKm;
      findings.push(mk(run, null, {code: 'WEEKLY_VOLUME_JUMP', severity: big ? 'METHODOLOGICAL' : 'MINOR', week: cur.week, date: rows.find(r => r.week === cur.week)?.date ?? '', workout: `неделя ${cur.week}: ${cur.plannedKm} км против ${prev.plannedKm} км`,
        expected: 'Рост недельного километража не более ~10 % за неделю (эвристика рецензента).', actual: `${prev.plannedKm} → ${cur.plannedKm} км (${Math.round((cur.plannedKm / prev.plannedKm - 1) * 100)} %). Оценка по назначенным занятиям недели.`,
        why: 'Резкий рост объёма — типичная причина перегрузки; важно, насколько он объясним (возврат после паузы или пропуска, контрольный забег, сужение недели).',
        recommendation: 'Для возврата после паузы/снятия hold использовать постепенный подъём (как RE_ENTRY), а не мгновенное восстановление полного объёма.'}));
    }
  }

  // ---- C02 volume and intensity grow together
  for (let i = 1; i < 11; i++) {
    const cur = weekly[i]!; const prev = weekly[i - 1]!;
    const q = (w: number): number => running.filter(r => r.week === w && isQuality(r) && r.type !== 'CONTROL').reduce((n, r) => n + r.estMetersMain, 0);
    if (prev.plannedKm < 2 || q(prev.week) === 0 || prev.controlWeek || cur.controlWeek) continue;
    const both = cur.plannedKm > prev.plannedKm * T.simultaneousKmRatio && q(cur.week) > q(prev.week) * T.simultaneousQualityRatio;
    count('C02', 'Объём и интенсивная часть не растут в одну и ту же неделю', both);
    if (both) findings.push(mk(run, null, {code: 'VOLUME_AND_INTENSITY_RISE_TOGETHER', severity: 'METHODOLOGICAL', week: cur.week, date: rows.find(r => r.week === cur.week)?.date ?? '', workout: `неделя ${cur.week}`,
      expected: 'Не повышать одновременно недельный км (> +10 %) и объём интенсивной работы (> +15 %).', actual: `км ${prev.plannedKm}→${cur.plannedKm}; интенсивная часть ${km(q(prev.week))}→${km(q(cur.week))} км`,
      why: 'Одновременный рост двух стрессоров повышает риск перегрузки и мешает понять, что вызвало плохой отчёт.', recommendation: 'Разводить шаги прогрессии по неделям (шаг объёма или шаг качества).'}));
  }

  // ---- C03/C04 pace relative to the user's own 3000 m speed (only when the engine uses a result)
  for (const r of running) {
    if (r.relSpeedLow === null || r.relSpeedHigh === null) continue;
    let ok = true; let expected = '';
    if (r.type === 'EASY' || r.type === 'LONG_EASY') {
      ok = r.relSpeedHigh <= T.easyMaxRelSpeed && r.relSpeedLow >= T.easyMinRelSpeed; expected = `EASY ${T.easyMinRelSpeed}–${T.easyMaxRelSpeed} от скорости 3000 м`;
      count('C03', 'Темп EASY/LONG_EASY ≤ 80 % скорости 3000 м (и ≥ 55 %)', !ok);
    } else if (r.type === 'THRESHOLD') { ok = r.relSpeedLow >= T.thresholdBand[0] && r.relSpeedHigh <= T.thresholdBand[1]; expected = `THRESHOLD ${T.thresholdBand[0]}–${T.thresholdBand[1]}`; count('C04', 'Темп THRESHOLD 85–95 %, VO2 95–105 % скорости 3000 м', !ok); }
    else if (r.type === 'VO2') { ok = r.relSpeedLow >= T.vo2Band[0] && r.relSpeedHigh <= T.vo2Band[1]; expected = `VO2 ${T.vo2Band[0]}–${T.vo2Band[1]}`; count('C04', 'Темп THRESHOLD 85–95 %, VO2 95–105 % скорости 3000 м', !ok); }
    else continue;
    if (!ok) findings.push(mk(run, r, {code: 'PACE_OUT_OF_BAND', severity: 'METHODOLOGICAL', expected, actual: `${Math.round(r.relSpeedLow * 100)}–${Math.round(r.relSpeedHigh * 100)} % скорости 3000 м (${paceRange(r)} /км)`,
      why: `Темп назначен вне диапазона, типичного для этого типа тренировки относительно результата бегуна.${run.scenario.behaviour === 'B' ? ' Контекст: сценарий Б — перед этим синтетический отчёт «темп медленнее назначенного»; движок снижает лёгкий темп в ответ на него.' : ''}`, recommendation: 'Пересмотреть доли скорости для этого типа и уровня.'}));
  }

  // ---- C05 hard sessions spacing
  const quality = running.filter(isQuality);
  for (let i = 1; i < quality.length; i++) {
    const gap = (Date.parse(quality[i]!.date) - Date.parse(quality[i - 1]!.date)) / 86400000;
    const bad = gap < T.qualityGapDays;
    count('C05', 'Между интенсивными (качество + контроль) ≥ 48 ч', bad);
    if (bad) findings.push(mk(run, quality[i]!, {code: 'HARD_SESSIONS_TOO_CLOSE', severity: 'CRITICAL', expected: 'Интервал между интенсивными занятиями не менее 48 ч.', actual: `${quality[i - 1]!.type} ${quality[i - 1]!.date} → ${quality[i]!.type} ${quality[i]!.date}: ${gap} дн.`, why: 'Недостаточное восстановление между тяжёлыми занятиями.', recommendation: 'Усилить проверку интервала при планировании.'}));
  }
  for (const r of quality) {
    const inWindow = quality.filter(o => { const d = (Date.parse(r.date) - Date.parse(o.date)) / 86400000; return d >= 0 && d < 7; }).length;
    const bad = inWindow > T.maxQualityIn7Days;
    count('C05b', 'Не более 2 интенсивных занятий в скользящие 7 дней', bad);
    if (bad) findings.push(mk(run, r, {code: 'TOO_MANY_HARD_IN_WEEK', severity: 'CRITICAL', expected: '≤ 2 интенсивных за 7 дней.', actual: `${inWindow} интенсивных за 7 дней`, why: 'Избыточная плотность интенсивной работы.', recommendation: 'Ограничить на уровне планировщика.'}));
  }

  // ---- C06 numeric instructions (what the app shows)
  for (const r of running) {
    count('C06', 'У каждой беговой карточки есть числа, достаточные для самостоятельного выполнения (или обоснованное исключение)', r.numeric.gapClass === 'DEFICIT');
    if (r.numeric.gapClass === 'DEFICIT') findings.push(mk(run, r, {code: 'MISSING_NUMERIC_INSTRUCTION', severity: 'METHODOLOGICAL', expected: 'Дистанция/время, целевой темп мин/км, скорость дорожки, повторы, время отрезка и восстановление.', actual: `${r.numeric.gaps.join('; ')} — ${r.numeric.note}`, why: 'Без числового темпа пользователь не может самостоятельно выдержать назначение.', recommendation: 'Всегда показывать темп (хотя бы по консервативной оценке) либо явно объяснять, как его определить.'}));
  }
  for (const r of running) {
    if (r.numeric.gapClass === 'JUSTIFIED') count('C06b', 'Обоснованные исключения (калибровка, вводное качество, контроль) — учтены отдельно', false);
  }

  // ---- C07 reaction to a failed workout
  const failed = running.filter(r => r.evaluation === 'YELLOW' || r.evaluation === 'RED');
  for (const f of failed) {
    const idx = running.indexOf(f);
    const next = running.slice(idx + 1).find(r => r.type === f.type && (Date.parse(r.date) - Date.parse(f.date)) / 86400000 <= 21);
    if (!next) continue;
    const sameDose = next.doseValue >= f.doseValue * 0.999;
    const fastUpper = (r: WorkoutRow): number | null => r.speedKmhHigh;
    const samePace = fastUpper(f) === null || fastUpper(next) === null ? true : (fastUpper(next) as number) >= (fastUpper(f) as number) - 1e-9;
    const repeated = sameDose && samePace;
    count('C07', 'После неудачи следующее занятие того же типа облегчено (доза или темп)', repeated);
    if (repeated) findings.push(mk(run, next, {code: 'FAILED_TASK_REPEATED_UNCHANGED', severity: 'MINOR', week: next.week,
      expected: 'После YELLOW на этом типе — меньшая доза, более мягкий темп или явная причина повторить.', actual: `после ${f.outcome} ${f.type} ${f.date} (${f.evaluation}/${f.yellowReason}) следующее ${describe(next)} с той же дозой и темпом`,
      why: 'Прежнее задание, на котором человек не справился, назначается без изменений; при повторных неудачах это закрепляет неподходящую нагрузку.', recommendation: 'После неудачи по темпу/дистанции снижать дозу или смягчать темп для следующей попытки того же типа; не только блокировать прогрессию.'}));
  }

  // ---- C08 progression after success (A and S only) and "meaningless easy"
  const weeksUsed = weekly.slice(0, 10);
  if (behaviour === 'A' || behaviour === 'S') {
    const first = weeksUsed.slice(0, 3).reduce((n, w) => n + w.plannedKm, 0) / 3; const last = weeksUsed.slice(6, 10).reduce((n, w) => n + w.plannedKm, 0) / 4;
    const budgets = weeksUsed.map(w => w.approvedKm).filter((v): v is number => v !== null);
    const budgetGrowth = budgets.length >= 2 && (budgets[0] as number) > 0 ? (budgets.at(-1) as number) / (budgets[0] as number) : 1;
    // Flat only if BOTH the estimated plan km and the engine's own weekly budget fail to grow (control/hold weeks distort the estimate).
    const flatKm = last < first * T.flatGrowthRatio && budgetGrowth < T.flatGrowthRatio;
    count('C08', 'Успешные занятия приводят к росту недельного плана (недели 7–10 против 1–3 ≥ +5 %)', flatKm);
    if (flatKm) findings.push(mk(run, null, {code: 'NO_VOLUME_PROGRESSION', severity: 'METHODOLOGICAL', week: 10, date: '', workout: 'недели 1–3 против 7–10',
      expected: 'При полностью успешном выполнении недельный план растёт (хотя бы на 5 % за 10 недель).', actual: `${Math.round(first * 10) / 10} → ${Math.round(last * 10) / 10} км/нед (${Math.round((last / first - 1) * 100)} %); бюджет движка ${budgets[0]} → ${budgets.at(-1)} км (${Math.round((budgetGrowth - 1) * 100)} %)`,
      why: 'Успешные недели не приводят к разумной прогрессии объёма.', recommendation: 'Проверить условия шага (двухнедельный блок, полный набор подтверждённых занятий, контрольные).'}));
    // quality dose progression
    for (const type of ['THRESHOLD', 'VO2'] as const) {
      const list = running.filter(r => r.type === type && r.outcome === 'ON_PLAN');
      if (list.length < 3) continue;
      const grew = list.at(-1)!.doseValue > list[0]!.doseValue + 1e-9;
      count('C08b', 'Доза успешных THRESHOLD/VO2 растёт при повторных успехах', !grew);
      if (!grew) findings.push(mk(run, list.at(-1)!, {code: 'QUALITY_DOSE_NOT_PROGRESSING', severity: 'METHODOLOGICAL', week: list.at(-1)!.week,
        expected: `После ≥ 2 подряд успешных ${type} доза растёт (по описанию правил: шаг по типу).`, actual: `${list.length} успешных ${type}: ${list[0]!.doseValue} мин → ${list.at(-1)!.doseValue} мин за ${list.at(-1)!.week - list[0]!.week} нед.`,
        why: 'Качественная доза остаётся неизменной: стимул не растёт, хотя все занятия успешны.', recommendation: 'Выяснить, что сбрасывает серию успехов (ротация типов, контрольный забег сбрасывает счётчики) и учитывать накопленные успехи.'}));
    }
    // plan too easy: no overload vs habit and no quality
    const baseKm = user.weeklyKm;
    const avg = weeksUsed.slice(2, 10).reduce((n, w) => n + w.plannedKm, 0) / 8;
    const qualityWeeks = weeksUsed.slice(2, 10).filter(w => w.quality - w.controls > 0).length;
    const tooEasy = avg < baseKm * 0.9 && qualityWeeks <= 2;
    count('C09', 'План не становится бессмысленно лёгким (км недель 3–10 ≥ 90 % привычного или есть качество)', tooEasy);
    if (tooEasy) findings.push(mk(run, null, {code: 'PLAN_TOO_EASY', severity: 'METHODOLOGICAL', week: 6, date: '', workout: 'недели 3–10',
      expected: 'План поддерживает привычный объём и добавляет развивающую нагрузку.', actual: `средний план ${Math.round(avg * 10) / 10} км/нед при привычных ${baseKm} км; недель с качеством: ${qualityWeeks} из 8`,
      why: 'План не обеспечивает развития.', recommendation: 'Уточнить условия снятия ограничений для этого профиля.'}));
  }

  // ---- C10 missed sessions are accounted for (V)
  if (behaviour === 'V') {
    const skips = rows.filter(r => r.outcome === 'SKIPPED');
    for (const s of skips) {
      const nextWeek = weekly[Math.min(11, s.week)]!; const thisWeek = weekly[s.week - 1]!;
      if (nextWeek.controlWeek || thisWeek.controlWeek) continue;
      const increase = nextWeek.week <= 11 && thisWeek.plannedKm > 0 && nextWeek.plannedKm > thisWeek.plannedKm * 1.05 && nextWeek.plannedKm - thisWeek.plannedKm >= 1;
      count('C10', 'После пропуска план следующей недели не повышается (нет компенсации)', increase);
      if (increase) findings.push(mk(run, s, {code: 'LOAD_UP_RIGHT_AFTER_SKIP', severity: 'MINOR', week: s.week,
        expected: 'После пропуска нагрузка не растёт.', actual: `неделя ${s.week} (пропуск ${s.type}): план ${thisWeek.plannedKm} км → неделя ${nextWeek.week}: ${nextWeek.plannedKm} км`, why: 'Недельный план вырос сразу после пропущенного занятия (по данным автоматически не определено, шаг ли это по двухнедельному блоку или возврат дозы).', recommendation: 'Проверить связь шага прогрессии с пропуском; пропуск не должен засчитываться как подтверждение.'}));
    }
    const keySkipped = skips.filter(r => ['SPECIFIC_3K', 'VO2', 'THRESHOLD', 'INTRO_QUALITY'].includes(r.type));
    count('C10b', 'Пропущенные ключевые занятия приходят на замену/учитываются (информационная проверка)', keySkipped.length > 0);
  }

  // ---- C11 safety hold: impact on preparation (not an error in itself)
  const holdDays = run.days.filter(d => d.hold).length; const restRows = rows.filter(r => r.type === 'REST').length;
  count('C11', 'Защитная пауза (hold) не отнимает значимую часть цикла (≤ 14 дней нулевого бега)', restRows > 14 * run.scenario.user.runsPerWeek / 7);
  if (holdDays > 0 && restRows > 0) findings.push(mk(run, null, {code: 'HOLD_REMOVES_TRAINING', severity: behaviour === 'B' && restRows >= 8 ? 'METHODOLOGICAL' : 'MINOR', week: rows.find(r => r.type === 'REST')?.week ?? 0, date: rows.find(r => r.type === 'REST')?.date ?? '', workout: `${restRows} дн. REST из ${run.days.length}`,
    expected: 'Защитное ограничение допустимо; оценивается его влияние на подготовку.', actual: `${restRows} назначенных REST-дней (дни hold: ${holdDays}); бег не назначался; причина: ${[...new Set(rows.filter(r => r.type === 'REST').map(r => r.reasons.filter(x => /RELATED|HEALTH|HOLD|STOP/.test(x)).join('+')))].join(' | ') || '—'}`,
    why: 'Две «связанные» жёлтые отметки (недобор дистанции/темпа без боли) приводят к полной паузе минимум на неделю, в том числе в тейпер-неделе.', recommendation: 'Различать неудачу по темпу/дистанции без симптомов и медицинский сигнал; оценивать влияние паузы на плановую подготовку.'}));

  // ---- C12 taper
  const peak = Math.max(...weekly.slice(0, 11).map(w => w.plannedKm)); const last = weekly[11]!;
  if (peak > 0 && (user.runsPerWeek >= 3 || peak >= 10)) {
    const share = last.plannedKm / peak;
    const bad = share > T.taperMaxShareOfPeak || (share < T.taperMinShareOfPeak && last.holdDays === 0);
    count('C12', 'Тейпер: объём последней недели 30–85 % от пикового', bad);
    if (bad) findings.push(mk(run, null, {code: 'TAPER_SHAPE', severity: 'MINOR', week: 12, date: rows.find(r => r.week === 12)?.date ?? '', workout: 'неделя 12',
      expected: 'Последняя неделя заметно легче пиковой, но не пустая.', actual: `${last.plannedKm} км при пике ${peak} км (${Math.round(share * 100)} %)`, why: share > T.taperMaxShareOfPeak ? 'Неделя старта по объёму почти не легче пиковой (сужение касается качества/дозы, но не объёма).' : 'Неделя старта почти пустая: форма может просесть.', recommendation: 'Сверить форму недели старта с замыслом тейпера (5/7/10 дней по ёмкости).'}));
  }

  // ---- C13 representation consistency + interval arithmetic
  for (const r of running) {
    if (r.paceFast !== null && r.speedKmhLow !== null && r.speedKmhHigh !== null) {
      const fromPace = 3600 / r.paceSlow!; const bad = Math.abs(fromPace - r.speedKmhLow) > 0.15;
      count('C13', 'Темп (с/км) и скорость (м/с) в назначении согласованы', bad);
      if (bad) findings.push(mk(run, r, {code: 'PACE_SPEED_MISMATCH', severity: 'MINOR', expected: 'Два представления диапазона совпадают.', actual: `${paceRange(r)} /км vs ${r.speedKmhLow}–${r.speedKmhHigh} км/ч`, why: 'Неоднозначное задание.', recommendation: 'Выводить из одного источника.'}));
    }
    if (r.mode === 'INTERVALS' && r.repeatMeters !== null) {
      const total = (r.repeats - 1) * r.repeatMeters + (r.finalRepeatMeters ?? r.repeatMeters); const bad = Math.abs(total - r.doseValue) > 1;
      count('C14', 'Повторы × длина отрезка = назначенная доза', bad);
      if (bad) findings.push(mk(run, r, {code: 'REPEAT_ARITHMETIC', severity: 'MINOR', expected: 'сумма повторов = доза', actual: `${total} м против ${r.doseValue} м`, why: 'Несогласованность в назначении.', recommendation: 'Исправить округление.'}));
    }
  }

  // ---- C15 interval structure plausibility (reviewer heuristic)
  for (const r of running) {
    if (r.mode !== 'INTERVALS' || r.type === 'STRIDES' || r.restSeconds === 0) continue;
    const work = r.perRepeatSeconds; if (work === null) continue;
    const ratio = r.restSeconds / work;
    const bad = work >= 180 && ratio < T.restToWorkMin;
    count('C15', 'Восстановление между повторами ≥ 50 % времени повтора, если повтор ≥ 3 мин', bad);
    if (bad) findings.push(mk(run, r, {code: 'SHORT_RECOVERY_FOR_LONG_REPEATS', severity: 'MINOR', expected: 'Для повторов ≥ 3 мин восстановление обычно не короче половины работы (оценка рецензента; требует подтверждения тренера).', actual: `повтор ≈ ${secondsText(work)}, отдых ${r.restSeconds} с (${Math.round(ratio * 100)} % от работы), темп ≈ 3000 м`,
      why: 'Фиксированные 90 с отдыха независимо от длины повтора.', recommendation: 'Связать восстановление с длиной повтора.'}));
  }

  // ---- C16 checkpoint screen vs engine (DEF-002 class)
  const refused = run.engineErrors.filter(e => /контрольный/.test(e.detail)).length;
  count('C16', 'Экран «нужен контрольный результат» совпадает с тем, что движок принимает', refused > 0);
  if (refused > 0) {
    const first = run.events.find(e => e.kind === 'CONTROL_REFUSED')!;
    findings.push(mk(run, null, {code: 'CHECKPOINT_REQUIRED_BUT_REFUSED', severity: 'CRITICAL', week: first.week, date: first.date, workout: `${refused} дн. подряд`,
      expected: 'Пользователь, который ещё не может пробежать 3000 м подряд, не получает обязательного контрольного результата.', actual: `Состояние «Нужен контрольный результат» показывалось ${refused} дн.; движок отвечал CHECKPOINT_NOT_PERMITTED; сессии замещались экраном`,
      why: 'Тупик: приложение требует действие, которое запрещено движком; экран «Сегодня» скрывает карточку тренировки.', recommendation: 'Не выставлять checkpointRequired при canRun3Km=false (то же, что DEF-002 из QA Issue #23 — исправление есть в отдельной ветке, в эту ветку не слито).'}));
  }
  const displaced = rows.filter(r => r.outcome === 'DISPLACED_BY_CONTROL').length;
  if (displaced > 0 && refused === 0) {
    findings.push(mk(run, rows.find(r => r.outcome === 'DISPLACED_BY_CONTROL')!, {code: 'CONTROL_DISPLACES_SESSION', severity: 'MINOR', expected: 'Контрольный забег — часть плана и не стирает другую тренировку.', actual: `${displaced} назначенных занятий вытеснены экраном контрольного результата и закрыты как «не выполнено»`, why: 'Экран «Нужен контрольный результат» показывается вместо карточки дня (deriveToday). Если слота CONTROL в плане нет (в сценариях без качества, Q0), контроль вытесняет лёгкое занятие; вытесненное занятие не подтверждено, а двухнедельный шаг объёма требует подтверждённых занятий в каждой неделе блока (reviewEasyProgression).', recommendation: 'Заранее назначать контроль как отдельный слот (с зачётом недели), а не вытеснять им занятие как пропуск.'}));
  }

  // ---- C17 engine acceptance of synthetic results
  const rejected = run.engineErrors.filter(e => !/контрольный/.test(e.detail)).length;
  count('C17', 'Движок принимает отчёты о назначенных занятиях без отказов', rejected > 0);
  if (rejected > 0) findings.push(mk(run, null, {code: 'ENGINE_REJECTED_RESULT', severity: 'CRITICAL', expected: 'Отчёт по назначенному занятию принимается.', actual: JSON.stringify(run.engineErrors.filter(e => !/контрольный/.test(e.detail)).slice(0, 3)), why: 'Назначение, которое нельзя закрыть.', recommendation: 'Разобрать.'}));

  // ---- C18 return to full load right after a safety hold (hold is not a break: no graded return)
  for (let i = 1; i < 11; i++) {
    const prev = weekly[i - 1]!; const cur = weekly[i]!;
    if (prev.restDays < 2 || cur.restDays > 0) continue;
    let ref = 0; for (let j = i - 2; j >= 0; j--) if (weekly[j]!.restDays === 0) { ref = weekly[j]!.plannedKm; break; }
    if (ref === 0) continue;
    const back = cur.plannedKm >= ref * 0.9;
    count('C18', 'После недели паузы (hold) объём возвращается постепенно, а не сразу к 90 % и выше прежнего', back);
    if (back) findings.push(mk(run, null, {code: 'RETURN_TO_FULL_LOAD_AFTER_HOLD', severity: prev.restDays >= 4 ? 'METHODOLOGICAL' : 'MINOR', week: cur.week, date: rows.find(r => r.week === cur.week)?.date ?? '', workout: `неделя ${cur.week} после ${prev.restDays} REST-дней`,
      expected: 'После паузы нескольких дней — облегчённое возвращение (как после перерыва), а не мгновенный возврат к полному плану.', actual: `недель назад до паузы ${ref} км → первая неделя после hold ${cur.plannedKm} км (${Math.round(cur.plannedKm / ref * 100)} %), интенсивных ${cur.quality}`,
      why: 'Hold из-за «связанных» жёлтых не считается перерывом, поэтому RE_ENTRY не включается; после ≥ 4 дней без бега план сразу возвращает полный объём и качество.', recommendation: 'Включать облегчённое возвращение и после hold ≥ 4–7 дней.'}));
  }

  // ---- C19 long run
  if (user.longestKm >= 3) {
    const maxRun = Math.max(0, ...running.filter(r => (r.type === 'EASY' || r.type === 'LONG_EASY') && r.doseUnit === 'METERS').map(r => r.doseValue)) / 1000;
    const longCount = running.filter(r => r.type === 'LONG_EASY').length;
    const bad = longCount === 0 && maxRun < user.longestKm * 0.8;
    count('C19', 'Самая длинная беговая тренировка плана ≥ 80 % привычной длинной (LONG_EASY назначается)', bad);
    if (bad && (behaviour === 'A' || behaviour === 'S')) findings.push(mk(run, null, {code: 'LONG_RUN_NEVER_PRESCRIBED', severity: 'METHODOLOGICAL', week: 1, date: rows[0]?.date ?? '', workout: `LONG_EASY за 12 недель: 0 раз`,
      expected: `Недельный план содержит длинную лёгкую пробежку порядка привычной (${user.longestKm} км) — для этого в движке есть тип LONG_EASY.`, actual: `LONG_EASY не назначался ни разу; самый длинный бег плана ${Math.round(maxRun * 10) / 10} км при привычных ${user.longestKm} км (${Math.round(maxRun / user.longestKm * 100)} %)`,
      why: 'Длинная пробежка превращается в обычную EASY из-за недельного лимита (резерв под качество вычитается из бюджета), то есть самый длинный бег плана короче привычного.', recommendation: 'Либо резервировать место под длинную, либо явно заявить, что длинной не будет, и не использовать longestUsualRunKm как обещание.'}));
  }

  // ---- C20 frequency never progresses although more days are available
  if ((behaviour === 'A' || behaviour === 'S') && user.availableRunsPerWeek > user.runsPerWeek) {
    const perWeek = weekly.slice(0, 11).map(w => w.runs);
    const constant = perWeek.every(n => n === perWeek[0]);
    count('C20', 'Число пробежек в неделю растёт, если пользователь доступен чаще, чем бегает', constant);
    if (constant) findings.push(mk(run, null, {code: 'FREQUENCY_NEVER_PROGRESSES', severity: 'METHODOLOGICAL', week: 12, date: '', workout: `${perWeek[0]} пробеж./нед ${perWeek.length} недель`,
      expected: `При доступных ${user.availableRunsPerWeek} днях и успешном выполнении частота постепенно растёт.`, actual: `${perWeek[0]} пробежка(и) в неделю все ${perWeek.length} недель при доступных ${user.availableRunsPerWeek}`,
      why: 'Для новичка одна пробежка в неделю — главный ограничитель развития; в движке нет механизма повышения частоты (комментарий в коде: «требует отдельных доказательств»).', recommendation: 'Добавить проверяемое правило повышения частоты после стабильных недель.'}));
  }

  // ---- C21 every control run resets the progression counters
  const controlDays = run.events.filter(e => e.kind === 'EXTERNAL_3K_CONTROL');
  let resets = 0; const resetDetails: string[] = [];
  const rank: Record<string, number> = {CLOSED: 0, PARTIAL: 1, OPEN: 2};
  for (const e of controlDays) {
    const before = run.days.find(d => d.offset === e.offset); const after = run.days.find(d => d.offset === e.offset + 1);
    if (!before || !after) continue;
    const dropped = (rank[after.gate] ?? 0) < (rank[before.gate] ?? 0) || (before.phase === 'SPECIFIC' && after.phase !== 'SPECIFIC');
    count('C21', 'Контрольный забег не обнуляет накопленный прогресс (gate/phase)', dropped);
    if (dropped) { resets++; resetDetails.push(`${e.date}: ${before.phase}/${before.gate} → ${after.phase}/${after.gate}`); }
  }
  if (resets >= 2) findings.push(mk(run, null, {code: 'CONTROL_RESETS_PROGRESS', severity: 'METHODOLOGICAL', week: controlDays[0] ? controlDays[0].week : 0, date: controlDays[0]?.date ?? '', workout: `${resets} из ${controlDays.length} контрольных`,
    expected: 'Контрольный результат уточняет текущую форму, но не стирает накопленное подтверждение выполненных занятий.', actual: resetDetails.join('; '),
    why: 'recordCheckpoint обнуляет счётчики успешных качественных занятий и серии успехов; при контроле раз в 21 день прогрессия качества и открытие целевого темпа каждый раз начинаются заново.', recommendation: 'Не сбрасывать счётчики при контроле, подтверждающем прежний результат.'}));

  // ---- C23 engine weekly budget: the engine's own reservations of every rolling seven days stay within the approved budget
  // (sessions that were actually planned and not removed by a skip or by the checkpoint screen). Uses the engine's `reservedMetres`.
  const booked = rows.filter(r => r.type !== 'REST' && r.outcome !== 'SKIPPED' && r.outcome !== 'DISPLACED_BY_CONTROL' && r.reservedMeters !== null && r.approvedWeekMeters !== null);
  for (const r of booked) {
    const total = booked.filter(o => o.offset <= r.offset && o.offset > r.offset - 7).reduce((n, o) => n + (o.reservedMeters ?? 0), 0);
    const over = total > (r.approvedWeekMeters ?? Infinity) + 1;
    count('C23', 'Недельный бюджет движка: резервы всех занятий за скользящие 7 дней ≤ утверждённого бюджета', over);
    if (over) findings.push(mk(run, r, {code: 'WEEKLY_BUDGET_EXCEEDED', severity: 'CRITICAL',
      expected: `Сумма резервов движка за 7 дней ≤ ${Math.round((r.approvedWeekMeters ?? 0) / 100) / 10} км`, actual: `${Math.round(total / 100) / 10} км за 7 дней, оканчивающихся ${r.date}`,
      why: 'Резерв превышает утверждённый недельный бюджет (защитный потолок).', recommendation: 'Недельный guard не должен пропускать такой план.'}));
  }

  // ---- C22 control cadence burden (information for the report)
  count('C22', 'Контрольный забег 3000 м не чаще чем раз в ~3 недели (информационно)', false);

  return {scenarioId: run.scenario.id, findings, checks: [...counters.values()], weekly};
}
