# Issue #51 — сравнительные таблицы прогнозного календаря (A/Б)

Старт цикла: **2026-10-12** (тот же, что в аудиторских сценариях). Дата норматива = старт + горизонт.
Профили U1/U4/U5 — анкетные значения из `audit/fullCycle12w.ts` без изменений (см. assumptions в JSON).

**Единицы и статусы.** «Бронь, м» — планировочный резерв движка (`reservedMetres`), защитный потолок, НЕ фактические километры и НЕ дистанция основной части.
«Бюджет» — утверждённая недельная бронь (`approvedMetersPer7Days`). Темп/скорость дорожки показаны только там, где они подтверждены исходными данными (измеренный результат 3000 м); «н/д» = не вычислимо без измерения, значение не выдумывается.
Статусы: **выдана** — реальная очередь движка на asOf; **консерв. прогноз** — модель А (резерв без результата); **условный прогноз** — модель Б (синтетический сценарий «при успешном выполнении», не допуск к нагрузке).

Модель А (консервативное бронирование): исходное состояние заморожено; каждая будущая цикл-неделя генерируется движком (generateQueue + guardWeeklyLoad с учётом всей цепочки броней). Будущие назначения резервируют нагрузку и восстановление, но не становятся ни результатами, ни пропусками; контрольные точки честно неразрешены; неделя 1 — дословно выданная очередь (снапшот).
Модель Б (условный сценарий): каждое занятие условно «выполнено» GREEN; контрольные 3000 м = прежний известный результат (улучшение не предполагается); для U1 способность бежать 3 км не подтверждается и время не выдумывается; неделя 1 — тот же неизменный снапшот.

Замечание 3: `windowViolations` в JSON — проверка ВСЕХ последовательных 7-дневных интервалов (включая стыки календарных недель): сумма броней ≤ бюджета и ≥48 ч между качественными занятиями. Во всех 12 прогонах пусто.

## U1-novice — Новичок (8 недель, норматив 2026-12-07)

Исходные данные: текущий результат 3000 м = нет; цель = 20:00 (техническая заглушка); 1 пробежек/нед (доступно 3), 2 км/нед, длинная 1.5 км, 3 км непрерывно: нет.

### Сводка по неделям (А консервативная / Б условная)

| Нед | А: занятия | А: бронь / бюджет, м | А: качество | А: фаза · доверие | Б: занятия | Б: бронь / бюджет, м | Б: качество | Б: фаза · доверие | Различия A/Б |
|---|---|---|---|---|---|---|---|---|---|
| 1 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | — |
| 2 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | — |
| 3 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | — |
| 4 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | — |
| 5 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 200 / 2 200 | 0 | FOUNDATION · UNKNOWN | бронь, бюджет 2000→2200 |
| 6 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 200 / 2 200 | 0 | FOUNDATION · UNKNOWN | бронь, бюджет 2000→2200 |
| 7 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 200 / 2 200 | 0 | FOUNDATION · UNKNOWN | бронь, бюджет 2000→2200 |
| 8 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 200 / 2 200 | 0 | FOUNDATION · UNKNOWN | бронь, бюджет 2000→2200 |

### Контрольные моменты (недели 4/6/8/12)

| Контрольная неделя | А: фаза · гейт · доверие · бюджет | Б: фаза · гейт · доверие · бюджет | Разрыв |
|---|---|---|---|
| 4 | FOUNDATION · CLOSED · UNKNOWN · 2 000 м | FOUNDATION · CLOSED · UNKNOWN · 2 000 м | нет |
| 6 | FOUNDATION · CLOSED · UNKNOWN · 2 000 м | FOUNDATION · CLOSED · UNKNOWN · 2 200 м | есть: бюджет (+0,2 км) |
| 8 | FOUNDATION · CLOSED · UNKNOWN · 2 000 м | FOUNDATION · CLOSED · UNKNOWN · 2 200 м | есть: бюджет (+0,2 км) |

### События модели А (где заканчиваются данные)

- 2026-12-07 (нед 8) **RACE_DAY**: День норматива. Итоговый результат в модели А не вводится: без реального забега нет факта.

### События модели Б (условные вводы)

- 2026-12-07 (нед 8) **NO_FINAL_RESULT**: Нет измеренного результата 3000 м: итоговый результат НЕ придумывается (условный сценарий не вводит его).

### Полный календарь А

| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | выдана | FOUNDATION · CLOSED · UNKNOWN |
| 2026-10-19 | 2 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-10-26 | 3 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-02 | 4 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-09 | 5 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-16 | 6 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-23 | 7 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-30 | 8 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |

### Полный календарь Б

| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | выдана | FOUNDATION · CLOSED · UNKNOWN |
| 2026-10-19 | 2 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-10-26 | 3 | EASY (бег/шаг этап 1) | 2000 м | RUN_WALK | — | — | — | 2 000 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-02 | 4 | EASY (бег/шаг этап 1) | 2000 м | RUN_WALK | — | — | — | 2 000 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-09 | 5 | EASY (бег/шаг этап 1) | 2200 м | RUN_WALK | — | — | — | 2 200 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-16 | 6 | EASY (бег/шаг этап 1) | 2200 м | RUN_WALK | — | — | — | 2 200 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-23 | 7 | EASY (бег/шаг этап 2) | 2200 м | RUN_WALK | — | — | — | 2 200 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-30 | 8 | EASY (бег/шаг этап 2) | 2200 м | RUN_WALK | — | — | — | 2 200 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |

## U1-novice — Новичок (12 недель, норматив 2027-01-04)

Исходные данные: текущий результат 3000 м = нет; цель = 20:00 (техническая заглушка); 1 пробежек/нед (доступно 3), 2 км/нед, длинная 1.5 км, 3 км непрерывно: нет.

### Сводка по неделям (А консервативная / Б условная)

| Нед | А: занятия | А: бронь / бюджет, м | А: качество | А: фаза · доверие | Б: занятия | Б: бронь / бюджет, м | Б: качество | Б: фаза · доверие | Различия A/Б |
|---|---|---|---|---|---|---|---|---|---|
| 1 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | — |
| 2 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | — |
| 3 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | — |
| 4 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | — |
| 5 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 200 / 2 200 | 0 | FOUNDATION · UNKNOWN | бронь, бюджет 2000→2200 |
| 6 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 200 / 2 200 | 0 | FOUNDATION · UNKNOWN | бронь, бюджет 2000→2200 |
| 7 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 200 / 2 200 | 0 | FOUNDATION · UNKNOWN | бронь, бюджет 2000→2200 |
| 8 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 200 / 2 200 | 0 | FOUNDATION · UNKNOWN | бронь, бюджет 2000→2200 |
| 9 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 400 / 2 400 | 0 | FOUNDATION · UNKNOWN | бронь, бюджет 2000→2400 |
| 10 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 400 / 2 400 | 0 | FOUNDATION · UNKNOWN | бронь, бюджет 2000→2400 |
| 11 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 400 / 2 400 | 0 | FOUNDATION · UNKNOWN | бронь, бюджет 2000→2400 |
| 12 | EASY×1 | 2 000 / 2 000 | 0 | FOUNDATION · UNKNOWN | EASY×1 | 2 400 / 2 400 | 0 | FOUNDATION · UNKNOWN | бронь, бюджет 2000→2400 |

