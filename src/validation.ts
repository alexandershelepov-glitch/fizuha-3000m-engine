import type { Profile, SafetyData, WorkoutResult } from './models.ts';
export function day(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must be YYYY-MM-DD');
  const ms = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar date');
  return ms / 86400000;
}
export function addDays(date: string, days: number): string { return new Date((day(date) + days) * 86400000).toISOString().slice(0, 10); }
export function number(value: number, min: number, max = Infinity): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Number outside ${min}..${max}`);
}
export function validateSafety(s: SafetyData): void {
  number(s.pain, 0, 10);
  for (const field of ['painIncreasing', 'alteredMovement', 'painWalkingOrRest', 'swelling', 'acuteIllness', 'otherStop', 'needsAssessment'] as const) if (typeof s[field] !== 'boolean') throw new Error('Invalid safety flag');
}
/**
 * Controlled failure raised when the active v1.0 plan would operate after the target race date.
 * The engine is active up to and including `raceDate`; there is deliberately no post-race phase.
 */
export class EventDatePassedError extends Error {
  readonly code = 'EVENT_DATE_PASSED';
  constructor(message = 'EVENT_DATE_PASSED: the active plan works only up to and including the target race date') {
    super(message); this.name = 'EventDatePassedError';
  }
}
/** `raceDate = now` is valid; only `now > raceDate` is rejected. */
export function validateEventDate(p: Profile, now: string): void {
  if (day(now) > day(p.raceDate)) throw new EventDatePassedError();
}
export function validateProfile(p: Profile, now: string): void {
  day(now); day(p.raceDate);
  validateEventDate(p, now);
  number(p.targetTimeSeconds, 1);
  for (const n of [p.regularRunningWeeks, p.actualRunsPerWeek, p.averageWeeklyKm4Weeks, p.longestUsualRunKm, p.qualitySessions8Weeks]) number(n, 0);
  number(p.actualRunsPerWeek, 0, 7); number(p.availableRunsPerWeek, 1, 7);
  if (!Number.isInteger(p.availableRunsPerWeek)) throw new Error('Availability must be integer');
  number(p.qualityWeeks8Weeks, 0, 8);
  if (!Number.isInteger(p.qualityWeeks8Weeks) || p.qualityWeeks8Weeks > p.qualitySessions8Weeks) throw new Error('Invalid quality weeks');
  if (!['NONE', 'MODERATE', 'CLEAR'].includes(p.performanceMismatch)) throw new Error('Invalid mismatch');
  for (const flag of [p.canRun3Km, p.qualityMostlyTolerated, p.experience.threshold, p.experience.vo2, p.experience.specific3k]) if (typeof flag !== 'boolean') throw new Error('Invalid profile flag');
  if (p.performance && !['TEST_3K', 'OFFICIAL_3K'].includes(p.performance.source)) throw new Error('Invalid performance source');
  if (p.performance) { number(p.performance.timeSeconds, 1); if (day(p.performance.date) > day(now)) throw new Error('Future performance'); }
  for (const b of p.breaks) { if (!['WORK', 'OTHER_HEALTHY', 'ILLNESS', 'INJURY'].includes(b.reason)) throw new Error('Invalid break reason'); number(b.days, 1); if (!Number.isInteger(b.days) || day(b.endDate) > day(now)) throw new Error('Invalid break'); }
  validateSafety(p.safety);
}
export function validateResult(r: WorkoutResult): void {
  if (r.yellowReason && !['EXECUTION', 'RECOVERY', 'ENVIRONMENT', 'ILLNESS', 'PAIN', 'PACE_PRESCRIPTION', 'OTHER'].includes(r.yellowReason)) throw new Error('Invalid yellow reason');
  if (typeof r.unexpectedFatigue !== 'boolean') throw new Error('Invalid fatigue flag');
  day(r.date); number(r.completionFraction, 0, 1); number(r.sessionRpe, 0, 10);
  number(r.durationMinutes, 0); number(r.distanceMeters, 0); validateSafety(r.safety);
  for (const rep of r.repeats) { number(rep.distanceMeters, 1); number(rep.seconds, 0.001); }
  for (const rest of r.restSeconds) number(rest, 0);
}
