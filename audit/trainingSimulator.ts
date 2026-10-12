/**
 * Read-only, deterministic audit harness for the public 3000 m engine.
 * This is NOT an athlete performance prediction, and it never reads real user storage.
 *
 * All observations come from actual engine transitions. Scripted feedback/medical clearance
 * and checkpoints are EXTERNAL HYPOTHETICAL INPUTS, not new sports prescriptions.
 */
import {
  addDays, applyBreak, createEngine, recordCheckpoint, recordFinalResult, recordResult,
  replan, resolveDiagnostic, skipWorkout,
} from '../src/index.ts';
import type {
  EngineState, Evaluation, Profile, SafetyData, Workout, WorkoutResult, WorkoutType,
} from '../src/index.ts';

export const SIM_START = '2026-10-12';
export const healthySafety = (): SafetyData => ({
  pain: 0, painIncreasing: false, alteredMovement: false, painWalkingOrRest: false,
  swelling: false, acuteIllness: false, otherStop: false, needsAssessment: false,
});

export type Athlete = 'beginner' | 'regular' | 'trained' | 'advanced';
export type Behaviour =
  | 'NORMAL' | 'EASIER' | 'OVERLOAD' | 'SKIP_EVERY_THIRD'
  | 'WORK_BREAK' | 'RED_AND_REVIEW' | 'CONTRADICTORY_REPORT';

export interface Scenario {
  id: string;
  athlete: Athlete;
  weeks: number;
  behaviour: Behaviour;
  /** Calendar days counted from the cycle start, containing explicit externally reported 3 km tests. */
  checkpointDays?: readonly number[];
  /** Only WORK_BREAK: a virtual period of no training, with explicit applyBreak at end. */
  breakStartDay?: number;
  breakLengthDays?: number;
}

export interface Event {
  day: string;
  week: number;
  action: string;
  workoutType: WorkoutType | null;
  workoutId: string | null;
  plannedDose: string | null;
  evaluation: Evaluation | null;
  actualRpe: number | null;
  reportedMeters: number | null;
  nextWorkoutType: WorkoutType | null;
  phase: string;
  gate: string;
  reasons: string[];
  comment: string;
}
export interface Finding {
  code: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  day: string;
  detail: string;
}
export interface WeekRow {
  week: number;
  prescribed: number;
  completed: number;
  rest: number;
  skipped: number;
  qualityCompleted: number;
  reportedMeters: number;
  firstPhase: string;
  lastPhase: string;
  evaluations: Record<Evaluation, number>;
}
export interface RunReport {
  scenario: Scenario;
  baselineSeconds: number;
  targetSeconds: number;
  feasibility: string | null;
  events: Event[];
  findings: Finding[];
  weeks: WeekRow[];
  lastState: EngineState;
  /** External race time is unchanged in this demonstration: this is NOT a simulated speed gain. */
  finalRaceSeconds: number | null;
}

const ATHLETE_PROFILES: Record<Athlete, {
  currentSeconds: number; goalSeconds: number; runsPerWeek: number; weeklyKm: number;
  longestKm: number; regularWeeks: number; qualitySessions: number; qualityWeeks: number;
  mostlyTolerated: boolean; experiences: boolean;
}> = {
  beginner: {currentSeconds: 1050, goalSeconds: 896, runsPerWeek: 2, weeklyKm: 8,
    longestKm: 4, regularWeeks: 6, qualitySessions: 0, qualityWeeks: 0, mostlyTolerated: false, experiences: false},
  regular: {currentSeconds: 920, goalSeconds: 870, runsPerWeek: 3, weeklyKm: 16,
    longestKm: 6, regularWeeks: 20, qualitySessions: 0, qualityWeeks: 0, mostlyTolerated: false, experiences: false},
  trained: {currentSeconds: 880, goalSeconds: 810, runsPerWeek: 4, weeklyKm: 28,
    longestKm: 9, regularWeeks: 40, qualitySessions: 4, qualityWeeks: 3, mostlyTolerated: true, experiences: true},
  advanced: {currentSeconds: 810, goalSeconds: 780, runsPerWeek: 5, weeklyKm: 45,
    longestKm: 12, regularWeeks: 120, qualitySessions: 8, qualityWeeks: 7, mostlyTolerated: true, experiences: true},
};

