import type {ReactNode} from 'react';
import type {ActionAvailability} from '../../application/invariants.ts';
import {common, move as copy} from '../copy/text.ts';
import {Button} from '../components/Button.tsx';
import {EmptyState} from '../components/Layout.tsx';

/**
 * A move the application refuses: an overdue session must be resolved, not postponed, and while an
 * older session is unresolved nothing may be rescheduled. The screen never decides this itself.
 */
export function MoveNotAllowed({reason, onBack}: {reason: ActionAvailability; onBack: () => void}): ReactNode {
  const content = reason === 'PAST_DUE_CANNOT_MOVE' ? copy.notAllowed.overdue : copy.notAllowed.outOfOrder;
  return (
    <div className="screen">
      <EmptyState title={content.title} text={content.text}>
        <Button onClick={onBack}>{common.back}</Button>
      </EmptyState>
    </div>
  );
}
