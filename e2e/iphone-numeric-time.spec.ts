/** Mobile Chrome verifies the HTML keyboard hint; actual keyboard layouts belong to the OS. */
import {expect, test} from '@playwright/test';
import {reset} from './app.ts';

test('iPhone: the 3000 m result accepts typed MM:SS through the standard keyboard', async ({page}) => {
  await reset(page);
  await page.getByRole('button', {name:'Начать подготовку'}).click();
  const result = page.getByLabel('Ваш результат');
  await expect(result).toHaveAttribute('inputmode', 'text');
  await result.fill('14:30');
  await expect(result).toHaveValue('14:30');
  await page.getByRole('button', {name:'Продолжить', exact:true}).click();
  await expect(page.getByText('Сколько вы бегаете сейчас')).toBeVisible();
});

test('an impossible MM:SS time stays invalid and cannot advance the questionnaire', async ({page}) => {
  await reset(page);
  await page.getByRole('button', {name:'Начать подготовку'}).click();
  await page.getByLabel('Ваш результат').fill('14:75');
  await page.getByRole('button', {name:'Продолжить', exact:true}).click();
  await expect(page.getByText('Сколько вы бегаете сейчас')).toHaveCount(0);
  await expect(page.getByLabel('Ваш результат')).toHaveValue('14:75');
});
