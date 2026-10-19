import {test,expect} from '@playwright/test';
import {reset,fillQuestionnaire,createCycleAndReachToday,readEngineState} from './app.ts';

test('QA-only actions write synthetic records, advance virtual date, survive reload',async({page})=>{
  test.skip(process.env.VITE_QA_MODE!=='1','QA controls must be absent in standard builds');
  await reset(page);
  await expect(page.getByTestId('qa-panel')).toBeVisible();
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);
  const before=await readEngineState(page);
  await page.getByRole('button',{name:'Успешно (тест)'}).click();
  await expect(page.getByRole('status')).toContainText('Тестовый отчёт записан');
  const after=await readEngineState(page);
  expect(after.history.length).toBe(before.history.length+1);
  await page.reload();
  const reloaded=await readEngineState(page);
  expect(reloaded.history.length).toBe(after.history.length);
  await page.getByRole('button',{name:'Неделя: одна неудача'}).click();
  await expect(page.getByTestId('qa-panel')).toBeVisible();
});

test('production build never presents synthetic actions',async({page})=>{
  test.skip(process.env.VITE_QA_MODE==='1','The QA host has separate actions');
  await page.goto('/');
  await expect(page.getByTestId('qa-panel')).toHaveCount(0);
});
