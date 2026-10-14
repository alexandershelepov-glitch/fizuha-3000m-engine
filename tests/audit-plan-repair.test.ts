/**
 * Regression scenarios from the 14 October 2026 independent audit.
 * Reserved metres are conservative planning equivalents, not observed distances.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, prescribe} from '../src/index.ts';
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
