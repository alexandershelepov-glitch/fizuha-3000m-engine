import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBreak, createEngine, deserialize, recordCheckpoint, recordResult, replan, serialize} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, profile} from './helpers.ts';

const prepared = () => profile({...experienced, actualRunsPerWeek: 4, availableRunsPerWeek: 4,
  averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(120)});

function nextQualityAfterConfirmedRuns(state: ReturnType<typeof createEngine>, maxDays = 30) {
  for (let i=0;i<maxDays;i++) {
    const today=state.asOf;
    const due=state.queue.find(w=>w.scheduledDate===today && w.type!=='REST');
    if(due?.countsAsQuality) return {state, workout:due};
    if(due) state=recordResult(state,due.id,feedback(due));
    state=replan(state,dateAfter(1,today));
  }
  throw new Error('No quality session appeared after the confirmed recovery sessions');
}

test('Issue 38: paired healthy training YELLOW requires a confirmed reduced EASY and no diagnostic confirmation', () => {
  let s=createEngine(prepared(),NOW);
  const q=s.queue.find(w=>w.countsAsQuality)!;
  s=recordResult(s,q.id,feedback(q,'YELLOW',{unexpectedFatigue:true}));
  const recovery=s.queue.find(w=>w.type==='EASY')!;
  s=recordResult(s,recovery.id,feedback(recovery,'YELLOW',{unexpectedFatigue:true}));
  assert.equal(s.relatedYellow,true);
  assert.equal(s.diagnosticHold,false);
  assert.equal(s.profile.safety.needsAssessment,false);
  assert.equal(s.decision.maximumQualityPerWeek,0);
  const saveRoundTrip=deserialize(serialize(s));
  assert.equal(saveRoundTrip.yellowEasyRequired,true);
  const easy=saveRoundTrip.queue.find(w=>w.type==='EASY')!;
  assert.ok(easy.volumeFactor <= .8);
  s=recordResult(saveRoundTrip,easy.id,feedback(easy));
  assert.equal(s.yellowEasyRequired,false);
  assert.equal(s.relatedYellow,false);
  const {workout:firstQuality}=nextQualityAfterConfirmedRuns(s);
  assert.ok(firstQuality.volumeFactor <= .85, 'the first quality session exists and is reduced after the successful EASY');
});

test('Issue 38: breaks of 4–7 days require a reduced easy before quality; 8–14 require two', () => {
  let s=createEngine(prepared(),NOW);
  s=applyBreak(s,{days:6,endDate:dateAfter(6),reason:'WORK'},dateAfter(6));
  assert.equal(s.reentry?.easyRemaining,1);
  assert.equal(s.queue.find(w=>w.type!=='REST')?.type,'EASY');
  assert.ok(s.queue.find(w=>w.type==='EASY')!.volumeFactor <= .8);
  s=deserialize(serialize(s));
  const e=s.queue.find(w=>w.type==='EASY')!;
  s=recordResult(s,e.id,feedback(e));
  assert.equal(s.reentry?.easyRemaining,0);
  const {workout:quality}=nextQualityAfterConfirmedRuns(s);
  assert.ok(quality.volumeFactor <= .85, 'after 4–7 days, quality returns only after a successful EASY and is reduced');

  let medium=createEngine(prepared(),NOW);
  medium=applyBreak(medium,{days:10,endDate:dateAfter(10),reason:'WORK'},dateAfter(10));
  assert.equal(medium.reentry?.easyRemaining,2);
  assert.ok(medium.queue.every(w=>!w.countsAsQuality));
  const easies=medium.queue.filter(w=>w.type==='EASY').slice(0,2);
  assert.equal(easies.length,2);
  for(const easy of easies) {
    assert.ok(easy.main.dose.value>0);
    medium=recordResult(medium,easy.id,feedback(easy));
  }
  assert.equal(medium.reentry?.easyRemaining,0);
  assert.equal(medium.checkpointRequired,true);
  medium=recordCheckpoint(medium,{...medium.profile.performance!,date:medium.asOf},medium.asOf);
  const {workout:afterMediumBreak}=nextQualityAfterConfirmedRuns(medium);
  assert.ok(afterMediumBreak.main.dose.value>0, 'first quality after 8–14 days exists after both EASY confirmations and checkpoint');
  assert.ok(afterMediumBreak.volumeFactor<=.75, 'first quality after 8–14 days is reduced');
});

test('Issue 38: RED and pain still keep the diagnostic safety hold', () => {
  let s=createEngine(prepared(),NOW);
  const q=s.queue.find(w=>w.countsAsQuality)!;
  s=recordResult(s,q.id,feedback(q,'RED'));
  assert.equal(s.diagnosticHold,true);
  assert.equal(s.decision.maximumQualityPerWeek,0);
  assert.ok(s.queue.every(w=>w.type==='REST'));
});

test('Issue 38: 12 km habitual long run is never mislabeled below 7.8 km', () => {
  const p=profile({...experienced,actualRunsPerWeek:3,availableRunsPerWeek:3,
    averageWeeklyKm4Weeks:25,longestUsualRunKm:12,regularRunningWeeks:40,
    performance:{timeSeconds:870,date:NOW,source:'TEST_3K'},raceDate:dateAfter(120)});
  const s=createEngine(p,NOW);
  for(const w of s.queue.filter(w=>w.type==='LONG_EASY')) assert.ok(w.main.dose.value>=7800);
  for(const w of s.queue.filter(w=>w.type==='EASY' && !w.main.calibration))
    assert.ok(w.main.dose.value>=2000 || w.volumeFactor<1);
});
