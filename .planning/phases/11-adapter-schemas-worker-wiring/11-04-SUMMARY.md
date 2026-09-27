---
phase: 11-adapter-schemas-worker-wiring
plan: 04
subsystem: rules-engine
tags: [expedition, per-seat-view, leak-checker, property-testing, fast-check, COMM-03, ENG-03]
dependency-graph:
  requires:
    - "ExpeditionView type contract + toExpeditionPlayerView (Plan 11-01)"
  provides:
    - "secretsForExpeditionSeat, checkExpeditionViewForLeaks, ExpeditionSeatSecrets, FORBIDDEN_VIEW_KEYS (packages/rules/src/expedition/adapter/view-leak-check.ts)"
    - "Whole-run every-step per-seat leak property proving COMM-03/ENG-03 (packages/rules/src/expedition/adapter/view.property.test.ts)"
  affects:
    - "Plan 11-05 (reuses checkExpeditionViewForLeaks/secretsForExpeditionSeat to replace gear.contract.test.ts's/boss.contract.test.ts's/run.property.test.ts's documented 'interim' structural checks)"
    - "Plan 11-07 (reuses the checker at the wire level)"
tech-stack:
  added: []
  patterns:
    - "Structural + typed-multiset + raw-token leak detection (Hanabi's hanabi-leak-check.ts three-layer design, mirrored for Expedition's card-id/objective-id/draft-offer/log-count surface)"
    - "Secrets derived independently from RunState, never from the projection under test (T-11-16, grep-enforced: 0 occurrences of the projection function name)"
    - "Deterministic fast-check `examples` (one per boss id x player count) guaranteeing non-vacuous coverage independent of fast-check's own random seed"
key-files:
  created:
    - packages/rules/src/expedition/adapter/view-leak-check.ts
    - packages/rules/src/expedition/adapter/view-leak-check.test.ts
    - packages/rules/src/expedition/adapter/view.property.test.ts
  modified: []
decisions:
  - "secretsForExpeditionSeat bumps allowedIdentityCounts once per REVEAL ENTRY addressed to the viewer (not once per distinct revealed card id) — the same card can legitimately be revealed to one seat twice (e.g. Spyglass, then later a Whisper), and the view's `reveals` array keeps both entries; deduping by card id undercounted and produced a false-positive leak, found by this plan's own whole-run property on its first real run"
  - "Objective identity bump order in secretsForExpeditionSeat matches toExpeditionPlayerView's own visibility rule exactly: face-up bumps every objective's target once regardless of ownership; face-down bumps only the viewer's own objectives' targets; an unseated viewer bumps none under face-down"
  - "view.property.test.ts's deterministic `examples` give seat 0 gear 'peek' (a between-tricks reveal, covering revealViewChecks) and seat 1 gear 'jam' (a pre-deal gear, covering preDealChecks) at every boss x player-count combination, so both otherwise-rare states are guaranteed present without relying on fast-check's random shrinking"
metrics:
  duration: ~35min
  completed: 2026-09-27
  tasks: 2
  files: 3
---

# Phase 11 Plan 04: Expedition Per-Seat Leak Checker & Whole-Run Property Summary

Built the Expedition analogue of `hanabi-leak-check.ts` — a per-seat leak checker whose secrets are derived independently of the projection it verifies — and a whole-run fast-check property that runs it for every seat plus an unseated viewer at every recorded state of full simulated runs across 3/4/5 players, every boss twist, and random loadouts, closing COMM-03 and ENG-03.

## What Was Built

**Task 1 — `view-leak-check.ts`: leak checker with independently-derived secrets and canary tests**

`ExpeditionSeatSecrets` (`hiddenIds`, `allowedIdentityCounts`, `forbiddenTokens`, `ownDraftOffer`, `visibleLogEntryCount`) is computed by `secretsForExpeditionSeat(state, seatId, catalog, seed?)` by walking `RunState` directly — it never calls `toExpeditionPlayerView` (verified by `grep -c "toExpeditionPlayerView" view-leak-check.ts` printing 0) and calls `rulesFor(...).objectiveAssignment(state)` exactly once, mirroring how `toExpeditionPlayerView` itself gates Thick Fog. `hiddenIds` collects every card id sitting in another seat's still-in-hand cards not yet revealed to the viewer, plus (under Thick Fog) every other seat's objective id. `allowedIdentityCounts` is a multiset bumped once per: card in the viewer's own hand (seated only), each reveal entry addressed to the viewer (found by re-deriving the card's identity from hands/completed tricks/current trick, independently of `view.ts`'s own `findCardIdentity`), every completed-trick and current-trick play, every removed card, and the target of every objective visible under the current assignment mode.

`checkExpeditionViewForLeaks({view, serialized, secrets})` runs four passes: (1) a structural walk flagging any `FORBIDDEN_VIEW_KEYS` member (`seed`, `objectiveDeck`, `draftOffer`, `hands`, `audience`, `ownedGearIds`, `readySeatIds`) present as an object key anywhere, and any string leaf value exactly equal to a `hiddenIds` entry; (2) a typed-multiset pass over every object carrying `{suit,rank}` or `{joker}`, flagging an observed count exceeding the allowed count; (3) a `yourDraftOffer`/`ownDraftOffer` JSON-equality check and an `attempt.log` length check against `visibleLogEntryCount`; (4) a raw substring scan of `serialized` for the seed. Twelve tests in `view-leak-check.test.ts` prove a clean baseline (real `toExpeditionPlayerView` output across a dealt face-up camp, a Thick Fog camp, a post-whisper state, a fresh fireside, and an unseated viewer, all `[]`) and eight canaries, one per detection surface named in the plan's `<behavior>` block (hidden hand card, three forbidden-key shapes in one test, seed-in-log-string, Thick Fog objective omission, reveal-audience gating, draft-offer mismatch, log-entry-count, and a leaked `handSizes[].cards` array).

