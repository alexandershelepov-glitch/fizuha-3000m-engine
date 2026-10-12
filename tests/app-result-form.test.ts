/**
 * The result form: structural conversion into the engine's `WorkoutResult`, and the B1 rule about an
 * incomplete repeats block. The engine stays the only source of an evaluation.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, createEngine, recordResult, replan} from '../src/index.ts';
import type {Workout, WorkoutType} from '../src/index.ts';
import {
  COMPLETION_PRESETS, buildWorkoutResult, defaultResultDraft, draftHasNoRepeats, draftHasPartialRepeats,
  hasSafetyConcerns, repeatsAffectEvaluation, repeatsBlockExpandedFor,
} from '../web/src/application/resultForm.ts';
import {submitWorkoutResult} from '../web/src/application/workoutResult.ts';
import {createCycle} from '../web/src/application/cycle.ts';
import {buildProfile} from '../web/src/application/questionnaire.ts';
import {ACTIVE_CYCLE_KEY} from '../web/src/application/storage.ts';
import {formatTime} from '../web/src/application/format.ts';
import {CYCLE_ID, CREATED_AT, draft as draftFixture, memoryStorage, repository} from './helpers-app.ts';
import {NOW, dateAfter, experienced, feedback, healthy, profile} from './helpers.ts';

function workoutOf(type: WorkoutType): Workout {
  const samples = new Map<WorkoutType, Workout>();
  const profiles = [
    profile({...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4, averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(150)}),
    profile({...experienced, availableRunsPerWeek: 7, actualRunsPerWeek: 5, averageWeeklyKm4Weeks: 45, longestUsualRunKm: 12, performance: {timeSeconds: 800, date: NOW, source: 'TEST_3K'}, targetTimeSeconds: 780, raceDate: dateAfter(150)}),
    profile({performance: null, raceDate: dateAfter(90)}),
    profile({safety: {...healthy(), pain: 3}, raceDate: dateAfter(60)}),
    // The profile the questionnaire itself produces by default: an introductory quality session.
    profile({qualitySessions8Weeks: 0, qualityWeeks8Weeks: 0, targetTimeSeconds: 870, raceDate: dateAfter(56)}),
  ];
  for (const candidate of profiles) {
    let state = createEngine(candidate, NOW);
    for (let step = 0; step < 30; step += 1) {
      for (const workout of state.queue) if (!samples.has(workout.type)) samples.set(workout.type, workout);
      const quality = state.queue.find((workout) => workout.countsAsQuality);
      if (quality) {
        try {
          state = recordResult(state, quality.id, feedback(quality));
          continue;
        } catch {
          // the engine refused this one; fall through and advance the clock
        }
      }
      const next = dateAfter(1, state.asOf);
      if (Date.parse(`${next}T00:00:00Z`) > Date.parse(`${state.profile.raceDate}T00:00:00Z`)) break;
      state = replan(state, next);
    }
  }
  const workout = samples.get(type);
  if (!workout) throw new Error(`fixture: no ${type} workout was produced`);
  return workout;
}

test('FORM-01 a started draft comes from the prescription and invents nothing', () => {
  const workout = workoutOf('THRESHOLD');
  const draft = defaultResultDraft(workout);

  assert.equal(draft.completion, 'FULL');
  assert.equal(draft.distanceMeters, '0');
  assert.equal(draft.sessionRpe, Math.round((workout.targetRpe[0] + workout.targetRpe[1]) / 2));
  assert.equal(draft.restSeconds, String(workout.restSeconds));
  assert.equal(draft.repeats.length, Math.max(1, workout.main.repeats));
  assert.equal(draft.repeats[0]!.distanceMeters, String(workout.main.repeatMeters ?? ''));
  assert.equal(draft.unexpectedFatigue, false);
  assert.deepEqual(Object.values(draft.safety).filter((value) => value === true), []);

  const easy = workoutOf('EASY');
  assert.deepEqual(defaultResultDraft(easy).repeats, [], 'an easy session has no repeats block');
});

test('FORM-02 completion presets become fractions, and the exact option an exact share', () => {
  const workout = workoutOf('EASY');
  const fractions = {FULL: 1, MORE_THAN_HALF: 0.75, HALF: 0.5, LESS_THAN_HALF: 0.25} as const;
  for (const preset of COMPLETION_PRESETS) {
    const base = defaultResultDraft(workout);
    const draft = preset === 'EXACT'
      ? {...base, completion: preset, completionPercent: '42'}
      : {...base, completion: preset};
    const built = buildWorkoutResult(workout, draft);
    assert.equal(built.ok, true, `${preset} must build`);
    if (!built.ok) continue;
    assert.equal(built.result.completionFraction, preset === 'EXACT' ? 0.42 : fractions[preset]);
  }
});

test('FORM-03 every structural problem is caught before the engine is asked', () => {
  const workout = workoutOf('THRESHOLD');
  const base = defaultResultDraft(workout);

  const emptyDuration = buildWorkoutResult(workout, {...base, durationMinutes: ''});
  assert.equal(emptyDuration.ok, false);
  if (!emptyDuration.ok) assert.deepEqual(emptyDuration.problems.map((problem) => problem.field), ['durationMinutes']);

  const negative = buildWorkoutResult(workout, {...base, distanceMeters: '-5'});
  assert.equal(negative.ok, false);
  if (!negative.ok) assert.deepEqual(negative.problems, [{field: 'distanceMeters', kind: 'NEGATIVE'}]);

  const badTime = buildWorkoutResult(workout, {...base, repeats: [{seconds: '2.00', distanceMeters: '600'}]});
  assert.equal(badTime.ok, false);
  if (!badTime.ok) assert.deepEqual(badTime.problems, [{field: 'repeats', kind: 'FORMAT'}]);

  const impossible = buildWorkoutResult(workout, {...base, repeats: [{seconds: '2:75', distanceMeters: '600'}]});
  assert.equal(impossible.ok, false);
  if (!impossible.ok) assert.deepEqual(impossible.problems, [{field: 'repeats', kind: 'IMPOSSIBLE'}]);

  const withoutDistance = buildWorkoutResult(workout, {...base, repeats: [{seconds: '2:00', distanceMeters: ''}]});
  assert.equal(withoutDistance.ok, false);
  if (!withoutDistance.ok) assert.deepEqual(withoutDistance.problems, [{field: 'repeats', kind: 'EMPTY'}]);

  const missingPercent = buildWorkoutResult(workout, {...base, completion: 'EXACT', completionPercent: ''});
  assert.equal(missingPercent.ok, false);
  if (!missingPercent.ok) assert.deepEqual(missingPercent.problems, [{field: 'completionPercent', kind: 'EMPTY'}]);

  const tooMuchPercent = buildWorkoutResult(workout, {...base, completion: 'EXACT', completionPercent: '140'});
  assert.equal(tooMuchPercent.ok, false);
  if (!tooMuchPercent.ok) assert.deepEqual(tooMuchPercent.problems, [{field: 'completionPercent', kind: 'IMPOSSIBLE'}]);
});

test('FORM-04 the produced result carries exactly the engine contract', () => {
  const workout = workoutOf('THRESHOLD');
  const draft = {
    ...defaultResultDraft(workout),
    repeats: [{seconds: '2:00', distanceMeters: '600'}, {seconds: '2:01', distanceMeters: '600'}],
    restSeconds: '90',
    conditions: {heat: true, wind: false, surface: ' стадион ', notes: ' ветрено '},
    unexpectedFatigue: true,
    sessionRpe: 7,
  };

  const built = buildWorkoutResult(workout, draft);
  assert.equal(built.ok, true);
  if (!built.ok) return;

  assert.deepEqual(Object.keys(built.result).sort(), ['completionFraction', 'conditions', 'date', 'distanceMeters', 'durationMinutes', 'repeats', 'restSeconds', 'safety', 'sessionRpe', 'unexpectedFatigue']);
  assert.equal(built.result.date, workout.scheduledDate);
  assert.equal(built.result.sessionRpe, 7);
  assert.equal(built.result.unexpectedFatigue, true);
  assert.deepEqual(built.result.repeats, [{distanceMeters: 600, seconds: 120}, {distanceMeters: 600, seconds: 121}]);
  assert.deepEqual(built.result.restSeconds, [90, 90]);
  assert.deepEqual(built.result.conditions, {heat: true, wind: false, surface: 'стадион', notes: 'ветрено'});
});

test('FORM-05 an unreported repeats row is dropped, not turned into an error', () => {
  const workout = workoutOf('THRESHOLD');
  const base = defaultResultDraft(workout);
  assert.equal(draftHasNoRepeats(base), true, 'a prefilled distance alone is not a report');
  assert.equal(draftHasPartialRepeats(base), false);

  const built = buildWorkoutResult(workout, base);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.deepEqual(built.result.repeats, []);

  const partial = {...base, repeats: [{seconds: '2:00', distanceMeters: '600'}, {seconds: '', distanceMeters: '600'}]};
  assert.equal(draftHasPartialRepeats(partial), true);
  const partialBuilt = buildWorkoutResult(workout, partial);
  assert.equal(partialBuilt.ok, true);
  if (partialBuilt.ok) assert.deepEqual(partialBuilt.result.repeats, [{distanceMeters: 600, seconds: 120}]);
});

test('FORM-06 B1: the block is expanded exactly where the approved rule says so', () => {
  const expanded: Record<string, boolean> = {};
  const affects: Record<string, boolean> = {};
  for (const type of ['THRESHOLD', 'VO2', 'SPECIFIC_3K', 'EASY', 'LONG_EASY', 'INTRO_QUALITY', 'CONTROL'] as const) {
    const workout = workoutOf(type);
    expanded[type] = repeatsBlockExpandedFor(workout);
    affects[type] = repeatsAffectEvaluation(workout);
  }

  assert.equal(affects.THRESHOLD, true);
  assert.equal(affects.VO2, true);
  assert.equal(affects.SPECIFIC_3K, true);
  assert.equal(affects.EASY, false);
  assert.equal(affects.LONG_EASY, false);
  assert.equal(affects.INTRO_QUALITY, false);
  assert.equal(affects.CONTROL, false);

  // Expanded covers everything with a pace range plus interval sessions without one.
  assert.equal(expanded.THRESHOLD, true);
  assert.equal(expanded.VO2, true);
  assert.equal(expanded.SPECIFIC_3K, true);
  assert.equal(expanded.INTRO_QUALITY, true);
  assert.equal(expanded.EASY, false);
  assert.equal(expanded.LONG_EASY, false);
  assert.equal(expanded.CONTROL, false);
});

test('FORM-07 B1: the engine, not the form, decides what an empty repeats block costs', () => {
  for (const type of ['THRESHOLD', 'VO2', 'SPECIFIC_3K', 'EASY'] as const) {
    const workout = workoutOf(type);
    const empty = classify(workout, {...feedback(workout, 'GREEN'), repeats: []});
    const filled = classify(workout, feedback(workout, 'GREEN'));
    if (repeatsAffectEvaluation(workout)) {
      assert.equal(empty.evaluation, 'YELLOW', `${type}: an empty block costs accuracy`);
      assert.equal(filled.evaluation, 'GREEN', `${type}: a reported block restores the verdict`);
    } else {
      assert.equal(empty.evaluation, filled.evaluation, `${type}: the block changes nothing`);
    }
  }
});

test('FORM-08 the warning path leads to the engine verdict the engine chose', () => {
  const storage = memoryStorage();
  const built = buildProfile(draftFixture());
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const created = createCycle(repository(storage), {
    profile: profile({...built.profile, ...experienced, availableRunsPerWeek: 4}),
    deviceToday: NOW,
    cycleId: CYCLE_ID,
    createdAt: CREATED_AT,
    locale: 'ru-RU',
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const workout = created.engineState.queue[0]!;
  assert.equal(workout.type, 'THRESHOLD', 'the fixture must start with a paced session');

  // The user leaves the times empty: the form allows it, and the engine judges it.
  const formDraft = defaultResultDraft(workout);
  assert.equal(draftHasNoRepeats(formDraft), true);
  const result = buildWorkoutResult(workout, formDraft);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(classify(workout, result.result).evaluation, 'YELLOW');

  const outcome = submitWorkoutResult({
    repo: repository(storage), appState: created.appState, engineState: created.engineState,
    workoutId: workout.id, result: result.result, deviceToday: NOW,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.done.evaluation, 'YELLOW');
  assert.equal(outcome.done.yellowReason, 'EXECUTION');
  assert.equal(storage.map.has(ACTIVE_CYCLE_KEY), true);

  // And the same session with reported repeats is accepted as it was executed.
  const speed = (workout.speedRangeMps![0] + workout.speedRangeMps![1]) / 2;
  const filled = buildWorkoutResult(workout, {
    ...formDraft,
    repeats: defaultResultDraft(workout).repeats.map(() => ({seconds: formatTime(600 / speed), distanceMeters: '600'})),
  });
  assert.equal(filled.ok, true);
  if (filled.ok) assert.equal(classify(workout, filled.result).evaluation, 'GREEN');
});


test('FORM-SAFETY-01 every engine flag is recognised; no choice is pre-confirmed', () => {
  const workout = workoutOf('EASY');
  const draft = defaultResultDraft(workout);
  assert.equal(draft.safetyResponse, 'UNANSWERED');
  assert.equal(hasSafetyConcerns(draft.safety), false);
  for (const flag of ['painIncreasing', 'alteredMovement', 'painWalkingOrRest', 'swelling', 'acuteIllness', 'otherStop', 'needsAssessment'] as const) {
    assert.equal(hasSafetyConcerns({...draft.safety, [flag]: true}), true, flag);
  }
  assert.equal(hasSafetyConcerns({...draft.safety, pain: 1}), true);
});

test('FORM-SAFETY-02 reported symptoms and unusual fatigue remain separate in engine feedback', () => {
  const workout = workoutOf('EASY');
  const base = defaultResultDraft(workout);
  const withSymptoms = buildWorkoutResult(workout, {
    ...base, safetyResponse: 'SYMPTOMS',
    safety: {...base.safety, alteredMovement: true, swelling: true},
    unexpectedFatigue: true,
  });
  assert.equal(withSymptoms.ok, true);
  if (withSymptoms.ok) {
    assert.equal(withSymptoms.result.safety.alteredMovement, true);
    assert.equal(withSymptoms.result.safety.swelling, true);
    assert.equal(withSymptoms.result.unexpectedFatigue, true);
    assert.equal(classify(workout, withSymptoms.result).evaluation, 'RED');
  }
});
