# PWA «Физуха» — архитектура Engine / Application / UI

Статус: архитектурный документ этапа «граница ответственности», предшествующий wireframes.
Зафиксированный baseline спортивного engine: `main` = `34cd5e86ac2c3fe1e892e2b0ec703939679226a8`.
Основание: `docs/ui-engine-contract.md` (сопоставление UX-модели с реальным публичным API).

Спортивная модель не изменяется. Код спортивной логики в рамках этого этапа не менялся.
Все утверждения о поведении engine ниже сняты прогонами публичного API, а не выведены из типов.

---

## 1. Граница ответственности

| Слой | Отвечает за | Не имеет права |
|---|---|---|
| **Engine** (`src/`, публичный API) | спортивное состояние; оценка (T/Q/Confidence/Feasibility/Gate/Phase); формирование очереди; классификация GREEN_PLUS/GREEN/YELLOW/RED; адаптация; RE_ENTRY; taper; checkpoint; правила безопасности; календарные правила старта | знать о UI, хранилище, экранах |
| **Application layer** (PWA) | хранение и версионирование состояния; оркестрация вызовов engine; immutability стартовых снимков; журнал событий цикла; вывод UI-состояния; обработка ошибок engine; offline-персистентность | самостоятельно определять нагрузку, темп, фазу, Gate, классификацию, реакцию на пропуск |
| **Presentation / UI** | отображение уже принятых решений; формы ввода; статический перевод кодов в тексты; навигация; форматирование дат и чисел | вычислять что-либо спортивное; обходить application layer прямыми вызовами engine |

**Главное правило:** ровно один планировщик — engine. Application layer **никогда** не вызывает
`generateQueue`, `prescribe`, `initialDose` и не переписывает `Workout`. Любое изменение плана — результат
вызова engine, применённый к состоянию.

**Второе правило:** источник истины о будущих тренировках — только текущее состояние engine. Event log и
app-снапшоты описывают **прошлое** и не участвуют в вычислении плана.

---

## 2. Решения по UI-GAP-01…12

| GAP | Решение | Где решается |
|---|---|---|
| 01 полный план цикла | Показываем только фактический горизонт engine + известные этапы (`taper`, `raceDate`). Прогноз будущих тренировок запрещён | UX |
| 02 потеря стартового Performance | Application layer сохраняет immutable `baseline.performance` при создании цикла | Application |
| 03 checkpoint не в истории | Application layer пишет `CHECKPOINT_RECORDED` в event log; engine остаётся источником решения | Application |
| 04 нет «что изменилось» | Application layer сравнивает наблюдаемое состояние до/после вызова; показывает только фактически изменившиеся данные; причина — только из reason codes | Application + UI |
| 05 контракт формы результата | MVP: одна универсальная форма по `requiredFeedback`; отдельные наборы полей по типам не создаются | UX (+ см. §9, вопрос B1) |
| 06 нет machine-readable кодов ошибок | **Изменение engine API — реализовано** в `pwa/api-contract`: базовый класс `EngineError` + `code` на всех 30 сообщениях | Engine (§7.2) |
| 07 порядок пропуска/past-due | Обязательный orchestration invariant INV-1 (§6); UI не обходит его прямыми вызовами | Application + UI |
| 08 нет runtime-перечислений | **Изменение engine API — реализовано** в `pwa/api-contract`: 20 замороженных каталогов, типы выведены из массивов | Engine (§7.3) |
| 09 персистентность | Versioned envelope с первой версии; без сложной системы миграций | Application (см. §5) |
| 10 нет расписания checkpoint | Показываем checkpoint как (а) `CONTROL` внутри горизонта, (б) CTA при `checkpointRequired`. Будущие даты не обещаем. `taper` — оценка от `raceDate − taperDays(...)`, пересчитывается | UX |
| 11 `STRIDES` не генерируется | Рендерер типа строится по константному массиву типов; в v1 `STRIDES` не ожидается, но ветка есть | UI |
| 12 `maximumQualityPerWeek` в терминальном состоянии | Вся UI про quality-бюджет гейтится статусом цикла; после завершения не показывается | UI |