### Контрольные моменты (недели 4/6/8/12)

| Контрольная неделя | А: фаза · гейт · доверие · бюджет | Б: фаза · гейт · доверие · бюджет | Разрыв |
|---|---|---|---|
| 4 | FOUNDATION · CLOSED · UNKNOWN · 2 000 м | FOUNDATION · CLOSED · UNKNOWN · 2 000 м | нет |
| 6 | FOUNDATION · CLOSED · UNKNOWN · 2 000 м | FOUNDATION · CLOSED · UNKNOWN · 2 200 м | есть: бюджет (+0,2 км) |
| 8 | FOUNDATION · CLOSED · UNKNOWN · 2 000 м | FOUNDATION · CLOSED · UNKNOWN · 2 200 м | есть: бюджет (+0,2 км) |
| 12 | FOUNDATION · CLOSED · UNKNOWN · 2 000 м | FOUNDATION · CLOSED · UNKNOWN · 2 400 м | есть: бюджет (+0,4 км) |

### События модели А (где заканчиваются данные)

- 2027-01-04 (нед 12) **RACE_DAY**: День норматива. Итоговый результат в модели А не вводится: без реального забега нет факта.

### События модели Б (условные вводы)

- 2027-01-04 (нед 12) **NO_FINAL_RESULT**: Нет измеренного результата 3000 м: итоговый результат НЕ придумывается (условный сценарий не вводит его).

### Полный календарь А

| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | выдана | FOUNDATION · CLOSED · UNKNOWN |
| 2026-10-19 | 2 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-10-26 | 3 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-02 | 4 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-09 | 5 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-16 | 6 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-23 | 7 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-30 | 8 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-12-07 | 9 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-12-14 | 10 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-12-21 | 11 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-12-28 | 12 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | консерв. прогноз | FOUNDATION · CLOSED · UNKNOWN |

### Полный календарь Б

| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | выдана | FOUNDATION · CLOSED · UNKNOWN |
| 2026-10-19 | 2 | EASY (бег/шаг этап 0) | 2000 м | RUN_WALK | — | — | — | 2 000 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-10-26 | 3 | EASY (бег/шаг этап 1) | 2000 м | RUN_WALK | — | — | — | 2 000 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-02 | 4 | EASY (бег/шаг этап 1) | 2000 м | RUN_WALK | — | — | — | 2 000 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-09 | 5 | EASY (бег/шаг этап 1) | 2200 м | RUN_WALK | — | — | — | 2 200 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-16 | 6 | EASY (бег/шаг этап 1) | 2200 м | RUN_WALK | — | — | — | 2 200 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-23 | 7 | EASY (бег/шаг этап 2) | 2200 м | RUN_WALK | — | — | — | 2 200 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-11-30 | 8 | EASY (бег/шаг этап 2) | 2200 м | RUN_WALK | — | — | — | 2 200 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-12-07 | 9 | EASY (бег/шаг этап 2) | 2400 м | RUN_WALK | — | — | — | 2 400 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-12-14 | 10 | EASY (бег/шаг этап 2) | 2400 м | RUN_WALK | — | — | — | 2 400 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-12-21 | 11 | EASY (бег/шаг этап 3) | 2400 м | RUN_WALK | — | — | — | 2 400 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |
| 2026-12-28 | 12 | EASY (бег/шаг этап 3) | 2400 м | RUN_WALK | — | — | — | 2 400 | условный прогноз | FOUNDATION · CLOSED · UNKNOWN |

## U4-intermediate — Средний уровень (8 недель, норматив 2026-12-07)

Исходные данные: текущий результат 3000 м = 15:30; цель = 14:30; 3 пробежек/нед (доступно 3), 19 км/нед, длинная 8 км, 3 км непрерывно: да.

### Сводка по неделям (А консервативная / Б условная)

| Нед | А: занятия | А: бронь / бюджет, м | А: качество | А: фаза · доверие | Б: занятия | Б: бронь / бюджет, м | Б: качество | Б: фаза · доверие | Различия A/Б |
|---|---|---|---|---|---|---|---|---|---|
| 1 | THRESHOLD×1, EASY×1, LONG_EASY×1 | 18 895 / 19 000 | 1 | DEVELOPMENT · HIGH | THRESHOLD×1, EASY×1, LONG_EASY×1 | 18 895 / 19 000 | 1 | DEVELOPMENT · HIGH | — |
| 2 | THRESHOLD×1, EASY×1, LONG_EASY×1 | 18 895 / 19 000 | 1 | DEVELOPMENT · HIGH | VO2×1, EASY×1, LONG_EASY×1 | 18 704 / 19 000 | 1 | SPECIFIC · HIGH | состав, бронь, фаза DEVELOPMENT→SPECIFIC |
| 3 | THRESHOLD×1, EASY×1, LONG_EASY×1 | 18 555 / 19 000 | 1 | DEVELOPMENT · HIGH | SPECIFIC_3K×1, EASY×1, LONG_EASY×1 | 19 106 / 20 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→20000, фаза DEVELOPMENT→SPECIFIC |
| 4 | THRESHOLD×1, EASY×1, LONG_EASY×1 | 18 555 / 19 000 | 1 | DEVELOPMENT · MEDIUM | CONTROL×1, EASY×1, LONG_EASY×1 | 19 987 / 20 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→20000, фаза DEVELOPMENT→SPECIFIC, доверие |
| 5 | CONTROL×1, EASY×1, LONG_EASY×1 | 19 000 / 19 000 | 1 | DEVELOPMENT · MEDIUM | THRESHOLD×1, EASY×1, LONG_EASY×1 | 20 552 / 21 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→21000, фаза DEVELOPMENT→SPECIFIC, доверие, контрольная точка |
| 6 | CONTROL×1, EASY×1, LONG_EASY×1 | 19 000 / 19 000 | 1 | DEVELOPMENT · MEDIUM | SPECIFIC_3K×1, EASY×1, LONG_EASY×1 | 19 935 / 21 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→21000, фаза DEVELOPMENT→SPECIFIC, доверие |
| 7 | CONTROL×1, EASY×2 | 17 333 / 19 000 | 1 | HOLD_DIAGNOSTIC · LOW | CONTROL×1, EASY×1, LONG_EASY×1 | 20 816 / 21 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→21000, фаза HOLD_DIAGNOSTIC→SPECIFIC, доверие |
| 8 | EASY×3 | 15 200 / 19 000 | 0 | HOLD_DIAGNOSTIC · LOW | SPECIFIC_3K×1, EASY×2 | 11 407 / 21 000 | 1 | TAPER · HIGH | состав, бронь, бюджет 19000→21000, качество, фаза HOLD_DIAGNOSTIC→TAPER, доверие |

### Контрольные моменты (недели 4/6/8/12)

