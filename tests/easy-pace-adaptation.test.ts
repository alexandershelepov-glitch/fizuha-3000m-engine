/** Scenarios requested for Issue #30: five real starting levels and verified EASY adjustments.
 * Target examples test deterministic arithmetic, not medical/aerobic lab validation.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, createEngine, prescribe, recordResult} from '../src/index.ts';
import type {Workout, WorkoutResult, EngineState} from '../src/index.ts';
import {initialEasyPace} from '../src/easyPace.ts';
import {NOW, dateAfter, healthy, profile} from './helpers.ts';

const mmss = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

test('EASY-ADAPT-01: five starting profiles produce reproducible reference numbers',()=>{
  const samples = [
    {race:720,cap:'T3',regularRunningWeeks:80,actualRunsPerWeek:5,averageWeeklyKm4Weeks:40,longestUsualRunKm:12,expected:[310,345],name:'12:00'},
    {race:840,cap:'T2',regularRunningWeeks:20,actualRunsPerWeek:3,averageWeeklyKm4Weeks:18,longestUsualRunKm:7,expected:[365,410],name:'14:00'},
    {race:900,cap:'T1',regularRunningWeeks:8,actualRunsPerWeek:2,averageWeeklyKm4Weeks:10,longestUsualRunKm:5,expected:[410,455],name:'15:00'},
    {race:1020,cap:'T1',regularRunningWeeks:8,actualRunsPerWeek:2,averageWeeklyKm4Weeks:10,longestUsualRunKm:5,expected:[460,520],name:'17:00'},
  ] as const;
  for (const x of samples) {
    const s=createEngine(profile({
      performance:{timeSeconds:x.race,date:NOW,source:'TEST_3K'},
      targetTimeSeconds:x.race-30,
      regularRunningWeeks:x.regularRunningWeeks,actualRunsPerWeek:x.actualRunsPerWeek,
      availableRunsPerWeek:x.actualRunsPerWeek,averageWeeklyKm4Weeks:x.averageWeeklyKm4Weeks,
      longestUsualRunKm:x.longestUsualRunKm,raceDate:dateAfter(56),
    }),NOW);
    assert.equal(s.decision.capacity,x.cap,x.name);
    const w=prescribe(s,'EASY',NOW,'easy-'+x.name);
    assert.deepEqual(w.paceRangeSecondsPerKm,x.expected,x.name);
    assert.ok(w.speedRangeMps && w.speedRangeMps[0]<w.speedRangeMps[1]);
  }
  const beginner=initialEasyPace(null,false,'UNKNOWN','T0');
  assert.equal(beginner.paceRangeSecondsPerKm,null,'no precise 3km baseline, no invented speed');
});

function base(): EngineState {
  return createEngine(profile({
    performance:{timeSeconds:900,date:NOW,source:'TEST_3K'},
    targetTimeSeconds:870,regularRunningWeeks:8,actualRunsPerWeek:2,
    availableRunsPerWeek:2,averageWeeklyKm4Weeks:10,longestUsualRunKm:5,
    raceDate:dateAfter(56),
  }),NOW);
}
function submit(w: Workout, distance: number, minutes: number, rpe: number, completed: number, confirmed=true): WorkoutResult {
  return {
    date:w.scheduledDate,completionFraction:completed,sessionRpe:rpe,
    safety:healthy(),durationMinutes:minutes,distanceMeters:distance,
    repeats:[],restSeconds:[],conditions:{},unexpectedFatigue:false,
    ...(confirmed?{feedbackConfirmed:true}:{}),
  };
}
function withReport(s: EngineState, w: Workout, r: WorkoutResult): EngineState {
  s.history.push({workout:w,result:r,classified:classify(w,r)});
  return s;
}
test('EASY-ADAPT-02: after 3 of prescribed 5 km, next dose and pace respect measured ability',()=>{
  const s=base(),w=prescribe(s,'EASY',NOW,'prior');
  assert.equal(w.main.dose.value,5000);
  assert.deepEqual(w.paceRangeSecondsPerKm,[410,455]);
  withReport(s,w,submit(w,3000,21,7,.6));
  const next=prescribe(s,'EASY',NOW,'next');
  assert.equal(next.main.dose.value,3250,'3 km actual + a small step, not another 5 km');
  assert.deepEqual(next.paceRangeSecondsPerKm,[445,485],'7:25–8:05 /km');
  assert.equal(mmss(next.paceRangeSecondsPerKm![0]),'7:25');
  assert.deepEqual(next.speedRangeMps,[1000/485,1000/445]);
  assert.deepEqual(s.history[0]!.workout.paceRangeSecondsPerKm,[410,455],'history never rewritten');
});
test('EASY-ADAPT-03: full session but RPE 6 is followed by a slower, same-distance task',()=>{
  const s=base(),w=prescribe(s,'EASY',NOW,'prior');
  withReport(s,w,submit(w,5000,36,6,1));
  const next=prescribe(s,'EASY',NOW,'next');
  assert.equal(next.main.dose.value,5000);
  assert.ok(next.paceRangeSecondsPerKm![0]>w.paceRangeSecondsPerKm![0]);
});
test('EASY-ADAPT-04: fully completed 5 km at target RPE 3 does not auto-accelerate',()=>{
  const s=base(),w=prescribe(s,'EASY',NOW,'prior');
  withReport(s,w,submit(w,5000,36,3,1));
  const next=prescribe(s,'EASY',NOW,'next');
  assert.equal(next.main.dose.value,5000);
  assert.deepEqual(next.paceRangeSecondsPerKm,[410,455]);
});
test('EASY-ADAPT-05: unconfirmed, unmeasured or stale reports cannot affect speed',()=>{
  const examples=[
    {distance:3000,minutes:21,rpe:7,completed:.6,confirmed:false},
    {distance:0,minutes:0,rpe:7,completed:.6,confirmed:true},
  ];
  for(const x of examples){
    const s=base(),w=prescribe(s,'EASY',NOW,'prior');
    withReport(s,w,submit(w,x.distance,x.minutes,x.rpe,x.completed,x.confirmed));
    assert.deepEqual(prescribe(s,'EASY',NOW,'next').paceRangeSecondsPerKm,[410,455]);
  }
  const s=base(),w=prescribe(s,'EASY',NOW,'prior'),r=submit(w,3000,21,7,.6);
  // Date is older than 21 days; leave the unrelated current prescription alone.
  const oldDate=dateAfter(-24);
  s.history.push({workout:{...w,scheduledDate:oldDate},result:{...r,date:oldDate},
    classified:classify(w,{...r,date:oldDate})});
  assert.deepEqual(prescribe(s,'EASY',NOW,'next').paceRangeSecondsPerKm,[410,455]);
});
test('EASY-ADAPT-06: intentional faster EASY never makes the following prescription harder',()=>{
  const s=base(),w=prescribe(s,'EASY',NOW,'prior');
  withReport(s,w,submit(w,5000,30,3,1));
  assert.deepEqual(prescribe(s,'EASY',NOW,'next').paceRangeSecondsPerKm,[410,455]);
});
test('EASY-ADAPT-07: recordResult triggers revised prescriptions without editing performed history',()=>{
  const s=base();
  const w=s.queue.find(x=>x.type==='EASY'&&x.main.mode==='CONTINUOUS');
  assert.ok(w,'a regular 2-day runner receives a continuous EASY task');
  const actual=Math.min(w.main.dose.value*.6,3000);
  const mins=(actual/1000)*7;
  const next=recordResult(s,w.id,submit(w,actual,mins,7,.6));
  assert.equal(next.history.at(-1)?.workout.id,w.id);
  assert.equal(next.history.at(-1)?.result.distanceMeters,actual);
  const check=prescribe(next,'EASY',next.asOf,'probe');
  assert.ok(check.main.dose.value<5000);
  assert.ok(check.paceRangeSecondsPerKm![0]>410);
});
