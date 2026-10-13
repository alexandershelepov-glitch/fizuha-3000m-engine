import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENARIOS, SIM_START, healthySafety, makeProfile, makeResult, simulateAll, simulateScenario,
} from '../audit/trainingSimulator.ts';
import {createEngine, recordResult, serialize} from '../src/index.ts';

test('SIM-01 nine fixed scenarios with four fitness levels run 8–12 weeks to the final race', () => {
  assert.equal(SCENARIOS.length, 9);
  assert.equal(new Set(SCENARIOS.map(x=>x.athlete)).size, 4);
  for(const spec of SCENARIOS){
    assert.ok(spec.weeks>=8&&spec.weeks<=12);
    const run=simulateScenario(spec);
    assert.equal(run.lastState.finalResultRecorded, true, spec.id);
    assert.deepEqual(run.lastState.queue, [], spec.id);
    assert.equal(run.weeks.length, spec.weeks);
    assert.equal(run.finalRaceSeconds, run.baselineSeconds, spec.id);
    assert.ok(run.events.some(x=>x.action==='EXTERNAL_FINAL_RACE_UNCHANGED'),spec.id);
    assert.equal(run.lastState.profile.targetTimeSeconds,run.targetSeconds,spec.id);
  }
});
test('SIM-02 determinism: matching input reproduces the entire trace byte for byte', ()=>{
  const s=SCENARIOS[1]!;
  const a=simulateScenario(s),b=simulateScenario(s);
  assert.deepEqual(a.events,b.events);
  assert.deepEqual(a.findings,b.findings);
  assert.equal(serialize(a.lastState),serialize(b.lastState));
});
test('SIM-03 audit cannot mutate the athlete profile or prior state', ()=>{
  const s=SCENARIOS[0]!;
  const profile=makeProfile(s);
  const original=JSON.stringify(profile);
  const state=createEngine(profile,SIM_START);
  const snap=serialize(state);
  simulateScenario(s);
  assert.equal(JSON.stringify(profile),original);
  assert.equal(serialize(state),snap);
});
test('SIM-04 no hypothetical faster checkpoint or final result is silently inferred', ()=>{
  const runs=simulateAll();
  for(const r of runs){
    const values=r.events.filter(x=>x.action.includes('CHECKPOINT'));
    for(const e of values)assert.match(e.comment,/unchanged|baseline|equal/i);
    assert.equal(r.lastState.profile.performance?.timeSeconds,r.baselineSeconds);
    assert.equal(r.finalRaceSeconds,r.baselineSeconds);
  }
});
test('SIM-05 direct engine grades are recorded; future training is decided by engine', ()=>{
  const s=SCENARIOS[1]!;
  const p=makeProfile(s);
  let engine=createEngine(p,SIM_START);
  const first=engine.queue[0]!;
  assert.ok(first);
  const measured=makeResult(first,'GREEN');
  const before=serialize(engine);
  engine=recordResult(engine,first.id,measured);
  assert.equal(engine.history.at(-1)?.classified.evaluation,'GREEN');
  assert.equal(serialize(createEngine(p,SIM_START)),before);
  assert.equal(measured.safety.pain,0);
});
test('SIM-06 absent employee gets a declared break, not fabricated successful runs', ()=>{
  const r=simulateScenario(SCENARIOS.find(x=>x.behaviour==='WORK_BREAK')!);
  const absent=r.events.filter(x=>x.action==='ABSENT_WORK_BREAK');
  assert.equal(absent.length,14);
  const breakReport=r.events.find(x=>x.action==='EXTERNAL_WORK_BREAK');
  assert.ok(breakReport);
  for(const entry of absent)assert.equal(entry.evaluation,null);
  // recordFinalResult deliberately archives/removes breaks older than the final test date.
  assert.ok(r.events.some(x => x.action === 'EXTERNAL_WORK_BREAK'));
});
test('SIM-07 RED and later external clearance are distinguishable events', ()=>{
  const r=simulateScenario(SCENARIOS.find(x=>x.behaviour==='RED_AND_REVIEW')!);
  const red=r.events.find(x=>x.evaluation==='RED');
  const clearance=r.events.find(x=>x.action==='EXTERNAL_MEDICAL_REVIEW');
  assert.ok(red,'scenario must inject an actual RED feedback');
  assert.ok(clearance,'clearance must be explicit, never automatic');
  assert.ok(clearance.day>red.day);
  assert.ok(r.events.some(x=>x.action==='REST_DAY' && x.day>red.day && x.day<clearance.day));
});
test('SIM-08 inconsistent measurement is rejected, never persisted, and explicitly corrected', ()=>{
  const r=simulateScenario(SCENARIOS.find(x=>x.behaviour==='CONTRADICTORY_REPORT')!);
  const rejected=r.events.filter(e=>e.action==='INVALID_REPORT_REJECTED');
  assert.ok(rejected.length>0,'scenario must prove rejection of incoherent measurements');
  assert.ok(rejected.every(e=>e.reportedMeters===0));
  assert.equal(r.findings.some(f=>f.code==='INCONSISTENT_REPORT_ACCEPTED'),false);
  assert.equal(r.lastState.history.some(h=>h.result.distanceMeters===0 && h.result.repeats.length>0),false);
  assert.ok(r.events.some(e=>e.action==='EXTERNAL_CORRECTED_REPORT'));
});
test('SIM-09 healthy safety payload is explicit and complete', ()=>{
  const h=healthySafety();
  assert.equal(Object.keys(h).length,8);
  assert.ok(Object.values(h).every(value=>value===false||value===0));
});
test('SIM-10 skipped workouts are not counted as completed history', ()=>{
  const r=simulateScenario(SCENARIOS.find(x=>x.behaviour==='SKIP_EVERY_THIRD')!);
  const skipped=r.events.filter(x=>x.action==='SKIPPED');
  assert.ok(skipped.length>0);
  for(const x of skipped)assert.ok(r.lastState.skippedIds.includes(x.workoutId!));
  for(const x of skipped)assert.ok(!r.lastState.history.some(y=>y.workout.id===x.workoutId));
});


