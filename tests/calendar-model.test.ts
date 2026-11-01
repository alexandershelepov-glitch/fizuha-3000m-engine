import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, forecastCycle} from '../src/index.ts';
import {calendarDay, forecastByDate, mondayOf, monthDates, periodWeeks, weekDates, weekSummary} from '../web/src/application/calendarModel.ts';
import type {EngineState, HistoryEntry} from '../src/models.ts';
import {NOW, dateAfter, profile} from './helpers.ts';

test('calendar uses Monday-based local ISO dates, including year boundaries', () => {
  assert.equal(mondayOf('2026-10-16'), '2026-10-12');
  assert.deepEqual(weekDates('2026-10-16'), ['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
  assert.equal(mondayOf('2027-01-01'), '2026-12-28');
  const october = monthDates('2026-10-16');
  assert.equal(october[0], '2026-09-28');
  assert.equal(october.at(-1), '2026-11-01');
  assert.equal(october.length, 35);
  assert.equal(monthDates('2026-02-17').length % 7, 0);
});

function fixture(): EngineState { return createEngine(profile({raceDate: dateAfter(84)}), NOW); }

test('calendar marks unknown future beyond the 7-day issued horizon as unformed, not rest', () => {
  const s = fixture();
  assert.equal(calendarDay(s, NOW, dateAfter(14)).status, 'unformed');
  assert.equal(calendarDay(s, NOW, s.profile.raceDate).status, 'race');
  const prescribed = s.queue.find(w => w.type !== 'REST');
  assert.ok(prescribed);
  assert.equal(calendarDay(s, NOW, prescribed.scheduledDate).status, 'planned');
  assert.equal(calendarDay(s, NOW, prescribed.scheduledDate, new Set([prescribed.id])).status, 'moved');
});

test('actual kilometres require actual reported metres; main minutes are never turned into fake distance', () => {
  const s = fixture();
  const w = s.queue.find(item => item.type !== 'REST');
  assert.ok(w);
  const dates = weekDates(w.scheduledDate);
  const before = weekSummary(dates.map(date => calendarDay(s, NOW, date)));
  assert.equal(before.reportedMeters, 0);
  assert.ok(before.assigned >= 1);
  assert.ok(before.sessionsWithoutPrescribedMeters >= 0);
  const recorded = structuredClone(s);
  recorded.queue = recorded.queue.filter(item => item.id !== w.id);
  recorded.history.push({workout: w,
    result: {date:w.scheduledDate, completionFraction:1, sessionRpe:3, safety:recorded.profile.safety,
      durationMinutes:30, distanceMeters:2450, repeats:[], restSeconds:[], conditions:{}, unexpectedFatigue:false,
      feedbackConfirmed:true},
    classified: {evaluation:'GREEN', yellowReason:null, sessionLoad:0, inRangeFraction:0, speedDropFraction:0}
  } as HistoryEntry);
  const afterDays = dates.map(date => calendarDay(recorded, NOW, date));
  const after = weekSummary(afterDays);
  assert.equal(after.reportedMeters,2450);
  assert.equal(after.completed,1);
  assert.equal(afterDays.find(item => item.date===w.scheduledDate)?.status,'completed');
  assert.equal(before.assigned,after.assigned);
});

test('REST placeholders and skipped REST are not workouts and never count as missed', () => {
  const s = fixture();
  const w = s.queue.find(item => item.type !== 'REST');
  assert.ok(w);
  const fakeRest = {...w, id:'rest-test', type:'REST' as const, scheduledDate: dateAfter(1)};
  s.queue = [fakeRest];
  s.skippedWorkouts = [fakeRest];
  const d = calendarDay(s, NOW, fakeRest.scheduledDate);
  assert.equal(d.status,'rest');
  assert.equal(d.workout,null);
  assert.equal(weekSummary([d]).skipped,0);
});

// ------------------------------------------------------------------ issue #51: forecast projection
test('forecast entries fill future days as preliminary, never overriding facts or the race day', () => {
  const s = fixture();
  const forecast = forecastCycle(s, {mode: 'CONDITIONAL', asOf: s.asOf});
  assert.equal(forecast.windowViolations.length, 0);
  const byDate = forecastByDate(forecast.entries);
  assert.ok(byDate.size > 0);
  // Future days beyond the issued horizon are preliminary, not "unformed".
  const future = calendarDay(s, NOW, dateAfter(14), new Set(), byDate);
  assert.equal(future.status, 'forecast');
  assert.equal(future.workout?.type, byDate.get(dateAfter(14))?.workout.type);
  assert.equal(future.forecast?.status, 'CONDITIONAL');
  // Committed queue days stay planned; the map never overrides them.
  const prescribed = s.queue.find(w => w.type !== 'REST')!;
  assert.equal(calendarDay(s, NOW, prescribed.scheduledDate, new Set(), byDate).status, 'planned');
  assert.equal(byDate.has(prescribed.scheduledDate), false, 'committed entries are excluded from the map');
  // The race day is still the race day, and past days are unaffected.
  assert.equal(calendarDay(s, NOW, s.profile.raceDate, new Set(), byDate).status, 'race');
  assert.equal(calendarDay(s, NOW, dateAfter(-1), new Set(), byDate).status, 'rest');
});

test('forecast checkpoint controls get their own status and carry the blocking reason', () => {
  // A stale measurement forces the checkpoint window in the reservation forecast.
  const s = createEngine(profile({raceDate: dateAfter(84),
    performance: {timeSeconds: 920, date: dateAfter(-30), source: 'TEST_3K'}}), NOW);
  const forecast = forecastCycle(s, {mode: 'CONDITIONAL', asOf: s.asOf});
  const byDate = forecastByDate(forecast.entries);
  const controls = [...byDate.values()].filter(e => e.workout.type === 'CONTROL');
  if (controls.length > 0) {
    const day = calendarDay(s, NOW, controls[0]!.workout.scheduledDate, new Set(), byDate);
    assert.equal(day.status, 'control');
    assert.ok(day.forecast?.blockingReasons.includes('CHECKPOINT_DUE'));
  }
  // forecastByDate drops COMMITTED entries even if given the full list.
  const committed = forecast.entries.filter(e => e.status === 'COMMITTED');
  assert.ok(committed.length > 0);
  assert.ok(committed.every(e => !byDate.has(e.workout.scheduledDate) || byDate.get(e.workout.scheduledDate) !== e));
});

test('periodWeeks spans whole ISO weeks from the cycle start to the race week', () => {
  const s = fixture();
  const weeks = periodWeeks(s);
  assert.equal(weeks[0], mondayOf(s.cycleStartDate));
  assert.equal(weeks.at(-1), mondayOf(s.profile.raceDate));
  assert.equal(weeks.length % 1, 0);
  assert.ok(weeks.length >= 12 && weeks.length <= 14, `12-week cycle shows ${weeks.length} week rows`);
  const longCycle = createEngine(profile({raceDate: dateAfter(16 * 7)}), NOW);
  assert.equal(periodWeeks(longCycle).length, 17);
});

test('issue #51 review: UNRESOLVED forecast slots need clarification and never count as forecast workouts', () => {
  const s = fixture();
  const forecast = forecastCycle(s, {mode: 'CONDITIONAL', asOf: s.asOf});
  const real = forecast.entries.find(e => e.status === 'CONDITIONAL' && e.workout.type !== 'REST' && e.workout.type !== 'CONTROL')!;
  const unresolved = {...real, status: 'UNRESOLVED' as const};
  const day = calendarDay(s, NOW, real.workout.scheduledDate, new Set(), forecastByDate([unresolved]));
  assert.equal(day.status, 'unresolved');
  assert.equal(day.forecast?.status, 'UNRESOLVED');
  const summary = weekSummary([day]);
  assert.equal(summary.unresolved, 1);
  assert.equal(summary.preliminary, 0);
  assert.equal(summary.assigned, 0);
  assert.equal(summary.preliminaryMainMeters, 0);
});

test('issue #51 review: weekly summary keeps forecast volume apart from issued and reported volume', () => {
  const s = fixture();
  const forecast = forecastCycle(s, {mode: 'CONDITIONAL', asOf: s.asOf});
  const byDate = forecastByDate(forecast.entries);
  const futureWeek = weekDates(dateAfter(21)).map(date => calendarDay(s, NOW, date, new Set(), byDate));
  const prelim = futureWeek.filter(d => d.status === 'forecast' || d.status === 'control');
  assert.ok(prelim.length > 0);
  const summary = weekSummary(futureWeek);
  assert.equal(summary.assigned, 0, 'forecast days are not "assigned"');
  assert.equal(summary.knownMainMeters, 0, 'forecast metres are not added to assigned metres');
  assert.equal(summary.reportedMeters, 0);
  assert.equal(summary.preliminary, prelim.length);
  const expected = prelim.filter(d => d.workout!.main.dose.unit === 'METERS').reduce((t, d) => t + d.workout!.main.dose.value, 0);
  assert.equal(summary.preliminaryMainMeters, expected);
  // The current week still counts only the issued queue.
  const thisWeek = weekDates(NOW).map(date => calendarDay(s, NOW, date, new Set(), byDate));
  const issued = thisWeek.filter(d => d.status === 'planned' || d.status === 'moved').length;
  assert.equal(weekSummary(thisWeek).assigned, issued);
});
