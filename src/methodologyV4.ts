/** Approved control example, not a general VDOT formula or an adaptation policy.
 * Source: Notion 4048cc66585181b4b5bbe1c53c87047d (2026-10-25).
 * Opt-in is persisted only at creation; legacy cycles are never silently migrated.
 */
import type {EngineState, Profile, Workout, WorkoutProtocol} from './models.ts';
import {addDays, day} from './validation.ts';

/**
 * The approved calendar window of methodology v4, and the single source of truth for it.
 *
 * The final 3000 m control is the third session of week eight, i.e. 53, 54 or 55 days after the
 * cycle start. Day 56 is already the first day of a ninth week, so an event on that date cannot be
 * served by this eight-week template. Every caller — enrollment at creation, the questionnaire
 * preview and the calendar — reads these constants. A second copy of the rule is what once let the
 * app suggest a date it would not enroll (default +56 vs. enrollment `<= 55`) and silently fall
 * back to the legacy plan.
 */
export const V4_LENGTH_MIN = 53;
export const V4_LENGTH_MAX = 55;
/** Preferred event date of the approved cycle: the last week of week eight. */
export const V4_RACE_OFFSET = 54;

/** Why the approved eight-week methodology cannot be prescribed. Stable, explainable codes. */
export type V4Blocker =
  | 'RESULT_REQUIRED' | 'RESULT_FUTURE' | 'RESULT_STALE' | 'RESULT_TIME' | 'RESULT_MISMATCH'
  | 'CANNOT_RUN_3KM' | 'QUALITY_NOT_TOLERATED'
  | 'BASE_WEEKS' | 'BASE_VOLUME' | 'BASE_LONG_RUN'
  | 'AVAILABILITY' | 'BREAK' | 'CYCLE_LENGTH' | 'SAFETY' | 'INVALID_DATES';

/** All unmet entry conditions at once, so the runner sees every reason instead of one at a time. */
export function v4Blockers(p: Profile, start: string): V4Blocker[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(p.raceDate)) return ['INVALID_DATES'];
  let length: number;
  try { length = day(p.raceDate) - day(start); } catch { return ['INVALID_DATES']; }
  const out: V4Blocker[] = [];
  if (!p.performance) out.push('RESULT_REQUIRED');
  else {
    const age = day(start) - day(p.performance.date);
    if (age < 0) out.push('RESULT_FUTURE');
    else if (age > 21) out.push('RESULT_STALE');
    if (p.performance.timeSeconds !== 870) out.push('RESULT_TIME');
  }
  if (!p.canRun3Km) out.push('CANNOT_RUN_3KM');
  if (p.qualitySessions8Weeks > 0 && !p.qualityMostlyTolerated) out.push('QUALITY_NOT_TOLERATED');
  if (p.regularRunningWeeks < 8) out.push('BASE_WEEKS');
  if (p.averageWeeklyKm4Weeks < 15) out.push('BASE_VOLUME');
  if (p.longestUsualRunKm < 6) out.push('BASE_LONG_RUN');
  if (p.actualRunsPerWeek !== 3 || p.availableRunsPerWeek !== 3) out.push('AVAILABILITY');
  if (p.performanceMismatch !== 'NONE') out.push('RESULT_MISMATCH');
  if (p.performance && p.breaks.some(b => day(b.endDate) >= day(p.performance!.date))) out.push('BREAK');
  if (length < V4_LENGTH_MIN || length > V4_LENGTH_MAX) out.push('CYCLE_LENGTH');
  return out;
}

export function eligibleForV4(p: Profile, start: string): boolean {
  return v4Blockers(p, start).length === 0;
}

/** The event date that keeps the approved eight-week plan applicable. */
export function suggestedRaceDate(start: string): string {
  return addDays(start, V4_RACE_OFFSET);
}

/** A changed measurement/date/base or adverse feedback returns to existing protective logic.
 * Safety itself is assessed by decide(); it is never waived by this enrollment.
 */
export function usesV4(s: EngineState): boolean {
  return s.methodology?.id === 'V4_8W_1430' &&
    s.methodology.performanceDate === s.profile.performance?.date &&
    s.methodology.raceDate === s.profile.raceDate && eligibleForV4(s.profile, s.cycleStartDate) &&
    !s.reentry && !s.diagnosticHold && !s.progressionBlocked && !s.relatedYellow &&
    !s.yellowEasyRequired && !s.reducedQualityUntilConfirmed &&
    s.pendingQualityFactor == null &&
    !s.history.some(h => h.classified.evaluation === 'YELLOW' || h.classified.evaluation === 'RED');
}