Отдельно по UI-GAP-10, 11, 12: приняты самостоятельные решения, а не «по severity». Ни один из трёх не требует
изменения engine, и ни один не влияет на корректность спортивных решений — только на состав текста и
видимость блока.

---

## 3. Модель тренировочного цикла

Приложение живёт в модели **одного активного цикла** плюс архив завершённых.

```
                       ┌─────────────────────────── AppStateV1 (envelope) ──────────────────────────┐
   первый запуск ──►   │ cycle: { cycleId, createdAt, baseline, engineStateVersion, engineState }    │
                       │ events: CycleEvent[]                                                       │
                       │ ui: { units, ... }                                                         │
                       └────────────────────────────────────────────────────────────────────────────┘
                                              │
                    ACTIVE ─────────────► AWAITING_FINAL_RESULT ─────────────► COMPLETED (архив)
```

**Статус цикла — вычисляемый, а не хранимый.** Хранение статуса создало бы второй источник истины.
Селектор (порядок важен):

```
if (engineState.finalResultRecorded)                       -> COMPLETED
else if (deviceToday > profile.raceDate)                    -> AWAITING_FINAL_RESULT
else                                                        -> ACTIVE
```

`deviceToday` берётся из часов устройства (не из `state.asOf`): при ожидании финального результата `asOf`
остаётся на `raceDate`.

---

## 4. Минимальный `AppState`

Проверка каждого кандидата из первоначального перечня — с обоснованием, а не «на всякий случай»:

| Кандидат | Вердикт | Обоснование (проверено прогонами) |
|---|---|---|
| `cycleId` | **нужен** | идентификатор цикла для архива и корреляции event log; engine такого понятия не имеет |
| `createdAt` | **нужен** | engine хранит только даты без времени (`cycleStartDate`); для неизменяемого штампа создания и упорядочивания циклов нужен wall-clock |
| `initialAssessmentSnapshot` | **нужен** | `state.decision` пересчитывается при каждом переходе; первичная оценка иначе невосстановима |
| `initialPerformance` | **нужен** | `recordCheckpoint` перезаписывает `profile.performance`; старое значение исчезает из состояния полностью (проверено) |
| `initialTarget` | **нужен** | `updateTrainingData` перезаписывает `targetTimeSeconds`; прежнее значение в состоянии не остаётся (проверено) |
| `initialRaceDate` | **нужен** | то же для `raceDate` (проверено) |
| текущее сериализованное состояние engine | **нужен** | единственный источник истины о плане; хранится ровно как `serialize()`, без ручного редактирования |
| версия формата приложения | **нужен** | UI-GAP-09: envelope должен быть версионируемым с первой версии |
| версия/совместимость состояния engine | **нужен (зеркало)** | `state.version` (сейчас `1`); `deserialize` бросает `Unsupported state version` |
| event log | **нужен** | см. §5: пропуски, переносы, checkpoint, изменения параметров, финальные коррекции |
| финальный статус цикла | **НЕ хранить** | полностью выводится из `finalResultRecorded` + `raceDate` + `deviceToday`; хранение создало бы второй источник истины |

### 4.1. Схема

```ts
type AppStateV1 = {
  formatVersion: 1;                    // версия envelope приложения
  cycle: {
    cycleId: string;                   // app-generated (uuid)
    createdAt: string;                 // ISO wall-clock, immutable
    engineStateVersion: number;        // зеркало engineState.version, для быстрой проверки совместимости
    engineState: string;               // РОВНО serialize(engineState), opaque
    baseline: {                        // immutable снимки момента создания цикла
      performance: {timeSeconds: number; date: string; source: 'TEST_3K' | 'OFFICIAL_3K'};
      targetTimeSeconds: number;
      raceDate: string;
      assessment: {
        capacity: string; quality: string; confidence: string;
        feasibility: string | null; gate: string; phase: string; reasons: string[];
      };
    };
  };
  events: CycleEvent[];                // append-only, §5
  ui: { units: 'METRIC'; locale: string };
};
```

