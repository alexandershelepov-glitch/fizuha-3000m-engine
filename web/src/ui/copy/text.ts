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

/**
 * Russian counting. Only presentation: the app spells out the numbers the engine prescribed, it never
 * rounds them into different ones.
 */
function pluralForm(value: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(value) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export const counts = {
  minutes: (value: number): string => `${value} ${pluralForm(value, 'минуту', 'минуты', 'минут')}`,
  seconds: (value: number): string => `${value} ${pluralForm(value, 'секунду', 'секунды', 'секунд')}`,
  meters: (value: number): string => `${value} ${pluralForm(value, 'метр', 'метра', 'метров')}`,
  repeats: (value: number): string => `${value} ${pluralForm(value, 'отрезок', 'отрезка', 'отрезков')}`,
  runs: (value: number): string => `${value} ${pluralForm(value, 'тренировку', 'тренировки', 'тренировок')}`,
  weeks: (value: number): string => `${value} ${pluralForm(value, 'неделю', 'недели', 'недель')}`,
} as const;

/** Duration in words: whole minutes when they are whole, otherwise minutes and seconds. */
export function durationText(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return counts.seconds(rest);
  if (rest === 0) return counts.minutes(minutes);
  return `${counts.minutes(minutes)} ${counts.seconds(rest)}`;
}

/** Distance in words: kilometres with one decimal from a kilometre up, metres below it. */
export function distanceText(meters: number): string {
  const rounded = Math.round(meters);
  if (rounded < 1000) return counts.meters(rounded);
  if (rounded % 1000 === 0) return `${rounded / 1000} км`;
  return `${(rounded / 1000).toFixed(1).replace('.', ',')} км`;
}

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
      title: 'Сколько вы бегаете сейчас',
      description: 'Важно то, как вы бегаете обычно, а не в лучшую неделю. По этим ответам подготовка начнётся с посильной нагрузки.',
    },
    QUALITY: {
      title: 'Быстрые тренировки',
      description: 'Нам важно понять, выполняли ли вы специальные быстрые тренировки, а не просто обычные пробежки.',
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
    canRun3Km: {label: 'Можете ли вы непрерывно пробежать 3 км без остановки?'},
    regularRunningWeeks: {
      label: 'Сколько недель подряд вы бегаете хотя бы один раз в неделю?',
      hint: 'Ответ в неделях. Быстро или медленно — неважно. Например: дважды в неделю полгода = примерно 26 недель.',
    },
    actualRunsPerWeek: {
      label: 'Сколько раз в неделю вы обычно бегаете сейчас?',
      hint: 'Укажите обычную неделю за последний месяц, а не максимальное количество тренировок.',
    },
    averageWeeklyKm4Weeks: {
      label: 'Примерно сколько километров вы пробегаете за неделю?',
      hint: 'Возьмите обычную неделю за последний месяц. Точная цифра не обязательна.',
    },
    longestUsualRunKm: {
      label: 'Сколько километров обычно составляет ваша самая длинная пробежка?',
      hint: 'Обычная длинная пробежка, а не самая длинная за всю жизнь.',
    },
    qualitySessions8Weeks: {
      label: 'Сколько таких быстрых тренировок вы сделали за последние 8 недель?',
      hint: 'Если специально быстрых тренировок не было — укажите 0.',
    },
    qualityWeeks8Weeks: {
      label: 'В скольких из последних 8 недель была хотя бы одна такая тренировка?',
      hint: 'Например, если вы сделали 4 быстрые тренировки, но все они были в двух неделях — укажите 2.',
    },
    qualityMostlyTolerated: {
      label: 'Обычно вам удавалось выполнить такие тренировки полностью?',
      hint: 'Ответьте «Да», если в большинстве случаев удавалось закончить запланированную работу без сильного падения темпа или досрочной остановки.',
    },
    experience: {label: 'Что из этого вы выполняли раньше?'},
    experienceThreshold: {
      label: 'Темповый бег',
      hint: 'Несколько минут подряд заметно быстрее обычной пробежки.',
    },
    experienceVo2: {
      label: 'Интервалы',
      hint: 'Несколько быстрых отрезков с отдыхом между ними.',
    },
    experienceSpecific: {
      label: 'Отрезки в темпе 3000 м',
      hint: 'Повторные отрезки примерно в темпе вашего забега на 3 км.',
    },
    availableRunsPerWeek: {label: 'Сколько тренировок в неделю вы можете выполнять'},
    performanceMismatch: {label: 'Последний результат на 3000 м примерно соответствует тому, как вы бегаете сейчас?'},
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
  qualityRecall: {
    question: 'За последние два месяца вы специально тренировались бегать быстрее обычного?',
    options: {NONE: 'Нет', SOMETIMES: 'Несколько раз', REGULAR: 'Регулярно', UNKNOWN: 'Точно не помню', EXACT: 'Знаю точное количество'},
    caution: 'Не нужны часы или дневник. Если точных данных нет, начнём с осторожной нагрузки и уточним её по результатам тренировок.',
  },
  safetyQuick: {
    action: 'Жалоб и ограничений нет — продолжить',
    explanation: 'Нажимайте, только если нет боли, отёка, болезни и других перечисленных ограничений.',
    details: 'Есть жалобы или сомнения — заполнить подробно',
  },
  goalPreview: {
    title: 'Предварительная оценка цели',
    note: 'Это не гарантия результата. Можно изменить цель или дату забега.',
  },
  hold: {
    title: 'Подготовка временно приостановлена',
    explanation: 'Из-за указанных ограничений вместо беговых тренировок назначен отдых. Это защита, а не ошибка.',
    recheck: 'Повторно проверить состояние',
    next: 'После проверки приложение пересчитает план, если ограничения сняты. Сбрасывать подготовку не нужно.',
  },
  recovery: {
    title: 'Повторная проверка состояния',
    intro: 'Проверьте актуальное состояние. Старый план, выполненные тренировки и результаты сохраняются.',
    clearance: 'Если медицинская оценка требовалась, она проведена и ограничения на бег сняты. Я понимаю, что приложение не выдаёт медицинский допуск.',
    notice: 'Если остаются боль, отёк, симптомы болезни или иные ограничения, отметьте их. Не скрывайте жалобы ради тренировки.',
    submit: 'Сохранить состояние',
    resultStillHold: 'Ограничения сохраняются. Беговые тренировки пока не назначаются.',
    resultReady: 'Ответы сохранены, дальнейший план обновлён по правилам приложения.',
    required: 'Сначала подтвердите актуальность ответов и прохождение требовавшейся оценки состояния.',
  },
  fastTraining: {
    title: 'Что считать быстрой тренировкой?',
    text: 'Это тренировка, где вы специально бежали быстрее своего обычного спокойного бега:',
    items: [
      'быстрые отрезки с отдыхом;',
      'интервалы;',
      'непрерывный быстрый бег;',
      'отрезки примерно в темпе забега на 3000 м.',
    ],
    footnote: 'Обычная пробежка сюда не относится, даже если она далась тяжело.',
  },
  mismatchOptions: {
    NONE: {label: 'Да, примерно соответствует', hint: 'Последний результат отражает то, как вы бегаете сейчас.'},
    MODERATE: {label: 'Сейчас я, скорее всего, немного быстрее или медленнее', hint: 'Разница небольшая, но результат стоит уточнить.'},
    CLEAR: {label: 'Сейчас моя форма заметно отличается', hint: 'Результат уже не отражает текущую форму — понадобится контрольный забег.'},
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
    quality: 'Опыт быстрых тренировок',
    breaks: 'Перерывы',
    noBreaks: 'нет',
    safety: 'Ограничения по состоянию',
    noRestrictions: 'нет',
    mismatch: 'Соответствие последнему результату',
  },
  primaryCta: 'Рассчитать план',
  secondaryCta: common.changeData,
} as const;

