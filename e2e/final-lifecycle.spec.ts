import {test, expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {appCycle} from '../tests/helpers-app.ts';
import {NOW, dateAfter} from '../tests/helpers.ts';
import {createCycleAndReachToday, fillQuestionnaire, readActiveCycle, reset, ACTIVE_CYCLE} from './app.ts';
const ARCHIVE='fizuha.archivedCycles';
async function clock(page: Page, date: string) {
  await page.clock.setSystemTime(new Date(date+'T12:00:00Z'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
}
async function seed(page: Page, raceDate: string) {
  const f=appCycle({raceDate});await page.clock.install({time:new Date(NOW+'T12:00:00Z')});await page.goto('/');
  await page.evaluate(({key,raw})=>{localStorage.clear();localStorage.setItem(key,raw);},{key:ACTIVE_CYCLE,raw:f.raw});await page.goto('/today');
}
async function finish(page: Page) {
  await page.getByRole('button',{name:'Внести итоговый результат',exact:true}).click();
  await expect(page.getByLabel('Время на 3000 м')).toBeVisible();await expect(page.getByLabel('Дата результата')).toHaveCount(0);
  await page.getByLabel('Время на 3000 м').fill('14:42');await page.getByRole('button',{name:'Сохранить итоговый результат',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Подготовка завершена'})).toBeVisible();
  await expect(page.getByText('Цикл сохранён в архиве')).toBeVisible();
}

test('E2E lifecycle: onboarding → parameter update → plan → reload; baseline unchanged',async({page})=>{
 await page.clock.install({time:new Date(NOW+'T12:00:00Z')});await reset(page);await fillQuestionnaire(page);await createCycleAndReachToday(page);
 const before=await readActiveCycle(page);await page.getByRole('navigation').getByRole('button',{name:'Профиль'}).click();await page.getByRole('button',{name:'Изменить цель и дату старта'}).click();
 await page.getByLabel('Цель 3000 м').fill('14:50');await page.getByLabel('Дата итогового старта').fill(dateAfter(10));await page.getByRole('button',{name:'Сохранить изменения'}).click();
 await expect(page.getByRole('heading',{name:'План обновлён'})).toBeVisible();await page.getByRole('button',{name:'Продолжить',exact:true}).click();await expect(page.getByRole('heading',{name:'План'})).toBeVisible();await page.reload();
 const after=await readActiveCycle(page);expect(after.cycle.baseline).toEqual(before.cycle.baseline);const engine=JSON.parse(after.cycle.engineState);expect(engine.profile.targetTimeSeconds).toBe(890);expect(engine.profile.raceDate).toBe(dateAfter(10));expect(after.events.at(-1)!.type).toBe('TRAINING_PARAMETERS_CHANGED');
});
test('E2E lifecycle: taper → live race day → final result → archived summary reload',async({page})=>{
 await seed(page,dateAfter(1));await expect(page.getByText('Снижение нагрузки перед забегом',{exact:true})).toBeVisible();await page.reload();await clock(page,dateAfter(1));
 await expect(page.getByRole('heading',{name:'Итоговый старт — 3000 м'})).toBeVisible();await page.reload();await finish(page);
 expect(await page.evaluate(key=>localStorage.getItem(key),ACTIVE_CYCLE)).toBeNull();const raw=await page.evaluate(key=>localStorage.getItem(key),ARCHIVE);const entries=JSON.parse(raw!).cycles;expect(entries).toHaveLength(1);expect(JSON.parse(entries[0].appState.cycle.engineState).profile.performance.date).toBe(dateAfter(1));await page.reload();await expect(page.getByRole('heading',{name:'Подготовка завершена'})).toBeVisible();
});
test('E2E lifecycle: missed race-day entry → +2days awaiting → result → history → new independent cycle',async({page})=>{
 await seed(page,dateAfter(1));await clock(page,dateAfter(1));await expect(page.getByRole('heading',{name:'Итоговый старт — 3000 м'})).toBeVisible();await page.getByRole('button',{name:'Внести позже'}).click();await page.goto('/today');
 await clock(page,dateAfter(3));await expect(page.getByText('Итоговый результат ещё не внесён',{exact:true})).toBeVisible();await page.reload();await finish(page);
 const old=JSON.parse((await page.evaluate(key=>localStorage.getItem(key),ARCHIVE))!).cycles[0];expect(JSON.parse(old.appState.cycle.engineState).profile.performance.date).toBe(dateAfter(1));
 await page.getByRole('button',{name:'История',exact:true}).click();await page.getByRole('button',{name:'Открыть',exact:true}).click();await page.reload();await expect(page.getByRole('heading',{name:'Подготовка завершена'})).toBeVisible();await page.getByRole('button',{name:'Начать новую подготовку',exact:true}).click();
 await expect(page.getByRole('button',{name:'Начать подготовку',exact:true})).toBeVisible();await fillQuestionnaire(page);await createCycleAndReachToday(page);
 const active=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),ACTIVE_CYCLE);expect(active.cycle.cycleId).not.toBe(old.cycleId);
 const archives=JSON.parse((await page.evaluate(key=>localStorage.getItem(key),ARCHIVE))!);expect(archives.cycles).toHaveLength(1);expect(archives.cycles[0]).toEqual(old);
});
