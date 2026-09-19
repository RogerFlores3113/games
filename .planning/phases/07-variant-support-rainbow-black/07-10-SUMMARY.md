---
phase: 07-variant-support-rainbow-black
plan: 10
subsystem: rules-engine

# Dependency graph
requires:
  - phase: 07-variant-support-rainbow-black
    provides: "Per-suit SuitRule table in variant.ts (07-09), the single source Black's direction/copy rules are added onto"
provides:
  - "SuitRule.direction (ascending | descending) declared once per-suit in variant.ts's SUIT_RULES table"
  - "DESCENDING_RANK_COUNTS (3/2/2/2/1) replacing SINGLE_RANK_COUNTS for Black; Black deck is now 70 tiles"
  - "playOrderFor(config, suit), nextPlayableRank(config, stack), isStackComplete(stack) -- the only direction-aware helpers in the engine, exported from packages/rules"
  - "StackEntry { suit, playedRanks: Rank[] } replacing { suit, topRank: number } across the engine's internal state (wire field topRank still bridged to playedRanks.length for 07-11)"
  - "ROOM_SCHEMA_VERSION 4: a pre-change persisted room resets rather than re-entering the engine with a topRank-shaped stack"
affects: ["07-11 (wire StackView, web client, e2e) -- must replace topRank with playedRanks directly and update PlayedStack.tsx/EndOverlay.tsx/hanabi-visual-logic.ts/e2e readers in the same task"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A suit's play direction is a data-table lookup (SuitRule.direction), not a code branch on the suit's literal name -- same discipline 07-09 established for colorTouch"
    - "Stack progress represented as playedRanks: Rank[] (ranks in the order played) rather than a single topRank number, so a reversed suit's stack never has a numeric 'top' that could be misread as ascending progress"

key-files:
  created: []
  modified:
    - packages/rules/src/hanabi/variant.ts
    - packages/rules/src/index.ts
    - packages/rules/src/hanabi/variant.test.ts
    - packages/rules/src/hanabi/deck.test.ts
    - packages/rules/src/hanabi/variant-matrix.test.ts
    - packages/rules/src/hanabi/termination.property.test.ts
    - packages/rules/src/hanabi/state.ts
    - packages/rules/src/hanabi/adapter.ts
    - packages/rules/src/hanabi/actions.ts
    - packages/rules/src/hanabi/actions.test.ts
    - packages/rules/src/hanabi/endgame.ts
    - packages/rules/src/hanabi/endgame.test.ts
    - packages/rules/src/hanabi/projection.ts
    - packages/rules/src/hanabi/test-support.ts
    - packages/rules/src/hanabi/hanabi-leak-check.ts
    - packages/rules/src/hanabi/hanabi-leak-check.test.ts
    - packages/rules/src/hanabi/legality.test.ts
    - packages/rules/src/hanabi/projection.test.ts
    - packages/schema/src/constants.ts
    - apps/worker/src/persistence.test.ts
    - apps/worker/src/room-state.test.ts

key-decisions:
  - "Black's rank distribution changed from SINGLE_RANK_COUNTS (one of each rank, 5 tiles) to DESCENDING_RANK_COUNTS (three 5s, two each of 4/3/2, one 1, 10 tiles) -- deletes SINGLE_RANK_COUNTS entirely per the owner's verbatim UAT gap-3 correction"
  - "Direction lives only in the variant configuration (SuitRule.direction); the engine reaches it exclusively through playOrderFor/nextPlayableRank/isStackComplete -- no === \"black\" comparison exists anywhere in actions.ts, endgame.ts, or legality.ts"
  - "The wire field topRank is kept as the bridge value playedRanks.length through this plan (DESIGN DECISION recorded in 07-10-PLAN.md), so apps/web and e2e stay untouched and green at every commit; 07-11 is the plan that replaces the wire field with playedRanks directly"
  - "RULES-13's clue-token refund now fires on isStackComplete(newStack) rather than card.rank === 5, so Black's completing 1 refunds a token exactly the same way any suit's completing 5 does"
  - "ROOM_SCHEMA_VERSION bumped 3 -> 4 (not reused) because the persisted game blob's stack shape changed incompatibly; a stored version-3 room now resets to an empty lobby, proven by a new persistence.test.ts case"

patterns-established:
  - "A stack's completion condition is direction-agnostic: isStackComplete checks playedRanks.length === RANKS.length, never a specific rank value -- this is what let the RULES-13 refund generalize from 'a 5' to 'the tile that completes the stack' without a suit-specific branch"

requirements-completed: [RULES-02, RULES-03, RULES-13]

duration: ~70min
completed: 2026-09-18
---

# Phase 7 Plan 10: Black becomes a reversed suit (engine) Summary

**Black is now a descending, 10-tile suit (three 5s, two each of 4/3/2, one 1) played 5→4→3→2→1, driven entirely through a new `direction` field on the variant configuration's per-suit rule table -- no `=== "black"` special case exists anywhere in play legality, scoring, or completion logic.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-09-18T19:39:00Z (approx, first file read)
- **Completed:** 2026-09-18T20:00:00Z
- **Tasks:** 2/2 completed
- **Files modified:** 22

## Accomplishments
- `SuitRule` gained a `direction: "ascending" | "descending"` field; Black is the only descending suit in every variant. `DESCENDING_RANK_COUNTS` (3/2/2/2/1) replaces `SINGLE_RANK_COUNTS`, making the Black deck 70 tiles (5×10 colours + Rainbow 10 + Black 10) and the max score in Black stays 35.
- Three new pure helpers in `variant.ts`, exported from `packages/rules`: `playOrderFor(config, suit)` (RANKS ascending, or its reverse), `nextPlayableRank(config, stack)` (the next rank a play must match, or `null` once complete), `isStackComplete(stack)` (true once every rank in play order has been played).
- `StackEntry` changed from `{suit, topRank}` to `{suit, playedRanks: Rank[]}` (ranks in the order played) across the engine's internal `HanabiState`. `actions.ts`'s play legality reads `nextPlayableRank(config, stack)` instead of `topRank + 1`; the RULES-13 clue-token refund now fires on `isStackComplete(newStack)` instead of `card.rank === 5`, generalizing correctly to Black's completing 1. `endgame.ts` scores by `playedRanks.length` (tile count), never rank value.
- `projection.ts` keeps the wire field `topRank` bridged to `playedRanks.length` per the plan's binding DESIGN DECISION -- identical to today's value for every ascending stack -- so `apps/web` and its tests stay green untouched; 07-11 is the plan that swaps the wire shape.
- `ROOM_SCHEMA_VERSION` bumped 3 → 4: a room persisted before this plan (topRank-shaped stacks) now resets to an empty lobby on load rather than re-entering the new engine with a stack shape it can't understand, proven by a new `persistence.test.ts` case.
- Direction-aware Black play proven at two layers: `actions.test.ts` (engine unit level -- black 5 then black 4 succeed in sequence, a black 1 on an empty stack misplays, the completing 1 refunds a token) and a new `room-state.test.ts` describe block (server-side room action path -- same three behaviors through `applyGameAction`, with hands crafted the same way the existing forged-colour-clue tests do).

## Task Commits

Each task was committed atomically:

1. **Task 1: Variant table -- Black is a descending suit with three 5s, two each of 4/3/2, one 1** - `3b3d389` (fix)
2. **Task 2: Direction-aware engine -- playedRanks stack model, legality, completion refund, score, schema version** - `43bccb3` (fix)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `packages/rules/src/hanabi/variant.ts` - `StackDirection`, `DESCENDING_RANK_COUNTS`, `direction` on `SuitRule`, `playOrderFor`/`nextPlayableRank`/`isStackComplete`
- `packages/rules/src/index.ts` - Exports the new direction helpers and types for 07-11's web consumers
- `packages/rules/src/hanabi/state.ts` - `StackEntry.playedRanks` replaces `topRank`; `HanabiView.stacks` (wire) unchanged in this plan
- `packages/rules/src/hanabi/adapter.ts` - Initial stacks start `playedRanks: []`
- `packages/rules/src/hanabi/actions.ts` - Play legality via `nextPlayableRank`; completion refund via `isStackComplete`
- `packages/rules/src/hanabi/endgame.ts` - `currentScore` sums `playedRanks.length`
- `packages/rules/src/hanabi/projection.ts` - Wire `topRank` bridged to `playedRanks.length`, with a comment pointing at 07-11
- `packages/rules/src/hanabi/test-support.ts` - `locateAllCards` conservation walk iterates `playedRanks`
- `packages/rules/src/hanabi/hanabi-leak-check.ts` - Comments updated to describe the new stack shape without asserting the wire field's exact literal (kept grep-clean per acceptance criteria)
- `packages/schema/src/constants.ts` - `ROOM_SCHEMA_VERSION = 4`
- `packages/rules/src/hanabi/{variant,deck,variant-matrix,termination.property,actions,endgame,legality,projection,hanabi-leak-check}.test.ts` - Rewritten for the 70-tile Black deck, `playedRanks`, and new direction-aware end-condition constructions (variant-matrix's completing-card case is now generic via `playOrderFor`, not a hardcoded rank-5)
- `apps/worker/src/persistence.test.ts` - New schemaVersion-3-resets case
- `apps/worker/src/room-state.test.ts` - New "Black plays in reverse through the room action path" describe block

## Decisions Made
See `key-decisions` in frontmatter. Most notable: direction is config-driven and read only through the three new helpers -- confirmed by grep that no engine module (`actions.ts`, `endgame.ts`, `legality.ts`) contains a `"black"` string comparison in logic.

## Deviations from Plan

None — plan executed exactly as written. The plan's own read_first note flagged `apps/worker/src/room-do.test.ts` and `apps/worker/src/seat-projection.test.ts` as files with a `topRank` hit each; both were confirmed unchanged (they construct wire-shaped `HanabiView`/room-view objects, not engine `HanabiState`, so the bridge in `projection.ts` keeps them green without edits).

## Issues Encountered
- The first draft of the new Black actions.test.ts case ("black 5 then black 4") failed because `applyHanabiAction` advances the turn after each accepted action, and the second play was submitted from the same seat whose turn had already passed. Fixed by rewinding `turnIndex` back to the acting seat between the two plays in the test fixture (turn order is not what that test exercises) -- not a deviation, a test-authoring correction caught immediately by the suite.
- TypeScript rejected `playedRanks: [1, 2, 3, 4]` array literals as `readonly (1|2|3|4|5)[]` without `as const`; added `as const` at each such literal in `actions.test.ts`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 07-11 can now import `nextPlayableRank`/`playOrderFor`/`isStackComplete`/`playedRanks` types directly from `packages/rules` for its wire/web work.
- 07-11's job: replace `HanabiView.stacks`'s wire field `topRank` with `playedRanks` directly, and update every downstream consumer in the same task -- `packages/schema/src/games/hanabi.ts`'s `StackViewSchema`, `apps/web/components/hanabi/PlayedStack.tsx`, `apps/web/components/hanabi/EndOverlay.tsx`, `apps/web/lib/hanabi-visual-logic.ts`, and `e2e/start-game.spec.ts`'s `data-top-rank` readers. `projection.ts`'s bridging comment (`// Wire field topRank is bridged...`) marks the exact line to change.
- Both dev servers (web :3100, worker :8787) were restarted in the background after this plan's last task and confirmed listening, per executor rules. No Playwright run was needed in this plan (no UI/wire changes), so no e2e verification was performed here.

---
*Phase: 07-variant-support-rainbow-black*
*Completed: 2026-09-18*

## Self-Check: PASSED
All claimed commits (3b3d389, 43bccb3) and key files verified present on disk / in git log.
