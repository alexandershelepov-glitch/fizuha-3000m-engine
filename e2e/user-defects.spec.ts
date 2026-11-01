/**
 * The three defects reported from a real iPhone, checked in the browser at 390 px:
 * 1. the ordinary questionnaire, without editing any date, must create the approved eight-week plan;
 * 2. a calendar day — including a future predicted one — opens a full, readable card and returns;
 * 3. segment times are entered as minutes and seconds, without typing a colon.
 *
 * This is browser emulation, not a physical iPhone.
 */
import {expect, test} from '@playwright/test';
import {ACTIVE_CYCLE, createCycleAndReachToday, readEngineState, reset} from './app.ts';

/** The ordinary onboarding path, answering every material question and touching no date. */
async function createDefaultCycle(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', {name: 'Начать подготовку'}).click();
  await page.getByLabel('Ваш результат', {exact: true}).fill('14:30');
  await page.getByLabel('Дата результата', {exact: true}).fill('2026-11-01');
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await page.getByRole('button', {name: 'Да', exact: true}).click();
  await page.getByLabel(/Сколько недель подряд/).fill('20');
  await page.getByLabel(/Сколько раз в неделю вы обычно бегаете сейчас/).fill('3');
  await page.getByLabel(/Примерно сколько километров вы пробегаете за неделю/).fill('16');
  await page.getByLabel(/Сколько километров обычно составляет ваша самая длинная пробежка/).fill('6');
  for (let step = 0; step < 4; step += 1) await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await page.getByLabel('Сколько тренировок в неделю вы можете выполнять').fill('3');
  await page.getByRole('radio', {name: /Да, примерно соответствует/}).click();
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:00');
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
}

test('defect 1: the default dates create the approved eight-week cycle, not the legacy plan', async ({page}, info) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.clock.install({time: new Date('2026-11-01T09:00:00Z')});
  await reset(page);
  await createDefaultCycle(page);

  // The date step already names the plan it will create, and its own suggestion is inside the window.
  await expect(page.getByText('Методика №4 · 8 недель · 24 занятия')).toBeVisible();
  await expect(page.locator('#startDate')).toHaveValue('2026-11-01');
  await expect(page.locator('#raceDate')).toHaveValue('2026-12-25');
  await page.screenshot({path: info.outputPath('methodology-default-dates-390.png'), fullPage: true});

  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await expect(page.getByText('Проверьте данные')).toBeVisible();
  // The review screen repeats the methodology before anything is stored.
  await expect(page.getByText('Методика №4 · 8 недель · 24 занятия').first()).toBeVisible();

  await createCycleAndReachToday(page);
  const state = await readEngineState(page);
  expect(state.methodology?.id).toBe('V4_8W_1430');
  expect(state.cycleStartDate).toBe('2026-11-01');
  expect(state.profile.raceDate).toBe('2026-12-25');
  expect(state.queue.some(item => item.type === 'INTRO_QUALITY')).toBe(false);

  await page.getByRole('navigation', {name: 'Основные разделы'}).getByText('План').click();
  await expect(page.locator('.calendar-week-block')).toHaveCount(8);
  // 24 assignments: 8 quality, 8 easy, 7 long runs and the final 3000 m event.
  await expect(page.locator('.calendar-day-volume')).toHaveCount(24);
  // A legacy plan would add intermediate control races: the approved cycle has exactly one control.
  await expect(page.locator('.calendar-day--control')).toHaveCount(0);
  await page.screenshot({path: info.outputPath('methodology-calendar-default-390.png'), fullPage: true});
});

