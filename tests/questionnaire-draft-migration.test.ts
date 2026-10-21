import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadDraft, saveDraft} from '../web/src/application/draft.ts';
import {buildProfile} from '../web/src/application/questionnaire.ts';
import {ACTIVE_CYCLE_KEY, QUESTIONNAIRE_DRAFT_KEY, loadActiveCycle} from '../web/src/application/storage.ts';
import {appCycle, draft, memoryStorage} from './helpers-app.ts';
import {NOW} from './helpers.ts';

const legacy = () => draft({actualRunsPerWeek:'3',averageWeeklyKm4Weeks:'15',longestUsualRunKm:'5'});
const material = ['resultDate','canRun3Km','actualRunsPerWeek','averageWeeklyKm4Weeks','longestUsualRunKm','performanceMismatch'] as const;

test('unversioned drafts require all material answers, preserving unrelated user input', () => {
  const old=legacy();
  const storage=memoryStorage({[QUESTIONNAIRE_DRAFT_KEY]:JSON.stringify(old)});
  const loaded=loadDraft(storage,NOW);
  const built=buildProfile(loaded);
  assert.equal(built.ok,false);
  if(built.ok) throw new Error('Legacy answers were silently accepted');
  assert.deepEqual(built.problems.map(p=>p.field).sort(),[...material].sort());
  for(const field of material) assert.equal(loaded[field],field==='canRun3Km'||field==='performanceMismatch'?null:'');
  assert.equal(loaded.resultTime,old.resultTime);
  assert.equal(loaded.targetTime,old.targetTime);
  assert.deepEqual(loaded.safety,old.safety);
  assert.equal(loaded.raceDate,old.raceDate);
  assert.equal(storage.writes,0,'loading does not rewrite stored data');
});

test('legacy values differing from old defaults also require confirmation because provenance is unknown', () => {
  const storage=memoryStorage({[QUESTIONNAIRE_DRAFT_KEY]:JSON.stringify(draft({
    canRun3Km:false,actualRunsPerWeek:'5',averageWeeklyKm4Weeks:'40',longestUsualRunKm:'14',performanceMismatch:'CLEAR',
  }))});
  const loaded=loadDraft(storage,NOW);
  assert.equal(loaded.canRun3Km,null);
  assert.equal(loaded.actualRunsPerWeek,'');
  assert.equal(loaded.performanceMismatch,null);
});

test('explicit new answers matching old defaults survive save and reload', () => {
  const storage=memoryStorage();
  const answered=legacy();
  saveDraft(storage,answered);
  assert.deepEqual(loadDraft(storage,NOW),answered);
  assert.equal(buildProfile(loadDraft(storage,NOW)).ok,true);
});

test('partial reconfirmation survives reload without confirming the remaining legacy answers', () => {
  const storage=memoryStorage({[QUESTIONNAIRE_DRAFT_KEY]:JSON.stringify(legacy())});
  const loaded=loadDraft(storage,NOW);
  saveDraft(storage,{...loaded,canRun3Km:false,actualRunsPerWeek:'0'});
  const partial=loadDraft(storage,NOW);
  assert.equal(partial.canRun3Km,false);
  assert.equal(partial.actualRunsPerWeek,'0');
  assert.equal(partial.averageWeeklyKm4Weeks,'');
  assert.equal(partial.resultDate,'');
  assert.equal(partial.performanceMismatch,null);
  assert.equal(buildProfile(partial).ok,false);
  const completed={...partial,resultDate:NOW,averageWeeklyKm4Weeks:'0',longestUsualRunKm:'0',performanceMismatch:'NONE' as const};
  saveDraft(storage,completed);
  assert.deepEqual(loadDraft(storage,NOW),completed);
  assert.equal(buildProfile(loadDraft(storage,NOW)).ok,true);
});

test('legacy no-result novices can continue after explicitly answering capability and baseline volume', () => {
  const storage=memoryStorage({[QUESTIONNAIRE_DRAFT_KEY]:JSON.stringify(draft({hasResult:false}))});
  const loaded=loadDraft(storage,NOW);
  const answered={...loaded,canRun3Km:false,actualRunsPerWeek:'0',averageWeeklyKm4Weeks:'0',longestUsualRunKm:'0'};
  const built=buildProfile(answered);
  assert.equal(built.ok,true);
  if(!built.ok) return;
  assert.equal(built.profile.performance,null);
  assert.equal(built.profile.performanceMismatch,'NONE');
});

test('legacy draft migration and confirmation leave an existing cycle byte-for-byte unchanged', () => {
  const cycle=appCycle();
  cycle.storage.setItem(QUESTIONNAIRE_DRAFT_KEY,JSON.stringify(legacy()));
  const before=loadActiveCycle(cycle.repo);
  const loaded=loadDraft(cycle.storage,NOW);
  saveDraft(cycle.storage,{...loaded,canRun3Km:false});
  assert.equal(cycle.storage.getItem(ACTIVE_CYCLE_KEY),cycle.raw);
  assert.deepEqual(loadActiveCycle(cycle.repo),before);
});
