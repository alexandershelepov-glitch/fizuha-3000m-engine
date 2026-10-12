/**
 * The questionnaire has to be answerable by someone who has never read about running training.
 * These tests check what that person actually sees: plain questions, an explanation of what a fast
 * session is, and an explanation under every term the question still uses.
 */
import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {App} from './App.tsx';
import type {KeyValueStorage} from '../application/storage.ts';
import {WorkoutDetails} from '../ui/screens/WorkoutDetails.tsx';
import type {Workout} from '../application/engineGateway.ts';

type User = ReturnType<typeof userEvent.setup>;

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const map = new Map(Object.entries(initial));
  return {getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key)};
}

const click = (user: User, name: string) => user.click(screen.getByRole('button', {name}));

/** Walk to a questionnaire step through the real navigation, filling the steps in between. */
async function reachStep(user: User, step: 'VOLUME' | 'QUALITY' | 'AVAILABILITY'): Promise<void> {
  render(<App storage={memoryStorage()} />);
  await click(user, 'Начать подготовку');            // → RESULT
  await user.type(screen.getByLabelText('Ваш результат'), '15:20');
  await click(user, 'Продолжить');                   // → VOLUME
  if (step === 'VOLUME') return;
  await user.type(screen.getByLabelText(/Сколько недель подряд/), '52');
  await user.type(screen.getByLabelText(/Сколько раз в неделю вы обычно бегаете сейчас/), '4');
  await user.type(screen.getByLabelText(/Примерно сколько километров вы пробегаете за неделю/), '30');
  await user.type(screen.getByLabelText(/Сколько километров обычно составляет ваша самая длинная пробежка/), '10');
  await click(user, 'Продолжить');                   // → QUALITY
  if (step === 'QUALITY') return;
  await user.click(screen.getByRole('radio', {name: 'Знаю точное количество'}));
  await user.type(screen.getByLabelText(/Сколько таких быстрых тренировок/), '4');
  await user.type(screen.getByLabelText(/В скольких из последних 8 недель/), '2');
  await click(user, 'Продолжить');                   // → SAFETY
  await click(user, 'Продолжить');                   // → BREAKS
  await click(user, 'Продолжить');                   // → AVAILABILITY
}

