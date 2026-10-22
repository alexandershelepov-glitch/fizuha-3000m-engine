import '../../calendar.css';
import {useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {addDays, formatDateLong, formatTime, daysBetween} from '../../application/format.ts';
import {forecastCycle, taperDaysFor} from '../../application/engineGateway.ts';
import type {EngineState, ForecastResult} from '../../application/engineGateway.ts';
import {previewScheduledMove} from '../../application/workoutSchedule.ts';
import type {AppStateV1} from '../../application/appState.ts';
import type {KeyValueStorage} from '../../application/storage.ts';
import {calendarDay, forecastByDate, monthDates, mondayOf, periodWeeks, weekDates, weekSummary} from '../../application/calendarModel.ts';
import type {CalendarDay} from '../../application/calendarModel.ts';
import {actionAvailability, hasPendingResults} from '../../application/invariants.ts';
import {isSafetyHold, needsPerformanceReview} from '../../application/uiState.ts';
import {workoutMainDose, workoutIntervalsText, workoutRest, workoutTitle, workoutVolume, workoutPaceRange, workoutSpeedRange, workoutRpe} from '../display.ts';
import {effortCueText, mainModeText, phaseText, phaseWhy, workoutGoalText} from '../copy/values.ts';
import type {Workout} from '../../application/engineGateway.ts';
import {common, nav, plan, today as todayText} from '../copy/text.ts';
import {copyForError} from '../copy/errors.ts';
import {Button} from '../components/Button.tsx';
import {Card, KeyValue, Notice} from '../components/Layout.tsx';
import type {Route} from '../../app/routes.ts';
import type {MoveSubmitOutcome} from './MoveWorkout.tsx';

interface Props {
  readonly engineState: EngineState;
  readonly appState?: AppStateV1;
  readonly storage?: KeyValueStorage | null;
  readonly today: string;
  readonly onNavigate: (route: Route) => void;
  readonly onRefreshPlan: () => void;
  readonly onMove?: (workoutId: string, date: string) => MoveSubmitOutcome;
  readonly refreshing: boolean;
}

type Mode = 'week' | 'month' | 'period';
const WEEKDAY = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
const BUSY_PREFIX = 'fizuha.calendar.unavailable.';
/** Per-cycle calendar view. Absent for a freshly created cycle: the first open shows the whole period. */
const MODE_PREFIX = 'fizuha.calendar.mode.';
function readMode(storage: KeyValueStorage | null, cycleId: string | null): Mode {
  if (!storage || !cycleId) return 'period';
  try {
    const raw = storage.getItem(MODE_PREFIX + cycleId);
    return raw === 'week' || raw === 'month' || raw === 'period' ? raw : 'period';
  } catch { return 'period'; }
}
/** Every parameter the engine prescribed, read-only; the same fields as the workout card. */
function WorkoutParams({workout}: {readonly workout: Workout}): ReactNode {
  const intervals = workoutIntervalsText(workout);
  const rest = workoutRest(workout);
  const pace = workoutPaceRange(workout);
  const speed = workoutSpeedRange(workout);
  return <div className="calendar-params" aria-label="Параметры тренировки">
    <KeyValue label={todayText.workout.task} value={workoutGoalText[workout.goal]} />
    <KeyValue label={todayText.workout.warmup} value={workout.warmupMinutes > 0 ? `${workout.warmupMinutes} мин` : 'не предусмотрена'} />
    <KeyValue label={todayText.workout.volume} value={workoutMainDose(workout)} />
    <KeyValue label={todayText.workout.mode} value={mainModeText[workout.main.mode]} />
    {intervals ? <KeyValue label={todayText.workout.intervals} value={intervals} /> : null}
    {rest ? <KeyValue label={todayText.workout.rest} value={rest.replace('отдых ', '')} /> : null}
    {pace ? <KeyValue label={todayText.workout.pace} value={pace} /> : null}
    {speed ? <KeyValue label="Дорожка" value={speed} /> : null}
    <KeyValue label={todayText.workout.rpe} value={`${workoutRpe(workout)} из 10`} />
    <KeyValue label={todayText.workout.cooldown} value={workout.cooldownMinutes > 0 ? `${workout.cooldownMinutes} мин` : 'не предусмотрена'} />
    {workout.effortCues.length > 0 ? <KeyValue label={todayText.workout.cues} value={workout.effortCues.map(cue => effortCueText[cue]).join(' · ')} /> : null}
  </div>;
}
function readBusy(storage: KeyValueStorage | null, cycleId: string): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(BUSY_PREFIX + cycleId);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((v): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)))].slice(0, 366)
      : [];
  } catch { return []; } // A corrupt optional preference never damages the training cycle.
}
function adjacentMonth(date: string, step: number): string {
  const d = new Date(date.slice(0, 7) + '-01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + step);
  return d.toISOString().slice(0, 10);
}
function prettyMonth(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(date + 'T00:00:00Z'));
}
function km(meters: number): string { return (meters / 1000).toFixed(1).replace('.', ',') + ' км'; }
function dayName(day: CalendarDay, busy: boolean): string {
  if (day.status === 'completed') return 'Выполнено';
  if (day.status === 'skipped') return 'Пропущено';
  if (day.status === 'moved') return 'Перенесено';
  if (day.status === 'planned') return 'Назначено';
  if (day.status === 'forecast') return 'Предварительно';
  if (day.status === 'control') return 'Контрольная точка';
  if (day.status === 'unresolved') return 'Требует уточнения';
  if (day.status === 'unformed') return 'План ещё не сформирован';
  if (day.status === 'race') return 'День норматива';
  return busy ? 'Занят рабочей сменой' : 'Отдых';
}

