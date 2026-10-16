/**
 * Scenario director: walks one fictional athlete through a whole 8–12 week preparation, day by day,
 * entirely through the real UI. The sequence follows docs/accelerated-manual-testing.md and issue #23:
 * 2 normal weeks → schedule shift → one incomplete session → 3–4 skipped days → health limitation and
 * recovery → measured-result update → exam-date change → taper → final result.
 */
import {expect} from '@playwright/test';
import type {EngineState} from '../../src/models.ts';
import {deriveToday} from '../../web/src/application/uiState.ts';
import {formatDateShort, formatDateLong} from '../../web/src/application/format.ts';
import {taperDays} from '../../src/assessment.ts';
import {reservedMetres} from '../../src/weeklyLoad.ts';
import {Session, confirmContinuous3k} from './driver.ts';
import {addDaysIso, isSafetyHold} from './invariants.ts';
import {fmtSeconds, makeRng, planReport} from './model.ts';
import type {ExecutionMode, WorkoutLite} from './model.ts';
import type {ProfileFixture} from './profiles.ts';

export interface Directives {
  shiftWeek: number; partialWeek: number; skipWeek: number; skipDays: 3 | 4; healthWeek: number; tooHardWeek: number;
  confirm3kWeek: number | null; measureWeek: number; examWeek: number; examDelta: number;
}

export function directivesFor(p: ProfileFixture, index: number): Directives {
  return {
    shiftWeek: 2, partialWeek: 3, skipWeek: 4, skipDays: index % 2 === 0 ? 3 : 4, healthWeek: 5, tooHardWeek: 6,
    confirm3kWeek: p.answers.canRun3Km ? null : 6, measureWeek: 7, examWeek: 7,
    // keep the new date inside the 8–12 week window of the issue
    examDelta: p.weeks >= 12 ? -7 : p.weeks === 8 ? 7 : index % 2 === 0 ? -7 : 7,
  };
}

export interface LedgerEntry {w: WorkoutLite; disposition: 'PLANNED' | 'RECORDED' | 'SKIPPED'; evaluation?: string; mode?: string; reserved: number | null}

export interface CycleResult {
  ledger: Map<string, LedgerEntry>;
  finalSeconds: number | null;
  finalState: EngineState | null;
  observations: string[];
  daysWalked: number;
}