---

## 5. Минимальный Event Log

Принцип: логируем только то, что **не восстанавливается** из архивного состояния engine. Всё остальное
остаётся единственным источником истины в engine и не дублируется.

| Требование истории | Источник | Логировать? |
|---|---|---|
| исходное состояние | `cycle.baseline` | нет (но есть `CYCLE_CREATED` для хронологии) |
| выполненные тренировки + классификация | `engineState.history` | **нет** — дублирование запрещено |
| пропуски | `engineState.skippedWorkouts` даёт список, но не причину | **да** — `WORKOUT_SKIPPED` |
| переносы | `movedWorkouts` хранит только *текущие* переносы и очищается при списании (проверено) | **да** — `WORKOUT_MOVED` |
| контрольные результаты | `recordCheckpoint` не пишет в `history` (проверено) | **да** — `CHECKPOINT_RECORDED` |
| изменения исходных параметров | предыдущие значения уничтожаются (проверено) | **да** — `TRAINING_PARAMETERS_CHANGED` |
| итоговый забег | `profile.raceDate` архивного состояния | нет |
| финальный результат | `profile.performance` + `finalResultRecorded` | **да** — `FINAL_RESULT_RECORDED` (сохраняет коррекции: повторный ввод перезаписывает значение) |

```ts
type CycleEvent =
  | {type: 'CYCLE_CREATED'; at: string; cycleId: string}
  | {type: 'WORKOUT_SKIPPED'; at: string; workoutId: string; scheduledDate: string;
     workoutType: string; cause: 'VOLUNTARY' | 'PAST_DUE'}
  | {type: 'WORKOUT_MOVED'; at: string; workoutId: string; fromDate: string; toDate: string}
  | {type: 'CHECKPOINT_RECORDED'; at: string; result: {timeSeconds: number; date: string; source: string};
     previousPerformance: number | null; decisionAfter: {gate: string; phase: string; feasibility: string | null;
     confidence: string; capacity: string; quality: string; reasons: string[]}}
  | {type: 'TRAINING_PARAMETERS_CHANGED'; at: string; from: Record<string, unknown>; to: Record<string, unknown>}
  | {type: 'FINAL_RESULT_RECORDED'; at: string; result: {timeSeconds: number; date: string; source: string}};
```

**Правила event log**

1. Append-only. Существующие записи не изменяются и не удаляются.
2. Event log **никогда** не используется для вычисления будущих тренировок и не влияет на вызовы engine.
3. В записях нет спортивных решений, кроме тех, что engine вернул (например `decisionAfter` для checkpoint —
   это дословный ответ engine, а не вывод приложения).
4. `at` — wall-clock ISO; отсутствие времени в engine (проверено: у `HistoryEntry` нет штампа времени) —
   причина, по которой журнал нужен на уровне приложения.

---

## 6. Обязательные orchestration invariants

### INV-1. Сначала невнесённые результаты — потом продвижение часов

**Измерено:** *каждая* операция, продвигающая `state.asOf`, списывает невыполненные прошедшие тренировки и
делает их безвозвратно неотчётными:

| Операция с `now > asOf` | Тренировка списана | Результат ещё принимается |
|---|---|---|
| `replan` | да | нет |
| `skipWorkout` | да | нет |
| `applyBreak` | да | нет |
| `resolveDiagnostic` | да | нет |
| `updateTrainingData` | да | нет |
| `recordCheckpoint` | да | нет |

При этом невнесённый результат **принимается**, пока часы не продвинуты: состояние вчерашнего дня принимает
результат вчерашней тренировки даже если приложение открыто сегодня (проверено).

**Правило.** Перед вызовом любой из шести операций с `now > state.asOf` приложение обязано обработать

```
pendingResults(state, deviceToday) =
  state.queue.filter(w => day(w.scheduledDate) < day(deviceToday) &&
                          !state.skippedIds.includes(w.id))
```

