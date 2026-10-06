/**
 * Application operations that change the schedule of the active cycle: skipping a session and moving
 * one. Both go through the shared transition, so the invariant is consulted first, the engine decides
 * the new plan, the application event is appended and everything is stored before the UI hears about
 * it. The engine state is the only source of the plan: no copy of a workout is kept here.
 */
import type {AppStateV1, CycleEvent} from './appState.ts';
import type {EngineState, Workout} from './engineGateway.ts';
import {moveWorkout, skipWorkout} from './engineGateway.ts';
import {assertWorkoutActionAllowed, isOverdue} from './invariants.ts';
import type {PlanChange} from './planDiff.ts';
import type {CycleRepository} from './storage.ts';
import {applyEngineTransition} from './transition.ts';
import type {UiError} from './errorContract.ts';

/** The user could not do this session, as opposed to discovering afterwards that it was missed. */
/** Taken from the event schema itself, so the log and the operation cannot drift apart. */
export type SkipCause = Extract<CycleEvent, {type: 'WORKOUT_SKIPPED'}>['cause'];

/**
 * Why a session was skipped, derived from the session's own date and the device date.
 *
 * The caller cannot state it: a screen must not be able to write a false reason into the log. A
 * session that has not happened yet is a voluntary decision about the plan; a session whose date is
 * already behind is a miss.
 */
export function skipCauseFor(workout: Workout, deviceToday: string): SkipCause {
  return isOverdue(workout, deviceToday) ? 'PAST_DUE' : 'VOLUNTARY';
}

export interface SkipWorkoutRequest {
  readonly repo: CycleRepository;
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  readonly workoutId: string;
  readonly deviceToday: string;
  /** Wall-clock stamp of the user's action. */
  readonly at: string;
}

export interface MoveWorkoutRequest {
  readonly repo: CycleRepository;
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  readonly workoutId: string;
  readonly toDate: string;
  readonly deviceToday: string;
  readonly at: string;
}

export interface ScheduleDone {
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  readonly changes: readonly PlanChange[];
}

export type ScheduleOutcome = {ok: true; done: ScheduleDone} | {ok: false; error: UiError};

const findWorkout = (engineState: EngineState, workoutId: string): Workout | undefined =>
  engineState.queue.find((workout) => workout.id === workoutId);

/**
 * Skip one session.
 *
 * The engine is asked for the state's own date, not for today: `skipWorkout` writes off every past-due
 * session when it is allowed to advance the clock, and one explicit decision must never resolve the
 * other unresolved sessions. INV-1 keeps them for their own explicit decisions.
 */
export function skipScheduledWorkout(request: SkipWorkoutRequest): ScheduleOutcome {
  const outcome = applyEngineTransition({
    repo: request.repo,
    appState: request.appState,
    engineState: request.engineState,
    deviceToday: request.deviceToday,
    guard: () => assertWorkoutActionAllowed(request.engineState, request.workoutId, request.deviceToday, 'SKIP'),
    transition: () => skipWorkout(request.engineState, request.workoutId, request.engineState.asOf),
    event: () => {
      const workout = findWorkout(request.engineState, request.workoutId);
      // The engine still holds the skipped session in `skippedWorkouts`, so only the reason and the
      // moment of the decision are logged here; the reason follows from the session's own date.
      if (workout === undefined) return null;
      return {
        type: 'WORKOUT_SKIPPED',
        at: request.at,
        workoutId: workout.id,
        scheduledDate: workout.scheduledDate,
        workoutType: workout.type,
        cause: skipCauseFor(workout, request.deviceToday),
      };
    },
  });
  return outcome;
}

/** Move one session to another date. Horizon, occupancy, recovery and quality stay engine rules. */
export function moveScheduledWorkout(request: MoveWorkoutRequest): ScheduleOutcome {
  const fromDate = findWorkout(request.engineState, request.workoutId)?.scheduledDate ?? null;
  const outcome = applyEngineTransition({
    repo: request.repo,
    appState: request.appState,
    engineState: request.engineState,
    deviceToday: request.deviceToday,
    guard: () => assertWorkoutActionAllowed(request.engineState, request.workoutId, request.deviceToday, 'MOVE'),
    transition: () => moveWorkout(request.engineState, request.workoutId, request.toDate),
    event: () => {
      // The moved workout stays in the engine; the log only records the fact of the action.
      if (fromDate === null) return null;
      return {type: 'WORKOUT_MOVED', at: request.at, workoutId: request.workoutId, fromDate, toDate: request.toDate};
    },
  });
  return outcome;
}