export async function runCycle(s: Session, profile: ProfileFixture, d: Directives): Promise<CycleResult> {
  const p = s.page;
  const rng = makeRng(profile.seed);
  const ledger = new Map<string, LedgerEntry>();
  const observations: string[] = [];
  const flags = {shift: false, partial: false, skipPhase: 'idle' as 'idle' | 'running' | 'done', skipRemaining: 0, skipStart: '', health: 'idle' as 'idle' | 'hold' | 'recovered', tooHard: false, confirm3k: false, measure: false, exam: false, planChecked: new Set<number>(), reloaded: new Set<number>(), refreshedToday: ''};
  let healthHoldDays = 0;
  let holdSkipBaseline = -1;
  const holdChecked = new Set<string>();
  let measuredFactor: number | null = null;
  let checkpointBlocked = false;
  let lastMeasured: number | null = profile.answers.resultTime === null ? null : parseTime(profile.answers.resultTime);
  const factors = [1.0, 1.0, 1.01, 1.02];
  const pickFactor = (): number => factors[Math.floor(rng() * factors.length)]!;
  let finalSeconds: number | null = null;
  let finalState: EngineState | null = null;
  let lastState: EngineState | null = null;
  let daysWalked = 0;
  let guard = 0;
  let finished = false;
  let firstWorkoutShot = false;
  let afterRecoveryChecked = false;

  await s.captureBaseline();
  await s.audit('after onboarding');
  await s.shot('today-after-onboarding');
  await p.goto('/plan'); await s.shot('plan-initial');

  const track = async (): Promise<EngineState> => {
    const st = await s.engine();
    lastState = st;
    for (const w of st.queue) {
      const entry = ledger.get(w.id);
      const reserved = reservedMetres(st, w);
      if (!entry) ledger.set(w.id, {w: w as unknown as WorkoutLite, disposition: 'PLANNED', reserved});
      else if (entry.disposition === 'PLANNED') { entry.w = w as unknown as WorkoutLite; entry.reserved = reserved; }
    }
    for (const id of st.skippedIds) { const e = ledger.get(id); if (e && e.disposition === 'PLANNED') e.disposition = 'SKIPPED'; }
    return st;
  };

  while (guard++ < 400) {
    let today = await s.today();
    let st = await track();
    if (st.finalResultRecorded) break;
    const wk = s.week(today);
    if (process.env.QA_VERBOSE) console.log(`[${profile.id}] ${new Date().toISOString().slice(11, 19)} ${today} wk${wk} queue=${st.queue.length} hist=${st.history.length} phase=${st.decision.phase}`);

    // ---------------- weekly checks (calendar of the Plan screen, reload integrity)
    if (!flags.planChecked.has(wk) && today <= st.profile.raceDate) {
      flags.planChecked.add(wk);
      await checkPlanScreen(s, st, today);
      if (wk % 2 === 0) { await s.reloadAndCompare(`week ${wk}`); }
    }

    // ---------------- inner loop: act until nothing is left for today
    for (let inner = 0; inner < 12; inner += 1) {
      today = await s.today();
      st = await track();
      const view = deriveToday(st, today);
      const week = s.week(today);

      if (view.state === 'COMPLETED') break;

      // final / awaiting final
      if (view.state === 'RACE_DAY' || view.state === 'AWAITING_FINAL_RESULT') {
        await s.audit('race day');
        await s.shot(view.state === 'RACE_DAY' ? 'race-day' : 'awaiting-final');
        const secs = lastMeasured !== null ? lastMeasured : 1170;
        const res = await s.finalResult(secs);
        finalSeconds = secs; finalState = null; void res; finished = true;
        break;
      }

      // ---------------- skip-days directive (no input at all for N days)
      if (flags.skipPhase === 'running') {
        if (flags.skipRemaining > 0) break; // nothing recorded; advance below
        // resolve phase
        flags.skipPhase = 'done';
        await resolveSkippedDays(s, st, flags.skipStart, today);
        continue;
      }
      if (flags.skipPhase === 'idle' && week >= d.skipWeek && flags.partial && view.state !== 'PENDING_RESULT' && !isSafetyHold(st) && !(st.queue.length === 0)) {
        flags.skipPhase = 'running'; flags.skipRemaining = d.skipDays; flags.skipStart = today;
        // pre-skip peak for the "no catch-up" check
        s.journal.row({date: today, week, day_index: s.dayIndex(today), event: 'SKIP_DAYS_BEGIN', change_reason: `пропуск ${d.skipDays} дн. подряд без ввода результатов`, phase: st.decision.phase, safety: st.decision.safety});
        break;
      }

      if (view.state === 'PENDING_RESULT') {
        const onlyRest = view.pendingWorkouts.every((w) => w.type === 'REST');
        s.verify(onlyRest ? 'REST_PLACEHOLDER_NOT_PENDING' : 'NO_UNEXPECTED_PENDING',
          onlyRest ? 'Служебные дни отдыха (REST) при остановке нагрузки не превращаются в «незакрытые тренировки»' : 'Неожиданных «незакрытых» тренировок вне сценария пропусков нет',
          false, `${today}: safety=${st.decision.safety} diagnosticHold=${st.diagnosticHold}; незакрыто: ${view.pendingWorkouts.map((w) => `${w.scheduledDate}:${w.type}`).join(',')}`, today);
        if (onlyRest) await s.shot('pending-rest-placeholder-under-hold');
        await s.skipPendingOldest();
        continue;
      }

      // ---------------- hold handling (health scenario)
      if (view.state === 'TRAINING_HOLD') {
        if (!holdChecked.has(today)) {
          // DEF-001 regression guard: on every hold day Today shows the hold card with the recheck button, never a
          // "previous workout is not closed" card, and no skips are manufactured for the REST service days.
          holdChecked.add(today);
          await p.goto('/today');
          const body = await p.locator('.screen').first().innerText();
          s.verify('HOLD_TODAY_SHOWS_RECHECK_NOT_PENDING', 'Во время паузы «Сегодня» показывает карточку паузы с повторной проверкой, а не «Предыдущая тренировка ещё не закрыта»',
            !body.includes('Предыдущая тренировка ещё не закрыта') && (await p.getByRole('button', {name: 'Повторно проверить состояние'}).count()) > 0, `${today}: ${body.replace(/\s+/g, ' ').slice(0, 140)}`, today);
          if (holdSkipBaseline >= 0) s.verify('HOLD_NO_FICTITIOUS_SKIPS', 'Дни отдыха во время паузы не создают пропусков', st.skippedWorkouts.length === holdSkipBaseline, `${today}: пропусков ${st.skippedWorkouts.length}, до паузы ${holdSkipBaseline}`, today);
        }
        if (flags.health === 'hold') {
          if (healthHoldDays < 3) break; // wait 3 virtual days with symptoms present, nothing may be assigned
          await recoverFromHold(s, st, today);
          flags.health = 'recovered';
          healthHoldDays = 0;
          afterRecoveryChecked = false;
          continue;
        }
        // unexpected hold (e.g. engine-triggered): log and perform the documented explicit recheck
        s.journal.row({date: today, week, day_index: s.dayIndex(today), event: 'UNPLANNED_HOLD', change_reason: `safety=${st.decision.safety} diagnosticHold=${st.diagnosticHold} relatedYellow=${st.relatedYellow}`, phase: st.decision.phase, safety: st.decision.safety});
        observations.push(`${today}: непредвиденная остановка (safety=${st.decision.safety}, diagnosticHold=${st.diagnosticHold}, relatedYellow=${st.relatedYellow}) после действий сценария`);
        if (healthHoldDays < 1) { healthHoldDays += 1; break; }
        const r = await s.recheckSafety({healthy: true, clearance: true});
        healthHoldDays = 0;
        if (!r.saved || r.stillHold) { observations.push(`${today}: повторная проверка не сняла ограничение (${r.note})`); break; }
        continue;
      }

      // ---------------- confirm 3 km (novice)
      if (d.confirm3kWeek !== null && !flags.confirm3k && week >= d.confirm3kWeek && !isSafetyHold(st) && view.pendingWorkouts.length === 0) {
        flags.confirm3k = true;
        checkpointBlocked = false; // a confirmed 3 km may change whether the checkpoint is accepted
        const r = await confirmContinuous3k(s);
        observations.push(`${today}: подтверждение непрерывных 3 км → ${r.ok ? 'принято' : 'не принято: ' + r.note}`);
        s.verify('NOVICE_CONFIRM_3K_ACCEPTED', 'Новичок, выполнивший условия, может подтвердить непрерывные 3 км', r.ok, r.note, today);
        continue;
      }

      // ---------------- exam-date change
      if (!flags.exam && week >= d.examWeek) {
        flags.exam = true;
        await examDateChange(s, st, today, d.examDelta);
        continue;
      }

      // ---------------- measured result update
      const needsCheckpoint = view.state === 'CHECKPOINT_REQUIRED' || view.state === 'PERFORMANCE_REVIEW';
      if (!checkpointBlocked && (needsCheckpoint || (!flags.measure && week >= d.measureWeek && flags.skipPhase === 'done'))) {
        flags.measure = true;
        measuredFactor = pickFactor();
        const fallback = 1170; // 19:30, fictional slow first measurement (not an improvement)
        const secs = Math.round((lastMeasured ?? fallback) * (lastMeasured === null ? 1 : measuredFactor));
        const res = await s.checkpoint(secs, needsCheckpoint ? 'today' : 'direct');
        if (res.ok) lastMeasured = secs;
        else { checkpointBlocked = true; observations.push(`${today}: контрольный результат ${fmtSeconds(secs)} не принят: ${res.outcome.slice(0, 160)}`); }
        continue;
      }

      // ---------------- shift directive: move one future session (try up to 3 different sessions)
      if (!flags.shift && week >= d.shiftWeek) {
        const targets = st.queue.filter((w) => w.scheduledDate > today && w.movable && w.type !== 'REST').slice(0, 3);
        if (targets.length > 0) {
          flags.shift = true;
          let accepted = false;
          const allRejections: string[] = [];
          for (const target of targets) {
            const res = await s.moveWorkout(target as unknown as WorkoutLite);
            observations.push(`${today}: перенос ${target.type} ${target.scheduledDate} → ${res.moved ?? 'не удалось'}; отказов движка: ${res.rejected.length}${res.rejected.length ? ' (' + res.rejected.map((r) => r.date + ': ' + r.text.slice(0, 80)).join(' | ') + ')' : ''}`);
            s.verify('MOVE_REJECTIONS_EXPLAINED', 'Каждый отказ движка при переносе объяснён пользователю на экране', res.rejected.every((r) => r.text.length > 10), res.rejected.map((r) => `${r.date}: «${r.text.slice(0, 100)}»`).join(' | ') || 'отказов нет', today);
            allRejections.push(...res.rejected.map((r) => r.text));
            if (res.moved !== null) { accepted = true; break; }
          }
          // Behaviour model: a schedule shift is either accepted, or refused with a reason the guards define
          // (weekly-load reservation, one session per day, order). A silent or unexplained refusal is a failure.
          const reasonRx = /нагрузк|уже есть тренировк|неделю|семь дней|порядк|недоступн|нельзя|ограничен/i;
          s.verify('SHIFT_ACCEPTED_OR_EXPLAINED', 'Смена графика: перенос принят либо отклонён с понятной причиной (нагрузка недели / день занят / порядок)', accepted || (allRejections.length > 0 && allRejections.every((t) => reasonRx.test(t))), `проверено сессий: ${targets.length}; принят: ${accepted}; отказов: ${allRejections.length}`, today);
          await s.audit('after move');
          continue;
        }
      }

      // ---------------- empty queue → refresh
      if (view.state === 'EMPTY_QUEUE' && flags.refreshedToday !== today) {
        flags.refreshedToday = today;
        await p.goto('/today');
        await s.shot('empty-queue');
        await p.getByRole('button', {name: 'Обновить план'}).click();
        await s.tick();
        const after = await s.engine();
        observations.push(`${today}: «Обновить план» при пустой очереди → в очереди ${after.queue.length}`);
        continue;
      }

      // ---------------- today's workout
      if (view.workout !== null) {
        const w = view.workout as unknown as WorkoutLite;
        let mode: ExecutionMode = 'ON_PLAN';
        let tag = '';
        if (!flags.partial && week >= d.partialWeek) { mode = 'PARTIAL'; flags.partial = true; tag = 'partial'; }
        else if (flags.health === 'idle' && week >= d.healthWeek && flags.skipPhase === 'done') { mode = 'SYMPTOMS'; tag = 'health'; }
        else if (!flags.tooHard && week >= d.tooHardWeek && flags.health === 'recovered') { mode = 'TOO_HARD'; flags.tooHard = true; tag = 'toohard'; }
        const report = planReport(w, mode, rng);
        const shotTag = !firstWorkoutShot ? 'first-session' : tag ? tag : undefined;
        if (!firstWorkoutShot) firstWorkoutShot = true;
        await s.audit(`before ${w.type} ${today}`);
        const res = await s.recordWorkout(w, report, {via: 'card', shot: shotTag, doubleClick: tag === 'partial' || s.journal.counters.workoutsRecorded % 5 === 2});
        ledger.set(w.id, {w, disposition: 'RECORDED', evaluation: res.evaluation, mode, reserved: ledger.get(w.id)?.reserved ?? null});
        const after = await s.engine();
        if (mode === 'SYMPTOMS') {
          flags.health = 'hold'; healthHoldDays = 0; holdSkipBaseline = after.skippedWorkouts.length;
          s.verify('HEALTH_STOPS_LOAD', 'Сообщение о боли со сменой техники останавливает обычные тренировки (STOP/HOLD)', isSafetyHold(after), `safety=${after.decision.safety}, diagnosticHold=${after.diagnosticHold}, relatedYellow=${after.relatedYellow}`, today);
          s.verify('HEALTH_NO_RUNS_QUEUED', 'После симптомов в очереди нет беговых тренировок', after.queue.filter((q) => q.type !== 'REST').length === 0, `в очереди: ${after.queue.map((q) => q.type + ' ' + q.scheduledDate).join(', ') || 'пусто'}`, today);
          await p.goto('/today'); await s.shot('hold-today');
        }
        continue;
      }

      break; // nothing more to do today
    }

    if (finished) break;
    // ---------------- end of the day
    today = await s.today();
    st = await track();
    if (st.finalResultRecorded) break;
    if (!(await s.rawCycle())) break;
    await s.audit(`end of ${today}`, {skipUi: false});
    // post-recovery observation
    if (flags.health === 'recovered' && !afterRecoveryChecked) {
      const first = st.queue.find((w) => w.scheduledDate >= today);
      if (first) { afterRecoveryChecked = true; observations.push(`после снятия ограничения первая назначенная тренировка: ${first.type} ${first.scheduledDate}, фаза ${st.decision.phase}`); }
    }
    if (flags.skipPhase === 'running' && flags.skipRemaining > 0) flags.skipRemaining -= 1;
    if (flags.health === 'hold') healthHoldDays += 1;
    const v = deriveToday(st, today);
    if (v.state === 'COMPLETED') break;
    if (today > st.profile.raceDate + '' && v.state !== 'AWAITING_FINAL_RESULT') break;
    await s.advance(1);
    daysWalked += 1;
  }

  finalState = lastState;
  return {ledger, finalSeconds, finalState, observations, daysWalked};
}

