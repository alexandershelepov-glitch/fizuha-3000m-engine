import {usesV4, v4Coordinates, v4Workout, v4RecoveryAllowed} from './methodologyV4.ts';
import type { Dose, EngineState, Workout, WorkoutType } from './models.ts';
import { decide } from './assessment.ts';
import { addDays, day } from './validation.ts';
import { EngineError } from './errors.ts';
import { RUN_WALK_STAGES, LAST_RUN_WALK_STAGE } from './runWalk.ts';
import {approvedWeekMeters,longRunShares,reservedMetres,withinRollingWeekBudget} from './weeklyLoad.ts';
import {adaptEasyFromRecentResult, beginnerEasyPace, calibratedBeginnerDose, initialEasyPace, refineAfterEasySuccesses} from './easyPace.ts';
const QUALITY: WorkoutType[] = ['INTRO_QUALITY', 'THRESHOLD', 'VO2', 'SPECIFIC_3K', 'CONTROL'];

/** Provisional conservative v1 ceilings for the 3000m module, not evidence of a
 * universally safe athletic dose. Never let an old saved dose bypass these limits. */
export function qualityDoseCeiling(s: EngineState, type: WorkoutType): number {
  const t=s.decision.capacity;
  switch(type){
    case 'INTRO_QUALITY': return t==='T3'?12:8;
    case 'THRESHOLD': return t==='T3'?25:t==='T2'?20:12;
    case 'VO2': return t==='T3'?18:t==='T2'?12:8;
    case 'SPECIFIC_3K': return t==='T3'?3000:t==='T2'?2400:1800;
    default: return Infinity;
  }
}

/** Simpler final-week protection: no long runs inside 7 days, no speed sessions
 * inside 3 days, and no ordinary training the day before the actual event. */
