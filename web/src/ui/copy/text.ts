/**
 * Every user-facing string of the shell, ported from docs/ui-copy.md and docs/wireframes.md.
 * Components never inline Russian text: they read it from here.
 */

export const app = {
  name: 'Физуха',
  moduleLabel: '3000 м',
  tagline: 'Персональный план подготовки к сдаче норматива',
} as const;

export const nav = {
  today: 'Сегодня',
  plan: 'План',
  history: 'История',
  profile: 'Профиль',
} as const;

export const common = {
  back: 'Назад',
  next: 'Продолжить',
  cancel: 'Отмена',
  retry: 'Повторить',
  refresh: 'Обновить',
  understood: 'Понятно',
  save: 'Сохранить',
  why: 'Почему такой план?',
  more: 'Подробнее',
  loading: 'Загрузка…',
  changeData: 'Изменить данные',
} as const;

export const firstRun = {
  title: app.name,
  subtitle: app.tagline,
  intro: [
    'План строится от подтверждённого текущего результата на 3000 м, а не от желаемого.',
    'Учитываются ваша подготовка, доступное время и самочувствие.',
    'Результаты выполненных тренировок меняют дальнейший план.',
  ],
  primaryCta: 'Начать подготовку',
  secondaryCta: 'Как это работает',
  howItWorks: {
    title: 'Как это работает',
    paragraphs: [
      'Нагрузка определяется подтверждённой текущей формой. Цель задаёт направление, но тренировочный темп не выбирается вручную: приложение берёт его из вашего результата.',
      'После каждой тренировки вы отмечаете, как она прошла. По этим данным приложение меняет объём и состав следующих тренировок.',
      'Итоговый забег — отдельное событие. В этот день обычная тренировка не назначается, а после него цикл подготовки завершается.',
    ],
    cta: 'Понятно',
  },
} as const;

export const questionnaire = {
  title: 'Анкета',
  progress: (step: number, total: number): string => `Шаг ${step} из ${total}`,
  whyWeAsk: 'Что это значит?',
  hasResultQuestion: 'Есть ли у вас результат на 3000 м?',
  hasResultYes: 'Да, есть результат',
  hasResultNo: 'Нет результата',
  breaksQuestion: 'Были ли перерывы в тренировках за последние месяцы?',
  noBreaks: 'Перерывов не было',
  addBreak: 'Добавить перерыв',
  removeBreak: 'Удалить',
  steps: {
    RESULT: {
      title: 'Текущий результат',
      description: 'Результат используется как подтверждённая текущая форма — от него строится нагрузка.',
    },
    VOLUME: {
      title: 'Подготовка',
      description: 'Фактический объём важнее планов: он определяет, с чего начинать.',
    },
    QUALITY: {
      title: 'Опыт качественных тренировок',
      description: 'Сколько быстрой работы вы выполняли за последние восемь недель.',
    },
    SAFETY: {
      title: 'Состояние',
      description: 'Ответы влияют на то, какие тренировки можно назначать. Приложение не ставит диагнозов.',
    },
    BREAKS: {
      title: 'Перерывы',
      description: 'После перерыва нагрузка возвращается постепенно.',
    },
    AVAILABILITY: {
      title: 'Доступность',
      description: 'Сколько тренировок в неделю вы реально можете выполнять.',
    },
    GOAL: {
      title: 'Цель',
      description: 'Цель задаёт направление подготовки. Рабочую нагрузку определяет подтверждённая текущая форма, поэтому тренировочный темп не выбирается вручную.',
    },
    RACE_DATE: {
      title: 'Дата итогового забега',
      description: 'Итоговый забег — отдельное событие. В этот день обычная тренировка не назначается, и после этой даты новый план автоматически не начинается.',
    },
  },
  fields: {
    resultTime: {label: 'Ваш результат', hint: 'Формат ММ:СС, например 14:30'},
    resultDate: {label: 'Дата результата'},
    resultSource: {label: 'Откуда результат'},
    canRun3Km: {label: 'Способны ли вы непрерывно пробежать 3 км?'},
    regularRunningWeeks: {label: 'Сколько недель вы регулярно бегаете'},
    actualRunsPerWeek: {label: 'Сколько пробежек в неделю обычно'},
    averageWeeklyKm4Weeks: {label: 'Средний недельный объём, км'},
    longestUsualRunKm: {label: 'Самая длинная обычная пробежка, км'},
    qualitySessions8Weeks: {label: 'Качественных тренировок за 8 недель'},
    qualityWeeks8Weeks: {label: 'В скольких разных неделях'},
    qualityMostlyTolerated: {label: 'Переносились ли они нормально'},
    experience: {label: 'Какой опыт уже есть'},
    experienceThreshold: {label: 'Темповые тренировки'},
    experienceVo2: {label: 'Интервальные тренировки'},
    experienceSpecific: {label: 'Отрезки в соревновательном темпе'},
    availableRunsPerWeek: {label: 'Сколько тренировок в неделю вы можете выполнять'},
    performanceMismatch: {label: 'Насколько тренировки согласуются с последним результатом'},
    targetTime: {label: 'Желаемый результат на 3000 м', hint: 'Формат ММ:СС, например 14:00'},
    raceDate: {label: 'Дата итогового забега'},
  },
  safety: {
    pain: 'Насколько сильна боль',
    painHint: 'Шкала 0–10: 0 — боли нет',
    painIncreasing: 'Боль усиливается',
    alteredMovement: 'Из-за боли меняется техника движения',
    painWalkingOrRest: 'Боль ощущается при обычной ходьбе или в покое',
    swelling: 'Есть выраженная отёчность',
    acuteIllness: 'Есть признаки острого заболевания (температура, сильное недомогание)',
    otherStop: 'Есть другие причины остановить тренировки',
    needsAssessment: 'Нужна дополнительная проверка состояния',
    footnote: 'Приложение не ставит диагнозов. Оно учитывает то, что вы сообщили, и не назначает нагрузку, пока это небезопасно.',
  },
  break: {
    reason: 'Причина',
    days: 'Сколько дней',
    endDate: 'Дата окончания',
  },
  yes: 'Да',
  no: 'Нет',
  timeErrors: {
    EMPTY: 'Введите время в формате ММ:СС',
    FORMAT: 'Введите время в формате ММ:СС',
    IMPOSSIBLE: 'Такого времени не существует. Проверьте минуты и секунды',
  } as const,
  numberErrors: {
    EMPTY: 'Заполните это поле',
    NOT_A_NUMBER: 'Введите число',
  } as const,
  dateErrors: {
    EMPTY: 'Выберите дату',
    FORMAT: 'Выберите дату из календаря',
  } as const,
} as const;

