/**
 * Local persistence of the active cycle (docs/pwa-architecture.md §8).
 *
 * One key, one record, written whole. The engine state is stored exactly as `serialize()` produced
 * it and is read back only through the official `deserialize`. Nothing is ever repaired silently:
 * every failure class is reported so the UI can show an explicit state.
 */
import {ApplicationError} from './appError.ts';
import {parseAppState} from './appState.ts';
import type {AppStateV1} from './appState.ts';
import {deserializeEngineState, isEngineError, viewEngineError} from './engineGateway.ts';
import type {EngineState} from './engineGateway.ts';

export const ACTIVE_CYCLE_KEY = 'fizuha.activeCycle';
/**
 * Draft of the onboarding questionnaire. It holds no sport state and no cycle data — the envelope of
 * §8.1 stays untouched — but the wireframes (§0.6) require the answers to survive a reload.
 */
export const QUESTIONNAIRE_DRAFT_KEY = 'fizuha.questionnaireDraft';

/** The slice of the Web Storage API the application actually uses. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CycleRepository {
  read(): string | null;
  write(raw: string): void;
  clear(): void;
}

export function createRepository(storage: KeyValueStorage, key: string = ACTIVE_CYCLE_KEY): CycleRepository {
  return {
    read: () => storage.getItem(key),
    write: (raw) => storage.setItem(key, raw),
    clear: () => storage.removeItem(key),
  };
}

export type LoadCycleResult =
  | {kind: 'EMPTY'}
  | {kind: 'READY'; appState: AppStateV1; engineState: EngineState}
  | {kind: 'DAMAGED'; detail: string}
  | {kind: 'UNSUPPORTED_FORMAT'; formatVersion: number}
  | {kind: 'UNSUPPORTED_ENGINE_STATE'}
  | {kind: 'IMPOSSIBLE_STATE'};

/**
 * Read the stored cycle and bring it back to life through the official reader.
 * The three failure classes of §8.2 rule 3 are distinguished instead of collapsing into "error".
 */
export function loadActiveCycle(repo: CycleRepository): LoadCycleResult {
  const raw = repo.read();
  if (raw === null) return {kind: 'EMPTY'};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {kind: 'DAMAGED', detail: 'JSON'};
  }

  const envelope = parseAppState(parsed);
  if (!envelope.ok) {
    return envelope.reason === 'MALFORMED'
      ? {kind: 'DAMAGED', detail: 'ENVELOPE'}
      : {kind: 'UNSUPPORTED_FORMAT', formatVersion: envelope.formatVersion};
  }

  try {
    const engineState = deserializeEngineState(envelope.state.cycle.engineState);
    return {kind: 'READY', appState: envelope.state, engineState};
  } catch (error) {
    if (isEngineError(error)) {
      const view = viewEngineError(error);
      if (view.code === 'UNSUPPORTED_STATE_VERSION') return {kind: 'UNSUPPORTED_ENGINE_STATE'};
      if (view.code === 'EVENT_DATE_PASSED') return {kind: 'IMPOSSIBLE_STATE'};
    }
    return {kind: 'DAMAGED', detail: 'ENGINE_STATE'};
  }
}

/**
 * Write the whole envelope in one operation and verify that the device really kept it.
 *
 * A storage that accepts a write and then drops it silently is not persistence. This is treated as a
 * failure instead of letting the user believe the cycle is safe — the application never substitutes
 * temporary memory for permanent storage.
 */
export function saveActiveCycle(repo: CycleRepository, appState: AppStateV1): void {
  const raw = JSON.stringify(appState);
  repo.write(raw);
  if (repo.read() !== raw) throw new ApplicationError('STORAGE_UNAVAILABLE', 'the stored cycle could not be read back');
}

/** Remove the active cycle. Only ever called after the user explicitly asked for it (WF-31.d). */
export function discardActiveCycle(repo: CycleRepository): void {
  repo.clear();
}

/** Result of checking whether this device can keep a cycle at all. */
export type StorageProbe =
  | {readonly kind: 'AVAILABLE'; readonly storage: KeyValueStorage}
  | {readonly kind: 'UNAVAILABLE'};
