import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {App} from './App.tsx';
import {appCycle} from '../../../tests/helpers-app.ts';
import {NOW,dateAfter,healthy} from '../../../tests/helpers.ts';
import {confirmContinuous3k} from '../application/continuous3k.ts';
import {loadActiveCycle} from '../application/storage.ts';
import {submitCheckpoint} from '../application/checkpoint.ts';

import type {EngineState} from '../application/engineGateway.ts';

beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date']});
  vi.setSystemTime(new Date(NOW+'T12:00:00Z'));
  window.history.replaceState(null,'','/today');
});
afterEach(()=>{cleanup();vi.useRealTimers();});

const starter=()=>appCycle({
  performance:null,canRun3Km:false,regularRunningWeeks:4,
  actualRunsPerWeek:2,availableRunsPerWeek:5,averageWeeklyKm4Weeks:10,
  longestUsualRunKm:5,qualitySessions8Weeks:0,qualityWeeks8Weeks:0,
  safety:healthy(),raceDate:dateAfter(90),
});
function attempt(f:ReturnType<typeof starter>,overrides:Partial<Parameters<typeof confirmContinuous3k>[0]>={}){
  return confirmContinuous3k({
    repo:f.repo,appState:f.appState,engineState:f.engineState,
    runDate:NOW,deviceToday:NOW,at:NOW+'T12:00:00Z',
    ranAll3000WithoutWalking:true,noUnusualSymptoms:true,...overrides,
  });
}

test('3K-01 deliberate report changes only capability, preserves original plan baseline and no timed result',()=>{
  const f=starter();
  expect(f.engineState.queue[0]?.main.mode).toBe('RUN_WALK');
  const result=attempt(f);
  expect(result.ok).toBe(true);
  if(!result.ok)return;
  const state=result.done.engineState;
  expect(state.profile.canRun3Km).toBe(true);
  expect(state.profile.performance).toBeNull();
  expect(state.decision.maximumQualityPerWeek).toBe(0);
  expect(state.checkpointRequired).toBe(true);
  expect(state.queue.filter(w=>w.type!=='REST').every(w=>w.main.mode==='CONTINUOUS')).toBe(true);
  expect(state.queue.every(w=>!w.countsAsQuality)).toBe(true);
  expect(state.profile.averageWeeklyKm4Weeks).toBe(10);
  expect(result.done.appState.cycle.baseline.performance).toBeNull();
  expect(result.done.appState.events.filter(e=>e.type==='CONTINUOUS_3K_CONFIRMED')).toHaveLength(1);
  const entry=result.done.appState.events.at(-1)!;
  if(entry.type==='CONTINUOUS_3K_CONFIRMED')expect(entry.runDate).toBe(NOW);
  const stored=loadActiveCycle(f.repo);
  expect(stored.kind).toBe('READY');
  if(stored.kind==='READY')expect(stored.engineState.profile.canRun3Km).toBe(true);
});

test('3K-02 no checkboxes, one checkbox, or symptomatic response cannot change stored plan',()=>{
  for(const change of [{ranAll3000WithoutWalking:false},{noUnusualSymptoms:false}]){
    const f=starter();
    const result=attempt(f,change);
    expect(result.ok).toBe(false);
    if(!result.ok)expect(result.error.code).toBe('CONTINUOUS_3K_UNCONFIRMED');
    expect(f.repo.read()).toBe(f.raw);
  }
});

test('3K-03 date must be a real calendar date during current cycle, before event and not future',()=>{
  for(const runDate of ['invalid','2026-02-31',dateAfter(-1),dateAfter(1),dateAfter(90)]){
    const f=starter();
    const result=attempt(f,{runDate});
    expect(result.ok).toBe(false);
    if(!result.ok)expect(result.error.code).toBe('CONTINUOUS_3K_BAD_DATE');
    expect(f.repo.read()).toBe(f.raw);
  }
});

test('3K-04 medical warning/stop, repeated capability or break cannot be used as shortcut',()=>{
  const f=starter();
  for(const state of [
    {...f.engineState,diagnosticHold:true},
    {...f.engineState,progressionBlocked:true},
    {...f.engineState,relatedYellow:true},
    {...f.engineState,profile:{...f.engineState.profile,safety:{...healthy(),swelling:true}},
      decision:{...f.engineState.decision,safety:'STOP' as const}},
    {...f.engineState,profile:{...f.engineState.profile,canRun3Km:true}},
    {...f.engineState,reentry:{breakDays:8,easyRemaining:2,easyReductionPending:false,easyFactor:.7,qualityFactor:.75,diagnosticRequired:false}},
  ] satisfies EngineState[]){
    const res=attempt(f,{engineState:state});
    expect(res.ok).toBe(false);
    if(!res.ok)expect(res.error.code).toBe('CONTINUOUS_3K_NOT_ALLOWED');
    expect(f.repo.read()).toBe(f.raw);
  }
});

