import type {ReactNode} from 'react';
import {formatDateLong, formatTime} from '../../application/format.ts';
import type {AppStateV1} from '../../application/appState.ts';
import type {EngineState} from '../../application/engineGateway.ts';
import {phaseText} from '../copy/values.ts';
import {profile as profileText} from '../copy/text.ts';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';

export function Profile({appState, engineState}: {appState: AppStateV1; engineState: EngineState}): ReactNode {
  const {profile, decision} = engineState;
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

      <Card title={profileText.about}>
        <p className="paragraph">{profileText.aboutText}</p>
      </Card>
    </div>
  );
}
