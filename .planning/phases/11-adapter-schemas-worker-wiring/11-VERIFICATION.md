---
phase: 11-adapter-schemas-worker-wiring
verified: 2026-09-27T04:30:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification: []
---

# Phase 11: Adapter, Schemas & Worker Wiring Verification Report

**Phase Goal:** `ExpeditionAdapter` implements `GameAdapter` and is wired through Phase 8's registry seam; the per-seat view is built from an explicit allowlist and proven leak-free across whole simulated runs, not just immediately after a reveal.
**Verified:** 2026-09-27T04:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `expeditionGame` is a real `GameAdapter<RunState, RunAction, ExpeditionConfig, ExpeditionEndResult, RunError>` delegating to Phase 10's run engine and `toExpeditionPlayerView` | VERIFIED | `packages/rules/src/expedition/adapter/adapter.ts` — `createInitialState`→`createRun`, `applyAction`→`parseRunAction`+`applyRunAction`, `toPlayerView`→`toExpeditionPlayerView`, `checkGameEnd`→`runStatus`. Exported from `packages/rules/src/index.ts:37`. |
| 2 | `expeditionGame` is wired through Phase 8's `GAME_REGISTRY` seam (adapter, view/config schema, error mapper, limits) | VERIFIED | `apps/worker/src/game-registration.ts` imports `expeditionGame`, `ExpeditionViewSchema`, `ExpeditionConfigSchema`; registers an exhaustive `mapExpeditionError` over all 24 `RunError` members; `GAME_REGISTRY.expedition` entry present. `GameIdSchema`/`CreateRoomRequestSchema`/`GameErrorDetailSchema` widened in `packages/schema/src/room.ts` / `messages.ts` / `create-room.ts`. |
| 3 | Success criterion 1: the leak checker asserts no seat's view/log ever contains another seat's card (except an addressed reveal) at **every step** of full simulated runs, not only post-reveal | VERIFIED | `view.property.test.ts`'s `assertNoLeaksAt` and `run.property.test.ts`'s Property D both call `checkExpeditionViewForLeaks` for every seat + an unseated "spectator" viewer at **every** state in `driveRun(...).states`, not conditioned on reveal recency. `apps/worker/src/expedition-wiring.test.ts` repeats this at the room-integration layer, per step, until `status === "ended"`. All green (82/82 rules-package tests, 75/75 worker tests). |
| 4 | Success criterion 2: Thick Fog face-down objectives are omitted from the server view payload itself, not client-hidden | VERIFIED | `view.ts`'s objective-mapping loop only pushes an objective into the view array when `assignment === "face-up"` or `objective.ownerSeatId === seatId`; a face-down objective owned by another seat is never written into the returned object (confirmed by direct read, `packages/rules/src/expedition/adapter/view.ts`). `view-leak-check.ts` independently re-derives the same face-down id set from `RunState` (not by calling `view.ts`) and asserts absence; `faceDownChecks` non-vacuity counter > 0 in `view.property.test.ts`. |
| 5 | Success criterion 3: property-based runs across 3/4/5 players, every boss twist, random loadouts always end, never throw, conserve cards, never leak | VERIFIED (see caveat below) | `run.property.test.ts` Property D: `runStatus(final) !== "in_progress"` (ends), no throw (fast-check would surface it), supplies non-increasing + card-id conservation per attempt, leak-checked at every state (40 runs). `view.property.test.ts`: identical player-count/boss/loadout coverage, but with the seed forbidden-token scan always live (25 fast-check runs + one deterministic example per boss×player-count). `expedition-wiring.test.ts` repeats this end-to-end at the room layer with the seed scan active. Combined, every sub-claim (ends / never throws / conserves / never leaks including the seed) is exercised across the full input space — see caveat. |

**Score:** 5/5 truths verified.

### Caveat: leak-checker proof strength (11-REVIEW.md WR-01, WR-02, WR-04)

The code review (`11-REVIEW.md`, `critical: 0, warning: 6`) found no actual leak in the shipped `view.ts` — confirmed independently by reading `view.ts` and `view-leak-check.ts` directly. However it documents three real false-negative classes in the *checker itself* that weaken how airtight the "never leaks" proof is:

