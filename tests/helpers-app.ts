/** Shared fixtures for the PWA application-layer tests. Not a test file: it is never executed itself. */
import {defaultDraft} from '../web/src/application/questionnaire.ts';
import type {QuestionnaireDraft} from '../web/src/application/questionnaire.ts';
import type {KeyValueStorage} from '../web/src/application/storage.ts';
import {createRepository} from '../web/src/application/storage.ts';
import type {CycleRepository} from '../web/src/application/storage.ts';
import {NOW, dateAfter, healthy, profile} from './helpers.ts';
import {createCycle} from '../web/src/application/cycle.ts';
import {buildProfile} from '../web/src/application/questionnaire.ts';
import {ACTIVE_CYCLE_KEY} from '../web/src/application/storage.ts';

/** A draft that the engine accepts, close to what a real user would type. */
export function draft(overrides: Partial<QuestionnaireDraft> = {}): QuestionnaireDraft {
  return {
    ...defaultDraft(NOW),
    hasResult: true,
    resultTime: '15:20',
    resultDate: NOW,
    resultSource: 'TEST_3K',
    canRun3Km: true,
    regularRunningWeeks: '20',
    actualRunsPerWeek: '3',
    averageWeeklyKm4Weeks: '16',
    longestUsualRunKm: '6',
    qualitySessions8Weeks: '0',
    qualityWeeks8Weeks: '0',
    qualityMostlyTolerated: true,
    safety: healthy(),
    hasBreaks: false,
    breaks: [],
    availableRunsPerWeek: '4',
    performanceMismatch: 'NONE',
    targetTime: '14:30',
    raceDate: dateAfter(56),
    ...overrides,
  };
}

export interface MemoryStorage extends KeyValueStorage {
  readonly map: Map<string, string>;
  writes: number;
}

export function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const map = new Map(Object.entries(initial));
  return {
    map,
    writes: 0,
    getItem: (key) => map.get(key) ?? null,
    setItem(this: MemoryStorage, key, value) { this.writes += 1; map.set(key, value); },
    removeItem: (key) => void map.delete(key),
  };
}

export function repository(storage: KeyValueStorage): CycleRepository {
  return createRepository(storage);
}

export const CREATED_AT = '2026-10-05T09:00:00.000Z';
export const CYCLE_ID = 'cycle-test-1';

/** Russian label for every Today state, so a new state cannot be added without copy. */
export const TODAY_LABELS: Record<string, string> = {
  COMPLETED: 'Подготовка завершена',
  PENDING_RESULT: 'Предыдущая тренировка ещё не закрыта',
  AWAITING_FINAL_RESULT: 'Итоговый результат ещё не внесён',
  RACE_DAY: 'Сегодня итоговый забег',
  TRAINING_HOLD: 'Обычные тренировки приостановлены',
  TAPER: 'Снижение нагрузки перед забегом',
  CHECKPOINT_REQUIRED: 'Нужен контрольный результат',
  WORKOUT_TODAY: 'Сегодня есть тренировка',
  EMPTY_QUEUE: 'На ближайшие дни тренировок нет',
  REST_DAY: 'Сегодня восстановление',
};

/** A real cycle, created through the application service, ready for a transition test. */
export function appCycle(overrides: Record<string, unknown> = {}, createdOn = NOW) {
  const built = buildProfile(draft({resultDate: createdOn}));
  if (!built.ok) throw new Error('fixture: the draft must build');
  const storage = memoryStorage();
  const created = createCycle(repository(storage), {
    profile: profile({...built.profile, ...overrides}),
    deviceToday: createdOn,
    cycleId: CYCLE_ID,
    createdAt: CREATED_AT,
    locale: 'ru-RU',
  });
  if (!created.ok) throw new Error('fixture: the cycle must be created');
  return {
    storage,
    repo: repository(storage),
    appState: created.appState,
    engineState: created.engineState,
    raw: storage.map.get(ACTIVE_CYCLE_KEY)!,
  };
}
