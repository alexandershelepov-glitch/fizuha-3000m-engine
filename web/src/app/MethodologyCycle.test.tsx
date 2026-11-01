/**
 * The user-facing contract of the approved eight-week methodology:
 * - the questionnaire proposes a date the engine will actually enroll;
 * - it explains, before the cycle exists, when the methodology does not apply;
 * - a saved cycle states which methodology drives it;
 * - every calendar entry has a full, readable card.
 */
import {afterEach, describe, expect, test} from 'vitest';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {App} from './App.tsx';
import {Questionnaire} from '../ui/screens/Questionnaire.tsx';
import {Review} from '../ui/screens/Review.tsx';
import {defaultDraft} from '../application/questionnaire.ts';
import type {QuestionnaireDraft, QuestionnaireStep} from '../application/questionnaire.ts';
import {addDays, daysBetween, deviceToday} from '../application/format.ts';
import {ACTIVE_CYCLE_KEY, createRepository} from '../application/storage.ts';
import type {KeyValueStorage} from '../application/storage.ts';
import {createCycle} from '../application/cycle.ts';
import {buildProfile} from '../application/questionnaire.ts';

afterEach(cleanup);

/** The control profile of the approved methodology: 14:30 now, goal 14:00, three habitual runs. */
function v4Draft(today: string, overrides: Partial<QuestionnaireDraft> = {}): QuestionnaireDraft {
  return {
    ...defaultDraft(today),
    resultTime: '14:30',
    resultDate: today,
    canRun3Km: true,
    regularRunningWeeks: '20',
    actualRunsPerWeek: '3',
    averageWeeklyKm4Weeks: '16',
    longestUsualRunKm: '6',
    qualityRecall: 'EXACT',
    qualitySessions8Weeks: '0',
    qualityWeeks8Weeks: '0',
    qualityMostlyTolerated: true,
    availableRunsPerWeek: '3',
    performanceMismatch: 'NONE',
    targetTime: '14:00',
    ...overrides,
  };
}

function questionnaireStore(draft: QuestionnaireDraft) {
  return {
    draft,
    update: () => undefined,
    reset: () => undefined,
  };
}

function renderStep(step: QuestionnaireStep, draft: QuestionnaireDraft) {
  return render(<Questionnaire step={step} store={questionnaireStore(draft)} onNavigate={() => undefined} />);
}

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {map: Map<string, string>; writes: number} {
  const map = new Map(Object.entries(initial));
  return {
    map,
    writes: 0,
    getItem: (key) => map.get(key) ?? null,
    setItem(key, value) { this.writes += 1; map.set(key, value); },
    removeItem: (key) => void map.delete(key),
  };
}

/** Store a cycle created from the given draft, exactly as the review screen would. */
function seedCycle(today: string, draft: QuestionnaireDraft): KeyValueStorage & {map: Map<string, string>; writes: number} {
  const built = buildProfile(draft);
  if (!built.ok) throw new Error(`fixture: ${JSON.stringify(built.problems)}`);
  const storage = memoryStorage();
  const created = createCycle(createRepository(storage), {
    profile: built.profile,
    deviceToday: today,
    startDate: draft.startDate ?? today,
    cycleId: 'cycle-methodology',
    createdAt: `${today}T09:00:00.000Z`,
    locale: 'ru-RU',
  });
  if (!created.ok) throw new Error(`fixture: ${JSON.stringify(created.error)}`);
  return storage;
}

