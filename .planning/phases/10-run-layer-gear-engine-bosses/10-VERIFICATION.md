---
phase: 10-run-layer-gear-engine-bosses
verified: 2026-09-27T07:46:08Z
status: gaps_found
score: 4/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Each v1 gear item works exactly as specced (success criterion 4, GEAR-02)"
    status: failed
    reason: >
      Compass (reroll) crashes instead of working. `reroll.canTarget` legally
      accepts any face-up card-bearing objective (win-card or ordered, per
      spec and reroll.ts's own header), but the toolkit's `replace-objective`
      op only implements the `ordered` case and throws
      "toolkit: replace-objective: objective has no card to replace" for
      win-card objectives. Reproduced independently in this verification with
      a fresh vitest probe (setupRun at camp 2, all-win-card objective slots,
      advanceTo objective-pick, applyRunAction use-gear reroll against a
      legal win-card target) -- confirmed throw, matching 10-REVIEW.md's
      CR-01 exactly. Camps 1, 2, 3 and 5 are all-win-card, so this is not an
      edge case: it is the common path. REQUIREMENTS.md's GEAR-02 checkbox
      ("Compass: rerolls a face-up, untaken objective") is currently false as
      shipped.
    artifacts:
      - path: "packages/rules/src/expedition/run/toolkit.ts"
        issue: "replace-objective op (lines ~279-289) rejects objective.kind !== \"ordered\", but reroll.canTarget (gear/reroll.ts) legally allows win-card targets too"
    missing:
      - "Accept win-card (and ordered) in the replace-objective op's kind guard, matching camp.ts's isCardBearingSlot, and swap objective.target the same way for both kinds"
      - "A regression test that rerolls an unowned win-card objective and asserts id/kind are kept and target becomes the objective deck's top card"
      - "Per WR-01: extend enumerateLegalRunActions to generate use-gear candidates in the objective-pick window, and extend gear.contract.test.ts's findUsableFixture to try every accepted target combination (not just the first), so the whole-run property test and the gear contract suite can catch this class of bug going forward"
deferred: []
human_verification: []
---

# Phase 10: Run Layer, Gear Engine & Bosses Verification Report

**Phase Goal:** The full six-camp run is built on the layered hook/toolkit engine (base -> boss twist -> gear), and all of these work end to end: supplies, replay-on-failure, capacity, draft and loadout; the v1 gear catalogue; the provisional boss twists; the Whisper communication mechanic.

**Verified:** 2026-09-27T07:46:08Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Whisper: one card, one teammate, once per camp, only after objectives picked and only between tricks; public who-to-whom, private card, persists to camp/replay end (SC1, COMM-01, COMM-02) | VERIFIED | `run/whisper.ts` implements guard order wrong_phase -> wrong_window -> whisper_blocked -> no_whispers_left -> invalid_target -> card_not_in_hand. `run/whisper.test.ts` and `run/replay-reset.test.ts`'s "Whisper end to end (ROADMAP criterion 1, COMM-01/COMM-02)" test drive this exact scenario, including persistence across tricks and clearing on replay. `LogEntry` never carries a card id (types.ts contract), reveal audience is target-only. |
| 2 | Fail-then-replay resets every camp-scoped resource (gear-used flags, active modifiers, leader, Whisper availability, reveals) while owned/equipped gear persists (SC2, RUN-06) | VERIFIED | `run/replay-reset.test.ts`'s "fail-then-replay resets every camp-scoped resource (ROADMAP criterion 2, RUN-06)" test asserts this directly against a real failed-then-replayed camp. Structural guarantee: all camp-scoped data lives in `AttemptState`, rebuilt fresh by `startAttempt`; `ownedGearIds`/`equippedGearIds` live on `SeatRun`, untouched by `startAttempt`. |
| 3 | A full run replays deterministically from seed + action log; every draft offer, deal, boss selection and random gear effect draws only from the carried seeded RNG (SC3, RUN-07) | VERIFIED | `run/run.property.test.ts`'s "property: whole-run simulation (RUN-07)" fast-check property replays byte-for-byte from seed+action log across many runs, and a separate test proves two independently-built runs from an identical seed/action stream are deep-equal. `purity.test.ts` scans the whole `expedition/` tree (recursively, post Phase 10) and fails on any `Math.random`/`Date.now` token; grep confirms zero live occurrences outside comments/strings. `run/rng.ts`'s `STREAMS` supplies uniquely-named streams for draft, boss selection, deal, face-down assignment and gear draws. |
| 4 | Draft 1-of-3 private never-owned gear at run start and after each cleared camp; equip up to camp-number capacity; loadouts public; each v1 gear item and each v1 boss twist works exactly as specced; targeted gear/Whispers final-once-resolved (engine side of GEAR-05); visible reason when unusable (GEAR-06) (SC4, RUN-01..05, GEAR-01..06, BOSS-01) | FAILED | Draft/equip/capacity/loadout-visibility mechanics are implemented and tested (`run/draft.test.ts`, `run/lifecycle.test.ts`). GEAR-05's engine-side finality is real (`gear_already_used` in toolkit.ts) and GEAR-06's `canUse`/`canTarget` reason strings are present across all gear files. **However, Compass (a registered v1 gear item, GEAR-02) throws instead of working** on any win-card objective target — reproduced independently below (CR-01). This is not an edge case: camps 1, 2, 3, 5 are entirely win-card, so Compass is broken in its most common use. This single confirmed defect fails "each v1 gear item... works exactly as specced." |
| 5 | Adding a new gear item, objective kind, boss twist or interactable is a one-file-plus-registry-line change; every registered entry auto-checked for unique id, valid size/window, deterministic effect, card conservation, no view leak (SC5, ENG-01, ENG-02) | VERIFIED | `packages/rules/src/expedition/README.md` documents each recipe (gear/objective-kind/boss/hook/toolkit-op) file-by-file with exact identifiers; `gear.contract.test.ts`, `boss.contract.test.ts`, `objective-kinds.contract.test.ts` all iterate `Object.entries(REGISTRY)` (never a hand list), so a new entry is covered with zero test edits. Interactable and card-pack recipes are correctly scoped as forward contracts only (they live in `apps/web`, built in Phases 12/14) — this is a reasonable and explicitly documented interpretation of SC5 for a phase whose interactable/card-pack registries don't exist yet. ENG-01's REQUIREMENTS.md checkbox, ticked by an early plan (10-01) before the README existed, is re-judged here on the actual README + contract-test evidence and holds up. |

**Score:** 4/5 truths verified (one gear item within truth 4 is broken; everything else it depends on is real).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/rules/src/expedition/run/*.ts` (types, lifecycle, run-actions, compose, run-rules, toolkit, whisper, use-gear, draft, balance, rng, catalog) | The run layer wrapping Core in supplies/replay/capacity/draft/loadout/reveals/RNG | VERIFIED | All present, substantive (not stubs), and covered by dedicated test files each. |
| `packages/rules/src/expedition/gear/*.ts` (10 v1 items + registry + contract test) | The v1 gear catalogue | VERIFIED existence/wiring, FAILED correctness for `reroll.ts` | All 10 items registered in `gear/registry.ts`. `reroll.ts` (Compass) is wired and exercised by tests, but its `apply` legally produces a toolkit op the toolkit rejects — see CR-01 below. |
| `packages/rules/src/expedition/boss/*.ts` (4 twists + registry + contract test) | The 4 provisional boss twists | VERIFIED | `blind-orders.ts`, `eclipse.ts`, `mutiny.ts`, `radio-silence.ts` all registered and contract-tested at 3/4/5 players to a decided outcome, with determinism and replay checks. |
| `packages/rules/src/expedition/README.md` | ENG-01 recipes | VERIFIED | Present, detailed, matches actual file/identifier names in the codebase (spot-checked against `gear/gear-def.ts`, `run/run-rules.ts`, `objectives.ts`). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `gear/reroll.ts` (`canTarget`) | `run/toolkit.ts` (`replace-objective` op) | `apply()` returning `{ op: "replace-objective", objectiveId }` | NOT_WIRED (mismatched contract) | `canTarget` accepts win-card and ordered; the op only implements ordered. A legality check passing does not guarantee the toolkit op succeeds — this is exactly the class of bug WR-01 says the test harness cannot catch (`enumerateLegalRunActions` never enumerates objective-pick-window gear; `gear.contract.test.ts`'s `findUsableFixture` only tries the first accepted target combination). |
| `run/whisper.ts` | `run/toolkit.ts` (`reveal` op) / `run/types.ts` (`AttemptState.reveals`) | `applyWhisper` -> reveal append | WIRED | Confirmed by `whisper.test.ts` and the replay-reset end-to-end test. |
| `run/lifecycle.ts` (`startAttempt`) | `run/types.ts` (`AttemptState`) | fresh-attempt rebuild on replay | WIRED | Confirmed by `replay-reset.test.ts`. |
| `run/compose.ts` (`rulesFor`) | `boss/registry.ts` + seat loadouts + `attempt.effects` | layered `RuleModifier` composition (base -> boss -> gear -> mid-camp effects) | WIRED | `run/compose.test.ts` and boss/gear contract tests confirm layering order and effect. |

### Reproduction: CR-01 (Compass crash)

Independently reproduced outside any pre-existing test file, using only the package's own public test-support helpers (`setupRun`, `advanceTo`, `applyRunAction`, `CATALOG`):

```
Setup: seatIds=[s1,s2,s3], seed="cr01-probe-seed", campNumber=2 (all-win-card
objective slots per run/catalog.ts's BALANCE_TABLE), s1 owns/equips "reroll".
advanceTo(run, "objective-pick", CATALOG) reaches a dealt camp with face-up
win-card objectives.
applyRunAction(run, "s1", { type: "use-gear", gearId: "reroll",
  targets: [<a face-up win-card objective id>] }, CATALOG)
```

Result: `checkUseGear(...)` reports the action as legal (matches CR-01's report
that the action "passes every legality check"), and `applyRunAction` throws:

```
toolkit: replace-objective: objective has no card to replace
```

This matches 10-REVIEW.md's CR-01 finding exactly and confirms it is real,
reachable through the production `CATALOG`, and not an artifact of the
review's own probe methodology. The probe file was written, run, and deleted
as part of this verification (not left in the repo).

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|---|---|---|---|
| COMM-01 | 10-02, 10-06, 10-07, 10-08, 10-16 | SATISFIED | Whisper guard order + tests |
| COMM-02 | 10-02, 10-06, 10-08, 10-16 | SATISFIED | Reveal persistence + clearing on replay/camp end |
| RUN-01 | 10-03, 10-05, 10-14, 10-17 | SATISFIED | Six-camp structure, camp 3/6 boss camps, balance table |
| RUN-02 | 10-05, 10-07, 10-11, 10-17 | SATISFIED | Supplies/replay/Tonic penalty tested in run.property/replay-reset tests |
| RUN-03 | 10-03, 10-05, 10-11, 10-16 | SATISFIED | Capacity = camp number, Tonic +2 stacking |
| RUN-04 | 10-02, 10-05, 10-07, 10-11, 10-17 | SATISFIED | Draft offer exclusion + privacy tested in draft.test.ts |
| RUN-05 | 10-02, 10-07, 10-11 | SATISFIED | Loadout visibility (public), equip-up-to-capacity |
| RUN-06 | 10-04, 10-05, 10-06, 10-16 | SATISFIED | replay-reset.test.ts; gear_already_used |
| RUN-07 | 10-02, 10-17 | SATISFIED | run.property.test.ts whole-run determinism |
| GEAR-01 | 10-08, 10-15 | SATISFIED | Signal Whistle, Spyglass, Signal Flare per D-08 |
| GEAR-02 | 10-09, 10-15 | **BLOCKED** | Compass (reroll) crashes on win-card objectives (CR-01, reproduced above). Trail Map and Camouflage appear correct per D-10/D-11 but Trail Map carries WR-02 (see Anti-Patterns/Gaps below). |
| GEAR-03 | 10-01, 10-10, 10-15 | SATISFIED | Trained Monkey, Machete per D-09 |
| GEAR-04 | 10-11, 10-15 | SATISFIED | Rain Poncho, Energy Tonic stacking |
| GEAR-05 | 10-06, 10-07, 10-09..11, 10-15 | SATISFIED (engine-side scope only, correctly deferred UI to Phase 11 per context notes) | `gear_already_used`, no toolkit undo path |
| GEAR-06 | 10-04, 10-06, 10-08..11, 10-15 | SATISFIED (engine-side scope only) | `canUse`/`canTarget` reason strings present throughout; WR-02's leak is a quality defect in one reason string's *content*, not an absence of the mechanism |
| BOSS-01 | 10-05, 10-12, 10-13, 10-14 | SATISFIED | 4 twists, contract-tested at 3/4/5 players |
| ENG-01 | 10-01..04, 10-14..16 | SATISFIED (re-judged on README + contract-test merits, independent of its early REQUIREMENTS.md tick) | README.md recipes verified against actual code; registries type-enforce completeness (`KindRegistry`, `HOOK_NAME_SET`, `GearId`) |
| ENG-02 | 10-04, 10-14, 10-15, 10-17 | SATISFIED with a caveat | Contract tests check unique id, valid size/window, determinism, card-multiset conservation, and the interim (non-per-seat) no-leak check, exactly as scoped. They do **not** catch CR-01 (WR-01: the harness never enumerates objective-pick-window gear) and do **not** check hand-size invariants on the latent, currently-unused `move-card` op (WR-04). Both are gaps in the auto-check's completeness, not in its presence. |

No orphaned requirement IDs found: all 18 IDs from `10-CONTEXT.md`'s Requirements line are present in at least one plan's `requirements:` frontmatter, and all 18 appear in REQUIREMENTS.md under Phase 10's expected sections.

### Anti-Patterns / Review Findings, Judged

| ID | Finding | Judgment for this phase's goal |
|----|---------|-------|
| CR-01 | Compass crashes on win-card objectives | **BLOCKER.** Directly falsifies GEAR-02 and success criterion 4 ("each v1 gear item... works exactly as specced"). Reproduced independently in this verification, not merely trusted from 10-REVIEW.md. |
| WR-01 | Test harness cannot catch CR-01 (objective-pick-window gear never enumerated; contract test only tries first accepted target combo) | **Rolled into the CR-01 gap** as part of "missing," since fixing CR-01 without fixing the harness leaves the same defect class undetectable for the next gear item. Not a separate blocking truth on its own, but must be closed alongside CR-01. |
| WR-02 | Trail Map's refusal reason leaks a teammate's hidden-objective ownership under Thick Fog | **WARNING.** This is a real hidden-information leak reachable today (Trail Map/reassign is a shipped v1 GEAR-03/GEAR-02 item, Thick Fog is a shipped v1 boss twist), and it sits squarely in this phase's engine layer (canTarget), not in the Phase-11-owned per-seat view/leak-checker. It does not crash anything and the "real" leak checker is explicitly Phase 11 scope, so I am not treating it as a blocker for this phase's stated success criteria, but it should not be silently carried forward — recommend a follow-up plan or an explicit accepted-risk note before Phase 11 builds the real per-seat view on top of it. |
| WR-03 | A reveal's `fromSeatId` goes stale once Trained Monkey moves the card; the model doesn't say whether a reveal follows the card | **WARNING.** Reachable today (Trained Monkey ships in v1). This is a genuine under-specification of the COMM-02 contract this phase is supposed to deliver "end to end," but it requires a documented modeling decision more than a code fix, and no test currently exercises the interaction either way (silent gap, not an active wrong answer). Flagging for a human/product decision rather than blocking. |
| WR-04 | Latent `move-card` op can create a hand-size deadlock; the conservation check doesn't catch it | **INFO / not a gap against this phase's goal.** No registered v1 gear or boss twist emits `move-card` today — it is unreachable dead code from the player's perspective. It is a real hole in ENG-02's "checked automatically" promise for any *future* content author who reaches for this op, but does not fail any of this phase's five success criteria as currently shipped. Recommend closing before any future gear uses `move-card`, but not blocking Phase 10. |

### Human Verification Required

None. Every must-have and every review finding above was resolved by direct code inspection, running the existing test suite (516/516 passing across `packages/rules`), and an independently-authored reproduction of CR-01. Nothing here turns on visual, real-time, or subjective judgment that only a human can assess.

### Gaps Summary

One BLOCKER: Compass (`reroll`) is a registered, drafted, equippable v1 gear item that crashes the run on its most common legal use (any win-card objective target — the majority slot kind across the six-camp balance table). This falsifies GEAR-02 and ROADMAP success criterion 4 ("Each v1 gear item... works exactly as specced"), and REQUIREMENTS.md's GEAR-02 checkbox is currently ticked incorrectly. Everything else load-bearing for the phase goal — the run layer's supplies/replay/capacity/draft/loadout mechanics, the Whisper mechanic (both success criteria 1 and 2 explicitly), full-run deterministic replay (criterion 3), the boss twists, and the extensibility contract (criterion 5) — is real, substantive, wired, and test-covered, and I independently confirmed the RNG-purity and replay-determinism claims rather than trusting the SUMMARYs.

Two WARNINGs worth a human decision before Phase 11 builds on this layer (WR-02, WR-03); one INFO-level latent issue not currently reachable by any shipped content (WR-04) that should be tracked but does not block this phase.

Fixing CR-01 is scoped narrowly (one guard-clause change in `toolkit.ts`'s `replace-objective` case, plus a regression test, plus closing WR-01's harness blind spot so the same defect class is caught automatically going forward) — this does not require replanning the phase, just a closure plan against this one gap.

---

_Verified: 2026-09-27T07:46:08Z_
_Verifier: Claude (gsd-verifier)_
