# Сравнение до / после исправления D-01, D-02, D-03 (12-недельный аудит)

Сгенерировано `audit/compare12w.ts` из двух прогонов одного и того же набора `npm run audit:12w`: «до» — база `feature/issue-24-calendar` (результат совпадает с PR #35 побайтно), «после» — с исправлением. Всё поведение «пользователей» синтетическое; детекторы не менялись и не фильтровались.

## 1. Находки по видам

| Вид | Серьёзность | До: случаев / сценариев | После: случаев / сценариев | Сценарии после |
|---|---|---|---|---|
| CONTROL_DISPLACES_SESSION — D-12 контроль вытесняет занятие | Н | 13 / 13 | 13 / 13 | U1-novice-A, U1-novice-B, U1-novice-V, U2-beginner-A, U2-beginner-B, U2-beginner-V, U3-beginner-plus-A, U3-beginner-plus-B, U4-intermediate-B, U5-trained-B, U6-experienced-B, U2-beginner-S, U3-beginner-plus-S |
| FAILED_TASK_REPEATED_UNCHANGED — D-11 неудача повторяется без изменений | Н | 19 / 5 | 21 / 5 | U1-novice-B, U2-beginner-B, U4-intermediate-B, U5-trained-B, U6-experienced-B |
| FREQUENCY_NEVER_PROGRESSES — D-09 частота не растёт | М | 1 / 1 | 1 / 1 | U1-novice-A |
| HOLD_REMOVES_TRAINING — D-07 пауза забирает тренировки | М | 3 / 3 | 0 / 0 | — |
| PACE_OUT_OF_BAND — D-04 темп вне полосы | М | 7 / 2 | 8 / 3 | U2-beginner-B, U3-beginner-plus-B, U5-trained-B |
| QUALITY_DOSE_NOT_PROGRESSING — D-03 доза качества не растёт | М | 4 / 2 | 4 / 2 | U6-experienced-A, U6-experienced-S |
| RETURN_TO_FULL_LOAD_AFTER_HOLD — D-06 возврат к полной нагрузке после паузы | Н | 1 / 1 | 0 / 0 | — |
| SHORT_RECOVERY_FOR_LONG_REPEATS — D-10 короткий отдых | Н | 22 / 6 | 11 / 4 | U6-experienced-A, U6-experienced-B, U6-experienced-V, U6-experienced-S |
| VOLUME_AND_INTENSITY_RISE_TOGETHER — D-05 объём и интенсивность растут вместе | М | 4 / 2 | 1 / 1 | U4-intermediate-B |
| WEEKLY_VOLUME_JUMP — D-13 скачок недельного объёма | Н | 0 / 0 | 2 / 2 | U4-intermediate-B, U6-experienced-B |

Итого: находок (после группировки по сценарию и коду) до 74, после 61; К/М/Н до 0 / 19 / 55, после 0 / 15 / 46; проверок применено до 4209, после 4243; нарушений до 68, после 55.

## 2. По сценариям (все 23; U1, U3, U4, U5, U6 — в фокусе)

| Сценарий | Находок до → после | Исчезло | Появилось / стало видно | План км до → после (оценка рецензента) | Бюджет движка км, конец: до → после |
|---|---|---|---|---|---|
| U1-novice-A | 2 → 2 | — | — | 33.8 → 33.8 | 3 → 3 |
| U1-novice-B | 2 → 2 | — | — | 32.5 → 32.5 | 3 → 3 |
| U1-novice-V | 1 → 1 | — | — | 33.2 → 33.2 | 3 → 3 |
| U2-beginner-A | 1 → 1 | — | — | 97.5 → 97.5 | 10 → 10 |
| U2-beginner-B | 3 → 3 | — | — | 91.5 → 91.5 | 9 → 9 |
| U2-beginner-V | 1 → 1 | — | — | 93.2 → 93.2 | 9 → 9 |
| U3-beginner-plus-A | 1 → 1 | — | — | 151.7 → 151.7 | 14.5 → 14.5 |
| U3-beginner-plus-B | 2 → 2 | — | — | 136.3 → 136.3 | 13.5 → 13.5 |
| U3-beginner-plus-V | 0 → 0 | — | — | 147.2 → 147.2 | 13.5 → 13.5 |
| U4-intermediate-A | 0 → 0 | — | — | 225.9 → 225.9 | 21 → 21 |
| U4-intermediate-B | 4 → 4 | D-07 | D-13 | 164.8 → 204.5 | 19 → 19 |
| U4-intermediate-V | 0 → 0 | — | — | 209.7 → 209.7 | 19 → 19 |
| U5-trained-A | 1 → 0 | D-10 | — | 286.6 → 284.4 | 28 → 27 |
| U5-trained-B | 4 → 3 | D-07, D-06 | D-04 | 205.9 → 271.3 | 25 → 25 |
| U5-trained-V | 0 → 0 | — | — | 274.6 → 274.6 | 25 → 25 |
| U6-experienced-A | 2 → 2 | — | — | 422.7 → 401.6 | 42.5 → 39.5 |
| U6-experienced-B | 5 → 4 | D-05, D-07 | D-13 | 265.7 → 387.1 | 37.5 → 37.5 |
| U6-experienced-V | 1 → 1 | — | — | 398.3 → 394.7 | 37.5 → 37.5 |
| U2-beginner-S | 1 → 1 | — | — | 97.5 → 97.5 | 10 → 10 |
| U3-beginner-plus-S | 1 → 1 | — | — | 152.2 → 152.2 | 14.5 → 14.5 |
| U4-intermediate-S | 0 → 0 | — | — | 225.6 → 225.6 | 21 → 21 |
| U5-trained-S | 1 → 0 | D-10 | — | 285.9 → 286.8 | 28 → 27 |
| U6-experienced-S | 2 → 2 | — | — | 422.3 → 415.9 | 42.5 → 40.5 |

## 3. D-01 · новичок без 3 км подряд (U1)

| Сценарий | Дней с экраном «нужен контроль» (CONTROL_REFUSED) до → после | Ошибок движка на контроле до → после | Подтверждение 3 км (внешний ввод): дата | Контрольный результат принят после подтверждения (после) |
|---|---|---|---|---|
| U1-novice-A | 0 → 0 | 0 → 0 | 2026-11-23 | 2 контр. принято |
| U1-novice-B | 0 → 0 | 0 → 0 | 2026-12-07 | 2 контр. принято |
| U1-novice-V | 0 → 0 | 0 → 0 | 2026-12-07 | 2 контр. принято |

Тупик исчез: экран контроля не показывается, пока 3 км подряд не подтверждены; после подтверждения контроль назначается обычными правилами и принимается. Новичок пока не получает вытеснения: после подтверждения 3 км экран контроля вытесняет EASY (D-12) — раньше эта находка была скрыта условием `refused === 0` в детекторе, то есть она не новая, а ставшая видимой.

## 4. D-02 · фаза и gate вокруг контрольных забегов (по строкам назначений: последнее занятие до контроля → первое после)

| Сценарий | Контрольных в плане | До: фаза/gate (до → после контроля) | После: фаза/gate (до → после контроля) | CONTROL_RESETS_PROGRESS до → после |
|---|---|---|---|---|
| U2-beginner-B | 1 → 1 | FOUNDATION/CLOSED → FOUNDATION/CLOSED | FOUNDATION/CLOSED → FOUNDATION/CLOSED | нет → нет |
| U3-beginner-plus-V | 3 → 3 | DEVELOPMENT/CLOSED → DEVELOPMENT/CLOSED; DEVELOPMENT/CLOSED → DEVELOPMENT/CLOSED; DEVELOPMENT/CLOSED → DEVELOPMENT/CLOSED | DEVELOPMENT/CLOSED → DEVELOPMENT/CLOSED; DEVELOPMENT/CLOSED → DEVELOPMENT/CLOSED; DEVELOPMENT/CLOSED → DEVELOPMENT/CLOSED | нет → нет |
| U4-intermediate-A | 3 → 3 | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | нет → нет |
| U4-intermediate-B | 0 → 2 | — | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/CLOSED → SPECIFIC/PARTIAL | нет → нет |
| U4-intermediate-V | 3 → 3 | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | нет → нет |
| U5-trained-A | 3 → 3 | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | нет → нет |
| U5-trained-B | 2 → 1 | HOLD_DIAGNOSTIC/CLOSED → SPECIFIC/PARTIAL; HOLD_DIAGNOSTIC/CLOSED → SPECIFIC/PARTIAL | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | нет → нет |
| U5-trained-V | 3 → 3 | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/PARTIAL | нет → нет |
| U6-experienced-A | 3 → 3 | SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | нет → нет |
| U6-experienced-V | 3 → 3 | SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | нет → нет |
| U4-intermediate-S | 3 → 3 | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | нет → нет |
| U5-trained-S | 3 → 3 | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/PARTIAL → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | нет → нет |
| U6-experienced-S | 3 → 3 | SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | SPECIFIC/PARTIAL → SPECIFIC/PARTIAL; SPECIFIC/OPEN → SPECIFIC/OPEN; SPECIFIC/OPEN → SPECIFIC/OPEN | нет → нет |

Контрольные забеги без слота CONTROL в плане (U1–U3) показываются экраном вместо занятия (D-12) и в этой таблице не видны. Фаза/gate в строках — на дату занятия; «после» берётся с первого занятия после контроля.

## 5. D-03 · доза успешных качественных занятий (успешно выполненные ON_PLAN; доза в мин или м)

| Сценарий | Тип | Доза до (по неделям выполнения) | Доза после | Шагов роста до → после | Доза на потолке движка с первого занятия |
|---|---|---|---|---|---|
| U2-beginner-A | INTRO_QUALITY | 4,4,6,6,8,8,8,8,8,8,8,8 | 4,4,6,6,8,8,8,8,8,8,8,8 | 2 → 2 | — |
| U2-beginner-B | INTRO_QUALITY | 4,4,4,4,4,4 | 4,4,4,4,4,4 | 0 → 0 | — |
| U2-beginner-V | INTRO_QUALITY | 4,4,6,6,8,8,8,8,8,8 | 4,4,6,6,8,8,8,8,8,8 | 2 → 2 | — |
| U3-beginner-plus-A | INTRO_QUALITY | 4,4,3.6 | 4,4,3.6 | 0 → 0 | — |
| U3-beginner-plus-A | THRESHOLD | 6,6,8,8,10,10,12,12,12 | 6,6,8,8,10,10,12,12,12 | 3 → 3 | — |
| U3-beginner-plus-B | INTRO_QUALITY | 4,4,2.4 | 4,4,2.4 | 0 → 0 | — |
| U3-beginner-plus-B | THRESHOLD | 4,4,4,4,4,4,4,4 | 4,4,4,4,4,4,4,4 | 0 → 0 | — |
| U3-beginner-plus-V | INTRO_QUALITY | 4,4 | 4,4 | 0 → 0 | — |
| U3-beginner-plus-V | THRESHOLD | 6,6,8 | 6,6,8 | 1 → 1 | — |
| U4-intermediate-A | THRESHOLD | 12,12,15 | 12,12,15 | 1 → 1 | — |
| U4-intermediate-A | VO2 | 8,8 | 8,8 | 0 → 0 | — |
| U4-intermediate-A | SPECIFIC_3K | 1800,1800,2200,1320 | 1800,1800,2200,1320 | 1 → 1 | — |
| U4-intermediate-B | INTRO_QUALITY | — | 2.4 | 0 → 0 | — |
| U4-intermediate-B | THRESHOLD | 12,12,12 | 12,12 | 0 → 0 | — |
| U4-intermediate-B | VO2 | 8,8 | 8,6.8 | 0 → 0 | — |
| U4-intermediate-B | SPECIFIC_3K | 1800 | 1800,1530 | 0 → 0 | — |
| U4-intermediate-V | INTRO_QUALITY | 2.4 | 2.4 | 0 → 0 | — |
| U4-intermediate-V | THRESHOLD | 12,12 | 12,12 | 0 → 0 | — |
| U4-intermediate-V | VO2 | 8,8 | 8,8 | 0 → 0 | — |
| U5-trained-A | THRESHOLD | 12,12,15,15,18 | 12,12,15,15 | 2 → 1 | — |
| U5-trained-A | VO2 | 8,8,11,11,14 | 8,8,11,11 | 2 → 1 | — |
| U5-trained-A | SPECIFIC_3K | 1800,1800,2200,2200,2600,2600,3000,3000,3000,1800 | 1800,1800,2200,2200,2600,2600,3000,1800 | 3 → 3 | — |
| U5-trained-B | INTRO_QUALITY | 4.8 | — | 0 → 0 | — |
| U5-trained-B | THRESHOLD | 12,12 | 12,10.2,10.2 | 0 → 0 | — |
| U5-trained-B | VO2 | 8,8 | 8,6.8 | 0 → 0 | — |
| U5-trained-B | SPECIFIC_3K | 1800 | 1800 | 0 → 0 | — |
| U5-trained-V | THRESHOLD | 12,12,15,15 | 12,12,15,15 | 1 → 1 | — |
| U5-trained-V | VO2 | 8,8,11,11 | 8,8,11,11 | 1 → 1 | — |
| U5-trained-V | SPECIFIC_3K | 1800,1800,2200,2200,2600,2600,3000 | 1800,1800,2200,2200,2600,2600,3000 | 3 → 3 | — |
| U6-experienced-A | THRESHOLD | 25,25,25,25,25 | 25,25,25,25,25 | 0 → 0 | да: T3 потолок 25 |
| U6-experienced-A | VO2 | 18,18,18,18,18 | 18,18,18,18 | 0 → 0 | да: T3 потолок 18 |
| U6-experienced-A | SPECIFIC_3K | 3000,3000,3000,3000,3000,3000,3000,3000,3000,1800 | 3000,3000,3000,3000,3000,3000,3000,1800 | 0 → 0 | — |
| U6-experienced-B | INTRO_QUALITY | 4.8 | — | 0 → 0 | — |
| U6-experienced-B | THRESHOLD | 25,25,25,25 | 25,25 | 0 → 0 | да: T3 потолок 25 |
| U6-experienced-B | VO2 | 18,18,18 | 18 | 0 → 0 | да: T3 потолок 18 |
| U6-experienced-B | SPECIFIC_3K | — | 3000,3000,3000 | 0 → 0 | — |
| U6-experienced-V | THRESHOLD | 25,25,25 | 25,25 | 0 → 0 | да: T3 потолок 25 |
| U6-experienced-V | VO2 | 18,18,18 | 18 | 0 → 0 | да: T3 потолок 18 |
| U6-experienced-V | SPECIFIC_3K | 3000,3000,3000,3000,3000,3000,3000,3000,3000,1800 | 3000,3000,3000,1800 | 0 → 0 | — |
| U2-beginner-S | INTRO_QUALITY | 4,4,6,6,8,8,8,8,8,4.8 | 4,4,6,6,8,8,8,8,8,4.8 | 2 → 2 | — |
| U2-beginner-S | THRESHOLD | 8,8 | 8,8 | 0 → 0 | — |
| U3-beginner-plus-S | INTRO_QUALITY | 4,4,3.6 | 4,4,3.6 | 0 → 0 | — |
| U3-beginner-plus-S | THRESHOLD | 6,6,8,8,10,10,12,12,12 | 6,6,8,8,10,10,12,12,12 | 3 → 3 | — |
| U4-intermediate-S | THRESHOLD | 12,12,15 | 12,12,15 | 1 → 1 | — |
| U4-intermediate-S | VO2 | 8,8 | 8,8 | 0 → 0 | — |
| U4-intermediate-S | SPECIFIC_3K | 1800,1800,1800,1320 | 1800,1800,1800,1320 | 0 → 0 | — |
| U5-trained-S | THRESHOLD | 12,12,15,15,18 | 12,12,15,15 | 2 → 1 | — |
| U5-trained-S | VO2 | 8,8,11,11,14 | 8,8,11,11 | 2 → 1 | — |
| U5-trained-S | SPECIFIC_3K | 1800,1800,2200,2200,2600,2600,3000,3000,3000,1800 | 1800,1800,2200,2200,2600,2600,3000,1800 | 3 → 3 | — |
| U6-experienced-S | THRESHOLD | 25,25,25,25,25 | 25,25,25,25 | 0 → 0 | да: T3 потолок 25 |
| U6-experienced-S | VO2 | 18,18,18,18,18 | 18,18,18 | 0 → 0 | да: T3 потолок 18 |
| U6-experienced-S | SPECIFIC_3K | 3000,3000,3000,3000,3000,3000,3000,3000,3000,1800 | 3000,3000,3000,3000,3000,1800 | 0 → 0 | — |

Строки «потолок»: доза T3 THRESHOLD=25 мин и VO2=18 мин задана начальной дозой уровня Q2 и равна `qualityDoseCeiling`; это защитное ограничение, а не сброс прогрессии, и детектор C08b для них всё равно срабатывает (детектор не менялся). Таблица потолков повторяет `src/workouts.ts › qualityDoseCeiling`.

## 6. Проверки ограничений и механизмов (сумма по 23 сценариям: применено / нарушений, до → после)

| Код | Проверка | До | После |
|---|---|---|---|
| C01 | Недельный план км не растёт скачком (> +10 % и ≥ 1,5 км) | 99 / 0 | 102 / 2 |
| C02 | Объём и интенсивная часть не растут в одну и ту же неделю | 82 / 4 | 79 / 1 |
| C03 | Темп EASY/LONG_EASY ≤ 80 % скорости 3000 м (и ≥ 55 %) | 481 / 7 | 543 / 8 |
| C04 | Темп THRESHOLD 85–95 %, VO2 95–105 % скорости 3000 м | 129 / 0 | 113 / 0 |
| C05 | Между интенсивными (качество + контроль) ≥ 48 ч | 286 / 0 | 254 / 0 |
| C05b | Не более 2 интенсивных занятий в скользящие 7 дней | 306 / 0 | 274 / 0 |
| C06 | У каждой беговой карточки есть числа, достаточные для самостоятельного выполнения (или обоснованное исключение) | 812 / 0 | 842 / 0 |
| C06b | Обоснованные исключения (калибровка, вводное качество, контроль) — учтены отдельно | 3 / 0 | 3 / 0 |
| C07 | После неудачи следующее занятие того же типа облегчено (доза или темп) | 45 / 19 | 55 / 21 |
| C08 | Успешные занятия приводят к росту недельного плана (недели 7–10 против 1–3 ≥ +5 %) | 11 / 0 | 11 / 0 |
| C08b | Доза успешных THRESHOLD/VO2 растёт при повторных успехах | 12 / 4 | 12 / 4 |
| C09 | План не становится бессмысленно лёгким (км недель 3–10 ≥ 90 % привычного или есть качество) | 11 / 0 | 11 / 0 |
| C10 | После пропуска план следующей недели не повышается (нет компенсации) | 28 / 0 | 28 / 0 |
| C10b | Пропущенные ключевые занятия приходят на замену/учитываются (информационная проверка) | 6 / 5 | 6 / 5 |
| C11 | Защитная пауза (hold) не отнимает значимую часть цикла (≤ 14 дней нулевого бега) | 23 / 3 | 23 / 0 |
| C12 | Тейпер: объём последней недели 30–85 % от пикового | 16 / 0 | 16 / 0 |
| C13 | Темп (с/км) и скорость (м/с) в назначении согласованы | 694 / 0 | 723 / 0 |
| C14 | Повторы × длина отрезка = назначенная доза | 84 / 0 | 67 / 0 |
| C15 | Восстановление между повторами ≥ 50 % времени повтора, если повтор ≥ 3 мин | 191 / 22 | 163 / 11 |
| C16 | Экран «нужен контрольный результат» совпадает с тем, что движок принимает | 23 / 0 | 23 / 0 |
| C17 | Движок принимает отчёты о назначенных занятиях без отказов | 23 / 0 | 23 / 0 |
| C18 | После недели паузы (hold) объём возвращается постепенно, а не сразу к 90 % и выше прежнего | 1 / 1 | 0 / 0 |
| C19 | Самая длинная беговая тренировка плана ≥ 80 % привычной длинной (LONG_EASY назначается) | 20 / 2 | 20 / 2 |
| C20 | Число пробежек в неделю растёт, если пользователь доступен чаще, чем бегает | 1 / 1 | 1 / 1 |
| C21 | Контрольный забег не обнуляет накопленный прогресс (gate/phase) | 66 / 0 | 66 / 0 |
| C22 | Контрольный забег 3000 м не чаще чем раз в ~3 недели (информационно) | 23 / 0 | 23 / 0 |
| C23 | Недельный бюджет движка: резервы всех занятий за скользящие 7 дней ≤ утверждённого бюджета | 733 / 0 | 762 / 0 |

## 7. Лёгкие занятия, калибровка, пропуски и неудачи (то, что исправление не должно менять)

| Показатель | До | После |
|---|---|---|
| EASY/LONG_EASY назначений | 506 | 568 |
| …из них совпадает по дате, дозе и темпу с прогоном «до» | — | 262 из 568 |
| LONG_EASY назначений | 120 | 125 |
| калибровочных EASY | 3 | 3 |
| RUN_WALK EASY | 22 | 22 |
| SHORTFALL / SLOW_PACE (синтетические неудачи) | 29 / 24 | 36 / 30 |
| SKIPPED (пропуски В) | 48 | 48 |
| DISPLACED_BY_CONTROL | 31 | 32 |
| REST (защитная пауза) | 40 | 0 |
| качественных назначений (без CONTROL) | 273 | 240 |
| CONTROL назначений | 33 | 34 |

## 8. Что изменилось в назначениях (сопоставление по сценарию и дате; назначений в обоих прогонах: 842)

| Изменение типа занятия в тот же день (до → после) | Случаев |
|---|---|
| REST → EASY | 24 |
| SPECIFIC_3K → EASY | 24 |
| VO2 → EASY | 13 |
| THRESHOLD → EASY | 13 |
| EASY → SPECIFIC_3K | 10 |
| SPECIFIC_3K → VO2 | 7 |
| VO2 → SPECIFIC_3K | 7 |
| REST → LONG_EASY | 6 |
| SPECIFIC_3K → THRESHOLD | 5 |
| VO2 → THRESHOLD | 5 |
| EASY → VO2 | 4 |
| INTRO_QUALITY → EASY | 3 |
| THRESHOLD → SPECIFIC_3K | 3 |
| THRESHOLD → VO2 | 3 |
| REST → SPECIFIC_3K | 3 |
| REST → CONTROL | 2 |
| REST → INTRO_QUALITY | 2 |
| REST → THRESHOLD | 2 |
| EASY → THRESHOLD | 2 |
| LONG_EASY → EASY | 1 |
| CONTROL → THRESHOLD | 1 |
| EASY → CONTROL | 1 |
| CONTROL → EASY | 1 |
| EASY → INTRO_QUALITY | 1 |
| REST → VO2 | 1 |

| EASY в тот же день (тип не менялся) | Значение |
|---|---|
| отличается дозой или темпом | 136 |
| …с более быстрым верхним темпом, чем до | 9 |
| …с большей дозой, чем до (> +1 м) | 43 |

Смена типа — следствие того, что счётчики подтверждённых занятий теперь не обнуляются контролем: фаза SPECIFIC и очередность THRESHOLD/VO2/SPECIFIC_3K продолжаются, а у пользователей Q0 после двух вводных занятий идёт THRESHOLD. Доза EASY отличается там, где резерв бюджета под другое качественное занятие другой; недельные лимиты движка не менялись.
