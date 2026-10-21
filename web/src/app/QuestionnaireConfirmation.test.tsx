/**
 * Material questionnaire answers must come from the person, not from a preselected default.
 * A fresh draft starts blank on every answer that shapes the plan, the walk is blocked until
 * each one is answered explicitly. Confirmed drafts keep their answers; legacy guesses require
 * new answers. The no-result path does not require a result date or a mismatch verdict.
 */
import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {App} from './App.tsx';
import {buildProfile, defaultDraft} from '../application/questionnaire.ts';
import {loadDraft, saveDraft} from '../application/draft.ts';
import {ACTIVE_CYCLE_KEY, QUESTIONNAIRE_DRAFT_KEY} from '../application/storage.ts';
import type {KeyValueStorage} from '../application/storage.ts';
import {addDays, deviceToday} from '../application/format.ts';

type User = ReturnType<typeof userEvent.setup>;

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {map: Map<string, string>} {
  const map = new Map(Object.entries(initial));
  return {map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key)};
}

const click = (user: User, name: string) => user.click(screen.getByRole('button', {name}));

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('a fresh draft', () => {
  test('leaves every material answer blank instead of guessing', () => {
    const draft = defaultDraft('2026-01-10');
    expect(draft.resultDate).toBe('');
    expect(draft.canRun3Km).toBeNull();
    expect(draft.actualRunsPerWeek).toBe('');
    expect(draft.averageWeeklyKm4Weeks).toBe('');
    expect(draft.longestUsualRunKm).toBe('');
    expect(draft.performanceMismatch).toBeNull();
  });

  test('keeps the harmless defaults that do not decide the load', () => {
    const draft = defaultDraft('2026-01-10');
    expect(draft.hasResult).toBe(true);
    expect(draft.resultSource).toBe('TEST_3K');
    expect(draft.availableRunsPerWeek).toBe('3');
    expect(draft.qualityRecall).toBe('UNKNOWN');
    expect(draft.raceDateConfirmed).toBe(false);
  });

  test('does not build until the blank answers are given', () => {
    const draft = {...defaultDraft('2026-01-10'), regularRunningWeeks: '8', resultTime: '15:20', targetTime: '14:30'};
    const built = buildProfile(draft);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    const fields = built.problems.map((problem) => `${problem.field}:${problem.kind}`);
    expect(fields).toContain('resultDate:EMPTY');
    expect(fields).toContain('canRun3Km:EMPTY');
    expect(fields).toContain('actualRunsPerWeek:EMPTY');
    expect(fields).toContain('averageWeeklyKm4Weeks:EMPTY');
    expect(fields).toContain('longestUsualRunKm:EMPTY');
    expect(fields).toContain('performanceMismatch:EMPTY');
  });

  test('builds once every material answer is explicit, even when it is "no"', () => {
    const draft = {
      ...defaultDraft('2026-01-10'),
      resultTime: '15:20',
      resultDate: '2025-12-20',
      regularRunningWeeks: '8',
      actualRunsPerWeek: '2',
      averageWeeklyKm4Weeks: '8',
      longestUsualRunKm: '4',
      canRun3Km: false,
      performanceMismatch: 'MODERATE' as const,
      targetTime: '14:30',
    };
    const built = buildProfile(draft);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.profile.canRun3Km).toBe(false);
    expect(built.profile.performanceMismatch).toBe('MODERATE');
  });

  test('the no-result path never asks for a result date and still builds', () => {
    const draft = {
      ...defaultDraft('2026-01-10'),
      hasResult: false,
      resultTime: '',
      regularRunningWeeks: '0',
      actualRunsPerWeek: '1',
      averageWeeklyKm4Weeks: '3',
      longestUsualRunKm: '2',
      canRun3Km: false,
      performanceMismatch: 'NONE' as const,
      targetTime: '14:30',
    };
    const built = buildProfile(draft);
    expect(built.ok).toBe(true);
  });
});

describe('a returning draft', () => {
  test('keeps the stored answers instead of resetting them to the new blanks', () => {
    const storage = memoryStorage();
    const stored = {
      ...defaultDraft('2026-01-01'),
      resultTime: '16:05',
      resultDate: '2025-12-15',
      actualRunsPerWeek: '4',
      averageWeeklyKm4Weeks: '25',
      longestUsualRunKm: '10',
      canRun3Km: true,
      performanceMismatch: 'CLEAR' as const,
    };
    saveDraft(storage, stored);
    const loaded = loadDraft(storage, '2026-01-10');
    expect(loaded.resultTime).toBe('16:05');
    expect(loaded.resultDate).toBe('2025-12-15');
    expect(loaded.actualRunsPerWeek).toBe('4');
    expect(loaded.canRun3Km).toBe(true);
    expect(loaded.performanceMismatch).toBe('CLEAR');
  });

  test('a draft written by an older build requires new material answers', () => {
    const storage = memoryStorage();
    storage.setItem(QUESTIONNAIRE_DRAFT_KEY, JSON.stringify({
      resultTime: '15:20', resultDate: '2025-12-20', regularRunningWeeks: '8',
      actualRunsPerWeek: '3', averageWeeklyKm4Weeks: '15', longestUsualRunKm: '5',
      canRun3Km: true, performanceMismatch: 'NONE', targetTime: '14:30',
      hasResult: true, resultSource: 'TEST_3K',
    }));
    const loaded = loadDraft(storage, '2026-01-10');
    expect(loaded.resultTime).toBe('15:20');
    expect(loaded.regularRunningWeeks).toBe('8');
    expect(loaded.resultDate).toBe('');
    expect(loaded.canRun3Km).toBeNull();
    expect(loaded.actualRunsPerWeek).toBe('');
    expect(loaded.averageWeeklyKm4Weeks).toBe('');
    expect(loaded.longestUsualRunKm).toBe('');
    expect(loaded.performanceMismatch).toBeNull();
    expect(buildProfile(loaded).ok).toBe(false);
  });
});

