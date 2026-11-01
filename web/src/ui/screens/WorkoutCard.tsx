import '../../calendar.css';
import {useEffect, useRef} from 'react';
import type {ReactNode} from 'react';
import {formatDateLong, formatTime} from '../../application/format.ts';
import {isPreliminary} from '../../application/calendarModel.ts';
import type {CalendarDay} from '../../application/calendarModel.ts';
import type {Workout} from '../../application/engineGateway.ts';
import {workoutInstruction} from '../workoutInstructions.ts';
import {workoutCooldown, workoutIntervalsText, workoutMainDose, workoutPaceRange, workoutRest, workoutRpe, workoutSpeedRange, workoutTitle, workoutVolume, workoutWarmup} from '../display.ts';
import {anchorText, effortCueText, mainModeText, workoutGoalText, workoutTypeText} from '../copy/values.ts';
import {common, instruction as instructionText, plan as planText, today as todayText} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';

/**
 * Every parameter the engine prescribed, read-only. One component for the calendar preview and the
 * full card, so the two views can never disagree about a workout.
 */
export function WorkoutParams({workout}: {readonly workout: Workout}): ReactNode {
  const intervals = workoutIntervalsText(workout);
  const rest = workoutRest(workout);
  const pace = workoutPaceRange(workout);
  const speed = workoutSpeedRange(workout);
  return <div className="calendar-params" aria-label="Параметры тренировки">
    <KeyValue label={todayText.workout.task} value={workoutGoalText[workout.goal]} />
    <KeyValue label={todayText.workout.warmup} value={workoutWarmup(workout)} />
    <KeyValue label={todayText.workout.volume} value={workoutMainDose(workout)} />
    <KeyValue label={todayText.workout.mode} value={mainModeText[workout.main.mode]} />
    {intervals ? <KeyValue label={todayText.workout.intervals} value={intervals} /> : null}
    {rest ? <KeyValue label={todayText.workout.rest} value={rest.replace('отдых ', '')} /> : null}
    {pace ? <KeyValue label={todayText.workout.pace} value={pace} /> : null}
    {speed ? <KeyValue label="Дорожка" value={speed} /> : null}
    <KeyValue label={todayText.workout.rpe} value={`${workoutRpe(workout)} из 10`} />
    <KeyValue label={todayText.workout.cooldown} value={workoutCooldown(workout)} />
    {workout.effortCues.length > 0 ? <KeyValue label={todayText.workout.cues} value={workout.effortCues.map(cue => effortCueText[cue]).join(' · ')} /> : null}
    {workout.protocol ? <><ol aria-label="Порядок выполнения">{workoutInstruction(workout).steps.map((step,i)=><li key={i}>{step}</li>)}</ol>
      {workoutInstruction(workout).notes.map((note,i)=><p className="hint" key={i}>{note}</p>)}</> : null}
  </div>;
}

function statusLabel(day: CalendarDay): string {
  switch (day.status) {
    case 'completed': return 'Выполнено';
    case 'skipped': return 'Пропущено';
    case 'moved': return 'Перенесено';
    case 'planned': return 'Назначено';
    case 'forecast': return 'Предварительно';
    case 'control': return 'Контрольная точка';
    case 'race': return 'День норматива';
    case 'unresolved': return 'Требует уточнения';
    default: return '';
  }
}

export interface WorkoutCardProps {
  readonly day: CalendarDay;
  readonly today: string;
  /** Opens the issued workout with its actions (result, move, skip). Null when it is not issued. */
  readonly onOpenIssued: (() => void) | null;
  readonly onOpenHistory: (() => void) | null;
  readonly onFinalResult: (() => void) | null;
  readonly onBack: () => void;
}

/**
 * A full-screen card for one calendar entry: what the session is for, how to execute it, and what
 * the engine prescribed. Preliminary forecast days are readable here but carry no actions — looking
 * at the plan never changes engine state, records a result or unlocks a future day.
 */
