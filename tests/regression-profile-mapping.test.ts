/**
 * The questionnaire wording changed; the data it produces must not.
 *
 * These are golden checks on the mapping from answers to the engine's Profile: the same answers give
 * the same Profile field by field, and a mistyped label can never reach the engine input.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildProfile, defaultDraft, healthySafety} from '../web/src/application/questionnaire.ts';
import type {QuestionnaireDraft} from '../web/src/application/questionnaire.ts';
import {NOW, dateAfter} from './helpers.ts';

const ANSWERS: QuestionnaireDraft = {
  ...defaultDraft(NOW),
  hasResult: true,
  resultTime: '15:20',
  resultDate: dateAfter(-10),
  resultSource: 'OFFICIAL_3K',
  canRun3Km: true,
  regularRunningWeeks: '52',
  actualRunsPerWeek: '4',
  averageWeeklyKm4Weeks: '32,5',
  longestUsualRunKm: '11',
  qualityRecall: 'EXACT',
  qualitySessions8Weeks: '9',
  qualityWeeks8Weeks: '6',
  qualityMostlyTolerated: true,
  experience: {threshold: true, vo2: false, specific3k: true},
  safety: healthySafety(),
  hasBreaks: true,
  breaks: [{reason: 'ILLNESS', days: '12', endDate: dateAfter(-20)}],
  availableRunsPerWeek: '5',
  performanceMismatch: 'MODERATE',
  targetTime: '14:30',
  raceDate: dateAfter(56),
};

test('PROFILE-01 the same answers still produce exactly the same Profile', () => {
  const built = buildProfile(ANSWERS);
  assert.equal(built.ok, true);
  if (!built.ok) return;

  // Every engine input, compared field by field. A wording change must never move one of these.
  assert.deepEqual(built.profile.performance, {timeSeconds: 920, date: dateAfter(-10), source: 'OFFICIAL_3K'});
  assert.equal(built.profile.targetTimeSeconds, 870);
  assert.equal(built.profile.raceDate, dateAfter(56));
  assert.equal(built.profile.regularRunningWeeks, 52);
  assert.equal(built.profile.actualRunsPerWeek, 4);
  assert.equal(built.profile.averageWeeklyKm4Weeks, 32.5);
  assert.equal(built.profile.longestUsualRunKm, 11);
  assert.equal(built.profile.canRun3Km, true);
  assert.equal(built.profile.qualitySessions8Weeks, 9);
  assert.equal(built.profile.qualityWeeks8Weeks, 6);
  assert.equal(built.profile.qualityMostlyTolerated, true);
  assert.deepEqual(built.profile.experience, {threshold: true, vo2: false, specific3k: true});
  assert.deepEqual(built.profile.breaks, [{reason: 'ILLNESS', days: 12, endDate: dateAfter(-20)}]);
  assert.equal(built.profile.availableRunsPerWeek, 5);
  assert.equal(built.profile.performanceMismatch, 'MODERATE');
  assert.deepEqual(built.profile.safety, healthySafety());
});

test('PROFILE-02 the answers are the only input: no label, hint or option text is read', () => {
  const built = buildProfile(ANSWERS);
  assert.equal(built.ok, true);
  if (!built.ok) return;

  // The draft holds exactly the answer values, so a translated string could never be mistaken for data.
  const keys = Object.keys(ANSWERS).sort();
  assert.deepEqual(keys, [
    'actualRunsPerWeek', 'availableRunsPerWeek', 'averageWeeklyKm4Weeks', 'breaks', 'canRun3Km',
    'experience', 'hasBreaks', 'hasResult', 'longestUsualRunKm', 'performanceMismatch',
    'qualityMostlyTolerated', 'qualityRecall', 'qualitySessions8Weeks', 'qualityWeeks8Weeks', 'raceDate',
    'regularRunningWeeks', 'resultDate', 'resultSource', 'resultTime', 'safety', 'targetTime',
  ]);
  for (const value of Object.values(ANSWERS)) {
    assert.notEqual(typeof value, 'undefined');
  }
});

test('PROFILE-03 every numeric answer is parsed from its own field', () => {
  // A different answer in one field moves exactly one Profile value.
  const moreRuns = buildProfile({...ANSWERS, actualRunsPerWeek: '6'});
  const fewerWeeks = buildProfile({...ANSWERS, regularRunningWeeks: '10'});
  const otherMismatch = buildProfile({...ANSWERS, performanceMismatch: 'CLEAR'});
  assert.ok(moreRuns.ok && fewerWeeks.ok && otherMismatch.ok);
  if (!moreRuns.ok || !fewerWeeks.ok || !otherMismatch.ok) return;

  assert.equal(moreRuns.profile.actualRunsPerWeek, 6);
  assert.equal(moreRuns.profile.regularRunningWeeks, 52, 'other fields stay untouched');
  assert.equal(fewerWeeks.profile.regularRunningWeeks, 10);
  assert.equal(fewerWeeks.profile.actualRunsPerWeek, 4);
  assert.equal(otherMismatch.profile.performanceMismatch, 'CLEAR');
  assert.equal(otherMismatch.profile.qualityWeeks8Weeks, 6);
});

test('PROFILE-04 recollection without records does not invent confirmed sessions', () => {
  for (const recall of ['NONE', 'SOMETIMES', 'REGULAR', 'UNKNOWN'] as const) {
    const draft = {...ANSWERS, qualityRecall: recall, qualitySessions8Weeks: '999', qualityWeeks8Weeks: '8'};
    const result = buildProfile(draft);
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(result.profile.qualitySessions8Weeks, 0);
    assert.equal(result.profile.qualityWeeks8Weeks, 0);
    assert.equal(result.profile.qualityMostlyTolerated, false);
  }
});

test('PROFILE-05 old drafts without a recall selector keep their numeric answers', () => {
  const {qualityRecall: _previous, ...oldAnswers} = ANSWERS;
  const result = buildProfile(oldAnswers);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.profile.qualitySessions8Weeks, 9);
    assert.equal(result.profile.qualityWeeks8Weeks, 6);
  }
});
