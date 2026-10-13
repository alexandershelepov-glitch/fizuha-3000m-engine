/**
 * Methodology v2.0, implementation step 1:
 * normal conversational easy running (session RPE 2–4) is not a failed session.
 * This change must not weaken symptom, fatigue or incomplete-execution checks.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, createEngine, prescribe, recordResult} from '../src/index.ts';
import {NOW, dateAfter, feedback, healthy, profile} from './helpers.ts';

function foundationEasyRunner() {
  return createEngine(profile({
    performance: null, canRun3Km: false,
    regularRunningWeeks: 4, actualRunsPerWeek: 2, availableRunsPerWeek: 2,
    averageWeeklyKm4Weeks: 10, longestUsualRunKm: 6,
    raceDate: dateAfter(70),
  }), NOW);
}

test('EASY and LONG_EASY both prescribe RPE 2–4 and classify an otherwise normal RPE 4 as GREEN', () => {
  const s = foundationEasyRunner();
  const easy = s.queue.find(w => w.type === 'EASY');
  assert.ok(easy);
  const long = prescribe(s, 'LONG_EASY', dateAfter(5), 'test-long');
  for (const w of [easy, long]) {
    assert.deepEqual(w.targetRpe, [2, 4]);
    for (const rpe of [2, 3, 4]) {
      const assessment = classify(w, feedback(w, 'GREEN', {sessionRpe: rpe}));
      assert.equal(assessment.evaluation, 'GREEN', `${w.type} RPE ${rpe}`);
      assert.equal(assessment.yellowReason, null);
    }
  }
});

test('two completed EASY workouts at RPE 4 do not trigger a related YELLOW or diagnostic HOLD', () => {
  let s = foundationEasyRunner();
  const scheduledEasies = s.queue.filter(w => w.type === 'EASY');
  assert.equal(scheduledEasies.length, 2);
  for (const w of scheduledEasies) {
    s = recordResult(s, w.id, feedback(w, 'GREEN', {sessionRpe: 4}));
    assert.equal(s.history.at(-1)?.classified.evaluation, 'GREEN');
    assert.equal(s.relatedYellow, false);
    assert.equal(s.diagnosticHold, false);
    assert.equal(s.decision.safety, 'OK');
  }
});

test('easy effort adjustment retains fatigue, partial execution and medical safety checks', () => {
  const easy = foundationEasyRunner().queue.find(w => w.type === 'EASY');
  assert.ok(easy);
  const highEffort = classify(easy, feedback(easy, 'GREEN', {sessionRpe: 5}));
  assert.equal(highEffort.evaluation, 'YELLOW');
  assert.equal(highEffort.yellowReason, 'RECOVERY');

  const unexpectedFatigue = classify(easy, feedback(easy, 'GREEN', {sessionRpe: 4, unexpectedFatigue: true}));
  assert.equal(unexpectedFatigue.evaluation, 'YELLOW');
  assert.equal(unexpectedFatigue.yellowReason, 'RECOVERY');

  const incomplete = classify(easy, feedback(easy, 'GREEN', {sessionRpe: 4, completionFraction: .7}));
  assert.equal(incomplete.evaluation, 'YELLOW');

  const pain = classify(easy, feedback(easy, 'GREEN', {sessionRpe: 4, safety: {...healthy(), pain: 2}}));
  assert.equal(pain.evaluation, 'YELLOW');
  assert.equal(pain.yellowReason, 'PAIN');

  const stop = classify(easy, feedback(easy, 'GREEN', {sessionRpe: 4, safety: {...healthy(), swelling: true}}));
  assert.equal(stop.evaluation, 'RED');
});
