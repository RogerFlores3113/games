---
phase: 3
slug: hanabi-rules-engine
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-15
updated: 2026-09-15
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
- **Before `/gsd:verify-work`:** full suite green plus `npx tsc -p packages/rules/tsconfig.json --noEmit`
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*Task IDs are `{plan}.{task}` within phase 03. Every task below carries an `<automated>` verify block in its plan.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01.1 | 03-01 | 1 | RULES-01, RULES-03 | T-03-03 | Hand size 5 for 2-3 players, 4 for 4-5, unaffected by variant; suit count from config | unit | `npx vitest run --project rules -t "variant config"` / `-t "hand size"` | ❌ W0 | ⬜ pending |
| 01.2 | 03-01 | 1 | RULES-02, RULES-19 | T-03-01, T-03-02, T-03-04 | Deck composition correct for base (50), Rainbow (60), Black (55); opaque ids; same seed ⇒ same deal | unit, all 3 variants | `npx vitest run --project rules -t "deck composition"` | ❌ W0 | ⬜ pending |
| 02.1 | 03-02 | 2 | RULES-20 | T-03-08 | History recorded from turn 1, public facts only; a draw carries no suit or rank key | unit | `npx vitest run --project rules -t "history"` | ❌ W0 | ⬜ pending |
| 02.2 | 03-02 | 2 | RULES-07 | T-03-07 | Clue facts accumulate positive and negative info; Rainbow keeps two candidates after a color clue | unit, all 3 variants | `npx vitest run --project rules packages/rules/src/hanabi/clue-facts.test.ts` | ❌ W0 | ⬜ pending |
| 02.3 | 03-02 | 2 | RULES-08, RULES-09, RULES-10 | T-03-05, T-03-06 | Zero-touch clue, clue at 0 tokens, discard at 8 tokens all rejected with distinct typed reasons | unit | `npx vitest run --project rules -t "legality"` | ❌ W0 | ⬜ pending |
| 03.1 | 03-03 | 3 | RULES-04, RULES-05, RULES-12, RULES-13, RULES-15, RULES-16, HIDE-05 | T-03-09, T-03-10, T-03-11, T-03-13 | Play/discard apply correctly; misplay costs a fuse; 5-completion refund forfeit at 8; extra-key payloads rejected | unit | `npx vitest run --project rules -t "applyAction"` | ❌ W0 | ⬜ pending |
| 03.2 | 03-03 | 3 | RULES-06, RULES-07 | T-03-09 | Clue spends exactly one token and updates every slot in the target hand | unit, all 3 variants | `npx vitest run --project rules -t "applyAction"` | ❌ W0 | ⬜ pending |
| 03.3 | 03-03 | 3 | RULES-17, RULES-18 | T-03-12 | Three end conditions in fixed order; score and descriptive band from the engine | unit | `npx vitest run --project rules -t "endgame"` / `-t "scoring"` | ❌ W0 | ⬜ pending |
| 04.1 | 03-04 | 4 | HIDE-05 | T-03-14, T-03-15, T-03-16, T-03-17 | Own-hand cards structurally lack suit/rank; unseated viewer fails closed | unit | `npx vitest run --project rules packages/rules/src/hanabi/projection.test.ts` | ❌ W0 | ⬜ pending |
| 04.2 | 03-04 | 4 | HIDE-05 | T-03-18 | Leak checker detects numeric-rank secrets structurally and by typed multiset; 8 canaries prove it fails | unit (canary) | `npx vitest run --project rules -t "leak"` | ❌ W0 | ⬜ pending |
| 04.3 | 03-04 | 4 | RULES-19, HIDE-05, FDN-02 | T-03-19 | Same seed ⇒ deep-equal state; applyAction never throws on any JSON value; zero Node/Worker imports | unit (conformance + purity) | `npx vitest run --project rules -t "conformance"` | ✅ reusable | ⬜ pending |
| 05.1 | 03-05 | 5 | RULES-02, RULES-03 | T-03-22, T-03-24 | Token conservation (0..8 / 0..3) and card conservation after every step | property (fast-check) | `npx vitest run --project rules -t "property"` | ❌ W0 | ⬜ pending |
| 05.2 | 03-05 | 5 | RULES-15, RULES-16, RULES-17, RULES-20 | T-03-20, T-03-21, T-03-23 | Redaction after every step; every random game terminates within a hard bound | property (fast-check) | `npx vitest run --project rules -t "property"` | ❌ W0 | ⬜ pending |
| 05.3 | 03-05 | 5 | RULES-02, RULES-03, FDN-02 | T-03-23, T-03-SC | Variant matrix across base/Rainbow/Black; full suite green; package still dependency-free | unit + structural | `npm test` + `npx tsc -p packages/rules/tsconfig.json --noEmit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/rules/src/hanabi/variant.ts` + `state.ts` + test — RULES-01, RULES-03 (task 01.1)
- [ ] `packages/rules/src/hanabi/deck.ts` + test — RULES-01, RULES-02, RULES-19 (task 01.2)
- [ ] `packages/rules/src/hanabi/history.ts` + test — RULES-20 (task 02.1)
- [ ] `packages/rules/src/hanabi/clue-facts.ts` + test — RULES-07, D-06 (task 02.2)
- [ ] `packages/rules/src/hanabi/legality.ts` + test — RULES-08, RULES-09, RULES-10, D-13 (task 02.3)
- [ ] `packages/rules/src/hanabi/actions.ts` + test — RULES-04, 05, 06, 07, 12, 13, 15, 16, HIDE-05 (tasks 03.1, 03.2)
- [ ] `packages/rules/src/hanabi/endgame.ts` + test — RULES-17, RULES-18 (task 03.3)
- [ ] `packages/rules/src/hanabi/projection.ts` + test — D-06, D-07 (task 04.1)
- [ ] `packages/rules/src/hanabi/hanabi-leak-check.ts` + canary test — D-21, D-22 (task 04.2)
- [ ] `packages/rules/src/hanabi/adapter.ts` + conformance reuse — RULES-19, HIDE-05, FDN-02 (task 04.3)
- [ ] `packages/rules/src/hanabi/{conservation,redaction,termination}.property.test.ts` — D-20's four invariants (tasks 05.1, 05.2)
- [ ] `packages/rules/src/hanabi/variant-matrix.test.ts` — D-10 (task 05.3)

*Framework installs: none.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| *(none)* | — | This phase is a pure package with no UI and no network surface; every behavior is automatable | — |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task runs the `rules` project)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned 2026-09-15 by gsd-planner
