import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {App} from './App.tsx';
import {appCycle, memoryStorage} from '../../../tests/helpers-app.ts';
import {NOW, dateAfter} from '../../../tests/helpers.ts';
import {ACTIVE_CYCLE_KEY, loadActiveCycle} from '../application/storage.ts';
import {ARCHIVED_CYCLES_KEY, createArchiveRepository} from '../application/archiveStorage.ts';
import {archiveCompletedCycle} from '../application/archive.ts';
import {submitFinalResult} from '../application/finalResult.ts';

beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(NOW+'T12:00:00Z'));window.history.replaceState(null,'','/today');});
afterEach(()=>{cleanup();vi.useRealTimers();});
const cycle=(raceDate=dateAfter(20))=>appCycle({raceDate});
const click=(name:string)=>userEvent.click(screen.getByRole('button',{name}));
async function submitTime(){fireEvent.change(screen.getByLabelText('Время на 3000 м'),{target:{value:'14:42'}});await click('Сохранить итоговый результат');}
function terminalArchive(){const f=cycle(NOW);const final=submitFinalResult({...f,timeSeconds:882,source:'OFFICIAL_3K',deviceToday:NOW,at:NOW+'T12:00:00Z'});if(!final.ok)throw new Error('fixture');const archives=createArchiveRepository(f.storage);const done=archiveCompletedCycle({...f,appState:final.done.appState,archives,at:NOW+'T12:00:00Z'});if(!done.ok)throw new Error('fixture');return {...f,archives,id:f.appState.cycle.cycleId};}

