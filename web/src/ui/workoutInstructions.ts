/**
 * The workout card, written for someone who has never put a training session together.
 *
 * This module is presentation only. It never decides what to train: every number and every step comes
 * from a field of the Workout the engine already prescribed, and a value the engine did not provide is
 * left out instead of guessed. The only arithmetic is unit conversion on the engine's own values:
 *
 *   - pace per kilometre → time for one repeat:  splitSeconds = pace × distance / 1000;
 *   - total main-work time → time of one repeat: seconds = minutes × 60 / repeats.
 *
 * The instruction is never stored: it is derived from the current Workout every time it is shown
 * (docs/pwa-architecture.md §9, docs/ui-copy.md §10).
 */
import {shortTime} from '../application/format.ts';
import type {DoseUnit, Workout, WorkoutMainMode} from '../application/engineGateway.ts';
import {counts, distanceText, durationText, instruction as copy} from './copy/text.ts';
import {effortCueText, scaleLabels, workoutTypeText} from './copy/values.ts';

/** The repeat data of a prescription, from a Workout or from a plan-change summary. */
export interface RepeatParts {
  readonly repeats: number;
  readonly repeatMeters: number | null;
  readonly finalRepeatMeters: number | null;
}

/**
 * The repeat structure of a prescription, read the way the engine writes it:
 *
 *   repeats           — the TOTAL number of repeats;
 *   repeatMeters      — the standard length, used by every repeat but the last;
 *   finalRepeatMeters — the length of the LAST repeat.
 *
 * So `4 × 600 m, final 400 m` means three 600 m repeats and one 400 m repeat, never five repeats.
 * This is the only place the structure is interpreted: the instruction, the technical block and the
 * list rows all read it from here.
 */
export interface RepeatStructure {
  readonly totalRepeats: number;
  readonly standardMeters: number;
  readonly finalMeters: number;
  readonly uniform: boolean;
  /** "4 × 600 м", "3 × 600 м + 1 × 400 м", "1 × 480 м" */
  readonly label: string;
  readonly volumeMeters: number;
}

/** Repeat lengths in a compact row: "600 м". Sentences spell the words out instead. */
function shortMeters(meters: number): string {
  return `${Math.round(meters)} м`;
}

export function repeatStructure(parts: RepeatParts): RepeatStructure | null {
  const standard = parts.repeatMeters;
  if (standard === null || standard <= 0) return null;

  const total = Math.max(1, Math.round(parts.repeats));
  const final = parts.finalRepeatMeters === null || parts.finalRepeatMeters <= 0 ? standard : parts.finalRepeatMeters;

  // One repeat: only its own actual length is prescribed.
  if (total === 1) {
    return {
      totalRepeats: 1,
      standardMeters: final,
      finalMeters: final,
      uniform: true,
      label: `1 × ${shortMeters(final)}`,
      volumeMeters: final,
    };
  }

  if (Math.round(final) === Math.round(standard)) {
    return {
      totalRepeats: total,
      standardMeters: standard,
      finalMeters: standard,
      uniform: true,
      label: `${total} × ${shortMeters(standard)}`,
      volumeMeters: total * standard,
    };
  }

  return {
    totalRepeats: total,
    standardMeters: standard,
    finalMeters: final,
    uniform: false,
    label: `${total - 1} × ${shortMeters(standard)} + 1 × ${shortMeters(final)}`,
    volumeMeters: (total - 1) * standard + final,
  };
}

/**
 * The interval structure of a prescription, whichever way the engine expressed it.
 *
 * Distance intervals carry `repeatMeters`; time intervals carry only a total main-work time and a
 * count, so the length of one repeat is `dose.value × 60 / repeats` — the engine's own total split by
 * the engine's own count, never a new prescription.
 */