export function v4Week(s: EngineState, date: string): number {
  return Math.min(8, Math.floor((day(date) - day(s.cycleStartDate)) / 7) + 1);
}
const EASY: [number, number] = [365, 405];
const easyMeters = [4000, 4500, 4500, 5000, 5500, 5000, 4500, 3000];
const longMeters = [5500, 6000, 6500, 6000, 7000, 7500, 6000];
const work = [
  {type:'THRESHOLD', repeats:2, minutes:6, meters:0, seconds:0, restSeconds:150, restMeters:0},
  {type:'VO2', repeats:3, minutes:0, meters:600, seconds:173, restSeconds:180, restMeters:0},
  {type:'THRESHOLD', repeats:2, minutes:8, meters:0, seconds:0, restSeconds:180, restMeters:0},
  {type:'STRIDES', repeats:4, minutes:0, meters:150, seconds:41, restSeconds:0, restMeters:150},
  {type:'VO2', repeats:2, minutes:0, meters:800, seconds:231, restSeconds:180, restMeters:0},
  {type:'THRESHOLD', repeats:2, minutes:10, meters:0, seconds:0, restSeconds:180, restMeters:0},
  {type:'VO2', repeats:3, minutes:0, meters:400, seconds:116, restSeconds:0, restMeters:200},
  {type:'STRIDES', repeats:3, minutes:0, meters:150, seconds:41, restSeconds:0, restMeters:150},
] as const;

/** Stable role coordinates, independent of moving seven-day planning horizons. */
export function v4Coordinates(s: EngineState): {week:number; role:0|1|2; date:string}[] {
  return work.flatMap((_, i) => ([0,1,2] as const).map(role => ({week:i+1, role,
    date: i === 7 && role === 2 ? s.profile.raceDate : addDays(s.cycleStartDate, i*7 + [0,2,5][role]!)})));
}

export function v4Workout(s: EngineState, week: number, role: 0|1|2): Workout {
  const date = v4Coordinates(s).find(c => c.week === week && c.role === role)!.date;
  const final = week === 8 && role === 2;
  const quality = role === 0 || final;
  const spec = work[week-1]!;
  const protocol: WorkoutProtocol = {
    methodology: 'V4_8W_1430', week, role: final ? 'FINAL' : role === 0 ? 'QUALITY' : role === 1 ? 'EASY' : 'LONG',
    intensity: final ? 'CONTROL' : role !== 0 ? 'E' : spec.type === 'THRESHOLD' ? 'T' : spec.type === 'VO2' ? 'I' : 'R',
    easyPaceSecondsPerKm: [...EASY],
    warmupMeters: quality ? week === 8 && !final ? 1200 : 1500 : 0,
    dynamicMinutes: quality ? [3,5] : null,
    cooldownMeters: quality ? week === 8 && !final ? 600 : 800 : 0,
    recovery: role === 0 ? {dose: {unit: spec.restMeters ? 'METERS' : 'SECONDS', value:spec.restMeters || spec.restSeconds},
      mode: spec.type === 'STRIDES' ? 'JOG_OR_WALK_UNTIL_RECOVERED' : 'JOG', betweenOnly:true} : null,
    strides: role === 1 && [1,3,5,7].includes(week) ? {repeats:4, seconds:15, meters:null, insideDistance:true, minimumRecoverySeconds:75, fullRecovery:false}
      : final ? {repeats:3, seconds:null, meters:80, insideDistance:false, minimumRecoverySeconds:null, fullRecovery:true} : null,
    repeatSeconds: role === 0 && spec.seconds ? spec.seconds : null,
    firstLastKmEasy: role === 2 && !final,
    stage: week === 4 ? 'DELOAD' : week === 6 ? 'PEAK' : week >= 7 ? 'TAPER' : 'BUILD',
  };
  const pace: [number, number] | null = final ? null : role !== 0 ? [...EASY] :
    spec.type === 'THRESHOLD' ? [315,315] : [spec.seconds / spec.meters * 1000, spec.seconds / spec.meters * 1000];
  return {
    id: final ? `final-${date}` : `slot-${date}`, scheduledDate:date,
    type: final ? 'CONTROL' : role === 0 ? spec.type : role === 1 ? 'EASY' : 'LONG_EASY',
    goal: final ? 'ASSESS_CURRENT_PERFORMANCE' : quality ? 'QUALITY_ADAPTATION' : 'AEROBIC_BASE',
    priority:quality ? 1 : 2, countsAsQuality:quality,
    // Distance protocol is authoritative. These legacy time fields must never duplicate it.
    warmupMinutes:0, cooldownMinutes:0, protocol,
    main: {mode:role === 0 ? 'INTERVALS' : 'CONTINUOUS',
      dose: role === 0 ? {unit:spec.minutes ? 'MINUTES' : 'METERS', value:spec.repeats*(spec.minutes || spec.meters)} :
        {unit:'METERS', value:final ? 3000 : role === 1 ? easyMeters[week-1]! : longMeters[week-1]!},
      repeats:role === 0 ? spec.repeats : 1,
      repeatMeters:role === 0 && spec.meters ? spec.meters : null,
      finalRepeatMeters:role === 0 && spec.meters ? spec.meters : null},
    targetRpe:final ? [8,9] : role !== 0 ? [2,4] : spec.type === 'THRESHOLD' ? [6,7] : spec.type === 'VO2' ? [8,9] : [5,6],
    effortCues:quality ? [] : ['FULL_SENTENCES','CONTROLLED_BREATHING'],
    speedRangeMps:pace ? [1000/pace[1],1000/pace[0]] : null, paceRangeSecondsPerKm:pace,
    anchor:final ? 'NONE' : 'CURRENT', gateAtPrescription:s.decision.gate,
    restSeconds:role === 0 ? spec.restSeconds : 0, minimumRecoveryHoursBeforeQuality:quality ? 48 : 0,
    requiredFeedback:['completionFraction','sessionRpe','safety','durationMinutes','distanceMeters','repeats','restSeconds','conditions','unexpectedFatigue'],
    removable:!final, movable:!final, volumeFactor:1,
  };
}

