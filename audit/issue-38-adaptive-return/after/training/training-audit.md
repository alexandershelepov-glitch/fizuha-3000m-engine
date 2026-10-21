# Аудит долгосрочной адаптации «ФИЗУХА — 3000 м»

Дата виртуального старта: **2026-10-12**. Сценариев: **9**.

**Важные ограничения.** Это детерминированные, *гипотетические* отчёты, переданные в настоящий публичный спортивный движок. Реальное улучшение результата на 3000 м **не моделируется и не утверждается**: в контрольных точках и на итоговом забеге внешнее измерение намеренно оставлено равным исходному. Приложение не может предсказать адаптацию организма без реальных тренировок и тестов. Не использованы персональные данные, localStorage, браузерные даты или новый спортивный планировщик.

События **EXTERNAL_*** означают введённые оператором теста внешние факты; успешные GREEN/GREEN_PLUS означают заданную в симуляторе переносимость, **не** подтверждённую человеком. Событие **INVALID_REPORT_REJECTED** означает, что действующий валидатор отклонил противоречивый отчёт. **EXTERNAL_CORRECTED_REPORT** — отдельно исправленный синтетический ввод оператора, а не автоматическое исправление данных сотрудника.

## Сводка

| Сценарий | Исходно→цель | Длина | Тренировок | Пропусков | YELLOW / RED | Контрольные | Нарушения ERROR/WARNING |
| --- | --- | ---: | ---: | ---: | --- | ---: | --- |
| 01-beginner-normal-10w | 1050→896 с | 10 недель | 20 | 0 | 0/0 | 2 | 0/0 |
| 02-regular-normal-8w | 920→870 с | 8 недель | 24 | 0 | 0/0 | 1 | 0/0 |
| 03-trained-easy-wins-12w | 880→810 с | 12 недель | 48 | 0 | 0/0 | 2 | 0/0 |
| 04-advanced-normal-10w | 810→780 с | 10 недель | 50 | 0 | 0/0 | 2 | 0/0 |
| 05-regular-overload-8w | 920→870 с | 8 недель | 24 | 0 | 3/0 | 0 | 0/0 |
| 06-trained-skipped-10w | 880→810 с | 10 недель | 27 | 13 | 0/0 | 2 | 0/0 |
| 07-trained-break-12w | 880→810 с | 12 недель | 40 | 0 | 0/0 | 1 | 0/0 |
| 08-regular-red-and-review-10w | 920→870 с | 10 недель | 27 | 0 | 0/1 | 1 | 0/0 |
| 09-regular-inconsistent-report-8w | 920→870 с | 8 недель | 24 | 0 | 0/0 | 1 | 0/0 |

Везде итоговый результат совпадает с исходным *по намерению сценария*, а не потому, что тренировки бесполезны. Мы тестируем правила и границы, а не физиологию.

---

## 01-beginner-normal-10w

Начальный результат 1050 с; цель 896 с; оценка осуществимости LONG_TERM; финальный внешний результат 1050 с. Сценарий: NORMAL.

### По неделям

| Неделя | Назначено | Выполнено | Отдых | Пропущено | Быстрых | Сообщено км | Фазы | GREEN+ / GREEN / YELLOW / RED |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 2 | 2 | 0 | 0 | 1 | 4.8 | FOUNDATION | 0/2/0/0 |
| 2 | 2 | 2 | 0 | 0 | 1 | 4.8 | FOUNDATION | 0/2/0/0 |
| 3 | 2 | 2 | 0 | 0 | 1 | 5.4 | FOUNDATION | 0/2/0/0 |
| 4 | 2 | 2 | 0 | 0 | 1 | 6.0 | FOUNDATION | 0/2/0/0 |
| 5 | 2 | 2 | 0 | 0 | 1 | 4.7 | FOUNDATION | 0/2/0/0 |
| 6 | 2 | 2 | 0 | 0 | 1 | 6.0 | FOUNDATION | 0/2/0/0 |
| 7 | 2 | 2 | 0 | 0 | 1 | 6.3 | FOUNDATION | 0/2/0/0 |
| 8 | 2 | 2 | 0 | 0 | 1 | 7.0 | FOUNDATION | 0/2/0/0 |
| 9 | 2 | 2 | 0 | 0 | 1 | 6.1 | FOUNDATION | 0/2/0/0 |
| 10 | 2 | 2 | 0 | 0 | 1 | 6.5 | FOUNDATION | 0/2/0/0 |

### Что движок изменял и что произошло

| Дата | Событие | Назначение | Результат | RPE | Следующее | Фаза | Причина/смысл |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 2026-10-12 | WORKOUT_RESULT | INTRO_QUALITY / 4 MINUTES | GREEN | 5.5 | EASY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-15 | WORKOUT_RESULT | EASY / 4000 METERS | GREEN | 3 | INTRO_QUALITY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-19 | WORKOUT_RESULT | INTRO_QUALITY / 4 MINUTES | GREEN | 5.5 | EASY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN; INTRO_QUALITY future dose 4 → 6 MINUTES |
| 2026-10-22 | WORKOUT_RESULT | EASY / 3992.8571428571427 METERS | GREEN | 3 | INTRO_QUALITY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-26 | WORKOUT_RESULT | INTRO_QUALITY / 6 MINUTES | GREEN | 5.5 | EASY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-29 | WORKOUT_RESULT | EASY / 4250 METERS | GREEN | 3 | INTRO_QUALITY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-02 | WORKOUT_RESULT | EASY / 3000 METERS | GREEN | 3 | CONTROL | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-05 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-09 | EXTERNAL_3K_CHECKPOINT_UNCHANGED | — | — | — | EASY | FOUNDATION/CLOSED | External hypothetical measured time equals baseline; no invented training improvement. |
| 2026-11-09 | WORKOUT_RESULT | EASY / 3548.5714285714284 METERS | GREEN | 3 | INTRO_QUALITY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-12 | WORKOUT_RESULT | INTRO_QUALITY / 6 MINUTES | GREEN | 5.5 | EASY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN; INTRO_QUALITY future dose 6 → 8 MINUTES |
| 2026-11-16 | WORKOUT_RESULT | EASY / 4500 METERS | GREEN | 3 | INTRO_QUALITY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-19 | WORKOUT_RESULT | INTRO_QUALITY / 8 MINUTES | GREEN | 5.5 | EASY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-23 | WORKOUT_RESULT | EASY / 4750 METERS | GREEN | 3 | INTRO_QUALITY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-26 | WORKOUT_RESULT | INTRO_QUALITY / 8 MINUTES | GREEN | 5.5 | EASY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-30 | WORKOUT_RESULT | EASY / 4048.5714285714284 METERS | GREEN | 3 | CONTROL | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-03 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-07 | EXTERNAL_3K_CHECKPOINT_UNCHANGED | — | — | — | EASY | FOUNDATION/CLOSED | External hypothetical measured time equals baseline; no invented training improvement. |
| 2026-12-07 | WORKOUT_RESULT | EASY / 4548.571428571428 METERS | GREEN | 3 | INTRO_QUALITY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-10 | WORKOUT_RESULT | INTRO_QUALITY / 8 MINUTES | GREEN | 5.5 | EASY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-14 | WORKOUT_RESULT | EASY / 5000 METERS | GREEN | 3 | INTRO_QUALITY | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-17 | WORKOUT_RESULT | INTRO_QUALITY / 8 MINUTES | GREEN | 5.5 | — | FOUNDATION/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-21 | EXTERNAL_FINAL_RACE_UNCHANGED | — | — | — | — | FOUNDATION/CLOSED | Synthetic external measurement = baseline. No performance improvement is assumed or inferred. |

