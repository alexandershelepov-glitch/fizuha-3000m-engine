# Сравнение до / после исправления D-01, D-02, D-03 (12-недельный аудит)

Сгенерировано `audit/compare12w.ts` из двух прогонов одного и того же набора `npm run audit:12w`: «до» — база `feature/issue-24-calendar` (результат совпадает с PR #35 побайтно), «после» — с исправлением. Всё поведение «пользователей» синтетическое; детекторы не менялись и не фильтровались.

## 1. Находки по видам

| Вид | Серьёзность | До: случаев / сценариев | После: случаев / сценариев | Сценарии после |
|---|---|---|---|---|
| CHECKPOINT_REQUIRED_BUT_REFUSED — D-01 контроль требуется, но движок отказывает | К | 3 / 3 | 0 / 0 | — |
| CONTROL_DISPLACES_SESSION — D-12 контроль вытесняет занятие | Н | 9 / 9 | 12 / 12 | U1-novice-A, U1-novice-B, U1-novice-V, U2-beginner-A, U2-beginner-B, U2-beginner-V, U3-beginner-plus-A, U3-beginner-plus-B, U4-intermediate-B, U6-experienced-B, U2-beginner-S, U3-beginner-plus-S |
| CONTROL_RESETS_PROGRESS — D-02 контроль обнуляет прогресс | М | 12 / 12 | 0 / 0 | — |
| FAILED_TASK_REPEATED_UNCHANGED — D-11 неудача повторяется без изменений | Н | 18 / 4 | 18 / 4 | U1-novice-B, U2-beginner-B, U5-trained-B, U6-experienced-B |
| FREQUENCY_NEVER_PROGRESSES — D-09 частота не растёт | М | 1 / 1 | 1 / 1 | U1-novice-A |
| HOLD_REMOVES_TRAINING — D-07 пауза забирает тренировки | М | 2 / 2 | 2 / 2 | U5-trained-B, U6-experienced-B |
| LONG_RUN_NEVER_PRESCRIBED — D-08 длинная не назначается | М | 2 / 2 | 4 / 4 | U5-trained-A, U6-experienced-A, U5-trained-S, U6-experienced-S |
| PACE_OUT_OF_BAND — D-04 темп вне полосы | М | 7 / 2 | 7 / 2 | U2-beginner-B, U3-beginner-plus-B |
| QUALITY_DOSE_NOT_PROGRESSING — D-03 доза качества не растёт | М | 10 / 6 | 4 / 2 | U6-experienced-A, U6-experienced-S |
| RETURN_TO_FULL_LOAD_AFTER_HOLD — D-06 возврат к полной нагрузке после паузы | М | 3 / 2 | 3 / 2 | U5-trained-B, U6-experienced-B |
| SHORT_RECOVERY_FOR_LONG_REPEATS — D-10 короткий отдых | Н | 26 / 7 | 18 / 4 | U6-experienced-A, U6-experienced-B, U6-experienced-V, U6-experienced-S |
| VOLUME_AND_INTENSITY_RISE_TOGETHER — D-05 объём и интенсивность растут вместе | М | 4 / 2 | 3 / 2 | U4-intermediate-B, U6-experienced-B |
| WEEKLY_VOLUME_JUMP — D-13 скачок недельного объёма | Н | 2 / 2 | 2 / 1 | U4-intermediate-B |

Итого: находок (после группировки по сценарию и коду) до 99, после 74; К/М/Н до 3 / 40 / 56, после 0 / 23 / 51; проверок применено до 3508, после 3565; нарушений до 127, после 75.

## 2. По сценариям (все 23; U1, U3, U4, U5, U6 — в фокусе)

| Сценарий | Находок до → после | Исчезло | Появилось / стало видно | План км до → после (оценка рецензента) | Бюджет движка км, конец: до → после |
|---|---|---|---|---|---|
| U1-novice-A | 2 → 2 | D-01 | D-12 | 33.8 → 33.8 | 3 → 3 |
| U1-novice-B | 2 → 2 | D-01 | D-12 | 32.5 → 32.5 | 3 → 3 |
| U1-novice-V | 1 → 1 | D-01 | D-12 | 33.2 → 33.2 | 3 → 3 |
| U2-beginner-A | 1 → 1 | — | — | 97.2 → 97.5 | 10 → 10 |
| U2-beginner-B | 3 → 3 | — | — | 91.5 → 91.5 | 9 → 9 |
| U2-beginner-V | 1 → 1 | — | — | 92.9 → 93.2 | 9 → 9 |
| U3-beginner-plus-A | 2 → 1 | D-03 | — | 150.3 → 151.7 | 14.5 → 14.5 |
| U3-beginner-plus-B | 2 → 2 | — | — | 138.1 → 136.3 | 13.5 → 13.5 |
| U3-beginner-plus-V | 0 → 0 | — | — | 148.4 → 147.2 | 13.5 → 13.5 |
| U4-intermediate-A | 2 → 0 | D-03, D-02 | — | 220 → 223.1 | 24 → 24 |
| U4-intermediate-B | 4 → 3 | D-02 | — | 191.9 → 191.8 | 19 → 19 |
| U4-intermediate-V | 1 → 0 | D-02 | — | 201.5 → 202.6 | 19 → 19 |
| U5-trained-A | 2 → 1 | D-10, D-02 | D-08 | 278.8 → 277.2 | 29 → 27 |
| U5-trained-B | 4 → 3 | D-02 | — | 198.4 → 198.1 | 25 → 25 |
| U5-trained-V | 2 → 0 | D-10, D-02 | — | 266.7 → 270 | 25 → 25 |
| U6-experienced-A | 4 → 3 | D-02 | — | 420.7 → 421.3 | 42.5 → 42.5 |
| U6-experienced-B | 8 → 6 | D-13, D-02 | — | 298.5 → 302 | 37.5 → 37.5 |
| U6-experienced-V | 2 → 1 | D-02 | — | 419.1 → 414.2 | 37.5 → 37.5 |
| U2-beginner-S | 1 → 1 | — | — | 97.9 → 97.5 | 10 → 10 |
| U3-beginner-plus-S | 2 → 1 | D-03 | — | 151.4 → 152.2 | 14.5 → 14.5 |
| U4-intermediate-S | 2 → 0 | D-03, D-02 | — | 221.2 → 222.6 | 24 → 24 |
| U5-trained-S | 2 → 1 | D-10, D-02 | D-08 | 279.8 → 277.8 | 29 → 27 |
| U6-experienced-S | 4 → 3 | D-02 | — | 420.2 → 420.9 | 42.5 → 42.5 |

## 3. D-01 · новичок без 3 км подряд (U1)

| Сценарий | Дней с экраном «нужен контроль» (CONTROL_REFUSED) до → после | Ошибок движка на контроле до → после | Подтверждение 3 км (внешний ввод): дата | Контрольный результат принят после подтверждения (после) |
|---|---|---|---|---|
| U1-novice-A | 21 → 0 | 21 → 0 | 2026-11-23 | 2 контр. принято |
| U1-novice-B | 35 → 0 | 35 → 0 | 2026-12-07 | 2 контр. принято |
| U1-novice-V | 35 → 0 | 35 → 0 | 2026-12-07 | 2 контр. принято |

Тупик исчез: экран контроля не показывается, пока 3 км подряд не подтверждены; после подтверждения контроль назначается обычными правилами и принимается. Новичок пока не получает вытеснения: после подтверждения 3 км экран контроля вытесняет EASY (D-12) — раньше эта находка была скрыта условием `refused === 0` в детекторе, то есть она не новая, а ставшая видимой.

## 4. D-02 · фаза и gate вокруг контрольных забегов (по строкам назначений: последнее занятие до контроля → первое после)

| Сценарий | Контрольных в плане | До: фаза/gate (до → после контроля) | После: фаза/gate (до → после контроля) | CONTROL_RESETS_PROGRESS до → после |
|---|---|---|---|---|
| U2-beginner-B | 1 → 1 | FOUNDATION/CLOSED → FOUNDATION/CLOSED | FOUNDATION/CLOSED → FOUNDATION/CLOSED | нет → нет |
| U3-beginner-plus-V | 3 → 3 | DEVELOPMENT/CLOSED → DEVELOPMENT/CLOSED; DEVELOPMENT/CLOSED → DEVELOPMENT/CLOSED; DEVELOPMENT/CLOSED → DEVELOPMENT/CLOSED | DEVELOPMENT/CLOSED → DEVELOPMENT/CLOSED; DEVELOPMENT/CLOSED → DEVELOPMENT/CLOSED; DEVELOPMENT/CLOSED → DEVELOPMENT/CLOSED | нет → нет |
| U4-intermediate-A | 3 → 3 | SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED; SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED; SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | да → нет |
| U4-intermediate-B | 1 → 1 | SPECIFIC/CLOSED → DEVELOPMENT/CLOSED | SPECIFIC/CLOSED → SPECIFIC/PARTIAL | да → нет |
| U4-intermediate-V | 3 → 3 | SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED; DEVELOPMENT/PARTIAL → DEVELOPMENT/CLOSED; DEVELOPMENT/PARTIAL → DEVELOPMENT/CLOSED | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | да → нет |
| U5-trained-A | 3 → 3 | SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED; SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED; SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | да → нет |
| U5-trained-V | 3 → 3 | SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED; SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED; SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | да → нет |
| U6-experienced-A | 3 → 3 | SPECIFIC/OPEN → DEVELOPMENT/CLOSED; SPECIFIC/OPEN → DEVELOPMENT/CLOSED; SPECIFIC/OPEN → DEVELOPMENT/CLOSED | SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | да → нет |
| U6-experienced-V | 3 → 3 | SPECIFIC/OPEN → DEVELOPMENT/CLOSED; SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED; SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED | SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | да → нет |
| U4-intermediate-S | 3 → 3 | SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED; SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED; SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | да → нет |
| U5-trained-S | 3 → 3 | SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED; SPECIFIC/PARTIAL → DEVELOPMENT/CLOSED; SPECIFIC/OPEN → DEVELOPMENT/CLOSED | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | да → нет |
| U6-experienced-S | 3 → 3 | SPECIFIC/OPEN → DEVELOPMENT/CLOSED; SPECIFIC/OPEN → DEVELOPMENT/CLOSED; SPECIFIC/OPEN → DEVELOPMENT/CLOSED | SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | да → нет |

Контрольные забеги без слота CONTROL в плане (U1–U3) показываются экраном вместо занятия (D-12) и в этой таблице не видны. Фаза/gate в строках — на дату занятия; «после» берётся с первого занятия после контроля.

## 5. D-03 · доза успешных качественных занятий (успешно выполненные ON_PLAN; доза в мин или м)

| Сценарий | Тип | Доза до (по неделям выполнения) | Доза после | Шагов роста до → после | Доза на потолке движка с первого занятия |
|---|---|---|---|---|---|
| U2-beginner-A | INTRO_QUALITY | 4,4,6,6,6,8,8,8,8,8,8,8 | 4,4,6,6,8,8,8,8,8,8,8,8 | 2 → 2 | — |
| U2-beginner-B | INTRO_QUALITY | 4,4,4,4,4,4 | 4,4,4,4,4,4 | 0 → 0 | — |
| U2-beginner-V | INTRO_QUALITY | 4,4,6,6,6,8,8,8,8,8 | 4,4,6,6,8,8,8,8,8,8 | 2 → 2 | — |
| U3-beginner-plus-A | INTRO_QUALITY | 4,4,6,6,8,8,8,8,4.8 | 4,4,3.6 | 2 → 0 | — |
| U3-beginner-plus-A | THRESHOLD | 6,6,6 | 6,6,8,8,10,10,12,12,12 | 0 → 3 | — |
| U3-beginner-plus-B | INTRO_QUALITY | 4,4,4,4,4,4,4,4,2.4 | 4,4,2.4 | 0 → 0 | — |
| U3-beginner-plus-B | THRESHOLD | 4,4 | 4,4,4,4,4,4,4,4 | 0 → 0 | — |
| U3-beginner-plus-V | INTRO_QUALITY | 4,4,6,6,6 | 4,4 | 1 → 0 | — |
| U3-beginner-plus-V | THRESHOLD | — | 6,6,8 | 0 → 1 | — |
| U4-intermediate-A | INTRO_QUALITY | 2.4 | — | 0 → 0 | — |
| U4-intermediate-A | THRESHOLD | 12,12,12,12 | 12 | 0 → 0 | — |
| U4-intermediate-A | VO2 | 8,8,8 | 8 | 0 → 0 | — |
| U4-intermediate-A | SPECIFIC_3K | 1800 | 1800,1800,2200,2200,2400,2400,1440 | 0 → 2 | — |
| U4-intermediate-B | INTRO_QUALITY | 2.4 | 2.4 | 0 → 0 | — |
| U4-intermediate-B | THRESHOLD | 12,12,12,12 | 12 | 0 → 0 | — |
| U4-intermediate-B | VO2 | 8,8,8 | 8 | 0 → 0 | — |
| U4-intermediate-B | SPECIFIC_3K | 1800,1800 | 1800,1800,1800,1800,1800,1800,1800 | 0 → 0 | — |
| U4-intermediate-V | INTRO_QUALITY | 2.4 | — | 0 → 0 | — |
| U4-intermediate-V | THRESHOLD | 12,12 | 12 | 0 → 0 | — |
| U4-intermediate-V | VO2 | 8,8 | 8 | 0 → 0 | — |
| U4-intermediate-V | SPECIFIC_3K | — | 1800,1800,1320 | 0 → 0 | — |
| U5-trained-A | THRESHOLD | 12,12,15,15,18,18 | 12,12,15,15,18 | 2 → 2 | — |
| U5-trained-A | VO2 | 8,8,11,11,11,14 | 8,8,11,11 | 2 → 1 | — |
| U5-trained-A | SPECIFIC_3K | 1800,1800,2200,2200,2600,2600,3000,1800 | 1800,1800,2200,2200,2600,2600,3000,3000,3000,3000,1800 | 3 → 3 | — |
| U5-trained-B | THRESHOLD | 12,12,12 | 12,12 | 0 → 0 | — |
| U5-trained-B | VO2 | 8,8,8 | 8,8 | 0 → 0 | — |
| U5-trained-B | SPECIFIC_3K | 1800,1800,1800 | 1800,1800,1800,1800,1800 | 0 → 0 | — |
| U5-trained-V | THRESHOLD | 12,12,15,15,18,18 | 12,12,15,15 | 2 → 1 | — |
| U5-trained-V | VO2 | 8,8,11,11,11 | 8,8,11 | 1 → 1 | — |
| U5-trained-V | SPECIFIC_3K | 1800,1800,2200,2200 | 1800,1800,2200,2200,2600,2600,3000,3000 | 1 → 3 | — |
| U6-experienced-A | THRESHOLD | 25,25,25,25,25,25 | 25,25,25,25,25 | 0 → 0 | да: T3 потолок 25 |
| U6-experienced-A | VO2 | 18,18,18,18,18,18 | 18,18,18,18 | 0 → 0 | да: T3 потолок 18 |
| U6-experienced-A | SPECIFIC_3K | 3000,3000,3000,3000,3000,3000,3000,1800 | 3000,3000,3000,3000,3000,3000,3000,3000,3000,3000,1800 | 0 → 0 | — |
| U6-experienced-B | INTRO_QUALITY | 4.8 | 4.8 | 0 → 0 | — |
| U6-experienced-B | THRESHOLD | 25,25,25,25 | 25,25,25 | 0 → 0 | да: T3 потолок 25 |
| U6-experienced-B | VO2 | 18,18,18,18 | 18,18,18 | 0 → 0 | да: T3 потолок 18 |
| U6-experienced-B | SPECIFIC_3K | 3000,3000,3000 | 3000,3000,3000,3000,3000 | 0 → 0 | — |
| U6-experienced-V | INTRO_QUALITY | 4.8 | — | 0 → 0 | — |
| U6-experienced-V | THRESHOLD | 25,25,25,25,25,25 | 25,25,25 | 0 → 0 | да: T3 потолок 25 |
| U6-experienced-V | VO2 | 18,18,18,18,18 | 18,18,18 | 0 → 0 | да: T3 потолок 18 |
| U6-experienced-V | SPECIFIC_3K | 3000,3000,3000,3000 | 3000,3000,3000,3000,3000,3000,3000,3000,3000,1800 | 0 → 0 | — |
| U2-beginner-S | INTRO_QUALITY | 4,4,6,6,6,8,8,8,8,8,8,4.8 | 4,4,6,6,8,8,8,8,8,4.8 | 2 → 2 | — |
| U2-beginner-S | THRESHOLD | — | 8,8 | 0 → 0 | — |
| U3-beginner-plus-S | INTRO_QUALITY | 4,4,6,6,8,8,8,8,4.8 | 4,4,3.6 | 2 → 0 | — |
| U3-beginner-plus-S | THRESHOLD | 6,6,6 | 6,6,8,8,10,10,12,12,12 | 0 → 3 | — |
| U4-intermediate-S | INTRO_QUALITY | 2.4 | — | 0 → 0 | — |
| U4-intermediate-S | THRESHOLD | 12,12,12,12 | 12 | 0 → 0 | — |
| U4-intermediate-S | VO2 | 8,8,8 | 8 | 0 → 0 | — |
| U4-intermediate-S | SPECIFIC_3K | 1800 | 1800,1800,1800,2200,2200,2400,1440 | 0 → 2 | — |
| U5-trained-S | THRESHOLD | 12,12,15,15,18,18 | 12,12,15,15,18 | 2 → 2 | — |
| U5-trained-S | VO2 | 8,8,11,11,11,14 | 8,8,11,11 | 2 → 1 | — |
| U5-trained-S | SPECIFIC_3K | 1800,1800,2200,2200,2600,2600,2600,1560 | 1800,1800,2200,2200,2600,2600,3000,3000,3000,3000,1800 | 2 → 3 | — |
| U6-experienced-S | THRESHOLD | 25,25,25,25,25,25 | 25,25,25,25,25 | 0 → 0 | да: T3 потолок 25 |
| U6-experienced-S | VO2 | 18,18,18,18,18,18 | 18,18,18,18 | 0 → 0 | да: T3 потолок 18 |
| U6-experienced-S | SPECIFIC_3K | 3000,3000,3000,3000,3000,3000,3000,1800 | 3000,3000,3000,3000,3000,3000,3000,3000,3000,3000,1800 | 0 → 0 | — |

Строки «потолок»: доза T3 THRESHOLD=25 мин и VO2=18 мин задана начальной дозой уровня Q2 и равна `qualityDoseCeiling`; это защитное ограничение, а не сброс прогрессии, и детектор C08b для них всё равно срабатывает (детектор не менялся). Таблица потолков повторяет `src/workouts.ts › qualityDoseCeiling`.

## 6. Проверки ограничений и механизмов (сумма по 23 сценариям: применено / нарушений, до → после)

| Код | Проверка | До | После |
|---|---|---|---|
| C01 | Недельный план км не растёт скачком (> +10 % и ≥ 1,5 км) | 104 / 2 | 104 / 2 |
| C02 | Объём и интенсивная часть не растут в одну и ту же неделю | 84 / 4 | 84 / 3 |
| C03 | Темп EASY/LONG_EASY ≤ 80 % скорости 3000 м (и ≥ 55 %) | 485 / 7 | 485 / 7 |
| C04 | Темп THRESHOLD 85–95 %, VO2 95–105 % скорости 3000 м | 138 / 0 | 117 / 0 |
| C05 | Между интенсивными (качество + контроль) ≥ 48 ч | 295 / 0 | 295 / 0 |
| C05b | Не более 2 интенсивных занятий в скользящие 7 дней | 315 / 0 | 315 / 0 |
| C06 | У каждой беговой карточки есть числа, достаточные для самостоятельного выполнения (или обоснованное исключение) | 825 / 0 | 825 / 0 |
| C06b | Обоснованные исключения (калибровка, вводное качество, контроль) — учтены отдельно | 3 / 0 | 3 / 0 |
| C07 | После неудачи следующее занятие того же типа облегчено (доза или темп) | 51 / 18 | 51 / 18 |
| C08 | Успешные занятия приводят к росту недельного плана (недели 7–10 против 1–3 ≥ +5 %) | 11 / 0 | 11 / 0 |
| C08b | Доза успешных THRESHOLD/VO2 растёт при повторных успехах | 14 / 10 | 10 / 4 |
| C09 | План не становится бессмысленно лёгким (км недель 3–10 ≥ 90 % привычного или есть качество) | 11 / 0 | 11 / 0 |
| C10 | После пропуска план следующей недели не повышается (нет компенсации) | 28 / 0 | 28 / 0 |
| C10b | Пропущенные ключевые занятия приходят на замену/учитываются (информационная проверка) | 6 / 5 | 6 / 5 |
| C11 | Защитная пауза (hold) не отнимает значимую часть цикла (≤ 14 дней нулевого бега) | 23 / 2 | 23 / 2 |
| C12 | Тейпер: объём последней недели 30–85 % от пикового | 16 / 0 | 16 / 0 |
| C13 | Темп (с/км) и скорость (м/с) в назначении согласованы | 679 / 0 | 710 / 0 |
| C14 | Повторы × длина отрезка = назначенная доза | 56 / 0 | 108 / 0 |
| C15 | Восстановление между повторами ≥ 50 % времени повтора, если повтор ≥ 3 мин | 206 / 26 | 205 / 18 |
| C16 | Экран «нужен контрольный результат» совпадает с тем, что движок принимает | 23 / 3 | 23 / 0 |
| C17 | Движок принимает отчёты о назначенных занятиях без отказов | 23 / 0 | 23 / 0 |
| C18 | После недели паузы (hold) объём возвращается постепенно, а не сразу к 90 % и выше прежнего | 3 / 3 | 3 / 3 |
| C19 | Самая длинная беговая тренировка плана ≥ 80 % привычной длинной (LONG_EASY назначается) | 20 / 10 | 20 / 12 |
| C20 | Число пробежек в неделю растёт, если пользователь доступен чаще, чем бегает | 1 / 1 | 1 / 1 |
| C21 | Контрольный забег не обнуляет накопленный прогресс (gate/phase) | 65 / 36 | 65 / 0 |
| C22 | Контрольный забег 3000 м не чаще чем раз в ~3 недели (информационно) | 23 / 0 | 23 / 0 |

## 7. Лёгкие занятия, калибровка, пропуски и неудачи (то, что исправление не должно менять)

| Показатель | До | После |
|---|---|---|
| EASY/LONG_EASY назначений | 510 | 510 |
| …из них совпадает по дате, дозе и темпу с прогоном «до» | — | 444 из 510 |
| LONG_EASY назначений | 0 | 0 |
| калибровочных EASY | 3 | 3 |
| RUN_WALK EASY | 22 | 22 |
| SHORTFALL / SLOW_PACE (синтетические неудачи) | 31 / 27 | 31 / 27 |
| SKIPPED (пропуски В) | 48 | 48 |
| DISPLACED_BY_CONTROL | 31 | 31 |
| REST (защитная пауза) | 27 | 27 |
| качественных назначений (без CONTROL) | 283 | 283 |
| CONTROL назначений | 32 | 32 |

## 8. Что изменилось в назначениях (сопоставление по сценарию и дате; назначений в обоих прогонах: 852)

| Изменение типа занятия в тот же день (до → после) | Случаев |
|---|---|
| THRESHOLD → SPECIFIC_3K | 33 |
| INTRO_QUALITY → THRESHOLD | 26 |
| VO2 → SPECIFIC_3K | 23 |
| VO2 → THRESHOLD | 11 |
| THRESHOLD → VO2 | 7 |
| INTRO_QUALITY → SPECIFIC_3K | 5 |
| SPECIFIC_3K → VO2 | 5 |
| SPECIFIC_3K → THRESHOLD | 4 |

| EASY в тот же день (тип не менялся) | Значение |
|---|---|
| отличается дозой или темпом | 66 |
| …с более быстрым верхним темпом, чем до | 0 |
| …с большей дозой, чем до (> +1 м) | 34 |

Смена типа — следствие того, что счётчики подтверждённых занятий теперь не обнуляются контролем: фаза SPECIFIC и очередность THRESHOLD/VO2/SPECIFIC_3K продолжаются, а у пользователей Q0 после двух вводных занятий идёт THRESHOLD. Доза EASY отличается там, где резерв бюджета под другое качественное занятие другой; недельные лимиты движка не менялись.