beforeEach(() => {
  // Each test starts from a clean address: the questionnaire steps live in the URL.
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('the volume step', () => {
  test('asks about an ordinary week instead of a training term', async () => {
    await reachStep(userEvent.setup(), 'VOLUME');

    expect(screen.getByText('Сколько вы бегаете сейчас')).toBeInTheDocument();
    expect(screen.getByText('Сколько недель подряд вы бегаете хотя бы один раз в неделю?')).toBeInTheDocument();
    expect(screen.getByText(/Ответ в неделях/)).toBeInTheDocument();
    expect(screen.getByText('Сколько раз в неделю вы обычно бегаете сейчас?')).toBeInTheDocument();
    expect(screen.getByText('Укажите обычную неделю за последний месяц, а не максимальное количество тренировок.')).toBeInTheDocument();
    expect(screen.getByText('Примерно сколько километров вы пробегаете за неделю?')).toBeInTheDocument();
    expect(screen.getByText('Возьмите обычную неделю за последний месяц. Точная цифра не обязательна.')).toBeInTheDocument();
    expect(screen.getByText('Сколько километров обычно составляет ваша самая длинная пробежка?')).toBeInTheDocument();

    // The old wording must be gone.
    expect(screen.queryByText(/Сколько недель вы регулярно бегаете/)).not.toBeInTheDocument();
    expect(screen.queryByText(/средний недельный объём/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Сколько пробежек в неделю обычно/)).not.toBeInTheDocument();
  });
});

describe('the fast-training step', () => {
  test('defines what counts as a fast session before asking about it', async () => {
    const user = userEvent.setup();
    await reachStep(user, 'QUALITY');

    expect(screen.getByText('Быстрые тренировки')).toBeInTheDocument();
    expect(screen.getByText('Нам важно понять, выполняли ли вы специальные быстрые тренировки, а не просто обычные пробежки.')).toBeInTheDocument();

    // The definition, in the person's own terms.
    expect(screen.getByText('Что считать быстрой тренировкой?')).toBeInTheDocument();
    expect(screen.getByText('Это тренировка, где вы специально бежали быстрее своего обычного спокойного бега:')).toBeInTheDocument();
    for (const item of ['быстрые отрезки с отдыхом;', 'интервалы;', 'непрерывный быстрый бег;', 'отрезки примерно в темпе забега на 3000 м.']) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(screen.getByText('Обычная пробежка сюда не относится, даже если она далась тяжело.')).toBeInTheDocument();

    // And the questions themselves are written in the same words.
    expect(screen.getByText('За последние два месяца вы специально тренировались бегать быстрее обычного?')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', {name: 'Знаю точное количество'}));
    expect(screen.getByText('Если специально быстрых тренировок не было — укажите 0.')).toBeInTheDocument();
    expect(screen.getByText('В скольких из последних 8 недель была хотя бы одна такая тренировка?')).toBeInTheDocument();
    expect(screen.getByText('Например, если вы сделали 4 быстрые тренировки, но все они были в двух неделях — укажите 2.')).toBeInTheDocument();
    expect(screen.getByText('Обычно вам удавалось выполнить такие тренировки полностью?')).toBeInTheDocument();
    expect(screen.getByText(/Ответьте «Да», если в большинстве случаев удавалось закончить запланированную работу/)).toBeInTheDocument();

    // No term is left unexplained.
    expect(screen.queryByText('Опыт качественных тренировок')).not.toBeInTheDocument();
    expect(screen.queryByText('Качественных тренировок за 8 недель')).not.toBeInTheDocument();
    expect(screen.queryByText('В скольких разных неделях')).not.toBeInTheDocument();
    expect(screen.queryByText('Переносились ли они нормально')).not.toBeInTheDocument();
  });

  test('describes each kind of fast training next to its checkbox', async () => {
    await reachStep(userEvent.setup(), 'QUALITY');

    expect(screen.getByText('Что из этого вы выполняли раньше?')).toBeInTheDocument();
    for (const [label, hint] of [
      ['Темповый бег', 'Несколько минут подряд заметно быстрее обычной пробежки.'],
      ['Интервалы', 'Несколько быстрых отрезков с отдыхом между ними.'],
      ['Отрезки в темпе 3000 м', 'Повторные отрезки примерно в темпе вашего забега на 3 км.'],
    ] as const) {
      // The checkbox is labelled with its term and described with what the term means.
      expect(screen.getByLabelText(new RegExp(label))).toBeInTheDocument();
      expect(screen.getByText(hint)).toBeInTheDocument();
    }

    // The bare terms from before are gone.
    expect(screen.queryByText('Темповые тренировки')).not.toBeInTheDocument();
    expect(screen.queryByText('Отрезки в соревновательном темпе')).not.toBeInTheDocument();
  });
});

describe('the availability step', () => {
  test('asks whether the last result still matches, in practical words', async () => {
    await reachStep(userEvent.setup(), 'AVAILABILITY');

    expect(screen.getByText('Последний результат на 3000 м примерно соответствует тому, как вы бегаете сейчас?')).toBeInTheDocument();
    expect(screen.getByRole('radio', {name: /Да, примерно соответствует/})).toBeInTheDocument();
    expect(screen.getByRole('radio', {name: /Сейчас я, скорее всего, немного быстрее или медленнее/})).toBeInTheDocument();
    expect(screen.getByRole('radio', {name: /Сейчас моя форма заметно отличается/})).toBeInTheDocument();

    expect(screen.queryByText(/Насколько тренировки согласуются с последним результатом/)).not.toBeInTheDocument();
    expect(screen.queryByText(/умеренное расхождение/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/явное расхождение/i)).not.toBeInTheDocument();
  });
});

/** The value row a technical label belongs to. */
function rowOf(label: string): HTMLElement {
  const row = screen.getByText(label).closest('.kv');
  if (row === null) throw new Error(`no value row for ${label}`);
  return row as HTMLElement;
}

describe('the workout card and the technical block', () => {
  /** A real prescription shape: four repeats of 600 m with a shortened last one. */
  const shortenedFinal: Workout = {
    id: 'slot-test', scheduledDate: '2026-10-08', type: 'SPECIFIC_3K', goal: 'QUALITY_ADAPTATION', priority: 1,
    countsAsQuality: true, warmupMinutes: 10, cooldownMinutes: 10,
    main: {mode: 'INTERVALS', dose: {unit: 'METERS', value: 2200}, repeats: 4, repeatMeters: 600, finalRepeatMeters: 400},
    targetRpe: [8, 9], effortCues: [], speedRangeMps: null, paceRangeSecondsPerKm: [240, 250],
    anchor: 'CURRENT', gateAtPrescription: 'OPEN', restSeconds: 90, minimumRecoveryHoursBeforeQuality: 48,
    requiredFeedback: ['completionFraction', 'sessionRpe', 'safety', 'durationMinutes', 'distanceMeters', 'repeats', 'restSeconds', 'conditions', 'unexpectedFatigue'],
    removable: true, movable: true, volumeFactor: 1,
  };

  test('show one and the same repeat structure', () => {
    render(
      <WorkoutDetails
        workout={shortenedFinal}
        resultAvailability="AVAILABLE"
        moveAvailability="AVAILABLE"
        onBack={() => undefined}
        onEnterResult={() => undefined}
        onMove={() => undefined}
        skip={() => ({ok: true})}
      />,
    );

    // The main block and the technical row read the structure the same way: three 600 m and one 400 m.
    const headline = screen.getByText(/^Сегодня: /).textContent!;
    const rowValue = within(rowOf('Отрезки')).getByText(/×/).textContent!;

    expect(headline).toBe('Сегодня: 3 × 600 м + 1 × 400 м');
    // Byte for byte the same structure in both places — the point of the shared helper.
    expect(headline).toBe(`Сегодня: ${rowValue}`);
    expect(rowValue).toBe('3 × 600 м + 1 × 400 м');
    expect(within(rowOf('Объём')).getByText('2200 м')).toBeInTheDocument();

    // The wrong reading of the structure must not appear anywhere.
    expect(screen.queryByText('4 × 600 м')).not.toBeInTheDocument();
    expect(screen.queryByText(/4 × 600 м \+ 1 × 400 м/)).not.toBeInTheDocument();
  });
});
