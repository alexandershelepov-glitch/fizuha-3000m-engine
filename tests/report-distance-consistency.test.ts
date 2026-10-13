import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, createEngine, EngineError, recordResult, validateResult} from '../src/index.ts';
import {buildWorkoutResult, defaultResultDraft} from '../web/src/application/resultForm.ts';
import {loadResultDraft} from '../web/src/application/draft.ts';
import {RESULT_DRAFT_KEY} from '../web/src/application/storage.ts';
import {memoryStorage} from './helpers-app.ts';
import {NOW, feedback, profile} from './helpers.ts';

function preparedSplits() {
  const s = createEngine(profile({qualitySessions8Weeks: 0, qualityWeeks8Weeks: 0}), NOW);
  const w = s.queue.find(x => x.type === 'INTRO_QUALITY')!;
  assert.ok(w);
  return {state:s, workout:w, base:defaultResultDraft(w)};
}
test('DIST-01 unmeasured total remains blank; zero sentinel is not invented', () => {
  const {workout, base} = preparedSplits();
  assert.equal(base.distanceMeters, '');
  const converted=buildWorkoutResult(workout, base);
  assert.equal(converted.ok,true);
  if(converted.ok) assert.equal(converted.result.distanceMeters,0);
});
test('DIST-02 measured splits become the minimum known distance; never fabricate warmup metres', () => {
  const {state,workout,base}=preparedSplits();
  const draft={...base,repeats:Array.from({length:4},()=>({distanceMeters:'200',seconds:'0:51'}))};
  const converted=buildWorkoutResult(workout,draft);
  assert.equal(converted.ok,true);
  if(!converted.ok) return;
  assert.equal(converted.result.distanceMeters,800);
  assert.equal(converted.result.repeats.reduce((n,r)=>n+r.distanceMeters,0),800);
  const recorded=recordResult(state,workout.id,converted.result);
  assert.equal(recorded.history.length,1);
  assert.equal(classify(workout,converted.result).evaluation,'GREEN');
});
test('DIST-03 explicit total smaller than split sum is rejected before engine', ()=>{
  const {workout,base}=preparedSplits();
  const repeats=Array.from({length:4},()=>({distanceMeters:'200',seconds:'0:51'}));
  for(const total of ['0','600','799']){
    const converted=buildWorkoutResult(workout,{...base,distanceMeters:total,repeats});
    assert.equal(converted.ok,false,total);
    if(!converted.ok) assert.ok(converted.problems.some(x=>x.field==='distanceMeters'&&x.kind==='CONFLICT'));
  }
  const valid=buildWorkoutResult(workout,{...base,distanceMeters:'1300',repeats});
  assert.equal(valid.ok,true);
  if(valid.ok) assert.equal(valid.result.distanceMeters,1300); // measured warmup may exceed the split total
});
test('DIST-04 the public engine itself rejects contradictory splits; GREEN cannot be recorded', ()=>{
  const {state,workout}=preparedSplits();
  const invalid={...feedback(workout),distanceMeters:0,
    repeats:Array.from({length:4},()=>({distanceMeters:200,seconds:51}))};
  assert.throws(()=>validateResult(invalid),(e:unknown)=>e instanceof EngineError&&e.code==='RESULT_DISTANCE_CONFLICT');
  assert.throws(()=>recordResult(state,workout.id,invalid),(e:unknown)=>e instanceof EngineError&&e.code==='RESULT_DISTANCE_CONFLICT');
  assert.equal(state.history.length,0);
  const plausible={...invalid,distanceMeters:800};
  assert.doesNotThrow(()=>validateResult(plausible));
  assert.doesNotThrow(()=>validateResult({...invalid,distanceMeters:0,repeats:[]}));
});
test('DIST-05 old draft 0 is migrated to unknown; splits and safety answers survive',()=>{
  const {workout,base}=preparedSplits();
  const legacy={...base,distanceMeters:'0',repeats:[{distanceMeters:'200',seconds:'0:51'}],safetyResponse:'SYMPTOMS'};
  const storage=memoryStorage({[RESULT_DRAFT_KEY]:JSON.stringify({workoutId:workout.id,draft:legacy})});
  const loaded=loadResultDraft(storage,workout.id);
  assert.equal(loaded?.distanceMeters,'');
  assert.deepEqual(loaded?.repeats,legacy.repeats);
  assert.equal(loaded?.safetyResponse,'SYMPTOMS');
});