export function Plan({engineState, appState, storage, today, onNavigate, onRefreshPlan, onMove, refreshing}: Props): ReactNode {
  const {profile, decision, queue} = engineState;
  const cycleId = appState?.cycle.cycleId ?? null;
  const [mode, setModeState] = useState<Mode>(() => readMode(storage ?? null, cycleId));
  const setMode = (next: Mode): void => {
    setModeState(next);
    try { if (storage && cycleId) storage.setItem(MODE_PREFIX + cycleId, next); } catch { /* the view choice is optional */ }
  };
  const [viewDate, setViewDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [moving, setMoving] = useState(false);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyDates, setBusyDates] = useState<string[]>(() => cycleId ? readBusy(storage ?? null, cycleId) : []);
  const [busyError, setBusyError] = useState(false);
  const busySet = useMemo(() => new Set(busyDates), [busyDates]);
  const movedIds = useMemo(() => new Set([
    ...(appState?.events.filter(event => event.type === 'WORKOUT_MOVED').map(event => event.workoutId) ?? []),
    ...engineState.movedWorkouts.map(item => item.id),
  ]), [appState?.events, engineState.movedWorkouts]);
  /**
   * Full-cycle forecast, recomputed from the confirmed engine state on every real change. The clock
   * stays at engineState.asOf: viewing the calendar never advances the engine, never writes off
   * past-due sessions and never records anything. A broken forecast degrades to an honest
   * "unformed" calendar instead of a crash.
   */
  const forecast: ForecastResult | null = useMemo(() => {
    try {
      return forecastCycle(engineState, {mode: 'CONDITIONAL', asOf: engineState.asOf});
    } catch {
      return null;
    }
  }, [engineState]);
  const forecastDays = useMemo(() => forecastByDate(forecast?.entries ?? []), [forecast]);
  const weekBlocks = useMemo(() => {
    if (mode !== 'period') return null;
    return periodWeeks(engineState).map(monday =>
      weekDates(monday).map(date => calendarDay(engineState, today, date, movedIds, forecastDays)));
  }, [mode, engineState, today, movedIds, forecastDays]);
  const dates = mode === 'week' ? weekDates(viewDate) : mode === 'month' ? monthDates(viewDate) : [];
  const days: CalendarDay[] = weekBlocks ? [] : dates.map(date => calendarDay(engineState, today, date, movedIds, forecastDays));
  const selected = calendarDay(engineState, today, selectedDate, movedIds, forecastDays);
  const summaryDate = mode === 'week' ? viewDate : selectedDate;
  const summary = weekSummary(weekDates(summaryDate).map(date => calendarDay(engineState, today, date, movedIds, forecastDays)));
  const pending = hasPendingResults(engineState, today);
  const todayWorkout = queue.find(item => item.scheduledDate === today && item.type !== 'REST') ?? null;
  const hold = isSafetyHold(engineState);
  const taperStart = addDays(profile.raceDate, -taperDaysFor(decision.capacity, decision.quality));
  const canMove = onMove !== undefined && selected.workout !== null && selected.status !== 'completed' &&
    selected.status !== 'skipped' && selected.status !== 'forecast' && selected.status !== 'control' && selected.status !== 'unresolved' &&
    selected.workout.movable &&
    actionAvailability(engineState, selected.workout.id, today, 'MOVE') === 'AVAILABLE';
  const moveCandidates = selected.workout && canMove
    ? Array.from({length: 7}, (_, i) => addDays(engineState.asOf, i))
      .filter(date => date !== selected.workout!.scheduledDate && date >= today && date < profile.raceDate && !busySet.has(date))
      .map(date => {
        const verdict = previewScheduledMove(engineState, selected.workout!.id, date, today);
        const reason = verdict.ok ? '' : copyForError(verdict.error).text(verdict.error.params);
        return {date, allowed: verdict.ok, reason};
      })
    : [];
  const allowedCandidates = moveCandidates.filter(item => item.allowed);
  const toggleBusy = (): void => {
    const next = busySet.has(selectedDate) ? busyDates.filter(date => date !== selectedDate)
      : [...busyDates, selectedDate].slice(-366);
    try {
      if (!storage || !cycleId) throw new Error('storage unavailable');
      storage.setItem(BUSY_PREFIX + cycleId, JSON.stringify(next));
      setBusyDates(next);
      setBusyError(false);
      setNotice('Отметка сохранена. Существующие назначения не перенесены.');
    } catch {
      setBusyError(true);
    }
  };
  const chooseDate = (date: string): void => {
    setSelectedDate(date);
    setMoving(false);
    setMoveTo(null);
    setMoveError(null);
    setNotice(null);
  };
  const changePeriod = (direction: number): void => {
    if (mode === 'period') return; // Весь период показан целиком; листать нечего.
    const next = mode === 'week' ? addDays(mondayOf(viewDate), direction * 7) : adjacentMonth(viewDate, direction);
    setViewDate(next);
    chooseDate(next);
  };
  const performMove = (): void => {
    if (!onMove || !selected.workout || !moveTo || !moveCandidates.some(item => item.date === moveTo && item.allowed)) return;
    const outcome = onMove(selected.workout.id, moveTo);
    if (outcome.ok) {
      setMoving(false);
      setViewDate(moveTo);
      setSelectedDate(moveTo);
      setMoveTo(null);
      setMoveError(null);
      setNotice('Тренировка перенесена. Новый план проверен движком.');
    } else {
      const e = outcome.error ?? {code: 'UNKNOWN', params: {}};
      const copy = copyForError({code: e.code as never, params: e.params ?? {}, fromEngine: true, retry: false});
      setMoveError(copy.text(e.params ?? {}));
    }
  };

  const dayCell = (day: CalendarDay, index: number): ReactNode => {
    const label = dayName(day, busySet.has(day.date));
    const outside = mode === 'month' && day.date.slice(0, 7) !== viewDate.slice(0, 7);
    const preliminary = day.status === 'forecast' || day.status === 'control' || day.status === 'unresolved';
    return <button type="button" key={day.date} className={`calendar-day calendar-day--${day.status}${day.workout?.countsAsQuality ? ' calendar-day--quality' : ''}${day.date === today ? ' calendar-day--today' : ''}${selectedDate === day.date ? ' calendar-day--selected' : ''}${outside ? ' calendar-day--outside' : ''}${preliminary ? ' calendar-day--preliminary' : ''}`}
      aria-pressed={day.date === selectedDate}
      aria-label={`${formatDateLong(day.date)}: ${day.workout && day.status !== 'unresolved' ? workoutTitle(day.workout) + ', ' : ''}${label}${busySet.has(day.date) ? ', рабочая смена или занят' : ''}`}
      onClick={() => chooseDate(day.date)}>
      <span className="calendar-day-top"><small>{WEEKDAY[index % 7]}</small><strong>{Number(day.date.slice(-2))}</strong></span>
      <span className="calendar-day-label">{day.status === 'unresolved' ? 'Требует уточнения' : day.workout ? workoutTitle(day.workout) : label}</span>
      {day.workout && day.status !== 'unresolved' ? <span className="calendar-day-volume">{workoutVolume(day.workout)}</span> : null}
      <span className="calendar-day-status">{day.date === today ? 'Сегодня · ' + label : day.workout ? label : (day.status === 'unformed' ? 'Ещё нет назначений' : '')}</span>
      {preliminary ? <span className="calendar-day-badge" aria-hidden="true">{day.status === 'control' ? 'Контроль' : day.status === 'unresolved' ? '?' : 'План*'}</span> : null}
      {busySet.has(day.date) ? <span className="calendar-day-busy">Смена / занят</span> : null}
    </button>;
  };

  return (
    <div className="screen calendar-screen">
      <aside className="calendar-sidebar" aria-label="Разделы приложения">
        <strong className="calendar-brand">↗ ФИЗУХА</strong>
        <button type="button" onClick={() => onNavigate({name:'TODAY'})}>Сегодня</button>
        <button type="button" aria-current="page">План</button>
        <button type="button" onClick={() => onNavigate({name:'HISTORY'})}>История</button>
        <button type="button" onClick={() => onNavigate({name:'PROFILE'})}>Профиль</button>
      </aside>
      <div className="calendar-main">
        <header className="calendar-header">
          <div>
            <p className="calendar-eyebrow">ФИЗУХА · 3000 м</p>
            <h1>Календарь тренировок</h1>
            <p className="calendar-muted">{plan.currentPhase}: {needsPerformanceReview(engineState) ? todayText.performanceReview.title : phaseText[decision.phase].label}</p>
          </div>
          <div className="calendar-deadline">До норматива: {Math.max(0, daysBetween(today, profile.raceDate))} дн.</div>
        </header>

        {hold ? <Notice tone="warn" title={todayText.hold.title}>
          <p>{todayText.hold.text}</p>
          <Button onClick={() => onNavigate({name:'SAFETY_RECHECK'})}>{todayText.hold.recheck}</Button>
        </Notice> : null}
        {needsPerformanceReview(engineState) ? <Notice tone="info" title={todayText.performanceReview.title}>
          <p>{todayText.performanceReview.text}</p>
          <Button onClick={() => onNavigate({name:'CHECKPOINT'})}>{todayText.performanceReview.cta}</Button>
        </Notice> : null}
        {profile.canRun3Km && profile.performance === null ? <Notice tone="info" title="3 км без остановки — подтверждено">
          <p>Время на 3000 м пока неизвестно. Скоростные задания не назначаются без измеренного результата.</p>
          <Button variant="secondary" onClick={() => onNavigate({name:'CHECKPOINT'})}>Внести измеренный результат</Button>
        </Notice> : null}

        {todayWorkout ? <div className="calendar-today-action"><Button onClick={() => onNavigate({name:'WORKOUT', id: todayWorkout.id})}>{plan.openToday}</Button></div> : null}

        <section className="calendar-summary" aria-label="Итоги выбранной недели">
          <div className="calendar-summary-title"><strong>Итоги недели</strong><span>{formatDateLong(mondayOf(summaryDate))} — {formatDateLong(addDays(mondayOf(summaryDate), 6))}</span></div>
          <div className="calendar-stats">
            <div><strong>{summary.assigned}</strong><span>Назначено движком</span></div>
            <div><strong>{summary.completed}</strong><span>Выполнено</span></div>
            <div><strong>{summary.skipped}</strong><span>Пропущено</span></div>
            <div><strong>{km(summary.knownMainMeters)}</strong><span>Основная часть назначенных{summary.sessionsWithoutPrescribedMeters > 0 ? ' (не вся измерена в метрах)' : ''}</span></div>
            <div><strong>{summary.reportedMeters ? km(summary.reportedMeters) : 'Нет данных'}</strong><span>Фактически внесено{summary.sessionsWithoutReportedMeters > 0 ? ' (не все дистанции указаны)' : ''}</span></div>
          </div>
          {summary.preliminary > 0 || summary.unresolved > 0 ? <div className="calendar-stats calendar-stats--preliminary" aria-label="Предварительный план недели">
            <div><strong>{summary.preliminary}</strong><span>Предварительно (прогноз, ещё не назначено)</span></div>
            <div><strong>{km(summary.preliminaryMainMeters)}</strong><span>Прогнозный объём основной части{summary.preliminaryWithoutMeters > 0 ? ' (не весь измерен в метрах)' : ''}</span></div>
            {summary.unresolved > 0 ? <div><strong>{summary.unresolved}</strong><span>Требует уточнения</span></div> : null}
          </div> : null}
        </section>

        <div className="calendar-workspace">
          <section className="calendar-board" aria-label="Календарь тренировок">
            <div className="calendar-toolbar">
              <div className="calendar-period">
                {mode === 'period' ? <strong>{plan.fullPeriod}: {formatDateLong(engineState.cycleStartDate)} — {formatDateLong(profile.raceDate)}</strong> : <>
                  <button type="button" aria-label="Предыдущий период" onClick={() => changePeriod(-1)}>‹</button>
                  <strong>{mode === 'week' ? `${formatDateLong(mondayOf(viewDate))} — ${formatDateLong(addDays(mondayOf(viewDate), 6))}` : prettyMonth(viewDate)}</strong>
                  <button type="button" aria-label="Следующий период" onClick={() => changePeriod(1)}>›</button>
                </>}
              </div>
              <div className="calendar-mode" role="group" aria-label="Режим календаря">
                <button type="button" aria-pressed={mode === 'period'} onClick={() => setMode('period')}>{plan.fullPeriod}</button>
                <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>{plan.monthMode}</button>
                <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>{plan.weekMode}</button>
              </div>
            </div>
            {forecast === null ? <Notice tone="warn" title="Прогноз недоступен">Календарь показывает только назначения текущей недели. Обновите план позже.</Notice> : null}
            {forecast !== null && (forecast.windowViolations.length > 0 || forecast.engineErrors.length > 0) ? <Notice tone="warn" title="Прогноз рассчитан с предупреждениями">Часть будущих дней может отображаться неточно. Текущие назначения и история не затронуты.</Notice> : null}
            {mode === 'month' ? <div className="calendar-weekdays">{WEEKDAY.map(day => <span key={day}>{day}</span>)}</div> : null}
            {weekBlocks ? <div className="calendar-period-list" aria-label="Весь тренировочный период">
              {weekBlocks.map((block, blockIndex) => (
                <section className="calendar-week-block" key={block[0]!.date} aria-label={`Неделя ${blockIndex + 1}`}>
                  <h3 className="calendar-week-caption">Неделя {blockIndex + 1} · {formatDateLong(block[0]!.date)} — {formatDateLong(block[6]!.date)}</h3>
                  <div className="calendar-days calendar-days--week">
                    {block.map((day, index) => dayCell(day, index))}
                  </div>
                </section>
              ))}
            </div> : <div className={mode === 'week' ? 'calendar-days calendar-days--week' : 'calendar-days calendar-days--month'}>
              {days.map((day, index) => dayCell(day, index))}
            </div>}
            <div className="calendar-legend"><span>● Лёгкая</span><span>● Интенсивная</span><span>✓ Выполнено</span><span>× Пропущено</span><span>◌ Предварительный план</span><span>◆ Контрольная точка</span><span>? Требует уточнения</span></div>
            <p className="calendar-muted">{plan.horizonNote}</p>
          </section>

          <section className="calendar-detail" aria-label="Выбранный день">
            <p className="calendar-eyebrow">{selectedDate === today ? 'Сегодня · ' : ''}{dayName(selected, busySet.has(selectedDate))}</p>
            <h2>{selected.status === 'unresolved' ? 'Требует уточнения' : selected.workout ? workoutTitle(selected.workout) : selected.status === 'race' ? 'Сдача норматива' : selected.status === 'unformed' ? 'План ещё не сформирован' : 'День без тренировки'}</h2>
            <p className="calendar-muted">{formatDateLong(selectedDate)}</p>
            {selected.status === 'unresolved' ? <>
              <Notice tone="warn" title={plan.unresolvedTitle}>
                <p>{plan.unresolvedText}</p>
              </Notice>
              {selected.workout ? <p className="calendar-muted">Слот: {workoutTitle(selected.workout)}. Параметры не показываются, пока занятие не уточнено.</p> : null}
            </> : selected.status === 'forecast' || selected.status === 'control' ? <>
              <Notice tone="info" title={selected.status === 'control' ? plan.controlTitle : plan.preliminaryTitle}>
                <p>{selected.status === 'control' ? plan.controlText : plan.preliminaryText}</p>
              </Notice>
              <p className="calendar-muted">{plan.preliminary}</p>
              {selected.workout ? <div className="calendar-prescription">
                <strong>{workoutVolume(selected.workout)}</strong>
                <span>Предварительные параметры: карточка занятия откроется, когда движок назначит тренировку.</span>
                <WorkoutParams workout={selected.workout} />
                <p className="hint">{plan.forecastResultUnavailable}</p>
              </div> : null}
            </> : selected.workout ? <>
              <div className="calendar-prescription">
                <strong>{workoutVolume(selected.workout)}</strong>
                <WorkoutParams workout={selected.workout} />
              </div>
              {selected.result ? <p className="calendar-fact">Записано фактически: {selected.result.result.distanceMeters > 0 ? km(selected.result.result.distanceMeters) : 'дистанция не указана'}. Результат сохранён в истории.</p> : null}
              {selected.status === 'skipped' ? <p className="calendar-fact">Тренировка отмечена как пропущенная. Нагрузка не переносится автоматически.</p> : null}
              <div className="calendar-detail-actions">
                {/* Only cards that exist can be opened: history for results, the issued queue for workouts. */}
                {selected.result ? <Button onClick={() => onNavigate({name:'HISTORY'})}>Посмотреть историю</Button>
                  : queue.some(item => item.id === selected.workout!.id) ? <Button onClick={() => onNavigate({name:'WORKOUT', id:selected.workout!.id})}>Открыть тренировку</Button> : null}
                {canMove ? <Button variant="secondary" onClick={() => {setMoving(!moving);setMoveTo(null);setMoveError(null);}}>Перенести</Button> : null}
              </div>
            </> : <p className="calendar-detail-empty">{selected.status === 'unformed'
              ? 'Дальнейшие занятия появятся после формирования следующей части плана. Это не день отдыха по назначению.'
              : selected.status === 'race' ? 'В этот день предусмотрен итоговый забег на 3000 м.'
              : 'Беговая тренировка на эту дату не назначена.'}</p>}
            {selected.status !== 'completed' && selected.status !== 'skipped' && selected.status !== 'race' && selected.status !== 'unresolved' ? (
              <button className="calendar-busy-toggle" type="button" aria-pressed={busySet.has(selectedDate)} onClick={toggleBusy}>
                {busySet.has(selectedDate) ? '✓ Рабочая смена / занят — убрать отметку' : '+ Отметить смену или занятый день'}
              </button>
            ) : null}
            {busyError ? <Notice tone="danger">Не удалось сохранить занятость на этом устройстве. План не изменён.</Notice> : null}
            {notice ? <p className="calendar-feedback" role="status">{notice}</p> : null}
            {moving && selected.workout ? (
              <div className="calendar-move" aria-label="Перенос тренировки">
                <h3>Выбрать день переноса</h3>
                <p>Отметки смен исключены из списка. Даты проверены тренировочным движком.</p>
                {allowedCandidates.length === 0 ? <Notice tone="warn">Пока нет доступных дат для переноса в текущем семидневном окне.</Notice> : null}
                <div className="calendar-move-options">
                  {moveCandidates.map(candidate => <button type="button" key={candidate.date} disabled={!candidate.allowed}
                    title={candidate.allowed ? undefined : candidate.reason}
                    aria-pressed={moveTo === candidate.date}
                    onClick={() => {setMoveTo(candidate.date);setMoveError(null);}}>
                    {formatDateLong(candidate.date)}{candidate.allowed ? '' : ' · недоступно'}
                  </button>)}
                </div>
                {moveError ? <Notice tone="danger">{moveError}</Notice> : null}
                <div className="calendar-detail-actions">
                  <Button disabled={!moveTo} onClick={performMove}>Подтвердить перенос</Button>
                  <Button variant="ghost" onClick={() => setMoving(false)}>Отмена</Button>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="calendar-footer">
          <Card title={plan.horizon}>
            {queue.filter(item => item.type !== 'REST').length ? (
              <ul className="timeline">{queue.filter(item => item.type !== 'REST').map(item => (
                <li key={item.id} className="timeline__item">
                  <button type="button" className="timeline__button" onClick={() => onNavigate({name:'WORKOUT',id:item.id})}>
                    <span className="timeline__date">{formatDateLong(item.scheduledDate)}</span>
                    <span className="timeline__title">{workoutTitle(item)}</span>
                    <span className="timeline__meta">{workoutVolume(item)}</span>
                  </button>
                </li>
              ))}</ul>
            ) : <p className="hint">На ближайшие дни беговых тренировок нет.</p>}
          </Card>
          <Card title={plan.taperLabel}><KeyValue label={plan.taper} value={formatDateLong(taperStart)} /><p className="hint">{plan.taperNote}</p></Card>
          <Card title={plan.race}><KeyValue label={plan.race} value={`3000 м · ${formatDateLong(profile.raceDate)}`} /><KeyValue label={plan.goalLabel} value={formatTime(profile.targetTimeSeconds)} /><p className="hint">{plan.raceNote}</p></Card>
          <Card><p className="paragraph">{needsPerformanceReview(engineState) ? todayText.performanceReview.text : phaseWhy[decision.phase]}</p></Card>
          {pending ? <Notice tone="warn" title={todayText.pendingResult.title}>
            <p>{todayText.pendingResult.text}</p>
            <Button onClick={() => onNavigate({name:'TODAY'})}>{nav.today}</Button>
          </Notice> : <div className="actions"><Button variant="secondary" onClick={onRefreshPlan} disabled={refreshing}>{refreshing ? common.loading : plan.refresh}</Button></div>}
        </div>
      </div>
    </div>
  );
}
