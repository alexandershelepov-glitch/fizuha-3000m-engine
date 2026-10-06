/**
 * Display helpers: they turn engine values into human strings using the copy layer.
 * Purely presentational — no threshold, range or verdict is computed here.
 */
import {formatDateShort, formatTime} from '../application/format.ts';
import type {SafetyData, Workout} from '../application/engineGateway.ts';
import {doseUnitText, mainModeText, workoutGoalText, workoutTypeText} from './copy/values.ts';
import {today as todayText} from './copy/text.ts';

export function workoutTitle(workout: Workout): string {
  return workoutTypeText[workout.type].label;
}

export function workoutGoal(workout: Workout): string {
  return workoutGoalText[workout.goal];
}

export function workoutMode(workout: Workout): string {
  return mainModeText[workout.main.mode];
}

/** Volume as the engine expressed it: minutes or metres, plus the number of repeats. */
export function workoutVolume(workout: Workout): string {
  const dose = `${workout.main.dose.value} ${doseUnitText[workout.main.dose.unit]}`;
  if (workout.main.mode !== 'INTERVALS' || workout.main.repeats <= 1) return dose;
  const meters = workout.main.repeatMeters ?? workout.main.finalRepeatMeters;
  return meters === null || meters === undefined
    ? `${workout.main.repeats} × ${dose}`
    : `${workout.main.repeats} × ${Math.round(meters)} м`;
}

/** Pace range exactly as the engine ordered it; falls back to converting the speed range. */
export function workoutPaceRange(workout: Workout): string | null {
  const pace = workout.paceRangeSecondsPerKm;
  if (pace !== null) return `${formatTime(pace[0])}–${formatTime(pace[1])} /км`;
  const speed = workout.speedRangeMps;
  if (speed === null) return null;
  return `${formatTime(1000 / speed[1])}–${formatTime(1000 / speed[0])} /км`;
}

export function workoutRpe(workout: Workout): string {
  const [low, high] = workout.targetRpe;
  return low === high ? `План: ${low}` : `План: ${low}–${high}`;
}

export function workoutRest(workout: Workout): string | null {
  if (workout.main.mode !== 'INTERVALS' || workout.restSeconds <= 0) return null;
  return `отдых ${workout.restSeconds} секунд`;
}

export function workoutDate(workout: Workout): string {
  return formatDateShort(workout.scheduledDate);
}

export function workoutLine(workout: Workout): string {
  return `${workoutTitle(workout)} · ${workoutDate(workout)}`;
}

/** True when the user flagged anything in the safety block; used to stay honest without judging. */
export function safetyHasFlags(safety: SafetyData): boolean {
  return safety.pain > 0 || safety.painIncreasing || safety.alteredMovement || safety.painWalkingOrRest
    || safety.swelling || safety.acuteIllness || safety.otherStop || safety.needsAssessment;
}

export function restSummaryText(hasNext: boolean): string {
  return hasNext ? todayText.rest.next : todayText.rest.noNext;
}
