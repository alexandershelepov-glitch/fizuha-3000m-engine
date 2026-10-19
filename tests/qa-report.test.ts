import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, classify} from '../src/index.ts';
import {NOW, profile, experienced} from './helpers.ts';
import {makeQaResult} from '../web/src/application/qaResults.ts';

test('QA green and partial use real work prescription and remain synthetic',()=>{
  const s=createEngine(profile({...experienced,actualRunsPerWeek:4,availableRunsPerWeek:4,
    averageWeeklyKm4Weeks:30,longestUsualRunKm:9}),NOW);
  for(const w of s.queue.filter(w=>w.type!=='REST')){
    const green=makeQaResult(w);
    assert.equal(green.date,w.scheduledDate);
    assert.equal(green.feedbackConfirmed,true);
    assert.equal(classify(w,green).evaluation,'GREEN',w.type+' synthetic GREEN');
    const partial=makeQaResult(w,true);
    assert.equal(partial.completionFraction,0.7);
    assert.equal(classify(w,partial).evaluation,'YELLOW',w.type+' synthetic YELLOW');
  }
});
