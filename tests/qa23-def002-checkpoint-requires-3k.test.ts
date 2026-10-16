/**
 * QA issue #23, DEF-002: no mandatory checkpoint for a user who cannot run 3000 m continuously yet.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, recordCheckpoint, replan, updateTrainingData} from '../src/index.ts';
import {NOW, dateAfter, profile} from './helpers.ts';

const novice = () => createEngine(profile({performance: null, canRun3Km: false, regularRunningWeeks: 3, actualRunsPerWeek: 1, availableRunsPerWeek: 3,
  averageWeeklyKm4Weeks: 3, longestUsualRunKm: 1.5, qualitySessions8Weeks: 0, qualityWeeks8Weeks: 0, qualityMostlyTolerated: false, raceDate: dateAfter(84)}), NOW);

test('DEF-002 a novice without continuous 3 km never gets a mandatory checkpoint, also after 21+ days', () => {
  const s = novice();
  assert.equal(s.checkpointRequired, false);
  for (const days of [7, 21, 24, 35, 60]) {
    const later = replan(s, dateAfter(days));
    assert.equal(later.checkpointRequired, false, `day ${days}`);
    assert.ok(!later.decision.reasons.includes('CHECKPOINT_DUE'), `day ${days}: no CHECKPOINT_DUE reason`);
  }
  // the engine still refuses the unavailable test
  assert.throws(() => recordCheckpoint(replan(s, dateAfter(24)), {timeSeconds: 1170, date: dateAfter(24), source: 'TEST_3K'}, dateAfter(24)), /Checkpoint not permitted/);
});

test('DEF-002 after continuous 3 km is confirmed the existing checkpoint rules apply again and the result is accepted', () => {
  const late = replan(novice(), dateAfter(24));
  const confirmed = updateTrainingData(late, {canRun3Km: true}, dateAfter(24));
  assert.equal(confirmed.checkpointRequired, true, 'checkpoint is due once it is possible');
  const done = recordCheckpoint(confirmed, {timeSeconds: 1170, date: dateAfter(24), source: 'TEST_3K'}, dateAfter(24));
  assert.equal(done.checkpointRequired, false);
  assert.equal(done.profile.performance?.timeSeconds, 1170);
});

test('DEF-002 a runner with confirmed 3 km keeps the 21-day checkpoint rule unchanged', () => {
  const s = createEngine(profile(), NOW);
  assert.equal(s.checkpointRequired, false);
  assert.equal(replan(s, dateAfter(21)).checkpointRequired, true);
});
