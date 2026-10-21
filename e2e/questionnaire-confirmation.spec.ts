/**
 * Material questionnaire answers must be explicit choices, not prefilled defaults:
 * a new user sees blank fields and unselected options, cannot skip them, and a reload
 * or a returning visit keeps the answers already given.
 */
import {expect, test} from '@playwright/test';
import {fillQuestionnaire, reset, resultDate, walkToGoal} from './app.ts';

test.beforeEach(async ({page}) => {
  await reset(page);
});

test('a new user sees blank material fields and nothing preselected', async ({page}) => {
  await page.getByRole('button', {name: 'Начать подготовку'}).click();

  await expect(page.getByLabel('Дата результата')).toHaveValue('');

  await page.getByLabel('Ваш результат').fill('15:20');
  await page.getByLabel('Дата результата').fill(await resultDate(page));
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // VOLUME

  await expect(page.getByRole('button', {name: 'Да', exact: true})).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', {name: 'Нет', exact: true})).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel(/Сколько раз в неделю вы обычно бегаете сейчас/)).toHaveValue('');
  await expect(page.getByLabel(/Примерно сколько километров вы пробегаете за неделю/)).toHaveValue('');
  await expect(page.getByLabel(/Сколько километров обычно составляет ваша самая длинная пробежка/)).toHaveValue('');
});

test('blank material answers block the walk with an explanation', async ({page}) => {
  await page.getByRole('button', {name: 'Начать подготовку'}).click();
  await page.getByLabel('Ваш результат').fill('15:20');

  // The result date is blank: the step refuses to advance.
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await expect(page.getByText('Выберите дату')).toBeVisible();
  await expect(page).toHaveURL(/step=RESULT$/);

  await page.getByLabel('Дата результата').fill(await resultDate(page));
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click(); // VOLUME
  await page.getByLabel(/Сколько недель подряд/).fill('8');

  // The capability question and the weekly numbers are blank: still blocked, each with its own wording.
  await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
  await expect(page).toHaveURL(/step=VOLUME$/);
  await expect(page.getByText('Выберите один из вариантов')).toBeVisible();
  await expect(page.getByText('Заполните это поле')).toHaveCount(3);
});

test('the mismatch verdict is required only when a result exists', async ({page}) => {
  await walkToGoal(page);
  // walkToGoal answers everything; revisit AVAILABILITY and clear nothing — the point is the next check.
  await page.goto('/questionnaire?step=AVAILABILITY');
  await expect(page.getByText(/примерно соответствует тому, как вы бегаете сейчас/)).toBeVisible();

  // Without a result the question would be meaningless, so the no-result path never shows it.
  await page.goto('/questionnaire?step=RESULT');
  await page.getByRole('button', {name: 'Нет результата'}).click();
  await page.goto('/questionnaire?step=AVAILABILITY');
  await expect(page.getByText(/примерно соответствует тому, как вы бегаете сейчас/)).toHaveCount(0);
});

test('answers survive a reload and a returning visit keeps a stored draft', async ({page}) => {
  await page.getByRole('button', {name: 'Начать подготовку'}).click();
  await page.getByLabel('Ваш результат').fill('15:20');
  await page.getByLabel('Дата результата').fill(await resultDate(page));

  await page.reload();
  await page.goto('/questionnaire?step=RESULT');
  await expect(page.getByLabel('Ваш результат')).toHaveValue('15:20');
  await expect(page.getByLabel('Дата результата')).toHaveValue(await resultDate(page));

  // A fresh visit (same storage) starts from the stored draft, not from blank defaults.
  await page.goto('/');
  await page.getByRole('button', {name: 'Начать подготовку'}).click();
  await expect(page.getByLabel('Ваш результат')).toHaveValue('15:20');
});

test('an old prefilled draft requires new answers and preserves partial confirmation across reload', async ({page}) => {
  await page.evaluate(() => {
    window.localStorage.setItem('fizuha.questionnaireDraft',JSON.stringify({
      hasResult:true,resultTime:'15:20',resultDate:new Date().toISOString().slice(0,10),
      canRun3Km:true,regularRunningWeeks:'8',actualRunsPerWeek:'3',
      averageWeeklyKm4Weeks:'15',longestUsualRunKm:'5',performanceMismatch:'NONE',targetTime:'14:30',
    }));
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Начать подготовку'}).click();
  await expect(page.getByLabel('Ваш результат')).toHaveValue('15:20');
  await expect(page.getByLabel('Дата результата')).toHaveValue('');
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await expect(page.getByText('Выберите дату')).toBeVisible();
  await page.getByLabel('Дата результата').fill(await resultDate(page));
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.reload();
  await expect(page.getByRole('button',{name:'Да',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(page.getByRole('button',{name:'Нет',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(page.getByLabel(/Сколько раз в неделю вы обычно бегаете сейчас/)).toHaveValue('');
  await expect(page.getByLabel(/Примерно сколько километров вы пробегаете за неделю/)).toHaveValue('');
  await expect(page.getByLabel(/Сколько километров обычно составляет ваша самая длинная пробежка/)).toHaveValue('');
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await expect(page).toHaveURL(/step=VOLUME$/);
  await expect(page.getByText('Выберите один из вариантов')).toBeVisible();
  expect(await page.evaluate(()=>window.localStorage.getItem('fizuha.activeCycle'))).toBeNull();
  await page.goto('/questionnaire?step=AVAILABILITY');
  await expect(page.getByRole('radio',{name:/Да, примерно соответствует/})).not.toBeChecked();
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await expect(page).toHaveURL(/step=AVAILABILITY$/);
  await expect(page.getByText('Выберите один из вариантов')).toBeVisible();
  await page.goto('/');
  await fillQuestionnaire(page);
  await page.getByRole('button',{name:'Рассчитать план'}).click();
  await expect(page.getByText('Ваша подготовка',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.localStorage.getItem('fizuha.activeCycle'))).not.toBeNull();
});