describe('the questionnaire screens', () => {
  test('a new user sees an empty result date and no preselected toggle', async () => {
    const user = userEvent.setup();
    render(<App storage={memoryStorage()} />);
    await click(user, 'Начать подготовку');

    expect(screen.getByLabelText('Дата результата')).toHaveValue('');
    expect(screen.getByText('Укажите дату, когда вы пробежали 3000 м с этим результатом.')).toBeVisible();
    await click(user, 'Продолжить');
    expect(screen.getByText('Выберите дату')).toHaveAttribute('role', 'alert');
    expect(window.location.pathname + window.location.search).toBe('/questionnaire?step=RESULT');

    fireEvent.change(screen.getByLabelText('Дата результата'), {target: {value: addDays(deviceToday(), -10)}});
    await user.type(screen.getByLabelText('Ваш результат'), '15:20');
    await click(user, 'Продолжить'); // VOLUME

    const yes = screen.getByRole('button', {name: 'Да'});
    const no = screen.getByRole('button', {name: 'Нет'});
    expect(yes).toHaveAttribute('aria-pressed', 'false');
    expect(no).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText(/Сколько раз в неделю вы обычно бегаете сейчас/)).toHaveValue('');
    expect(screen.getByLabelText(/Примерно сколько километров вы пробегаете за неделю/)).toHaveValue('');
    expect(screen.getByLabelText(/Сколько километров обычно составляет ваша самая длинная пробежка/)).toHaveValue('');
  });

  test('the volume step cannot be skipped with blank answers', async () => {
    const user = userEvent.setup();
    render(<App storage={memoryStorage()} />);
    await click(user, 'Начать подготовку');
    await user.type(screen.getByLabelText('Ваш результат'), '15:20');
    fireEvent.change(screen.getByLabelText('Дата результата'), {target: {value: addDays(deviceToday(), -10)}});
    await click(user, 'Продолжить'); // VOLUME

    await user.type(screen.getByLabelText(/Сколько недель подряд/), '8');
    await click(user, 'Продолжить');
    expect(window.location.search).toBe('?step=VOLUME');
    expect(screen.getByText('Выберите один из вариантов')).toHaveAttribute('role', 'alert');
    expect(screen.getAllByText('Заполните это поле').length).toBe(3);
  });

  test('the availability step asks for an explicit match verdict', async () => {
    const user = userEvent.setup();
    render(<App storage={memoryStorage()} />);
    await click(user, 'Начать подготовку');
    await user.type(screen.getByLabelText('Ваш результат'), '15:20');
    fireEvent.change(screen.getByLabelText('Дата результата'), {target: {value: addDays(deviceToday(), -10)}});
    await click(user, 'Продолжить'); // VOLUME
    await user.click(screen.getByRole('button', {name: 'Да'}));
    await user.type(screen.getByLabelText(/Сколько недель подряд/), '8');
    await user.type(screen.getByLabelText(/Сколько раз в неделю вы обычно бегаете сейчас/), '3');
    await user.type(screen.getByLabelText(/Примерно сколько километров вы пробегаете за неделю/), '15');
    await user.type(screen.getByLabelText(/Сколько километров обычно составляет ваша самая длинная пробежка/), '5');
    await click(user, 'Продолжить'); // QUALITY
    await click(user, 'Продолжить'); // SAFETY
    await click(user, 'Продолжить'); // BREAKS
    await click(user, 'Продолжить'); // AVAILABILITY

    await click(user, 'Продолжить');
    expect(window.location.search).toBe('?step=AVAILABILITY');
    expect(screen.getByText('Выберите один из вариантов')).toHaveAttribute('role', 'alert');

    await user.click(screen.getByRole('radio', {name: /Да, примерно соответствует/}));
    await click(user, 'Продолжить');
    expect(window.location.search).toBe('?step=GOAL');
  });

  test('a reload in the middle of the questionnaire keeps the answers already given', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = render(<App storage={storage} />);
    await click(user, 'Начать подготовку');
    await user.type(screen.getByLabelText('Ваш результат'), '15:20');
    fireEvent.change(screen.getByLabelText('Дата результата'), {target: {value: addDays(deviceToday(), -10)}});
    first.unmount();

    render(<App storage={storage} />);
    expect(screen.getByLabelText('Ваш результат')).toHaveValue('15:20');
    expect(screen.getByLabelText('Дата результата')).toHaveValue(addDays(deviceToday(), -10));
  });

  test('the no-result path walks to the goal without result fields', async () => {
    const user = userEvent.setup();
    render(<App storage={memoryStorage()} />);
    await click(user, 'Начать подготовку');
    await user.click(screen.getByRole('button', {name: 'Нет результата'}));
    await click(user, 'Продолжить'); // VOLUME
    await user.click(screen.getByRole('button', {name: 'Да'}));
    await user.type(screen.getByLabelText(/Сколько недель подряд/), '4');
    await user.type(screen.getByLabelText(/Сколько раз в неделю вы обычно бегаете сейчас/), '2');
    await user.type(screen.getByLabelText(/Примерно сколько километров вы пробегаете за неделю/), '8');
    await user.type(screen.getByLabelText(/Сколько километров обычно составляет ваша самая длинная пробежка/), '4');
    await click(user, 'Продолжить'); // QUALITY
    await click(user, 'Продолжить'); // SAFETY
    await click(user, 'Продолжить'); // BREAKS
    await click(user, 'Продолжить'); // AVAILABILITY — the mismatch question is not asked without a result
    expect(screen.queryByText(/примерно соответствует тому, как вы бегаете сейчас/)).not.toBeInTheDocument();
    await click(user, 'Продолжить'); // GOAL
    expect(window.location.search).toBe('?step=GOAL');
  });
});

