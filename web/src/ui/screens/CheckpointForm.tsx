import {useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {parseTime} from '../../application/format.ts';
import type {PerformanceSource} from '../../application/engineGateway.ts';
import {copyForError} from '../copy/errors.ts';
import {performanceSourceText} from '../copy/values.ts';
import {checkpoint as copy, common, questionnaire} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, Notice} from '../components/Layout.tsx';
import {Choice, Field, TextInput} from '../components/Field.tsx';

export interface CheckpointSubmitOutcome {
  readonly ok: boolean;
  readonly error?: {code: string; params?: {min?: number; max?: number; value?: number}};
}

interface Props {
  readonly deviceToday: string;
  /** Earliest date the engine accepts for an assessment; only used to bound the calendar. */
  readonly earliestDate: string;
  readonly submit: (performance: {timeSeconds: number; date: string; source: PerformanceSource}) => CheckpointSubmitOutcome;
  readonly onCancel: () => void;
}

export function CheckpointForm({deviceToday, earliestDate, submit, onCancel}: Props): ReactNode {
  const [time, setTime] = useState('');
  const [date, setDate] = useState(deviceToday);
  const [source, setSource] = useState<PerformanceSource>('TEST_3K');
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<CheckpointSubmitOutcome['error'] | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const handleSubmit = (): void => {
    if (inFlight.current) return;
    const parsed = parseTime(time);
    if (!parsed.ok) {
      setProblem(copyTimeProblem(parsed.error));
      return;
    }
    if (date < earliestDate || date > deviceToday) {
      setProblem('Проверьте дату результата');
      return;
    }
    setProblem(null);
    inFlight.current = true;
    setBusy(true);
    const outcome = submit({timeSeconds: parsed.seconds, date, source});
    if (!outcome.ok) {
      inFlight.current = false;
      setBusy(false);
      setError(outcome.error ?? {code: 'UNKNOWN'});
    }
    // On success the shell navigates to the outcome screen and this form unmounts.
  };

  const errorCopy = error ? copyForError({code: error.code as never, params: error.params ?? {}, retry: false, fromEngine: true}) : null;

  return (
    <div className="screen">
      <header className="appbar">
        <button type="button" className="appbar__back" onClick={onCancel} aria-label={common.back}>←</button>
        <div>
          <h1 className="appbar__title">{copy.title}</h1>
        </div>
      </header>

      <p className="lede">{copy.intro}</p>

      {errorCopy ? (
        <Notice tone="danger" title={errorCopy.title}>
          <p>{errorCopy.text(error?.params ?? {})}</p>
        </Notice>
      ) : null}

      <Card>
        <Field id="checkpoint-time" label={copy.time} hint={copy.timeHint} error={problem ?? undefined}>
          <TextInput id="checkpoint-time" value={time} onChange={setTime} inputMode="numeric" numericTime placeholder="14:30" />
        </Field>
        <Field id="checkpoint-date" label={copy.date}>
          <TextInput id="checkpoint-date" type="date" value={date} onChange={setDate} />
        </Field>
        <Field id="checkpoint-source" label={copy.source}>
          <Choice
            id="checkpoint-source"
            value={source}
            onChange={setSource}
            options={[
              {value: 'TEST_3K', label: performanceSourceText.TEST_3K},
              {value: 'OFFICIAL_3K', label: performanceSourceText.OFFICIAL_3K},
            ]}
          />
        </Field>
      </Card>

      <div className="actions">
        <Button onClick={handleSubmit} disabled={busy}>{busy ? copy.saving : copy.submit}</Button>
        <Button variant="ghost" onClick={onCancel}>{copy.cancel}</Button>
      </div>
    </div>
  );
}

function copyTimeProblem(kind: 'EMPTY' | 'FORMAT' | 'IMPOSSIBLE'): string {
  return questionnaire.timeErrors[kind];
}
