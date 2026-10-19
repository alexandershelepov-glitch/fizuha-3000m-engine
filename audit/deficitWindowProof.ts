/**
 * Arithmetic of the rolling 7-day window for the deficit budget (WS-19b/WS-19c), printed from the engine's own numbers.
 *   node --experimental-strip-types audit/deficitWindowProof.ts
 * Synthetic profiles (see audit/deficitProfiles.ts).
 */
import {createEngine, prescribe} from '../src/index.ts';
import type {EngineState, Workout} from '../src/index.ts';
import {approvedWeekMeters, longRunShares, reservedMetres} from '../src/weeklyLoad.ts';
import {weeklyIntenseCapacity} from '../src/workouts.ts';
import {PROBES} from './deficitProfiles.ts';
import {makeAuditProfile} from './fullCycle12w.ts';
import {SIM_START} from './trainingSimulator.ts';

const out: string[] = [];
for (const p of PROBES) {
  const s: EngineState = createEngine(makeAuditProfile(p), SIM_START);
  const budget = approvedWeekMeters(s), sh = longRunShares(s);
  const r = (type: Workout['type']): number => reservedMetres(s, prescribe(s, type, SIM_START, 'proof', 1)) ?? NaN;
  const t = r('THRESHOLD'), v = r('VO2');
  out.push(`${p.id}: budget ${budget} m; phase ${s.decision.phase}; decision max intense ${s.decision.maximumQualityPerWeek}; capacity ${weeklyIntenseCapacity(s, SIM_START, 4)}`);
  if (sh) {
    out.push(`  habitual long ${Math.round(sh.long)} m, habitual ordinary run ${Math.round(sh.other)} m; reserve T ${Math.round(t)} m, V ${Math.round(v)} m`);
    out.push(`  two intense (T+V): ${Math.round(t + v)} m reserved, ${Math.round(budget - t - v)} m left for L and the other runs (an ordinary run is ${Math.round(sh.other)} m)`);
    const share = (k: number, sum: number): number => (budget - sum) * sh.long / (sh.long + (3 - k) * sh.other);
    out.push(`  one intense (T): long run share ${Math.round(share(1, t))} m vs habitual ordinary run ${Math.round(sh.other)} m; EASY share ${Math.round((budget - t) * sh.other / (sh.long + 2 * sh.other))} m`);
  }
}
console.log(out.join('\n'));
