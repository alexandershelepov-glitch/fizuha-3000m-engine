import type {ReactNode} from 'react';
import type {QaAction} from '../../application/qaResults.ts';
import {formatDateLong} from '../../application/format.ts';

export function QaPanel({today,ready,busy,events,message,advance,run,reset}:{
  today:string;ready:boolean;busy:boolean;events:readonly string[];message:string;
  advance:(days:number)=>void;run:(action:QaAction,days:0|7)=>void;reset:()=>void;
}):ReactNode{
  return <section aria-label="Быстрый тест тренировок" data-testid="qa-panel"
    style={{border:'2px solid #333',padding:12,margin:12,borderRadius:12}}>
    <strong>ТЕСТОВЫЙ РЕЖИМ — вымышленные результаты</strong>
    <p>Виртуальная дата: {formatDateLong(today)}. Результаты не означают реальных пробежек.</p>
    <div className="actions">
      <button disabled={busy} onClick={()=>advance(1)}>+1 день</button>
      <button disabled={busy} onClick={()=>advance(7)}>+7 дней (без результатов)</button>
    </div>
    {ready?<><p>Ближайшая назначенная тренировка:</p>
      <div className="actions">
        <button disabled={busy} onClick={()=>run('SUCCESS',0)}>Успешно (тест)</button>
        <button disabled={busy} onClick={()=>run('PARTIAL',0)}>Частично (тест)</button>
        <button disabled={busy} onClick={()=>run('SKIP',0)}>Пропущено (тест)</button>
      </div><p>Быстрое прохождение семи дней:</p>
      <div className="actions">
        <button disabled={busy} onClick={()=>run('SUCCESS',7)}>Неделя: выполнено всё</button>
        <button disabled={busy} onClick={()=>run('PARTIAL',7)}>Неделя: одна неудача</button>
        <button disabled={busy} onClick={()=>run('SKIP',7)}>Неделя: один пропуск</button>
      </div></>:<p>Создайте учебный план через анкету, чтобы включить быстрые отчёты.</p>}
    {message?<p role="status">{message}</p>:null}
    {events.length>0?<details open><summary>Последние тестовые записи</summary>
      <ul>{events.slice(-12).map((event,i)=><li key={i}>{event}</li>)}</ul>
    </details>:null}
    <button disabled={busy} onClick={reset}>Сбросить тестовые данные</button>
  </section>;
}
