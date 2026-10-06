/**
 * UI tests: the onboarding path, validation, cycle creation, the assessment and the Today screen,
 * driven through the real components in jsdom. Storage is injected, so every test controls exactly
 * what the application is allowed to read.
 */
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {App} from './App.tsx';
import {ACTIVE_CYCLE_KEY, createRepository, loadActiveCycle} from '../application/storage.ts';
import type {KeyValueStorage} from '../application/storage.ts';
import {addDays, deviceToday, formatDateLong} from '../application/format.ts';
import {createCycle} from '../application/cycle.ts';
import {buildProfile, defaultDraft} from '../application/questionnaire.ts';

type User = ReturnType<typeof userEvent.setup>;

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {map: Map<string, string>} {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const path = (): string => `${window.location.pathname}${window.location.search}`;
const click = (user: User, name: string): Promise<void> => user.click(screen.getByRole('button', {name}));
const clickIn = (user: User, container: HTMLElement | Document, label: string): Promise<void> => {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!button) throw new Error(`button "${label}" is missing`);
  return user.click(button);
};

/** Fill the result step and walk to the goal step: RESULT → VOLUME → … → GOAL. */
async function walkToGoal(user: User): Promise<void> {
  await click(user, 'Начать подготовку');
  await user.type(screen.getByLabelText('Ваш результат'), '15:20');
  for (let step = 0; step < 6; step += 1) await click(user, 'Продолжить');
}

/** Walk the whole questionnaire to the review screen. */
async function fillQuestionnaire(user: User): Promise<void> {
  await walkToGoal(user);
  await user.type(screen.getByLabelText('Желаемый результат на 3000 м'), '14:30');
  await click(user, 'Продолжить');   // → RACE_DATE
  await click(user, 'Продолжить');   // → REVIEW
}

/** Create the cycle from the review screen and land on Today. */
async function createCycleAndReachToday(user: User): Promise<void> {
  await fillQuestionnaire(user);
  await click(user, 'Рассчитать план');
  await click(user, 'Посмотреть план');
  await click(user, 'Перейти к подготовке');
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
});

describe('first run', () => {
  test('explains the app and offers one main action', () => {
    render(<App storage={memoryStorage()} />);

    expect(screen.getByText('Физуха')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Начать подготовку'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Как это работает'})).toBeInTheDocument();
    expect(screen.queryByRole('navigation', {name: 'Основные разделы'})).not.toBeInTheDocument();
  });

  test('the secondary action explains the plan without leaving the screen', async () => {
    const user = userEvent.setup();
    render(<App storage={memoryStorage()} />);

    await click(user, 'Как это работает');
    expect(screen.getByText(/Нагрузка определяется подтверждённой текущей формой/)).toBeInTheDocument();
  });

  test('starting the questionnaire changes the URL, so a reload keeps the step', async () => {
    const user = userEvent.setup();
    render(<App storage={memoryStorage()} />);

    await click(user, 'Начать подготовку');
    expect(path()).toBe('/questionnaire?step=RESULT');
    expect(screen.getByText('Шаг 1 из 8')).toBeInTheDocument();
    expect(screen.getByText('Текущий результат')).toBeInTheDocument();
  });
});