describe('integrated questionnaire and review confirmation', () => {
  test.each([true,false])('explicit answers and a fresh review confirmation are both required (hasResult=%s)', async (hasResult) => {
    const user=userEvent.setup();
    const storage=memoryStorage();
    const today=deviceToday();
    const answered={...defaultDraft(today),hasResult,resultTime:hasResult?'15:20':'',
      resultDate:hasResult?addDays(today,-10):'',canRun3Km:hasResult,regularRunningWeeks:'8',
      actualRunsPerWeek:hasResult?'3':'1',averageWeeklyKm4Weeks:hasResult?'15':'3',
      longestUsualRunKm:hasResult?'5':'2',performanceMismatch:hasResult?'NONE' as const:null,targetTime:'14:30'};
    saveDraft(storage,answered);
    window.history.replaceState(null,'','/review');
    const ui=render(<App storage={storage}/>);
    const calculate=screen.getByRole('button',{name:'Рассчитать план'});
    expect(calculate).toBeDisabled();
    await user.click(calculate);
    expect(storage.getItem(ACTIVE_CYCLE_KEY)).toBeNull();
    await user.click(screen.getByRole('checkbox',{name:/Подтверждаю, что проверил исходные данные/}));
    expect(calculate).toBeEnabled();
    ui.unmount();
    render(<App storage={storage}/>);
    expect(screen.getByRole('checkbox',{name:/Подтверждаю, что проверил исходные данные/})).not.toBeChecked();
    expect(screen.getByRole('button',{name:'Рассчитать план'})).toBeDisabled();
    expect(loadDraft(storage,today)).toEqual(answered);
    await user.click(screen.getByRole('checkbox',{name:/Подтверждаю, что проверил исходные данные/}));
    await user.click(screen.getByRole('button',{name:'Рассчитать план'}));
    expect(screen.getByRole('heading',{name:'Ваша подготовка'})).toBeVisible();
    expect(storage.getItem(ACTIVE_CYCLE_KEY)).not.toBeNull();
  });

  test('the final review checkbox cannot certify unconfirmed legacy baseline fields', async () => {
    const user=userEvent.setup();
    const today=deviceToday();
    const legacy={...defaultDraft(today),resultTime:'15:20',resultDate:today,canRun3Km:true,
      regularRunningWeeks:'8',actualRunsPerWeek:'3',averageWeeklyKm4Weeks:'15',longestUsualRunKm:'5',
      performanceMismatch:'NONE',targetTime:'14:30'};
    const storage=memoryStorage({[QUESTIONNAIRE_DRAFT_KEY]:JSON.stringify(legacy)});
    window.history.replaceState(null,'','/review');
    render(<App storage={storage}/>);
    await user.click(screen.getByRole('checkbox',{name:/Подтверждаю, что проверил исходные данные/}));
    await user.click(screen.getByRole('button',{name:'Рассчитать план'}));
    expect(window.location.search).toBe('?step=RESULT');
    expect(screen.getByLabelText('Дата результата')).toHaveValue('');
    expect(storage.getItem(ACTIVE_CYCLE_KEY)).toBeNull();
  });
});