### Наблюдения и нарушения

Автоматические проверки симулятора не выявили нарушений заданных инвариантов. Это не оценка научной эффективности методики.


---

## 02-regular-normal-8w

Начальный результат 920 с; цель 870 с; оценка осуществимости AMBITIOUS; финальный внешний результат 920 с. Сценарий: NORMAL.

### По неделям

| Неделя | Назначено | Выполнено | Отдых | Пропущено | Быстрых | Сообщено км | Фазы | GREEN+ / GREEN / YELLOW / RED |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 3 | 3 | 0 | 0 | 1 | 12.1 | DEVELOPMENT | 0/3/0/0 |
| 2 | 3 | 3 | 0 | 0 | 1 | 12.1 | DEVELOPMENT | 0/3/0/0 |
| 3 | 3 | 3 | 0 | 0 | 1 | 12.3 | DEVELOPMENT | 0/3/0/0 |
| 4 | 3 | 3 | 0 | 0 | 1 | 14.2 | DEVELOPMENT | 0/3/0/0 |
| 5 | 3 | 3 | 0 | 0 | 1 | 13.8 | DEVELOPMENT | 0/3/0/0 |
| 6 | 3 | 3 | 0 | 0 | 1 | 14.2 | DEVELOPMENT | 0/3/0/0 |
| 7 | 3 | 3 | 0 | 0 | 1 | 14.9 | DEVELOPMENT | 0/3/0/0 |
| 8 | 3 | 3 | 0 | 0 | 1 | 7.0 | TAPER | 0/3/0/0 |

### Что движок изменял и что произошло

| Дата | Событие | Назначение | Результат | RPE | Следующее | Фаза | Причина/смысл |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 2026-10-12 | WORKOUT_RESULT | INTRO_QUALITY / 4 MINUTES | GREEN | 5.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-14 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-16 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | INTRO_QUALITY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-19 | WORKOUT_RESULT | INTRO_QUALITY / 4 MINUTES | GREEN | 5.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN; INTRO_QUALITY future dose 4 → 6 MINUTES; target gate CLOSED → PARTIAL (not itself a new pace prescription) |
| 2026-10-21 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-23 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-26 | WORKOUT_RESULT | THRESHOLD / 6 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-28 | WORKOUT_RESULT | EASY / 4827.17391304348 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-30 | WORKOUT_RESULT | LONG_EASY / 6374.999999999999 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-02 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-04 | WORKOUT_RESULT | EASY / 4827.173913043478 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-06 | WORKOUT_RESULT | LONG_EASY / 6375 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-09 | EXTERNAL_3K_CHECKPOINT_UNCHANGED | — | — | — | THRESHOLD | DEVELOPMENT/PARTIAL | External hypothetical measured time equals baseline; no invented training improvement. |
| 2026-11-09 | WORKOUT_RESULT | THRESHOLD / 6 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN; THRESHOLD future dose 6 → 8 MINUTES |
| 2026-11-11 | WORKOUT_RESULT | EASY / 6000 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-13 | WORKOUT_RESULT | LONG_EASY / 6750 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-16 | WORKOUT_RESULT | THRESHOLD / 8 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-18 | WORKOUT_RESULT | EASY / 6000 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-20 | WORKOUT_RESULT | LONG_EASY / 6750 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-23 | WORKOUT_RESULT | THRESHOLD / 8 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN; THRESHOLD future dose 8 → 10 MINUTES |
| 2026-11-25 | WORKOUT_RESULT | EASY / 6333.333333333333 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-27 | WORKOUT_RESULT | LONG_EASY / 7125 METERS | GREEN | 3 | INTRO_QUALITY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-30 | WORKOUT_RESULT | INTRO_QUALITY / 3.5999999999999996 MINUTES | GREEN | 5.5 | EASY | TAPER/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-12-02 | WORKOUT_RESULT | EASY / 3799.9999999999995 METERS | GREEN | 3 | EASY | TAPER/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-12-04 | WORKOUT_RESULT | EASY / 2533.3333333333335 METERS | GREEN | 3 | — | TAPER/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-12-07 | EXTERNAL_FINAL_RACE_UNCHANGED | — | — | — | — | TAPER/CLOSED | Synthetic external measurement = baseline. No performance improvement is assumed or inferred. |

### Наблюдения и нарушения

Автоматические проверки симулятора не выявили нарушений заданных инвариантов. Это не оценка научной эффективности методики.


---

## 03-trained-easy-wins-12w

Начальный результат 880 с; цель 810 с; оценка осуществимости PLAUSIBLE; финальный внешний результат 880 с. Сценарий: EASIER.

### По неделям

| Неделя | Назначено | Выполнено | Отдых | Пропущено | Быстрых | Сообщено км | Фазы | GREEN+ / GREEN / YELLOW / RED |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 4 | 4 | 0 | 0 | 2 | 19.9 | DEVELOPMENT | 2/2/0/0 |
| 2 | 4 | 4 | 0 | 0 | 2 | 21.7 | DEVELOPMENT | 2/2/0/0 |
| 3 | 4 | 4 | 0 | 0 | 2 | 21.7 | DEVELOPMENT | 2/2/0/0 |
| 4 | 4 | 4 | 0 | 0 | 2 | 21.7 | DEVELOPMENT | 2/2/0/0 |
| 5 | 4 | 4 | 0 | 0 | 2 | 20.4 | DEVELOPMENT | 2/2/0/0 |
| 6 | 4 | 4 | 0 | 0 | 2 | 22.3 | DEVELOPMENT | 2/2/0/0 |
| 7 | 4 | 4 | 0 | 0 | 2 | 22.3 | DEVELOPMENT | 2/2/0/0 |
| 8 | 4 | 4 | 0 | 0 | 2 | 22.3 | DEVELOPMENT | 2/2/0/0 |
| 9 | 4 | 4 | 0 | 0 | 2 | 21.3 | DEVELOPMENT | 2/2/0/0 |
| 10 | 4 | 4 | 0 | 0 | 2 | 22.3 | DEVELOPMENT | 2/2/0/0 |
| 11 | 4 | 4 | 0 | 0 | 2 | 22.4 | DEVELOPMENT | 2/2/0/0 |
| 12 | 4 | 4 | 0 | 0 | 1 | 12.5 | TAPER | 1/3/0/0 |

### Что движок изменял и что произошло

