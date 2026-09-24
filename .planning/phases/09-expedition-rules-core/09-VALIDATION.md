---
phase: 9
slug: expedition-rules-core
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-23
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 + fast-check 4.9.0 (repo-pinned) |
| **Config file** | `vitest.config.ts` (root; already covers `packages/rules`) |
| **Quick run command** | `npx vitest run packages/rules/src/expedition` |
| **Full suite command** | `npm test && npm run typecheck` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run packages/rules/src/expedition`
- **After every plan wave:** Run `npm test && npm run typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-* | 01 | 1 | XRULE-01 | — | N/A | unit | `npx vitest run packages/rules/src/expedition/deck.test.ts` | created in-task (TDD) | ⬜ pending |
| 09-02-* | 02 | 2 | XRULE-02, XRULE-03, XRULE-04 | — | N/A | unit + property | `npx vitest run packages/rules/src/expedition/trick.test.ts packages/rules/src/expedition/trick.property.test.ts packages/rules/src/expedition/leader.test.ts` | created in-task (TDD) | ⬜ pending |
| 09-03-* | 03 | 2 | XRULE-05, XRULE-06, XRULE-07 | — | N/A | unit | `npx vitest run packages/rules/src/expedition/objectives.test.ts` | created in-task (TDD) | ⬜ pending |
| 09-04-* | 04 | 3 | XRULE-01, 04, 05, 07 | — | N/A | unit | `npx vitest run packages/rules/src/expedition/camp.test.ts` | created in-task (TDD) | ⬜ pending |
| 09-05-* | 05 | 4 | XRULE-02, 04, 05, 07, 08 | T-9-01 | Actor may only play/pick from own hand/turn; no undo, no auto-play | unit | `npx vitest run packages/rules/src/expedition/legality.test.ts packages/rules/src/expedition/actions.test.ts` | created in-task (TDD) | ⬜ pending |
| 09-06-* | 06 | 5 | XRULE-01–04, 06, 07, 08 | — | N/A | property | `npx vitest run packages/rules/src/expedition/camp.property.test.ts packages/rules/src/expedition/objectives.property.test.ts packages/rules/src/expedition/purity.test.ts` | created in-task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test files are created inside each plan's TDD tasks (no separate Wave 0 plan needed):


- [ ] `packages/rules/src/expedition/deck.test.ts` — XRULE-01
- [ ] `packages/rules/src/expedition/trick.property.test.ts` — XRULE-02, XRULE-03
- [ ] `packages/rules/src/expedition/leader.test.ts` — XRULE-04
- [ ] `packages/rules/src/expedition/objectives.test.ts` — XRULE-05, XRULE-06
- [ ] `packages/rules/src/expedition/objectives.property.test.ts` — XRULE-07
- [ ] `packages/rules/src/expedition/legality.test.ts` — XRULE-08
- [ ] `packages/rules/src/expedition/test-support.ts` — shared legal-play enumeration helpers

Framework install: none — Vitest/fast-check already present.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-23 (plan-checker pass)
