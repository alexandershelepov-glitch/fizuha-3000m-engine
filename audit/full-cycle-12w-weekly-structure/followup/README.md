# Дополнение к PR #37: приоритет длинного бега при дефицитном бюджете (WS-19) и строгий тест переноса (WS-18)

Все данные **синтетические** (поведение «пользователей» сочинено в `audit/fullCycle12w.ts`, не измерено). Базовые аудиты
(`audit/full-cycle-12w`, `audit/full-cycle-12w-after-fix`, `audit/full-cycle-12w-weekly-structure/{before,after,raw,comparison.md,report.md}`) не перезаписаны.

| Что | Где |
|---|---|
| Отчёт (по-русски) | `report.md` |
| Сравнение «до/после» (генерируется) | `comparison.md` ← `node --experimental-strip-types audit/compareFollowup.ts <эта папка> comparison.md` |
| «До» — коммит PR #37 270b203, тот же стенд | `before/data/*`, `before/probes.json`, `before/report.md` |
| «После» — дополнение | `after/data/*`, `after/probes.json`, `after/report.md`, `after/weekly-tables.md` |
| Сырой вывод запусков | `raw/` (`npm-test.txt`, `typecheck.txt`, `lint.txt`, `test-ui.txt`, `test-e2e.txt`, `audit-training.txt`, `audit-12w.txt`, `window-proof.txt`) |
| Доказательство, что тесты ловят поломку | `raw/sabotage-move-always-refused.txt`, `raw/sabotage-move-changes-dose.txt`, `raw/ws-tests-on-previous-engine-270b203.txt` |

Воспроизведение:

```
export PATH=/workspace/tools/node-v22.23.3-linux-x64/bin:$PATH      # Node 22
AUDIT_12W_OUT=<папка> npm run audit:12w                              # 23 сценария (без AUDIT_12W_OUT перезапишет audit/full-cycle-12w!)
node --experimental-strip-types audit/probeDeficitBudget.ts <out.json>   # зонды P1–P6 (audit/deficitProfiles.ts)
node --experimental-strip-types audit/deficitWindowProof.ts          # арифметика окна 7 дней
```
