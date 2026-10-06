/**
 * The cycle store: loads the active cycle once, exposes it to the UI and adopts a newly created one.
 * It owns no sport logic — it only moves the opaque engine state through the official gateway.
 */
import {useCallback, useMemo, useState} from 'react';
import {loadActiveCycle} from '../application/storage.ts';
import type {CycleRepository, KeyValueStorage, LoadCycleResult} from '../application/storage.ts';
import {createRepository} from '../application/storage.ts';
import type {AppStateV1} from '../application/appState.ts';
import type {EngineState} from '../application/engineGateway.ts';
import {deviceToday} from '../application/format.ts';

export interface CycleStore {
  readonly load: LoadCycleResult;
  readonly appState: AppStateV1 | null;
  readonly engineState: EngineState | null;
  readonly today: string;
  /** True only in the session that created the cycle. */
  readonly onboardingInProgress: boolean;
  reload(): void;
  adopt(created: {appState: AppStateV1; engineState: EngineState}): void;
  finishOnboarding(): void;
}

export function useCycleStore(repo: CycleRepository, storage: KeyValueStorage): CycleStore {
  const [load, setLoad] = useState<LoadCycleResult>(() => safeLoad(repo));
  const [adopted, setAdopted] = useState<{appState: AppStateV1; engineState: EngineState} | null>(null);
  const [onboardingInProgress, setOnboarding] = useState(false);
  const today = useMemo(() => deviceToday(), []);

  const reload = useCallback(() => {
    setAdopted(null);
    setLoad(safeLoad(repo));
  }, [repo]);

  const adopt = useCallback((created: {appState: AppStateV1; engineState: EngineState}) => {
    setAdopted(created);
    setOnboarding(true);
  }, []);

  const finishOnboarding = useCallback(() => setOnboarding(false), []);

  const ready = adopted !== null || load.kind === 'READY';
  const appState = adopted?.appState ?? (load.kind === 'READY' ? load.appState : null);
  const engineState = adopted?.engineState ?? (load.kind === 'READY' ? load.engineState : null);

  void storage;
  return {
    load: ready ? {kind: 'READY', appState: appState!, engineState: engineState!} : load,
    appState,
    engineState,
    today,
    onboardingInProgress,
    reload,
    adopt,
    finishOnboarding,
  };
}

/** Storage can be unavailable (private mode, quota). That must never crash the shell. */
function safeLoad(repo: CycleRepository): LoadCycleResult {
  try {
    return loadActiveCycle(repo);
  } catch {
    return {kind: 'DAMAGED', detail: 'STORAGE'};
  }
}

/** The browser storage the shell uses. Falls back to an in-memory map when Web Storage is blocked. */
export function browserStorage(): KeyValueStorage {
  try {
    const probe = '__fizuha_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    };
  }
}

export function browserRepository(storage: KeyValueStorage): CycleRepository {
  return createRepository(storage);
}
