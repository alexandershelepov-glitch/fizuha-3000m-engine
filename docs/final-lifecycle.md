# Финальный lifecycle PWA «Физуха»

Рабочая ветка: `pwa/final-lifecycle`. Основание: актуальный `origin/main`, `847039a5ea164e6f35bcf9145dfedb025f8d5b0d`. Спортивный `src/` не меняется.

## Операции application

- `updateGoalAndRaceDate` (`parameters.ts`): структурная проверка → no-op либо INV-1 → gateway/public engine → observable `planDiff` → `TRAINING_PARAMETERS_CHANGED` → persistence → UI. В event попадают только реально изменённые ключи. Baseline неизменен. Перенос старта после исходной даты не запрещается локально; если есть pending, сначала закрываются старые занятия.
- `submitFinalResult` (`finalResult.ts`): использует только дату старта из актуального engine profile и текущую дату устройства для `now`. Источник выбирается из публичного PERFORMANCE_SOURCES. Операция намеренно не применяет INV-1: итог можно внести с незакрытыми старыми тренировками. Public terminal transition → `FINAL_RESULT_RECORDED` → durable completed active cycle → результат операции. Устаревшая повторная отправка также отвергается по сохранённому active envelope.
- `archiveCompletedCycle` (`archive.ts`): проверяет completed state и сохранённый envelope → idempotent archive write + точный readback → clear active + readback. Ошибка оставляет завершённый active, когда очистка не состоялась. Повтор не меняет archivedAt, не создаёт дублей и не перезаписывает конфликт. Повтор уже успешной архивации также безопасен и не очищает другой active cycle.
- `loadArchives`: явно возвращает list или ошибку; нет пустого silent fallback. Repository предоставляет `list`, `get(cycleId)`, `add`.
- `cycleSummary`: вычисляет факты из baseline, terminal engine, history, уникальных пропусков и событий. Отдельного summary snapshot нет.

Обычные операции refresh/checkpoint после terminal state блокируются application-ошибкой CYCLE_COMPLETED до вызова engine. При создании нового цикла непустой active storage не перезаписывается.

## Версионированный архив

```ts
// localStorage key: fizuha.archivedCycles
{
  formatVersion: 1,
  cycles: Array<{
    cycleId: string,
    archivedAt: string,
    appState: AppStateV1
  }>
}
```

Хранится полный envelope: исходные cycleId/createdAt/baseline, точная opaque serialized engine string и append-only event log. Архивный repository не разбирает и не меняет engine string. Проверка terminal state и summary используют gateway reader на application-слое.

**Нет ограничения на количество циклов.** Не реализованы удаление, вытеснение старых записей, экспорт, облако и автоматический новый цикл. Unsupported format или повреждение — read-only/error state без удаления/исправления.

## Маршруты и экраны

- `/profile/parameters` — изменить цель ММ:СС и календарную дату; спортивные ограничения принадлежат engine.
- `/profile/parameters/outcome` — «План обновлён», изменённые параметры и фактический diff; после reload неперсистентный diff не выдумывается.
- `/today` — TAPER только из `decision.phase`; RACE_DAY при совпадении дат; AWAITING_FINAL_RESULT после даты с действующим CTA. Дата reactive, как и ранее.
- `/final-result` — время, существующий source, фиксированная дата старта. Синхронная ref-блокировка двойной отправки.
- `/history/:cycleId` — completed active при сбое архива либо archived summary. Устойчивый URL, reload восстанавливает факты из envelope.
- `/history` — текущая история и рабочая вкладка «Архив»; без active открывается список архивов.
- `/` — при архиве без active доступна «История» и основной first-run CTA.

После сохранения final shell вызывает application archive operation; если она не завершена, UI показывает уже сохранённый completed state с retry, без повторного ввода результата. Новый цикл недоступен, пока completed active не перенесён безопасно. После успеха summary доступен по archive route; «Начать новую подготовку» открывает first-run и не очищает архив.

## Изменения событий и приоритетов

Реализованы существующие TRAINING_PARAMETERS_CHANGED и FINAL_RESULT_RECORDED без смены AppStateV1 и без копирования queue/decision в события. Остальные четыре event types сохранены. Completed workouts по-прежнему хранятся только в engine.history.

Новое продуктовое требование заменяет прежний приоритет pending над итоговым результатом: COMPLETED → AWAITING_FINAL_RESULT → RACE_DAY → PENDING_RESULT → остальные состояния. INV-1 не ослаблен и продолжает блокировать обычные операции, включая изменение цели/даты. Terminal final transition — явное исключение. Архивный route больше не защищён наличием active.

Регрессионные тесты сохранены, их ожидания этих двух изменённых UI-контрактов обновлены с дополнительными проверками INV-1. BOUNDARY-01…11 сохранены; BOUNDARY-02 точный разрешённый список public API расширен делегатами и каталогом. Добавлены BOUNDARY-12…15.

## Проверки

Новые application-тесты: параметры/no-op/INV-1, неизменность baseline, terminal/late final, errors, persistence failures, stale double-submit, full archive, write/clear/readback failures, idempotency/conflicts, unsupported versions, 12 сохранённых циклов, новый цикл и reconstructed summary.

Новые UI-тесты: редактирование, outcome/reload, pending guard, reactive race/awaiting, fixed final date, archive retry, clear retry, summary route/reload, unsupported archive, new-cycle CTA.

Новые E2E: onboarding→parameter edit→plan→reload; taper→live race day→final→archive reload; late final→history→summary reload→new independent cycle при неизменном старом archive.

### Итоговый повторный прогон — 6 октября 2026

| Команда | Результат |
|---|---|
| `npm test` | 452/452 PASS, 0 failures/skipped/TODO |
| `npm run test:ui` | 74/74 PASS, 4 файла |
| `npm run test:e2e` | 26/26 PASS, системный Chrome / Pixel 7 viewport, production build |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0 |
| `npm run build` | PASS, exit 0 |
| `npm run build:web` | PASS, exit 0 |
| `npm run demo` | PASS, exit 0 |
| `git diff --check` | PASS |
| `git diff 847039a5ea164e6f35bcf9145dfedb025f8d5b0d -- src/` | Пустой diff |

Начальный sandbox E2E запуск остановился до тестов на `listen EPERM` порта 4173. С разрешённым доступом локальный preview/Chrome выполнили все сценарии; итоговый повторный прогон тоже завершён успешно. Новых зависимостей не добавлено.
