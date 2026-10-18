/**
 * v1 start pace for EASY/LONG_EASY. A 3000 m performance is a *faster reference*, never
 * the desired exercise speed. The relative-speed bands are conservative initial
 * coaching heuristics, not individually measured aerobic thresholds.
 *
 * We store a range in the engine's Workout contract so Today, Calendar,
 * WorkoutDetails and saves all read the same prescription.
 */
import type {Capacity, Confidence, EngineState, Workout} from './models.ts';

const SPEED_FRACTIONS: Record<Capacity, readonly [number, number]> = {
  T0: [0.60, 0.70], // Can run 3 km, but has little running history.
  T1: [0.66, 0.74],
  T2: [0.69, 0.77],
  T3: [0.70, 0.78],
};

/** Values are seconds/km and m/s, respectively. No made-up heart-rate zones. */
export function initialEasyPace(
  threeKmTimeSeconds: number | null,
  canRun3Km: boolean,
  confidence: Confidence,
  capacity: Capacity,
): Pick<Workout, 'paceRangeSecondsPerKm' | 'speedRangeMps'> {
  const unavailable = {paceRangeSecondsPerKm: null, speedRangeMps: null};
  if (!canRun3Km || threeKmTimeSeconds === null || !Number.isFinite(threeKmTimeSeconds) ||
      threeKmTimeSeconds <= 0 || (confidence !== 'HIGH' && confidence !== 'MEDIUM')) return unavailable;

  const [slowFraction, fastFraction] = SPEED_FRACTIONS[capacity];
  // A medium-confidence result may be 22–42 days old or follow a brief break.
  // Move both edges down by 3 percentage points until an updated 3 km result.
  const adjustment = confidence === 'MEDIUM' ? 0.03 : 0;
  const racePaceSecondsPerKm = threeKmTimeSeconds / 3;
  // Display in 5 s/km increments. Rounding to a *slower* pace at both edges
  // avoids instructing the runner to exceed the provisional intensity band.
  const fastPace = Math.ceil((racePaceSecondsPerKm / (fastFraction - adjustment)) / 5) * 5;
  const slowPace = Math.ceil((racePaceSecondsPerKm / (slowFraction - adjustment)) / 5) * 5;
  return {
    paceRangeSecondsPerKm: [fastPace, slowPace],
    speedRangeMps: [1000 / slowPace, 1000 / fastPace],
  };
}


/**
 * The first feedback-based correction for a numeric, continuous EASY assignment.
 *
 * A reported failure is more informative than the hypothetical EASY band from a 3 km test:
 * when a runner managed less than the assigned distance, or rated the effort above 4/10,
 * the next EASY is scaled toward the actual *measured* distance/pace. This never
 * increases a pace or distance and never makes up measurements.
 *
 * The newest EASY result takes precedence. An older result cannot override a newer
 * unverified session, and reports without explicit confirmation are not calibration data.
 * This adjustment applies to newly prescribed sessions, not completed history.
 */
