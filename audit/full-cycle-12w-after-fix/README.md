# Исправление D-01, D-02, D-03 12-недельного аудита (PR #35)

Ветка `fix/audit-12w-checkpoint-progression` от `feature/issue-24-calendar`.

| Файл / папка | Что это |
|---|---|
| `report.md` | отчёт: причины, что изменено, результаты до/после, оставшиеся проблемы, допущения |
| `comparison.md` | сравнение «до / после», сгенерированное `audit/compare12w.ts` из данных обоих прогонов |
| `before/data/` | данные прогона `npm run audit:12w` на базе без исправления (совпадают с `data/` из PR #35 побайтно) |
| `after/` | данные и `weekly-tables.md` (таблицы по неделям) прогона после исправления |
| `raw/` | необработанный вывод тестов и аудитов (`npm-test.txt`, `npm-test-base.txt` — база без исправления, `test-ui`, `test-e2e`, `typecheck`, `lint`, `audit-training*`) |

Повторить прогоны:

```
# до исправления: на базовой ветке (или с откатом src/engine.ts)
AUDIT_12W_OUT=audit/full-cycle-12w-after-fix/before npm run audit:12w
# после исправления
AUDIT_12W_OUT=audit/full-cycle-12w-after-fix/after   npm run audit:12w
node --experimental-strip-types audit/compare12w.ts audit/full-cycle-12w-after-fix/before audit/full-cycle-12w-after-fix/after audit/full-cycle-12w-after-fix/comparison.md
```

Все отчёты «пользователей» синтетические; контрольные результаты 3000 м — внешний сценарный ввод (в A/Б/В равны исходному, в S улучшаются на 2 % за контроль). Автоматического улучшения результата нет.

Из PR #35 сюда перенесены только код и тесты аудита (`audit/fullCycle12w.ts`, `audit/fullCycleAnalysis.ts`, `audit/run12w.ts`, `tests/audit-12w.test.ts`, скрипт `audit:12w`), потому что `feature/issue-24-calendar` их не содержит, а сравнение «до/после» невозможно без того же набора прогонов. В `run12w.ts` добавлены только переменные окружения `AUDIT_12W_OUT` и `AUDIT_12W_NOTE` (папка вывода и строка заголовка). При слиянии #35 возможны дубликаты и конфликт в `audit/run12w.ts`; `package.json` совпадает построчно. Сгенерированный харнессом `report.md` (с жёстко заданными выводами про базовое состояние) в `after/` не сохранён, чтобы не вводить в заблуждение; отчёт после исправления — `report.md` в этой папке.
