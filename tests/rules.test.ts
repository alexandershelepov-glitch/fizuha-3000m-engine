import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBreak, classify, createEngine, deserialize, recordCheckpoint, recordResult, replan, resolveDiagnostic, prescribe, serialize, skipWorkout, updateTrainingData} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, healthy, nextQuality, performQuality, profile} from './helpers.ts';

test('GREEN → GREEN: first holds, second progresses one volume parameter',()=>{
 let s=createEngine(profile(),NOW);const w=s.queue[0]!;const base=w.main.dose.value;
 s=recordResult(s,w.id,feedback(w));assert.equal(s.doses.INTRO_QUALITY!.value,base);
 const n=nextQuality(s);s=recordResult(n.state,n.workout.id,feedback(n.workout));
 assert.equal(s.doses.INTRO_QUALITY!.value,base+2);
 const next=prescribe(s,'INTRO_QUALITY',s.asOf,'comparison');assert.equal(next.restSeconds,w.restSeconds);assert.equal(next.main.repeatMeters,w.main.repeatMeters);assert.equal(next.speedRangeMps,null);
});
test('GREEN_PLUS → GREEN_PLUS requests checkpoint without predicting performance',()=>{
 let s=createEngine(profile(),NOW);const before=s.profile.performance;
 s=performQuality(s,'GREEN_PLUS');assert.equal(s.checkpointRequired,false);s=performQuality(s,'GREEN_PLUS');
 assert.equal(s.checkpointRequired,true);assert.deepEqual(s.profile.performance,before);
});
test('YELLOW → GREEN: easy recovery clears isolated fatigue; no automatic volume growth',()=>{
 let s=createEngine(profile(),NOW);const w=s.queue[0]!;s=recordResult(s,w.id,feedback(w,'YELLOW',{unexpectedFatigue:true}));
 assert.equal(s.progressionBlocked,true);assert.ok(!s.queue.some(w=>w.countsAsQuality));
 const easy=s.queue[0]!;s=recordResult(s,easy.id,feedback(easy));assert.equal(s.progressionBlocked,false);assert.equal(s.relatedYellow,false);
 assert.equal(nextQuality(s).workout.main.dose.value,w.main.dose.value);
});
test('unrelated environment and recovery YELLOW do not merge',()=>{
 let s=createEngine(profile(),NOW);const w=s.queue[0]!;s=recordResult(s,w.id,feedback(w,'YELLOW',{yellowReason:'ENVIRONMENT',conditions:{heat:true}}));
 const easy=s.queue[0]!;s=recordResult(s,easy.id,feedback(easy));const n=nextQuality(s);
 s=recordResult(n.state,n.workout.id,feedback(n.workout,'YELLOW',{yellowReason:'RECOVERY',unexpectedFatigue:true}));assert.equal(s.relatedYellow,false);
});
test('two related yellow roll back last confirmed dose and restrict quality after diagnostic',()=>{
 let s=createEngine(profile({...experienced,availableRunsPerWeek:4,actualRunsPerWeek:4}),NOW);s=performQuality(s);s=performQuality(s);
 const confirmed=structuredClone(s.confirmedDoses);let n=nextQuality(s);s=recordResult(n.state,n.workout.id,feedback(n.workout,'YELLOW'));
 const easy=s.queue[0]!;s=recordResult(s,easy.id,feedback(easy));n=nextQuality(s);s=recordResult(n.state,n.workout.id,feedback(n.workout,'YELLOW'));
 assert.equal(s.relatedYellow,true);assert.deepEqual(s.doses,confirmed);
 s=resolveDiagnostic(s,healthy(),s.asOf);assert.equal(s.decision.maximumQualityPerWeek,1);
});
test('PARTIAL → OPEN requires two successful specific workouts; no simultaneous speed+volume growth',()=>{
 let s=createEngine(profile({...experienced,actualRunsPerWeek:4,availableRunsPerWeek:4,averageWeeklyKm4Weeks:28,longestUsualRunKm:9}),NOW);
 assert.equal(s.decision.gate,'CLOSED');s=performQuality(s);assert.equal(s.decision.gate,'PARTIAL');s=performQuality(s);
 let n=nextQuality(s,'SPECIFIC_3K');s=recordResult(n.state,n.workout.id,feedback(n.workout));assert.equal(s.decision.gate,'PARTIAL');
 n=nextQuality(s,'SPECIFIC_3K');const dose=n.workout.main.dose.value;s=recordResult(n.state,n.workout.id,feedback(n.workout));
 assert.equal(s.decision.gate,'OPEN');assert.equal(s.decision.effectiveSpeedMps,3000/s.profile.targetTimeSeconds);assert.equal(s.doses.SPECIFIC_3K!.value,dose);
});
test('new test updates anchors, replans and retains actual T/Q and distinct experience flags',()=>{
 let s=createEngine(profile({...experienced}),NOW);const before=s.decision;
 s=recordCheckpoint(s,{timeSeconds:900,date:NOW,source:'OFFICIAL_3K'},NOW);
 assert.equal(s.decision.currentSpeedMps,3000/900);assert.equal(s.decision.capacity,before.capacity);assert.equal(s.decision.quality,before.quality);
 assert.deepEqual(s.profile.experience,experienced.experience);assert.equal(s.decision.gate,'CLOSED');
});
test('CONTROL workout feedback alone never changes performance',()=>{
 let s=replan(createEngine(profile(),NOW),dateAfter(21));const w=s.queue.find(w=>w.type==='CONTROL')!;
 s=recordResult(s,w.id,feedback(w));assert.equal(s.profile.performance!.timeSeconds,920);assert.equal(s.checkpointRequired,true);
});
test('resultless runner becomes able3km → baseline checkpoint → snapshot',()=>{
 let s=createEngine(profile({performance:null,canRun3Km:false}),NOW);assert.equal(s.checkpointRequired,false);
 s=updateTrainingData(s,{canRun3Km:true},NOW);assert.equal(s.checkpointRequired,true);assert.ok(s.queue.every(w=>!w.countsAsQuality),'no intense CONTROL without an actual 3km time');assert.ok(s.queue.some(w=>w.main.mode==='CONTINUOUS'));
 s=recordCheckpoint(s,{timeSeconds:1100,date:NOW,source:'TEST_3K'},NOW);assert.equal(s.profile.performance!.timeSeconds,1100);
});
for(const days of [1,3,4,7,8,14,15,30]) test(`healthy break ${days} days has correct return policy`,()=>{
 let s=createEngine(profile({...experienced,raceDate:dateAfter(100)}),NOW);s=performQuality(s);const now=dateAfter(days,s.asOf);
 s=applyBreak(s,{days,endDate:now,reason:'WORK'},now);
 if(days<=3){assert.equal(s.reentry,null);assert.equal(s.decision.phase,'DEVELOPMENT');}
 else if(days<=7){assert.equal(s.reentry!.easyFactor,.8);assert.equal(s.reentry!.qualityFactor,.85);const q=nextQuality(s).workout;assert.equal(q.volumeFactor,.85);}
 else {assert.equal(s.reentry!.easyRemaining,2);assert.equal(s.decision.gate,'CLOSED');assert.ok(s.queue.every(w=>!w.countsAsQuality));}
 if(days>14){assert.equal(s.decision.confidence,'LOW');for(let i=0;i<2;i++){const w=s.queue[0]!;s=recordResult(s,w.id,feedback(w));}assert.equal(s.diagnosticHold,true);assert.equal(s.checkpointRequired,true);assert.ok(s.queue.every(w=>!w.countsAsQuality));s=recordCheckpoint(s,{timeSeconds:930,date:s.asOf,source:'TEST_3K'},s.asOf);assert.equal(s.decision.confidence,'HIGH');assert.equal(s.reentry,null);}
});
for(const reason of ['ILLNESS','INJURY'] as const) test(`medical ${reason} break does not use healthy calendar multipliers`,()=>{
 const s=applyBreak(createEngine(profile(),NOW),{days:4,endDate:dateAfter(4),reason},dateAfter(4));assert.equal(s.reentry,null);assert.equal(s.decision.phase,'HOLD_DIAGNOSTIC');assert.equal(s.decision.maximumQualityPerWeek,0);
});
test('skip removes a workout without debt, replacement quality or changing next prescription',()=>{
 const s=createEngine(profile({...experienced,availableRunsPerWeek:4,actualRunsPerWeek:4}),NOW);const w=s.queue[0]!,next=s.queue[1]!;
 const after=skipWorkout(s,w.id);assert.deepEqual(after.queue.find(w=>w.id===next.id),next);assert.equal(after.history.length,0);
 const again=replan(after);assert.ok(again.queue.filter(w=>w.countsAsQuality).length <= s.queue.filter(w=>w.countsAsQuality).length-1);
});
test('taper reduces volume and forbids progression even after two confirmations',()=>{
 let s=createEngine(profile({raceDate:dateAfter(4)}),NOW);assert.equal(s.decision.phase,'TAPER');
 const w=s.queue[0]!;assert.equal(w.volumeFactor,.6);s=recordResult(s,w.id,feedback(w));
 assert.ok(!s.decision.reasons.includes('PROGRESSION_ALLOWED'));
});
test('acute RED blocks and cannot be cleared by an ordinary GREEN REST report',()=>{
 let s=createEngine(profile(),NOW);const w=s.queue[0]!;s=recordResult(s,w.id,feedback(w,'RED'));
 const rest=s.queue[0]!;s=recordResult(s,rest.id,feedback(rest));assert.equal(s.diagnosticHold,true);assert.equal(s.decision.phase,'HOLD_DIAGNOSTIC');assert.ok(s.queue.every(w=>!w.countsAsQuality));
});
test('classification full, within range, lower RPE → GREEN_PLUS; failures → reasoned YELLOW',()=>{
 const s=createEngine(profile({...experienced}),NOW),w=s.queue[0]!;
 assert.equal(classify(w,feedback(w,'GREEN_PLUS')).evaluation,'GREEN_PLUS');
 assert.equal(classify(w,feedback(w,'GREEN')).evaluation,'GREEN');
 assert.equal(classify(w,feedback(w,'GREEN',{sessionRpe:(w.targetRpe[0]+w.targetRpe[1])/2+2})).yellowReason,'RECOVERY');
 assert.equal(classify(w,feedback(w,'GREEN',{repeats:[]})).evaluation,'YELLOW');
 assert.equal(classify(w,feedback(w,'GREEN',{safety:{...healthy(),pain:2}})).yellowReason,'PAIN');
});
test('two same-workout submissions cannot fake independent confirmations',()=>{
 const s=createEngine(profile(),NOW),w=s.queue[0]!,after=recordResult(s,w.id,feedback(w,'GREEN_PLUS'));
 assert.throws(()=>recordResult(after,w.id,feedback(w,'GREEN_PLUS')));assert.equal(after.greenPlusIds.length,1);
});
test('immutable state and JSON roundtrip preserve deterministic queue/history',()=>{
 const p=profile(),s=createEngine(p,NOW);const before=serialize(s);performQuality(s);assert.equal(serialize(s),before);assert.deepEqual(p,profile());
 assert.deepEqual(deserialize(before),s);
});
test('no invalid future or malformed measurements accepted',()=>{
 assert.throws(()=>createEngine(profile({performance:{timeSeconds:900,date:dateAfter(1),source:'TEST_3K'}}),NOW));
 assert.throws(()=>createEngine(profile({targetTimeSeconds:0}),NOW));assert.throws(()=>createEngine(profile({availableRunsPerWeek:2.5}),NOW));
 assert.throws(()=>createEngine(profile(),'2026-02-30'));
 const s=createEngine(profile(),NOW),w=s.queue[0]!;assert.throws(()=>recordResult(s,w.id,feedback(w,'GREEN',{sessionRpe:NaN})));
 assert.throws(()=>updateTrainingData(s,{performance:{timeSeconds:700,date:NOW,source:'TEST_3K'}} as never,NOW));
});

