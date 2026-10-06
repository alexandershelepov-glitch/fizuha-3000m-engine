import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appCycle, CREATED_AT, memoryStorage, repository} from './helpers-app.ts';
import {NOW, dateAfter, profile} from './helpers.ts';
import {updateGoalAndRaceDate} from '../web/src/application/parameters.ts';
import {submitFinalResult} from '../web/src/application/finalResult.ts';
import {archiveCompletedCycle, loadArchives} from '../web/src/application/archive.ts';
import {ARCHIVED_CYCLES_KEY, createArchiveRepository} from '../web/src/application/archiveStorage.ts';
import {loadActiveCycle} from '../web/src/application/storage.ts';
import {createCycle} from '../web/src/application/cycle.ts';
import {cycleSummary} from '../web/src/application/cycleSummary.ts';
import {deriveToday} from '../web/src/application/uiState.ts';
import {recordFinalResult} from '../web/src/application/engineGateway.ts';

const parameters = (f: ReturnType<typeof appCycle>, changes: Partial<{targetTimeSeconds: number; raceDate: string; deviceToday: string}> = {}) => updateGoalAndRaceDate({...f, targetTimeSeconds: f.engineState.profile.targetTimeSeconds, raceDate: f.engineState.profile.raceDate, deviceToday: NOW, at: CREATED_AT, ...changes});
const final = (f: ReturnType<typeof appCycle>, deviceToday = f.engineState.profile.raceDate) => submitFinalResult({...f, timeSeconds: 882, source: 'OFFICIAL_3K', deviceToday, at: CREATED_AT});
function completed(race = NOW, now = race) {
  const f = appCycle({raceDate: race}); const outcome = final(f, now); assert.ok(outcome.ok);
  return {...f, ...outcome.done, archives: createArchiveRepository(f.storage)};
}

