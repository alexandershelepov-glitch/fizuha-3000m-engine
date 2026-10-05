import type { Dose, EngineState, Workout, WorkoutType } from './models.ts';
import { decide } from './assessment.ts';
import { addDays, day } from './validation.ts';
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
  const ordinary = s.profile.averageWeeklyKm4Weeks / Math.max(1, s.profile.actualRunsPerWeek) * 1000;
  return {unit: 'METERS', value: type === 'LONG_EASY' ? s.profile.longestUsualRunKm * 1000 : ordinary > 0 ? ordinary : 1000};
}
export function prescribe(s: EngineState, type: WorkoutType, date: string, id: string, factor = 1): Workout {
  const d = s.decision;
  if ((QUALITY.includes(type) && d.maximumQualityPerWeek === 0) || (d.phase === 'FOUNDATION' && ['VO2', 'SPECIFIC_3K'].includes(type))) throw new Error('Workout blocked by phase or safety');
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
/** Rolling seven-day queue. Stable slots avoid training debt and repeated same-day workouts. */
export function generateQueue(s: EngineState, now: string): Workout[] {
  const availability = s.profile.availableRunsPerWeek;
  const offsets = Array.from({length: availability}, (_, i) => Math.floor(i * 7 / availability));
  const result: Workout[] = [];
  const completed = new Set(s.history.map(h => h.workout.id));
  let pendingEasy = s.reentry?.easyRemaining ?? 0;
  let pendingQualityReduction = !!s.reentry;
  let qualityIndex = 0;
  let pendingFirstEasyReduction = s.reentry?.easyReductionPending ?? false;
  let controlScheduled = false;
  for (let delta = 0; delta < 7; delta++) {
    const date = addDays(now, delta);
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
  const moved = s.movedWorkouts.filter(w => !completed.has(w.id) && day(w.scheduledDate) >= day(now) && day(w.scheduledDate) < day(now) + 7);
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
  return [...result, ...safeMoved].sort((a, b) => day(a.scheduledDate) - day(b.scheduledDate));
}
