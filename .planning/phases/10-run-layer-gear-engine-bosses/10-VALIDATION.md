---
phase: 10
slug: run-layer-gear-engine-bosses
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| TBD | — | — | COMM-01 | — | Whisper card visible only to its audience | unit + property | `npx vitest run whisper` | ❌ W0 | ⬜ pending |
| TBD | — | — | COMM-02, RUN-06 | — | Reveals cleared on replay | integration | `npx vitest run replay-reset` | ❌ W0 | ⬜ pending |
| TBD | — | — | RUN-01 | — | N/A | unit | `npx vitest run balance` | ❌ W0 | ⬜ pending |
| TBD | — | — | RUN-02, RUN-03 | — | N/A | unit + property | `npx vitest run run-state` | ❌ W0 | ⬜ pending |
| TBD | — | — | RUN-04 | — | Draft offers private per seat | unit + property | `npx vitest run draft` | ❌ W0 | ⬜ pending |
| TBD | — | — | RUN-05 | — | N/A | unit | `npx vitest run loadout` | ❌ W0 | ⬜ pending |
| TBD | — | — | RUN-07 | — | No Math.random | property | `npx vitest run run.property` | ❌ W0 | ⬜ pending |
| TBD | — | — | GEAR-01..06 | — | Gear acts only through toolkit; conservation | unit ×10 | `npx vitest run gear/` | ❌ W0 | ⬜ pending |
| TBD | — | — | BOSS-01 | — | N/A | unit ×4 | `npx vitest run boss/` | ❌ W0 | ⬜ pending |
| TBD | — | — | ENG-02 | — | Interim no-leak over reveals | property (registry) | `npx vitest run contract` | ❌ W0 | ⬜ pending |
| TBD | — | — | (WR-03/05/06) | — | Hook defects fail loudly | unit | `npx vitest run --project rules` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