function taperSafe(type: WorkoutType,date:string,raceDate:string,factor:number):
  {type:WorkoutType;factor:number} {
  const remaining=day(raceDate)-day(date);
  if (remaining===1) return {type:'REST',factor:1};
  if (remaining<=3 && type!=='REST') return {type:'EASY',factor:Math.min(factor,.4)};
  if (remaining<=7 && (type==='LONG_EASY'||type==='CONTROL'))
    return {type:'EASY',factor:Math.min(factor,.6)};
  return {type,factor};
}
export function initialDose(s: EngineState, type: WorkoutType): Dose {
  const q = s.decision.quality;
  const upper = s.decision.capacity === 'T3';
  if (type === 'INTRO_QUALITY') return {unit: 'MINUTES', value: upper ? 8 : 4};
  if (type === 'THRESHOLD' && q === 'Q0') return {unit: 'MINUTES', value: s.doses.INTRO_QUALITY?.value ?? 4};
  if (type === 'THRESHOLD') return {unit: 'MINUTES', value: q === 'Q2' ? (upper ? 25 : 18) : 12};
  if (type === 'VO2') return {unit: 'MINUTES', value: q === 'Q2' ? (upper ? 18 : 12) : 8};
  if (type === 'SPECIFIC_3K') return {unit: 'METERS', value: q === 'Q2' ? (upper ? 3000 : 2400) : 1800};
  if (type === 'CONTROL') return {unit: 'METERS', value: 3000};
  if (type === 'REST') return {unit: 'MINUTES', value: 0};
  if (type === 'STRIDES') return {unit: 'METERS', value: 400};
  // Without a habitual running frequency there is no "ordinary easy" run: fall back to the
  // documented no-history minimum (1 km RUN_WALK) instead of dividing by a guard of 1, which
  // prescribed a single run equal to the athlete's entire weekly volume.
  const runsPerWeek = s.profile.actualRunsPerWeek;
  const approvedMeters = s.easyProgression?.approvedMetersPer7Days ??
    (s.profile.averageWeeklyKm4Weeks * 1000);
  // A zero-history starter has one introductory slot. Once repeated completion
  // earns a small approved increase, that single slot must actually grow.
  const ordinary = runsPerWeek > 0 ? approvedMeters / runsPerWeek : approvedMeters;
  // LONG_EASY: the habitual long-run share of the approved week (equals the longest usual run until the approved budget grows).
  const long = longRunShares(s)?.long ?? s.profile.longestUsualRunKm * 1000;
  return {unit: 'METERS', value: type === 'LONG_EASY' ? long : ordinary > 0 ? ordinary : 1000};
}
export function prescribe(s: EngineState, type: WorkoutType, date: string, id: string, factor = 1): Workout {
  const d = s.decision;
  if ((QUALITY.includes(type) && d.maximumQualityPerWeek === 0) || (d.phase === 'FOUNDATION' && ['VO2', 'SPECIFIC_3K'].includes(type))) throw new EngineError('WORKOUT_BLOCKED_BY_PHASE_OR_SAFETY');
  const dose = {...((s.reentry && QUALITY.includes(type) ? s.confirmedDoses[type] : s.doses[type]) ?? initialDose(s, type))};
  dose.value=Math.min(dose.value,qualityDoseCeiling(s,type))*factor;
  let range: [number, number] | null = null;
  let easyPace: ReturnType<typeof initialEasyPace> | null = null;
  let anchor: Workout['anchor'] = 'EFFORT';
  let rpe: [number, number] = type === 'EASY' || type === 'LONG_EASY' ? [2, 4] : [2, 3];
  if (type === 'THRESHOLD') { rpe = [6, 7]; if (d.currentSpeedMps) range = [d.currentSpeedMps * .90, d.currentSpeedMps * .94]; anchor = 'CURRENT'; }
  if (type === 'VO2') { rpe = [8, 9]; if (d.currentSpeedMps) range = [d.currentSpeedMps * .97, d.currentSpeedMps * 1.03]; anchor = 'CURRENT'; }
  if (type === 'SPECIFIC_3K') { rpe = [8, 9]; if (d.effectiveSpeedMps) range = [d.effectiveSpeedMps * .985, d.effectiveSpeedMps * 1.015]; anchor = d.gate === 'CLOSED' ? 'CURRENT' : 'EFFECTIVE'; }
  if (type === 'INTRO_QUALITY' || type === 'STRIDES') rpe = [5, 6];
  if (type === 'CONTROL') { rpe = [8, 9]; anchor = 'NONE'; }
  if (type === 'REST') { rpe = [0, 0]; anchor = 'NONE'; }
  let isEasyCalibration = false;
  if (type === 'EASY' || type === 'LONG_EASY') {
    const measured3Km = initialEasyPace(s.profile.performance?.timeSeconds ?? null,
      s.profile.canRun3Km, d.confidence, d.capacity);
    const beginner = beginnerEasyPace(s);
    const initial = measured3Km.paceRangeSecondsPerKm !== null ? measured3Km : beginner ?? measured3Km;
    if (s.profile.performance === null && s.profile.canRun3Km) {
      if (beginner === null) {
        // Two short, measured EASY runs teach the engine this runner's actual pace.
        // An introductory trial must not quietly inherit a 5+ km routine.
        isEasyCalibration = true;
        // A measured habitual volume >= 12 km/week already establishes a
        // regular running distance. Do NOT override that dose simply because
        // the user has not timed a full 3km. Likewise, confirmation of
        // continuous 3km from a zero-history RUN_WALK user is not erased.
        if (s.profile.averageWeeklyKm4Weeks > 0 &&
            s.profile.averageWeeklyKm4Weeks < 12) {
          dose.value = Math.min(dose.value,
            s.profile.averageWeeklyKm4Weeks >= 8 && s.profile.actualRunsPerWeek >= 2 ? 2000 : 1000);
        }
      } else dose.value = calibratedBeginnerDose(s, dose.value);
    }
    const adapted = adaptEasyFromRecentResult(s, dose.value, initial);
    dose.value = adapted.doseMeters;
    easyPace = refineAfterEasySuccesses(s, adapted.pace);
    if (easyPace !== adapted.pace) {
      // A speed progression and a distance progression must never be booked
      // on the same session. Keep the most recently completed measured EASY
      // distance as the cap for this one improvement.
      const recent = [...s.history].reverse().find(entry =>
        (entry.workout.type === 'EASY' || entry.workout.type === 'LONG_EASY') &&
        entry.workout.main.mode === 'CONTINUOUS' &&
        entry.result.feedbackConfirmed === true &&
        entry.result.completionFraction >= .95 &&
        entry.result.distanceMeters >= entry.workout.main.dose.value * .95);
      if (recent) dose.value = Math.min(dose.value, recent.workout.main.dose.value);
    }
    range = easyPace.speedRangeMps;
    // Current 3km and a directly measured EASY baseline are distinct anchors.
    if (range !== null) anchor = measured3Km.paceRangeSecondsPerKm !== null ? 'CURRENT' : 'EFFORT';
  }
  const interval = ['INTRO_QUALITY', 'VO2', 'SPECIFIC_3K', 'STRIDES'].includes(type);
  const repeatMeters = type === 'SPECIFIC_3K' ? 600 : type === 'STRIDES' ? 100 : null;
  const repeats = repeatMeters ? Math.ceil(dose.value / repeatMeters) : interval ? 4 : 1;
  const countsAsQuality = QUALITY.includes(type);
  const mode: Workout['main']['mode'] = type === 'REST' ? 'REST' :
    !s.profile.canRun3Km && !countsAsQuality ? 'RUN_WALK' : interval ? 'INTERVALS' : 'CONTINUOUS';
  const stage = Math.min(LAST_RUN_WALK_STAGE, s.runWalkProgression?.stage ?? 0);
  return {
    id, scheduledDate: date, type, goal: type === 'CONTROL' ? 'ASSESS_CURRENT_PERFORMANCE' : type === 'EASY' || type === 'LONG_EASY' ? 'AEROBIC_BASE' : type === 'REST' ? 'RECOVERY' : 'QUALITY_ADAPTATION', priority: countsAsQuality ? 1 : 2,
    countsAsQuality, warmupMinutes: countsAsQuality ? 10 : mode === 'RUN_WALK' ? 5 : 0, cooldownMinutes: countsAsQuality ? 10 : mode === 'RUN_WALK' ? 5 : 0,
    main: {mode, dose, repeats, repeatMeters, finalRepeatMeters: repeatMeters ? dose.value - repeatMeters * (repeats - 1) : null,
      ...(mode === 'RUN_WALK' ? {runWalk:{stage, ...RUN_WALK_STAGES[stage]!}} : {}),
      ...(isEasyCalibration && mode === 'CONTINUOUS' ? {calibration:true} : {})},
    targetRpe: rpe, effortCues: type === 'EASY' || type === 'LONG_EASY' ? ['FULL_SENTENCES', 'CONTROLLED_BREATHING'] : [], speedRangeMps: range, paceRangeSecondsPerKm: easyPace?.paceRangeSecondsPerKm ?? (range ? [1000 / range[1], 1000 / range[0]] : null),
    anchor, gateAtPrescription: d.gate, restSeconds: interval ? 90 : 0,
    minimumRecoveryHoursBeforeQuality: countsAsQuality ? 48 : 0,
    requiredFeedback: ['completionFraction', 'sessionRpe', 'safety', 'durationMinutes', 'distanceMeters', 'repeats', 'restSeconds', 'conditions', 'unexpectedFatigue'],
    removable: true, movable: true, volumeFactor: factor,
  };
}
/**
 * Which intense session a free quality slot receives.
 *
 * The rotation is derived from the schedule itself, never from a counter that a replan could restart: `previous` lists
 * the THRESHOLD / VO2 / SPECIFIC_3K sessions already completed, skipped, moved or planned before this slot, oldest first.
 * In phase SPECIFIC the sequence is SPECIFIC_3K, then THRESHOLD or VO2 (alternating by the number of completed T/V
 * sessions), then SPECIFIC_3K again. With two intense slots a week this gives "SPECIFIC_3K + THRESHOLD/VO2" every week,
 * as before; with one slot a week SPECIFIC_3K alternates with THRESHOLD and VO2 (12-week audit: SPECIFIC_3K was prescribed
 * every week because the first intense session of every window was always SPECIFIC_3K).
 */
