import type {ReactNode} from 'react';
import {resultForm} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {EmptyState} from '../components/Layout.tsx';

/**
 * Opening an old link to a workout that was already closed must not show an empty form.
 * The state comes from the engine history, not from a guess.
 */
export function ClosedWorkout({onOpenPlan, onBackToToday}: {onOpenPlan: () => void; onBackToToday: () => void}): ReactNode {
  return (
    <div className="screen">
      <EmptyState title={resultForm.closed.title} text={resultForm.closed.text}>
        <Button onClick={onOpenPlan}>{resultForm.closed.cta}</Button>
        <Button variant="ghost" onClick={onBackToToday}>{'Сегодня'}</Button>
      </EmptyState>
    </div>
  );
}