function parseTime(t: string): number { const [m, sec] = t.split(':').map(Number); return m! * 60 + sec!; }


async function checkPlanScreen(s: Session, st: EngineState, today: string): Promise<void> {
  const p = s.page;
  await p.goto('/plan');
  const items = p.locator('.timeline__item');
  await expect(p.getByTestId('test-date')).toHaveAttribute('dateTime', today);
  const dates = await p.locator('.timeline__date').allInnerTexts();
  const expected = st.queue.map((w) => formatDateShort(w.scheduledDate));
  s.verify('CALENDAR_PLAN_DATES', 'Плановые даты на экране «План» совпадают с очередью движка (формат, порядок, число)', JSON.stringify(dates) === JSON.stringify(expected),
    `на экране: ${dates.join(', ') || '—'}; ожидалось: ${expected.join(', ') || '—'}; элементов=${await items.count()}`, today);
  const taperStart = addDaysIso(st.profile.raceDate, -taperDays(st.decision.capacity, st.decision.quality));
  const bodyText = await p.locator('.screen').first().innerText();
  s.verify('CALENDAR_TAPER_AND_RACE_DATE', 'Дата начала подводки и дата старта на экране «План» соответствуют данным движка', bodyText.includes(formatDateLong(taperStart)) && bodyText.includes(formatDateLong(st.profile.raceDate)), `taper=${taperStart}, race=${st.profile.raceDate}`, today);
}

