import {ApplicationError} from './appError.ts';
import type {AppStateV1} from './appState.ts';
import type {ArchiveRepository, ArchivedCycle} from './archiveStorage.ts';
import {deserializeEngineState} from './engineGateway.ts';
import {toUiErrorFromUnknown} from './errorContract.ts';
import type {UiError} from './errorContract.ts';
import {loadActiveCycle} from './storage.ts';
import type {CycleRepository} from './storage.ts';
export type ArchiveOutcome = {ok: true; entry: ArchivedCycle} | {ok: false; error: UiError};
/** Safe retry: archive readback completes before active is removed; never rewrites a conflict. */
export function archiveCompletedCycle(r: {repo: CycleRepository; archives: ArchiveRepository; appState: AppStateV1; at: string}): ArchiveOutcome {
  try {
    const engine = deserializeEngineState(r.appState.cycle.engineState);
    if (!engine.finalResultRecorded || engine.queue.length !== 0) throw new ApplicationError('CYCLE_NOT_COMPLETED');
    const active = loadActiveCycle(r.repo);
    if (active.kind !== 'READY' || JSON.stringify(active.appState) !== JSON.stringify(r.appState)) {
      const existing = r.archives.get(r.appState.cycle.cycleId);
      if (existing && JSON.stringify(existing.appState) === JSON.stringify(r.appState)) return {ok: true, entry: existing};
      throw new ApplicationError('ARCHIVE_CONFLICT');
    }
    const entry = r.archives.add(r.appState, r.at);
    try { r.repo.clear(); if (r.repo.read() !== null) throw new Error(); } catch { throw new ApplicationError('ACTIVE_CLEAR_FAILED'); }
    return {ok: true, entry};
  } catch (error) { return {ok: false, error: toUiErrorFromUnknown(error)}; }
}

export function loadArchives(repo: ArchiveRepository): {ok: true; cycles: ArchivedCycle[]} | {ok: false; error: UiError} {
  try {
    const cycles = repo.list();
    for (const cycle of cycles) {
      const engine = deserializeEngineState(cycle.appState.cycle.engineState);
      if (!engine.finalResultRecorded || engine.queue.length) throw new ApplicationError('ARCHIVE_DAMAGED');
    }
    return {ok: true, cycles};
  } catch (error) { return {ok: false, error: toUiErrorFromUnknown(error)}; }
}
