import {assertV4Assignments as check24} from './methodology-v4-oracle.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, forecastCycle, serialize, deserialize, recordResult, replan, skipWorkout, moveWorkout,
  updateTrainingData, recordCheckpoint, recordFinalResult, applyBreak, finalRaceWorkout, resolveDiagnostic} from '../src/index.ts';
import type {Profile} from '../src/index.ts';
import {guardWeeklyLoad} from '../src/workouts.ts';
import {approvedWeekMeters, reservedMetres, withinRollingWeekBudget} from '../src/weeklyLoad.ts';
import {workoutInstruction} from '../web/src/ui/workoutInstructions.ts';
import {calendarDay, forecastByDate, weekSummary} from '../web/src/application/calendarModel.ts';
import {healthy} from './helpers.ts';
import {executeV4, simulatedReport, V4_START, v4Profile} from './methodology-v4-fixture.ts';

test('V4 acceptance: actual public transitions + save/load generate 24/24 exact prescriptions',()=>{
  const {state,workouts}=executeV4();check24(workouts);
  assert.equal(state.history.length,23);assert.equal(state.skippedIds.length,0);
  assert.ok(state.history.every(h=>h.classified.evaluation==='GREEN'));
  assert.deepEqual(state.profile.performance,v4Profile().performance);
  assert.equal(state.lastAssessmentDate,V4_START);assert.equal(state.checkpointRequired,false);
  assert.equal(state.queue.length,0);assert.equal(state.easyProgression?.approvedMetersPer7Days,16000);
  assert.ok(withinRollingWeekBudget(state,state.history.map(h=>h.workout)));
});

test('V4 forecast: both modes match actual 24 rows; no fake facts, extra controls, window violations',()=>{
  const {seed,workouts}=executeV4();const before=serialize(seed);
  for(const mode of ['CONDITIONAL','RESERVATION'] as const){
    const f=forecastCycle(seed,{mode});check24(f.entries.map(e=>e.workout));
    assert.deepEqual(f.engineErrors,[]);assert.deepEqual(f.windowViolations,[]);
    assert.equal(f.seedUnchanged,true);assert.equal(serialize(seed),before);assert.equal(seed.history.length,0);
    f.entries.forEach((e,i)=>{assert.deepEqual(e.workout.main,workouts[i]!.main);assert.deepEqual(e.workout.protocol,workouts[i]!.protocol);});
  }
});

test('V4 presentation: all 24 cards carry the full protocol; calendar keeps predictions apart',()=>{
  const {seed,workouts}=executeV4();const f=forecastCycle(seed,{mode:'CONDITIONAL'}),map=forecastByDate(f.entries);
  const days=workouts.map(w=>calendarDay(seed,V4_START,w.scheduledDate,new Set(),map));
  assert.equal(days.filter(d=>d.workout!==null).length,24);
  assert.equal(weekSummary(days).assigned,3);assert.equal(weekSummary(days).preliminary,21);
  assert.equal(weekSummary(days).reportedMeters,0);
  assert.equal(weekSummary([calendarDay(seed,V4_START,seed.profile.raceDate)]).assigned,0);
  workouts.forEach(w=>{
    const text=workoutInstruction(w).steps.join(' '),p=w.protocol!;
    if(p.warmupMeters) {assert.match(text,/Разминка/);assert.match(text,/Динамические упражнения/);assert.match(text,/Заминка/);}
    if(p.recovery) assert.match(text,/Только между отрезками/);
    if(p.strides?.insideDistance) {assert.match(text,/4 × 15 с/);assert.match(text,/минимум 75 с/);assert.match(text,/не увеличивают/);}
    if(p.role==='FINAL') assert.match(text,/3 × 80 м.*полным отдыхом/);
  });
});

test('V4 scope: legacy saves and other result, duration, frequency and low-base profiles retain original engine',()=>{
  const p=v4Profile();
  const variants:Partial<Profile>[]=[{performance:{...p.performance!,timeSeconds:840}},{raceDate:'2026-11-30'},{raceDate:'2027-01-25'},
    {actualRunsPerWeek:2},{availableRunsPerWeek:4},{averageWeeklyKm4Weeks:8},{longestUsualRunKm:4},{canRun3Km:false}];
  for(const over of variants)assert.equal(createEngine({...p,...over},V4_START).methodology,undefined);
  const legacy=createEngine({...p,raceDate:'2027-01-25'},V4_START);legacy.profile.raceDate=p.raceDate;
  assert.equal(deserialize(serialize(legacy)).methodology,undefined);
  assert.ok(replan(deserialize(serialize(legacy)),V4_START).queue.every(w=>w.protocol===undefined));
});

