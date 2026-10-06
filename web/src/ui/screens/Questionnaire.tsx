import {useState} from 'react';
import type {ReactNode} from 'react';
import {QUESTIONNAIRE_STEPS, STEP_INDEX} from '../../application/questionnaire.ts';
import type {BreakEntryDraft, FieldKey, QuestionnaireDraft, QuestionnaireStep} from '../../application/questionnaire.ts';
import {breakReasonText, mismatchText, performanceSourceText} from '../copy/values.ts';
import {common, questionnaire} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {Card, Progress} from '../components/Layout.tsx';
import {Checkbox, Choice, Field, Scale, TextInput, Toggle} from '../components/Field.tsx';
import {problemsForStep} from '../validation.ts';
import type {DraftStore} from '../../app/useDraft.ts';
import type {Route} from '../../app/routes.ts';
import type {UiError} from '../../application/errorContract.ts';
import {copyForError} from '../copy/errors.ts';
import {Notice} from '../components/Layout.tsx';

interface Props {
  readonly step: QuestionnaireStep;
  readonly store: DraftStore;
  readonly onNavigate: (route: Route) => void;
  /** Engine rejection that belongs to this step, already translated by the application layer. */
  readonly engineError?: UiError | null;
  readonly onDismissEngineError?: () => void;
}

const TOTAL = QUESTIONNAIRE_STEPS.length;

export function Questionnaire({step, store, onNavigate, engineError = null, onDismissEngineError}: Props): ReactNode {
  const {draft, update} = store;
  // Field errors appear after the first attempt, not while the user is still filling the step in.
  const [attempted, setAttempted] = useState(false);
  const problems = attempted ? problemsForStep(draft, step) : {};
  const index = STEP_INDEX[step];
  const meta = questionnaire.steps[step];

  const goBack = (): void => {
    const previous = QUESTIONNAIRE_STEPS[QUESTIONNAIRE_STEPS.indexOf(step) - 1];
    onNavigate(previous ? {name: 'QUESTIONNAIRE', step: previous} : {name: 'FIRST_RUN'});
  };

  const goNext = (): void => {
    setAttempted(true);
    if (Object.keys(problemsForStep(draft, step)).length > 0) return;
    onDismissEngineError?.();
    const next = QUESTIONNAIRE_STEPS[QUESTIONNAIRE_STEPS.indexOf(step) + 1];
    onNavigate(next ? {name: 'QUESTIONNAIRE', step: next} : {name: 'REVIEW'});
  };

  const error = (field: FieldKey): string | undefined => problems[field];

  return (
    <div className="screen">
      <header className="appbar">
        <button type="button" className="appbar__back" onClick={goBack} aria-label={common.back}>←</button>
        <div>
          <p className="appbar__step">{questionnaire.progress(index, TOTAL)}</p>
          <h1 className="appbar__title">{meta.title}</h1>
        </div>
      </header>
      <Progress value={index} max={TOTAL} />

      <p className="lede">{meta.description}</p>

      {engineError === null ? null : (
        <Notice tone="danger" title={copyForError(engineError).title}>
          <p>{copyForError(engineError).text(engineError.params)}</p>
        </Notice>
      )}

      <Card>
        {step === 'RESULT' ? <ResultStep draft={draft} update={update} error={error} /> : null}
        {step === 'VOLUME' ? <VolumeStep draft={draft} update={update} error={error} /> : null}
        {step === 'QUALITY' ? <QualityStep draft={draft} update={update} error={error} /> : null}
        {step === 'SAFETY' ? <SafetyStep draft={draft} update={update} error={error} /> : null}
        {step === 'BREAKS' ? <BreaksStep draft={draft} update={update} error={error} /> : null}
        {step === 'AVAILABILITY' ? <AvailabilityStep draft={draft} update={update} error={error} /> : null}
        {step === 'GOAL' ? <GoalStep draft={draft} update={update} error={error} /> : null}
        {step === 'RACE_DATE' ? <RaceDateStep draft={draft} update={update} error={error} /> : null}
      </Card>

      <div className="actions">
        {/* Returning to the previous step is the app-bar control: one action, one accessible name. */}
        <Button onClick={goNext}>{common.next}</Button>
      </div>
    </div>
  );
}

