import {useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {formatDateLong} from '../../application/format.ts';
import type {Workout} from '../../application/engineGateway.ts';
import {anchorText, doseUnitText, effortCueText, mainModeText, workoutGoalText, workoutTypeText} from '../copy/values.ts';
import {common, today as todayText} from '../copy/text.ts';
import {workoutPaceRange, workoutRest, workoutRpe} from '../display.ts';
import {Button} from '../components/Button.tsx';
import {Card, EmptyState, KeyValue, Notice} from '../components/Layout.tsx';
import {copyForError} from '../copy/errors.ts';
import {move as moveText, skip as skipText} from '../copy/text.ts';

export interface SkipOutcome {
  readonly ok: boolean;
  readonly error?: {code: string; params?: {min?: number; max?: number; value?: number}};
}

interface DetailsProps {
  readonly workout: Workout | null;
  readonly today: string;
  readonly onBack: () => void;
  readonly onEnterResult: () => void;
  readonly onMove: () => void;
  /** Records the voluntary skip; the application decides and persists it. */
  readonly skip: () => SkipOutcome;
}

export function WorkoutDetails({workout, today, onBack, onEnterResult, onMove, skip}: DetailsProps): ReactNode {
  const [askSkip, setAskSkip] = useState(false);
  const [skipError, setSkipError] = useState<{code: string; params?: {min?: number; max?: number; value?: number}} | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const handleSkip = (): void => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const outcome = skip();
    if (!outcome.ok) {
      inFlight.current = false;
      setBusy(false);
      setAskSkip(false);
      setSkipError(outcome.error ?? {code: 'UNKNOWN'});
    }
  };

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
          <p className="appbar__subtitle">{formatDateLong(workout.scheduledDate)}</p>
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

      {skipError === null ? null : (
        <Notice tone="danger" title={copyForError({code: skipError.code as never, params: skipError.params ?? {}, retry: false, fromEngine: true}).title}>
          <p>{copyForError({code: skipError.code as never, params: skipError.params ?? {}, retry: false, fromEngine: true}).text(skipError.params ?? {})}</p>
        </Notice>
      )}

      <div className="actions">
        {/* Convenience only: the application layer refuses a result for a future session anyway. */}
        {workout.scheduledDate > today ? (
          <p className="hint">{todayText.workout.resultLater}</p>
        ) : (
          <Button onClick={onEnterResult}>{todayText.workout.enterResult}</Button>
        )}
        {/* The engine owns the horizon, occupancy, recovery and quality rules for a move. */}
        {workout.movable ? <Button variant="secondary" onClick={onMove}>{moveText.action}</Button> : null}
        <Button variant="ghost" onClick={() => setAskSkip(true)}>{skipText.action}</Button>
      </div>

      {askSkip ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label={skipText.confirmTitle}>
          <Notice tone="warn" title={skipText.confirmTitle}>
            <p>{skipText.confirmText}</p>
            <div className="actions">
              <Button autoFocus onClick={handleSkip} disabled={busy}>{busy ? common.loading : skipText.confirm}</Button>
              <Button variant="ghost" onClick={() => setAskSkip(false)}>{skipText.cancel}</Button>
            </div>
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
