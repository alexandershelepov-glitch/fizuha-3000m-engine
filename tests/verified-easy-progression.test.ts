import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  createEngine, deserialize, replan, recordResult, serialize, skipWorkout, applyBreak, updateTrainingData,
} from '../src/index.ts';
import type {EngineState, Workout} from '../src/index.ts';
import {NOW, dateAfter, feedback, healthy, profile} from './helpers.ts';
import {buildWorkoutResult, defaultResultDraft} from '../web/src/application/resultForm.ts';

const amateur = (overrides: Parameters<typeof profile>[0]={}) => profile({
  performance:null, canRun3Km:false, raceDate:dateAfter(110),
  actualRunsPerWeek:2, availableRunsPerWeek:7,
  averageWeeklyKm4Weeks:10,longestUsualRunKm:6,
  qualitySessions8Weeks:0, qualityWeeks8Weeks:0, ...overrides,
});
const measured = (w:Workout, confirmed=true) => feedback(w,'GREEN',{
  feedbackConfirmed: confirmed, durationMinutes:35,
  distanceMeters:w.main.dose.unit==='METERS' ? w.main.dose.value : 0, repeats:[],
});
function runDays(initial:EngineState, start:number, end:number, confirmed=true): EngineState {
  let s=initial;
  for(let offset=start;offset<=end;offset++){
    const date=dateAfter(offset);
    s=replan(s,date);
    const w=s.queue.find(x=>x.scheduledDate===date);
    if(w && w.type!=='REST') s=recordResult(s,w.id,measured(w,confirmed));
  }
  return s;
}
function totalMeters(s:EngineState) {
  return s.queue.filter(w=>w.main.dose.unit==='METERS').reduce((n,w)=>n+w.main.dose.value,0);
}
test('STEP-01 confirmed two weeks at 10km create exactly a 500m easy budget increment',()=>{
  let s=createEngine(amateur(),NOW);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,10000);
  s=runDays(s,0,14,true);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,10500);
  assert.equal(s.easyProgression?.lastIncreaseDate,dateAfter(14));
  assert.equal(s.profile.averageWeeklyKm4Weeks,10,'historic self-report is not falsified');
  assert.equal(s.profile.canRun3Km,false,'GREEN is not an automatic 3000m capability result');
  assert.ok(totalMeters(s)<=10500);
  assert.ok(s.queue.every(w=>w.main.dose.unit!=='METERS'||w.main.dose.value<=5250));
  const twice=replan(s,dateAfter(14));
  assert.equal(twice.easyProgression?.approvedMetersPer7Days,10500,'replan is idempotent');
});
test('STEP-02 two further confirmed weeks produce only one further 500m step',()=>{
  const once=runDays(createEngine(amateur(),NOW),0,14,true);
  const twice=runDays(once,15,28,true);
  assert.equal(twice.easyProgression?.approvedMetersPer7Days,11000);
  assert.equal(twice.easyProgression?.lastIncreaseDate,dateAfter(28));
  assert.ok(totalMeters(twice)<=11000);
});
test('STEP-03 defaulted/legacy GREENs may save but never authorize progression',()=>{
  let state=createEngine(amateur(),NOW);
  state=runDays(state,0,28,false);
  assert.equal(state.easyProgression?.approvedMetersPer7Days,10000);
  assert.equal(state.history.length>=6,true);
});
test('STEP-04 one unconfirmed session disqualifies the entire block',()=>{
  let state=createEngine(amateur(),NOW);
  for(let offset=0;offset<=14;offset++){
    state=replan(state,dateAfter(offset));
    const w=state.queue.find(x=>x.scheduledDate===dateAfter(offset));
    if(w) state=recordResult(state,w.id,measured(w,offset!==3));
  }
  assert.equal(state.easyProgression?.approvedMetersPer7Days,10000);
});
test('STEP-05 a missed workout never earns a 14-day progression credit',()=>{
  let state=createEngine(amateur(),NOW);
  for(let offset=0;offset<=14;offset++){
    const today=dateAfter(offset);state=replan(state,today);
    const w=state.queue.find(x=>x.scheduledDate===today);
    if(w) state=offset===3?skipWorkout(state,w.id,today):recordResult(state,w.id,measured(w));
  }
  assert.equal(state.easyProgression?.approvedMetersPer7Days,10000);
});
test('STEP-06 YELLOW/RED and a diagnostic hold block growth, even with subsequent GREENs',()=>{
  let state=createEngine(amateur(),NOW);
  for(let offset=0;offset<=14;offset++){
    const today=dateAfter(offset);state=replan(state,today);
    const w=state.queue.find(x=>x.scheduledDate===today);
    if(w&&w.type!=='REST'){
      state=recordResult(state,w.id,offset===3?feedback(w,'YELLOW',{
        feedbackConfirmed:true,completionFraction:0.5,distanceMeters:w.main.dose.value/2,repeats:[],
      }):measured(w));
    }
  }
  assert.equal(state.easyProgression?.approvedMetersPer7Days,10000);
  let red=createEngine(amateur(),NOW);
  const w=red.queue[0]!;
  red=recordResult(red,w.id,feedback(w,'RED',{feedbackConfirmed:true}));
  red=replan(red,dateAfter(14));
  assert.equal(red.easyProgression?.approvedMetersPer7Days,10000);
  assert.equal(red.diagnosticHold,true);
});
test('STEP-07 short baseline gets no arbitrary +500m and 0km still yields introductory run/walk',()=>{
  for(const km of [0,1,2,4]){
    let state=createEngine(amateur({
      averageWeeklyKm4Weeks:km, actualRunsPerWeek:km===0?0:1, longestUsualRunKm:km,
    }),NOW);
    state=runDays(state,0,14,true);
    assert.equal(state.easyProgression?.approvedMetersPer7Days,km===0?1000:km*1000);
  }
});
test('STEP-08 old v1 serialized state loads without bonus retroactive increase',()=>{
  let state=createEngine(amateur(),NOW);
  state=runDays(state,0,13,true);
  const legacy=JSON.parse(serialize(state)) as EngineState;
  delete legacy.easyProgression;
  const restored=deserialize(JSON.stringify(legacy));
  assert.equal(restored.easyProgression?.approvedMetersPer7Days,10000);
  const after=replan(restored,dateAfter(14));
  assert.equal(after.easyProgression?.approvedMetersPer7Days,10000,'legacy GREENs must not grant new credits');
  assert.equal(after.history.length,state.history.length);
});
test('STEP-09 a work break blocks increases without deleting already completed history',()=>{
  const state=runDays(createEngine(amateur(),NOW),0,6,true);
  const afterBreak=applyBreak(state,{days:8,reason:'WORK',endDate:dateAfter(14)},dateAfter(14));
  assert.equal(afterBreak.easyProgression?.approvedMetersPer7Days,10000);
  assert.ok(afterBreak.history.length>0);
});
test('STEP-10 near race-day taper never triggers an increase',()=>{
  let state=createEngine(amateur({raceDate:dateAfter(19)}),NOW);
  state=runDays(state,0,14,true);
  assert.equal(state.easyProgression?.approvedMetersPer7Days,10000);
});
test('STEP-11 confirmation is available only after deliberate completion and effort answers',()=>{
  const state=createEngine(amateur(),NOW), w=state.queue[0]!;
  const draft=defaultResultDraft(w);
  assert.equal(draft.completionConfirmed,false);
  assert.equal(draft.effortConfirmed,false);
  const unconfirmed=buildWorkoutResult(w,draft);
  assert.equal(unconfirmed.ok,true);
  if(unconfirmed.ok)assert.equal(unconfirmed.result.feedbackConfirmed,undefined);
  const oneAnswer=buildWorkoutResult(w,{...draft,completionConfirmed:true});
  if(oneAnswer.ok)assert.equal(oneAnswer.result.feedbackConfirmed,undefined);
  const both=buildWorkoutResult(w,{...draft,completionConfirmed:true,effortConfirmed:true});
  assert.equal(both.ok,true);
  if(both.ok)assert.equal(both.result.feedbackConfirmed,true);
});
test('STEP-12 explicit T0 capability update stays separate from measured 3000m performance',()=>{
  const initial=createEngine(amateur(),NOW);
  const advanced=updateTrainingData(initial,{canRun3Km:true},NOW);
  assert.equal(advanced.profile.canRun3Km,true);
  assert.equal(advanced.profile.performance,null);
  assert.equal(advanced.checkpointRequired,true);
  assert.deepEqual(initial.profile.safety,healthy());
});