test('profile edits goal/date, outcome shows facts, persisted values survive remount and baseline stays original',async()=>{
 const f=cycle();window.history.replaceState(null,'','/profile');const ui=render(<App storage={f.storage}/>);
 await click('Изменить цель и дату старта');fireEvent.change(screen.getByLabelText('Цель 3000 м'),{target:{value:'14:50'}});fireEvent.change(screen.getByLabelText('Дата итогового старта'),{target:{value:dateAfter(3)}});
 await click('Сохранить изменения');expect(screen.getByRole('heading',{name:'План обновлён'})).toBeVisible();expect(screen.getByText('14:30 → 14:50')).toBeVisible();
 const stored=loadActiveCycle(f.repo);expect(stored.kind).toBe('READY');if(stored.kind!=='READY')return;expect(stored.engineState.decision.phase).toBe('TAPER');expect(stored.appState.cycle.baseline.targetTimeSeconds).toBe(870);
 ui.unmount();window.history.replaceState(null,'','/profile');render(<App storage={f.storage}/>);expect(screen.getByText('3000 м за 14:50')).toBeVisible();
});
test('unchanged parameters return to profile without writing an event or storage',async()=>{
 const f=cycle();window.history.replaceState(null,'','/profile');render(<App storage={f.storage}/>);await click('Изменить цель и дату старта');const count=f.storage.writes;await click('Сохранить изменения');expect(window.location.pathname).toBe('/profile');expect(f.storage.writes).toBe(count);
});
test('pending workouts block parameter changes and previous state remains saved',async()=>{
 const f=cycle();vi.setSystemTime(new Date(dateAfter(1)+'T12:00:00Z'));window.history.replaceState(null,'','/profile');render(<App storage={f.storage}/>);
 await click('Изменить цель и дату старта');fireEvent.change(screen.getByLabelText('Цель 3000 м'),{target:{value:'14:50'}});await click('Сохранить изменения');expect(screen.getByText('Сначала закройте прошлую тренировку')).toBeVisible();expect(f.repo.read()).toBe(f.raw);
});
test('taper shows engine prescription and countdown; race and awaiting states change without reload',async()=>{
 const f=cycle(dateAfter(1));render(<App storage={f.storage}/>);expect(screen.getByText('Снижение нагрузки перед забегом')).toBeVisible();
 act(()=>{vi.setSystemTime(new Date(dateAfter(1)+'T12:00:00Z'));fireEvent.focus(window);});expect(screen.getByRole('heading',{name:'Итоговый старт — 3000 м'})).toBeVisible();expect(screen.getByRole('button',{name:'Внести итоговый результат'})).toBeEnabled();
 act(()=>{vi.setSystemTime(new Date(dateAfter(2)+'T12:00:00Z'));fireEvent.focus(window);});expect(screen.getByText('Итоговый результат ещё не внесён')).toBeVisible();expect(screen.getByRole('button',{name:'Внести итоговый результат'})).toBeEnabled();
});
for(const late of [0,2])test(`final result ${late} days late → summary, archive, reload, first run/history`,async()=>{
 const f=cycle(dateAfter(8));vi.setSystemTime(new Date(dateAfter(8+late)+'T12:00:00Z'));const ui=render(<App storage={f.storage}/>);
 await click('Внести итоговый результат');expect(screen.queryByLabelText('Дата результата')).not.toBeInTheDocument();await submitTime();expect(screen.getByRole('heading',{name:'Подготовка завершена'})).toBeVisible();expect(screen.getByText('Цикл сохранён в архиве')).toBeVisible();expect(f.repo.read()).toBeNull();
 const entries=createArchiveRepository(f.storage).list();expect(entries).toHaveLength(1);expect(JSON.parse(entries[0]!.appState.cycle.engineState).profile.performance.date).toBe(dateAfter(8));
 ui.unmount();render(<App storage={f.storage}/>);expect(screen.getByRole('heading',{name:'Подготовка завершена'})).toBeVisible();await click('Начать новую подготовку');expect(screen.getByRole('button',{name:'Начать подготовку'})).toBeVisible();expect(screen.getByRole('button',{name:'История'})).toBeVisible();expect(createArchiveRepository(f.storage).list()).toHaveLength(1);
});
test('archive failure keeps completed active, disables new cycle and retry does not require second final entry',async()=>{
 const f=cycle(NOW);let fail=true;const storage={...f.storage,setItem:(key:string,value:string)=>{if(fail&&key===ARCHIVED_CYCLES_KEY)throw new Error();f.storage.setItem(key,value);}};
 render(<App storage={storage}/>);await click('Внести итоговый результат');await submitTime();expect(screen.getByRole('heading',{name:'Подготовка завершена'})).toBeVisible();expect(screen.getByText('Архив недоступен')).toBeVisible();expect(screen.getByRole('button',{name:'Начать новую подготовку'})).toBeDisabled();
 const active=loadActiveCycle(f.repo);expect(active.kind).toBe('READY');if(active.kind==='READY')expect(active.engineState.finalResultRecorded).toBe(true);
 fail=false;await click('Повторить архивацию');expect(f.repo.read()).toBeNull();expect(createArchiveRepository(f.storage).list()).toHaveLength(1);expect(screen.getByRole('button',{name:'Начать новую подготовку'})).toBeEnabled();
});
test('clear failure retains both copies and retry is idempotent',async()=>{
 const f=cycle(NOW);let fail=true;const storage={...f.storage,removeItem:(key:string)=>{if(fail&&key===ACTIVE_CYCLE_KEY)throw new Error();f.storage.removeItem(key);}};
 render(<App storage={storage}/>);await click('Внести итоговый результат');await submitTime();expect(screen.getByText('Архивация не завершена')).toBeVisible();expect(createArchiveRepository(f.storage).list()).toHaveLength(1);
 fail=false;await click('Повторить архивацию');expect(f.repo.read()).toBeNull();expect(createArchiveRepository(f.storage).list()).toHaveLength(1);
});
test('archive list and stable summary route work without active cycle',async()=>{
 const f=terminalArchive();window.history.replaceState(null,'','/history');const ui=render(<App storage={f.storage}/>);await click('Открыть');expect(window.location.pathname).toBe('/history/'+f.id);expect(screen.getByRole('heading',{name:'Подготовка завершена'})).toBeVisible();
 ui.unmount();render(<App storage={f.storage}/>);expect(screen.getByRole('heading',{name:'Подготовка завершена'})).toBeVisible();
});
test('unsupported archive version is an explicit read-only error, never cleared',()=>{
 const raw=JSON.stringify({formatVersion:999,cycles:[]});const storage=memoryStorage({[ARCHIVED_CYCLES_KEY]:raw});window.history.replaceState(null,'','/history');render(<App storage={storage}/>);expect(screen.getByText('Несовместимая версия архива')).toBeVisible();expect(storage.getItem(ARCHIVED_CYCLES_KEY)).toBe(raw);
});
test('final form structurally validates and sends one application transition on repeated taps',async()=>{
 const f=cycle(NOW);render(<App storage={f.storage}/>);await click('Внести итоговый результат');await click('Сохранить итоговый результат');expect(screen.getByRole('alert')).toBeVisible();await submitTime();expect(createArchiveRepository(f.storage).list()[0]!.appState.events.filter(e=>e.type==='FINAL_RESULT_RECORDED')).toHaveLength(1);
});
