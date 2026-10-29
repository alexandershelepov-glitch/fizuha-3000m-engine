import {usesV4, v4ReservationBudget, v4ReservedMeters} from './methodologyV4.ts';
/**
 * Protective booking of a seven-day training budget. Reservation != measured kilometres.
 *
 * Distance sessions reserve the ordered metres. Timed quality sessions reserve enough *planning
 * space* for their prescribed work, warm-up, cooldown and interval recoveries using the athlete's
 * measured 3000m speed, a slower assumed easy/recovery pace, plus a 10% buffer.
 * Never record this estimate as an observed distance or as a 3000m result.
 *
 * Untimed distance-based RUN_WALK includes the known main distance; its low-intensity 5+5 min
 * walking is also tracked as time, not converted into pretend kilometres for untested beginners.
 * This conservative planning ceiling is a guardrail, not a physiological load model or guarantee.
 */
import type {EngineState,Workout} from './models.ts';
import {assessCapacity} from './assessment.ts';
import {day} from './validation.ts';

export function approvedWeekMeters(s: EngineState): number {
  if (usesV4(s)) return v4ReservationBudget(s);
  return s.easyProgression?.approvedMetersPer7Days ??
    (s.profile.actualRunsPerWeek > 0 && s.profile.averageWeeklyKm4Weeks > 0
      ? s.profile.averageWeeklyKm4Weeks * 1000 : 1000);
}

/** Exactly the minutes and pauses in the prescription, with no pace-based inference. */
export function scheduledMinutes(w: Workout): number {
  if (w.type === 'REST') return 0;
  const main = w.main.dose.unit === 'MINUTES' ? w.main.dose.value : 0;
  const recoveries = w.main.mode === 'INTERVALS' ?
    Math.max(0, w.main.repeats - 1) * w.restSeconds / 60 : 0;
  return main + w.warmupMinutes + w.cooldownMinutes + recoveries;
}

/** null: cannot make a defensible distance reservation from unmeasured effort. */
export function reservedMetres(s: EngineState, w: Workout): number | null {
  if (w.type === 'REST') return 0;
  if (w.protocol?.methodology === 'V4_8W_1430') return v4ReservedMeters(w);
  const knownMeters = w.main.dose.unit === 'METERS' ? w.main.dose.value : 0;
  // Run/walk warming and cooling remain actual *time*, not fabricated kilometres.
  if (w.main.mode === 'RUN_WALK') return knownMeters;
  const timed = scheduledMinutes(w);
  if (timed === 0) return knownMeters;
  const performance = s.profile.performance;
  if (performance === null || performance.timeSeconds <= 0) return null;
  const raceSpeed = 3000 / performance.timeSeconds;
  const upperMainSpeed = Math.max(raceSpeed, w.speedRangeMps?.[1] ?? 0);
  const mainSeconds = w.main.dose.unit === 'MINUTES' ? w.main.dose.value * 60 : 0;
  const warmAndCoolSeconds = (w.warmupMinutes + w.cooldownMinutes) * 60;
  const recoverySeconds = w.main.mode === 'INTERVALS' ? Math.max(0,w.main.repeats-1)*w.restSeconds : 0;
  // Protective planning-equivalent, NOT measured distance. Slower sections have explicit
  // conservative RELATIVE assumptions (65% of measured 3km pace for easy warm/cool, 50% for
  // walking recovery); a further 10% buffer applies to every timed section. There is no
  // physiological guarantee that a real athlete will follow these indicative speed envelopes.
  return knownMeters + 1.1 * (
    mainSeconds * upperMainSpeed +
    warmAndCoolSeconds * raceSpeed * .65 +
    recoverySeconds * raceSpeed * .5
  );
}

/** Compare all seven-day windows affected by the candidate's scheduled date. */
export function withinRollingWeekBudget(s: EngineState, workouts: readonly Workout[], changedDate?: string): boolean {
  const candidates = workouts.filter(w=>w.type!=='REST');
  const limits = approvedWeekMeters(s);
  const movedDay = changedDate === undefined ? null : day(changedDate);
  for(const end of candidates.map(w=>day(w.scheduledDate)).filter(end =>
    movedDay === null || (end>=movedDay && end<movedDay+7))){
    let total=0;
    for(const w of candidates){
      const d=day(w.scheduledDate);
      if(d<=end && d>end-7){
        const load=reservedMetres(s,w);
        if(load===null) return false;
        total+=load;
      }
    }
    if(total>limits+1e-6)return false;
  }
  return true;
}

/**
 * Weekly structure of a runner who has an established long run (12-week audit D-08).
 *
 * `long` is the LONG_EASY length and `other` the length of each remaining ordinary run, both derived only from the
 * runner's own questionnaire: the share of the habitual week that the longest usual run represents
 * (`longestUsualRunKm / averageWeeklyKm4Weeks`) is kept, applied to the currently APPROVED weekly budget. At the start of
 * a cycle `long` therefore equals the longest usual run exactly; it grows only when the approved budget grows (verified
 * progression), never because a long run was scheduled. `other` is what is left of the budget for the other runs of the
 * habitual week. The two numbers are a distribution of the existing budget, not an additional load.
 *
 * null = no LONG_EASY for this runner: capacity is not T2/T3 (the engine's own "trained" categories: >=3 runs, >=15 km
 * per week, longest run >=6 km), no timed 3 km result, fewer than three habitual runs, or the longest usual run is not
 * genuinely longer than an ordinary run of the habitual week (so it would be an ordinary EASY run under another name).
 */
export function longRunShares(s: EngineState): {long: number; other: number} | null {
  const p = s.profile;
  if (!p.canRun3Km || p.performance === null || p.longestUsualRunKm <= 0 || p.averageWeeklyKm4Weeks <= 0 || p.actualRunsPerWeek <= 0) return null;
  const capacity = assessCapacity(p);
  if (capacity !== 'T2' && capacity !== 'T3') return null;
  const runs = Math.min(p.availableRunsPerWeek, Math.max(1, p.actualRunsPerWeek));
  if (runs < 3) return null;
  const budget = approvedWeekMeters(s);
  const long = Math.max(p.longestUsualRunKm * budget / p.averageWeeklyKm4Weeks, p.longestUsualRunKm * 1000 * .65);
  if (!(long < budget)) return null;
  const other = (budget - long) / (runs - 1);
  // A long run is only meaningful when the existing weekly budget can also support
  // ordinary runs of at least 2 km. Otherwise the caller keeps an aerobic slot or drops it.
  if (other < 2000) return null;
  return long > other ? {long, other} : null;
}
