import type {ReactNode} from 'react';
import {formatDateLong} from '../../application/format.ts';

/**
 * Clearly labelled, non-production clock control for end-to-end manual testing.
 * Advance does NOT award completion, mark a missed run GREEN, or bypass warnings.
 */
export function TestClockPanel({
  today, onAdvance,
}: {
  readonly today: string;
  readonly onAdvance: (days: number) => void;
}): ReactNode {
  return (
    <section className="test-clock" role="region" aria-label="Тестовый календарь" data-testid="test-clock">
      <div className="test-clock__headline">
        <strong>ТЕСТОВАЯ ВЕРСИЯ</strong>
        <span>Виртуальная дата: <time dateTime={today} data-testid="test-date">{formatDateLong(today)}</time></span>
      </div>
      <div className="test-clock__actions">
        <button type="button" onClick={() => onAdvance(1)}>+1 день</button>
        <button type="button" onClick={() => onAdvance(7)}>+7 дней</button>
      </div>
      <p>Переход не засчитывает тренировку. Если есть пропуск — внесите результат либо отметьте «Не выполнено».</p>
    </section>
  );
}
