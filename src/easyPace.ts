/**
 * v1 start pace for EASY/LONG_EASY. A 3000 m performance is a *faster reference*, never
 * the desired exercise speed. The relative-speed bands are conservative initial
 * coaching heuristics, not individually measured aerobic thresholds.
 *
 * We store a range in the engine's Workout contract so Today, Calendar,
 * WorkoutDetails and saves all read the same prescription.
 */
import type {Capacity, Confidence, Workout} from './models.ts';

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