test('defect 2: a future session opens a full card and returns to the chosen date', async ({page}, info) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.clock.install({time: new Date('2026-11-01T09:00:00Z')});
  await reset(page);
  await createDefaultCycle(page);
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await createCycleAndReachToday(page);
  await page.getByRole('navigation', {name: 'Основные разделы'}).getByText('План').click();

  const before = await page.evaluate(key => localStorage.getItem(key), ACTIVE_CYCLE);
  const day = page.locator('.calendar-week-block').nth(3).locator('.calendar-day').nth(0);
  const label = await day.getAttribute('aria-label');
  await day.click();

  const card = page.getByRole('dialog');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', {name: 'Параметры и объём'})).toBeVisible();
  await expect(card.getByRole('heading', {name: 'Зачем эта тренировка'})).toBeVisible();
  await expect(card.locator('.calendar-params')).toContainText('Разминка');
  await expect(card.locator('.calendar-params')).toContainText('Заминка');
  await expect(card.locator('.calendar-params')).toContainText('мин/км');
  await expect(card.getByText('Предварительный план', {exact: true})).toBeVisible();
  await expect(card.getByRole('button', {name: 'Внести результат'})).toHaveCount(0);
  // The card is a full mobile screen, not a panel below a long page.
  const box = await card.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({path: info.outputPath('workout-card-390.png'), fullPage: false});

  await page.getByRole('button', {name: 'Вернуться к календарю'}).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.calendar-day--selected')).toHaveAttribute('aria-label', label!);
  expect(await page.evaluate(key => localStorage.getItem(key), ACTIVE_CYCLE)).toBe(before);
});

test('defect 3: segment time is typed as minutes and seconds and reaches the engine in seconds', async ({page}, info) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.clock.install({time: new Date('2026-11-02T09:00:00Z')});
  await reset(page);
  await createDefaultCycle(page);
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await createCycleAndReachToday(page);
  await page.getByRole('button', {name: 'Внести результат'}).click();

  // Two numeric fields replace one field that demanded a colon the phone keypad does not have.
  const minutes = page.locator('#repeat-seconds-0-minutes');
  const seconds = page.locator('#repeat-seconds-0-seconds');
  await expect(minutes).toHaveAttribute('inputmode', 'numeric');
  await expect(seconds).toHaveAttribute('inputmode', 'numeric');
  await expect(page.locator('#repeat-seconds-0')).toHaveCount(0);
  const preview = page.locator('.segment-time__preview').first();

  // Every value from the acceptance list, typed without a colon.
  await minutes.fill('1');
  await seconds.fill('56');
  await expect(preview).toHaveText('1:56');
  await minutes.fill('2');
  await seconds.fill('53');
  await expect(preview).toHaveText('2:53');
  await minutes.fill('3');
  await seconds.fill('51');
  await expect(preview).toHaveText('3:51');

  // Seconds above 59 are refused visibly.
  await seconds.fill('75');
  await expect(page.getByRole('alert')).toContainText('Секунды — от 0 до 59.');
  await minutes.fill('2');
  await seconds.fill('53');
  await expect(page.getByRole('alert')).toHaveCount(0);

  // A reload keeps the draft: minutes and seconds come back in their own fields.
  await page.reload();
  await expect(page.locator('#repeat-seconds-0-minutes')).toHaveValue('2');
  await expect(page.locator('#repeat-seconds-0-seconds')).toHaveValue('53');
  await page.screenshot({path: info.outputPath('segment-time-390.png'), fullPage: true});

  await page.locator('#repeat-seconds-1-minutes').fill('2');
  await page.locator('#repeat-seconds-1-seconds').fill('53');
  // The distance is a separate prescription field and stays required.
  await page.locator('#repeat-meters-0').fill('1143');
  await page.locator('#repeat-meters-1').fill('1143');
  await page.locator('#durationMinutes').fill('40');
  await page.getByRole('radio', {name: 'Нет, всё нормально'}).click();
  await page.getByRole('button', {name: 'Сохранить результат', exact: true}).click();
  await expect(page).toHaveURL(/\/outcome$/);

  // The engine receives seconds, not the displayed string.
  const state = await readEngineState(page);
  expect(state.history[0]!.result.repeats.map(part => part.seconds)).toEqual([173, 173]);
});
