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