interface StepProps {
  readonly draft: QuestionnaireDraft;
  readonly update: (patch: Partial<QuestionnaireDraft>) => void;
  readonly error: (field: FieldKey) => string | undefined;
}

function ResultStep({draft, update, error}: StepProps): ReactNode {
  return (
    <>
      <Field id="hasResult" label={questionnaire.hasResultQuestion}>
        <Toggle id="hasResult" value={draft.hasResult} onChange={(next) => update({hasResult: next})} yes={questionnaire.hasResultYes} no={questionnaire.hasResultNo} />
      </Field>
      {draft.hasResult ? (
        <>
          <Field id="resultTime" label={questionnaire.fields.resultTime.label} hint={questionnaire.fields.resultTime.hint} error={error('resultTime')}>
            <TextInput id="resultTime" value={draft.resultTime} onChange={(value) => update({resultTime: value})} inputMode="numeric" placeholder="14:30" />
          </Field>
          <Field id="resultDate" label={questionnaire.fields.resultDate.label} error={error('resultDate')}>
            <TextInput id="resultDate" type="date" value={draft.resultDate} onChange={(value) => update({resultDate: value})} />
          </Field>
          <Field id="resultSource" label={questionnaire.fields.resultSource.label} error={error('resultSource')}>
            <Choice
              id="resultSource"
              value={draft.resultSource}
              onChange={(value) => update({resultSource: value})}
              options={[
                {value: 'TEST_3K', label: performanceSourceText.TEST_3K},
                {value: 'OFFICIAL_3K', label: performanceSourceText.OFFICIAL_3K},
              ]}
            />
          </Field>
        </>
      ) : (
        <p className="hint">{questionnaire.steps.RESULT.description}</p>
      )}
    </>
  );
}

function VolumeStep({draft, update, error}: StepProps): ReactNode {
  return (
    <>
      <Field id="canRun3Km" label={questionnaire.fields.canRun3Km.label} error={error('canRun3Km')}>
        <Toggle id="canRun3Km" value={draft.canRun3Km} onChange={(next) => update({canRun3Km: next})} yes={questionnaire.yes} no={questionnaire.no} />
      </Field>
      <Field id="regularRunningWeeks" label={questionnaire.fields.regularRunningWeeks.label} error={error('regularRunningWeeks')}>
        <TextInput id="regularRunningWeeks" value={draft.regularRunningWeeks} onChange={(value) => update({regularRunningWeeks: value})} inputMode="numeric" />
      </Field>
      <Field id="actualRunsPerWeek" label={questionnaire.fields.actualRunsPerWeek.label} error={error('actualRunsPerWeek')}>
        <TextInput id="actualRunsPerWeek" value={draft.actualRunsPerWeek} onChange={(value) => update({actualRunsPerWeek: value})} inputMode="numeric" />
      </Field>
      <Field id="averageWeeklyKm4Weeks" label={questionnaire.fields.averageWeeklyKm4Weeks.label} error={error('averageWeeklyKm4Weeks')}>
        <TextInput id="averageWeeklyKm4Weeks" value={draft.averageWeeklyKm4Weeks} onChange={(value) => update({averageWeeklyKm4Weeks: value})} inputMode="decimal" />
      </Field>
      <Field id="longestUsualRunKm" label={questionnaire.fields.longestUsualRunKm.label} error={error('longestUsualRunKm')}>
        <TextInput id="longestUsualRunKm" value={draft.longestUsualRunKm} onChange={(value) => update({longestUsualRunKm: value})} inputMode="decimal" />
      </Field>
    </>
  );
}

