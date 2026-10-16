/**
 * Short, deterministic regression tests for the defects found by the full-cycle runs (reports/qa-issue-23/defect-log.md).
 * They assert the CORRECT behaviour. Before the fixes they were annotated `test.fail()` and reported as expected
 * failures (see reports/qa-issue-23/before-fix/); DEF-001..DEF-004 are fixed, so they are ordinary tests now.
 */
import {test, expect} from '@playwright/test';
import {deriveToday} from '../../web/src/application/uiState.ts';
import {PROFILES} from './profiles.ts';
import {Session, confirmContinuous3k} from './driver.ts';
import {Journal} from './journal.ts';
import {isSafetyHold} from './invariants.ts';
import {makeRng, planReport} from './model.ts';
import type {ExecutionMode, WorkoutLite} from './model.ts';

const OUT_SHOTS = process.env.QA_SHOT_DIR ?? 'reports/qa-issue-23/screenshots';
void OUT_SHOTS;

function profile(id: string) { const p = PROFILES.find((x) => x.id === id); if (!p) throw new Error(id); return p; }

/** Record every due workout ON_PLAN until `stop` says so; the first workout for which `modeFor` returns another mode uses it. */
async function walk(s: Session, seed: number, opts: {checkpoints?: boolean; maxDays: number; modeFor: (w: WorkoutLite, today: string) => ExecutionMode; stop: (today: string) => boolean | Promise<boolean>}): Promise<string> {
  const rng = makeRng(seed);
  for (let day = 0; day < opts.maxDays; day += 1) {
    const today = await s.today();
    if (await opts.stop(today)) return today;
    const st = await s.engine();
    const view = deriveToday(st, today);
    if (view.state === 'PENDING_RESULT') { await s.skipPendingOldest(); }
    const st2 = await s.engine();
    const view2 = deriveToday(st2, today);
    if ((view2.state === 'CHECKPOINT_REQUIRED' || view2.state === 'PERFORMANCE_REVIEW') && opts.checkpoints !== false && st2.profile.performance) {
      const res = await s.checkpoint(st2.profile.performance.timeSeconds, 'today'); // same result as before: never a fictitious improvement
      if (res.ok) continue;
    }
    if (view2.workout) {
      const w = view2.workout as unknown as WorkoutLite;
      const mode = opts.modeFor(w, today);
      await s.recordWorkout(w, planReport(w, mode, rng), {via: 'card'});
      if (mode === 'SYMPTOMS') return today;
    }
    await s.advance(1);
  }
  const st = await s.engine();
  throw new Error(`walk: limit reached; today=${await s.today()} state=${deriveToday(st, await s.today()).state} queue=${st.queue.map((w) => w.scheduledDate + ':' + w.type).join(' ')} hist=${st.history.length}`);
}

test.describe('regression of fixed defects DEF-001..DEF-004', () => {
  test('DEF-001 · REST placeholder after a STOP is shown as an unclosed workout and hides the hold message · p3 · seed 20261014',
    async ({page}) => {
      const pr = profile('p3-15-30-12-18km');
      const s = new Session(page, pr, new Journal(pr.id, pr.seed));
      await s.fresh(); await s.onboard();
      // two normal weeks then one session reported with pain 4 + altered movement (→ RED/STOP)
      let n = 0;
      await walk(s, pr.seed, {maxDays: 40, modeFor: () => (++n >= 4 ? 'SYMPTOMS' : 'ON_PLAN'), stop: () => false});
      expect(isSafetyHold(await s.engine())).toBe(true);
      await s.advance(1); await s.advance(1); // the first REST placeholder is now in the past
      await page.goto('/today');
      await s.shot('def001-today-under-stop');
      await expect(page.getByText('Предыдущая тренировка ещё не закрыта')).toHaveCount(0);
      await expect(page.getByRole('button', {name: 'Повторно проверить состояние'})).toBeVisible();
      // no fictitious skips for the REST service days, and the recheck is possible straight away
      expect((await s.engine()).skippedWorkouts).toHaveLength(0);
      const rc = await s.recheckSafety({healthy: true, clearance: true});
      expect(rc.saved && rc.stillHold === false).toBe(true);
    });

  test('DEF-002 · no mandatory checkpoint for a novice who cannot run 3 km; after confirming 3 km the checkpoint is available and accepted · p1 · seed 20261012',
    async ({page}) => {
      const pr = profile('p1-novice-no3k');
      const s = new Session(page, pr, new Journal(pr.id, pr.seed));
      await s.fresh(); await s.onboard();
      await s.captureBaseline();
      const start = await s.today();
      let seenRequired = '';
      // six weeks (well past the 21-day mark) of on-plan sessions; the checkpoint screen must never be demanded
      const reached = await walk(s, pr.seed, {checkpoints: false, maxDays: 60, modeFor: () => 'ON_PLAN', stop: async (today) => {
        const st = await s.engine();
        if (st.checkpointRequired || deriveToday(st, today).state === 'CHECKPOINT_REQUIRED') seenRequired = today;
        return (Date.parse(today) - Date.parse(start)) / 86_400_000 >= 42;
      }});
      expect(seenRequired, `«Нужен контрольный результат» показан новичку без 3 км: ${seenRequired}`).toBe('');
      expect((await s.engine()).profile.canRun3Km).toBe(false);
      const confirmed = await confirmContinuous3k(s);
      expect(confirmed.ok, confirmed.note).toBe(true);
      // existing rules apply again: more than 21 days since the last assessment → checkpoint is due and the result is accepted
      const st = await s.engine();
      expect(st.checkpointRequired).toBe(true);
      const res = await s.checkpoint(1170, deriveToday(st, reached).state === 'CHECKPOINT_REQUIRED' ? 'today' : 'direct');
      expect(res.ok, `экран ответил: ${res.outcome}`).toBe(true);
    });

  test('DEF-003 · double-click on «Сохранить результат» skips the outcome screen (2nd click hits «Продолжить») · p3 · seed 20261014',
    async ({page}) => {
      const pr = profile('p3-15-30-12-18km');
      const journal = new Journal(pr.id, pr.seed);
      const s = new Session(page, pr, journal);
      await s.fresh(); await s.onboard();
      const w = deriveToday(await s.engine(), await s.today()).workout as unknown as WorkoutLite;
      await s.recordWorkout(w, planReport(w, 'ON_PLAN', makeRng(pr.seed)), {via: 'card', doubleClick: true, shot: 'def003'});
      expect((await s.engine()).history).toHaveLength(1); // nothing is credited twice — this part is fine
      const check = journal.checks.find((c) => c.id === 'DOUBLE_CLICK_KEEPS_OUTCOME_SCREEN');
      expect(check?.verdict, check?.detail).toBe('PASS');
    });

  test('DEF-004 · «По плану: 1 отрезок» is declined correctly on the result form · p2 · seed 20261013',
    async ({page}) => {
      const pr = profile('p2-18min-5-10km');
      const s = new Session(page, pr, new Journal(pr.id, pr.seed));
      await s.fresh(); await s.onboard();
      await walk(s, pr.seed, {maxDays: 40, modeFor: () => 'ON_PLAN', stop: async () => deriveToday(await s.engine(), await s.today()).workout?.type === 'THRESHOLD'});
      const w = deriveToday(await s.engine(), await s.today()).workout!;
      await page.goto(`/workout/${w.id}/result`);
      const label = await page.getByText(/^По плану: \d+ отрез/).first().innerText();
      await s.shot('def004-result-form');
      expect(label.trim()).toMatch(/^По плану: 1 отрезок$/);
    });
});
