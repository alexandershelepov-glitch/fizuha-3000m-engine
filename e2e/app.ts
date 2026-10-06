/** Shared steps for the browser suites: onboarding up to a working cycle. */
import {expect} from '@playwright/test';
import type {Page} from '@playwright/test';

export const ACTIVE_CYCLE = 'fizuha.activeCycle';

export async function reset(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/');
  await expect(page.getByRole('button', {name: 'Начать подготовку'})).toBeVisible();
}

/** Fill the result step and walk to the goal step. */
export async function walkToGoal(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Начать подготовку'}).click();
  await page.getByLabel('Ваш результат').fill('15:20');
  for (let step = 0; step < 6; step += 1) await page.getByRole('button', {name: 'Продолжить'}).click();
  await expect(page.getByText('Шаг 7 из 8')).toBeVisible();
}

export async function fillQuestionnaire(page: Page): Promise<void> {
  await walkToGoal(page);
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:30');
  await page.getByRole('button', {name: 'Продолжить'}).click();
  await page.getByRole('button', {name: 'Продолжить'}).click();
  await expect(page.getByText('Проверьте данные')).toBeVisible();
}

/** An experienced runner: the engine then starts with a paced quality session. */
export async function fillQuestionnaireExperienced(page: Page): Promise<void> {
  // The result step first: the draft is persisted, so it survives moving between steps by URL.
  await page.goto('/questionnaire?step=RESULT');
  await page.getByLabel('Ваш результат').fill('15:20');
  await page.goto('/questionnaire?step=QUALITY');
  await page.getByLabel('Качественных тренировок за 8 недель').fill('8');
  await page.getByLabel('В скольких разных неделях').fill('6');
  await page.getByLabel('Темповые тренировки').check();
  await page.getByLabel('Интервальные тренировки').check();
  await page.getByRole('button', {name: 'Продолжить'}).click();   // SAFETY
  await page.getByRole('button', {name: 'Продолжить'}).click();   // BREAKS
  await page.getByRole('button', {name: 'Продолжить'}).click();   // AVAILABILITY
  await page.getByLabel('Сколько тренировок в неделю вы можете выполнять').fill('4');
  await page.getByRole('button', {name: 'Продолжить'}).click();   // GOAL
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:30');
  await page.getByRole('button', {name: 'Продолжить'}).click();   // RACE_DATE
  await page.getByRole('button', {name: 'Продолжить'}).click();   // REVIEW
  await expect(page.getByText('Проверьте данные')).toBeVisible();
}

/** Create the cycle from the review screen and land on Today. */
export async function createCycleAndReachToday(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Рассчитать план'}).click();
  await page.getByRole('button', {name: 'Посмотреть план'}).click();
  await page.getByRole('button', {name: 'Перейти к подготовке'}).click();
  await expect(page.getByRole('navigation', {name: 'Основные разделы'})).toBeVisible();
}

export interface StoredCycle {
  formatVersion: number;
  cycle: {engineState: string; baseline: {performance: {timeSeconds: number} | null; targetTimeSeconds: number}};
  events: {type: string; cause?: string; workoutId?: string; fromDate?: string; toDate?: string}[];
}

export async function readActiveCycle(page: Page): Promise<StoredCycle> {
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE);
  if (stored === null) throw new Error('no active cycle is stored');
  return JSON.parse(stored) as StoredCycle;
}

export async function readEngineState(page: Page): Promise<{history: unknown[]; queue: {id: string; scheduledDate: string; type: string}[]; asOf: string; checkpointRequired: boolean; profile: {performance: {timeSeconds: number} | null}}> {
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE);
  if (stored === null) throw new Error('no active cycle is stored');
  const envelope = JSON.parse(stored) as {cycle: {engineState: string}};
  return JSON.parse(envelope.cycle.engineState) as {history: unknown[]; queue: {id: string; scheduledDate: string; type: string}[]; asOf: string; checkpointRequired: boolean; profile: {performance: {timeSeconds: number} | null}};
}

/** The questionnaire answered without a current result, so the engine asks for a checkpoint. */
export async function fillQuestionnaireWithoutResult(page: Page): Promise<void> {
  await page.goto('/questionnaire?step=RESULT');
  await page.getByRole('button', {name: 'Нет результата'}).click();
  for (let step = 0; step < 6; step += 1) await page.getByRole('button', {name: 'Продолжить'}).click();
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:30');
  await page.getByRole('button', {name: 'Продолжить'}).click();
  await page.getByRole('button', {name: 'Продолжить'}).click();
  await expect(page.getByText('Проверьте данные')).toBeVisible();
}
