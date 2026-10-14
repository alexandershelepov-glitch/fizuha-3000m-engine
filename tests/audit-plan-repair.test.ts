/**
 * Regression scenarios from the 14 October 2026 independent audit.
 * Reserved metres are conservative planning equivalents, not observed distances.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, deserialize, prescribe, recordResult, replan, serialize, updateTrainingData} from '../src/index.ts';
import {guardWeeklyLoad} from '../src/workouts.ts';
import {withinRollingWeekBudget} from '../src/weeklyLoad.ts';
import {NOW, dateAfter, feedback, profile} from './helpers.ts';

test('AUDIT-N1 a past and a future quality run outside one shared week must not jointly erase EASY', () => {
  const state=createEngine(profile({
    actualRunsPerWeek:2, availableRunsPerWeek:2, averageWeeklyKm4Weeks:10,
    longestUsualRunKm:5, raceDate:dateAfter(100),
  }),NOW);
  const past=prescribe(state,'EASY',dateAfter(-6),'past');
  past.main.dose={unit:'METERS',value:4000};
  state.history.push({
    workout:past, result:feedback(past,'GREEN',{date:past.scheduledDate,feedbackConfirmed:true}),
    classified:{evaluation:'GREEN',yellowReason:null,sessionLoad:100,inRangeFraction:1,speedDropFraction:0},
  });

  const easy=prescribe(state,'EASY',NOW,'current');
  assert.equal(easy.main.dose.value,5000);
  const future=prescribe(state,'INTRO_QUALITY',dateAfter(6),'future-quality');
  // Meter-defined quality avoids estimates in this regression's controlled arithmetic.
  future.main.dose={unit:'METERS',value:4000};
  future.warmupMinutes=0;
  future.cooldownMinutes=0;

  const accepted=guardWeeklyLoad(state,[easy,future]);
  assert.equal(accepted.find(w=>w.id==='current')?.main.dose.value,5000,
    'past -6 and future +6 cannot be charged in the same seven-day window');
  assert.ok(accepted.some(w=>w.id==='future-quality'),'future quality retains its reserved space');
  assert.ok(withinRollingWeekBudget(state,[past,...accepted]));
});

test('AUDIT-N2 a fully verified healthy block can be reviewed after pending quality gets confirmed', () => {
  const state=createEngine(profile({
    actualRunsPerWeek:4, availableRunsPerWeek:4, regularRunningWeeks:40,
    averageWeeklyKm4Weeks:28, longestUsualRunKm:9,
    performance:{timeSeconds:880,date:NOW,source:'TEST_3K'},
    qualitySessions8Weeks:8, qualityWeeks8Weeks:6, qualityMostlyTolerated:true,
    raceDate:dateAfter(110),
  }),NOW);
  state.history=[];
  state.queue=[];
  for(const offset of [0,1,3,5,7,8,10,12]){
    const w=prescribe(state,'EASY',dateAfter(offset),'verified-'+offset);
    state.history.push({workout:w,result:feedback(w,'GREEN',{
      feedbackConfirmed:true,distanceMeters:w.main.dose.value,repeats:[],
    }),classified:{evaluation:'GREEN',yellowReason:null,sessionLoad:100,inRangeFraction:1,speedDropFraction:0}});
  }
  state.doses.VO2={unit:'MINUTES',value:12};
  state.confirmedDoses.VO2={unit:'MINUTES',value:10};
  const pending=replan(state,dateAfter(14));
  assert.equal(pending.easyProgression?.approvedMetersPer7Days,28000);
  assert.equal(pending.easyProgression?.lastReviewedBlock,-1,'temporary pending quality must not permanently forfeit the completed block');
  pending.confirmedDoses.VO2={unit:'MINUTES',value:12};
  const confirmed=replan(pending,dateAfter(14));
  assert.equal(confirmed.easyProgression?.approvedMetersPer7Days,29000);
  assert.equal(confirmed.easyProgression?.lastReviewedBlock,0);
  assert.equal(replan(confirmed,dateAfter(14)).easyProgression?.approvedMetersPer7Days,29000,
    'repeat review must not grant a second increase');
});

test('AUDIT-N3 a separately confirmed continuous 3km run escapes the sub-5km progression dead end', () => {
  const original=createEngine(profile({
    performance:null,canRun3Km:false,regularRunningWeeks:0,
    actualRunsPerWeek:0,availableRunsPerWeek:3,averageWeeklyKm4Weeks:0,
    longestUsualRunKm:0,raceDate:dateAfter(90),
  }),NOW);
  assert.equal(original.queue[0]?.main.dose.value,1000);
  let state=updateTrainingData(original,{canRun3Km:true},NOW);
  assert.equal(state.profile.performance,null,'continuous ability is not a measured race time');
  assert.equal(state.easyProgression?.approvedMetersPer7Days,3000);
  assert.equal(state.queue[0]?.main.dose.value,3000);
  assert.equal(state.queue[0]?.main.mode,'CONTINUOUS');
  for(let offset=0;offset<=14;offset++){
    const today=dateAfter(offset);
    state=replan(state,today);
    const w=state.queue.find(x=>x.scheduledDate===today);
    if(w&&w.type!=='REST')state=recordResult(state,w.id,feedback(w,'GREEN',{
      feedbackConfirmed:true,distanceMeters:w.main.dose.value,repeats:[],sessionRpe:3,
    }));
  }
  assert.equal(state.easyProgression?.approvedMetersPer7Days,3200,
    'verified easy running must be allowed to grow gradually even from a zero-history profile');
  assert.equal(deserialize(serialize(state)).easyProgression?.approvedMetersPer7Days,3200);
  assert.equal(state.profile.performance,null);
});

test('AUDIT-N4 earned novice distance actually reaches the single run/walk prescription',()=>{
  let state=createEngine(profile({
    performance:null,canRun3Km:false,regularRunningWeeks:0,
    actualRunsPerWeek:0,availableRunsPerWeek:4,averageWeeklyKm4Weeks:0,
    longestUsualRunKm:0,raceDate:dateAfter(100),
  }),NOW);
  for(let offset=0;offset<=28;offset++){
    const today=dateAfter(offset);
    state=replan(state,today);
    const w=state.queue.find(x=>x.scheduledDate===today);
    if(w&&w.type!=='REST')state=recordResult(state,w.id,feedback(w,'GREEN',{
      feedbackConfirmed:true,distanceMeters:w.main.dose.value,repeats:[],sessionRpe:3,
    }));
  }
  assert.equal(state.easyProgression?.approvedMetersPer7Days,1100);
  assert.equal(state.runWalkProgression?.stage,1);
  assert.ok(state.queue.some(w=>w.main.mode==='RUN_WALK'&&w.main.dose.value===1100),
    'small earned increases must not disappear behind a hardcoded 1000m fallback');
});