test('SIM-11 gate changes without prescribed speed do not trigger a false pace warning', () => {
  const regular = simulateScenario(SCENARIOS.find(x => x.id === '02-regular-normal-8w')!);
  assert.ok(regular.events.some(e => e.comment.includes('target gate CLOSED → PARTIAL')));
  assert.equal(regular.findings.some(f => f.code === 'SIMULTANEOUS_PRESCRIBED_SPEED_AND_VOLUME'), false,
    'INTRO_QUALITY has no numeric speed prescription; gate speed alone cannot count');
});
test('SIM-12 every-third skips use scheduled workout count, not quality counter', () => {
  const r = simulateScenario(SCENARIOS.find(x => x.behaviour === 'SKIP_EVERY_THIRD')!);
  const sessions = r.events.filter(e => ['WORKOUT_RESULT','SKIPPED','REST_DAY'].includes(e.action));
  for(let i = 0; i < sessions.length; i++){
    assert.equal(sessions[i]!.action === 'SKIPPED', (i+1)%3 === 0,
      `Expected exactly each third scheduled session to be skipped: #${i+1}`);
  }
});
test('SIM-13 no detected hard safety or calendar violations in the fixed nine scenarios', () => {
  for(const r of simulateAll()){
    const errors = r.findings.filter(f => f.severity === 'ERROR');
    assert.deepEqual(errors, [], `${r.scenario.id}: ${JSON.stringify(errors)}`);
  }
});

test('SIM-14 incomplete synthetic feedback does not contradict measured split distance',()=>{
  const state=createEngine(makeProfile(SCENARIOS[1]!),SIM_START);
  const partial=makeResult(state.queue[0]!,'YELLOW');
  assert.ok(partial.distanceMeters+1e-6>=partial.repeats.reduce((n,r)=>n+r.distanceMeters,0));
  assert.equal(partial.completionFraction,0.7);
});
test('SIM-15 synthetic confirmation cannot invent performance gain',()=>{
  const r=simulateScenario(SCENARIOS[0]!);
  assert.ok(r.lastState.history.some(h=>h.result.feedbackConfirmed===true));
  assert.equal(r.finalRaceSeconds,r.baselineSeconds);
  assert.equal(r.lastState.profile.performance?.timeSeconds,r.baselineSeconds);
});
