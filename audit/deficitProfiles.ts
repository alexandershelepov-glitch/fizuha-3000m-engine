/** Synthetic virtual users with a small weekly budget relative to two intense sessions (follow-up probe, not an audit scenario). */
import type {AuditUser} from './fullCycle12w.ts';

const base = {n: 0, goalIsPlaceholder: false, regularWeeks: 40, qualitySessions: 8, qualityWeeks: 6, qualityTolerated: true,
  experience: {threshold: true, vo2: true, specific3k: true}, canRun3Km: true, weeklyKmNote: 'probe', assumptions: 'probe'};
const mk = (id: string, km: number, long: number, runs: number, seconds: number): AuditUser =>
  ({...base, id, label: id, currentSeconds: seconds, goalSeconds: seconds - 30, runsPerWeek: runs, availableRunsPerWeek: runs, weeklyKm: km, longestKm: long});
export const PROBES: AuditUser[] = [
  mk('P1-18km-long7-4runs-12:30', 18, 7, 4, 750),
  mk('P2-20km-long8-4runs-12:30', 20, 8, 4, 750),
  mk('P3-22km-long9-4runs-12:00', 22, 9, 4, 720),
  mk('P4-16km-long6-4runs-15:20', 16, 6, 4, 920),
  mk('P5-25km-long12-4runs-12:30', 25, 12, 4, 750),
  mk('P6-30km-long12-5runs-11:40', 30, 12, 5, 700),
];
