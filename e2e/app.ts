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

/** A valid baseline date: ten days before the app's today, ISO format for the date input.
 *  Computed inside the page so a Playwright clock installed by the test is respected. */
export async function resultDate(page: Page): Promise<string> {
  return page.evaluate(() => new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10));
}

/** Fill the result step and walk to the goal step, answering every material question explicitly. */
export async function walkToGoal(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Начать подготовку'}).click();
  await page.getByLabel('Ваш результат').fill('15:20');
  await page.getByLabel('Дата результата').fill(await resultDate(page));
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // VOLUME
  await page.getByRole('button', {name: 'Да', exact: true}).click(); // canRun3Km
  await page.getByLabel(/Сколько недель подряд/).fill('8');
  await page.getByLabel(/Сколько раз в неделю вы обычно бегаете сейчас/).fill('3');
  await page.getByLabel(/Примерно сколько километров вы пробегаете за неделю/).fill('15');
  await page.getByLabel(/Сколько километров обычно составляет ваша самая длинная пробежка/).fill('5');
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // QUALITY
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // SAFETY
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // BREAKS
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // AVAILABILITY
  await page.getByRole('radio', {name: /Да, примерно соответствует/}).click();
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // GOAL
  await expect(page.getByText('Шаг 7 из 8')).toBeVisible();
}

export async function fillQuestionnaire(page: Page): Promise<void> {
  await walkToGoal(page);
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:30');
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await expect(page.getByText('Проверьте данные')).toBeVisible();
}

/** An experienced runner: the engine then starts with a paced quality session. */
export async function fillQuestionnaireExperienced(page: Page): Promise<void> {
  // The result step first: the draft is persisted, so it survives moving between steps by URL.
  await page.goto('/questionnaire?step=RESULT');
  await page.getByLabel('Ваш результат').fill('15:20');
  await page.getByLabel('Дата результата').fill(await resultDate(page));
  await page.goto('/questionnaire?step=VOLUME');
  await page.getByRole('button', {name: 'Да', exact: true}).click(); // canRun3Km
  await page.getByLabel(/Сколько недель подряд/).fill('20');
  await page.getByLabel(/Сколько раз в неделю вы обычно бегаете сейчас/).fill('4');
  await page.getByLabel(/Примерно сколько километров вы пробегаете за неделю/).fill('26');
  await page.getByLabel(/Сколько километров обычно составляет ваша самая длинная пробежка/).fill('9');
  await page.goto('/questionnaire?step=QUALITY');
  await page.getByRole('radio', {name: 'Знаю точное количество'}).click();
  // The labels now carry their own explanation, so they are matched by their leading words.
  await page.getByLabel(/Сколько таких быстрых тренировок/).fill('8');
  await page.getByLabel(/В скольких из последних 8 недель/).fill('6');
  await page.getByLabel(/Темповый бег/).check();
  await page.getByLabel(/^Интервалы/).check();
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();   // SAFETY
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();   // BREAKS
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();   // AVAILABILITY
  await page.getByLabel('Сколько тренировок в неделю вы можете выполнять').fill('4');
  await page.getByRole('radio', {name: /Да, примерно соответствует/}).click();
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();   // GOAL
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:30');
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();   // RACE_DATE
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();   // REVIEW
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

export async function readEngineState(page: Page): Promise<{history: unknown[]; queue: {id: string; scheduledDate: string; type: string}[]; asOf: string; checkpointRequired: boolean; profile: {performance: {timeSeconds: number} | null; raceDate: string}}> {
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE);
  if (stored === null) throw new Error('no active cycle is stored');
  const envelope = JSON.parse(stored) as {cycle: {engineState: string}};
  return JSON.parse(envelope.cycle.engineState) as {history: unknown[]; queue: {id: string; scheduledDate: string; type: string}[]; asOf: string; checkpointRequired: boolean; profile: {performance: {timeSeconds: number} | null; raceDate: string}};
}

/** The questionnaire answered without a current result, so the engine asks for a checkpoint. */
export async function fillQuestionnaireWithoutResult(page: Page): Promise<void> {
  await page.goto('/questionnaire?step=RESULT');
  await page.getByRole('button', {name: 'Нет результата'}).click();
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // VOLUME
  await page.getByRole('button', {name: 'Да', exact: true}).click(); // canRun3Km
  await page.getByLabel(/Сколько недель подряд/).fill('8');
  await page.getByLabel(/Сколько раз в неделю вы обычно бегаете сейчас/).fill('2');
  await page.getByLabel(/Примерно сколько километров вы пробегаете за неделю/).fill('8');
  await page.getByLabel(/Сколько километров обычно составляет ваша самая длинная пробежка/).fill('4');
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // QUALITY
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // SAFETY
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // BREAKS
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // AVAILABILITY (no mismatch question without a result)
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // GOAL
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:30');
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await expect(page.getByText('Проверьте данные')).toBeVisible();
}
