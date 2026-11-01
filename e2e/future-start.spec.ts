import {expect,test} from '@playwright/test';
import {reset,createCycleAndReachToday,ACTIVE_CYCLE,readEngineState,closeWorkoutCard} from './app.ts';

for(const scenario of [
  {today:'2026-11-01',start:'2026-11-02',race:'2026-12-26',label:'2 ноября 2026',km:'16',long:'6',eligible:true},
  {today:'2026-11-02',start:'2026-11-03',race:'2026-12-27',label:'3 ноября 2026',km:'16',long:'6',eligible:true},
  {today:'2026-11-01',start:'2026-11-02',race:'2026-12-26',label:'2 ноября 2026',km:'8',long:'4',eligible:false},
]) test(`ordinary questionnaire: ${scenario.start}, base ${scenario.km} km, plan and reload`,async({page})=>{
  await page.clock.install({time:new Date(scenario.today+'T09:00:00Z')});
  await reset(page);
  await page.getByRole('button',{name:'Начать подготовку'}).click();
  await page.getByLabel('Ваш результат',{exact:true}).fill('14:30');
  await page.getByLabel('Дата результата',{exact:true}).fill(scenario.today);
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByRole('button',{name:'Да',exact:true}).click();
  await page.getByLabel(/Сколько недель подряд/).fill('20');
  await page.getByLabel(/Сколько раз в неделю вы обычно бегаете сейчас/).fill('3');
  await page.getByLabel(/Примерно сколько километров вы пробегаете за неделю/).fill(scenario.km);
  await page.getByLabel(/Сколько километров обычно составляет ваша самая длинная пробежка/).fill(scenario.long);
  for(let i=0;i<4;i++) await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByLabel('Сколько тренировок в неделю вы можете выполнять').fill('3');
  await page.getByRole('radio',{name:/Да, примерно соответствует/}).click();
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:00');
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByLabel('Дата начала тренировок').fill(scenario.start);
  await page.locator('#raceDate').fill(scenario.race);
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await createCycleAndReachToday(page);
  const seed=await page.evaluate(key=>localStorage.getItem(key),ACTIVE_CYCLE);
  const raw=JSON.parse(JSON.parse(seed!).cycle.engineState);
  expect(raw.asOf).toBe(scenario.today);expect(raw.cycleStartDate).toBe(scenario.start);expect(raw.history).toHaveLength(0);
  await page.getByRole('navigation',{name:'Основные разделы'}).getByText('План').click();
  await expect(page.getByText(/Начало тренировок:/)).toContainText(scenario.label);
  if(!scenario.eligible){
    const note=page.locator('.calendar-methodology-note');
    await expect(note).toContainText('Общий план: методика №4 не применена');
    await expect(note).toContainText('меньше 15 км в неделю');
    expect(raw.methodology).toBeUndefined();return;
  }
  const blocks=page.locator('.calendar-week-block');await expect(blocks).toHaveCount(8);
  const quality=['2 × 6 мин','3 × 600 м','2 × 8 мин','4 × 150 м','2 × 800 м','2 × 10 мин','3 × 400 м','3 × 150 м'];
  const paces=['5:15','2:53','5:15','0:41','3:51','5:15','1:56','0:41'];
  const recovery=['2 минуты 30 секунд','3 минуты','3 минуты','150 метров','3 минуты','3 минуты','200 метров','150 метров'];
  const easy=['4000 м','4500 м','4500 м','5000 м','5500 м','5000 м','4500 м','3000 м'];
  const long=['5500 м','6000 м','6500 м','6000 м','7000 м','7500 м','6000 м','3000 м'];
  for(let w=0;w<8;w++) for(const [role,offset] of [0,2,5].entries()){
    await blocks.nth(w).locator('.calendar-day').nth(offset).click();
    // Each tap opens the full card for that day.
    const params=page.locator('.workout-card .calendar-params');
    await expect(params).toContainText(role===0?quality[w]!:role===1?easy[w]!:long[w]!);
    if(role===0){await expect(params).toContainText(w===7?'1200 м E':'1500 м E');await expect(params).toContainText(w===7?'600 м E':'800 м E');await expect(params).toContainText(paces[w]!);await expect(params).toContainText(recovery[w]!);}
    if(role!==0 && !(w===7&&role===2)) await expect(params).toContainText('6:05–6:45');
    if(role===1 && [0,2,4,6].includes(w)) await expect(params).toContainText('4 × 15 с');
    if(w===7&&role===2) await expect(params).toContainText('3 × 80 м');
    await closeWorkoutCard(page);
  }
  await blocks.first().locator('.calendar-day').first().click();
  await closeWorkoutCard(page);
  await page.locator('.calendar-detail').getByRole('button',{name:'Открыть тренировку'}).click();
  await expect(page.getByRole('button',{name:'Внести результат',exact:true})).toHaveCount(0);
  await page.getByRole('navigation',{name:'Основные разделы'}).getByText('План').click();
  expect(await page.evaluate(key=>localStorage.getItem(key),ACTIVE_CYCLE)).toBe(seed);
  await page.reload();await expect(blocks).toHaveCount(8);expect(await page.evaluate(key=>localStorage.getItem(key),ACTIVE_CYCLE)).toBe(seed);
  expect((await readEngineState(page)).history).toHaveLength(0);
});
