/**
 * Issue #23, item 5 — cross-cutting checks that do not need a whole 8–12 week walk:
 * double clicks, "+7 days" with an unclosed workout, reloads / back-forward, damaged storage, early final result.
 * Every test follows an explicit behaviour model written in its first comment; observed facts go to the journal.
 */
import {test, expect} from '@playwright/test';
import {join} from 'node:path';
import {deriveToday} from '../../web/src/application/uiState.ts';
import {PROFILES, QA_START_DATE} from './profiles.ts';
import {ACTIVE_CYCLE, Session} from './driver.ts';
import {Journal} from './journal.ts';
import {makeRng, planReport} from './model.ts';
import type {WorkoutLite} from './model.ts';

const OUT = process.env.QA_OUT_DIR ?? 'reports/qa-issue-23/data';
const profile = PROFILES.find((p) => p.id === 'p3-15-30-12-18km')!;

async function setup(page: import('@playwright/test').Page, id: string) {
  const journal = new Journal(`cross-${id}`, profile.seed);
  const s = new Session(page, profile, journal);
  await s.fresh(); await s.onboard();
  await s.captureBaseline();
  return {s, journal};
}

test.describe.configure({mode: 'serial'});

test('cross · double-click on «Сохранить результат» creates exactly one history entry', async ({page}) => {
  // model: one explicit submit = one history entry, even if the button is hit twice within ms.
  const {s, journal} = await setup(page, 'double-result');
  try {
    const st = await s.engine();
    const w = deriveToday(st, await s.today()).workout as unknown as WorkoutLite;
    expect(w).toBeTruthy();
    await s.recordWorkout(w, planReport(w, 'ON_PLAN', makeRng(profile.seed)), {via: 'card', doubleClick: true, shot: 'double-click'});
    const after = await s.engine();
    expect(after.history.filter((h) => h.workout.id === w.id)).toHaveLength(1);
    await s.audit('after double-click submit');
  } finally { journal.write(join(OUT)); }
  expect(journal.failures.map((f) => f.id + ': ' + f.detail)).toEqual([]);
});

test('cross · double-click on «Я её не выполнял» skips once and never credits anything', async ({page}) => {
  // model: skip is recorded once; history stays empty (no auto-credit); a second click may not trigger another action.
  const {s, journal} = await setup(page, 'double-skip');
  try {
    await s.advance(1);
    await page.goto('/today');
    await expect(page.getByText('Предыдущая тренировка ещё не закрыта')).toBeVisible();
    const before = await s.engine();
    await page.getByRole('button', {name: 'Я её не выполнял'}).dblclick();
    await page.waitForTimeout(400);
    s.uiActions.skipClicks += 1;
    const after = await s.engine();
    s.verify('DOUBLE_SKIP_ONE_SKIP', 'Двойное нажатие «Я её не выполнял» даёт ровно один пропуск', after.skippedWorkouts.length === before.skippedWorkouts.length + 1, `до=${before.skippedWorkouts.length}, после=${after.skippedWorkouts.length}`, await s.today());
    s.verify('DOUBLE_SKIP_NO_CREDIT', 'Двойное нажатие не создаёт записей в истории', after.history.length === 0, `history=${after.history.length}`, await s.today());
    await s.shot('after-double-skip');
    journal.row({date: await s.today(), week: 1, day_index: 1, event: 'DOUBLE_CLICK_SKIP', entered_result: 'dblclick «Я её не выполнял»', change_reason: `URL после: ${new URL(page.url()).pathname}`, phase: after.decision.phase, safety: after.decision.safety});
  } finally { journal.write(join(OUT)); }
  expect(journal.failures.map((f) => f.id + ': ' + f.detail)).toEqual([]);
});