export const review = {
  title: 'Проверьте данные',
  subtitle: 'Активный цикл ещё не создан.',
  rows: {
    performance: 'Текущий результат',
    noPerformance: 'нет результата',
    target: 'Цель',
    raceDate: 'Дата итогового забега',
    daysToRace: (days: number): string => `До старта: ${days} дней`,
    availability: 'Доступно тренировок в неделю',
    volume: 'Недельный объём',
    quality: 'Качественные тренировки за 8 недель',
    breaks: 'Перерывы',
    noBreaks: 'нет',
    safety: 'Ограничения по состоянию',
    noRestrictions: 'нет',
    mismatch: 'Согласованность с результатом',
  },
  primaryCta: 'Рассчитать план',
  secondaryCta: common.changeData,
} as const;

export const assessment = {
  title: 'Ваша подготовка',
  whereAmI: 'Где я сейчас',
  noPerformance: 'Результата пока нет',
  performance: (time: string): string => `Текущий уровень: ${time} на 3000 м`,
  goal: 'К чему идём',
  goalValue: (time: string): string => `Цель: ${time}`,
  feasibility: 'Насколько реалистично',
  startPhase: 'С чего начинаем',
  gate: 'Можно ли уже использовать целевой темп',
  primaryCta: 'Посмотреть план',
  whyTitle: 'Почему такой план?',
  detailsTitle: 'Данные, на которых построен план',
  details: {
    confidence: 'Насколько свежий результат',
    capacity: 'Текущий уровень нагрузки',
    quality: 'Опыт качественных тренировок',
    reasons: 'Что повлияло на план',
  },
} as const;

export const planReady = {
  title: 'Ваш план готов',
  goal: 'Цель',
  raceDate: 'Итоговый забег',
  phase: 'Текущий этап',
  horizon: 'Ближайшие тренировки',
  taper: 'Далее',
  taperNote: 'Оценка начала снижения нагрузки; она пересчитывается по ходу подготовки.',
  horizonNote: 'Показаны тренировки, которые уже построены. Дальше план пересчитывается по результатам.',
  primaryCta: 'Перейти к подготовке',
} as const;