**Task 2 — `view.property.test.ts`: whole-run every-step leak property**

Copies `seatIdsFor`/`bossPairArb`/`loadoutsArb` from `run.property.test.ts` (file-local there) and defines an identical `runInputArb` except the seed arbitrary is `fc.stringMatching(/^[0-9a-f]{32}$/)`, keeping the raw seed-substring scan live throughout. `assertNoLeaksAt(state, seed)` calls `toExpeditionPlayerView` and `checkExpeditionViewForLeaks` for every seat plus `"spectator"` at exactly one state, asserting `[]` unconditionally (never guarded by a reveal-conditional branch — only the six non-vacuity counters are conditionally incremented), and asserting the view JSON-round-trips.

`fc.assert` drives `runInputArb` at `numRuns: 25` alongside a deterministic `examples` list: one example per `(boss id, player count)` pair (12 total, covering all four registered bosses at 3/4/5 seats), each with a fixed 32-hex seed, a fixed 8-element choice stream, `startCamp: 3`, and loadouts giving seat 0 `["peek"]` (a between-tricks Spyglass reveal) and seat 1 `["jam"]` (a pre-deal gear) so `revealViewChecks` and `preDealChecks` are guaranteed positive independent of fast-check's own random seed. A second `it` proves draft-offer coverage deterministically via `createRun` (not `setupRun`, which clears every offer to null) at 3/4/5 seats. A final `it("non-vacuity")` asserts all six counters (`viewChecks`, `revealViewChecks`, `faceDownChecks`, `draftOfferChecks`, `unseatedChecks`, `preDealChecks`) are greater than 0. Measured runtime: ~1.6s for the whole file (well under the plan's 90s ceiling; `numRuns` left at 25, no reduction needed).

This property's first real run against the deterministic examples immediately found a genuine bug in Task 1's `secretsForExpeditionSeat` (see Deviations) — proving the property is not vacuous and does real work, not merely a self-confirming pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `secretsForExpeditionSeat` undercounted a card revealed to the same seat twice**
- **Found during:** Task 2 (the first `fc.assert` run against a deterministic example: 4 seats, boss pair `["eclipse", "radio-silence"]`)
- **Issue:** `revealedToViewer` was built as a `Set<string>` of card ids, so a card revealed to the viewer via two separate reveals (Spyglass's `peek`, then later a Whisper of the same card) was bumped into `allowedIdentityCounts` only once. The real view's `attempt.reveals` array legitimately keeps both reveal entries (one per reveal event, not deduped by card), so the actual observed count was 2 against an allowed count of 1 — the checker flagged a real, correctly-projected view as a leak (`typed:identity-count-exceeded:standard:spades:11`).
- **Fix:** Kept the `Set` only for the `hiddenIds` exclusion (whether the viewer may see the card at all), and changed the count-bumping loop to iterate the (unduplicated) list of reveal entries addressed to the viewer, bumping once per matching reveal entry rather than once per distinct card id.
- **Files modified:** `packages/rules/src/expedition/adapter/view-leak-check.ts`
- **Commit:** `97b1993`

---

**Total deviations:** 1 auto-fixed (Rule 1, bug in the checker itself, not in the projection under test)
**Impact on plan:** The fix corrects the checker's own secret-derivation logic to match the view's genuine multi-reveal semantics; no change to `toExpeditionPlayerView` or `view-types.ts` was needed. No scope creep — this is exactly the kind of bug T-11-16/T-11-18 exist to catch, discovered by the property this same plan built.

## Known Stubs

None. Both the checker and the whole-run property are fully implemented and exercised; no field or assertion is a placeholder.

## Threat Flags

None. Every threat register entry from this plan's `<threat_model>` (T-11-16, T-11-17, T-11-18, T-11-03) maps to a mitigation implemented and exercised: T-11-16 by the `toExpeditionPlayerView`-free construction of `secretsForExpeditionSeat` (grep-verified) plus the eight-canary suite proving each detection layer can fail; T-11-17 by the unconditional per-state assertion with no reveal-conditional guard; T-11-18 by the deterministic per-(boss, player-count) `examples` and the six-counter non-vacuity assertion; T-11-03 by the 32-hex seed arbitrary keeping the raw substring scan live. No new, unlisted surface was introduced.

## Self-Check: PASSED

- `packages/rules/src/expedition/adapter/view-leak-check.ts` — FOUND
- `packages/rules/src/expedition/adapter/view-leak-check.test.ts` — FOUND
- `packages/rules/src/expedition/adapter/view.property.test.ts` — FOUND
- Commit `34ac49f` (Task 1: leak checker + canary tests) — FOUND in `git log`
- Commit `97b1993` (Task 2: whole-run property + Rule 1 fix) — FOUND in `git log`
- `npx vitest run --project rules` — 792 tests passed (55 files)
- `npm run typecheck` — exits 0