for(const kind of ['target','date','both'] as const)test(`PARAM ${kind}: baseline immutable, changed-only event, persistence and reload`,()=>{
 const f=appCycle();const before=structuredClone(f.appState);const r=parameters(f,{...kind!=='date'?{targetTimeSeconds:880}:{},...kind!=='target'?{raceDate:dateAfter(28)}:{}});assert.ok(r.ok);
 assert.deepEqual(r.done.appState.cycle.baseline,before.cycle.baseline);assert.deepEqual(r.done.appState.events.slice(0,-1),before.events);
 const event=r.done.appState.events.at(-1)!;assert.equal(event.type,'TRAINING_PARAMETERS_CHANGED');if(event.type!=='TRAINING_PARAMETERS_CHANGED')return;
 assert.deepEqual(Object.keys(event.to).sort(),kind==='both'?['raceDate','targetTimeSeconds']:kind==='date'?['raceDate']:['targetTimeSeconds']);assert.deepEqual(Object.keys(event.to),Object.keys(event.from));assert.ok(!('queue' in event.to));
 const loaded=loadActiveCycle(f.repo);assert.equal(loaded.kind,'READY');if(loaded.kind==='READY')assert.deepEqual(loaded.appState,r.done.appState);
});
test('PARAM no-op leaves object identity, event count and storage writes unchanged',()=>{const f=appCycle(),writes=f.storage.writes;const r=parameters(f);assert.ok(r.ok);assert.equal(r.done.appState,f.appState);assert.equal(r.done.engineState,f.engineState);assert.equal(f.storage.writes,writes);});
test('PARAM INV-1 rejects changes with past unresolved workouts without writing',()=>{const f=appCycle(),writes=f.storage.writes;const r=parameters(f,{targetTimeSeconds:880,deviceToday:dateAfter(1)});assert.ok(!r.ok);assert.equal(r.error.code,'PENDING_RESULT_BLOCKED');assert.equal(f.storage.writes,writes);assert.equal(f.repo.read(),f.raw);});
test('PARAM failed save leaves previous persisted state and baseline intact',()=>{const f=appCycle();const repo={...f.repo,write:()=>{throw new Error('disk');}};const r=updateGoalAndRaceDate({...f,repo,targetTimeSeconds:880,raceDate:f.engineState.profile.raceDate,deviceToday:NOW,at:CREATED_AT});assert.ok(!r.ok);assert.equal(f.repo.read(),f.raw);assert.equal(f.appState.events.length,1);});
test('PARAM changing race date enters and exits TAPER exclusively through engine',()=>{
 const f=appCycle();const a=parameters(f,{raceDate:dateAfter(3)});assert.ok(a.ok);assert.equal(a.done.engineState.decision.phase,'TAPER');
 const b=parameters({...f,...a.done},{raceDate:dateAfter(50)});assert.ok(b.ok);assert.equal(b.done.engineState.decision.phase,'DEVELOPMENT');
});
test('PARAM postponing start after original race date has no local calendar ban',()=>{
 const f=appCycle({raceDate:NOW});const r=parameters(f,{raceDate:dateAfter(20),deviceToday:dateAfter(2)});assert.ok(r.ok);assert.equal(r.done.engineState.profile.raceDate,dateAfter(20));assert.equal(r.done.appState.cycle.baseline.raceDate,NOW);
});
test('PARAM malformed calendar and passed event expose structured codes',()=>{
 const f=appCycle();let r=parameters(f,{raceDate:'2026-02-30'});assert.ok(!r.ok);assert.equal(r.error.code,'INVALID_PARAMETERS');r=parameters(f,{raceDate:dateAfter(-1)});assert.ok(!r.ok);assert.equal(r.error.code,'EVENT_DATE_PASSED');
});
for(const days of [0,2,10])test(`FINAL ${days} days late: race date fixed, terminal, event, baseline and reload`,()=>{
 const f=appCycle({raceDate:dateAfter(9)});assert.ok(f.engineState.queue.length>0);const before=structuredClone(f.appState.cycle.baseline);const r=final(f,dateAfter(9+days));assert.ok(r.ok);
 assert.equal(r.done.engineState.finalResultRecorded,true);assert.equal(r.done.engineState.queue.length,0);assert.equal(r.done.engineState.profile.performance!.timeSeconds,882);assert.equal(r.done.engineState.profile.performance!.date,dateAfter(9));assert.equal(r.done.engineState.asOf,dateAfter(9+days));assert.deepEqual(r.done.appState.cycle.baseline,before);
 const event=r.done.appState.events.at(-1)!;assert.equal(event.type,'FINAL_RESULT_RECORDED');if(event.type==='FINAL_RESULT_RECORDED'){assert.equal(event.result.source,'OFFICIAL_3K');assert.equal(event.result.date,dateAfter(9));assert.equal(event.at,CREATED_AT);assert.ok(!('queue' in event));}
 const reload=loadActiveCycle(f.repo);assert.equal(reload.kind,'READY');if(reload.kind==='READY'){assert.equal(reload.engineState.finalResultRecorded,true);assert.equal(reload.engineState.queue.length,0);}
});
test('FINAL old unresolved workouts cannot block terminal transition',()=>{
 const f=appCycle({raceDate:dateAfter(9)});assert.ok(f.engineState.queue[0]!.scheduledDate<dateAfter(11));const r=final(f,dateAfter(11));assert.ok(r.ok);assert.equal(r.done.engineState.queue.length,0);
 assert.equal(deriveToday(f.engineState,dateAfter(9)).state,'RACE_DAY');assert.equal(deriveToday(f.engineState,dateAfter(11)).state,'AWAITING_FINAL_RESULT');
});
test('FINAL rejects before-event, bad source and wrong date by code',()=>{
 const f=appCycle({raceDate:dateAfter(1)});const r=final(f,NOW);assert.ok(!r.ok);assert.equal(r.error.code,'FINAL_RESULT_BEFORE_EVENT');assert.equal(f.repo.read(),f.raw);
 assert.throws(()=>recordFinalResult(f.engineState,{timeSeconds:900,date:NOW,source:'TEST_3K'},dateAfter(1)),{code:'FINAL_RESULT_NOT_ON_EVENT_DATE'});
 const invalid=submitFinalResult({...f,timeSeconds:900,source:'UNKNOWN' as never,deviceToday:dateAfter(1),at:CREATED_AT});assert.ok(!invalid.ok);assert.equal(invalid.error.code,'INVALID_PERFORMANCE_SOURCE');
});
test('FINAL storage failure does not expose successful terminal state',()=>{
 const f=appCycle({raceDate:NOW});const r=submitFinalResult({...f,repo:{...f.repo,write:()=>{throw new Error();}},timeSeconds:882,source:'OFFICIAL_3K',deviceToday:NOW,at:CREATED_AT});assert.ok(!r.ok);assert.equal(f.repo.read(),f.raw);assert.equal(f.engineState.finalResultRecorded,false);
});
test('FINAL double submission including stale original envelope writes only one event',()=>{
 const f=appCycle({raceDate:NOW});const first=final(f);assert.ok(first.ok);const writes=f.storage.writes;const second=final(f);assert.ok(!second.ok);assert.equal(second.error.code,'CYCLE_COMPLETED');assert.equal(f.storage.writes,writes);assert.equal(first.done.appState.events.filter(e=>e.type==='FINAL_RESULT_RECORDED').length,1);
 const edit=parameters({...f,...first.done},{targetTimeSeconds:870});assert.ok(!edit.ok);assert.equal(edit.error.code,'CYCLE_COMPLETED');
});
test('ARCHIVE full envelope is durable before active clear; success and retry idempotent',()=>{
 const f=completed();const copy=structuredClone(f.appState);const order:string[]=[];
 const archives={...f.archives,add:(a: typeof f.appState,at:string)=>{order.push('archive');return f.archives.add(a,at);}};
 const repo={...f.repo,clear:()=>{assert.ok(f.storage.getItem(ARCHIVED_CYCLES_KEY));order.push('clear');f.repo.clear();}};
 const r=archiveCompletedCycle({...f,repo,archives,at:CREATED_AT});assert.ok(r.ok);assert.deepEqual(order,['archive','clear']);assert.equal(f.repo.read(),null);assert.deepEqual(r.entry.appState,copy);
 const retry=archiveCompletedCycle({...f,at:CREATED_AT});assert.ok(retry.ok);assert.equal(f.archives.list().length,1);assert.deepEqual(f.archives.get(f.appState.cycle.cycleId)!.appState,copy);
});
test('ARCHIVE write failure retains completed active and supports retry',()=>{
 const f=completed();const archives=createArchiveRepository({...f.storage,setItem:(key,value)=>{if(key===ARCHIVED_CYCLES_KEY)throw new Error();f.storage.setItem(key,value);}});
 const r=archiveCompletedCycle({...f,archives,at:CREATED_AT});assert.ok(!r.ok);assert.equal(r.error.code,'ARCHIVE_UNAVAILABLE');const load=loadActiveCycle(f.repo);assert.equal(load.kind,'READY');if(load.kind==='READY')assert.equal(load.engineState.finalResultRecorded,true);
 assert.ok(archiveCompletedCycle({...f,at:CREATED_AT}).ok);assert.equal(f.archives.list().length,1);
});
test('ARCHIVE clear failure keeps archive and active; retry cannot duplicate',()=>{
 const f=completed();const r=archiveCompletedCycle({...f,repo:{...f.repo,clear:()=>{throw new Error();}},at:CREATED_AT});assert.ok(!r.ok);assert.equal(r.error.code,'ACTIVE_CLEAR_FAILED');assert.equal(f.archives.list().length,1);assert.notEqual(f.repo.read(),null);
 assert.ok(archiveCompletedCycle({...f,at:dateAfter(1)+'T00:00:00Z'}).ok);assert.equal(f.archives.list().length,1);assert.equal(f.repo.read(),null);
});
test('ARCHIVE silent lost write or clear is an explicit failure, not success',()=>{
 const f=completed();const lost=createArchiveRepository({...f.storage,setItem:()=>undefined});let r=archiveCompletedCycle({...f,archives:lost,at:CREATED_AT});assert.ok(!r.ok);assert.equal(r.error.code,'ARCHIVE_UNAVAILABLE');assert.notEqual(f.repo.read(),null);
 r=archiveCompletedCycle({...f,repo:{...f.repo,clear:()=>undefined},at:CREATED_AT});assert.ok(!r.ok);assert.equal(r.error.code,'ACTIVE_CLEAR_FAILED');assert.notEqual(f.repo.read(),null);
});
test('ARCHIVE conflicting duplicate never overwrites or clears active',()=>{
 const f=completed();f.archives.add({...f.appState,ui:{...f.appState.ui,locale:'en-US'}},CREATED_AT);const before=f.storage.getItem(ARCHIVED_CYCLES_KEY);
 const r=archiveCompletedCycle({...f,at:CREATED_AT});assert.ok(!r.ok);assert.equal(r.error.code,'ARCHIVE_CONFLICT');assert.equal(f.storage.getItem(ARCHIVED_CYCLES_KEY),before);assert.notEqual(f.repo.read(),null);
});
for(const raw of ['{','{"formatVersion":999,"cycles":[]}','{"formatVersion":1,"cycles":false}'])test(`ARCHIVE invalid/unsupported format stays untouched: ${raw}`,()=>{
 const storage=memoryStorage({[ARCHIVED_CYCLES_KEY]:raw});const repo=createArchiveRepository(storage);const r=loadArchives(repo);assert.ok(!r.ok);assert.equal(r.error.code,raw.includes('999')?'UNSUPPORTED_ARCHIVE_VERSION':'ARCHIVE_DAMAGED');assert.equal(storage.getItem(ARCHIVED_CYCLES_KEY),raw);assert.equal(storage.writes,0);
});
test('ARCHIVE incomplete cycles are refused and cannot replace active with a new cycle',()=>{
 const f=appCycle();const r=archiveCompletedCycle({...f,archives:createArchiveRepository(f.storage),at:CREATED_AT});assert.ok(!r.ok);assert.equal(r.error.code,'CYCLE_NOT_COMPLETED');
 const created=createCycle(f.repo,{profile:profile(),deviceToday:NOW,cycleId:'new',createdAt:CREATED_AT,locale:'ru-RU'});assert.ok(!created.ok);assert.equal(created.error.code,'ACTIVE_CYCLE_EXISTS');assert.equal(f.repo.read(),f.raw);
});
test('ARCHIVE all cycles, newest first, independent baseline and no hard limit',()=>{
 const storage=memoryStorage(),repo=repository(storage),archives=createArchiveRepository(storage);
 for(let i=0;i<12;i++){
  const created=createCycle(repo,{profile:profile({raceDate:NOW,targetTimeSeconds:890+i}),deviceToday:NOW,cycleId:`cycle-${i}`,createdAt:CREATED_AT,locale:'ru-RU'});assert.ok(created.ok);
  const recorded=submitFinalResult({...created,repo,timeSeconds:882+i,source:'OFFICIAL_3K',deviceToday:NOW,at:CREATED_AT});assert.ok(recorded.ok);
  assert.ok(archiveCompletedCycle({repo,archives,appState:recorded.done.appState,at:`2026-10-05T${String(i).padStart(2,'0')}:00:00Z`}).ok);
 }
 const read=createArchiveRepository(storage).list();assert.equal(read.length,12);assert.equal(read[0]!.cycleId,'cycle-11');assert.equal(read[11]!.cycleId,'cycle-0');assert.equal(read[0]!.appState.cycle.baseline.targetTimeSeconds,901);
 const newCycle=createCycle(repo,{profile:profile(),deviceToday:NOW,cycleId:'brand-new',createdAt:CREATED_AT,locale:'ru-RU'});assert.ok(newCycle.ok);assert.equal(archives.list().length,12);assert.notEqual(newCycle.appState.cycle.cycleId,read[0]!.cycleId);
});
test('SUMMARY derives checkpoints, history and deduplicated skips without a summary snapshot',()=>{
 const f=completed();const event={type:'WORKOUT_SKIPPED' as const,at:CREATED_AT,workoutId:'missing',scheduledDate:NOW,workoutType:'EASY',cause:'VOLUNTARY' as const};
 const appState={...f.appState,events:[...f.appState.events,event,event,{type:'CHECKPOINT_RECORDED' as const,at:CREATED_AT,result:{timeSeconds:902,date:NOW,source:'TEST_3K'},previousPerformance:920,decisionAfter:f.appState.cycle.baseline.assessment}]};
 const summary=cycleSummary(appState);assert.equal(summary.skippedWorkouts,1);assert.equal(summary.checkpoints.length,1);assert.equal(summary.completedWorkouts,0);assert.equal(summary.baseline.performance!.timeSeconds,920);assert.equal(summary.result!.timeSeconds,882);assert.ok(!('summary' in appState));
});
test('TERMINAL normal replan/checkpoint cannot revive completed active or write a post-race plan',async()=>{
 const {refreshPlan}=await import('../web/src/application/clockOps.ts');const {submitCheckpoint}=await import('../web/src/application/checkpoint.ts');const f=completed(),before=f.repo.read(),writes=f.storage.writes;
 const refreshed=refreshPlan({...f,deviceToday:NOW});assert.ok(!refreshed.ok);assert.equal(refreshed.error.code,'CYCLE_COMPLETED');
 const assessed=submitCheckpoint({...f,deviceToday:NOW,at:CREATED_AT,performance:{timeSeconds:880,date:NOW,source:'TEST_3K'}});assert.ok(!assessed.ok);assert.equal(assessed.error.code,'CYCLE_COMPLETED');
 assert.equal(f.repo.read(),before);assert.equal(f.storage.writes,writes);
});
test('ROUTES lifecycle roundtrip supports encoded cycle ids and archive-only reload',async()=>{
 const {parseRoute,routeToPath,guardRoute}=await import('../web/src/app/routes.ts');
 for(const route of [{name:'PARAMETERS'},{name:'PARAMETERS_OUTCOME'},{name:'FINAL_RESULT'},{name:'CYCLE_SUMMARY',id:'cycle ?/ test'}] as const)assert.deepEqual(parseRoute(routeToPath(route)),route);
 assert.equal(guardRoute({name:'CYCLE_SUMMARY',id:'any'},{hasCycle:false,onboardingInProgress:false}).redirected,false);
 assert.equal(guardRoute({name:'FINAL_RESULT'},{hasCycle:false,onboardingInProgress:false}).redirected,true);
});
