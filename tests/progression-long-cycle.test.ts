/**
 * 8–12 week virtual clock scenarios against the actual public engine.
 * Reported workout tolerance is an injected event, not a prediction of physiological improvement.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine,replan,recordResult,skipWorkout} from '../src/index.ts';
import type {EngineState, Profile} from '../src/index.ts';
import {NOW,dateAfter,profile,feedback,healthy,experienced} from './helpers.ts';

interface Scenario {id:string;weeks:number;cfg:Partial<Profile>;kind:'SUCCESS'|'UNVERIFIED'|'MISSED'|'OVERLOAD'}
const scenarios:Scenario[]=[
  {id:'T0 10 weeks beginner 10km',weeks:10,kind:'SUCCESS',
    cfg:{performance:null,canRun3Km:false,regularRunningWeeks:8,actualRunsPerWeek:2,availableRunsPerWeek:7,averageWeeklyKm4Weeks:10,longestUsualRunKm:6}},
  {id:'T1 8 weeks habit 12km',weeks:8,kind:'SUCCESS',
    cfg:{regularRunningWeeks:6,actualRunsPerWeek:2,availableRunsPerWeek:4,averageWeeklyKm4Weeks:12,longestUsualRunKm:6}},
  {id:'T2 10 weeks trained with skipped runs',weeks:10,kind:'MISSED',
    cfg:{regularRunningWeeks:20,actualRunsPerWeek:3,availableRunsPerWeek:5,averageWeeklyKm4Weeks:22,longestUsualRunKm:7}},
  {id:'T3 12 weeks advanced, measured performance unchanged',weeks:12,kind:'SUCCESS',
    cfg:{...experienced,regularRunningWeeks:60,actualRunsPerWeek:5,availableRunsPerWeek:7,averageWeeklyKm4Weeks:45,longestUsualRunKm:11,performance:{timeSeconds:810,date:NOW,source:'TEST_3K'},targetTimeSeconds:780}},
  {id:'T1 8 weeks unverified GREEN',weeks:8,kind:'UNVERIFIED',
    cfg:{regularRunningWeeks:6,actualRunsPerWeek:2,availableRunsPerWeek:4,averageWeeklyKm4Weeks:12,longestUsualRunKm:6}},
  {id:'T1 10 weeks repeated exhaustion',weeks:10,kind:'OVERLOAD',
    cfg:{regularRunningWeeks:6,actualRunsPerWeek:2,availableRunsPerWeek:4,averageWeeklyKm4Weeks:12,longestUsualRunKm:6}},
];

function run(scenario:Scenario):EngineState {
  let s=createEngine(profile({...scenario.cfg,raceDate:dateAfter(scenario.weeks*7+7)}),NOW);
  let n=0;
  for(let i=0;i<scenario.weeks*7;i++){
    const date=dateAfter(i);
    s=replan(s,date);
    const w=s.queue.find(w=>w.scheduledDate===date);
    if(!w)continue;
    if(w.type==='REST'){
      s=recordResult(s,w.id,feedback(w,'GREEN',{feedbackConfirmed:true,durationMinutes:0,distanceMeters:0,repeats:[]}));
      continue;
    }
    ++n;
    if(scenario.kind==='MISSED' && n%4===0){
      s=skipWorkout(s,w.id,date);continue;
    }
    let kind:'GREEN'|'YELLOW'='GREEN';
    if(scenario.kind==='OVERLOAD'&&n%3===0)kind='YELLOW';
    const actual=feedback(w,kind,{
      completionFraction:kind==='GREEN'?1:.5,
      feedbackConfirmed:scenario.kind==='UNVERIFIED'?undefined:true,
      durationMinutes:30,
      distanceMeters: w.main.dose.unit==='METERS'?w.main.dose.value:5000,
      safety:healthy(),
    });
    s=recordResult(s,w.id,actual);
    assert.equal(s.finalResultRecorded,false);
    assert.equal(s.profile.canRun3Km,scenario.cfg.canRun3Km??true);
  }
  return replan(s,dateAfter(scenario.weeks*7));
}
for(const scenario of scenarios){
  test('LONG-PROGRESSION '+scenario.id,()=>{
    const s=run(scenario);
    const base=(scenario.cfg.averageWeeklyKm4Weeks??16)*1000;
    const approved=s.easyProgression?.approvedMetersPer7Days??0;
    assert.ok(approved<=base+scenario.weeks*500,
      'approval cannot jump weekly distance by several kilometres');
    if(scenario.kind==='UNVERIFIED'||scenario.kind==='OVERLOAD')
      assert.equal(approved,base,'no automatic increases from unverified/overloaded training');
    const recorded=s.history.filter(h=>h.workout.type!=='REST');
    assert.ok(recorded.length>0,'actual workout results were reported');
    for(const h of recorded){
      const sameWeekLongs=s.history.filter(x=>x.workout.type==='LONG_EASY' &&
        Date.parse(x.workout.scheduledDate+'T00:00:00Z')<=Date.parse(h.workout.scheduledDate+'T00:00:00Z') &&
        Date.parse(x.workout.scheduledDate+'T00:00:00Z')>Date.parse(h.workout.scheduledDate+'T00:00:00Z')-7*86400000);
      assert.ok(sameWeekLongs.length<=1,'at most one LONG_EASY in rolling 7 days');
    }
    if(scenario.id.startsWith('T0'))assert.equal(s.profile.performance,null);
    else assert.equal(s.profile.performance?.timeSeconds, scenario.cfg.performance?.timeSeconds??920);
  });
}
