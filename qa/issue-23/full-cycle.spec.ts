/**
 * Issue #23 — autonomous full-cycle runs in a real browser, one test per fictional athlete profile.
 * Each test walks the whole preparation day by day through the UI (questionnaire → plan → virtual days →
 * workouts/partial/skip → move → checkpoint → taper → final result) and writes JSON/CSV/screenshots.
 */
import {test, expect} from '@playwright/test';
import {join} from 'node:path';
import {PROFILES, QA_START_DATE} from './profiles.ts';
import {Session} from './driver.ts';
import {Journal} from './journal.ts';
import {directivesFor, runCycle} from './cycle.ts';
import {cycleChecks, weeklyTable} from './analysis.ts';

export const OUT = process.env.QA_OUT_DIR ?? 'reports/qa-issue-23/data';

PROFILES.forEach((profile, index) => {
  test(`full cycle · ${profile.id} · ${profile.weeks} недель · seed ${profile.seed}`, async ({page}) => {
    const journal = new Journal(profile.id, profile.seed);
    const s = new Session(page, profile, journal);
    const d = directivesFor(profile, index);
    journal.meta = {title: profile.title, weeks: profile.weeks, startDate: QA_START_DATE, answers: profile.answers, description: profile.description, directives: d};
    try {
      await s.fresh();
      await s.onboard({shots: true});
      const res = await runCycle(s, profile, d);
      const weekly = weeklyTable(res, QA_START_DATE, profile.weeks + 2);
      journal.weekly = weekly;
      const raceDate = res.finalState?.profile.raceDate ?? QA_START_DATE;
      cycleChecks(s, res, weekly, raceDate);
      const sessions = [...res.ledger.values()].filter((e) => e.w.type !== 'REST');
      journal.counters.workoutsPlannedTotal = sessions.length;
      journal.counters.weeksSpanned = Math.ceil(res.daysWalked / 7);
      journal.meta = {...journal.meta, observations: res.observations, finalSeconds: res.finalSeconds, daysWalked: res.daysWalked, raceDateAtEnd: raceDate};
      s.verify('CYCLE_REACHED_FINAL_RESULT', 'Цикл дошёл до итогового результата и заархивирован', res.finalSeconds !== null, `итог=${res.finalSeconds}`, raceDate);
      s.verify('WEEKS_IN_ISSUE_RANGE', 'Пройдено 8–12 недель (по фактическому числу виртуальных дней)', res.daysWalked >= 8 * 7 - 1 && res.daysWalked <= 12 * 7 + 1, `виртуальных дней: ${res.daysWalked}`, raceDate);
    } finally {
      journal.write(join(OUT));
    }
    expect(journal.failures.map((f) => `${f.id}: ${f.detail}`)).toEqual([]);
  });
});
