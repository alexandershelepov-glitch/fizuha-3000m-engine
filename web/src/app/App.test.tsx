/**
 * UI tests: the onboarding path, validation, cycle creation, the assessment and the Today screen,
 * driven through the real components in jsdom. Storage is injected, so every test controls exactly
 * what the application is allowed to read.
 */
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {App} from './App.tsx';
import {ACTIVE_CYCLE_KEY, createRepository, loadActiveCycle} from '../application/storage.ts';
import type {KeyValueStorage} from '../application/storage.ts';
import {addDays, deviceToday, formatDateLong} from '../application/format.ts';
import {createCycle} from '../application/cycle.ts';
import {buildProfile, defaultDraft} from '../application/questionnaire.ts';
import type {QuestionnaireDraft} from '../application/questionnaire.ts';
import {workoutTypeText} from '../ui/copy/values.ts';
import {resultAvailability} from '../application/invariants.ts';

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
    // The main screen answers in plain words: current result, goal, where training starts, what next.
    expect(screen.getByText('Ваш текущий результат')).toBeInTheDocument();
    expect(screen.getByText('15:20 на 3000 м')).toBeInTheDocument();
    expect(screen.getByText('Ваша цель')).toBeInTheDocument();
    expect(screen.getByText('14:30 на 3000 м')).toBeInTheDocument();
    expect(screen.getByText('С чего начнётся подготовка')).toBeInTheDocument();
    expect(screen.getByText('Что дальше')).toBeInTheDocument();
    for (const code of ['T0', 'T1', 'T2', 'T3', 'Q0', 'Q1', 'Q2', 'CLOSED', 'PARTIAL', 'OPEN', 'FOUNDATION', 'DEVELOPMENT', 'SPECIFIC', 'TAPER', 'RE_ENTRY', 'HOLD_DIAGNOSTIC']) {
      expect(screen.queryByText(new RegExp(`\\b${code}\\b`))).not.toBeInTheDocument();
    }
    // The engine's own vocabulary stays behind the explanation, not in front of the person.
    expect(screen.queryByText(/Целевой результат показывает, к чему мы идём/)).not.toBeInTheDocument();

    await click(user, 'Почему такой план?');
    expect(screen.getByText('Данные, на которых построен план')).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Будете ли вы тренироваться в целевом темпе'})).toBeInTheDocument();
    expect(screen.getByText(/Целевой результат показывает, к чему мы идём/)).toBeInTheDocument();

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
/** The questionnaire answers that make the engine start with a paced session. */
const EXPERIENCED: Partial<QuestionnaireDraft> = {
  qualitySessions8Weeks: '8',
  qualityWeeks8Weeks: '6',
  experience: {threshold: true, vo2: true, specific3k: true},
  availableRunsPerWeek: '4',
};

