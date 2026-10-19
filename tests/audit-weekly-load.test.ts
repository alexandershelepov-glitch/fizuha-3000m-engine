/**
 * Audit evidence, not a new sports rule. These tests document CURRENT unsafe/ambiguous behavior,
 * so a later change to limit loading has an exact, reproducible baseline.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, createEngine, recordResult} from '../src/index.ts';
import {buildWorkoutResult, defaultResultDraft} from '../web/src/application/resultForm.ts';
import {NOW, feedback, profile} from './helpers.ts';

function highAvailabilityLowHabit() {
  return createEngine(profile({
    performance: null, canRun3Km: false,
    targetTimeSeconds: 896, raceDate: '2026-12-28',
    regularRunningWeeks: 4, actualRunsPerWeek: 2,
    availableRunsPerWeek: 7, averageWeeklyKm4Weeks: 10,
    longestUsualRunKm: 6, qualitySessions8Weeks: 0, qualityWeeks8Weeks: 0,
  }), NOW);
}

test('AUDIT-LOAD-01 10 km habitual baseline is never inflated to 38 km by seven free days', () => {
  const state = highAvailabilityLowHabit();
  assert.equal(state.queue.length, 2, 'running frequency is habitual, not calendar availability');
  assert.ok(state.queue.every(w=>w.main.mode==='RUN_WALK'), 'no uninterrupted 3 km');
  assert.deepEqual(state.queue.map(w=>w.type),['EASY','EASY']);
  const plannedMetres = state.queue.reduce((total,w)=>total+w.main.dose.value,0);
  assert.equal(plannedMetres,10_000);
  assert.ok(plannedMetres <= state.profile.averageWeeklyKm4Weeks * 1000);
});

test('AUDIT-LOAD-02 there is at most one LONG_EASY in every rolling seven-day window',()=>{
  for(const availability of [1,2,3,4,5,6,7]){
    const state = createEngine(profile({
      availableRunsPerWeek:availability,actualRunsPerWeek:7,
      averageWeeklyKm4Weeks:42,longestUsualRunKm:8,
      canRun3Km:false,performance:null,qualitySessions8Weeks:0,qualityWeeks8Weeks:0,
      raceDate:'2026-12-28',
    }), NOW);
    for(const w of state.queue){
      const recent=state.queue.filter(x=>x.type==='LONG_EASY' &&
        Date.parse(x.scheduledDate+'T00:00:00Z')<=Date.parse(w.scheduledDate+'T00:00:00Z') &&
        Date.parse(x.scheduledDate+'T00:00:00Z')>Date.parse(w.scheduledDate+'T00:00:00Z')-7*86400000);
      assert.ok(recent.length<=1,`availability=${availability} date=${w.scheduledDate}`);
    }
  }
});

test('AUDIT-FEEDBACK-01 easy can be GREEN without any measured duration, distance or intervals',()=>{
  const state=highAvailabilityLowHabit(), easy=state.queue[0]!;
  assert.equal(easy.type,'EASY');
  const draft=defaultResultDraft(easy);
  assert.equal(draft.completion,'FULL');
  assert.equal(draft.durationMinutes,'0');
  assert.equal(draft.distanceMeters,'');
  const parsed=buildWorkoutResult(easy,draft);
  assert.equal(parsed.ok,true);
  if(!parsed.ok)return;
  assert.equal(parsed.result.durationMinutes,0);
  assert.equal(parsed.result.distanceMeters,0);
  assert.deepEqual(parsed.result.repeats,[]);
  assert.equal(classify(easy,parsed.result).evaluation,'GREEN');
});

test('AUDIT-LOAD-03 first half-completed EASY repeats full distance; repeated healthy YELLOW requires reduced EASY',()=>{
  let state=highAvailabilityLowHabit();
  for(let i=0;i<2;i++){
    const current=state.queue.find(w=>w.scheduledDate>=state.asOf)!;
    assert.equal(current.type,'EASY');
    assert.equal(current.main.dose.value,5000);
    const result=feedback(current,'YELLOW',{
      completionFraction:0.5, durationMinutes:20, distanceMeters:2500, repeats:[],
    });
    state=recordResult(state,current.id,result);
    assert.equal(state.history.at(-1)?.classified.evaluation,'YELLOW');
    const next=state.queue.find(w=>w.scheduledDate>current.scheduledDate)!;
    if(i===0){
      assert.equal(next.type,'EASY');
      assert.equal(next.main.dose.value,5000);
    }else{
      assert.equal(state.relatedYellow,true);
      assert.equal(state.diagnosticHold,false);
      assert.equal(next.type,'EASY','healthy repeated YELLOW receives a bounded easy adaptation');
      assert.ok(next.volumeFactor<=.8);
    }
  }
});
