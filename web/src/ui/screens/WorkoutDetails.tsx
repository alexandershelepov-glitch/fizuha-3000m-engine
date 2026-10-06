import type {ReactNode} from 'react';
import type {Workout} from '../../application/engineGateway.ts';
import {anchorText, doseUnitText, effortCueText, mainModeText, workoutGoalText, workoutTypeText} from '../copy/values.ts';
import {common, today as todayText} from '../copy/text.ts';
import {workoutPaceRange, workoutRest, workoutRpe} from '../display.ts';
import {Button} from '../components/Button.tsx';
import {Card, EmptyState, KeyValue} from '../components/Layout.tsx';

export function WorkoutDetails({workout, today, onBack, onEnterResult}: {workout: Workout | null; today: string; onBack: () => void; onEnterResult: () => void}): ReactNode {
  if (workout === null) {
    return (
      <div className="screen">
        <EmptyState title="Тренировка не найдена" text="Возможно, план уже обновлён.">
          <Button onClick={onBack}>{common.back}</Button>
        </EmptyState>
      </div>
    );
  }

  const pace = workoutPaceRange(workout);
  const rest = workoutRest(workout);

  return (
    <div className="screen">
      <header className="appbar">
        <button type="button" className="appbar__back" onClick={onBack} aria-label={common.back}>←</button>
        <div>
          <h1 className="appbar__title">{workoutTypeText[workout.type].label}</h1>
          <p className="appbar__subtitle">{workout.scheduledDate}</p>
        </div>
      </header>

      <Card>
        <p className="paragraph">{workoutTypeText[workout.type].description}</p>
      </Card>

      <Card>
        <KeyValue label={todayText.workout.task} value={workoutGoalText[workout.goal]} />
        <KeyValue label={todayText.workout.volume} value={`${workout.main.dose.value} ${doseUnitText[workout.main.dose.unit]}`} />
        <KeyValue label={todayText.workout.mode} value={mainModeText[workout.main.mode]} />
        {workout.main.repeats > 1 ? <KeyValue label={todayText.workout.intervals} value={`${workout.main.repeats}${workout.main.repeatMeters === null ? '' : ` × ${Math.round(workout.main.repeatMeters)} м`}`} /> : null}
        {rest ? <KeyValue label={todayText.workout.rest} value={rest.replace('отдых ', '')} /> : null}
        {pace ? <KeyValue label={todayText.workout.pace} value={pace} /> : null}
        <KeyValue label={todayText.workout.rpe} value={workoutRpe(workout).replace('План: ', '')} />
        {workout.warmupMinutes > 0 ? <KeyValue label={todayText.workout.warmup} value={`${workout.warmupMinutes} мин`} /> : null}
        {workout.cooldownMinutes > 0 ? <KeyValue label={todayText.workout.cooldown} value={`${workout.cooldownMinutes} мин`} /> : null}
      </Card>

      {workout.effortCues.length > 0 ? (
        <Card title={todayText.workout.cues}>
          <ul className="list">
            {workout.effortCues.map((cue) => (
              <li key={cue} className="list__item">{effortCueText[cue]}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title={todayText.workout.anchor}>
        <p className="paragraph">{anchorText[workout.anchor]}</p>
      </Card>

      <div className="actions">
        {/* Convenience only: the application layer refuses a result for a future session anyway. */}
        {workout.scheduledDate > today ? (
          <p className="hint">{todayText.workout.resultLater}</p>
        ) : (
          <Button onClick={onEnterResult}>{todayText.workout.enterResult}</Button>
        )}
      </div>
    </div>
  );
}
