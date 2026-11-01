import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine,deserialize,forecastCycle,replan,serialize,addDays,moveWorkout,recordResult,updateTrainingData} from '../src/index.ts';
import {v4Profile,simulatedReport} from './methodology-v4-fixture.ts';
import {assertV4Assignments} from './methodology-v4-oracle.ts';
import {periodWeeks,calendarDay,forecastByDate} from '../web/src/application/calendarModel.ts';

test('future start survives serialization and yields identical 24 assignments',()=>{
  const p=v4Profile();p.performance!.date='2026-11-01';
  const s=createEngine(p,'2026-11-01','2026-11-02');
  assert.equal(s.asOf,'2026-11-01');assert.equal(s.cycleStartDate,'2026-11-02');
  assert.equal(s.history.length,0);assert.ok(s.queue.every(w=>w.scheduledDate>='2026-11-02'));
  assert.throws(()=>moveWorkout(s,s.queue[0]!.id,'2026-11-01'),{code:'MOVE_OUTSIDE_HORIZON'});
  assert.throws(()=>updateTrainingData(s,{raceDate:'2026-11-01'},'2026-11-01'),{code:'INVALID_CALENDAR_DATE'});
  const loaded=deserialize(serialize(s));const f=forecastCycle(loaded,{mode:'CONDITIONAL'});
  assertV4Assignments(f.entries.map(e=>e.workout));assert.equal(periodWeeks(loaded).length,8);
  assert.equal(calendarDay(loaded,s.asOf,s.asOf,new Set(),forecastByDate(f.entries)).workout,null);
  assert.deepEqual(replan(loaded,'2026-11-02').history,[]);
});

test('cycle weeks remain anchored to arbitrary start days, including month boundaries',()=>{
  for(const start of ['2026-11-03','2027-01-31','2027-03-17']){
    const p=v4Profile();p.performance!.date=start;p.raceDate=addDays(start,54);
    const s=createEngine(p,start,start);const f=forecastCycle(s,{mode:'CONDITIONAL'});
    assert.equal(f.entries.length,24);assert.equal(periodWeeks(s).length,8);assert.equal(periodWeeks(s)[0],start);
    assert.equal(f.entries.at(-1)!.workout.scheduledDate,p.raceDate);
  }
});


test('start beyond initial seven-day horizon retains all future slots without skips',()=>{
  const p=v4Profile();p.performance!.date='2026-11-01';p.raceDate='2027-01-02';
  const s=createEngine(p,'2026-11-01','2026-11-09');
  assert.equal(s.queue.length,0);assert.equal(s.skippedIds.length,0);
  const f=forecastCycle(deserialize(serialize(s)),{mode:'CONDITIONAL'});
  assert.equal(f.entries.length,24);assert.equal(f.entries[0]!.workout.scheduledDate,'2026-11-09');
  assert.deepEqual(f.engineErrors,[]);assert.equal(s.history.length,0);
});


test('normal successful results advance into the second week without invented measurements',()=>{
  const p=v4Profile();p.performance!.date='2026-11-01';
  let s=createEngine(p,'2026-11-01','2026-11-02');
  for(let i=0;i<=7;i++){
    const d=addDays('2026-11-02',i);s=replan(deserialize(serialize(s)),d);
    const w=s.queue.find(w=>w.scheduledDate===d);
    if(i===7){assert.equal(w?.type,'VO2');assert.deepEqual(w?.main.dose,{unit:'METERS',value:1800});break;}
    if(w)s=recordResult(s,w.id,simulatedReport(w));
  }
  assert.equal(s.history.length,3);assert.equal(s.skippedIds.length,0);assert.equal(s.profile.performance?.timeSeconds,870);
});


test('new cycles do not place the final outside the eight-week period',()=>{
  const p=v4Profile();p.raceDate=addDays('2026-11-02',56);
  const s=createEngine(p,'2026-11-02');assert.equal(s.methodology,undefined);
});
