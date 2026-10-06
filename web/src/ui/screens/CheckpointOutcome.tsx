import type {ReactNode} from 'react';
import {formatTime} from '../../application/format.ts';
import type {AppStateV1} from '../../application/appState.ts';
import type {EngineState} from '../../application/engineGateway.ts';
import type {PlanChange} from '../../application/planDiff.ts';
import {feasibilityText, gateText, phaseText} from '../copy/values.ts';
import {checkpoint as copy, outcome as outcomeCopy} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, EmptyState, KeyValue} from '../components/Layout.tsx';

interface Props {
  readonly appState: AppStateV1;
  readonly engineState: EngineState;
  /** Observable changes of this assessment, available in the session that recorded it. */
  readonly changes: readonly PlanChange[] | null;
  readonly onContinue: () => void;
  readonly onOpenPlan: () => void;
}

/** The last checkpoint the application logged, used to show what the previous form was. */
function lastCheckpoint(appState: AppStateV1) {
  return [...appState.events].reverse().find((event) => event.type === 'CHECKPOINT_RECORDED') ?? null;
}

export function CheckpointOutcome({appState, engineState, changes, onContinue, onOpenPlan}: Props): ReactNode {
  const logged = lastCheckpoint(appState);
  const current = engineState.profile.performance;

  if (logged === null || current === null) {
    return (
      <div className="screen">
        <EmptyState title={copy.missing.title} text={copy.missing.text}>
          <Button onClick={onOpenPlan}>{copy.missing.cta}</Button>
        </EmptyState>
      </div>
    );
  }

  const previous = logged.previousPerformance;
  const decision = engineState.decision;

  return (
    <div className="screen">
      <header className="appbar">
        <div>
          <h1 className="appbar__title">{copy.outcome.title}</h1>
        </div>
      </header>

      <Card tone="ok">
        <KeyValue label={copy.outcome.previous} value={previous === null ? '—' : formatTime(previous)} />
        <KeyValue label={copy.outcome.current} value={formatTime(current.timeSeconds)} />
      </Card>

      <Card>
        <KeyValue label={copy.outcome.goal} value={`3000 м за ${formatTime(engineState.profile.targetTimeSeconds)}`} />
        <KeyValue label={copy.outcome.phase} value={phaseText[decision.phase].label} />
        {decision.feasibility === null ? null : <KeyValue label={copy.outcome.feasibility} value={feasibilityText[decision.feasibility].label} />}
        <KeyValue label={copy.outcome.gate} value={gateText[decision.gate].label} />
      </Card>

      <Card title={copy.outcome.changes}>
        {changes === null || changes.length === 0 ? (
          <p className="hint">{copy.outcome.noChanges}</p>
        ) : (
          <ul className="list">
            {changes.map((change, index) => (
              <li key={`${change.kind}-${index}`} className="list__item">{describeChange(change)}</li>
            ))}
          </ul>
        )}
      </Card>

      <div className="actions">
        <Button onClick={onContinue}>{copy.outcome.continue}</Button>
        <Button variant="ghost" onClick={onOpenPlan}>{copy.outcome.openPlan}</Button>
      </div>
    </div>
  );
}

/** Only observable facts, worded as facts. No reason is invented for the engine's decision. */
function describeChange(change: PlanChange): string {
  switch (change.kind) {
    case 'PHASE_CHANGED':
      return `${outcomeCopy.title}: ${phaseText[change.from].label} → ${phaseText[change.to].label}`;
    case 'GATE_CHANGED':
      return `${gateText[change.from].label} → ${gateText[change.to].label}`;
    case 'FEASIBILITY_CHANGED':
      return `${change.from === null ? '—' : feasibilityText[change.from].label} → ${change.to === null ? '—' : feasibilityText[change.to].label}`;
    case 'NEXT_WORKOUT_CHANGED':
      return change.to === null ? 'Следующая тренировка: —' : 'Следующая тренировка обновлена';
    case 'CONTROL_SCHEDULED':
      return 'Добавлен контрольный забег';
    case 'CHECKPOINT_REQUIRED':
      return 'Нужен контрольный результат';
    case 'SAFETY_CHANGED':
      return 'Состояние изменилось';
    case 'QUEUE_BECAME_EMPTY':
      return 'Построенных тренировок больше нет';
    case 'WORKOUT_RECORDED':
      return 'Тренировка закрыта';
    case 'NEXT_WORKOUT_TYPE_CHANGED':
    case 'NEXT_WORKOUT_DATE_CHANGED':
    case 'NEXT_WORKOUT_VOLUME_CHANGED':
    case 'NEXT_WORKOUT_PACE_CHANGED':
      return 'Следующая тренировка обновлена';
  }
}