describe('questionnaire', () => {
  test('an empty or malformed time blocks the step and explains why', async () => {
    const user = userEvent.setup();
    render(<App storage={memoryStorage()} />);
    await click(user, 'Начать подготовку');

    const time = screen.getByLabelText('Ваш результат');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.type(time, '15.20');
    await click(user, 'Продолжить');
    expect(screen.getByRole('alert')).toHaveTextContent('Введите время в формате ММ:СС');
    expect(path()).toBe('/questionnaire?step=RESULT');

    await user.clear(time);
    await user.type(time, '15:75');
    await click(user, 'Продолжить');
    expect(screen.getByRole('alert')).toHaveTextContent('Такого времени не существует');

    await user.clear(time);
    await user.type(time, '15:20');
    await click(user, 'Продолжить');
    expect(path()).toBe('/questionnaire?step=VOLUME');
  });

  test('the goal step states that the goal is a direction, not the load', async () => {
    const user = userEvent.setup();
    render(<App storage={memoryStorage()} />);
    await walkToGoal(user);

    expect(path()).toBe('/questionnaire?step=GOAL');
    expect(screen.getByText(/Цель задаёт направление подготовки/)).toBeInTheDocument();
    expect(screen.getByText(/Рабочую нагрузку определяет подтверждённая текущая форма/)).toBeInTheDocument();
  });

  test('a step can be revisited without losing what was typed', async () => {
    const user = userEvent.setup();
    render(<App storage={memoryStorage()} />);
    await click(user, 'Начать подготовку');
    await user.type(screen.getByLabelText('Ваш результат'), '15:20');
    await click(user, 'Продолжить');
    await click(user, 'Назад');

    expect(path()).toBe('/questionnaire?step=RESULT');
    expect(screen.getByLabelText('Ваш результат')).toHaveValue('15:20');
  });

  test('safety questions are factual and carry no diagnosis', () => {
    window.history.replaceState(null, '', '/questionnaire?step=SAFETY');
    render(<App storage={memoryStorage()} />);

    expect(screen.getByText('Состояние')).toBeInTheDocument();
    expect(screen.getByText(/Оно учитывает то, что вы сообщили/)).toBeInTheDocument();
    expect(screen.getByLabelText('Есть признаки острого заболевания (температура, сильное недомогание)')).toBeInTheDocument();
    expect(screen.getByLabelText('Насколько сильна боль')).toBeInTheDocument();
  });
});

describe('cycle creation', () => {
  test('the review shows the entered data, and only the explicit action creates the cycle', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await fillQuestionnaire(user);

    expect(path()).toBe('/review');
    expect(screen.getByText('Проверьте данные')).toBeInTheDocument();
    expect(screen.getByText('15:20')).toBeInTheDocument();
    expect(screen.getByText('14:30')).toBeInTheDocument();
    expect(loadActiveCycle(createRepository(storage)).kind).toBe('EMPTY');

    await click(user, 'Рассчитать план');

    expect(path()).toBe('/assessment');
    const loaded = loadActiveCycle(createRepository(storage));
    expect(loaded.kind).toBe('READY');
    if (loaded.kind === 'READY') {
      expect(loaded.appState.cycle.baseline.targetTimeSeconds).toBe(870);
      expect(loaded.appState.cycle.baseline.performance?.timeSeconds).toBe(920);
      expect(loaded.appState.events[0]?.type).toBe('CYCLE_CREATED');
    }
  });

  test('a race date in the past is refused by the engine and reported on its own step', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await walkToGoal(user);
    await user.type(screen.getByLabelText('Желаемый результат на 3000 м'), '14:30');
    await click(user, 'Продолжить');   // → RACE_DATE
    fireEvent.change(screen.getByLabelText('Дата итогового забега'), {target: {value: '2020-01-01'}});
    await click(user, 'Продолжить');   // → REVIEW
    await click(user, 'Рассчитать план');

    expect(path()).toBe('/questionnaire?step=RACE_DATE');
    expect(screen.getByText('Дата старта уже прошла')).toBeInTheDocument();
    expect(loadActiveCycle(createRepository(storage)).kind).toBe('EMPTY');
  });

  test('an unsolved step blocks the walk before the engine is ever called', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await walkToGoal(user);

    await click(user, 'Продолжить');
    expect(path()).toBe('/questionnaire?step=GOAL');
    expect(screen.getByRole('alert')).toHaveTextContent('Введите время в формате ММ:СС');
    expect(loadActiveCycle(createRepository(storage)).kind).toBe('EMPTY');
  });
});

