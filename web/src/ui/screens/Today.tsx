import type {ReactNode} from 'react';
import {formatDateLong, formatTime} from '../../application/format.ts';
import type {EngineState, Workout} from '../../application/engineGateway.ts';
import {deriveToday} from '../../application/uiState.ts';
import {phaseText, safetyStatusText} from '../copy/values.ts';
import {common, skip as skipText, today as todayText} from '../copy/text.ts';
import {workoutPaceRange, workoutTitle, workoutVolume} from '../display.ts';
import {Button} from '../components/Button.tsx';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';
import type {Route} from '../../app/routes.ts';

interface Props {
  readonly engineState: EngineState;
  readonly today: string;
  readonly onNavigate: (route: Route) => void;
  readonly onRefreshPlan: () => void;
  readonly refreshing: boolean;
  /** Records the overdue session as simply not done; the application logs the reason. */
  readonly onSkipPending: (workoutId: string) => void;
  readonly busy: boolean;
}

export function Today({engineState, today, onNavigate, onRefreshPlan, refreshing, onSkipPending, busy}: Props): ReactNode {
  const view = deriveToday(engineState, today);
  const {decision, profile} = engineState;

  return (
    <div className="screen">
      <header className="appbar">
        <div>
          <h1 className="appbar__title">{todayText.title}</h1>
          <p className="appbar__subtitle">{formatDateLong(today)}</p>
        </div>
      </header>

      <p className="chip">{`${todayText.phaseLabel}: ${phaseText[decision.phase].label}`}</p>

      {view.state === 'TRAINING_HOLD' ? (
        <Notice tone="danger" title={todayText.hold.title}>
          <p>{safetyStatusText[decision.safety]}</p>
          <p>{todayText.hold.text}</p>
          <p className="hint">{todayText.hold.note}</p>
        </Notice>
      ) : null}

      {view.state === 'COMPLETED' ? (
        <Card title={todayText.completed.title}>
          <p className="paragraph">{todayText.completed.text}</p>
          <Button onClick={() => onNavigate({name: 'HISTORY'})}>{todayText.completed.cta}</Button>
        </Card>
      ) : null}

      {view.state === 'PENDING_RESULT' && view.pendingWorkouts[0] !== undefined ? (
        <Notice tone="warn" title={todayText.pendingResult.title}>
          <p>{todayText.pendingResult.text}</p>
          <KeyValue label={workoutTitle(view.pendingWorkouts[0])} value={formatDateLong(view.pendingWorkouts[0].scheduledDate)} />
          {/* Unresolved sessions are handled oldest first, so both actions point at the earliest one. */}
          <Button onClick={() => onNavigate({name: 'WORKOUT_RESULT', id: view.pendingWorkouts[0]!.id})}>{todayText.pendingResult.cta}</Button>
          <Button variant="secondary" onClick={() => onSkipPending(view.pendingWorkouts[0]!.id)} disabled={busy}>{skipText.pendingAction}</Button>
        </Notice>
      ) : null}

      {view.state === 'RACE_DAY' ? (
        <Card title={todayText.raceDay.title}>
          <KeyValue label={todayText.raceDay.distance} value={todayText.raceDay.distanceValue} />
          <KeyValue label={todayText.raceDay.goal} value={formatTime(profile.targetTimeSeconds)} />
          <KeyValue label={todayText.raceDay.date} value={formatDateLong(profile.raceDate)} />
          <p className="hint">{todayText.raceDay.note}</p>
          <Button disabled title={todayText.raceDay.pendingNote}>{todayText.raceDay.cta}</Button>
          <p className="hint">{todayText.raceDay.pendingNote}</p>
        </Card>
      ) : null}

      {view.state === 'AWAITING_FINAL_RESULT' ? (
        <Card title={todayText.awaiting.title}>
          <p className="paragraph">{todayText.awaiting.text}</p>
          <Button disabled title={todayText.raceDay.pendingNote}>{todayText.awaiting.cta}</Button>
          <Button variant="ghost" onClick={() => onNavigate({name: 'HISTORY'})}>{todayText.awaiting.historyCta}</Button>
        </Card>
      ) : null}

      {view.state === 'CHECKPOINT_REQUIRED' ? (
        <Notice tone="info" title={todayText.checkpoint.title}>
          <p>{todayText.checkpoint.text}</p>
          <Button onClick={() => onNavigate({name: 'CHECKPOINT'})}>{todayText.checkpoint.cta}</Button>
        </Notice>
      ) : null}

      {view.state === 'TAPER' ? (
        <Card title={phaseText.TAPER.label}>
          {view.daysToRace >= 0 ? <p className="countdown">{todayText.raceCountdown(view.daysToRace)}</p> : null}
          <p className="paragraph">{phaseText.TAPER.description}</p>
        </Card>
      ) : null}

      {(view.state === 'WORKOUT_TODAY' || (view.workout !== null && (view.state === 'TAPER' || view.state === 'CHECKPOINT_REQUIRED'))) && view.workout !== null ? (
        <WorkoutCard
          workout={view.workout}
          onOpen={() => onNavigate({name: 'WORKOUT', id: view.workout!.id})}
          onEnterResult={() => onNavigate({name: 'WORKOUT_RESULT', id: view.workout!.id})}
        />
      ) : null}

      {view.state === 'REST_DAY' ? (
        <Card title={todayText.rest.title}>
          <p className="paragraph">{todayText.rest.text}</p>
          {view.nextWorkout === null ? (
            <p className="hint">{todayText.rest.noNext}</p>
          ) : (
            <KeyValue label={todayText.rest.next} value={`${workoutTitle(view.nextWorkout)} · ${formatDateLong(view.nextWorkout.scheduledDate)}`} />
          )}
          <Button onClick={() => onNavigate({name: 'PLAN'})}>{todayText.rest.cta}</Button>
        </Card>
      ) : null}

      {view.state === 'EMPTY_QUEUE' ? (
        <Card title={todayText.emptyQueue.title}>
          <p className="paragraph">{todayText.emptyQueue.text}</p>
          <Button onClick={onRefreshPlan} disabled={refreshing}>{refreshing ? common.loading : todayText.emptyQueue.cta}</Button>
        </Card>
      ) : null}

      <Card>
        <KeyValue label={todayText.raceLabel} value={formatDateLong(profile.raceDate)} />
        {view.daysToRace >= 0 ? <p className="hint">{todayText.raceCountdown(view.daysToRace)}</p> : null}
      </Card>
    </div>
  );
}

function WorkoutCard({workout, onOpen, onEnterResult}: {workout: Workout; onOpen: () => void; onEnterResult: () => void}): ReactNode {
  const pace = workoutPaceRange(workout);
  return (
    <Card title={workoutTitle(workout)}>
      <KeyValue label={todayText.workout.volume} value={workoutVolume(workout)} />
      {pace ? <KeyValue label={todayText.workout.pace} value={pace} /> : null}
      <Button onClick={onOpen}>{todayText.workout.open}</Button>
      <Button variant="secondary" onClick={onEnterResult}>{todayText.workout.enterResult}</Button>
    </Card>
  );
}