| Дата | Событие | Назначение | Результат | RPE | Следующее | Фаза | Причина/смысл |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 2026-10-12 | WORKOUT_RESULT | THRESHOLD / 12 MINUTES | GREEN_PLUS | 5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-10-13 | WORKOUT_RESULT | EASY / 7000 METERS | GREEN | 3 | VO2 | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-15 | WORKOUT_RESULT | VO2 / 8 MINUTES | GREEN_PLUS | 7 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-10-17 | WORKOUT_RESULT | LONG_EASY / 9000 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-19 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-10-20 | WORKOUT_RESULT | EASY / 6670.652173913044 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-22 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-10-24 | WORKOUT_RESULT | LONG_EASY / 9000 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-26 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-10-27 | WORKOUT_RESULT | EASY / 6670.652173913044 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-29 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-10-31 | WORKOUT_RESULT | LONG_EASY / 9000 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-02 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-11-03 | WORKOUT_RESULT | EASY / 6670.652173913044 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-05 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-11-07 | WORKOUT_RESULT | LONG_EASY / 9000 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-09 | EXTERNAL_3K_CHECKPOINT_UNCHANGED | — | — | — | THRESHOLD | DEVELOPMENT/CLOSED | External hypothetical measured time equals baseline; no invented training improvement. |
| 2026-11-09 | WORKOUT_RESULT | THRESHOLD / 12 MINUTES | GREEN_PLUS | 5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS; THRESHOLD future dose 12 → 15 MINUTES |
| 2026-11-10 | WORKOUT_RESULT | EASY / 7193.048913043479 METERS | GREEN | 3 | VO2 | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-12 | WORKOUT_RESULT | VO2 / 8 MINUTES | GREEN_PLUS | 7 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS; VO2 future dose 8 → 11 MINUTES |
| 2026-11-14 | WORKOUT_RESULT | LONG_EASY / 9321.42857142857 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-16 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-11-17 | WORKOUT_RESULT | EASY / 6928.804347826087 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-19 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-11-21 | WORKOUT_RESULT | LONG_EASY / 9321.42857142857 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-23 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-11-24 | WORKOUT_RESULT | EASY / 6928.804347826087 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-26 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-11-28 | WORKOUT_RESULT | LONG_EASY / 9321.42857142857 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-30 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-12-01 | WORKOUT_RESULT | EASY / 6928.804347826087 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-03 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-12-05 | WORKOUT_RESULT | LONG_EASY / 9321.42857142857 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-07 | EXTERNAL_3K_CHECKPOINT_UNCHANGED | — | — | — | THRESHOLD | DEVELOPMENT/CLOSED | External hypothetical measured time equals baseline; no invented training improvement. |
| 2026-12-07 | WORKOUT_RESULT | THRESHOLD / 15 MINUTES | GREEN_PLUS | 5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-12-08 | WORKOUT_RESULT | EASY / 6905.880434782609 METERS | GREEN | 3 | VO2 | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-10 | WORKOUT_RESULT | VO2 / 11 MINUTES | GREEN_PLUS | 7 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-12-12 | WORKOUT_RESULT | LONG_EASY / 9321.42857142857 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-14 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-12-15 | WORKOUT_RESULT | EASY / 6928.804347826087 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-17 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-12-19 | WORKOUT_RESULT | LONG_EASY / 9321.42857142857 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-21 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-12-22 | WORKOUT_RESULT | EASY / 7083.695652173913 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-24 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN_PLUS | 7 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2026-12-26 | WORKOUT_RESULT | LONG_EASY / 9321.42857142857 METERS | GREEN | 3 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-28 | WORKOUT_RESULT | EASY / 4350 METERS | GREEN | 3 | EASY | TAPER/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-29 | WORKOUT_RESULT | EASY / 4350 METERS | GREEN | 3 | INTRO_QUALITY | TAPER/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-31 | WORKOUT_RESULT | INTRO_QUALITY / 4.8 MINUTES | GREEN_PLUS | 4 | EASY | TAPER/CLOSED | Injected GREEN_PLUS; observed classification GREEN_PLUS |
| 2027-01-02 | WORKOUT_RESULT | EASY / 2900 METERS | GREEN | 3 | — | TAPER/CLOSED | Injected GREEN; observed classification GREEN |
| 2027-01-04 | EXTERNAL_FINAL_RACE_UNCHANGED | — | — | — | — | TAPER/CLOSED | Synthetic external measurement = baseline. No performance improvement is assumed or inferred. |

### Наблюдения и нарушения

Автоматические проверки симулятора не выявили нарушений заданных инвариантов. Это не оценка научной эффективности методики.


---

## 04-advanced-normal-10w

Начальный результат 810 с; цель 780 с; оценка осуществимости PLAUSIBLE; финальный внешний результат 810 с. Сценарий: NORMAL.

### По неделям

| Неделя | Назначено | Выполнено | Отдых | Пропущено | Быстрых | Сообщено км | Фазы | GREEN+ / GREEN / YELLOW / RED |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 5 | 5 | 0 | 0 | 2 | 36.6 | DEVELOPMENT → SPECIFIC | 0/5/0/0 |
| 2 | 5 | 5 | 0 | 0 | 2 | 36.8 | SPECIFIC | 0/5/0/0 |
| 3 | 5 | 5 | 0 | 0 | 2 | 37.1 | SPECIFIC | 0/5/0/0 |
| 4 | 5 | 5 | 0 | 0 | 2 | 36.7 | SPECIFIC | 0/5/0/0 |
| 5 | 5 | 5 | 0 | 0 | 2 | 38.5 | SPECIFIC | 0/5/0/0 |
| 6 | 5 | 5 | 0 | 0 | 2 | 38.0 | SPECIFIC | 0/5/0/0 |
| 7 | 5 | 5 | 0 | 0 | 2 | 39.3 | SPECIFIC | 0/5/0/0 |
| 8 | 5 | 5 | 0 | 0 | 2 | 38.0 | SPECIFIC | 0/5/0/0 |
| 9 | 5 | 5 | 0 | 0 | 2 | 28.6 | SPECIFIC → TAPER | 0/5/0/0 |
| 10 | 5 | 5 | 0 | 0 | 1 | 21.4 | TAPER | 0/5/0/0 |

### Что движок изменял и что произошло

