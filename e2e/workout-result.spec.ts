/**
 * Closing a workout in a real browser: the session is recorded through the public engine API, the
 * verdict comes from the engine, and the new state survives a reload.
 */
import {expect, test} from '@playwright/test';
import {ACTIVE_CYCLE, createCycleAndReachToday, fillQuestionnaire, fillQuestionnaireExperienced, readEngineState, reset} from './app.ts';

test.beforeEach(async ({page}) => {
  await reset(page);
});

test('a full session is closed, reported and persisted', async ({page}) => {
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);

  const before = await readEngineState(page);
  expect(before.history.length).toBe(0);

  await page.getByRole('button', {name: 'Внести результат'}).click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByText('Результат тренировки')).toBeVisible();

  // The defaults describe a fully completed session; submitting sends the real engine contract.
  await page.getByRole('button', {name: 'Сохранить результат'}).click();
  await expect(page).toHaveURL(/\/outcome$/);
  await expect(page.getByText('Тренировка выполнена')).toBeVisible();
  await expect(page.getByText('Что изменилось')).toBeVisible();

  const after = await readEngineState(page);
  expect(after.history.length).toBe(1);
  expect(after.queue.length).toBeGreaterThan(0);

  // Back to Today: the closed session is gone, and the plan screen shows the new queue.
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('button', {name: 'Внести результат'})).toHaveCount(0);

  await page.getByRole('navigation', {name: 'Основные разделы'}).getByText('План').click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByText('Построенные тренировки')).toBeVisible();

  // Everything survives a reload.
  await page.reload();
  await expect(page).toHaveURL(/\/plan$/);
  const reloaded = await readEngineState(page);
  expect(reloaded.history.length).toBe(1);
  expect(reloaded.queue.map((workout) => workout.id)).toEqual(after.queue.map((workout) => workout.id));
});

test('an incomplete session is reported as a corrected plan, not as a failure', async ({page}) => {
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);

  await page.getByRole('button', {name: 'Внести результат'}).click();
  // Completion options are a radio group, so they are addressed by their role.
  await page.getByRole('radio', {name: 'Меньше половины'}).click();
  await page.getByRole('button', {name: 'Сохранить результат'}).click();

  await expect(page).toHaveURL(/\/outcome$/);
  await expect(page.getByText('Нагрузка потребовала корректировки')).toBeVisible();
  // The reason comes from the engine.
  await expect(page.getByText(/Задание выполнено частично|Помешали условия/)).toBeVisible();
  const state = await readEngineState(page);
  expect(state.history.length).toBe(1);
});

test('a safety flag stops the usual load and the screen differs', async ({page}) => {
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);

  await page.getByRole('button', {name: 'Внести результат'}).click();
  const group = page.getByRole('group', {name: 'Из-за боли меняется техника движения'});
  await group.getByRole('button', {name: 'Да'}).click();
  await page.getByRole('button', {name: 'Сохранить результат'}).click();

  await expect(page).toHaveURL(/\/outcome$/);
  await expect(page.getByText('Текущую нагрузку нужно снизить')).toBeVisible();

  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await expect(page.getByText('Обычные тренировки приостановлены')).toBeVisible();
});

test('an incomplete repeats block warns, then the engine decides', async ({page}) => {
  await fillQuestionnaireExperienced(page);
  await createCycleAndReachToday(page);

  await page.getByRole('button', {name: 'Внести результат'}).click();
  // A paced session: the block is open and prominent.
  await expect(page.getByText('Результаты отрезков')).toBeVisible();

  await page.getByRole('button', {name: 'Сохранить результат'}).click();
  await expect(page.getByText('Результаты отрезков не заполнены')).toBeVisible();
  await expect(page.getByText(/менее точной/)).toBeVisible();

  // Filling them in is optional; sending as is must not be blocked.
  await page.getByRole('button', {name: 'Отправить как есть'}).click();
  await expect(page).toHaveURL(/\/outcome$/);
  await expect(page.getByText('Нагрузка потребовала корректировки')).toBeVisible();
  const state = await readEngineState(page);
  expect(state.history.length).toBe(1);
});