| Контрольная неделя | А: фаза · гейт · доверие · бюджет | Б: фаза · гейт · доверие · бюджет | Разрыв |
|---|---|---|---|
| 4 | DEVELOPMENT · CLOSED · MEDIUM · 19 000 м | SPECIFIC · PARTIAL · HIGH · 20 000 м | есть: фаза (DEVELOPMENT→SPECIFIC), гейт (CLOSED→PARTIAL), бюджет (+1 км) |
| 6 | DEVELOPMENT · CLOSED · MEDIUM · 19 000 м | SPECIFIC · PARTIAL · HIGH · 21 000 м | есть: фаза (DEVELOPMENT→SPECIFIC), гейт (CLOSED→PARTIAL), бюджет (+2 км) |
| 8 | HOLD_DIAGNOSTIC · CLOSED · LOW · 19 000 м | TAPER · PARTIAL · HIGH · 21 000 м | есть: фаза (HOLD_DIAGNOSTIC→TAPER), гейт (CLOSED→PARTIAL), бюджет (+2 км) |

### События модели А (где заканчиваются данные)

- 2026-11-09 (нед 5) **CHECKPOINT_WINDOW_UNRESOLVED**: Обязательная контрольная точка (правило 21 дня после последнего измерения). В модели А нет внешнего измерения: слот контроля зарезервирован, подтверждение прогрессии невозможно, план остаётся на базовом уровне.
- 2026-11-23 (нед 7) **STALE_MEASUREMENT**: Результат 3000 м устарел (>42 дней): доверие LOW, фаза HOLD_DIAGNOSTIC — интенсивные назначения закрыты до нового измерения.
- 2026-12-07 (нед 8) **RACE_DAY**: День норматива. Итоговый результат в модели А не вводится: без реального забега нет факта.

### События модели Б (условные вводы)

- 2026-11-02 (нед 4) **EXTERNAL_3K_CONTROL_CONDITIONAL** (синтетика): Условный сценарный ввод контрольных 3000 м: 15:30 (= прежний известный результат, улучшение не предполагается).
- 2026-11-23 (нед 7) **EXTERNAL_3K_CONTROL_CONDITIONAL** (синтетика): Условный сценарный ввод контрольных 3000 м: 15:30 (= прежний известный результат, улучшение не предполагается).
- 2026-12-07 (нед 8) **EXTERNAL_FINAL_RACE_CONDITIONAL** (синтетика): Итоговый результат = прежний известный (15:30); улучшение не предполагается.

### Полный календарь А

| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 323 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-14 | 1 | EASY | 5572.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 572 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-16 | 1 | LONG_EASY | 8000 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 000 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-19 | 2 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 323 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-21 | 2 | EASY | 5572.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 572 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-23 | 2 | LONG_EASY | 8000 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 000 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-26 | 3 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 323 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-28 | 3 | EASY | 5232.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 232 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-30 | 3 | LONG_EASY | 8000 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 000 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-11-02 | 4 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 323 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-11-04 | 4 | EASY | 5232.3 м | CONTINUOUS | — | 7:00–7:50 | 7.7–8.6 | 5 232 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-06 | 4 | LONG_EASY | 8000 м | CONTINUOUS | — | 7:00–7:50 | 7.7–8.6 | 8 000 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-09 | 5 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 768 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-11 | 5 | EASY | 5232.3 м | CONTINUOUS | — | 7:00–7:50 | 7.7–8.6 | 5 232 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-13 | 5 | LONG_EASY | 8000 м | CONTINUOUS | — | 7:00–7:50 | 7.7–8.6 | 8 000 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-16 | 6 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 768 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-18 | 6 | EASY | 5232.3 м | CONTINUOUS | — | 7:00–7:50 | 7.7–8.6 | 5 232 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-20 | 6 | LONG_EASY | 8000 м | CONTINUOUS | — | 7:00–7:50 | 7.7–8.6 | 8 000 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-23 | 7 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 768 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-25 | 7 | EASY | 5232.3 м | CONTINUOUS | — | — | — | 5 232 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-11-27 | 7 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-11-30 | 8 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-02 | 8 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-04 | 8 | EASY | 2533.3 м | CONTINUOUS | — | — | — | 2 533 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |

### Полный календарь Б

| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 323 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-14 | 1 | EASY | 5572.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 572 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-16 | 1 | LONG_EASY | 8000 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 000 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-19 | 2 | VO2 | 8 мин | INTERVALS | пауза 90 с | 5:01–5:20 | 11.3–12.0 | 5 001 | условный прогноз | DEVELOPMENT · PARTIAL · HIGH |
| 2026-10-21 | 2 | EASY | 5703.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 703 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-23 | 2 | LONG_EASY | 8000 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-26 | 3 | SPECIFIC_3K | 1800 м | INTERVALS | 600 м × 3, пауза 90 с | 4:55–5:04 | 11.8–12.2 | 4 887 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-28 | 3 | EASY | 5798.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 798 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-30 | 3 | LONG_EASY | 8421.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 421 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-02 | 4 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 768 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-04 | 4 | EASY | 5798.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 798 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-06 | 4 | LONG_EASY | 8421.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 421 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-09 | 5 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 323 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-11 | 5 | EASY | 6387.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 6 387 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-13 | 5 | LONG_EASY | 8842.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 842 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-16 | 6 | SPECIFIC_3K | 1800 м | INTERVALS | 600 м × 3, пауза 90 с | 4:55–5:04 | 11.8–12.2 | 4 887 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-18 | 6 | EASY | 6205.7 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 6 206 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-20 | 6 | LONG_EASY | 8842.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 842 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-23 | 7 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 768 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-25 | 7 | EASY | 6205.7 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 6 206 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-27 | 7 | LONG_EASY | 8842.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 842 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-30 | 8 | SPECIFIC_3K | 1320 м | INTERVALS | 600 м × 3, пауза 90 с | 4:55–5:04 | 11.8–12.2 | 4 407 | условный прогноз | TAPER · PARTIAL · HIGH |
| 2026-12-02 | 8 | EASY | 4200 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 4 200 | условный прогноз | TAPER · PARTIAL · HIGH |
| 2026-12-04 | 8 | EASY | 2800 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 2 800 | условный прогноз | TAPER · PARTIAL · HIGH |

## U4-intermediate — Средний уровень (12 недель, норматив 2027-01-04)

Исходные данные: текущий результат 3000 м = 15:30; цель = 14:30; 3 пробежек/нед (доступно 3), 19 км/нед, длинная 8 км, 3 км непрерывно: да.

### Сводка по неделям (А консервативная / Б условная)

