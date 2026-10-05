import type { EngineState, PerformanceSnapshot, Profile, SafetyData, TrainingBreak, WorkoutResult, WorkoutType } from './models.ts';
import { assessSafety, decide } from './assessment.ts';
import { classify, yellowFamily } from './feedback.ts';
import { day, validateProfile } from './validation.ts';
import { generateQueue } from './workouts.ts';
function copy(s: EngineState): EngineState { return structuredClone(s); }
export function replan(state: EngineState, now = state.asOf): EngineState {
  const s = copy(state); if (day(now) < day(s.asOf)) throw new Error('Clock cannot move backwards');
  validateProfile(s.profile, now); s.asOf = now;
  for (const w of s.queue) if (day(w.scheduledDate) < day(now) && !s.history.some(h => h.workout.id === w.id) && !s.skippedIds.includes(w.id)) { s.skippedIds.push(w.id); s.skippedWorkouts.push(w); }
  if (day(now) - day(s.lastAssessmentDate) >= 21 || s.profile.performanceMismatch === 'CLEAR') s.checkpointRequired = true;
  s.decision = decide(s, now); s.queue = generateQueue(s, now); return s;
}
export function createEngine(profile: Profile, now: string): EngineState {
  validateProfile(profile, now);
  const state = {
    version: 1, profile: structuredClone(profile), cycleStartDate: now, asOf: now,
    queue: [], history: [], skippedIds: [], skippedWorkouts: [], movedWorkouts: [], successfulQuality: 0, successfulIntro: 0, successfulSpecificPartial: 0,
    greenPlusIds: [], checkpointRequired: !profile.performance && profile.canRun3Km,
    lastAssessmentDate: profile.performance?.date ?? now, relatedYellow: false, reducedQualityUntilConfirmed: false, diagnosticHold: false, progressionBlocked: false,
    doses: {}, confirmedDoses: {}, successStreak: {}, qualityRotation: 0, reentry: null,
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
  // Missing workouts are dropped, never replayed as debt.
  s.queue.filter(w => day(w.scheduledDate) < day(now)).forEach(w => { s.skippedIds.push(w.id); s.skippedWorkouts.push(w); });
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
  if (!w || s.history.some(h => h.workout.id === workoutId)) throw new Error('Unknown or completed workout');
  if (result.date !== w.scheduledDate || day(result.date) < day(s.asOf)) throw new Error('Result precedes prescription or state');
  // Safety is classified before any administrative limit: a RED report must never be refused,
  // because Safety has absolute priority over the quality budget (spec 4, spec 18).
  const c = classify(w, result);
  if (w.countsAsQuality && c.evaluation !== 'RED') {
    // The queue authorised this session against the decision made on the session's own date,
    // so acceptance must use the same decision rather than the possibly older state assessment.
    const maxQuality = decide(s, result.date).maximumQualityPerWeek;
    const recent = s.history.filter(h => h.workout.countsAsQuality && day(result.date) - day(h.result.date) < 7);
    if (recent.length >= maxQuality || recent.some(h => (day(result.date) - day(h.result.date)) * 24 < h.workout.minimumRecoveryHoursBeforeQuality)) throw new Error('Recovery or quality limit violated');
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
  if (!['TEST_3K', 'OFFICIAL_3K'].includes(performance.source) || !s.profile.canRun3Km || assessSafety(s.profile.safety) !== 'OK' || s.relatedYellow || (s.reentry && s.reentry.easyRemaining > 0)) throw new Error('Checkpoint not permitted');
  if (day(performance.date) > day(now) || day(performance.date) < day(s.lastAssessmentDate)) throw new Error('Invalid checkpoint date');
  s.profile.performance = structuredClone(performance); s.profile.performanceMismatch = 'NONE';
  // Breaks ending on the test date have already been evaluated by the valid post-break test.
  s.profile.breaks = s.profile.breaks.filter(b => day(b.endDate) > day(performance.date));
  s.lastAssessmentDate = performance.date; s.checkpointRequired = false; s.greenPlusIds = [];
  s.successfulSpecificPartial = 0; s.successfulQuality = 0; s.successfulIntro = 0; s.successStreak = {};
  s.diagnosticHold = false; s.progressionBlocked = false; s.reentry = null;
  return replan(s, now);
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
  for (const key of Object.keys(data)) if (['performance', 'breaks', 'safety'].includes(key)) throw new Error('Protected field');
  s.profile = {...s.profile, ...structuredClone(data)};
  if (!before && s.profile.canRun3Km && !s.profile.performance) s.checkpointRequired = true;
  return replan(s, now);
}
export function skipWorkout(state: EngineState, id: string, now = state.asOf): EngineState {
  const s = copy(state); if (!s.queue.some(w => w.id === id)) throw new Error('Unknown workout');
  s.movedWorkouts = s.movedWorkouts.filter(w => w.id !== id);
  const omitted = s.queue.find(w => w.id === id)!
  s.skippedIds.push(id); s.skippedWorkouts.push(structuredClone(omitted));
  const next = replan(s, now);
  next.queue = next.queue.map(w => s.queue.find(old => old.id === w.id) ?? w);
  return next;
}
export function serialize(state: EngineState): string { return JSON.stringify(state); }
export function deserialize(json: string): EngineState {
  const s = JSON.parse(json) as EngineState; if (s.version !== 1) throw new Error('Unsupported state version');
  return replan(s, s.asOf);
}
/** Moving preserves the dose and rejects density/weekly limit violations. */
export function moveWorkout(state: EngineState, id: string, date: string): EngineState {
  const s = copy(state); const w = s.queue.find(w => w.id === id);
  if (!w || !w.movable || day(date) < day(s.asOf) || day(date) >= day(s.asOf) + 7) throw new Error('Move outside queue horizon');
  if (s.queue.some(other => other.id !== id && other.scheduledDate === date) || s.history.some(h => h.result.date === date)) throw new Error('Occupied date');
  if (w.countsAsQuality) {
    const others = [...s.history.filter(h => h.workout.countsAsQuality).map(h => ({date: h.result.date, hours: h.workout.minimumRecoveryHoursBeforeQuality})), ...s.queue.filter(other => other.id !== id && other.countsAsQuality).map(other => ({date: other.scheduledDate, hours: other.minimumRecoveryHoursBeforeQuality}))];
    if (others.some(other => Math.abs(day(date) - day(other.date)) * 24 < other.hours)) throw new Error('Move violates recovery');
    const dates = [...others.map(other => day(other.date)), day(date)];
    if (dates.some(end => dates.filter(d => d <= end && d > end - 7).length > s.decision.maximumQualityPerWeek)) throw new Error('Move violates weekly quality limit');
  }
  w.scheduledDate = date;
  s.movedWorkouts = [...s.movedWorkouts.filter(other => other.id !== id), structuredClone(w)];
  // Reserve both slots; a later replan cannot refill the moved workout's original slot.
  for (const slot of [id, `slot-${date}`]) if (!s.skippedIds.includes(slot)) s.skippedIds.push(slot);
  return s;
}
