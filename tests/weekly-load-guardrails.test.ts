/**
 * Tests for the protective baseline guard, not a claim that baseline mileage is a full adaptive
 * training model. Unknown time-based intensity is deliberately NOT converted into invented miles.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, recordResult, replan, skipWorkout, applyBreak} from '../src/index.ts';
import type {Workout, EngineState} from '../src/index.ts';
import {NOW, dateAfter, feedback, profile, experienced} from './helpers.ts';

const noContinuous3k = (overrides: Parameters<typeof profile>[0]={})=>profile({
  canRun3Km:false, performance:null, raceDate:dateAfter(80),
  actualRunsPerWeek:2, availableRunsPerWeek:7, averageWeeklyKm4Weeks:10,
  longestUsualRunKm:6, qualitySessions8Weeks:0, qualityWeeks8Weeks:0,
  ...overrides,
});
function distanceIn7Days(state: EngineState, ending: string):number {
  const end=Date.parse(ending+'T00:00:00Z')/86400000;
  const all=[...state.history.map(h=>h.workout),...state.queue];
  return all.filter(w=>{
    const d=Date.parse(w.scheduledDate+'T00:00:00Z')/86400000;
    return d>=end-6&&d<=end&&w.main.dose.unit==='METERS' && w.type!=='REST';
  }).reduce((sum,w)=>sum+w.main.dose.value,0);
}

test('LOAD-GUARD-01 for every calendar availability, low-history athlete never gets more runs than habitual',()=>{
  for(const actual of [0,1,2,3,4,5,6,7]) for(let available=1;available<=7;available++){
    const state=createEngine(noContinuous3k({
      actualRunsPerWeek:actual,availableRunsPerWeek:available,
      averageWeeklyKm4Weeks: actual === 0 ? 0 : actual*5,
      longestUsualRunKm:6,
    }),NOW);
    const upper=Math.min(available,Math.max(1,actual));
    assert.ok(state.queue.filter(w=>w.type!=='REST').length<=upper,`actual=${actual}, available=${available}`);
    const budget=actual>0? actual*5000 : 1000;
    const total=state.queue.filter(w=>w.main.dose.unit==='METERS').reduce((n,w)=>n+w.main.dose.value,0);
    assert.ok(total<=budget+1e-6,`actual=${actual}, available=${available}, metres=${total}, budget=${budget}`);
  }
});

test('LOAD-GUARD-02 one rolling week with many free days never exceeds easy-distance baseline',()=>{
  let state=createEngine(noContinuous3k({
    actualRunsPerWeek:7,averageWeeklyKm4Weeks:10,availableRunsPerWeek:7,
    longestUsualRunKm:6,
  }),NOW);
  for(let i=0;i<13;i++){
    const currentDate=dateAfter(i);
    state=replan(state,currentDate);
    assert.ok(distanceIn7Days(state,currentDate)<=10000+1e-6,`rolling window ending ${currentDate}`);
    const workout=state.queue.find(w=>w.scheduledDate===currentDate);
    if(workout){
      state=recordResult(state,workout.id,feedback(workout,'GREEN',{
        durationMinutes:workout.type==='REST'?0:30,
        distanceMeters:workout.main.dose.unit==='METERS'?workout.main.dose.value:0,
        repeats:[],
      }));
      assert.ok(distanceIn7Days(state,currentDate)<=10000+1e-6,currentDate);
    }
  }
});

test('LOAD-GUARD-03 every available 1–7 profile has at most one long in any rolling seven days, including completed history',()=>{
  let state=createEngine(noContinuous3k({
    actualRunsPerWeek:7,averageWeeklyKm4Weeks:49,
    longestUsualRunKm:10,availableRunsPerWeek:7,
  }),NOW);
  const recorded:Workout[]=[];
  for(let i=0;i<14;i++){
    const date=dateAfter(i);
    state=replan(state,date);
    const today=state.queue.find(w=>w.scheduledDate===date);
    if(today){
      recorded.push(today);
      state=recordResult(state,today.id,feedback(today,'GREEN',{
        distanceMeters:today.main.dose.unit==='METERS'?today.main.dose.value:0,
        repeats:[],
      }));
    }
  }
  for(const w of recorded){
    const wd=Date.parse(w.scheduledDate+'T00:00:00Z');
    const longs=recorded.filter(a=>a.type==='LONG_EASY'&&Date.parse(a.scheduledDate+'T00:00:00Z')<=wd&&Date.parse(a.scheduledDate+'T00:00:00Z')>wd-7*86400000);
    assert.ok(longs.length<=1,`${w.scheduledDate}: longs=${longs.map(x=>x.scheduledDate)}`);
  }
});

test('LOAD-GUARD-04 a skip does not create extra running days or excessive debt',()=>{
  const state=createEngine(noContinuous3k(),NOW);
  const after=skipWorkout(state,state.queue[0]!.id,NOW);
  assert.ok(after.queue.filter(w=>w.type!=='REST').length<=2);
  assert.ok(after.queue.reduce((s,w)=>s+(w.main.dose.unit==='METERS'?w.main.dose.value:0),0)<=10000);
  assert.equal(after.skippedIds.includes(state.queue[0]!.id),true);
});

test('LOAD-GUARD-05 a healthy break does not override the baseline frequency and mileage guard',()=>{
  const state=createEngine(noContinuous3k({performance:{timeSeconds:920,date:NOW,source:'TEST_3K'},canRun3Km:true}),NOW);
  const recovered=applyBreak(state,{days:8,endDate:dateAfter(8),reason:'WORK'},dateAfter(8));
  assert.ok(recovered.queue.filter(w=>w.type!=='REST').length<=2);
  assert.ok(recovered.queue.filter(w=>w.main.dose.unit==='METERS').reduce((n,w)=>n+w.main.dose.value,0)<=10000);
});

test('LOAD-GUARD-06 quality-workout recovery and type are not changed by easy-distance guard',()=>{
  const p=profile({...experienced,availableRunsPerWeek:4,actualRunsPerWeek:4,
    averageWeeklyKm4Weeks:28,longestUsualRunKm:9,raceDate:dateAfter(100)});
  const s=createEngine(p,NOW);
  assert.ok(s.queue.some(w=>w.countsAsQuality),'experienced profile retains quality sessions');
  for(const w of s.queue.filter(w=>w.countsAsQuality))assert.ok(w.minimumRecoveryHoursBeforeQuality>=48);
});

test('LOAD-GAP-07 a successful T0 athlete cannot advance canRun3Km from training feedback alone',()=>{
  let state=createEngine(noContinuous3k(),NOW);
  for(let i=0;i<35;i++){
    const date=dateAfter(i);
    state=replan(state,date);
    const w=state.queue.find(item=>item.scheduledDate===date);
    if(w && w.type!=='REST'){
      assert.equal(w.main.mode,'RUN_WALK');
      state=recordResult(state,w.id,feedback(w,'GREEN',{
        completionFraction:1,distanceMeters:w.main.dose.value,durationMinutes:30,repeats:[],
      }));
    }
  }
  assert.ok(state.history.length>=8,'multiple weeks of positive results were recorded');
  assert.equal(state.decision.capacity,'T0');
  assert.equal(state.profile.canRun3Km,false,'status is currently not updatable from completed sessions');
  assert.ok(state.queue.every(w=>w.type==='REST'||w.main.mode==='RUN_WALK'));
  // A separate capability check or explicit reassessment pathway is needed before deployment.
});