то есть для каждой такой тренировки: либо принять результат (результат принимается, пока `asOf` не продвинут),
либо явно зафиксировать пропуск с `cause: 'PAST_DUE'`. UI не имеет права вызывать эти операции напрямую в обход
правила.

**Следствие (порядок ввода).** Результаты вносятся в хронологическом порядке. Ввод более поздней тренировки
продвигает `asOf` и списывает более ранние: после этого ранний результат отклоняется (`Unknown or completed
workout`).

### INV-2. Только публичный API
Application layer вызывает engine исключительно через операции §7.1 и `serialize`/`deserialize`. Прямая
мутация `EngineState` или `Workout` запрещена.

### INV-3. Один источник истины
Будущие тренировки определяются только текущим состоянием engine. Event log и `baseline` — прошлое.

### INV-4. Сохранить до отображения
Новое состояние engine записывается в хранилище **до** отображения результата пользователю: иначе сбой
приложения потеряет переход. Запись envelope — одной атомарной операцией.

### INV-5. Никаких прогнозов
UI не прогнозирует тренировки за пределами возвращённого горизонта и не создаёт план сам.

### INV-6. `classify` не переписывается
Классификация берётся из `engineState.history[].classified`. Предпросмотр оценки во frontend не реализуется.

### INV-7. Календарь
«Сегодня» — из часов устройства. Арифметика дат — через `day`/`addDays` (UTC).

### INV-8. Ошибки не подавляются
Ошибки engine обрабатываются явно (§5.3); `EventDatePassedError` переводит UI в терминальный сценарий.

### INV-9. Один активный цикл
Одновременно существует не более одного активного цикла; завершённый переносится в архив.

---

## 7. Изменения публичного API engine

Необходимы **ровно две** группы изменений — UI-GAP-06 и UI-GAP-08. Обе аддитивны.

### 7.1. Что уже достаточно и менять не нужно

`createEngine`, `replan`, `recordResult`, `recordCheckpoint`, `recordFinalResult`, `skipWorkout`, `moveWorkout`,
`applyBreak`, `resolveDiagnostic`, `updateTrainingData`, `serialize`, `deserialize`, `decide`, `validateProfile`,
`validateResult`, `validateSafety`, `validateEventDate`, `day`, `addDays`, `taperDays`, `EventDatePassedError`.

В частности **не требуется**:
- API полного плана цикла (решение по UI-GAP-01: UX сужается);
- API истории Performance (UI-GAP-02: snapshot в application layer);
- API журнала checkpoint (UI-GAP-03: event log в application layer);
- API diff «что изменилось» (UI-GAP-04: сравнение снапшотов в application layer);
- per-type контракт `requiredFeedback` (UI-GAP-05: универсальная форма в MVP);
- API «список невнесённых результатов» (UI-GAP-07: выводится из состояния, см. INV-1);
- API расписания checkpoint (UI-GAP-10: UX сужается).

### 7.2. Изменение A — стабильные коды ошибок (UI-GAP-06)

Сейчас кодов нет: 30 различных сообщений, из них одно динамическое
(`Number outside ${min}..${max}`), и только `EVENT_DATE_PASSED` машиночитаем. Сопоставление по строкам
непригодно, особенно для динамического сообщения.

**Статус: реализовано** в ветке `pwa/api-contract` (`src/errors.ts`), спортивная логика не затронута;
эквивалентность поведения подтверждена differential-прогоном против `34cd5e8`.

Предложение (аддитивное), как оно было зафиксировано на этапе анализа:

