import {useState} from 'react';
import type {ReactNode} from 'react';
import {formatDateLong} from '../../application/format.ts';
import type {AppStateV1} from '../../application/appState.ts';
import {history} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, EmptyState} from '../components/Layout.tsx';
import type {Route} from '../../app/routes.ts';

export function History({appState, onNavigate}: {appState: AppStateV1; onNavigate: (route: Route) => void}): ReactNode {
  const [tab, setTab] = useState<'CURRENT' | 'ARCHIVE'>('CURRENT');

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
          <Card>
            <p className="hint">{`Цикл создан: ${formatDateLong(appState.cycle.createdAt.slice(0, 10))}`}</p>
          </Card>
          <EmptyState title={history.emptyCurrent} text={history.emptyCurrentHint}>
            <Button onClick={() => onNavigate({name: 'PLAN'})}>{history.toPlan}</Button>
          </EmptyState>
        </>
      ) : (
        <EmptyState title={history.emptyArchive} text={history.emptyArchiveHint}>
          <Button variant="secondary" onClick={() => setTab('CURRENT')}>{history.tabCurrent}</Button>
        </EmptyState>
      )}
    </div>
  );
}
