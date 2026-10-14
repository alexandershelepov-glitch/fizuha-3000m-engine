import type { Dose, EngineState, Workout, WorkoutType } from './models.ts';
import { decide } from './assessment.ts';
import { addDays, day } from './validation.ts';
import { EngineError } from './errors.ts';
import { RUN_WALK_STAGES, LAST_RUN_WALK_STAGE } from './runWalk.ts';
import {approvedWeekMeters,reservedMetres} from './weeklyLoad.ts';
const QUALITY: WorkoutType[] = ['INTRO_QUALITY', 'THRESHOLD', 'VO2', 'SPECIFIC_3K', 'CONTROL'];
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
  const ordinary = runsPerWeek > 0 ? approvedMeters / runsPerWeek : 0;
  return {unit: 'METERS', value: type === 'LONG_EASY' ? s.profile.longestUsualRunKm * 1000 : ordinary > 0 ? ordinary : 1000};
}
export function prescribe(s: EngineState, type: WorkoutType, date: string, id: string, factor = 1): Workout {
  const d = s.decision;
  if ((QUALITY.includes(type) && d.maximumQualityPerWeek === 0) || (d.phase === 'FOUNDATION' && ['VO2', 'SPECIFIC_3K'].includes(type))) throw new EngineError('WORKOUT_BLOCKED_BY_PHASE_OR_SAFETY');
  const dose = {...((s.reentry && QUALITY.includes(type) ? s.confirmedDoses[type] : s.doses[type]) ?? initialDose(s, type))}; dose.value *= factor;
  let range: [number, number] | null = null;
  let anchor: Workout['anchor'] = 'EFFORT';
  let rpe: [number, number] = type === 'EASY' || type === 'LONG_EASY' ? [2, 4] : [2, 3];
  if (type === 'THRESHOLD') { rpe = [6, 7]; if (d.currentSpeedMps) range = [d.currentSpeedMps * .90, d.currentSpeedMps * .94]; anchor = 'CURRENT'; }
  if (type === 'VO2') { rpe = [8, 9]; if (d.currentSpeedMps) range = [d.currentSpeedMps * .97, d.currentSpeedMps * 1.03]; anchor = 'CURRENT'; }
  if (type === 'SPECIFIC_3K') { rpe = [8, 9]; if (d.effectiveSpeedMps) range = [d.effectiveSpeedMps * .985, d.effectiveSpeedMps * 1.015]; anchor = d.gate === 'CLOSED' ? 'CURRENT' : 'EFFECTIVE'; }
  if (type === 'INTRO_QUALITY' || type === 'STRIDES') rpe = [5, 6];
  if (type === 'CONTROL') { rpe = [8, 9]; anchor = 'NONE'; }
  if (type === 'REST') { rpe = [0, 0]; anchor = 'NONE'; }
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
      ...(mode === 'RUN_WALK' ? {runWalk:{stage, ...RUN_WALK_STAGES[stage]!}} : {})},
    targetRpe: rpe, effortCues: type === 'EASY' || type === 'LONG_EASY' ? ['FULL_SENTENCES', 'CONTROLLED_BREATHING'] : [], speedRangeMps: range, paceRangeSecondsPerKm: range ? [1000 / range[1], 1000 / range[0]] : null,
    anchor, gateAtPrescription: d.gate, restSeconds: interval ? 90 : 0,
    minimumRecoveryHoursBeforeQuality: countsAsQuality ? 48 : 0,
    requiredFeedback: ['completionFraction', 'sessionRpe', 'safety', 'durationMinutes', 'distanceMeters', 'repeats', 'restSeconds', 'conditions', 'unexpectedFatigue'],
    removable: true, movable: true, volumeFactor: factor,
  };
}
function qualityType(s: EngineState, index: number): WorkoutType {
  if (s.decision.phase === 'FOUNDATION') return 'INTRO_QUALITY';
  if (s.decision.phase === 'TAPER') return s.successfulSpecificPartial > 0 ? 'SPECIFIC_3K' : 'INTRO_QUALITY';
  if (s.decision.phase === 'SPECIFIC' && index === 0) return 'SPECIFIC_3K';
  if (s.decision.quality === 'Q0') return s.successfulIntro >= 2 ? 'THRESHOLD' : 'INTRO_QUALITY';
  return (s.qualityRotation + index - (s.decision.phase === 'SPECIFIC' ? 1 : 0)) % 2 === 0 ? 'THRESHOLD' : 'VO2';
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
  const baselineMeters = approvedWeekMeters(s);
  const alreadyDone = s.history.map(h => h.workout);
  const accepted: Workout[] = [];
  for (const offered of [...proposed].sort((a,b)=>day(a.scheduledDate)-day(b.scheduledDate))) {
    let w = structuredClone(offered);
    const date = day(w.scheduledDate);
    const recent = [...alreadyDone, ...accepted].filter(other =>
      day(other.scheduledDate) >= date - 6 && day(other.scheduledDate) <= date);
    // A candidate belongs to SEVEN different rolling windows (ending on its date through
    // date+6). Do not add all six past days to all six future quality days: those sessions
    // may be up to 12 days apart and never share any actual seven-day window.
    // Preserve space for future quality only in windows that contain BOTH sessions.
    const futureQuality = w.countsAsQuality ? [] : proposed.filter(other =>
      other.countsAsQuality && day(other.scheduledDate) > date &&
      day(other.scheduledDate) <= date + 6);
    const bookedSessions = [...alreadyDone, ...accepted, ...futureQuality];
    let available = baselineMeters;
    for (let windowEnd = date; windowEnd <= date + 6; windowEnd++) {
      const booked = bookedSessions.reduce((sum, other) => {
        const scheduled = day(other.scheduledDate);
        if (scheduled <= windowEnd - 7 || scheduled > windowEnd) return sum;
        return sum + (reservedMetres(s, other) ?? Infinity);
      }, 0);
      available = Math.min(available, Math.max(0, baselineMeters - booked));
    }

    if (w.type === 'LONG_EASY' && recent.some(other => other.type === 'LONG_EASY')) {
      const planning = {...s, decision: decide(s, w.scheduledDate)};
      w = prescribe(planning, 'EASY', w.scheduledDate, w.id, w.volumeFactor);
      // A converted long session can be shortened, never lengthened.
      if (offered.main.dose.unit === 'METERS') w.main.dose.value = Math.min(w.main.dose.value, offered.main.dose.value);
    }

    if (w.countsAsQuality) {
      const reserved = reservedMetres(s,w);
      if (reserved === null || reserved > available + 1e-6) {
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
      if (w.main.dose.value > available) {
        if (available < 1000) {
          // We never prescribe sub-1km EASY just to use up a small remaining budget.
          continue;
        }
        w.main.dose.value = Math.min(w.main.dose.value,available);
      }
      if (w.type === 'LONG_EASY') {
        const planning = {...s, decision:decide(s,w.scheduledDate)};
        const ordinary = prescribe(planning,'EASY',w.scheduledDate,w.id,w.volumeFactor);
        if(w.main.dose.value <= ordinary.main.dose.value){
          w = ordinary;
          w.main.dose.value=Math.min(w.main.dose.value,available,offered.main.dose.value);
        }
      }
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
/** Rolling seven-day queue. Stable slots avoid training debt and repeated same-day workouts. */
export function generateQueue(s: EngineState, now: string): Workout[] {
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
  let pendingQualityReduction = !!s.reentry;
  let qualityIndex = 0;
  let pendingFirstEasyReduction = s.reentry?.easyReductionPending ?? false;
  let controlScheduled = false;
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
    const canQuality = qualityDates.every(end => qualityDates.filter(d => d <= end && d > end - 7).length <= planning.decision.maximumQualityPerWeek) && preceding.every(w => (day(date) - day(w.date)) * 24 >= w.hours) && moved.every(w => Math.abs(day(date) - day(w.scheduledDate)) * 24 >= w.minimumRecoveryHoursBeforeQuality);
    let type: WorkoutType = 'EASY'; let factor = planning.decision.phase === 'TAPER' ? .6 : 1;
    if (planning.decision.safety !== 'OK' || s.relatedYellow || s.diagnosticHold) type = 'REST';
    else if (pendingEasy > 0) { factor = s.reentry!.easyFactor; pendingEasy--; }
    else if (s.reentry?.diagnosticRequired) type = 'EASY';
    else if (s.checkpointRequired && (!s.reentry || s.reentry.diagnosticRequired) && s.profile.canRun3Km && canQuality && !controlScheduled && !s.progressionBlocked && planning.decision.phase !== 'TAPER') { type = 'CONTROL'; factor = 1; controlScheduled = true; }
    else if (canQuality && !s.progressionBlocked) {
      const specificAlreadyPlanned = [...s.history.map(h => ({type: h.workout.type, date: h.result.date})), ...s.skippedWorkouts.map(w => ({type: w.type, date: w.scheduledDate})), ...s.movedWorkouts.filter(w => !completed.has(w.id)).map(w => ({type: w.type, date: w.scheduledDate})), ...result.map(w => ({type: w.type, date: w.scheduledDate}))].some(w => w.type === 'SPECIFIC_3K' && day(w.date) > day(date) - 7 && day(w.date) <= day(date));
      type = qualityType(planning, planning.decision.phase === 'SPECIFIC' ? Number(specificAlreadyPlanned) : qualityIndex++);
      if (pendingQualityReduction) { factor *= s.reentry!.qualityFactor; pendingQualityReduction = false; }
    } else if (delta >= 4 && planning.decision.phase !== 'RE_ENTRY' && s.profile.longestUsualRunKm > 0) type = 'LONG_EASY';
    if (type === 'EASY' && pendingFirstEasyReduction) { factor = s.reentry!.easyFactor; pendingFirstEasyReduction = false; }
    // No quality is pre-authorized beyond re-entry: feedback must complete the mandatory easy sessions first.
    if (s.reentry && s.reentry.easyRemaining > 0 && QUALITY.includes(type)) type = 'EASY';
    result.push(prescribe(planning, type, date, id, factor));
  }
  const moved = s.movedWorkouts.filter(w => !completed.has(w.id) && day(w.scheduledDate) >= day(now) && day(w.scheduledDate) < day(now) + 7 && day(w.scheduledDate) < day(s.profile.raceDate));
  const safeMoved = moved.map(original => {
    const planning = {...s, decision: decide(s, original.scheduledDate)};
    const d = planning.decision;
    const type: WorkoutType = d.safety !== 'OK' || s.diagnosticHold || s.relatedYellow ? 'REST' : original.countsAsQuality && (s.progressionBlocked || d.maximumQualityPerWeek === 0 || (d.phase === 'FOUNDATION' && ['VO2', 'SPECIFIC_3K'].includes(original.type))) ? 'EASY' : original.type;
    const factor = d.phase === 'TAPER' ? Math.min(.6, original.volumeFactor) : original.volumeFactor;
    const next = prescribe(planning, type, original.scheduledDate, original.id, factor);
    if (type === original.type) {
      next.main.dose.value = Math.min(original.main.dose.value, next.main.dose.value);
      // Moving a committed run/walk workout does not silently make its running bouts harder.
      if (original.main.mode === 'RUN_WALK' && original.main.runWalk) next.main.runWalk = {...original.main.runWalk};
      if (next.main.repeatMeters) { next.main.repeats = Math.ceil(next.main.dose.value / next.main.repeatMeters); next.main.finalRepeatMeters = next.main.dose.value - next.main.repeatMeters * (next.main.repeats - 1); }
    }
    return next;
  });
  return guardWeeklyLoad(s, [...result, ...safeMoved].sort((a, b) => day(a.scheduledDate) - day(b.scheduledDate)));
}
