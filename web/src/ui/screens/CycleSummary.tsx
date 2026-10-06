import type {AppStateV1} from '../../application/appState.ts';
import {cycleSummary} from '../../application/cycleSummary.ts';
import type {UiError} from '../../application/errorContract.ts';
import {formatDateLong, formatTime} from '../../application/format.ts';
import {copyForError} from '../copy/errors.ts';
import {lifecycle} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';
export function CycleSummary({appState, active, error, canStartNew = true, onArchive, onNew, onHistory}: {
  appState: AppStateV1; active: boolean; canStartNew?: boolean; error: UiError | null; onArchive: () => void; onNew: () => void; onHistory: () => void;
}) {
  const s = cycleSummary(appState); const errorCopy = error ? copyForError(error) : null;
  return <div className="screen"><h1>{lifecycle.completed}</h1>
    {errorCopy ? <Notice tone="danger" title={errorCopy.title}><p>{errorCopy.text(error!.params)}</p></Notice> : null}
    <Card>
      <KeyValue label={lifecycle.initial} value={s.baseline.performance ? formatTime(s.baseline.performance.timeSeconds) : '—'} />
      <KeyValue label={lifecycle.form} value={s.result ? formatTime(s.result.timeSeconds) : '—'} />
      <KeyValue label={lifecycle.goal} value={formatTime(s.targetTimeSeconds)} />
      <KeyValue label={lifecycle.date} value={formatDateLong(s.raceDate)} />
      <KeyValue label={lifecycle.result} value={s.result ? formatTime(s.result.timeSeconds) : '—'} />
    </Card>
    {s.checkpoints.length ? <Card title={lifecycle.checkpoints}><ul>{s.checkpoints.map((c, i) => <li key={i}>{`${c.previousPerformance === null ? '—' : formatTime(c.previousPerformance)} → ${formatTime(c.result.timeSeconds)}`}</li>)}</ul></Card> : null}
    <Card><KeyValue label={lifecycle.done} value={String(s.completedWorkouts)} /><KeyValue label={lifecycle.skipped} value={String(s.skippedWorkouts)} /><KeyValue label={lifecycle.moves} value={String(s.moves)} /></Card>
    {active ? <><p>{lifecycle.archivePending}</p><Button onClick={onArchive}>{error ? lifecycle.retryArchive : lifecycle.archive}</Button><Button disabled>{lifecycle.newCycle}</Button></> : <><p>{lifecycle.archiveSaved}</p><Button disabled={!canStartNew} onClick={onNew}>{lifecycle.newCycle}</Button></>}
    <Button variant="secondary" onClick={onHistory}>{lifecycle.history}</Button>
  </div>;
}
