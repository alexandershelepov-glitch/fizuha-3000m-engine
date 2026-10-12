import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {act, cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {App} from './App.tsx';
import {useCycleStore} from './useCycleStore.ts';
import {renderHook} from '@testing-library/react';
import {createRepository, ACTIVE_CYCLE_KEY, QUESTIONNAIRE_DRAFT_KEY} from '../application/storage.ts';
import type {KeyValueStorage} from '../application/storage.ts';
import {ARCHIVED_CYCLES_KEY} from '../application/archiveStorage.ts';
import {appCycle} from '../../../tests/helpers-app.ts';

beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(() => cleanup());

describe('restart from Profile', () => {
  test('cancel leaves the active plan unchanged; confirm deletes it and keeps archives', async () => {
    const user = userEvent.setup();
    const fixture = appCycle();
    const archive = JSON.stringify({formatVersion: 1, cycles: []});
    fixture.storage.setItem(ARCHIVED_CYCLES_KEY, archive);
    fixture.storage.setItem(QUESTIONNAIRE_DRAFT_KEY, JSON.stringify({resultTime: '18:20'}));
    window.history.replaceState(null, '', '/profile');
    render(<App storage={fixture.storage} />);

    expect(screen.getByRole('heading', {name: 'Профиль'})).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Сбросить текущий план'}));
    expect(screen.getByText(/будут удалены без возможности восстановления/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Оставить план'}));
    expect(fixture.storage.getItem(ACTIVE_CYCLE_KEY)).toBe(fixture.raw);

    await user.click(screen.getByRole('button', {name: 'Сбросить текущий план'}));
    await user.click(screen.getByRole('button', {name: 'Да, удалить текущий план'}));
    expect(fixture.storage.getItem(ACTIVE_CYCLE_KEY)).toBeNull();
    expect(fixture.storage.getItem(ARCHIVED_CYCLES_KEY)).toBe(archive);
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('button', {name: 'Начать подготовку'})).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Начать подготовку'}));
    expect(screen.getByLabelText('Ваш результат')).toHaveValue('');
  });

  test('a stale tab gets an error and never deletes a changed plan', async () => {
    const user = userEvent.setup();
    const fixture = appCycle();
    window.history.replaceState(null, '', '/profile');
    render(<App storage={fixture.storage} />);
    const changed = JSON.stringify({...fixture.appState, events: [...fixture.appState.events, {type: 'OTHER_WINDOW_CHANGED'}]});
    fixture.storage.setItem(ACTIVE_CYCLE_KEY, changed);

    await user.click(screen.getByRole('button', {name: 'Сбросить текущий план'}));
    await user.click(screen.getByRole('button', {name: 'Да, удалить текущий план'}));
    expect(screen.getByText('План изменился')).toBeInTheDocument();
    expect(fixture.storage.getItem(ACTIVE_CYCLE_KEY)).toBe(changed);
    expect(window.location.pathname).toBe('/profile');
  });
});

describe('temporary storage read failure', () => {
  test('a read exception shows retry, not the destructive damaged-data dialog; data survives', async () => {
    const user = userEvent.setup();
    const fixture = appCycle();
    let blocked = true;
    const flaky: KeyValueStorage = {
      getItem: (key) => {if (blocked) throw new Error('SecurityError'); return fixture.storage.getItem(key);},
      setItem: (key, value) => fixture.storage.setItem(key, value),
      removeItem: (key) => fixture.storage.removeItem(key),
    };
    window.history.replaceState(null, '', '/profile');
    render(<App storage={flaky} />);
    expect(screen.getByText('Не удалось получить доступ к данным')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Повторить'})).toBeInTheDocument();
    expect(screen.queryByText('Удалить повреждённый цикл?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Начать заново'})).not.toBeInTheDocument();
    expect(fixture.storage.getItem(ACTIVE_CYCLE_KEY)).toBe(fixture.raw);

    blocked = false;
    await user.click(screen.getByRole('button', {name: 'Повторить'}));
    expect(screen.getByRole('heading', {name: 'Профиль'})).toBeInTheDocument();
    expect(fixture.storage.getItem(ACTIVE_CYCLE_KEY)).toBe(fixture.raw);
  });

  test('store classifies thrown read as unavailable, and reload recovers the same cycle', () => {
    const fixture = appCycle();
    let blocked = true;
    const storage: KeyValueStorage = {
      getItem: (key) => {if (blocked) throw new Error('read denied'); return fixture.storage.getItem(key);},
      setItem: (key, value) => fixture.storage.setItem(key, value),
      removeItem: (key) => fixture.storage.removeItem(key),
    };
    const repo = createRepository(storage);
    const {result} = renderHook(() => useCycleStore(repo));
    expect(result.current.load.kind).toBe('STORAGE_UNAVAILABLE');
    blocked = false;
    act(() => result.current.reload());
    expect(result.current.load.kind).toBe('READY');
    if (result.current.load.kind === 'READY') expect(result.current.load.appState.cycle.cycleId).toBe(fixture.appState.cycle.cycleId);
  });
});