```ts
export type EngineErrorCode =
  // validation
  | 'INVALID_DATE_FORMAT' | 'INVALID_CALENDAR_DATE' | 'NUMBER_OUT_OF_RANGE' | 'INVALID_SAFETY_FLAG'
  | 'INVALID_PROFILE_FLAG' | 'INVALID_QUALITY_WEEKS' | 'INVALID_MISMATCH' | 'INVALID_PERFORMANCE_SOURCE'
  | 'INVALID_BREAK_REASON' | 'INVALID_BREAK' | 'FUTURE_PERFORMANCE' | 'AVAILABILITY_NOT_INTEGER'
  | 'INVALID_YELLOW_REASON' | 'INVALID_FATIGUE_FLAG'
  // lifecycle
  | 'EVENT_DATE_PASSED' | 'CLOCK_BACKWARDS' | 'UNSUPPORTED_STATE_VERSION' | 'WORKOUT_BLOCKED_BY_PHASE_OR_SAFETY'
  // workout / transition
  | 'UNKNOWN_WORKOUT' | 'UNKNOWN_OR_COMPLETED_WORKOUT' | 'RESULT_PRECEDES_STATE' | 'RECOVERY_OR_QUALITY_LIMIT'
  | 'PROTECTED_FIELD' | 'CHECKPOINT_NOT_PERMITTED' | 'INVALID_CHECKPOINT_DATE'
  | 'FINAL_RESULT_NOT_ON_EVENT_DATE' | 'FINAL_RESULT_BEFORE_EVENT'
  | 'MOVE_OUTSIDE_HORIZON' | 'MOVE_OCCUPIED_DATE' | 'MOVE_RECOVERY_VIOLATION' | 'MOVE_QUALITY_LIMIT_VIOLATION';

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly details?: Record<string, number | string>;   // например {min, max} для NUMBER_OUT_OF_RANGE
}
export class EventDatePassedError extends EngineError { readonly code = 'EVENT_DATE_PASSED'; }
```

Соответствие «сообщение → код» — 1:1: 30 различных сообщений в 31 строке с `throw` (две строки содержат по две
проверки), плюс уже существующий `EVENT_DATE_PASSED`. `details` нужен там, где сообщение параметризовано
(`NUMBER_OUT_OF_RANGE`).

**Нейтральность для спортивной логики.** Изменяются только конструкции ошибок (добавление базового класса и
поля `code`). Ни одно условие, порог, ветвление, порядок вычислений и возвращаемое значение не меняется; ошибки
не входят в состояние, поэтому детерминированность не затрагивается. `EventDatePassedError` остаётся отдельным
классом с тем же `code`, теперь наследующим `EngineError`, а тексты сообщений сохраняются дословно — поэтому
существующие проверки в тестах продолжают работать: `assert.throws(fn, /regex/)` по тексту,
`assert.throws(fn, Error)`, а также `e instanceof EventDatePassedError && e.code === 'EVENT_DATE_PASSED'`
(три места в тестах). Проверка: все 237 тестов должны пройти без изменений.

### 7.3. Изменение B — runtime-константы кодов (UI-GAP-08)

Значения, которые UI обязан переводить исчерпывающе, существуют только как TS-типы: `ReasonCode` (19),
`WorkoutType` (9), `Evaluation` (4), `YellowReason` (7), `Phase` (6), `Gate` (3), `Capacity` (4),
`QualityExperience` (3), `Confidence` (4), `Feasibility` (4), `SafetyStatus` (3), `Anchor` (4). Плюс значения
полей `Workout`: `goal`, `main.mode`, `effortCues`, и `PerformanceSnapshot.source`.

Предложение (аддитивное, с проверкой полноты на компиляции):

```ts
export const REASON_CODES = ['GOAL_GAP_TOO_LARGE', 'TARGET_GATE_CLOSED', /* … 19 значений */] as const
  satisfies readonly ReasonCode[];
type MissingReason = Exclude<ReasonCode, (typeof REASON_CODES)[number]>;
const _reasonCodesComplete: MissingReason extends never ? true : never = true;   // ломает сборку при пропуске
```

