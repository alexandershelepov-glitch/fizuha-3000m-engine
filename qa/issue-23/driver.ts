/**
 * Real-browser driver for the full user cycle. Every action goes through the UI (buttons, forms, URLs);
 * localStorage is only READ back as an oracle and, once, seeded with the tester's initial virtual date
 * (the same key the test-build calendar panel writes).
 */
import {expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import type {EngineState} from '../../src/models.ts';
import {deriveToday} from '../../web/src/application/uiState.ts';
import type {TodayState} from '../../web/src/application/uiState.ts';
import {formatDateLong, formatDateShort} from '../../web/src/application/format.ts';
import {reservedMetres} from '../../src/weeklyLoad.ts';
import {Journal} from './journal.ts';
import {addDaysIso, checkState, dayNum} from './invariants.ts';
import {fmtSeconds} from './model.ts';
import type {PlannedReport, WorkoutLite} from './model.ts';
import type {ProfileFixture} from './profiles.ts';
import {QA_START_DATE} from './profiles.ts';
import {KNOWN_DEFECTS} from './known-defects.ts';

export const ACTIVE_CYCLE = 'fizuha.activeCycle';
export const ARCHIVE = 'fizuha.archivedCycles';
export const TEST_DATE_KEY = 'fizuha.test.virtualDate.v1';
export const SHOT_ROOT = process.env.QA_SHOT_DIR ?? 'reports/qa-issue-23/screenshots';

export interface Envelope {
  formatVersion: number;
  cycle: {cycleId: string; engineState: string; baseline: {performance: {timeSeconds: number} | null; targetTimeSeconds: number; raceDate: string}};
  events: {type: string; cause?: string; workoutId?: string; fromDate?: string; toDate?: string; at?: string}[];
}

export class Session {
  shotIndex = 0;
  uiActions = {recordSubmits: 0, skipClicks: 0, moveSubmits: 0, checkpointSubmits: 0};
  constructor(public page: Page, public profile: ProfileFixture, public journal: Journal, public startDate = QA_START_DATE) {}

  // ------------------------------------------------------------------ reads (oracle)
  async rawCycle(): Promise<string | null> { return this.page.evaluate((k) => window.localStorage.getItem(k), ACTIVE_CYCLE); }
  async envelope(): Promise<Envelope> {
    const raw = await this.rawCycle();
    if (raw === null) throw new Error('no active cycle in localStorage');
    return JSON.parse(raw) as Envelope;
  }
  async engine(): Promise<EngineState> { return JSON.parse((await this.envelope()).cycle.engineState) as EngineState; }
  async today(): Promise<string> {
    const v = await this.page.getByTestId('test-date').getAttribute('dateTime');
    if (v === null) throw new Error('virtual date is not displayed');
    return v;
  }
  week(date: string): number { return Math.floor((dayNum(date) - dayNum(this.startDate)) / 7) + 1; }
  dayIndex(date: string): number { return dayNum(date) - dayNum(this.startDate); }

  // ------------------------------------------------------------------ helpers
  async shot(name: string): Promise<void> {
    const dir = join(SHOT_ROOT, this.profile.id);
    mkdirSync(dir, {recursive: true});
    this.shotIndex += 1;
    await this.page.screenshot({path: join(dir, `${String(this.shotIndex).padStart(2, '0')}-${name}.png`), fullPage: true});
    this.journal.counters.screenshots += 1;
  }
  async next(): Promise<void> { await this.page.getByRole('button', {name: 'Продолжить', exact: true}).click(); }
  async goto(path: string): Promise<void> { await this.page.goto(path); }
  async tick(): Promise<void> { this.journal.counters.uiTransitions += 1; }

  /** Verdict recorded in the journal; returns pass flag. */
  verify(id: string, description: string, ok: boolean, detail: string, date: string, defect?: string): boolean {
    this.journal.check(id, description, ok, detail, date, defect ?? KNOWN_DEFECTS[id]);
    return ok;
  }
  private seenViolations = new Set<string>();

  // ------------------------------------------------------------------ start of the cycle
  async fresh(): Promise<void> {
    await this.page.goto('/');
    await this.page.evaluate(([k, d]) => { window.localStorage.clear(); window.localStorage.setItem(k!, d!); }, [TEST_DATE_KEY, this.startDate]);
    await this.page.goto('/');
    await expect(this.page.getByRole('button', {name: 'Начать подготовку'})).toBeVisible();
    await expect(this.page.getByTestId('test-date')).toHaveAttribute('dateTime', this.startDate);
  }

  async onboard(opts: {shots?: boolean} = {}): Promise<void> {
    const p = this.page; const a = this.profile.answers;
    await p.getByRole('button', {name: 'Начать подготовку'}).click();
    if (opts.shots) await this.shot('questionnaire-start');
    if (a.resultTime === null) await p.getByRole('button', {name: 'Нет результата'}).click();
    else await p.locator('#resultTime').fill(a.resultTime);
    await this.next();
    await p.locator('#canRun3Km').getByRole('button', {name: a.canRun3Km ? 'Да' : 'Нет', exact: true}).click();
    await p.locator('#regularRunningWeeks').fill(String(a.regularRunningWeeks));
    await p.locator('#actualRunsPerWeek').fill(String(a.actualRunsPerWeek));
    await p.locator('#averageWeeklyKm4Weeks').fill(String(a.averageWeeklyKm4Weeks));
    await p.locator('#longestUsualRunKm').fill(String(a.longestUsualRunKm));
    await this.next();
    await p.getByRole('radio', {name: 'Знаю точное количество'}).click();
    await p.locator('#qualitySessions8Weeks').fill(String(a.qualitySessions8Weeks));
    await p.locator('#qualityWeeks8Weeks').fill(String(a.qualityWeeks8Weeks));
    await p.locator('#qualityMostlyTolerated').getByRole('button', {name: a.qualityMostlyTolerated ? 'Да' : 'Нет', exact: true}).click();
    if (a.experience.threshold) await p.locator('#experience-threshold').check();
    if (a.experience.vo2) await p.locator('#experience-vo2').check();
    if (a.experience.specific3k) await p.locator('#experience-specific').check();
    await this.next(); // SAFETY
    await p.getByRole('button', {name: 'Жалоб и ограничений нет — продолжить'}).click(); // → BREAKS
    await this.next(); // AVAILABILITY
    await p.locator('#availableRunsPerWeek').fill(String(a.availableRunsPerWeek));
    await this.next(); // GOAL
    await p.locator('#targetTime').fill(a.targetTime);
    await this.next(); // RACE_DATE
    await p.locator('#raceDate').fill(addDaysIso(this.startDate, this.profile.weeks * 7));
    if (opts.shots) await this.shot('questionnaire-goal-and-date');
    await this.next(); // REVIEW
    await expect(p.getByText('Проверьте данные')).toBeVisible();
    if (opts.shots) await this.shot('review');
    await p.getByRole('button', {name: 'Рассчитать план'}).click();
    await expect(p.getByText('Ваша подготовка')).toBeVisible();
    if (opts.shots) await this.shot('assessment');
    await p.getByRole('button', {name: 'Посмотреть план'}).click();
    await expect(p.getByText('Ваш план готов')).toBeVisible();
    if (opts.shots) await this.shot('plan-ready');
    await p.getByRole('button', {name: 'Перейти к подготовке'}).click();
    await expect(p.getByRole('navigation', {name: 'Основные разделы'})).toBeVisible();
    this.journal.counters.uiTransitions += 12;
  }

  // ------------------------------------------------------------------ state checks
  /** Check persistence/invariants/UI-vs-engine consistency; returns the engine state. */
  async audit(tag: string, opts: {skipUi?: boolean} = {}): Promise<EngineState> {
    const state = await this.engine();
    const today = await this.today();
    const date = today;
    for (const v of checkState(state, today)) {
      const key = `${v.id}|${v.detail}`;
      if (this.seenViolations.has(key)) continue; // report each distinct violation once, at first sight
      this.seenViolations.add(key);
      this.verify(v.id, `Инвариант методики: ${v.id}`, false, `${tag}: ${v.detail}`, date);
    }
    // positive evidence: the invariant block ran and found nothing new
    if (checkState(state, today).length === 0) this.verify('INVARIANTS_HOLD', 'Все независимые инварианты методики выполняются в этот день', true, tag, date);
    // no hidden auto-credit: only explicit UI submissions may create history entries
    this.verify('NO_HIDDEN_AUTOCREDIT_HISTORY', 'Число записей в истории равно числу явно отправленных через UI результатов',
      state.history.length === this.uiActions.recordSubmits, `${tag}: history=${state.history.length}, UI submits=${this.uiActions.recordSubmits}`, date);
    this.verify('NO_HIDDEN_AUTOCREDIT_SKIPS', 'Число пропусков в движке равно числу явных пропусков через UI',
      state.skippedIds.length >= this.uiActions.skipClicks && state.history.every((h) => h.result.feedbackConfirmed === true),
      `${tag}: skippedIds=${state.skippedIds.length}, UI skips=${this.uiActions.skipClicks}; все записи истории имеют feedbackConfirmed=true: ${state.history.every((h) => h.result.feedbackConfirmed === true)}`, date);
    this.journal.trace.push({date, tag, phase: state.decision.phase, safety: state.decision.safety, diagnosticHold: state.diagnosticHold, relatedYellow: state.relatedYellow,
      history: state.history.length, queue: state.queue.map((w) => `${w.scheduledDate}:${w.type}`).join(' '), reasons: state.decision.reasons.join(','), approvedM: state.easyProgression?.approvedMetersPer7Days ?? null});
    if (!opts.skipUi) await this.assertTodayMatchesEngine(state, today, tag);
    return state;
  }

  async assertTodayMatchesEngine(state: EngineState, today: string, tag: string): Promise<TodayState> {
    const p = this.page;
    await p.goto('/today');
    await expect(p.getByTestId('test-date')).toHaveAttribute('dateTime', today);
    const view = deriveToday(state, today);
    const body = p.locator('body');
    const expectText: Partial<Record<TodayState, string>> = {
      PENDING_RESULT: 'Предыдущая тренировка ещё не закрыта', TRAINING_HOLD: 'Обычные тренировки приостановлены',
      REST_DAY: 'Сегодня восстановление', EMPTY_QUEUE: 'На ближайшие дни тренировок нет', RACE_DAY: 'Итоговый старт — 3000 м',
      AWAITING_FINAL_RESULT: 'Итоговый результат ещё не внесён', PERFORMANCE_REVIEW: 'Нужно обновить результат на 3000 м',
      CHECKPOINT_REQUIRED: 'Нужен контрольный результат', COMPLETED: 'Подготовка завершена',
    };
    const needle = expectText[view.state];
    let ok = true; let detail = `${tag}: state=${view.state}`;
    if (needle !== undefined) {
      ok = await body.getByText(needle, {exact: false}).first().isVisible().catch(() => false);
      if (!ok) detail += `; на экране нет текста «${needle}»`;
    }
    const hasOpen = await p.getByRole('button', {name: 'Открыть тренировку'}).count();
    const shouldShowWorkout = view.workout !== null && ['WORKOUT_TODAY', 'TAPER', 'CHECKPOINT_REQUIRED', 'PERFORMANCE_REVIEW'].includes(view.state);
    if (shouldShowWorkout !== (hasOpen > 0)) { ok = false; detail += `; карточка тренировки: ожидалась=${shouldShowWorkout}, на экране=${hasOpen > 0}`; }
    if (view.state === 'TRAINING_HOLD' && hasOpen > 0) { ok = false; detail += '; при остановке показана тренировка'; }
    this.verify('UI_TODAY_MATCHES_ENGINE', 'Экран «Сегодня» соответствует состоянию движка', ok, detail, today);
    return view.state;
  }

  // ------------------------------------------------------------------ clock
  async advance(days: 1 | 7, tag = ''): Promise<void> {
    const before = await this.today();
    await this.page.getByRole('region', {name: 'Тестовый календарь'}).getByRole('button', {name: days === 1 ? '+1 день' : '+7 дней'}).click();
    await expect(this.page.getByTestId('test-date')).toHaveAttribute('dateTime', addDaysIso(before, days));
    this.journal.counters.virtualDays += days;
    await this.tick();
    void tag;
  }

  // ------------------------------------------------------------------ planned-load description
  describePlan(s: EngineState, w: WorkoutLite): {load: string; reserved: string} {
    const main = w.main.dose.unit === 'MINUTES' ? `${w.main.dose.value} мин` : `${Math.round(w.main.dose.value)} м`;
    const rep = w.main.repeats > 1 && w.main.mode === 'INTERVALS' ? ` (${w.main.repeats}×${w.main.repeatMeters ?? '?'} м, отдых ${w.restSeconds} с)` : '';
    const reserved = reservedMetres(s, w as never);
    return {
      load: `разминка ${w.warmupMinutes} мин | основной блок ${main}${rep} | заминка ${w.cooldownMinutes} мин | RPE ${w.targetRpe[0]}–${w.targetRpe[1]}`,
      reserved: reserved === null ? 'n/a' : String(Math.round(reserved)),
    };
  }

  // ------------------------------------------------------------------ recording a session
  /** Returns the evaluation shown by the engine (from the persisted history). */
  async recordWorkout(w: WorkoutLite, report: PlannedReport, opts: {via: 'card' | 'pending' | 'direct'; shot?: string; doubleClick?: boolean; allowTooEarly?: boolean} = {via: 'card'}): Promise<{evaluation: string; outcomeText: string}> {
    const p = this.page;
    const before = await this.engine();
    const today = await this.today();
    if (opts.via === 'card') {
      await p.goto('/today');
      await p.getByRole('button', {name: 'Открыть тренировку'}).click();
      await expect(p).toHaveURL(/\/workout\/[^/]+$/);
      if (opts.shot) await this.shot(`${opts.shot}-workout-card`);
      await p.getByRole('button', {name: 'Внести результат'}).click();
    } else if (opts.via === 'pending') {
      await p.goto('/today');
      await p.getByRole('button', {name: 'Внести результат'}).click();
    } else {
      await p.goto(`/workout/${w.id}/result`);
    }
    await expect(p).toHaveURL(/\/result$/);
    await expect(p.getByText('Результат тренировки').first()).toBeVisible();
    await p.getByRole('radio', {name: {FULL: 'Выполнено полностью', HALF: 'Примерно половина', LESS_THAN_HALF: 'Меньше половины'}[report.completion], exact: true}).click();
    await p.locator('[aria-labelledby="sessionRpe-label"] .scale__option').filter({hasText: new RegExp(`^${report.rpe}$`)}).click();
    const rows = await p.locator('[id^="repeat-seconds-"]').count();
    if (report.repeats.length > 0) {
      for (let i = 0; i < report.repeats.length && i < rows; i += 1) {
        await p.locator(`#repeat-seconds-${i}`).fill(report.repeats[i]!.seconds);
        await p.locator(`#repeat-meters-${i}`).fill(String(report.repeats[i]!.meters));
      }
    }
    if (report.unexpectedFatigue) await p.locator('#unexpectedFatigue').getByRole('button', {name: 'Да', exact: true}).click();
    if (report.safety === null) {
      await p.getByRole('radio', {name: 'Нет, всё нормально'}).click();
    } else {
      await p.getByRole('radio', {name: 'Да, появились'}).click();
      await p.locator('#result-safety-pain .scale__option').filter({hasText: new RegExp(`^${report.safety.pain}$`)}).click();
      for (const flag of report.safety.flags) await p.locator(`#result-safety-${flag}`).getByRole('button', {name: 'Да', exact: true}).click();
    }
    if (opts.shot) await this.shot(`${opts.shot}-result-form`);
    const plannedLabel = (await p.getByText(/^По плану: \d+ отрезк/).count()) > 0 ? await p.getByText(/^По плану: \d+ отрезк/).first().innerText() : '';
    if (plannedLabel) {
      const n = Number(/\d+/.exec(plannedLabel)![0]);
      const word = n % 10 === 1 && n % 100 !== 11 ? 'отрезок' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'отрезка' : 'отрезков';
      this.verify('GRAMMAR_REPEATS_PLURAL', 'Подпись «По плану: N …» на форме результата согласована по числу (1 отрезок, 2–4 отрезка, 5 отрезков)', plannedLabel.trim().endsWith(word), `${w.type} ${w.scheduledDate}: «${plannedLabel.trim()}», ожидалось «…${word}»`, today);
    }
    const save = p.getByRole('button', {name: 'Сохранить результат'});
    if (opts.doubleClick) {
      await save.dblclick();
    } else {
      await save.click();
    }
    const asIs = p.getByRole('button', {name: 'Отправить как есть'});
    if (opts.doubleClick) {
      await p.waitForTimeout(400);
      const stuck = /\/result$/.test(new URL(p.url()).pathname) && !(await asIs.isVisible().catch(() => false));
      if (stuck) {
        // the double click neither submitted nor left the incomplete-repeats confirmation on screen
        this.verify('DOUBLE_CLICK_WARNING_NOT_DISMISSED', 'После двойного нажатия «Сохранить результат» экран либо отправил результат, либо оставил предупреждение о неполных отрезках', false,
          `${w.type} ${w.scheduledDate}: форма осталась открытой без предупреждения (url ${new URL(p.url()).pathname})`, today);
        await this.shot('double-click-warning-dismissed');
        await save.click();
      }
    }
    if (await asIs.isVisible().catch(() => false)) {
      if (opts.shot) await this.shot(`${opts.shot}-incomplete-repeats-warning`);
      await asIs.click();
    }
    await expect(p).toHaveURL(opts.doubleClick ? /\/(outcome|today)$/ : /\/outcome$/);
    if (opts.doubleClick) await p.waitForTimeout(500);
    const landedOnToday = new URL(p.url()).pathname === '/today';
    if (opts.doubleClick) {
      this.verify('DOUBLE_CLICK_KEEPS_OUTCOME_SCREEN', 'Двойное нажатие «Сохранить результат» не перескакивает экран с итогом тренировки (второй клик не попадает в «Продолжить»)', !landedOnToday,
        `${w.type} ${w.scheduledDate}: после dblclick открыт ${new URL(p.url()).pathname}`, today);
    }
    this.uiActions.recordSubmits += 1;
    this.journal.counters.workoutsRecorded += 1;
    await this.tick();
    const outcomeText = landedOnToday ? '' : (await p.locator('main, .screen').first().innerText()).replace(/\s+/g, ' ').slice(0, 600);
    if (opts.shot && !landedOnToday) await this.shot(`${opts.shot}-outcome`);
    const after = await this.engine();
    const entry = after.history.find((h) => h.workout.id === w.id);
    const evaluation = entry?.classified.evaluation ?? 'MISSING';
    this.verify('HISTORY_GROWS_BY_ONE_PER_SUBMIT', 'Одна отправка результата (в т.ч. при двойном нажатии) добавляет ровно одну запись истории',
      after.history.length === before.history.length + 1, `до=${before.history.length}, после=${after.history.length}`, today);
    this.verify('VERDICT_FOLLOWS_MODEL', `Вердикт движка соответствует модели поведения (${report.mode})`,
      report.allowedEvaluations.includes(evaluation as never),
      `${w.type} ${w.scheduledDate}: получен ${evaluation}, допустимо ${report.allowedEvaluations.join('/')}; модель: ${report.rationale}`, today);
    const desc = this.describePlan(before, w);
    const reasons = after.decision.reasons.join(',');
    this.journal.row({
      date: w.scheduledDate, week: this.week(w.scheduledDate), day_index: this.dayIndex(w.scheduledDate),
      event: 'WORKOUT_RECORDED', workout_id: w.id, assignment: w.type, purpose: w.goal, planned_load: desc.load, planned_reserved_m: desc.reserved,
      entered_result: `${report.mode}: выполнено ${Math.round(report.completionFraction * 100)}%, RPE ${report.rpe}${report.repeats.length ? `, отрезки ${report.repeats.map((r) => `${r.meters}м/${r.seconds}`).join(' ')}` : ''}${report.unexpectedFatigue ? ', необычная усталость' : ''}${report.safety ? `, симптомы: боль ${report.safety.pain}, ${report.safety.flags.join('+')}` : ''}`,
      engine_evaluation: evaluation,
      change_reason: after.history.find((h) => h.workout.id === w.id)?.classified.yellowReason ?? (reasons || ''),
      phase: after.decision.phase, safety: after.decision.safety,
      warnings: [report.repeats.length === 0 && w.speedRangeMps ? 'отрезки не заполнены' : '', after.diagnosticHold ? 'diagnosticHold' : '', after.relatedYellow ? 'relatedYellow' : ''].filter(Boolean).join('; '),
    });
    this.journal.counters.byEvaluation[evaluation] = (this.journal.counters.byEvaluation[evaluation] ?? 0) + 1;
    this.journal.counters.byType[w.type] = (this.journal.counters.byType[w.type] ?? 0) + 1;
    if (report.mode === 'PARTIAL') this.journal.counters.incompleteSessions += 1;
    if (report.mode === 'SYMPTOMS') this.journal.counters.symptomReports += 1;
    void opts.allowTooEarly;
    if (!landedOnToday) await p.getByRole('button', {name: 'Продолжить', exact: true}).click();
    await expect(p).toHaveURL(/\/today$/);
    return {evaluation, outcomeText};
  }

  // ------------------------------------------------------------------ skip / move / checkpoint / params / safety / final
  async skipPendingOldest(): Promise<string> {
    const before = await this.engine();
    const today = await this.today();
    const oldest = before.queue.filter((w) => w.scheduledDate < today)[0];
    if (!oldest) throw new Error('no pending workout to skip');
    await this.page.goto('/today');
    await this.page.getByRole('button', {name: 'Я её не выполнял'}).click();
    await expect.poll(async () => (await this.engine()).skippedIds.includes(oldest.id)).toBe(true);
    this.uiActions.skipClicks += 1;
    this.journal.counters.workoutsSkipped += 1;
    await this.tick();
    const after = await this.engine();
    this.verify('SKIP_NOT_CREDITED', 'Пропуск не создаёт запись выполнения и не засчитывается', !after.history.some((h) => h.workout.id === oldest.id) && after.history.length === before.history.length, `${oldest.id}`, today);
    const env = await this.envelope();
    const ev = env.events.filter((e) => e.type === 'WORKOUT_SKIPPED' && e.workoutId === oldest.id);
    this.verify('SKIP_EVENT_LOGGED_PAST_DUE', 'Пропуск записан в журнал приложения с причиной PAST_DUE', ev.length === 1 && ev[0]!.cause === 'PAST_DUE', JSON.stringify(ev), today);
    this.journal.row({
      date: oldest.scheduledDate, week: this.week(oldest.scheduledDate), day_index: this.dayIndex(oldest.scheduledDate), event: 'WORKOUT_SKIPPED',
      workout_id: oldest.id, assignment: oldest.type, purpose: oldest.goal, planned_load: this.describePlan(before, oldest as never).load, planned_reserved_m: this.describePlan(before, oldest as never).reserved,
      entered_result: 'не выполнено (отмечено пользователем)', change_reason: 'PAST_DUE: пропущенный объём не переносится', phase: after.decision.phase, safety: after.decision.safety,
    });
    return oldest.id;
  }

  async skipFuture(w: WorkoutLite): Promise<void> {
    const before = await this.engine();
    await this.page.goto(`/workout/${w.id}`);
    await this.page.getByRole('button', {name: 'Не смогу выполнить'}).click();
    await this.page.getByRole('button', {name: 'Пропустить', exact: true}).click();
    await expect.poll(async () => (await this.engine()).skippedIds.includes(w.id)).toBe(true);
    this.uiActions.skipClicks += 1; this.journal.counters.workoutsSkipped += 1; await this.tick();
    const after = await this.engine();
    this.journal.row({date: w.scheduledDate, week: this.week(w.scheduledDate), day_index: this.dayIndex(w.scheduledDate), event: 'WORKOUT_SKIPPED_IN_ADVANCE', workout_id: w.id, assignment: w.type, purpose: w.goal,
      planned_load: this.describePlan(before, w).load, planned_reserved_m: this.describePlan(before, w).reserved, entered_result: 'отказ заранее («Не смогу выполнить»)', change_reason: 'USER_DECLINED', phase: after.decision.phase, safety: after.decision.safety});
  }

  /** Candidate dates exactly as the Move screen builds them (documented plan window, never past, never race day). */
  moveCandidates(s: EngineState, w: WorkoutLite, today: string): string[] {
    const out: string[] = [];
    for (let o = 0; o < 7; o += 1) {
      const d = addDaysIso(s.asOf, o);
      if (d === w.scheduledDate || d < today || d >= s.profile.raceDate) continue;
      out.push(d);
    }
    return out;
  }

  /** Try to move a session to every offered date until the engine accepts one; returns accepted date + the rejections seen. */
  async moveWorkout(w: WorkoutLite, preferred?: string): Promise<{moved: string | null; rejected: {date: string; text: string}[]}> {
    const p = this.page;
    const before = await this.engine();
    const today = await this.today();
    await p.goto(`/workout/${w.id}`);
    await p.getByRole('button', {name: 'Перенести', exact: true}).click();
    await expect(p).toHaveURL(/\/move$/);
    await this.shot('move-screen');
    const candidates = this.moveCandidates(before, w, today);
    const radios = p.getByRole('radio');
    const labels = await radios.allInnerTexts();
    // calendar correctness: offered labels must equal the independently formatted candidate dates
    this.verify('CALENDAR_MOVE_DATES', 'Экран переноса показывает именно допустимые календарные даты окна плана с верными подписями',
      labels.length === candidates.length && candidates.every((d, i) => labels[i]!.startsWith(formatDateLong(d))),
      `ожидалось ${candidates.map((d) => formatDateLong(d)).join(' | ')}; на экране ${labels.map((l) => l.split('\n')[0]).join(' | ')}`, today);
    const order = preferred ? [preferred, ...candidates.filter((d) => d !== preferred)] : candidates;
    const rejected: {date: string; text: string}[] = [];
    for (const date of order) {
      const idx = candidates.indexOf(date);
      if (idx < 0) continue;
      await radios.nth(idx).click();
      await p.getByRole('button', {name: 'Перенести', exact: true}).click();
      await p.waitForTimeout(150);
      if (!new URL(p.url()).pathname.endsWith('/move')) {
        this.uiActions.moveSubmits += 1; this.journal.counters.workoutsMoved += 1; await this.tick();
        const after = await this.engine();
        const moved = after.queue.find((q) => q.id === w.id);
        this.verify('MOVE_PERSISTED_NEW_DATE', 'Перенос сохранил новую дату и не создал дубликатов', moved?.scheduledDate === date && after.queue.filter((q) => q.id === w.id).length === 1, `${w.id}: ${w.scheduledDate} → ${moved?.scheduledDate}`, today);
        const env = await this.envelope();
        this.verify('MOVE_EVENT_LOGGED', 'Перенос записан в журнал событий', env.events.some((e) => e.type === 'WORKOUT_MOVED' && e.workoutId === w.id && e.toDate === date), JSON.stringify(env.events.slice(-2)), today);
        this.journal.row({date: w.scheduledDate, week: this.week(w.scheduledDate), day_index: this.dayIndex(w.scheduledDate), event: 'WORKOUT_MOVED', workout_id: w.id, assignment: w.type, purpose: w.goal,
          planned_load: this.describePlan(before, w).load, planned_reserved_m: this.describePlan(before, w).reserved, entered_result: `перенос ${w.scheduledDate} → ${date} (смена/нарушение графика)`,
          change_reason: rejected.length ? `принят после ${rejected.length} отказов движка` : 'принят', phase: after.decision.phase, safety: after.decision.safety, warnings: rejected.map((r) => `${r.date}: ${r.text}`).join(' | ')});
        return {moved: date, rejected};
      }
      const text = (await p.locator('[role="alert"], .notice').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
      rejected.push({date, text});
      this.journal.counters.expectedBlocks += 1;
    }
    return {moved: null, rejected};
  }

  async checkpoint(timeSeconds: number, via: 'today' | 'direct' = 'today'): Promise<{ok: boolean; outcome: string}> {
    const p = this.page;
    const todayDate = await this.today();
    const before = await this.engine();
    await p.goto(via === 'today' ? '/today' : '/checkpoint');
    if (via === 'today') {
      const btn = p.getByRole('button', {name: /Внести контрольный результат|Внести результат на 3000 м|Внести измеренный результат/}).first();
      await btn.click();
    }
    await expect(p).toHaveURL(/\/checkpoint$/);
    await p.locator('#checkpoint-time').fill(fmtSeconds(timeSeconds));
    await this.shot('checkpoint-form');
    await p.getByRole('button', {name: 'Сохранить результат'}).click();
    await p.waitForTimeout(250);
    if (!/\/checkpoint\/outcome$/.test(new URL(p.url()).pathname)) {
      const err = (await p.locator('[role="alert"], .notice').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
      await this.shot('checkpoint-rejected');
      this.verify('CHECKPOINT_ACCEPTED_WHEN_REQUIRED', 'Контрольный результат, который приложение само запросило («Нужен контрольный результат»), принимается', false,
        `${todayDate}: ${before.decision.phase}, canRun3Km=${before.profile.canRun3Km}, performance=${before.profile.performance === null ? 'нет' : fmtSeconds(before.profile.performance.timeSeconds)}; ответ экрана: «${err}»`, todayDate);
      await p.goto('/today');
      return {ok: false, outcome: err};
    }
    this.uiActions.checkpointSubmits += 1; this.journal.counters.checkpoints += 1; await this.tick();
    const text = (await p.locator('.screen').first().innerText()).replace(/\s+/g, ' ').slice(0, 500);
    await this.shot('checkpoint-outcome');
    const after = await this.engine();
    this.verify('CHECKPOINT_UPDATES_MEASURED_RESULT', 'Контрольный результат обновил измеренный результат и снял флаг checkpointRequired', after.profile.performance?.timeSeconds === timeSeconds && after.checkpointRequired === false, `было ${before.profile.performance?.timeSeconds ?? 'нет'}, стало ${after.profile.performance?.timeSeconds}, checkpointRequired=${after.checkpointRequired}`, todayDate);
    const env = await this.envelope();
    this.verify('CHECKPOINT_BASELINE_IMMUTABLE', 'Исходный (baseline) результат цикла не изменился', JSON.stringify(env.cycle.baseline.performance) === (await this.baselineAtStart()), JSON.stringify(env.cycle.baseline.performance), todayDate);
    this.journal.row({date: todayDate, week: this.week(todayDate), day_index: this.dayIndex(todayDate), event: 'CHECKPOINT_RECORDED', entered_result: `3000 м: ${fmtSeconds(timeSeconds)} (вымышленный внешний замер)`,
      change_reason: `обновление измеренного результата; было ${before.profile.performance ? fmtSeconds(before.profile.performance.timeSeconds) : 'нет результата'}`, phase: after.decision.phase, safety: after.decision.safety,
      warnings: after.decision.reasons.join(',')});
    await p.getByRole('button', {name: 'Продолжить', exact: true}).click();
    return {ok: true, outcome: text};
  }
  private baseline0: string | null = null;
  async baselineAtStart(): Promise<string> { return this.baseline0 ?? 'null'; }
  async captureBaseline(): Promise<void> { this.baseline0 = JSON.stringify((await this.envelope()).cycle.baseline.performance); }

  async changeParameters(target: string | null, raceDate: string): Promise<{ok: boolean; error: string}> {
    const p = this.page;
    const before = await this.engine();
    await p.goto('/profile');
    await p.getByRole('button', {name: 'Изменить цель и дату старта'}).click();
    await expect(p).toHaveURL(/\/profile\/parameters$/);
    if (target !== null) await p.locator('#goal-time').fill(target);
    await p.locator('#race-date').fill(raceDate);
    await p.getByRole('button', {name: 'Сохранить изменения'}).click();
    await p.waitForTimeout(200);
    if (new URL(p.url()).pathname.endsWith('/parameters/outcome')) {
      this.uiActions.moveSubmits += 0; this.journal.counters.examDateChanges += 1; await this.tick();
      await this.shot('parameters-outcome');
      await p.getByRole('button', {name: 'Продолжить', exact: true}).click();
      return {ok: true, error: ''};
    }
    if (new URL(p.url()).pathname === '/profile') return {ok: true, error: 'no-op (no changes)'};
    const err = (await p.locator('[role="alert"], .notice, .field__error').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    void before;
    return {ok: false, error: err};
  }

  async recheckSafety(opts: {healthy: boolean; clearance: boolean}): Promise<{saved: boolean; stillHold: boolean | null; note: string}> {
    const p = this.page;
    await p.goto('/profile/safety');
    await expect(p.getByRole('heading', {name: 'Повторная проверка состояния'})).toBeVisible();
    if (opts.healthy) await p.getByRole('button', {name: 'Жалоб и ограничений нет'}).click();
    else {
      await p.getByRole('button', {name: 'Есть жалобы или сомнения — заполнить подробно'}).click();
      await p.locator('#safety-review-alteredMovement').getByRole('button', {name: 'Да', exact: true}).click();
    }
    const box = p.locator('#medical-confirmed');
    if (opts.clearance) await box.check();
    const submit = p.getByRole('button', {name: 'Сохранить состояние'});
    const disabled = await submit.isDisabled();
    if (disabled) return {saved: false, stillHold: null, note: 'кнопка «Сохранить состояние» заблокирована без подтверждения'};
    await this.shot('safety-recheck');
    await submit.click();
    await expect(p).toHaveURL(/\/today$/);
    this.journal.counters.uiTransitions += 1;
    const s = await this.engine();
    const hold = s.decision.safety !== 'OK' || s.diagnosticHold || s.relatedYellow || s.decision.phase === 'HOLD_DIAGNOSTIC';
    return {saved: true, stillHold: hold, note: (await p.locator('.screen').first().innerText()).replace(/\s+/g, ' ').slice(0, 300)};
  }

  async finalResult(timeSeconds: number): Promise<{evaluationText: string}> {
    const p = this.page;
    const today = await this.today();
    await p.goto('/today');
    const later = p.getByRole('button', {name: 'Внести позже', exact: true});
    if (await later.count() > 0) {
      // «Внести позже» must postpone without recording anything or touching the stored cycle
      const rawBefore = await this.rawCycle();
      await later.first().click();
      await p.waitForTimeout(250);
      const rawAfter = await this.rawCycle();
      this.verify('RACE_DAY_LATER_KEEPS_STATE', 'На день старта «Внести позже» ничего не записывает и не меняет сохранённый цикл', rawBefore === rawAfter && rawAfter !== null, `цикл ${rawBefore === rawAfter ? 'не изменён' : 'изменён'}; url=${new URL(p.url()).pathname}`, today);
      this.journal.counters.uiTransitions += 1;
      await p.goto('/today');
    }
    await p.getByRole('button', {name: 'Внести итоговый результат', exact: true}).click();
    await expect(p).toHaveURL(/\/final-result$/);
    await p.locator('#final-time').fill(fmtSeconds(timeSeconds));
    await this.shot('final-result-form');
    await p.getByRole('button', {name: 'Сохранить итоговый результат', exact: true}).click();
    await expect(p.getByRole('heading', {name: 'Подготовка завершена'})).toBeVisible();
    await this.tick();
    await this.shot('cycle-summary');
    const text = (await p.locator('.screen').first().innerText()).replace(/\s+/g, ' ').slice(0, 700);
    const active = await this.rawCycle();
    const archived = await p.evaluate((k) => window.localStorage.getItem(k), ARCHIVE);
    this.verify('FINAL_ARCHIVED', 'После итогового результата активный цикл перенесён в архив', active === null && archived !== null && (JSON.parse(archived) as {cycles: unknown[]}).cycles.length === 1, `active=${active === null ? 'null' : 'present'}, archive=${archived === null ? 'null' : 'present'}`, today);
    this.journal.row({date: today, week: this.week(today), day_index: this.dayIndex(today), event: 'FINAL_RESULT', entered_result: `итог 3000 м: ${fmtSeconds(timeSeconds)} (вымышленный)`, change_reason: 'сдача норматива', phase: 'COMPLETED'});
    return {evaluationText: text};
  }

  async reloadAndCompare(tag: string): Promise<void> {
    const before = await this.rawCycle();
    const dateBefore = await this.today();
    await this.page.reload();
    await expect(this.page.getByTestId('test-date')).toBeVisible();
    const after = await this.rawCycle();
    this.journal.counters.reloads += 1;
    this.verify('RELOAD_STORAGE_INTACT', 'Перезагрузка страницы не меняет сохранённый цикл (байт в байт)', before === after, `${tag}: длина до=${before?.length}, после=${after?.length}`, dateBefore);
    this.verify('RELOAD_VIRTUAL_DATE_KEPT', 'Виртуальная дата сохраняется после перезагрузки', (await this.today()) === dateBefore, `${tag}`, dateBefore);
  }
}

export {formatDateShort};

export async function confirmContinuous3k(s: Session): Promise<{ok: boolean; note: string}> {
  const p = s.page;
  const today = await s.today();
  await p.goto('/profile');
  const btn = p.getByRole('button', {name: 'Подтвердить непрерывный бег на 3 км'});
  if ((await btn.count()) === 0) return {ok: false, note: 'кнопка подтверждения недоступна в профиле'};
  await btn.click();
  await expect(p).toHaveURL(/\/profile\/continuous-3k$/);
  await p.getByRole('checkbox').nth(0).check();
  await p.getByRole('checkbox').nth(1).check();
  await s.shot('continuous-3k-confirmation');
  const save = p.getByRole('button', {name: 'Подтвердить и обновить план'});
  if (await save.isDisabled()) return {ok: false, note: 'кнопка заблокирована (подтверждение сейчас недоступно)'};
  await save.click();
  await p.waitForTimeout(200);
  s.journal.counters.uiTransitions += 1;
  const ok = new URL(p.url()).pathname === '/plan';
  const state = await s.engine();
  s.journal.row({date: today, week: s.week(today), day_index: s.dayIndex(today), event: 'CONTINUOUS_3K_CONFIRMED', entered_result: 'вымышленное подтверждение: 3000 м без остановки, без симптомов',
    change_reason: 'снятие вводной лестницы бег/ходьба по правилам приложения', phase: state.decision.phase, safety: state.decision.safety});
  return {ok, note: ok ? 'принято' : (await p.locator('[role="alert"], .notice').first().innerText().catch(() => '')).replace(/\s+/g, ' ')};
}
