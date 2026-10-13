/**
 * Russian user-facing values, ported from docs/ui-copy.md.
 *
 * Every map is `satisfies Record<EngineCatalogValue, ...>`, so adding a value to the engine catalog
 * makes the build fail until the text exists. Technical codes are never rendered: the UI reads these
 * maps by value.
 */
import type {
  Anchor, BreakReason, Capacity, Confidence, DoseUnit, EffortCue, Evaluation, Feasibility, Gate,
  FeedbackField, PerformanceMismatch, PerformanceSource, Phase, QualityExperience, ReasonCode, SafetyStatus,
  WorkoutGoal, WorkoutMainMode, WorkoutType, YellowReason,
} from './types.ts';

type Text = {readonly label: string; readonly description: string};
/** Values that the main UI must never show as codes, but that appear on detail screens. */
type DetailText = {readonly label: string; readonly description: string};

export const phaseText = {
  FOUNDATION: {label: 'База', description: 'Спокойный бег, постепенное увеличение объёма и подготовка к первой быстрой работе.'},
  DEVELOPMENT: {label: 'Развитие', description: 'Основной этап: быстрые тренировки и постепенный рост объёма от подтверждённой формы.'},
  SPECIFIC: {label: 'Специальная подготовка к 3000 м', description: 'Работа отрезками в темпе, близком к соревновательному, в пределах допуска по текущей форме.'},
  RE_ENTRY: {label: 'Возвращение после перерыва', description: 'Облегчённый объём и одна быстрая работа, чтобы вернуться к обычному плану.'},
  HOLD_DIAGNOSTIC: {label: 'Пауза в нагрузке', description: 'Обычные тренировки приостановлены до проверки состояния.'},
  TAPER: {label: 'Снижение нагрузки перед забегом', description: 'Объём уменьшен, чтобы подойти к старту отдохнувшим.'},
} satisfies Record<Phase, Text>;

/** Extended explanation for the "Почему сейчас такой этап?" screen (ui-copy §4.1). */
export const phaseWhy = {
  FOUNDATION: 'Мы начинаем с базы. Сначала нужно подтвердить, что регулярный бег и спокойные тренировки переносятся стабильно, поэтому объём растёт небольшими шагами, а быстрые тренировки вводятся постепенно. На этом этапе важна регулярность, а не скорость.',
  DEVELOPMENT: 'Текущая форма подтверждена, и нагрузка строится от неё. Добавляются быстрые работы, объём растёт после успешно выполненных тренировок. Это самый длинный этап подготовки.',
  SPECIFIC: 'Основная работа — отрезки в темпе, близком к соревновательному. Целевой темп не заменяет текущую форму: он добавляется постепенно и только в той мере, на которую есть подтверждённое основание.',
  RE_ENTRY: 'После паузы нагрузка снижена. Первые тренировки идут с уменьшённым объёмом, затем следует одна облегчённая быстрая работа. Обычный план возвращается после успешного подтверждения.',
  HOLD_DIAGNOSTIC: 'Приложение не назначает обычную нагрузку, пока не будет подтверждено, что продолжать можно. Это защитное правило, а не оценка вашей подготовки.',
  TAPER: 'Основная работа уже выполнена. Сейчас задача — подойти к старту отдохнувшим, поэтому объём снижен. Короткие быстрые отрезки могут сохраняться. Пропущенные тренировки не переносятся.',
} satisfies Record<Phase, string>;

export const feasibilityText = {
  PLAUSIBLE: {label: 'Цель выглядит реалистичной', description: 'При текущем уровне и оставшемся сроке цель соответствует темпу подготовки. Это оценка реалистичности, а не гарантия результата.'},
  AMBITIOUS: {label: 'Цель потребует серьёзной работы', description: 'Результат заметно выше текущей формы. Он достижим при регулярных тренировках, но потребует времени и стабильности.'},
  LOW_PROBABILITY: {label: 'При текущем сроке цель сложна', description: 'Разрыв между текущей формой и целью большой, а времени немного. Подготовка будет строиться осторожно и от текущего уровня.'},
  LONG_TERM: {label: 'Цель рассчитана на длительную работу', description: 'За один текущий цикл такой результат обычно не достигается. Ближайший этап — база и постепенный рост; цель остаётся ориентиром на более длинный срок.'},
} satisfies Record<Feasibility, Text>;