describe('assessment and plan', () => {
  test('the assessment explains the decision without technical codes', async () => {
    const user = userEvent.setup();
    render(<App storage={memoryStorage()} />);
    await fillQuestionnaire(user);
    await click(user, 'Рассчитать план');

    expect(screen.getByText('Ваша подготовка')).toBeInTheDocument();
    expect(screen.getByText('Текущий уровень: 15:20 на 3000 м')).toBeInTheDocument();
    expect(screen.getByText('Цель: 14:30')).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Можно ли уже использовать целевой темп'})).toBeInTheDocument();
    expect(screen.getByText(/Целевой результат показывает, к чему мы идём/)).toBeInTheDocument();
    for (const code of ['T0', 'T1', 'T2', 'T3', 'Q0', 'Q1', 'Q2', 'CLOSED', 'PARTIAL', 'OPEN', 'FOUNDATION', 'DEVELOPMENT', 'SPECIFIC', 'TAPER', 'RE_ENTRY', 'HOLD_DIAGNOSTIC']) {
      expect(screen.queryByText(new RegExp(`\\b${code}\\b`))).not.toBeInTheDocument();
    }

    await click(user, 'Почему такой план?');
    expect(screen.getByText('Данные, на которых построен план')).toBeInTheDocument();

    await click(user, 'Посмотреть план');
    expect(path()).toBe('/plan-ready');
    expect(screen.getByText('Ваш план готов')).toBeInTheDocument();
    expect(screen.getByText(/Показаны тренировки, которые уже построены/)).toBeInTheDocument();
  });

  test('the ready plan leads to Today, which shows the real engine queue', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    expect(path()).toBe('/today');
    expect(screen.getByRole('navigation', {name: 'Основные разделы'})).toBeInTheDocument();

    const loaded = loadActiveCycle(createRepository(storage));
    expect(loaded.kind).toBe('READY');
    if (loaded.kind !== 'READY') return;
    const todayWorkout = loaded.engineState.queue.find((workout) => workout.scheduledDate === deviceToday());

    if (todayWorkout === undefined) {
      expect(screen.getByText('Сегодня восстановление')).toBeInTheDocument();
      return;
    }
    await click(user, 'Открыть тренировку');
    expect(path()).toBe(`/workout/${todayWorkout.id}`);
    expect(screen.getByText('Объём')).toBeInTheDocument();
    expect(screen.getByText('Режим')).toBeInTheDocument();
  });

  test('workout details never add a warm-up or cooldown the engine did not prescribe', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    const loaded = loadActiveCycle(createRepository(storage));
    if (loaded.kind !== 'READY') return;
    const workout = loaded.engineState.queue.find((entry) => entry.scheduledDate === deviceToday());
    if (workout === undefined) return;

    await click(user, 'Открыть тренировку');
    if (workout.warmupMinutes === 0) expect(screen.queryByText('Разминка')).not.toBeInTheDocument();
    if (workout.cooldownMinutes === 0) expect(screen.queryByText('Заминка')).not.toBeInTheDocument();
    if (workout.main.mode !== 'INTERVALS') expect(screen.queryByText('Отрезки')).not.toBeInTheDocument();
  });
});

describe('reload and recovery', () => {
  test('a stored cycle is restored after a reload instead of restarting the questionnaire', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = render(<App storage={storage} />);
    await createCycleAndReachToday(user);
    first.unmount();

    window.history.replaceState(null, '', '/today');
    render(<App storage={storage} />);

    expect(screen.getByRole('navigation', {name: 'Основные разделы'})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Начать подготовку'})).not.toBeInTheDocument();
    expect(path()).toBe('/today');
  });

  test('a direct link to a protected screen without a cycle lands on the first run', () => {
    window.history.replaceState(null, '', '/today');
    render(<App storage={memoryStorage()} />);

    expect(screen.getByRole('button', {name: 'Начать подготовку'})).toBeInTheDocument();
    expect(path()).toBe('/');
  });

  test('damaged stored data produces an explicit error state and is not deleted', () => {
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: '{not json'});
    render(<App storage={storage} />);

    expect(screen.getByText('Не удалось прочитать сохранённые данные')).toBeInTheDocument();
    expect(storage.map.get(ACTIVE_CYCLE_KEY)).toBe('{not json');
  });

  test('a newer envelope version is refused without touching the data', () => {
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: JSON.stringify({formatVersion: 99, cycle: {}})});
    render(<App storage={storage} />);

    expect(screen.getByText('Данные несовместимы с текущей версией')).toBeInTheDocument();
    expect(storage.map.has(ACTIVE_CYCLE_KEY)).toBe(true);
  });
});

