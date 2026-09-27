---
phase: 11-adapter-schemas-worker-wiring
plan: 01
subsystem: rules-engine
tags: [expedition, per-seat-view, redaction, adapter-prep, COMM-03]
dependency-graph:
  requires: []
  provides:
    - "ExpeditionView type contract (packages/rules/src/expedition/adapter/view-types.ts)"
    - "toExpeditionPlayerView(state, seatId, catalog) (packages/rules/src/expedition/adapter/view.ts)"
    - "WR-03 reveal-location ruling recorded on run/types.ts's Reveal.fromSeatId"
  affects:
    - "Plan 11-02 (Zod wire schema mirrors ExpeditionView field-for-field)"
    - "Plan 11-03 (ExpeditionAdapter.toPlayerView delegates to toExpeditionPlayerView)"
    - "Plan 11-04 (leak checker calls toExpeditionPlayerView across whole simulated runs)"
    - "Plan 11-06 (compile-time [ExpeditionView] extends [ExpeditionViewWire] assertion in game-registration.ts)"
tech-stack:
  added: []
  patterns:
    - "Own-hand-literal, no-spread projection (Hanabi's D-07 discipline, reused verbatim for Expedition)"
    - "Fail-closed unseated branch: every viewer-scoped field defaults to its least-privileged value when the seat is not found"
    - "Reveal-gated card visibility layered additively on top of hand-size-only base redaction"
key-files:
  created:
    - packages/rules/src/expedition/adapter/view-types.ts
    - packages/rules/src/expedition/adapter/view.ts
    - packages/rules/src/expedition/adapter/view.test.ts
  modified:
    - packages/rules/src/expedition/run/types.ts
decisions:
  - "adapter/ placed as a NEW subdirectory of expedition/ (not top-level) so it can import from ../run/ without tripping purity.test.ts's Core-boss/gear-agnostic guard"
  - "WR-03 resolved: a reveal pins identity + fromSeatId at reveal time and is never re-derived after a toolkit move/swap relocates the card"
  - "yourGear's reason string is passed through gearAvailability's own content-authored reason verbatim; Plan 11-04's leak checker still scans every string leaf"
metrics:
  duration: ~45min
  completed: 2026-09-27
  tasks: 2
  files: 4
---

# Phase 11 Plan 01: ExpeditionView Contract & toExpeditionPlayerView Summary

Defined the canonical `ExpeditionView` type contract and implemented `toExpeditionPlayerView(state, seatId, catalog)` as a field-by-field allowlist projection of `RunState`, closing COMM-03's access-control boundary and settling the Phase 10 WR-03 deferral (reveal location after a toolkit card move).

## What Was Built

**Task 1 — `ExpeditionView` type contract (`packages/rules/src/expedition/adapter/view-types.ts`)**
Every nested view type from the plan's `<interfaces>` block, as plain mutable arrays (no `readonly`), with zero imports beyond `import type { StandardRank, Suit } from "../state"`. The file header documents which keys realize spec section 6.4 and which keys are deliberately absent (`seed`, `objectiveDeck`, another seat's `draftOffer`, `audience`). Also recorded the WR-03 ruling as a comment-only edit to `run/types.ts`'s PRIVACY NOTES block and on `Reveal.fromSeatId` itself: a reveal pins a card's identity plus the seat that held it at reveal time; it is never re-derived after a later toolkit op relocates the card.

**Task 2 — `toExpeditionPlayerView` (`packages/rules/src/expedition/adapter/view.ts`)**
A pure projection function following `hanabi/projection.ts`'s discipline: no spread/`delete`/`Object.assign` anywhere, every returned object built as a named-key literal. Structure:
- Public fields (`runPhase`, `runStatus`, `campNumber`, `supplies`, `bossTwists`, `activeBossTwistId`, `seats`, `history`) computed once, identical for every seat.
- Viewer-scoped fields (`yourOwnedGearIds`, `yourDraftOffer`, `yourCapacity`, `yourGear`) default to their least-privileged value (`[]`/`null`) when the seat is not found — fail-closed by construction.
- `attempt`/`camp` built only when `state.attempt`/`.camp` exist; reveals are filtered by `reveal.audience.includes(seatId)` before their identity is looked up (across hands, then completed tricks, then the current trick — a card that can't be found is skipped, never thrown); log entries are filtered by `entry.audience === "public" || audience.includes(seatId)`, then mapped to a `private: boolean` flag with no `audience` key ever written; Thick Fog objective omission filters the array to `ownerSeatId === seatId` (empty for an unseated viewer) rather than masking entries; `yourLegalCardIds` is populated only when the viewer is the current actor during `"playing"`.

Eleven tests in `view.test.ts` (fireside, dealt face-up camp, Thick Fog, Whisper reveal gating, the WR-03 moved-card case, unseated viewer, `yourLegalCardIds` gating, and purity/JSON round-trip) all pass on first implementation attempt (no RED→debug cycle needed — RED was confirmed by the missing-module error before `view.ts` existed).

## Deviations from Plan

None — plan executed exactly as written. Both tasks' acceptance-criteria greps (readonly count, forbidden-key absence, spread/assign/delete absence, `rulesFor` call-count, `blind-orders`/`whisper` fixture presence) passed without needing any adjustment, and `npm run typecheck` plus the whole `packages/rules/src/expedition` suite (532 tests, including `purity.test.ts`) were green after the second commit with no regressions.

## Known Stubs

None. This plan's scope (the view type contract and its projection function) is fully implemented and tested; no field is a placeholder.

## Threat Flags

None. Every threat register entry (T-11-01 through T-11-06, T-11-12) from this plan's `<threat_model>` maps to a mitigation already implemented and exercised by `view.test.ts` (own-hand/other-hand size split, Thick Fog omission, seed absence, draft-offer/owned-gear per-seat-only, reveal/log audience gating, WR-03 pinned `fromSeatId`). No new, unlisted surface was introduced.

## Self-Check: PASSED

- `packages/rules/src/expedition/adapter/view-types.ts` — FOUND
- `packages/rules/src/expedition/adapter/view.ts` — FOUND
- `packages/rules/src/expedition/adapter/view.test.ts` — FOUND
- Commit `b02903f` (Task 1: ExpeditionView contract + WR-03 ruling) — FOUND in `git log`
- Commit `4be9810` (Task 2: toExpeditionPlayerView implementation) — FOUND in `git log`