test('cross · double-click on «+1 день» moves the virtual calendar by the clicks made and credits nothing', async ({page}) => {
  // model: panel clicks are explicit actions; 2 fast clicks → at most +2 days; "Переход не засчитывает тренировку".
  const {s, journal} = await setup(page, 'double-advance');
  try {
    const d0 = await s.today();
    await page.getByRole('button', {name: '+1 день'}).dblclick();
    await page.waitForTimeout(400);
    const d1 = await s.today();
    const st = await s.engine();
    const delta = (Date.parse(d1) - Date.parse(d0)) / 86400000;
    s.verify('DOUBLE_ADVANCE_BOUNDED', 'Двойное нажатие «+1 день» сдвигает дату не более чем на 2 дня', delta >= 1 && delta <= 2, `${d0} → ${d1} (${delta} дн.)`, d1);
    s.verify('DOUBLE_ADVANCE_NO_CREDIT', 'Сдвиг календаря не создаёт записей в истории', st.history.length === 0, `history=${st.history.length}`, d1);
    journal.row({date: d1, week: 1, day_index: delta, event: 'DOUBLE_CLICK_ADVANCE', entered_result: `${d0} → ${d1}`, change_reason: 'dblclick «+1 день»', phase: st.decision.phase, safety: st.decision.safety});
  } finally { journal.write(join(OUT)); }
  expect(journal.failures.map((f) => f.id + ': ' + f.detail)).toEqual([]);
});

test('cross · «+7 дней» with an unclosed workout: no auto-credit, workout stays pending, plan is not refreshed behind the user', async ({page}) => {
  // model (docs/accelerated-manual-testing.md + INV-1): the jump does not close or credit a workout; the pending item stays.
  const {s, journal} = await setup(page, 'jump-with-pending');
  try {
    const d0 = await s.today();
    const before = await s.engine();
    await page.getByRole('button', {name: '+7 дней'}).click();
    await page.waitForTimeout(500);
    const d1 = await s.today();
    const after = await s.engine();
    await page.goto('/today');
    await s.shot('plus7-with-pending');
    s.verify('PLUS7_NO_AUTOCREDIT', '«+7 дней» не засчитывает и не пропускает тренировку сам', after.history.length === 0 && after.skippedWorkouts.length === 0, `history=${after.history.length}, skipped=${after.skippedWorkouts.length}`, d1);
    s.verify('PLUS7_PENDING_VISIBLE', 'После «+7 дней» незакрытая тренировка остаётся в очереди и видна пользователю', after.queue.some((w) => w.scheduledDate < d1) && (await page.getByText('Предыдущая тренировка ещё не закрыта').count()) > 0, `дата ${d0} → ${d1}; в очереди: ${after.queue.map((w) => w.scheduledDate + ':' + w.type).join(' ')}`, d1);
    journal.row({date: d1, week: 1, day_index: 7, event: 'PLUS7_WITH_PENDING', entered_result: `${d0} → ${d1}`, change_reason: `очередь до: ${before.queue.length}, после: ${after.queue.length}`, phase: after.decision.phase, safety: after.decision.safety});
  } finally { journal.write(join(OUT)); }
  expect(journal.failures.map((f) => f.id + ': ' + f.detail)).toEqual([]);
});

test('cross · reload on every route and back/forward keep storage byte-identical and never re-submit a result', async ({page}) => {
  // model: navigation and reload are read-only. Back after a submitted result must not create a second entry.
  const {s, journal} = await setup(page, 'reload-nav');
  try {
    const st0 = await s.engine();
    const w = deriveToday(st0, await s.today()).workout as unknown as WorkoutLite;
    await s.recordWorkout(w, planReport(w, 'ON_PLAN', makeRng(profile.seed)), {via: 'card'});
    for (const route of ['/today', '/plan', '/history', '/profile']) {
      await page.goto(route);
      await s.reloadAndCompare(`маршрут ${route}`);
    }
    const raw = await s.rawCycle();
    await page.goBack(); await page.goBack();
    await page.goForward();
    await page.waitForTimeout(300);
    const after = await s.engine();
    s.verify('BACK_FORWARD_NO_RESUBMIT', 'Назад/вперёд по истории браузера не создаёт повторную запись результата', after.history.length === 1, `history=${after.history.length}`, await s.today());
    s.verify('BACK_FORWARD_STORAGE_SAME', 'Назад/вперёд не меняет сохранённый цикл', (await s.rawCycle()) === raw, 'сравнение строки хранилища', await s.today());
    // direct URL of an already completed workout's result form must not allow a second credit
    await page.goto(`/workout/${w.id}/result`);
    await page.waitForTimeout(400);
    await s.shot('completed-workout-result-url');
    const afterDirect = await s.engine();
    s.verify('COMPLETED_WORKOUT_RESULT_URL_SAFE', 'Прямой URL формы результата уже внесённой тренировки не даёт засчитать её второй раз', afterDirect.history.length === 1, `history=${afterDirect.history.length}; экран: ${(await page.locator('.screen').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)}`, await s.today());
  } finally { journal.write(join(OUT)); }
  expect(journal.failures.map((f) => f.id + ': ' + f.detail)).toEqual([]);
});

