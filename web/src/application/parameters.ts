import type {AppStateV1} from './appState.ts';
import {ApplicationError} from './appError.ts';
import {updateTrainingData} from './engineGateway.ts';
import type {EngineState} from './engineGateway.ts';
import {assertClockAdvanceAllowed} from './invariants.ts';
import type {CycleRepository} from './storage.ts';
import {applyEngineTransition} from './transition.ts';
import type {TransitionOutcome} from './transition.ts';
import {toUiErrorFromUnknown} from './errorContract.ts';

export interface ParametersRequest {
  repo: CycleRepository; appState: AppStateV1; engineState: EngineState;
  targetTimeSeconds: number; raceDate: string; deviceToday: string; at: string;
}
/** No-op never calls the engine or storage; other updates must first satisfy INV-1. */
export function updateGoalAndRaceDate(r: ParametersRequest): TransitionOutcome {
  if (r.engineState.finalResultRecorded) return {ok: false, error: toUiErrorFromUnknown(new ApplicationError('CYCLE_COMPLETED'))};
  if (!Number.isFinite(r.targetTimeSeconds) || !/^\d{4}-\d{2}-\d{2}$/.test(r.raceDate) || !Number.isFinite(Date.parse(r.raceDate + 'T00:00:00Z')) || new Date(r.raceDate + 'T00:00:00Z').toISOString().slice(0, 10) !== r.raceDate) {
    return {ok: false, error: toUiErrorFromUnknown(new ApplicationError('INVALID_PARAMETERS'))};
  }
  const from: Record<string, unknown> = {}; const to: {targetTimeSeconds?: number; raceDate?: string} = {};
  if (r.targetTimeSeconds !== r.engineState.profile.targetTimeSeconds) { from.targetTimeSeconds = r.engineState.profile.targetTimeSeconds; to.targetTimeSeconds = r.targetTimeSeconds; }
  if (r.raceDate !== r.engineState.profile.raceDate) { from.raceDate = r.engineState.profile.raceDate; to.raceDate = r.raceDate; }
  if (Object.keys(to).length === 0) return {ok: true, done: {appState: r.appState, engineState: r.engineState, changes: []}};
  return applyEngineTransition({
    ...r, guard: () => assertClockAdvanceAllowed(r.engineState, r.deviceToday),
    transition: () => updateTrainingData(r.engineState, to, r.deviceToday),
    event: () => ({type: 'TRAINING_PARAMETERS_CHANGED', at: r.at, from, to}),
  });
}