| Дата | Событие | Назначение | Результат | RPE | Следующее | Фаза | Причина/смысл |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 2026-10-12 | WORKOUT_RESULT | THRESHOLD / 25 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN; target gate CLOSED → PARTIAL (not itself a new pace prescription) |
| 2026-10-13 | WORKOUT_RESULT | EASY / 7946.438596491228 METERS | GREEN | 3 | VO2 | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-14 | WORKOUT_RESULT | VO2 / 18 MINUTES | GREEN | 8.5 | EASY | SPECIFIC/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-16 | WORKOUT_RESULT | EASY / 7504.894736842103 METERS | GREEN | 3 | LONG_EASY | SPECIFIC/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-17 | WORKOUT_RESULT | LONG_EASY / 12000 METERS | GREEN | 3 | SPECIFIC_3K | SPECIFIC/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-19 | WORKOUT_RESULT | SPECIFIC_3K / 3000 METERS | GREEN | 8.5 | EASY | SPECIFIC/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-20 | WORKOUT_RESULT | EASY / 8336.842105263158 METERS | GREEN | 3 | THRESHOLD | SPECIFIC/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-21 | WORKOUT_RESULT | THRESHOLD / 25 MINUTES | GREEN | 6.5 | EASY | SPECIFIC/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-23 | WORKOUT_RESULT | EASY / 8336.842105263157 METERS | GREEN | 3 | LONG_EASY | SPECIFIC/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-24 | WORKOUT_RESULT | LONG_EASY / 12000 METERS | GREEN | 3 | SPECIFIC_3K | SPECIFIC/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-26 | WORKOUT_RESULT | SPECIFIC_3K / 3000 METERS | GREEN | 8.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN; target gate PARTIAL → OPEN (not itself a new pace prescription) |
| 2026-10-27 | WORKOUT_RESULT | EASY / 8924.216374269006 METERS | GREEN | 3 | VO2 | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-10-28 | WORKOUT_RESULT | VO2 / 18 MINUTES | GREEN | 8.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-10-30 | WORKOUT_RESULT | EASY / 8924.216374269006 METERS | GREEN | 3 | LONG_EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-10-31 | WORKOUT_RESULT | LONG_EASY / 12266.666666666666 METERS | GREEN | 3 | SPECIFIC_3K | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-02 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-03 | WORKOUT_RESULT | EASY / 9200 METERS | GREEN | 3 | CONTROL | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-04 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-06 | WORKOUT_RESULT | EASY / 9200 METERS | GREEN | 3 | LONG_EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-07 | WORKOUT_RESULT | LONG_EASY / 12266.666666666666 METERS | GREEN | 3 | CONTROL | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-09 | EXTERNAL_3K_CHECKPOINT_UNCHANGED | — | — | — | SPECIFIC_3K | SPECIFIC/OPEN | External hypothetical measured time equals baseline; no invented training improvement. |
| 2026-11-09 | WORKOUT_RESULT | SPECIFIC_3K / 3000 METERS | GREEN | 8.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-10 | WORKOUT_RESULT | EASY / 8915.78947368421 METERS | GREEN | 3 | THRESHOLD | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-11 | WORKOUT_RESULT | THRESHOLD / 25 MINUTES | GREEN | 6.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-13 | WORKOUT_RESULT | EASY / 8915.789473684208 METERS | GREEN | 3 | LONG_EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-14 | WORKOUT_RESULT | LONG_EASY / 12533.333333333334 METERS | GREEN | 3 | SPECIFIC_3K | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-16 | WORKOUT_RESULT | SPECIFIC_3K / 3000 METERS | GREEN | 8.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-17 | WORKOUT_RESULT | EASY / 9213.690058479531 METERS | GREEN | 3 | VO2 | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-18 | WORKOUT_RESULT | VO2 / 18 MINUTES | GREEN | 8.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-20 | WORKOUT_RESULT | EASY / 9213.690058479531 METERS | GREEN | 3 | LONG_EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-21 | WORKOUT_RESULT | LONG_EASY / 12533.333333333334 METERS | GREEN | 3 | SPECIFIC_3K | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-23 | WORKOUT_RESULT | SPECIFIC_3K / 3000 METERS | GREEN | 8.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-24 | WORKOUT_RESULT | EASY / 9205.263157894737 METERS | GREEN | 3 | THRESHOLD | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-25 | WORKOUT_RESULT | THRESHOLD / 25 MINUTES | GREEN | 6.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-27 | WORKOUT_RESULT | EASY / 9205.263157894735 METERS | GREEN | 3 | LONG_EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-28 | WORKOUT_RESULT | LONG_EASY / 12800 METERS | GREEN | 3 | SPECIFIC_3K | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-11-30 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-01 | WORKOUT_RESULT | EASY / 9600 METERS | GREEN | 3 | CONTROL | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-02 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-04 | WORKOUT_RESULT | EASY / 9600 METERS | GREEN | 3 | LONG_EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-05 | WORKOUT_RESULT | LONG_EASY / 12800 METERS | GREEN | 3 | CONTROL | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-07 | EXTERNAL_3K_CHECKPOINT_UNCHANGED | — | — | — | SPECIFIC_3K | SPECIFIC/OPEN | External hypothetical measured time equals baseline; no invented training improvement. |
| 2026-12-07 | WORKOUT_RESULT | SPECIFIC_3K / 3000 METERS | GREEN | 8.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-08 | WORKOUT_RESULT | EASY / 9800 METERS | GREEN | 3 | VO2 | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-09 | WORKOUT_RESULT | VO2 / 18 MINUTES | GREEN | 8.5 | EASY | SPECIFIC/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-11 | WORKOUT_RESULT | EASY / 5880 METERS | GREEN | 3 | EASY | TAPER/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-12 | WORKOUT_RESULT | EASY / 5880 METERS | GREEN | 3 | EASY | TAPER/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-14 | WORKOUT_RESULT | EASY / 5880 METERS | GREEN | 3 | EASY | TAPER/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-15 | WORKOUT_RESULT | EASY / 5880 METERS | GREEN | 3 | SPECIFIC_3K | TAPER/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-16 | WORKOUT_RESULT | SPECIFIC_3K / 1800 METERS | GREEN | 8.5 | EASY | TAPER/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-18 | WORKOUT_RESULT | EASY / 3920 METERS | GREEN | 3 | EASY | TAPER/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-19 | WORKOUT_RESULT | EASY / 3920 METERS | GREEN | 3 | — | TAPER/OPEN | Injected GREEN; observed classification GREEN |
| 2026-12-21 | EXTERNAL_FINAL_RACE_UNCHANGED | — | — | — | — | TAPER/CLOSED | Synthetic external measurement = baseline. No performance improvement is assumed or inferred. |

### Наблюдения и нарушения

Автоматические проверки симулятора не выявили нарушений заданных инвариантов. Это не оценка научной эффективности методики.


---

## 05-regular-overload-8w

Начальный результат 920 с; цель 870 с; оценка осуществимости AMBITIOUS; финальный внешний результат 920 с. Сценарий: OVERLOAD.

### По неделям

| Неделя | Назначено | Выполнено | Отдых | Пропущено | Быстрых | Сообщено км | Фазы | GREEN+ / GREEN / YELLOW / RED |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 3 | 3 | 0 | 0 | 1 | 12.1 | DEVELOPMENT | 0/3/0/0 |
| 2 | 3 | 3 | 0 | 0 | 1 | 11.9 | DEVELOPMENT | 0/2/1/0 |
| 3 | 3 | 3 | 0 | 0 | 1 | 11.0 | DEVELOPMENT | 0/3/0/0 |
| 4 | 3 | 3 | 0 | 0 | 1 | 12.3 | DEVELOPMENT | 0/2/1/0 |
| 5 | 3 | 3 | 0 | 0 | 1 | 13.2 | DEVELOPMENT | 0/3/0/0 |
| 6 | 3 | 3 | 0 | 0 | 1 | 12.3 | DEVELOPMENT | 0/2/1/0 |
| 7 | 3 | 3 | 0 | 0 | 1 | 12.5 | DEVELOPMENT → HOLD_DIAGNOSTIC | 0/3/0/0 |
| 8 | 3 | 3 | 0 | 0 | 0 | 12.8 | HOLD_DIAGNOSTIC | 0/3/0/0 |

### Что движок изменял и что произошло

| Дата | Событие | Назначение | Результат | RPE | Следующее | Фаза | Причина/смысл |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 2026-10-12 | WORKOUT_RESULT | INTRO_QUALITY / 4 MINUTES | GREEN | 5.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-14 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-16 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | INTRO_QUALITY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-19 | WORKOUT_RESULT | INTRO_QUALITY / 4 MINUTES | YELLOW | 8 | EASY | DEVELOPMENT/CLOSED | Injected YELLOW; observed classification YELLOW / RECOVERY |
| 2026-10-21 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-23 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | INTRO_QUALITY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-26 | WORKOUT_RESULT | INTRO_QUALITY / 4 MINUTES | GREEN | 5.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN; target gate CLOSED → PARTIAL (not itself a new pace prescription) |
| 2026-10-28 | WORKOUT_RESULT | EASY / 4202.173913043478 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-30 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-02 | WORKOUT_RESULT | CONTROL / 3000 METERS | YELLOW | 10 | EASY | DEVELOPMENT/CLOSED | Injected YELLOW; observed classification YELLOW / RECOVERY; target gate PARTIAL → CLOSED (not itself a new pace prescription) |
| 2026-11-04 | WORKOUT_RESULT | EASY / 4202.173913043478 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN; target gate CLOSED → PARTIAL (not itself a new pace prescription) |
| 2026-11-06 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-09 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-11 | WORKOUT_RESULT | EASY / 4202.173913043478 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-13 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-16 | WORKOUT_RESULT | CONTROL / 3000 METERS | YELLOW | 10 | EASY | DEVELOPMENT/CLOSED | Injected YELLOW; observed classification YELLOW / RECOVERY; target gate PARTIAL → CLOSED (not itself a new pace prescription) |
| 2026-11-18 | WORKOUT_RESULT | EASY / 4202.173913043478 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN; target gate CLOSED → PARTIAL (not itself a new pace prescription) |
| 2026-11-20 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-23 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-25 | WORKOUT_RESULT | EASY / 4202.173913043478 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-27 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-30 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-02 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-04 | WORKOUT_RESULT | EASY / 2133.3333333333335 METERS | GREEN | 3 | — | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-07 | EXTERNAL_FINAL_RACE_UNCHANGED | — | — | — | — | TAPER/CLOSED | Synthetic external measurement = baseline. No performance improvement is assumed or inferred. |

