/**
 * One real end-to-end run in a browser against the production build.
 *
 * Covers the required happy path plus the failure paths: invalid time, an invalid race date, an
 * engine rejection, damaged stored data, a direct link without a cycle, and an offline reload.
 */
import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';

const ACTIVE_CYCLE = 'fizuha.activeCycle';

async function reset(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/');
  await expect(page.getByRole('button', {name: 'Начать подготовку'})).toBeVisible();
}

/** Fill the questionnaire through the goal step. */
async function walkToGoal(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Начать подготовку'}).click();
  await page.getByLabel('Ваш результат').fill('15:20');
  for (let step = 0; step < 6; step += 1) await page.getByRole('button', {name: 'Продолжить'}).click();
  await expect(page.getByText('Шаг 7 из 8')).toBeVisible();
}

async function fillQuestionnaire(page: Page): Promise<void> {
  await walkToGoal(page);
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:30');
  await page.getByRole('button', {name: 'Продолжить'}).click();
  await page.getByRole('button', {name: 'Продолжить'}).click();
  await expect(page.getByText('Проверьте данные')).toBeVisible();
}

test.beforeEach(async ({page}) => {
  await reset(page);
});

test('happy path: first run, questionnaire, review, assessment, ready plan, Today', async ({page}) => {
  await fillQuestionnaire(page);

  // Nothing is stored before the explicit action.
  expect(await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE)).toBeNull();

  await page.getByRole('button', {name: 'Рассчитать план'}).click();

  // The assessment explains the engine's verdict in words.
  await expect(page.getByText('Ваша подготовка')).toBeVisible();
  await expect(page.getByText('Текущий уровень: 15:20 на 3000 м')).toBeVisible();
  await expect(page.getByText(/Целевой результат показывает, к чему мы идём/)).toBeVisible();

  await page.getByRole('button', {name: 'Посмотреть план'}).click();
  await expect(page.getByText('Ваш план готов')).toBeVisible();
  await page.getByRole('button', {name: 'Перейти к подготовке'}).click();

  // Today renders the engine's own queue.
  await expect(page.getByRole('navigation', {name: 'Основные разделы'})).toBeVisible();
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE);
  expect(stored).not.toBeNull();
  const envelope = JSON.parse(stored!) as {formatVersion: number; events: {type: string}[]; cycle: {engineState: string}};
  expect(envelope.formatVersion).toBe(1);
  expect(envelope.events[0]?.type).toBe('CYCLE_CREATED');
  expect(typeof envelope.cycle.engineState).toBe('string');
});

test('the active cycle survives a reload', async ({page}) => {
  await fillQuestionnaire(page);
  await page.getByRole('button', {name: 'Рассчитать план'}).click();
  await page.getByRole('button', {name: 'Посмотреть план'}).click();
  await page.getByRole('button', {name: 'Перейти к подготовке'}).click();
  const before = await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE);

  await page.reload();

  await expect(page.getByRole('navigation', {name: 'Основные разделы'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Начать подготовку'})).toHaveCount(0);
  await expect(page).toHaveURL(/\/today$/);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE)).toBe(before);

  // Navigation also survives a reload.
  await page.getByRole('navigation', {name: 'Основные разделы'}).getByText('План').click();
  await expect(page).toHaveURL(/\/plan$/);
  await page.reload();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByText(/Показан фактический горизонт плана/)).toBeVisible();
});

test('an invalid time is refused locally and never reaches the engine', async ({page}) => {
  await page.getByRole('button', {name: 'Начать подготовку'}).click();
  await page.getByLabel('Ваш результат').fill('15.20');
  await page.getByRole('button', {name: 'Продолжить'}).click();

  await expect(page.getByRole('alert')).toContainText('Введите время в формате ММ:СС');
  await expect(page).toHaveURL(/step=RESULT$/);

  await page.getByLabel('Ваш результат').fill('15:75');
  await page.getByRole('button', {name: 'Продолжить'}).click();
  await expect(page.getByRole('alert')).toContainText('Такого времени не существует');
  expect(await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE)).toBeNull();
});

test('an engine rejection is reported by code, not by its English message', async ({page}) => {
  await walkToGoal(page);
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:30');
  await page.getByRole('button', {name: 'Продолжить'}).click();
  await page.getByLabel('Дата итогового забега').fill('2020-01-01');
  await page.getByRole('button', {name: 'Продолжить'}).click();
  await page.getByRole('button', {name: 'Рассчитать план'}).click();

  await expect(page.getByText('Дата старта уже прошла')).toBeVisible();
  await expect(page).toHaveURL(/step=RACE_DATE$/);
  await expect(page.getByText('EVENT_DATE_PASSED')).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE)).toBeNull();
});

