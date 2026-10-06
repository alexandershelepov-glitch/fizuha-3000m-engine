# UI ↔ ENGINE CONTRACT — сопоставление UX-модели с публичным API

Статус: результат этапа «сопоставление UX-архитектуры с реальным публичным API» (§33 UX-спецификации).
Проверяемый артефакт: commit `34cd5e86ac2c3fe1e892e2b0ec703939679226a8`, ветка `audit/deepseek`.
Спортивная модель **не изменялась**: это документ анализа границы UI ↔ engine, а не запрос на изменение правил.

Все утверждения ниже сняты эмпирически прогоном публичного API на реальных профилях, а не выведены из типов.
Формулировки «NO / yes» — фактические результаты этих прогонов.

---

## 1. Инвентарь публичного API (31 runtime-символ)

Полный список экспортов `src/index.ts` на момент анализа (commit `34cd5e8`). Разделы UI-GAP-06 и
UI-GAP-08 ниже закрыты в ветке `pwa/api-contract`: добавлены `EngineError`, `ERROR_CODES` и runtime-каталоги
значений (см. пометки «Закрыто» в соответствующих разделах).

```
EventDatePassedError, addDays, applyBreak, assessCapacity, assessConfidence, assessFeasibility,
assessQuality, assessSafety, classify, createEngine, day, decide, deserialize, generateQueue,
initialDose, moveWorkout, prescribe, recordCheckpoint, recordFinalResult, recordResult, replan,
resolveDiagnostic, serialize, skipWorkout, taperDays, updateTrainingData, validateEventDate,
validateProfile, validateResult, validateSafety, yellowFamily
```

### 1.1. Операции, входящие в UI-контракт

| Функция | Назначение для UI |
|---|---|
| `createEngine(profile, now)` | создать цикл из анкеты |
| `validateProfile(profile, now)` | предварительная проверка анкеты |
| `validateResult(result)` | предварительная проверка формы результата |
| `validateSafety(safety)` | проверка блока «Текущее состояние» |
| `validateEventDate(profile, now)` | проверка даты старта |
| `replan(state, now?)` | обновить горизонт плана / продвинуть дату |
| `recordResult(state, id, result)` | внести результат тренировки |
| `recordCheckpoint(state, performance, now)` | контрольный тест 3000 м внутри цикла |
| `recordFinalResult(state, performance, now)` | результат итогового забега |
| `skipWorkout(state, id, now?)` | «Не смогу выполнить» |
| `moveWorkout(state, id, date)` | перенос тренировки на другую дату |
| `applyBreak(state, break, now)` | перерыв (в т.ч. болезнь/травма) |
| `resolveDiagnostic(state, safety, now)` | снятие диагностического hold |
| `updateTrainingData(state, partial, now)` | смена цели / `raceDate` / данных подготовки |
| `serialize` / `deserialize` | персистентность состояния (offline PWA, архивы циклов) |
| `decide(state, now)` | **read-only** оценка без изменения состояния |
| `day` / `addDays` | календарная арифметика (UTC) |
| `taperDays(capacity, quality)` | длина taper — для объяснения пользователю |
| `EventDatePassedError` | обработка прошедшей даты старта (`.code === 'EVENT_DATE_PASSED'`) |

### 1.2. Символы, которые UI использовать не должен

`generateQueue`, `prescribe`, `initialDose` — материализуют план в обход переходов движка; вызов из UI создаст
альтернативный планировщик. `classify` и `yellowFamily` — классификация уже возвращается в `HistoryEntry.classified`
после `recordResult`; повторный вызов из UI означает воспроизведение спортивного решения.
`assessCapacity/Confidence/Quality/Feasibility/Safety` — те же значения уже содержатся в `state.decision`; вызов
допустим только для экрана подробностей (§9) как read-only отображение, но не как источник решений.

---

## 2. Что именно UI получает от engine

### 2.1. `state.decision` (12 полей)

```
confidence, capacity, quality, phase, safety, goalGap, feasibility, gate,
currentSpeedMps, effectiveSpeedMps, maximumQualityPerWeek, reasons[]
```

Это единственный источник для экранов 04 и 09 (§9, §20). Поля-даты и обратного отсчёта в `decision` нет
(проверено: `decision` не содержит полей с `date|day|week`).