function QualityStep({draft, update, error}: StepProps): ReactNode {
  return (
    <>
      <Field id="qualitySessions8Weeks" label={questionnaire.fields.qualitySessions8Weeks.label} error={error('qualitySessions8Weeks')}>
        <TextInput id="qualitySessions8Weeks" value={draft.qualitySessions8Weeks} onChange={(value) => update({qualitySessions8Weeks: value})} inputMode="numeric" />
      </Field>
      <Field id="qualityWeeks8Weeks" label={questionnaire.fields.qualityWeeks8Weeks.label} error={error('qualityWeeks8Weeks')}>
        <TextInput id="qualityWeeks8Weeks" value={draft.qualityWeeks8Weeks} onChange={(value) => update({qualityWeeks8Weeks: value})} inputMode="numeric" />
      </Field>
      <Field id="qualityMostlyTolerated" label={questionnaire.fields.qualityMostlyTolerated.label}>
        <Toggle id="qualityMostlyTolerated" value={draft.qualityMostlyTolerated} onChange={(next) => update({qualityMostlyTolerated: next})} yes={questionnaire.yes} no={questionnaire.no} />
      </Field>
      <Field id="experience" label={questionnaire.fields.experience.label}>
        <Checkbox id="experience-threshold" checked={draft.experience.threshold} onChange={(next) => update({experience: {...draft.experience, threshold: next}})} label={questionnaire.fields.experienceThreshold.label} />
        <Checkbox id="experience-vo2" checked={draft.experience.vo2} onChange={(next) => update({experience: {...draft.experience, vo2: next}})} label={questionnaire.fields.experienceVo2.label} />
        <Checkbox id="experience-specific" checked={draft.experience.specific3k} onChange={(next) => update({experience: {...draft.experience, specific3k: next}})} label={questionnaire.fields.experienceSpecific.label} />
      </Field>
    </>
  );
}

function SafetyStep({draft, update, error}: StepProps): ReactNode {
  const setSafety = (patch: Partial<QuestionnaireDraft['safety']>): void => update({safety: {...draft.safety, ...patch}});
  const flags: readonly {key: keyof QuestionnaireDraft['safety']; label: string}[] = [
    {key: 'painIncreasing', label: questionnaire.safety.painIncreasing},
    {key: 'alteredMovement', label: questionnaire.safety.alteredMovement},
    {key: 'painWalkingOrRest', label: questionnaire.safety.painWalkingOrRest},
    {key: 'swelling', label: questionnaire.safety.swelling},
    {key: 'acuteIllness', label: questionnaire.safety.acuteIllness},
    {key: 'otherStop', label: questionnaire.safety.otherStop},
    {key: 'needsAssessment', label: questionnaire.safety.needsAssessment},
  ];
  return (
    <>
      <Field id="pain" label={questionnaire.safety.pain} hint={questionnaire.safety.painHint} error={error('safety')}>
        <Scale id="pain" value={draft.safety.pain} onChange={(next) => setSafety({pain: next})} min={0} max={10} labelFor={(value) => `${questionnaire.safety.pain}: ${value}`} />
      </Field>
      {flags.map((flag) => (
        <Field key={flag.key} id={flag.key} label={flag.label}>
          <Toggle id={flag.key} value={Boolean(draft.safety[flag.key])} onChange={(next) => setSafety({[flag.key]: next})} yes={questionnaire.yes} no={questionnaire.no} />
        </Field>
      ))}
      <p className="hint">{questionnaire.safety.footnote}</p>
    </>
  );
}