export const gateText = {
  CLOSED: {label: 'Работаем от текущей формы', description: 'Нагрузка строится от подтверждённого текущего результата. Целевой темп в тренировках пока не используется.'},
  PARTIAL: {label: 'Целевой темп вводится постепенно', description: 'Специальные тренировки идут в темпе между текущим и целевым. Доля целевого темпа растёт по мере подтверждений.'},
  OPEN: {label: 'Целевой темп доступен', description: 'Есть подтверждённая готовность работать в целевом темпе, поэтому специальные тренировки идут в нём.'},
} satisfies Record<Gate, Text>;

/** The principle the UI must keep visible whenever the gate is explained. */
export const GATE_PRINCIPLE = 'Целевой результат показывает, к чему мы идём. Нагрузку при этом определяет подтверждённая текущая форма: так тренировки остаются посильными. Когда появится достаточное основание, тренировки начнут идти в целевом темпе.';

export const confidenceText = {
  HIGH: {label: 'Результат свежий', description: 'Последний результат на 3000 м недавний, план опирается на него уверенно.'},
  MEDIUM: {label: 'Результат подтверждён не полностью', description: 'Результат есть, но ему уже несколько недель или был перерыв. План учитывает это.'},
  LOW: {label: 'Результат давно не подтверждался', description: 'Нужен новый контрольный забег, чтобы план опирался на актуальные данные.'},
  UNKNOWN: {label: 'Результата пока нет', description: 'Первый этап — база и подготовка к первому контрольному забегу на 3000 м.'},
} satisfies Record<Confidence, Text>;

export const capacityText = {
  T0: {label: 'Начальный уровень нагрузки', description: 'Подготовка начинается с минимального объёма и спокойного темпа.'},
  T1: {label: 'Умеренная нагрузка', description: 'Сначала нужно подтвердить способность стабильно выполнять базовые тренировки.'},
  T2: {label: 'Устойчивая подготовка', description: 'Регулярные тренировки уже переносятся; объём можно увеличивать постепенно.'},
  T3: {label: 'Высокая подготовка', description: 'Большой регулярный объём; допустимы более длинные быстрые работы.'},
} satisfies Record<Capacity, DetailText>;

export const qualityText = {
  Q0: {label: 'Опыта быстрых тренировок пока нет', description: 'Начнём с коротких вводных быстрых работ.'},
  Q1: {label: 'Есть опыт быстрых тренировок', description: 'Можно добавлять темповые и интервальные работы.'},
  Q2: {label: 'Регулярный опыт быстрых тренировок', description: 'Доступны более длинные быстрые работы.'},
} satisfies Record<QualityExperience, DetailText>;

export const workoutTypeText = {
  EASY: {label: 'Спокойный бег', description: 'Аэробная база и восстановление: бег в разговорном темпе.'},
  LONG_EASY: {label: 'Длинный спокойный бег', description: 'Выносливость: более длительная спокойная работа.'},
  STRIDES: {label: 'Короткие ускорения', description: 'Техника и лёгкость бега: короткие быстрые отрезки без утомления.'},
  INTRO_QUALITY: {label: 'Вводная быстрая работа', description: 'Первое знакомство с быстрым бегом: небольшие отрезки.'},
  THRESHOLD: {label: 'Темповая работа', description: 'Удержание умеренно быстрого темпа в заданном диапазоне.'},
  VO2: {label: 'Интервальная работа', description: 'Короткие быстрые отрезки с восстановлением между ними.'},
  SPECIFIC_3K: {label: 'Специальная работа на 3000 м', description: 'Отрезки в темпе, который определён по текущей форме и допуску к целевому темпу.'},
  CONTROL: {label: 'Контрольный забег', description: 'Проверка текущей формы: 3000 м на результат.'},
  REST: {label: 'Отдых', description: 'Восстановление: тренировка не назначается.'},
} satisfies Record<WorkoutType, Text>;

export const workoutGoalText = {
  AEROBIC_BASE: 'Аэробная база',
  QUALITY_ADAPTATION: 'Быстрая работа',
  ASSESS_CURRENT_PERFORMANCE: 'Оценка текущей формы',
  RECOVERY: 'Восстановление',
} satisfies Record<WorkoutGoal, string>;

export const mainModeText = {
  CONTINUOUS: 'Непрерывно',
  INTERVALS: 'Отрезками',
  RUN_WALK: 'Бег с переходами на шаг',
  REST: 'Без работы',
} satisfies Record<WorkoutMainMode, string>;

export const effortCueText = {
  FULL_SENTENCES: 'Можно говорить полными фразами',
  CONTROLLED_BREATHING: 'Дыхание контролируемое',
} satisfies Record<EffortCue, string>;

