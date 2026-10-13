import {useState} from 'react';
import type {ReactNode} from 'react';
import {formatDateLong, formatTime} from '../../application/format.ts';
import type {AppStateV1} from '../../application/appState.ts';
import type {EngineState} from '../../application/engineGateway.ts';
import {phaseText} from '../copy/values.ts';
import {Button} from '../components/Button.tsx';
import {lifecycle, profile as profileText} from '../copy/text.ts';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';
import {copyForError} from '../copy/errors.ts';
import type {UiError} from '../../application/errorContract.ts';

type ResetOutcome = {ok: true} | {ok: false; error: UiError};

export function Profile({appState, engineState, onEdit, onRecheck, onConfirm3k, onReset}: {
  appState: AppStateV1;
  engineState: EngineState;
  onEdit?: () => void;
  onRecheck?: () => void;
  onConfirm3k?: () => void;
  onReset?: () => ResetOutcome;
}): ReactNode {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetError, setResetError] = useState<UiError | null>(null);
  const [busy, setBusy] = useState(false);
  const {profile, decision} = engineState;

  const reset = (): void => {
    if (busy || !onReset) return;
    setBusy(true);
    const outcome = onReset();
    if (!outcome.ok) {
      setResetError(outcome.error);
      setConfirmReset(false);
      setBusy(false);
    }
  };
  const baseline = appState.cycle.baseline;

  return (
    <div className="screen">
      <header className="appbar">
        <div>
          <h1 className="appbar__title">{profileText.title}</h1>
        </div>
      </header>

      <Card>
        <KeyValue label={profileText.goal} value={`3000 м за ${formatTime(profile.targetTimeSeconds)}`} />
        <KeyValue label={profileText.raceDate} value={formatDateLong(profile.raceDate)} />
      </Card>

      {!engineState.finalResultRecorded && onEdit ? <Button onClick={onEdit}>{lifecycle.edit}</Button> : null}
      {!engineState.finalResultRecorded && !profile.canRun3Km && onConfirm3k ? (
        <Button variant="secondary" onClick={onConfirm3k}>Подтвердить непрерывный бег на 3 км</Button>
      ) : null}
      {profile.canRun3Km && !profile.performance ? (
        <Notice tone="info">Непрерывные 3 км подтверждены. Результат на время пока не измерен, поэтому скоростные тренировки не назначаются.</Notice>
      ) : null}
      {!engineState.finalResultRecorded && onRecheck ? <Button variant="secondary" onClick={onRecheck}>{lifecycle.recheckSafety}</Button> : null}

      <Card title={profileText.cycle}>
        <KeyValue label={profileText.cycleStart} value={formatDateLong(appState.cycle.createdAt.slice(0, 10))} />
        <KeyValue label={profileText.currentForm} value={profile.performance === null ? '—' : formatTime(profile.performance.timeSeconds)} />
        <KeyValue label={profileText.availability} value={String(profile.availableRunsPerWeek)} />
        <KeyValue label={profileText.phase} value={phaseText[decision.phase].label} />
        <Notice tone="info">{profileText.phaseNote}</Notice>
      </Card>

      <Card title={profileText.initialData}>
        <KeyValue label="Результат на старте цикла" value={baseline.performance === null ? '—' : formatTime(baseline.performance.timeSeconds)} />
        <KeyValue label="Цель на старте цикла" value={formatTime(baseline.targetTimeSeconds)} />
        <KeyValue label="Дата старта на начало цикла" value={formatDateLong(baseline.raceDate)} />
      </Card>

      {!engineState.finalResultRecorded && onReset ? (
        <Card title={profileText.reset.title}>
          <p className="paragraph">{profileText.reset.hint}</p>
          {resetError ? (
            <Notice tone="danger" title={copyForError(resetError).title}>
              <p>{copyForError(resetError).text(resetError.params)}</p>
            </Notice>
          ) : null}
          {!confirmReset ? (
            <Button variant="secondary" onClick={() => {setResetError(null); setConfirmReset(true);}}>{profileText.reset.action}</Button>
          ) : (
            <Notice tone="warn" title={profileText.reset.confirmTitle}>
              <p>{profileText.reset.confirmText}</p>
              <div className="actions">
                <Button onClick={reset} disabled={busy}>{profileText.reset.confirmAction}</Button>
                <Button variant="ghost" onClick={() => setConfirmReset(false)} disabled={busy}>{profileText.reset.cancel}</Button>
              </div>
            </Notice>
          )}
        </Card>
      ) : null}

      <Card title={profileText.about}>
        <p className="paragraph">{profileText.aboutText}</p>
      </Card>
    </div>
  );
}
