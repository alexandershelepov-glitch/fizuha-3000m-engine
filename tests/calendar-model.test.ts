import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../src/index.ts';
import {calendarDay, mondayOf, monthDates, weekDates, weekSummary} from '../web/src/application/calendarModel.ts';
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