/** Shown only behind "Почему такой темп?". */
export const anchorText = {
  CURRENT: 'От текущей формы',
  EFFECTIVE: 'Между текущим и целевым темпом',
  EFFORT: 'По усилию',
  NONE: 'Без ориентира по темпу',
} satisfies Record<Anchor, string>;

export const doseUnitText = {
  MINUTES: 'мин',
  METERS: 'м',
} satisfies Record<DoseUnit, string>;

export const performanceSourceText = {
  TEST_3K: 'Контрольный забег',
  OFFICIAL_3K: 'Официальный старт',
} satisfies Record<PerformanceSource, string>;

export const breakReasonText = {
  WORK: 'Работа или дела',
  OTHER_HEALTHY: 'Другие причины, здоровье в порядке',
  ILLNESS: 'Болезнь',
  INJURY: 'Травма',
} satisfies Record<BreakReason, string>;

/**
 * Technical naming of the mismatch levels, shown only where the engine's own vocabulary is explained.
 * The questionnaire asks the question in plain words instead (see `questionnaire.mismatchOptions`).
 */
export const mismatchText = {
  NONE: 'Результат соответствует текущей форме',
  MODERATE: 'Небольшое расхождение с результатом',
  CLEAR: 'Текущая форма отличается от результата',
} satisfies Record<PerformanceMismatch, string>;

export const safetyStatusText = {
  OK: 'Ограничений нет',
  HOLD: 'Нагрузка приостановлена до проверки',
  STOP: 'Обычная нагрузка остановлена',
} satisfies Record<SafetyStatus, string>;

export const reasonText = {
  GOAL_GAP_TOO_LARGE: {label: 'Цель дальше текущей формы', description: 'Разница между текущим результатом и целью большая. Нагрузка строится от подтверждённой текущей формы, а не от целевого темпа.'},
  TARGET_GATE_CLOSED: {label: 'Целевой темп пока не используется', description: 'Пока нет подтверждённой готовности работать в целевом темпе. Тренировки идут от текущего результата; целевой темп появится позже.'},
  LOW_QUALITY_EXPERIENCE: {label: 'Мало опыта быстрых тренировок', description: 'Начнём с коротких вводных быстрых работ и будем увеличивать нагрузку постепенно.'},
  REENTRY_AFTER_BREAK: {label: 'Возвращение после перерыва', description: 'После паузы нагрузка снижена: первые тренировки идут в облегчённом объёме.'},
  SECOND_QUALITY_NOT_ALLOWED: {label: 'Одна быстрая тренировка в неделю', description: 'В неделе планируется одна быстрая работа — этого достаточно для текущего уровня и восстановления.'},
  TWO_RELATED_YELLOW: {label: 'Две похожие тяжёлые тренировки подряд', description: 'Две быстрые тренировки подряд прошли тяжелее плана. Объём возвращается к последней подтверждённой, пока не появится успешное подтверждение.'},
  CHECKPOINT_AFTER_GREEN_PLUS: {label: 'Пора уточнить текущую форму', description: 'Две тренировки подряд прошли легче ожидаемого. Чтобы план оставался точным, нужен контрольный забег на 3000 м.'},
  SAFETY_STOP: {label: 'Обычная нагрузка остановлена', description: 'Отмечены признаки, при которых продолжать обычные тренировки нельзя. Нужна отдельная проверка состояния.'},
  SAFETY_HOLD: {label: 'Нагрузка приостановлена до проверки', description: 'Отмечены признаки, требующие уточнения. Обычные тренировки временно не назначаются.'},
  TAPER_STARTED: {label: 'Снижение нагрузки перед забегом', description: 'Основная работа выполнена. Объём уменьшен, чтобы подойти к старту отдохнувшим.'},
  PERFORMANCE_CONFIDENCE_LOW: {label: 'Нужен свежий результат', description: 'Последний результат на 3000 м давно не подтверждался. План опирается на осторожную оценку и просит свежие данные.'},
  FOUNDATION_NO_3K_RESULT: {label: 'Начнём с базы', description: 'Результата на 3000 м пока нет. Первый этап — спокойный бег и подготовка к первому контрольному забегу.'},
  CHECKPOINT_DUE: {label: 'Пора провести контрольный забег', description: 'Прошло около трёх недель с последней оценки. Контрольный забег уточнит текущую форму.'},
  CHECKPOINT_AFTER_REENTRY: {label: 'Контрольный забег после перерыва', description: 'Облегчённые тренировки после паузы пройдены. Дальше нужен контрольный забег, чтобы вернуться к обычному плану.'},
  CONTRADICTORY_PERFORMANCE: {label: 'Тренировки расходятся с результатом', description: 'Свежие тренировки заметно отличаются от последнего результата на 3000 м. Нужен новый контрольный забег.'},
  PROGRESSION_ALLOWED: {label: 'Объём этой работы увеличен', description: 'Две тренировки одного типа подряд выполнены успешно, поэтому объём немного увеличен.'},
  PROGRESSION_BLOCKED: {label: 'Увеличение нагрузки приостановлено', description: 'Сначала нужно подтвердить, что текущая нагрузка переносится устойчиво.'},
  HEALTH_REVIEW_REQUIRED: {label: 'Нужна проверка состояния', description: 'Обычная нагрузка приостановлена до отдельной оценки самочувствия. Ответьте на вопросы о состоянии, чтобы продолжить.'},
  FOUNDATION_LONG_TERM_CONFLICT: {label: 'Начнём с базы', description: 'Цель требует длительной работы, а текущая подготовка пока базовая. Первый цикл — спокойный бег и постепенное укрепление базы.'},
} satisfies Record<ReasonCode, Text>;

