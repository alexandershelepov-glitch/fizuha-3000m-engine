/** Calibrating an untimed beginner is a measurable mobile workflow, not an invented speed. */
import {test, expect} from '@playwright/test';
import {reset, createCycleAndReachToday, ACTIVE_CYCLE} from './app.ts';

test('untimed continuous beginner sees a measured EASY task and a blank real-time report',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  await reset(page);
  await page.getByRole('button',{name:'Начать подготовку'}).click();
  await page.getByRole('button',{name:'Нет результата'}).click();
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByLabel(/Сколько недель подряд/).fill('8');
  await page.getByLabel(/Сколько раз в неделю/).fill('2');
  await page.getByLabel(/Сколько километров/).fill('10');
  await page.getByLabel(/Самая длинная/).fill('4');
  for(let i=0;i<5;i++)await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:30');
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await createCycleAndReachToday(page);
  const w=await page.evaluate(key=>{
    const envelope=JSON.parse(window.localStorage.getItem(key)!);
    const state=JSON.parse(envelope.cycle.engineState);
    return state.queue.find((x:{main:{calibration?:boolean}})=>x.main.calibration===true);
  },ACTIVE_CYCLE) as {id:string;main:{dose:{value:number}}};
  expect(w).toBeTruthy();
  expect(w.main.dose.value).toBe(2000);
  await page.goto('/workout/'+encodeURIComponent(w.id));
  await expect(page.locator('.instruction__headline')).toContainText('калибровка темпа');
  await expect(page.getByText(/Засеки фактическое время/)).toBeVisible();
  await expect(page.getByText(/двух подтверждённых измерений/)).toBeVisible();
  await page.screenshot({path:info.outputPath('beginner-calibration-390.png'),fullPage:true});
  await page.goto('/workout/'+encodeURIComponent(w.id)+'/result');
  await expect(page.getByText(/Калибровка: обязательно внеси фактическое время/)).toBeVisible();
  await expect(page.getByLabel('Длительность, мин')).toHaveValue('');
  await expect(page.getByLabel('Дистанция, м')).toHaveValue('');
});
