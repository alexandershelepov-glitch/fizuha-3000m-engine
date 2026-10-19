/** Simulate a short interval through the normal persisted application transitions. */
import {addDays,deviceTimestamp} from './format.ts';
import {makeQaResult} from './qaResults.ts';
import type {QaAction} from './qaResults.ts';
import type {AppStateV1} from './appState.ts';
import type {EngineState,Workout} from './engineGateway.ts';
import type {CycleRepository} from './storage.ts';
import {submitWorkoutResult} from './workoutResult.ts';
import {skipScheduledWorkout} from './workoutSchedule.ts';
import {refreshPlan} from './clockOps.ts';

export interface QaInput{
  repo:CycleRepository;appState:AppStateV1;engineState:EngineState;
  today:string;action:QaAction;days:0|7;
}
export interface QaOutput{
  appState:AppStateV1;engineState:EngineState;day:string;
  events:string[];message:string;completed:boolean;
}
export function simulateQa(input:QaInput):QaOutput{
  let appState=input.appState,engineState=input.engineState,day=input.today,done=0;
  const events:string[]=[];
  const output=(completed:boolean,message:string):QaOutput=>({
    appState,engineState,day,events,message,completed,
  });
  if(engineState.finalResultRecorded)return output(false,'Цикл завершён. Начните новый тест.');
  if(engineState.decision.safety!=='OK'||engineState.diagnosticHold)
    return output(false,'Ограничения сохраняются: тест не обходит защитную паузу.');
  let specialUsed=false;
  function perform(w:Workout,at:string):string|null{
    if(w.type==='REST')return 'Защитная пауза: автоматическое выполнение запрещено.';
    if(w.type==='CONTROL')return 'Контрольные 3000 м требуют отдельного ввода результата.';
    if(at>=engineState.profile.raceDate)return 'Дата итогового забега: внесите результат вручную.';
    const action:QaAction=!specialUsed?input.action:'SUCCESS';
    if(action!=='SUCCESS')specialUsed=true;
    if(action==='SKIP'){
      const result=skipScheduledWorkout({repo:input.repo,appState,engineState,
        workoutId:w.id,deviceToday:at,at:deviceTimestamp()});
      if(!result.ok)return 'Пропуск отклонён: '+result.error.code;
      appState=result.done.appState;engineState=result.done.engineState;
      events.push(w.scheduledDate+' '+w.type+': SKIP (тест)');
    }else{
      const result=submitWorkoutResult({repo:input.repo,appState,engineState,
        workoutId:w.id,deviceToday:at,result:makeQaResult(w,action==='PARTIAL')});
      if(!result.ok)return 'Отчёт отклонён: '+result.error.code;
      appState=result.done.appState;engineState=result.done.engineState;
      events.push(w.scheduledDate+' '+w.type+': '+result.done.evaluation+' (тест)');
    }
    done++;return null;
  }
  if(input.days===0){
    const w=engineState.queue[0];
    if(!w)return output(false,'Нет назначений в ближайшем окне.');
    day=w.scheduledDate>input.today?w.scheduledDate:input.today;
    const error=perform(w,day);
    return error?output(false,error):output(true,'Тестовый отчёт записан; следующий план пересчитан.');
  }
  const start=input.today;
  for(let i=0;i<7;i++){
    day=addDays(start,i);
    if(day>=engineState.profile.raceDate)
      return output(false,'Наступила дата итогового забега. Внесите результат отдельно.');
    for(let count=0;count<12;count++){
      const due=engineState.queue.find(w=>w.scheduledDate<=day);
      if(!due)break;
      const error=perform(due,day);
      if(error)return output(false,error);
    }
    const next=refreshPlan({repo:input.repo,appState,engineState,deviceToday:day});
    if(!next.ok)return output(false,'Пересчёт заблокирован: '+next.error.code);
    appState=next.appState;engineState=next.engineState;
  }
  day=addDays(start,7);
  return output(true,done?('Синтетических тренировок/пропусков: '+done):'Недельных назначений не было.');
}
