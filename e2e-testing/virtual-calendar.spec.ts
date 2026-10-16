import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
});

test('only isolated build exposes persistent virtual date and fast forwarding',async({page})=>{
  const panel=page.getByRole('region',{name:'Тестовый календарь'});
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('ТЕСТОВАЯ ВЕРСИЯ');
  const initial=await page.getByTestId('test-date').getAttribute('dateTime');
  expect(initial).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await panel.getByRole('button',{name:'+1 день'}).click();
  const afterDay=await page.getByTestId('test-date').getAttribute('dateTime');
  const dayMs=86400000;
  expect(Date.parse(afterDay+'T00:00:00Z')-Date.parse(initial+'T00:00:00Z')).toBe(dayMs);
  await panel.getByRole('button',{name:'+7 дней'}).click();
  const afterWeek=await page.getByTestId('test-date').getAttribute('dateTime');
  expect(Date.parse(afterWeek+'T00:00:00Z')-Date.parse(initial+'T00:00:00Z')).toBe(8*dayMs);
  expect(await page.evaluate(()=>localStorage.getItem('fizuha.activeCycle'))).toBeNull();
  await page.reload();
  await expect(page.getByTestId('test-date')).toHaveAttribute('dateTime',afterWeek);
});

test('fast-forward leaves unfinished workouts PENDING and never auto-awards GREEN',async({page})=>{
  await page.getByRole('button',{name:'Начать подготовку'}).click();
  await page.getByLabel('Ваш результат').fill('15:20');
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByLabel(/Сколько недель подряд/).fill('8');
  for(let i=1;i<6;i++)await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByLabel('Желаемый результат на 3000 м').fill('14:30');
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByRole('button',{name:'Рассчитать план'}).click();
  await page.getByRole('button',{name:'Посмотреть план'}).click();
  await page.getByRole('button',{name:'Перейти к подготовке'}).click();
  const before=await page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('fizuha.activeCycle')!).cycle.engineState));
  expect(before.history).toHaveLength(0);
  await page.getByRole('region',{name:'Тестовый календарь'}).getByRole('button',{name:'+7 дней'}).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByText('Предыдущая тренировка ещё не закрыта')).toBeVisible();
  const after=await page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('fizuha.activeCycle')!).cycle.engineState));
  expect(after.history).toHaveLength(0);
  expect(after.queue.some(w=>w.scheduledDate<localStorage.getItem('fizuha.test.virtualDate.v1'))).toBe(true);
});
