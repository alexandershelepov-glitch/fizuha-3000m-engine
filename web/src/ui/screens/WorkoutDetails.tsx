import {workoutWarmup, workoutCooldown} from '../display.ts';
import {useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {formatDateLong} from '../../application/format.ts';
import type {ActionAvailability} from '../../application/invariants.ts';
import type {Workout} from '../../application/engineGateway.ts';
import {anchorText, effortCueText, mainModeText, workoutGoalText, workoutTypeText} from '../copy/values.ts';
import {common, instruction as instructionText, today as todayText} from '../copy/text.ts';
import {workoutIntervalsText, workoutMainDose, workoutPaceRange, workoutRest, workoutSpeedRange} from '../display.ts';
import {estimatedEasyTimeText, workoutInstruction} from '../workoutInstructions.ts';
import {Button} from '../components/Button.tsx';
import {Card, EmptyState, KeyValue, Notice} from '../components/Layout.tsx';
import {copyForError} from '../copy/errors.ts';
import {move as moveText, skip as skipText} from '../copy/text.ts';

export interface SkipOutcome {
  readonly ok: boolean;
  readonly error?: {code: string; params?: {min?: number; max?: number; value?: number}};
}

interface DetailsProps {
  readonly workout: Workout | null;
  /** The application's own decision about this session; the screen only mirrors it. */
  readonly resultAvailability: ActionAvailability;
  readonly moveAvailability: ActionAvailability;
  readonly onBack: () => void;
  readonly onEnterResult: () => void;
  readonly onMove: () => void;
  /** Records the skip; the application derives the reason and persists it. */
  readonly skip: () => SkipOutcome;
}

export function WorkoutDetails({workout, resultAvailability, moveAvailability, onBack, onEnterResult, onMove, skip}: DetailsProps): ReactNode {
  const [askSkip, setAskSkip] = useState(false);
  const [skipError, setSkipError] = useState<{code: string; params?: {min?: number; max?: number; value?: number}} | null>(null);
  const [busy, setBusy] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const inFlight = useRef(false);

  const handleSkip = (): void => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const outcome = skip();
    if (!outcome.ok) {
      inFlight.current = false;
      setBusy(false);
      setAskSkip(false);
      setSkipError(outcome.error ?? {code: 'UNKNOWN'});
    }
  };

  if (workout === null) {
    return (
      <div className="screen">
        <EmptyState title="Тренировка не найдена" text="Возможно, план уже обновлён.">
          <Button onClick={onBack}>{common.back}</Button>
        </EmptyState>
      </div>
    );
  }

  const pace = workoutPaceRange(workout);
  const speed = workoutSpeedRange(workout);
  const rest = workoutRest(workout);
  const plan = workoutInstruction(workout);

  return (
    <div className="screen">
      <header className="appbar">
        <button type="button" className="appbar__back" onClick={onBack} aria-label={common.back}>←</button>
        <div>
          <h1 className="appbar__title">{workoutTypeText[workout.type].label}</h1>
          <p className="appbar__subtitle">{formatDateLong(workout.scheduledDate)}</p>
        </div>
      </header>

      {/* The main card answers one question: what do I actually do today? */}
      <Card title={instructionText.cardTitle}>
        <p className="instruction__headline">{plan.headline}</p>
        <ol className="steps">
          {plan.steps.map((step) => (
            <li key={step} className="steps__item">{step}</li>
          ))}
        </ol>
        {plan.notes.length > 0 ? (
          <div className="instruction__notes" aria-label="Пояснения к тренировке">
            {plan.notes.map((note) => <p className="hint" key={note}>{note}</p>)}
          </div>
        ) : null}

        {/* Two different repeat lengths are easier to read as their own lines. */}
        {plan.splits.length > 1 ? (
          <div className="instruction__splits">
            <p className="instruction__label">{instructionText.splitsTitle}</p>
            <ul className="list">
              {plan.splits.map((split) => (
                <li key={split.distanceMeters} className="list__item">{split.text}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {plan.guidance.length > 0 ? (
          <div className="instruction__guidance">
            <p className="instruction__label">{instructionText.easyFeel}</p>
            <ul className="list">
              {plan.guidance.map((line) => (
                <li key={line} className="list__item">{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="instruction__effort">
          {instructionText.feeling} <strong>{plan.effort}</strong>
        </p>
        {plan.note === null ? null : <p className="hint">{plan.note}</p>}
      </Card>

      {/* Everything the engine prescribed, exactly as it was ordered. */}
      <Card title={instructionText.technicalTitle}>
        <KeyValue label={todayText.workout.task} value={workoutGoalText[workout.goal]} />
        <KeyValue label={todayText.workout.volume} value={workoutMainDose(workout)} />
        <KeyValue label={todayText.workout.mode} value={mainModeText[workout.main.mode]} />
        {/* The same structure the instruction above uses: never a second reading of the workout. */}
        {workoutIntervalsText(workout) === null ? null : <KeyValue label={todayText.workout.intervals} value={workoutIntervalsText(workout)!} />}
        {rest ? <KeyValue label={todayText.workout.rest} value={rest.replace('отдых ', '')} /> : null}
        {pace ? <KeyValue label={todayText.workout.pace} value={pace} /> : null}
        {speed ? <KeyValue label={instructionText.treadmillSpeedLabel} value={speed} /> : null}
        {estimatedEasyTimeText(workout) ? <KeyValue label="Ожидаемое время (по плану)" value={estimatedEasyTimeText(workout)!} /> : null}
        {workout.main.mode === 'INTERVALS' && workout.main.dose.unit === 'MINUTES' ? (
          <KeyValue label={instructionText.distanceLabel} value={plan.estimatedDistanceText === null
            ? instructionText.distanceNotAssigned
            : `${plan.estimatedDistanceText} (${instructionText.distanceEstimateDisclaimer})`} />
        ) : null}
        {plan.effortScale === '' ? null : <KeyValue label={todayText.workout.rpe} value={plan.effortScale.replace('Усилие: ', '')} />}
        {(workout.warmupMinutes > 0 || workout.protocol?.warmupMeters) ? <KeyValue label={todayText.workout.warmup} value={workoutWarmup(workout)} /> : null}
        {(workout.cooldownMinutes > 0 || workout.protocol?.cooldownMeters) ? <KeyValue label={todayText.workout.cooldown} value={workoutCooldown(workout)} /> : null}
        {workout.effortCues.length > 0 ? <KeyValue label={todayText.workout.cues} value={workout.effortCues.map((cue) => effortCueText[cue]).join(' · ')} /> : null}
      </Card>

      {/* Theory is available, but nobody has to read it to train. */}
      <Card>
        <button type="button" className="card__toggle" aria-expanded={showWhy} onClick={() => setShowWhy((open) => !open)}>
          {instructionText.whyTitle}
        </button>
        {showWhy ? (
          <>
            <p className="paragraph">{anchorText[workout.anchor]}</p>
            <p className="hint">{workoutTypeText[workout.type].description}</p>
          </>
        ) : null}
      </Card>

      {skipError === null ? null : (
        <Notice tone="danger" title={copyForError({code: skipError.code as never, params: skipError.params ?? {}, retry: false, fromEngine: true}).title}>
          <p>{copyForError({code: skipError.code as never, params: skipError.params ?? {}, retry: false, fromEngine: true}).text(skipError.params ?? {})}</p>
        </Notice>
      )}

      <div className="actions">
        {/* The application owns these decisions; this screen only shows what it allows. */}
        {resultAvailability === 'AVAILABLE' ? (
          <Button onClick={onEnterResult}>{todayText.workout.enterResult}</Button>
        ) : (
          <p className="hint">{resultAvailability === 'BEFORE_SCHEDULED_DATE' ? todayText.workout.resultLater : moveText.notAllowed.outOfOrder.title}</p>
        )}
        {/* The engine owns the horizon, occupancy, recovery and quality rules for a move. */}
        {workout.movable && moveAvailability === 'AVAILABLE' ? (
          <Button variant="secondary" onClick={onMove}>{moveText.action}</Button>
        ) : null}
        {moveAvailability === 'PAST_DUE_CANNOT_MOVE' ? <p className="hint">{moveText.notAllowed.overdue.text}</p> : null}
        <Button variant="ghost" onClick={() => setAskSkip(true)}>{skipText.action}</Button>
      </div>

      {askSkip ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label={skipText.confirmTitle}>
          <Notice tone="warn" title={skipText.confirmTitle}>
            <p>{skipText.confirmText}</p>
            <div className="actions">
              <Button autoFocus onClick={handleSkip} disabled={busy}>{busy ? common.loading : skipText.confirm}</Button>
              <Button variant="ghost" onClick={() => setAskSkip(false)}>{skipText.cancel}</Button>
            </div>
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