export function adaptEasyFromRecentResult(
  state: EngineState,
  plannedMeters: number,
  initial: Pick<Workout, 'paceRangeSecondsPerKm' | 'speedRangeMps'>,
): {doseMeters: number; pace: Pick<Workout, 'paceRangeSecondsPerKm' | 'speedRangeMps'>} {
  const unchanged = {doseMeters: plannedMeters, pace: initial};
  if (initial.paceRangeSecondsPerKm === null || initial.speedRangeMps === null) return unchanged;
  const last = [...state.history].reverse().find(entry =>
    (entry.workout.type === 'EASY' || entry.workout.type === 'LONG_EASY') &&
    entry.workout.main.mode === 'CONTINUOUS');
  if (!last || last.result.feedbackConfirmed !== true || last.classified.evaluation === 'RED' ||
      !Number.isFinite(last.result.distanceMeters) || !Number.isFinite(last.result.durationMinutes) ||
      last.result.distanceMeters < 500 || last.result.durationMinutes < 3 ||
      (Date.parse(state.asOf + 'T00:00:00Z') - Date.parse(last.result.date + 'T00:00:00Z')) / 86400000 > 21) return unchanged;

  const actualSpeed = last.result.distanceMeters / (last.result.durationMinutes * 60);
  if (!Number.isFinite(actualSpeed) || actualSpeed < 0.5 || actualSpeed > 7) return unchanged;
  const completedShort = last.result.completionFraction < .95 ||
    last.result.distanceMeters < last.workout.main.dose.value * .90;
  const feltHard = last.result.sessionRpe > 4 || last.result.unexpectedFatigue;
  if (!completedShort && !feltHard) return unchanged;

  // 5% slower than the observed pace for the faster edge, 13% for the
  // slower edge. Never faster than the baseline, even after a hard overpaced run.
  const [baseFast, baseSlow] = initial.paceRangeSecondsPerKm;
  const roundSlower = (seconds: number): number => Math.ceil(seconds / 5) * 5;
  const fast = Math.max(baseFast, roundSlower(1000 / (actualSpeed * .95)));
  const slow = Math.max(baseSlow, roundSlower(1000 / (actualSpeed * .87)), fast + 5);
  const correctedPace: [number, number] = [fast, slow];

  // If a 5 km EASY stopped after 3 km, prescribing another 5 km unchanged
  // gives no actionable adaptation. A small 5% step from actually covered
  // metres is the most the next task can request; the existing weekly budget
  // and training-day allocation remain in charge.
  const doseMeters = completedShort
    ? Math.min(plannedMeters, Math.max(500, Math.ceil(last.result.distanceMeters * 1.05 / 250) * 250))
    : plannedMeters;
  return {
    doseMeters,
    pace: {
      paceRangeSecondsPerKm: correctedPace,
      speedRangeMps: [1000 / slow, 1000 / fast],
    },
  };
}


/** Convert validated whole-second per-kilometre bounds to the engine's two representations. */
function paceFromSeconds(fast: number, slow: number):
  Pick<Workout, 'paceRangeSecondsPerKm' | 'speedRangeMps'> {
  return {paceRangeSecondsPerKm: [fast, slow], speedRangeMps: [1000 / slow, 1000 / fast]};
}
const measuredEasy = (entry: EngineState['history'][number]): boolean => {
  const {workout: w, result: r} = entry;
  return (w.type === 'EASY' || w.type === 'LONG_EASY') &&
    w.main.mode === 'CONTINUOUS' && r.feedbackConfirmed === true &&
    r.completionFraction >= .95 &&
    r.distanceMeters >= w.main.dose.value * .95 &&
    r.durationMinutes >= 3 && Number.isFinite(r.durationMinutes) &&
    Number.isFinite(r.distanceMeters) && r.distanceMeters >= 950 &&
    r.sessionRpe >= 2 && r.sessionRpe <= 4 && !r.unexpectedFatigue &&
    ['GREEN', 'GREEN_PLUS'].includes(entry.classified.evaluation);
};
const actualPace = (entry: EngineState['history'][number]): number =>
  entry.result.durationMinutes * 60000 / entry.result.distanceMeters;