test('move preserves dose, survives replan/serialization and cannot violate recovery',async()=>{
 const {moveWorkout}=await import('../src/index.ts');const s=createEngine(profile(),NOW),w=s.queue[0]!;
 const moved=moveWorkout(s,w.id,dateAfter(1));assert.equal(moved.queue.find(x=>x.id===w.id)!.main.dose.value,w.main.dose.value);
 const restored=deserialize(serialize(moved));assert.equal(restored.queue.find(x=>x.id===w.id)!.scheduledDate,dateAfter(1));
 const after=recordResult(restored,w.id,feedback(restored.queue.find(x=>x.id===w.id)!));assert.equal(after.history.length,1);assert.ok(!after.queue.some(x=>x.scheduledDate===dateAfter(1)));
 const advanced=createEngine(profile({...experienced,availableRunsPerWeek:4}),NOW);assert.throws(()=>moveWorkout(advanced,advanced.queue[0]!.id,dateAfter(7)));
 assert.throws(()=>moveWorkout(advanced,advanced.queue[0]!.id,advanced.queue[1]!.scheduledDate));
});
test('time advance marks overdue quality skipped and does not replace it as debt',()=>{
 const s=createEngine(profile(),NOW);const after=replan(s,dateAfter(1));assert.ok(after.skippedIds.includes(s.queue[0]!.id));assert.equal(after.queue.filter(w=>w.countsAsQuality).length,1);
 const q=after.queue.find(w=>w.countsAsQuality)!;assert.equal(q.scheduledDate,dateAfter(7));
});
test('first quality after two reentry easies still uses CLOSED gate and confirmed dose reduction',()=>{
 let s=createEngine(profile({...experienced}),NOW);s=performQuality(s);const now=dateAfter(8,s.asOf);
 s=applyBreak(s,{days:8,endDate:now,reason:'WORK'},now);
 for(let i=0;i<2;i++){const w=s.queue[0]!;s=recordResult(s,w.id,feedback(w));}
 const n=nextQuality(s);assert.equal(n.state.decision.phase,'RE_ENTRY');assert.equal(n.workout.gateAtPrescription,'CLOSED');assert.equal(n.workout.volumeFactor,.75);
});
test('small break easy reduction is applied once, not repeatedly',()=>{
 let s=createEngine(profile({...experienced,availableRunsPerWeek:4,actualRunsPerWeek:4}),NOW);s=applyBreak(s,{days:4,endDate:dateAfter(4),reason:'WORK'},dateAfter(4));
 const easy=s.queue.find(w=>w.type==='EASY')!;assert.equal(easy.volumeFactor,.8);s=recordResult(s,easy.id,feedback(easy));
 assert.equal(s.reentry?.easyReductionPending,false);
});
test('Q0 threshold introduction does not leap to Q1 minimum12 minutes',()=>{
 let s=createEngine(profile(),NOW);s=performQuality(s);s=performQuality(s);const q=nextQuality(s).workout;
 assert.equal(q.type,'THRESHOLD');assert.ok(q.main.dose.value<=s.confirmedDoses.INTRO_QUALITY!.value+2);
});
test('a moved quality is cancelled by RED, not resurrected on replan',async()=>{
 const {moveWorkout}=await import('../src/index.ts');let s=createEngine(profile({...experienced,availableRunsPerWeek:4,actualRunsPerWeek:4}),NOW);
 const second=s.queue.find((w,i)=>i>0&&w.countsAsQuality)!;s=moveWorkout(s,second.id,dateAfter(4));
 const first=s.queue[0]!;s=recordResult(s,first.id,feedback(first,'RED'));assert.ok(s.queue.every(w=>!w.countsAsQuality));
 assert.ok(deserialize(serialize(s)).queue.every(w=>!w.countsAsQuality));
});
test('pain health branch cannot be hidden by an explicit environmental yellow reason',()=>{
 const s=createEngine(profile(),NOW),w=s.queue[0]!;
 const after=recordResult(s,w.id,feedback(w,'GREEN',{safety:{...healthy(),pain:2},yellowReason:'ENVIRONMENT'}));
 assert.equal(after.history.at(-1)!.classified.yellowReason,'PAIN');assert.equal(after.diagnosticHold,true);
});
test('future workouts crossing taper boundary already reduce volume',()=>{
 const s=createEngine(profile({raceDate:dateAfter(8)}),NOW);assert.equal(s.decision.phase,'DEVELOPMENT');
 assert.ok(s.queue.filter(w=>Date.parse(w.scheduledDate)>=Date.parse(dateAfter(1))).every(w=>w.volumeFactor===.6));
});
