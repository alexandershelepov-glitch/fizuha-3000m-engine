import {useCallback, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {COMPLETION_PRESETS, buildWorkoutResult, defaultResultDraft, draftHasNoRepeats, draftHasPartialRepeats, hasSafetyConcerns, repeatsAffectEvaluation, repeatsBlockExpandedFor} from '../../application/resultForm.ts';
import type {CompletionPreset, ResultDraft, ResultProblem, SafetyResponse} from '../../application/resultForm.ts';
import {healthySafety} from '../../application/questionnaire.ts';
import {loadResultDraft, saveResultDraft} from '../../application/draft.ts';
import {formatDateLong} from '../../application/format.ts';
import type {KeyValueStorage} from '../../application/storage.ts';
import type {Workout, WorkoutResult} from '../../application/engineGateway.ts';
import {copyForError} from '../copy/errors.ts';
import {resultForm as copy} from '../copy/text.ts';
import {workoutRest, workoutIntervalsText, workoutPaceRange, workoutRpe, workoutTitle} from '../display.ts';
import {Button} from '../components/Button.tsx';
import {Card, Notice} from '../components/Layout.tsx';
import {Choice, Field, TextInput, Toggle} from '../components/Field.tsx';
import {SafetyFields} from '../components/SafetyFields.tsx';
import {scaleLabels} from '../copy/values.ts';

export interface SubmitOutcome {
  readonly ok: boolean;
  readonly error?: {code: string; params?: {min?: number; max?: number; value?: number}};
}

interface Props {
  readonly workout: Workout;
  readonly storage: KeyValueStorage | null;
  readonly submit: (result: WorkoutResult) => SubmitOutcome;
  readonly onCancel: () => void;
}

export function ResultForm({workout, storage, submit, onCancel}: Props): ReactNode {
  const [draft, setDraft] = useState<ResultDraft>(() => loadResultDraft(storage, workout.id) ?? defaultResultDraft(workout));
  const [problems, setProblems] = useState<readonly ResultProblem[]>([]);
  const [warnOpen, setWarnOpen] = useState(false);
  const [pending, setPending] = useState<WorkoutResult | null>(null);
  const [engineError, setEngineError] = useState<SubmitOutcome['error'] | null>(null);
  const [saving, setSaving] = useState(false);
  // A second click can arrive before React re-renders with `saving`, so the guard is a ref.
  const inFlight = useRef(false);
  const [showConditions, setShowConditions] = useState(false);
  const [confirmClearSymptoms, setConfirmClearSymptoms] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);

  const chooseSafety = (response: 'NO_SYMPTOMS' | 'SYMPTOMS'): void => {
    if (response === 'NO_SYMPTOMS' && hasSafetyConcerns(draft.safety)) {
      setConfirmClearSymptoms(true);
      return;
    }
    update(response === 'NO_SYMPTOMS'
      ? {safetyResponse: response, safety: healthySafety()}
      : {safetyResponse: response});
    setSafetyError(null);
  };

  const update = useCallback((patch: Partial<ResultDraft>) => {
    setDraft((previous) => {
      const next = {...previous, ...patch};
      saveResultDraft(storage, workout.id, next);
      return next;
    });
    setEngineError(null);
  }, [storage, workout.id]);

  const send = (result: WorkoutResult): void => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    const outcome = submit(result);
    if (!outcome.ok) {
      inFlight.current = false;
      setSaving(false);
      setEngineError(outcome.error ?? {code: 'UNKNOWN'});
    }
    // On success the shell navigates away and this screen unmounts.
  };

  const handleSubmit = (): void => {
    if (inFlight.current) return;
    if (!draft.safetyResponse || draft.safetyResponse === 'UNANSWERED') {
      setSafetyError(copy.resultSafety.required);
      return;
    }
    if (draft.safetyResponse === 'NO_SYMPTOMS' && hasSafetyConcerns(draft.safety)) {
      setSafetyError(copy.resultSafety.required);
      return;
    }
    if (draft.safetyResponse === 'SYMPTOMS' && !hasSafetyConcerns(draft.safety) && !draft.unexpectedFatigue) {
      setSafetyError(copy.resultSafety.specify);
      return;
    }
    setSafetyError(null);
    const built = buildWorkoutResult(workout, draft);
    if (!built.ok) {
      setProblems(built.problems);
      return;
    }
    setProblems([]);
    // B1: incomplete repeats never block submission, they only warn about accuracy.
    if (repeatsAffectEvaluation(workout) && (draftHasNoRepeats(draft) || draftHasPartialRepeats(draft))) {
      setPending(built.result);
      setWarnOpen(true);
      return;
    }
    send(built.result);
  };

  const errorFor = (field: ResultProblem['field']): string | undefined => {
    const problem = problems.find((item) => item.field === field);
    if (!problem) return undefined;
    if (field === 'repeats') {
      const kind = problem.kind === 'NOT_A_NUMBER' || problem.kind === 'NEGATIVE' || problem.kind === 'CONFLICT' ? 'FORMAT' : problem.kind;
      return copy.timeErrors[kind];
    }
    return copy.errors[problem.kind];
  };

  const expanded = repeatsBlockExpandedFor(workout);
  const hasRows = draft.repeats.length > 0;
  const pace = workoutPaceRange(workout);

  return (
    <div className="screen">
      <header className="appbar">
        <button type="button" className="appbar__back" onClick={onCancel} aria-label="Назад">←</button>
        <div>
          <h1 className="appbar__title">{copy.title}</h1>
          <p className="appbar__subtitle">{`${workoutTitle(workout)} · ${formatDateLong(workout.scheduledDate)}`}</p>
        </div>
      </header>

      <p className="lede">{copy.subtitle}</p>

      {engineError ? (
        <Notice tone="danger" title={copyForError({code: engineError.code as never, params: engineError.params ?? {}, retry: false, fromEngine: true}).title}>
          <p>{copyForError({code: engineError.code as never, params: engineError.params ?? {}, retry: false, fromEngine: true}).text(engineError.params ?? {})}</p>
        </Notice>
      ) : null}

      <Card>
        <Field id="completion" label={copy.completion.label}>
          <Choice
            id="completion"
            value={draft.completion}
            onChange={(value: CompletionPreset) => update({completion: value, completionConfirmed: true})}
            options={COMPLETION_PRESETS.map((preset) => ({value: preset, label: copy.completion.options[preset]}))}
          />
        </Field>
        {!draft.completionConfirmed ? <p className="hint">Выберите, сколько выполнили на самом деле. Значение по умолчанию ещё не подтверждено.</p> : null}
        {draft.completion === 'EXACT' ? (
          <Field id="completionPercent" label={copy.completion.exactLabel} hint={copy.completion.exactHint} error={errorFor('completionPercent')}>
            <TextInput id="completionPercent" value={draft.completionPercent} onChange={(value) => update({completionPercent: value})} inputMode="numeric" />
          </Field>
        ) : null}
      </Card>

      <Card>
        <Field id="sessionRpe" label={copy.rpe.label} hint={copy.rpe.hint}>
          <p className="hint">{copy.rpe.planned(workoutRpe(workout).replace('План: ', ''))}</p>
          <div className="scale" role="group" aria-labelledby="sessionRpe-label">
            {Array.from({length: 11}, (_, value) => (
              <button
                key={value}
                type="button"
                className={`scale__option${value === draft.sessionRpe ? ' scale__option--active' : ''}`}
                aria-pressed={value === draft.sessionRpe}
                aria-label={scaleLabels[value] ?? `${copy.rpe.label}: ${value}`}
                onClick={() => update({sessionRpe: value, effortConfirmed: true})}
              >
                {value}
              </button>
            ))}
          </div>
        </Field>
        {!draft.effortConfirmed ? <p className="hint">Отметьте реальную тяжесть тренировки. Плановая оценка ещё не подтверждена.</p> : null}
      </Card>

      <Card title={copy.repeats.label}>
        {expanded ? (
          <>
            {hasRows && workout.main.repeats > 0 ? (
              <p className="hint">{copy.repeats.planned(workoutIntervalsText(workout), workout.main.repeats)}</p>
            ) : null}
            {pace === null ? null : <p className="hint">{`Темп по плану: ${pace}`}</p>}
            {!hasRows ? <p className="hint">{copy.repeats.empty}</p> : null}
            {draft.repeats.map((repeat, index) => (
              <div className="repeat" key={`repeat-${index}`}>
                <p className="field__label">{copy.repeats.item(index)}</p>
                <Field id={`repeat-seconds-${index}`} label={copy.repeats.seconds}>
                  <TextInput
                    id={`repeat-seconds-${index}`}
                    value={repeat.seconds}
                    onChange={(value) => update({repeats: draft.repeats.map((item, position) => (position === index ? {...item, seconds: value} : item))})}
                    inputMode="numeric"
                    placeholder="2:00"
                  />
                </Field>
                <Field id={`repeat-meters-${index}`} label={copy.repeats.meters}>
                  <TextInput
                    id={`repeat-meters-${index}`}
                    value={repeat.distanceMeters}
                    onChange={(value) => update({repeats: draft.repeats.map((item, position) => (position === index ? {...item, distanceMeters: value} : item))})}
                    inputMode="numeric"
                  />
                </Field>
              </div>
            ))}
            {errorFor('repeats') ? <p className="field__error" role="alert">{errorFor('repeats')}</p> : null}
            <p className="hint">{copy.repeats.hint}</p>
          </>
        ) : (
          <>
            <p className="hint">{copy.repeats.hint}</p>
            {hasRows ? null : (
              <Button
                variant="secondary"
                onClick={() => update({repeats: [{seconds: '', distanceMeters: ''}]})}
              >
                {copy.repeats.collapsed}
              </Button>
            )}
            {hasRows ? draft.repeats.map((repeat, index) => (
              <div className="repeat" key={`repeat-${index}`}>
                <p className="field__label">{copy.repeats.item(index)}</p>
                <Field id={`repeat-seconds-${index}`} label={copy.repeats.seconds}>
                  <TextInput
                    id={`repeat-seconds-${index}`}
                    value={repeat.seconds}
                    onChange={(value) => update({repeats: draft.repeats.map((item, position) => (position === index ? {...item, seconds: value} : item))})}
                    inputMode="numeric"
                  />
                </Field>
                <Field id={`repeat-meters-${index}`} label={copy.repeats.meters}>
                  <TextInput
                    id={`repeat-meters-${index}`}
                    value={repeat.distanceMeters}
                    onChange={(value) => update({repeats: draft.repeats.map((item, position) => (position === index ? {...item, distanceMeters: value} : item))})}
                    inputMode="numeric"
                  />
                </Field>
              </div>
            )) : null}
          </>
        )}
        {workout.main.mode === 'INTERVALS' ? (
          <Field id="restSeconds" label={copy.rest.label} error={errorFor('restSeconds')}>
            {workout.protocol?.recovery?.dose.unit === 'METERS' ? <p className="hint">По плану: {workoutRest(workout)}. Здесь можно указать фактическое время восстановления в секундах.</p> : null}
            <TextInput id="restSeconds" value={draft.restSeconds} onChange={(value) => update({restSeconds: value})} inputMode="numeric" />
          </Field>
        ) : null}
      </Card>

      <Card>
        {workout.main.calibration === true ? <p className="hint">{copy.calibrationHint}</p> : null}
        <Field id="durationMinutes" label={copy.duration.label} hint={copy.duration.hint} error={errorFor('durationMinutes')}>
          <TextInput id="durationMinutes" value={draft.durationMinutes} onChange={(value) => update({durationMinutes: value})} inputMode="numeric" />
        </Field>
        <Field id="distanceMeters" label={copy.distance.label} hint={copy.distance.hint} error={errorFor('distanceMeters')}>
          <TextInput id="distanceMeters" value={draft.distanceMeters} onChange={(value) => update({distanceMeters: value})} inputMode="numeric" />
        </Field>
      </Card>

      <Card title={copy.conditions.label}>
        {showConditions ? (
          <>
            <Field id="conditions-heat" label={copy.conditions.heat}>
              <Toggle id="conditions-heat" value={draft.conditions.heat} onChange={(next) => update({conditions: {...draft.conditions, heat: next}})} yes="Да" no="Нет" />
            </Field>
            <Field id="conditions-wind" label={copy.conditions.wind}>
              <Toggle id="conditions-wind" value={draft.conditions.wind} onChange={(next) => update({conditions: {...draft.conditions, wind: next}})} yes="Да" no="Нет" />
            </Field>
            <Field id="conditions-surface" label={copy.conditions.surface}>
              <TextInput id="conditions-surface" value={draft.conditions.surface} onChange={(value) => update({conditions: {...draft.conditions, surface: value}})} />
            </Field>
            <Field id="conditions-notes" label={copy.conditions.notes}>
              <TextInput id="conditions-notes" value={draft.conditions.notes} onChange={(value) => update({conditions: {...draft.conditions, notes: value}})} />
            </Field>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setShowConditions(true)}>{copy.conditions.toggle}</Button>
        )}
      </Card>

      <Card>
        <Field id="unexpectedFatigue" label={copy.fatigue.label} hint={copy.fatigue.hint}>
          <Toggle id="unexpectedFatigue" value={draft.unexpectedFatigue} onChange={(next) => update({unexpectedFatigue: next})} yes="Да" no="Нет" />
        </Field>
      </Card>

      <Card title={copy.resultSafety.title}>
        <Field id="resultSafetyChoice" label={copy.resultSafety.question} hint={copy.resultSafety.explanation}>
          <Choice<SafetyResponse>
            id="resultSafetyChoice"
            value={draft.safetyResponse ?? 'UNANSWERED'}
            onChange={(response) => {
              if (response !== 'UNANSWERED') chooseSafety(response);
            }}
            options={[
              {value: 'NO_SYMPTOMS', label: copy.resultSafety.no},
              {value: 'SYMPTOMS', label: copy.resultSafety.yes},
            ]}
          />
        </Field>
        {draft.safetyResponse === 'SYMPTOMS' || hasSafetyConcerns(draft.safety) ? (
          <>
            <p className="hint">{copy.resultSafety.details}</p>
            <SafetyFields
              idPrefix="result-safety" safety={draft.safety}
              onChange={(next) => {update({safety: next, safetyResponse: 'SYMPTOMS'}); setSafetyError(null);}}
            />
          </>
        ) : null}
        {safetyError ? <p className="field__error" role="alert">{safetyError}</p> : null}
      </Card>

      <div className="actions">
        <Button onClick={handleSubmit} disabled={saving}>{saving ? copy.saving : copy.submit}</Button>
        <Button variant="ghost" onClick={onCancel}>{copy.cancel}</Button>
      </div>

      {confirmClearSymptoms ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label={copy.resultSafety.confirmTitle}>
          <Notice tone="warn" title={copy.resultSafety.confirmTitle}>
            <p>{copy.resultSafety.confirmText}</p>
            <div className="actions">
              <Button onClick={() => {
                update({safety: healthySafety(), safetyResponse: 'NO_SYMPTOMS'});
                setSafetyError(null);
                setConfirmClearSymptoms(false);
              }}>{copy.resultSafety.confirmYes}</Button>
              <Button variant="ghost" onClick={() => setConfirmClearSymptoms(false)}>{copy.resultSafety.confirmCancel}</Button>
            </div>
          </Notice>
        </div>
      ) : null}

      {warnOpen && pending !== null ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label={copy.warning.title}>
          <Notice tone="warn" title={copy.warning.title}>
            <p>{copy.warning.text}</p>
            <div className="actions">
              <Button
                autoFocus
                onClick={() => {
                  setWarnOpen(false);
                  setPending(null);
                  setDraft((previous) => {
                    const next = {...previous, repeats: previous.repeats.length > 0 ? previous.repeats : [{seconds: '', distanceMeters: ''}]};
                    saveResultDraft(storage, workout.id, next);
                    return next;
                  });
                }}
              >
                {copy.warning.fill}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const result = pending;
                  setWarnOpen(false);
                  setPending(null);
                  if (result !== null) send(result);
                }}
              >
                {copy.warning.send}
              </Button>
            </div>
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