function qualityType(s: EngineState, index: number, previous: readonly WorkoutType[] = []): WorkoutType {
  if (s.decision.phase === 'FOUNDATION') return 'INTRO_QUALITY';
  if (s.decision.phase === 'TAPER') return s.successfulSpecificPartial > 0 ? 'SPECIFIC_3K' : 'INTRO_QUALITY';
  if (s.decision.phase === 'SPECIFIC') {
    if (previous.at(-1) !== 'SPECIFIC_3K') return 'SPECIFIC_3K';
    return s.qualityRotation % 2 === 0 ? 'THRESHOLD' : 'VO2';
  }
  if (s.decision.quality === 'Q0') return s.successfulIntro >= 2 ? 'THRESHOLD' : 'INTRO_QUALITY';
  return (s.qualityRotation + index) % 2 === 0 ? 'THRESHOLD' : 'VO2';
}
/**
 * How many intense sessions a cycle week can hold together with a real long run, derived from state only (never from the day the
 * plan is rebuilt). Priority inside the weekly budget: the first intense session, then the long run, then a second intense session,
 * then the ordinary runs. Every 7-day window of the periodic week contains each slot once, so the week is feasible when the reserves of
 * its intense sessions leave the long run and the ordinary runs their shares of the approved budget (shares of the runner's own
 * habitual week, ordinary runs at least the engine's 1 km minimum) and the long run stays longer than the runner's habitual
 * ordinary run. The reserves are the k largest among the types the rotation can assign in the current phase (worst case over the
 * rotation, because rolling windows straddle two weeks), so the answer does not flip with the rotation. The first intense session is never removed here (existing guard rules apply to it).
 * Returns `maximumQualityPerWeek` unchanged when there is no long-run slot.
 */
