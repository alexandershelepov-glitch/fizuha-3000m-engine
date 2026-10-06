import type {AppStateV1} from '../../application/appState.ts';
import type {PlanChange} from '../../application/planDiff.ts';
import {formatDateLong, formatTime} from '../../application/format.ts';
import {phaseText, gateText, feasibilityText} from '../copy/values.ts';
import {change as changeText, common, lifecycle} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, KeyValue} from '../components/Layout.tsx';
import {workoutSummaryText} from '../display.ts';
export function ParametersOutcome({appState, changes, onContinue}: {appState: AppStateV1; changes: readonly PlanChange[] | null; onContinue: () => void}) {
  const event = [...appState.events].reverse().find(e => e.type === 'TRAINING_PARAMETERS_CHANGED');
  return <div className="screen"><h1>{lifecycle.updated}</h1><Card>
    {event && 'targetTimeSeconds' in event.to ? <KeyValue label={lifecycle.goal} value={`${formatTime(Number(event.from.targetTimeSeconds))} → ${formatTime(Number(event.to.targetTimeSeconds))}`} /> : null}
    {event && 'raceDate' in event.to ? <KeyValue label={lifecycle.date} value={`${formatDateLong(String(event.from.raceDate))} → ${formatDateLong(String(event.to.raceDate))}`} /> : null}
  </Card>{changes === null ? null : <Card title={changeText.NEXT_WORKOUT_CHANGED}>
    {changes.length === 0 ? <p>{changeText.none}</p> : <ul>{changes.map((c, i) => <li key={i}>{describe(c)}</li>)}</ul>}
  </Card>}<Button onClick={onContinue}>{common.next}</Button></div>;
}
function describe(c: PlanChange): string {
  if (c.kind === 'PHASE_CHANGED') return `${changeText[c.kind]}: ${phaseText[c.from].label} → ${phaseText[c.to].label}`;
  if (c.kind === 'GATE_CHANGED') return `${changeText[c.kind]}: ${gateText[c.from].label} → ${gateText[c.to].label}`;
  if (c.kind === 'FEASIBILITY_CHANGED') return `${changeText[c.kind]}: ${c.from ? feasibilityText[c.from].label : '—'} → ${c.to ? feasibilityText[c.to].label : '—'}`;
  if (c.kind === 'NEXT_WORKOUT_CHANGED') return `${changeText[c.kind]}: ${c.to ? workoutSummaryText(c.to) : '—'}`;
  if (c.kind === 'NEXT_WORKOUT_VOLUME_CHANGED') return `${changeText[c.kind]}: ${workoutSummaryText(c.from)} → ${workoutSummaryText(c.to)}`;
  return changeText[c.kind];
}
