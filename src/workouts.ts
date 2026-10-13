import type { Dose, EngineState, Workout, WorkoutType } from './models.ts';
import { decide } from './assessment.ts';
import { addDays, day } from './validation.ts';
import { EngineError } from './errors.ts';
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
  const ordinary = runsPerWeek > 0 ? s.profile.averageWeeklyKm4Weeks / runsPerWeek * 1000 : 0;
  return {unit: 'METERS', value: type === 'LONG_EASY' ? s.profile.longestUsualRunKm * 1000 : ordinary > 0 ? ordinary : 1000};
}
export function prescribe(s: EngineState, type: WorkoutType, date: string, id: string, factor = 1): Workout {
  const d = s.decision;
  if ((QUALITY.includes(type) && d.maximumQualityPerWeek === 0) || (d.phase === 'FOUNDATION' && ['VO2', 'SPECIFIC_3K'].includes(type))) throw new EngineError('WORKOUT_BLOCKED_BY_PHASE_OR_SAFETY');
  const dose = {...((s.reentry && QUALITY.includes(type) ? s.confirmedDoses[type] : s.doses[type]) ?? initialDose(s, type))}; dose.value *= factor;
  let range: [number, number] | null = null;
  let anchor: Workout['anchor'] = 'EFFORT';
  let rpe: [number, number] = [2, 3];
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
  return {
    id, scheduledDate: date, type, goal: type === 'CONTROL' ? 'ASSESS_CURRENT_PERFORMANCE' : type === 'EASY' || type === 'LONG_EASY' ? 'AEROBIC_BASE' : type === 'REST' ? 'RECOVERY' : 'QUALITY_ADAPTATION', priority: countsAsQuality ? 1 : 2,
    countsAsQuality, warmupMinutes: countsAsQuality ? 10 : 0, cooldownMinutes: countsAsQuality ? 10 : 0,
    main: {mode: type === 'REST' ? 'REST' : !s.profile.canRun3Km && !countsAsQuality ? 'RUN_WALK' : interval ? 'INTERVALS' : 'CONTINUOUS', dose, repeats, repeatMeters, finalRepeatMeters: repeatMeters ? dose.value - repeatMeters * (repeats - 1) : null},
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
 * Conservative initial load guard:
 * - "I have time for seven sessions" is not evidence of seven-session running fitness.
 * - Meter-based easy work is never raised above the habitual weekly volume by calendar density.
 * - A long easy session may occur at most once in any rolling seven-day window.
 *
 * A prescribed time-based quality session is NOT converted into invented metres here.
 * These are defensive scheduling rules, not a physiological adaptation model.
 */
function guardEasyLoad(s: EngineState, proposed: Workout[]): Workout[] {
  const baselineMeters = s.easyProgression?.approvedMetersPer7Days ??
    (s.profile.actualRunsPerWeek > 0 && s.profile.averageWeeklyKm4Weeks > 0
      ? s.profile.averageWeeklyKm4Weeks * 1000
      : 1000); // Existing no-running-history introductory RUN_WALK minimum.
  const alreadyDone = s.history.map(h => h.workout);
  const accepted: Workout[] = [];
  for (const offered of proposed) {
    let w = offered;
    const date = day(w.scheduledDate);
    const recent = [...alreadyDone, ...accepted].filter(other =>
      day(other.scheduledDate) >= date - 6 && day(other.scheduledDate) <= date);
    if (w.type === 'LONG_EASY' && recent.some(other => other.type === 'LONG_EASY')) {
      const planning = {...s, decision: decide(s, w.scheduledDate)};
      w = prescribe(planning, 'EASY', w.scheduledDate, w.id, w.volumeFactor);
      // Moving a previously shorter session must never inflate it.
      if (offered.main.dose.unit === 'METERS') w.main.dose.value = Math.min(w.main.dose.value, offered.main.dose.value);
    }
    if ((w.type === 'EASY' || w.type === 'LONG_EASY') && w.main.dose.unit === 'METERS') {
      const originalBaseline = s.profile.actualRunsPerWeek > 0 && s.profile.averageWeeklyKm4Weeks > 0
        ? s.profile.averageWeeklyKm4Weeks * 1000 : 1000;
      // One existing EASY receives the modest newly approved distance. No frequency or
      // quality-dose increase is smuggled into this change.
      if (w.type === 'EASY' && baselineMeters > originalBaseline &&
          !accepted.some(a => a.type === 'EASY' || a.type === 'LONG_EASY') &&
          !alreadyDone.some(a => day(a.scheduledDate) >= date - 6 && day(a.scheduledDate) <= date
            && (a.type === 'EASY' || a.type === 'LONG_EASY'))) {
        w.main.dose.value += baselineMeters - originalBaseline;
      }
      const counted = recent
        .filter(other => other.main.dose.unit === 'METERS' && other.type !== 'REST')
        .reduce((sum, other) => sum + other.main.dose.value, 0);
      const availableMeters = Math.max(0, baselineMeters - counted);
      if (availableMeters < 1000) {
        // No extra workout to "complete" or log: the day is simply left free for recovery.
        // Never invent a sub-1km running prescription or exceed the habitual budget.
        continue;
      } else {
        w.main.dose.value = Math.min(w.main.dose.value, availableMeters);
        if (w.type === 'LONG_EASY') {
          const planning = {...s, decision: decide(s, w.scheduledDate)};
          const ordinary = prescribe(planning, 'EASY', w.scheduledDate, w.id, w.volumeFactor);
          if (w.main.dose.value <= ordinary.main.dose.value) {
            // A shortened "long" run is not a long session.
            w = ordinary;
            w.main.dose.value = Math.min(w.main.dose.value, availableMeters, offered.main.dose.value);
          }
        }
      }
    }
    accepted.push(w);
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
      if (next.main.repeatMeters) { next.main.repeats = Math.ceil(next.main.dose.value / next.main.repeatMeters); next.main.finalRepeatMeters = next.main.dose.value - next.main.repeatMeters * (next.main.repeats - 1); }
    }
    return next;
  });
  return guardEasyLoad(s, [...result, ...safeMoved].sort((a, b) => day(a.scheduledDate) - day(b.scheduledDate)));
}