export function makeProfile(scenario: Scenario): Profile {
  const a = ATHLETE_PROFILES[scenario.athlete];
  return {
    performance: {timeSeconds: a.currentSeconds, date: SIM_START, source: 'TEST_3K'},
    targetTimeSeconds: a.goalSeconds, raceDate: addDays(SIM_START, scenario.weeks * 7),
    regularRunningWeeks: a.regularWeeks, actualRunsPerWeek: a.runsPerWeek,
    availableRunsPerWeek: a.runsPerWeek, averageWeeklyKm4Weeks: a.weeklyKm,
    longestUsualRunKm: a.longestKm, canRun3Km: true,
    qualitySessions8Weeks: a.qualitySessions, qualityWeeks8Weeks: a.qualityWeeks,
    qualityMostlyTolerated: a.mostlyTolerated,
    experience: {threshold: a.experiences, vo2: a.experiences, specific3k: a.experiences},
    breaks: [], safety: healthySafety(), performanceMismatch: 'NONE',
  };
}

export const SCENARIOS: readonly Scenario[] = [
  {id: '01-beginner-normal-10w', athlete: 'beginner', weeks: 10, behaviour: 'NORMAL', checkpointDays: [28, 56]},
  {id: '02-regular-normal-8w', athlete: 'regular', weeks: 8, behaviour: 'NORMAL', checkpointDays: [28]},
  {id: '03-trained-easy-wins-12w', athlete: 'trained', weeks: 12, behaviour: 'EASIER', checkpointDays: [28, 56]},
  {id: '04-advanced-normal-10w', athlete: 'advanced', weeks: 10, behaviour: 'NORMAL', checkpointDays: [28, 56]},
  {id: '05-regular-overload-8w', athlete: 'regular', weeks: 8, behaviour: 'OVERLOAD'},
  {id: '06-trained-skipped-10w', athlete: 'trained', weeks: 10, behaviour: 'SKIP_EVERY_THIRD', checkpointDays: [28, 56]},
  {id: '07-trained-break-12w', athlete: 'trained', weeks: 12, behaviour: 'WORK_BREAK',
    breakStartDay: 28, breakLengthDays: 14, checkpointDays: [70]},
  {id: '08-regular-red-and-review-10w', athlete: 'regular', weeks: 10, behaviour: 'RED_AND_REVIEW', checkpointDays: [56]},
  {id: '09-regular-inconsistent-report-8w', athlete: 'regular', weeks: 8, behaviour: 'CONTRADICTORY_REPORT', checkpointDays: [28]},
];

function grade(w: Workout, behaviour: Behaviour, qualityIndex: number, redFired: boolean): 'GREEN' | 'GREEN_PLUS' | 'YELLOW' | 'RED' {
  if (behaviour === 'RED_AND_REVIEW' && !redFired && w.countsAsQuality) return 'RED';
  if (behaviour === 'OVERLOAD' && w.countsAsQuality && qualityIndex % 2 === 0) return 'YELLOW';
  if (behaviour === 'EASIER' && w.countsAsQuality) return 'GREEN_PLUS';
  return 'GREEN';
}

/** A hypothetical *reported* measurement, never a change to the prescribed workout. */
export function makeResult(w: Workout, kind: 'GREEN' | 'GREEN_PLUS' | 'YELLOW' | 'RED',
  contradictory = false): WorkoutResult {
  const speed = w.speedRangeMps === null
    ? 3.2 // synthetic measured speed ONLY; never used to prescribe future target speed
    : (w.speedRangeMps[0] + w.speedRangeMps[1]) / 2;
  const repetitions: {distanceMeters: number; seconds: number}[] = [];
  if (w.main.mode === 'INTERVALS') {
    for (let i = 0; i < w.main.repeats; i++) {
      const metres = w.main.repeatMeters === null
        ? speed * w.main.dose.value * 60 / w.main.repeats
        : i === w.main.repeats - 1
          ? w.main.finalRepeatMeters ?? w.main.repeatMeters
          : w.main.repeatMeters;
      repetitions.push({distanceMeters: metres, seconds: metres / speed});
    }
  } else if (w.speedRangeMps !== null && w.main.mode !== 'REST') {
    const metres = w.main.dose.unit === 'METERS' ? w.main.dose.value : speed * 60 * w.main.dose.value;
    repetitions.push({distanceMeters: metres, seconds: metres / speed});
  }

  const runningMinutes = w.main.mode === 'REST' ? 0 :
    w.main.dose.unit === 'MINUTES' ? w.main.dose.value
      : w.main.dose.value / speed / 60;
  const rests = w.main.mode === 'INTERVALS' ? Math.max(0, w.main.repeats - 1) : 0;
  const target = (w.targetRpe[0] + w.targetRpe[1]) / 2;
  const rpe = kind === 'YELLOW' ? Math.min(10, target + 2.5)
    : kind === 'GREEN_PLUS' ? Math.max(0, target - 1.5) : target;
  const fraction = kind === 'YELLOW' ? 0.7 : 1;
  const observedMeters = w.main.mode === 'REST' ? 0 :
    w.main.dose.unit === 'METERS' ? w.main.dose.value : speed * runningMinutes * 60;
  return {
    date: w.scheduledDate,
    completionFraction: fraction,
    sessionRpe: rpe,
    safety: kind === 'RED' ? {...healthySafety(), alteredMovement: true} : healthySafety(),
    durationMinutes: w.warmupMinutes + w.cooldownMinutes + runningMinutes * fraction + rests * w.restSeconds / 60,
    distanceMeters: contradictory ? 0 : Math.round(observedMeters * fraction),
    repeats: repetitions,
    restSeconds: Array.from({length: rests}, () => w.restSeconds),
    conditions: {},
    unexpectedFatigue: kind === 'YELLOW',
  };
}

