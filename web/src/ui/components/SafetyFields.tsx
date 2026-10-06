import type {ReactNode} from 'react';
import type {SafetyData} from '../../application/engineGateway.ts';
import {questionnaire} from '../copy/text.ts';
import {Field, Scale, Toggle} from './Field.tsx';

/**
 * The safety block, shared by the questionnaire and the result form so the wording exists once.
 * The application only collects facts — the engine decides what they mean.
 */
export function SafetyFields({idPrefix, safety, onChange, error}: {idPrefix: string; safety: SafetyData; onChange: (next: SafetyData) => void; error?: string}): ReactNode {
  const set = (patch: Partial<SafetyData>): void => onChange({...safety, ...patch});
  const flags: readonly {key: keyof SafetyData; label: string}[] = [
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
      <Field id={`${idPrefix}-pain`} label={questionnaire.safety.pain} hint={questionnaire.safety.painHint} error={error}>
        <Scale
          id={`${idPrefix}-pain`}
          value={safety.pain}
          onChange={(next) => set({pain: next})}
          min={0}
          max={10}
          labelFor={(value) => `${questionnaire.safety.pain}: ${value}`}
        />
      </Field>
      {flags.map((flag) => (
        <Field key={flag.key} id={`${idPrefix}-${flag.key}`} label={flag.label}>
          <Toggle
            id={`${idPrefix}-${flag.key}`}
            value={Boolean(safety[flag.key])}
            onChange={(next) => set({[flag.key]: next})}
            yes={questionnaire.yes}
            no={questionnaire.no}
          />
        </Field>
      ))}
      <p className="hint">{questionnaire.safety.footnote}</p>
    </>
  );
}