test('V4 safety: STOP, HOLD, YELLOW, break, mismatch and changed performance cannot keep the canonical intensity',()=>{
  const s=createEngine(v4Profile(),V4_START),w=s.queue[0]!;
  for(const safety of [{...healthy(),alteredMovement:true},{...healthy(),needsAssessment:true}]){
    const n=resolveDiagnostic(s,safety,V4_START);assert.ok(n.queue.every(w=>!w.countsAsQuality));assert.equal(finalRaceWorkout(n),null);
  }
  const yellow=recordResult(s,w.id,{...simulatedReport(w),completionFraction:.5});
  assert.ok(yellow.queue.every(w=>!w.countsAsQuality));
  const returned=applyBreak(s,{days:8,endDate:'2026-11-10',reason:'WORK'},'2026-11-10');
  assert.ok(returned.queue.every(w=>!w.countsAsQuality));
  const changed=recordCheckpoint(s,{timeSeconds:840,date:V4_START,source:'TEST_3K'},V4_START);
  assert.ok(changed.queue.every(w=>w.protocol===undefined));
  const mismatch=updateTrainingData(s,{performanceMismatch:'CLEAR'},V4_START);
  assert.ok(mismatch.queue.every(w=>w.protocol===undefined));
});

test('V4 skip/move: no make-up or dose change; original slot stays empty after persisted reload',()=>{
  const s=createEngine(v4Profile(),V4_START),w=s.queue[0]!;
  const skipped=replan(deserialize(serialize(skipWorkout(s,w.id,V4_START))),'2026-11-03');
  assert.equal(skipped.history.length,0);assert.equal(skipped.skippedWorkouts.length,1);
  assert.ok(skipped.queue.every(x=>x.id!==w.id));
  const moving=s.queue[1]!;
  const moved=moveWorkout(s,moving.id,'2026-11-05');
  const loaded=replan(deserialize(serialize(moved)),'2026-11-03');
  const kept=loaded.queue.find(x=>x.id===moving.id)!;assert.deepEqual(kept.main,moving.main);assert.deepEqual(kept.protocol,moving.protocol);
  assert.equal(kept.scheduledDate,'2026-11-05');assert.ok(loaded.queue.every(x=>x.scheduledDate!=='2026-11-04'));
  assert.throws(()=>moveWorkout(s,s.queue[2]!.id,'2026-11-08'),{code:'MOVE_RECOVERY_VIOLATION'});
  assert.throws(()=>moveWorkout(s,w.id,'2026-11-03'),{code:'MOVE_RECOVERY_VIOLATION'});
});

test('V4 load guard: no altered protocol, unknown slot, extra dose or distance-budget fitting',()=>{
  const s=createEngine(v4Profile(),V4_START),w=structuredClone(s.queue[0]!);
  w.main.dose.value=999;assert.equal(guardWeeklyLoad(s,[w]).length,0);
  const bad=structuredClone(s.queue[0]!);bad.protocol!.warmupMeters=99999;assert.equal(guardWeeklyLoad(s,[bad]).length,0);
  assert.deepEqual(guardWeeklyLoad(s,s.queue),s.queue);
  assert.ok(approvedWeekMeters(s)>16000);assert.equal(s.easyProgression?.approvedMetersPer7Days,16000);
  assert.ok(s.queue.every(x=>reservedMetres(s,x)!<=approvedWeekMeters(s)));
});

test('V4 final remains a dedicated event and records only supplied measured result',()=>{
  const {state}=executeV4();const final=finalRaceWorkout(state)!;
  assert.equal(final.movable,false);assert.equal(final.removable,false);
  assert.equal(state.history.length,23);assert.equal(state.finalResultRecorded,false);
  const done=recordFinalResult(state,{timeSeconds:860,date:'2026-12-26',source:'OFFICIAL_3K'},'2026-12-26');
  assert.equal(done.profile.performance!.timeSeconds,860);assert.equal(done.finalResultRecorded,true);
  assert.equal(done.queue.length,0);assert.equal(done.history.length,23);assert.equal(finalRaceWorkout(done),null);
  assert.equal(deserialize(serialize(done)).finalResultRecorded,true);
});


test('V4 rounded guides: integer track reports remain valid; off-pace work is not accepted as GREEN',()=>{
  const s=createEngine(v4Profile(),V4_START),w=s.queue[0]!;
  const measured={...simulatedReport(w),repeats:[{distanceMeters:1143,seconds:360},{distanceMeters:1143,seconds:360}]};
  assert.equal(recordResult(s,w.id,measured).history[0]!.classified.evaluation,'GREEN');
  const slow={...measured,repeats:measured.repeats.map(r=>({...r,seconds:380}))};
  assert.equal(recordResult(s,w.id,slow).history[0]!.classified.evaluation,'YELLOW');
});

test('V4 Q0/Q1/Q2 and target edits preserve the same prescriptions from the dated 14:30 fact',()=>{
  for(const quality of [{}, {qualitySessions8Weeks:3,qualityWeeks8Weeks:3}, {qualitySessions8Weeks:8,qualityWeeks8Weeks:6}]) {
    const s=createEngine({...v4Profile(),...quality},V4_START);
    for(const targetTimeSeconds of [870,840,810]) {
      const edited=updateTrainingData(s,{targetTimeSeconds},V4_START);
      const f=forecastCycle(edited,{mode:'RESERVATION'});check24(f.entries.map(e=>e.workout));
      assert.deepEqual(f.engineErrors,[]);assert.deepEqual(f.windowViolations,[]);
      assert.deepEqual(edited.profile.performance,v4Profile().performance);
    }
  }
});
