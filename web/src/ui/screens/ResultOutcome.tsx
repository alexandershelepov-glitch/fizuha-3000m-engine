import type {ReactNode} from 'react';
import {formatDateShort, formatTime} from '../../application/format.ts';
import type {EngineState, HistoryEntry, Workout} from '../../application/engineGateway.ts';
import type {PlanChange} from '../../application/planDiff.ts';
import {evaluationSign, evaluationText, reasonText, yellowReasonText} from '../copy/values.ts';
import {change as changeText, outcome as copy, today as todayText} from '../copy/text.ts';
import {paceRangeText, workoutSummaryText, workoutTitle, workoutVolume} from '../display.ts';
import {Button} from '../components/Button.tsx';
import {Card, EmptyState, KeyValue, Notice, Sign} from '../components/Layout.tsx';

interface Props {
  readonly entry: HistoryEntry;
  readonly engineState: EngineState;
  readonly today: string;
  readonly nextWorkout: Workout | null;
  /**
   * Observable changes, available in the session that recorded the result. After a reload the verdict,
   * the reason and the new plan are all still derived from the stored engine state; only this list is
   * gone, so the block is omitted instead of being reconstructed or invented.
   */
  readonly changes: readonly PlanChange[] | null;
  readonly onContinue: () => void;
  readonly onOpenPlan: () => void;
}

export function ResultOutcome({entry, engineState, nextWorkout, changes, onContinue, onOpenPlan}: Props): ReactNode {
  const evaluation = entry.classified.evaluation;
  const yellow = entry.classified.yellowReason;

  return (
    <div className="screen">
      <header className="appbar">
        <div>
          <h1 className="appbar__title">{copy.title}</h1>
          <p className="appbar__subtitle">{`${workoutTitle(entry.workout)} · ${formatDateShort(entry.workout.scheduledDate)}`}</p>
        </div>
      </header>

      <Card tone={evaluation === 'RED' ? 'danger' : evaluation === 'YELLOW' ? 'warn' : 'ok'}>
        <Sign sign={evaluationSign[evaluation]} label={evaluationText[evaluation].label} />
        <p className="paragraph">{evaluationText[evaluation].description}</p>
        {yellow === null ? null : (
          <Notice tone="warn" title={yellowReasonText[yellow].label}>
            <p>{yellowReasonText[yellow].description}</p>
          </Notice>
        )}
      </Card>

      {engineState.decision.reasons.length > 0 ? (
        <Card title={copy.why}>
          <ul className="list">
            {engineState.decision.reasons.map((reason) => (
              <li key={reason} className="list__item">
                <strong>{reasonText[reason].label}.</strong> {reasonText[reason].description}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title={copy.recorded}>
        <KeyValue label="Выполнено" value={`${Math.round(entry.result.completionFraction * 100)}%`} />
        <KeyValue label="Тяжесть" value={String(entry.result.sessionRpe)} />
        <KeyValue label="Длительность" value={`${entry.result.durationMinutes} мин`} />
        <KeyValue label="Дистанция" value={`${entry.result.distanceMeters} м`} />
        {entry.result.repeats.length > 0 ? (
          <KeyValue label="Отрезки" value={entry.result.repeats.map((repeat) => `${Math.round(repeat.distanceMeters)} м / ${formatTime(repeat.seconds)}`).join(', ')} />
        ) : null}
      </Card>

      {changes === null || changes.length === 0 ? null : (
        <Card title={copy.whatChanged}>
          <ul className="list">
            {changes.map((item, index) => (
              <li key={`${item.kind}-${index}`} className="list__item">{describeChange(item)}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={copy.nextSession}>
        {nextWorkout === null ? (
          <p className="hint">{copy.noNextSession}</p>
        ) : (
          <>
            <KeyValue label={workoutTitle(nextWorkout)} value={`${workoutVolume(nextWorkout)} · ${formatDateShort(nextWorkout.scheduledDate)}`} />
            {paceRangeText(nextWorkout.paceRangeSecondsPerKm) === null ? null : (
              <KeyValue label={todayText.workout.pace} value={paceRangeText(nextWorkout.paceRangeSecondsPerKm)!} />
            )}
          </>
        )}
      </Card>

      <div className="actions">
        <Button onClick={onContinue}>{copy.continue}</Button>
        <Button variant="ghost" onClick={onOpenPlan}>{copy.openPlan}</Button>
      </div>
    </div>
  );
}

/** One line per observable change. No reason is invented: only what the engine actually did. */
function describeChange(change: PlanChange): string {
  switch (change.kind) {
    case 'WORKOUT_RECORDED':
      return changeText.WORKOUT_RECORDED;
    case 'NEXT_WORKOUT_CHANGED':
      return change.to === null ? `${changeText.NEXT_WORKOUT_CHANGED}: ${changeText.none}` : `${changeText.NEXT_WORKOUT_CHANGED}: ${workoutSummaryText(change.to)}`;
    case 'NEXT_WORKOUT_TYPE_CHANGED':
      return `${changeText.NEXT_WORKOUT_TYPE_CHANGED}: ${changeText.from} ${change.from}, ${changeText.to} ${change.to}`;
    case 'NEXT_WORKOUT_DATE_CHANGED':
      return `${changeText.NEXT_WORKOUT_DATE_CHANGED}: ${changeText.from} ${formatDateShort(change.from)}, ${changeText.to} ${formatDateShort(change.to)}`;
    case 'NEXT_WORKOUT_VOLUME_CHANGED':
      return `${changeText.NEXT_WORKOUT_VOLUME_CHANGED}: ${changeText.from} ${workoutSummaryText(change.from)}, ${changeText.to} ${workoutSummaryText(change.to)}`;
    case 'NEXT_WORKOUT_PACE_CHANGED':
      return `${changeText.NEXT_WORKOUT_PACE_CHANGED}: ${paceRangeText(change.from) ?? changeText.noneValue} → ${paceRangeText(change.to) ?? changeText.noneValue}`;
    case 'CONTROL_SCHEDULED':
      return `${changeText.CONTROL_SCHEDULED}: ${workoutSummaryText(change.workout)}`;
    case 'PHASE_CHANGED':
      return `${changeText.PHASE_CHANGED}`;
    case 'GATE_CHANGED':
      return `${changeText.GATE_CHANGED}`;
    case 'FEASIBILITY_CHANGED':
      return `${changeText.FEASIBILITY_CHANGED}`;
    case 'SAFETY_CHANGED':
      return `${changeText.SAFETY_CHANGED}`;
    case 'CHECKPOINT_REQUIRED':
      return changeText.CHECKPOINT_REQUIRED;
    case 'QUEUE_BECAME_EMPTY':
      return changeText.QUEUE_BECAME_EMPTY;
  }
}

/** Placeholder used when the outcome URL is opened for a workout that was never recorded. */
export function OutcomeMissing({onOpenPlan}: {onOpenPlan: () => void}): ReactNode {
  return (
    <div className="screen">
      <EmptyState title="Результат не найден" text="Эта тренировка ещё не закрыта или результат не сохранён на этом устройстве.">
        <Button onClick={onOpenPlan}>{copy.openPlan}</Button>
      </EmptyState>
    </div>
  );
}
