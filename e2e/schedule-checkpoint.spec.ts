/**
 * The situations between sessions: a session is skipped, an overdue one is written off as not done,
 * a session is moved, and a new 3000 m assessment is recorded.
 */
import {expect, test} from '@playwright/test';
import {ACTIVE_CYCLE, createCycleAndReachToday, fillQuestionnaire, fillQuestionnaireWithoutResult, readActiveCycle, readEngineState, reset} from './app.ts';

test.beforeEach(async ({page}) => {
  await reset(page);
});

test('a session can be skipped and the plan is rebuilt', async ({page}) => {
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);

  const before = await readEngineState(page);
  const todayWorkout = before.queue.find((workout) => workout.scheduledDate === before.asOf)!;

  await page.getByRole('button', {name: 'Открыть тренировку'}).click();
  await page.getByRole('button', {name: 'Не смогу выполнить'}).click();
  await expect(page.getByText('Пропустить эту тренировку?')).toBeVisible();
  await page.getByRole('button', {name: 'Пропустить'}).click();

  await expect(page).toHaveURL(/\/today$/);
  const after = await readActiveCycle(page);
  const skipped = after.events.filter((event) => event.type === 'WORKOUT_SKIPPED');
  expect(skipped.length).toBe(1);
  expect(skipped[0]).toMatchObject({cause: 'VOLUNTARY', workoutId: todayWorkout.id});

  // The plan no longer contains it, and that survives a reload.
  await page.getByRole('navigation', {name: 'Основные разделы'}).getByText('План').click();
  await expect(page).toHaveURL(/\/plan$/);
  const state = await readEngineState(page);
  expect(state.queue.some((workout) => workout.id === todayWorkout.id)).toBe(false);

  await page.reload();
  const reloaded = await readActiveCycle(page);
  expect(reloaded.events.filter((event) => event.type === 'WORKOUT_SKIPPED').length).toBe(1);
  expect((await readEngineState(page)).queue.some((workout) => workout.id === todayWorkout.id)).toBe(false);
});

test('an overdue session can be written off as not done', async ({page}) => {
  await page.clock.install();
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);

  // Two days later, with nothing recorded.
  await page.clock.setFixedTime(new Date(Date.now() + 2 * 86_400_000));
  await page.reload();
  await expect(page.getByText('Предыдущая тренировка ещё не закрыта')).toBeVisible();

  await page.getByRole('button', {name: 'Я её не выполнял'}).click();

  const after = await readActiveCycle(page);
  const skipped = after.events.filter((event) => event.type === 'WORKOUT_SKIPPED');
  expect(skipped.length).toBe(1);
  expect(skipped[0]).toMatchObject({cause: 'PAST_DUE'});
  // The engine resolved exactly the one session the user decided about.
  const state = await readEngineState(page);
  expect(state.history.length).toBe(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key) !== null, ACTIVE_CYCLE)).toBe(true);
});

test('a session can be moved to another date and the plan follows', async ({page}) => {
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);

  await page.getByRole('navigation', {name: 'Основные разделы'}).getByText('План').click();
  const timeline = page.locator('.timeline__button');
  await expect(timeline.nth(1)).toBeVisible();
  await timeline.nth(1).click();
  await expect(page).toHaveURL(/\/workout\/[^/]+$/);

  const state = await readEngineState(page);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  const original = state.queue.find((workout) => workout.id === id)!;
  const taken = new Set(state.queue.map((workout) => workout.scheduledDate));

  await page.getByRole('button', {name: 'Перенести'}).click();
  await expect(page).toHaveURL(/\/move$/);

  // The first free date inside the plan window.
  const options = page.getByRole('radio');
  const count = await options.count();
  let moved = false;
  for (let index = 0; index < count && !moved; index += 1) {
    const label = (await options.nth(index).innerText()).split('\n')[0]!.trim();
    // The interface lists Russian dates; the stored dates are comparable through the engine state.
    await options.nth(index).click();
    await page.getByRole('button', {name: 'Перенести'}).click();
    if (new URL(page.url()).pathname.endsWith('/move')) {
      // The engine refused this date; try the next one.
      await expect(page.getByText('Перенести тренировку')).toBeVisible();
      continue;
    }
    moved = true;
    expect(label.length).toBeGreaterThan(0);
  }
  expect(moved).toBe(true);

  const after = await readEngineState(page);
  const movedWorkout = after.queue.find((workout) => workout.id === id)!;
  expect(movedWorkout.scheduledDate).not.toBe(original.scheduledDate);
  expect(taken.has(movedWorkout.scheduledDate) && movedWorkout.scheduledDate !== original.scheduledDate).toBe(false);

  const events = await readActiveCycle(page);
  expect(events.events.some((event) => event.type === 'WORKOUT_MOVED')).toBe(true);

  // The plan and a reload both show the new date.
  await page.getByRole('navigation', {name: 'Основные разделы'}).getByText('План').click();
  await expect(page).toHaveURL(/\/plan$/);
  await page.reload();
  const reloaded = await readEngineState(page);
  expect(reloaded.queue.find((workout) => workout.id === id)?.scheduledDate).toBe(movedWorkout.scheduledDate);
});