export function weeklyIntenseCapacity(s: EngineState, date: string, runs: number): number {
  const decisionMax = s.decision.maximumQualityPerWeek;
  const shares = longRunShares(s);
  if (shares === null || runs < 3 || decisionMax < 2 || !['DEVELOPMENT', 'SPECIFIC'].includes(s.decision.phase)) return decisionMax;
  const budget = approvedWeekMeters(s);
  const meaningfulLong = Math.max(shares.long, s.profile.longestUsualRunKm * 1000 * .65);
  const reserve = (type: WorkoutType): number => reservedMetres(s, prescribe(s, type, date, 'capacity-probe', 1)) ?? Infinity;
  // Windows that straddle two cycle weeks can hold the intense session of one week next to the long run and the intense session of the
  // next week, whose types differ (rotation), so the worst case is the k largest reserves among all types the phase can assign.
  const pool: WorkoutType[] = s.decision.phase === 'SPECIFIC' ? ['THRESHOLD', 'VO2', 'SPECIFIC_3K'] : s.decision.quality === 'Q0' ? ['INTRO_QUALITY', 'THRESHOLD'] : ['THRESHOLD', 'VO2'];
  const pooled = pool.map(reserve).sort((a, b) => b - a);
  const reserveOf = (k: number): number => pooled.slice(0, k).reduce((a, b) => a + b, 0);
  for (let k = decisionMax; k >= 2; k--) {
    const room = budget - reserveOf(k);
    const easies = runs - 1 - k;
    if (room >= meaningfulLong + easies * 2000 && meaningfulLong > shares.other) return k;
  }
  return 1;
}
/**
 * Planning space for a 3000 m checkpoint that is due at the start of the next cycle week (first slot, where the queue
 * places CONTROL) and falls inside the seven days after `date`. Only what the sessions planned for that day do not already
 * reserve is returned. null: no checkpoint is due there, or none can be prescribed.
 */
function anticipatedCheckpoint(s: EngineState, date: number, later: readonly Workout[]): {day: number; metres: number} | null {
  const weekStart = date + 7 - (((date - day(s.cycleStartDate)) % 7 + 7) % 7);
  if (weekStart > date + 6 || weekStart >= day(s.profile.raceDate)) return null;
  if (!s.checkpointRequired && weekStart - day(s.lastAssessmentDate) < 21) return null;
  const iso = addDays(s.cycleStartDate, weekStart - day(s.cycleStartDate));
  const planning = {...s, decision: decide(s, iso)};
  if (!s.profile.canRun3Km || planning.decision.maximumQualityPerWeek === 0 || planning.decision.phase === 'TAPER') return null;
  const reserved = reservedMetres(s, prescribe(planning, 'CONTROL', iso, 'anticipated-checkpoint')) ?? 0;
  const planned = later.filter(other => day(other.scheduledDate) === weekStart && other.countsAsQuality)
    .reduce((sum, other) => sum + (reservedMetres(s, other) ?? 0), 0);
  return {day: weekStart, metres: Math.max(0, reserved - planned)};
}
/**
 * Conservative total-load guard. A quality session with an actual measured baseline reserves
 * planning space for timed repeats, warmup, cooldown and rests; EASY only gets the remaining
 * distance. An over-budget quality slot becomes EASY or a free day, NEVER extra training debt.
 *
 * This is evaluated chronologically against completed HISTORY plus planned sessions to keep
 * every rolling seven-day window within the approved weekly booking budget.
 */