function issue(items: Finding[], code: string, day: string, detail: string, severity: Finding['severity']): void {
  if (!items.some(x => x.code === code && x.day === day && x.detail === detail)) items.push({code, day, detail, severity});
}

function evaluateQueue(s: EngineState, date: string, findings: Finding[]): void {
  const ids = new Set<string>();
  for (const w of s.queue) {
    if (ids.has(w.id)) issue(findings, 'DUPLICATE_QUEUE_ID', date, w.id, 'ERROR');
    ids.add(w.id);
    if (w.scheduledDate >= s.profile.raceDate)
      issue(findings, 'TRAINING_ON_RACE_DAY', date, w.id, 'ERROR');
    if (w.scheduledDate < date)
      issue(findings, 'OVERDUE_WORKOUT_STILL_QUEUED', date, w.id, 'ERROR');
    if ((s.decision.safety !== 'OK' || s.diagnosticHold || s.relatedYellow) && w.type !== 'REST')
      issue(findings, 'RUNNING_DESPITE_SAFETY_HOLD', date, `${w.id} (${w.type})`, 'ERROR');
  }
  if (s.queue.length > s.profile.availableRunsPerWeek)
    issue(findings, 'EXCESSIVE_7DAY_QUEUE', date, `Scheduled ${s.queue.length}; allowance ${s.profile.availableRunsPerWeek}`, 'ERROR');
  // Engine may preserve previously approved sessions after a new limitation. Historical quality
  // must never be retroactively treated as a violation under the new limit.
}

function appendEvent(events: Event[], s: EngineState, offset: number, action: string, w: Workout | null,
  result: WorkoutResult | null, evaluation: Evaluation | null, note: string): void {
  events.push({
    day: addDays(SIM_START, offset), week: Math.floor(offset / 7) + 1, action,
    workoutType: w?.type ?? null, workoutId: w?.id ?? null,
    plannedDose: w === null ? null : `${w.main.dose.value} ${w.main.dose.unit}`,
    evaluation, actualRpe: result?.sessionRpe ?? null,
    reportedMeters: result?.distanceMeters ?? null,
    nextWorkoutType: s.queue[0]?.type ?? null, phase: s.decision.phase,
    gate: s.decision.gate, reasons: [...s.decision.reasons], comment: note,
  });
}
function aggregate(events: Event[], weeks: number): WeekRow[] {
  return Array.from({length: weeks}, (_, i) => {
    const e = events.filter(x => x.week === i + 1);
    const workouts = e.filter(x => x.action === 'WORKOUT_RESULT');
    const evals: WeekRow['evaluations'] = {GREEN_PLUS: 0, GREEN: 0, YELLOW: 0, RED: 0};
    for (const entry of workouts) if (entry.evaluation !== null) evals[entry.evaluation]++;
    return {
      week: i + 1,
      prescribed: e.filter(x => ['WORKOUT_RESULT', 'SKIPPED', 'REST_DAY', 'CONTRADICTORY_REPORT'].includes(x.action)).length,
      completed: workouts.length + e.filter(x => x.action === 'CONTRADICTORY_REPORT').length,
      rest: e.filter(x => x.action === 'REST_DAY').length,
      skipped: e.filter(x => x.action === 'SKIPPED').length,
      qualityCompleted: e.filter(x => ['WORKOUT_RESULT', 'CONTRADICTORY_REPORT'].includes(x.action) && x.workoutType !== null &&
        ['INTRO_QUALITY', 'THRESHOLD', 'VO2', 'SPECIFIC_3K', 'CONTROL'].includes(x.workoutType)).length,
      reportedMeters: e.reduce((acc, x) => acc + (x.reportedMeters ?? 0), 0),
      firstPhase: e[0]?.phase ?? 'NO_EVENTS',
      lastPhase: e.at(-1)?.phase ?? 'NO_EVENTS',
      evaluations: evals,
    };
  });
}