async function resolveSkippedDays(s: Session, st: EngineState, skipStart: string, today: string): Promise<void> {
  const p = s.page;
  const pending = st.queue.filter((w) => w.scheduledDate < today);
  s.journal.row({date: today, week: s.week(today), day_index: s.dayIndex(today), event: 'SKIP_DAYS_END', change_reason: `сегодня ${today}; пропущено с ${skipStart}; незакрытых тренировок: ${pending.length}`, phase: st.decision.phase, safety: st.decision.safety});
  if (pending.length === 0) { s.verify('SKIP_DAYS_HAD_PENDING', 'Во время пропуска дней есть что закрывать (сценарий содержательный)', false, `пропуск с ${skipStart} до ${today} не затронул ни одной тренировки`, today); return; }
  await p.goto('/today');
  await expect(p.getByText('Предыдущая тренировка ещё не закрыта')).toBeVisible();
  await s.shot('pending-after-skipped-days');
  // fast-forward must not have credited anything
  s.verify('SKIP_DAYS_NO_AUTOCREDIT', 'Дни без ввода не засчитываются автоматически: история не выросла', st.history.length === (await s.engine()).history.length, `history=${st.history.length}`, today);

  // expected impossible transitions while an older session is open
  const oldest = pending[0]!;
  await p.goto(`/workout/${oldest.id}/move`);
  const blocked = await p.getByText('Эту тренировку нельзя перенести').isVisible().catch(() => false);
  s.verify('BLOCK_MOVE_OVERDUE', 'Просроченную тренировку нельзя перенести (ожидаемая блокировка INV-1)', blocked, oldest.id, today);
  if (blocked) { s.journal.counters.expectedBlocks += 1; await s.shot('move-overdue-blocked'); }
  if (pending.length >= 2) {
    const newest = pending[pending.length - 1]!;
    const before = await s.engine();
    await p.goto(`/workout/${newest.id}/result`);
    await p.getByRole('radio', {name: 'Нет, всё нормально'}).click();
    await p.locator('[aria-labelledby="sessionRpe-label"] .scale__option').filter({hasText: /^3$/}).click();
    await p.getByRole('button', {name: 'Сохранить результат'}).click();
    const asIs = p.getByRole('button', {name: 'Отправить как есть'});
    if (await asIs.isVisible().catch(() => false)) await asIs.click();
    await p.waitForTimeout(250);
    const after = await s.engine();
    const stillOnForm = /\/result$/.test(new URL(p.url()).pathname);
    s.verify('BLOCK_OUT_OF_ORDER', 'Нельзя закрыть более позднюю тренировку, пока открыта более ранняя (ожидаемая блокировка)', stillOnForm && after.history.length === before.history.length, `url=${p.url()}, history ${before.history.length}→${after.history.length}`, today);
    if (stillOnForm) { s.journal.counters.expectedBlocks += 1; await s.shot('out-of-order-blocked'); }
  }
  // no plan refresh is possible while pending exists (plan button absent)
  await p.goto('/plan');
  s.verify('PLAN_REFRESH_HIDDEN_WHILE_PENDING', 'Пока есть незакрытая тренировка, кнопки «Обновить план» нет', (await p.getByRole('button', {name: 'Обновить план'}).count()) === 0, '', today);
  // resolve oldest first
  for (let i = 0; i < pending.length; i += 1) await s.skipPendingOldest();
  await p.goto('/today');
  const refreshed = await s.engine();
  if (refreshed.queue.length === 0) {
    await s.shot('after-skips-empty-queue');
    if ((await p.getByRole('button', {name: 'Обновить план'}).count()) === 0) await p.goto('/plan'); // Today may show a checkpoint CTA instead
    await p.getByRole('button', {name: 'Обновить план'}).click();
    await s.tick();
  }
  const after = await s.engine();
  s.verify('PLAN_RESUMES_AFTER_SKIPS', 'После закрытия пропусков план продолжается (в очереди есть назначения)', after.queue.length > 0 || deriveToday(after, today).state === 'RACE_DAY', `очередь: ${after.queue.map((w) => w.type + ' ' + w.scheduledDate).join(', ')}`, today);
  // no catch-up: the rolling-week reservation after the skips never exceeds the budget (INV is checked by audit)
  await s.audit('after skip resolution');
}

