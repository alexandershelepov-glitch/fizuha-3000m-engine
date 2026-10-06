import {useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {addDays, daysBetween, formatDateLong} from '../../application/format.ts';
import type {Workout} from '../../application/engineGateway.ts';
import {copyForError} from '../copy/errors.ts';
import {common, move as copy} from '../copy/text.ts';
import {workoutTitle, workoutVolume} from '../display.ts';
import {Button} from '../components/Button.tsx';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';
import {Field} from '../components/Field.tsx';

export interface MoveSubmitOutcome {
  readonly ok: boolean;
  readonly error?: {code: string; params?: {min?: number; max?: number; value?: number}};
}

interface Props {
  readonly workout: Workout;
  readonly engineState: {readonly asOf: string; readonly profile: {readonly raceDate: string}};
  readonly deviceToday: string;
  readonly submit: (toDate: string) => MoveSubmitOutcome;
  readonly onCancel: () => void;
}

/**
 * Candidate dates offered by the interface: the current plan window, never in the past and never the
 * race day. These are technical bounds that mirror the documented horizon — the engine still decides,
 * and its refusals are shown by code.
 */
function candidateDates(asOf: string, raceDate: string, deviceToday: string, currentDate: string): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(asOf, offset);
    if (date === currentDate) continue;
    if (date < deviceToday) continue;
    if (date >= raceDate) continue;
    dates.push(date);
  }
  return dates;
}

export function MoveWorkout({workout, engineState, deviceToday, submit, onCancel}: Props): ReactNode {
  const dates = candidateDates(engineState.asOf, engineState.profile.raceDate, deviceToday, workout.scheduledDate);
  const [selected, setSelected] = useState<string | null>(dates[0] ?? null);
  const [error, setError] = useState<MoveSubmitOutcome['error'] | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const handleSubmit = (): void => {
    if (selected === null || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const outcome = submit(selected);
    if (!outcome.ok) {
      inFlight.current = false;
      setBusy(false);
      setError(outcome.error ?? {code: 'UNKNOWN'});
    }
  };

  const errorCopy = error ? copyForError({code: error.code as never, params: error.params ?? {}, retry: false, fromEngine: true}) : null;

  return (
    <div className="screen">
      <header className="appbar">
        <button type="button" className="appbar__back" onClick={onCancel} aria-label={common.back}>←</button>
        <div>
          <h1 className="appbar__title">{copy.title}</h1>
          <p className="appbar__subtitle">{workoutTitle(workout)}</p>
        </div>
      </header>

      {errorCopy ? (
        <Notice tone="danger" title={errorCopy.title}>
          <p>{errorCopy.text(error?.params ?? {})}</p>
        </Notice>
      ) : null}

      <Card>
        <KeyValue label={copy.current} value={formatDateLong(workout.scheduledDate)} />
        <KeyValue label="Объём" value={workoutVolume(workout)} />
      </Card>

      <Card title={copy.pick}>
        {dates.length === 0 ? (
          <p className="hint">{copy.noDates}</p>
        ) : (
          <Field id="move-date" label={copy.pick}>
            <div className="choice" role="radiogroup" aria-labelledby="move-date-label">
              {dates.map((date) => (
                <button
                  key={date}
                  type="button"
                  role="radio"
                  aria-checked={date === selected}
                  className={`choice__option${date === selected ? ' choice__option--active' : ''}`}
                  onClick={() => setSelected(date)}
                >
                  <span className="choice__label">{formatDateLong(date)}</span>
                  <span className="choice__hint">{`Через ${daysBetween(deviceToday, date)} дн.`}</span>
                </button>
              ))}
            </div>
          </Field>
        )}
        <p className="hint">{copy.horizonHint}</p>
      </Card>

      <div className="actions">
        <Button onClick={handleSubmit} disabled={busy || selected === null}>{busy ? common.loading : copy.submit}</Button>
        <Button variant="ghost" onClick={onCancel}>{copy.cancel}</Button>
      </div>
    </div>
  );
}
