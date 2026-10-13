/**
 * Russian texts for every public engine error code, ported from docs/ui-copy.md §10.
 *
 * The map is exhaustive on purpose: a new code in the engine catalog fails the build until the text
 * exists. Text may depend on `details`, for example `NUMBER_OUT_OF_RANGE`. The English `message`
 * from the engine is never rendered.
 */
import type {EngineErrorCode} from '../../application/engineGateway.ts';
import {isEngineErrorCode} from '../../application/errorContract.ts';
import type {UiError} from '../../application/errorContract.ts';
import type {AppErrorCode} from '../../application/appError.ts';

export interface ErrorCopy {
  readonly title: string;
  readonly text: (params: UiError['params']) => string;
  readonly cta: string;
  /** Whether the action can safely be attempted again (mirrors the application contract). */
  readonly retry: boolean;
  /** Whether technical details belong in the hidden diagnostics block only. */
  readonly showTechnicalDetails: boolean;
}

const fixed = (text: string, extra: Omit<ErrorCopy, 'text'>): ErrorCopy => ({...extra, text: () => text});

const rangeText = ({min, max}: UiError['params']): string => {
  if (min === undefined) return 'Введите значение в допустимом диапазоне.';
  if (max === undefined || !Number.isFinite(max)) return `Введите значение не меньше ${min}.`;
  return `Введите значение от ${min} до ${max}.`;
};

