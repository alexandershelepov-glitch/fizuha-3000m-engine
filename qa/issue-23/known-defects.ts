/**
 * Findings of the QA runs that are NOT fixed (see reports/qa-issue-23/defect-log.md). A failing check whose id is
 * listed here is recorded as KNOWN_FAIL (never hidden: counted and listed in the report). DEF-001..DEF-004 were fixed
 * on branch fix/issue-23-defects-001-004; their checks are ordinary checks again, so a failure is a regression (FAIL).
 */
export const KNOWN_DEFECTS: Readonly<Record<string, string>> = {
  // DEF-001..DEF-004 are fixed (PR "fix/issue-23-defects-001-004"): their checks are ordinary checks again and a
  // failure is a regression (FAIL), not a KNOWN_FAIL. Only methodology observations stay mapped.
  PLAUSIBLE_QUALITY_SHARE: 'OBS-001',
};