**Статус: реализовано** в ветке `pwa/api-contract` (`src/models.ts`): каталоги объявлены как `Object.freeze([...] as const)`,
а соответствующие union-типы выведены из них, поэтому отдельного type-level перечня не существует и
дублирование невозможно. Дополнительно к перечисленному выше экспортированы `DOSE_UNITS`, `FEEDBACK_FIELDS`
и `PERFORMANCE_MISMATCH_LEVELS`, а `ERROR_CODES` добавлен вместе с контрактом ошибок (§7.2).
Итого 20 каталогов значений + `ERROR_CODES`.

**Нейтральность.** Только добавление `const`-массивов, выведенных из существующих union-типов через
`satisfies`. Логика engine их не читает; поведение и детерминированность не меняются. Проверка: 237 тестов
без изменений.

### 7.4. Порядок и разблокировка

Обе группы не являются спортивными и не требовали утверждения спортивной модели. **Обе реализованы** в
ветке `pwa/api-contract`; вопрос B2 закрыт. UI больше не обязан сопоставлять англоязычные строки: тип ошибки
определяется по `error.code`, а конечные наборы значений доступны одновременно на runtime и type level.

---

## 8. Персистентность

### 8.1. Хранилище

| Ключ | Содержимое |
|---|---|
| `fizuha.activeCycle` | `AppStateV1` активного цикла, одной записью |
| `fizuha.archivedCycles` | `ArchiveStoreV1`: `formatVersion` + `cycles[]`, каждая запись — `{cycleId, archivedAt, appState: AppStateV1}` |
| `fizuha.settings` | UI-настройки (единицы, локаль, тема) — вне envelope |

### 8.2. Правила

1. `formatVersion` присутствует с первой версии. Запись envelope — атомарная (целиком, одним ключом).
2. `engineState` — opaque-строка ровно в формате `serialize()`. Ручное редактирование запрещено.
3. Чтение: `deserialize` вызывается внутри `try/catch` и различает три класса отказа:
   - `SyntaxError` — повреждённая запись;
   - ошибка с кодом `UNSUPPORTED_STATE_VERSION` — несовместимая версия состояния engine;
   - `EVENT_DATE_PASSED` — состояние с часами за стартом без терминального маркера (легитимно невозможно).
   В любом из случаев приложение не «чинит» состояние молча: показывает явное состояние ошибки.
4. Несовместимость envelope:
   - `formatVersion > SUPPORTED` → активный цикл не открывается для продолжения; показывается read-only
     уведомление (данные не удаляются);
   - `formatVersion < SUPPORTED` → только если существует явная миграция; иначе цикл доступен как архив.
5. Сложная система миграций не проектируется: одна проверка версии и один путь read-only. Миграция
   добавляется только при фактической необходимости.
6. Архив: при переходе в `COMPLETED` envelope переносится в `fizuha.archivedCycles`. Это собственный
   versioned container `ArchiveStoreV1` (`formatVersion`, `cycles[]`); запись архива — `cycleId`,
   `archivedAt` и полный завершённый `AppStateV1`. `engineState` внутри записи остаётся opaque-строкой
   `serialize()`, архивный repository её не разбирает и не меняет. Новой спортивной сущности не
   появляется, но сам архив не равен одному `AppStateV1`.
7. Политика хранения (§11–B6): архив хранит **все** завершённые циклы. Hard limit, правило «последние N
   циклов» и автоматическое удаление или вытеснение старых записей в MVP отсутствуют; удаление истории
   отдельно не реализовано. Повреждённая или несовместимая запись даёт read-only/error state, но не
   удаление и не «починку» данных.

---

## 9. Матрица сценариев

Покрыты все 15 пунктов задания; пункт «GREEN_PLUS / GREEN / YELLOW / RED» раскрыт в четыре строки.