export const errorCopy = {
  INVALID_DATE_FORMAT: fixed('Дата должна быть в формате ГГГГ-ММ-ДД.', {title: 'Проверьте дату', cta: 'Изменить дату', retry: true, showTechnicalDetails: false}),
  INVALID_CALENDAR_DATE: fixed('Проверьте число и месяц.', {title: 'Такой даты не существует', cta: 'Изменить дату', retry: true, showTechnicalDetails: false}),
  NUMBER_OUT_OF_RANGE: {title: 'Значение вне допустимого диапазона', text: rangeText, cta: 'Исправить', retry: true, showTechnicalDetails: false},
  INVALID_SAFETY_FLAG: fixed('Обновите экран и ответьте на вопросы ещё раз.', {title: 'Не удалось прочитать ответ о состоянии', cta: 'Повторить', retry: true, showTechnicalDetails: false}),
  INVALID_PROFILE_FLAG: fixed('Проверьте ответы об опыте и подготовке.', {title: 'Не удалось прочитать один из ответов', cta: 'Проверить данные', retry: true, showTechnicalDetails: false}),
  INVALID_QUALITY_WEEKS: fixed('Число недель с быстрыми тренировками не может быть больше их общего количества.', {title: 'Проверьте ответы о быстрых тренировках', cta: 'Исправить', retry: true, showTechnicalDetails: false}),
  INVALID_MISMATCH: fixed('Обновите экран и попробуйте снова.', {title: 'Не удалось прочитать оценку расхождения', cta: 'Обновить', retry: true, showTechnicalDetails: false}),
  INVALID_PERFORMANCE_SOURCE: fixed('Укажите, откуда результат: контрольный забег или официальный старт.', {title: 'Не удалось определить тип результата', cta: 'Выбрать тип', retry: true, showTechnicalDetails: false}),
  INVALID_BREAK_REASON: fixed('Выберите один из предложенных вариантов.', {title: 'Укажите причину перерыва', cta: 'Выбрать причину', retry: true, showTechnicalDetails: false}),
  INVALID_BREAK: fixed('Перерыв указывается целым числом дней и не может заканчиваться в будущем.', {title: 'Проверьте данные о перерыве', cta: 'Исправить', retry: true, showTechnicalDetails: false}),
  FUTURE_PERFORMANCE: fixed('Укажите дату, которая уже наступила.', {title: 'Дата результата в будущем', cta: 'Изменить дату', retry: true, showTechnicalDetails: false}),
  AVAILABILITY_NOT_INTEGER: fixed('Доступное количество тренировок в неделю — целое число от 1 до 7.', {title: 'Укажите целое число тренировок', cta: 'Исправить', retry: true, showTechnicalDetails: false}),
  INVALID_YELLOW_REASON: fixed('Выберите причину из списка.', {title: 'Не удалось прочитать причину', cta: 'Выбрать причину', retry: true, showTechnicalDetails: false}),
  INVALID_FATIGUE_FLAG: fixed('Ответьте, была ли усталость необычно сильной.', {title: 'Не удалось прочитать ответ об усталости', cta: 'Ответить', retry: true, showTechnicalDetails: false}),
  INVALID_FEEDBACK_CONFIRMATION: fixed('Выберите фактическое выполнение и тяжесть тренировки.', {title: 'Подтвердите результат тренировки', cta: 'Заполнить ответы', retry: true, showTechnicalDetails: false}),
  INVALID_PROGRESSION_STATE: fixed('Сохранённый план содержит неверные данные о нагрузке. Данные не удалены. Обновите приложение или обратитесь за помощью.', {title: 'Не удалось загрузить сведения о нагрузке', cta: 'Обновить приложение', retry: false, showTechnicalDetails: true}),
  RESULT_DISTANCE_CONFLICT: fixed('Общая дистанция не может быть меньше суммы записанных отрезков. Проверьте значения.', {title: 'Дистанция не совпадает с отрезками', cta: 'Исправить', retry: true, showTechnicalDetails: false}),
  EVENT_DATE_PASSED: fixed('Обычный план этого цикла завершён: тренировки не назначаются после дня забега. Внесите результат забега, чтобы закрыть цикл.', {title: 'Дата старта уже прошла', cta: 'Внести результат', retry: false, showTechnicalDetails: false}),
  CLOCK_BACKWARDS: fixed('Нельзя вернуться к более ранней дате. Проверьте дату на устройстве.', {title: 'Дата раньше сохранённой', cta: 'Обновить', retry: true, showTechnicalDetails: false}),
  UNSUPPORTED_STATE_VERSION: fixed('Сохранённый цикл создан другой версией приложения. Обновите приложение; данные не удалены.', {title: 'Данные несовместимы с текущей версией', cta: 'Обновить приложение', retry: false, showTechnicalDetails: true}),
  WORKOUT_BLOCKED_BY_PHASE_OR_SAFETY: fixed('Такой тип работы недоступен на текущем этапе или при текущем состоянии.', {title: 'Эта тренировка сейчас не назначается', cta: 'Понятно', retry: false, showTechnicalDetails: false}),
  UNKNOWN_WORKOUT: fixed('Возможно, план уже обновлён. Откройте раздел «План» заново.', {title: 'Тренировка не найдена', cta: 'Обновить план', retry: true, showTechnicalDetails: false}),
  UNKNOWN_OR_COMPLETED_WORKOUT: fixed('Обновите план и проверьте актуальную тренировку.', {title: 'Результат уже внесён или тренировка изменилась', cta: 'Обновить план', retry: false, showTechnicalDetails: false}),
  RESULT_PRECEDES_STATE: fixed('Внести результат можно за тренировку текущего или более позднего дня плана.', {title: 'Результат за более ранний день', cta: 'Обновить план', retry: false, showTechnicalDetails: false}),
  RECOVERY_OR_QUALITY_LIMIT: fixed('Отчёт относится к тренировке, которая нарушает восстановление или недельный лимит быстрых работ.', {title: 'Слишком близко к предыдущей тренировке', cta: 'Обновить план', retry: false, showTechnicalDetails: false}),
  PROTECTED_FIELD: fixed('Изменение доступно только через отдельное действие приложения.', {title: 'Эти данные нельзя изменить здесь', cta: 'Понятно', retry: false, showTechnicalDetails: false}),
  CHECKPOINT_NOT_PERMITTED: fixed('Результат контрольного забега можно внести, когда нет ограничений: завершены облегчённые тренировки после перерыва и состояние позволяет нагрузку.', {title: 'Контрольный забег сейчас недоступен', cta: 'Понятно', retry: false, showTechnicalDetails: false}),
  INVALID_CHECKPOINT_DATE: fixed('Дата не может быть в будущем или раньше предыдущего результата.', {title: 'Проверьте дату контрольного забега', cta: 'Изменить дату', retry: true, showTechnicalDetails: false}),
  FINAL_RESULT_NOT_ON_EVENT_DATE: fixed('Результат итогового забега вносится только за дату старта.', {title: 'Дата должна совпадать с днём забега', cta: 'Изменить дату', retry: true, showTechnicalDetails: false}),
  FINAL_RESULT_BEFORE_EVENT: fixed('Результат итогового забега можно внести не раньше дня старта.', {title: 'Забег ещё не состоялся', cta: 'Внести позже', retry: false, showTechnicalDetails: false}),
  MOVE_OUTSIDE_HORIZON: fixed('Новая дата должна быть в пределах ближайших дней плана и не позже дня забега.', {title: 'Перенести можно только внутри плана', cta: 'Выбрать другую дату', retry: true, showTechnicalDetails: false}),
  MOVE_OCCUPIED_DATE: fixed('Выберите свободный день.', {title: 'На эту дату уже есть тренировка', cta: 'Выбрать другую дату', retry: true, showTechnicalDetails: false}),
  MOVE_RECOVERY_VIOLATION: fixed('Между быстрыми тренировками нужен интервал не меньше двух дней.', {title: 'Слишком близко к другой тренировке', cta: 'Выбрать другую дату', retry: true, showTechnicalDetails: false}),
  MOVE_WEEKLY_LOAD_LIMIT: fixed('Перенос превысит разрешённую нагрузку за семь дней с учётом быстрых тренировок, разминки и заминки. Выберите другую дату.', {title: 'Слишком большая нагрузка за неделю', cta: 'Выбрать другую дату', retry: true, showTechnicalDetails: false}),
  MOVE_QUALITY_LIMIT_VIOLATION: fixed('Перенос нарушит недельный лимит. Выберите дату в другой неделе.', {title: 'В этой неделе уже достаточно быстрых тренировок', cta: 'Выбрать другую дату', retry: true, showTechnicalDetails: false}),
} satisfies Record<EngineErrorCode, ErrorCopy>;

