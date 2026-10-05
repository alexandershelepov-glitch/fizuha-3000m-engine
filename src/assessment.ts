import type { Capacity, Confidence, EngineState, Feasibility, Profile, QualityExperience, SafetyData, SafetyStatus, Decision, Phase, Gate } from './models.ts';
import { day } from './validation.ts';
export function assessSafety(s: SafetyData): SafetyStatus {
  if (s.painIncreasing || s.alteredMovement || s.painWalkingOrRest || s.swelling || s.acuteIllness || s.otherStop) return 'STOP';
  return s.needsAssessment || s.pain >= 2 ? 'HOLD' : 'OK';
}
export function assessCapacity(p: Profile): Capacity {
  // Approved decision 3: continuous 3 km ability is mandatory for T1, T2 and T3. When it is
  // absent the category is T0 regardless of mileage, session count or longest run.
  if (!p.canRun3Km) return 'T0';
  if (p.regularRunningWeeks >= 12 && p.actualRunsPerWeek >= 4 && p.averageWeeklyKm4Weeks >= 25 && p.longestUsualRunKm >= 8) return 'T3';
  if (p.regularRunningWeeks >= 8 && p.actualRunsPerWeek >= 3 && p.averageWeeklyKm4Weeks >= 15 && p.longestUsualRunKm >= 6) return 'T2';
  if (p.regularRunningWeeks >= 4 && p.actualRunsPerWeek >= 2 && p.averageWeeklyKm4Weeks >= 8) return 'T1';
  return 'T0';
}
export function assessQuality(p: Profile): QualityExperience {
  if (p.qualityWeeks8Weeks >= 6 && p.qualityMostlyTolerated) return 'Q2';
  return p.qualitySessions8Weeks >= 3 ? 'Q1' : 'Q0';
}
export function assessConfidence(p: Profile, now: string): Confidence {
  if (!p.performance) return 'UNKNOWN';
  const age = day(now) - day(p.performance.date);
  const breaks = p.breaks.filter(b => day(b.endDate) >= day(p.performance!.date));
  if (age > 42 || breaks.some(b => b.days > 14 || b.reason === 'ILLNESS' || b.reason === 'INJURY') || p.performanceMismatch === 'CLEAR') return 'LOW';
  if (age > 21 || breaks.some(b => b.days >= 4) || p.performanceMismatch === 'MODERATE') return 'MEDIUM';
  return 'HIGH';
}
export function assessFeasibility(gap: number | null, weeks: number, t: Capacity, q: QualityExperience, available: number): Feasibility | null {
  if (gap === null) return null;
  if (gap > 0.15 + 1e-12) return 'LONG_TERM';
  const trained = t === 'T2' || t === 'T3';
  let base: Feasibility;
  if (gap > 0.10 + 1e-12) base = weeks >= 12 && trained ? 'AMBITIOUS' : 'LOW_PROBABILITY';
  else if (gap > 0.06 + 1e-12) base = weeks >= 10 && trained ? 'PLAUSIBLE' : weeks >= 6 ? 'AMBITIOUS' : 'LOW_PROBABILITY';
  else if (gap > 0.03 + 1e-12) base = weeks >= 6 ? 'PLAUSIBLE' : weeks >= 4 ? 'AMBITIOUS' : 'LOW_PROBABILITY';
  else base = weeks >= 3 ? 'PLAUSIBLE' : 'AMBITIOUS';
  const scale = ['PLAUSIBLE', 'AMBITIOUS', 'LOW_PROBABILITY'] as const;
  let index = scale.indexOf(base);
  if (gap > 0.03 + 1e-12) index += Number(!trained) + Number(q === 'Q0') + Number(available === 2);
  return scale[Math.min(2, index)]!;
}
export function taperDays(t: Capacity, q: QualityExperience): number { return t === 'T3' && q === 'Q2' ? 10 : t === 'T2' || t === 'T3' ? 7 : 5; }
export function decide(s: EngineState, now: string): Decision {
  const p = s.profile; const safety = assessSafety(p.safety);
  const capacity = assessCapacity(p); const quality = assessQuality(p); const confidence = assessConfidence(p, now);
  const currentSpeedMps = p.performance ? 3000 / p.performance.timeSeconds : null;
  const goalGap = p.performance ? p.performance.timeSeconds / p.targetTimeSeconds - 1 : null;
  const feasibility = assessFeasibility(goalGap, (day(p.raceDate) - day(now)) / 7, capacity, quality, p.availableRunsPerWeek);
  const reasons: Decision['reasons'] = [];
  let phase: Phase;
  // Order is normative. Approved decision 1: FOUNDATION wins over RE_ENTRY. A returning runner
  // whose base category is FOUNDATION (no valid performance, cannot run 3 km continuously, T0,
  // or LONG_TERM + T0/T1 + Q0) keeps phase FOUNDATION and receives the RE_ENTRY *load*
  // restrictions as a modifier only. Phase RE_ENTRY is reserved for a returning prepared runner
  // whose base phase would otherwise be DEVELOPMENT or SPECIFIC.
  if (safety !== 'OK' || s.diagnosticHold || s.relatedYellow) phase = 'HOLD_DIAGNOSTIC';
  else if (!p.performance || !p.canRun3Km || capacity === 'T0') phase = 'FOUNDATION';
  // Explicit conservative resolution of scenario 11 / section 11 conflict (approved as a general rule).
  else if (feasibility === 'LONG_TERM' && (capacity === 'T1') && quality === 'Q0') { phase = 'FOUNDATION'; reasons.push('FOUNDATION_LONG_TERM_CONFLICT'); }
  else if (s.reentry && s.reentry.breakDays >= 8) phase = 'RE_ENTRY';
  else if (confidence === 'LOW') phase = capacity === 'T1' ? 'FOUNDATION' : 'HOLD_DIAGNOSTIC';
  else if (day(p.raceDate) - day(now) <= taperDays(capacity, quality)) phase = 'TAPER';
  else if ((capacity === 'T2' || capacity === 'T3') && quality !== 'Q0' && goalGap !== null && goalGap <= 0.08 + 1e-12 && (confidence === 'HIGH' || confidence === 'MEDIUM') && s.successfulQuality >= 2) phase = 'SPECIFIC';
  else phase = 'DEVELOPMENT';
  let gate: Gate = 'CLOSED';
  const gateEligible = goalGap !== null && goalGap <= 0.08 + 1e-12 && (confidence === 'HIGH' || confidence === 'MEDIUM') && safety === 'OK' && !['FOUNDATION', 'RE_ENTRY', 'HOLD_DIAGNOSTIC'].includes(phase) && !s.progressionBlocked;
  if (gateEligible && (quality === 'Q0' ? s.successfulIntro >= 2 : s.successfulQuality >= 1)) gate = 'PARTIAL';
  if (gate === 'PARTIAL' && goalGap! <= 0.05 + 1e-12 && s.successfulSpecificPartial >= 2 && !s.relatedYellow) gate = 'OPEN';
  const effectiveSpeedMps = currentSpeedMps === null ? null : gate === 'CLOSED' ? currentSpeedMps : gate === 'OPEN' ? 3000 / p.targetTimeSeconds : currentSpeedMps + 0.5 * (3000 / p.targetTimeSeconds - currentSpeedMps);
  const recentRed = s.history.some(h => h.classified.evaluation === 'RED' && day(now) - day(h.result.date) <= 7);
  let maximumQualityPerWeek = p.availableRunsPerWeek >= 4 && (capacity === 'T2' || capacity === 'T3') && quality !== 'Q0' && !recentRed && !s.relatedYellow ? 2 : 1;
  if (s.reducedQualityUntilConfirmed || s.reentry) maximumQualityPerWeek = Math.min(1, maximumQualityPerWeek);
  if (safety !== 'OK' || phase === 'HOLD_DIAGNOSTIC' || (s.reentry && (s.reentry.easyRemaining > 0 || s.reentry.diagnosticRequired)) || (phase === 'FOUNDATION' && (confidence === 'LOW' || !p.canRun3Km))) maximumQualityPerWeek = 0;
  if (safety === 'STOP') reasons.push('SAFETY_STOP'); else if (safety === 'HOLD') reasons.push('SAFETY_HOLD');
  if (!p.performance) reasons.push('FOUNDATION_NO_3K_RESULT');
  if (goalGap !== null && goalGap > 0.08 + 1e-12) reasons.push('GOAL_GAP_TOO_LARGE');
  if (gate === 'CLOSED') reasons.push('TARGET_GATE_CLOSED');
  if (confidence === 'LOW') reasons.push('PERFORMANCE_CONFIDENCE_LOW');
  if (quality === 'Q0') reasons.push('LOW_QUALITY_EXPERIENCE');
  if (s.reentry) reasons.push('REENTRY_AFTER_BREAK');
  if (maximumQualityPerWeek < 2) reasons.push('SECOND_QUALITY_NOT_ALLOWED');
  if (s.relatedYellow) reasons.push('TWO_RELATED_YELLOW');
  if (phase === 'TAPER') reasons.push('TAPER_STARTED');
  if (s.greenPlusIds.length >= 2) reasons.push('CHECKPOINT_AFTER_GREEN_PLUS');
  if (s.checkpointRequired) reasons.push('CHECKPOINT_DUE');
  if (s.reentry && s.reentry.breakDays >= 8 && s.reentry.easyRemaining === 0) reasons.push('CHECKPOINT_AFTER_REENTRY');
  if (s.diagnosticHold && safety !== 'STOP') reasons.push('HEALTH_REVIEW_REQUIRED');
  if (!s.progressionBlocked && Object.entries(s.doses).some(([type, dose]) => dose.value > (s.confirmedDoses[type as keyof typeof s.confirmedDoses]?.value ?? dose.value))) reasons.push('PROGRESSION_ALLOWED');
  if (p.performanceMismatch === 'CLEAR') reasons.push('CONTRADICTORY_PERFORMANCE');
  if (s.progressionBlocked) reasons.push('PROGRESSION_BLOCKED');
  return {confidence, capacity, quality, phase, safety, goalGap, feasibility, gate, currentSpeedMps, effectiveSpeedMps, maximumQualityPerWeek, reasons};
}
