/**
 * The cycle store: probes permanent storage, loads the active cycle once, exposes it to the UI and
 * adopts a newly created one. It owns no sport logic — it only moves the opaque engine state through
 * the official gateway.
 */
import {useCallback, useMemo, useState} from 'react';
import {useDeviceDate} from './useDeviceDate.ts';
import {discardActiveCycle, loadActiveCycle} from '../application/storage.ts';
import type {CycleRepository, KeyValueStorage, LoadCycleResult, StorageProbe} from '../application/storage.ts';
import type {AppStateV1} from '../application/appState.ts';
import type {EngineState} from '../application/engineGateway.ts';

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
  /** Take over a cycle that was just created: this is the only call that opens onboarding. */
  adoptNewCycle(created: {appState: AppStateV1; engineState: EngineState}): void;
  /** Take over a new state of the *existing* cycle. Onboarding is not touched. */
  replaceActiveState(updated: {appState: AppStateV1; engineState: EngineState}): void;
  finishOnboarding(): void;
  /** Remove a damaged active cycle. Only ever called after the user confirmed it explicitly. */
  discardDamagedCycle(): void;
}

export function useCycleStore(repo: CycleRepository | null): CycleStore {
  /**
   * Reading the stored cycle is derived, not stored, so it follows the repository: when permanent
   * storage becomes available after a retry, the store picks it up without an effect and without a
   * state update during render. An explicit action can override the reading (`reload`, adopting a new
   * cycle, discarding a damaged one).
   */
  const baseline: StoreLoad = useMemo(() => (repo === null ? {kind: 'NO_STORAGE'} : safeLoad(repo)), [repo]);
  const [override, setOverride] = useState<StoreLoad | null>(null);
  const load = override ?? baseline;
  const [adopted, setAdopted] = useState<{appState: AppStateV1; engineState: EngineState} | null>(null);
  const [onboardingInProgress, setOnboarding] = useState(false);
  // Reactive: the app may stay open across midnight, so the date must not be frozen at mount.
  const today = useDeviceDate();

  const reload = useCallback(() => {
    setAdopted(null);
    setOverride(repo === null ? {kind: 'NO_STORAGE'} : safeLoad(repo));
  }, [repo]);

  const adoptNewCycle = useCallback((created: {appState: AppStateV1; engineState: EngineState}) => {
    setAdopted(created);
    setOnboarding(true);
  }, []);

  // Updating the active cycle is not the same event as creating one. Callers that only refresh the
  // plan, record a result or apply a checkpoint must use this and never reopen onboarding.
  const replaceActiveState = useCallback((updated: {appState: AppStateV1; engineState: EngineState}) => {
    setAdopted(updated);
  }, []);

  const finishOnboarding = useCallback(() => setOnboarding(false), []);

  const discardDamagedCycle = useCallback(() => {
    if (repo === null || load.kind !== 'DAMAGED') return;
    // Neither an unsupported envelope nor an unsupported engine state is ever deleted: only data the
    // application cannot read at all, and only after the user confirmed it.
    discardActiveCycle(repo);
    setAdopted(null);
    setOnboarding(false);
    setOverride({kind: 'EMPTY'});
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
    adoptNewCycle,
    replaceActiveState,
    finishOnboarding,
    discardDamagedCycle,
  };
}

/** Storage can fail while reading (rare) — that must never crash the shell. */
function safeLoad(repo: CycleRepository): LoadCycleResult {
  try {
    return loadActiveCycle(repo);
  } catch {
    // A failed read is not evidence of corrupted data: never offer deletion here.
    return {kind: 'STORAGE_UNAVAILABLE'};
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
