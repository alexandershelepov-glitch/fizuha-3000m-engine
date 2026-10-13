import type { Profile, SafetyData, WorkoutResult } from './models.ts';
import { BREAK_REASONS, PERFORMANCE_MISMATCH_LEVELS, PERFORMANCE_SOURCES, YELLOW_REASONS } from './models.ts';
import { EngineError, EventDatePassedError } from './errors.ts';
export function day(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new EngineError('INVALID_DATE_FORMAT');
  const ms = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) throw new EngineError('INVALID_CALENDAR_DATE');
  return ms / 86400000;
}
export function addDays(date: string, days: number): string { return new Date((day(date) + days) * 86400000).toISOString().slice(0, 10); }
export function number(value: number, min: number, max = Infinity): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new EngineError('NUMBER_OUT_OF_RANGE', {min, max, value});
}
export function validateSafety(s: SafetyData): void {
  number(s.pain, 0, 10);
  for (const field of ['painIncreasing', 'alteredMovement', 'painWalkingOrRest', 'swelling', 'acuteIllness', 'otherStop', 'needsAssessment'] as const) if (typeof s[field] !== 'boolean') throw new EngineError('INVALID_SAFETY_FLAG');
}
/** `raceDate = now` is valid; only `now > raceDate` is rejected. */
export function validateEventDate(p: Profile, now: string): void {
  if (day(now) > day(p.raceDate)) throw new EventDatePassedError();
}
/**
 * Structural and numeric validation of a profile. Deliberately independent of the event date, so
 * the terminal final-result state (whose clock is past `raceDate`) can still be loaded; every
 * active-plan operation goes through `validateProfile`, which adds the event-date rule.
 */
export function validateProfileShape(p: Profile, now: string): void {
  day(now); day(p.raceDate);
  number(p.targetTimeSeconds, 1);
  for (const n of [p.regularRunningWeeks, p.actualRunsPerWeek, p.averageWeeklyKm4Weeks, p.longestUsualRunKm, p.qualitySessions8Weeks]) number(n, 0);
  number(p.actualRunsPerWeek, 0, 7); number(p.availableRunsPerWeek, 1, 7);
  if (!Number.isInteger(p.availableRunsPerWeek)) throw new EngineError('AVAILABILITY_NOT_INTEGER');
  number(p.qualityWeeks8Weeks, 0, 8);
  if (!Number.isInteger(p.qualityWeeks8Weeks) || p.qualityWeeks8Weeks > p.qualitySessions8Weeks) throw new EngineError('INVALID_QUALITY_WEEKS');
  if (!PERFORMANCE_MISMATCH_LEVELS.includes(p.performanceMismatch)) throw new EngineError('INVALID_MISMATCH');
  for (const flag of [p.canRun3Km, p.qualityMostlyTolerated, p.experience.threshold, p.experience.vo2, p.experience.specific3k]) if (typeof flag !== 'boolean') throw new EngineError('INVALID_PROFILE_FLAG');
  if (p.performance && !PERFORMANCE_SOURCES.includes(p.performance.source)) throw new EngineError('INVALID_PERFORMANCE_SOURCE');
  if (p.performance) { number(p.performance.timeSeconds, 1); if (day(p.performance.date) > day(now)) throw new EngineError('FUTURE_PERFORMANCE'); }
  for (const b of p.breaks) { if (!BREAK_REASONS.includes(b.reason)) throw new EngineError('INVALID_BREAK_REASON'); number(b.days, 1); if (!Number.isInteger(b.days) || day(b.endDate) > day(now)) throw new EngineError('INVALID_BREAK'); }
  validateSafety(p.safety);
}
export function validateProfile(p: Profile, now: string): void {
  validateProfileShape(p, now);
  validateEventDate(p, now);
}
export function validateResult(r: WorkoutResult): void {
  if (r.yellowReason && !YELLOW_REASONS.includes(r.yellowReason)) throw new EngineError('INVALID_YELLOW_REASON');
  if (typeof r.unexpectedFatigue !== 'boolean') throw new EngineError('INVALID_FATIGUE_FLAG');
  if (r.verifiedForProgression !== undefined && typeof r.verifiedForProgression !== 'boolean') throw new EngineError('INVALID_PROFILE_FLAG');
  day(r.date); number(r.completionFraction, 0, 1); number(r.sessionRpe, 0, 10);
  number(r.durationMinutes, 0); number(r.distanceMeters, 0); validateSafety(r.safety);
  let knownRepeatMeters = 0;
  for (const rep of r.repeats) {
    number(rep.distanceMeters, 1); number(rep.seconds, 0.001);
    knownRepeatMeters += rep.distanceMeters;
  }
  // The total may also include warmup/cooldown, but cannot be LESS than measured splits.
  // Zero is allowed only when NO splits were measured (legacy "unknown" total).
  if (knownRepeatMeters > 0 && r.distanceMeters + 1e-6 < knownRepeatMeters) {
    throw new EngineError('RESULT_DISTANCE_CONFLICT');
  }
  for (const rest of r.restSeconds) number(rest, 0);
}
