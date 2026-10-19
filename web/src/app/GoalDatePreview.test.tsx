import {useState} from 'react';
import {describe, expect, test} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {Questionnaire} from '../ui/screens/Questionnaire.tsx';
import {defaultDraft} from '../application/questionnaire.ts';
import type {QuestionnaireDraft, QuestionnaireStep} from '../application/questionnaire.ts';
import {addDays, deviceToday} from '../application/format.ts';

function Harness({step}: {step: QuestionnaireStep}) {
  const [draft, setDraft] = useState<QuestionnaireDraft>(() => ({
    ...defaultDraft(deviceToday()), resultTime: '15:30', regularRunningWeeks: '20',
    actualRunsPerWeek: '4', averageWeeklyKm4Weeks: '26', longestUsualRunKm: '9',
    qualityRecall: 'EXACT', qualitySessions8Weeks: '6', qualityWeeks8Weeks: '4',
    targetTime: '14:30',
  }));
  const store = {
    draft,
    update: (patch: Partial<QuestionnaireDraft>) => setDraft(previous => ({...previous, ...patch})),
    reset: () => undefined,
  };
  return <Questionnaire step={step} store={store} onNavigate={() => undefined}/>;
}
describe('goal feasibility requires a selected race date', () => {
  test('GOAL does not claim eight weeks or feasibility before the date step', () => {
    render(<Harness step="GOAL"/>);
    expect(screen.getByDisplayValue('14:30')).toBeInTheDocument();
    expect(screen.queryByText('Предварительная оценка цели')).not.toBeInTheDocument();
    expect(screen.queryByText(/за 8 нед/)).not.toBeInTheDocument();
  });
  test('RACE_DATE calculates only after selection and updates immediately', () => {
    render(<Harness step="RACE_DATE"/>);
    expect(screen.getByText(/Предложена дата через 8 недель/)).toBeInTheDocument();
    expect(screen.queryByText('Предварительная оценка цели')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Дата итогового забега'), {target: {value: addDays(deviceToday(), 84)}});
    expect(screen.getByText('Предварительная оценка цели')).toBeInTheDocument();
    expect(screen.getByText(/за 12 нед/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Дата итогового забега'), {target: {value: addDays(deviceToday(), 28)}});
    expect(screen.getByText(/за 4 нед/)).toBeInTheDocument();
  });
});