describe('navigation', () => {
  test('the bottom navigation reaches every section and keeps the cycle', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    const nav = screen.getByRole('navigation', {name: 'Основные разделы'});

    await clickIn(user, nav, 'План');
    expect(path()).toBe('/plan');
    expect(screen.getByText(/Показан фактический горизонт плана/)).toBeInTheDocument();

    await clickIn(user, nav, 'История');
    expect(path()).toBe('/history');
    expect(screen.getByText('Пока нет выполненных тренировок')).toBeInTheDocument();
    await clickIn(user, screen.getByText('Архив').closest('div')!, 'Архив');
    expect(screen.getByText('Завершённых циклов пока нет')).toBeInTheDocument();

    await clickIn(user, nav, 'Профиль');
    expect(path()).toBe('/profile');
    expect(screen.getByText('Исходные данные')).toBeInTheDocument();
    expect(screen.getByText('Этап, допуск к целевому темпу и план определяет приложение: вручную они не меняются.')).toBeInTheDocument();

    await clickIn(user, nav, 'Сегодня');
    expect(path()).toBe('/today');
  });

  test('refreshing the plan goes through the engine and keeps the baseline intact', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    const before = loadActiveCycle(createRepository(storage));
    expect(before.kind).toBe('READY');
    if (before.kind !== 'READY') return;

    await clickIn(user, screen.getByRole('navigation', {name: 'Основные разделы'}), 'План');
    await click(user, 'Обновить план');

    const after = loadActiveCycle(createRepository(storage));
    expect(after.kind).toBe('READY');
    if (after.kind !== 'READY') return;
    expect(after.appState.cycle.engineState).toBeTypeOf('string');
    expect(after.appState.cycle.baseline).toEqual(before.appState.cycle.baseline);
    expect(after.appState.events).toEqual(before.appState.events);
    expect(after.appState.cycle.cycleId).toBe(before.appState.cycle.cycleId);
  });

  test('the goal and the race date are shown, and engine verdicts cannot be edited by hand', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    await clickIn(user, screen.getByRole('navigation', {name: 'Основные разделы'}), 'Профиль');
    // The race date appears both as a cycle parameter and in the initial snapshot.
    expect(screen.getAllByText(formatDateLong(addDays(deviceToday(), 56))).length).toBeGreaterThan(0);
    for (const label of ['Изменить этап', 'Изменить допуск', 'Изменить план', 'Изменить тренировку']) {
      expect(screen.queryByRole('button', {name: label})).not.toBeInTheDocument();
    }
  });
});

/** A stored cycle, created on a chosen day. */
function seedCycle(today: string, createdOn: string): string {
  const filled = {...defaultDraft(today), resultTime: '15:20', resultDate: addDays(createdOn, -10), targetTime: '14:30', raceDate: addDays(today, 56)};
  const built = buildProfile(filled);
  if (!built.ok) throw new Error('fixture: the draft must build');
  const seed = memoryStorage();
  const created = createCycle(createRepository(seed), {
    profile: built.profile,
    deviceToday: createdOn,
    cycleId: 'cycle-seeded',
    createdAt: `${createdOn}T09:00:00.000Z`,
    locale: 'ru-RU',
  });
  if (!created.ok) throw new Error('fixture: the cycle must be created');
  const raw = seed.map.get(ACTIVE_CYCLE_KEY);
  if (raw === undefined) throw new Error('fixture: the cycle must be stored');
  return raw;
}

/** A stored cycle created two days ago, so it still holds unrecorded sessions (INV-1). */
function seedStaleCycle(today: string): string {
  return seedCycle(today, addDays(today, -2));
}

describe('INV-1: a pending result blocks every clock-advancing action', () => {
  test('Today reports it, the plan offers no refresh, and nothing is written', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedStaleCycle(deviceToday())});
    render(<App storage={storage} />);
    const raw = storage.map.get(ACTIVE_CYCLE_KEY);

    expect(screen.getByText('Предыдущая тренировка ещё не закрыта')).toBeInTheDocument();

    await clickIn(user, screen.getByRole('navigation', {name: 'Основные разделы'}), 'План');
    expect(path()).toBe('/plan');
    // The screen must not offer an action the application layer would refuse.
    expect(screen.queryByRole('button', {name: 'Обновить план'})).not.toBeInTheDocument();
    expect(screen.getByText('Предыдущая тренировка ещё не закрыта')).toBeInTheDocument();
    expect(storage.map.get(ACTIVE_CYCLE_KEY)).toBe(raw);
  });
});

