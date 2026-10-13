import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, recordCheckpoint, replan, resolveDiagnostic} from '../src/index.ts';
import {deriveToday, isSafetyHold, needsPerformanceReview} from '../web/src/application/uiState.ts';
import {NOW, dateAfter, experienced, healthy, profile} from './helpers.ts';

function stale() {
  return createEngine(profile({
    ...experienced,
    performance:{timeSeconds:900,date:dateAfter(-50),source:'TEST_3K'},
    targetTimeSeconds:860,
    raceDate:dateAfter(90),
    availableRunsPerWeek:4,actualRunsPerWeek:4,averageWeeklyKm4Weeks:28,longestUsualRunKm:9,
  }),NOW);
}
test('REVIEW-01 stale 3 km result allows the engine prescribed EASY instead of a false medical hold',()=>{
  const state=stale();
  assert.equal(state.decision.confidence,'LOW');
  assert.equal(state.decision.phase,'HOLD_DIAGNOSTIC');
  assert.equal(state.decision.safety,'OK');
  assert.equal(isSafetyHold(state),false);
  assert.equal(needsPerformanceReview(state),true);
  assert.equal(deriveToday(state,NOW).state,'PERFORMANCE_REVIEW');
  assert.ok(state.queue.length>0);
  assert.equal(state.queue[0]?.type,'EASY');
});
test('REVIEW-02 medical flags and diagnostic hold always take precedence over stale performance',()=>{
  const withPain=createEngine(profile({
    performance:{timeSeconds:900,date:dateAfter(-50),source:'TEST_3K'},
    safety:{...healthy(),pain:3},
    raceDate:dateAfter(90),
  }),NOW);
  assert.equal(isSafetyHold(withPain),true);
  assert.equal(deriveToday(withPain,NOW).state,'TRAINING_HOLD');
  assert.equal(needsPerformanceReview(withPain),false);
  const held=structuredClone(stale());
  held.diagnosticHold=true;
  assert.equal(isSafetyHold(held),true);
  assert.equal(deriveToday(held,NOW).state,'TRAINING_HOLD');
});
test('REVIEW-03 a new external measured 3 km result restores fresh confidence, not a symptom survey',()=>{
  const state=stale();
  const checked=recordCheckpoint(state,{timeSeconds:890,date:NOW,source:'TEST_3K'},NOW);
  assert.equal(checked.decision.confidence,'HIGH');
  assert.equal(checked.decision.phase,'DEVELOPMENT');
  assert.equal(needsPerformanceReview(checked),false);
  assert.notEqual(deriveToday(checked,NOW).state,'TRAINING_HOLD');
  assert.deepEqual(state.profile.performance,{timeSeconds:900,date:dateAfter(-50),source:'TEST_3K'});
});
test('REVIEW-04 healthy safety recheck does not falsely claim old performance is fresh',()=>{
  const state=stale();
  const after=resolveDiagnostic(state,healthy(),NOW);
  assert.equal(after.decision.confidence,'LOW');
  assert.equal(after.decision.phase,'HOLD_DIAGNOSTIC');
  assert.equal(needsPerformanceReview(after),true);
});
test('REVIEW-05 date advancement keeps permitted EASY visible during the low-confidence phase',()=>{
  const state=stale();
  const advanced=replan(state,dateAfter(1));
  assert.equal(advanced.decision.phase,'HOLD_DIAGNOSTIC');
  assert.equal(needsPerformanceReview(advanced),true);
  assert.equal(deriveToday(advanced,dateAfter(1)).state,'PERFORMANCE_REVIEW');
});
