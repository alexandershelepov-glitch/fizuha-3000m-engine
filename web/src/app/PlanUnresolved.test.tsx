/** Issue #51 review #3: UNRESOLVED forecast slots read as "needs clarification", not as normal workouts. */
import {afterEach, expect, test, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import * as gateway from '../application/engineGateway.ts';
import {Plan} from '../ui/screens/Plan.tsx';
import type {Profile} from '../application/engineGateway.ts';

const TODAY = '2026-10-05';
const addDays = (from: string, days: number): string =>
  new Date(Date.parse(from + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const profile: Profile = {
  performance: {timeSeconds: 920, date: TODAY, source: 'TEST_3K'}, targetTimeSeconds: 896,
  raceDate: addDays(TODAY, 84), regularRunningWeeks: 40, actualRunsPerWeek: 3, availableRunsPerWeek: 3,
  averageWeeklyKm4Weeks: 19, longestUsualRunKm: 8, canRun3Km: true,
  qualitySessions8Weeks: 4, qualityWeeks8Weeks: 3, qualityMostlyTolerated: true,
  experience: {threshold: true, vo2: false, specific3k: false}, breaks: [],
  safety: {pain: 0, painIncreasing: false, alteredMovement: false, painWalkingOrRest: false,
    swelling: false, acuteIllness: false, otherStop: false, needsAssessment: false},
  performanceMismatch: 'NONE',
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('an UNRESOLVED slot is marked as needing clarification, without workout parameters or actions', () => {
  const engineState = gateway.createEngineState(profile, TODAY);
  const real = gateway.forecastCycle(engineState, {mode: 'CONDITIONAL', asOf: engineState.asOf});
  const target = real.entries.find(e => e.status === 'CONDITIONAL' && e.workout.type !== 'REST' && e.workout.type !== 'CONTROL')!;
  vi.spyOn(gateway, 'forecastCycle').mockReturnValue({...real,
    entries: real.entries.map(e => e === target ? {...e, status: 'UNRESOLVED' as const} : e)});
  render(<Plan engineState={engineState} storage={null} today={TODAY} onNavigate={vi.fn()} onRefreshPlan={vi.fn()} refreshing={false} />);
  fireEvent.click(screen.getByRole('button', {name: 'Весь период'}));
  const cell = document.querySelector('.calendar-day--unresolved') as HTMLElement;
  expect(cell).toBeTruthy();
  expect(cell.classList.contains('calendar-day--forecast')).toBe(false);
  expect(cell.textContent).toContain('Требует уточнения');
  expect(cell.getAttribute('aria-label')).toContain('Требует уточнения');
  fireEvent.click(cell);
  const detail = document.querySelector('.calendar-detail')!;
  expect(detail.querySelector('h2')!.textContent).toBe('Требует уточнения');
  expect(detail.textContent).toContain('Это не обычная тренировка');
  expect(detail.querySelector('.calendar-params')).toBeNull();
  expect(screen.queryByRole('button', {name: 'Открыть тренировку'})).toBeNull();
  expect(screen.queryByRole('button', {name: 'Перенести'})).toBeNull();
  // Counted separately in the weekly summary.
  expect(document.querySelector('.calendar-stats--preliminary')!.textContent).toContain('Требует уточнения');
});
