import type {ArchivedCycle} from '../../application/archiveStorage.ts';
import type {UiError} from '../../application/errorContract.ts';
import {cycleSummary} from '../../application/cycleSummary.ts';
import {formatDateLong, formatTime} from '../../application/format.ts';
import {copyForError} from '../copy/errors.ts';
import {history, lifecycle} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';
export function ArchiveList({cycles, error, onOpen, onRetry}: {cycles: readonly ArchivedCycle[]; error: UiError | null; onOpen: (id: string) => void; onRetry: () => void}) {
  if (error) { const copy = copyForError(error); return <Notice tone="danger" title={copy.title}><p>{copy.text(error.params)}</p><Button onClick={onRetry}>{copy.cta}</Button></Notice>; }
  if (!cycles.length) return <p>{history.emptyArchive}</p>;
  return <div>{cycles.map(entry => {
    const s = cycleSummary(entry.appState);
    return <Card key={entry.cycleId}>
      <KeyValue label={lifecycle.startDate} value={formatDateLong(entry.appState.cycle.createdAt.slice(0, 10))} />
      <KeyValue label={lifecycle.date} value={formatDateLong(s.raceDate)} /><KeyValue label={lifecycle.goal} value={formatTime(s.targetTimeSeconds)} />
      <KeyValue label={lifecycle.result} value={s.result ? formatTime(s.result.timeSeconds) : '—'} />
      <Button onClick={() => onOpen(entry.cycleId)}>{lifecycle.open}</Button>
    </Card>;
  })}</div>;
}
