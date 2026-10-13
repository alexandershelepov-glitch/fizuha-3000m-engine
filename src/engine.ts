import type { EngineState, PerformanceSnapshot, Profile, SafetyData, TrainingBreak, Workout, WorkoutResult, WorkoutType } from './models.ts';
import { PERFORMANCE_SOURCES } from './models.ts';
import { assessSafety, decide } from './assessment.ts';
import { classify, yellowFamily } from './feedback.ts';
import { day, number, validateEventDate, validateProfile, validateProfileShape } from './validation.ts';
import { EngineError } from './errors.ts';
import { generateQueue } from './workouts.ts';
function copy(s: EngineState): EngineState { return structuredClone(s); }
/**
 * Remove a workout from the plan. Approved decision 2: a missed session is deleted from the
 * current queue, never becomes training debt, is never treated as a completed quality session
 * and is never replayed as compensation. Both the explicit `skipWorkout` call and the automatic
 * past-due detection in `replan` go through this single helper.
 */
function registerMiss(s: EngineState, w: Workout): void {
  s.movedWorkouts = s.movedWorkouts.filter(m => m.id !== w.id);
  if (!s.skippedIds.includes(w.id)) s.skippedIds.push(w.id);
  if (!s.skippedWorkouts.some(m => m.id === w.id)) s.skippedWorkouts.push(structuredClone(w));
}
/** Queue entries whose date has passed without a recorded result and which are not yet skipped. */
function pastDue(s: EngineState, now: string): Workout[] {
  return s.queue.filter(w => day(w.scheduledDate) < day(now) && !s.history.some(h => h.workout.id === w.id) && !s.skippedIds.includes(w.id));
}
function advanceTo(s: EngineState, now: string): void {
  if (day(now) < day(s.asOf)) throw new EngineError('CLOCK_BACKWARDS');
  validateProfile(s.profile, now); s.asOf = now;
}
/**
 * Re-assess and rebuild the seven-day queue. `preserve` holds the queue the state had already
 * committed to: after a skip the remaining prescriptions are kept as they were, so a missed
 * session can never raise or pull forward the following load.
 */
/**
 * EASY progression is based on two FULL, explicitly acknowledged 7-day blocks.
 * Calendar availability and implicit form defaults are never evidence of adaptation.
 * No numeric improvement in 3 km performance is assumed.
 */
