import type { EngineState, Profile, SafetyData, Workout, WorkoutResult, WorkoutType } from '../src/index.ts';
import { recordResult, replan } from '../src/index.ts';
export const NOW = '2026-10-05';
export function dateAfter(days: number, from = NOW): string { return new Date(Date.parse(from + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10); }
export function healthy(): SafetyData { return {pain: 0, painIncreasing: false, alteredMovement: false, painWalkingOrRest: false, swelling: false, acuteIllness: false, otherStop: false, needsAssessment: false}; }
export function profile(overrides: Partial<Profile> = {}): Profile {
  return {performance: {timeSeconds: 920, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 896, raceDate: dateAfter(42),
    regularRunningWeeks: 20, actualRunsPerWeek: 3, availableRunsPerWeek: 3, averageWeeklyKm4Weeks: 16, longestUsualRunKm: 6, canRun3Km: true,
    qualitySessions8Weeks: 0, qualityWeeks8Weeks: 0, qualityMostlyTolerated: true, experience: {threshold: false, vo2: false, specific3k: false},
    breaks: [], safety: healthy(), performanceMismatch: 'NONE', ...overrides};
}
export function feedback(w: Workout, kind: 'GREEN' | 'GREEN_PLUS' | 'YELLOW' | 'RED' = 'GREEN', overrides: Partial<WorkoutResult> = {}): WorkoutResult {
  const target = (w.targetRpe[0] + w.targetRpe[1]) / 2;
  const speed = w.speedRangeMps ? (w.speedRangeMps[0] + w.speedRangeMps[1]) / 2 : 3;
  const repeats = w.speedRangeMps ? Array.from({length: 5}, () => ({distanceMeters: 600, seconds: 600 / speed})) : [];
  return {date: w.scheduledDate, completionFraction: kind === 'YELLOW' ? .7 : 1, sessionRpe: kind === 'GREEN_PLUS' ? target - 1.5 : target,
    safety: kind === 'RED' ? {...healthy(), alteredMovement: true} : healthy(), durationMinutes: 35, distanceMeters: 5000,
    repeats, restSeconds: repeats.map(() => w.restSeconds), conditions: {}, unexpectedFatigue: false, ...overrides};
}
export function nextQuality(s: EngineState, type?: WorkoutType): {state: EngineState; workout: Workout} {
  for (let n = 0; n < 30; n++) {
    const w = s.queue.find(w => w.countsAsQuality && (!type || w.type === type));
    if (w) return {state: s, workout: w};
    s = replan(s, dateAfter(1, s.asOf));
  }
  throw new Error('No quality workout');
}
export function performQuality(s: EngineState, kind: 'GREEN' | 'GREEN_PLUS' = 'GREEN'): EngineState {
  const next = nextQuality(s); return recordResult(next.state, next.workout.id, feedback(next.workout, kind));
}
export const experienced = {qualitySessions8Weeks: 8, qualityWeeks8Weeks: 6, experience: {threshold: true, vo2: true, specific3k: true}};
