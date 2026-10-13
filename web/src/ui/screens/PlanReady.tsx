import type {ReactNode} from 'react';
import {addDays, formatDateLong, formatTime} from '../../application/format.ts';
import {taperDaysFor} from '../../application/engineGateway.ts';
import type {EngineState} from '../../application/engineGateway.ts';
import {workoutLine} from '../display.ts';
import {isSafetyHold, needsPerformanceReview} from '../../application/uiState.ts';
import {phaseText, phaseWhy} from '../copy/values.ts';
import {planReady, questionnaire, today as todayCopy} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';

export function PlanReady({engineState, onContinue, onRecheck}: {engineState: EngineState; onContinue: () => void; onRecheck: () => void}): ReactNode {
  const {profile, decision, queue} = engineState;
  const taperStart = addDays(profile.raceDate, -taperDaysFor(decision.capacity, decision.quality));
  const hold = isSafetyHold(engineState);
  const performanceReview = needsPerformanceReview(engineState);

  return (
    <div className="screen">
      <header className="appbar">
        <div>
          <h1 className="appbar__title">{hold ? questionnaire.hold.title : planReady.title}</h1>
        </div>
      </header>

      <Card>
        <KeyValue label={planReady.goal} value={`3000 м за ${formatTime(profile.targetTimeSeconds)}`} />
        <KeyValue label={planReady.raceDate} value={formatDateLong(profile.raceDate)} />
        <KeyValue label={planReady.phase} value={phaseText[decision.phase].label} />
      </Card>

      {hold ? <Notice tone="warn" title={questionnaire.hold.title}><p>{questionnaire.hold.explanation}</p><p>{questionnaire.hold.next}</p><Button onClick={onRecheck}>{questionnaire.hold.recheck}</Button></Notice> : null}
      {performanceReview ? <Notice tone="info" title={todayCopy.performanceReview.title}><p>{todayCopy.performanceReview.text}</p></Notice> : null}

      <Card title={phaseText[decision.phase].label}>
        <p className="paragraph">{performanceReview ? todayCopy.performanceReview.text : phaseWhy[decision.phase]}</p>
      </Card>

      {!hold ? <Card title={planReady.horizon}>
        {queue.length === 0 ? (
          <p className="hint">{planReady.horizonNote}</p>
        ) : (
          <ul className="list">
            {queue.map((workout) => (
              <li key={workout.id} className="list__item">{workoutLine(workout)}</li>
            ))}
          </ul>
        )}
        <p className="hint">{planReady.horizonNote}</p>
      </Card> : null}

      <Card title={planReady.taper}>
        <p className="paragraph">{`${phaseText.TAPER.label} — около ${formatDateLong(taperStart)}`}</p>
        <p className="hint">{planReady.taperNote}</p>
      </Card>

      <div className="actions">
        <Button onClick={onContinue}>{planReady.primaryCta}</Button>
      </div>
    </div>
  );
}