export const today = {
  title: 'Сегодня',
  workout: {
    task: 'Задача',
    volume: 'Объём',
    mode: 'Режим',
    pace: 'Темп',
    intervals: 'Отрезки',
    rest: 'Отдых',
    rpe: 'Усилие',
    cues: 'Как выполнять',
    warmup: 'Разминка',
    cooldown: 'Заминка',
    anchor: 'Почему такой темп',
    open: 'Открыть тренировку',
    enterResult: 'Внести результат',
    /** Shown instead of the CTA while the session is still in the future. */
    resultLater: 'Результат можно внести в день тренировки или позже.',
  },
  rest: {
    title: 'Сегодня восстановление',
    text: 'Тренировка на эту дату не назначена.',
    next: 'Следующая тренировка',
    noNext: 'В ближайшие дни тренировок нет',
    cta: 'Посмотреть план',
  },
  emptyQueue: {
    title: 'На ближайшие дни тренировок нет',
    text: 'План можно пересчитать: он опирается на дату старта и вашу форму.',
    cta: 'Обновить план',
  },
  checkpoint: {
    title: 'Нужен контрольный результат',
    text: 'Контрольный забег на 3000 м уточняет текущую форму, чтобы план оставался точным.',
    cta: 'Внести контрольный результат',
  },
  hold: {
    title: 'Обычные тренировки приостановлены',
    text: 'Приложение не назначает обычную нагрузку, пока состояние не будет подтверждено. Это защитное правило, а не оценка вашей подготовки.',
    note: 'Проверка состояния появится в следующем обновлении приложения.',
  },
  raceDay: {
    title: 'Сегодня итоговый забег',
    distance: 'Дистанция',
    distanceValue: '3000 м',
    goal: 'Цель',
    date: 'Дата',
    cta: 'Внести результат',
    later: 'Внести позже',
    note: 'Обычных тренировок сегодня нет. Это итоговый старт цикла.',
    pendingNote: 'Ввод итогового результата появится в следующем обновлении приложения.',
  },
  awaiting: {
    title: 'Итоговый результат ещё не внесён',
    text: 'Новые тренировки не назначаются до внесения результата.',
    cta: 'Внести результат',
    historyCta: 'Посмотреть историю',
  },
  completed: {
    title: 'Подготовка завершена',
    text: 'Цикл завершён. Итоги доступны в истории.',
    cta: 'Посмотреть результаты',
  },
  pendingResult: {
    title: 'Предыдущая тренировка ещё не закрыта',
    text: 'Пока результат не внесён, план не обновляется.',
    cta: 'Внести результат',
  },
  nextWorkout: 'Следующая тренировка',
  raceLabel: 'Итоговый забег',
  raceCountdown: (days: number): string => `До итогового старта — ${days} дней`,
  phaseLabel: 'Этап',
} as const;

export const plan = {
  title: 'План',
  currentPhase: 'Текущий этап',
  goalLabel: 'Цель',
  horizon: 'Построенные тренировки',
  taper: 'Снижение нагрузки перед забегом',
  taperLabel: 'Начало снижения нагрузки',
  taperNote: 'Оценка начала этапа; дата пересчитывается по ходу подготовки.',
  race: 'Итоговый забег',
  raceNote: 'Отдельное событие: обычной тренировки в этот день нет.',
  refresh: 'Обновить план',
  horizonNote: 'Показан фактический горизонт плана. Полный календарь цикла не строится: дальше план зависит от результатов.',
  openToday: 'Открыть сегодняшнюю тренировку',
} as const;

export const history = {
  title: 'История',
  tabCurrent: 'Текущий цикл',
  tabArchive: 'Архив',
  emptyCurrent: 'Пока нет выполненных тренировок',
  emptyCurrentHint: 'Здесь появятся выполненные тренировки, пропуски и переносы.',
  emptyArchive: 'Завершённых циклов пока нет',
  emptyArchiveHint: 'После итогового забега цикл переедет в архив.',
  toPlan: 'Посмотреть план',
} as const;

export const profile = {
  title: 'Профиль',
  goal: 'Цель',
  raceDate: 'Дата итогового забега',
  cycle: 'Текущий цикл',
  cycleStart: 'Начало цикла',
  currentForm: 'Текущая форма',
  availability: 'Доступно тренировок в неделю',
  initialData: 'Исходные данные',
  phase: 'Этап',
  phaseNote: 'Этап, допуск к целевому темпу и план определяет приложение: вручную они не меняются.',
  about: 'О приложении',
  aboutText: 'Все данные хранятся на этом устройстве. Приложение работает без сети.',
} as const;

