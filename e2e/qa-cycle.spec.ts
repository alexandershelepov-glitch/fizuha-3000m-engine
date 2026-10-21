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
  await expect(page.getByRole('status')).toContainText('Синтетических тренировок/пропусков');
  await page.getByRole('button',{name:'Неделя: один пропуск'}).click();
  await expect(page.getByRole('status')).toContainText('Синтетических тренировок/пропусков');
  await expect(page.getByText(/SKIP \(тест\)/)).toBeVisible();
});

test('production build never presents synthetic actions',async({page})=>{
  test.skip(process.env.VITE_QA_MODE==='1','The QA host has separate actions');
  await page.goto('/');
  await expect(page.getByTestId('qa-panel')).toHaveCount(0);
});

test('QA week simulation passes checkpoints and reaches the selected race date',async({page})=>{
  test.skip(process.env.VITE_QA_MODE!=='1','QA controls must be absent in standard builds');
  await reset(page);
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);
  const raceDate=(await readEngineState(page)).profile.raceDate;
  let virtualDate=await page.evaluate(()=>window.localStorage.getItem('fizuha.qa.virtualDate.v1'));
  for(let week=0;week<12 && (!virtualDate||virtualDate<raceDate);week++){
    await page.getByRole('button',{name:'Неделя: выполнено всё'}).click();
    const message=await page.getByRole('status').innerText();
    expect(message).not.toMatch(/Контрольные 3000 м требуют|Контрольный результат отклонён|Пересчёт заблокирован/);
    virtualDate=await page.evaluate(()=>window.localStorage.getItem('fizuha.qa.virtualDate.v1'));
  }
  expect(virtualDate).toBe(raceDate);
});
