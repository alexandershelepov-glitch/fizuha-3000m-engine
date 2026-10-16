/** Issue #30: the athlete can follow an EASY session without guessing pace. */
import {test, expect} from '@playwright/test';
import {reset, fillQuestionnaire, createCycleAndReachToday, readEngineState} from './app.ts';

test('EASY session shows concrete running pace, treadmill speed, distance and expected time',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  await reset(page);
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);
  const state=await readEngineState(page);
  const easy=state.queue.find(w=>w.type==='EASY'||w.type==='LONG_EASY');
  expect(easy,'at least one EASY session should be prescribed in current cycle').toBeTruthy();
  await page.goto('/workout/'+encodeURIComponent(easy!.id));
  await expect(page.locator('.instruction__headline')).toContainText(/спокойный бег/);
  await expect(page.getByText(/Держи темп/)).toContainText(/мин\/км/);
  await expect(page.getByText(/На дорожке установи скорость/)).toContainText(/км\/ч/);
  await expect(page.getByText(/Ожидаемое время на дистанции/)).toBeVisible();
  await expect(page.getByText(/Не беги быстрее/)).toContainText(/мин\/км/);
  await page.screenshot({path:info.outputPath('issue-30-easy-assignment-390.png'),fullPage:true});
  await page.reload();
  await expect(page.getByText(/На дорожке установи скорость/)).toBeVisible();
});
