/**
 * Explicit, deterministic behaviour model of the virtual athlete.
 *
 * Every result typed into the UI is produced here from (workout prescription, execution mode, seed).
 * The model also declares what the *methodology* (docs/*, issue #23) allows the verdict to be, so a
 * test can fail instead of "always GREEN". Nothing here changes the methodology or the engine.
 */
import type {Evaluation} from '../../src/models.ts';

/** mulberry32: tiny seeded PRNG so every run with the same seed is identical. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WorkoutLite {
  id: string;
  scheduledDate: string;
  type: string;
  goal: string;
  countsAsQuality: boolean;
  warmupMinutes: number;
  cooldownMinutes: number;
  main: {mode: string; dose: {unit: 'MINUTES' | 'METERS'; value: number}; repeats: number; repeatMeters: number | null; finalRepeatMeters: number | null};
  targetRpe: [number, number];
  speedRangeMps: [number, number] | null;
  restSeconds: number;
  movable: boolean;
  minimumRecoveryHoursBeforeQuality: number;
}

/** How the virtual athlete executes a session. */
export type ExecutionMode =
  | 'ON_PLAN'      // full execution, RPE inside the planned range, intervals inside the planned pace range
  | 'PARTIAL'      // only about half of the task done, RPE in range, no repeat times typed in
  | 'SYMPTOMS'     // hypothetical report of a stop-level symptom (altered movement + pain 4)
  | 'TOO_HARD';    // everything done but RPE = planned top + 2 and unusual fatigue reported

export interface SafetyReport {pain: number; flags: string[]}

export interface PlannedReport {
  mode: ExecutionMode;
  completion: 'FULL' | 'HALF' | 'LESS_THAN_HALF';
  completionFraction: number;
  rpe: number;
  /** Repeat rows to type: m:ss + metres. Empty = leave blank (engine must warn and still accept). */
  repeats: {seconds: string; meters: number}[];
  unexpectedFatigue: boolean;
  safety: SafetyReport | null;
  /** Verdicts the methodology allows for this report. The test FAILS if the engine answers otherwise. */
  allowedEvaluations: Evaluation[];
  rationale: string;
}

export function fmtSeconds(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function repeatMetersList(w: WorkoutLite): number[] {
  const count = Math.max(1, w.main.repeats);
  return Array.from({length: count}, (_, index) =>
    (index === count - 1 ? w.main.finalRepeatMeters : null) ?? w.main.repeatMeters ?? 0);
}

export function planReport(w: WorkoutLite, mode: ExecutionMode, rng: () => number): PlannedReport {
  const [lo, hi] = w.targetRpe;
  const intervals = w.speedRangeMps !== null && w.main.repeats > 0;
  const inRangeRpe = lo + Math.round(rng() * (hi - lo));
  const repeats: PlannedReport['repeats'] = [];
  if (mode === 'ON_PLAN' || mode === 'TOO_HARD') {
    if (intervals) {
      const [slow, fast] = w.speedRangeMps!;
      const count = Math.max(1, w.main.repeats);
      for (const planned of repeatMetersList(w)) {
        // seeded position inside the planned pace range (never outside it)
        const speed = slow + (fast - slow) * (0.2 + 0.6 * rng());
        if (planned > 0) repeats.push({seconds: fmtSeconds(planned / speed), meters: planned});
        else {
          // timed block (continuous threshold or time-based intervals): the form prefills 0 m, so the athlete
          // types the planned time and the distance covered at a speed inside the planned range
          const seconds = w.main.dose.unit === 'MINUTES' ? (w.main.dose.value * 60) / count : 0;
          repeats.push({seconds: fmtSeconds(seconds), meters: Math.round(speed * seconds)});
        }
      }
    }
  }
  switch (mode) {
    case 'ON_PLAN':
      return {mode, completion: 'FULL', completionFraction: 1, rpe: inRangeRpe, repeats, unexpectedFatigue: false, safety: null,
        allowedEvaluations: ['GREEN', 'GREEN_PLUS'],
        rationale: 'Полное выполнение, усилие и темп внутри плановых диапазонов, симптомов нет: вердикт не может быть YELLOW/RED.'};
    case 'PARTIAL':
      return {mode, completion: 'HALF', completionFraction: 0.5, rpe: inRangeRpe, repeats: [], unexpectedFatigue: false, safety: null,
        allowedEvaluations: ['YELLOW'],
        rationale: 'Выполнена примерно половина: такой результат не может считаться GREEN/GREEN_PLUS; симптомов нет, значит и не RED.'};
    case 'SYMPTOMS':
      return {mode, completion: 'LESS_THAN_HALF', completionFraction: 0.25, rpe: Math.min(10, hi + 2), repeats: [], unexpectedFatigue: true,
        safety: {pain: 4, flags: ['alteredMovement']},
        allowedEvaluations: ['RED'],
        rationale: 'Боль меняет технику движения (стоп-флаг): методика требует RED и остановки обычной нагрузки.'};
    case 'TOO_HARD':
      return {mode, completion: 'FULL', completionFraction: 1, rpe: Math.min(10, hi + 2), repeats, unexpectedFatigue: true, safety: null,
        allowedEvaluations: ['YELLOW'],
        rationale: 'Всё выполнено, но усилие на 2 пункта выше плана и необычная усталость: не GREEN/GREEN_PLUS, симптомов боли нет — не RED.'};
  }
}

/** Fictional measured 3000 m result for a control/measurement update: never an improvement. */
export function measuredResultSeconds(baselineSeconds: number | null, fallbackSeconds: number, factor: number): number {
  const base = baselineSeconds ?? fallbackSeconds;
  return Math.round(base * factor);
}
