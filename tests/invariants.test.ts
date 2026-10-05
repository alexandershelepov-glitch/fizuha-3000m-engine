import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {applyBreak, createEngine, recordResult, replan, skipWorkout} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, healthy, nextQuality, performQuality, profile} from './helpers.ts';

const variants=()=>Array.from({length:7},(_,i)=>i+1).flatMap(available=>[false,true].flatMap(quality=>[9,16,30].map(km=>profile({availableRunsPerWeek:available,actualRunsPerWeek:km>=25?4:3,averageWeeklyKm4Weeks:km,longestUsualRunKm:km>=25?8:6,...quality?experienced:{}}))));
test('I01 Safety STOP never queues ordinary quality for all availability/capacity/Q combinations',()=>{
 for(const p of variants()){p.safety={...healthy(),otherStop:true};const s=createEngine(p,NOW);assert.ok(s.queue.every(w=>!w.countsAsQuality));assert.equal(s.decision.maximumQualityPerWeek,0);}
});
test('I02 CLOSED never anchors specific speed at target',()=>{
 for(const p of variants()){const s=createEngine(p,NOW);assert.equal(s.decision.gate,'CLOSED');assert.equal(s.decision.effectiveSpeedMps,s.decision.currentSpeedMps);assert.ok(s.queue.every(w=>w.anchor!=='EFFECTIVE'));}
});
test('I03 exactly two available sessions never prescribe two quality',()=>{
 for(const p of variants()){p.availableRunsPerWeek=2;const s=createEngine(p,NOW);assert.ok(s.queue.filter(w=>w.countsAsQuality).length<=1);}
});
test('I04 rolling seven-day history + queue never contains over two quality; recovery >=48h',()=>{
 let s=createEngine(profile({...experienced,availableRunsPerWeek:7,actualRunsPerWeek:4,averageWeeklyKm4Weeks:30,longestUsualRunKm:8,raceDate:dateAfter(100)}),NOW);
 for(let n=0;n<12;n++){
  const next=nextQuality(s);s=recordResult(next.state,next.workout.id,feedback(next.workout));
  const dates=[...s.history.filter(h=>h.workout.countsAsQuality).map(h=>h.result.date),...s.queue.filter(w=>w.countsAsQuality).map(w=>w.scheduledDate)].sort();
  for(const date of dates){assert.ok(dates.filter(d=>d<=date&&Date.parse(date)-Date.parse(d)<7*86400000).length<=2);}
  for(let i=1;i<dates.length;i++)assert.ok(Date.parse(dates[i]!)-Date.parse(dates[i-1]!)>=48*3600000);
 }
});
test('I05 skip does not increase next workout in any matrix profile',()=>{
 for(const p of variants()){const s=createEngine(p,NOW);if(s.queue.length<2)continue;const next=s.queue[1]!;const after=skipWorkout(s,s.queue[0]!.id);assert.deepEqual(after.queue.find(w=>w.id===next.id),next);}
});
test('I06 one GREEN does not progress',()=>{
 for(const p of variants()){const s=createEngine(p,NOW),w=s.queue.find(w=>w.countsAsQuality);if(!w)continue;const after=recordResult(s,w.id,feedback(w));assert.equal(after.doses[w.type]!.value,w.main.dose.value);}
});
test('I07 one GREEN_PLUS cannot alter Current Performance',()=>{
 const s=createEngine(profile(),NOW);const after=performQuality(s,'GREEN_PLUS');assert.deepEqual(after.profile.performance,s.profile.performance);
});
test('I08 two related yellow cannot lower Current Performance',()=>{
 let s=createEngine(profile(),NOW);const before=s.profile.performance;let n=nextQuality(s);s=recordResult(n.state,n.workout.id,feedback(n.workout,'YELLOW'));
 const easy=s.queue[0]!;s=recordResult(s,easy.id,feedback(easy));n=nextQuality(s);s=recordResult(n.state,n.workout.id,feedback(n.workout,'YELLOW'));
 assert.equal(s.relatedYellow,true);assert.deepEqual(s.profile.performance,before);
});
test('I09 RED overrides approaching race/taper',()=>{
 let s=createEngine(profile({raceDate:dateAfter(1)}),NOW);const w=s.queue[0]!;s=recordResult(s,w.id,feedback(w,'RED'));
 assert.equal(s.decision.phase,'HOLD_DIAGNOSTIC');assert.equal(s.decision.safety,'STOP');assert.ok(s.queue.every(w=>!w.countsAsQuality));
});
test('I10 ordinary result, skip, time advance or healthy break never changes performance',()=>{
 let s=createEngine(profile(),NOW);const before=s.profile.performance;s=performQuality(s);
 s=skipWorkout(s,s.queue[0]!.id);s=replan(s,dateAfter(8));s=applyBreak(s,{days:8,endDate:dateAfter(16),reason:'WORK'},dateAfter(16));assert.deepEqual(s.profile.performance,before);
});
test('I11 FOUNDATION never prescribes full SPECIFIC_3K or VO2',()=>{
 for(const p of variants()){p.performance=null;const s=createEngine(p,NOW);assert.equal(s.decision.phase,'FOUNDATION');assert.ok(s.queue.every(w=>!['SPECIFIC_3K','VO2'].includes(w.type)));}
});
test('I12 every healthy8–14-day reentry closes gate',()=>{
 for(let days=8;days<=14;days++){const s=applyBreak(createEngine(profile({...experienced}),NOW),{days,endDate:dateAfter(days),reason:'WORK'},dateAfter(days));assert.equal(s.decision.phase,'RE_ENTRY');assert.equal(s.decision.gate,'CLOSED');}
});
test('I13 LONG_TERM never uses target as anchor, including after confirmations',()=>{
 let s=createEngine(profile({...experienced,targetTimeSeconds:600}),NOW);s=performQuality(s);s=performQuality(s);
 assert.equal(s.decision.feasibility,'LONG_TERM');assert.equal(s.decision.gate,'CLOSED');assert.equal(s.decision.effectiveSpeedMps,s.decision.currentSpeedMps);
});
test('I14 equal inputs + event stream produce identical decisions, no clock/random dependencies',()=>{
 for(const p of variants()){let a=createEngine(p,NOW),b=createEngine(p,NOW);assert.deepEqual(a,b);if(a.queue.some(w=>w.countsAsQuality)){a=performQuality(a);b=performQuality(b);assert.deepEqual(a,b);}}
});
test('I15 source has no network/LLM/I/O runtime imports and package has no runtime dependencies',()=>{
 const dir=new URL('../src/',import.meta.url);
 for(const file of readdirSync(dir)){const text=readFileSync(new URL(file,dir),'utf8');assert.doesNotMatch(text,/\b(fetch|XMLHttpRequest|WebSocket|Date\.now|Math\.random)\s*\(/);for(const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g))assert.ok(match[1]!.startsWith('./'));}
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));assert.equal(pkg.dependencies,undefined);
});
