---
status: diagnosed
phase: 09-expedition-rules-core
source: [09-VERIFICATION.md]
started: 2026-09-24T06:04:01Z
updated: 2026-09-26T21:07:52Z
---

## Current Test

[complete — owner chose: fix now]

## Tests

### 1. Decide whether WR-01/WR-02 (non-monotone ordered evaluator, self-confirming ordered oracle) must be fixed inside Phase 9 or tracked as Phase 10 debt
expected: Owner decision — fix now (gap closure in Phase 9), or accept and track for Phase 10 with a follow-up ID referenced in code
result: issue — owner chose to fix inside Phase 9 via gap closure (/gsd:plan-phase 9 --gaps)

## Summary

total: 1
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Every objective's status is correct at any CampState (monotone: once failed, stays failed) and ordered-objective failure timing is proven by a genuinely independent property-test oracle"
  status: failed
  reason: "WR-01: orderedKind.evaluate (objectives.ts:161-171) can flip failed -> done once the objective's own card is later won; WR-02: orderedOracle in objectives.property.test.ts:85-115 mirrors the implementation so it cannot catch this"
  severity: major
  test: 1

