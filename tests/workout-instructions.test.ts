/**
 * Presentation tests for the workout card.
 *
 * Every workout below is built by the engine's own `prescribe`, so the shapes are real and the card is
 * checked against what the engine actually prescribes. Nothing here re-checks training logic: the card
 * only translates the prescription into a sequence a person can follow.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prescribe} from '../src/index.ts';
import type {Workout, WorkoutType} from '../src/index.ts';
import {appCycle} from './helpers-app.ts';
import {compactDuration, effortFor, estimatedTimeRepeatDistance, intervalStructure, prescribedPace, repeatStructure, splitSeconds, treadmillSpeedText, workoutInstruction, workoutIntervals, workoutRepeats} from '../web/src/ui/workoutInstructions.ts';
import {workoutIntervalsText, workoutMainDose, workoutSummaryText, workoutVolume} from '../web/src/ui/display.ts';
import {formatDateShort} from '../web/src/application/format.ts';
import {workoutTypeText} from '../web/src/ui/copy/values.ts';

const volumeCycle = () => appCycle({availableRunsPerWeek: 5, regularRunningWeeks: 60, actualRunsPerWeek: 5, averageWeeklyKm4Weeks: 40, longestUsualRunKm: 12});
const qualityCycle = () => appCycle({availableRunsPerWeek: 4, regularRunningWeeks: 80, actualRunsPerWeek: 5, averageWeeklyKm4Weeks: 45, longestUsualRunKm: 14, qualitySessions8Weeks: 8, qualityWeeks8Weeks: 6, qualityMostlyTolerated: true, experience: {threshold: true, vo2: true, specific3k: true}});
const walkCycle = () => appCycle({canRun3Km: false, availableRunsPerWeek: 3, actualRunsPerWeek: 0, averageWeeklyKm4Weeks: 0, regularRunningWeeks: 0});

/** A real workout from the engine, with its interval structure replaced by the given shape. */
function prescribedInterval(shape: {repeats: number; repeatMeters: number | null; finalRepeatMeters: number | null; dose: {unit: 'METERS' | 'MINUTES'; value: number}}): Workout {
  const fixture = qualityCycle();
  const base = prescribe(fixture.engineState, 'SPECIFIC_3K', fixture.engineState.asOf, 'test-interval');
  return {...base, main: {...base.main, ...shape}};
}

/** The volume a plan-change line prints for this workout. */
function planSummaryVolume(workout: Workout): string {
  const line = workoutSummaryText({
    type: workout.type, date: workout.scheduledDate, mode: workout.main.mode,
    doseValue: workout.main.dose.value, doseUnit: workout.main.dose.unit,
    repeats: workout.main.repeats, repeatMeters: workout.main.repeatMeters, finalRepeatMeters: workout.main.finalRepeatMeters,
  });
  return line.split(' · ')[1]!;
}

