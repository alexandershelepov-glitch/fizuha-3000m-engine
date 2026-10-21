/** A QA-only synthetic report. The engine still evaluates it by its normal rules. */
import type {Workout,WorkoutResult} from './engineGateway.ts';
export type QaAction='SUCCESS'|'PARTIAL'|'SKIP';
export function makeQaResult(w:Workout, partial=false):WorkoutResult{
  const mps=w.speedRangeMps?(w.speedRangeMps[0]+w.speedRangeMps[1])/2:
    w.paceRangeSecondsPerKm?1000/((w.paceRangeSecondsPerKm[0]+w.paceRangeSecondsPerKm[1])/2):3;
  const repeats:WorkoutResult['repeats']=[];
  const measuredQuality=w.speedRangeMps!==null && w.type!=='EASY' && w.type!=='LONG_EASY';
  const repeatCount=Math.max(1,w.main.repeats);
  if(w.main.mode==='INTERVALS' || measuredQuality){
    for(let i=0;i<repeatCount;i++){
      const metres=w.main.dose.unit==='METERS'
        ? i===repeatCount-1 ? (w.main.finalRepeatMeters??w.main.repeatMeters??w.main.dose.value)
          : (w.main.repeatMeters??w.main.dose.value)
        : mps*w.main.dose.value*60/repeatCount;
      const seconds=w.main.dose.unit==='MINUTES'?w.main.dose.value*60/repeatCount:metres/mps;
      repeats.push({distanceMeters:metres,seconds});
    }
  }
  const metres=w.main.dose.unit==='METERS'?w.main.dose.value:w.main.dose.value*60*mps;
  const distanceMeters=repeats.length?repeats.reduce((n,r)=>n+r.distanceMeters,0):metres;
  const workMinutes=repeats.length?repeats.reduce((n,r)=>n+r.seconds,0)/60:
    w.main.dose.unit==='MINUTES'?w.main.dose.value:metres/mps/60;
  return {
    date:w.scheduledDate,completionFraction:partial ? 0.7 : 1,
    sessionRpe:partial?Math.min(10,w.targetRpe[1]+2):(w.targetRpe[0]+w.targetRpe[1])/2,
    safety:{pain:0,painIncreasing:false,alteredMovement:false,painWalkingOrRest:false,
      swelling:false,acuteIllness:false,otherStop:false,needsAssessment:false},
    durationMinutes:Math.max(1,w.warmupMinutes+w.cooldownMinutes+workMinutes+
      Math.max(0,repeats.length-1)*w.restSeconds/60),
    distanceMeters,repeats,restSeconds:Array.from({length:Math.max(1,repeats.length)},()=>w.restSeconds),
    conditions:{},unexpectedFatigue:partial,feedbackConfirmed:true,
  };
}
