/**
 * Store semantics.
 *
 * Creating a cycle and updating the active cycle are different events: only the first may open
 * onboarding. A future operation (a recorded result, a checkpoint, a changed goal) must use the
 * update path and must not have to mean "a new cycle was created".
 */
import {act, renderHook} from '@testing-library/react';
import {describe, expect, test} from 'vitest';
import {useCycleStore} from './useCycleStore.ts';
import {createRepository} from '../application/storage.ts';
import {createCycle} from '../application/cycle.ts';
import {buildProfile, defaultDraft} from '../application/questionnaire.ts';
import {addDays, deviceToday} from '../application/format.ts';
import type {KeyValueStorage} from '../application/storage.ts';

function memoryStorage(): KeyValueStorage & {map: Map<string, string>} {
  const map = new Map<string, string>();
  return {map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key)};
}

function createdCycle(storage: KeyValueStorage, today: string) {
  const filled = {...defaultDraft(today), regularRunningWeeks: '8', resultTime: '15:20', targetTime: '14:30', raceDate: addDays(today, 56)};
  const built = buildProfile(filled);
  if (!built.ok) throw new Error('fixture: the draft must build');
  const created = createCycle(createRepository(storage), {
    profile: built.profile, deviceToday: today, cycleId: 'cycle-1', createdAt: `${today}T09:00:00.000Z`, locale: 'ru-RU',
  });
  if (!created.ok) throw new Error('fixture: the cycle must be created');
  return {appState: created.appState, engineState: created.engineState};
}

describe('cycle adoption', () => {
  test('only a newly created cycle opens onboarding', () => {
    const storage = memoryStorage();
    const {result} = renderHook(() => useCycleStore(createRepository(storage)));
    expect(result.current.onboardingInProgress).toBe(false);

    const cycle = createdCycle(memoryStorage(), deviceToday());
    act(() => result.current.adoptNewCycle(cycle));
    expect(result.current.onboardingInProgress).toBe(true);
    expect(result.current.load.kind).toBe('READY');

    act(() => result.current.finishOnboarding());
    expect(result.current.onboardingInProgress).toBe(false);
  });

  test('updating the active cycle never reopens onboarding', () => {
    const storage = memoryStorage();
    const {result} = renderHook(() => useCycleStore(createRepository(storage)));

    const cycle = createdCycle(memoryStorage(), deviceToday());
    act(() => result.current.adoptNewCycle(cycle));
    act(() => result.current.finishOnboarding());
    expect(result.current.onboardingInProgress).toBe(false);

    // A later operation on the same cycle (a refreshed plan today, a recorded result tomorrow).
    const updated = createdCycle(memoryStorage(), deviceToday());
    act(() => result.current.replaceActiveState(updated));

    expect(result.current.onboardingInProgress).toBe(false);
    expect(result.current.appState).not.toBeNull();
    expect(result.current.engineState).not.toBeNull();
    expect(result.current.load.kind).toBe('READY');
  });

  test('the store exposes no single method that means both', () => {
    const storage = memoryStorage();
    const {result} = renderHook(() => useCycleStore(createRepository(storage)));
    // Deliberately absent, so a future caller cannot reopen onboarding by accident.
    expect((result.current as unknown as Record<string, unknown>)['adopt']).toBeUndefined();
  });

  test('a device without a repository reports it instead of pretending', () => {
    const {result} = renderHook(() => useCycleStore(null));
    expect(result.current.load.kind).toBe('NO_STORAGE');
    expect(result.current.appState).toBeNull();
  });
});
