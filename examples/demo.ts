import { readFileSync } from 'node:fs';
import { createEngine, recordResult, serialize } from '../src/index.ts';
import type { Profile, WorkoutResult } from '../src/index.ts';
const profile = JSON.parse(readFileSync(new URL('./profile.json', import.meta.url), 'utf8')) as Profile;
const state = createEngine(profile, '2026-10-05');
const workout = state.queue[0]!;
const result: WorkoutResult = {
  date: workout.scheduledDate, completionFraction: 1, sessionRpe: 5.5, safety: profile.safety,
  durationMinutes: 30, distanceMeters: 4000, repeats: [], restSeconds: [90, 90, 90],
  conditions: {}, unexpectedFatigue: false,
};
const after = recordResult(state, workout.id, result);
console.log(JSON.stringify({before: state.decision, workout, after: after.decision, feedback: after.history.at(-1)?.classified, serializedBytes: serialize(after).length}, null, 2));
