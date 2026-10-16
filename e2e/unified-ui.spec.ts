/** Issue #25: check visual system on actual screens, using only engine-created data. */
import {expect, test} from '@playwright/test';
import {reset, fillQuestionnaire, createCycleAndReachToday} from './app.ts';

test('unified mobile visual system: introduction, questionnaire, Today and History', async ({page}, info) => {
  await page.setViewportSize({width:390,height:844});
  await reset(page);
  const theme = await page.evaluate(() => ({
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  }));
  expect(theme).toEqual({bg:'#f4f7f9',surface:'#ffffff',accent:'#177e74'});
  await page.screenshot({path:info.outputPath('unified-first-run-390.png'),fullPage:true});
  await page.getByRole('button',{name:'Начать подготовку'}).click();
  await expect(page.getByRole('heading', {name:/Результат/})).toBeVisible();
  await expect(page.getByLabel('Ваш результат')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await page.screenshot({path:info.outputPath('unified-questionnaire-390.png'),fullPage:true});
  await page.goto('/');
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);
  await expect(page.getByRole('region',{name:'Ваша подготовка'})).toBeVisible();
  await expect(page.getByText('Текущий результат')).toBeVisible();
  await expect(page.getByText('Цель', {exact:true}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Открыть календарь'})).toBeVisible();
  await page.screenshot({path:info.outputPath('unified-today-390.png'),fullPage:true});
  await page.getByRole('navigation',{name:'Основные разделы'}).getByText('История').click();
  await page.screenshot({path:info.outputPath('unified-history-390.png'),fullPage:true});
});

test('unified desktop visual system: same left rail and readable home cards', async ({page}, info) => {
  await page.setViewportSize({width:1280,height:900});
  await reset(page);
  await fillQuestionnaire(page);
  await createCycleAndReachToday(page);
  const rail = page.getByRole('navigation',{name:'Основные разделы'});
  await expect(rail).toHaveCSS('position','fixed');
  await expect(page.getByRole('region',{name:'Ваша подготовка'})).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  await page.screenshot({path:info.outputPath('unified-today-1280.png'),fullPage:true});
  await rail.getByText('История').click();
  await page.screenshot({path:info.outputPath('unified-history-1280.png'),fullPage:true});
});