/** Planning reservation only. Timed parts use a disclosed 6:05/km recovery bound
 * and a 10% buffer. Dynamics and unspecified full-rest distance are NOT invented.
 */
export function v4ReservedMeters(w: Workout): number {
  const p = w.protocol!;
  const main = w.main.dose.unit === 'METERS' ? w.main.dose.value : w.main.dose.value * 60 / 315 * 1000 * 1.1;
  const recovery = p.recovery ? (w.main.repeats-1) * (p.recovery.dose.unit === 'METERS'
    ? p.recovery.dose.value : p.recovery.dose.value / 365 * 1000 * 1.1) : 0;
  return p.warmupMeters + main + recovery + p.cooldownMeters +
    (p.strides && !p.strides.insideDistance ? p.strides.repeats * (p.strides.meters ?? 0) : 0);
}

/** A separate bounded prescription envelope, never a claim of verified progression.
 * Derived from the actual parts of the approved plan, not its approximate weekly totals.
 * Per-slot equality plus the existing rolling-window/move guards prevents extra dose.
 */
export function v4ReservationBudget(s: EngineState): number {
  const all = v4Coordinates(s).map(c => v4Workout(s,c.week,c.role));
  return Math.max(s.profile.averageWeeklyKm4Weeks*1000, ...all.map(w => all
    .filter(o => day(o.scheduledDate) <= day(w.scheduledDate) && day(o.scheduledDate) > day(w.scheduledDate)-7)
    .reduce((sum,o) => sum + v4ReservedMeters(o),0)));
}

/** Final protocol is an event prescription, never an ordinary queue slot or a result. */
export function finalRaceWorkout(s: EngineState): Workout | null {
  return usesV4(s) && s.decision.safety === 'OK' && !s.finalResultRecorded ? v4Workout(s,8,2) : null;
}

/** Existing quality-density protection, plus 48 h after the fixed long run.
 * Reject an unsafe move; never compensate it with a new dose or another session.
 */
export function v4RecoveryAllowed(workouts: readonly Workout[]): boolean {
  const runs = workouts.filter(w=>w.type!=='REST');
  if (new Set(runs.map(w=>w.scheduledDate)).size !== runs.length) return false;
  const quality = runs.filter(w=>w.countsAsQuality);
  for (const q of quality) {
    if (quality.filter(o=>day(o.scheduledDate)<=day(q.scheduledDate) && day(o.scheduledDate)>day(q.scheduledDate)-7).length > 1) return false;
    if (runs.some(o=>o.type==='LONG_EASY' && day(o.scheduledDate)<day(q.scheduledDate) && day(q.scheduledDate)-day(o.scheduledDate)<2)) return false;
  }
  return true;
}
