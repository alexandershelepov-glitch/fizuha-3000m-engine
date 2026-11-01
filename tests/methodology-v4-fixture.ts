import type {EngineState, Workout, WorkoutResult} from '../src/index.ts';
import {createEngine, finalRaceWorkout, recordResult, replan, serialize, deserialize, addDays} from '../src/index.ts';
import {profile, healthy} from './helpers.ts';
export const V4_START = '2026-11-02';
export function v4Profile() {
  return profile({performance:{timeSeconds:870,date:V4_START,source:'TEST_3K'},targetTimeSeconds:840,raceDate:'2026-12-26'});
}
/** A declared simulation fixture, never a real result or an app storage write. */
export function simulatedReport(w: Workout): WorkoutResult {
  const speed = w.speedRangeMps ? (w.speedRangeMps[0]+w.speedRangeMps[1])/2 : 1000/385;
  const p = w.protocol!;
  const mainMeters = w.main.dose.unit === 'METERS' ? w.main.dose.value : w.main.dose.value*60*speed;
  const mainSeconds = mainMeters/speed;
  const repeats = w.main.mode === 'INTERVALS' ? Array.from({length:w.main.repeats},()=>({
    distanceMeters:mainMeters/w.main.repeats,seconds:mainSeconds/w.main.repeats})) : [];
  const restCount = Math.max(0,w.main.repeats-1);
  const recoveryMeters = p.recovery?.dose.unit === 'METERS' ? restCount*p.recovery.dose.value : 0;
  const extraMeters = p.warmupMeters+p.cooldownMeters+recoveryMeters;
  const restSeconds = p.recovery?.dose.unit === 'SECONDS' ? p.recovery.dose.value : p.recovery ? p.recovery.dose.value/1000*385 : 0;
  return {date:w.scheduledDate,completionFraction:1,sessionRpe:(w.targetRpe[0]+w.targetRpe[1])/2,
    safety:healthy(),durationMinutes:(mainSeconds+extraMeters/1000*385+restCount*w.restSeconds)/60+(p.dynamicMinutes?.[0] ?? 0),
    distanceMeters:mainMeters+extraMeters,repeats,restSeconds:Array(restCount).fill(restSeconds),
    conditions:{notes:'SIMULATED QA REPORT, NOT AN OBSERVED WORKOUT'},unexpectedFatigue:false,feedbackConfirmed:true};
}
export function executeV4(): {seed:EngineState; state:EngineState; workouts:Workout[]} {
  const seed = createEngine(v4Profile(),V4_START);
  let state = deserialize(serialize(seed));
  const workouts: Workout[] = [];
  for (let delta=0;delta<54;delta++) {
    const today=addDays(V4_START,delta);
    state=replan(state,today);
    const w=state.queue.find(w=>w.scheduledDate===today);
    if (!w) continue;
    workouts.push(w);
    state=recordResult(state,w.id,simulatedReport(w));
    state=deserialize(serialize(state));
  }
  state=replan(state,'2026-12-26');
  const final=finalRaceWorkout(state);
  if (final) workouts.push(final);
  return {seed,state,workouts};
}
