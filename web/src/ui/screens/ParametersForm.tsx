import {useRef, useState} from 'react';
import type {EngineState} from '../../application/engineGateway.ts';
import {formatTime, parseTime} from '../../application/format.ts';
import type {UiError} from '../../application/errorContract.ts';
import {copyForError} from '../copy/errors.ts';
import {common, lifecycle, questionnaire} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, Notice} from '../components/Layout.tsx';
import {Field, TextInput} from '../components/Field.tsx';
export function ParametersForm({engineState, submit, onCancel}: {
  engineState: EngineState; submit: (target: number, date: string) => {ok: boolean; error?: UiError}; onCancel: () => void;
}) {
  const [time, setTime] = useState(formatTime(engineState.profile.targetTimeSeconds));
  const [date, setDate] = useState(engineState.profile.raceDate);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const inFlight = useRef(false); const [busy, setBusy] = useState(false);
  const save = () => {
    if (inFlight.current) return;
    const parsed = parseTime(time);
    if (!parsed.ok) { setProblem(questionnaire.timeErrors[parsed.error]); return; }
    if (!date) { setProblem(questionnaire.dateErrors.EMPTY); return; }
    setProblem(null); inFlight.current = true; setBusy(true);
    const result = submit(parsed.seconds, date);
    if (!result.ok) { setError(result.error ?? null); inFlight.current = false; setBusy(false); }
  };
  const copy = error ? copyForError(error) : null;
  return <div className="screen">
    <h1>{lifecycle.edit}</h1>
    {copy ? <Notice tone="danger" title={copy.title}><p>{copy.text(error!.params)}</p></Notice> : null}
    <Card>
      <Field id="goal-time" label={lifecycle.goal} hint="ММ:СС" error={problem ?? undefined}><TextInput id="goal-time" value={time} onChange={setTime} /></Field>
      <Field id="race-date" label={lifecycle.date}><TextInput id="race-date" type="date" value={date} onChange={setDate} /></Field>
    </Card>
    <Button disabled={busy} onClick={save}>{lifecycle.saveParameters}</Button>
    <Button variant="ghost" onClick={onCancel}>{common.back}</Button>
  </div>;
}
