/**
 * Regression scenarios from the 14 October 2026 independent audit.
 * Reserved metres are conservative planning equivalents, not observed distances.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, deserialize, prescribe, recordResult, replan, serialize, updateTrainingData} from '../src/index.ts';
import {guardWeeklyLoad, qualityDoseCeiling} from '../src/workouts.ts';
import {withinRollingWeekBudget} from '../src/weeklyLoad.ts';
import {NOW, dateAfter, feedback, profile} from './helpers.ts';
import {SCENARIOS, simulateScenario} from '../audit/trainingSimulator.ts';

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
  // The day-28 session has already been completed, so the next weekly slot is day 35.
  const next=replan(state,dateAfter(29));
  assert.ok(next.queue.some(w=>w.main.mode==='RUN_WALK'&&w.main.dose.value===1100),
    'small earned increases must not disappear behind a hardcoded 1000m fallback');
});

test('AUDIT-N5 last days before race contain no long run, final three contain no quality',()=>{
  for(const remaining of [1,2,3,4,5,6,7,8,10]){
    const state=createEngine(profile({
      actualRunsPerWeek:4,availableRunsPerWeek:4,regularRunningWeeks:48,
      averageWeeklyKm4Weeks:28,longestUsualRunKm:9,
      performance:{timeSeconds:880,date:NOW,source:'TEST_3K'},
      qualitySessions8Weeks:8,qualityWeeks8Weeks:6,qualityMostlyTolerated:true,
      raceDate:dateAfter(remaining),
    }),NOW);
    for(const w of state.queue){
      const daysLeft=(Date.parse(state.profile.raceDate)-Date.parse(w.scheduledDate))/86400000;
      if(daysLeft<=7)assert.notEqual(w.type,'LONG_EASY','no long inside last seven days');
      if(daysLeft<=3)assert.equal(w.countsAsQuality,false,'no hard work in final three days');
      if(daysLeft===1)assert.equal(w.type,'REST','day before the event is rest');
    }
  }
});

test('AUDIT-N6 old or new high-intensity doses cannot bypass per-category v1 ceilings',()=>{
  for(const cfg of [
    {regularRunningWeeks:52,actualRunsPerWeek:4,averageWeeklyKm4Weeks:28,longestUsualRunKm:9},
    {regularRunningWeeks:52,actualRunsPerWeek:5,averageWeeklyKm4Weeks:45,longestUsualRunKm:12},
  ]){
    const state=createEngine(profile({
      ...cfg,availableRunsPerWeek:cfg.actualRunsPerWeek,
      qualitySessions8Weeks:8,qualityWeeks8Weeks:7,qualityMostlyTolerated:true,
      raceDate:dateAfter(100),
    }),NOW);
    for(const [type,unit,value] of [
      ['THRESHOLD','MINUTES',41],
      ['VO2','MINUTES',30],
      ['SPECIFIC_3K','METERS',5000],
    ] as const){
      state.doses[type]={unit,value};
      const capped=prescribe(state,type,NOW,'excess-'+type);
      assert.ok(capped.main.dose.value<=qualityDoseCeiling(state,type),type);
      assert.ok(qualityDoseCeiling(state,type)<value,type);
      const legacy=structuredClone(capped);
      legacy.main.dose.value=value;
      const guarded=guardWeeklyLoad(state,[legacy]);
      const accepted=guarded.find(w=>w.id===legacy.id);
      if(accepted?.countsAsQuality)assert.ok(accepted.main.dose.value<=qualityDoseCeiling(state,type),
        'previously saved quality doses must also be capped');
    }
  }
});

test('AUDIT-N7 publicly changing historical running mileage cannot break saved cycle validation',()=>{
  const state=createEngine(profile({averageWeeklyKm4Weeks:16,raceDate:dateAfter(80)}),NOW);
  const unchanged=serialize(state);
  for(const data of [{averageWeeklyKm4Weeks:24},{averageWeeklyKm4Weeks:8},{actualRunsPerWeek:4}]){
    assert.throws(()=>updateTrainingData(state,data,NOW),/Protected field/);
    assert.equal(serialize(state),unchanged);
    assert.deepEqual(deserialize(serialize(state)).easyProgression,state.easyProgression);
  }
});

test('AUDIT-N1/N2 simulated normal preparation retains easy days and earns a verified weekly review',()=>{
  const scenario=SCENARIOS.find(s=>s.id==='03-trained-easy-wins-12w');
  assert.ok(scenario);
  const report=simulateScenario(scenario!);
  const normal=report.events.filter(e=>e.action==='WORKOUT_RESULT' && e.workoutType!==null);
  const easy=normal.filter(e=>e.workoutType==='EASY'||e.workoutType==='LONG_EASY');
  const quality=normal.filter(e=>['THRESHOLD','VO2','SPECIFIC_3K','INTRO_QUALITY','CONTROL'].includes(e.workoutType??''));
  assert.ok(easy.length>=quality.length,
    'a trained runner must not get a quality-only week from the overzealous booking rule');
  assert.ok(report.lastState.easyProgression!.approvedMetersPer7Days>28000,
    'normal verified training must eventually earn a conservative volume review');
});
