/** Cycle-level analysis of what was planned/executed: weekly load table and plausibility checks. */
import type {CycleResult} from './cycle.ts';
import {EASY_TYPES, addDaysIso} from './invariants.ts';
import type {Session} from './driver.ts';

export interface WeeklyRow {
  week: number; from: string; to: string;
  sessions: number; recorded: number; skipped: number; plannedOnly: number;
  easy: number; quality: number;
  warmup_min: number; main_min: number; main_m: number; cooldown_min: number; interval_recovery_min: number;
  reserved_m: number | null;
}

export function weeklyTable(r: CycleResult, startDate: string, weeks: number): WeeklyRow[] {
  const rows: WeeklyRow[] = [];
  const entries = [...r.ledger.values()].filter((e) => e.w.type !== 'REST');
  for (let k = 0; k < weeks; k += 1) {
    const from = addDaysIso(startDate, k * 7); const to = addDaysIso(startDate, k * 7 + 6);
    const es = entries.filter((e) => e.w.scheduledDate >= from && e.w.scheduledDate <= to);
    const reservedAll = es.every((e) => e.reserved !== null);
    rows.push({
      week: k + 1, from, to, sessions: es.length,
      recorded: es.filter((e) => e.disposition === 'RECORDED').length,
      skipped: es.filter((e) => e.disposition === 'SKIPPED').length,
      plannedOnly: es.filter((e) => e.disposition === 'PLANNED').length,
      easy: es.filter((e) => EASY_TYPES.has(e.w.type)).length,
      quality: es.filter((e) => e.w.countsAsQuality).length,
      warmup_min: es.reduce((a, e) => a + e.w.warmupMinutes, 0),
      main_min: es.reduce((a, e) => a + (e.w.main.dose.unit === 'MINUTES' ? e.w.main.dose.value : 0), 0),
      main_m: Math.round(es.reduce((a, e) => a + (e.w.main.dose.unit === 'METERS' ? e.w.main.dose.value : 0), 0)),
      cooldown_min: es.reduce((a, e) => a + e.w.cooldownMinutes, 0),
      interval_recovery_min: Math.round(es.reduce((a, e) => a + (e.w.main.mode === 'INTERVALS' ? Math.max(0, e.w.main.repeats - 1) * e.w.restSeconds / 60 : 0), 0) * 10) / 10,
      reserved_m: reservedAll ? Math.round(es.reduce((a, e) => a + (e.reserved ?? 0), 0)) : null,
    });
  }
  return rows;
}

/** Plausibility checks of the whole plan. Thresholds are fixed here BEFORE looking at results. */
export function cycleChecks(s: Session, r: CycleResult, weekly: WeeklyRow[], raceDate: string): void {
  const sessions = weekly.reduce((a, w) => a + w.sessions, 0);
  const easy = weekly.reduce((a, w) => a + w.easy, 0);
  const quality = weekly.reduce((a, w) => a + w.quality, 0);
  s.verify('PLAUSIBLE_EASY_SHARE', 'Доля лёгких пробежек (EASY/LONG_EASY/STRIDES) не ниже 50% всех назначений цикла', sessions === 0 || easy / sessions >= 0.5, `лёгких ${easy} из ${sessions} (${sessions ? Math.round(100 * easy / sessions) : 0}%)`, raceDate);
  s.verify('PLAUSIBLE_QUALITY_SHARE', 'Доля качественных занятий не выше 40% назначений цикла', sessions === 0 || quality / sessions <= 0.4, `quality ${quality} из ${sessions} (${sessions ? Math.round(100 * quality / sessions) : 0}%)`, raceDate);
  const full = weekly.filter((w) => w.reserved_m !== null && w.to < raceDate);
  // taper: the last 7 calendar days before the race must not carry more planned load than the peak week
  const peak = Math.max(0, ...full.map((w) => w.reserved_m ?? 0));
  const lastDays = [...r.ledger.values()].filter((e) => e.w.type !== 'REST' && e.w.scheduledDate >= addDaysIso(raceDate, -7) && e.w.scheduledDate < raceDate);
  const lastReserved = lastDays.reduce((a, e) => a + (e.reserved ?? 0), 0);
  s.verify('TAPER_LAST_7_DAYS_NOT_ABOVE_PEAK', 'Последние 7 дней перед стартом несут не больше плановой нагрузки, чем пиковая неделя', lastReserved <= peak + 1, `последние 7 дней: ${Math.round(lastReserved)} м; пик недели: ${Math.round(peak)} м`, raceDate);
  // abrupt growth: calendar week vs the maximum of the previous two calendar weeks (informational threshold 25%)
  for (let i = 2; i < full.length; i += 1) {
    const prev = Math.max(full[i - 1]!.reserved_m ?? 0, full[i - 2]!.reserved_m ?? 0);
    const cur = full[i]!.reserved_m ?? 0;
    if (prev > 0) s.verify('NO_ABRUPT_WEEKLY_VOLUME_JUMP', `Неделя ${full[i]!.week}: плановая нагрузка не выросла более чем на 25% к двум предыдущим неделям`, cur <= prev * 1.25 + 1, `неделя ${full[i]!.week}: ${cur} м против ${prev} м (${Math.round(100 * (cur / prev - 1))}%)`, full[i]!.from);
  }
  const startSess = weekly.slice(0, 1)[0];
  void startSess;
}
