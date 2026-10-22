/** Issue #24: browser checks of real calendar UI and existing engine transitions. */
import {expect, test} from '@playwright/test';
import {reset, fillQuestionnaire, createCycleAndReachToday, readActiveCycle, readEngineState} from './app.ts';

test.beforeEach(async ({page}) => { await reset(page); });

async function openCalendar(page: import('@playwright/test').Page): Promise<void> {
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);
  await page.getByRole('navigation', {name:'Основные разделы'}).getByText('План').click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole('heading', {name:'Календарь тренировок'})).toBeVisible();
}

test('calendar: week/month, full period with preliminary forecast, responsive screenshots', async ({page}, info) => {
  await page.setViewportSize({width:390,height:844});
  await openCalendar(page);
  // Review #1: the first open after creating a cycle shows the whole training period.
  await expect(page.getByRole('group', {name:'Режим календаря'}).getByRole('button',{name:'Весь период'})).toHaveAttribute('aria-pressed','true');
  expect(await page.locator('.calendar-week-block').count()).toBeGreaterThanOrEqual(8);
  await page.screenshot({path:info.outputPath('calendar-mobile-390-period.png'),fullPage:true});
  await page.getByRole('group', {name:'Режим календаря'}).getByRole('button',{name:'Неделя'}).click();
  await expect(page.locator('.calendar-days--week .calendar-day')).toHaveCount(7);
  await expect(page.getByText('Фактически внесено')).toBeVisible();
  await page.screenshot({path:info.outputPath('calendar-mobile-390.png'),fullPage:true});
  await page.getByRole('group', {name:'Режим календаря'}).getByRole('button',{name:'Месяц'}).click();
  expect(await page.locator('.calendar-days--month .calendar-day').count()).toBeGreaterThanOrEqual(28);
  await page.getByRole('button', {name:'Следующий период'}).click();
  // Beyond the issued horizon the month shows the preliminary forecast, not "unformed" training days.
  await expect(page.locator('.calendar-day--forecast').first()).toBeVisible();
  // The full period shows every week to the race date (the questionnaire default is an 8-week cycle).
  await page.getByRole('group', {name:'Режим календаря'}).getByRole('button',{name:'Весь период'}).click();
  const weekBlocks = page.locator('.calendar-week-block');
  expect(await weekBlocks.count()).toBeGreaterThanOrEqual(8);
  await expect(weekBlocks.first().getByRole('heading', {name:/Неделя 1/})).toBeVisible();
  // A preliminary day opens read-only: no result entry, no move.
  await weekBlocks.nth(3).locator('.calendar-day--forecast').first().click();
  await expect(page.getByText('Предварительный план. Изменяется по результатам тренировок.')).toBeVisible();
  await expect(page.getByRole('button', {name:'Открыть тренировку'})).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Перенести', exact:true})).toHaveCount(0);
  // Review #4: every parameter incl. warm-up and cool-down; review #2: forecast counted apart.
  await expect(page.locator('.calendar-detail .calendar-params')).toContainText('Разминка');
  await expect(page.locator('.calendar-detail .calendar-params')).toContainText('Заминка');
  await expect(page.locator('.calendar-stats--preliminary')).toContainText('Предварительно (прогноз, ещё не назначено)');
  await page.getByRole('group', {name:'Режим календаря'}).getByRole('button',{name:'Неделя'}).click();
  // The later choice survives a reload.
  await page.reload();
  await expect(page.getByRole('group', {name:'Режим календаря'}).getByRole('button',{name:'Неделя'})).toHaveAttribute('aria-pressed','true');
  await page.setViewportSize({width:1280,height:850});
  await expect(page.getByRole('complementary',{name:'Разделы приложения'}).getByRole('button',{name:'План'})).toBeVisible();
  await expect(page.locator('.calendar-sidebar')).toBeVisible();
  await page.screenshot({path:info.outputPath('calendar-desktop-1280.png'),fullPage:true});
});

test('calendar: an unavailable shift is persisted without changing the engine plan', async ({page}) => {
  await openCalendar(page);
  const before = await page.evaluate(() => window.localStorage.getItem('fizuha.activeCycle'));
  await page.getByRole('button',{name:/Отметить смену или занятый день/}).click();
  await expect(page.getByRole('status')).toContainText('Отметка сохранена');
  const marker = await page.evaluate(() => Object.keys(window.localStorage).find(k=>k.startsWith('fizuha.calendar.unavailable.')));
  expect(marker).toBeTruthy();
  const busy = await page.evaluate(key => window.localStorage.getItem(key!), marker);
  expect(JSON.parse(busy!) as string[]).toHaveLength(1);
  expect(await page.evaluate(() => window.localStorage.getItem('fizuha.activeCycle'))).toBe(before);
  await page.reload();
  await expect(page.getByRole('button',{name:/убрать отметку/})).toBeVisible();
  await page.getByRole('button',{name:/убрать отметку/}).click();
  expect(JSON.parse((await page.evaluate(key=>window.localStorage.getItem(key!),marker))!) as string[]).toHaveLength(0);
  expect(await page.evaluate(() => window.localStorage.getItem('fizuha.activeCycle'))).toBe(before);
});

test('calendar: inline move uses persisted engine transition and survives reload', async ({page}) => {
  await openCalendar(page);
  await page.getByRole('group', {name:'Режим календаря'}).getByRole('button',{name:'Неделя'}).click();
  const state = await readEngineState(page);
  const original = state.queue.find(item => item.type !== 'REST' && (item as typeof item & {movable?: boolean}).movable);
  expect(original).toBeTruthy();
  const label = new Intl.DateTimeFormat('ru-RU', {day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})
    .format(new Date(original!.scheduledDate + 'T00:00:00Z'));
  await page.locator('.calendar-days--week .calendar-day').filter({has: page.locator('strong')}).and(page.locator(`[aria-label^="${label}"]`)).click();
  await page.getByRole('button',{name:'Перенести',exact:true}).click();
  const candidates = page.locator('.calendar-move-options button:not([disabled])');
  expect(await candidates.count()).toBeGreaterThan(0);
  await candidates.first().click();
  await page.getByRole('button',{name:'Подтвердить перенос'}).click();
  await expect(page.getByRole('status')).toContainText('Тренировка перенесена');
  const saved=await readEngineState(page);
  const newDate=saved.queue.find(w=>w.id===original!.id)?.scheduledDate;
  expect(newDate).toBeTruthy();
  expect(newDate).not.toBe(original!.scheduledDate);
  expect((await readActiveCycle(page)).events.some(e=>e.type==='WORKOUT_MOVED')).toBe(true);
  await page.reload();
  expect((await readEngineState(page)).queue.find(w=>w.id===original!.id)?.scheduledDate).toBe(newDate);
});
