/** Issue #30: numeric EASY/LONG_EASY targets are individual and persisted. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, createEngine, deserialize, prescribe, serialize} from '../src/index.ts';
import {initialEasyPace} from '../src/easyPace.ts';
import {estimatedEasyTimeText, treadmillSpeedText, workoutInstruction} from '../web/src/ui/workoutInstructions.ts';
import {NOW, dateAfter, profile} from './helpers.ts';

const t1 = () => createEngine(profile({
  performance: {timeSeconds:900,date:NOW,source:'TEST_3K'},
  targetTimeSeconds:870,
  canRun3Km:true,regularRunningWeeks:8,actualRunsPerWeek:2,availableRunsPerWeek:2,
  averageWeeklyKm4Weeks:10,longestUsualRunKm:5,raceDate:dateAfter(56),
}),NOW);

test('PACE-01: 15:00 current / 14:30 goal: EASY 5 km receives explicit numerical target',()=>{
  const s=t1();
  assert.equal(s.decision.capacity,'T1');
  const w=prescribe(s,'EASY',NOW,'easy-5');
  assert.deepEqual(w.paceRangeSecondsPerKm,[410,455]);
  assert.deepEqual(w.targetRpe,[2,4]);
  assert.deepEqual(w.speedRangeMps,[1000/455,1000/410]);
  assert.equal(w.main.dose.value,5000);
  assert.equal(treadmillSpeedText(w),'8,0–8,7 км/ч');
  assert.equal(estimatedEasyTimeText(w),'34:10–37:55');
  const display=workoutInstruction(w);
  assert.equal(display.paceText,'6:50–7:35 мин/км');
  assert.ok(display.steps.some(x=>x.includes('Не бегите быстрее 6:50 мин/км')));
  assert.ok(display.steps.some(x=>x.includes('Ожидаемое время') && x.includes('34:10–37:55')));
});

test('PACE-02: faster current performance gives faster EASY targets at the same T1 capacity',()=>{
  const fast=initialEasyPace(720,true,'HIGH','T1');
  const slow=initialEasyPace(1020,true,'HIGH','T1');
  assert.ok(fast.paceRangeSecondsPerKm![0]<slow.paceRangeSecondsPerKm![0]);
  assert.ok(fast.paceRangeSecondsPerKm![1]<slow.paceRangeSecondsPerKm![1]);
});
test('PACE-03: training level affects prescription, desired exam result does not',()=>{
  const low=initialEasyPace(900,true,'HIGH','T1');
  const trained=initialEasyPace(900,true,'HIGH','T3');
  assert.ok(low.paceRangeSecondsPerKm![0]>trained.paceRangeSecondsPerKm![0]);
  const s=t1(), different=createEngine({...s.profile,targetTimeSeconds:830},NOW);
  assert.deepEqual(prescribe(s,'EASY',NOW,'a').paceRangeSecondsPerKm,
    prescribe(different,'EASY',NOW,'b').paceRangeSecondsPerKm);
});

test('PACE-04: intermediate confidence reduces speed instead of accelerating toward goal',()=>{
  const fresh=initialEasyPace(900,true,'HIGH','T2');
  const medium=initialEasyPace(900,true,'MEDIUM','T2');
  assert.ok(medium.paceRangeSecondsPerKm![0]>fresh.paceRangeSecondsPerKm![0]);
  assert.ok(medium.paceRangeSecondsPerKm![1]>fresh.paceRangeSecondsPerKm![1]);
});

test('PACE-05: no 3 km baseline, stale 3 km or noncontinuous runner never receive fake pace',()=>{
  for(const input of [
    initialEasyPace(null,true,'UNKNOWN','T1'),
    initialEasyPace(900,true,'LOW','T2'),
    initialEasyPace(900,false,'HIGH','T0'),
    initialEasyPace(Number.NaN,true,'HIGH','T2'),
  ]){
    assert.equal(input.paceRangeSecondsPerKm,null);
    assert.equal(input.speedRangeMps,null);
  }
  const noData=createEngine(profile({performance:null}),NOW);
  const w=prescribe(noData,'EASY',NOW,'no-result');
  assert.equal(w.paceRangeSecondsPerKm,null);
  assert.equal(estimatedEasyTimeText(w),null);
});

test('PACE-06: LONG_EASY target uses its own assigned distance, not a generic time',()=>{
  const s=t1();
  const w=prescribe(s,'LONG_EASY',NOW,'long');
  assert.deepEqual(w.paceRangeSecondsPerKm,[410,455]);
  assert.equal(estimatedEasyTimeText(w),'34:10–37:55');
  assert.equal(w.main.dose.value,5000);
});

test('PACE-07: saving and reopening preserves target and exact schedule',()=>{
  const s=t1();
  const w=prescribe(s,'EASY',NOW,'easy-stable');
  s.queue=[w];
  const restored=deserialize(serialize(s));
  assert.deepEqual(restored.queue,[w]);
  assert.equal(restored.queue[0]!.id,'easy-stable');
  assert.equal(restored.queue[0]!.scheduledDate,NOW);
});

test('PACE-08: pre-upgrade stored EASY without pace is enriched, without altering dose or queue history',()=>{
  const s=t1();
  const w=prescribe(s,'EASY',NOW,'legacy-easy');
  const old={...w,anchor:'EFFORT' as const,paceRangeSecondsPerKm:null,speedRangeMps:null};
  s.queue=[old];
  const history=JSON.stringify(s.history);
  const restored=deserialize(serialize(s));
  assert.deepEqual(restored.queue[0]!.paceRangeSecondsPerKm,[410,455]);
  assert.equal(restored.queue[0]!.main.dose.value,w.main.dose.value);
  assert.equal(restored.queue[0]!.scheduledDate,w.scheduledDate);
  assert.equal(restored.queue[0]!.id,w.id);
  assert.equal(JSON.stringify(restored.history),history);
});

test('PACE-09: legacy unpaced RUN_WALK, quality work, REST are not assigned an EASY speed',()=>{
  const s=t1();
  for (const type of ['INTRO_QUALITY','REST'] as const){
    const w=prescribe(s,type,NOW,'test-'+type);
    assert.equal(w.paceRangeSecondsPerKm,null);
    s.queue=[w];
    assert.deepEqual(deserialize(serialize(s)).queue,[w]);
  }
});

test('PACE-10: measured EASY pace inside range passes; too fast and too slow are detected',()=>{
  const w=prescribe(t1(),'EASY',NOW,'measured-5k');
  const result=(minutes: number)=>({
    date:NOW, completionFraction:1, sessionRpe:3,
    safety:{pain:0,painIncreasing:false,alteredMovement:false,painWalkingOrRest:false,swelling:false,acuteIllness:false,otherStop:false,needsAssessment:false},
    durationMinutes:minutes,distanceMeters:5000,repeats:[],restSeconds:[],
    conditions:{heat:false,wind:false},unexpectedFatigue:false,feedbackConfirmed:true,
  });
  const inRange=classify(w,result(36));
  assert.equal(inRange.evaluation,'GREEN');
  assert.equal(inRange.inRangeFraction,1);
  const tooFast=classify(w,result(30));
  assert.equal(tooFast.evaluation,'YELLOW');
  assert.equal(tooFast.yellowReason,'EXECUTION');
  assert.equal(tooFast.inRangeFraction,0);
  const tooSlow=classify(w,result(40));
  assert.equal(tooSlow.evaluation,'YELLOW');
  assert.equal(tooSlow.inRangeFraction,0);
});

test('PACE-11: missing actual pace measurement does not invent failed splits',()=>{
  const w=prescribe(t1(),'EASY',NOW,'unmeasured-5k');
  const r={
    date:NOW, completionFraction:1, sessionRpe:3,
    safety:{pain:0,painIncreasing:false,alteredMovement:false,painWalkingOrRest:false,swelling:false,acuteIllness:false,otherStop:false,needsAssessment:false},
    durationMinutes:0,distanceMeters:0,repeats:[],restSeconds:[],
    conditions:{heat:false,wind:false},unexpectedFatigue:false,
  };
  assert.equal(classify(w,r).inRangeFraction,1,'unknown is neither a pace success nor a failure');
});