### 2.2. `Workout` — карточка тренировки (экран 06)

Фактические наблюдаемые формы за полный цикл (все 8 генерируемых типов):

| type | mode | repeats | repeatMeters | unit | targetRpe | anchor | speedRange | warm/cool | rest |
|---|---|---|---|---|---|---|---|---|---|
| `EASY` | CONTINUOUS | 1 | null | METERS | 2–3 | EFFORT | null | 0/0 | 0 |
| `LONG_EASY` | CONTINUOUS | 1 | null | METERS | 2–3 | EFFORT | null | 0/0 | 0 |
| `INTRO_QUALITY` | INTERVALS | 4 | null | MINUTES | 5–6 | EFFORT | null | 10/10 | 90 |
| `THRESHOLD` | CONTINUOUS | 1 | null | MINUTES | 6–7 | CURRENT | есть | 10/10 | 0 |
| `VO2` | INTERVALS | 4 | null | MINUTES | 8–9 | CURRENT | есть | 10/10 | 90 |
| `SPECIFIC_3K` | INTERVALS | 5 | 600 | METERS | 8–9 | EFFECTIVE | есть | 10/10 | 90 |
| `CONTROL` | CONTINUOUS | 1 | null | METERS (3000) | 8–9 | NONE | null | 10/10 | 0 |
| `REST` | REST | 1 | null | MINUTES (0) | 0–0 | NONE | null | 0/0 | 0 |

`goal` — машинный код (`AEROBIC_BASE`, `QUALITY_ADAPTATION`, `ASSESS_CURRENT_PERFORMANCE`, `RECOVERY`);
`effortCues` — коды (`FULL_SENTENCES`, `CONTROLLED_BREATHING`); `anchor` — `CURRENT|EFFECTIVE|EFFORT|NONE`;
`gateAtPrescription`, `volumeFactor`, `countsAsQuality`, `priority`, `minimumRecoveryHoursBeforeQuality`,
`removable`, `movable` — пригодны для экрана подробностей.

### 2.3. `HistoryEntry`

```
{ workout, result, classified }
classified = { sessionLoad, inRangeFraction, speedDropFraction, evaluation, yellowReason }
```

### 2.4. Терминальные состояния

| Состояние UI | Как определяется фактически |
|---|---|
| день забега | `deviceToday === profile.raceDate` |
| ожидание результата | `deviceToday > raceDate && !state.finalResultRecorded` |
| цикл завершён | `state.finalResultRecorded === true` |

`state.asOf` при ожидании результата остаётся равным `raceDate` (проверено), `replan` после `raceDate` бросает
`EventDatePassedError`, `decide(state, laterDate)` при этом **не** бросает и возвращает `phase: 'TAPER'`.

---

## 3. Отображение экранов на API

| Экран / состояние (§) | Источник данных | Вызовы |
|---|---|---|
| 01 Старт | статика | — |
| 02 Анкета | `Profile` (входной контракт `createEngine`) | `validateSafety`, `validateProfile` |
| 03 Проверьте данные | локальная модель формы + `Profile` | `validateProfile` |
| 04 Ваша подготовка | `decision`: capacity, quality, confidence, feasibility, gate, phase, goalGap | `createEngine` |
| 05 План готов | `decision.phase`, `queue`, `raceDate`, `taperDays` | `createEngine` → см. UI-GAP-01/10 |
| 06 Детали тренировки | объект `Workout` | — |
| 07 Ввод результата | `Workout.main`, `Workout.requiredFeedback` | `validateResult` → см. UI-GAP-05 |
| 08 Результат обработки | `HistoryEntry.classified.evaluation`, `decision.reasons` | `recordResult` |
| 09 План обновлён | `decision` (новое) + предыдущий снапшот | `recordCheckpoint` → см. UI-GAP-02/04 |
| 10 Сегодня забег | `raceDate` | — |
| 11 Ввод финального результата | `raceDate` | `recordFinalResult` |
| 12 Подготовка завершена | `history`, `skippedWorkouts`, стартовый/финальный Performance | см. UI-GAP-01/02/03 |
| План (§11) | `queue` (горизонт 7 дней) | `replan` → см. UI-GAP-01 |
| Сегодня (§12, §28) | `queue` + `decision` + `finalResultRecorded` + дата устройства | `replan`, `recordResult`, `skipWorkout` |
| Пропуск (§17, §18) | `skippedWorkouts`, `skippedIds` | `skipWorkout`, `replan` → см. UI-GAP-07 |
| Контрольный тест (§19) | `type === 'CONTROL'` в очереди; `checkpointRequired` | `recordResult`, `recordCheckpoint` |
| Taper (§22) | `decision.phase === 'TAPER'`, `volumeFactor < 1` | `replan` |
| История (§26) | `history`, `skippedWorkouts` | `serialize`/`deserialize` → см. UI-GAP-03/09 |
| Профиль (§27) | `profile`, `state` | `updateTrainingData`, `recordCheckpoint` |

