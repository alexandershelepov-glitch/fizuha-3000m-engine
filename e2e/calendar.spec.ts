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

test('calendar: week/month, factual horizon and responsive screenshots', async ({page}, info) => {
  await page.setViewportSize({width:390,height:844});
  await openCalendar(page);
  await expect(page.locator('.calendar-days--week .calendar-day')).toHaveCount(7);
  await expect(page.getByText('Фактически внесено')).toBeVisible();
  await page.screenshot({path:info.outputPath('calendar-mobile-390.png'),fullPage:true});
  await page.getByRole('group', {name:'Режим календаря'}).getByRole('button',{name:'Месяц'}).click();
  expect(await page.locator('.calendar-days--month .calendar-day').count()).toBeGreaterThanOrEqual(28);
  await page.getByRole('button', {name:'Следующий период'}).click();
  await expect(page.locator('.calendar-day--unformed').first()).toBeVisible();
  await page.getByRole('group', {name:'Режим календаря'}).getByRole('button',{name:'Неделя'}).click();
  await page.setViewportSize({width:1280,height:850});
  await expect(page.getByRole('button',{name:'Календарь'})).toBeVisible();
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
  const state = await readEngineState(page);
  const original = state.queue.find(item => item.type !== 'REST' && item.movable);
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