test('a required checkpoint is recorded and the new form is kept', async ({page}) => {
  await fillQuestionnaireWithoutResult(page);
  await createCycleAndReachToday(page);

  const before = await readEngineState(page);
  expect(before.checkpointRequired).toBe(true);
  const baseline = await readActiveCycle(page);

  await expect(page.getByText('Нужен контрольный результат')).toBeVisible();
  await page.getByRole('button', {name: 'Внести контрольный результат'}).click();
  await expect(page).toHaveURL(/\/checkpoint$/);

  await page.getByLabel('Результат на 3000 м').fill('14:50');
  await page.getByRole('button', {name: 'Сохранить результат'}).click();

  await expect(page).toHaveURL(/\/checkpoint\/outcome$/);
  await expect(page.getByText('Оценка обновлена')).toBeVisible();
  await expect(page.getByText('14:50')).toBeVisible();

  const after = await readEngineState(page);
  expect(after.profile.performance?.timeSeconds).toBe(890);
  expect(after.checkpointRequired).toBe(false);
  const afterCycle = await readActiveCycle(page);
  expect(afterCycle.events.filter((event) => event.type === 'CHECKPOINT_RECORDED').length).toBe(1);
  // The immutable baseline still holds the assessment the cycle started with.
  expect(afterCycle.cycle.baseline.performance).toEqual(baseline.cycle.baseline.performance);

  await page.getByRole('button', {name: 'Продолжить'}).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByText('Нужен контрольный результат')).toHaveCount(0);

  await page.reload();
  expect((await readEngineState(page)).profile.performance?.timeSeconds).toBe(890);
});

test('an overdue session cannot be moved back into the future', async ({page}) => {
  await page.clock.install();
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);

  // Two days later the session is overdue and still unresolved.
  await page.clock.setFixedTime(new Date(Date.now() + 2 * 86_400_000));
  await page.reload();
  await expect(page.getByText('Предыдущая тренировка ещё не закрыта')).toBeVisible();

  // The earliest session of the queue is the one that has passed.
  const overdueId = [...(await readEngineState(page)).queue].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]!.id;

  // The only ways out are its result or marking it as not done.
  await page.goto(`/workout/${overdueId}`);
  await expect(page.getByText('Дата тренировки уже прошла. Внесите результат или отметьте, что она не выполнена.')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Перенести'})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Внести результат'})).toBeVisible();

  // A direct address of the move screen refuses it as well, and nothing is written.
  const before = await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE);
  await page.goto(`/workout/${overdueId}/move`);
  await expect(page.getByText('Эту тренировку нельзя перенести')).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), ACTIVE_CYCLE)).toBe(before);

  // And the pending session is closed as a miss, with the reason derived by the application.
  await page.goto('/today');
  await page.getByRole('button', {name: 'Я её не выполнял'}).click();
  const after = await readActiveCycle(page);
  const skipped = after.events.filter((event) => event.type === 'WORKOUT_SKIPPED');
  expect(skipped.length).toBe(1);
  expect(skipped[0]).toMatchObject({cause: 'PAST_DUE', workoutId: overdueId});
});