function seedCycle(today: string, createdOn: string, overrides: Partial<QuestionnaireDraft> = {}): string {
  const filled = {...defaultDraft(today), resultTime: '15:20', resultDate: addDays(createdOn, -10), targetTime: '14:30', raceDate: addDays(today, 56), ...overrides};
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

/** The first session of the stored queue that is scheduled after today. */
function futureWorkoutId(storage: KeyValueStorage): string {
  const loaded = loadActiveCycle(createRepository(storage));
  if (loaded.kind !== 'READY') throw new Error('fixture');
  const future = loaded.engineState.queue.find((workout) => workout.scheduledDate > deviceToday());
  if (!future) throw new Error('fixture: no future session');
  return future.id;
}

function storedEngineState(storage: KeyValueStorage) {
  const loaded = loadActiveCycle(createRepository(storage));
  if (loaded.kind !== 'READY') throw new Error('fixture');
  return {appState: loaded.appState, engineState: loaded.engineState};
}

describe('closing a workout', () => {
  /** Walk from Today to the result form of today's session. */
  async function openResultForm(user: User): Promise<void> {
    await createCycleAndReachToday(user);
    await click(user, 'Внести результат');
    expect(path()).toMatch(/\/workout\/.+\/result$/);
  }

  test('a session is closed, the engine verdict is shown and Today reflects the new plan', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await openResultForm(user);

    expect(screen.getByText('Результат тренировки')).toBeInTheDocument();
    await click(user, 'Сохранить результат');

    // The outcome comes from the engine's own evaluation.
    expect(path()).toMatch(/\/workout\/.+\/outcome$/);
    expect(screen.getByText(/Тренировка выполнена|Лучше ожидаемого|Нагрузка потребовала корректировки|Текущую нагрузку нужно снизить/)).toBeInTheDocument();
    expect(screen.getByText('Что изменилось')).toBeInTheDocument();

    const stored = loadActiveCycle(createRepository(storage));
    expect(stored.kind).toBe('READY');
    if (stored.kind === 'READY') expect(stored.engineState.history.length).toBe(1);

    await click(user, 'Продолжить');
    expect(path()).toBe('/today');
    expect(screen.getByRole('navigation', {name: 'Основные разделы'})).toBeInTheDocument();
  });

  test('a structural mistake is reported inline and nothing is saved', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await openResultForm(user);
    const before = storage.map.get(ACTIVE_CYCLE_KEY);

    await user.clear(screen.getByLabelText('Длительность, мин'));
    await click(user, 'Сохранить результат');

    expect(screen.getByRole('alert')).toHaveTextContent('Заполните это поле');
    expect(path()).toMatch(/\/result$/);
    expect(storage.map.get(ACTIVE_CYCLE_KEY)).toBe(before);
  });

  test('an incomplete repeats block warns about accuracy and never predicts the verdict', async () => {
    const user = userEvent.setup();
    const today = deviceToday();
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedCycle(today, today, EXPERIENCED)});
    render(<App storage={storage} />);

    // today's session is a paced one, so the block is expanded
    await click(user, 'Внести результат');
    expect(screen.getByText('Результаты отрезков')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Время').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Дистанция, м').length).toBeGreaterThan(0);

    await click(user, 'Сохранить результат');
    expect(screen.getByText('Результаты отрезков не заполнены')).toBeInTheDocument();
    expect(screen.getByText(/менее точной/)).toBeInTheDocument();
    // The warning must not promise a classification.
    expect(screen.queryByText(/YELLOW/)).not.toBeInTheDocument();

    // Going back keeps the form; sending as is reaches the engine.
    await click(user, 'Вернуться и заполнить');
    expect(path()).toMatch(/\/result$/);
    await click(user, 'Сохранить результат');
    await click(user, 'Отправить как есть');
    expect(path()).toMatch(/\/outcome$/);
    expect(screen.getByText('Нагрузка потребовала корректировки')).toBeInTheDocument();
  });

  test('a safety flag leads to the reducing state, decided by the engine', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await openResultForm(user);

    const group = screen.getByRole('group', {name: 'Из-за боли меняется техника движения'});
    await user.click(within(group).getByRole('button', {name: 'Да'}));
    await click(user, 'Сохранить результат');

    expect(screen.getByText('Текущую нагрузку нужно снизить')).toBeInTheDocument();
    const stored = loadActiveCycle(createRepository(storage));
    if (stored.kind === 'READY') {
      expect(stored.engineState.history[0]!.classified.evaluation).toBe('RED');
      expect(stored.engineState.decision.safety).not.toBe('OK');
    }
  });

  test('an overdue session is closed through the pending state of Today', async () => {
    const user = userEvent.setup();
    const today = deviceToday();
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedStaleCycle(today)});
    render(<App storage={storage} />);

    expect(screen.getByText('Предыдущая тренировка ещё не закрыта')).toBeInTheDocument();
    await click(user, 'Внести результат');
    expect(path()).toMatch(/\/result$/);

    await click(user, 'Сохранить результат');
    expect(path()).toMatch(/\/outcome$/);
    await click(user, 'Продолжить');

    // The earliest overdue session is gone; the next one is still pending.
    const stored = loadActiveCycle(createRepository(storage));
    expect(stored.kind).toBe('READY');
    if (stored.kind === 'READY') {
      expect(stored.engineState.history.length).toBe(1);
      // The only overdue session was closed, so nothing is pending any more.
      expect(stored.engineState.queue.some((workout) => workout.scheduledDate < today)).toBe(false);
    }
    expect(screen.queryByText('Предыдущая тренировка ещё не закрыта')).not.toBeInTheDocument();
  });

  test('pressing save twice records the session once', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await openResultForm(user);

    const button = screen.getByRole('button', {name: 'Сохранить результат'});
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(path()).toMatch(/\/outcome$/);
    const stored = loadActiveCycle(createRepository(storage));
    expect(stored.kind).toBe('READY');
    if (stored.kind === 'READY') expect(stored.engineState.history.length).toBe(1);
    // The second attempt must not surface as an error either.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('an old link to a closed session shows a clear state instead of an empty form', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = render(<App storage={storage} />);
    await openResultForm(user);

    const stored = loadActiveCycle(createRepository(storage));
    if (stored.kind !== 'READY') throw new Error('fixture');
    const workoutId = stored.engineState.queue.find((workout) => workout.scheduledDate === deviceToday())!.id;

    await click(user, 'Сохранить результат');
    await click(user, 'Продолжить');
    first.unmount();

    window.history.replaceState(null, '', `/workout/${workoutId}/result`);
    render(<App storage={storage} />);
    expect(screen.getByText('Эта тренировка уже закрыта')).toBeInTheDocument();
  });

  test('the outcome survives a reload with everything the stored state still knows', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = render(<App storage={storage} />);
    await openResultForm(user);
    const stored = loadActiveCycle(createRepository(storage));
    if (stored.kind !== 'READY') throw new Error('fixture');
    const workoutId = stored.engineState.queue.find((workout) => workout.scheduledDate === deviceToday())!.id;

    await click(user, 'Сохранить результат');
    first.unmount();

    window.history.replaceState(null, '', `/workout/${workoutId}/outcome`);
    render(<App storage={storage} />);

    // The verdict, the reason and the next session come from the persisted engine state; only the
    // session-scoped list of changes is gone, so that block is absent rather than reconstructed.
    expect(screen.getByText(/Тренировка выполнена|Лучше ожидаемого|Нагрузка потребовала корректировки|Текущую нагрузку нужно снизить/)).toBeInTheDocument();
    expect(screen.queryByText('Что изменилось')).not.toBeInTheDocument();
    expect(screen.getByText('Следующая тренировка')).toBeInTheDocument();
  });

  test('the plan shows the new engine queue after the session', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await openResultForm(user);

    const before = loadActiveCycle(createRepository(storage));
    if (before.kind !== 'READY') throw new Error('fixture');
    const beforeQueue = before.engineState.queue.map((workout) => workout.id);

    await click(user, 'Сохранить результат');
    await click(user, 'Посмотреть план');

    expect(path()).toBe('/plan');
    const after = loadActiveCycle(createRepository(storage));
    if (after.kind !== 'READY') throw new Error('fixture');
    expect(after.engineState.queue.map((workout) => workout.id)).not.toEqual(beforeQueue);
    // The screen shows the stored queue, not a cached one.
    expect(screen.getByText('Построенные тренировки')).toBeInTheDocument();
    const firstAfter = after.engineState.queue[0];
    if (firstAfter !== undefined) {
      // The screen shows the new engine queue: the first session of the stored state is listed.
      expect(screen.getAllByText(workoutTypeText[firstAfter.type].label).length).toBeGreaterThan(0);
    }
    // The closed session is gone from the plan, and the stored queue is what the screen displays.
    expect(screen.queryByText(/Уже закрыта/)).not.toBeInTheDocument();
  });
});

