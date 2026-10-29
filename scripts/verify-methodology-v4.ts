import {assertV4Assignments} from '../tests/methodology-v4-oracle.ts';
/** Reproducible public-API trace. All feedback here is an explicit simulation. */
import {mkdirSync, writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {forecastCycle, serialize} from '../src/index.ts';
import {executeV4, v4Profile} from '../tests/methodology-v4-fixture.ts';
import {workoutInstruction, workoutIntervals} from '../web/src/ui/workoutInstructions.ts';
import type {Workout} from '../src/index.ts';
const output = 'qa/methodology-v4';
mkdirSync(output,{recursive:true});
const {seed,state,workouts} = executeV4();
assertV4Assignments(workouts);assert.equal(state.history.length,23);
assert.equal(workouts.filter(w=>w.type==='CONTROL').length,1);
assert.deepEqual(state.profile.performance,v4Profile().performance);
assert.ok(state.history.every(h=>h.classified.evaluation==='GREEN'));
const before=serialize(seed);
const forecasts = (['CONDITIONAL','RESERVATION'] as const).map(mode=>forecastCycle(seed,{mode}));
for(const f of forecasts) {
  assertV4Assignments(f.entries.map(e=>e.workout));assert.deepEqual(f.engineErrors,[]);assert.deepEqual(f.windowViolations,[]);
  f.entries.forEach((e,i)=>{
    assert.deepEqual(e.workout.main,workouts[i]!.main);assert.deepEqual(e.workout.protocol,workouts[i]!.protocol);
    assert.deepEqual(e.workout.paceRangeSecondsPerKm,workouts[i]!.paceRangeSecondsPerKm);
  });
}
assert.equal(serialize(seed),before);
const time=(s:number)=>`${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`;
function row(w:Workout,i:number) {
  const p=w.protocol!,guide=workoutInstruction(w);
  const recovery = p.recovery ? `${p.recovery.dose.value} ${p.recovery.dose.unit==='METERS'?'м':'с'}; ${p.recovery.mode==='JOG'?'трусца':'трусца или шагом до восстановления'}; только между` : '—';
  const pace = p.repeatSeconds ? `${p.repeatSeconds} с за ${w.main.repeatMeters} м` : w.paceRangeSecondsPerKm
    ? w.paceRangeSecondsPerKm[0]===w.paceRangeSecondsPerKm[1] ? `${time(w.paceRangeSecondsPerKm[0])}/км` : w.paceRangeSecondsPerKm.map(time).join('–')+'/км' : 'по фактическому результату; целевой темп не навязывается';
  const strides = p.strides ? p.strides.insideDistance ? `${p.strides.repeats}×${p.strides.seconds} с внутри дистанции; ≥${p.strides.minimumRecoverySeconds} с E между`
    : `${p.strides.repeats}×${p.strides.meters} м перед контролем; полный отдых` : '—';
  return {number:i+1,week:p.week,date:w.scheduledDate,type:w.type,intensity:p.intensity,
    work:workoutIntervals(w)?.label ?? `${w.main.dose.value} м`,pace,warmup:p.warmupMeters?`${p.warmupMeters} м E`:'внутри дистанции E',
    dynamics:p.dynamicMinutes?`${p.dynamicMinutes.join('–')} мин`:'—',recovery,cooldown:p.cooldownMeters?`${p.cooldownMeters} м E`:'внутри дистанции E',
    strides,stage:p.stage,status:'PASS',instruction:guide.steps.join(' '),workout:w};
}
const rows=workouts.map(row);
writeFileSync(`${output}/assignments.json`,JSON.stringify({profile:v4Profile(),simulation:true,notObservedPerformance:true,
  evidence:'23 ordinary public recordResult transitions with serialize/deserialize + dedicated final event; independent full oracle in tests/methodology-v4-oracle.ts',
  rows,historyCount:state.history.length,performanceAfterSimulation:state.profile.performance,
  forecasts:forecasts.map(f=>({mode:f.mode,count:f.entries.length,errors:f.engineErrors,windowViolations:f.windowViolations,seedUnchanged:f.seedUnchanged}))},null,2)+'\n');
const keys=['number','week','date','type','intensity','work','pace','warmup','dynamics','recovery','cooldown','strides','stage','status','instruction'] as const;
const csv=keys.join(',')+'\n'+rows.map(r=>keys.map(k=>'"'+String(r[k]).replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
writeFileSync(`${output}/comparison-24.csv`,csv);
const lines=rows.map(r=>`| ${r.number} | ${r.week} | ${r.date} | ${r.intensity}: ${r.work} | ${r.pace} | ${r.warmup}; ${r.dynamics} | ${r.recovery} | ${r.cooldown} | ${r.strides} | ✓ |`);
writeFileSync(`${output}/comparison-24.md`,`# Проверка восьминедельной методики №4\n\n24/24 — соответствуют независимому эталону теста. Это генерация и моделирование отчётов, не фактические тренировки.\n\nПрофиль: 14:30; 3 привычных и доступных занятия; 20 недель регулярного бега; 16 км/нед; длительная 6 км; Q0. Старт 02.11.2026, контроль 26.12.2026, техническая цель 14:00. Цель не определяет темпы.\n\nИсточники: [сводная Notion](https://app.notion.com/p/4048cc66585181b4b5bbe1c53c87047d), [редакция №4](https://app.notion.com/p/4048cc66585181f0b7adc99649136677). Свежая сводная определяет 4×15 с внутри E, точные паузы и финальный протокол.\n\n| № | Неделя | Дата | Работа | Темп | Разминка; динамика | Восстановление | Заминка | Ускорения | Сверка |\n|---|---|---|---|---|---|---|---|---|---|\n${lines.join('\n')}\n\nРазгрузка: неделя 4. Пик: неделя 6. Подводка: недели 7–8. Один контроль — итоговый. T остаётся заданием по времени; расчётные метры T и недельные суммы не превращаются в обязательную дистанцию. 150-метровое R — не максимальный спринт.\n\nФинальное событие входит в 24 позиции, но остаётся вне обычной очереди: итог фиксируется прежней публичной операцией recordFinalResult. После 23 смоделированных тренировок текущий замер остаётся 14:30 от 02.11.2026, новых замеров и фактов не создано во входном состоянии. Оба прогноза дают те же назначения; 0 ошибок, 0 нарушений проверенных окон.\n\nВоспроизведение: npm test; node --experimental-strip-types scripts/verify-methodology-v4.ts. Полная независимая сверка всех полей — tests/methodology-v4.test.ts; браузерная проверка 24 карточек и сохранения отчёта — e2e/methodology-v4.spec.ts.\n`);
console.log(JSON.stringify({assignments:rows.length,matched:24,historySimulated:state.history.length,unchangedMeasurement:state.profile.performance,forecasts:forecasts.map(f=>({mode:f.mode,entries:f.entries.length,errors:f.engineErrors.length,violations:f.windowViolations.length}))}));