### Наблюдения и нарушения

Автоматические проверки симулятора не выявили нарушений заданных инвариантов. Это не оценка научной эффективности методики.


---

## 06-trained-skipped-10w

Начальный результат 880 с; цель 810 с; оценка осуществимости PLAUSIBLE; финальный внешний результат 880 с. Сценарий: SKIP_EVERY_THIRD.

### По неделям

| Неделя | Назначено | Выполнено | Отдых | Пропущено | Быстрых | Сообщено км | Фазы | GREEN+ / GREEN / YELLOW / RED |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 4 | 3 | 0 | 1 | 1 | 18.3 | DEVELOPMENT | 0/3/0/0 |
| 2 | 4 | 3 | 0 | 1 | 2 | 12.9 | DEVELOPMENT | 0/3/0/0 |
| 3 | 4 | 2 | 0 | 2 | 1 | 8.4 | DEVELOPMENT | 0/2/0/0 |
| 4 | 4 | 3 | 0 | 1 | 1 | 18.5 | DEVELOPMENT | 0/3/0/0 |
| 5 | 4 | 3 | 0 | 1 | 2 | 14.1 | DEVELOPMENT | 0/3/0/0 |
| 6 | 4 | 2 | 0 | 2 | 1 | 9.2 | DEVELOPMENT | 0/2/0/0 |
| 7 | 4 | 3 | 0 | 1 | 1 | 16.3 | DEVELOPMENT | 0/3/0/0 |
| 8 | 4 | 3 | 0 | 1 | 2 | 15.0 | DEVELOPMENT | 0/3/0/0 |
| 9 | 4 | 2 | 0 | 2 | 1 | 8.4 | DEVELOPMENT | 0/2/0/0 |
| 10 | 4 | 3 | 0 | 1 | 0 | 11.2 | TAPER | 0/3/0/0 |

### Что движок изменял и что произошло

| Дата | Событие | Назначение | Результат | RPE | Следующее | Фаза | Причина/смысл |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 2026-10-12 | WORKOUT_RESULT | THRESHOLD / 12 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-13 | WORKOUT_RESULT | EASY / 7000 METERS | GREEN | 3 | VO2 | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-15 | SKIPPED | VO2 / 8 MINUTES | — | — | LONG_EASY | DEVELOPMENT/CLOSED | Explicit miss; no compensatory workload. |
| 2026-10-17 | WORKOUT_RESULT | LONG_EASY / 9000 METERS | GREEN | 3 | VO2 | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-19 | WORKOUT_RESULT | VO2 / 8 MINUTES | GREEN | 8.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-20 | SKIPPED | EASY / 7000 METERS | — | — | THRESHOLD | DEVELOPMENT/CLOSED | Explicit miss; no compensatory workload. |
| 2026-10-22 | WORKOUT_RESULT | THRESHOLD / 12 MINUTES | GREEN | 6.5 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN; THRESHOLD future dose 12 → 15 MINUTES |
| 2026-10-24 | WORKOUT_RESULT | LONG_EASY / 9000 METERS | GREEN | 3 | VO2 | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-26 | SKIPPED | VO2 / 8 MINUTES | — | — | EASY | DEVELOPMENT/CLOSED | Explicit miss; no compensatory workload. |
| 2026-10-27 | WORKOUT_RESULT | EASY / 6780.005434782609 METERS | GREEN | 3 | VO2 | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-29 | WORKOUT_RESULT | VO2 / 8 MINUTES | GREEN | 8.5 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN; VO2 future dose 8 → 11 MINUTES |
| 2026-10-31 | SKIPPED | LONG_EASY / 9000 METERS | — | — | THRESHOLD | DEVELOPMENT/CLOSED | Explicit miss; no compensatory workload. |
| 2026-11-02 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-03 | WORKOUT_RESULT | EASY / 6515.760869565218 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-05 | SKIPPED | CONTROL / 3000 METERS | — | — | LONG_EASY | DEVELOPMENT/CLOSED | Explicit miss; no compensatory workload. |
| 2026-11-07 | WORKOUT_RESULT | LONG_EASY / 9000 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-09 | EXTERNAL_3K_CHECKPOINT_UNCHANGED | — | — | — | THRESHOLD | DEVELOPMENT/CLOSED | External hypothetical measured time equals baseline; no invented training improvement. |
| 2026-11-09 | WORKOUT_RESULT | THRESHOLD / 15 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-10 | SKIPPED | EASY / 6492.836956521738 METERS | — | — | VO2 | DEVELOPMENT/CLOSED | Explicit miss; no compensatory workload. |
| 2026-11-12 | WORKOUT_RESULT | VO2 / 11 MINUTES | GREEN | 8.5 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-14 | WORKOUT_RESULT | LONG_EASY / 9000 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-16 | SKIPPED | THRESHOLD / 15 MINUTES | — | — | EASY | DEVELOPMENT/CLOSED | Explicit miss; no compensatory workload. |
| 2026-11-17 | WORKOUT_RESULT | EASY / 6360.86956521739 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-19 | WORKOUT_RESULT | THRESHOLD / 15 MINUTES | GREEN | 6.5 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN; THRESHOLD future dose 15 → 18 MINUTES |
| 2026-11-21 | SKIPPED | LONG_EASY / 9000 METERS | — | — | VO2 | DEVELOPMENT/CLOSED | Explicit miss; no compensatory workload. |
| 2026-11-23 | WORKOUT_RESULT | VO2 / 11 MINUTES | GREEN | 8.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN; VO2 future dose 11 → 14 MINUTES |
| 2026-11-24 | WORKOUT_RESULT | EASY / 5349.249999999998 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-26 | SKIPPED | THRESHOLD / 18 MINUTES | — | — | LONG_EASY | DEVELOPMENT/CLOSED | Explicit miss; no compensatory workload. |
| 2026-11-28 | WORKOUT_RESULT | LONG_EASY / 8700.75 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-30 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-01 | SKIPPED | EASY / 6100 METERS | — | — | CONTROL | DEVELOPMENT/CLOSED | Explicit miss; no compensatory workload. |
| 2026-12-03 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-05 | WORKOUT_RESULT | LONG_EASY / 9000 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-07 | EXTERNAL_3K_CHECKPOINT_UNCHANGED | — | — | — | THRESHOLD | DEVELOPMENT/CLOSED | External hypothetical measured time equals baseline; no invented training improvement. |
| 2026-12-07 | SKIPPED | THRESHOLD / 18 MINUTES | — | — | EASY | DEVELOPMENT/CLOSED | Explicit miss; no compensatory workload. |
| 2026-12-08 | WORKOUT_RESULT | EASY / 5049.999999999998 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-10 | WORKOUT_RESULT | THRESHOLD / 18 MINUTES | GREEN | 6.5 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-12 | SKIPPED | LONG_EASY / 9000 METERS | — | — | EASY | DEVELOPMENT/CLOSED | Explicit miss; no compensatory workload. |
| 2026-12-14 | WORKOUT_RESULT | EASY / 4200 METERS | GREEN | 3 | EASY | TAPER/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-15 | WORKOUT_RESULT | EASY / 4200 METERS | GREEN | 3 | INTRO_QUALITY | TAPER/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-17 | SKIPPED | INTRO_QUALITY / 4.8 MINUTES | — | — | EASY | TAPER/CLOSED | Explicit miss; no compensatory workload. |
| 2026-12-19 | WORKOUT_RESULT | EASY / 2800 METERS | GREEN | 3 | — | TAPER/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-21 | EXTERNAL_FINAL_RACE_UNCHANGED | — | — | — | — | TAPER/CLOSED | Synthetic external measurement = baseline. No performance improvement is assumed or inferred. |

