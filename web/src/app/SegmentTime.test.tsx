/**
 * Segment duration entry (iPhone defect): the athlete must be able to enter `1:56` without typing a
 * colon, while the stored draft, the validation and the engine contract stay unchanged.
 */
import {useState} from 'react';
import {afterEach, describe, expect, test} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Field} from '../ui/components/Field.tsx';
import {SegmentTimeInput, joinSegmentTime, splitSegmentTime} from '../ui/components/TimeFields.tsx';
import {parseTime} from '../application/format.ts';
import {buildWorkoutResult, defaultResultDraft} from '../application/resultForm.ts';
import type {ResultDraft} from '../application/resultForm.ts';
import {createEngineState} from '../application/engineGateway.ts';
import type {EngineState, Profile, Workout} from '../application/engineGateway.ts';
import {addDays, deviceToday} from '../application/format.ts';
import {healthySafety} from '../application/questionnaire.ts';

afterEach(cleanup);

function Harness({initial = ''}: {initial?: string}) {
  const [value, setValue] = useState(initial);
  return <>
    <Field id="time" label="Время" hint="Минуты и секунды">
      <SegmentTimeInput id="time" value={value} onChange={setValue} />
    </Field>
    <output data-testid="value">{value}</output>
  </>;
}

function v4State(today: string): EngineState {
  const profile: Profile = {
    performance: {timeSeconds: 870, date: today, source: 'TEST_3K'},
    targetTimeSeconds: 840,
    raceDate: addDays(today, 54),
    regularRunningWeeks: 20,
    actualRunsPerWeek: 3,
    availableRunsPerWeek: 3,
    averageWeeklyKm4Weeks: 16,
    longestUsualRunKm: 6,
    canRun3Km: true,
    qualitySessions8Weeks: 0,
    qualityWeeks8Weeks: 0,
    qualityMostlyTolerated: true,
    experience: {threshold: false, vo2: false, specific3k: false},
    breaks: [],
    safety: healthySafety(),
    performanceMismatch: 'NONE',
  };
  return createEngineState(profile, today, today);
}

describe('minutes and seconds are separate numeric fields', () => {
  test('typing 1 and 56 produces the 1:56 the draft and the engine already understand', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const minutes = screen.getByLabelText('Минуты');
    const seconds = screen.getByLabelText('Секунды');

    // The very point of the fix: no colon is required, both fields open a number pad.
    expect(minutes).toHaveAttribute('inputmode', 'numeric');
    expect(seconds).toHaveAttribute('inputmode', 'numeric');
    expect(seconds).toHaveAttribute('maxlength', '2');

    await user.type(minutes, '1');
    await user.type(seconds, '56');
    expect(screen.getByTestId('value')).toHaveTextContent('1:56');
    expect(parseTime('1:56')).toEqual({ok: true, seconds: 116});
  });

  test('an existing draft value is split back into the two fields without losing its shape', () => {
    render(<Harness initial="2:53" />);
    expect(screen.getByLabelText('Минуты')).toHaveValue('2');
    expect(screen.getByLabelText('Секунды')).toHaveValue('53');
    expect(screen.getByTestId('value')).toHaveTextContent('2:53');
    expect(parseTime('2:53')).toEqual({ok: true, seconds: 173});
  });

  test('seconds above 59 are rejected visibly instead of being sent to the engine', () => {
    render(<Harness initial="1:56" />);
    fireEvent.change(screen.getByLabelText('Секунды'), {target: {value: '75'}});
    expect(screen.getByRole('alert')).toHaveTextContent('Секунды — от 0 до 59.');
    expect(screen.getByTestId('value')).toHaveTextContent('1:75');
    expect(parseTime('1:75')).toEqual({ok: false, error: 'IMPOSSIBLE'});
  });

  test('the helpers never invent a value', () => {
    expect(splitSegmentTime('')).toEqual({minutes: '', seconds: ''});
    expect(splitSegmentTime('3:51')).toEqual({minutes: '3', seconds: '51'});
    expect(splitSegmentTime('116')).toEqual({minutes: '116', seconds: ''});
    expect(joinSegmentTime('', '')).toBe('');
    expect(joinSegmentTime('1', '5')).toBe('1:05');
    expect(joinSegmentTime('', '56')).toBe('0:56');
  });
});

describe('the engine receives seconds, not the displayed string', () => {
  function workoutWithRepeats(today: string): Workout {
    const state = v4State(today);
    const workout = state.queue.find((entry) => entry.type !== 'REST' && entry.speedRangeMps !== null);
    if (!workout) throw new Error('fixture: a paced workout must be issued');
    return workout;
  }

  test('3:51 and 400 м become 231 seconds of the prescribed repeat', () => {
    const today = deviceToday();
    const workout = workoutWithRepeats(today);
    const draft: ResultDraft = {
      ...defaultResultDraft(workout),
      repeats: [{seconds: '3:51', distanceMeters: '400'}],
      durationMinutes: '40',
      completionConfirmed: true,
      effortConfirmed: true,
      safetyResponse: 'NO_SYMPTOMS',
    };
    const built = buildWorkoutResult(workout, draft);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.result.repeats).toEqual([{distanceMeters: 400, seconds: 231}]);
  });

  test('a saved draft with the old shape still builds the same result', () => {
    const today = deviceToday();
    const workout = workoutWithRepeats(today);
    const draft: ResultDraft = {
      ...defaultResultDraft(workout),
      repeats: [{seconds: '1:56', distanceMeters: '200'}],
      durationMinutes: '40',
      completionConfirmed: true,
      effortConfirmed: true,
      safetyResponse: 'NO_SYMPTOMS',
    };
    const built = buildWorkoutResult(workout, draft);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.result.repeats).toEqual([{distanceMeters: 200, seconds: 116}]);
  });
});