export interface IntervalStructure {
  readonly kind: 'DISTANCE' | 'TIME';
  readonly totalRepeats: number;
  /** "3 × 600 м + 1 × 400 м" or "4 × 2:00" */
  readonly label: string;
  readonly volumeMeters: number | null;
  readonly perRepeatSeconds: number | null;
  readonly exactSecondsPerRepeat: boolean;
  readonly totalWorkSeconds: number | null;
}

/** Display units make a time repeat unambiguous (51 с, 2 мин, 4 мин 30 с). */
export function compactDuration(valueSeconds: number): string {
  const seconds = Math.round(valueSeconds);
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} мин` : `${minutes} мин ${rest} с`;
}

export interface IntervalParts extends RepeatParts {
  readonly mode: WorkoutMainMode;
  readonly doseValue: number;
  readonly doseUnit: DoseUnit;
}

export function intervalStructure(parts: IntervalParts): IntervalStructure | null {
  if (parts.mode !== 'INTERVALS') return null;

  const distance = repeatStructure(parts);
  if (distance !== null) {
    return {kind: 'DISTANCE', totalRepeats: distance.totalRepeats, label: distance.label, volumeMeters: distance.volumeMeters, perRepeatSeconds: null, exactSecondsPerRepeat: true, totalWorkSeconds: null};
  }

  // A time interval: split the total main work by the number of repeats the engine prescribed.
  if (parts.doseUnit !== 'MINUTES' || parts.repeats <= 1) return null;
  const totalWorkSeconds = Math.round(parts.doseValue * 60);
  const perRepeatSeconds = Math.round(totalWorkSeconds / parts.repeats);
  // Fractional seconds per interval are only an approximation on a stopwatch. Keep the actual
  // total separately and explicitly mark rounded repeat lengths as approximate.
  const exactSecondsPerRepeat = totalWorkSeconds === perRepeatSeconds * parts.repeats;
  return {
    kind: 'TIME',
    totalRepeats: Math.round(parts.repeats),
    label: `${Math.round(parts.repeats)} × ${exactSecondsPerRepeat ? '' : '≈'}${compactDuration(perRepeatSeconds)}`,
    volumeMeters: null,
    perRepeatSeconds,
    exactSecondsPerRepeat,
    totalWorkSeconds,
  };
}

/** The same structures, read from a full workout. */
export function workoutRepeats(workout: Workout): RepeatStructure | null {
  return repeatStructure({
    repeats: workout.main.repeats,
    repeatMeters: workout.main.repeatMeters,
    finalRepeatMeters: workout.main.finalRepeatMeters,
  });
}

export function workoutIntervals(workout: Workout): IntervalStructure | null {
  return intervalStructure({
    mode: workout.main.mode,
    doseValue: workout.main.dose.value,
    doseUnit: workout.main.dose.unit,
    repeats: workout.main.repeats,
    repeatMeters: workout.main.repeatMeters,
    finalRepeatMeters: workout.main.finalRepeatMeters,
  });
}

export interface InstructionSplit {
  readonly distanceMeters: number;
  readonly seconds: readonly [number, number];
  /** "600 м примерно за 2:56–3:02" */
  readonly text: string;
}

export interface WorkoutInstruction {
  /** "Сегодня: 6 × 400 м" */
  readonly headline: string;
  readonly steps: readonly string[];
  /** The main feeling in words, taken from the existing effort scale. */
  readonly effort: string;
  /** "Усилие: 8–9 из 10" — the technical twin of the words above. */
  readonly effortScale: string;
  /** Orienting lines when the engine prescribed no pace, in the engine's own cues. */
  readonly guidance: readonly string[];
  readonly splits: readonly InstructionSplit[];
  /** The prescribed pace, kept for the technical block. */
  readonly paceText: string | null;
  readonly speedText: string | null;
  readonly estimatedDistanceText: string | null;
  readonly note: string | null;
}

/** Time for one distance at a prescribed pace. Unit conversion, rounded to whole seconds. */
export function splitSeconds(pace: readonly [number, number], distanceMeters: number): [number, number] {
  return [Math.round((pace[0] * distanceMeters) / 1000), Math.round((pace[1] * distanceMeters) / 1000)];
}

/** The pace the engine ordered, or the one its speed range is equal to. */
export function prescribedPace(workout: Workout): [number, number] | null {
  if (workout.paceRangeSecondsPerKm !== null) return [workout.paceRangeSecondsPerKm[0], workout.paceRangeSecondsPerKm[1]];
  const speed = workout.speedRangeMps;
  return speed === null ? null : [1000 / speed[1], 1000 / speed[0]];
}

/** Seconds as a pace per kilometre: "4:54–5:03 /км". */
export function paceRangeText(pace: readonly [number, number] | null): string | null {
  return pace === null ? null : `${shortTime(pace[0])}–${shortTime(pace[1])} мин/км`;
}

/** Convert the engine-prescribed pace range to an equivalent treadmill speed (no new target). */
export function treadmillSpeedText(workout: Workout): string | null {
  const pace = prescribedPace(workout);
  if (pace === null) return null;
  const speedLow = (3600 / pace[1]).toFixed(1).replace('.', ',');
  const speedHigh = (3600 / pace[0]).toFixed(1).replace('.', ',');
  return speedLow === speedHigh ? `${speedLow} км/ч` : `${speedLow}–${speedHigh} км/ч`;
}

/**
 * Optional approximate distance from an existing pace and a TIME-based repeat.
 * Not a required distance: the engine ordered seconds, not metres. Round OUTWARDS to 10 m.
 */
export function estimatedTimeRepeatDistance(workout: Workout): string | null {
  const intervals = workoutIntervals(workout);
  const pace = prescribedPace(workout);
  if (intervals?.kind !== 'TIME' || intervals.perRepeatSeconds === null || pace === null) return null;
  const lower = Math.floor((1000 * intervals.perRepeatSeconds / pace[1]) / 10) * 10;
  const upper = Math.ceil((1000 * intervals.perRepeatSeconds / pace[0]) / 10) * 10;
  return lower === upper ? `около ${lower} м` : `примерно ${lower}–${upper} м`;
}

/** The nearest word the existing effort scale already has for this range. Ties pick the harder one. */
export function effortFor(workout: Workout): string {
  const points = Object.keys(scaleLabels).map(Number).sort((a, b) => a - b);
  const middle = (workout.targetRpe[0] + workout.targetRpe[1]) / 2;
  let nearest = points[0] ?? 0;
  for (const point of points) if (Math.abs(point - middle) <= Math.abs(nearest - middle)) nearest = point;
  return scaleLabels[nearest] ?? '';
}

/** "8–9" or "5" — exactly the range the engine prescribed. */
export function effortRangeText(workout: Workout): string {
  const [low, high] = workout.targetRpe;
  return low === high ? `${low}` : `${low}–${high}`;
}

function splitsFor(workout: Workout): InstructionSplit[] {
  const pace = prescribedPace(workout);
  const structure = workoutRepeats(workout);
  if (pace === null || structure === null) return [];
  // The standard length and, when the last repeat is shorter, that one too — nothing else.
  const distances = structure.uniform
    ? [structure.standardMeters]
    : [structure.standardMeters, structure.finalMeters];
  return distances.map((distance) => {
    const seconds = splitSeconds(pace, distance);
    return {
      distanceMeters: Math.round(distance),
      seconds,
      text: copy.splitLine(counts.meters(Math.round(distance)), `${shortTime(seconds[0])}–${shortTime(seconds[1])}`),
    };
  });
}

function guidanceFor(workout: Workout): string[] {
  if (workout.type === 'EASY' || workout.type === 'LONG_EASY') {
    if (workout.effortCues.length === 0) return [copy.easyGenericCue];
    return workout.effortCues.map((cue) => effortCueText[cue]);
  }
  return [];
}

/** The headline names the work in the units the engine actually prescribed. */
function headlineFor(workout: Workout): string {
  const {mode, dose, repeats, repeatMeters, finalRepeatMeters} = workout.main;
  if (mode === 'REST') return workoutTypeText.REST.label.toLowerCase();

  if (mode === 'INTERVALS' || mode === 'RUN_WALK') {
    if (mode === 'RUN_WALK') return `${workoutTypeText[workout.type].label.toLowerCase()} · ${distanceText(dose.value)}`;
    // One structure helper for both kinds of intervals: distance repeats and time repeats.
    const intervals = workoutIntervals(workout);
    if (intervals !== null) return intervals.label;
    void repeatMeters;
    void finalRepeatMeters;
    return counts.repeats(repeats);
  }

  const label = workoutTypeText[workout.type].label.toLowerCase();
  // A 3000 m test is named in metres, an easy run in kilometres: the engine's own unit stays visible.
  if (workout.type === 'CONTROL') return `${label} ${copy.controlDistance(workout)}`;
  if (dose.unit === 'MINUTES') return `${label} ${counts.minutes(Math.round(dose.value))}`;
  return `${label} ${distanceText(dose.value)}`;
}

function intervalSteps(workout: Workout, splits: readonly InstructionSplit[]): string[] {
  const steps: string[] = [];
  const {dose, repeats} = workout.main;
  const structure = workoutRepeats(workout);
  if (structure !== null) {
    // One repeat carries only its own length; the engine does not prescribe a standard one as well.
    if (structure.totalRepeats === 1) steps.push(copy.singleDistance(counts.meters(Math.round(structure.finalMeters))));
    else if (structure.uniform) steps.push(copy.repeatsOfDistance(structure.totalRepeats, counts.meters(Math.round(structure.standardMeters))));
    else {
      steps.push(copy.repeatsOfDistanceWithFinal(
        structure.totalRepeats,
        counts.meters(Math.round(structure.standardMeters)),
        counts.meters(Math.round(structure.finalMeters)),
      ));
    }
  } else {
    const intervals = workoutIntervals(workout);
    steps.push(intervals?.perRepeatSeconds === null || intervals === null
      ? copy.repeatsTotal(repeats, dose.unit === 'MINUTES' ? counts.minutes(Math.round(dose.value)) : distanceText(dose.value))
      : copy.repeatsOfDuration(repeats, durationText(intervals.perRepeatSeconds), intervals.exactSecondsPerRepeat));
  }

  // The time of one repeat is the main reference for someone on a track. When the engine prescribed
  // a pace but no distance, only that pace can be stated — the distance is never invented.
  if (splits.length === 1) {
    steps.push(copy.intervalTargetOne(`${shortTime(splits[0]!.seconds[0])}–${shortTime(splits[0]!.seconds[1])}`));
  } else if (splits.length > 1) {
    const first = splits[0]!;
    const last = splits[1]!;
    steps.push(copy.intervalTargetSplit(counts.meters(first.distanceMeters), `${shortTime(first.seconds[0])}–${shortTime(first.seconds[1])}`));
    steps.push(copy.intervalTargetFinal(counts.meters(last.distanceMeters), `${shortTime(last.seconds[0])}–${shortTime(last.seconds[1])}`));
  }

  const speed = treadmillSpeedText(workout);
  const pace = paceRangeText(prescribedPace(workout));
  if (pace !== null) {
    steps.push(copy.targetPace(pace));
    if (speed !== null) steps.push(copy.treadmillSpeed(speed));
  } else {
    steps.push(copy.unpacedIntervals);
  }

  if (workoutIntervals(workout)?.kind === 'TIME') {
    const estimate = estimatedTimeRepeatDistance(workout);
    steps.push(estimate === null ? copy.timeIntervalsNoDistance : copy.timeIntervalsEstimatedDistance(estimate));
  }
  if (workout.restSeconds > 0 && repeats > 1) {
    steps.push(copy.restBetweenRepeats(durationText(workout.restSeconds)));
  }
  return steps;
}

function continuousSteps(workout: Workout, paceText: string | null): string[] {
  const steps: string[] = [];
  const {mode, dose} = workout.main;

  if (workout.type === 'CONTROL') {
    steps.push(copy.control(copy.controlDistance(workout)));
    steps.push(copy.controlNoPace);
    steps.push(copy.controlEffort);
    return steps;
  }

  if (mode === 'RUN_WALK') {
    // The workout carries the mode and the total volume, but no run/walk pattern: none is described.
    steps.push(copy.runWalk);
    steps.push(copy.runWalkTotal(distanceText(dose.value)));
    steps.push(copy.runWalkPattern);
    return steps;
  }

  if (paceText === null) {
    const what = dose.unit === 'MINUTES' ? counts.minutes(Math.round(dose.value)) : distanceText(dose.value);
    if (workout.type === 'EASY' || workout.type === 'LONG_EASY') {
      steps.push(copy.easyContinuous(distanceText(dose.value)));
      steps.push(copy.easyNoNeed);
      steps.push(copy.easySlowDown);
      steps.push(copy.easyStop);
    } else {
      // The engine ordered a quality session but no pace to hold: say so instead of inventing one.
      steps.push(copy.continuousByEffort(what));
      steps.push(copy.noteNoPace);
    }
    return steps;
  }

  steps.push(dose.unit === 'MINUTES'
    ? copy.continuousMinutes(Math.round(dose.value), paceText)
    : copy.continuousDistance(distanceText(dose.value), paceText));
  const speed = treadmillSpeedText(workout);
  if (speed !== null) steps.push(copy.treadmillSpeed(speed));
  steps.push(copy.continuousHoldPace);
  return steps;
}

export function workoutInstruction(workout: Workout): WorkoutInstruction {
  const pace = prescribedPace(workout);
  const paceText = paceRangeText(pace);
  const splits = splitsFor(workout);
  const steps: string[] = [];

  // A rest day carries no work at all: it is stated, not dressed up as a session.
  if (workout.main.mode === 'REST') {
    return {
      headline: copy.today(headlineFor(workout)),
      steps: [copy.rest],
      effort: effortFor(workout),
      effortScale: copy.effortScale(effortRangeText(workout)),
      guidance: [],
      splits: [],
      paceText: null,
      speedText: null,
      estimatedDistanceText: null,
      note: null,
    };
  }

  // Warm-up and cool-down are part of the task, not a technical line below it.
  if (workout.warmupMinutes > 0) steps.push(copy.warmup(workout.warmupMinutes));

  const isInterval = workout.main.mode === 'INTERVALS';
  steps.push(...(isInterval ? intervalSteps(workout, splits) : continuousSteps(workout, paceText)));

  if (workout.cooldownMinutes > 0) {
    steps.push(isInterval ? copy.cooldownAfterRepeats(workout.cooldownMinutes) : copy.cooldown(workout.cooldownMinutes));
  }

  return {
    headline: copy.today(headlineFor(workout)),
    steps,
    effort: effortFor(workout),
    effortScale: copy.effortScale(effortRangeText(workout)),
    guidance: workout.main.mode === 'INTERVALS' ? [] : guidanceFor(workout),
    splits,
    paceText,
    speedText: treadmillSpeedText(workout),
    estimatedDistanceText: estimatedTimeRepeatDistance(workout),
    note: noteFor(workout, paceText),
  };
}

function noteFor(workout: Workout, paceText: string | null): string | null {
  if (workout.main.mode === 'INTERVALS') {
    if (workout.type === 'STRIDES') return copy.stridesNote;
    return workout.restSeconds > 0 ? copy.noteIntervalsFast : null;
  }
  if (workout.type === 'CONTROL' || workout.type === 'REST') return null;
  // Easy running explains itself through its cues; a quality session without a pace needs the line.
  if (workout.type === 'EASY' || workout.type === 'LONG_EASY' || workout.main.mode === 'RUN_WALK') return null;
  return paceText === null ? copy.noteNoPace : null;
}