| # | Сценарий | Хранит приложение | Передаёт в engine | Решает engine | Показывает UI |
|---|---|---|---|---|---|
| 1 | Первый запуск | ничего (состояние FIRST_RUN) | — | — | экран 01 |
| 2 | Создание цикла | envelope: `cycleId`, `createdAt`, `baseline`, `engineState` + `CYCLE_CREATED` | `validateProfile` → `createEngine(profile, deviceToday)` | T/Q/Confidence/Feasibility/Gate/Phase, первичная очередь | экраны 03 → 04 → 05 |
| 3 | Обычная тренировка | ничего дополнительно | ничего до ввода результата | — | карточка из `Workout` |
| 4a | GREEN_PLUS | новое `engineState` | `recordResult` | оценка + возможный checkpoint/адаптация | экран 08: «Отличное выполнение»; изменения из сравнения снапшотов |
| 4b | GREEN | новое `engineState` | `recordResult` | оценка, прогрессия при подтверждениях | экран 08: «Тренировка выполнена» |
| 4c | YELLOW | новое `engineState` | `recordResult` | блокировка прогрессии, возможный пересчёт дозы | экран 08 + reason code из `decision.reasons` |
| 4d | RED | новое `engineState` | `recordResult` | STOP/HOLD, `HOLD_DIAGNOSTIC`, очередь REST | экран 08: «Снизить нагрузку» + дальнейшие действия |
| 5 | Перенос | `WORKOUT_MOVED` + новое `engineState` | `moveWorkout(state, id, date)` | допустимость даты (горизонт, занятость, восстановление, лимит, день старта) | новая дата; при отказе — сообщение по `code` |
| 6 | Пропуск | `WORKOUT_SKIPPED(cause=VOLUNTARY)` + `engineState` | `skipWorkout` | новая очередь по INV-1-семантике | «Тренировка пропущена» + план |
| 7 | Past-due miss | `WORKOUT_SKIPPED(cause=PAST_DUE)` + `engineState` | сначала INV-1, затем `replan(deviceToday)` | списание и перестройка очереди | «Предыдущая тренировка не выполнена» + план |
| 8 | Checkpoint | `CHECKPOINT_RECORDED` (+`previousPerformance`, `decisionAfter`) + `engineState` | `recordCheckpoint` | новое Current Performance, пересчёт T/Q, Gate, Feasibility | экран 09: форма + оценка + следующий этап |
| 9 | Изменение цели | `TRAINING_PARAMETERS_CHANGED` + `engineState` | `updateTrainingData({targetTimeSeconds})` | новая Feasibility/Gate/очередь | только изменившиеся поля; причина — из reason codes |
| 10 | Изменение raceDate | `TRAINING_PARAMETERS_CHANGED` + `engineState` | `updateTrainingData({raceDate})` | проверка даты старта, taper, очередь | новая дата; при `EVENT_DATE_PASSED` — объяснение |
| 11 | Taper | ничего | `replan` (обновление горизонта) | `phase='TAPER'`, `volumeFactor` по датам | экран taper: дни до старта, объяснение |
| 12 | raceDate | ничего | ничего | очередь пуста (тренировок на день старта нет) | экран 10 «Сегодня забег» |
| 13 | Отложенный финальный результат | `FINAL_RESULT_RECORDED` + `engineState` | `recordFinalResult` | результат → Current Performance, checkpoint закрыт, очередь пуста | экран 11 → 12 |
| 14 | Завершение цикла | перенос envelope в архив | − (статус вычисляется) | `finalResultRecorded` уже в состоянии | экран 12 из `baseline` + `history` + event log |
| 15 | История после перезапуска | чтение envelope → `deserialize` в `try/catch` | `deserialize` | валидация формы и пересчёт `decision` | история текущего/архивного цикла |

---

## 10. GAP, закрываемые без изменения кода

UI-GAP-01, 02, 03, 04, 05, 07, 09, 10, 11, 12 — закрываются UX-решениями и application layer. Изменения
публичного API требуют только UI-GAP-06 и UI-GAP-08.

---

## 11. Изменения первоначальных требований UX

