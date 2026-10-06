/**
 * The cycle store: probes permanent storage, loads the active cycle once, exposes it to the UI and
 * adopts a newly created one. It owns no sport logic — it only moves the opaque engine state through
 * the official gateway.
 */
import {useCallback, useEffect, useMemo, useState} from 'react';
import {discardActiveCycle, loadActiveCycle} from '../application/storage.ts';
import type {CycleRepository, KeyValueStorage, LoadCycleResult, StorageProbe} from '../application/storage.ts';
import type {AppStateV1} from '../application/appState.ts';
import type {EngineState} from '../application/engineGateway.ts';
import {deviceToday} from '../application/format.ts';

/** What the shell can say about the stored cycle, including "this device cannot store one". */
export type StoreLoad = LoadCycleResult | {kind: 'NO_STORAGE'};

export interface CycleStore {
  readonly load: StoreLoad;
  readonly appState: AppStateV1 | null;
  readonly engineState: EngineState | null;
  readonly today: string;
  /** True only in the session that created the cycle. */
  readonly onboardingInProgress: boolean;
  reload(): void;
  adopt(created: {appState: AppStateV1; engineState: EngineState}): void;
  finishOnboarding(): void;
  /** Remove a damaged active cycle. Only ever called after the user confirmed it explicitly. */
  discardDamagedCycle(): void;
}

export function useCycleStore(repo: CycleRepository | null): CycleStore {
  const [load, setLoad] = useState<StoreLoad>(() => (repo === null ? {kind: 'NO_STORAGE'} : safeLoad(repo)));
  const [adopted, setAdopted] = useState<{appState: AppStateV1; engineState: EngineState} | null>(null);
  const [onboardingInProgress, setOnboarding] = useState(false);
  const today = useMemo(() => deviceToday(), []);

  // Storage can become available after the user allowed it and asked to retry: the store must follow
  // the repository rather than stay on the verdict of the very first render.
  useEffect(() => {
    setAdopted(null);
    setLoad(repo === null ? {kind: 'NO_STORAGE'} : safeLoad(repo));
  }, [repo]);

  const reload = useCallback(() => {
    setAdopted(null);
    setLoad(repo === null ? {kind: 'NO_STORAGE'} : safeLoad(repo));
  }, [repo]);

  const adopt = useCallback((created: {appState: AppStateV1; engineState: EngineState}) => {
    setAdopted(created);
    setOnboarding(true);
  }, []);

  const finishOnboarding = useCallback(() => setOnboarding(false), []);

  const discardDamagedCycle = useCallback(() => {
    if (repo === null || load.kind !== 'DAMAGED') return;
    // Neither an unsupported envelope nor an unsupported engine state is ever deleted: only data the
    // application cannot read at all, and only after the user confirmed it.
    discardActiveCycle(repo);
    setAdopted(null);
    setOnboarding(false);
    setLoad({kind: 'EMPTY'});
  }, [repo, load.kind]);

  const ready = adopted !== null || load.kind === 'READY';
  const appState = adopted?.appState ?? (load.kind === 'READY' ? load.appState : null);
  const engineState = adopted?.engineState ?? (load.kind === 'READY' ? load.engineState : null);

  return {
    load: ready ? {kind: 'READY', appState: appState!, engineState: engineState!} : load,
    appState,
    engineState,
    today,
    onboardingInProgress,
    reload,
    adopt,
    finishOnboarding,
    discardDamagedCycle,
  };
}

/** Storage can fail while reading (rare) — that must never crash the shell. */
function safeLoad(repo: CycleRepository): LoadCycleResult {
  try {
    return loadActiveCycle(repo);
  } catch {
    return {kind: 'DAMAGED', detail: 'STORAGE'};
  }
}

/**
 * Check that this device can really keep a cycle.
 *
 * There is deliberately no in-memory substitute: a fallback would make a cycle look saved while it
 * disappears on reload. If permanent storage is unavailable the shell says so and refuses to start.
 */
export function probeBrowserStorage(): StorageProbe {
  try {
    const storage = window.localStorage;
    const probe = '__fizuha_probe__';
    storage.setItem(probe, 'ok');
    const kept = storage.getItem(probe) === 'ok';
    storage.removeItem(probe);
    return kept ? {kind: 'AVAILABLE', storage} : {kind: 'UNAVAILABLE'};
  } catch {
    return {kind: 'UNAVAILABLE'};
  }
}

export interface StorageProbeState {
  readonly probe: StorageProbe;
  retry(): void;
}

/** Probe permanent storage once per mount, with an explicit retry for the user. */
export function useStorageProbe(injected?: KeyValueStorage): StorageProbeState {
  const [probe, setProbe] = useState<StorageProbe>(() => (injected !== undefined ? {kind: 'AVAILABLE', storage: injected} : probeBrowserStorage()));
  const retry = useCallback(() => {
    if (injected !== undefined) return;
    setProbe(probeBrowserStorage());
  }, [injected]);
  return {probe, retry};
}
