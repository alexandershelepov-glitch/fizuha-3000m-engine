import {useState} from 'react';
import type {ReactNode} from 'react';
import {formatTime} from '../../application/format.ts';
import type {Decision, Profile} from '../../application/engineGateway.ts';
import {assessment, common} from '../copy/text.ts';
import {GATE_PRINCIPLE, capacityText, confidenceText, feasibilityText, gateText, phaseText, phaseWhy, qualityText, reasonText} from '../copy/values.ts';
import {Button} from '../components/Button.tsx';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';

interface Props {
  readonly decision: Decision;
  readonly profile: Profile;
  readonly onContinue: () => void;
}

export function Assessment({decision, profile, onContinue}: Props): ReactNode {
  const [showDetails, setShowDetails] = useState(false);
  const feasibility = decision.feasibility;
  const currentTime = profile.performance === null ? null : formatTime(profile.performance.timeSeconds);

  return (
    <div className="screen">
      <header className="appbar">
        <div>
          <h1 className="appbar__title">{assessment.title}</h1>
        </div>
      </header>

      <Card>
        <KeyValue label={assessment.whereAmI} value={currentTime === null ? assessment.noPerformance : assessment.performance(currentTime)} />
        <KeyValue label={assessment.goal} value={assessment.goalValue(formatTime(profile.targetTimeSeconds))} />
        <KeyValue label={assessment.startPhase} value={phaseText[decision.phase].label} />
      </Card>

      {feasibility === null ? null : (
        <Card title={assessment.feasibility}>
          <p className="paragraph">{feasibilityText[feasibility].label}</p>
          <p className="hint">{feasibilityText[feasibility].description}</p>
        </Card>
      )}

      <Card title={assessment.gate}>
        <p className="paragraph">{gateText[decision.gate].label}</p>
        <p className="hint">{gateText[decision.gate].description}</p>
        <Notice tone="info">{GATE_PRINCIPLE}</Notice>
      </Card>

      <Card title={phaseText[decision.phase].label}>
        <p className="paragraph">{phaseWhy[decision.phase]}</p>
      </Card>

      {showDetails ? (
        <Card title={assessment.detailsTitle}>
          <KeyValue label={assessment.details.confidence} value={confidenceText[decision.confidence].label} />
          <p className="hint">{confidenceText[decision.confidence].description}</p>
          <KeyValue label={assessment.details.capacity} value={capacityText[decision.capacity].label} />
          <p className="hint">{capacityText[decision.capacity].description}</p>
          <KeyValue label={assessment.details.quality} value={qualityText[decision.quality].label} />
          <p className="hint">{qualityText[decision.quality].description}</p>
          {decision.reasons.length > 0 ? (
            <>
              <h3 className="card__subtitle">{assessment.details.reasons}</h3>
              <ul className="list">
                {decision.reasons.map((reason) => (
                  <li key={reason} className="list__item">
                    <strong>{reasonText[reason].label}.</strong> {reasonText[reason].description}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}

      <div className="actions">
        <Button onClick={onContinue}>{assessment.primaryCta}</Button>
        <Button variant="ghost" onClick={() => setShowDetails((open) => !open)} aria-expanded={showDetails}>
          {showDetails ? common.understood : common.why}
        </Button>
      </div>
    </div>
  );
}
