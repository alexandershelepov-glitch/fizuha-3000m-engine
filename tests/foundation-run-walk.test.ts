import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBreak, createEngine, deserialize, recordResult, replan, serialize, skipWorkout} from '../src/index.ts';
import type {EngineState, Workout} from '../src/index.ts';
import {RUN_WALK_STAGES, LAST_RUN_WALK_STAGE} from '../src/runWalk.ts';
import {workoutInstruction} from '../web/src/ui/workoutInstructions.ts';
import {NOW, dateAfter, feedback, healthy, profile} from './helpers.ts';

function starter(km=0, actual=0) {
  return profile({
    performance:null, canRun3Km:false, raceDate:dateAfter(240),
    regularRunningWeeks:0, actualRunsPerWeek:actual, availableRunsPerWeek:7,
    averageWeeklyKm4Weeks:km, longestUsualRunKm:km,
    qualitySessions8Weeks:0, qualityWeeks8Weeks:0,
  });
}
function confirmed(w:Workout, confirmed=true) {
  return feedback(w,'GREEN',{
    feedbackConfirmed:confirmed, sessionRpe:3, completionFraction:1,
    distanceMeters:w.main.dose.unit==='METERS'?w.main.dose.value:0,
    durationMinutes:25, repeats:[], safety:healthy(),
  });
}
function play(s:EngineState, from:number, through:number, verified=true) {
  for(let i=from;i<=through;i++){
    const today=dateAfter(i);
    s=replan(s,today);
    const w=s.queue.find(w=>w.scheduledDate===today);
    if(w && w.type!=='REST') s=recordResult(s,w.id,confirmed(w,verified));
  }
  return s;
}
function meters(s:EngineState) {
  return s.queue.filter(w=>w.main.dose.unit==='METERS').reduce((n,w)=>n+w.main.dose.value,0);
}

