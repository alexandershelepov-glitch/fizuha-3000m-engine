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
import {effortFor, prescribedPace, splitSeconds, workoutInstruction} from '../web/src/ui/workoutInstructions.ts';

const volumeCycle = () => appCycle({availableRunsPerWeek: 5, regularRunningWeeks: 60, actualRunsPerWeek: 5, averageWeeklyKm4Weeks: 40, longestUsualRunKm: 12});
const qualityCycle = () => appCycle({availableRunsPerWeek: 4, regularRunningWeeks: 80, actualRunsPerWeek: 5, averageWeeklyKm4Weeks: 45, longestUsualRunKm: 14, qualitySessions8Weeks: 8, qualityWeeks8Weeks: 6, qualityMostlyTolerated: true, experience: {threshold: true, vo2: true, specific3k: true}});
const walkCycle = () => appCycle({canRun3Km: false, availableRunsPerWeek: 3, actualRunsPerWeek: 0, averageWeeklyKm4Weeks: 0, regularRunningWeeks: 0});

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
  assert.equal(plan.paceText, `${Math.floor(pace[0] / 60)}:${String(Math.round(pace[0]) % 60).padStart(2, '0')}–${Math.floor(pace[1] / 60)}:${String(Math.round(pace[1]) % 60).padStart(2, '0')} /км`);
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

  assert.equal(plan.headline, 'Сегодня: 6 × 400 метров');
  assert.deepEqual(plan.splits.map((split) => split.text), ['400 метров примерно за 1:36–1:40']);
  assert.ok(plan.steps.some((step) => step.includes('Каждый отрезок старайся пробежать за 1:36–1:40')), plan.steps.join(' | '));
  assert.ok(plan.steps.some((step) => step.includes('После каждого отрезка отдыхай 90 секунд')));
  assert.ok(plan.steps.some((step) => step.includes('Во время отдыха можно идти или очень медленно бежать')));
  assert.ok(plan.paceText!.endsWith('/км'), 'the pace stays available below');
});

test('INSTR-06 a 1000 m repeat is converted with the same rule', () => {
  const fixture = volumeCycle();
  const base = prescribe(fixture.engineState, 'SPECIFIC_3K', fixture.engineState.asOf, 'test-1000');
  const workout: Workout = {...base, main: {...base.main, repeats: 3, repeatMeters: 1000, finalRepeatMeters: 1000}, paceRangeSecondsPerKm: [240, 250], speedRangeMps: null};
  const plan = workoutInstruction(workout);

  assert.equal(plan.headline, 'Сегодня: 3 × 1000 метров');
  assert.deepEqual(plan.splits.map((split) => split.text), ['1000 метров примерно за 4:00–4:10']);
  assert.ok(plan.steps.some((step) => step.includes('4:00–4:10')));
});

test('INSTR-07 a different final repeat is shown separately with its own time', () => {
  const fixture = volumeCycle();
  const base = prescribe(fixture.engineState, 'SPECIFIC_3K', fixture.engineState.asOf, 'test-mixed');
  const workout: Workout = {...base, main: {...base.main, repeats: 6, repeatMeters: 400, finalRepeatMeters: 200}, paceRangeSecondsPerKm: [240, 250], speedRangeMps: null};
  const plan = workoutInstruction(workout);

  assert.equal(plan.headline, 'Сегодня: 6 × 400 метров + 1 × 200 метров');
  assert.deepEqual(plan.splits.map((split) => split.text), ['400 метров примерно за 1:36–1:40', '200 метров примерно за 0:48–0:50']);
  assert.ok(plan.steps.some((step) => step === '400 метров — за 1:36–1:40.'));
  assert.ok(plan.steps.some((step) => step === 'Последний 200 метров — за 0:48–0:50.'));
});

