import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, replan, recordResult, skipWorkout, applyBreak, serialize, deserialize} from '../src/index.ts';
import {buildWorkoutResult, defaultResultDraft} from '../web/src/application/resultForm.ts';
import {NOW, dateAfter, feedback, profile, healthy} from './helpers.ts';
import type {EngineState, Workout} from '../src/index.ts';

const novice=(overrides:Parameters<typeof profile>[0]={})=>profile({
  canRun3Km:false, performance:null, raceDate:dateAfter(100), regularRunningWeeks:8,
  actualRunsPerWeek:2, availableRunsPerWeek:7, averageWeeklyKm4Weeks:10,
  longestUsualRunKm:6,qualitySessions8Weeks:0,qualityWeeks8Weeks:0,...overrides,
});

function simulate(s:EngineState, days:number, behaviour:(w:Workout,day:number)=>'GREEN'|'YELLOW'|'RED'|'MISS'|'UNVERIFIED' = ()=>'GREEN'):EngineState {
  for(let offset=0;offset<days;offset++){
    const now=dateAfter(offset);
    s=replan(s,now);
    const w=s.queue.find(w=>w.scheduledDate===now);
    if(!w||w.type==='REST')continue;
    const type=behaviour(w,offset);
    if(type==='MISS'){s=skipWorkout(s,w.id,now);continue;}
    s=recordResult(s,w.id,feedback(w,type==='UNVERIFIED'?'GREEN':type,{
      verifiedForProgression:type!=='UNVERIFIED',
      distanceMeters:w.main.dose.unit==='METERS'?w.main.dose.value:5000,
      completionFraction:type==='YELLOW'?.5:1,
      repeats:[],
      durationMinutes:35,safety:type==='RED'?{...healthy(),alteredMovement:true}:healthy(),
    }));
  }
  return replan(s,dateAfter(days));
}
test('EASY-PROG-01 14 calendar days and two consciously verified weeks approve exactly 500m',()=>{
  const original=createEngine(novice(),NOW);
  const after=simulate(original,14);
  assert.equal(original.easyProgression?.approvedMetersPer7Days,10000);
  assert.equal(after.easyProgression?.approvedMetersPer7Days,10500);
  assert.equal(after.easyProgression?.lastIncreaseDate,dateAfter(14));
  assert.equal(after.profile.averageWeeklyKm4Weeks,10,'do not replace history with invented new baseline');
  assert.equal(after.profile.actualRunsPerWeek,2,'no automatic increase in frequency');
  assert.equal(after.profile.canRun3Km,false,'GREEN is not evidence of continuous running');
  const sum=after.queue.filter(w=>w.main.dose.unit==='METERS').reduce((a,w)=>a+w.main.dose.value,0);
  assert.ok(sum<=10500);
  assert.ok(after.queue.some(w=>w.type==='EASY' && w.main.dose.value>5000),
    'new budget must appear in a real prescription, not just state metadata');
});
test('EASY-PROG-02 a prefilled or legacy GREEN does NOT unlock new EASY distance',()=>{
  const s=simulate(createEngine(novice(),NOW),28,()=> 'UNVERIFIED');
  assert.equal(s.easyProgression?.approvedMetersPer7Days,10000);
});
test('EASY-PROG-03 one missed workout or yellow blocks first 14-day increase',()=>{
  const withMiss=simulate(createEngine(novice(),NOW),14,(w,i)=>i===7?'MISS':'GREEN');
  assert.equal(withMiss.easyProgression?.approvedMetersPer7Days,10000);
  const withYellow=simulate(createEngine(novice(),NOW),14,(w,i)=>i===7?'YELLOW':'GREEN');
  assert.equal(withYellow.easyProgression?.approvedMetersPer7Days,10000);
});
test('EASY-PROG-04 repeated two-week blocks never cause multiple increases per day',()=>{
  let s=simulate(createEngine(novice(),NOW),14);
  assert.equal(s.easyProgression?.approvedMetersPer7Days,10500);
  for(let i=0;i<20;i++)s=replan(s,dateAfter(14));
  assert.equal(s.easyProgression?.approvedMetersPer7Days,10500);
});
test('EASY-PROG-05 small 1–4km baseline never receives the blanket 500m step',()=>{
  for(const km of [0,1,2,3,4]){
    const s=simulate(createEngine(novice({
      averageWeeklyKm4Weeks:km,longestUsualRunKm:km,
    }),NOW),35);
    assert.equal(s.easyProgression?.approvedMetersPer7Days,km===0?1000:km*1000,`km=${km}`);
  }
});
test('EASY-PROG-06 RED and diagnostic holds cannot award a progression step',()=>{
  const s=simulate(createEngine(novice(),NOW),14,(w,i)=>i===7?'RED':'GREEN');
  assert.equal(s.easyProgression?.approvedMetersPer7Days,10000);
  assert.equal(s.diagnosticHold,true);
});
test('EASY-PROG-07 re-entry after 8-day break never rewards absent weeks',()=>{
  let s=createEngine(novice());
  s=simulate(s,14);
  const approved=s.easyProgression?.approvedMetersPer7Days;
  s=applyBreak(s,{days:8,endDate:dateAfter(22),reason:'WORK'},dateAfter(22));
  assert.equal(s.easyProgression?.approvedMetersPer7Days,approved);
  assert.ok(s.reentry);
});
test('EASY-PROG-08 a verified result survives serialize/deserialize without double credit',()=>{
  let s=simulate(createEngine(novice(),NOW),14);
  const saved=serialize(s);
  const loaded=deserialize(saved);
  assert.equal(loaded.easyProgression?.approvedMetersPer7Days,10500);
  const repeated=replan(loaded,dateAfter(14));
  assert.equal(repeated.easyProgression?.approvedMetersPer7Days,10500);
  assert.equal(repeated.history.filter(h=>h.result.verifiedForProgression===true).length,4);
});
test('EASY-PROG-09 actual user selections, not prefills, mark a result verified',()=>{
  const s=createEngine(novice(),NOW);
  const w=s.queue[0]!;
  const draft=defaultResultDraft(w);
  assert.equal(draft.completionConfirmed,false);
  assert.equal(draft.effortConfirmed,false);
  const unconfirmed=buildWorkoutResult(w,{...draft,safetyResponse:'NO_SYMPTOMS'});
  assert.equal(unconfirmed.ok,true);
  if(unconfirmed.ok)assert.equal(unconfirmed.result.verifiedForProgression,false);
  const confirmed=buildWorkoutResult(w,{...draft,completionConfirmed:true,effortConfirmed:true,safetyResponse:'NO_SYMPTOMS'});
  assert.equal(confirmed.ok,true);
  if(confirmed.ok)assert.equal(confirmed.result.verifiedForProgression,true);
});
test('EASY-PROG-10 10-week fully verified scenario never invents measured 3 km time',()=>{
  const s=simulate(createEngine(novice(),NOW),70);
  assert.equal(s.profile.performance,null);
  assert.equal(s.profile.canRun3Km,false);
  assert.ok(s.easyProgression!.approvedMetersPer7Days>10000);
  assert.ok(s.easyProgression!.approvedMetersPer7Days<=12500);
  assert.ok(s.queue.filter(w=>w.type==='LONG_EASY').length<=1);
  assert.ok(s.queue.filter(w=>w.main.dose.unit==='METERS').reduce((sum,w)=>sum+w.main.dose.value,0)<=s.easyProgression!.approvedMetersPer7Days);
});
