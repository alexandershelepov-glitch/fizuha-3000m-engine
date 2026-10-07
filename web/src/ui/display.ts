/**
 * Display helpers: they turn engine values into human strings using the copy layer.
 * Purely presentational — no threshold, range or verdict is computed here.
 */
import {formatDateShort, formatTime} from '../application/format.ts';
import type {DoseUnit, SafetyData, Workout, WorkoutMainMode, WorkoutType} from '../application/engineGateway.ts';
import {doseUnitText, mainModeText, workoutGoalText, workoutTypeText} from './copy/values.ts';
import {today as todayText} from './copy/text.ts';
import {intervalStructure, workoutIntervals} from './workoutInstructions.ts';

export function workoutTitle(workout: Workout): string {
  return workoutTypeText[workout.type].label;
}

export function workoutGoal(workout: Workout): string {
  return workoutGoalText[workout.goal];
}

export function workoutMode(workout: Workout): string {
  return mainModeText[workout.main.mode];
}

/**
 * Volume as the engine expressed it: minutes or metres, and for intervals the repeat structure read
 * from the one helper that understands it (repeats is the total, the last repeat may be shorter).
 */
export function workoutVolume(workout: Workout): string {
  const dose = `${Math.round(workout.main.dose.value)} ${doseUnitText[workout.main.dose.unit]}`;
  // One structure helper for every interval kind: distance repeats and time repeats.
  const intervals = workoutIntervals(workout);
  return intervals === null ? dose : intervals.label;
}

/** The interval structure as a compact row, or null when the workout is not made of intervals. */
export function workoutIntervalsText(workout: Workout): string | null {
  return workoutIntervals(workout)?.label ?? null;
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

/** A compact, human line for a prescription: type, volume and date. */
export function workoutSummaryText(summary: {type: WorkoutType; date: string; mode: WorkoutMainMode; doseValue: number; doseUnit: DoseUnit; repeats: number; repeatMeters: number | null; finalRepeatMeters: number | null}): string {
  // The same structure the instruction, the cards and the technical block use.
  const intervals = intervalStructure({
    mode: summary.mode,
    doseValue: summary.doseValue,
    doseUnit: summary.doseUnit,
    repeats: summary.repeats,
    repeatMeters: summary.repeatMeters,
    finalRepeatMeters: summary.finalRepeatMeters,
  });
  const volume = intervals === null ? `${Math.round(summary.doseValue)} ${doseUnitText[summary.doseUnit]}` : intervals.label;
  return `${workoutTypeText[summary.type].label} · ${volume} · ${formatDateShort(summary.date)}`;
}

/** Pace range as the engine ordered it. */
export function paceRangeText(pace: readonly [number, number] | null): string | null {
  return pace === null ? null : `${formatTime(pace[0])}–${formatTime(pace[1])} /км`;
}