/** Reasons reported with a partial session; the result flow arrives in the next slice. */
export const yellowReasonText = {
  EXECUTION: {label: 'Задание выполнено частично', description: 'Часть работы не выполнена, либо темп заметно отличался от заданного.'},
  RECOVERY: {label: 'Не хватило восстановления', description: 'Усилие оказалось выше запланированного; чувствовалась накопленная усталость.'},
  ENVIRONMENT: {label: 'Помешали условия', description: 'Жара, ветер или покрытие заметно повлияли на выполнение задания.'},
  ILLNESS: {label: 'Недомогание', description: 'Вы отметили плохое самочувствие. Обычная нагрузка приостановлена до проверки состояния.'},
  PAIN: {label: 'Отмечена боль', description: 'Вы указали боль. Обычная нагрузка приостановлена до проверки состояния.'},
  PACE_PRESCRIPTION: {label: 'Заданный темп не подошёл', description: 'Темп задания не соответствовал текущей форме. Доза будет скорректирована.'},
  OTHER: {label: 'Другая причина', description: 'Причина не уточнена. План скорректирован по результату тренировки.'},
} satisfies Record<YellowReason, Text>;

/** Fields of the result form. Used by the next slice, mapped now so nothing has to be invented later. */
export const feedbackFieldText = {
  completionFraction: 'Насколько выполнено задание',
  sessionRpe: 'Насколько тяжело было',
  safety: 'Состояние',
  durationMinutes: 'Длительность, мин',
  distanceMeters: 'Дистанция, м',
  repeats: 'Результаты отрезков',
  restSeconds: 'Отдых между отрезками, сек',
  conditions: 'Условия',
  unexpectedFatigue: 'Необычная усталость',
} satisfies Record<FeedbackField, string>;

/** Evaluations are not rendered yet, but the mapping exists so the next slice cannot drift. */
export const evaluationText = {
  GREEN_PLUS: {label: 'Лучше ожидаемого', description: 'По вашему отчёту задание выполнено полностью и потребовало меньше усилий, чем ожидалось.'},
  GREEN: {label: 'Тренировка выполнена', description: 'По вашему отчёту задание выполнено в запланированном объёме и с ожидаемым усилием.'},
  YELLOW: {label: 'Нагрузка потребовала корректировки', description: 'По отчёту выполнение, темп или тяжесть отличались от ожидаемого. Программа учитывает это в дальнейших назначениях.'},
  RED: {label: 'Текущую нагрузку нужно снизить', description: 'Отмечены признаки, при которых продолжать обычную нагрузку нельзя. Дальнейшие тренировки приостановлены до отдельной проверки состояния.'},
} satisfies Record<Evaluation, Text>;

/** Sign of a state: colour is never the only carrier of meaning. */
export const evaluationSign = {
  GREEN_PLUS: '+',
  GREEN: '✓',
  YELLOW: '!',
  RED: '⏸',
} satisfies Record<Evaluation, string>;


/** Spoken names for the subjective load scale: the number alone is not enough on its own. */
export const scaleLabels: Readonly<Record<number, string>> = {
  0: 'нагрузки не было',
  2: 'очень легко',
  4: 'легко',
  5: 'умеренно',
  7: 'тяжело, но контролируемо',
  9: 'очень тяжело',
  10: 'предельно тяжело',
};
