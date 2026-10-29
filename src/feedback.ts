import type { ClassifiedResult, Workout, WorkoutResult, YellowReason } from './models.ts';
import { assessSafety } from './assessment.ts';
import { validateResult } from './validation.ts';
export function classify(w: Workout, r: WorkoutResult): ClassifiedResult {
  validateResult(r);
  const easyContinuous = (w.type === 'EASY' || w.type === 'LONG_EASY') && w.main.mode === 'CONTINUOUS';
  // A continuous EASY is not an interval session. When both actual distance and
  // actual duration are supplied, check its measured average speed against the
  // assigned pace. Without measurements the pace is UNVERIFIED, not an invented
  // failed interval block (the report screen discloses this separately).
  const measuredTotalSpeed = easyContinuous && r.repeats.length === 0 &&
    r.distanceMeters > 0 && r.durationMinutes > 0
    ? r.distanceMeters / (r.durationMinutes * 60) : null;
  const speeds = measuredTotalSpeed !== null ? [measuredTotalSpeed] :
    r.repeats.map(rep => rep.distanceMeters / rep.seconds);
  // Approved V4 times are whole-second working guides. Accept stopwatch rounding
  // to the nearest second, not an impossible zero-width floating-point interval.
  const roundedGuideFraction = w.protocol && w.countsAsQuality && w.speedRangeMps && r.repeats.length
    ? r.repeats.filter(rep => rep.seconds >= rep.distanceMeters/w.speedRangeMps![1] - .5 - 1e-9 &&
        rep.seconds <= rep.distanceMeters/w.speedRangeMps![0] + .5 + 1e-9).length/r.repeats.length : null;
  const inRangeFraction = roundedGuideFraction ?? (w.speedRangeMps
    ? speeds.length
      ? speeds.filter(v => v >= w.speedRangeMps![0] - 1e-9 && v <= w.speedRangeMps![1] + 1e-9).length / speeds.length
      : easyContinuous ? 1 : 0
    : 1);
  const speedDropFraction = speeds.length >= 2 ? Math.max(0, 1 - speeds[speeds.length - 1]! / speeds[0]!) : 0;
  const base = {sessionLoad: r.sessionRpe * r.durationMinutes, inRangeFraction, speedDropFraction};
  if (assessSafety(r.safety) === 'STOP') return {...base, evaluation: 'RED', yellowReason: null};
  const target = (w.targetRpe[0] + w.targetRpe[1]) / 2;
  let reason: YellowReason | null = null;
  if (r.safety.pain >= 2 || r.safety.needsAssessment) reason = 'PAIN';
  else if (r.unexpectedFatigue || r.sessionRpe >= target + 2) reason = 'RECOVERY';
  else if (r.completionFraction < .95 || inRangeFraction < .8 || speedDropFraction > .05 + 1e-12) reason = r.conditions.heat || r.conditions.wind ? 'ENVIRONMENT' : 'EXECUTION';
  if (reason) return {...base, evaluation: 'YELLOW', yellowReason: reason === 'PAIN' ? 'PAIN' : r.yellowReason ?? reason};
  const easyRunning = w.type === 'EASY' || w.type === 'LONG_EASY';
  // RPE 2–4 is an expected easy effort; 4 must not become OTHER/YELLOW merely because
  // it is above the midpoint. The medical/symptom checks above remain unchanged.
  const expectedEffort = easyRunning
    ? r.sessionRpe >= w.targetRpe[0] && r.sessionRpe <= w.targetRpe[1]
    : Math.abs(r.sessionRpe - target) <= 1;
  const noticeablyEasier = easyRunning ? r.sessionRpe < w.targetRpe[0] : r.sessionRpe <= target - 1;
  if (r.completionFraction === 1 && inRangeFraction >= .8 && speedDropFraction <= .05 + 1e-12 && noticeablyEasier && r.safety.pain <= 1) return {...base, evaluation: 'GREEN_PLUS', yellowReason: null};
  if (r.completionFraction >= .95 && inRangeFraction >= .8 && speedDropFraction <= .05 + 1e-12 && expectedEffort && r.safety.pain <= 1) return {...base, evaluation: 'GREEN', yellowReason: null};
  return {...base, evaluation: 'YELLOW', yellowReason: r.yellowReason ?? 'OTHER'};
}
export function yellowFamily(reason: YellowReason): string {
  // Full execution at excessive RPE and an incomplete session with tired legs are comparable recovery failures.
  return reason === 'EXECUTION' || reason === 'RECOVERY' ? 'TOLERANCE' : reason;
}