export function WorkoutCard({day, today, onOpenIssued, onOpenHistory, onFinalResult, onBack}: WorkoutCardProps): ReactNode {
  const back = useRef<HTMLButtonElement>(null);
  const workout = day.workout;
  useEffect(() => { back.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  if (workout === null) {
    return <div className="workout-card" role="dialog" aria-modal="true" aria-label="Карточка занятия">
      <div className="workout-card__bar"><button ref={back} type="button" className="workout-card__back" onClick={onBack} aria-label="Вернуться к календарю">← К календарю</button></div>
      <div className="workout-card__body"><Notice tone="info" title="Занятия нет">На эту дату тренировка не назначена. Вернитесь к календарю, чтобы выбрать другой день.</Notice></div>
    </div>;
  }

  const preliminary = isPreliminary(day);
  const guide = workoutInstruction(workout);
  const isRace = day.status === 'race';
  const completed = day.status === 'completed';
  const skipped = day.status === 'skipped';

  return (
    <div className="workout-card" role="dialog" aria-modal="true" aria-labelledby="workout-card-title">
      <div className="workout-card__bar">
        <button ref={back} type="button" className="workout-card__back" onClick={onBack} aria-label="Вернуться к календарю">← К календарю</button>
        <span className="workout-card__status">{statusLabel(day)}</span>
      </div>
      <div className="workout-card__body">
        <header className="workout-card__head">
          <p className="calendar-eyebrow">{formatDateLong(day.date)}</p>
          <h1 id="workout-card-title">{isRace ? 'Итоговый забег 3000 м' : workoutTitle(workout)}</h1>
          <p className="workout-card__type">{workoutTypeText[workout.type].label} · {workoutGoalText[workout.goal]}</p>
        </header>

        {preliminary ? <Notice tone="info" title={planText.preliminaryTitle}>
          <p>{planText.preliminaryText}</p>
          <p className="hint">{planText.forecastResultUnavailable}</p>
        </Notice> : null}
        {isRace && !preliminary && day.date > today ? <Notice tone="info" title={planText.controlTitle}>
          <p>Итоговый забег ещё впереди. Результат вносится в день норматива, не раньше.</p>
        </Notice> : null}

        <Card title={instructionText.cardTitle}>
          <p className="instruction__headline">{guide.headline}</p>
          <ol className="steps">
            {guide.steps.map((step) => <li key={step} className="steps__item">{step}</li>)}
          </ol>
          {guide.notes.length > 0 ? <div className="instruction__notes" aria-label="Пояснения к тренировке">
            {guide.notes.map((note) => <p className="hint" key={note}>{note}</p>)}
          </div> : null}
          {guide.splits.length > 1 ? <div className="instruction__splits">
            <p className="instruction__label">{instructionText.splitsTitle}</p>
            <ul className="list">
              {guide.splits.map((split) => <li key={split.distanceMeters} className="list__item">{split.text}</li>)}
            </ul>
          </div> : null}
          {guide.guidance.length > 0 ? <div className="instruction__guidance">
            <p className="instruction__label">{instructionText.easyFeel}</p>
            <ul className="list">
              {guide.guidance.map((line) => <li key={line} className="list__item">{line}</li>)}
            </ul>
          </div> : null}
          <p className="instruction__effort">{instructionText.feeling} <strong>{guide.effort}</strong></p>
          {guide.note === null ? null : <p className="hint">{guide.note}</p>}
        </Card>

        <Card title="Параметры и объём">
          <KeyValue label={todayText.workout.volume} value={workoutVolume(workout)} />
          <WorkoutParams workout={workout} />
        </Card>

        <Card title="Зачем эта тренировка">
          <p className="paragraph">{workoutTypeText[workout.type].description}</p>
          <p className="hint">{anchorText[workout.anchor]}</p>
        </Card>

        {completed && day.result !== null ? <Card title="Записанный результат">
          <KeyValue label="Дистанция" value={day.result.result.distanceMeters > 0 ? `${Math.round(day.result.result.distanceMeters)} м` : 'не указана'} />
          <KeyValue label="Длительность" value={`${Math.round(day.result.result.durationMinutes)} мин`} />
          <KeyValue label="Усилие" value={`${day.result.result.sessionRpe} из 10`} />
          {day.result.result.repeats.length > 0 ? <KeyValue label="Отрезки" value={day.result.result.repeats.map(part => `${Math.round(part.distanceMeters)} м — ${formatTime(part.seconds)}`).join(' · ')} /> : null}
          <p className="hint">Результат сохранён в истории. Карточка только показывает его.</p>
        </Card> : null}
        {skipped ? <Notice tone="warn" title="Тренировка пропущена">
          <p>Занятие отмечено как пропущенное. Нагрузка не переносится и не заменяется другим заданием.</p>
        </Notice> : null}

        <div className="actions">
          <Button onClick={onBack}>{common.back}</Button>
          {onOpenIssued !== null ? <Button variant="secondary" onClick={onOpenIssued}>Открыть занятие</Button> : null}
          {completed && onOpenHistory !== null ? <Button variant="secondary" onClick={onOpenHistory}>История</Button> : null}
          {isRace && !preliminary && day.date <= today && onFinalResult !== null ? <Button onClick={onFinalResult}>Внести итоговый результат</Button> : null}
        </div>
        {preliminary ? <p className="hint">{planText.preliminary}</p> : null}
      </div>
    </div>
  );
}
