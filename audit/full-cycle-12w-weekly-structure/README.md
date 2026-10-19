# Недельная структура 12-недельного плана: LONG_EASY (D-08) и ротация SPECIFIC

Ветка `feature/12w-weekly-structure` от `feature/issue-24-calendar` (79b0621). PR в `feature/issue-24-calendar`, не сливается.

| Файл / папка | Что это |
|---|---|
| `report.md` | отчёт: причина, изменённые правила, допущения, результаты, отклонения и оставшиеся недостатки |
| `comparison.md` | сравнение «исходный аудит / до / после», сгенерированное `audit/compareWeeklyStructure.ts` из данных прогонов |
| `before/data/` | прогон `audit:12w` на базе (79b0621) расширенным стендом; совпадает с `audit/full-cycle-12w-after-fix/after/data` по назначениям и находкам |
| `after/` | данные и `weekly-tables.md` (таблицы по неделям) после изменения |
| `raw/` | необработанный вывод тестов и аудитов (`npm-test.txt` — 709/709; `npm-test-base.txt` — база 690/690; `npm-test-rollback-*.txt` — новые тесты на откате) |

`audit/full-cycle-12w` и `audit/full-cycle-12w-after-fix` не изменены.

Повторить:

```
AUDIT_12W_OUT=audit/full-cycle-12w-weekly-structure/after npm run audit:12w     # на ветке
# до: тот же стенд на базе (git worktree 79b0621 + audit/fullCycle12w.ts, audit/fullCycleAnalysis.ts из этой ветки)
node --experimental-strip-types audit/compareWeeklyStructure.ts audit/full-cycle-12w audit/full-cycle-12w-weekly-structure/before audit/full-cycle-12w-weekly-structure/after audit/full-cycle-12w-weekly-structure/comparison.md
```

Важно: `npm run audit:12w` без `AUDIT_12W_OUT` пишет в `audit/full-cycle-12w` и перезаписывает исходный аудит. Генерируемый стендом `report.md` (с жёстко заданными выводами про базовое состояние) в `before/` и `after/` не сохранён, чтобы не вводить в заблуждение; отчёт — `report.md` в этой папке.

Все отчёты «пользователей» синтетические; контрольные результаты 3000 м — внешний сценарный ввод. Автоматического улучшения результата нет.
