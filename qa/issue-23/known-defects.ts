/**
 * Defects found by this QA run (see reports/qa-issue-23/defect-log.md). A failing check whose id is listed
 * here is recorded as KNOWN_FAIL (never hidden: it is counted and listed in the report), so the long
 * full-cycle runs can keep going and reach the final result. Each defect also has a short, dedicated
 * reproduction test marked `test.fail()` in defects.spec.ts: when the defect is fixed that test starts
 * "unexpectedly passing" and must be switched to a normal test.
 */
export const KNOWN_DEFECTS: Readonly<Record<string, string>> = {
  REST_PLACEHOLDER_NOT_PENDING: 'DEF-001',
  CHECKPOINT_ACCEPTED_WHEN_REQUIRED: 'DEF-002',
  DOUBLE_CLICK_KEEPS_OUTCOME_SCREEN: 'DEF-003',
  DOUBLE_CLICK_WARNING_NOT_DISMISSED: 'DEF-003',
  GRAMMAR_REPEATS_PLURAL: 'DEF-004',
  PLAUSIBLE_QUALITY_SHARE: 'OBS-001',
};
