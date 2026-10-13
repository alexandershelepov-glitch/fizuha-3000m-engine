/**
 * Total-load guardrail tests. Estimated reservations are NOT measured mileage or fitness gains.
 * Every history+queue rolling window must stay within the athlete's approved booking budget.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine,moveWorkout,prescribe,recordResult,replan,skipWorkout} from '../src/index.ts';
import {approvedWeekMeters,reservedMetres,scheduledMinutes,withinRollingWeekBudget} from '../src/weeklyLoad.ts';
import {NOW,dateAfter,experienced,feedback,profile} from './helpers.ts';
import type {EngineState,Workout} from '../src/index.ts';

const trained=(overrides:Parameters<typeof profile>[0]={})=>profile({
  ...experienced,canRun3Km:true,actualRunsPerWeek:4,availableRunsPerWeek:7,
  averageWeeklyKm4Weeks:28,longestUsualRunKm:9,raceDate:dateAfter(110),
  ...overrides,
});
const allWorkouts=(s:EngineState):Workout[]=>[...s.history.map(h=>h.workout),...s.queue];

test('TOTAL-01 every type of prescribed quality reserves warmup, cooldown and timed interval recoveries',()=>{
  const s=createEngine(trained(),NOW);
  for(const kind of ['INTRO_QUALITY','THRESHOLD','VO2','SPECIFIC_3K','CONTROL'] as const){
    const w=prescribe(s,kind,NOW,'quality-'+kind);
    const metres=reservedMetres(s,w);
    assert.ok(metres!==null&&metres>w.warmupMinutes*60*3,kind);
    assert.equal(w.warmupMinutes,10);
    assert.equal(w.cooldownMinutes,10);
    assert.ok(scheduledMinutes(w)>=20,kind);
    assert.ok(metres!>(w.main.dose.unit==='METERS'?w.main.dose.value:0));
  }
  const intro=prescribe(s,'INTRO_QUALITY',NOW,'intro');
  assert.equal(scheduledMinutes(intro),intro.main.dose.value+20+4.5);
});

test('TOTAL-02 known time is booked from current measured speed with a 10% protective buffer, never written as actual metres',()=>{
  const s=createEngine(trained({performance:{date:NOW,source:'TEST_3K',timeSeconds:900}}),NOW);
  const w=prescribe(s,'INTRO_QUALITY',NOW,'intro');
  const expected=(w.warmupMinutes+w.cooldownMinutes+w.main.dose.value+(w.main.repeats-1)*w.restSeconds/60)*60*(3000/900)*1.1;
  assert.ok(Math.abs(reservedMetres(s,w)!-expected)<1e-6);
  assert.equal(w.main.dose.unit,'MINUTES','prescription stays in its original units');
  assert.equal(w.paceRangeSecondsPerKm,null,'no invented intervals pace');
});

test('TOTAL-03 one planned week including mixed timed and metered sessions stays within the actual weekly budget',()=>{
  for(const weeklyKm of [8,10,15,18,20,25,28,35,42]){
    const s=createEngine(trained({averageWeeklyKm4Weeks:weeklyKm}),NOW);
    assert.ok(withinRollingWeekBudget(s,s.queue),String(weeklyKm));
    assert.ok(s.queue.every(w=>w.type==='REST'||reservedMetres(s,w)!<=approvedWeekMeters(s)+1e-6));
  }
});

test('TOTAL-04 weekends and previous completed quality are reserved before adding new EASY',()=>{
  let s=createEngine(trained(),NOW);
  for(let i=0;i<28;i++){
    const date=dateAfter(i);
    s=replan(s,date);
    assert.ok(withinRollingWeekBudget(s,allWorkouts(s)),date);
    const today=s.queue.find(w=>w.scheduledDate===date);
    if(today && today.type!=='REST'){
      s=recordResult(s,today.id,feedback(today,'GREEN',{
        durationMinutes:today.main.dose.unit==='MINUTES'?scheduledMinutes(today):35,
        distanceMeters:today.main.dose.unit==='METERS'?today.main.dose.value:0,
        repeats:[],sessionRpe:Math.min(9,today.targetRpe[0]),
      }));
      assert.ok(withinRollingWeekBudget(s,allWorkouts(s)),date+' after feedback');
    }
  }
});

test('TOTAL-05 small historical mileage never creates a fabricated tiny intensity workout',()=>{
  const s=createEngine(trained({
    actualRunsPerWeek:2,availableRunsPerWeek:7,
    averageWeeklyKm4Weeks:8,longestUsualRunKm:4,regularRunningWeeks:4,
    qualitySessions8Weeks:2,qualityWeeks8Weeks:2,
  }),NOW);
  assert.ok(withinRollingWeekBudget(s,s.queue));
  assert.ok(s.queue.every(w=>!w.countsAsQuality||reservedMetres(s,w)!<=8000));
});

test('TOTAL-06 run-walk warmup and cooldown minutes stay explicit while nonexistent race pace is not fabricated',()=>{
  const s=createEngine(profile({performance:null,canRun3Km:false,
    actualRunsPerWeek:0,availableRunsPerWeek:7,averageWeeklyKm4Weeks:0,
    longestUsualRunKm:0,qualitySessions8Weeks:0,qualityWeeks8Weeks:0,
    raceDate:dateAfter(100)}),NOW);
  const w=s.queue[0]!;
  assert.equal(w.main.mode,'RUN_WALK');
  assert.equal(w.main.dose.value,1000);
  assert.equal(scheduledMinutes(w),10,'walking warmup/cooldown are accounted as explicit time');
  assert.equal(reservedMetres(s,w),1000,'cannot assert unknown walking distance as fact');
  assert.equal(s.profile.performance,null);
});

test('TOTAL-07 changed-date rolling check forbids over-budget move and does not mutate input',()=>{
  const s=createEngine(trained(),NOW);
  const w=s.queue.find(w=>!w.countsAsQuality && w.type==='EASY');
  assert.ok(w,'fixture has a movable EASY');
  const old=w!.scheduledDate;
  // Simulate actual completed high volume in the prior rolling window.
  const oldWorkout=structuredClone(w!);
  oldWorkout.id='historical-easy';
  oldWorkout.scheduledDate=dateAfter(-1);
  oldWorkout.main.dose={unit:'METERS',value:28000};
  s.history.push({workout:oldWorkout,result:feedback(oldWorkout,'GREEN',{
    date:dateAfter(-1),distanceMeters:28000,repeats:[],
  }),classified:{evaluation:'GREEN',yellowReason:null,sessionLoad:0,inRangeFraction:1,speedDropFraction:0}});
  const pre=JSON.stringify(s);
  const target=[1,2,3,4,5,6].map(i=>dateAfter(i)).find(d=>!s.queue.some(other=>other.scheduledDate===d))!;
  assert.ok(target,'there is an unoccupied move slot');
  assert.throws(()=>moveWorkout(s,w!.id,target),(err:unknown)=>
    err instanceof Error&&err.message==='Move exceeds the approved rolling weekly load');
  assert.equal(JSON.stringify(s),pre,'engine does not mutate rejected moves');
  assert.equal(w!.scheduledDate,old);
});

test('TOTAL-08 skipped session never creates extra training debt and cannot enlarge future workload',()=>{
  let s=createEngine(trained(),NOW);
  const before=s.queue.reduce((n,w)=>n+(reservedMetres(s,w)??0),0);
  s=skipWorkout(s,s.queue[0]!.id,NOW);
  assert.ok(withinRollingWeekBudget(s,allWorkouts(s)));
  assert.ok(s.queue.reduce((n,w)=>n+(reservedMetres(s,w)??0),0)<=before+1e-6);
});
