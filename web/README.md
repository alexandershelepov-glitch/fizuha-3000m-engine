# PWA «Физуха» — модуль 3000 м

Первый рабочий срез мобильного приложения: первый запуск → анкета → проверка данных → создание цикла →
сохранение → оценка → «План готов» → главный экран «Сегодня».

## Слои

```
engine (src/, публичный API)
      ↓ только через engineGateway
application (web/src/application)   создание цикла, AppState, persistence, UI-state, ошибки, форматирование
      ↓
UI (web/src/ui, web/src/app)        формы, навигация, отображение
```

Правила, которые проверяются тестом `tests/app-boundary.test.ts`:

- модуль `web/src/application/engineGateway.ts` — единственное место, импортирующее engine;
- application-слой не импортирует UI;
- frontend не вызывает внутренние спортивные функции (`generateQueue`, `prescribe`, `initialDose`,
  `classify`, `assess*`) и не пересчитывает спортивные решения.

## Данные

- Ключ `fizuha.activeCycle` — versioned envelope `AppStateV1` (см. `docs/pwa-architecture.md` §4, §8).
  Внутри `cycle.engineState` лежит ровно `serialize()` состояния engine, opaque.
- Ключ `fizuha.questionnaireDraft` — черновик анкеты (не спортивное состояние; нужен, чтобы reload не терял
  ответы, см. `docs/wireframes.md` §0.6).
- Повреждённые или несовместимые данные не «чинятся» и не удаляются: приложение показывает явное состояние
  ошибки загрузки.

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev:web` | dev-сервер PWA |
| `npm run build:web` | production-сборка в `web/dist` |
| `npm run preview:web` | предпросмотр production-сборки на 127.0.0.1:4173 |
| `npm run test:ui` | UI-тесты (vitest + jsdom) |
| `npm run test:e2e` | браузерный E2E (Playwright, системный Chrome, мобильный viewport) |
| `npm test` | тесты engine + application-слоя (node:test) |
| `npm run typecheck` | типы engine и PWA |
| `npm run lint` | eslint по engine, тестам и PWA |

## Что уже реализовано

WF-01 первый запуск, анкета из 8 шагов (WF-02…WF-09), проверка данных (WF-10), первичная оценка (WF-11),
«План готов» (WF-12), главный экран «Сегодня» как рендерер состояний (WF-13) с экранами «План», «История»,
«Профиль» и карточкой тренировки.

Состояния «Сегодня», которые уже отрисовываются: тренировка, день отдыха, пустая очередь, нужен контрольный
результат, пауза в нагрузке, taper, день итогового забега, ожидание финального результата, завершённый цикл и
невнесённый результат (INV-1). Действия, требующие ввода результата тренировки, помечены как следующий срез.

## Что дальше

Ввод результата тренировки и реакция GREEN/GREEN_PLUS/YELLOW/RED (§24 задания этапа); затем перенос, пропуск,
past-due, checkpoint submission, изменение цели и даты, taper-flow, финальный результат и архив.