---

## 4. Статические UI-mapping (без новой спортивной логики)

Перевод внутренних значений в тексты — это фиксированная таблица UI, не расчёт:

| Значение engine | Текст для пользователя (пример) |
|---|---|
| `capacity: T1` | «Начинаем с умеренной нагрузки. Сначала подтвердим способность стабильно выполнять базовые тренировки» |
| `confidence: UNKNOWN` | «Пока нет свежего результата на 3000 м — начнём с базы» |
| `feasibility: LONG_TERM` | «Цель рассчитана на длительную работу, а не на этот цикл» |
| `gate: CLOSED` | «Тренируемся от подтверждённой текущей формы, целевой темп пока не используем» |
| `phase: FOUNDATION` | «База: спокойный бег и вводная качественная работа» |
| `phase: TAPER` | «Снижение нагрузки перед стартом» |
| `evaluation: GREEN_PLUS` | «Отличное выполнение» |
| `evaluation: GREEN` | «Тренировка выполнена» |
| `evaluation: YELLOW` | «Нагрузка потребовала корректировки» |
| `evaluation: RED` | «Текущую нагрузку необходимо снизить» |
| `anchor: EFFECTIVE` | «Диапазон от целевого темпа (открыт движком)» |
| `volumeFactor: 0.6` | «Объём снижен до 60 %» |

`decision.reasons` (19 кодов) и `classified.yellowReason` (7 кодов) переводятся той же статической таблицей.
Значения вне таблицы должны показываться нейтрально и логироваться, а не интерпретироваться UI.

---

## 5. UI INTEGRATION GAPS

Ниже — конкретный перечень. Severity относится к блокировке экранов UX-модели.

### UI-GAP-01 — нет полного плана цикла · **BLOCKER** (экраны 05, 11)

`state.queue` — скользящий горизонт 7 дней. Прогон: до старта 70 дней, в очереди 3 тренировки. Полного плана до
`raceDate` в API нет: `generateQueue` по конструкции ограничен неделей. Значит, «количество оставшихся
тренировок» и «контрольные точки» на экране 05 и вертикальная линия до старта на экране 11 из данных engine не
строятся. Единственная ключевая дата, которую можно вывести, — начало taper: `raceDate − taperDays(capacity, quality)`.
Запрос: либо API «план/вехи до старта», либо явное сужение UX-модели до 7-дневного горизонта + ключевые даты.

### UI-GAP-02 — нет истории Performance Snapshot · **BLOCKER** (экран 12, §20)

`recordCheckpoint` перезаписывает `profile.performance`; прежнее значение исчезает из состояния полностью
(прогон: старого `920` в сериализованном состоянии нет, поля-истории performance в состоянии нет). Поэтому
«Старт — начальный Current Performance» и «Текущая форма: старое → новое» невыводимы. Запрос: read-only список
снимков Performance (как минимум стартовый снимок цикла). Обходной путь: UI сам хранит стартовое значение и
историю — это приложение-уровневая память, не спортивная логика.

### UI-GAP-03 — контрольные тесты не попадают в историю · **BLOCKER** (экран 12)

`recordCheckpoint` не добавляет запись в `state.history` (прогон: было 0, стало 0). Результаты `CONTROL`-тренировок
в историю попадают, но они по определению не меняют Current Performance. Значит «контрольные результаты» на
экране 12 из `history` не собираются. Запрос: логировать переход checkpoint (или отдельный журнал тестов).

### UI-GAP-04 — нет «что именно изменилось» · **HIGH** (экраны 08, 09, §16, §20)