export const assessment = {
  title: 'Ваша подготовка',
  intro: 'Коротко: что у вас сейчас, к чему вы идёте и с чего начнётся подготовка.',
  whereAmI: 'Ваш текущий результат',
  noPerformance: 'Результата пока нет',
  performance: (time: string): string => `${time} на 3000 м`,
  goal: 'Ваша цель',
  goalValue: (time: string): string => `${time} на 3000 м`,
  feasibility: 'Насколько цель реалистична',
  startPhase: 'С чего начнётся подготовка',
  gate: 'Будете ли вы тренироваться в целевом темпе',
  whatNext: 'Что дальше',
  whatNextText: 'Дальше — план на ближайшие дни. Каждая тренировка будет объяснена простыми словами: что делать и как это должно ощущаться.',
  primaryCta: 'Посмотреть план',
  whyTitle: 'Почему такой план?',
  detailsTitle: 'Данные, на которых построен план',
  details: {
    confidence: 'Насколько свежий результат',
    capacity: 'Текущий уровень нагрузки',
    quality: 'Опыт быстрых тренировок',
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
  horizonNote: 'Это ближайшие назначения. Следующие тренировки обновляются по результатам выполнения.',
  primaryCta: 'Перейти к подготовке',
} as const;

export const today = {
  title: 'Сегодня',
  workout: {
    task: 'Задача',
    volume: 'Объём',
    mode: 'Режим',
    pace: 'Целевой темп',
    treadmillSpeed: 'Скорость на дорожке',
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
  performanceReview: {
    title: 'Нужно обновить результат на 3000 м',
    text: 'Прежний результат устарел. Быстрые тренировки пока ограничены, но можно выполнить спокойный бег, который назначил план, если самочувствие позволяет.',
    noWorkout: 'Пока новых тренировок нет. Новый результат на 3000 м поможет пересчитать план.',
    cta: 'Внести результат на 3000 м',
  },
  hold: {
    title: 'Обычные тренировки приостановлены',
    text: 'Приложение не назначает обычную нагрузку, пока состояние не будет подтверждено. Это защитное правило, а не оценка вашей подготовки.',
    note: 'Вы можете сообщить об изменении состояния без удаления плана.',
    recheck: 'Повторно проверить состояние',
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
  reset: {
    title: 'Начать подготовку заново',
    hint: 'Для повторного заполнения анкеты можно удалить текущий план. Завершённые подготовки в архиве сохранятся.',
    action: 'Сбросить текущий план',
    confirmTitle: 'Удалить текущую подготовку?',
    confirmText: 'Текущий план, выполненные тренировки и записи этого цикла будут удалены без возможности восстановления. Завершённые циклы в архиве не пострадают.',
    confirmAction: 'Да, удалить текущий план',
    cancel: 'Оставить план',
  },
  about: 'О приложении',
  aboutText: 'Все данные хранятся на этом устройстве. Приложение работает без сети.',
} as const;

export const resultForm = {
  title: 'Результат тренировки',
  subtitle: 'Отметьте, как всё прошло. Решение о дальнейшем плане принимает приложение.',
  calibrationHint: 'Калибровка: обязательно внеси фактическое время в минутах и пройденную дистанцию в метрах. План не подставляет их автоматически.',
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
  distance: {label: 'Дистанция, м', hint: 'Общая дистанция, если измеряли. Иначе оставьте пустым: приложение учтёт только записанные отрезки, без разминки и заминки.'},
  repeats: {
    label: 'Результаты отрезков',
    hint: 'Время каждого отрезка — по нему оценивается темп',
    /** The structure comes from the one presentation helper; a non-interval workout keeps the count. */
    planned: (structure: string | null, count: number): string => (structure === null ? `По плану: ${count} отрезков` : `По плану: ${structure}`),
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
  resultSafety: {
    title: 'Самочувствие после тренировки',
    question: 'Во время или после тренировки появились боль, отёк или другие необычные симптомы?',
    no: 'Нет, всё нормально',
    yes: 'Да, появились',
    explanation: 'Если жалоб нет, подробные вопросы не нужны. Необычная усталость отмечается отдельно.',
    details: 'Уточните, что именно беспокоит. Эти ответы влияют на безопасность дальнейшего плана.',
    required: 'Ответьте на вопрос о самочувствии, прежде чем сохранить результат.',
    specify: 'Укажите хотя бы один симптом или ограничение в подробных вопросах.',
    confirmTitle: 'Удалить ранее указанные жалобы?',
    confirmText: 'В этом отчёте уже отмечены симптомы или ограничения. Подтвердите, только если они действительно указаны ошибочно. Все сведения о жалобах в этом отчёте будут очищены.',
    confirmYes: 'Да, жалоб нет',
    confirmCancel: 'Оставить указанные жалобы',
  },
  submit: 'Сохранить результат',
  saving: 'Сохраняем…',
  cancel: 'Отмена',
  errors: {
    EMPTY: 'Заполните это поле',
    FORMAT: 'Проверьте формат',
    IMPOSSIBLE: 'Такого значения не может быть',
    NOT_A_NUMBER: 'Введите число',
    NEGATIVE: 'Значение не может быть отрицательным',
    CONFLICT: 'Общая дистанция меньше суммы записанных отрезков. Исправьте её или оставьте поле пустым.',
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

/**
 * The workout card is written for someone who has never put a training session together. Every line
 * is a phrase the engine's own prescription can be read as; nothing here adds a number the engine did
 * not order.
 */
export const instruction = {
  cardTitle: 'Как выполнить тренировку',
  today: (what: string): string => `Сегодня: ${what}`,
  warmup: (minutes: number): string => `Разминка — ${counts.minutes(minutes)} в лёгком режиме.`,
  cooldown: (minutes: number): string => `Заминка — ${counts.minutes(minutes)} в лёгком режиме.`,
  cooldownAfterRepeats: (minutes: number): string => `После последнего отрезка — ${counts.minutes(minutes)} в лёгком режиме.`,
  rest: 'Сегодня отдых: тренировка не назначается.',
  // intervals
  repeatsOfDistance: (repeats: number, meters: string): string => `Выполни ${counts.repeats(repeats)} по ${meters}.`,
  repeatsOfDistanceWithFinal: (repeats: number, standardMeters: string, finalMeters: string): string =>
    `Выполни ${counts.repeats(repeats)}: первые ${repeats - 1} — по ${standardMeters}, последний — ${finalMeters}.`,
  singleDistance: (meters: string): string => `Пробеги ${meters}.`,
  repeatsOfDuration: (repeats: number, duration: string, exact: boolean): string =>
    `Выполни ${counts.repeats(repeats)}. Каждый отрезок длится ${exact ? '' : 'примерно '}${duration}.`,
  intervalTargetOne: (range: string): string => `Каждый отрезок старайся пробежать за ${range}.`,
  intervalTargetPace: (pace: string): string => `Каждый отрезок — в темпе ${pace}.`,
  intervalTargetSplit: (meters: string, range: string): string => `${meters} — за ${range}.`,
  intervalTargetFinal: (finalMeters: string, range: string): string => `Последний ${finalMeters} — за ${range}.`,
  repeatsTotal: (repeats: number, what: string): string => `Выполни ${counts.repeats(repeats)}. Всего — ${what}.`,
  continuousByEffort: (what: string): string => `Беги ${what} быстрее спокойного бега — ровно и под контролем.`,
  restAfterRepeat: (seconds: number): string => `Отдых между отрезками — ${durationText(seconds)}.`,
  restBetweenRepeats: (duration: string): string => `Между отрезками отдыхай ${duration}. После последнего отрезка отдых не нужен.`,
  targetPace: (pace: string): string => `Целевой темп: ${pace}.`,
  treadmillSpeed: (speed: string): string => `На беговой дорожке: ${speed}.`,
  unpacedIntervals: 'Числовой темп не назначен: ориентируйся на усилие, указанное ниже.',
  timeIntervalsNoDistance: 'Дистанция не назначена: эти отрезки выполняются по времени.',
  timeIntervalsEstimatedDistance: (distance: string): string =>
    `Расчётный ориентир одного отрезка: ${distance}. Это не обязательная дистанция — следуй времени и темпу.`,
  stridesNote: 'Ускорения не должны быть тяжёлыми: это работа над техникой, а не на результат.',
  // continuous
  continuousMinutes: (minutes: number, pace: string): string => `Беги ${counts.minutes(minutes)} в темпе ${pace}.`,
  continuousDistance: (distance: string, pace: string): string => `Пробеги ${distance} в темпе ${pace}.`,
  continuousHoldPace: 'Старайся держать скорость ровно. Не начинай быстрее заданного темпа.',
  easyAssigned: (distance: string, pace: string): string => `Пробеги ${distance}. Держи темп ${pace}.`,
  easyTreadmill: (speed: string): string => `На дорожке установи скорость ${speed}.`,
  easyExpectedTime: (time: string): string => `Ожидаемое время на дистанции при этом темпе: ${time}.`,
  easySpeedLimit: (fastPace: string): string => `Не беги быстрее ${fastPace} мин/км: задача — лёгкая тренировка, а не проверка скорости.`,
  easyOutdoorCheck: 'На улице проверяй темп по каждому километру, не ускоряйся к финишу.',
  calibrationTask: (distance: string): string => `Пробеги ${distance} непрерывно. Это вводное измерение, а не забег на максимальную скорость.`,
  calibrationIntensity: 'Держи усилие 2–4 из 10. Не ускоряйся ради лучшего времени.',
  calibrationMeasure: 'Засеки фактическое время пробежки от старта до финиша (часы или секундомер).',
  calibrationSubmit: 'После финиша внеси пройденную дистанцию, точное время и оценку нагрузки. После двух подтверждённых измерений приложение рассчитает персональный темп.',
  calibrationRunWalk: 'Если пока не можешь бежать непрерывно, выполняй назначенные чередования бега и ходьбы. Их суммарное время нельзя использовать для расчёта темпа непрерывного бега.',
  easyContinuous: (distance: string): string => `Беги ${distance} в удобном спокойном темпе.`,
  easyNoNeed: 'Специально ускоряться не нужно.',
  easyFeel: 'Ориентир:',
  easySlowDown: 'Если становится тяжело поддерживать такой режим — замедлись.',
  easyStop: 'Если нужно остановиться — остановись: это лучше, чем бежать через силу.',
  easyGenericCue: 'Ориентируйтесь на спокойное контролируемое усилие.',
  runWalk: 'Чередуйте очень медленный бег и ходьбу. Бегите так, чтобы можно было говорить.',
  runWalkTotal: (distance: string): string => `Пройдите и пробегите суммарно ${distance}. Учитывайте и шаги, и бег; разминка и заминка отдельно.`,
  runWalkBouts: (running: number, walking: number): string => `Бегите ${durationText(running)}, затем идите пешком ${durationText(walking)}.`,
  runWalkRepeat: 'Повторяйте эти два отрезка, пока не наберёте указанную общую дистанцию. Последний отрезок можно сократить.',
  runWalkPattern: 'Для старой сохранённой тренировки длительность отрезков не указана. Обновите план перед её выполнением.',
  control: (distance: string): string => `Пробеги ${distance} на результат.`,
  controlDistance: (workout: {readonly main: {readonly dose: {readonly unit: string; readonly value: number}}}): string =>
    workout.main.dose.unit === 'METERS' ? counts.meters(Math.round(workout.main.dose.value)) : counts.minutes(Math.round(workout.main.dose.value)),
  controlNoPace: 'Конкретный темп не задан.',
  controlEffort: 'Ориентир по усилию указан ниже.',
  // shared
  feeling: 'Как должно ощущаться:',
  effortScale: (range: string): string => `Усилие: ${range} из 10`,
  noteIntervalsFast: 'Первый отрезок не начинай слишком быстро: ровный темп даётся легче, чем быстрый старт.',
  noteIntervalsHard: 'Если на последних отрезках темп падает, дальше можно не ускоряться — доделай работу спокойнее.',
  noteNoPace: 'Темп в этой тренировке не задан: ориентируйся на самочувствие.',
  treadmillSpeedLabel: 'Скорость на дорожке',
  distanceLabel: 'Дистанция одного отрезка',
  distanceNotAssigned: 'Не задана (отрезки по времени)',
  distanceEstimateDisclaimer: 'расчётный ориентир, не норматив',
  technicalTitle: 'Технические характеристики',
  whyTitle: 'Почему такая тренировка?',
  splitLine: (meters: string, range: string): string => `${meters} примерно за ${range}`,
  splitsTitle: 'Время отрезков',
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
  notAllowed: {
    overdue: {
      title: 'Эту тренировку нельзя перенести',
      text: 'Дата тренировки уже прошла. Внесите результат или отметьте, что она не выполнена.',
    },
    outOfOrder: {
      title: 'Сначала закройте более раннюю тренировку',
      text: 'Пока результат за прошлую дату не внесён, план не перестраивается.',
    },
  },
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
  CONTINUOUS_3K_CONFIRMED: 'Подтверждено: пробежал 3000 м без остановки (без измеренного времени)',
  CHECKPOINT_RECORDED: 'Контрольный результат',
  TRAINING_PARAMETERS_CHANGED: 'Параметры подготовки изменены',
  SAFETY_REASSESSED: 'Состояние повторно проверено',
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
  why: 'Что влияет на текущий план',
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
  damagedText: 'Сохранённый план не удалось прочитать. Данные не удалены. Если удалить этот план, восстановить его записи не получится. Завершённые циклы в архиве сохранятся.',
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
  title: 'Не удалось получить доступ к данным',
  text: 'Браузер временно не позволяет прочитать или сохранить план. Существующие данные не удалены. Проверьте доступ к хранилищу и повторите попытку.',
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

export const lifecycle = {
  recheckSafety: 'Повторно проверить состояние',
  edit: 'Изменить цель и дату старта', saveParameters: 'Сохранить изменения', updated: 'План обновлён',
  goal: 'Цель 3000 м', date: 'Дата итогового старта', form: 'Текущая форма', initial: 'Стартовая форма',
  finalTitle: 'Итоговый результат', finalTime: 'Время на 3000 м', finalSubmit: 'Сохранить итоговый результат',
  fixedDate: 'Дата старта', completed: 'Подготовка завершена', result: 'Итоговый результат',
  checkpoints: 'Контрольные результаты', done: 'Выполнено тренировок', skipped: 'Пропущено тренировок', moves: 'Переносов',
  newCycle: 'Начать новую подготовку', archive: 'Сохранить в архив', retryArchive: 'Повторить архивацию',
  archives: 'Архив', open: 'Открыть', startDate: 'Дата начала', missing: 'Цикл не найден',
  missingText: 'Этот завершённый цикл не найден в архиве на устройстве.', history: 'История',
  archiveSaved: 'Цикл сохранён в архиве', archivePending: 'Итоговый результат сохранён. Осталось завершить архивацию.',
  raceTitle: 'Итоговый старт — 3000 м', finalCta: 'Внести итоговый результат', later: 'Внести позже',
  awaiting: 'Результат можно внести сейчас. Дата результата будет совпадать с датой старта.',
} as const;