/**
 * Texts for the application's own error codes. They are not engine codes and never appear in
 * `errorCopy`, which stays exhaustive over the engine's catalogue.
 */
export const appErrorCopy = {
  CYCLE_COMPLETED: fixed('Итоговый результат уже сохранён. Откройте итог цикла.', {title: 'Подготовка завершена', cta: 'Открыть итог', retry: false, showTechnicalDetails: false}),
  ACTIVE_CYCLE_EXISTS: fixed('Сначала завершите и сохраните текущий цикл в архив. Предыдущий цикл не изменён.', {title: 'На устройстве уже есть цикл', cta: 'К текущему циклу', retry: false, showTechnicalDetails: false}),
  INVALID_PARAMETERS: fixed('Введите время в формате ММ:СС и выберите существующую дату.', {title: 'Проверьте цель и дату', cta: 'Исправить', retry: true, showTechnicalDetails: false}),
  ARCHIVE_UNAVAILABLE: fixed('Не удалось сохранить или прочитать архив. Итоговый результат остаётся в текущем цикле. Повторите архивацию.', {title: 'Архив недоступен', cta: 'Повторить архивацию', retry: true, showTechnicalDetails: true}),
  UNSUPPORTED_ARCHIVE_VERSION: fixed('Архив создан другой версией приложения. Данные не удалены и не изменены.', {title: 'Несовместимая версия архива', cta: 'Обновить приложение', retry: false, showTechnicalDetails: true}),
  ARCHIVE_DAMAGED: fixed('Не удалось прочитать архив. Данные не удалены и не изменены.', {title: 'Не удалось открыть архив', cta: 'Повторить', retry: false, showTechnicalDetails: true}),
  ARCHIVE_CONFLICT: fixed('Для этого цикла обнаружены несовпадающие данные. Сохранённый архив не перезаписан; текущий цикл не удалён.', {title: 'Конфликт данных цикла', cta: 'Понятно', retry: false, showTechnicalDetails: true}),
  CYCLE_NOT_COMPLETED: fixed('Сначала сохраните итоговый результат.', {title: 'Цикл ещё не завершён', cta: 'К текущему циклу', retry: false, showTechnicalDetails: false}),
  ACTIVE_CLEAR_FAILED: fixed('Архив сохранён, но текущий цикл не удалось очистить. Повторите архивацию: дубликат создан не будет.', {title: 'Архивация не завершена', cta: 'Повторить архивацию', retry: true, showTechnicalDetails: true}),
  PAST_DUE_WORKOUT_CANNOT_MOVE: fixed('Просроченную тренировку нельзя перенести: её нужно закрыть результатом или отметить, что она не выполнена.', {title: 'Эту тренировку нельзя перенести', cta: 'Понятно', retry: false, showTechnicalDetails: false}),
  WORKOUT_RESULT_BEFORE_SCHEDULED_DATE: fixed('Результат можно внести в день тренировки или позже.', {title: 'Тренировка ещё не состоялась', cta: 'Понятно', retry: false, showTechnicalDetails: false}),
  PENDING_RESULT_OUT_OF_ORDER: fixed('Сначала закройте более раннюю тренировку: результаты вносятся по порядку, от самой давней к самой свежей.', {title: 'Есть более ранняя незакрытая тренировка', cta: 'Понятно', retry: false, showTechnicalDetails: false}),
  PENDING_RESULT_BLOCKED: fixed('Пока результат за прошлую дату не внесён, план не пересчитывается: иначе эта тренировка была бы списана как пропущенная. Сначала закройте её.', {title: 'Сначала закройте прошлую тренировку', cta: 'Понятно', retry: false, showTechnicalDetails: false}),
  CONTINUOUS_3K_UNCONFIRMED: fixed('Подтвердите оба факта: вы действительно пробежали все 3000 м без ходьбы и остановок, а во время и после бега не было необычных симптомов.', {title: 'Не все ответы подтверждены', cta: 'Проверить ответы', retry: true, showTechnicalDetails: false}),
  CONTINUOUS_3K_NOT_ALLOWED: fixed('Переход сейчас недоступен: уже отмечена способность бегать 3 км, есть незавершённый цикл, перерыв, ограничения по самочувствию или необходимость восстановления.', {title: 'Сначала завершите восстановление', cta: 'Открыть план', retry: false, showTechnicalDetails: false}),
  CONTINUOUS_3K_BAD_DATE: fixed('Дата должна относиться к текущему циклу подготовки, уже наступить и быть раньше даты сдачи норматива.', {title: 'Проверьте дату пробежки', cta: 'Изменить дату', retry: true, showTechnicalDetails: false}),
  SAFETY_REVIEW_NOT_CONFIRMED: fixed('Если медицинская оценка требовалась, она должна быть пройдена. Подтвердите актуальность ответов о состоянии.', {title: 'Проверьте состояние', cta: 'Вернуться к ответам', retry: true, showTechnicalDetails: false}),
  STORAGE_UNAVAILABLE: fixed('Не удалось прочитать или записать данные на устройстве. Ничего не удаляйте вручную: проверьте доступ к хранилищу и попробуйте ещё раз.', {title: 'Хранилище недоступно', cta: 'Повторить', retry: true, showTechnicalDetails: true}),
  RESET_STALE_CYCLE: fixed('Этот план изменился после открытия профиля, возможно, в другой вкладке. Обновите страницу и проверьте текущие данные перед повторным сбросом.', {title: 'План изменился', cta: 'Обновить страницу', retry: false, showTechnicalDetails: true}),
  RESET_NOT_CONFIRMED: fixed('Не удалось подтвердить удаление активного плана. Обновите страницу и проверьте, сохранён ли план. Архив завершённых циклов не затронут.', {title: 'Сброс не подтверждён', cta: 'Обновить страницу', retry: false, showTechnicalDetails: true}),
} satisfies Record<AppErrorCode, ErrorCopy>;

/** Safe fallback: an unknown failure never breaks the interface and never shows raw details. */
export const UNKNOWN_ERROR_COPY: ErrorCopy = fixed('Попробуйте ещё раз. Если не получится, перезапустите приложение.', {title: 'Что-то пошло не так', cta: 'Повторить', retry: true, showTechnicalDetails: true});

export function copyForError(error: UiError): ErrorCopy {
  if (isEngineErrorCode(error.code)) return errorCopy[error.code];
  if (error.code === 'UNKNOWN') return UNKNOWN_ERROR_COPY;
  return appErrorCopy[error.code];
}
