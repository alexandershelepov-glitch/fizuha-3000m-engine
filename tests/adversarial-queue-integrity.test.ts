/**
 * Adversarial audit — queue integrity and safety-report acceptance.
 *
 * These tests deliberately try to break the contract between the workout queue
 * and the result recorder. The engine must never hand out a workout it then
 * refuses to accept, and a RED safety report must never be rejected.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine, decide, moveWorkout, recordResult, replan, resolveDiagnostic} from '../src/index.ts';
import type {EngineState, Profile} from '../src/index.ts';
import {NOW, dateAfter, experienced, feedback, healthy, profile as baseProfile} from './helpers.ts';

const fast = (o: Partial<Profile> = {}): Profile => baseProfile({
  ...experienced, availableRunsPerWeek: 4, actualRunsPerWeek: 4,
  averageWeeklyKm4Weeks: 28, longestUsualRunKm: 9, raceDate: dateAfter(90), ...o,
});

/** Minimal, fully legitimate sequence that the audit found unreproducible elsewhere. */
function redThenResolvedThenQuality(): EngineState {
  let s = createEngine(fast(), NOW);
  const easy = s.queue.find(w => w.type === 'EASY')!;
  s = recordResult(s, easy.id, feedback(easy, 'RED'));
  s = resolveDiagnostic(s, healthy(), s.asOf);
  for (let n = 0; n < 40; n++) {
    const q = s.queue.find(w => w.countsAsQuality);
    if (q) { s = recordResult(s, q.id, feedback(q)); return s; }
    s = replan(s, dateAfter(1, s.asOf));
  }
  throw new Error('no quality workout found');
}

test('A01 every workout the queue produces must be recordable', () => {
  const state = redThenResolvedThenQuality();
  const queued = state.queue.filter(w => w.countsAsQuality);
  assert.ok(queued.length > 0, 'precondition: a quality workout is queued');
  for (const w of queued) {
    assert.doesNotThrow(
      () => recordResult(state, w.id, feedback(w)),
      `queued ${w.type}@${w.scheduledDate} was rejected by the recorder`,
    );
  }
});

test('A02 a RED safety report must never be rejected by an administrative limit', () => {
  const state = redThenResolvedThenQuality();
  for (const w of state.queue) {
    assert.doesNotThrow(
      () => recordResult(state, w.id, feedback(w, 'RED')),
      `RED report for queued ${w.type}@${w.scheduledDate} was rejected — safety information would be lost`,
    );
  }
});

test('A03 queue authorisation and recorder acceptance use the same decision date', () => {
  const state = redThenResolvedThenQuality();
  for (const w of state.queue) {
    // The queue authorised this session against the decision on its own date.
    const authorising = decide(state, w.scheduledDate).maximumQualityPerWeek;
    const recent = state.history.filter(h => h.workout.countsAsQuality && Date.parse(w.scheduledDate) - Date.parse(h.result.date) < 7 * 86400000);
    if (w.countsAsQuality && recent.length < authorising) {
      assert.doesNotThrow(() => recordResult(state, w.id, feedback(w)));
    }
  }
});

test('A04 swept queue is always recordable (GREEN and RED) across profiles and dates', () => {
  let attempts = 0;
  for (const avail of [2, 3, 4, 5, 7]) {
    for (const raceOffset of [21, 45, 90]) {
      for (const exp of [false, true]) {
        let s = createEngine(baseProfile({
          ...(exp ? experienced : {}), availableRunsPerWeek: avail, actualRunsPerWeek: 3,
          averageWeeklyKm4Weeks: 24, longestUsualRunKm: 8, raceDate: dateAfter(raceOffset),
        }), NOW);
        for (let step = 0; step < 10; step++) {
          for (const w of s.queue) {
            attempts++;
            assert.doesNotThrow(() => recordResult(s, w.id, feedback(w)), `GREEN rejected: ${w.type}@${w.scheduledDate} asOf=${s.asOf}`);
            assert.doesNotThrow(() => recordResult(s, w.id, feedback(w, 'RED')), `RED rejected: ${w.type}@${w.scheduledDate} asOf=${s.asOf}`);
          }
          const q = s.queue.find(w => w.countsAsQuality);
          if (q) s = recordResult(s, q.id, feedback(q));
          s = replan(s, dateAfter(2, s.asOf));
        }
      }
    }
  }
  assert.ok(attempts > 100, `sweep actually ran (${attempts} attempts)`);
});

test('A05 moved workouts remain recordable at their new date', () => {
  let s = createEngine(fast(), NOW);
  const q = s.queue.find(w => w.countsAsQuality)!;
  const occupied = new Set([...s.queue.map(w => w.scheduledDate), ...s.history.map(h => h.result.date)]);
  const candidates = Array.from({length: 7}, (_, i) => dateAfter(i, s.asOf)).filter(date => !occupied.has(date));
  assert.ok(candidates.length, 'precondition: a free date exists inside the queue horizon');
  // A quality session can only move to a date that also satisfies the recovery and budget rules.
  let moved: ReturnType<typeof moveWorkout> | null = null;
  for (const date of candidates) {
    try { moved = moveWorkout(s, q.id, date); break; } catch { /* recovery or budget rule -- try the next date */ }
  }
  assert.ok(moved, 'the quality session must be movable to at least one free date');
  s = replan(moved!, moved!.asOf);
  const after = s.queue.find(w => w.id === q.id);
  assert.ok(after, 'moved workout is still queued');
  assert.doesNotThrow(() => recordResult(s, after.id, feedback(after)));
});

test('A06 rolling seven-day quality window never exceeds two and always keeps 48h', () => {
  for (const avail of [4, 5, 6, 7]) {
    for (const km of [15, 25, 40]) {
      let s = createEngine(baseProfile({...experienced, availableRunsPerWeek: avail, actualRunsPerWeek: 4, averageWeeklyKm4Weeks: km, longestUsualRunKm: 9, raceDate: dateAfter(90)}), NOW);
      for (let step = 0; step < 10; step++) {
        const q = s.queue.find(w => w.countsAsQuality);
        if (q) s = recordResult(s, q.id, feedback(q));
        s = replan(s, dateAfter(3, s.asOf));
        const dates = [...s.history.filter(h => h.workout.countsAsQuality).map(h => h.result.date),
                      ...s.queue.filter(w => w.countsAsQuality).map(w => w.scheduledDate)].sort();
        for (const date of dates) {
          const inWindow = dates.filter(x => Date.parse(x) <= Date.parse(date) && Date.parse(date) - Date.parse(x) < 7 * 86400000).length;
          assert.ok(inWindow <= 2, `more than two quality sessions inside seven days: ${dates.join(',')}`);
        }
        for (let i = 1; i < dates.length; i++) {
          assert.ok(Date.parse(dates[i]!) - Date.parse(dates[i - 1]!) >= 48 * 3600000, `less than 48h between quality sessions: ${dates.join(',')}`);
        }
      }
    }
  }
});

test('A07 no workout is ever queued for a date where the recorder would refuse it', () => {
  const state = redThenResolvedThenQuality();
  for (const w of state.queue.filter(x => x.countsAsQuality)) {
    const maxQuality = decide(state, w.scheduledDate).maximumQualityPerWeek;
    assert.ok(maxQuality >= 1, `${w.type}@${w.scheduledDate} queued while the date-level quality budget is ${maxQuality}`);
  }
});