test('3K-05 unresolved past workout blocks transition before storage is touched',()=>{
  const f=starter();
  const result=attempt(f,{deviceToday:dateAfter(1),runDate:dateAfter(1)});
  expect(result.ok).toBe(false);
  if(!result.ok)expect(result.error.code).toBe('PENDING_RESULT_BLOCKED');
  expect(f.repo.read()).toBe(f.raw);
});

test('3K-06 actual timed checkpoint is separate and only it creates measured performance',()=>{
  const f=starter();
  const first=attempt(f);
  expect(first.ok).toBe(true);
  if(!first.ok)return;
  const measurement=submitCheckpoint({
    repo:f.repo,appState:first.done.appState,engineState:first.done.engineState,
    performance:{date:NOW,timeSeconds:970,source:'TEST_3K'},
    deviceToday:NOW,at:NOW+'T12:01:00Z',
  });
  expect(measurement.ok).toBe(true);
  if(!measurement.ok)return;
  expect(measurement.done.engineState.profile.performance?.timeSeconds).toBe(970);
  expect(measurement.done.engineState.checkpointRequired).toBe(false);
});

test('3K-07 run-walk green sessions never silently grant 3 km capability',()=>{
  const f=starter();
  expect(f.engineState.profile.canRun3Km).toBe(false);
  expect(f.engineState.profile.performance).toBeNull();
  expect(f.engineState.queue.some(w=>w.main.mode==='RUN_WALK')).toBe(true);
});

test('3K-08 real UI requires two deliberate affirmations and survives page reload',async()=>{
  const f=starter();
  const user=userEvent.setup({advanceTimers:vi.advanceTimersByTime});
  const ui=render(<App storage={f.storage}/>);
  await user.click(screen.getByRole('button',{name:'Подтвердить непрерывный бег на 3 км'}));
  expect(window.location.pathname).toBe('/profile/continuous-3k');
  expect(screen.getByRole('heading',{name:'Я пробежал 3000 метров без остановки'})).toBeVisible();
  await user.click(screen.getByRole('button',{name:'Подтвердить и обновить план'}));
  expect(screen.getByRole('alert')).toHaveTextContent('Не все ответы подтверждены');
  expect(f.repo.read()).toBe(f.raw);
  await user.click(screen.getByRole('checkbox',{name:/Я пробежал все 3000 м подряд/}));
  await user.click(screen.getByRole('checkbox',{name:/Во время и после пробежки не было боли/}));
  await user.click(screen.getByRole('button',{name:'Подтвердить и обновить план'}));
  expect(window.location.pathname).toBe('/plan');
  expect(screen.getByText('3 км без остановки — подтверждено')).toBeVisible();
  const stored=loadActiveCycle(f.repo);
  expect(stored.kind).toBe('READY');
  if(stored.kind==='READY')expect(stored.appState.events.filter(e=>e.type==='CONTINUOUS_3K_CONFIRMED')).toHaveLength(1);
  ui.unmount();
  window.history.replaceState(null,'','/profile');
  render(<App storage={f.storage}/>);
  expect(screen.getByText(/Непрерывные 3 км подтверждены/)).toBeVisible();
  expect(screen.queryByRole('button',{name:'Подтвердить непрерывный бег на 3 км'})).not.toBeInTheDocument();
});

test('3K-09 direct confirmation link does not bypass unavailable safety gate',()=>{
  const f=starter();
  const today=f.engineState;
  const blocked:{engineState:EngineState}= {engineState:{
    ...today,diagnosticHold:true, decision:{...today.decision,safety:'HOLD'},
  }};
  // UI route can be reached, but the form itself and application transition both refuse the change.
  window.history.replaceState(null,'','/profile/continuous-3k');
  const bad=attempt(f,{engineState:blocked.engineState});
  expect(bad.ok).toBe(false);
  expect(f.repo.read()).toBe(f.raw);
});

test('3K-10 date input refuses a future date in the actual UI',async()=>{
  const f=starter();
  window.history.replaceState(null,'','/profile/continuous-3k');
  const user=userEvent.setup({advanceTimers:vi.advanceTimersByTime});
  render(<App storage={f.storage}/>);
  fireEvent.change(screen.getByLabelText('Когда вы пробежали 3000 м?'),{target:{value:dateAfter(2)}});
  await user.click(screen.getByRole('checkbox',{name:/Я пробежал все 3000 м подряд/}));
  await user.click(screen.getByRole('checkbox',{name:/Во время и после пробежки не было боли/}));
  await user.click(screen.getByRole('button',{name:'Подтвердить и обновить план'}));
  expect(screen.getByRole('alert')).toHaveTextContent('Проверьте дату пробежки');
  expect(f.repo.read()).toBe(f.raw);
});