test('damaged stored data produces an explicit error state instead of a crash', async ({page}) => {
  await page.evaluate((key) => window.localStorage.setItem(key, '{not json'), ACTIVE_CYCLE);
  await page.goto('/today');

  await expect(page.getByText('Не удалось прочитать сохранённые данные')).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE)).toBe('{not json');
});

test('a direct link to a protected screen without a cycle lands on the first run', async ({page}) => {
  await page.goto('/today');
  await expect(page.getByRole('button', {name: 'Начать подготовку'})).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/profile');
  await expect(page.getByRole('button', {name: 'Начать подготовку'})).toBeVisible();
});

test('the build is installable and keeps working offline', async ({page, context}) => {
  // Manifest and icons are served.
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  const body = (await manifest.json()) as {name: string; display: string; icons: unknown[]};
  expect(body.name).toContain('Физуха');
  expect(body.display).toBe('standalone');
  expect(body.icons.length).toBeGreaterThanOrEqual(3);
  expect((await page.request.get('/icons/icon-192.png')).status()).toBe(200);

  // The service worker takes control.
  await expect
    .poll(async () => page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r !== undefined)), {timeout: 15_000})
    .toBe(true);

  // Create a cycle, then reload once so every asset is served through the worker.
  await fillQuestionnaire(page);
  await page.getByRole('button', {name: 'Рассчитать план'}).click();
  await page.getByRole('button', {name: 'Посмотреть план'}).click();
  await page.getByRole('button', {name: 'Перейти к подготовке'}).click();

  // The document that registers the worker is not controlled by it; the next navigation is. Reload
  // once online, confirm the worker is in charge, and only then cut the network.
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => navigator.serviceWorker.controller !== null), {timeout: 15_000})
    .toBe(true);
  await page.reload();
  await expect(page.getByRole('navigation', {name: 'Основные разделы'})).toBeVisible();

  // Offline: the shell and the local cycle are still there.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('navigation', {name: 'Основные разделы'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Начать подготовку'})).toHaveCount(0);
  await context.setOffline(false);
});

test('INV-1: two days later an unrecorded session blocks the plan refresh', async ({page}) => {
  await page.clock.install();
  await fillQuestionnaire(page);
  await page.getByRole('button', {name: 'Рассчитать план'}).click();
  await page.getByRole('button', {name: 'Посмотреть план'}).click();
  await page.getByRole('button', {name: 'Перейти к подготовке'}).click();
  const before = await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE);

  // The user comes back two days later and never recorded those sessions.
  await page.clock.setFixedTime(new Date(Date.now() + 2 * 86_400_000));
  await page.reload();

  await expect(page.getByText('Предыдущая тренировка ещё не закрыта')).toBeVisible();

  // The plan must not offer an action the application layer would refuse anyway.
  await page.getByRole('navigation', {name: 'Основные разделы'}).getByText('План').click();
  await expect(page.getByText('Предыдущая тренировка ещё не закрыта')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Обновить план'})).toHaveCount(0);

  // Nothing was written off: the stored cycle is exactly as it was.
  expect(await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE)).toBe(before);
});

test('a damaged record can be discarded, but only after a confirmation', async ({page}) => {
  await page.evaluate((key) => window.localStorage.setItem(key, '{not json'), ACTIVE_CYCLE);
  await page.goto('/today');

  await expect(page.getByText('Не удалось прочитать сохранённые данные')).toBeVisible();
  await page.getByRole('button', {name: 'Начать заново'}).click();
  await expect(page.getByText('Удалить повреждённый цикл?')).toBeVisible();

  // Cancelling keeps the data and the screen.
  await page.getByRole('button', {name: 'Отмена'}).click();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE)).toBe('{not json');
  await expect(page.getByText('Не удалось прочитать сохранённые данные')).toBeVisible();

  // Confirming removes it and leads out of the dead end.
  await page.getByRole('button', {name: 'Начать заново'}).click();
  await page.getByRole('button', {name: 'Удалить и начать заново'}).click();
  await expect(page.getByRole('button', {name: 'Начать подготовку'})).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE)).toBeNull();

  await page.getByRole('button', {name: 'Начать подготовку'}).click();
  await expect(page).toHaveURL(/step=RESULT$/);
});

test('a browser that denies storage is reported instead of silently using memory', async ({page}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function setItem(): void {
      throw new DOMException('denied', 'SecurityError');
    };
  });
  await page.goto('/');

  await expect(page.getByText('Цикл нельзя надёжно сохранить')).toBeVisible();
  // No working screen is offered, so a cycle that would not survive a reload cannot be started.
  await expect(page.getByRole('button', {name: 'Начать подготовку'})).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE)).toBeNull();
});
