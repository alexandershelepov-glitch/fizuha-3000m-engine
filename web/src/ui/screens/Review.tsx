import {useState} from 'react';
import type {ReactNode} from 'react';
import {daysBetween, formatDateLong, formatTime, parseTime} from '../../application/format.ts';
import type {QuestionnaireDraft} from '../../application/questionnaire.ts';
import {safetyHasFlags} from '../display.ts';
import {copyForError} from '../copy/errors.ts';
import {breakReasonText, mismatchText} from '../copy/values.ts';
import {common, review} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';
import type {Route} from '../../app/routes.ts';

export type CreateOutcome =
  | {kind: 'CREATED'}
  | {kind: 'PROBLEMS'; step: Route}
  | {kind: 'ENGINE_ERROR'; error: import('../../application/errorContract.ts').UiError; step: Route | null};

interface Props {
  readonly draft: QuestionnaireDraft;
  readonly today: string;
  readonly onCreate: (draft: QuestionnaireDraft) => CreateOutcome;
  readonly onNavigate: (route: Route) => void;
}

const timeOrRaw = (raw: string): string => {
  const parsed = parseTime(raw);
  return parsed.ok ? formatTime(parsed.seconds) : raw;
};

export function Review({draft, today, onCreate, onNavigate}: Props): ReactNode {
  const [outcome, setOutcome] = useState<CreateOutcome | null>(null);

  const handleCreate = (): void => {
    const result = onCreate(draft);
    setOutcome(result);
    if (result.kind === 'CREATED') onNavigate({name: 'ASSESSMENT'});
    else if (result.kind === 'PROBLEMS') onNavigate(result.step);
    else if (result.step) onNavigate(result.step);
  };

  const engineError = outcome?.kind === 'ENGINE_ERROR' ? outcome.error : null;
  const copy = engineError ? copyForError(engineError) : null;

  return (
    <div className="screen">
      <header className="appbar">
        <button type="button" className="appbar__back" onClick={() => onNavigate({name: 'QUESTIONNAIRE', step: 'RACE_DATE'})} aria-label={common.back}>←</button>
        <div>
          <h1 className="appbar__title">{review.title}</h1>
          <p className="appbar__subtitle">{review.subtitle}</p>
        </div>
      </header>

      {copy ? (
        <Notice tone="danger" title={copy.title}>
          <p>{copy.text(engineError!.params)}</p>
        </Notice>
      ) : null}

      <Card>
        <KeyValue label={review.rows.performance} value={draft.hasResult ? timeOrRaw(draft.resultTime) : review.rows.noPerformance} />
        <KeyValue label={review.rows.target} value={timeOrRaw(draft.targetTime)} />
        <KeyValue label={review.rows.raceDate} value={`${formatDateLong(draft.raceDate)} · ${review.rows.daysToRace(daysBetween(today, draft.raceDate))}`} />
        <KeyValue label={review.rows.availability} value={draft.availableRunsPerWeek} />
        <KeyValue label={review.rows.volume} value={`${draft.averageWeeklyKm4Weeks} км`} />
        <KeyValue label={review.rows.quality} value={draft.qualityRecall === 'EXACT' || draft.qualityRecall === undefined
          ? `${draft.qualitySessions8Weeks} (недель: ${draft.qualityWeeks8Weeks})`
          : draft.qualityRecall === 'NONE' ? 'Не было'
          : draft.qualityRecall === 'REGULAR' ? 'Регулярно, без точных записей'
          : draft.qualityRecall === 'SOMETIMES' ? 'Несколько раз, без точных записей' : 'Нет точных данных'} />
        <KeyValue label={review.rows.breaks} value={draft.hasBreaks && draft.breaks.length > 0 ? draft.breaks.map((entry) => `${breakReasonText[entry.reason]}, ${entry.days} дн.`).join('; ') : review.rows.noBreaks} />
        <KeyValue label={review.rows.safety} value={safetyHasFlags(draft.safety) ? 'отмечено' : review.rows.noRestrictions} />
        {/* Review is only reachable once the draft validates, so an unanswered mismatch cannot render. */}
        <KeyValue label={review.rows.mismatch} value={draft.performanceMismatch === null ? '—' : mismatchText[draft.performanceMismatch]} />
      </Card>

      <div className="actions">
        <Button onClick={handleCreate}>{review.primaryCta}</Button>
        <Button variant="ghost" onClick={() => onNavigate({name: 'QUESTIONNAIRE', step: 'RESULT'})}>{review.secondaryCta}</Button>
      </div>

      <p className="hint">Активный цикл создаётся только после нажатия «{review.primaryCta}».</p>
    </div>
  );
}
