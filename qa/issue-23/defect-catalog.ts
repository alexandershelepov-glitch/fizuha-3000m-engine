/**
 * Curated description of every defect / observation found in this QA run. Counts and occurrences in the generated
 * defect-log.md are NOT written here: report.ts takes them from the real run output (journals + Playwright JSON).
 * Nothing here changes the methodology: defects are logged, not fixed (issue #23 acceptance).
 */
export interface CatalogEntry {
  id: string;
  kind: 'DEFECT' | 'OBSERVATION';
  severity: 'medium' | 'low' | 'info';
  title: string;
  scenario: string;
  expected: string;
  actual: string;
  checkIds: string[];
  reproTest?: string;
  codeRefs: string[];
  note?: string;
}

export const CATALOG: readonly CatalogEntry[] = [
  {
    id: 'DEF-001', kind: 'DEFECT', severity: 'medium',
    title: 'При остановке нагрузки (STOP/диагностическая пауза) служебные дни «Отдых» превращаются в «незакрытую тренировку» и скрывают сообщение о паузе',
    scenario: 'Любой профиль после отчёта «боль 4 + изменилась техника» (RED). Минимальный повтор: p3-15-30-12-18km, seed 20261014: 4 тренировки по плану, 4-я с симптомами, затем +1 день, +1 день.',
    expected: 'Во время STOP очередь содержит только служебные REST-дни; они не требуют результата. Экран «Сегодня» показывает карточку «Обычные тренировки приостановлены» с кнопкой «Повторно проверить состояние».',
    actual: 'Как только дата REST-дня прошла, «Сегодня» показывает «Предыдущая тренировка ещё не закрыта — Отдых <дата>» с кнопками «Внести результат» / «Я её не выполнял»; карточка паузы и кнопка повторной проверки пропадают, пока пользователь не нажмёт «Я её не выполнял» для каждого прошедшего REST-дня (в прогонах: 1–3 раза на профиль).',
    checkIds: ['REST_PLACEHOLDER_NOT_PENDING'],
    reproTest: 'qa/issue-23/defects.spec.ts › DEF-001',
    codeRefs: ['web/src/application/uiState.ts:69-70 (PENDING_RESULT проверяется раньше TRAINING_HOLD)', 'src/workouts.ts: при safety≠OK/diagnosticHold в очередь ставятся REST-слоты'],
    note: 'Корректное поведение допускает два решения (не считать REST «незакрытым» либо показывать карточку паузы выше). Решение за владельцем продукта; методика не менялась.',
  },
  {
    id: 'DEF-002', kind: 'DEFECT', severity: 'medium',
    title: 'Приложение требует «контрольный результат» у новичка, который не может пробежать 3 км, но движок этот результат не принимает (тупик)',
    scenario: 'p1-novice-no3k, seed 20261012: 1 лёгкая тренировка в неделю по плану; к 3-й неделе (≥21 дня с начала) «Сегодня» показывает «Нужен контрольный результат»; ввод 19:30 → «Контрольный забег сейчас недоступен».',
    expected: 'Если контрольный результат принципиально недоступен (canRun3Km=false), приложение его не требует; либо принимает результат.',
    actual: 'src/engine.ts:126 выставляет checkpointRequired после 21 дня независимо от canRun3Km, а recordCheckpoint (src/engine.ts:234) отказывает при !canRun3Km (CHECKPOINT_NOT_PERMITTED). Текст отказа говорит про «облегчённые тренировки после перерыва», что новичка не касается. Выход есть только через отдельное подтверждение «3000 м подряд».',
    checkIds: ['CHECKPOINT_ACCEPTED_WHEN_REQUIRED'],
    reproTest: 'qa/issue-23/defects.spec.ts › DEF-002',
    codeRefs: ['src/engine.ts:126', 'src/engine.ts:234', 'web/src/application/uiState.ts (CHECKPOINT_REQUIRED)'],
  },
  {
    id: 'DEF-003', kind: 'DEFECT', severity: 'low',
    title: 'Двойное нажатие «Сохранить результат» перескакивает экран с итогом тренировки: второй клик попадает в «Продолжить»',
    scenario: 'p3-15-30-12-18km, seed 20261014, первая тренировка, Playwright dblclick на «Сохранить результат» (клики без задержки). В полном цикле тот же приём применяется к частичной тренировке и каждой пятой записи.',
    expected: 'Результат записывается один раз, пользователь видит экран с вердиктом.',
    actual: 'Запись одна (дубля нет — проверено), но после dblclick открыт /today: кнопка «Продолжить» экрана итога находится в том же месте, что «Сохранить результат» на форме, и второй клик сразу её нажимает; вердикт пользователь не видит. Вариант 2 (наблюдался в p2, 2026-10-26, неполные отрезки): после dblclick форма осталась открытой без предупреждения «Отправить как есть» — предупреждение пропало (check DOUBLE_CLICK_WARNING_NOT_DISMISSED); дальнейшее одиночное нажатие отработало штатно.',
    checkIds: ['DOUBLE_CLICK_KEEPS_OUTCOME_SCREEN', 'DOUBLE_CLICK_WARNING_NOT_DISMISSED'],
    reproTest: 'qa/issue-23/defects.spec.ts › DEF-003',
    codeRefs: ['web/src/ui/screens/ResultOutcome.tsx', 'web/src/ui/screens (форма результата)'],
    note: 'Синтетический dblclick Playwright быстрее реального человека; реальную частоту не оценивали.',
  },
  {
    id: 'DEF-004', kind: 'DEFECT', severity: 'low',
    title: 'Грамматика на форме результата: «По плану: 1 отрезков» (не согласовано по числу)',
    scenario: 'p2-18min-5-10km, seed 20261013: темповая тренировка 2026-10-26, форма «Результат тренировки», блок «Результаты отрезков».',
    expected: 'Склонение по числу: 1 отрезок, 2–4 отрезка, 5+ отрезков (так же для 21, 22 …).',
    actual: 'Подпись показывает «По плану: 1 отрезков».',
    checkIds: ['GRAMMAR_REPEATS_PLURAL'],
    reproTest: 'qa/issue-23/defects.spec.ts › DEF-004',
    codeRefs: ['web/src/ui/copy/text.ts:487 (шаблон «По плану: ${count} отрезков» без склонения)'],
  },
  {
    id: 'OBS-001', kind: 'OBSERVATION', severity: 'info',
    title: 'Доля «качественных» тренировок выше QA-порога 40 % у p2 и p4',
    scenario: 'p2-18min-5-10km (seed 20261013) и p4-14-30-25-30km (seed 20261015): см. таблицу недель.',
    expected: 'QA-эвристика (заданная до запуска, не правило ТЗ): качественных ≤ 40 % от занятий.',
    actual: 'p2: 1 из 2 занятий недели — вводная быстрая работа; p4: до 2 качественных на 4 занятия в неделю. Это допускается правилом src/assessment.ts:73 (maximumQualityPerWeek=2 при ≥4 доступных запусках и T2/T3), т.е. не нарушение методики, а наблюдение для владельца методики.',
    checkIds: ['PLAUSIBLE_QUALITY_SHARE'],
    codeRefs: ['src/assessment.ts:73'],
    note: 'Порог 40 % — эвристика QA; методика не менялась.',
  },
];

