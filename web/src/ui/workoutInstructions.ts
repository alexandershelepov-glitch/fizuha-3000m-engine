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
import type {Workout} from '../application/engineGateway.ts';
import {counts, distanceText, instruction as copy} from './copy/text.ts';
import {effortCueText, scaleLabels, workoutTypeText} from './copy/values.ts';

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
  return pace === null ? null : `${shortTime(pace[0])}–${shortTime(pace[1])} /км`;
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
  const meters = workout.main.repeatMeters;
  if (pace === null || meters === null) return [];
  const distances = new Set<number>([Math.round(meters)]);
  const final = workout.main.finalRepeatMeters;
  if (final !== null && final > 0) distances.add(Math.round(final));
  return [...distances].map((distance) => {
    const seconds = splitSeconds(pace, distance);
    return {
      distanceMeters: distance,
      seconds,
      text: copy.splitLine(counts.meters(distance), `${shortTime(seconds[0])}–${shortTime(seconds[1])}`),
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
    if (repeatMeters !== null) {
      const main = `${repeats} × ${counts.meters(Math.round(repeatMeters))}`;
      if (finalRepeatMeters !== null && finalRepeatMeters > 0 && Math.round(finalRepeatMeters) !== Math.round(repeatMeters)) {
        return `${main} + 1 × ${counts.meters(Math.round(finalRepeatMeters))}`;
      }
      return main;
    }
    const perRepeat = perRepeatSeconds(workout);
    return perRepeat === null
      ? counts.repeats(repeats)
      : `${repeats} × ${shortTime(perRepeat)}`;
  }

  const label = workoutTypeText[workout.type].label.toLowerCase();
  // A 3000 m test is named in metres, an easy run in kilometres: the engine's own unit stays visible.
  if (workout.type === 'CONTROL') return `${label} ${copy.controlDistance(workout)}`;
  if (dose.unit === 'MINUTES') return `${label} ${counts.minutes(Math.round(dose.value))}`;
  return `${label} ${distanceText(dose.value)}`;
}

/** Total main work divided by the engine's own repeat count. */
function perRepeatSeconds(workout: Workout): number | null {
  const {dose, repeats} = workout.main;
  if (dose.unit !== 'MINUTES' || repeats <= 1) return null;
  return Math.round((dose.value * 60) / repeats);
}

function intervalSteps(workout: Workout, splits: readonly InstructionSplit[]): string[] {
  const steps: string[] = [];
  const {dose, repeats, repeatMeters, finalRepeatMeters} = workout.main;
  const final = finalRepeatMeters === null || finalRepeatMeters <= 0 ? null : Math.round(finalRepeatMeters);

  if (repeatMeters !== null) {
    const meters = counts.meters(Math.round(repeatMeters));
    steps.push(final !== null && final !== Math.round(repeatMeters)
      ? copy.repeatsOfDistanceWithFinal(repeats, meters, counts.meters(final))
      : copy.repeatsOfDistance(repeats, meters));
  } else {
    const perRepeat = perRepeatSeconds(workout);
    steps.push(perRepeat === null
      ? copy.repeatsTotal(repeats, dose.unit === 'MINUTES' ? counts.minutes(Math.round(dose.value)) : distanceText(dose.value))
      : copy.repeatsOfDuration(repeats, shortTime(perRepeat)));
  }

  // The time of one repeat is the main reference for someone on a track. When the engine prescribed
  // a pace but no distance, only that pace can be stated — the distance is never invented.
  if (splits.length === 1) {
    steps.push(copy.intervalTargetOne(`${shortTime(splits[0]!.seconds[0])}–${shortTime(splits[0]!.seconds[1])}`));
  } else if (splits.length > 1) {
    const first = splits[0]!;
    const other = splits[1]!;
    steps.push(copy.intervalTargetSplit(counts.meters(first.distanceMeters), `${shortTime(first.seconds[0])}–${shortTime(first.seconds[1])}`));
    steps.push(copy.intervalTargetFinal(counts.meters(other.distanceMeters), `${shortTime(other.seconds[0])}–${shortTime(other.seconds[1])}`));
  } else if (workout.paceRangeSecondsPerKm !== null || workout.speedRangeMps !== null) {
    const paceText = paceRangeText(prescribedPace(workout));
    if (paceText !== null) steps.push(copy.intervalTargetPace(paceText));
  }

  if (workout.restSeconds > 0) {
    steps.push(copy.restAfterRepeat(workout.restSeconds));
    steps.push(copy.restHow);
  }
  return steps;
}

function continuousSteps(workout: Workout, paceText: string | null): string[] {
  const steps: string[] = [];
  const {mode, dose} = workout.main;

  if (workout.type === 'CONTROL') {
    steps.push(copy.control(copy.controlDistance(workout)));
    steps.push(copy.controlNoPace);
    return steps;
  }

  if (mode === 'RUN_WALK') {
    steps.push(copy.runWalk);
    steps.push(copy.runWalkTotal(distanceText(dose.value)));
    return steps;
  }

  if (paceText === null) {
    const what = dose.unit === 'MINUTES' ? counts.minutes(Math.round(dose.value)) : distanceText(dose.value);
    if (workout.type === 'EASY' || workout.type === 'LONG_EASY') {
      steps.push(copy.easyContinuous(distanceText(dose.value)));
      steps.push(copy.easyNoNeed);
      steps.push(copy.easySlowDown);
      steps.push(copy.easyWalk);
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