const daysAgo = (now: string, date: string): number =>
  (Date.parse(now + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000;
const mostRecentContinuous = (s: EngineState): EngineState['history'] =>
  s.history.filter(entry =>
    (entry.workout.type === 'EASY' || entry.workout.type === 'LONG_EASY') &&
    entry.workout.main.mode === 'CONTINUOUS').sort((a, b) =>
      b.result.date.localeCompare(a.result.date));

/**
 * No timed 3 km, but the runner attests they can cover it continuously:
 * first assign two SHORT, measured EASY calibrations, not fictitious pace data.
 * Once two consecutive, confirmed, compatible EASY reports exist, derive a
 * provisional easy ceiling from the slower observed pace with a small margin.
 *
 * Never infer continuous-running speed from RUN_WALK total (which contains walking).
 * A measured EASY does not become a timed 3000m performance.
 */
export function beginnerEasyPace(s: EngineState):
  Pick<Workout, 'paceRangeSecondsPerKm' | 'speedRangeMps'> | null {
  if (s.profile.performance !== null || !s.profile.canRun3Km) return null;
  // Freeze the entry benchmark to the actual calibration sessions. Otherwise
  // later ordinary EASY results silently replace the two trials and cause
  // the prescribed pace to drift even when the runner obeys the programme.
  const latest = mostRecentContinuous(s)
    .filter(entry => entry.workout.main.calibration === true).slice(0, 2);
  if (latest.length !== 2 || latest.some(entry => !measuredEasy(entry) ||
      daysAgo(s.asOf, entry.result.date) < 0 ||
      daysAgo(s.asOf, entry.result.date) > 21)) return null;
  const paces = latest.map(actualPace);
  if (paces.some(p => !Number.isFinite(p) || p < 180 || p > 850) ||
      Math.max(...paces) / Math.min(...paces) > 1.15) return null;
  // Use the slower observed training pace, not race pace or the fastest sample.
  const slowestObserved = Math.max(...paces);
  const faster = Math.ceil(slowestObserved * 1.03 / 5) * 5;
  const slower = Math.ceil(slowestObserved * 1.13 / 5) * 5;
  return paceFromSeconds(faster, Math.max(faster + 5, slower));
}

/**
 * A calibrated beginner has only proved the distance actually covered.
 * Increase the next booked EASY by at most 1000m after confirmed easy completion;
 * weekly-budget checks remain independent. No credit from an unmeasured report.
 */
export function calibratedBeginnerDose(s: EngineState, requested: number): number {
  if (s.profile.performance !== null || !s.profile.canRun3Km) return requested;
  const latest = mostRecentContinuous(s)[0];
  if (!latest || !measuredEasy(latest) || daysAgo(s.asOf, latest.result.date) > 21) return requested;
  return Math.min(requested, Math.ceil((latest.result.distanceMeters + 1000) / 250) * 250);
}

/**
 * Three consecutive CONFIRMED, on-target and genuinely easy runs (RPE <= 2)
 * permit a one-time 5s/km faster target compared with the baseline band.
 * A second step is NOT accumulated automatically: a new measured 3km assessment
 * should reset the baseline. The rule is recalculated from history, with no
 * retrospective changes to completed sessions.
 */
export function refineAfterEasySuccesses(
  s: EngineState,
  base: Pick<Workout, 'paceRangeSecondsPerKm' | 'speedRangeMps'>,
): Pick<Workout, 'paceRangeSecondsPerKm' | 'speedRangeMps'> {
  if (!s.profile.canRun3Km || base.paceRangeSecondsPerKm === null ||
      base.speedRangeMps === null) return base;
  const latest = mostRecentContinuous(s).slice(0, 3);
  if (latest.length !== 3 || latest.some(entry => {
    if (!measuredEasy(entry) || entry.result.sessionRpe > 2 ||
        daysAgo(s.asOf, entry.result.date) < 0 ||
        daysAgo(s.asOf, entry.result.date) > 21 ||
        entry.workout.paceRangeSecondsPerKm === null) return true;
    const pace = actualPace(entry);
    const [fast, slow] = entry.workout.paceRangeSecondsPerKm;
    return pace < fast - 1e-6 || pace > (fast + slow) / 2 + 1e-6;
  })) return base;
  const earliest = latest[2]!.result.date;
  // Three runs in three days are NOT a training block. Require at least
  // fourteen days of actual measured EASY adaptation before any speed step.
  if (daysAgo(latest[0]!.result.date, earliest) < 14) return base;
  if (s.skippedWorkouts.some(w => w.scheduledDate >= earliest && w.scheduledDate <= s.asOf &&
      (w.type === 'EASY' || w.type === 'LONG_EASY'))) return base;
  // A maximum single 5sec step from THIS baseline: repeated replans cannot
  // compound it, and an isolated strong run cannot trigger it.
  const [fast, slow] = base.paceRangeSecondsPerKm;
  return paceFromSeconds(Math.max(180, fast - 5), Math.max(185, slow - 5));
}
