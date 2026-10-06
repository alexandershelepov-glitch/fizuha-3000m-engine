import type {AppStateV1} from './appState.ts';
import {deserializeEngineState} from './engineGateway.ts';
/** Reconstructed on demand; never a persisted second snapshot of the cycle. */
export function cycleSummary(appState: AppStateV1) {
  const engine = deserializeEngineState(appState.cycle.engineState);
  const checkpoints = appState.events.filter(event => event.type === 'CHECKPOINT_RECORDED');
  const skipped = new Set([...engine.skippedWorkouts.map(w => w.id), ...appState.events.filter(e => e.type === 'WORKOUT_SKIPPED').map(e => e.workoutId)]);
  return {
    engine, baseline: appState.cycle.baseline, completed: engine.finalResultRecorded === true,
    result: engine.profile.performance, targetTimeSeconds: engine.profile.targetTimeSeconds,
    raceDate: engine.profile.raceDate, checkpoints, completedWorkouts: engine.history.length,
    skippedWorkouts: skipped.size, moves: appState.events.filter(e => e.type === 'WORKOUT_MOVED').length,
  };
}