/**
 * One day at a time, respecting asOf, scheduledDate, raceDate and the engine's own queue.
 * Each external event (medical clearance/checkpoint) is written explicitly in the trace.
 */
export function simulateScenario(scenario: Scenario): RunReport {
  const p = makeProfile(scenario);
  let state = createEngine(p, SIM_START);
  const originalFeasibility = state.decision.feasibility;
  const events: Event[] = [];
  const findings: Finding[] = [];
  const days = scenario.weeks * 7;
  let scheduledCount = 0;
  let qualityCount = 0;
  let inconsistentCandidateCount = 0;
  let triggeredRed = false;
  let reviewDay: number | null = null;
  let finalRaceSeconds: number | null = null;

  for (let offset = 0; offset <= days; offset++) {
    const today = addDays(SIM_START, offset);

    // Terminal result is EXTERNAL and unchanged from the initial objective measurement.
    if (offset === days) {
      state = recordFinalResult(state, {timeSeconds: p.performance!.timeSeconds, date: today, source: 'TEST_3K'}, today);
      finalRaceSeconds = p.performance!.timeSeconds;
      appendEvent(events, state, offset, 'EXTERNAL_FINAL_RACE_UNCHANGED', null, null, null,
        'Synthetic external measurement = baseline. No performance improvement is assumed or inferred.');
      break;
    }

    const breakStart = scenario.breakStartDay ?? -1;
    const breakLength = scenario.breakLengthDays ?? 0;
    if (scenario.behaviour === 'WORK_BREAK' && offset >= breakStart && offset < breakStart + breakLength) {
      // State is intentionally not advanced during absence. applyBreak will mark past-due slots
      // without compensating for lost workouts or prescribing phantom sessions.
      appendEvent(events, state, offset, 'ABSENT_WORK_BREAK', null, null, null, 'No training / no fabricated feedback');
      continue;
    }
    if (scenario.behaviour === 'WORK_BREAK' && offset === breakStart + breakLength) {
      state = applyBreak(state, {days: breakLength, endDate: today, reason: 'WORK'}, today);
      appendEvent(events, state, offset, 'EXTERNAL_WORK_BREAK', null, null, null,
        `Externally reported ${breakLength}-day work absence; overdue sessions skipped, never made up.`);
    } else {
      state = replan(state, today);
    }

    if (reviewDay !== null && offset === reviewDay) {
      state = resolveDiagnostic(state, healthySafety(), today);
      appendEvent(events, state, offset, 'EXTERNAL_MEDICAL_REVIEW', null, null, null,
        'Explicit hypothetical medical clearance; not an app-granted permission.');
    }

    // Hypothetical checkpoints are unchanged measured 3 km times, NOT predicted progress.
    if (scenario.checkpointDays?.includes(offset) && state.decision.safety === 'OK' && !state.relatedYellow
      && (state.reentry === null || state.reentry.easyRemaining === 0)) {
      state = recordCheckpoint(state, {timeSeconds: p.performance!.timeSeconds, date: today, source: 'TEST_3K'}, today);
      appendEvent(events, state, offset, 'EXTERNAL_3K_CHECKPOINT_UNCHANGED', null, null, null,
        'External hypothetical measured time equals baseline; no invented training improvement.');
    }

    evaluateQueue(state, today, findings);
    const workout = state.queue.find(w => w.scheduledDate === today);
    if (!workout) continue;

    const scheduledNumber = ++scheduledCount;
    if (scenario.behaviour === 'SKIP_EVERY_THIRD' && scheduledNumber % 3 === 0) {
      state = skipWorkout(state, workout.id, today);
      appendEvent(events, state, offset, 'SKIPPED', workout, null, null, 'Explicit miss; no compensatory workload.');
      evaluateQueue(state, today, findings);
      continue;
    }

    if (workout.type === 'REST') {
      const r = makeResult(workout, 'GREEN');
      state = recordResult(state, workout.id, r);
      appendEvent(events, state, offset, 'REST_DAY', workout, r, state.history.at(-1)!.classified.evaluation,
        'Engine prescribed REST; recorded as rest, not a completed running session.');
      evaluateQueue(state, today, findings);
      continue;
    }

    if (workout.countsAsQuality) qualityCount++;
    const kind = grade(workout, scenario.behaviour, qualityCount, triggeredRed);
    // Contradiction must involve *actual* measured repeats; otherwise a zero total on
    // unpaced EASY with no splits is only an unspecified total and cannot prove inconsistency.
    const hasMeasuredRepetitions = workout.main.mode === 'INTERVALS' || workout.speedRangeMps !== null;
    const contradiction = scenario.behaviour === 'CONTRADICTORY_REPORT' && hasMeasuredRepetitions
      && ++inconsistentCandidateCount % 2 === 1;
    const measured = makeResult(workout, kind, contradiction);
    const before = state;
    state = recordResult(state, workout.id, measured);
    const classified = state.history.at(-1)!.classified;
    if (contradiction && measured.repeats.length > 0 && measured.distanceMeters === 0) {
      issue(findings, 'INCONSISTENT_REPORT_ACCEPTED', today,
        `Reported total distance 0 m but ${measured.repeats.length} measured repeats sum to ${Math.round(measured.repeats.reduce((sum,r)=>sum+r.distanceMeters,0))} m; engine accepted input.`,
        'WARNING');
    }

    // A change in effectiveSpeedMps (CLOSED -> PARTIAL target gate) is NOT necessarily
    // a new prescribed pace. INTRO_QUALITY has no speed target and previously gave false alerts.
    // Compare the SAME upcoming authorised slot before and after the transition instead.
    const oldScheduled = before.queue.find(next => next.id !== workout.id &&
      next.type === workout.type && next.speedRangeMps !== null);
    const newScheduled = oldScheduled === undefined ? undefined : state.queue.find(next =>
      next.id === oldScheduled.id && next.type === oldScheduled.type && next.speedRangeMps !== null);
    if (oldScheduled && newScheduled && oldScheduled.speedRangeMps && newScheduled.speedRangeMps &&
      newScheduled.main.dose.value > oldScheduled.main.dose.value + 1e-9 &&
      newScheduled.speedRangeMps[1] > oldScheduled.speedRangeMps[1] + 1e-9) {
      issue(findings, 'SIMULTANEOUS_PRESCRIBED_SPEED_AND_VOLUME', today,
        `Same planned ${workout.type} slot ${oldScheduled.id}: dose ${oldScheduled.main.dose.value} → ${newScheduled.main.dose.value}; target speed ${oldScheduled.speedRangeMps[1]} → ${newScheduled.speedRangeMps[1]} m/s.`, 'WARNING');
    }
    const increasedDose = state.doses[workout.type]?.value;
    const previousDose = before.doses[workout.type]?.value;
    const doseSummary = increasedDose !== undefined && previousDose !== undefined &&
      increasedDose > previousDose ? `; ${workout.type} future dose ${previousDose} → ${increasedDose} ${workout.main.dose.unit}` : '';
    const gateSummary = before.decision.gate !== state.decision.gate ?
      `; target gate ${before.decision.gate} → ${state.decision.gate} (not itself a new pace prescription)` : '';
    appendEvent(events, state, offset, 'WORKOUT_RESULT', workout, measured, classified.evaluation,
      `Injected ${kind}; observed classification ${classified.evaluation}${classified.yellowReason ? ' / '+classified.yellowReason : ''}${doseSummary}${gateSummary}`);
    if (kind === 'RED') {
      triggeredRed = true;
      reviewDay = offset + 9;
      if (!state.diagnosticHold)
        issue(findings, 'RED_DID_NOT_HOLD', today, 'RED feedback was not followed by a diagnostic hold', 'ERROR');
    }
    if (classified.evaluation === 'RED' && state.queue.some(w=>w.type!=='REST')) {
      issue(findings, 'RED_ALLOWED_RUNNING', today, 'Running workload prescribed after RED', 'ERROR');
    }
    evaluateQueue(state, today, findings);
  }

  if (!state.finalResultRecorded || state.queue.length !== 0)
    issue(findings, 'UNCLOSED_FINAL_CYCLE', state.asOf,
      'After explicitly reported final race the cycle must be terminal with no queue.', 'ERROR');
  return {
    scenario, baselineSeconds: p.performance!.timeSeconds, targetSeconds: p.targetTimeSeconds,
    feasibility: originalFeasibility, events, findings, weeks: aggregate(events, scenario.weeks),
    lastState: state, finalRaceSeconds,
  };
}
export function simulateAll(): RunReport[] {return SCENARIOS.map(simulateScenario);}
