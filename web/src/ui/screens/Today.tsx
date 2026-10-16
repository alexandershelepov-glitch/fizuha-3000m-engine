import type {ReactNode} from 'react';
import {formatDateLong, formatTime} from '../../application/format.ts';
import {calendarDay, weekDates, weekSummary} from '../../application/calendarModel.ts';
import type {EngineState, Workout} from '../../application/engineGateway.ts';
import {deriveToday} from '../../application/uiState.ts';
import {phaseText, safetyStatusText} from '../copy/values.ts';
import {common, skip as skipText, today as todayText, lifecycle} from '../copy/text.ts';
import {workoutPaceRange, workoutSpeedRange, workoutTitle, workoutVolume} from '../display.ts';
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
  const week = weekSummary(weekDates(today).map(date => calendarDay(engineState, today, date)));
  const confirmed = profile.performance === null ? null : formatTime(profile.performance.timeSeconds);

  return (
    <div className="screen screen--home">
      <header className="appbar">
        <div>
          <h1 className="appbar__title">{todayText.title}</h1>
          <p className="appbar__subtitle">{formatDateLong(today)}</p>
        </div>
      </header>

      <p className="chip">{`${todayText.phaseLabel}: ${view.state === 'PERFORMANCE_REVIEW' ? todayText.performanceReview.title : phaseText[decision.phase].label}`}</p>

      {view.state === 'TRAINING_HOLD' ? (
        <Notice tone="danger" title={todayText.hold.title}>
          <p>{safetyStatusText[decision.safety]}</p>
          <p>{todayText.hold.text}</p>
          <p className="hint">{todayText.hold.note}</p>
          <Button onClick={() => onNavigate({name: 'SAFETY_RECHECK'})}>{todayText.hold.recheck}</Button>
        </Notice>
      ) : null}

      {decision.safety === 'OK' && !engineState.diagnosticHold && !engineState.relatedYellow ? (
        <>
          <section className="home-overview" aria-label="Ваша подготовка">
            <div className="home-overview__label"><strong>Подготовка к 3000 м</strong><span>{todayText.raceCountdown(Math.max(0, view.daysToRace))}</span></div>
            <div className="home-overview__metrics">
              <div><span>Текущий результат</span><strong>{confirmed ?? 'Нет замера'}</strong></div>
              <div><span>Цель</span><strong>{formatTime(profile.targetTimeSeconds)}</strong></div>
              <div><span>Дата норматива</span><strong className="home-overview__date">{formatDateLong(profile.raceDate)}</strong></div>
            </div>
            <div className="home-week" aria-label="Факты текущей недели">
              <span><b>{week.assigned}</b> назначено</span>
              <span><b>{week.completed}</b> выполнено</span>
              <span><b>{week.skipped}</b> пропущено</span>
            </div>
          </section>
          <div className="home-actions">
            <Button variant="secondary" onClick={() => onNavigate({name: 'PLAN'})}>Открыть календарь</Button>
          </div>
        </>
      ) : null}

      {!profile.canRun3Km && !engineState.finalResultRecorded &&
        today < profile.raceDate && decision.safety === 'OK' &&
        !engineState.diagnosticHold && !engineState.relatedYellow &&
        !engineState.progressionBlocked && engineState.reentry === null &&
        view.pendingWorkouts.length === 0 ? (
        <Card title="Уже можете пробежать 3000 м подряд?">
          <p className="paragraph">Если вы действительно пробежали все 3 км без остановки и ходьбы и чувствовали себя нормально, отметьте это отдельно. Время на дистанции знать не обязательно.</p>
          <Button variant="secondary" onClick={() => onNavigate({name: 'CONTINUOUS_3K'})}>Подтвердить непрерывный бег на 3 км</Button>
        </Card>
      ) : null}

      {view.state === 'PERFORMANCE_REVIEW' ? (
        <Notice tone="info" title={todayText.performanceReview.title}>
          <p>{todayText.performanceReview.text}</p>
          <Button onClick={() => onNavigate({name: 'CHECKPOINT'})}>{todayText.performanceReview.cta}</Button>
        </Notice>
      ) : null}

      {view.state === 'COMPLETED' ? (
        <Card title={todayText.completed.title}>
          <p className="paragraph">{todayText.completed.text}</p>
          <Button onClick={() => onNavigate({name: 'CYCLE_SUMMARY', id: ''})}>{todayText.completed.cta}</Button>
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
        <Card title={lifecycle.raceTitle}>
          <KeyValue label={todayText.raceDay.distance} value={todayText.raceDay.distanceValue} />
          <KeyValue label={todayText.raceDay.goal} value={formatTime(profile.targetTimeSeconds)} />
          <KeyValue label={todayText.raceDay.date} value={formatDateLong(profile.raceDate)} />
          <p className="hint">{todayText.raceDay.note}</p>
          <KeyValue label={lifecycle.form} value={profile.performance ? formatTime(profile.performance.timeSeconds) : '—'} />
          <Button onClick={() => onNavigate({name: 'FINAL_RESULT'})}>{lifecycle.finalCta}</Button>
          <Button variant="ghost" onClick={() => onNavigate({name: 'HISTORY'})}>{lifecycle.later}</Button>
        </Card>
      ) : null}

      {view.state === 'AWAITING_FINAL_RESULT' ? (
        <Card title={todayText.awaiting.title}>
          <p className="paragraph">{todayText.awaiting.text}</p>
          <p>{lifecycle.awaiting}</p>
          <Button onClick={() => onNavigate({name: 'FINAL_RESULT'})}>{lifecycle.finalCta}</Button>
          <Button variant="secondary" onClick={() => onNavigate({name: 'PROFILE'})}>{lifecycle.edit}</Button>
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

      {(view.state === 'WORKOUT_TODAY' || (view.workout !== null && (view.state === 'TAPER' || view.state === 'CHECKPOINT_REQUIRED' || view.state === 'PERFORMANCE_REVIEW'))) && view.workout !== null ? (
        <WorkoutCard
          workout={view.workout}
          onOpen={() => onNavigate({name: 'WORKOUT', id: view.workout!.id})}
          onEnterResult={() => onNavigate({name: 'WORKOUT_RESULT', id: view.workout!.id})}
        />
      ) : null}

      {view.state === 'PERFORMANCE_REVIEW' && view.workout === null ? (
        <Card title={todayText.rest.title}>
          <p className="paragraph">{view.nextWorkout === null
            ? todayText.performanceReview.noWorkout
            : `${todayText.rest.next}: ${workoutTitle(view.nextWorkout)} · ${formatDateLong(view.nextWorkout.scheduledDate)}`}</p>
        </Card>
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
  const speed = workoutSpeedRange(workout);
  return (
    <Card title={workoutTitle(workout)}>
      <KeyValue label={todayText.workout.volume} value={workoutVolume(workout)} />
      {pace ? <KeyValue label={todayText.workout.pace} value={pace} /> : null}
      {speed ? <KeyValue label={todayText.workout.treadmillSpeed} value={speed} /> : null}
      <Button onClick={onOpen}>{todayText.workout.open}</Button>
      <Button variant="secondary" onClick={onEnterResult}>{todayText.workout.enterResult}</Button>
    </Card>
  );
}