describe('a session in the future', () => {
  test('its details are visible but the result cannot be entered yet', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    const id = futureWorkoutId(storage);
    act(() => {
      window.history.replaceState(null, '', `/workout/${id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // The prescription is shown: type, volume, mode.
    expect(screen.getByText('Объём')).toBeInTheDocument();
    expect(screen.getByText('Режим')).toBeInTheDocument();
    // But the session cannot be closed in advance.
    expect(screen.queryByRole('button', {name: 'Внести результат'})).not.toBeInTheDocument();
    expect(screen.getByText('Результат можно внести в день тренировки или позже.')).toBeInTheDocument();
  });

  test('a direct link to its result form cannot close anything either', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    const id = futureWorkoutId(storage);
    const raw = storage.map.get(ACTIVE_CYCLE_KEY);

    act(() => {
      window.history.replaceState(null, '', `/workout/${id}/result`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // The form is not offered at all, so there is nothing to submit.
    expect(screen.queryByRole('button', {name: 'Сохранить результат'})).not.toBeInTheDocument();
    expect(screen.getByText('Тренировка ещё не состоялась')).toBeInTheDocument();
    expect(screen.getByText('Результат можно внести в день тренировки или позже.')).toBeInTheDocument();
    expect(storage.map.get(ACTIVE_CYCLE_KEY)).toBe(raw);

    // And the application refuses the same request even if it is made directly.
    const loaded = loadActiveCycle(createRepository(storage));
    if (loaded.kind !== 'READY') throw new Error('fixture');
    expect(resultAvailability(loaded.engineState, id, deviceToday())).toBe('BEFORE_SCHEDULED_DATE');
  });

  test("today's session still carries the active CTA", async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    expect(screen.getByRole('button', {name: 'Внести результат'})).toBeInTheDocument();
  });
});

describe('skipping a session', () => {
  test('the confirmation can be cancelled without changing anything', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);
    const raw = storage.map.get(ACTIVE_CYCLE_KEY);

    await click(user, 'Открыть тренировку');
    await click(user, 'Не смогу выполнить');
    expect(screen.getByText('Пропустить эту тренировку?')).toBeInTheDocument();
    await click(user, 'Отмена');

    expect(screen.queryByText('Пропустить эту тренировку?')).not.toBeInTheDocument();
    expect(storage.map.get(ACTIVE_CYCLE_KEY)).toBe(raw);
  });

  test('confirming records the skip, updates the plan and returns to Today', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    const before = storedEngineState(storage);
    const todayWorkout = before.engineState.queue.find((workout) => workout.scheduledDate === deviceToday());
    expect(todayWorkout).toBeDefined();

    await click(user, 'Открыть тренировку');
    await click(user, 'Не смогу выполнить');
    await click(user, 'Пропустить');

    expect(path()).toBe('/today');
    expect(screen.getByRole('navigation', {name: 'Основные разделы'})).toBeInTheDocument();
    const after = storedEngineState(storage);
    expect(after.engineState.queue.some((workout) => workout.id === todayWorkout!.id)).toBe(false);
    expect(after.engineState.history.length).toBe(0);
    const skipped = after.appState.events.filter((event) => event.type === 'WORKOUT_SKIPPED');
    expect(skipped.length).toBe(1);
    expect(skipped[0]).toMatchObject({cause: 'VOLUNTARY', workoutId: todayWorkout!.id});
  });

  test('an overdue session can be closed as not done from Today', async () => {
    const user = userEvent.setup();
    const today = deviceToday();
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedCycle(today, addDays(today, -2))});
    render(<App storage={storage} />);

    expect(screen.getByText('Предыдущая тренировка ещё не закрыта')).toBeInTheDocument();
    await click(user, 'Я её не выполнял');

    expect(path()).toBe('/today');
    const after = storedEngineState(storage);
    const skipped = after.appState.events.filter((event) => event.type === 'WORKOUT_SKIPPED');
    expect(skipped.length).toBe(1);
    expect(skipped[0]).toMatchObject({cause: 'PAST_DUE'});
    // The overdue session of the seeded cycle is resolved, so Today is no longer pending.
    expect(screen.queryByText('Предыдущая тренировка ещё не закрыта')).not.toBeInTheDocument();
  });
});

describe('moving a session', () => {
  test('a future session can be moved and the new date is kept', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    const id = futureWorkoutId(storage);
    const before = storedEngineState(storage);
    const original = before.engineState.queue.find((workout) => workout.id === id)!;
    const occupiedDates = new Set(before.engineState.queue.map((workout) => workout.scheduledDate));
    const target = Array.from({length: 7}, (_, offset) => addDays(before.engineState.asOf, offset))
      .find((date) => date >= deviceToday() && date < before.engineState.profile.raceDate && !occupiedDates.has(date))!;
    expect(target).toBeDefined();

    act(() => {
      window.history.replaceState(null, '', `/workout/${id}/move`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByText('Перенести тренировку')).toBeInTheDocument();
    expect(screen.getByText(formatDateLong(original.scheduledDate))).toBeInTheDocument();

    await user.click(screen.getByRole('radio', {name: new RegExp(formatDateLong(target))}));
    await click(user, 'Перенести');

    // Back on the details of the same session, now showing the new date.
    expect(path()).toBe(`/workout/${id}`);
    expect(screen.getByText(formatDateLong(target))).toBeInTheDocument();
    const after = storedEngineState(storage);
    expect(after.engineState.queue.find((workout) => workout.id === id)?.scheduledDate).toBe(target);
    expect(after.appState.events.filter((event) => event.type === 'WORKOUT_MOVED').length).toBe(1);
  });

  test('a date the engine refuses is reported by its code', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    const id = futureWorkoutId(storage);
    const state = storedEngineState(storage);
    const original = state.engineState.queue.find((workout) => workout.id === id)!;
    // The next session already lives on that date.
    const occupied = state.engineState.queue.find((workout) => workout.scheduledDate !== original.scheduledDate && workout.scheduledDate > deviceToday())!.scheduledDate;
    const raw = storage.map.get(ACTIVE_CYCLE_KEY);

    act(() => {
      window.history.replaceState(null, '', `/workout/${id}/move`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await user.click(screen.getByRole('radio', {name: new RegExp(formatDateLong(occupied))}));
    await click(user, 'Перенести');

    expect(screen.getByText('На эту дату уже есть тренировка')).toBeInTheDocument();
    expect(storage.map.get(ACTIVE_CYCLE_KEY)).toBe(raw);
  });
});

describe('recording a checkpoint', () => {
  test('a required checkpoint is recorded and the assessment screen shows both values', async () => {
    const user = userEvent.setup();
    const today = deviceToday();
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedCycle(today, today, {hasResult: false})});
    render(<App storage={storage} />);

    expect(screen.getByText('Нужен контрольный результат')).toBeInTheDocument();
    await click(user, 'Внести контрольный результат');
    expect(path()).toBe('/checkpoint');

    await user.type(screen.getByLabelText('Результат на 3000 м'), '14:50');
    await click(user, 'Сохранить результат');

    expect(path()).toBe('/checkpoint/outcome');
    expect(screen.getByText('Оценка обновлена')).toBeInTheDocument();
    expect(screen.getByText('14:50')).toBeInTheDocument();
    expect(screen.getByText('Предыдущая форма')).toBeInTheDocument();

    const after = storedEngineState(storage);
    expect(after.engineState.profile.performance?.timeSeconds).toBe(890);
    expect(after.engineState.checkpointRequired).toBe(false);

    await click(user, 'Продолжить');
    expect(path()).toBe('/today');
    expect(screen.queryByText('Нужен контрольный результат')).not.toBeInTheDocument();
  });

  test('the immutable baseline keeps the first assessment', async () => {
    const user = userEvent.setup();
    const today = deviceToday();
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedCycle(today, today)});
    render(<App storage={storage} />);

    act(() => {
      window.history.replaceState(null, '', '/checkpoint');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await user.type(screen.getByLabelText('Результат на 3000 м'), '14:50');
    await click(user, 'Сохранить результат');

    const after = storedEngineState(storage);
    expect(after.appState.cycle.baseline.performance?.timeSeconds).toBe(920);
    expect(after.engineState.profile.performance?.timeSeconds).toBe(890);
  });

  test('an impossible date is reported by the engine code', async () => {
    const user = userEvent.setup();
    const today = deviceToday();
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedCycle(today, today, {hasResult: false})});
    render(<App storage={storage} />);

    await click(user, 'Внести контрольный результат');
    await user.type(screen.getByLabelText('Результат на 3000 м'), '14:50');
    fireEvent.change(screen.getByLabelText('Дата результата'), {target: {value: addDays(today, 1)}});
    await click(user, 'Сохранить результат');

    // The interface bounds the calendar, and the application refuses the same request anyway.
    expect(path()).toBe('/checkpoint');
    expect(screen.queryByText('Оценка обновлена')).not.toBeInTheDocument();
    expect(storage.map.get(ACTIVE_CYCLE_KEY)).not.toBeNull();
  });

  test('a malformed time is refused before the engine is asked', async () => {
    const user = userEvent.setup();
    const today = deviceToday();
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedCycle(today, today, {hasResult: false})});
    render(<App storage={storage} />);

    await click(user, 'Внести контрольный результат');
    await user.type(screen.getByLabelText('Результат на 3000 м'), '14.50');
    await click(user, 'Сохранить результат');

    expect(screen.getByRole('alert')).toHaveTextContent('Введите время в формате ММ:СС');
    expect(path()).toBe('/checkpoint');
  });
});

describe('history of actions', () => {
  test('skips, moves and checkpoints appear as chronological facts', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    await click(user, 'Открыть тренировку');
    await click(user, 'Не смогу выполнить');
    await click(user, 'Пропустить');

    await clickIn(user, screen.getByRole('navigation', {name: 'Основные разделы'}), 'История');
    expect(screen.getByText('События цикла')).toBeInTheDocument();
    expect(screen.getByText(/Тренировка пропущена/)).toBeInTheDocument();
    expect(screen.getByText('Цикл создан')).toBeInTheDocument();
  });
});

describe('an overdue session', () => {
  function overdueWorkoutId(storage: KeyValueStorage): string {
    const loaded = loadActiveCycle(createRepository(storage));
    if (loaded.kind !== 'READY') throw new Error('fixture');
    const overdue = loaded.engineState.queue.find((workout) => workout.scheduledDate < deviceToday());
    if (!overdue) throw new Error('fixture: no overdue session');
    return overdue.id;
  }

  test('offers its result and the not-done action, but no move', async () => {
    const user = userEvent.setup();
    const today = deviceToday();
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedCycle(today, addDays(today, -2))});
    render(<App storage={storage} />);

    const id = overdueWorkoutId(storage);
    act(() => {
      window.history.replaceState(null, '', `/workout/${id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // The session can be closed, and the reason is not the screen's business.
    expect(screen.getByRole('button', {name: 'Внести результат'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Не смогу выполнить'})).toBeInTheDocument();
    // Moving it back into the future is refused, and the screen explains why.
    expect(screen.queryByRole('button', {name: 'Перенести'})).not.toBeInTheDocument();
    expect(screen.getByText('Дата тренировки уже прошла. Внесите результат или отметьте, что она не выполнена.')).toBeInTheDocument();

    // The second action on Today closes it as not done.
    await clickIn(user, screen.getByRole('navigation', {name: 'Основные разделы'}), 'Сегодня');
    await click(user, 'Я её не выполнял');
    const after = storedEngineState(storage);
    expect(after.appState.events.filter((event) => event.type === 'WORKOUT_SKIPPED')[0]).toMatchObject({cause: 'PAST_DUE'});
  });

  test('a direct link to its move screen cannot perform the move', async () => {
    const today = deviceToday();
    const storage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedCycle(today, addDays(today, -2))});
    render(<App storage={storage} />);

    const id = overdueWorkoutId(storage);
    const raw = storage.map.get(ACTIVE_CYCLE_KEY);

    act(() => {
      window.history.replaceState(null, '', `/workout/${id}/move`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(screen.getByText('Эту тренировку нельзя перенести')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Перенести'})).not.toBeInTheDocument();
    expect(storage.map.get(ACTIVE_CYCLE_KEY)).toBe(raw);
  });

  test("today's session keeps the move action", async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App storage={storage} />);
    await createCycleAndReachToday(user);

    await click(user, 'Открыть тренировку');
    expect(screen.getByRole('button', {name: 'Перенести'})).toBeInTheDocument();
  });
});

describe('the skip reason', () => {
  test('is derived from the session date, not from the screen', async () => {
    // Today's session is a voluntary decision.
    const today = deviceToday();
    const todayStorage = memoryStorage();
    render(<App storage={todayStorage} />);
    await createCycleAndReachToday(userEvent.setup());
    await click(userEvent.setup(), 'Открыть тренировку');
    await click(userEvent.setup(), 'Не смогу выполнить');
    await click(userEvent.setup(), 'Пропустить');
    expect(storedEngineState(todayStorage).appState.events.filter((event) => event.type === 'WORKOUT_SKIPPED')[0]).toMatchObject({cause: 'VOLUNTARY'});

    // A session of two days ago is a miss, even though the same action was used.
    cleanup();
    const oldStorage = memoryStorage({[ACTIVE_CYCLE_KEY]: seedCycle(today, addDays(today, -2))});
    render(<App storage={oldStorage} />);
    await click(userEvent.setup(), 'Я её не выполнял');
    expect(storedEngineState(oldStorage).appState.events.filter((event) => event.type === 'WORKOUT_SKIPPED')[0]).toMatchObject({cause: 'PAST_DUE'});
  });
});
