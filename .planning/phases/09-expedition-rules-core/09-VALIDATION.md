---
phase: 9
slug: expedition-rules-core
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| TBD | — | — | XRULE-01 | — | N/A | unit | `npx vitest run packages/rules/src/expedition/deck.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | XRULE-02, XRULE-03 | — | N/A | property | `npx vitest run packages/rules/src/expedition/trick.property.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | XRULE-04 | — | N/A | unit | `npx vitest run packages/rules/src/expedition/leader.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | XRULE-05, XRULE-06 | — | N/A | unit | `npx vitest run packages/rules/src/expedition/objectives.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | XRULE-07 | — | N/A | property | `npx vitest run packages/rules/src/expedition/objectives.property.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | XRULE-08 | T-9-01 | Actor may only play a card from their own hand; no undo | unit | `npx vitest run packages/rules/src/expedition/legality.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