export const resultForm = {
  title: 'Результат тренировки',
  subtitle: 'Отметьте, как всё прошло. Решение о дальнейшем плане принимает приложение.',
  completion: {
    label: 'Насколько выполнено задание',
    options: {
      FULL: 'Выполнено полностью',
      MORE_THAN_HALF: 'Больше половины',
      HALF: 'Примерно половина',
      LESS_THAN_HALF: 'Меньше половины',
      EXACT: 'Точное значение',
    },
    exactLabel: 'Сколько выполнено, %',
    exactHint: 'Целое число от 1 до 99',
  },
  rpe: {
    label: 'Насколько тяжело было',
    hint: 'Оцените фактическую тяжесть тренировки, а не то, как планировалось.',
    planned: (range: string): string => `План: ${range}`,
    anchors: {2: 'очень легко', 5: 'умеренно', 7: 'тяжело, но контролируемо', 9: 'очень тяжело'},
  },
  duration: {label: 'Длительность, мин', hint: 'Время тренировки целиком, включая разминку и заминку'},
  distance: {label: 'Дистанция, м', hint: 'Общая дистанция, если известна; иначе оставьте 0'},
  repeats: {
    label: 'Результаты отрезков',
    hint: 'Время каждого отрезка — по нему оценивается темп',
    planned: (count: number, meters: number | null): string => (meters === null ? `По плану: ${count} отрезков` : `По плану: ${count} отрезков по ${meters} м`),
    item: (index: number): string => `Отрезок ${index + 1}`,
    seconds: 'Время',
    meters: 'Дистанция, м',
    empty: 'Результаты отрезков не заполнены',
    collapsed: 'Добавить отрезки',
  },
  rest: {label: 'Отдых между отрезками, сек'},
  conditions: {
    label: 'Условия',
    toggle: 'Добавить условия',
    heat: 'Жара',
    wind: 'Ветер',
    surface: 'Покрытие',
    notes: 'Заметка',
  },
  fatigue: {label: 'Необычная усталость', hint: 'Была ли усталость сильнее обычной для такой нагрузки'},
  submit: 'Сохранить результат',
  saving: 'Сохраняем…',
  cancel: 'Отмена',
  errors: {
    EMPTY: 'Заполните это поле',
    FORMAT: 'Проверьте формат',
    IMPOSSIBLE: 'Такого значения не может быть',
    NOT_A_NUMBER: 'Введите число',
    NEGATIVE: 'Значение не может быть отрицательным',
  },
  timeErrors: {
    EMPTY: 'Укажите время отрезка',
    FORMAT: 'Введите время в формате ММ:СС',
    IMPOSSIBLE: 'Такого времени не существует. Проверьте минуты и секунды',
  },
  /** B1: the approved warning, shown before submitting without repeats. */
  warning: {
    title: 'Результаты отрезков не заполнены',
    text: 'Без этих данных оценка выполнения будет менее точной и может повлиять на дальнейший план.',
    fill: 'Вернуться и заполнить',
    send: 'Отправить как есть',
  },
  closed: {
    title: 'Эта тренировка уже закрыта',
    text: 'Результат этой тренировки уже внесён. Откройте историю или текущий план.',
    cta: 'К плану',
  },
  tooEarly: {
    title: 'Тренировка ещё не состоялась',
    text: 'Результат можно внести в день тренировки или позже.',
    cta: 'К тренировке',
  },
  missing: {
    title: 'Тренировка не найдена',
    text: 'Возможно, план уже обновлён. Откройте раздел «План» заново.',
    cta: 'Обновить план',
  },
} as const;

export const skip = {
  action: 'Не смогу выполнить',
  confirmTitle: 'Пропустить эту тренировку?',
  confirmText: 'План будет обновлён. Пропущенный объём не переносится.',
  confirm: 'Пропустить',
  cancel: 'Отмена',
  /** The second way to resolve an overdue session, next to entering its result. */
  pendingAction: 'Я её не выполнял',
} as const;

export const move = {
  action: 'Перенести',
  title: 'Перенести тренировку',
  current: 'Текущая дата',
  pick: 'Новая дата',
  horizonHint: 'Показаны даты внутри текущего плана. Восстановление и недельный лимит проверяет приложение.',
  submit: 'Перенести',
  cancel: 'Отмена',
  noDates: 'Подходящих дат в текущем плане нет.',
  reason: {
    action: 'Действие с тренировкой',
  },
} as const;

export const checkpoint = {
  title: 'Контрольный забег',
  intro: 'Результат обновит текущую форму. Дальнейший план будет построен от него.',
  time: 'Результат на 3000 м',
  timeHint: 'Формат ММ:СС, например 14:30',
  date: 'Дата результата',
  source: 'Откуда результат',
  submit: 'Сохранить результат',
  saving: 'Сохраняем…',
  cancel: 'Отмена',
  cta: 'Внести контрольный результат',
  outcome: {
    title: 'Оценка обновлена',
    previous: 'Предыдущая форма',
    current: 'Текущая форма',
    goal: 'Цель',
    phase: 'Текущий этап',
    feasibility: 'Оценка цели',
    gate: 'Использование целевого темпа',
    changes: 'Что изменилось',
    noChanges: 'План не изменился',
    continue: 'Продолжить',
    openPlan: 'Посмотреть план',
  },
  missing: {
    title: 'Контрольный результат не найден',
    text: 'На этом устройстве ещё не сохранён ни один контрольный результат.',
    cta: 'К плану',
  },
} as const;