function BreaksStep({draft, update, error}: StepProps): ReactNode {
  const setBreaks = (breaks: readonly BreakEntryDraft[]): void => update({breaks});
  return (
    <>
      <Field id="hasBreaks" label={questionnaire.breaksQuestion}>
        <Toggle id="hasBreaks" value={draft.hasBreaks} onChange={(next) => update({hasBreaks: next, breaks: next && draft.breaks.length === 0 ? [{reason: 'WORK', days: '7', endDate: draft.resultDate}] : draft.breaks})} yes={questionnaire.yes} no={questionnaire.noBreaks} />
      </Field>
      {draft.hasBreaks ? draft.breaks.map((entry, position) => (
        <div className="repeat" key={`break-${position}`}>
          <Field id={`break-reason-${position}`} label={questionnaire.break.reason} error={error('breaks')}>
            <Choice
              id={`break-reason-${position}`}
              value={entry.reason}
              onChange={(value) => setBreaks(draft.breaks.map((item, itemIndex) => (itemIndex === position ? {...item, reason: value} : item)))}
              options={[
                {value: 'WORK', label: breakReasonText.WORK},
                {value: 'OTHER_HEALTHY', label: breakReasonText.OTHER_HEALTHY},
                {value: 'ILLNESS', label: breakReasonText.ILLNESS},
                {value: 'INJURY', label: breakReasonText.INJURY},
              ]}
            />
          </Field>
          <Field id={`break-days-${position}`} label={questionnaire.break.days}>
            <TextInput id={`break-days-${position}`} value={entry.days} onChange={(value) => setBreaks(draft.breaks.map((item, itemIndex) => (itemIndex === position ? {...item, days: value} : item)))} inputMode="numeric" />
          </Field>
          <Field id={`break-end-${position}`} label={questionnaire.break.endDate}>
            <TextInput id={`break-end-${position}`} type="date" value={entry.endDate} onChange={(value) => setBreaks(draft.breaks.map((item, itemIndex) => (itemIndex === position ? {...item, endDate: value} : item)))} />
          </Field>
          <Button variant="ghost" onClick={() => setBreaks(draft.breaks.filter((_, itemIndex) => itemIndex !== position))}>{questionnaire.removeBreak}</Button>
        </div>
      )) : null}
      {draft.hasBreaks ? (
        <Button variant="secondary" onClick={() => setBreaks([...draft.breaks, {reason: 'WORK', days: '7', endDate: draft.resultDate}])}>{questionnaire.addBreak}</Button>
      ) : null}
    </>
  );
}

function AvailabilityStep({draft, update, error}: StepProps): ReactNode {
  return (
    <>
      <Field id="availableRunsPerWeek" label={questionnaire.fields.availableRunsPerWeek.label} error={error('availableRunsPerWeek')}>
        <TextInput id="availableRunsPerWeek" value={draft.availableRunsPerWeek} onChange={(value) => update({availableRunsPerWeek: value})} inputMode="numeric" />
      </Field>
      <Field id="performanceMismatch" label={questionnaire.fields.performanceMismatch.label} error={error('performanceMismatch')}>
        <Choice
          id="performanceMismatch"
          value={draft.performanceMismatch}
          onChange={(value) => update({performanceMismatch: value})}
          options={[
            {value: 'NONE', label: mismatchText.NONE},
            {value: 'MODERATE', label: mismatchText.MODERATE},
            {value: 'CLEAR', label: mismatchText.CLEAR},
          ]}
        />
      </Field>
    </>
  );
}

function GoalStep({draft, update, error}: StepProps): ReactNode {
  return (
    <Field id="targetTime" label={questionnaire.fields.targetTime.label} hint={questionnaire.fields.targetTime.hint} error={error('targetTime')}>
      <TextInput id="targetTime" value={draft.targetTime} onChange={(value) => update({targetTime: value})} inputMode="numeric" placeholder="14:00" />
    </Field>
  );
}

function RaceDateStep({draft, update, error}: StepProps): ReactNode {
  return (
    <Field id="raceDate" label={questionnaire.fields.raceDate.label} error={error('raceDate')}>
      <TextInput id="raceDate" type="date" value={draft.raceDate} onChange={(value) => update({raceDate: value})} />
    </Field>
  );
}
