import {expect,test} from '@playwright/test';
import {reset,walkToGoal,createCycleAndReachToday,readEngineState,ACTIVE_CYCLE} from './app.ts';

async function startV4(page: import('@playwright/test').Page) {
  await page.clock.install({time:new Date('2026-11-02T09:00:00Z')});
  await reset(page);
  await walkToGoal(page);
  await page.goto('/questionnaire?step=RESULT');
  await page.getByLabel('Ваш результат',{exact:true}).fill('14:30');
  await page.getByLabel('Дата результата',{exact:true}).fill('2026-11-02');
  await page.goto('/questionnaire?step=VOLUME');
  await page.getByLabel(/Сколько недель подряд/).fill('20');
  await page.getByLabel(/Примерно сколько километров вы пробегаете за неделю/).fill('16');
  await page.getByLabel(/Сколько километров обычно составляет ваша самая длинная пробежка/).fill('6');
  await page.goto('/questionnaire?step=AVAILABILITY');
  await page.getByLabel('Сколько тренировок в неделю вы можете выполнять').fill('3');
  await page.goto('/questionnaire?step=GOAL');
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:00');
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.locator('#raceDate').fill('2026-12-26');
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await createCycleAndReachToday(page);
}

test('V4: real questionnaire -> complete calendar, all 24 visible protocols, no forecast writes',async({page},info)=>{
  await startV4(page);
  const seed=await page.evaluate(key=>localStorage.getItem(key),ACTIVE_CYCLE);
  expect((await readEngineState(page)).history).toHaveLength(0);
  await page.getByRole('navigation',{name:'Основные разделы'}).getByText('План').click();
  await expect(page.locator('.calendar-week-block')).toHaveCount(8);
  const blocks=page.locator('.calendar-week-block');
  const expected=['2 × 6 мин','3 × 600 м','2 × 8 мин','4 × 150 м','2 × 800 м','2 × 10 мин','3 × 400 м','3 × 150 м'];
  const easy=['4000 м','4500 м','4500 м','5000 м','5500 м','5000 м','4500 м','3000 м'];
  const long=['5500 м','6000 м','6500 м','6000 м','7000 м','7500 м','6000 м','3000 м'];
  let checked=0;
  for(let week=0;week<8;week++) {
    const cells=blocks.nth(week).locator('.calendar-day');
    for(const [role,offset] of [0,2,5].entries()) {
      await cells.nth(offset).click();
      const params=page.locator('.calendar-detail .calendar-params');
      await expect(params).toBeVisible();
      await expect(params).toContainText(role===0?expected[week]!:role===1?easy[week]!:long[week]!);
      if(role===0 || week===7&&role===2) {
        await expect(params).toContainText(week===7&&role===0?'1200 м E':'1500 м E');
        await expect(params).toContainText('Динамические упражнения');
        await expect(params).toContainText(week===7&&role===0?'600 м E':'800 м E');
      }
      if(role===1 && [0,2,4,6].includes(week)){
        await expect(params).toContainText('4 × 15 с');await expect(params).toContainText('минимум 75 с');
      }
      if(role===0&&week===6) await expect(params).toContainText('200 м');
      if(role===0&&[3,7].includes(week)) await expect(params).toContainText('150 м');
      if(week===7&&role===2) await expect(params).toContainText('3 × 80 м');
      checked++;
    }
  }
  expect(checked).toBe(24);
  await expect(page.getByText('Прогноз рассчитан с предупреждениями')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('methodology-v4-calendar-390.png'),fullPage:true});
  expect(await page.evaluate(key=>localStorage.getItem(key),ACTIVE_CYCLE)).toBe(seed);
  await page.reload();
  expect(await page.evaluate(key=>localStorage.getItem(key),ACTIVE_CYCLE)).toBe(seed);
  await expect(blocks).toHaveCount(8);
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:info.outputPath('methodology-v4-calendar-1280.png'),fullPage:true});
});

test('V4: user-entered T splits close a real workout and survive reload without changing baseline',async({page})=>{
  await startV4(page);
  await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  await page.getByRole('radio',{name:'Нет, всё нормально'}).click();
  await page.locator('#durationMinutes').fill('32');
  await page.locator('#distanceMeters').fill('5000');
  for(const i of [0,1]){
    await page.locator(`#repeat-seconds-${i}`).fill('6:00');
    await page.locator(`#repeat-meters-${i}`).fill('1143');
  }
  await page.getByRole('button',{name:'Сохранить результат',exact:true}).click();
  await expect(page).toHaveURL(/\/outcome$/);
  await expect(page.getByText('Тренировка выполнена',{exact:true})).toBeVisible();
  const saved=await readEngineState(page);
  expect(saved.history).toHaveLength(1);expect(saved.profile.performance?.timeSeconds).toBe(870);
  await page.reload();expect((await readEngineState(page)).history).toHaveLength(1);
});
