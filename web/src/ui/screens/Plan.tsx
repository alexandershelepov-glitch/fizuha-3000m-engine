import type {ReactNode} from 'react';
import {addDays, formatDateLong, formatTime} from '../../application/format.ts';
import {taperDaysFor} from '../../application/engineGateway.ts';
import type {EngineState} from '../../application/engineGateway.ts';
import {hasPendingResults} from '../../application/invariants.ts';
import {isSafetyHold, needsPerformanceReview} from '../../application/uiState.ts';
import {workoutDate, workoutTitle, workoutVolume} from '../display.ts';
import {phaseText, phaseWhy} from '../copy/values.ts';
import {common, nav, plan, today as todayText} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';
import type {Route} from '../../app/routes.ts';

interface Props {
  readonly engineState: EngineState;
  readonly today: string;
  readonly onNavigate: (route: Route) => void;
  readonly onRefreshPlan: () => void;
  readonly refreshing: boolean;
}

export function Plan({engineState, today, onNavigate, onRefreshPlan, refreshing}: Props): ReactNode {
  const {profile, decision, queue} = engineState;
  const taperStart = addDays(profile.raceDate, -taperDaysFor(decision.capacity, decision.quality));
  const todayWorkout = queue.find((workout) => workout.scheduledDate === today) ?? null;
  // INV-1: an unrecorded past session blocks every clock-advancing action, so the screen must not
  // offer one. The application layer refuses the call as well, independently of this rendering.
  const pending = hasPendingResults(engineState, today);

  return (
    <div className="screen">
      <header className="appbar">
        <div>
          <h1 className="appbar__title">{plan.title}</h1>
          <p className="appbar__subtitle">{`${plan.currentPhase}: ${needsPerformanceReview(engineState) ? todayText.performanceReview.title : phaseText[decision.phase].label}`}</p>
        </div>
      </header>

      <Card>
        <p className="paragraph">{needsPerformanceReview(engineState) ? todayText.performanceReview.text : phaseWhy[decision.phase]}</p>
      </Card>
      {profile.canRun3Km && profile.performance === null ? (
        <Notice tone="info" title="3 км без остановки — подтверждено">
          <p>Продолжайте спокойные непрерывные тренировки. Время на 3000 м ещё неизвестно — быстрые занятия не назначаются. Когда будет удобно и позволит самочувствие, внесите отдельно измеренный результат.</p>
          <Button variant="secondary" onClick={() => onNavigate({name:'CHECKPOINT'})}>Внести измеренный результат</Button>
        </Notice>
      ) : null}
      {isSafetyHold(engineState) ? (
        <Notice tone="warn" title={todayText.hold.title}>
          <p>{todayText.hold.text}</p>
          <Button onClick={() => onNavigate({name: 'SAFETY_RECHECK'})}>{todayText.hold.recheck}</Button>
        </Notice>
      ) : null}

      {needsPerformanceReview(engineState) ? (
        <Notice tone="info" title={todayText.performanceReview.title}>
          <p>{todayText.performanceReview.text}</p>
          <Button onClick={() => onNavigate({name: 'CHECKPOINT'})}>{todayText.performanceReview.cta}</Button>
        </Notice>
      ) : null}

      {todayWorkout ? (
        <div className="actions">
          <Button onClick={() => onNavigate({name: 'WORKOUT', id: todayWorkout.id})}>{plan.openToday}</Button>
        </div>
      ) : null}

      <Card title={plan.horizon}>
        {queue.length === 0 ? (
          <Notice tone="info">На ближайшие дни тренировок нет. Обновите план, когда будете готовы продолжать.</Notice>
        ) : (
          <ul className="timeline">
            {queue.map((workout) => (
              <li key={workout.id} className="timeline__item">
                <button type="button" className="timeline__button" onClick={() => onNavigate({name: 'WORKOUT', id: workout.id})}>
                  <span className="timeline__date">{workoutDate(workout)}</span>
                  <span className="timeline__title">{workoutTitle(workout)}</span>
                  <span className="timeline__meta">{workoutVolume(workout)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">{plan.horizonNote}</p>
      </Card>

      <Card title={plan.taperLabel}>
        <KeyValue label={plan.taper} value={formatDateLong(taperStart)} />
        <p className="hint">{plan.taperNote}</p>
      </Card>

      <Card title={plan.race}>
        <KeyValue label={plan.race} value={`3000 м · ${formatDateLong(profile.raceDate)}`} />
        <KeyValue label={plan.goalLabel} value={formatTime(profile.targetTimeSeconds)} />
        <p className="hint">{plan.raceNote}</p>
      </Card>

      {pending ? (
        <Notice tone="warn" title={todayText.pendingResult.title}>
          <p>{todayText.pendingResult.text}</p>
          <Button onClick={() => onNavigate({name: 'TODAY'})}>{nav.today}</Button>
        </Notice>
      ) : (
        <div className="actions">
          <Button variant="secondary" onClick={onRefreshPlan} disabled={refreshing}>{refreshing ? common.loading : plan.refresh}</Button>
        </div>
      )}
    </div>
  );
}
