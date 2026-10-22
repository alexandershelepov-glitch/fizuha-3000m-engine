/**
 * Issue #51: the full-cycle forecast in the Plan calendar.
 *
 * Drives the real Plan component with a real engine state: the "Весь период" mode shows every week
 * to the race date, future days read as a preliminary plan (no result entry, no move), and the
 * committed queue keeps its factual actions. The forecast is computed through the gateway only.
 */
import {afterEach, expect, test, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {Plan} from '../ui/screens/Plan.tsx';
import {createEngineState} from '../application/engineGateway.ts';
import type {Profile} from '../application/engineGateway.ts';
import type {KeyValueStorage} from '../application/storage.ts';
import type {AppStateV1} from '../application/appState.ts';

const TODAY = '2026-10-05'; // Monday
const addDays = (from: string, days: number): string =>
  new Date(Date.parse(from + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);

function healthy() {
  return {pain: 0, painIncreasing: false, alteredMovement: false, painWalkingOrRest: false,
    swelling: false, acuteIllness: false, otherStop: false, needsAssessment: false};
}
function profileFixture(over: Partial<Profile> = {}): Profile {
  return {
    performance: {timeSeconds: 920, date: TODAY, source: 'TEST_3K'}, targetTimeSeconds: 896,
    raceDate: addDays(TODAY, 84), regularRunningWeeks: 40, actualRunsPerWeek: 3, availableRunsPerWeek: 3,
    averageWeeklyKm4Weeks: 19, longestUsualRunKm: 8, canRun3Km: true,
    qualitySessions8Weeks: 4, qualityWeeks8Weeks: 3, qualityMostlyTolerated: true,
    experience: {threshold: true, vo2: false, specific3k: false},
    breaks: [], safety: healthy(), performanceMismatch: 'NONE', ...over,
  };
}

function memoryStorage(): KeyValueStorage & {data: Map<string, string>} {
  const data = new Map<string, string>();
  return {data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); }};
}
function appStateFor(cycleId: string): AppStateV1 {
  return {cycle: {cycleId}, events: []} as unknown as AppStateV1;
}

function renderPlan(profile: Profile = profileFixture()) {
  const engineState = createEngineState(profile, TODAY);
  const onNavigate = vi.fn();
  const view = render(<Plan engineState={engineState} storage={null} today={TODAY}
    onNavigate={onNavigate} onRefreshPlan={vi.fn()} refreshing={false} />);
  return {view, engineState, onNavigate};
}

afterEach(cleanup);

test('plan shows week and month as before, plus the full period to the race date', () => {
  renderPlan();
  expect(screen.getByRole('button', {name: 'Неделя'})).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Месяц'})).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Весь период'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name: 'Весь период'}));
  const blocks = document.querySelectorAll('.calendar-week-block');
  expect(blocks.length).toBeGreaterThanOrEqual(12);
  expect(blocks.length).toBeLessThanOrEqual(14);
  const captions = [...document.querySelectorAll('.calendar-week-caption')].map(node => node.textContent ?? '');
  expect(captions[0]).toContain('Неделя 1');
  expect(captions.at(-1)).toContain(`Неделя ${blocks.length}`);
  // 12 weeks × 7 day cells, every one rendered.
  expect(document.querySelectorAll('.calendar-period-list .calendar-day').length).toBe(blocks.length * 7);
});