export function guardWeeklyLoad(s: EngineState, proposed: Workout[]): Workout[] {
  if (usesV4(s) && proposed.every(w => w.protocol?.methodology === 'V4_8W_1430')) {
    if (s.decision.safety !== 'OK') return [];
    const accepted: Workout[] = [];
    for (const w of [...proposed].sort((a,b)=>day(a.scheduledDate)-day(b.scheduledDate))) {
      const coordinate = v4Coordinates(s).find(c => `slot-${c.date}` === w.id);
      if (!coordinate || coordinate.role === 2 && coordinate.week === 8) continue;
      const expected = v4Workout(s,coordinate.week,coordinate.role);
      const normalized = {...w,scheduledDate:expected.scheduledDate,gateAtPrescription:expected.gateAtPrescription};
      // Refuse altered doses/protocols rather than fitting them to spare kilometres.
      if (JSON.stringify(normalized) !== JSON.stringify(expected)) continue;
      const combined = [...s.history.map(h=>h.workout),...accepted,w];
      if (!v4RecoveryAllowed(combined) || !withinRollingWeekBudget(s,combined,w.scheduledDate)) continue;
      accepted.push(structuredClone(w));
    }
    return accepted;
  }
  const baselineMeters = approvedWeekMeters(s);
  const alreadyDone = s.history.map(h => h.workout);
  const accepted: Workout[] = [];
  // Habitual long-run structure (12-week audit D-08); null for runners without an established long run.
  const shares = longRunShares(s);
  const ordered = [...proposed].sort((a,b)=>day(a.scheduledDate)-day(b.scheduledDate));
  for (const [position, offered] of ordered.entries()) {
    let w = structuredClone(offered);
    if(w.countsAsQuality) {
      // Committed/legacy queues must not restore an unbounded older intensity dose.
      w.main.dose.value=Math.min(w.main.dose.value,qualityDoseCeiling(s,w.type));
      if(w.main.repeatMeters){
        w.main.repeats=Math.ceil(w.main.dose.value/w.main.repeatMeters);
        w.main.finalRepeatMeters=w.main.dose.value-w.main.repeatMeters*(w.main.repeats-1);
      }
    }
    const date = day(w.scheduledDate);
    const recent = [...alreadyDone, ...accepted].filter(other =>
      day(other.scheduledDate) >= date - 6 && day(other.scheduledDate) <= date);
    // A candidate belongs to SEVEN different rolling windows (ending on its date through
    // date+6). Do not add all six past days to all six future quality days: those sessions
    // may be up to 12 days apart and never share any actual seven-day window.
    // Preserve space for future quality only in windows that contain BOTH sessions.
    const later = ordered.slice(position + 1).filter(other => day(other.scheduledDate) > date && day(other.scheduledDate) <= date + 6);
    const futureQuality = w.countsAsQuality ? [] : later.filter(other => other.countsAsQuality);
    // A missed session is never made up for (approved decision 2). With a shared long-run budget, space that a skipped session
    // would have used therefore stays reserved for the sizing of the ordinary and long runs: otherwise it would flow into a longer
    // long run, which then squeezes the next week (rolling windows overlap). Sessions that are completed or planned count as before.
    const skippedPlanned = shares !== null && !w.countsAsQuality
      ? s.skippedWorkouts.filter(other => !alreadyDone.some(done => done.id === other.id)) : [];
    const bookedSessions = [...alreadyDone, ...accepted, ...futureQuality, ...skippedPlanned];
    // With a long-run structure the ordinary runs and the long run share the whole budget, so they must leave room for the
    // 3000 m checkpoint that the engine itself schedules at the start of the next cycle week once it is due (21 days after the
    // last result). Without this reserve the full-budget week left no room for the checkpoint and it was turned into EASY.
    const anticipated = shares !== null && !w.countsAsQuality ? anticipatedCheckpoint(s, date, later) : null;
    // Budget left in the seven-day window ending on `end` after `sessions`.
    const space = (sessions: readonly Workout[], end: number, extra = anticipated): number => Math.max(0, baselineMeters - sessions.reduce((sum, other) => {
      const scheduled = day(other.scheduledDate);
      if (scheduled <= end - 7 || scheduled > end) return sum;
      return sum + (reservedMetres(s, other) ?? Infinity);
    }, 0) - (extra !== null && extra.day <= end && extra.day > end - 7 ? extra.metres : 0));
    let available = baselineMeters;
    for (let windowEnd = date; windowEnd <= date + 6; windowEnd++) available = Math.min(available, space(bookedSessions, windowEnd));
    // The long run of this week, if it is still ahead: the sessions before it leave room for it and share what is left
    // in the proportion of the runner's own habitual week (long : ordinary run), so the long run is not the first thing
    // that disappears when intense sessions have reserved most of the budget. Only the windows that contain BOTH the
    // session and the long run are shared; earlier windows (which hold last week's long run) are not.
    const upcomingLong = shares !== null && w.type !== 'LONG_EASY' ? later.find(other => other.type === 'LONG_EASY') : undefined;
    const longDate = upcomingLong ? day(upcomingLong.scheduledDate) : 0;
    const easyBeforeLong = (from: number): number => ordered.slice(from).filter(other =>
      other.type === 'EASY' && day(other.scheduledDate) < longDate).length;
    const recentEasyMax = Math.max(0, ...recent.filter(other => other.type === 'EASY' && other.main.dose.unit === 'METERS').map(other => other.main.dose.value));

    if (w.type === 'LONG_EASY' && recent.some(other => other.type === 'LONG_EASY')) {
      const planning = {...s, decision: decide(s, w.scheduledDate)};
      w = prescribe(planning, 'EASY', w.scheduledDate, w.id, w.volumeFactor);
      // A converted long session can be shortened, never lengthened.
      if (offered.main.dose.unit === 'METERS') w.main.dose.value = Math.min(w.main.dose.value, offered.main.dose.value);
    }

    if (w.countsAsQuality) {
      const reserved = reservedMetres(s,w);
      let crowdsOutLong = false;
      if (upcomingLong && w.type !== 'CONTROL' && recent.some(other => other.countsAsQuality)) {
        // A second intense session is optional. It is kept only if, after its reserve, the long run and the ordinary runs before
        // it still get their shares of what is left (proportional to the runner's own habitual week, ordinary runs at least the
        // engine's 1 km minimum) and the long run stays longer than the ordinary runs. Otherwise it becomes EASY.
        const easies = easyBeforeLong(position + 1);
        const meaningfulLong = Math.max(shares!.long, s.profile.longestUsualRunKm * 1000 * .65);
        let roomAfterOptionalQuality = Infinity;
        for (let windowEnd = longDate; windowEnd <= date + 6; windowEnd++) {
          const laterQuality = later.filter(other => other.countsAsQuality && day(other.scheduledDate) <= windowEnd)
            .reduce((sum, other) => sum + (reservedMetres(s, other) ?? Infinity), 0);
          const room = Math.max(0, space([...alreadyDone, ...accepted], windowEnd, null) - (reserved ?? Infinity) - laterQuality);
          roomAfterOptionalQuality = Math.min(roomAfterOptionalQuality, room);
        }
        crowdsOutLong = !(meaningfulLong > shares!.other && roomAfterOptionalQuality >= meaningfulLong + easies * 2000);
      }
      if (reserved === null || reserved > available + 1e-6 || crowdsOutLong) {
        // If the reserve cannot fit, there is no evidence for extra intense work this week.
        const planning = {...s,decision:decide(s,w.scheduledDate)};
        w = prescribe(planning,'EASY',w.scheduledDate,w.id,w.volumeFactor);
        // Never turn an already committed smaller meter prescription into a longer one.
        if(offered.main.dose.unit==='METERS')w.main.dose.value=Math.min(w.main.dose.value,offered.main.dose.value);
      } else {
        accepted.push(w);
        continue;
      }
    }

    if (w.main.dose.unit === 'METERS') {
      if (upcomingLong && w.type === 'EASY') {
        const weight = upcomingLong.main.dose.value + easyBeforeLong(position) * shares!.other;
        let allowed = Infinity;
        for (let windowEnd = date; windowEnd <= date + 6; windowEnd++) {
          const left = space(bookedSessions, windowEnd);
          allowed = Math.min(allowed, windowEnd >= longDate ? left * shares!.other / weight : left);
        }
        // Protect the meaningful long-run minimum first; ordinary EASY takes only the
        // remaining budget. This lets the optional second quality stay only when both fit.
        const longMinimum = Math.max(shares!.long, s.profile.longestUsualRunKm * 1000 * .65);
        let remainingForLong = Infinity;
        for (let windowEnd = date; windowEnd <= date + 6; windowEnd++) if (windowEnd >= longDate)
          remainingForLong = Math.min(remainingForLong, space(bookedSessions, windowEnd) - longMinimum);
        allowed = Math.min(allowed, remainingForLong);
        const minimumEasy = ['DEVELOPMENT','SPECIFIC'].includes(decide(s,w.scheduledDate).phase) && !s.progressionBlocked && !s.reentry ? 2000 : 1000;
        if (allowed < minimumEasy) continue;
        w.main.dose.value = Math.min(w.main.dose.value, allowed);
      }
      if (w.main.dose.value > available) {
        if (available < 1000) {
          // We never prescribe sub-1km EASY just to use up a small remaining budget.
          continue;
        }
        w.main.dose.value = Math.min(w.main.dose.value,available);
      }
      if (w.type === 'LONG_EASY') {
        // With a habitual long-run structure the long run must exceed the ordinary runs of its week; otherwise (legacy
        // or moved long sessions of runners without that structure) it must exceed the ordinary EASY prescription.
        const planning = {...s, decision:decide(s,w.scheduledDate)};
        const ordinary = prescribe(planning,'EASY',w.scheduledDate,w.id,w.volumeFactor);
        const reference = shares !== null ? Math.max(recentEasyMax, shares.other) : ordinary.main.dose.value;
        const meaningfulLongMinimum = s.profile.longestUsualRunKm * 1000 * .65;
        if(w.main.dose.value <= reference || w.main.dose.value < meaningfulLongMinimum){
          w = ordinary;
          w.main.dose.value=Math.min(w.main.dose.value,available,offered.main.dose.value);
        }
      }
      // Ordinary T2/T3 easy runs in development/specific weeks should remain real
      // standalone runs. Omit a squeezed slot instead of prescribing 1–1.6 km.
      const structuralEasy = (w.type === 'EASY' || w.type === 'LONG_EASY') &&
        ['DEVELOPMENT', 'SPECIFIC'].includes(decide(s, w.scheduledDate).phase) &&
        !s.reentry && !s.progressionBlocked && !s.yellowEasyRequired &&
        !w.main.calibration && w.volumeFactor >= 1 - 1e-9;
      if (structuralEasy && w.main.dose.value < 2000) continue;
      // STRIDES retain their known metre dose and count toward the same budget.
      accepted.push(w);
      continue;
    }

    // Non-distance, non-quality work is not inventively converted into metres.
    // The current engine prescribes none other than REST, which is a zero-dose event.
    if(w.type==='REST' || reservedMetres(s,w) === 0)accepted.push(w);
  }
  return accepted;
}
/**
 * Rolling seven-day queue. Stable slots avoid training debt and repeated same-day workouts.
 *
 * Week structure. Every cycle week has the same active slots (anchored to the cycle start). For a runner with an
 * established long run (`longRunShares`) the LAST slot of the week is the LONG_EASY slot and intense sessions never take
 * it; the first free slots after it carry the intense sessions as before. The role of a slot therefore no longer depends on
 * the day the plan happens to be rebuilt on (the old rule "a free slot four or more days from today is the long run" moved
 * the long run around with every replan and in practice never produced one).
 * `forcedEasy` lists slots whose intense session the weekly budget has already refused (see `generateQueue`).
 */