test('cross · damaged localStorage does not crash the app and does not silently erase data', async ({page}) => {
  // model: invalid JSON in the active-cycle key → app stays usable (a heading is rendered, no uncaught page error);
  // the broken value is not silently replaced by a fresh cycle without the user doing something.
  const {s, journal} = await setup(page, 'damaged-storage');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    const good = await s.rawCycle();
    await page.evaluate((k) => window.localStorage.setItem(k, '{"broken": '), ACTIVE_CYCLE);
    await page.reload();
    await page.waitForTimeout(800);
    await s.shot('damaged-storage');
    const heading = (await page.locator('h1, h2').count()) > 0 ? await page.locator('h1, h2').first().innerText() : '(нет заголовка)';
    const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300);
    s.verify('DAMAGED_STORAGE_NO_CRASH', 'Повреждённое хранилище: нет необработанных ошибок страницы и экран не пустой', errors.length === 0 && bodyText.length > 20, `заголовок: «${heading}»; ошибок страницы: ${errors.length} ${errors.join(' | ').slice(0, 200)}; текст: «${bodyText.slice(0, 120)}»`, QA_START_DATE);
    const raw = await s.rawCycle();
    s.verify('DAMAGED_STORAGE_NOT_SILENTLY_REPLACED', 'Повреждённое значение не подменяется молча новым циклом', raw === '{"broken": ' || raw === null, `значение: ${raw === null ? 'null' : raw.slice(0, 40)}`, QA_START_DATE);
    journal.row({date: QA_START_DATE, week: 1, day_index: 0, event: 'DAMAGED_STORAGE', entered_result: 'activeCycle = "{\\"broken\\": "', change_reason: `исходная длина ${good?.length}`, warnings: `заголовок «${heading}»`});
  } finally { journal.write(join(OUT)); }
  expect(journal.failures.map((f) => f.id + ': ' + f.detail)).toEqual([]);
});

test('cross · final result before the race day is refused (expected block), nothing is archived', async ({page}) => {
  // model: spec: "Результат итогового забега можно внести не раньше дня старта" — direct URL must not bypass it.
  const {s, journal} = await setup(page, 'early-final');
  try {
    await page.goto('/final-result');
    const field = page.locator('#final-time');
    if (await field.count() > 0) {
      await field.fill('15:00');
      await page.getByRole('button', {name: 'Сохранить итоговый результат', exact: true}).click();
      await page.waitForTimeout(400);
    }
    await s.shot('early-final-result-blocked');
    const raw = await s.rawCycle();
    const archived = await page.evaluate(() => window.localStorage.getItem('fizuha.archivedCycles'));
    const st = await s.engine();
    s.verify('EARLY_FINAL_REFUSED', 'Итоговый результат до дня старта не принимается и цикл не архивируется', raw !== null && !st.finalResultRecorded && (archived === null || (JSON.parse(archived) as {cycles: unknown[]}).cycles.length === 0), `finalResultRecorded=${st.finalResultRecorded}; архив=${archived === null ? 'нет' : 'есть'}; url=${new URL(page.url()).pathname}`, await s.today());
    journal.counters.expectedBlocks += 1;
  } finally { journal.write(join(OUT)); }
  expect(journal.failures.map((f) => f.id + ': ' + f.detail)).toEqual([]);
});
