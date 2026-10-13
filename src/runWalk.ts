/**
 * Conservative introductory run/walk intervals. No pace or physiological progress is invented.
 * One stage is earned only from a fully verified, healthy 14-day training block.
 * Seconds specify ONE alternating pair, repeated only until the engine's total distance is reached.
 * Finishing even the final stage does NOT prove continuous 3000 m ability.
 */
export const RUN_WALK_STAGES = Object.freeze([
  {runSeconds:30, walkSeconds:120},
  {runSeconds:45, walkSeconds:120},
  {runSeconds:60, walkSeconds:120},
  {runSeconds:90, walkSeconds:120},
  {runSeconds:120, walkSeconds:120},
  {runSeconds:180, walkSeconds:90},
  {runSeconds:240, walkSeconds:90},
  {runSeconds:300, walkSeconds:60},
  {runSeconds:480, walkSeconds:60},
  {runSeconds:600, walkSeconds:60},
  {runSeconds:900, walkSeconds:60},
  {runSeconds:1200, walkSeconds:60},
] as const);
export const LAST_RUN_WALK_STAGE = RUN_WALK_STAGES.length - 1;
