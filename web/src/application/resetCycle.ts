/**
 * Explicit user-requested restart of a non-completed cycle. Never touches the archive.
 * Compare the exact persisted envelope before deletion so stale tabs do not delete newer data.
 */
import {ApplicationError} from './appError.ts';
import type {AppStateV1} from './appState.ts';
import type {EngineState} from './engineGateway.ts';
import {toUiErrorFromUnknown} from './errorContract.ts';
import type {UiError} from './errorContract.ts';
import {QUESTIONNAIRE_DRAFT_KEY, RESULT_DRAFT_KEY} from './storage.ts';
import type {CycleRepository, KeyValueStorage} from './storage.ts';

export type ResetCycleOutcome = {ok: true} | {ok: false; error: UiError};

export function resetActiveCycle(input: {
  repo: CycleRepository;
  storage: KeyValueStorage;
  appState: AppStateV1;
  engineState: EngineState;
}): ResetCycleOutcome {
  try {
    if (input.engineState.finalResultRecorded) throw new ApplicationError('CYCLE_COMPLETED');
    const raw = input.repo.read();
    if (raw !== JSON.stringify(input.appState)) throw new ApplicationError('RESET_STALE_CYCLE');

    // Remove ephemeral drafts first: if this fails, the active plan is still safe.
    input.storage.removeItem(QUESTIONNAIRE_DRAFT_KEY);
    input.storage.removeItem(RESULT_DRAFT_KEY);
    input.repo.clear();
    if (input.repo.read() !== null) throw new ApplicationError('RESET_NOT_CONFIRMED');
    return {ok: true};
  } catch (error) {
    const known = error instanceof ApplicationError ? error : new ApplicationError('STORAGE_UNAVAILABLE');
    return {ok: false, error: toUiErrorFromUnknown(known)};
  }
}
