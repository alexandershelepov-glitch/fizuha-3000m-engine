import {afterEach, describe, expect, test} from 'vitest';
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {appCycle} from '../../../tests/helpers-app.ts';
import {ResultForm} from '../ui/screens/ResultForm.tsx';
import {loadResultDraft} from '../application/draft.ts';
import {RESULT_DRAFT_KEY} from '../application/storage.ts';
import type {WorkoutResult} from '../application/engineGateway.ts';

afterEach(() => cleanup());

describe('post-workout safety quick answer', () => {
  test('starts unanswered, hides irrelevant pain questionnaire, requires explicit response', async () => {
    const fixture = appCycle();
    const workout = fixture.engineState.queue[0]!;
    let submitted: WorkoutResult | null = null;
    const user = userEvent.setup();
    render(<ResultForm workout={workout} storage={fixture.storage} submit={(result) => {
      submitted = result;
      return {ok: true};
    }} onCancel={() => undefined} />);

    expect(screen.getByText('Во время или после тренировки появились боль, отёк или другие необычные симптомы?')).toBeInTheDocument();
    expect(screen.queryByText('Насколько сильна боль')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Сохранить результат'}));
    expect(screen.getByRole('alert')).toHaveTextContent('Ответьте на вопрос о самочувствии');
    expect(submitted).toBeNull();

    await user.click(screen.getByRole('radio', {name: 'Нет, всё нормально'}));
    expect(screen.queryByText('Насколько сильна боль')).not.toBeInTheDocument();
    expect(loadResultDraft(fixture.storage, workout.id)?.safetyResponse).toBe('NO_SYMPTOMS');
    await user.click(screen.getByRole('button', {name: 'Сохранить результат'}));
    expect(submitted).not.toBeNull();
    expect(submitted!.safety.pain).toBe(0);
    expect(submitted!.safety.swelling).toBe(false);
  });

  test('a symptomatic draft survives reload; a healthy answer cannot silently erase complaints', async () => {
    const fixture = appCycle();
    const workout = fixture.engineState.queue[0]!;
    const user = userEvent.setup();
    const props = {workout, storage: fixture.storage, submit: () => ({ok: true}), onCancel: () => undefined};
    const view = render(<ResultForm {...props} />);
    await user.click(screen.getByRole('radio', {name: 'Да, появились'}));
    const group = screen.getByRole('group', {name: 'Из-за боли меняется техника движения'});
    await user.click(within(group).getByRole('button', {name: 'Да'}));
    expect(loadResultDraft(fixture.storage, workout.id)?.safety.alteredMovement).toBe(true);

    await user.click(screen.getByRole('radio', {name: 'Нет, всё нормально'}));
    expect(screen.getByRole('dialog', {name: 'Удалить ранее указанные жалобы?'})).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Оставить указанные жалобы'}));
    expect(loadResultDraft(fixture.storage, workout.id)?.safety.alteredMovement).toBe(true);

    view.unmount();
    render(<ResultForm {...props} />);
    expect(screen.getByText('Из-за боли меняется техника движения')).toBeInTheDocument();
    expect(within(screen.getByRole('group', {name: 'Из-за боли меняется техника движения'})).getByRole('button', {name: 'Да'})).toHaveAttribute('aria-pressed','true');

    await user.click(screen.getByRole('radio', {name: 'Нет, всё нормально'}));
    await user.click(screen.getByRole('button', {name: 'Да, жалоб нет'}));
    expect(loadResultDraft(fixture.storage, workout.id)?.safety.alteredMovement).toBe(false);
    expect(loadResultDraft(fixture.storage, workout.id)?.safetyResponse).toBe('NO_SYMPTOMS');
    expect(screen.queryByText('Насколько сильна боль')).not.toBeInTheDocument();
  });

  test('older symptomatic drafts do not gain an implicit healthy confirmation', async () => {
    const fixture = appCycle();
    const workout = fixture.engineState.queue[0]!;
    const old = {
      completion: 'FULL', completionPercent: '', sessionRpe: 3,
      durationMinutes: '10', distanceMeters: '0', repeats: [], restSeconds: '0',
      conditions: {heat:false, wind:false, surface:'', notes:''},
      unexpectedFatigue: false,
      safety: {pain: 2, painIncreasing:false, alteredMovement:false, painWalkingOrRest:false, swelling:false, acuteIllness:false, otherStop:false, needsAssessment:false},
    };
    fixture.storage.setItem(RESULT_DRAFT_KEY, JSON.stringify({workoutId: workout.id, draft: old}));
    const user = userEvent.setup();
    let sent = false;
    render(<ResultForm workout={workout} storage={fixture.storage} submit={() => {sent = true; return {ok:true};}} onCancel={() => undefined} />);

    expect(screen.getByText('Насколько сильна боль')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Сохранить результат'}));
    expect(sent).toBe(false);
    expect(screen.getByRole('alert')).toHaveTextContent('Ответьте на вопрос о самочувствии');
    expect(loadResultDraft(fixture.storage, workout.id)?.safety.pain).toBe(2);
  });
});