### Наблюдения и нарушения

Автоматические проверки симулятора не выявили нарушений заданных инвариантов. Это не оценка научной эффективности методики.


---

## 07-trained-break-12w

Начальный результат 880 с; цель 810 с; оценка осуществимости PLAUSIBLE; финальный внешний результат 880 с. Сценарий: WORK_BREAK.

### По неделям

| Неделя | Назначено | Выполнено | Отдых | Пропущено | Быстрых | Сообщено км | Фазы | GREEN+ / GREEN / YELLOW / RED |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 4 | 4 | 0 | 0 | 2 | 19.9 | DEVELOPMENT | 0/4/0/0 |
| 2 | 4 | 4 | 0 | 0 | 2 | 19.7 | DEVELOPMENT | 0/4/0/0 |
| 3 | 4 | 4 | 0 | 0 | 2 | 20.9 | DEVELOPMENT | 0/4/0/0 |
| 4 | 4 | 4 | 0 | 0 | 2 | 22.3 | DEVELOPMENT | 0/4/0/0 |
| 5 | 0 | 0 | 0 | 0 | 0 | 0.0 | DEVELOPMENT | 0/0/0/0 |
| 6 | 0 | 0 | 0 | 0 | 0 | 0.0 | DEVELOPMENT | 0/0/0/0 |
| 7 | 4 | 4 | 0 | 0 | 1 | 19.5 | RE_ENTRY → HOLD_DIAGNOSTIC | 0/4/0/0 |
| 8 | 4 | 4 | 0 | 0 | 0 | 29.0 | HOLD_DIAGNOSTIC | 0/4/0/0 |
| 9 | 4 | 4 | 0 | 0 | 0 | 29.0 | HOLD_DIAGNOSTIC | 0/4/0/0 |
| 10 | 4 | 4 | 0 | 0 | 0 | 29.0 | HOLD_DIAGNOSTIC | 0/4/0/0 |
| 11 | 4 | 4 | 0 | 0 | 2 | 20.9 | DEVELOPMENT | 0/4/0/0 |
| 12 | 4 | 4 | 0 | 0 | 1 | 12.5 | TAPER | 0/4/0/0 |

### Что движок изменял и что произошло

| Дата | Событие | Назначение | Результат | RPE | Следующее | Фаза | Причина/смысл |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 2026-10-12 | WORKOUT_RESULT | THRESHOLD / 12 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-13 | WORKOUT_RESULT | EASY / 7000 METERS | GREEN | 3 | VO2 | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-15 | WORKOUT_RESULT | VO2 / 8 MINUTES | GREEN | 8.5 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-17 | WORKOUT_RESULT | LONG_EASY / 9000 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-19 | WORKOUT_RESULT | THRESHOLD / 12 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN; THRESHOLD future dose 12 → 15 MINUTES |
| 2026-10-20 | WORKOUT_RESULT | EASY / 6780.005434782609 METERS | GREEN | 3 | VO2 | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-22 | WORKOUT_RESULT | VO2 / 8 MINUTES | GREEN | 8.5 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN; VO2 future dose 8 → 11 MINUTES |
| 2026-10-24 | WORKOUT_RESULT | LONG_EASY / 9000 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-26 | WORKOUT_RESULT | THRESHOLD / 15 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-27 | WORKOUT_RESULT | EASY / 6492.836956521738 METERS | GREEN | 3 | VO2 | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-29 | WORKOUT_RESULT | VO2 / 11 MINUTES | GREEN | 8.5 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-31 | WORKOUT_RESULT | LONG_EASY / 9321.42857142857 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-02 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-03 | WORKOUT_RESULT | EASY / 6928.804347826087 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-05 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-07 | WORKOUT_RESULT | LONG_EASY / 9321.42857142857 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-23 | EXTERNAL_WORK_BREAK | — | — | — | EASY | RE_ENTRY/CLOSED | Externally reported 14-day work absence; overdue sessions skipped, never made up. |
| 2026-11-23 | WORKOUT_RESULT | EASY / 5075 METERS | GREEN | 3 | EASY | RE_ENTRY/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-24 | WORKOUT_RESULT | EASY / 5075 METERS | GREEN | 3 | THRESHOLD | RE_ENTRY/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-26 | WORKOUT_RESULT | THRESHOLD / 11.25 MINUTES | GREEN | 6.5 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-28 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-30 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-01 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-03 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-05 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-07 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-08 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-10 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-12 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-14 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-15 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-17 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-19 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-21 | EXTERNAL_3K_CHECKPOINT_UNCHANGED | — | — | — | VO2 | DEVELOPMENT/CLOSED | External hypothetical measured time equals baseline; no invented training improvement. |
| 2026-12-21 | WORKOUT_RESULT | VO2 / 11 MINUTES | GREEN | 8.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-22 | WORKOUT_RESULT | EASY / 7250 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-24 | WORKOUT_RESULT | THRESHOLD / 11.25 MINUTES | GREEN | 6.5 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-26 | WORKOUT_RESULT | LONG_EASY / 9321.42857142857 METERS | GREEN | 3 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-28 | WORKOUT_RESULT | EASY / 4350 METERS | GREEN | 3 | EASY | TAPER/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-29 | WORKOUT_RESULT | EASY / 4350 METERS | GREEN | 3 | INTRO_QUALITY | TAPER/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-31 | WORKOUT_RESULT | INTRO_QUALITY / 4.8 MINUTES | GREEN | 5.5 | EASY | TAPER/CLOSED | Injected GREEN; observed classification GREEN |
| 2027-01-02 | WORKOUT_RESULT | EASY / 2900 METERS | GREEN | 3 | — | TAPER/CLOSED | Injected GREEN; observed classification GREEN |
| 2027-01-04 | EXTERNAL_FINAL_RACE_UNCHANGED | — | — | — | — | TAPER/CLOSED | Synthetic external measurement = baseline. No performance improvement is assumed or inferred. |

### Наблюдения и нарушения

Автоматические проверки симулятора не выявили нарушений заданных инвариантов. Это не оценка научной эффективности методики.


---

## 08-regular-red-and-review-10w

Начальный результат 920 с; цель 870 с; оценка осуществимости AMBITIOUS; финальный внешний результат 920 с. Сценарий: RED_AND_REVIEW.

### По неделям

| Неделя | Назначено | Выполнено | Отдых | Пропущено | Быстрых | Сообщено км | Фазы | GREEN+ / GREEN / YELLOW / RED |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 3 | 1 | 2 | 0 | 1 | 0.8 | HOLD_DIAGNOSTIC | 0/0/0/1 |
| 2 | 3 | 2 | 1 | 0 | 1 | 6.8 | HOLD_DIAGNOSTIC → DEVELOPMENT | 0/2/0/0 |
| 3 | 3 | 3 | 0 | 0 | 1 | 12.1 | DEVELOPMENT | 0/3/0/0 |
| 4 | 3 | 3 | 0 | 0 | 1 | 11.6 | DEVELOPMENT | 0/3/0/0 |
| 5 | 3 | 3 | 0 | 0 | 1 | 11.6 | DEVELOPMENT | 0/3/0/0 |
| 6 | 3 | 3 | 0 | 0 | 1 | 11.6 | DEVELOPMENT | 0/3/0/0 |
| 7 | 3 | 3 | 0 | 0 | 0 | 16.0 | DEVELOPMENT → HOLD_DIAGNOSTIC | 0/3/0/0 |
| 8 | 3 | 3 | 0 | 0 | 0 | 16.0 | HOLD_DIAGNOSTIC | 0/3/0/0 |
| 9 | 3 | 3 | 0 | 0 | 1 | 12.3 | DEVELOPMENT | 0/3/0/0 |
| 10 | 3 | 3 | 0 | 0 | 1 | 6.0 | TAPER | 0/3/0/0 |