В `decision` и в состоянии нет ни одного поля-diff (прогон: полей с `diff|change|previous` нет). «План обновлён»,
«Было → Стало» должен формировать UI, сравнивая собственные снапшоты. Это допустимо (презентация), но требует
явного благословения контракта и хранения предыдущего снапшота на каждый переход. Запрос: либо diff от engine,
либо пункт контракта «UI diff-ит только презентационные поля (следующая тренировка, phase, gate, reasons)».

### UI-GAP-05 — `requiredFeedback` не является контрактом по типу · **HIGH** (экран 07, §14, §31-5)

`requiredFeedback` — константный список из 9 полей, одинаковый для всех типов (прогон: `distinct values = 1`;
идентичен для `LONG_EASY` и `SPECIFIC_3K`). Контракта формы результата «по типу тренировки» в API нет. UI обязан
сам выводить состав формы из `type`, `main.mode`, `main.repeats`, `main.repeatMeters`, `main.finalRepeatMeters`,
`restSeconds`, `countsAsQuality`, `speedRangeMps`. Отдельный случай: `INTERVALS` с `repeatMeters: null`
(`VO2`, `INTRO_QUALITY`) — дистанция отрезка не определена, длительность задаётся суммарно в минутах.
Запрос: таблица «тип → поля формы», зафиксированная как часть контракта.

### UI-GAP-06 — машинный код есть только у одной ошибки · **HIGH** (§7, экраны 02–03)

Фактические поверхности ошибок:

| Ситуация | name | code | message |
|---|---|---|---|
| прошедшая дата старта | `EventDatePassedError` | `EVENT_DATE_PASSED` | `EVENT_DATE_PASSED: …` |
| `targetTimeSeconds = 0` | `Error` | — | `Number outside 1..Infinity` |
| `availableRunsPerWeek = 0` | `Error` | — | `Number outside 1..7` |
| защищённое поле | `Error` | — | `Protected field` |
| неизвестная тренировка | `Error` | — | `Unknown or completed workout` |
| выход за горизонт | `Error` | — | `Move outside queue horizon` |
| checkpoint не разрешён | `Error` | — | `Checkpoint not permitted` |
| перенос ломает восстановление | `Error` | — | `Move violates recovery` |

Кода нет ни у одной, кроме `EVENT_DATE_PASSED`. Перевод в понятный текст возможен только сопоставлением строк —
хрупко. Запрос: `code` у всех validation/lifecycle ошибок (по образцу `EventDatePassedError`) либо
документированная таблица message → текст.

> **Закрыто (ветка `pwa/api-contract`).** Добавлен базовый класс `EngineError` с полем `code` и
> структурированным `details`; коды присвоены всем **30** сообщениям (31 код вместе с `EVENT_DATE_PASSED`),
> а `EventDatePassedError` теперь наследует `EngineError`, сохраняя класс, код, имя и текст. Тексты сообщений
> не изменялись: они выводятся из одной таблицы «код → сообщение». Динамическое сообщение
> `Number outside 1..7` осталось прежним, а параметры `{min, max, value}` передаются в `details`.
> Контракт зафиксирован тестами `tests/api-contract.test.ts` (по одному тесту на каждый код).
> Разбор строки для определения типа ошибки больше не требуется.

### UI-GAP-07 — нет источника пропуска и нет «списка невнесённых результатов» · **MEDIUM** (§18, §17)

Добровольный пропуск и автоматический past-due дают идентичную бухгалтерию (прогон: `skippedIds` и
`skippedWorkouts` совпадают, различается только `asOf`) — это утверждённая семантика A2, и она не даёт UI
ответа «кто и когда». Отдельно важное следствие: после `replan` на новую дату пропущенная тренировка уже не
принимает результат (`Unknown or completed workout`). Поэтому UI обязан **сначала** дать пользователю внести
результат за прошедшую тренировку из сохранённого состояния и **только потом** вызывать `replan` с новой датой,
иначе выполненная вчера работа будет списана как пропуск. Запрос: helper «тренировки, ожидающие результат, до
продвижения часов» и/или признак источника пропуска + отметка «показано пользователю».

### UI-GAP-08 — нет runtime-перечислений кодов · **MEDIUM** (все экраны с mapping)