| Нед | А: занятия | А: бронь / бюджет, м | А: качество | А: фаза · доверие | Б: занятия | Б: бронь / бюджет, м | Б: качество | Б: фаза · доверие | Различия A/Б |
|---|---|---|---|---|---|---|---|---|---|
| 1 | THRESHOLD×1, EASY×1, LONG_EASY×1 | 18 895 / 19 000 | 1 | DEVELOPMENT · HIGH | THRESHOLD×1, EASY×1, LONG_EASY×1 | 18 895 / 19 000 | 1 | DEVELOPMENT · HIGH | — |
| 2 | THRESHOLD×1, EASY×1, LONG_EASY×1 | 18 895 / 19 000 | 1 | DEVELOPMENT · HIGH | VO2×1, EASY×1, LONG_EASY×1 | 18 704 / 19 000 | 1 | SPECIFIC · HIGH | состав, бронь, фаза DEVELOPMENT→SPECIFIC |
| 3 | THRESHOLD×1, EASY×1, LONG_EASY×1 | 18 555 / 19 000 | 1 | DEVELOPMENT · HIGH | SPECIFIC_3K×1, EASY×1, LONG_EASY×1 | 19 106 / 20 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→20000, фаза DEVELOPMENT→SPECIFIC |
| 4 | THRESHOLD×1, EASY×1, LONG_EASY×1 | 18 555 / 19 000 | 1 | DEVELOPMENT · MEDIUM | CONTROL×1, EASY×1, LONG_EASY×1 | 19 987 / 20 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→20000, фаза DEVELOPMENT→SPECIFIC, доверие |
| 5 | CONTROL×1, EASY×1, LONG_EASY×1 | 19 000 / 19 000 | 1 | DEVELOPMENT · MEDIUM | THRESHOLD×1, EASY×1, LONG_EASY×1 | 20 552 / 21 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→21000, фаза DEVELOPMENT→SPECIFIC, доверие, контрольная точка |
| 6 | CONTROL×1, EASY×1, LONG_EASY×1 | 19 000 / 19 000 | 1 | DEVELOPMENT · MEDIUM | SPECIFIC_3K×1, EASY×1, LONG_EASY×1 | 19 935 / 21 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→21000, фаза DEVELOPMENT→SPECIFIC, доверие |
| 7 | CONTROL×1, EASY×2 | 17 333 / 19 000 | 1 | HOLD_DIAGNOSTIC · LOW | CONTROL×1, EASY×1, LONG_EASY×1 | 20 816 / 21 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→21000, фаза HOLD_DIAGNOSTIC→SPECIFIC, доверие |
| 8 | EASY×3 | 19 000 / 19 000 | 0 | HOLD_DIAGNOSTIC · LOW | VO2×1, EASY×1, LONG_EASY×1 | 20 180 / 21 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→21000, качество, фаза HOLD_DIAGNOSTIC→SPECIFIC, доверие |
| 9 | EASY×3 | 19 000 / 19 000 | 0 | HOLD_DIAGNOSTIC · LOW | SPECIFIC_3K×1, EASY×1, LONG_EASY×1 | 20 416 / 21 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→21000, качество, фаза HOLD_DIAGNOSTIC→SPECIFIC, доверие |
| 10 | EASY×3 | 19 000 / 19 000 | 0 | HOLD_DIAGNOSTIC · LOW | CONTROL×1, EASY×1, LONG_EASY×1 | 20 737 / 21 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→21000, качество, фаза HOLD_DIAGNOSTIC→SPECIFIC, доверие |
| 11 | EASY×3 | 19 000 / 19 000 | 0 | HOLD_DIAGNOSTIC · LOW | THRESHOLD×1, EASY×1, LONG_EASY×1 | 20 930 / 21 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 19000→21000, качество, фаза HOLD_DIAGNOSTIC→SPECIFIC, доверие |
| 12 | EASY×3 | 15 200 / 19 000 | 0 | HOLD_DIAGNOSTIC · LOW | SPECIFIC_3K×1, EASY×2 | 11 407 / 21 000 | 1 | TAPER · HIGH | состав, бронь, бюджет 19000→21000, качество, фаза HOLD_DIAGNOSTIC→TAPER, доверие |

### Контрольные моменты (недели 4/6/8/12)

| Контрольная неделя | А: фаза · гейт · доверие · бюджет | Б: фаза · гейт · доверие · бюджет | Разрыв |
|---|---|---|---|
| 4 | DEVELOPMENT · CLOSED · MEDIUM · 19 000 м | SPECIFIC · PARTIAL · HIGH · 20 000 м | есть: фаза (DEVELOPMENT→SPECIFIC), гейт (CLOSED→PARTIAL), бюджет (+1 км) |
| 6 | DEVELOPMENT · CLOSED · MEDIUM · 19 000 м | SPECIFIC · PARTIAL · HIGH · 21 000 м | есть: фаза (DEVELOPMENT→SPECIFIC), гейт (CLOSED→PARTIAL), бюджет (+2 км) |
| 8 | HOLD_DIAGNOSTIC · CLOSED · LOW · 19 000 м | SPECIFIC · PARTIAL · HIGH · 21 000 м | есть: фаза (HOLD_DIAGNOSTIC→SPECIFIC), гейт (CLOSED→PARTIAL), бюджет (+2 км) |
| 12 | HOLD_DIAGNOSTIC · CLOSED · LOW · 19 000 м | TAPER · PARTIAL · HIGH · 21 000 м | есть: фаза (HOLD_DIAGNOSTIC→TAPER), гейт (CLOSED→PARTIAL), бюджет (+2 км) |

### События модели А (где заканчиваются данные)

- 2026-11-09 (нед 5) **CHECKPOINT_WINDOW_UNRESOLVED**: Обязательная контрольная точка (правило 21 дня после последнего измерения). В модели А нет внешнего измерения: слот контроля зарезервирован, подтверждение прогрессии невозможно, план остаётся на базовом уровне.
- 2026-11-23 (нед 7) **STALE_MEASUREMENT**: Результат 3000 м устарел (>42 дней): доверие LOW, фаза HOLD_DIAGNOSTIC — интенсивные назначения закрыты до нового измерения.
- 2027-01-04 (нед 12) **RACE_DAY**: День норматива. Итоговый результат в модели А не вводится: без реального забега нет факта.

### События модели Б (условные вводы)

- 2026-11-02 (нед 4) **EXTERNAL_3K_CONTROL_CONDITIONAL** (синтетика): Условный сценарный ввод контрольных 3000 м: 15:30 (= прежний известный результат, улучшение не предполагается).
- 2026-11-23 (нед 7) **EXTERNAL_3K_CONTROL_CONDITIONAL** (синтетика): Условный сценарный ввод контрольных 3000 м: 15:30 (= прежний известный результат, улучшение не предполагается).
- 2026-12-14 (нед 10) **EXTERNAL_3K_CONTROL_CONDITIONAL** (синтетика): Условный сценарный ввод контрольных 3000 м: 15:30 (= прежний известный результат, улучшение не предполагается).
- 2027-01-04 (нед 12) **EXTERNAL_FINAL_RACE_CONDITIONAL** (синтетика): Итоговый результат = прежний известный (15:30); улучшение не предполагается.

### Полный календарь А

| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 323 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-14 | 1 | EASY | 5572.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 572 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-16 | 1 | LONG_EASY | 8000 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 000 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-19 | 2 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 323 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-21 | 2 | EASY | 5572.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 572 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-23 | 2 | LONG_EASY | 8000 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 000 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-26 | 3 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 323 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-28 | 3 | EASY | 5232.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 232 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-30 | 3 | LONG_EASY | 8000 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 000 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-11-02 | 4 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 323 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-11-04 | 4 | EASY | 5232.3 м | CONTINUOUS | — | 7:00–7:50 | 7.7–8.6 | 5 232 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-06 | 4 | LONG_EASY | 8000 м | CONTINUOUS | — | 7:00–7:50 | 7.7–8.6 | 8 000 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-09 | 5 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 768 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-11 | 5 | EASY | 5232.3 м | CONTINUOUS | — | 7:00–7:50 | 7.7–8.6 | 5 232 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-13 | 5 | LONG_EASY | 8000 м | CONTINUOUS | — | 7:00–7:50 | 7.7–8.6 | 8 000 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-16 | 6 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 768 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-18 | 6 | EASY | 5232.3 м | CONTINUOUS | — | 7:00–7:50 | 7.7–8.6 | 5 232 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-20 | 6 | LONG_EASY | 8000 м | CONTINUOUS | — | 7:00–7:50 | 7.7–8.6 | 8 000 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-23 | 7 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 768 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-25 | 7 | EASY | 5232.3 м | CONTINUOUS | — | — | — | 5 232 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-11-27 | 7 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-11-30 | 8 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-02 | 8 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-04 | 8 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-07 | 9 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-09 | 9 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-11 | 9 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-14 | 10 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-16 | 10 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-18 | 10 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-21 | 11 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-23 | 11 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-25 | 11 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-28 | 12 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-30 | 12 | EASY | 6333.3 м | CONTINUOUS | — | — | — | 6 333 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2027-01-01 | 12 | EASY | 2533.3 м | CONTINUOUS | — | — | — | 2 533 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |

### Полный календарь Б

| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 323 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-14 | 1 | EASY | 5572.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 572 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-16 | 1 | LONG_EASY | 8000 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 000 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-19 | 2 | VO2 | 8 мин | INTERVALS | пауза 90 с | 5:01–5:20 | 11.3–12.0 | 5 001 | условный прогноз | DEVELOPMENT · PARTIAL · HIGH |
| 2026-10-21 | 2 | EASY | 5703.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 703 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-23 | 2 | LONG_EASY | 8000 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-26 | 3 | SPECIFIC_3K | 1800 м | INTERVALS | 600 м × 3, пауза 90 с | 4:55–5:04 | 11.8–12.2 | 4 887 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-28 | 3 | EASY | 5798.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 798 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-30 | 3 | LONG_EASY | 8421.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 421 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-02 | 4 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 768 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-04 | 4 | EASY | 5798.3 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 5 798 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-06 | 4 | LONG_EASY | 8421.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 421 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-09 | 5 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 323 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-11 | 5 | EASY | 6387.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 6 387 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-13 | 5 | LONG_EASY | 8842.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 842 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-16 | 6 | SPECIFIC_3K | 1800 м | INTERVALS | 600 м × 3, пауза 90 с | 4:55–5:04 | 11.8–12.2 | 4 887 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-18 | 6 | EASY | 6205.7 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 6 206 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-20 | 6 | LONG_EASY | 8842.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 842 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-23 | 7 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 768 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-25 | 7 | EASY | 6205.7 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 6 206 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-27 | 7 | LONG_EASY | 8842.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 842 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-30 | 8 | VO2 | 8 мин | INTERVALS | пауза 90 с | 5:01–5:20 | 11.3–12.0 | 5 001 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-02 | 8 | EASY | 6336.5 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 6 336 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-04 | 8 | LONG_EASY | 8842.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 842 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-07 | 9 | SPECIFIC_3K | 2200 м | INTERVALS | 600 м × 4, пауза 90 с | 4:55–5:04 | 11.8–12.2 | 5 447 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-09 | 9 | EASY | 6126.9 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 6 127 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-11 | 9 | LONG_EASY | 8842.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 842 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-14 | 10 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 768 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-16 | 10 | EASY | 6126.9 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 6 127 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-18 | 10 | LONG_EASY | 8842.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 842 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-21 | 11 | THRESHOLD | 15 мин | CONTINUOUS | — | 5:30–5:44 | 10.5–10.9 | 5 961 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-23 | 11 | EASY | 6126.9 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 6 127 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-25 | 11 | LONG_EASY | 8842.1 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 8 842 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-28 | 12 | SPECIFIC_3K | 1320 м | INTERVALS | 600 м × 3, пауза 90 с | 4:55–5:04 | 11.8–12.2 | 4 407 | условный прогноз | TAPER · PARTIAL · HIGH |
| 2026-12-30 | 12 | EASY | 4200 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 4 200 | условный прогноз | TAPER · PARTIAL · HIGH |
| 2027-01-01 | 12 | EASY | 2800 м | CONTINUOUS | — | 6:45–7:30 | 8.0–8.9 | 2 800 | условный прогноз | TAPER · PARTIAL · HIGH |

## U5-trained — Подготовленный (8 недель, норматив 2026-12-07)

Исходные данные: текущий результат 3000 м = 14:30; цель = 13:30; 4 пробежек/нед (доступно 4), 25 км/нед, длинная 9 км, 3 км непрерывно: да.

### Сводка по неделям (А консервативная / Б условная)

| Нед | А: занятия | А: бронь / бюджет, м | А: качество | А: фаза · доверие | Б: занятия | Б: бронь / бюджет, м | Б: качество | Б: фаза · доверие | Различия A/Б |
|---|---|---|---|---|---|---|---|---|---|
| 1 | THRESHOLD×1, EASY×1, VO2×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | DEVELOPMENT · HIGH | THRESHOLD×1, EASY×1, VO2×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | DEVELOPMENT · HIGH | — |
| 2 | THRESHOLD×1, EASY×1, VO2×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | DEVELOPMENT · HIGH | SPECIFIC_3K×1, EASY×1, THRESHOLD×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | SPECIFIC · HIGH | состав, фаза DEVELOPMENT→SPECIFIC |
| 3 | THRESHOLD×1, EASY×1, VO2×1, LONG_EASY×1 | 24 731 / 25 000 | 2 | DEVELOPMENT · HIGH | SPECIFIC_3K×1, EASY×1, VO2×1, LONG_EASY×1 | 24 141 / 25 000 | 2 | SPECIFIC · HIGH | состав, бронь, фаза DEVELOPMENT→SPECIFIC |
| 4 | THRESHOLD×1, EASY×1, VO2×1, LONG_EASY×1 | 24 731 / 25 000 | 2 | DEVELOPMENT · MEDIUM | CONTROL×1, EASY×1, SPECIFIC_3K×1, LONG_EASY×1 | 24 586 / 25 000 | 2 | SPECIFIC · HIGH | состав, бронь, фаза DEVELOPMENT→SPECIFIC, доверие |
| 5 | CONTROL×1, EASY×1, THRESHOLD×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | DEVELOPMENT · MEDIUM | THRESHOLD×1, EASY×1, SPECIFIC_3K×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | SPECIFIC · HIGH | состав, фаза DEVELOPMENT→SPECIFIC, доверие, контрольная точка |
| 6 | CONTROL×1, EASY×1, THRESHOLD×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | DEVELOPMENT · MEDIUM | VO2×1, EASY×2, LONG_EASY×1 | 24 717 / 25 000 | 1 | SPECIFIC · HIGH | состав, бронь, качество, фаза DEVELOPMENT→SPECIFIC, доверие |
| 7 | CONTROL×1, EASY×3 | 22 250 / 25 000 | 1 | HOLD_DIAGNOSTIC · LOW | CONTROL×1, EASY×1, SPECIFIC_3K×1, LONG_EASY×1 | 25 360 / 26 000 | 2 | SPECIFIC · HIGH | состав, бронь, бюджет 25000→26000, качество, фаза HOLD_DIAGNOSTIC→SPECIFIC, доверие |
| 8 | EASY×4 | 21 250 / 25 000 | 0 | HOLD_DIAGNOSTIC · LOW | EASY×3, SPECIFIC_3K×1 | 15 260 / 26 000 | 1 | TAPER · HIGH | состав, бронь, бюджет 25000→26000, качество, фаза HOLD_DIAGNOSTIC→TAPER, доверие |