### Что движок изменял и что произошло

| Дата | Событие | Назначение | Результат | RPE | Следующее | Фаза | Причина/смысл |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 2026-10-12 | WORKOUT_RESULT | INTRO_QUALITY / 4 MINUTES | RED | 5.5 | REST | HOLD_DIAGNOSTIC/CLOSED | Injected RED; observed classification RED |
| 2026-10-14 | REST_DAY | REST / 0 MINUTES | GREEN | 0 | REST | HOLD_DIAGNOSTIC/CLOSED | Engine prescribed REST; recorded as rest, not a completed running session. |
| 2026-10-16 | REST_DAY | REST / 0 MINUTES | GREEN | 0 | REST | HOLD_DIAGNOSTIC/CLOSED | Engine prescribed REST; recorded as rest, not a completed running session. |
| 2026-10-19 | REST_DAY | REST / 0 MINUTES | GREEN | 0 | REST | HOLD_DIAGNOSTIC/CLOSED | Engine prescribed REST; recorded as rest, not a completed running session. |
| 2026-10-21 | EXTERNAL_MEDICAL_REVIEW | — | — | — | INTRO_QUALITY | DEVELOPMENT/CLOSED | Explicit hypothetical medical clearance; not an app-granted permission. |
| 2026-10-21 | WORKOUT_RESULT | INTRO_QUALITY / 4 MINUTES | GREEN | 5.5 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-23 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-26 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | INTRO_QUALITY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-28 | WORKOUT_RESULT | INTRO_QUALITY / 4 MINUTES | GREEN | 5.5 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN; INTRO_QUALITY future dose 4 → 6 MINUTES; target gate CLOSED → PARTIAL (not itself a new pace prescription) |
| 2026-10-30 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-02 | WORKOUT_RESULT | EASY / 4202.173913043478 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-04 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-06 | WORKOUT_RESULT | EASY / 4404.347826086956 METERS | GREEN | 3 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-09 | WORKOUT_RESULT | EASY / 4202.173913043478 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-11 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-13 | WORKOUT_RESULT | EASY / 4404.347826086956 METERS | GREEN | 3 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-16 | WORKOUT_RESULT | EASY / 4202.173913043478 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-18 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-20 | WORKOUT_RESULT | EASY / 4404.347826086956 METERS | GREEN | 3 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-23 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-25 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-27 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-11-30 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-02 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-04 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | EASY | HOLD_DIAGNOSTIC/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-07 | EXTERNAL_3K_CHECKPOINT_UNCHANGED | — | — | — | INTRO_QUALITY | DEVELOPMENT/CLOSED | External hypothetical measured time equals baseline; no invented training improvement. |
| 2026-12-07 | WORKOUT_RESULT | INTRO_QUALITY / 6 MINUTES | GREEN | 5.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-09 | WORKOUT_RESULT | EASY / 5193.922924901185 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-11 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | INTRO_QUALITY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-12-14 | WORKOUT_RESULT | INTRO_QUALITY / 3.5999999999999996 MINUTES | GREEN | 5.5 | EASY | TAPER/PARTIAL | Injected GREEN; observed classification GREEN; target gate CLOSED → PARTIAL (not itself a new pace prescription) |
| 2026-12-16 | WORKOUT_RESULT | EASY / 3199.9999999999995 METERS | GREEN | 3 | EASY | TAPER/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-12-18 | WORKOUT_RESULT | EASY / 2133.3333333333335 METERS | GREEN | 3 | — | TAPER/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-12-21 | EXTERNAL_FINAL_RACE_UNCHANGED | — | — | — | — | TAPER/CLOSED | Synthetic external measurement = baseline. No performance improvement is assumed or inferred. |

### Наблюдения и нарушения

Автоматические проверки симулятора не выявили нарушений заданных инвариантов. Это не оценка научной эффективности методики.


---

## 09-regular-inconsistent-report-8w

Начальный результат 920 с; цель 870 с; оценка осуществимости AMBITIOUS; финальный внешний результат 920 с. Сценарий: CONTRADICTORY_REPORT.

### По неделям

| Неделя | Назначено | Выполнено | Отдых | Пропущено | Быстрых | Сообщено км | Фазы | GREEN+ / GREEN / YELLOW / RED |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 3 | 3 | 0 | 0 | 1 | 12.1 | DEVELOPMENT | 0/3/0/0 |
| 2 | 3 | 3 | 0 | 0 | 1 | 12.1 | DEVELOPMENT | 0/3/0/0 |
| 3 | 3 | 3 | 0 | 0 | 1 | 12.3 | DEVELOPMENT | 0/3/0/0 |
| 4 | 3 | 3 | 0 | 0 | 1 | 14.2 | DEVELOPMENT | 0/3/0/0 |
| 5 | 3 | 3 | 0 | 0 | 1 | 13.8 | DEVELOPMENT | 0/3/0/0 |
| 6 | 3 | 3 | 0 | 0 | 1 | 14.2 | DEVELOPMENT | 0/3/0/0 |
| 7 | 3 | 3 | 0 | 0 | 1 | 14.9 | DEVELOPMENT | 0/3/0/0 |
| 8 | 3 | 3 | 0 | 0 | 1 | 7.0 | TAPER | 0/3/0/0 |

### Что движок изменял и что произошло