`ReasonCode` (19 значений), `WorkoutType` (9), `Evaluation` (4), `YellowReason` (7), `Phase`, `Gate`, `Capacity`,
`QualityExperience`, `Confidence`, `Feasibility`, `SafetyStatus`, `Anchor` существуют только как TS-типы. В рантайме
их нет, поэтому статический mapping UI нельзя проверить на полноту, и он молча разъедется при добавлении значения.
Прогон: в моих сценариях встретилось 11 из 19 reason codes; про остальные 8 UI узнает только из типа.
Запрос: экспортированные константные массивы (с гарантией стабильности).

> **Закрыто (ветка `pwa/api-contract`).** Экспортированы 20 замороженных runtime-каталогов
> (`CONFIDENCES`, `CAPACITIES`, `QUALITY_LEVELS`, `PHASES`, `SAFETY_STATUSES`, `FEASIBILITIES`, `GATES`,
> `WORKOUT_TYPES`, `WORKOUT_GOALS`, `MAIN_MODES`, `DOSE_UNITS`, `EFFORT_CUES`, `ANCHORS`, `FEEDBACK_FIELDS`,
> `EVALUATIONS`, `YELLOW_REASONS`, `REASON_CODES`, `PERFORMANCE_SOURCES`, `BREAK_REASONS`,
> `PERFORMANCE_MISMATCH_LEVELS`) вместе с `ERROR_CODES`. Единый источник истины — массив: TypeScript-union
> выводится из него (`typeof CATALOG[number]`), поэтому runtime-список и тип не могут разойтись, а
> исчерпывающий mapping UI (`satisfies Record<Phase, string>`) перестаёт компилироваться при добавлении
> значения. Каталоги проверены тестами на полноту, уникальность и неизменяемость.

### UI-GAP-09 — нет политики версионирования состояния · **MEDIUM** (§26, offline PWA)

Персистентность есть (`serialize`/`deserialize`), но версия одна — `version: 1`, при несовпадении
`Unsupported state version`, миграций нет. Offline PWA обязана хранить состояние между запусками и обновлениями.
Также §26 разрешает app-level хранение завершённых циклов «только при чётко определённом формате сериализованного
состояния engine» — этого соглашения пока нет. Запрос: зафиксировать `serialize()` как стабильный формат архива и
политику миграции по `version`.

### UI-GAP-10 — нет расписания контрольных точек · **LOW/MEDIUM** (экран 05, §11)

Доступен только булев `checkpointRequired`. Экран 05 обещает показать «контрольные точки» заранее, экран 11 —
отметить контрольный тест; фактически видны только `CONTROL`-тренировки внутри 7-дневного горизонта. Запрос
(опционально): ближайшая дата контрольной точки, которую движок и так вычисляет по `lastAssessmentDate + 21`
и по триггерам GREEN_PLUS/RE_ENTRY.

### UI-GAP-11 — `STRIDES` в модели есть, но не генерируется · **LOW** (§11, §14)

`STRIDES` входит в `WorkoutType` и упомянут в UX-модели, но за полный цикл на 5 профилях генератор его не выдал
(совпадает с doc 12). Рендерер типа всё равно должен иметь ветку `STRIDES` для совместимости вперёд, но в v1
ожидать его не нужно. Реально генерируются 8 типов, включая `REST` (при safety hold).

### UI-GAP-12 — `maximumQualityPerWeek` в терминальном состоянии · **LOW** (косметика)

После `recordFinalResult` `decision.maximumQualityPerWeek` по-прежнему отражает ёмкость профиля, хотя очереди
нет и `replan` запрещён. UI не должен показывать «до 2 качественных в неделю» после завершения цикла.

---

## 6. Обязательные правила вывода (зафиксировать в контракте)

Это не отсутствующие API, а правила, без которых UI неизбежно ошибётся:

1. **«Сегодня» берётся из часов устройства, не из `state.asOf`.** При ожидании финального результата `asOf`
   остаётся на `raceDate` (проверено), то есть отстаёт от реальной даты.
2. **Терминальные состояния не выводятся из `phase`.** `decide(state, laterDate)` после старта возвращает
   `TAPER` и не бросает. Признаки: `deviceToday` vs `raceDate` и `finalResultRecorded`.