describe('the app never proposes a date it will not serve', () => {
  test('the default event date is the last week of the eight-week cycle', () => {
    const today = deviceToday();
    const draft = defaultDraft(today);
    expect(draft.raceDate).toBe(addDays(today, 54));
    expect(daysBetween(draft.startDate ?? today, draft.raceDate)).toBe(54);
  });

  test('the date step names the methodology that the chosen dates create', () => {
    const today = deviceToday();
    renderStep('RACE_DATE', v4Draft(today));
    expect(screen.getByText('Методика №4 · 8 недель · 24 занятия')).toBeInTheDocument();
    expect(screen.getByText(/Восемь недель, 24 занятия/)).toBeInTheDocument();
  });

  test('a date outside the window is explained, and fixed with one tap', () => {
    const today = deviceToday();
    const draft = {...v4Draft(today), raceDate: addDays(today, 56)};
    renderStep('RACE_DATE', draft);

    expect(screen.getAllByText('Общий план: методика №4 не применена').length).toBeGreaterThan(0);
    expect(screen.getByText(/неподходящая продолжительность подготовки/)).toBeInTheDocument();
    // The eight-week window is stated in days, not left to guesswork.
    expect(screen.getByText(/53–55 дней/)).toBeInTheDocument();

    const fix = screen.getByRole('button', {name: 'Поставить норматив в конце 8-й недели'});
    expect(fix).toBeInTheDocument();
  });

  test('an unsuitable base is explained by its own reason, not by the date', () => {
    const today = deviceToday();
    renderStep('RACE_DATE', v4Draft(today, {averageWeeklyKm4Weeks: '8', longestUsualRunKm: '4'}));
    expect(screen.getByText(/меньше 15 км в неделю/)).toBeInTheDocument();
    expect(screen.getByText(/короче 6 км/)).toBeInTheDocument();
    // A one-tap date fix cannot help when the base itself is the problem.
    expect(screen.queryByRole('button', {name: 'Поставить норматив в конце 8-й недели'})).not.toBeInTheDocument();
  });

  test('a missing result is its own reason', () => {
    const today = deviceToday();
    renderStep('RACE_DATE', v4Draft(today, {hasResult: false, performanceMismatch: 'NONE'}));
    expect(screen.getByText(/нет подтверждённого результата/)).toBeInTheDocument();
  });
});

describe('the review screen states the methodology before the cycle exists', () => {
  test('an eligible profile is told the eight-week plan will be created', () => {
    const today = deviceToday();
    render(<Review draft={v4Draft(today)} today={today} onCreate={() => ({kind: 'CREATED'})} onNavigate={() => undefined} />);
    // Both the summary row and the explanation name the plan that is about to be created.
    expect(screen.getAllByText(/Методика №4 · 8 недель · 24 занятия/).length).toBeGreaterThan(0);
  });

  test('an ineligible profile is told what is missing and what happens instead', () => {
    const today = deviceToday();
    render(<Review draft={v4Draft(today, {availableRunsPerWeek: '2'})} today={today} onCreate={() => ({kind: 'CREATED'})} onNavigate={() => undefined} />);
    expect(screen.getAllByText('Общий план: методика №4 не применена').length).toBeGreaterThan(0);
    expect(screen.getByText(/три привычные и доступные тренировки/)).toBeInTheDocument();
    expect(screen.getByText(/только к новому циклу/)).toBeInTheDocument();
  });
});

describe('calendar: every entry opens a full card', () => {
  function openPlan(): ReturnType<typeof memoryStorage> {
    const today = deviceToday();
    const storage = seedCycle(today, v4Draft(today));
    window.history.replaceState(null, '', '/plan');
    render(<App storage={storage} />);
    return storage;
  }

  test('a future predicted session opens from the calendar and returns to the selected date', () => {
    const storage = openPlan();
    const before = storage.map.get(ACTIVE_CYCLE_KEY);
    const blocks = document.querySelectorAll('.calendar-week-block');
    expect(blocks.length).toBe(8);

    // Week 3, second session: a future preliminary day, not issued yet.
    const day = blocks[2]!.querySelectorAll('.calendar-day')[2]!;
    const label = day.getAttribute('aria-label')!;
    fireEvent.click(day);

    const card = screen.getByRole('dialog');
    expect(card).toBeInTheDocument();
    expect(within(card).getByText('Предварительный план')).toBeInTheDocument();
    // The full prescription is readable, not just a title.
    expect(within(card).getByText('Параметры и объём')).toBeInTheDocument();
    expect(within(card).getByText('Зачем эта тренировка')).toBeInTheDocument();
    expect(within(card).getByText(/^Разминка/)).toBeInTheDocument();
    // A predicted session cannot be closed as a result.
    expect(within(card).queryByRole('button', {name: 'Внести результат'})).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', {name: 'Вернуться к календарю'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const selected = document.querySelector('.calendar-day--selected');
    expect(selected?.getAttribute('aria-label')).toBe(label);
    // Reading the plan never writes anything.
    expect(storage.map.get(ACTIVE_CYCLE_KEY)).toBe(before);
  });

  test('the header states the approved methodology of the saved cycle', () => {
    openPlan();
    expect(screen.getByText('Методика №4 · 8 недель · 24 занятия')).toBeInTheDocument();
  });
});