async function recoverFromHold(s: Session, st: EngineState, today: string): Promise<void> {
  const p = s.page;
  const week = s.week(today);
  await p.goto('/today');
  await expect(p.getByText('Обычные тренировки приостановлены')).toBeVisible();
  // expected impossible transitions
  const noClearance = await s.recheckSafety({healthy: true, clearance: false});
  s.verify('BLOCK_RECHECK_WITHOUT_CONFIRMATION', 'Без подтверждения оценки состояния повторная проверка недоступна (ожидаемая блокировка)', noClearance.saved === false, noClearance.note, today);
  if (!noClearance.saved) s.journal.counters.expectedBlocks += 1;
  const stillSick = await s.recheckSafety({healthy: false, clearance: true});
  const afterSick = await s.engine();
  s.verify('RECHECK_WITH_SYMPTOMS_KEEPS_HOLD', 'Повторная проверка с сохраняющимся стоп-симптомом не снимает ограничение (ожидаемая блокировка)', stillSick.saved && isSafetyHold(afterSick) && afterSick.queue.filter((w) => w.type !== 'REST').length === 0, `safety=${afterSick.decision.safety}, hold=${isSafetyHold(afterSick)}, в очереди ${afterSick.queue.length}`, today);
  if (stillSick.saved) s.journal.counters.expectedBlocks += 1;
  const ok = await s.recheckSafety({healthy: true, clearance: true});
  const after = await s.engine();
  s.verify('RECOVERY_LIFTS_HOLD_WITH_EXPLICIT_CONFIRMATION', 'После явного подтверждения и ответа «жалоб нет» ограничение снимается', ok.saved && !isSafetyHold(after), `${ok.note}; safety=${after.decision.safety}, diagnosticHold=${after.diagnosticHold}, relatedYellow=${after.relatedYellow}, phase=${after.decision.phase}`, today);
  s.journal.row({date: today, week, day_index: s.dayIndex(today), event: 'SAFETY_RECHECK_RECOVERY', entered_result: 'жалоб нет + явное подтверждение оценки состояния (вымышленное)', change_reason: `после RED; фаза ${after.decision.phase}`, phase: after.decision.phase, safety: after.decision.safety, warnings: after.decision.reasons.join(',')});
  await p.goto('/today'); await s.shot('after-recovery-today');
  await s.audit('after recovery');
  void st;
}