test('future days render as a preliminary plan; committed days keep their actions', () => {
  renderPlan();
  fireEvent.click(screen.getByRole('button', {name: 'Весь период'}));
  // Committed queue day: the real actions stay available.
  const plannedCell = document.querySelector('.calendar-day--planned');
  expect(plannedCell).toBeTruthy();
  expect(plannedCell!.getAttribute('aria-label')).toContain('Назначено');
  fireEvent.click(plannedCell!);
  expect(screen.getByRole('button', {name: 'Открыть тренировку'})).toBeTruthy();
  // Future day beyond the issued horizon: preliminary, view-only.
  const forecastCell = document.querySelector('.calendar-day--forecast');
  expect(forecastCell).toBeTruthy();
  fireEvent.click(forecastCell!);
  expect(screen.getAllByText('Предварительный план. Изменяется по результатам тренировок.').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', {name: 'Открыть тренировку'})).toBeNull();
  expect(screen.queryByRole('button', {name: 'Перенести'})).toBeNull();
  // The workout parameters the engine produced are shown; nothing is invented in the UI layer.
  const detail = document.querySelector('.calendar-detail')!;
  expect(detail.textContent).toContain('Предварительные параметры');
  expect(detail.textContent).toMatch(/Усилие.+из 10/);
  expect(detail.textContent).toContain('Результат можно вносить только по назначениям текущей недели');
});

test('viewing the calendar never mutates the engine state', () => {
  const {engineState} = renderPlan();
  const before = JSON.stringify(engineState);
  fireEvent.click(screen.getByRole('button', {name: 'Весь период'}));
  const forecastCell = document.querySelector('.calendar-day--forecast')!;
  fireEvent.click(forecastCell);
  expect(JSON.stringify(engineState)).toBe(before);
  expect(engineState.history.length).toBe(0);
  expect(engineState.skippedWorkouts.length).toBe(0);
  // No warnings: the forecast computed clean windows without engine errors.
  expect(screen.queryByText('Прогноз рассчитан с предупреждениями')).toBeNull();
  expect(screen.queryByText('Прогноз недоступен')).toBeNull();
});

test('a novice without a 3000 m result sees the whole period without invented paces', () => {
  renderPlan(profileFixture({
    performance: null, targetTimeSeconds: 1200, actualRunsPerWeek: 1, availableRunsPerWeek: 3,
    averageWeeklyKm4Weeks: 2, longestUsualRunKm: 1.5, regularRunningWeeks: 3, canRun3Km: false,
    qualitySessions8Weeks: 0, qualityWeeks8Weeks: 0, qualityMostlyTolerated: false,
    experience: {threshold: false, vo2: false, specific3k: false},
  }));
  fireEvent.click(screen.getByRole('button', {name: 'Весь период'}));
  expect(document.querySelectorAll('.calendar-week-block').length).toBeGreaterThanOrEqual(12);
  const forecastCell = document.querySelector('.calendar-day--forecast') as HTMLElement | null;
  expect(forecastCell).toBeTruthy();
  fireEvent.click(forecastCell!);
  const detail = document.querySelector('.calendar-detail')!;
  expect(detail.textContent).not.toContain('Темп');
  expect(detail.textContent).not.toContain('Дорожка');
  expect(document.querySelectorAll('.calendar-day--control').length).toBe(0);
});

// ---- Issue #51 user-review fixes ----

test('review #1: first open after cycle creation shows the whole period; a later choice is remembered per cycle', () => {
  const engineState = createEngineState(profileFixture(), TODAY);
  const storage = memoryStorage();
  const props = {engineState, storage, today: TODAY, onNavigate: vi.fn(), onRefreshPlan: vi.fn(), refreshing: false};
  render(<Plan {...props} appState={appStateFor('cycle-A')} />);
  expect(screen.getByRole('button', {name: 'Весь период'}).getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelectorAll('.calendar-week-block').length).toBeGreaterThanOrEqual(12);
  fireEvent.click(screen.getByRole('button', {name: 'Неделя'}));
  expect(document.querySelectorAll('.calendar-days--week .calendar-day').length).toBe(7);
  cleanup();
  // Reopening the plan keeps the user's choice.
  render(<Plan {...props} appState={appStateFor('cycle-A')} />);
  expect(screen.getByRole('button', {name: 'Неделя'}).getAttribute('aria-pressed')).toBe('true');
  cleanup();
  // A new cycle starts with the whole period again.
  render(<Plan {...props} appState={appStateFor('cycle-B')} />);
  expect(screen.getByRole('button', {name: 'Весь период'}).getAttribute('aria-pressed')).toBe('true');
  // Month mode still works and is remembered.
  fireEvent.click(screen.getByRole('button', {name: 'Месяц'}));
  expect(storage.data.get('fizuha.calendar.mode.cycle-B')).toBe('month');
});

test('review #2: weekly summary separates forecast workouts from issued ones', () => {
  renderPlan();
  fireEvent.click(screen.getByRole('button', {name: 'Весь период'}));
  fireEvent.click(document.querySelector('.calendar-day--forecast')!);
  const summary = document.querySelector('.calendar-summary')!;
  const assigned = summary.querySelector('.calendar-stats:not(.calendar-stats--preliminary) div strong')!.textContent;
  expect(assigned).toBe('0');
  const prelim = summary.querySelector('.calendar-stats--preliminary');
  expect(prelim).toBeTruthy();
  expect(prelim!.textContent).toContain('Предварительно (прогноз, ещё не назначено)');
  expect(prelim!.textContent).toContain('Прогнозный объём основной части');
  expect(Number(prelim!.querySelector('strong')!.textContent)).toBeGreaterThan(0);
  expect(summary.textContent).toContain('Нет данных');
});

test('review #4: preview shows every parameter incl. warm-up and cool-down, and no dead card link', () => {
  const {onNavigate} = renderPlan();
  fireEvent.click(screen.getByRole('button', {name: 'Весь период'}));
  fireEvent.click(document.querySelector('.calendar-day--forecast')!);
  const params = document.querySelector('.calendar-detail .calendar-params')!;
  expect(params).toBeTruthy();
  for (const label of ['Задача', 'Разминка', 'Заминка', 'Усилие']) expect(params.textContent).toContain(label);
  const detail = document.querySelector('.calendar-detail')!;
  expect(detail.textContent).not.toContain('в карточке занятия.');
  expect(screen.queryByRole('button', {name: 'Открыть тренировку'})).toBeNull();
  // Issued day: same full parameter list, and its card link really opens a queued workout.
  fireEvent.click(document.querySelector('.calendar-day--planned')!);
  expect(document.querySelector('.calendar-detail .calendar-params')!.textContent).toContain('Разминка');
  fireEvent.click(screen.getByRole('button', {name: 'Открыть тренировку'}));
  expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({name: 'WORKOUT'}));
});