### Контрольные моменты (недели 4/6/8/12)

| Контрольная неделя | А: фаза · гейт · доверие · бюджет | Б: фаза · гейт · доверие · бюджет | Разрыв |
|---|---|---|---|
| 4 | DEVELOPMENT · CLOSED · MEDIUM · 25 000 м | SPECIFIC · PARTIAL · HIGH · 25 000 м | есть: фаза (DEVELOPMENT→SPECIFIC), гейт (CLOSED→PARTIAL) |
| 6 | DEVELOPMENT · CLOSED · MEDIUM · 25 000 м | SPECIFIC · PARTIAL · HIGH · 25 000 м | есть: фаза (DEVELOPMENT→SPECIFIC), гейт (CLOSED→PARTIAL) |
| 8 | HOLD_DIAGNOSTIC · CLOSED · LOW · 25 000 м | TAPER · PARTIAL · HIGH · 26 000 м | есть: фаза (HOLD_DIAGNOSTIC→TAPER), гейт (CLOSED→PARTIAL), бюджет (+1 км) |

### События модели А (где заканчиваются данные)

- 2026-11-09 (нед 5) **CHECKPOINT_WINDOW_UNRESOLVED**: Обязательная контрольная точка (правило 21 дня после последнего измерения). В модели А нет внешнего измерения: слот контроля зарезервирован, подтверждение прогрессии невозможно, план остаётся на базовом уровне.
- 2026-11-23 (нед 7) **STALE_MEASUREMENT**: Результат 3000 м устарел (>42 дней): доверие LOW, фаза HOLD_DIAGNOSTIC — интенсивные назначения закрыты до нового измерения.
- 2026-12-07 (нед 8) **RACE_DAY**: День норматива. Итоговый результат в модели А не вводится: без реального забега нет факта.

### События модели Б (условные вводы)

- 2026-11-02 (нед 4) **EXTERNAL_3K_CONTROL_CONDITIONAL** (синтетика): Условный сценарный ввод контрольных 3000 м: 14:30 (= прежний известный результат, улучшение не предполагается).
- 2026-11-23 (нед 7) **EXTERNAL_3K_CONTROL_CONDITIONAL** (синтетика): Условный сценарный ввод контрольных 3000 м: 14:30 (= прежний известный результат, улучшение не предполагается).
- 2026-12-07 (нед 8) **EXTERNAL_FINAL_RACE_CONDITIONAL** (синтетика): Итоговый результат = прежний известный (14:30); улучшение не предполагается.

### Полный календарь А

| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-13 | 1 | EASY | 4964.3 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 964 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-15 | 1 | VO2 | 8 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 5 346 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-17 | 1 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-19 | 2 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-20 | 2 | EASY | 4964.3 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 964 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-22 | 2 | VO2 | 8 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 5 346 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-24 | 2 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-26 | 3 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-27 | 3 | EASY | 4695.4 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 695 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-29 | 3 | VO2 | 8 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 5 346 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-31 | 3 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-11-02 | 4 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-11-03 | 4 | EASY | 4695.4 м | CONTINUOUS | — | 6:30–7:15 | 8.3–9.2 | 4 695 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-05 | 4 | VO2 | 8 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 5 346 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-07 | 4 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:30–7:15 | 8.3–9.2 | 9 000 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-09 | 5 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 959 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-10 | 5 | EASY | 4351.7 м | CONTINUOUS | — | 6:30–7:15 | 8.3–9.2 | 4 352 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-12 | 5 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-14 | 5 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:30–7:15 | 8.3–9.2 | 9 000 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-16 | 6 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 959 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-17 | 6 | EASY | 4351.7 м | CONTINUOUS | — | 6:30–7:15 | 8.3–9.2 | 4 352 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-19 | 6 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-21 | 6 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:30–7:15 | 8.3–9.2 | 9 000 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-23 | 7 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 959 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-24 | 7 | EASY | 4351.7 м | CONTINUOUS | — | — | — | 4 352 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-11-26 | 7 | EASY | 5689.7 м | CONTINUOUS | — | — | — | 5 690 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-11-28 | 7 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-11-30 | 8 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-01 | 8 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-03 | 8 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-05 | 8 | EASY | 2500 м | CONTINUOUS | — | — | — | 2 500 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |

### Полный календарь Б

| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-13 | 1 | EASY | 4964.3 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 964 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-15 | 1 | VO2 | 8 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 5 346 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-17 | 1 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-19 | 2 | SPECIFIC_3K | 1800 м | INTERVALS | 600 м × 3, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 5 100 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-20 | 2 | EASY | 5210.3 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 5 210 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-22 | 2 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-24 | 2 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-26 | 3 | SPECIFIC_3K | 1800 м | INTERVALS | 600 м × 3, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 5 100 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-27 | 3 | EASY | 4695.4 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 695 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-29 | 3 | VO2 | 8 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 5 346 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-31 | 3 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-02 | 4 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 959 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-03 | 4 | EASY | 3956.9 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 3 957 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-05 | 4 | SPECIFIC_3K | 2200 м | INTERVALS | 600 м × 4, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 5 671 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-07 | 4 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-09 | 5 | THRESHOLD | 15 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 6 372 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-10 | 5 | EASY | 3956.9 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 3 957 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-12 | 5 | SPECIFIC_3K | 2200 м | INTERVALS | 600 м × 4, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 5 671 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-14 | 5 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-16 | 6 | VO2 | 11 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 6 049 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-17 | 6 | EASY | 4280.1 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 280 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-19 | 6 | EASY | 5387.4 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 5 387 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-21 | 6 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-23 | 7 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 959 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-24 | 7 | EASY | 3800 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 3 800 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-26 | 7 | SPECIFIC_3K | 2600 м | INTERVALS | 600 м × 5, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 6 241 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-28 | 7 | LONG_EASY | 9360 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 360 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-30 | 8 | EASY | 3900 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 3 900 | условный прогноз | TAPER · PARTIAL · HIGH |
| 2026-12-01 | 8 | EASY | 3900 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 3 900 | условный прогноз | TAPER · PARTIAL · HIGH |
| 2026-12-03 | 8 | SPECIFIC_3K | 1560 м | INTERVALS | 600 м × 3, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 4 860 | условный прогноз | TAPER · PARTIAL · HIGH |
| 2026-12-05 | 8 | EASY | 2600 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 2 600 | условный прогноз | TAPER · PARTIAL · HIGH |

## U5-trained — Подготовленный (12 недель, норматив 2027-01-04)

