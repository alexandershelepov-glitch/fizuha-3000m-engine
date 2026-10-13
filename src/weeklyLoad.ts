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
import {day} from './validation.ts';

export function approvedWeekMeters(s: EngineState): number {
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
