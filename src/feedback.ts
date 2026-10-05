import type { ClassifiedResult, Workout, WorkoutResult, YellowReason } from './models.ts';
import { assessSafety } from './assessment.ts';
import { validateResult } from './validation.ts';
export function classify(w: Workout, r: WorkoutResult): ClassifiedResult {
  validateResult(r);
  const speeds = r.repeats.map(rep => rep.distanceMeters / rep.seconds);
  const inRangeFraction = w.speedRangeMps ? speeds.length ? speeds.filter(v => v >= w.speedRangeMps![0] && v <= w.speedRangeMps![1]).length / speeds.length : 0 : 1;
  const speedDropFraction = speeds.length >= 2 ? Math.max(0, 1 - speeds[speeds.length - 1]! / speeds[0]!) : 0;
  const base = {sessionLoad: r.sessionRpe * r.durationMinutes, inRangeFraction, speedDropFraction};
  if (assessSafety(r.safety) === 'STOP') return {...base, evaluation: 'RED', yellowReason: null};
  const target = (w.targetRpe[0] + w.targetRpe[1]) / 2;
  let reason: YellowReason | null = null;
  if (r.safety.pain >= 2 || r.safety.needsAssessment) reason = 'PAIN';
  else if (r.unexpectedFatigue || r.sessionRpe >= target + 2) reason = 'RECOVERY';
  else if (r.completionFraction < .95 || inRangeFraction < .8 || speedDropFraction > .05 + 1e-12) reason = r.conditions.heat || r.conditions.wind ? 'ENVIRONMENT' : 'EXECUTION';
  if (reason) return {...base, evaluation: 'YELLOW', yellowReason: reason === 'PAIN' ? 'PAIN' : r.yellowReason ?? reason};
  if (r.completionFraction === 1 && inRangeFraction >= .8 && speedDropFraction <= .05 + 1e-12 && r.sessionRpe <= target - 1 && r.safety.pain <= 1) return {...base, evaluation: 'GREEN_PLUS', yellowReason: null};
  if (r.completionFraction >= .95 && inRangeFraction >= .8 && speedDropFraction <= .05 + 1e-12 && Math.abs(r.sessionRpe - target) <= 1 && r.safety.pain <= 1) return {...base, evaluation: 'GREEN', yellowReason: null};
  return {...base, evaluation: 'YELLOW', yellowReason: r.yellowReason ?? 'OTHER'};
}
export function yellowFamily(reason: YellowReason): string {
  // Full execution at excessive RPE and an incomplete session with tired legs are comparable recovery failures.
  return reason === 'EXECUTION' || reason === 'RECOVERY' ? 'TOLERANCE' : reason;
}