| Пункт UX | Было | Стало |
|---|---|---|
| §9 / экран 05 | «количество оставшихся тренировок», «контрольные точки» как список | фактический горизонт + `taper` (оценка) + `raceDate`; checkpoint — CTA при `checkpointRequired` |
| §11 | вертикальная линия на весь цикл | горизонт engine + известные этапы; прогноз тренировок запрещён |
| §14 | «форма результата зависит от типа тренировки» | MVP: одна универсальная форма по `requiredFeedback` |
| §16, §20 | «Было → Стало» с объяснением причины | только фактически изменившиеся данные; причина — исключительно из reason codes engine |
| §25 / экран 12 | «Старт» и «контрольные результаты» из данных системы | «Старт» — из app `baseline`; контрольные — из app event log |
| §26 | архив циклов | app-level архив: versioned `ArchiveStoreV1` (`formatVersion` + `cycles[]`) поверх `serialize()`; в записи — полный `AppStateV1`, новой спортивной сущности нет |
| §17 | ручной перенос под вопросом | перенос **поддерживается** (`moveWorkout`), ограничен горизонтом 7 дней и не может попасть на день старта |
| §21 | «изменение исходного уровня» | только через `recordCheckpoint` с его предусловиями; `performance`/`safety`/`breaks` защищены от `updateTrainingData` |

---

## 12. Блокирующие вопросы перед началом UI

| ID | Вопрос | Почему блокирует | Значение по умолчанию |
|---|---|---|---|
| B1 | Последствие универсальной формы (UI-GAP-05), **измерено**: для `THRESHOLD` (есть `speedRangeMps`) пустой `repeats` даёт `YELLOW / EXECUTION` (`inRangeFraction = 0`), заполненный — `GREEN`; для `EASY` (диапазона нет) пустой `repeats` даёт `GREEN` | влияет на приём результата и на достоверность адаптации: пользователь, не заполнивший повторы на темповой работе, законно получит YELLOW и другую нагрузку | показывать поле `repeats` развёрнутым для тренировок с заданным `speedRangeMps` + ненавязчивое предупреждение; per-type контракт не вводить |
| B2 | ~~Одобрение изменения API (UI-GAP-06/08)~~ **закрыт**: реализовано в ветке `pwa/api-contract`, ожидает merge в `main` | — | — |
| B3 | Кто и как утверждает русские тексты для 19 reason codes, 4 оценок, 7 yellow reasons, 6 фаз | статический mapping — часть UI; без него экран 08/09 неполон | таблица текстов как версионируемый артефакт продукта |
| B4 | Нужна ли на экране «План» будущая дата контрольной точки | сейчас закрыто UX; при требовании нужен новый API | не требуется в MVP |
| B5 | Единицы и форматы ввода (ММ:СС, темп/скорость, метрика) | влияет на формы | метрика, ММ:СС, темп сек/км |
| B6 | ~~Политика хранения архива~~ **закрыт**: хранить все завершённые циклы локально, hard limit в MVP отсутствует (удаление и вытеснение не реализованы) | — | — |

---

## 13. Критерий готовности

Для каждого UI-GAP-01…12 принято однозначное решение (§2). Контракт Engine ↔ Application ↔ UI определён
через: границу ответственности (§1), модель цикла (§3), минимальный `AppState` (§4), event log (§5),
invariants (§6), две аддитивные группы изменений API (§7) и правила персистентности (§8). Все 15
пользовательских сценариев сопоставлены с контрактом (§9). Дублирования спортивной логики во frontend не
требуется ни в одном сценарии.

Переход к wireframes возможен; блокируют только B1–B6, из которых программно значим B2.

## 11. Реализованный final lifecycle

В срезе `pwa/final-lifecycle` реализованы изменение цели/даты, terminal Final Result, безопасный versioned archive всех completed cycles, summary/reload и новый цикл. Контракт и storage sequence описаны в [final-lifecycle.md](final-lifecycle.md).

Уточнение прежнего INV-1: обычные clock-sensitive действия остаются заблокированы pending-тренировками, но `recordFinalResult` — terminal transition и к этому запрету не относится. Поэтому race/awaiting screens доступны раньше pending screen, сохраняя pending guard обычных действий. Immutable baseline, opaque engine state и append-only события сохранены.
