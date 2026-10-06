import type {AppStateV1} from './appState.ts';
import {ApplicationError} from './appError.ts';
import {recordFinalResult} from './engineGateway.ts';
import type {EngineState, PerformanceSource} from './engineGateway.ts';
import {toUiErrorFromUnknown} from './errorContract.ts';
import type {UiError} from './errorContract.ts';
import {loadActiveCycle} from './storage.ts';
import type {CycleRepository} from './storage.ts';
import {applyEngineTransition} from './transition.ts';
import type {TransitionDone} from './transition.ts';
/** Terminal transition intentionally has no ordinary clock guard; pending workouts cannot block it. */
export function submitFinalResult(r: {
  repo: CycleRepository; appState: AppStateV1; engineState: EngineState;
  timeSeconds: number; source: PerformanceSource; deviceToday: string; at: string;
}): {ok: true; done: TransitionDone} | {ok: false; error: UiError} {
  if (r.engineState.finalResultRecorded) return {ok: false, error: toUiErrorFromUnknown(new ApplicationError('CYCLE_COMPLETED'))};
  try {
    const current = loadActiveCycle(r.repo);
    if (current.kind === 'EMPTY' || (current.kind === 'READY' && current.engineState.finalResultRecorded)) throw new ApplicationError('CYCLE_COMPLETED');
    if (current.kind !== 'READY' || JSON.stringify(current.appState) !== JSON.stringify(r.appState)) throw new ApplicationError('ARCHIVE_CONFLICT');
  } catch (error) { return {ok: false, error: toUiErrorFromUnknown(error)}; }
  const performance = {timeSeconds: r.timeSeconds, source: r.source, date: r.engineState.profile.raceDate};
  return applyEngineTransition({
    ...r, transition: () => recordFinalResult(r.engineState, performance, r.deviceToday),
    event: () => ({type: 'FINAL_RESULT_RECORDED', at: r.at, result: performance}),
  });
}
