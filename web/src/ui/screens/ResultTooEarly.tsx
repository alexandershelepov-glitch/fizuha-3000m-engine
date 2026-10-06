import type {ReactNode} from 'react';
import type {Workout} from '../../application/engineGateway.ts';
import {formatDateLong} from '../../application/format.ts';
import {resultForm} from '../copy/text.ts';
import {workoutTitle} from '../display.ts';
import {Button} from '../components/Button.tsx';
import {EmptyState, KeyValue} from '../components/Layout.tsx';

/**
 * A session in the future cannot carry a result: the form is not offered at all, so a direct link to
 * it cannot close anything either. The application layer refuses the same request independently.
 */
export function ResultTooEarly({workout, onBack}: {workout: Workout; onBack: () => void}): ReactNode {
  return (
    <div className="screen">
      <EmptyState title={resultForm.tooEarly.title} text={resultForm.tooEarly.text}>
        <KeyValue label={workoutTitle(workout)} value={formatDateLong(workout.scheduledDate)} />
        <Button onClick={onBack}>{resultForm.tooEarly.cta}</Button>
      </EmptyState>
    </div>
  );
}