- **WR-01** — `run.property.test.ts`'s Property D (the single property whose header/plan literally claims to prove "always end, never throw, conserve cards, never leak" together — i.e. the property ENG-03's wording maps to most directly) calls `secretsForExpeditionSeat(state, id, CATALOG)` **without** the `seed` argument (confirmed by direct read, line 141 area). This means the seed forbidden-token scan (T-11-03) is inert inside that specific combined property — a seed leak there would go undetected. I verified this gap does **not** leave seed-leakage completely unproven: `view.property.test.ts` (`checkExpeditionViewForLeaks` called via `assertNoLeaksAt(state, seed)`) and `apps/worker/src/expedition-wiring.test.ts` (`secretsForExpeditionSeat(room.game as RunState, viewerId, undefined, seed)`) both pass the seed and cover the identical 3/4/5-player, every-boss-twist, random-loadout space (fast-check + deterministic per-boss/per-player-count examples). So "never leak the seed" IS proven for the full input space, just not inside the one property whose plan-level description implies it's the single unified proof.
- **WR-02** — the checker structurally cannot detect a regression that discloses a revealed card's *current* holder (only its identity-at-reveal-time is checked); this is exactly the WR-03 ruling's failure mode. `view.ts`'s `toRevealView` reads `reveal.fromSeatId` directly from the immutable historical `Reveal` record (not recomputed from current hand state), which is correct under the ruling today — confirmed by direct read. But if `view.ts` regressed to re-derive a reveal's current holder, no property or unit test (aside from one hand-written case in `view.test.ts`) would catch it.
- **WR-04** — the draft-offer and log-entry checks fail open (skip silently) if their expected keys are renamed/restructured, and other seats' private gear is detected only by exact forbidden-key name matching, not value-based comparison. Not a live leak today; a real hole in regression coverage.

