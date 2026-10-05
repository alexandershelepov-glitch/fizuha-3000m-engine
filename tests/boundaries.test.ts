import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessCapacity, assessConfidence, assessFeasibility, assessQuality, assessSafety, classify, createEngine, taperDays} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, healthy, profile} from './helpers.ts';

for(const [age,expected] of [[0,'HIGH'],[21,'HIGH'],[22,'MEDIUM'],[42,'MEDIUM'],[43,'LOW']] as const)test(`confidence result age ${age} days → ${expected}`,()=>{
 assert.equal(assessConfidence(profile({performance:{timeSeconds:920,date:dateAfter(-age),source:'TEST_3K'}}),NOW),expected);
});
for(const [days,expected] of [[3,'HIGH'],[4,'MEDIUM'],[14,'MEDIUM'],[15,'LOW']] as const)test(`confidence healthy break ${days} → ${expected}`,()=>{
 assert.equal(assessConfidence(profile({performance:{timeSeconds:920,date:dateAfter(-15),source:'TEST_3K'},breaks:[{days,endDate:NOW,reason:'WORK'}]}),NOW),expected);
});
for(const capacity of ['T1','T2','T3'] as const){
 const thresholds=capacity==='T1'?{regularRunningWeeks:4,actualRunsPerWeek:2,averageWeeklyKm4Weeks:8,longestUsualRunKm:3}:capacity==='T2'?{regularRunningWeeks:8,actualRunsPerWeek:3,averageWeeklyKm4Weeks:15,longestUsualRunKm:6}:{regularRunningWeeks:12,actualRunsPerWeek:4,averageWeeklyKm4Weeks:25,longestUsualRunKm:8};
 test(`capacity ${capacity}: all criteria exactly at boundary`,()=>assert.equal(assessCapacity(profile(thresholds)),capacity));
 for(const field of Object.keys(thresholds) as (keyof typeof thresholds)[]) {
  if(capacity==='T1'&&field==='longestUsualRunKm')continue;
  test(`capacity ${capacity}: ${field} below threshold cannot qualify`,()=>assert.notEqual(assessCapacity(profile({...thresholds,[field]:thresholds[field]-.01})),capacity));
 }
}
test('T1 requires ability to continuously run3km',()=>assert.equal(assessCapacity(profile({regularRunningWeeks:4,actualRunsPerWeek:2,averageWeeklyKm4Weeks:8,canRun3Km:false})),'T0'));
for(const [sessions,weeks,tolerated,expected] of [[2,2,true,'Q0'],[3,3,true,'Q1'],[7,5,true,'Q1'],[8,6,true,'Q2'],[8,6,false,'Q1'],[12,4,true,'Q1']] as const)test(`quality ${sessions} sessions / ${weeks} weeks / tolerance ${tolerated} → ${expected}`,()=>{
 assert.equal(assessQuality(profile({qualitySessions8Weeks:sessions,qualityWeeks8Weeks:weeks,qualityMostlyTolerated:tolerated})),expected);
});
for(const flag of ['painIncreasing','alteredMovement','painWalkingOrRest','swelling','acuteIllness','otherStop'] as const)test(`Safety STOP by ${flag}`,()=>assert.equal(assessSafety({...healthy(),[flag]:true}),'STOP'));
for(const [pain,status] of [[1,'OK'],[2,'HOLD'],[3,'HOLD'],[4,'HOLD']] as const)test(`Safety pain ${pain} without stop flags → ${status}`,()=>assert.equal(assessSafety({...healthy(),pain}),status));
for(const [gap,weeks,expected] of [[.03,3,'PLAUSIBLE'],[.03,2.99,'AMBITIOUS'],[.030001,6,'PLAUSIBLE'],[.06,4,'AMBITIOUS'],[.060001,5.99,'LOW_PROBABILITY'],[.1,10,'PLAUSIBLE'],[.100001,12,'AMBITIOUS'],[.15,12,'AMBITIOUS'],[.150001,100,'LONG_TERM'],[.04,5.99,'AMBITIOUS'],[.04,3.99,'LOW_PROBABILITY'],[.08,6,'AMBITIOUS']] as const)test(`feasibility gap ${gap}, weeks ${weeks} → ${expected}`,()=>{
 assert.equal(assessFeasibility(gap,weeks,'T2','Q1',3),expected);
});
test('feasibility modifiers apply only gap>3%, cap at LOW_PROBABILITY, preserve LONG_TERM',()=>{
 assert.equal(assessFeasibility(.03,6,'T0','Q0',2),'PLAUSIBLE');assert.equal(assessFeasibility(.04,6,'T1','Q1',3),'AMBITIOUS');assert.equal(assessFeasibility(.04,6,'T1','Q0',2),'LOW_PROBABILITY');assert.equal(assessFeasibility(.2,20,'T0','Q0',2),'LONG_TERM');assert.equal(assessFeasibility(null,20,'T3','Q2',5),null);
});
for(const [completion,expected] of [[.94999,'YELLOW'],[.95,'GREEN'],[1,'GREEN']] as const)test(`completion boundary ${completion} → ${expected}`,()=>{
 const w=createEngine(profile({...experienced}),NOW).queue[0]!;assert.equal(classify(w,feedback(w,'GREEN',{completionFraction:completion})).evaluation,expected);
});
for(const ratio of [.8,.6])test(`repeats in range ${ratio}`,()=>{
 const w=createEngine(profile({...experienced}),NOW).queue[0]!,r=feedback(w);r.repeats[1]!.seconds*=3;if(ratio===.6)r.repeats[2]!.seconds*=3;
 assert.equal(classify(w,r).evaluation,ratio===.8?'GREEN':'YELLOW');
});
for(const drop of [.05,.050001])test(`speed fade boundary ${drop}`,()=>{
 const w=createEngine(profile({...experienced}),NOW).queue[0]!,r=feedback(w);const speed=w.speedRangeMps![1];r.repeats=r.repeats.map(()=>({distanceMeters:600,seconds:600/speed}));r.repeats[4]!.seconds=600/(speed*(1-drop));
 assert.equal(classify(w,r).evaluation,drop===.05?'GREEN':'YELLOW');
});
for(const [t,q,days] of [['T0','Q0',5],['T1','Q1',5],['T2','Q1',7],['T3','Q1',7],['T3','Q2',10]] as const)test(`taper ${t}/${q} chooses ${days} days within specified range`,()=>assert.equal(taperDays(t,q),days));
for(const [gap,closed] of [[.08,false],[.080001,true]] as const)test(`Target gate gap boundary ${gap}`,()=>{
 const s=createEngine(profile({...experienced,performance:{timeSeconds:896*(1+gap),date:NOW,source:'TEST_3K'}}),NOW);s.successfulQuality=2;
 // Assessing through the public replanner, never ID-based behavior.
 return import('../src/index.ts').then(({replan})=>assert.equal(replan(s).decision.gate,closed?'CLOSED':'PARTIAL'));
});
