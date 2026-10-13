/**
 * Characterization of the gaps that the next implementation must close.
 * These assertions describe CURRENT behaviour; they are not approval of a stationary training plan.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, recordResult, replan, updateTrainingData} from '../src/index.ts';
import {NOW, dateAfter, feedback, profile} from './helpers.ts';
import {buildWorkoutResult, defaultResultDraft} from '../web/src/application/resultForm.ts';

const novice = ()=>profile({
  canRun3Km:false,performance:null,raceDate:dateAfter(70),
  regularRunningWeeks:8,actualRunsPerWeek:2,availableRunsPerWeek:7,
  averageWeeklyKm4Weeks:10,longestUsualRunKm:6,
  qualitySessions8Weeks:0,qualityWeeks8Weeks:0,
});
test('DESIGN-01 after 14 successful calendar days the interim guard does not progress the beginner easy budget',()=>{
  let s=createEngine(novice(),NOW);
  let completed=0;
  for(let i=0;i<15;i++){
    const date=dateAfter(i);
    s=replan(s,date);
    const w=s.queue.find(item=>item.scheduledDate===date);
    if(w&&w.type!=='REST'){
      const r=feedback(w,'GREEN',{distanceMeters:w.main.dose.value,repeats:[],durationMinutes:35});
      s=recordResult(s,w.id,r);
      assert.equal(s.history.at(-1)?.classified.evaluation,'GREEN');
      completed++;
    }
  }
  assert.ok(completed>=4,`expected multiple real completions, got ${completed}`);
  assert.equal(s.profile.averageWeeklyKm4Weeks,10);
  assert.equal(s.profile.canRun3Km,false);
  // A dynamic approved training load has not yet been introduced. The 10-km baseline remains fixed.
  assert.ok(s.queue.filter(w=>w.main.dose.unit==='METERS').reduce((n,w)=>n+w.main.dose.value,0)<=10000);
});

test('DESIGN-02 explicit capability update can change T0 to T1 without inventing a 3 km time',()=>{
  const old=createEngine(novice(),NOW);
  assert.equal(old.decision.capacity,'T0');
  const next=updateTrainingData(old,{canRun3Km:true},NOW);
  assert.equal(next.profile.canRun3Km,true);
  assert.equal(next.profile.performance,null);
  assert.equal(next.decision.capacity,'T1');
  assert.equal(next.checkpointRequired,true);
  assert.equal(old.profile.canRun3Km,false,'original stored state remains immutable');
});

test('DESIGN-03 GREEN without user-entered distances or repeats is currently possible by form defaults',()=>{
  const state=createEngine(novice(),NOW);
  const w=state.queue[0]!;
  const draft=defaultResultDraft(w);
  assert.equal(draft.completion,'FULL');
  assert.equal(draft.distanceMeters,'');
  assert.equal(draft.repeats.length,0);
  const built=buildWorkoutResult(w,draft);
  assert.equal(built.ok,true);
  if(!built.ok)return;
  assert.equal(built.result.distanceMeters,0);
  const after=recordResult(state,w.id,built.result);
  assert.equal(after.history.at(-1)?.classified.evaluation,'GREEN');
  // This is not reliable evidence for increasing training load without explicit answers.
});
