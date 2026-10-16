/**
 * Fictional, deterministic athlete fixtures for the issue #23 autonomous QA run.
 * All data are invented for software testing only; nothing here claims real sporting progress.
 */
export const QA_START_DATE = '2026-10-12'; // Monday, same virtual start as audit/trainingSimulator.ts

export interface QuestionnaireAnswers {
  /** `null` = "no 3000 m result" (the engine will ask for a checkpoint). */
  resultTime: string | null;
  canRun3Km: boolean;
  regularRunningWeeks: number;
  actualRunsPerWeek: number;
  averageWeeklyKm4Weeks: number;
  longestUsualRunKm: number;
  qualitySessions8Weeks: number;
  qualityWeeks8Weeks: number;
  qualityMostlyTolerated: boolean;
  experience: {threshold: boolean; vo2: boolean; specific3k: boolean};
  availableRunsPerWeek: number;
  targetTime: string;
}

export interface ProfileFixture {
  id: string;
  title: string;
  /** Number of preparation weeks until the exam/race date (issue: 8–12). */
  weeks: number;
  /** Deterministic seed for every pseudo-random choice of the behaviour model. */
  seed: number;
  answers: QuestionnaireAnswers;
  /** Human description of constraints, realism and available days (issue requirement 2). */
  description: {
    constraints: string;
    realism: string;
    availableDays: string;
  };
}

const none = {threshold: false, vo2: false, specific3k: false};
const all = {threshold: true, vo2: true, specific3k: true};

export const PROFILES: readonly ProfileFixture[] = [
  {
    id: 'p1-novice-no3k',
    title: 'P1 · Новичок, не может пробежать 3 км',
    weeks: 12,
    seed: 20261012,
    answers: {
      resultTime: null, canRun3Km: false, regularRunningWeeks: 3, actualRunsPerWeek: 1,
      averageWeeklyKm4Weeks: 3, longestUsualRunKm: 1.5, qualitySessions8Weeks: 0, qualityWeeks8Weeks: 0,
      qualityMostlyTolerated: false, experience: none, availableRunsPerWeek: 3, targetTime: '18:30',
    },
    description: {
      constraints: 'Нет измеренного результата на 3000 м; 3 км без остановки не пробегает; базовый объём ≈3 км/нед, 1 пробежка в неделю.',
      realism: '12 недель до даты старта — максимально допустимый срок задания; цель 18:30 сформулирована как первая осмысленная цель после подтверждения непрерывных 3 км. Реалистичность определяется движком (оценка на экране цели), тест её не меняет.',
      availableDays: '3 тренировки в неделю (по ответу анкеты; конкретные дни недели в анкете не задаются, расписание строит движок).',
    },
  },
  {
    id: 'p2-18min-5-10km',
    title: 'P2 · 18:00 на 3000 м, 5–10 км/нед',
    weeks: 10,
    seed: 20261013,
    answers: {
      resultTime: '18:00', canRun3Km: true, regularRunningWeeks: 12, actualRunsPerWeek: 2,
      averageWeeklyKm4Weeks: 8, longestUsualRunKm: 4, qualitySessions8Weeks: 0, qualityWeeks8Weeks: 0,
      qualityMostlyTolerated: false, experience: none, availableRunsPerWeek: 3, targetTime: '16:30',
    },
    description: {
      constraints: 'Низкая база 8 км/нед, 2 пробежки в неделю, быстрых тренировок раньше не было.',
      realism: '10 недель; цель 16:30 (−90 с) амбициозна для такой базы — тест лишь фиксирует вердикт движка и поведение интерфейса.',
      availableDays: '3 тренировки в неделю.',
    },
  },
  {
    id: 'p3-15-30-12-18km',
    title: 'P3 · 15:30 на 3000 м, 12–18 км/нед',
    weeks: 8,
    seed: 20261014,
    answers: {
      resultTime: '15:30', canRun3Km: true, regularRunningWeeks: 30, actualRunsPerWeek: 3,
      averageWeeklyKm4Weeks: 15, longestUsualRunKm: 6, qualitySessions8Weeks: 2, qualityWeeks8Weeks: 2,
      qualityMostlyTolerated: true, experience: {threshold: true, vo2: false, specific3k: false},
      availableRunsPerWeek: 4, targetTime: '14:50',
    },
    description: {
      constraints: 'Средняя база 15 км/нед, 3 пробежки, небольшой опыт темповой работы.',
      realism: '8 недель (минимальный срок задания); цель 14:50 (−40 с) — умеренно амбициозная.',
      availableDays: '4 тренировки в неделю.',
    },
  },
  {
    id: 'p4-14-30-25-30km',
    title: 'P4 · 14:30 на 3000 м, 25–30 км/нед',
    weeks: 10,
    seed: 20261015,
    answers: {
      resultTime: '14:30', canRun3Km: true, regularRunningWeeks: 80, actualRunsPerWeek: 4,
      averageWeeklyKm4Weeks: 28, longestUsualRunKm: 10, qualitySessions8Weeks: 6, qualityWeeks8Weeks: 5,
      qualityMostlyTolerated: true, experience: all, availableRunsPerWeek: 5, targetTime: '13:50',
    },
    description: {
      constraints: 'Хорошая база 28 км/нед, 4 пробежки, регулярная быстрая работа.',
      realism: '10 недель; цель 13:50 (−40 с).',
      availableDays: '5 тренировок в неделю.',
    },
  },
  {
    id: 'p5-strong-high-base',
    title: 'P5 · Сильный бегун, высокая база (12:30, 55 км/нед)',
    weeks: 12,
    seed: 20261016,
    answers: {
      resultTime: '12:30', canRun3Km: true, regularRunningWeeks: 250, actualRunsPerWeek: 6,
      averageWeeklyKm4Weeks: 55, longestUsualRunKm: 18, qualitySessions8Weeks: 14, qualityWeeks8Weeks: 8,
      qualityMostlyTolerated: true, experience: all, availableRunsPerWeek: 6, targetTime: '12:10',
    },
    description: {
      constraints: 'Очень высокая база 55 км/нед, 6 пробежек, до 2 качественных занятий в неделю.',
      realism: '12 недель; цель 12:10 (−20 с) — малое улучшение у сильного бегуна.',
      availableDays: '6 тренировок в неделю.',
    },
  },
];