async function examDateChange(s: Session, st: EngineState, today: string, delta: number): Promise<void> {
  const p = s.page;
  const oldRace = st.profile.raceDate;
  const before = await s.rawCycle();
  // expected impossible change: a date in the past must be refused and nothing written
  const bad = await s.changeParameters(null, addDaysIso(today, -1));
  const afterBad = await s.rawCycle();
  s.verify('BLOCK_EXAM_DATE_IN_PAST', 'Дата экзамена в прошлом отклоняется, состояние не меняется (ожидаемая блокировка)', !bad.ok && before === afterBad, `ответ: ${bad.error.slice(0, 160)}`, today);
  if (!bad.ok) { s.journal.counters.expectedBlocks += 1; await s.shot('exam-date-past-rejected'); }
  const newDate = addDaysIso(oldRace, delta);
  const res = await s.changeParameters(null, newDate);
  const after = await s.engine();
  const env = await s.envelope();
  s.verify('EXAM_DATE_CHANGED', 'Допустимая смена даты экзамена принята и сохранена', res.ok && after.profile.raceDate === newDate, `${oldRace} → ${after.profile.raceDate}; ${res.error}`, today);
  s.verify('EXAM_DATE_BASELINE_IMMUTABLE', 'Исходная дата старта цикла (baseline) не изменилась', env.cycle.baseline.raceDate === oldRace || env.cycle.baseline.raceDate === s.profile.answers.targetTime || env.cycle.baseline.raceDate === addDaysIso(s.startDate, s.profile.weeks * 7), `baseline=${env.cycle.baseline.raceDate}`, today);
  s.verify('EXAM_DATE_EVENT_LOGGED', 'Смена параметров записана в журнал событий', env.events.some((e) => e.type === 'TRAINING_PARAMETERS_CHANGED'), env.events.map((e) => e.type).join(','), today);
  s.verify('EXAM_DATE_NO_SESSIONS_AFTER', 'После смены даты в очереди нет тренировок в день старта и позже', after.queue.every((w) => w.scheduledDate < after.profile.raceDate), after.queue.map((w) => w.scheduledDate).join(','), today);
  s.journal.row({date: today, week: s.week(today), day_index: s.dayIndex(today), event: 'EXAM_DATE_CHANGED', entered_result: `дата старта ${oldRace} → ${after.profile.raceDate} (${delta > 0 ? '+' : ''}${delta} дн.)`, change_reason: 'изменение даты экзамена пользователем', phase: after.decision.phase, safety: after.decision.safety});
  await p.goto('/plan'); await s.shot('plan-after-exam-date-change');
}
