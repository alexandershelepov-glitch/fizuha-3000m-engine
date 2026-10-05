import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBreak, createEngine, recordCheckpoint, recordResult, replan} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, healthy, nextQuality, performQuality, profile} from './helpers.ts';

test('01: 15:20 → 14:56; Q0 development, one quality, gate closed', () => {
  const s = createEngine(profile(), NOW);
  assert.equal(s.decision.phase, 'DEVELOPMENT'); assert.equal(s.decision.quality, 'Q0');
  assert.equal(s.decision.maximumQualityPerWeek, 1); assert.equal(s.decision.gate, 'CLOSED');
  assert.equal(s.queue.find(w => w.countsAsQuality)!.type, 'INTRO_QUALITY');
});
test('02: 17:10 → 14:56 is not simple and does not prescribe target pace', () => {
  const s = createEngine(profile({performance:{timeSeconds:1030,date:NOW,source:'TEST_3K'},raceDate:dateAfter(56),averageWeeklyKm4Weeks:14,regularRunningWeeks:16}), NOW);
  assert.equal(s.decision.feasibility, 'LOW_PROBABILITY'); assert.equal(s.decision.gate, 'CLOSED');
  assert.equal(s.decision.effectiveSpeedMps, 3000 / 1030);
});
test('03: experienced 14:40 → 13:50 develops then enters specific via gate', () => {
  let s = createEngine(profile({...experienced,performance:{timeSeconds:880,date:NOW,source:'TEST_3K'},targetTimeSeconds:830,raceDate:dateAfter(70),regularRunningWeeks:52,actualRunsPerWeek:4,availableRunsPerWeek:4,averageWeeklyKm4Weeks:28,longestUsualRunKm:9}),NOW);
  assert.equal(s.decision.phase, 'DEVELOPMENT'); assert.equal(s.decision.maximumQualityPerWeek,2); assert.equal(s.decision.gate,'CLOSED');
  s=performQuality(s); s=performQuality(s); assert.equal(s.decision.phase,'SPECIFIC'); assert.equal(s.decision.gate,'PARTIAL');
  assert.ok(s.queue.some(w => w.type === 'SPECIFIC_3K'));
});
test('04: advanced 12:30 → 12:10 preserves T3/Q2 and two quality', () => {
  const s=createEngine(profile({...experienced,performance:{timeSeconds:750,date:NOW,source:'TEST_3K'},targetTimeSeconds:730,raceDate:dateAfter(56),regularRunningWeeks:208,actualRunsPerWeek:5,availableRunsPerWeek:5,averageWeeklyKm4Weeks:45,longestUsualRunKm:12}),NOW);
  assert.equal(s.decision.capacity,'T3');assert.equal(s.decision.quality,'Q2');assert.equal(s.queue.filter(w=>w.countsAsQuality).length,2);assert.ok(!s.queue.some(w=>w.type==='INTRO_QUALITY'));
});
test('05: no result, only 2km continuously → foundation without VO2/specific', () => {
  const s=createEngine(profile({performance:null,canRun3Km:false,raceDate:dateAfter(84),regularRunningWeeks:0,actualRunsPerWeek:1,averageWeeklyKm4Weeks:2,longestUsualRunKm:2}),NOW);
  assert.equal(s.decision.phase,'FOUNDATION');assert.equal(s.decision.confidence,'UNKNOWN');assert.equal(s.decision.gate,'CLOSED');assert.ok(s.queue.every(w=>!['VO2','SPECIFIC_3K'].includes(w.type)));
});
test('06: two available sessions → one quality plus aerobic', () => {
  const s=createEngine(profile({...experienced,performance:{timeSeconds:950,date:NOW,source:'TEST_3K'},availableRunsPerWeek:2,raceDate:dateAfter(70)}),NOW);
  assert.equal(s.queue.filter(w=>w.countsAsQuality).length,1);assert.equal(s.queue.filter(w=>['EASY','LONG_EASY'].includes(w.type)).length,1);
});
test('07: five sessions → at most two quality, majority easy', () => {
  const s=createEngine(profile({...experienced,performance:{timeSeconds:855,date:NOW,source:'TEST_3K'},targetTimeSeconds:810,raceDate:dateAfter(56),actualRunsPerWeek:5,availableRunsPerWeek:5,averageWeeklyKm4Weeks:38,longestUsualRunKm:10}),NOW);
  assert.equal(s.queue.filter(w=>w.countsAsQuality).length,2);assert.equal(s.queue.filter(w=>!w.countsAsQuality).length,3);
});
test('08: three successful weeks → healthy 8-day break → two easy then reduced quality', () => {
  let s=createEngine(profile({...experienced,availableRunsPerWeek:4,performance:{timeSeconds:910,date:NOW,source:'TEST_3K'},targetTimeSeconds:870,raceDate:dateAfter(84)}),NOW);
  for(let n=0;n<6;n++) s=performQuality(s);
  s=replan(s,dateAfter(21)); const before=s.profile.performance;
  const now=dateAfter(29);s=applyBreak(s,{days:8,endDate:now,reason:'WORK'},now);
  assert.equal(s.decision.phase,'RE_ENTRY');assert.equal(s.decision.gate,'CLOSED');
  for(let n=0;n<2;n++) {const w=s.queue[0]!;assert.equal(w.type,'EASY');assert.ok(w.volumeFactor>=.6&&w.volumeFactor<=.8);s=recordResult(s,w.id,feedback(w));}
  assert.equal(s.checkpointRequired,true);const {state,workout}=nextQuality(s);assert.ok(workout.volumeFactor>=.7&&workout.volumeFactor<=.8);
  s=recordResult(state,workout.id,feedback(workout));assert.equal(s.reentry,null);assert.deepEqual(s.profile.performance,before);
});
test('09: RPE10 instead of8 then 70% with tired legs → related yellow hold, performance preserved', () => {
  let s=createEngine(profile({...experienced,performance:{timeSeconds:930,date:NOW,source:'TEST_3K'},targetTimeSeconds:870}),NOW);
  const original=s.profile.performance;
  let n=nextQuality(s);s=recordResult(n.state,n.workout.id,feedback(n.workout,'GREEN',{sessionRpe:10}));assert.equal(s.history.at(-1)!.classified.evaluation,'YELLOW');
  const easy=s.queue.find(w=>w.type==='EASY')!;s=recordResult(s,easy.id,feedback(easy));
  n=nextQuality(s);s=recordResult(n.state,n.workout.id,feedback(n.workout,'YELLOW',{unexpectedFatigue:true}));
  assert.equal(s.relatedYellow,true);assert.equal(s.decision.phase,'HOLD_DIAGNOSTIC');assert.deepEqual(s.profile.performance,original);assert.ok(s.queue.every(w=>!w.countsAsQuality));
});
test('10: two easy quality confirmations → checkpoint15:20; T/Q unchanged', () => {
  let s=createEngine(profile({performance:{timeSeconds:960,date:NOW,source:'TEST_3K'}}),NOW);
  const t=s.decision.capacity,q=s.decision.quality;
  s=performQuality(s,'GREEN_PLUS');assert.equal(s.profile.performance!.timeSeconds,960);s=performQuality(s,'GREEN_PLUS');assert.equal(s.checkpointRequired,true);
  s=recordCheckpoint(s,{timeSeconds:920,date:s.asOf,source:'TEST_3K'},s.asOf);
  assert.equal(s.profile.performance!.timeSeconds,920);assert.equal(s.decision.capacity,t);assert.equal(s.decision.quality,q);assert.equal(s.checkpointRequired,false);
});
test('11: 18:20 → 13:30, short horizon → long term and conservative foundation', () => {
  const s=createEngine(profile({performance:{timeSeconds:1100,date:NOW,source:'TEST_3K'},targetTimeSeconds:810,raceDate:dateAfter(35),regularRunningWeeks:8,actualRunsPerWeek:2,availableRunsPerWeek:2,averageWeeklyKm4Weeks:9,longestUsualRunKm:4}),NOW);
  assert.equal(s.decision.feasibility,'LONG_TERM');assert.equal(s.decision.phase,'FOUNDATION');assert.equal(s.decision.gate,'CLOSED');assert.equal(s.decision.effectiveSpeedMps,3000/1100);
});
test('12: pain2 → yellow health; pain4 increasing, altered motion → red blocked', () => {
  let s=createEngine(profile({performance:{timeSeconds:890,date:NOW,source:'TEST_3K'},targetTimeSeconds:860}),NOW);
  const w=s.queue[0]!;s=recordResult(s,w.id,feedback(w,'GREEN',{safety:{...healthy(),pain:2}}));
  assert.equal(s.history.at(-1)!.classified.evaluation,'YELLOW');assert.equal(s.decision.safety,'HOLD');
  const rest=s.queue[0]!;s=recordResult(s,rest.id,feedback(rest,'GREEN',{safety:{...healthy(),pain:4,painIncreasing:true,alteredMovement:true}}));
  assert.equal(s.history.at(-1)!.classified.evaluation,'RED');assert.equal(s.decision.safety,'STOP');assert.ok(s.queue.every(w=>!w.countsAsQuality));
});