export const RETRACTED = [
  {
    id: 'RETRACTED-A', title: 'Ложное срабатывание инварианта INV_QUALITY_PER_7_DAYS_DECISION (исправлена проверка, не методика)',
    text: 'Первая версия проверки сравнивала окно будущих тренировок с лимитом качества на СЕГОДНЯ (maximumQualityPerWeek=1 в течение 7 дней после RED). Движок же планирует каждый слот по решению на дату слота (src/assessment.ts: recentRed — RED не старше 7 дней от даты слота; src/engine.ts:191). После 7 дней лимит законно становится 2. Проверка исправлена на decide(state, дата слота); это не дефект приложения. Побочное наблюдение (OBS-002 ниже) осталось.',
  },
];

export const EXTRA_OBSERVATIONS: readonly string[] = [
  'OBS-002 (методика, на решение владельца): после RED (боль 4 + изменилась техника) достаточно самостоятельной отметки «жалоб нет» + чекбокса медицинской оценки (вымышленный), чтобы через 3 дня вернулись лёгкие тренировки, а на 7–9-й день после RED — снова до 2 качественных за неделю (p5). Это соответствует правилам (recentRed = 7 дней), поэтому как дефект не заведено.',
  'OBS-003 (методика, на решение владельца): p1 (новичок, 1 фактический бег в неделю) получает 1 занятие в неделю весь цикл — бег/ходьба на суммарные 3,0 → 3,4 км — хотя доступно 3 дня; частота не растёт автоматически (защита «фактической частоты»). Цель 18:30 на 3000 м за 12 недель при этом нигде на экране «Ваш план готов» не оценивается как достижимая или нет (в скриншоте 05-plan-ready такой оценки нет) — это наблюдение, не дефект.',
  'OBS-004: после PARTIAL (3-я неделя) и TOO_HARD (6-я неделя) срабатывает diagnosticHold/relatedYellow (два связанных YELLOW за 21 день) — ожидаемое по методике; в журнале помечено UNPLANNED_HOLD.',
];
