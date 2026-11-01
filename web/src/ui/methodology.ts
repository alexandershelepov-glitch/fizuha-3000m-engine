/**
 * A read-only answer to one question: which methodology does this cycle use, and if the approved
 * eight-week one does not apply, what exactly is missing.
 *
 * The reasons are produced by the engine (`v4Status`); this module never decides sport rules and
 * never decides by itself that a profile is "close enough".
 */
import {methodologyInEffect, v4Status} from '../application/engineGateway.ts';
import type {EngineState, Profile} from '../application/engineGateway.ts';
import {methodologyCopy} from './copy/methodology.ts';

export interface MethodologyView {
  /** The approved cycle is enrolled and currently drives the plan. */
  readonly active: boolean;
  /** The cycle was enrolled, but protective logic currently replaces its plan. */
  readonly paused: boolean;
  readonly title: string;
  readonly note: string;
  /** Human-readable unmet conditions, empty when the approved cycle is active. */
  readonly reasons: readonly string[];
}

function reasonsFor(blockers: readonly (keyof typeof methodologyCopy.blockers)[]): string[] {
  return blockers.map((blocker) => methodologyCopy.blockers[blocker]);
}

/** Status of a saved cycle, based on its persisted enrollment and the engine's own check. */
export function methodologyView(state: EngineState): MethodologyView {
  const enrolled = state.methodology !== undefined && state.methodology !== null;
  // A saved cycle without enrollment is explained by the same rule the engine applies at creation.
  const status = v4Status(state.profile, state.cycleStartDate);
  if (enrolled) {
    if (methodologyInEffect(state)) {
      return {active: true, paused: false, title: methodologyCopy.activeTitle, note: methodologyCopy.activeNote, reasons: []};
    }
    return {active: false, paused: true, title: methodologyCopy.pausedTitle, note: methodologyCopy.pausedNote,
      reasons: reasonsFor(status.blockers)};
  }
  return {active: false, paused: false, title: methodologyCopy.legacyTitle, note: methodologyCopy.legacyNote,
    reasons: reasonsFor(status.blockers)};
}

/** Status of a cycle that is about to be created from the questionnaire, before anything is stored. */
export function pendingMethodologyView(profile: Profile, startDate: string): MethodologyView {
  const status = v4Status(profile, startDate);
  return status.eligible
    ? {active: true, paused: false, title: methodologyCopy.activeTitle, note: methodologyCopy.activeNote, reasons: []}
    : {active: false, paused: false, title: methodologyCopy.legacyTitle, note: methodologyCopy.legacyNote,
      reasons: reasonsFor(status.blockers)};
}