export const historyItems = {
  CYCLE_CREATED: 'Цикл создан',
  WORKOUT_SKIPPED_VOLUNTARY: 'Тренировка пропущена',
  WORKOUT_SKIPPED_PAST_DUE: 'Тренировка не выполнена',
  WORKOUT_MOVED: 'Тренировка перенесена',
  CHECKPOINT_RECORDED: 'Контрольный результат',
  TRAINING_PARAMETERS_CHANGED: 'Параметры подготовки изменены',
  FINAL_RESULT_RECORDED: 'Итоговый результат',
  moved: (from: string, to: string): string => `${from} → ${to}`,
  performance: (from: string | null, to: string): string => (from === null ? to : `${from} → ${to}`),
} as const;

export const outcome = {
  title: 'Результат',
  whatChanged: 'Что изменилось',
  nextSession: 'Следующая тренировка',
  noNextSession: 'В ближайшие дни тренировок нет',
  continue: 'Продолжить',
  openPlan: 'Посмотреть план',
  why: 'Почему изменился план?',
  recorded: 'Записано',
} as const;

export const change = {
  WORKOUT_RECORDED: 'Тренировка закрыта',
  NEXT_WORKOUT_CHANGED: 'Следующая тренировка изменилась',
  NEXT_WORKOUT_TYPE_CHANGED: 'Тип следующей тренировки',
  NEXT_WORKOUT_DATE_CHANGED: 'Дата следующей тренировки',
  NEXT_WORKOUT_VOLUME_CHANGED: 'Объём следующей тренировки',
  NEXT_WORKOUT_PACE_CHANGED: 'Темп следующей тренировки',
  CONTROL_SCHEDULED: 'Добавлен контрольный забег',
  PHASE_CHANGED: 'Этап подготовки',
  GATE_CHANGED: 'Использование целевого темпа',
  FEASIBILITY_CHANGED: 'Оценка цели',
  SAFETY_CHANGED: 'Состояние',
  CHECKPOINT_REQUIRED: 'Нужен контрольный результат',
  QUEUE_BECAME_EMPTY: 'Построенных тренировок больше нет',
  none: 'План не изменился',
  from: 'было',
  to: 'стало',
  noneValue: '—',
} as const;

export const load = {
  damagedTitle: 'Не удалось прочитать сохранённые данные',
  damagedText: 'Сохранённый цикл повреждён. Данные не удалены: их можно посмотреть в архиве, а новый цикл начать заново.',
  damagedCta: 'Начать заново',
  unsupportedFormatTitle: 'Данные несовместимы с текущей версией',
  unsupportedFormatText: 'Сохранённый цикл создан другой версией приложения. Обновите приложение; данные не удалены.',
  unsupportedFormatCta: 'Обновить приложение',
  unsupportedEngineTitle: 'Несовместимая версия состояния',
  unsupportedEngineText: 'Состояние плана создано другой версией приложения. Данные не удалены.',
  unsupportedEngineCta: 'Обновить приложение',
  impossibleTitle: 'План этого цикла завершён',
  impossibleText: 'Дата старта прошла, а итоговый результат не внесён. Внесение результата появится в следующем обновлении приложения.',
  impossibleCta: 'Назад',
  confirmTitle: 'Удалить повреждённый цикл?',
  confirmText: 'Активный цикл будет удалён с этого устройства, восстановить его не получится. Начать подготовку заново?',
  confirmCta: 'Удалить и начать заново',
} as const;

export const storageUnavailable = {
  title: 'Цикл нельзя надёжно сохранить',
  text: 'Браузер не позволяет сохранить данные на этом устройстве. Пока это так, начинать подготовку нельзя: план не переживёт перезагрузку или закрытие вкладки.',
  hint: 'Обычно так бывает в приватном режиме или когда для сайта запрещено хранение данных. Разрешите хранение и повторите.',
  cta: 'Повторить',
} as const;

export const notFound = {
  title: 'Экран не найден',
  text: 'Такого раздела нет.',
  cta: nav.today,
} as const;

/** States of the Today screen that this slice derives but does not render yet. */
export const upcoming = {
  pendingResultCta: 'Внести результат',
} as const;