function considerEasyProgression(s: EngineState, now: string): void {
  const baselineMeters = s.profile.actualRunsPerWeek > 0 && s.profile.averageWeeklyKm4Weeks > 0
    ? s.profile.averageWeeklyKm4Weeks * 1000 : 1000;
  s.easyProgression ??= {approvedMetersPer7Days:baselineMeters, lastIncreaseDate:null};
  const p=s.easyProgression;
  const date=day(now);
  if (date - day(s.cycleStartDate) < 14 ||
      (p.lastIncreaseDate !== null && date-day(p.lastIncreaseDate)<14) ||
      baselineMeters < 5000 || s.profile.actualRunsPerWeek===0) return;
  const decision=decide(s,now);
  if (decision.safety!=='OK' || s.progressionBlocked || s.relatedYellow ||
      s.diagnosticHold || s.reentry || s.checkpointRequired ||
      decision.phase==='TAPER' || decision.phase==='HOLD_DIAGNOSTIC') return;
  // Never increase easy and quality dose at the same time.
  if (Object.entries(s.doses).some(([type,dose])=>dose.value >
    (s.confirmedDoses[type as WorkoutType]?.value ?? dose.value))) return;
  const first=date-14;
  const workouts=s.history.filter(h=>day(h.result.date)>=first && day(h.result.date)<date &&
    h.workout.type!=='REST');
  const skipped=s.skippedWorkouts.some(w=>day(w.scheduledDate)>=first && day(w.scheduledDate)<date &&
    w.type!=='REST');
  if (skipped || workouts.length < s.profile.actualRunsPerWeek*2) return;
  for(const week of [0,1]){
    const weekly=workouts.filter(h=>day(h.result.date)>=first+week*7 &&
      day(h.result.date)<first+(week+1)*7);
    if (weekly.length<s.profile.actualRunsPerWeek) return;
  }
  if(workouts.some(h=>!h.result.verifiedForProgression ||
    !['GREEN','GREEN_PLUS'].includes(h.classified.evaluation) ||
    h.result.completionFraction<.95 || h.result.unexpectedFatigue ||
    h.result.safety.pain>0 || assessSafety(h.result.safety)!=='OK')) return;
  // Separate small-base/run-walk staircase needs methodical sign-off.
  const step=decision.capacity==='T2'||decision.capacity==='T3' ? 1000 : 500;
  p.approvedMetersPer7Days += step;
  p.lastIncreaseDate=now;
}
function rebuildQueue(s: EngineState, now: string, preserve: Workout[] | null): EngineState {
  if (day(now) - day(s.lastAssessmentDate) >= 21 || s.profile.performanceMismatch === 'CLEAR') s.checkpointRequired = true;
  considerEasyProgression(s, now);
  s.decision = decide(s, now);
  const generated = generateQueue(s, now);
  s.queue = preserve ? generated.map(w => preserve.find(old => old.id === w.id) ?? w) : generated;
  return s;
}
export function replan(state: EngineState, now = state.asOf): EngineState {
  const s = copy(state); advanceTo(s, now);
  const before = s.queue;
  const missed = pastDue(s, now);
  for (const w of missed) registerMiss(s, w);
  // An automatic past-due miss and an explicit skip must produce the same state (approved
  // decision 2), so a miss freezes the remaining prescriptions instead of replaying the session.
  return rebuildQueue(s, now, missed.length ? before : null);
}
export function createEngine(profile: Profile, now: string): EngineState {
  validateProfile(profile, now);
  const state = {
    version: 1, profile: structuredClone(profile), cycleStartDate: now, asOf: now,
    queue: [], history: [], skippedIds: [], skippedWorkouts: [], movedWorkouts: [], successfulQuality: 0, successfulIntro: 0, successfulSpecificPartial: 0,
    greenPlusIds: [], checkpointRequired: !profile.performance && profile.canRun3Km,
    lastAssessmentDate: profile.performance?.date ?? now, relatedYellow: false, reducedQualityUntilConfirmed: false, diagnosticHold: false, progressionBlocked: false,
    doses: {}, confirmedDoses: {}, successStreak: {}, qualityRotation: 0, reentry: null, finalResultRecorded: false,
  } as unknown as EngineState;
  state.decision = decide(state, now);
  const latest = [...profile.breaks].sort((a, b) => day(b.endDate) - day(a.endDate))[0];
  if (latest && (!profile.performance || day(latest.endDate) >= day(profile.performance.date))) return applyBreak(state, latest, now, false);
  return replan(state, now);
}
export function applyBreak(state: EngineState, b: TrainingBreak, now: string, addToProfile = true): EngineState {
  const s = copy(state);
  if (addToProfile) s.profile.breaks.push(structuredClone(b));
  validateProfile(s.profile, now);
  // Missing workouts are dropped, never replayed as debt (approved decision 2, same helper as a skip).
  for (const w of pastDue(s, now)) registerMiss(s, w);
  s.successStreak = {}; s.greenPlusIds = [];
  if (b.reason === 'ILLNESS' || b.reason === 'INJURY') {
    s.profile.safety.needsAssessment = true; s.diagnosticHold = true; s.progressionBlocked = true;
  } else if (b.days >= 4) {
    s.successfulSpecificPartial = 0;
    s.reentry = {breakDays: b.days, easyRemaining: b.days >= 8 ? 2 : 0, easyReductionPending: b.days <= 7, easyFactor: b.days <= 7 ? .8 : .7, qualityFactor: b.days <= 7 ? .85 : .75, diagnosticRequired: b.days > 14};
  }
  return replan(s, now);
}
function progress(s: EngineState, type: WorkoutType): void {
  const dose = s.confirmedDoses[type]; if (!dose) return;
  const step = dose.unit === 'MINUTES' ? s.decision.quality === 'Q2' ? 4 : s.decision.quality === 'Q1' ? 3 : 2 : s.decision.quality === 'Q2' ? 600 : 400;
  // Only volume changes. Speed, repeat length and recovery are preserved.
  s.doses[type] = {...dose, value: dose.value + step};
}
export function recordResult(state: EngineState, workoutId: string, result: WorkoutResult): EngineState {
  const s = copy(state); const w = s.queue.find(w => w.id === workoutId);
  if (!w || s.history.some(h => h.workout.id === workoutId)) throw new EngineError('UNKNOWN_OR_COMPLETED_WORKOUT');
  if (result.date !== w.scheduledDate || day(result.date) < day(s.asOf)) throw new EngineError('RESULT_PRECEDES_STATE');
  // Safety is classified before any administrative limit: a RED report must never be refused,
  // because Safety has absolute priority over the quality budget (spec 4, spec 18).
  const c = classify(w, result);
  if (w.countsAsQuality && c.evaluation !== 'RED') {
    // The queue authorised this session against the decision made on the session's own date,
    // so acceptance must use the same decision rather than the possibly older state assessment.
    const maxQuality = decide(s, result.date).maximumQualityPerWeek;
    const recent = s.history.filter(h => h.workout.countsAsQuality && day(result.date) - day(h.result.date) < 7);
    if (recent.length >= maxQuality || recent.some(h => (day(result.date) - day(h.result.date)) * 24 < h.workout.minimumRecoveryHoursBeforeQuality)) throw new EngineError('RECOVERY_OR_QUALITY_LIMIT');
  }
  const previous = s.history.filter(h => h.classified.evaluation === 'YELLOW').at(-1);
  s.history.push({workout: structuredClone(w), result: structuredClone(result), classified: c});
  s.profile.safety = structuredClone(result.safety);
  if (c.evaluation === 'RED') {
    s.progressionBlocked = true; s.diagnosticHold = true; s.successStreak = {}; s.successfulSpecificPartial = 0;
  } else if (c.evaluation === 'YELLOW') {
    s.progressionBlocked = true; s.successStreak = {}; s.successfulSpecificPartial = 0; s.greenPlusIds = [];
    if (previous && previous.classified.yellowReason && c.yellowReason && yellowFamily(previous.classified.yellowReason) === yellowFamily(c.yellowReason) && !s.history.slice(s.history.indexOf(previous) + 1, -1).some(h => h.workout.countsAsQuality && ['GREEN', 'GREEN_PLUS'].includes(h.classified.evaluation))) {
      s.relatedYellow = true; s.reducedQualityUntilConfirmed = true; s.diagnosticHold = true; s.doses = structuredClone(s.confirmedDoses);
    }
    if (c.yellowReason === 'PAIN' || c.yellowReason === 'ILLNESS') { s.diagnosticHold = true; s.profile.safety.needsAssessment = true; }
  } else {
    // A successful easy session clears an isolated non-health yellow, but never a diagnostic hold.
    if (!s.diagnosticHold && !s.relatedYellow) s.progressionBlocked = false;
    if (s.reentry && w.type === 'EASY') {
      s.reentry.easyReductionPending = false;
      s.reentry.easyRemaining = Math.max(0, s.reentry.easyRemaining - 1);
      if (s.reentry.easyRemaining === 0 && s.reentry.breakDays >= 8) s.checkpointRequired = true;
      if (s.reentry.easyRemaining === 0 && s.reentry.diagnosticRequired) s.diagnosticHold = true;
    }
    if (w.countsAsQuality && w.type !== 'CONTROL') {
      s.reducedQualityUntilConfirmed = false; s.successfulQuality++; if (w.type === 'INTRO_QUALITY') s.successfulIntro++;
      if (w.type === 'SPECIFIC_3K' && w.gateAtPrescription === 'PARTIAL') s.successfulSpecificPartial++;
      if (c.evaluation === 'GREEN_PLUS') { s.greenPlusIds.push(w.id); if (s.greenPlusIds.length >= 2) s.checkpointRequired = true; }
      s.confirmedDoses[w.type] = structuredClone(w.main.dose);
      s.doses[w.type] = structuredClone(w.main.dose);
      s.successStreak[w.type] = (s.successStreak[w.type] ?? 0) + 1;
      if (s.successStreak[w.type]! >= 2 && !s.progressionBlocked && !s.reentry && s.decision.phase !== 'TAPER' && (w.type !== 'SPECIFIC_3K' || decide(s, result.date).gate === w.gateAtPrescription)) {
        progress(s, w.type); s.successStreak[w.type] = 0;
      }
      if (w.type === 'THRESHOLD' || w.type === 'VO2') s.qualityRotation++;
      if (s.reentry && s.reentry.easyRemaining === 0 && !s.reentry.diagnosticRequired) s.reentry = null;
    }
  }
  // Current performance is intentionally untouched; CONTROL feedback alone is not a valid 3K result.
  return replan(s, result.date);
}
export function recordCheckpoint(state: EngineState, performance: PerformanceSnapshot, now: string): EngineState {
  const s = copy(state);
  if (!PERFORMANCE_SOURCES.includes(performance.source) || !s.profile.canRun3Km || assessSafety(s.profile.safety) !== 'OK' || s.relatedYellow || (s.reentry && s.reentry.easyRemaining > 0)) throw new EngineError('CHECKPOINT_NOT_PERMITTED');
  if (day(performance.date) > day(now) || day(performance.date) < day(s.lastAssessmentDate)) throw new EngineError('INVALID_CHECKPOINT_DATE');
  s.profile.performance = structuredClone(performance); s.profile.performanceMismatch = 'NONE';
  // Breaks ending on the test date have already been evaluated by the valid post-break test.
  s.profile.breaks = s.profile.breaks.filter(b => day(b.endDate) > day(performance.date));
  s.lastAssessmentDate = performance.date; s.checkpointRequired = false; s.greenPlusIds = [];
  s.successfulSpecificPartial = 0; s.successfulQuality = 0; s.successfulIntro = 0; s.successStreak = {};
  s.diagnosticHold = false; s.progressionBlocked = false; s.reentry = null;
  return replan(s, now);
}
/**
 * Terminal transition for the final 3000 m race itself (approved decision C1).
 *
 * `raceDate` is the day of the target race, which the UI presents as a separate event. Its result
 * is a fact of that event, so it may be recorded on the race day or later, and it is not gated by
 * the training plan's state. The result becomes Current Performance and closes the checkpoint, but
 * no plan is produced: v1.0 has no post-race phase and no post-race queue, and every ordinary
 * operation (`replan`, `skipWorkout`, `createEngine`, ...) keeps raising EVENT_DATE_PASSED once the
 * current date is past `raceDate`.
 */