function buildQueue(s: EngineState, now: string, forcedEasy: ReadonlySet<string>): {queue: Workout[]; slots: Workout[]} {
  const availability = s.profile.availableRunsPerWeek;
  // Availability is a maximum for the calendar, not proof of tolerance for added running days.
  // Frequency progression requires separate evidence; preserve the user's habitual baseline now.
  const activeDays = s.decision.safety !== 'OK' || s.diagnosticHold || s.relatedYellow
    ? availability // retain the existing recovery/REST display under a safety hold
    : Math.min(availability, Math.max(1, s.profile.actualRunsPerWeek));
  const offsets = Array.from({length: activeDays}, (_, i) => Math.floor(i * 7 / activeDays));
  const result: Workout[] = [];
  const completed = new Set(s.history.map(h => h.workout.id));
  let pendingEasy = s.reentry?.easyRemaining ?? 0;
  let pendingQualityReduction = !!s.reentry || s.pendingQualityFactor !== null && s.pendingQualityFactor !== undefined;
  let qualityIndex = 0;
  let pendingFirstEasyReduction = s.reentry?.easyReductionPending ?? false;
  let controlScheduled = false;
  const longOffset = longRunShares(s) !== null && offsets.length >= 3 ? Math.max(...offsets) : -1;
  for (let delta = 0; delta < 7; delta++) {
    const date = addDays(now, delta);
    // Approved decision C1: `raceDate` is the day of the final 3000 m race itself, which the UI
    // shows as a separate event. The ordinary training queue therefore covers only dates strictly
    // before it, so no EASY / LONG_EASY / STRIDES / INTRO_QUALITY / THRESHOLD / VO2 / SPECIFIC_3K /
    // CONTROL is ever prescribed on the race day. No post-race phase exists.
    if (day(date) >= day(s.profile.raceDate)) continue;
    const planning = {...s, decision: decide(s, date)};
    const offset = ((day(date) - day(s.cycleStartDate)) % 7 + 7) % 7;
    if (!offsets.includes(offset)) continue;
    const id = `slot-${date}`;
    if (completed.has(id) || s.skippedIds.includes(id)) continue;
    const preceding = [...s.history.filter(h => h.workout.countsAsQuality && day(h.result.date) <= day(date) && day(h.result.date) > day(date) - 7).map(h => ({date: h.result.date, hours: h.workout.minimumRecoveryHoursBeforeQuality})), ...s.skippedWorkouts.filter(w => w.countsAsQuality && day(w.scheduledDate) <= day(date) && day(w.scheduledDate) > day(date) - 7).map(w => ({date: w.scheduledDate, hours: 0})), ...result.filter(w => w.countsAsQuality).map(w => ({date: w.scheduledDate, hours: w.minimumRecoveryHoursBeforeQuality}))];
    const moved = s.movedWorkouts.filter(w => !completed.has(w.id) && day(w.scheduledDate) >= day(now) && w.countsAsQuality);
    const qualityDates = [...preceding.map(w => day(w.date)), ...moved.map(w => day(w.scheduledDate)), day(date)];
    const weeklyIntense = Math.min(planning.decision.maximumQualityPerWeek, weeklyIntenseCapacity(planning, date, offsets.length));
    const canQuality = qualityDates.every(end => qualityDates.filter(d => d <= end && d > end - 7).length <= weeklyIntense) && preceding.every(w => (day(date) - day(w.date)) * 24 >= w.hours) && moved.every(w => Math.abs(day(date) - day(w.scheduledDate)) * 24 >= w.minimumRecoveryHoursBeforeQuality);
    let type: WorkoutType = 'EASY'; let factor = planning.decision.phase === 'TAPER' ? .6 : 1;
    if (planning.decision.safety !== 'OK' || s.diagnosticHold) type = 'REST';
    else if (s.yellowEasyRequired) { type = 'EASY'; factor = .8; }
    else if (pendingEasy > 0) { factor = s.reentry!.easyFactor; pendingEasy--; }
    else if (s.reentry?.diagnosticRequired) type = 'EASY';
    else if (s.checkpointRequired && (!s.reentry || s.reentry.diagnosticRequired) && s.profile.canRun3Km && canQuality && !controlScheduled && !s.progressionBlocked && planning.decision.phase !== 'TAPER') { type = 'CONTROL'; factor = 1; controlScheduled = true; }
    else if (offset === longOffset && !s.reentry && ['DEVELOPMENT', 'SPECIFIC'].includes(planning.decision.phase)) type = 'LONG_EASY';
    else if (canQuality && !s.progressionBlocked && !forcedEasy.has(id)) {
      // Intense sessions already completed, skipped, moved or planned earlier decide which type comes next.
      const earlier = [...s.history.map(h => ({type: h.workout.type, date: h.result.date})), ...s.skippedWorkouts.map(w => ({type: w.type, date: w.scheduledDate})), ...s.movedWorkouts.filter(w => !completed.has(w.id)).map(w => ({type: w.type, date: w.scheduledDate})), ...result.map(w => ({type: w.type, date: w.scheduledDate}))]
        .filter(w => ['THRESHOLD', 'VO2', 'SPECIFIC_3K'].includes(w.type) && day(w.date) < day(date))
        .sort((a, b) => day(a.date) - day(b.date)).map(w => w.type);
      type = qualityType(planning, qualityIndex++, earlier);
      if (pendingQualityReduction) { factor *= s.reentry?.qualityFactor ?? s.pendingQualityFactor ?? 1; pendingQualityReduction = false; }
    }
    if (type === 'EASY' && pendingFirstEasyReduction) { factor = s.reentry!.easyFactor; pendingFirstEasyReduction = false; }
    // No quality is pre-authorized beyond re-entry: feedback must complete the mandatory easy sessions first.
    if (s.reentry && s.reentry.easyRemaining > 0 && QUALITY.includes(type)) type = 'EASY';
    const tapered=taperSafe(type,date,s.profile.raceDate,factor);
    result.push(prescribe(planning, tapered.type, date, id, tapered.factor));
  }
  const moved = s.movedWorkouts.filter(w => !completed.has(w.id) && day(w.scheduledDate) >= day(now) && day(w.scheduledDate) < day(now) + 7 && day(w.scheduledDate) < day(s.profile.raceDate));
  const safeMoved = moved.map(original => {
    const planning = {...s, decision: decide(s, original.scheduledDate)};
    const d = planning.decision;
    const type: WorkoutType = d.safety !== 'OK' || s.diagnosticHold ? 'REST' : original.countsAsQuality && (s.yellowEasyRequired || s.progressionBlocked || d.maximumQualityPerWeek === 0 || (d.phase === 'FOUNDATION' && ['VO2', 'SPECIFIC_3K'].includes(original.type))) ? 'EASY' : original.type;
    const factor = d.phase === 'TAPER' ? Math.min(.6, original.volumeFactor) : original.volumeFactor;
    const tapered=taperSafe(type,original.scheduledDate,s.profile.raceDate,factor);
    const next = prescribe(planning, tapered.type, original.scheduledDate, original.id, tapered.factor);
    if (tapered.type === original.type) {
      next.main.dose.value = Math.min(original.main.dose.value, next.main.dose.value);
      // Moving a committed run/walk workout does not silently make its running bouts harder.
      if (original.main.mode === 'RUN_WALK' && original.main.runWalk) next.main.runWalk = {...original.main.runWalk};
      if (next.main.repeatMeters) { next.main.repeats = Math.ceil(next.main.dose.value / next.main.repeatMeters); next.main.finalRepeatMeters = next.main.dose.value - next.main.repeatMeters * (next.main.repeats - 1); }
    }
    if (tapered.type !== original.type && original.main.dose.unit === 'METERS' &&
        next.main.dose.unit === 'METERS')
      next.main.dose.value=Math.min(next.main.dose.value,original.main.dose.value);
    return next;
  });
  const proposed = [...result, ...safeMoved].sort((a, b) => day(a.scheduledDate) - day(b.scheduledDate));
  return {queue: guardWeeklyLoad(s, proposed), slots: result};
}
/**
 * Seven-day plan after the weekly-load guard. An intense session that the guard turns into EASY is not "used": the
 * slot is rebuilt as EASY and the following slots are typed again, so the SPECIFIC_3K / THRESHOLD / VO2 rotation (which is
 * derived from the schedule) continues from the sessions that are actually planned. The loop is deterministic, only ever
 * adds slots to `forcedEasy` and so ends after at most one pass per slot.
 */
export function generateQueue(s: EngineState, now: string): Workout[] {
  if (usesV4(s) && s.decision.safety === 'OK') {
    const completed = new Set(s.history.map(h=>h.workout.id));
    const fixed = v4Coordinates(s).filter(c => !(c.week === 8 && c.role === 2) &&
      day(c.date) >= day(now) && day(c.date) < day(now)+7 &&
      !completed.has(`slot-${c.date}`) && !s.skippedIds.includes(`slot-${c.date}`))
      .map(c=>v4Workout(s,c.week,c.role));
    const moved = s.movedWorkouts.filter(w=>!completed.has(w.id) && day(w.scheduledDate)>=day(now) && day(w.scheduledDate)<day(now)+7);
    return guardWeeklyLoad(s,[...fixed,...moved]);
  }
  const forced = new Set<string>();
  for (;;) {
    const {queue, slots} = buildQueue(s, now, forced);
    const refused = slots.filter(w => w.countsAsQuality && w.type !== 'CONTROL' && !forced.has(w.id) &&
      !queue.some(kept => kept.id === w.id && kept.countsAsQuality));
    if (refused.length === 0) return queue;
    for (const w of refused) forced.add(w.id);
  }
}
