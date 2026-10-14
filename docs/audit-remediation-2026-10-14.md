# Targeted remediation of the 14 October 2026 independent re-audit

Scope: fixes to the existing 3000m engine only. No new workout bank, training templates, predicted performance or medical safety guarantees.

## Implemented, regression-tested

- **N1:** the weekly guard measures remaining metres in each of the seven real rolling windows containing a candidate run. Historical and future sessions 12 days apart are no longer incorrectly combined.
- **N2:** completed two-week blocks are reviewed by each week's explicitly confirmed session count, not immutable calendar weekdays. A healthy completed block can be reviewed when a pending quality dose or measured 3000m check is resolved. Missing, unconfirmed, injured or overloaded blocks never gain catch-up credit.
- **N3:** explicit successful completion of 3000m permits a provisional minimum weekly booking ceiling of 3000m, not invented race pace or extra weekly running days. After two healthy verified weeks, former sub-5km profiles can grow weekly easy capacity by at most 10%, capped at 200m/review.
- **N4 (partial):** zero-habitual-frequency introductory sessions consume the earned approved metres; the previous hardcoded 1000m dose no longer discards verified weekly growth. The twelve-stage ladder's deliberately slow alternating 14-day reviews and weekly running frequency are not accelerated without coaching validation.
- **N5:** no LONG_EASY within seven days, no quality within three days, day-before-race REST. Late quality frequency falls to one per week.
- **N6:** conservative v1 ceilings for timed/interval quality doses including legacy saved plans. These are engineering guardrails, not validated physiological thresholds.
- **N7:** baseline mileage/habitual frequency are immutable during the current cycle. An API caller must create a fresh cycle rather than corrupt saved progression. Existing race-postponement rules are unchanged.
- **Other:** repaired the skipped-slot date regular expression.

## Invariants kept

STOP and unresolved medical warnings override scheduling. No skipped-session debt. Do not infer performance, 3km finishing time, race result or completed mileage from estimates. Unverified feedback never raises training load. Past completed workout records remain untouched.

## Limitations still requiring field validation

- Zero-history users remain on one scheduled session per week unless a fresh cycle with a newly established habitual running baseline is created. The beginner run/walk ladder may take many months; the app must not promise reaching 14:56 on a short deadline.
- Plans still follow dates fixed from the cycle's start, without a weekday preference. Export/import of local user data is not included in this fix.
- Service worker and deployment base paths must be checked on the actual deployment address before sharing install links.
- Fitness and injury outcomes require real-world observation and, where appropriate, qualified coaching/medical review. Passing CI alone cannot establish training safety.
