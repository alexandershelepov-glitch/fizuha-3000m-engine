import {useState} from 'react';
import type {ReactNode} from 'react';
import type {SafetyData} from '../../application/engineGateway.ts';
import {healthySafety} from '../../application/questionnaire.ts';
import {SafetyFields} from '../components/SafetyFields.tsx';
import {Button} from '../components/Button.tsx';
import {Checkbox} from '../components/Field.tsx';
import {Card, Notice} from '../components/Layout.tsx';
import {copyForError} from '../copy/errors.ts';
import {questionnaire, common} from '../copy/text.ts';
import type {UiError} from '../../application/errorContract.ts';

export function SafetyRecheck({initial, submit, onCancel}: {
  initial: SafetyData;
  submit: (safety: SafetyData, confirmed: boolean) => {ok: true; stillHold: boolean} | {ok: false; error: UiError};
  onCancel: () => void;
}): ReactNode {
  const [safety, setSafety] = useState<SafetyData>({...initial});
  const [showDetails, setShowDetails] = useState(true);
  const [review, setReview] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = (): void => {
    if (busy) return;
    setBusy(true);
    const outcome = submit(safety, review);
    if (outcome.ok) {
      setStatus(outcome.stillHold ? questionnaire.recovery.resultStillHold : questionnaire.recovery.resultReady);
      setError(null);
    } else {setError(outcome.error);}
    setBusy(false);
  };
  return (
    <div className="screen">
      <header className="appbar"><h1 className="appbar__title">{questionnaire.recovery.title}</h1></header>
      <p className="lede">{questionnaire.recovery.intro}</p>
      <Notice tone="warn">{questionnaire.recovery.notice}</Notice>
      {status ? <Notice tone="info">{status}</Notice> : null}
      <Card>
        <Button variant="secondary" onClick={() => {setSafety(healthySafety()); setShowDetails(false);}}>{questionnaire.safetyQuick.action.replace(' — продолжить', '')}</Button>
        <Button variant="ghost" onClick={() => setShowDetails(true)}>{questionnaire.safetyQuick.details}</Button>
        {showDetails ? <SafetyFields idPrefix="safety-review" safety={safety} onChange={setSafety} /> : null}
      </Card>
      <Card>
        <Checkbox id="medical-confirmed" checked={review} onChange={setReview} label={questionnaire.recovery.clearance} />
        {!review ? <p className="hint">{questionnaire.recovery.required}</p> : null}
      </Card>
      {error ? <Notice tone="danger" title={copyForError(error).title}>{copyForError(error).text(error.params)}</Notice> : null}
      <div className="actions">
        <Button onClick={save} disabled={!review || busy}>{questionnaire.recovery.submit}</Button>
        <Button variant="ghost" onClick={onCancel}>{status ? common.understood : common.cancel}</Button>
      </div>
    </div>
  );
}
