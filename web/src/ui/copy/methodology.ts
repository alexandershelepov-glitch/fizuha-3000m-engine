/**
 * Text that explains which methodology a cycle uses and why the approved eight-week one does not
 * apply. Every reason comes from the engine (`v4Status`); this module only names it in plain words.
 */
import type {V4Blocker} from '../../application/engineGateway.ts';

export const methodologyCopy = {
  title: 'Методика цикла',
  activeTitle: 'Методика №4 · 8 недель · 24 занятия',
  pausedTitle: 'Методика №4 · защитная логика',
  legacyTitle: 'Общий план: методика №4 не применена',
  activeNote: 'Восемь недель, 24 занятия, темпы по исходному результату 14:30. Норматив — в последнюю неделю цикла.',
  pausedNote: 'Цикл был создан по методике №4, но сейчас действует защитная логика приложения. История и результаты не изменяются.',
  legacyNote: 'Действует общий план приложения. Методика №4 применяется только к новому циклу, когда выполнены все её условия.',
  windowRule: 'Дата норматива для методики №4 — через 53–55 дней после начала: это последняя неделя восьминедельного цикла.',
  fixDate: 'Поставить норматив в конце 8-й недели',
  consequence: 'Действующий цикл не пересчитывается и не теряет историю. Методику №4 можно применить только к новому циклу: для этого в «Профиле» сбросьте текущий план и пройдите анкету заново. Завершённые подготовки остаются в архиве.',
  futureCycleNote: 'Даты и профиль проверены до создания цикла: приложение не назначает методику №4 вне её условий и не подменяет её молча.',
  blockers: {
    RESULT_REQUIRED: 'нет подтверждённого результата на 3000 м',
    RESULT_FUTURE: 'дата результата позже даты начала подготовки',
    RESULT_STALE: 'результат старше 21 дня к началу подготовки',
    RESULT_TIME: 'методика утверждена для текущего результата 14:30',
    RESULT_MISMATCH: 'результат расходится с текущим самочувствием',
    CANNOT_RUN_3KM: 'не подтверждены непрерывные 3 км',
    QUALITY_NOT_TOLERATED: 'быстрые тренировки переносились плохо',
    BASE_WEEKS: 'меньше 8 недель регулярного бега',
    BASE_VOLUME: 'меньше 15 км в неделю',
    BASE_LONG_RUN: 'привычная длительная тренировка короче 6 км',
    AVAILABILITY: 'нужны три привычные и доступные тренировки в неделю',
    BREAK: 'был перерыв после измерения результата',
    CYCLE_LENGTH: 'неподходящая продолжительность подготовки',
    SAFETY: 'есть ограничения по состоянию здоровья',
    INVALID_DATES: 'даты цикла некорректны',
  } satisfies Record<V4Blocker, string>,
} as const;

/** A comma-free sentence fragment list for a notice: "причины: a, b и c". */
export function reasonsSentence(reasons: readonly string[]): string {
  if (reasons.length === 0) return '';
  if (reasons.length === 1) return reasons[0]!;
  return `${reasons.slice(0, -1).join(', ')} и ${reasons[reasons.length - 1]!}`;
}