test('INSTR-08 a special 3000 m session keeps the engine pace and its own repeat length', () => {
  const workout = ordered('SPECIFIC_3K');
  const plan = workoutInstruction(workout);
  const pace = prescribedPace(workout)!;

  assert.equal(workout.main.repeatMeters, 600);
  assert.equal(plan.splits.length, 1);
  assert.deepEqual(plan.splits[0]!.seconds, splitSeconds(pace, 600));
  assert.ok(plan.headline.includes('600 метров'), plan.headline);
});

test('INSTR-09 the control run names the real distance and states that no pace is set', () => {
  const workout = ordered('CONTROL');
  const plan = workoutInstruction(workout);

  assert.equal(workout.paceRangeSecondsPerKm, null);
  assert.equal(plan.headline, 'Сегодня: контрольный забег 3000 метров');
  assert.ok(plan.steps.some((step) => step === 'Пробеги 3000 метров на результат.'));
  assert.ok(plan.steps.some((step) => step.includes('Темп не задан')));
  assert.equal(plan.paceText, null);
});

test('INSTR-10 run and walk is explained in words, without inventing a pattern', () => {
  const fixture = walkCycle();
  const workout = prescribe(fixture.engineState, 'EASY', fixture.engineState.asOf, 'test-walk');
  assert.equal(workout.main.mode, 'RUN_WALK', 'the fixture must be a run-and-walk session');
  const plan = workoutInstruction(workout);

  assert.ok(plan.headline.startsWith('Сегодня: спокойный бег'));
  assert.ok(plan.steps[0]!.startsWith('Чередуй бег и ходьбу'));
  assert.ok(plan.steps.some((step) => step.startsWith('Всего за тренировку')));
  // No number of run/walk cycles may appear: the workout does not carry one.
  assert.equal(/\d+\s*(раз|цикл)/.test(plan.steps.join(' ')), false, plan.steps.join(' | '));
});

test('INSTR-11 strides are described by technique, not by a target time', () => {
  const workout = ordered('STRIDES');
  const plan = workoutInstruction(workout);

  assert.equal(workout.main.repeatMeters, 100);
  assert.equal(workout.paceRangeSecondsPerKm, null);
  assert.equal(plan.splits.length, 0, 'no pace means no split time');
  assert.equal(plan.note, 'Ускорения не должны быть тяжёлыми: это работа над техникой, а не на результат.');
  assert.ok(plan.steps.some((step) => step.includes('После каждого отрезка отдыхай')));
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
  assert.equal(plan.steps[0], `Разминка — ${workout.warmupMinutes} минут лёгкого бега.`);
  assert.ok(plan.steps.at(-1)!.includes(`${workout.cooldownMinutes} минут лёгкого бега или ходьбы`));
});

test('INSTR-14 intervals with a pace but no distance state the pace instead of inventing a split', () => {
  const workout = ordered('VO2');
  assert.equal(workout.main.repeatMeters, null, 'the engine prescribes a duration here, not a distance');
  assert.ok(workout.paceRangeSecondsPerKm !== null);
  const plan = workoutInstruction(workout);

  assert.equal(plan.splits.length, 0, 'a distance the engine did not give is never invented');
  assert.ok(plan.steps.some((step) => step.startsWith('Каждый отрезок — в темпе')), plan.steps.join(' | '));
  assert.match(plan.headline, /^Сегодня: \d+ × \d+:\d\d$/);
});

test('INSTR-15 intervals without a pace state only what the engine ordered', () => {
  const fixture = appCycle({availableRunsPerWeek: 3});
  const workout = prescribe(fixture.engineState, 'INTRO_QUALITY', fixture.engineState.asOf, 'test-intro');
  assert.equal(workout.paceRangeSecondsPerKm, null);
  const plan = workoutInstruction(workout);

  assert.equal(plan.splits.length, 0);
  assert.equal(plan.paceText, null);
  assert.ok(plan.steps.some((step) => step.startsWith('Выполни 4 отрезка по')));
  assert.ok(plan.steps.some((step) => step.includes('отдыхай')));
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