3. **`replan(state, sameAsOf)` безопасен и идемпотентен** — это штатный способ обновить 7-дневный горизонт.
4. **Порядок на старте приложения:** сначала предложить внести невнесённые результаты из сохранённого состояния,
   затем продвигать дату (см. UI-GAP-07).
5. **`moveWorkout` поддерживается полноценно:** перенесённая тренировка переживает `replan` и
   `serialize/deserialize` (проверено). UI обязан обрабатывать его исключения (горизонт, занятая дата,
   восстановление, недельный лимит, день старта) и не писать даты сам.
6. **Смена цели/даты — только `updateTrainingData`;** `performance`, `breaks`, `safety` защищены (`Protected field`)
   и меняются через `recordCheckpoint`, `applyBreak`, `resolveDiagnostic`. Смена исходного уровня внутри цикла
   возможна только через `recordCheckpoint` с его предусловиями и теряет прежнее значение (UI-GAP-02).
7. **`generateQueue` / `prescribe` / `initialDose` из UI не вызываются** — иначе в приложении появится второй
   планировщик.
8. **`classify` не переписывается во frontend.** Нужно отдельно решить: разрешён ли предпросмотр оценки через
   `classify` до отправки, или UI показывает только результат `recordResult`.
9. **Дата начала taper не кэшируется:** `capacity`/`quality` пересчитываются движком на каждом replan, поэтому
   `raceDate − taperDays(...)` нужно пересчитывать, а не запоминать.

---

## 7. Ответы на 10 интеграционных вопросов §31

| № | Вопрос | Статус | Комментарий |
|---|---|---|---|
| 1 | Полное представление плана для UI | **GAP** | UI-GAP-01: только 7-дневный горизонт |
| 2 | «Следующее действие» для экрана «Сегодня» | **Выводимо** | из `decision` + `queue` + дат + `finalResultRecorded`; отдельного поля нет |
| 3 | Человекочитаемая причина / reason codes | **Закрыто** | коды есть (`reasons`, `yellowReason`), текста нет (по §2 это правильно); runtime-наборы значений и каталог `REASON_CODES` добавлены в `pwa/api-contract` (UI-GAP-08) |
| 4 | Что изменилось после адаптации | **GAP** | UI-GAP-04: полей-diff нет |
| 5 | Контракт формы результата по типам | **GAP** | UI-GAP-05: `requiredFeedback` константен |
| 6 | Отдельная поддержка переноса | **Есть** | `moveWorkout`, перенос переживает replan и сериализацию |
| 7 | Смена goal/raceDate в активном цикле | **Есть** | `updateTrainingData`; исходный уровень — только `recordCheckpoint` (UI-GAP-02) |
| 8 | Состояние taper | **Есть** | `phase === 'TAPER'`, `taperDays`, `volumeFactor` |
| 9 | `raceDate` / ожидание / завершение | **Выводимо** | `raceDate` vs «сегодня», `finalResultRecorded`; подводные камни в §6 |
| 10 | Данные для истории цикла | **Частично** | выполненные + классификация + пропуски есть; снимки Performance и контрольные тесты — нет (UI-GAP-02/03) |

---

## 8. Что UI имеет право делать сам (подтверждено)

Навигация, форматирование дат и времени (`day`/`addDays`), модальные окна, UI-настройки, visual design,
синтаксическая проверка формы, статический перевод reason codes в тексты, skeleton/loading/error, PWA-функции,
локальное хранение состояния и снапшотов для diff-экранов.

Чего UI не делает: темп, Training Capacity, фаза, Goal Feasibility, Target Pace Gate, классификация
GREEN/YELLOW/RED, объём, перестройка очереди, реакция на пропуск, RE_ENTRY, taper, назначение тренировки на
`raceDate`, автоматический новый цикл. Всё это уже присутствует в API и подтверждено прогонами.

---

## 9. Рекомендуемый порядок следующего этапа

1. Закрыть или явно принять UI-GAP-01…UI-GAP-12 (решение по каждому: изменение API, либо сужение UX, либо
   app-level обходной путь).
2. Зафиксировать §6 как обязательную часть контракта.
3. Зафиксировать таблицу §4 и таблицу «тип → поля формы» (UI-GAP-05) как версионируемые артефакты.
4. Только после этого — wireframes и реализация экранов.
