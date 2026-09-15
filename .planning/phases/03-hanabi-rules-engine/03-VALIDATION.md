---
phase: 3
slug: hanabi-rules-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-15
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (`rules` project) + fast-check 4.9.0 |
| **Config file** | `vitest.config.ts` (repo root); `rules` project roots at `packages/rules` |
| **Quick run command** | `npx vitest run --project rules` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | quick ~5 seconds; full ~60 seconds |

*No framework installs needed — vitest and fast-check are already present and exact-pinned. This phase adds only new test files inside the existing `rules` project.*

---

## Sampling Rate

- **After every task commit:** `npx vitest run --project rules` (no network, no worker, no web build)
- **After every plan wave:** `npm test` — the full four-project suite must stay green, since the forehead-card toy and its tests remain until Phase 4 (D-02)
- **Before `/gsd:verify-work`:** full suite green plus per-package `tsc --noEmit`
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*Task IDs are filled in by the planner; rows map each requirement to its verification layer.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | RULES-01 | — | Hand size 5 for 2-3 players, 4 for 4-5, unaffected by variant | unit | `npx vitest run --project rules -t "hand size"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RULES-02 | — | Deck composition correct for base (50), Rainbow (60), Black (55) | unit, all 3 variants | `npx vitest run --project rules -t "deck composition"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RULES-03 | — | Suit count derived from config; no hardcoded 5 or 50 | unit + structural | `npx vitest run --project rules -t "variant config"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RULES-04, 05, 06, 07, 12, 13 | — | Play, discard, clue apply correctly; misplay costs a fuse; 5-completion refund forfeit at 8 | unit | `npx vitest run --project rules -t "applyAction"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RULES-08, 09, 10 | tampering (illegal action) | Zero-touch clue, clue at 0 tokens, discard at 8 tokens all rejected | unit | `npx vitest run --project rules -t "legality"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RULES-15, 16, 17 | — | Explicit final-round counter; no draws during it; all three end conditions | unit + property (termination) | `npx vitest run --project rules -t "endgame"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RULES-18 | — | Score and descriptive band returned by the engine | unit | `npx vitest run --project rules -t "scoring"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RULES-19 | — | Same seed produces deep-equal initial state and identical outcomes | unit (conformance) | `npx vitest run --project rules -t "conformance"` | ✅ reusable | ⬜ pending |
| TBD | TBD | TBD | RULES-20 | info disclosure | History recorded from turn 1, public facts only; a draw carries no identity | unit + property (redaction) | `npx vitest run --project rules -t "history"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HIDE-05 | tampering | Extra-key payloads rejected; a card id outside the actor's own hand rejected; `applyAction` never throws on any JSON value | unit + hostile-input property | `npx vitest run --project rules -t "conformance"` | ✅ reusable | ⬜ pending |
| TBD | TBD | TBD | FDN-02 | — | Zero runtime dependencies; builds and tests in isolation | structural | `npx vitest run --project rules` + `npx tsc -p packages/rules/tsconfig.json --noEmit` | ✅ | ⬜ pending |
| TBD | TBD | TBD | D-20 | info disclosure / silent stall | Token conservation, card conservation, redaction, termination | property (fast-check) | `npx vitest run --project rules -t "property"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | D-21, D-22 | info disclosure | Leak checker detects numeric-rank secrets structurally and by typed identity; canaries prove it fails | unit (canary) | `npx vitest run --project rules -t "leak"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/rules/src/hanabi/variant.ts` + test — RULES-01, RULES-02, RULES-03
- [ ] `packages/rules/src/hanabi/deck.ts` + test — RULES-01, RULES-02
- [ ] `packages/rules/src/hanabi/legality.ts` + test — RULES-08, RULES-09, RULES-10, D-13
- [ ] `packages/rules/src/hanabi/actions.ts` + test — RULES-04, 05, 06, 07, 12, 13
- [ ] `packages/rules/src/hanabi/endgame.ts` + test — RULES-15, 16, 17, 18
- [ ] `packages/rules/src/hanabi/projection.ts` + test — D-06, D-07
- [ ] `packages/rules/src/hanabi/history.ts` + test — RULES-20
- [ ] `packages/rules/src/hanabi/adapter.ts` + conformance reuse — RULES-19, HIDE-05, FDN-02
- [ ] `packages/rules/src/hanabi/hanabi-leak-check.ts` + canary test — D-21, D-22
- [ ] `packages/rules/src/hanabi/*.property.test.ts` — D-20's four invariants

*Framework installs: none.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| *(none)* | — | This phase is a pure package with no UI and no network surface; every behavior is automatable | — |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