test('FOUNDATION-01 zero-history athlete has one 1km run/walk session, real timed bouts and easy effort',()=>{
  const s=createEngine(starter(),NOW);
  assert.equal(s.decision.capacity,'T0');
  assert.equal(s.queue.length,1);
  const w=s.queue[0]!;
  assert.equal(w.main.mode,'RUN_WALK');
  assert.equal(w.main.dose.value,1000);
  assert.deepEqual(w.main.runWalk,{stage:0,runSeconds:30,walkSeconds:120});
  assert.deepEqual(w.targetRpe,[2,4]);
  assert.equal(w.warmupMinutes,5);
  assert.equal(w.cooldownMinutes,5);
  assert.equal(w.countsAsQuality,false);
  assert.ok(workoutInstruction(w).steps.some(x=>x.includes('30')&&x.includes('120')===false),'readable bout text');
  assert.ok(workoutInstruction(w).steps.some(x=>x.includes('шаги')&&x.includes('бег')));
});
test('FOUNDATION-02 verified first fortnight changes only running bouts, not weekly distance',()=>{
  const s=play(createEngine(starter(),NOW),0,14);
  assert.equal(s.runWalkProgression?.stage,1);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,1000);
  assert.equal(s.queue[0]?.main.runWalk?.runSeconds,45);
  assert.equal(s.profile.canRun3Km,false);
  assert.equal(s.profile.performance,null);
});
test('FOUNDATION-03 second verified fortnight increases zero baseline by at most 10%, never 500m',()=>{
  const s=play(createEngine(starter(),NOW),0,28);
  assert.equal(s.runWalkProgression?.stage,1);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,1100);
  assert.ok(meters(s)<=1100);
  assert.equal(s.profile.actualRunsPerWeek,0,'historical habitual frequency is never invented');
});
test('FOUNDATION-04 someone accustomed to 4km gets +200m, alternating with running intervals',()=>{
  const s=play(createEngine(starter(4,1),NOW),0,28);
  assert.equal(s.runWalkProgression?.stage,1);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,4200);
  assert.ok(meters(s)<=4200);
  assert.equal(s.queue.filter(w=>w.type!=='REST').length,1);
});
test('FOUNDATION-05 a confirmed 10km non-continuous runner does not raise bout difficulty and metres simultaneously',()=>{
  let s=play(createEngine(starter(10,2),NOW),0,14);
  assert.equal(s.runWalkProgression?.stage,1);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,10000);
  s=play(s,15,28);
  assert.equal(s.runWalkProgression?.stage,1);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,10500);
});
test('FOUNDATION-06 default/unverified success cannot grant a new stage or more kilometres',()=>{
  const s=play(createEngine(starter(1,1),NOW),0,56,false);
  assert.equal(s.runWalkProgression?.stage,0);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,1000);
});
test('FOUNDATION-07 a skipped running day blocks the entire 14-day stage review',()=>{
  let s=createEngine(starter(1,1));
  s=skipWorkout(s,s.queue[0]!.id,NOW);
  s=play(s,1,14);
  assert.equal(s.runWalkProgression?.stage,0);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,1000);
});
test('FOUNDATION-08 tired/incomplete feedback cannot grant stage advancement',()=>{
  let s=createEngine(starter(1,1));
  const first=s.queue[0]!;
  s=recordResult(s,first.id,feedback(first,'YELLOW',{
    feedbackConfirmed:true,completionFraction:.6,sessionRpe:7,
    distanceMeters:first.main.dose.value*.6,repeats:[],
  }));
  s=play(s,1,14);
  assert.equal(s.runWalkProgression?.stage,0);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,1000);
});
test('FOUNDATION-09 RED safety/medical stop blocks stage changes and future running',()=>{
  let s=createEngine(starter(1,1));
  const w=s.queue[0]!;
  s=recordResult(s,w.id,feedback(w,'RED',{feedbackConfirmed:true}));
  s=replan(s,dateAfter(14));
  assert.equal(s.runWalkProgression?.stage,0);
  assert.equal(s.diagnosticHold,true);
  assert.ok(s.queue.every(w=>w.type==='REST'));
});
test('FOUNDATION-10 break forces new verified weeks; never a catch-up leap',()=>{
  let s=play(createEngine(starter(1,1),NOW),0,6);
  s=applyBreak(s,{days:8,reason:'WORK',endDate:dateAfter(14)},dateAfter(14));
  assert.equal(s.runWalkProgression?.stage,0);
  s=replan(s,dateAfter(28));
  assert.equal(s.runWalkProgression?.stage,0);
});
test('FOUNDATION-11 legacy cycles load without retroactive stage credit or changed saved queue',()=>{
  let s=play(createEngine(starter(1,1),NOW),0,13);
  const raw=JSON.parse(serialize(s)) as EngineState;
  delete raw.runWalkProgression;
  const copy=deserialize(JSON.stringify(raw));
  assert.equal(copy.runWalkProgression?.stage,0);
  assert.deepEqual(copy.queue,raw.queue);
  copy.runWalkProgression!.stage=1;
  const again=replan(copy,dateAfter(14));
  assert.equal(again.runWalkProgression?.stage,1,'replan never awards a second step at the same boundary');
});
test('FOUNDATION-12 invalid stored ladder stages fail closed',()=>{
  const s=createEngine(starter(1,1));
  for(const stage of [-1,0.2,LAST_RUN_WALK_STAGE+1,Infinity]){
    const raw=JSON.parse(serialize(s)) as EngineState;
    raw.runWalkProgression={stage};
    if(stage===Infinity)raw.runWalkProgression={stage:9999};
    assert.throws(()=>deserialize(JSON.stringify(raw)),(e:unknown)=>e instanceof Error&&e.message==='Invalid saved training progression');
  }
});
test('FOUNDATION-13 12-week successful novice simulation never claims ability to run 3km',()=>{
  const s=play(createEngine(starter(1,1),NOW),0,84);
  assert.equal(s.profile.canRun3Km,false);
  assert.equal(s.profile.performance,null);
  assert.equal(s.decision.capacity,'T0');
  assert.equal(s.runWalkProgression?.stage,3);
  assert.ok(s.easyProgression!.approvedMetersPer7Days<=1300);
  assert.ok(s.queue.every(w=>w.main.mode==='RUN_WALK'||w.type==='REST'));
});
test('FOUNDATION-14 old saved RUN_WALK without pattern does not invent intervals on display',()=>{
  const w=createEngine(starter()).queue[0]!;
  delete w.main.runWalk;
  const steps=workoutInstruction(w).steps;
  assert.ok(steps.some(t=>t.includes('старой сохранённой')));
});
test('FOUNDATION-15 run-walk stages are finite, monotonic and never labelled a passed 3000m test',()=>{
  assert.equal(RUN_WALK_STAGES.length,LAST_RUN_WALK_STAGE+1);
  assert.ok(RUN_WALK_STAGES.every(s=>s.runSeconds>0&&s.walkSeconds>0));
  for(let i=1;i<RUN_WALK_STAGES.length;i++){
    assert.ok(RUN_WALK_STAGES[i]!.runSeconds>=RUN_WALK_STAGES[i-1]!.runSeconds);
    assert.ok(RUN_WALK_STAGES[i]!.walkSeconds<=RUN_WALK_STAGES[i-1]!.walkSeconds);
  }
});
