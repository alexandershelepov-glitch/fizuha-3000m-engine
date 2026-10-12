import {useState} from 'react';
import type {ReactNode} from 'react';
import {formatDateLong, formatDateShort, formatTime} from '../../application/format.ts';
import type {AppStateV1, CycleEvent} from '../../application/appState.ts';
import type {EngineState} from '../../application/engineGateway.ts';
import {evaluationSign, evaluationText} from '../copy/values.ts';
import {history, historyItems} from '../copy/text.ts';
import {workoutTitle} from '../display.ts';
import {Button} from '../components/Button.tsx';
import {Card, EmptyState, Sign} from '../components/Layout.tsx';
import type {Route} from '../../app/routes.ts';

interface Props {
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  readonly archiveContent?: ReactNode;
  readonly onNavigate: (route: Route) => void;
}

export function History({appState, engineState, onNavigate, archiveContent}: Props): ReactNode {
  const [tab, setTab] = useState<'CURRENT' | 'ARCHIVE'>('CURRENT');
  // Newest first, both for the closed sessions the engine keeps and for the application events.
  const sessions = [...engineState.history].reverse();
  const events = [...appState.events].reverse();

  return (
    <div className="screen">
      <header className="appbar">
        <div>
          <h1 className="appbar__title">{history.title}</h1>
        </div>
      </header>

      <div className="toggle">
        <button type="button" className={`toggle__option${tab === 'CURRENT' ? ' toggle__option--active' : ''}`} aria-pressed={tab === 'CURRENT'} onClick={() => setTab('CURRENT')}>
          {history.tabCurrent}
        </button>
        <button type="button" className={`toggle__option${tab === 'ARCHIVE' ? ' toggle__option--active' : ''}`} aria-pressed={tab === 'ARCHIVE'} onClick={() => setTab('ARCHIVE')}>
          {history.tabArchive}
        </button>
      </div>

      {tab === 'CURRENT' ? (
        <>
          {sessions.length === 0 ? (
            <EmptyState title={history.emptyCurrent} text={history.emptyCurrentHint}>
              <Button onClick={() => onNavigate({name: 'PLAN'})}>{history.toPlan}</Button>
            </EmptyState>
          ) : (
            <Card title="Тренировки">
              <ul className="list">
                {sessions.map((entry) => (
                  <li key={entry.workout.id} className="list__item">
                    <Sign sign={evaluationSign[entry.classified.evaluation]} label={evaluationText[entry.classified.evaluation].label} />
                    <span className="hint">{`${workoutTitle(entry.workout)} · ${formatDateShort(entry.workout.scheduledDate)}`}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* The engine keeps the sessions; everything else the user did is in the application log. */}
          <Card title="События цикла">
            <ul className="list">
              {events.map((event, index) => (
                <li key={`${event.type}-${index}`} className="list__item">
                  <span>{describeEvent(event)}</span>
                  <span className="hint">{` · ${formatDateLong(event.at.slice(0, 10))}`}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : (
        archiveContent ?? <EmptyState title={history.emptyArchive} text={history.emptyArchiveHint}>
          <Button variant="secondary" onClick={() => setTab('CURRENT')}>{history.tabCurrent}</Button>
        </EmptyState>
      )}
    </div>
  );
}

/** One factual line per logged action. Nothing is derived and no reason is invented here. */
function describeEvent(event: CycleEvent): string {
  switch (event.type) {
    case 'CYCLE_CREATED':
      return historyItems.CYCLE_CREATED;
    case 'WORKOUT_SKIPPED':
      return `${event.cause === 'PAST_DUE' ? historyItems.WORKOUT_SKIPPED_PAST_DUE : historyItems.WORKOUT_SKIPPED_VOLUNTARY} · ${formatDateShort(event.scheduledDate)}`;
    case 'WORKOUT_MOVED':
      return `${historyItems.WORKOUT_MOVED} · ${historyItems.moved(formatDateShort(event.fromDate), formatDateShort(event.toDate))}`;
    case 'CHECKPOINT_RECORDED':
      return `${historyItems.CHECKPOINT_RECORDED} · ${historyItems.performance(event.previousPerformance === null ? null : formatTime(event.previousPerformance), formatTime(event.result.timeSeconds))}`;
    case 'TRAINING_PARAMETERS_CHANGED':
      return historyItems.TRAINING_PARAMETERS_CHANGED;
    case 'SAFETY_REASSESSED':
      return historyItems.SAFETY_REASSESSED;
    case 'FINAL_RESULT_RECORDED':
      return `${historyItems.FINAL_RESULT_RECORDED} · ${formatTime(event.result.timeSeconds)}`;
  }
}