function shortTimeOf(seconds: number): string {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function ordered(type: WorkoutType): Workout {
  const fixture = type === 'EASY' || type === 'LONG_EASY' || type === 'STRIDES' || type === 'REST' ? volumeCycle() : qualityCycle();
  return prescribe(fixture.engineState, type, fixture.engineState.asOf, `test-${type}`);
}

test('INSTR-01 the split of a repeat is pace times distance, rounded to whole seconds', () => {
  // The example from the brief: 240–250 s/km over 400 m is 96–100 s, that is 1:36–1:40.
  assert.deepEqual(splitSeconds([240, 250], 400), [96, 100]);
  assert.deepEqual(splitSeconds([294, 303], 600), [176, 182]);
  assert.deepEqual(splitSeconds([326, 341], 1000), [326, 341]);
  assert.deepEqual(splitSeconds([298, 316], 200), [60, 63]);
});

test('INSTR-02 an easy run keeps the engine distance and never invents a pace', () => {
  const workout = ordered('EASY');
  const plan = workoutInstruction(workout);

  assert.equal(workout.paceRangeSecondsPerKm, null, 'the fixture must have no prescribed pace');
  assert.equal(plan.paceText, null, 'no pace may appear when the engine prescribed none');
  assert.equal(plan.splits.length, 0);
  assert.match(plan.headline, /^Сегодня: спокойный бег /);
  assert.ok(plan.steps[0]!.includes('удобном спокойном темпе'), plan.steps[0]);
  assert.ok(plan.guidance.length > 0, 'the feeling takes the place of a pace');
  assert.ok(plan.steps.some((step) => step.includes('замедлись')));
  // The engine prescribed no warm-up or cool-down for an easy run, so the card must not add one.
  assert.equal(plan.steps.some((step) => step.startsWith('Разминка')), false);
  assert.equal(plan.steps.some((step) => step.startsWith('Заминка')), false);
});

test('INSTR-03 a long easy run is described the same way, with its own distance', () => {
  const workout = ordered('LONG_EASY');
  const plan = workoutInstruction(workout);
  assert.equal(plan.paceText, null);
  assert.match(plan.headline, /^Сегодня: длинный спокойный бег /);
  assert.ok(plan.headline.includes(String(Math.round(workout.main.dose.value) / 1000)), plan.headline);
});

test('INSTR-04 continuous work with a pace states the pace as the engine ordered it', () => {
  const workout = ordered('THRESHOLD');
  const plan = workoutInstruction(workout);
  const pace = prescribedPace(workout)!;

  assert.ok(workout.paceRangeSecondsPerKm !== null, 'a threshold session must carry a pace');
  assert.equal(plan.paceText, `${Math.floor(pace[0] / 60)}:${String(Math.round(pace[0]) % 60).padStart(2, '0')}–${Math.floor(pace[1] / 60)}:${String(Math.round(pace[1]) % 60).padStart(2, '0')} мин/км`);
  assert.ok(plan.steps.some((step) => step.includes('в темпе')), plan.steps.join(' | '));
  assert.ok(plan.steps.some((step) => step.includes('Не начинай быстрее заданного темпа')));
  assert.ok(plan.steps[0]!.startsWith('Разминка'), 'the warm-up is part of the instruction');
  assert.ok(plan.steps.at(-1)!.startsWith('Заминка'), 'the cool-down is part of the instruction');
});

test('INSTR-05 intervals of 400 m show the time of one repeat', () => {
  const fixture = volumeCycle();
  // A 400 m repeat block with the engine's own pace attached to it.
  const base = prescribe(fixture.engineState, 'SPECIFIC_3K', fixture.engineState.asOf, 'test-400');
  const workout: Workout = {...base, main: {...base.main, repeats: 6, repeatMeters: 400, finalRepeatMeters: 400}, paceRangeSecondsPerKm: [240, 250], speedRangeMps: [1000 / 250, 1000 / 240]};
  const plan = workoutInstruction(workout);

  assert.equal(plan.headline, 'Сегодня: 6 × 400 м');
  assert.deepEqual(plan.splits.map((split) => split.text), ['400 метров примерно за 1:36–1:40']);
  assert.ok(plan.steps.some((step) => step.includes('Каждый отрезок старайся пробежать за 1:36–1:40')), plan.steps.join(' | '));
  assert.ok(plan.steps.some((step) => step.includes('Между отрезками отдыхай 1 минуту 30 секунд')));
  assert.ok(plan.steps.some((step) => step.includes('После последнего отрезка отдых не нужен.')));
  assert.ok(plan.paceText!.endsWith('/км'), 'the pace stays available below');
});

test('INSTR-06 a 1000 m repeat is converted with the same rule', () => {
  const fixture = volumeCycle();
  const base = prescribe(fixture.engineState, 'SPECIFIC_3K', fixture.engineState.asOf, 'test-1000');
  const workout: Workout = {...base, main: {...base.main, repeats: 3, repeatMeters: 1000, finalRepeatMeters: 1000}, paceRangeSecondsPerKm: [240, 250], speedRangeMps: null};
  const plan = workoutInstruction(workout);

  assert.equal(plan.headline, 'Сегодня: 3 × 1000 м');
  assert.deepEqual(plan.splits.map((split) => split.text), ['1000 метров примерно за 4:00–4:10']);
  assert.ok(plan.steps.some((step) => step.includes('4:00–4:10')));
});

test('INSTR-07 a shorter final repeat is the last of them, not an extra one', () => {
  const fixture = volumeCycle();
  const base = prescribe(fixture.engineState, 'SPECIFIC_3K', fixture.engineState.asOf, 'test-mixed');
  // repeats = 6 means six repeats in total: five of 400 m and one final of 200 m = 2200 m.
  const workout: Workout = {...base, main: {...base.main, repeats: 6, repeatMeters: 400, finalRepeatMeters: 200}, paceRangeSecondsPerKm: [240, 250], speedRangeMps: null};
  const plan = workoutInstruction(workout);

  assert.equal(plan.headline, 'Сегодня: 5 × 400 м + 1 × 200 м');
  assert.equal(repeatStructure({repeats: 6, repeatMeters: 400, finalRepeatMeters: 200})!.volumeMeters, 2200);
  assert.deepEqual(plan.splits.map((split) => split.text), ['400 метров примерно за 1:36–1:40', '200 метров примерно за 0:48–0:50']);
  assert.ok(plan.steps.some((step) => step === 'Выполни 6 отрезков: первые 5 — по 400 метров, последний — 200 метров.'), plan.steps.join(' | '));
  assert.ok(plan.steps.some((step) => step === '400 метров — за 1:36–1:40.'));
  assert.ok(plan.steps.some((step) => step === 'Последний 200 метров — за 0:48–0:50.'));
  assert.equal(plan.steps.join(' ').includes('7 отрезков'), false);
});

test('INSTR-08 a special 3000 m session keeps the engine pace and its own repeat length', () => {
  const workout = ordered('SPECIFIC_3K');
  const plan = workoutInstruction(workout);
  const pace = prescribedPace(workout)!;

  assert.equal(workout.main.repeatMeters, 600);
  assert.equal(plan.splits.length, 1);
  assert.deepEqual(plan.splits[0]!.seconds, splitSeconds(pace, 600));
  assert.ok(plan.headline.includes('600 м'), plan.headline);
});

test('INSTR-09 the control run names the real distance and states that no pace is set', () => {
  const workout = ordered('CONTROL');
  const plan = workoutInstruction(workout);

  assert.equal(workout.paceRangeSecondsPerKm, null);
  assert.equal(plan.headline, 'Сегодня: контрольный забег 3000 метров');
  assert.ok(plan.steps.some((step) => step === 'Пробеги 3000 метров на результат.'));
  assert.ok(plan.steps.some((step) => step === 'Конкретный темп не задан.'));
  assert.ok(plan.steps.some((step) => step === 'Ориентир по усилию указан ниже.'));
  assert.equal(plan.paceText, null);
  // The control run is never turned into an all-out effort: the engine prescribed 8–9 of 10.
  assert.deepEqual(workout.targetRpe, [8, 9]);
  assert.equal(/в полную силу|максимальн/i.test(plan.steps.join(' ')), false);
});

test('INSTR-10 run and walk is explained in words, without inventing a pattern', () => {
  const fixture = walkCycle();
  const workout = prescribe(fixture.engineState, 'EASY', fixture.engineState.asOf, 'test-walk');
  assert.equal(workout.main.mode, 'RUN_WALK', 'the fixture must be a run-and-walk session');
  const plan = workoutInstruction(workout);

  assert.ok(plan.headline.startsWith('Сегодня: спокойный бег'));
  assert.equal(plan.steps[0], 'Эта тренировка выполняется с чередованием бега и ходьбы.');
  assert.ok(plan.steps.some((step) => step.startsWith('Общий объём — ')));
  assert.ok(plan.steps.some((step) => step === 'Точная длительность беговых и шаговых отрезков в плане не задана.'));
  // Nothing about the pattern may be invented: no switching rule, no walking or running minutes.
  const text = plan.steps.join(' ');
  assert.equal(/\d+\s*(раз|цикл)/.test(text), false, text);
  assert.equal(/пока дыхание|восстановления дыхания|пульс/i.test(text), false, text);
  assert.equal(/минут[уы]?\s+бега|минут[уы]?\s+ходьбы/i.test(text), false, text);
});

test('INSTR-11 strides are described by technique, not by a target time', () => {
  const workout = ordered('STRIDES');
  const plan = workoutInstruction(workout);

  assert.equal(workout.main.repeatMeters, 100);
  assert.equal(workout.paceRangeSecondsPerKm, null);
  assert.equal(plan.splits.length, 0, 'no pace means no split time');
  assert.equal(plan.note, 'Ускорения не должны быть тяжёлыми: это работа над техникой, а не на результат.');
  assert.ok(plan.steps.some((step) => step.includes('Отдых между отрезками')));
});

test('INSTR-12 no warm-up and no cool-down mean no such steps', () => {
  const workout = ordered('EASY');
  assert.equal(workout.warmupMinutes, 0);
  assert.equal(workout.cooldownMinutes, 0);
  const plan = workoutInstruction(workout);
  assert.equal(plan.steps.some((step) => /Разминка|Заминка/.test(step)), false);
});

test('INSTR-13 a prescribed warm-up and cool-down are part of the sequence', () => {
  const workout = ordered('VO2');
  const plan = workoutInstruction(workout);
  assert.ok(workout.warmupMinutes > 0 && workout.cooldownMinutes > 0, 'a quality session carries both');
  assert.equal(plan.steps[0], `Разминка — ${workout.warmupMinutes} минут в лёгком режиме.`);
  assert.equal(plan.steps.at(-1), `После последнего отрезка — ${workout.cooldownMinutes} минут в лёгком режиме.`);

  const continuous = workoutInstruction(ordered('THRESHOLD'));
  assert.equal(continuous.steps.at(-1), `Заминка — ${ordered('THRESHOLD').cooldownMinutes} минут в лёгком режиме.`);
});

test('INSTR-14 intervals with a pace but no distance state the pace instead of inventing a split', () => {
  const workout = ordered('VO2');
  assert.equal(workout.main.repeatMeters, null, 'the engine prescribes a duration here, not a distance');
  assert.ok(workout.paceRangeSecondsPerKm !== null);
  const plan = workoutInstruction(workout);

  assert.equal(plan.splits.length, 0, 'a distance the engine did not give is never invented');
  assert.ok(plan.steps.some((step) => step.startsWith('Целевой темп:')), plan.steps.join(' | '));
  assert.match(plan.headline, /^Сегодня: \d+ × \d+ (с|мин)/);
});

test('INSTR-15 intervals without a pace state only what the engine ordered', () => {
  const fixture = appCycle({availableRunsPerWeek: 3});
  const workout = prescribe(fixture.engineState, 'INTRO_QUALITY', fixture.engineState.asOf, 'test-intro');
  assert.equal(workout.paceRangeSecondsPerKm, null);
  const plan = workoutInstruction(workout);

  assert.equal(plan.splits.length, 0);
  assert.equal(plan.paceText, null);
  assert.ok(plan.steps.some((step) => step.startsWith('Выполни 4 отрезка. Каждый отрезок длится')));
  assert.ok(plan.steps.some((step) => step.includes('Отдых между отрезками')));
});

test('INSTR-16 a rest day is not dressed up as training', () => {
  const workout = ordered('REST');
  const plan = workoutInstruction(workout);
  assert.equal(workout.main.mode, 'REST');
  assert.equal(plan.headline, 'Сегодня: отдых');
  assert.deepEqual(plan.steps, ['Сегодня отдых: тренировка не назначается.']);
  assert.equal(plan.paceText, null);
  assert.equal(plan.guidance.length, 0);
});

test('INSTR-17 the feeling comes from the existing effort scale and keeps the number beside it', () => {
  const workout = ordered('THRESHOLD');
  const plan = workoutInstruction(workout);
  assert.deepEqual(workout.targetRpe, [6, 7]);
  assert.equal(plan.effort, 'тяжело, но контролируемо');
  assert.equal(plan.effortScale, 'Усилие: 6–7 из 10');

  // Every prescription the engine can make resolves to a word that already exists in the scale.
  for (const rpe of [[0, 0], [2, 3], [5, 6], [6, 7], [8, 9]] as const) {
    const label = effortFor({...workout, targetRpe: [rpe[0], rpe[1]]});
    assert.ok(label.length > 0, `${rpe.join('-')} must resolve to a word`);
    assert.equal(/\d/.test(label), false, `${rpe.join('-')} must be words, not a number`);
  }
});

test('INSTR-18 the instruction is derived every time and never stored', () => {
  const workout = ordered('THRESHOLD');
  const first = workoutInstruction(workout);
  const second = workoutInstruction(workout);
  assert.deepEqual(first, second, 'the same prescription always reads the same');
  // Changing the prescription changes the card: nothing is cached in the workout or in the app state.
  const changed: Workout = {...workout, main: {...workout.main, dose: {...workout.main.dose, value: workout.main.dose.value + 5}}};
  assert.notEqual(workoutInstruction(changed).headline, first.headline);
  assert.equal(Object.prototype.hasOwnProperty.call(workout, 'instruction'), false);
});

// ---------------------------------------------------------------- the repeat structure itself
// The engine writes repeats as the total count and finalRepeatMeters as the length of the last one,
// so these shapes mean exactly what the engine means by them.
test('INSTR-19 a shortened final repeat is rendered as the last of the prescribed repeats', () => {
  assert.deepEqual(repeatStructure({repeats: 4, repeatMeters: 600, finalRepeatMeters: 400}), {
    totalRepeats: 4, standardMeters: 600, finalMeters: 400, uniform: false, label: '3 × 600 м + 1 × 400 м', volumeMeters: 2200,
  });
});

test('INSTR-20 an equal final repeat is just a uniform block', () => {
  assert.deepEqual(repeatStructure({repeats: 4, repeatMeters: 600, finalRepeatMeters: 600}), {
    totalRepeats: 4, standardMeters: 600, finalMeters: 600, uniform: true, label: '4 × 600 м', volumeMeters: 2400,
  });
  // A missing final length means every repeat has the standard one.
  assert.equal(repeatStructure({repeats: 4, repeatMeters: 600, finalRepeatMeters: null})!.label, '4 × 600 м');
});

test('INSTR-21 a single repeat carries only its own actual length', () => {
  const structure = repeatStructure({repeats: 1, repeatMeters: 600, finalRepeatMeters: 480})!;
  assert.equal(structure.label, '1 × 480 м');
  assert.equal(structure.volumeMeters, 480);
  assert.equal(/\+/.test(structure.label), false, 'a single repeat is never written as a sum');

  const workout = ordered('SPECIFIC_3K');
  const single: Workout = {...workout, main: {...workout.main, repeats: 1, repeatMeters: 600, finalRepeatMeters: 480}};
  const plan = workoutInstruction(single);
  assert.equal(plan.headline, 'Сегодня: 1 × 480 м');
  assert.ok(plan.steps.some((step) => step === 'Пробеги 480 метров.'), plan.steps.join(' | '));
  assert.equal(/600/.test(plan.steps.join(' ')), false, 'the standard length is not prescribed alongside it');
});

test('INSTR-22 a real engine prescription that is not a multiple of the repeat length', () => {
  // Progression multiplies the dose, so the last repeat really can end up shorter than the others.
  const fixture = qualityCycle();
  const workout = prescribe(fixture.engineState, 'SPECIFIC_3K', fixture.engineState.asOf, 'test-progressed', 1.05);
  const {repeats, repeatMeters, finalRepeatMeters, dose} = workout.main;
  assert.equal(repeatMeters, 600);
  assert.equal(repeats, 6, 'the total count comes from the engine');
  assert.equal(finalRepeatMeters, 150);
  assert.equal(dose.value, 3150);

  const structure = workoutRepeats(workout)!;
  assert.equal(structure.label, '5 × 600 м + 1 × 150 м');
  assert.equal(structure.volumeMeters, dose.value, 'the structure adds up to the prescribed dose');
  assert.equal(structure.totalRepeats, repeats);

  const plan = workoutInstruction(workout);
  assert.equal(plan.headline, 'Сегодня: 5 × 600 м + 1 × 150 м');
  assert.ok(plan.steps.some((step) => step === 'Выполни 6 отрезков: первые 5 — по 600 метров, последний — 150 метров.'));
  assert.equal(plan.splits.length, 2);
});

test('INSTR-23 the instruction and the technical block read one and the same structure', () => {
  const fixture = volumeCycle();
  for (const shape of [
    {repeats: 4, repeatMeters: 600, finalRepeatMeters: 400},
    {repeats: 4, repeatMeters: 600, finalRepeatMeters: 600},
    {repeats: 1, repeatMeters: 600, finalRepeatMeters: 480},
    {repeats: 6, repeatMeters: 400, finalRepeatMeters: 200},
  ]) {
    const base = prescribe(fixture.engineState, 'SPECIFIC_3K', fixture.engineState.asOf, 'test-shape');
    const workout: Workout = {...base, main: {...base.main, ...shape}};
    const structure = workoutRepeats(workout)!;
    // The headline, the volume shown on the cards and the plan summary all show the same label.
    assert.equal(workoutInstruction(workout).headline, `Сегодня: ${structure.label}`);
    assert.equal(workoutVolume(workout), structure.label);
    assert.equal(workoutSummaryText({
      type: workout.type, date: workout.scheduledDate, mode: workout.main.mode,
      doseValue: workout.main.dose.value, doseUnit: workout.main.dose.unit,
      repeats: shape.repeats, repeatMeters: shape.repeatMeters, finalRepeatMeters: shape.finalRepeatMeters,
    }), `${workoutTypeText[workout.type].label} · ${structure.label} · ${formatDateShort(workout.scheduledDate)}`);
  }
});

// ---------------------------------------------------------------- nothing beyond the prescription
test('INSTR-24 the rest is a duration, and the way of resting stays the plan own business', () => {
  const workout = ordered('VO2');
  assert.ok(workout.restSeconds > 0, 'the fixture must prescribe a rest');
  const plan = workoutInstruction(workout);

  assert.ok(plan.steps.some((step) => step === 'Между отрезками отдыхай 1 минуту 30 секунд. После последнего отрезка отдых не нужен.'));
  assert.ok(plan.steps.some((step) => step.includes('После последнего отрезка отдых не нужен.')));
  // The engine does not say how to rest, so the card must not say it either.
  const text = plan.steps.join(' ');
  assert.equal(/можно идти|очень медленно бежать|переходи на шаг|ходьба между/i.test(text), false, text);
});

test('INSTR-25 a continuous run is never turned into run and walk', () => {
  const workout = ordered('EASY');
  assert.equal(workout.main.mode, 'CONTINUOUS');
  const plan = workoutInstruction(workout);

  const text = plan.steps.join(' ');
  assert.equal(/перейти на шаг|переходи на шаг|ходьб/i.test(text), false, text);
  assert.ok(plan.steps.some((step) => step.includes('Если становится тяжело поддерживать такой режим — замедлись.')));
  assert.deepEqual(plan.guidance, ['Можно говорить полными фразами', 'Дыхание контролируемое']);
});

test('INSTR-26 words that would change the prescription never appear', () => {
  const banned = [/в полную силу/i, /максимальн/i, /изо всех сил/i];
  for (const type of ['EASY', 'LONG_EASY', 'THRESHOLD', 'VO2', 'SPECIFIC_3K', 'CONTROL', 'STRIDES'] as const) {
    const plan = workoutInstruction(ordered(type));
    const text = [plan.headline, plan.effort, plan.effortScale, plan.note ?? '', ...plan.steps, ...plan.guidance].join(' ');
    for (const word of banned) assert.equal(word.test(text), false, `${type}: ${word}`);
  }
});

// ---------------------------------------------------------------- one format in every place
test('INSTR-27 a distance interval reads the same in the instruction, the rows and the plans', () => {
  const workout = prescribedInterval({repeats: 4, repeatMeters: 600, finalRepeatMeters: 400, dose: {unit: 'METERS', value: 2200}});
  const structure = workoutRepeats(workout)!;

  assert.equal(structure.label, '3 × 600 м + 1 × 400 м');
  assert.equal(structure.volumeMeters, 2200);
  assert.equal(workoutInstruction(workout).headline, 'Сегодня: 3 × 600 м + 1 × 400 м');
  // Today, the move screen and the plan-change lines all read the same helper.
  assert.equal(workoutVolume(workout), structure.label);
  assert.equal(workoutIntervalsText(workout), structure.label);
  assert.equal(planSummaryVolume(workout), structure.label);
});

test('INSTR-28 a time interval is split by its own repeat count, never multiplied', () => {
  // 8 minutes of main work in four repeats is four repeats of two minutes, not 4 × 8 minutes.
  const eight = prescribedInterval({repeats: 4, repeatMeters: null, finalRepeatMeters: null, dose: {unit: 'MINUTES', value: 8}});
  assert.equal(workoutInstruction(eight).headline, 'Сегодня: 4 × 2 мин');
  assert.equal(workoutVolume(eight), '4 × 2 мин');
  assert.equal(workoutIntervalsText(eight), '4 × 2 мин');
  assert.equal(planSummaryVolume(eight), '4 × 2 мин');
  assert.equal(workoutIntervals(eight)!.perRepeatSeconds, 120);

  // The total work is never multiplied by the number of repeats anywhere.
  for (const text of [workoutInstruction(eight).headline, workoutVolume(eight), workoutIntervalsText(eight)!, planSummaryVolume(eight)]) {
    assert.equal(/8\s*мин|4 × 8/.test(text), false, text);
  }
  assert.ok(workoutInstruction(eight).steps.some((step) => step === 'Выполни 4 отрезка. Каждый отрезок длится 2 минуты.'));
});

test('INSTR-29 a fractional per-repeat time keeps whole seconds', () => {
  const eighteen = prescribedInterval({repeats: 4, repeatMeters: null, finalRepeatMeters: null, dose: {unit: 'MINUTES', value: 18}});
  assert.equal(intervalStructure({mode: 'INTERVALS', doseValue: 18, doseUnit: 'MINUTES', repeats: 4, repeatMeters: null, finalRepeatMeters: null})!.label, '4 × 4 мин 30 с');
  assert.equal(workoutInstruction(eighteen).headline, 'Сегодня: 4 × 4 мин 30 с');
  assert.equal(workoutVolume(eighteen), '4 × 4 мин 30 с');

  // A real prescription has the same shape: the engine orders 18 minutes of VO2 work in four repeats.
  const fixture = qualityCycle();
  const vo2 = prescribe(fixture.engineState, 'VO2', fixture.engineState.asOf, 'test-vo2');
  assert.equal(vo2.main.dose.unit, 'MINUTES');
  assert.equal(vo2.main.repeats, 4);
  assert.equal(vo2.main.repeatMeters, null);
  assert.equal(workoutIntervals(vo2)!.label, `4 × ${compactDuration(vo2.main.dose.value * 60 / 4)}`);
});

test('INSTR-30 a workout that is not made of intervals keeps the plain dose', () => {
  const easy = ordered('EASY');
  assert.equal(workoutIntervalsText(easy), null);
  assert.equal(workoutVolume(easy), `${Math.round(easy.main.dose.value)} м`);
  assert.equal(workoutInstruction(easy).headline.startsWith('Сегодня: спокойный бег'), true);
});

test('INSTR-31 fractional total minutes show exact main work (not rounded away)', () => {
  // The reported UI showed "3 мин" and "4 × 0:51". Engine actually meant 3.4 min = 204 s.
  const base = prescribedInterval({repeats: 4, repeatMeters: null, finalRepeatMeters: null, dose: {unit: 'MINUTES', value: 3.4}});
  const intro: Workout = {...base, type: 'INTRO_QUALITY', paceRangeSecondsPerKm: null, speedRangeMps: null};
  const plan = workoutInstruction(intro);
  const structure = workoutIntervals(intro)!;
  assert.equal(structure.totalWorkSeconds, 204);
  assert.equal(structure.perRepeatSeconds, 51);
  assert.equal(structure.exactSecondsPerRepeat, true);
  assert.equal(plan.headline, 'Сегодня: 4 × 51 с');
  assert.equal(workoutMainDose(intro), '3 минуты 24 секунды');
  assert.ok(plan.steps.some(line => line.includes('Каждый отрезок длится 51 секунду')));
  assert.ok(plan.steps.some(line => line.includes('Между отрезками отдыхай 1 минуту 30 секунд')));
  assert.ok(plan.steps.some(line => line.includes('Числовой темп не назначен')));
  assert.ok(plan.steps.some(line => line.includes('Дистанция не назначена')));
  assert.equal(plan.speedText, null);
  assert.equal(plan.estimatedDistanceText, null);
});

test('INSTR-32 a prescribed pace gives both min/km and equivalent treadmill km/h', () => {
  const base = prescribedInterval({repeats: 4, repeatMeters: null, finalRepeatMeters: null, dose: {unit: 'MINUTES', value: 3.4}});
  const paced: Workout = {...base, paceRangeSecondsPerKm: [300, 320], speedRangeMps: null};
  const plan = workoutInstruction(paced);
  assert.equal(plan.paceText, '5:00–5:20 мин/км');
  assert.equal(plan.speedText, '11,3–12,0 км/ч');
  assert.equal(treadmillSpeedText(paced), plan.speedText);
  assert.ok(plan.steps.some(step => step === 'Целевой темп: 5:00–5:20 мин/км.'));
  assert.ok(plan.steps.some(step => step.includes('На беговой дорожке: 11,3–12,0 км/ч')));
  assert.equal(estimatedTimeRepeatDistance(paced), 'примерно 150–170 м');
  assert.ok(plan.steps.some(step => step.includes('Это не обязательная дистанция')));
  assert.equal(paced.main.repeatMeters, null, 'metres were not promoted to mandatory repeats');
});

test('INSTR-33 when total seconds are not divisible by repeats, rounded split is explicitly approximate', () => {
  const base = prescribedInterval({repeats: 4, repeatMeters: null, finalRepeatMeters: null, dose: {unit: 'MINUTES', value: 3.5}});
  const blocks = workoutIntervals(base)!;
  assert.equal(blocks.totalWorkSeconds, 210);
  assert.equal(blocks.perRepeatSeconds, 53);
  assert.equal(blocks.exactSecondsPerRepeat, false);
  assert.equal(blocks.label, '4 × ≈53 с');
  assert.equal(workoutMainDose(base), '3 минуты 30 секунд');
  assert.ok(workoutInstruction(base).steps.some(x => x.includes('примерно 53 секунды')));
});

test('INSTR-34 prescribed distance stays mandatory and its time uses the engine pace', () => {
  const base = prescribedInterval({repeats: 4, repeatMeters: 600, finalRepeatMeters: 400, dose: {unit: 'METERS', value: 2200}});
  const paced: Workout = {...base, paceRangeSecondsPerKm: [240, 250], speedRangeMps: null};
  const plan = workoutInstruction(paced);
  assert.equal(plan.headline, 'Сегодня: 3 × 600 м + 1 × 400 м');
  assert.equal(workoutMainDose(paced), '2200 м');
  assert.ok(plan.steps.some(line => line.includes('Целевой темп: 4:00–4:10 мин/км')));
  assert.ok(plan.steps.some(line => line.includes('600 метров — за 2:24–2:30')));
  assert.ok(plan.steps.some(line => line.includes('Последний 400 метров — за 1:36–1:40')));
  assert.equal(plan.estimatedDistanceText, null);
});

test('INSTR-35 unpaced acceleration cannot invent pace, speed or a distance estimate', () => {
  const stride = ordered('STRIDES');
  const plan = workoutInstruction(stride);
  assert.equal(plan.paceText, null);
  assert.equal(plan.speedText, null);
  assert.equal(plan.estimatedDistanceText, null);
  assert.ok(plan.steps.some(x => x.includes('Числовой темп не назначен')));
});