export function recordFinalResult(state: EngineState, performance: PerformanceSnapshot, now: string): EngineState {
  const s = copy(state);
  if (!PERFORMANCE_SOURCES.includes(performance.source)) throw new EngineError('INVALID_PERFORMANCE_SOURCE');
  if (day(performance.date) !== day(s.profile.raceDate)) throw new EngineError('FINAL_RESULT_NOT_ON_EVENT_DATE');
  if (day(now) < day(performance.date)) throw new EngineError('FINAL_RESULT_BEFORE_EVENT');
  number(performance.timeSeconds, 1);
  s.profile.performance = structuredClone(performance); s.profile.performanceMismatch = 'NONE';
  s.profile.breaks = s.profile.breaks.filter(b => day(b.endDate) > day(performance.date));
  s.lastAssessmentDate = performance.date; s.checkpointRequired = false; s.greenPlusIds = [];
  s.successfulSpecificPartial = 0; s.successfulQuality = 0; s.successfulIntro = 0; s.successStreak = {};
  s.diagnosticHold = false; s.progressionBlocked = false; s.relatedYellow = false; s.reentry = null;
  s.asOf = now; s.finalResultRecorded = true;
  // The cycle is closed: an empty queue is the only honest plan after the event date.
  s.queue = [];
  s.decision = decide(s, now);
  return s;
}
/** Explicit assessment outcome. Never invoked automatically merely because a race approaches. */
export function resolveDiagnostic(state: EngineState, safety: SafetyData, now: string): EngineState {
  const s = copy(state); s.profile.safety = structuredClone(safety);
  if (assessSafety(safety) !== 'OK') return replan(s, now);
  s.relatedYellow = false; s.diagnosticHold = false; s.progressionBlocked = false;
  if (s.reentry?.diagnosticRequired) s.checkpointRequired = true;
  return replan(s, now);
}
export function updateTrainingData(state: EngineState, data: Partial<Omit<Profile, 'performance' | 'breaks' | 'safety'>>, now: string): EngineState {
  const s = copy(state); const before = s.profile.canRun3Km;
  // Runtime callers cannot bypass the dedicated performance/safety/break transitions.
  for (const key of Object.keys(data)) if (['performance', 'breaks', 'safety'].includes(key)) throw new EngineError('PROTECTED_FIELD');
  s.profile = {...s.profile, ...structuredClone(data)};
  if (!before && s.profile.canRun3Km && !s.profile.performance) s.checkpointRequired = true;
  return replan(s, now);
}
export function skipWorkout(state: EngineState, id: string, now = state.asOf): EngineState {
  // Approved decision 2: this is the same operation as the automatic past-due miss in `replan`.
  // Only the triggering event differs — an explicit request versus the clock moving past the date.
  const s = copy(state);
  const omitted = s.queue.find(w => w.id === id);
  if (!omitted) throw new EngineError('UNKNOWN_WORKOUT');
  const before = s.queue;
  advanceTo(s, now);
  registerMiss(s, omitted);
  for (const w of pastDue(s, now)) registerMiss(s, w);
  return rebuildQueue(s, now, before);
}
export function serialize(state: EngineState): string { return JSON.stringify(state); }
export function deserialize(json: string): EngineState {
  const s = JSON.parse(json) as EngineState; if (s.version !== 1) throw new EngineError('UNSUPPORTED_STATE_VERSION');
  // Restore the committed plan verbatim. Re-planning here would regenerate the queue and could
  // replay a session that was already skipped or missed (approved decision 2): a save/load cycle
  // must not resurrect a missed workout, so only the derived decision is recomputed.
  validateProfileShape(s.profile, s.asOf);
  // The event-date rule still applies to every active plan; only the terminal final-result state
  // (produced by `recordFinalResult`) may carry a clock that has passed `raceDate`.
  if (!s.finalResultRecorded) validateEventDate(s.profile, s.asOf);
  s.decision = decide(s, s.asOf);
  return s;
}
/** Moving preserves the dose and rejects density/weekly limit violations. */
export function moveWorkout(state: EngineState, id: string, date: string): EngineState {
  const s = copy(state); const w = s.queue.find(w => w.id === id);
  // A workout can never be moved onto or past the race day, which is the event itself.
  if (!w || !w.movable || day(date) < day(s.asOf) || day(date) >= day(s.asOf) + 7 || day(date) >= day(s.profile.raceDate)) throw new EngineError('MOVE_OUTSIDE_HORIZON');
  if (s.queue.some(other => other.id !== id && other.scheduledDate === date) || s.history.some(h => h.result.date === date)) throw new EngineError('MOVE_OCCUPIED_DATE');
  if (w.countsAsQuality) {
    const others = [...s.history.filter(h => h.workout.countsAsQuality).map(h => ({date: h.result.date, hours: h.workout.minimumRecoveryHoursBeforeQuality})), ...s.queue.filter(other => other.id !== id && other.countsAsQuality).map(other => ({date: other.scheduledDate, hours: other.minimumRecoveryHoursBeforeQuality}))];
    if (others.some(other => Math.abs(day(date) - day(other.date)) * 24 < other.hours)) throw new EngineError('MOVE_RECOVERY_VIOLATION');
    const dates = [...others.map(other => day(other.date)), day(date)];
    if (dates.some(end => dates.filter(d => d <= end && d > end - 7).length > s.decision.maximumQualityPerWeek)) throw new EngineError('MOVE_QUALITY_LIMIT_VIOLATION');
  }
  w.scheduledDate = date;
  s.movedWorkouts = [...s.movedWorkouts.filter(other => other.id !== id), structuredClone(w)];
  // Reserve both slots; a later replan cannot refill the moved workout's original slot.
  for (const slot of [id, `slot-${date}`]) if (!s.skippedIds.includes(slot)) s.skippedIds.push(slot);
  return s;
}
