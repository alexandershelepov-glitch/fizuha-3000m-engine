/** Issue #30, phase 3: concrete beginner calibration + bounded success-based EASY tuning.
 * A timed easy session is NOT a measured 3000m race result.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, createEngine, deserialize, prescribe, recordResult, serialize} from '../src/index.ts';
import type {EngineState, Workout, WorkoutResult} from '../src/index.ts';
import {beginnerEasyPace} from '../src/easyPace.ts';
import {NOW, dateAfter, healthy, profile} from './helpers.ts';
import {defaultResultDraft, buildWorkoutResult} from '../web/src/application/resultForm.ts';
import {workoutInstruction} from '../web/src/ui/workoutInstructions.ts';

const beginner = (canRun3Km=true): EngineState => createEngine(profile({
  performance:null, canRun3Km, targetTimeSeconds:900, raceDate:dateAfter(60),
  regularRunningWeeks:8, actualRunsPerWeek:2, availableRunsPerWeek:2,
  averageWeeklyKm4Weeks:10, longestUsualRunKm:4,
}),NOW);
const timed = (w:Workout, meters:number, minutes:number, rpe=3, confirmed=true):WorkoutResult => ({
  date:w.scheduledDate,completionFraction:meters/w.main.dose.value,
  sessionRpe:rpe,safety:healthy(),distanceMeters:meters,durationMinutes:minutes,
  repeats:[],restSeconds:[],conditions:{},unexpectedFatigue:false,
  ...(confirmed?{feedbackConfirmed:true}:{}),
});
function append(s:EngineState,w:Workout, r:WorkoutResult):void{
  s.history.push({workout:w,result:r,classified:classify(w,r)});
}
test('CAL-01: beginner with 3km continuous ability but no race time receives exactly a measured 2km task',()=>{
  const s=beginner(),w=prescribe(s,'EASY',NOW,'cal-1');
  assert.equal(w.main.mode,'CONTINUOUS');
  assert.equal(w.main.calibration,true);
  assert.equal(w.main.dose.value,2000);
  assert.equal(w.paceRangeSecondsPerKm,null);
  assert.equal(w.speedRangeMps,null);
  const instruction=workoutInstruction(w);
  assert.match(instruction.headline,/калибровка темпа/);
  assert.ok(instruction.steps.some(x=>x.includes('Пробегите 2 км')));
  assert.ok(instruction.steps.some(x=>x.includes('2–4 из 10')));
  assert.ok(instruction.steps.some(x=>x.includes('Засеките фактическое время')));
  assert.ok(instruction.steps.some(x=>x.includes('двух подтверждённых измерений')));
});
test('CAL-02: two confirmed consistent trials generate provisional PERSONAL EASY target and 3km next dose',()=>{
  const s=beginner();
  const first=prescribe(s,'EASY',NOW,'cal-1');
  append(s,first,timed(first,2000,16,3)); // 8:00/km
  const afterOne=prescribe(s,'EASY',dateAfter(3),'cal-2');
  assert.equal(afterOne.main.calibration,true);
  assert.equal(afterOne.main.dose.value,2000);
  append(s,afterOne,timed(afterOne,2000,16.5,3)); // 8:15/km
  s.asOf=dateAfter(7);
  const next=prescribe(s,'EASY',dateAfter(7),'cal-3');
  assert.equal(next.main.calibration,undefined);
  assert.equal(next.main.dose.value,3000,'no immediate leap from 2km to 5km');
  assert.deepEqual(next.paceRangeSecondsPerKm,[510,560],'8:30–9:20/km from slower of two measured training paces');
  assert.deepEqual(next.speedRangeMps,[1000/560,1000/510]);
  assert.equal(s.profile.performance,null,'no invented race time');
  assert.equal(workoutInstruction(next).paceText,'8:30–9:20 мин/км');
});
test('CAL-03: one measured trial is not enough to invent a pace',()=>{
  const s=beginner(),one=prescribe(s,'EASY',NOW,'one');
  append(s,one,timed(one,2000,16));
  assert.equal(beginnerEasyPace(s),null);
  assert.equal(prescribe(s,'EASY',NOW,'two').main.calibration,true);
});
test('CAL-04: hard, unconfirmed, incomplete or incompatible trials do not calibrate',()=>{
  for (const invalid of [
    {meters:2000,minutes:16,rpe:6,confirmed:true},
    {meters:2000,minutes:16,rpe:3,confirmed:false},
    {meters:1000,minutes:8,rpe:3,confirmed:true},
    {meters:2000,minutes:23,rpe:3,confirmed:true},
  ]) {
    const s=beginner();
    const w1=prescribe(s,'EASY',NOW,'one');
    append(s,w1,timed(w1,2000,16,3));
    const w2=prescribe(s,'EASY',dateAfter(3),'two');
    append(s,w2,timed(w2,invalid.meters,invalid.minutes,invalid.rpe,invalid.confirmed));
    s.asOf=dateAfter(7);
    assert.equal(prescribe(s,'EASY',dateAfter(7),'three').main.calibration,true,
      'ambiguous or unsuccessful measurement cannot establish speed');
  }
});
test('CAL-05: first ever runner uses exact RUN_WALK time intervals; walking cannot be mistaken for running pace',()=>{
  const s=beginner(false),w=prescribe(s,'EASY',NOW,'walk');
  assert.equal(w.main.mode,'RUN_WALK');
  assert.deepEqual(w.main.runWalk,{stage:0,runSeconds:30,walkSeconds:120});
  assert.equal(w.main.calibration,undefined);
  append(s,w,timed(w,1000,15));
  append(s,w,timed(w,1000,15));
  assert.equal(beginnerEasyPace(s),null);
  assert.equal(prescribe(s,'EASY',NOW,'walk-2').speedRangeMps,null);
});
test('CAL-06: calibration form requires actual distance and time, never prefills a measured result',()=>{
  const w=prescribe(beginner(),'EASY',NOW,'cal');
  const d=defaultResultDraft(w);
  assert.equal(d.durationMinutes,'');
  assert.equal(d.distanceMeters,'');
  assert.equal(buildWorkoutResult(w,d).ok,false);
  assert.equal(buildWorkoutResult(w,{...d,durationMinutes:'16',distanceMeters:''}).ok,false);
  assert.equal(buildWorkoutResult(w,{...d,durationMinutes:'16',distanceMeters:'2000'}).ok,true);
});
test('CAL-07: calibration flag and assigned distance survive save/reload without changes',()=>{
  const s=beginner(),found=s.queue.find(x=>x.main.calibration === true);
  assert.ok(found);
  const loaded=deserialize(serialize(s));
  assert.deepEqual(loaded.queue.find(x=>x.id===found.id),found);
});
function paced():EngineState{return createEngine(profile({
  performance:{timeSeconds:900,date:NOW,source:'TEST_3K'},
  targetTimeSeconds:870,regularRunningWeeks:8,actualRunsPerWeek:2,availableRunsPerWeek:2,
  averageWeeklyKm4Weeks:10,longestUsualRunKm:5,raceDate:dateAfter(60),
}),NOW);}
test('CAL-08: three confirmed EASY sessions at fast half of assigned pace and RPE 2 tune pace by exactly 5 seconds',()=>{
  const s=paced(), baseline=prescribe(s,'EASY',NOW,'base');
  assert.deepEqual(baseline.paceRangeSecondsPerKm,[410,455]);
  for(let i=0;i<3;i++){
    const w=prescribe(s,'EASY',dateAfter(i*7),'success-'+i);
    append(s,w,timed(w,5000,35,2)); // 7:00/km, within the faster half
    if(i<2)assert.deepEqual(prescribe(s,'EASY',NOW,'probe-'+i).paceRangeSecondsPerKm,[410,455]);
  }
  s.asOf=dateAfter(15);
  const next=prescribe(s,'EASY',dateAfter(15),'advanced');
  assert.deepEqual(next.paceRangeSecondsPerKm,[405,450]);
  assert.deepEqual(next.speedRangeMps,[1000/450,1000/405]);
  assert.equal(next.main.dose.value,5000,'no automatic mileage surge');
  assert.deepEqual(s.history[0]!.workout.paceRangeSecondsPerKm,[410,455]);
  assert.deepEqual(prescribe(s,'EASY',dateAfter(20),'again').paceRangeSecondsPerKm,[405,450],
    'replanning does not compound speed gains');
});
test('CAL-09: RPE 3, missing measurements, one skip, or three overfast sessions do not earn faster speed',()=>{
  for(const mode of ['normal-rpe','unmeasured','skip','too-fast'] as const){
    const s=paced();
    for(let i=0;i<3;i++){
      const w=prescribe(s,'EASY',dateAfter(i*3),'p-'+i);
      let r=timed(w,5000,mode==='too-fast'?30:35,mode==='normal-rpe'?3:2);
      if(mode==='unmeasured' && i===2)r={...r,distanceMeters:0,durationMinutes:0};
      append(s,w,r);
    }
    if(mode==='skip')s.skippedWorkouts=[{...s.history[1]!.workout,scheduledDate:dateAfter(4)}];
    s.asOf=dateAfter(10);
    const next=prescribe(s,'EASY',dateAfter(10),'end');
    assert.deepEqual(next.paceRangeSecondsPerKm,[410,455],mode);
  }
});
test('CAL-11: three EASY successes in one week are not a fortnight of training',()=>{
  const s=paced();
  for (let i=0;i<3;i++) {
    const w=prescribe(s,'EASY',dateAfter(i*3),'rushed-'+i);
    append(s,w,timed(w,5000,35,2));
  }
  s.asOf=dateAfter(9);
  const next=prescribe(s,'EASY',dateAfter(9),'too-early');
  assert.deepEqual(next.paceRangeSecondsPerKm,[410,455],
    'three fast-habit EASY runs in six days cannot accelerate prescriptions');
});

test('CAL-12: benchmark stays on initial measured trials, not following normal EASY workouts',()=>{
  const s=beginner();
  const first=prescribe(s,'EASY',NOW,'trial-1');
  append(s,first,timed(first,2000,16,3));
  const second=prescribe(s,'EASY',dateAfter(3),'trial-2');
  append(s,second,timed(second,2000,16.5,3));
  s.asOf=dateAfter(7);
  const original=beginnerEasyPace(s);
  assert.deepEqual(original?.paceRangeSecondsPerKm,[510,560]);
  for (const day of [7,14,21]) {
    s.asOf=dateAfter(day);
    const w=prescribe(s,'EASY',dateAfter(day),'normal-'+day);
    assert.ok(w.paceRangeSecondsPerKm!==null);
    append(s,w,timed(w,w.main.dose.value,(w.main.dose.value/1000)*8.75,3));
  }
  s.asOf=dateAfter(28);
  assert.deepEqual(beginnerEasyPace(s)?.paceRangeSecondsPerKm,[510,560],
    'normal timed EASY results must not replace the calibration measurements');
  assert.equal(s.profile.performance,null,'calibration is not a 3000m race');
});

test('CAL-13: unmeasured inactivity beyond 21 days reopens beginner calibration',()=>{
  const s=beginner();
  const first=prescribe(s,'EASY',NOW,'trial-1');
  append(s,first,timed(first,2000,16,3));
  const second=prescribe(s,'EASY',dateAfter(3),'trial-2');
  append(s,second,timed(second,2000,16.5,3));
  s.asOf=dateAfter(26);
  const next=prescribe(s,'EASY',dateAfter(26),'refresh');
  assert.equal(beginnerEasyPace(s),null);
  assert.equal(next.main.calibration,true);
});

test('CAL-14: numerical EASY progression never increases prescribed distance on the same day',()=>{
  const s=paced();
  for (const day of [0,7,14]) {
    const w=prescribe(s,'EASY',dateAfter(day),'success-'+day);
    append(s,w,timed(w,5000,35,2));
  }
  s.asOf=dateAfter(15);
  // Simulate independently approved weekly mileage increase after a fortnight:
  // speed +5 s/km may be prescribed, but not on a longer session.
  s.doses.EASY={unit:'METERS',value:6000};
  const next=prescribe(s,'EASY',dateAfter(15),'refined-no-volume-spike');
  assert.deepEqual(next.paceRangeSecondsPerKm,[405,450]);
  assert.equal(next.main.dose.value,5000);
});

test('CAL-10: real recordResult on scheduled calibration session preserves untimed 3km profile',()=>{
  const s=beginner(),w=s.queue.find(x=>x.main.calibration === true);
  assert.ok(w);
  const out=recordResult(s,w.id,timed(w,2000,16));
  assert.equal(out.history.at(-1)!.result.distanceMeters,2000);
  assert.equal(out.profile.performance,null);
  const next=prescribe(out,'EASY',out.asOf,'next');
  assert.equal(next.main.calibration,true,'only one measured session is insufficient');
});