test('the same flow closes an overdue session from the pending state', async ({page}) => {
  await page.clock.install();
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE);

  // Come back two days later without closing anything.
  await page.clock.setFixedTime(new Date(Date.now() + 2 * 86_400_000));
  await page.reload();
  await expect(page.getByText('Предыдущая тренировка ещё не закрыта')).toBeVisible();

  await page.getByRole('button', {name: 'Внести результат'}).click();
  await page.getByRole('button', {name: 'Сохранить результат'}).click();
  // The warning is not part of this session type; if it appears, it still must not block.
  const send = page.getByRole('button', {name: 'Отправить как есть'});
  if (await send.isVisible().catch(() => false)) await send.click();

  await expect(page).toHaveURL(/\/outcome$/);
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await expect(page).toHaveURL(/\/today$/);

  const state = await readEngineState(page);
  expect(state.history.length).toBe(1);
  expect(stored).not.toBeNull();
});

test('a future session cannot be closed in advance', async ({page}) => {
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);
  const before = await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE);

  // The plan lists today's session first and the next one second.
  await page.getByRole('navigation', {name: 'Основные разделы'}).getByText('План').click();
  await expect(page).toHaveURL(/\/plan$/);
  const timeline = page.locator('.timeline__button');
  await expect(timeline.first()).toBeVisible();
  await timeline.nth(1).click();
  await expect(page).toHaveURL(/\/workout\/[^/]+$/);

  // The prescription is visible, but there is no way to enter a result yet.
  await expect(page.getByText('Объём')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Внести результат'})).toHaveCount(0);
  await expect(page.getByText('Результат можно внести в день тренировки или позже.')).toBeVisible();

  // Even the direct address of the form cannot close it.
  const futureId = new URL(page.url()).pathname.split('/').pop()!;
  await page.goto(`/workout/${futureId}/result`);
  await expect(page.getByText('Тренировка ещё не состоялась')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Сохранить результат'})).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE)).toBe(before);

  // Today's session is still recordable.
  await page.goto('/today');
  await page.getByRole('button', {name: 'Внести результат'}).click();
  await page.getByRole('button', {name: 'Сохранить результат'}).click();
  await expect(page).toHaveURL(/\/outcome$/);
  const state = await readEngineState(page);
  expect(state.history.length).toBe(1);
});

test('the workout card reads as a sequence of actions', async ({page}) => {
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);

  await page.getByRole('button', {name: 'Открыть тренировку'}).click();
  await expect(page).toHaveURL(/\/workout\/[^/]+$/);

  // The main block is the instruction, not a list of parameters.
  await expect(page.getByRole('heading', {name: 'Как выполнить тренировку'})).toBeVisible();
  await expect(page.getByText(/^Сегодня: /)).toBeVisible();
  // Readiness is stated in words; the number is available next to them.
  await expect(page.getByText('Как должно ощущаться:')).toBeVisible();

  // Every step is a sentence, and each one is numbered in the list.
  const steps = page.locator('.steps__item');
  expect(await steps.count()).toBeGreaterThan(0);
  const first = (await steps.first().innerText()).trim();
  expect(first.length).toBeGreaterThan(10);
  expect(first.endsWith('.')).toBe(true);

  // The technical parameters and the theory are below, and the theory is closed by default.
  await expect(page.getByRole('heading', {name: 'Технические характеристики'})).toBeVisible();
  // The number is still there, explained by the words above it.
  await expect(page.getByText('Усилие', {exact: true})).toBeVisible();
  const why = page.getByRole('button', {name: 'Почему такая тренировка?'});
  await expect(why).toHaveAttribute('aria-expanded', 'false');
  await why.click();
  await expect(why).toHaveAttribute('aria-expanded', 'true');
});