None of these three warnings falsifies criteria 1-3 as **currently true of the codebase** — the actual `view.ts` projection is leak-free by direct code reading, and the checker does exercise the full 3/4/5/boss/loadout/every-step space (across the combination of `run.property.test.ts`, `view.property.test.ts`, and `expedition-wiring.test.ts`). What they do falsify is the *stronger* claim implicit in "proven leak-free" — the proof has three documented, unfixed classes of false negatives that would silently pass a future regression. This is real but does not currently block the phase goal, since (a) all three were already surfaced and scoped by code review rather than discovered fresh here, (b) the review rated them warning/info, not critical, and (c) none of them corresponds to an unproven success criterion today, only to weaker-than-claimed regression protection going forward. Recommend tracking WR-01/02/03/04 as a follow-up hardening item before or during Phase 12, rather than reopening Phase 11.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/rules/src/expedition/adapter/view-types.ts` | `ExpeditionView` type contract | VERIFIED | 174 lines, exported `ExpeditionView` + nested types |
| `packages/rules/src/expedition/adapter/view.ts` | `toExpeditionPlayerView` allowlist projection | VERIFIED | 308 lines, explicit per-field literal construction, no whole-state serializer |
| `packages/rules/src/expedition/adapter/adapter.ts` | `expeditionGame` `GameAdapter` | VERIFIED | 55 lines, thin delegation, matches interface exactly |
| `packages/rules/src/expedition/adapter/request-guards.ts` | `parseRunAction` exact-key hostile-input guard | VERIFIED | present, used by `adapter.ts` |
| `packages/rules/src/expedition/adapter/view-leak-check.ts` | `secretsForExpeditionSeat` / `checkExpeditionViewForLeaks` | VERIFIED (with documented false-negative classes, see caveat) | 275 lines, independently re-derives secrets from `RunState` without calling `view.ts` |
| `packages/schema/src/games/expedition.ts` | `ExpeditionViewSchema`, `ExpeditionConfigSchema`, `EXPEDITION_GAME_ID` | VERIFIED | 243 lines |
| `packages/schema/src/games/expedition-errors.ts` | closed 24-member error enum | VERIFIED | present, referenced by `game-registration.ts`'s exhaustive `mapExpeditionError` |
| `apps/worker/src/game-registration.ts` | `GAME_REGISTRY.expedition` entry | VERIFIED | 288 lines, imports adapter + schemas, exhaustive error map |
| `apps/worker/src/expedition-wiring.test.ts` | room-level integration proof | VERIFIED | 304 lines, drives lobby→in_progress→ended via real `room-state.ts` functions, schema + wire leak check at every step, seed passed |
| `packages/rules/src/index.ts` | leak-checker exports | VERIFIED | `checkExpeditionViewForLeaks`, `secretsForExpeditionSeat`, `expeditionGame` all exported |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `adapter.ts` | `run/run-actions.ts` | `applyRunAction(state, actorSeatId, parsed, CATALOG)` | WIRED | confirmed by read |
| `adapter.ts` | `view.ts` | `toExpeditionPlayerView(state, seatId, CATALOG)` | WIRED | confirmed by read |
| `game-registration.ts` | `@games/rules expeditionGame` | `defineGame<...>` | WIRED | confirmed by read |
| `game-registration.ts` | `@games/schema/games/expedition` | `viewSchema`/`configSchema` | WIRED | confirmed by read |
| `expedition-wiring.test.ts` | `seat-projection.ts` | `projectSeatView(room, seatId)` at every step | WIRED | confirmed by read + test run |
| `expedition-wiring.test.ts` | `@games/schema encodeServerMessage` | encode then leak-check the wire frame string | WIRED | confirmed by read + test run |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| COMM-03 | 11-01, 11-02, 11-03, 11-04, 11-05, 11-06, 11-07 | No player's view/log ever contains another seat's card except an addressed reveal, checked at every step of full simulated runs | SATISFIED (with proof-strength caveat above) | `view.ts`, `view-leak-check.ts`, `view.property.test.ts`, `run.property.test.ts`, `expedition-wiring.test.ts` |
| ENG-03 | 11-03, 11-04, 11-05, 11-07 | Property-based runs across 3/4/5 players, every boss twist, random loadouts always end, never throw, conserve cards, never leak | SATISFIED (with proof-strength caveat above) | `run.property.test.ts` Property D + `view.property.test.ts` + `expedition-wiring.test.ts`, all green |

No orphaned requirements: REQUIREMENTS.md maps only COMM-03 and ENG-03 to Phase 11, both declared in plan frontmatter and closed above.

### Anti-Patterns Found

None blocking. No `TBD`/`FIXME`/`XXX` markers found in phase-touched files. `11-REVIEW.md` WR-05/WR-06 (Expedition room creatable server-side with a placeholder board that lacks exit controls; native form path can't submit a valid Expedition request) are real but explicitly out of scope for Phase 11 per `11-06-PLAN.md`'s own scope note ("Out of scope... enabling the landing-page Expedition picker option... Phase 12 replaces it with the Phaser mount") and Phase 8 decision D-12 (picker stays disabled until Phase 12). Flagging as informational carry-forward for Phase 12, not a Phase 11 gap.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Rules-package Expedition adapter/view/leak-check suites | `npx vitest run --project rules <5 files>` | 82/82 passed | PASS |
| Worker registration/wiring/source-structure/seat-projection suites | `npx vitest run --project worker <4 files>` | 75/75 passed | PASS |
| Full workspace typecheck | `npm run typecheck` | clean (`tsc -b`, no errors) | PASS |

### Human Verification Required

None. All must-haves are programmatically verifiable and were verified against actual source, not SUMMARY.md claims.

### Gaps Summary

No blocking gaps. All three ROADMAP success criteria are true of the current codebase, confirmed by direct code reading and by rerunning the relevant test suites (not just trusting SUMMARY.md). The code review's WR-01/WR-02/WR-04 findings are real and worth fixing, but they describe weaknesses in the leak checker's *regression-detection* coverage, not an unproven or false success criterion today — see the caveat section above for the full reasoning per finding. WR-05/WR-06 are pre-existing, explicitly-scoped-out UI/form gaps that belong to Phase 12, not Phase 11.

---

_Verified: 2026-09-27T04:30:00Z_
_Verifier: Claude (gsd-verifier)_
