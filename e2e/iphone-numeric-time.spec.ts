/** Regression for iOS numeric keypad (which has no colon key). */
import {expect, test} from '@playwright/test';
import {reset} from './app.ts';

test('four digits are enough for the first 3000 m result on a mobile keypad', async ({page}) => {
  await reset(page);
  await page.getByRole('button', {name:'Начать подготовку'}).click();
  const result = page.getByLabel('Ваш результат');
  await expect(result).toHaveAttribute('inputmode', 'numeric');
  await result.fill('1430');
  await expect(result).toHaveValue('14:30');
  await page.getByRole('button', {name:'Продолжить', exact:true}).click();
  await expect(page.getByText('Сколько вы бегаете сейчас')).toBeVisible();
});

test('an impossible seconds field is still rejected and does not advance the questionnaire', async ({page}) => {
  await reset(page);
  await page.getByRole('button', {name:'Начать подготовку'}).click();
  await page.getByLabel('Ваш результат').fill('1475');
  await expect(page.getByLabel('Ваш результат')).toHaveValue('14:75');
  await page.getByRole('button', {name:'Продолжить', exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Такого времени не существует');
  await expect(page).toHaveURL(/step=RESULT$/);
});