Исходные данные: текущий результат 3000 м = 14:30; цель = 13:30; 4 пробежек/нед (доступно 4), 25 км/нед, длинная 9 км, 3 км непрерывно: да.

### Сводка по неделям (А консервативная / Б условная)

| Нед | А: занятия | А: бронь / бюджет, м | А: качество | А: фаза · доверие | Б: занятия | Б: бронь / бюджет, м | Б: качество | Б: фаза · доверие | Различия A/Б |
|---|---|---|---|---|---|---|---|---|---|
| 1 | THRESHOLD×1, EASY×1, VO2×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | DEVELOPMENT · HIGH | THRESHOLD×1, EASY×1, VO2×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | DEVELOPMENT · HIGH | — |
| 2 | THRESHOLD×1, EASY×1, VO2×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | DEVELOPMENT · HIGH | SPECIFIC_3K×1, EASY×1, THRESHOLD×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | SPECIFIC · HIGH | состав, фаза DEVELOPMENT→SPECIFIC |
| 3 | THRESHOLD×1, EASY×1, VO2×1, LONG_EASY×1 | 24 731 / 25 000 | 2 | DEVELOPMENT · HIGH | SPECIFIC_3K×1, EASY×1, VO2×1, LONG_EASY×1 | 24 141 / 25 000 | 2 | SPECIFIC · HIGH | состав, бронь, фаза DEVELOPMENT→SPECIFIC |
| 4 | THRESHOLD×1, EASY×1, VO2×1, LONG_EASY×1 | 24 731 / 25 000 | 2 | DEVELOPMENT · MEDIUM | CONTROL×1, EASY×1, SPECIFIC_3K×1, LONG_EASY×1 | 24 586 / 25 000 | 2 | SPECIFIC · HIGH | состав, бронь, фаза DEVELOPMENT→SPECIFIC, доверие |
| 5 | CONTROL×1, EASY×1, THRESHOLD×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | DEVELOPMENT · MEDIUM | THRESHOLD×1, EASY×1, SPECIFIC_3K×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | SPECIFIC · HIGH | состав, фаза DEVELOPMENT→SPECIFIC, доверие, контрольная точка |
| 6 | CONTROL×1, EASY×1, THRESHOLD×1, LONG_EASY×1 | 25 000 / 25 000 | 2 | DEVELOPMENT · MEDIUM | VO2×1, EASY×2, LONG_EASY×1 | 24 717 / 25 000 | 1 | SPECIFIC · HIGH | состав, бронь, качество, фаза DEVELOPMENT→SPECIFIC, доверие |
| 7 | CONTROL×1, EASY×3 | 22 250 / 25 000 | 1 | HOLD_DIAGNOSTIC · LOW | CONTROL×1, EASY×2, LONG_EASY×1 | 24 717 / 25 000 | 1 | SPECIFIC · HIGH | состав, бронь, фаза HOLD_DIAGNOSTIC→SPECIFIC, доверие |
| 8 | EASY×4 | 25 000 / 25 000 | 0 | HOLD_DIAGNOSTIC · LOW | SPECIFIC_3K×1, EASY×2, LONG_EASY×1 | 25 869 / 26 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 25000→26000, качество, фаза HOLD_DIAGNOSTIC→SPECIFIC, доверие |
| 9 | EASY×4 | 25 000 / 25 000 | 0 | HOLD_DIAGNOSTIC · LOW | THRESHOLD×1, EASY×1, SPECIFIC_3K×1, LONG_EASY×1 | 27 000 / 27 000 | 2 | SPECIFIC · HIGH | состав, бронь, бюджет 25000→27000, качество, фаза HOLD_DIAGNOSTIC→SPECIFIC, доверие |
| 10 | EASY×4 | 25 000 / 25 000 | 0 | HOLD_DIAGNOSTIC · LOW | CONTROL×1, EASY×1, VO2×1, LONG_EASY×1 | 26 317 / 27 000 | 2 | SPECIFIC · HIGH | состав, бронь, бюджет 25000→27000, качество, фаза HOLD_DIAGNOSTIC→SPECIFIC, доверие |
| 11 | EASY×4 | 25 000 / 25 000 | 0 | HOLD_DIAGNOSTIC · LOW | SPECIFIC_3K×1, EASY×2, LONG_EASY×1 | 26 818 / 27 000 | 1 | SPECIFIC · HIGH | состав, бронь, бюджет 25000→27000, качество, фаза HOLD_DIAGNOSTIC→SPECIFIC, доверие |
| 12 | EASY×4 | 21 250 / 25 000 | 0 | HOLD_DIAGNOSTIC · LOW | SPECIFIC_3K×1, EASY×3 | 15 900 / 27 000 | 1 | TAPER · HIGH | состав, бронь, бюджет 25000→27000, качество, фаза HOLD_DIAGNOSTIC→TAPER, доверие |

### Контрольные моменты (недели 4/6/8/12)

| Контрольная неделя | А: фаза · гейт · доверие · бюджет | Б: фаза · гейт · доверие · бюджет | Разрыв |
|---|---|---|---|
| 4 | DEVELOPMENT · CLOSED · MEDIUM · 25 000 м | SPECIFIC · PARTIAL · HIGH · 25 000 м | есть: фаза (DEVELOPMENT→SPECIFIC), гейт (CLOSED→PARTIAL) |
| 6 | DEVELOPMENT · CLOSED · MEDIUM · 25 000 м | SPECIFIC · PARTIAL · HIGH · 25 000 м | есть: фаза (DEVELOPMENT→SPECIFIC), гейт (CLOSED→PARTIAL) |
| 8 | HOLD_DIAGNOSTIC · CLOSED · LOW · 25 000 м | SPECIFIC · PARTIAL · HIGH · 26 000 м | есть: фаза (HOLD_DIAGNOSTIC→SPECIFIC), гейт (CLOSED→PARTIAL), бюджет (+1 км) |
| 12 | HOLD_DIAGNOSTIC · CLOSED · LOW · 25 000 м | TAPER · PARTIAL · HIGH · 27 000 м | есть: фаза (HOLD_DIAGNOSTIC→TAPER), гейт (CLOSED→PARTIAL), бюджет (+2 км) |

### События модели А (где заканчиваются данные)

- 2026-11-09 (нед 5) **CHECKPOINT_WINDOW_UNRESOLVED**: Обязательная контрольная точка (правило 21 дня после последнего измерения). В модели А нет внешнего измерения: слот контроля зарезервирован, подтверждение прогрессии невозможно, план остаётся на базовом уровне.
- 2026-11-23 (нед 7) **STALE_MEASUREMENT**: Результат 3000 м устарел (>42 дней): доверие LOW, фаза HOLD_DIAGNOSTIC — интенсивные назначения закрыты до нового измерения.
- 2027-01-04 (нед 12) **RACE_DAY**: День норматива. Итоговый результат в модели А не вводится: без реального забега нет факта.

### События модели Б (условные вводы)

