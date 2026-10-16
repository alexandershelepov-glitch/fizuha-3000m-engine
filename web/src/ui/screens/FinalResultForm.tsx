import {useRef, useState} from 'react';
import {PERFORMANCE_SOURCES} from '../../application/engineGateway.ts';
import type {PerformanceSource} from '../../application/engineGateway.ts';
import type {UiError} from '../../application/errorContract.ts';
import {formatDateLong, parseTime} from '../../application/format.ts';
import {copyForError} from '../copy/errors.ts';
import {performanceSourceText} from '../copy/values.ts';
import {common, lifecycle, questionnaire} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';
import {Choice, Field, TextInput} from '../components/Field.tsx';
export function FinalResultForm({raceDate, submit, onCancel}: {
  raceDate: string; submit: (time: number, source: PerformanceSource) => {ok: boolean; error?: UiError}; onCancel: () => void;
}) {
  const [time, setTime] = useState(''); const [source, setSource] = useState<PerformanceSource>('OFFICIAL_3K');
  const [problem, setProblem] = useState<string | null>(null); const [error, setError] = useState<UiError | null>(null);
  const [busy, setBusy] = useState(false); const inFlight = useRef(false);
  const save = () => {
    if (inFlight.current) return;
    const parsed = parseTime(time); if (!parsed.ok) { setProblem(questionnaire.timeErrors[parsed.error]); return; }
    setProblem(null); inFlight.current = true; setBusy(true);
    const result = submit(parsed.seconds, source);
    if (!result.ok) { setError(result.error ?? null); inFlight.current = false; setBusy(false); }
  };
  const copy = error ? copyForError(error) : null;
  return <div className="screen"><h1>{lifecycle.finalTitle}</h1>
    {copy ? <Notice tone="danger" title={copy.title}><p>{copy.text(error!.params)}</p></Notice> : null}
    <Card><KeyValue label={lifecycle.fixedDate} value={formatDateLong(raceDate)} />
      <Field id="final-time" label={lifecycle.finalTime} hint="ММ:СС" error={problem ?? undefined}><TextInput id="final-time" value={time} onChange={setTime} inputMode="numeric" numericTime /></Field>
      <Field id="final-source" label="Откуда результат"><Choice id="final-source" value={source} onChange={setSource} options={PERFORMANCE_SOURCES.map(value => ({value, label: performanceSourceText[value]}))} /></Field>
    </Card><Button onClick={save} disabled={busy}>{lifecycle.finalSubmit}</Button><Button variant="ghost" onClick={onCancel}>{common.back}</Button>
  </div>;
}