describe('a damaged record never becomes a dead end', () => {
  test('the damaged cycle is deleted only after an explicit confirmation', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: '{not json'});
    render(<App storage={storage} />);

    expect(screen.getByText('Не удалось прочитать сохранённые данные')).toBeInTheDocument();

    // The first tap only asks for confirmation.
    await click(user, 'Начать заново');
    expect(screen.getByText('Удалить повреждённый цикл?')).toBeInTheDocument();
    await click(user, 'Отмена');
    expect(screen.queryByText('Удалить повреждённый цикл?')).not.toBeInTheDocument();
    expect(storage.map.get(ACTIVE_CYCLE_KEY)).toBe('{not json');

    // Confirming removes the record and the user can really start over.
    await click(user, 'Начать заново');
    await click(user, 'Удалить и начать заново');
    expect(storage.map.has(ACTIVE_CYCLE_KEY)).toBe(false);
    await click(user, 'Начать подготовку');
    expect(path()).toBe('/questionnaire?step=RESULT');
  });

  test('an incompatible record is never offered for deletion', () => {
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: JSON.stringify({formatVersion: 99, cycle: {}})});
    render(<App storage={storage} />);

    expect(screen.getByText('Данные несовместимы с текущей версией')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Начать заново'})).not.toBeInTheDocument();
    expect(storage.map.has(ACTIVE_CYCLE_KEY)).toBe(true);
  });
});

describe('a device without permanent storage', () => {
  test('the shell refuses to start instead of pretending the cycle is saved', async () => {
    const user = userEvent.setup();
    const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    try {
      render(<App />);
      expect(screen.getByText('Цикл нельзя надёжно сохранить')).toBeInTheDocument();
      expect(screen.queryByRole('button', {name: 'Начать подготовку'})).not.toBeInTheDocument();
      expect(window.localStorage.getItem(ACTIVE_CYCLE_KEY)).toBeNull();
    } finally {
      denied.mockRestore();
    }

    // Once the device allows storage again, retrying leads to a working shell.
    await click(user, 'Повторить');
    expect(screen.getByRole('button', {name: 'Начать подготовку'})).toBeInTheDocument();
  });
});

describe('the calendar day changes while the app stays open', () => {
  test('crossing midnight moves Today to the pending state and advances no clock', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 9, 5, 21, 0, 0));
      const today = deviceToday();
      expect(today).toBe('2026-10-05');

      const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedCycle(today, today)});
      render(<App storage={storage} />);
      const raw = storage.map.get(ACTIVE_CYCLE_KEY);

      // In the evening the screen shows today's session.
      expect(screen.getByRole('button', {name: 'Открыть тренировку'})).toBeInTheDocument();

      // The app is suspended overnight and resumed without a reload.
      vi.setSystemTime(new Date(2026, 9, 6, 7, 30, 0));
      act(() => void document.dispatchEvent(new Event('visibilitychange')));

      expect(screen.getByText('Предыдущая тренировка ещё не закрыта')).toBeInTheDocument();
      expect(screen.queryByRole('button', {name: 'Открыть тренировку'})).not.toBeInTheDocument();
      // Showing a new date is not the same as advancing the engine clock.
      expect(storage.map.get(ACTIVE_CYCLE_KEY)).toBe(raw);
    } finally {
      vi.useRealTimers();
    }
  });

  test('focus refreshes the date as well', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 9, 5, 21, 0, 0));
      const today = deviceToday();
      const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedCycle(today, today)});
      render(<App storage={storage} />);

      vi.setSystemTime(new Date(2026, 9, 7, 8, 0, 0));
      act(() => void window.dispatchEvent(new Event('focus')));

      expect(screen.getByText('Предыдущая тренировка ещё не закрыта')).toBeInTheDocument();
      // The pending list now covers two days, and still nothing was written off.
      expect(storage.map.has(ACTIVE_CYCLE_KEY)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('updating the active cycle does not reopen onboarding', () => {
  test('after a plan refresh, onboarding stays closed and its screens keep redirecting', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    // Onboarding was finished by "Перейти к подготовке".
    const nav = screen.getByRole('navigation', {name: 'Основные разделы'});
    await clickIn(user, nav, 'План');
    await click(user, 'Обновить план');
    expect(path()).toBe('/plan');

    // A later direct link to an onboarding screen must still land on Today.
    for (const onboarding of ['/assessment', '/plan-ready', '/review', '/questionnaire?step=GOAL']) {
      act(() => {
        window.history.replaceState(null, '', onboarding);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      expect(path()).toBe('/today');
      expect(screen.getByRole('navigation', {name: 'Основные разделы'})).toBeInTheDocument();
    }
  });
});
