---
phase: 10
slug: run-layer-gear-engine-bosses
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-26
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 + fast-check 4.9.0 (repo-pinned) |
| **Config file** | `vitest.config.ts` (root; `rules` project covers `packages/rules`) |
| **Quick run command** | `npx vitest run --project rules` |
| **Full suite command** | `npm test && npm run typecheck` |
| **Estimated runtime** | ~90 seconds (full), ~10 seconds (rules project) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --project rules`
- **After every plan wave:** Run `npm test && npm run typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green, and README recipes re-read against the registries (ENG-01)
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| see plans | 10-xx | — | COMM-01 | — | Whisper card visible only to its audience | unit + property | `npx vitest run whisper` | created in-task | ⬜ pending |
| see plans | 10-xx | — | COMM-02, RUN-06 | — | Reveals cleared on replay | integration | `npx vitest run replay-reset` | created in-task | ⬜ pending |
| see plans | 10-xx | — | RUN-01 | — | N/A | unit | `npx vitest run balance` | created in-task | ⬜ pending |
| see plans | 10-xx | — | RUN-02, RUN-03 | — | N/A | unit + property | `npx vitest run run-state` | created in-task | ⬜ pending |
| see plans | 10-xx | — | RUN-04 | — | Draft offers private per seat | unit + property | `npx vitest run draft` | created in-task | ⬜ pending |
| see plans | 10-xx | — | RUN-05 | — | N/A | unit | `npx vitest run loadout` | created in-task | ⬜ pending |
| see plans | 10-xx | — | RUN-07 | — | No Math.random | property | `npx vitest run run.property` | created in-task | ⬜ pending |
| see plans | 10-xx | — | GEAR-01..06 | — | Gear acts only through toolkit; conservation | unit ×10 | `npx vitest run gear/` | created in-task | ⬜ pending |
| see plans | 10-xx | — | BOSS-01 | — | N/A | unit ×4 | `npx vitest run boss/` | created in-task | ⬜ pending |
| see plans | 10-xx | — | ENG-02 | — | Interim no-leak over reveals | property (registry) | `npx vitest run contract` | created in-task | ⬜ pending |
| see plans | 10-xx | — | (WR-03/05/06) | — | Hook defects fail loudly | unit | `npx vitest run --project rules` | created in-task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All test files below are created inline by `tdd="true"` tasks in the same wave as their feature (plans 10-01..10-17); no separate Wave 0 plan is needed.

- [ ] `run/run-state.test.ts`, `run/draft.test.ts`, `run/loadout.test.ts`, `run/replay-reset.test.ts`, `run/whisper.test.ts`, `run/balance.test.ts`, `run/run.property.test.ts`
- [ ] `gear/gear.contract.test.ts` + ten `gear/<id>.test.ts`
- [ ] `boss/boss.contract.test.ts` + four `boss/<id>.test.ts`
- [ ] `purity.test.ts` extended to recurse into subdirectories
- [ ] `README.md` recipes (ENG-01)

Framework install: none — Vitest/fast-check already present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| README recipes accurate | ENG-01 | Doc accuracy vs registries | Follow each recipe against the actual registry files; the one-file-plus-registry-line claim holds |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-26 (plan-checker pass; README recipes remain a manual check at verify-work)