- 2026-11-02 (нед 4) **EXTERNAL_3K_CONTROL_CONDITIONAL** (синтетика): Условный сценарный ввод контрольных 3000 м: 14:30 (= прежний известный результат, улучшение не предполагается).
- 2026-11-23 (нед 7) **EXTERNAL_3K_CONTROL_CONDITIONAL** (синтетика): Условный сценарный ввод контрольных 3000 м: 14:30 (= прежний известный результат, улучшение не предполагается).
- 2026-12-14 (нед 10) **EXTERNAL_3K_CONTROL_CONDITIONAL** (синтетика): Условный сценарный ввод контрольных 3000 м: 14:30 (= прежний известный результат, улучшение не предполагается).
- 2027-01-04 (нед 12) **EXTERNAL_FINAL_RACE_CONDITIONAL** (синтетика): Итоговый результат = прежний известный (14:30); улучшение не предполагается.

### Полный календарь А

| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-13 | 1 | EASY | 4964.3 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 964 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-15 | 1 | VO2 | 8 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 5 346 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-17 | 1 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-19 | 2 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-20 | 2 | EASY | 4964.3 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 964 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-22 | 2 | VO2 | 8 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 5 346 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-24 | 2 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-26 | 3 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-27 | 3 | EASY | 4695.4 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 695 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-29 | 3 | VO2 | 8 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 5 346 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-31 | 3 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-11-02 | 4 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | консерв. прогноз | DEVELOPMENT · CLOSED · HIGH |
| 2026-11-03 | 4 | EASY | 4695.4 м | CONTINUOUS | — | 6:30–7:15 | 8.3–9.2 | 4 695 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-05 | 4 | VO2 | 8 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 5 346 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-07 | 4 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:30–7:15 | 8.3–9.2 | 9 000 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-09 | 5 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 959 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-10 | 5 | EASY | 4351.7 м | CONTINUOUS | — | 6:30–7:15 | 8.3–9.2 | 4 352 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-12 | 5 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-14 | 5 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:30–7:15 | 8.3–9.2 | 9 000 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-16 | 6 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 959 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-17 | 6 | EASY | 4351.7 м | CONTINUOUS | — | 6:30–7:15 | 8.3–9.2 | 4 352 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-19 | 6 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-21 | 6 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:30–7:15 | 8.3–9.2 | 9 000 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-23 | 7 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 959 | консерв. прогноз | DEVELOPMENT · CLOSED · MEDIUM |
| 2026-11-24 | 7 | EASY | 4351.7 м | CONTINUOUS | — | — | — | 4 352 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-11-26 | 7 | EASY | 5689.7 м | CONTINUOUS | — | — | — | 5 690 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-11-28 | 7 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-11-30 | 8 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-01 | 8 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-03 | 8 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-05 | 8 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-07 | 9 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-08 | 9 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-10 | 9 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-12 | 9 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-14 | 10 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-15 | 10 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-17 | 10 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-19 | 10 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-21 | 11 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-22 | 11 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-24 | 11 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-26 | 11 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-28 | 12 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-29 | 12 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2026-12-31 | 12 | EASY | 6250 м | CONTINUOUS | — | — | — | 6 250 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |
| 2027-01-02 | 12 | EASY | 2500 м | CONTINUOUS | — | — | — | 2 500 | консерв. прогноз | HOLD_DIAGNOSTIC · CLOSED · LOW |

### Полный календарь Б

| Дата | Нед | Тип | Доза | Режим | Повторы/пауза | Темп мин/км | Дорожка км/ч | Бронь, м | Статус | Фаза · гейт · доверие |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-13 | 1 | EASY | 4964.3 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 964 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-15 | 1 | VO2 | 8 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 5 346 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-17 | 1 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | выдана | DEVELOPMENT · CLOSED · HIGH |
| 2026-10-19 | 2 | SPECIFIC_3K | 1800 м | INTERVALS | 600 м × 3, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 5 100 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-20 | 2 | EASY | 5210.3 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 5 210 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-22 | 2 | THRESHOLD | 12 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 5 690 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-24 | 2 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-26 | 3 | SPECIFIC_3K | 1800 м | INTERVALS | 600 м × 3, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 5 100 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-27 | 3 | EASY | 4695.4 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 695 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-29 | 3 | VO2 | 8 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 5 346 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-10-31 | 3 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-02 | 4 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 959 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-03 | 4 | EASY | 3956.9 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 3 957 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-05 | 4 | SPECIFIC_3K | 2200 м | INTERVALS | 600 м × 4, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 5 671 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-07 | 4 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-09 | 5 | THRESHOLD | 15 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 6 372 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-10 | 5 | EASY | 3956.9 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 3 957 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-12 | 5 | SPECIFIC_3K | 2200 м | INTERVALS | 600 м × 4, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 5 671 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-14 | 5 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-16 | 6 | VO2 | 11 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 6 049 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-17 | 6 | EASY | 4280.1 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 280 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-19 | 6 | EASY | 5387.4 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 5 387 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-21 | 6 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-23 | 7 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 959 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-24 | 7 | EASY | 4654 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 654 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-26 | 7 | EASY | 5104.6 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 5 105 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-28 | 7 | LONG_EASY | 9000 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 000 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-11-30 | 8 | SPECIFIC_3K | 2600 м | INTERVALS | 600 м × 5, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 6 241 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-01 | 8 | EASY | 5322.7 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 5 323 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-03 | 8 | EASY | 4944.9 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 945 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-05 | 8 | LONG_EASY | 9360 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 360 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-07 | 9 | THRESHOLD | 15 мин | CONTINUOUS | — | 5:09–5:22 | 11.2–11.7 | 6 372 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-08 | 9 | EASY | 4666.2 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 666 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-10 | 9 | SPECIFIC_3K | 2600 м | INTERVALS | 600 м × 5, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 6 241 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-12 | 9 | LONG_EASY | 9720 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 720 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-14 | 10 | CONTROL | 3000 м | CONTINUOUS | — | — | — | 5 959 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-15 | 10 | EASY | 4589.4 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 589 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-17 | 10 | VO2 | 11 мин | INTERVALS | пауза 90 с | 4:42–4:59 | 12.0–12.8 | 6 049 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-19 | 10 | LONG_EASY | 9720 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 720 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-21 | 11 | SPECIFIC_3K | 3000 м | INTERVALS | 600 м × 5, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 6 641 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-22 | 11 | EASY | 4589.4 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 589 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-24 | 11 | EASY | 5867.6 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 5 868 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-26 | 11 | LONG_EASY | 9720 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 9 720 | условный прогноз | SPECIFIC · PARTIAL · HIGH |
| 2026-12-28 | 12 | SPECIFIC_3K | 1800 м | INTERVALS | 600 м × 3, пауза 90 с | 4:36–4:44 | 12.7–13.1 | 5 100 | условный прогноз | TAPER · PARTIAL · HIGH |
| 2026-12-29 | 12 | EASY | 4050 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 050 | условный прогноз | TAPER · PARTIAL · HIGH |
| 2026-12-31 | 12 | EASY | 4050 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 4 050 | условный прогноз | TAPER · PARTIAL · HIGH |
| 2027-01-02 | 12 | EASY | 2700 м | CONTINUOUS | — | 6:15–6:55 | 8.7–9.6 | 2 700 | условный прогноз | TAPER · PARTIAL · HIGH |
