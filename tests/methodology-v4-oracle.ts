import assert from 'node:assert/strict';
import type {Workout} from '../src/index.ts';

// Independent acceptance oracle transcribed from the approved source, not planner constants.
const expectedQuality = [
  ['THRESHOLD',2,'MINUTES',12,null,315,150,'SECONDS'],
  ['VO2',3,'METERS',1800,600,173/600*1000,180,'SECONDS'],
  ['THRESHOLD',2,'MINUTES',16,null,315,180,'SECONDS'],
  ['STRIDES',4,'METERS',600,150,41/150*1000,150,'METERS'],
  ['VO2',2,'METERS',1600,800,231/800*1000,180,'SECONDS'],
  ['THRESHOLD',2,'MINUTES',20,null,315,180,'SECONDS'],
  ['VO2',3,'METERS',1200,400,290,200,'METERS'],
  ['STRIDES',3,'METERS',450,150,41/150*1000,150,'METERS'],
] as const;
const easy = [4000,4500,4500,5000,5500,5000,4500,3000];
const long = [5500,6000,6500,6000,7000,7500,6000];
export function assertV4Assignments(workouts: readonly Workout[]) {
  assert.equal(workouts.length,24);
  assert.equal(workouts.filter(w=>w.type==='CONTROL').length,1);
  for (let i=0;i<24;i++) {
    const week=Math.floor(i/3)+1, role=i%3,w=workouts[i]!,p=w.protocol!;
    assert.equal(p.week,week); assert.equal(p.methodology,'V4_8W_1430');
    assert.deepEqual(p.easyPaceSecondsPerKm,[365,405]);
    assert.equal(w.warmupMinutes,0); assert.equal(w.cooldownMinutes,0);
    assert.equal(w.anchor,i===23?'NONE':'CURRENT');
    assert.equal(p.stage,week===4?'DELOAD':week===6?'PEAK':week>=7?'TAPER':'BUILD');
    if (role===0) {
      const [type,repeats,unit,value,meters,pace,recovery,recoveryUnit]=expectedQuality[week-1]!;
      assert.equal(w.type,type); assert.deepEqual(w.main.dose,{unit,value}); assert.equal(w.main.mode,'INTERVALS');
      assert.equal(w.main.repeats,repeats);assert.equal(w.main.repeatMeters,meters);assert.equal(w.main.finalRepeatMeters,meters);
      assert.deepEqual(w.paceRangeSecondsPerKm,[pace,pace]);assert.equal(w.countsAsQuality,true);
      assert.equal(p.warmupMeters,week===8?1200:1500);assert.equal(p.cooldownMeters,week===8?600:800);
      assert.deepEqual(p.dynamicMinutes,[3,5]);assert.equal(p.strides,null);
      assert.deepEqual(p.recovery,{dose:{unit:recoveryUnit,value:recovery},mode:type==='STRIDES'?'JOG_OR_WALK_UNTIL_RECOVERED':'JOG',betweenOnly:true});
      assert.equal(p.repeatSeconds,type==='THRESHOLD'?null:week===2?173:week===5?231:week===7?116:41);
      assert.equal(w.restSeconds,recoveryUnit==='SECONDS'?recovery:0);
    } else if (i===23) {
      assert.equal(p.role,'FINAL');assert.equal(w.scheduledDate,'2026-12-26');assert.equal(w.type,'CONTROL');
      assert.deepEqual(w.main.dose,{unit:'METERS',value:3000});assert.equal(p.warmupMeters,1500);assert.equal(p.cooldownMeters,800);
      assert.deepEqual(p.dynamicMinutes,[3,5]);assert.equal(w.paceRangeSecondsPerKm,null);assert.equal(p.recovery,null);
      assert.deepEqual(p.strides,{repeats:3,seconds:null,meters:80,insideDistance:false,minimumRecoverySeconds:null,fullRecovery:true});
    } else {
      assert.equal(w.type,role===1?'EASY':'LONG_EASY');assert.equal(w.main.mode,'CONTINUOUS');
      assert.deepEqual(w.main.dose,{unit:'METERS',value:role===1?easy[week-1]:long[week-1]});
      assert.equal(w.countsAsQuality,false);assert.deepEqual(w.paceRangeSecondsPerKm,[365,405]);
      assert.equal(p.warmupMeters,0);assert.equal(p.cooldownMeters,0);assert.equal(p.dynamicMinutes,null);assert.equal(p.recovery,null);
      assert.equal(p.firstLastKmEasy,role===2);
      assert.deepEqual(p.strides,role===1&&[1,3,5,7].includes(week)?{repeats:4,seconds:15,meters:null,insideDistance:true,minimumRecoverySeconds:75,fullRecovery:false}:null);
    }
  }
}
