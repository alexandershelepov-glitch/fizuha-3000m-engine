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
test('STEP-01 a verified 10km run-walk beginner first progresses bouts, not weekly distance',()=>{
  let s=createEngine(amateur(),NOW);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,10000);
  s=runDays(s,0,14,true);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,10000);
  assert.equal(s.easyProgression?.lastIncreaseDate,null);
  assert.equal(s.runWalkProgression?.stage,1);
  assert.equal(s.profile.averageWeeklyKm4Weeks,10,'historic self-report is not falsified');
  assert.equal(s.profile.canRun3Km,false,'GREEN is not an automatic 3000m capability result');
  assert.ok(totalMeters(s)<=10000);
  assert.ok(s.queue.every(w=>w.main.dose.unit!=='METERS'||w.main.dose.value<=5000));
  const twice=replan(s,dateAfter(14));
  assert.equal(twice.easyProgression?.approvedMetersPer7Days,10000,'replan is idempotent');
  assert.equal(twice.runWalkProgression?.stage,1);
});
test('STEP-02 alternate full 14-day blocks allow 500m only after the bout step',()=>{
  const once=runDays(createEngine(amateur(),NOW),0,14,true);
  const twice=runDays(once,15,28,true);
  assert.equal(twice.easyProgression?.approvedMetersPer7Days,10500);
  assert.equal(twice.easyProgression?.lastIncreaseDate,dateAfter(28));
  assert.ok(totalMeters(twice)<=10500);
  assert.equal(twice.runWalkProgression?.stage,1);
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
  if(both.ok)assert.equal(both.result.feedbackConfirmed,undefined,'missing safety answer cannot approve load');
  const allThree=buildWorkoutResult(w,{...draft,completionConfirmed:true,effortConfirmed:true,safetyResponse:'NO_SYMPTOMS'});
  assert.equal(allThree.ok,true);
  if(allThree.ok)assert.equal(allThree.result.feedbackConfirmed,true);
});
test('STEP-12 explicit T0 capability update stays separate from measured 3000m performance',()=>{
  const initial=createEngine(amateur(),NOW);
  const advanced=updateTrainingData(initial,{canRun3Km:true},NOW);
  assert.equal(advanced.profile.canRun3Km,true);
  assert.equal(advanced.profile.performance,null);
  assert.equal(advanced.checkpointRequired,true);
  assert.deepEqual(initial.profile.safety,healthy());
});

test('STEP-13 twelve-week T0 replay alternates bout and meter increases without inventing 3km ability',()=>{
  let state=createEngine(amateur({raceDate:dateAfter(105)}),NOW);
  let lastApproved=10000, steps=0;
  for(let offset=0;offset<=84;offset++){
    const today=dateAfter(offset);
    state=replan(state,today);
    const approved=state.easyProgression!.approvedMetersPer7Days;
    assert.ok(approved>=lastApproved && approved-lastApproved<=500,`unexpected jump on ${today}`);
    if(approved!==lastApproved) {
      assert.equal(offset%14,0,'only two-week boundary can raise the budget');
      steps++;
    }
    lastApproved=approved;
    const w=state.queue.find(x=>x.scheduledDate===today);
    if(w&&w.type!=='REST')state=recordResult(state,w.id,measured(w));
    const longs=state.queue.filter(x=>x.type==='LONG_EASY');
    assert.ok(longs.length<=1,`${today}: more than one LONG_EASY in queue`);
    assert.equal(state.profile.performance,null,'feedback cannot invent a 3km race time');
    assert.equal(state.profile.canRun3Km,false,'run/walk alone does not certify continuous 3km');
  }
  assert.equal(steps,3,'only three distance reviews across six verified blocks');
  assert.equal(state.easyProgression?.approvedMetersPer7Days,11500);
  assert.equal(state.runWalkProgression?.stage,3);
});
test('STEP-14 a missed second week cannot lead to two catch-up increases on a later reopen',()=>{
  let state=createEngine(amateur(),NOW);
  state=runDays(state,0,28,true);
  assert.equal(state.easyProgression?.approvedMetersPer7Days,10500);
  // A 28-day pause without reports must not produce any further credits.
  state=replan(state,dateAfter(56));
  assert.equal(state.easyProgression?.approvedMetersPer7Days,10500);
});

test('STEP-15 eight weeks with a miss every third session do not create catch-up load',()=>{
  let state=createEngine(amateur({raceDate:dateAfter(85)}),NOW);
  let index=0;
  for(let offset=0;offset<=56;offset++){
    const today=dateAfter(offset);state=replan(state,today);
    const w=state.queue.find(x=>x.scheduledDate===today);
    if(w&&w.type!=='REST'){
      index++;
      state=index%3===0?skipWorkout(state,w.id,today):recordResult(state,w.id,measured(w));
    }
  }
  assert.ok(state.skippedIds.length>=4);
  assert.equal(state.easyProgression?.approvedMetersPer7Days,10000);
  assert.equal(state.profile.canRun3Km,false);
});
test('STEP-16 trained 10-week plan never assumes a faster 3000m result or unverified growth',()=>{
  const current={timeSeconds:880,date:NOW,source:'TEST_3K' as const};
  const trained=profile({
    performance:current,canRun3Km:true,raceDate:dateAfter(100),
    actualRunsPerWeek:4,availableRunsPerWeek:6,
    regularRunningWeeks:40,averageWeeklyKm4Weeks:28,longestUsualRunKm:9,
    qualitySessions8Weeks:8,qualityWeeks8Weeks:6,qualityMostlyTolerated:true,
    experience:{threshold:true,vo2:true,specific3k:true},
  });
  let state=createEngine(trained,NOW);
  let priorBudget=state.easyProgression!.approvedMetersPer7Days;
  for(let offset=0;offset<=70;offset++){
    const today=dateAfter(offset);
    state=replan(state,today);
    const budget=state.easyProgression!.approvedMetersPer7Days;
    assert.ok(budget>=priorBudget && budget-priorBudget<=1000);
    priorBudget=budget;
    const w=state.queue.find(x=>x.scheduledDate===today);
    if(w&&w.type!=='REST'){
      const repeats=w.speedRangeMps?
        [{distanceMeters:600,seconds:600/((w.speedRangeMps[0]+w.speedRangeMps[1])/2)}]:[];
      state=recordResult(state,w.id,feedback(w,'GREEN',{
        feedbackConfirmed:true,durationMinutes:35,repeats,
        distanceMeters:Math.max(w.main.dose.unit==='METERS'?w.main.dose.value:0,
          repeats.reduce((n,r)=>n+r.distanceMeters,0)),
      }));
    }
    assert.equal(state.profile.performance?.timeSeconds,880);
    assert.ok(state.queue.filter(x=>x.type==='LONG_EASY').length<=1);
  }
  assert.ok(state.easyProgression!.approvedMetersPer7Days<=33000,
    'maximum five 1 km steps are possible across the elapsed 10 weeks');
});