| Дата | Событие | Назначение | Результат | RPE | Следующее | Фаза | Причина/смысл |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 2026-10-12 | INVALID_REPORT_REJECTED | INTRO_QUALITY / 4 MINUTES | — | 5.5 | INTRO_QUALITY | DEVELOPMENT/CLOSED | Engine rejected inconsistent measurements: RESULT_DISTANCE_CONFLICT. |
| 2026-10-12 | EXTERNAL_CORRECTED_REPORT | INTRO_QUALITY / 4 MINUTES | — | — | INTRO_QUALITY | DEVELOPMENT/CLOSED | Explicit corrected hypothetical report after the rejected attempt. |
| 2026-10-12 | WORKOUT_RESULT | INTRO_QUALITY / 4 MINUTES | GREEN | 5.5 | EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-14 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-16 | INVALID_REPORT_REJECTED | LONG_EASY / 6000 METERS | — | 3 | LONG_EASY | DEVELOPMENT/CLOSED | Engine rejected inconsistent measurements: RESULT_DISTANCE_CONFLICT. |
| 2026-10-16 | EXTERNAL_CORRECTED_REPORT | LONG_EASY / 6000 METERS | — | — | LONG_EASY | DEVELOPMENT/CLOSED | Explicit corrected hypothetical report after the rejected attempt. |
| 2026-10-16 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | INTRO_QUALITY | DEVELOPMENT/CLOSED | Injected GREEN; observed classification GREEN |
| 2026-10-19 | WORKOUT_RESULT | INTRO_QUALITY / 4 MINUTES | GREEN | 5.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN; INTRO_QUALITY future dose 4 → 6 MINUTES; target gate CLOSED → PARTIAL (not itself a new pace prescription) |
| 2026-10-21 | INVALID_REPORT_REJECTED | EASY / 5333.333333333333 METERS | — | 3 | EASY | DEVELOPMENT/PARTIAL | Engine rejected inconsistent measurements: RESULT_DISTANCE_CONFLICT. |
| 2026-10-21 | EXTERNAL_CORRECTED_REPORT | EASY / 5333.333333333333 METERS | — | — | EASY | DEVELOPMENT/PARTIAL | Explicit corrected hypothetical report after the rejected attempt. |
| 2026-10-21 | WORKOUT_RESULT | EASY / 5333.333333333333 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-23 | WORKOUT_RESULT | LONG_EASY / 6000 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-26 | INVALID_REPORT_REJECTED | THRESHOLD / 6 MINUTES | — | 6.5 | THRESHOLD | DEVELOPMENT/PARTIAL | Engine rejected inconsistent measurements: RESULT_DISTANCE_CONFLICT. |
| 2026-10-26 | EXTERNAL_CORRECTED_REPORT | THRESHOLD / 6 MINUTES | — | — | THRESHOLD | DEVELOPMENT/PARTIAL | Explicit corrected hypothetical report after the rejected attempt. |
| 2026-10-26 | WORKOUT_RESULT | THRESHOLD / 6 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-28 | WORKOUT_RESULT | EASY / 4827.17391304348 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-10-30 | INVALID_REPORT_REJECTED | LONG_EASY / 6374.999999999999 METERS | — | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Engine rejected inconsistent measurements: RESULT_DISTANCE_CONFLICT. |
| 2026-10-30 | EXTERNAL_CORRECTED_REPORT | LONG_EASY / 6374.999999999999 METERS | — | — | LONG_EASY | DEVELOPMENT/PARTIAL | Explicit corrected hypothetical report after the rejected attempt. |
| 2026-10-30 | WORKOUT_RESULT | LONG_EASY / 6374.999999999999 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-02 | WORKOUT_RESULT | CONTROL / 3000 METERS | GREEN | 8.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-04 | WORKOUT_RESULT | EASY / 4827.173913043478 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-06 | INVALID_REPORT_REJECTED | LONG_EASY / 6375 METERS | — | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Engine rejected inconsistent measurements: RESULT_DISTANCE_CONFLICT. |
| 2026-11-06 | EXTERNAL_CORRECTED_REPORT | LONG_EASY / 6375 METERS | — | — | LONG_EASY | DEVELOPMENT/PARTIAL | Explicit corrected hypothetical report after the rejected attempt. |
| 2026-11-06 | WORKOUT_RESULT | LONG_EASY / 6375 METERS | GREEN | 3 | CONTROL | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-09 | EXTERNAL_3K_CHECKPOINT_UNCHANGED | — | — | — | THRESHOLD | DEVELOPMENT/PARTIAL | External hypothetical measured time equals baseline; no invented training improvement. |
| 2026-11-09 | WORKOUT_RESULT | THRESHOLD / 6 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN; THRESHOLD future dose 6 → 8 MINUTES |
| 2026-11-11 | INVALID_REPORT_REJECTED | EASY / 6000 METERS | — | 3 | EASY | DEVELOPMENT/PARTIAL | Engine rejected inconsistent measurements: RESULT_DISTANCE_CONFLICT. |
| 2026-11-11 | EXTERNAL_CORRECTED_REPORT | EASY / 6000 METERS | — | — | EASY | DEVELOPMENT/PARTIAL | Explicit corrected hypothetical report after the rejected attempt. |
| 2026-11-11 | WORKOUT_RESULT | EASY / 6000 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-13 | WORKOUT_RESULT | LONG_EASY / 6750 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-16 | INVALID_REPORT_REJECTED | THRESHOLD / 8 MINUTES | — | 6.5 | THRESHOLD | DEVELOPMENT/PARTIAL | Engine rejected inconsistent measurements: RESULT_DISTANCE_CONFLICT. |
| 2026-11-16 | EXTERNAL_CORRECTED_REPORT | THRESHOLD / 8 MINUTES | — | — | THRESHOLD | DEVELOPMENT/PARTIAL | Explicit corrected hypothetical report after the rejected attempt. |
| 2026-11-16 | WORKOUT_RESULT | THRESHOLD / 8 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-18 | WORKOUT_RESULT | EASY / 6000 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-20 | INVALID_REPORT_REJECTED | LONG_EASY / 6750 METERS | — | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Engine rejected inconsistent measurements: RESULT_DISTANCE_CONFLICT. |
| 2026-11-20 | EXTERNAL_CORRECTED_REPORT | LONG_EASY / 6750 METERS | — | — | LONG_EASY | DEVELOPMENT/PARTIAL | Explicit corrected hypothetical report after the rejected attempt. |
| 2026-11-20 | WORKOUT_RESULT | LONG_EASY / 6750 METERS | GREEN | 3 | THRESHOLD | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-23 | WORKOUT_RESULT | THRESHOLD / 8 MINUTES | GREEN | 6.5 | EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN; THRESHOLD future dose 8 → 10 MINUTES |
| 2026-11-25 | INVALID_REPORT_REJECTED | EASY / 6333.333333333333 METERS | — | 3 | EASY | DEVELOPMENT/PARTIAL | Engine rejected inconsistent measurements: RESULT_DISTANCE_CONFLICT. |
| 2026-11-25 | EXTERNAL_CORRECTED_REPORT | EASY / 6333.333333333333 METERS | — | — | EASY | DEVELOPMENT/PARTIAL | Explicit corrected hypothetical report after the rejected attempt. |
| 2026-11-25 | WORKOUT_RESULT | EASY / 6333.333333333333 METERS | GREEN | 3 | LONG_EASY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-27 | WORKOUT_RESULT | LONG_EASY / 7125 METERS | GREEN | 3 | INTRO_QUALITY | DEVELOPMENT/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-11-30 | INVALID_REPORT_REJECTED | INTRO_QUALITY / 3.5999999999999996 MINUTES | — | 5.5 | INTRO_QUALITY | TAPER/PARTIAL | Engine rejected inconsistent measurements: RESULT_DISTANCE_CONFLICT. |
| 2026-11-30 | EXTERNAL_CORRECTED_REPORT | INTRO_QUALITY / 3.5999999999999996 MINUTES | — | — | INTRO_QUALITY | TAPER/PARTIAL | Explicit corrected hypothetical report after the rejected attempt. |
| 2026-11-30 | WORKOUT_RESULT | INTRO_QUALITY / 3.5999999999999996 MINUTES | GREEN | 5.5 | EASY | TAPER/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-12-02 | WORKOUT_RESULT | EASY / 3799.9999999999995 METERS | GREEN | 3 | EASY | TAPER/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-12-04 | INVALID_REPORT_REJECTED | EASY / 2533.3333333333335 METERS | — | 3 | EASY | TAPER/PARTIAL | Engine rejected inconsistent measurements: RESULT_DISTANCE_CONFLICT. |
| 2026-12-04 | EXTERNAL_CORRECTED_REPORT | EASY / 2533.3333333333335 METERS | — | — | EASY | TAPER/PARTIAL | Explicit corrected hypothetical report after the rejected attempt. |
| 2026-12-04 | WORKOUT_RESULT | EASY / 2533.3333333333335 METERS | GREEN | 3 | — | TAPER/PARTIAL | Injected GREEN; observed classification GREEN |
| 2026-12-07 | EXTERNAL_FINAL_RACE_UNCHANGED | — | — | — | — | TAPER/CLOSED | Synthetic external measurement = baseline. No performance improvement is assumed or inferred. |

### Наблюдения и нарушения

Автоматические проверки симулятора не выявили нарушений заданных инвариантов. Это не оценка научной эффективности методики.

