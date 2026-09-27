---
phase: 11-adapter-schemas-worker-wiring
plan: 07
subsystem: worker-integration
tags: [expedition, room-layer, wiring, leak-checker, integration-test, COMM-03, ENG-03]
dependency-graph:
  requires:
    - "checkExpeditionViewForLeaks/secretsForExpeditionSeat (Plan 11-04, packages/rules/src/expedition/adapter/view-leak-check.ts)"
    - "GAME_REGISTRY.expedition, EXPEDITION_GAME_ID, ExpeditionViewSchema (Plan 11-06)"
  provides:
    - "checkExpeditionViewForLeaks/secretsForExpeditionSeat/ExpeditionSeatSecrets re-exported from @games/rules's barrel (packages/rules/src/index.ts)"
    - "apps/worker/src/expedition-wiring.test.ts: six full Expedition room-layer runs (3/4/5 seats x two seeds) proving lobby -> in_progress -> ended with per-step schema + wire leak checks"
    - "source-structure.test.ts A9-expedition / D-11-expedition confinement assertions for expeditionGame and the 'expedition' string literal"
  affects:
    - "Phase 12 (Phaser shell) inherits proof that a client holding only its own projected view has enough information to drive every Expedition action type"
tech-stack:
  added: []
  patterns:
    - "View-only bot: builds action candidates SOLELY from projectSeatView's own filtered view (never room.game), filtering every candidate through the real applyGameAction — same discipline as run-test-support.ts's enumerateLegalRunActions, now proven at the room layer"
    - "Per-step schema + encoded-wire-frame leak check for every seat plus an unseated 'spectator' viewer, secrets derived independently from RunState with the seed passed through for the raw substring scan (T-11-03)"
key-files:
  created:
    - apps/worker/src/expedition-wiring.test.ts
  modified:
    - packages/rules/src/index.ts
    - apps/worker/src/source-structure.test.ts
decisions:
  - "set-loadout candidates tracked via a key of seatId + view.campNumber + view.history.length (read from the bot's own VIEW, never room.game) so set-loadout is tried at most once per seat per fireside visit, letting 'ready' get a turn instead of looping on an always-legal set-loadout"
  - "Per-step action selection iterates seats starting at index (step mod seatCount), trying each seat's full candidate list in priority order until one is accepted by the real applyGameAction, before advancing to the next seat — avoids seat starvation across fireside/pre-deal windows where multiple seats can legally act"
  - "Two fixed 32-lowercase-hex seeds ('1111...8888', '89ab...89ab') chosen for determinism (no fast-check/Math.random) while keeping the seed-substring wire scan live at every step"
metrics:
  duration: ~20min
  completed: 2026-09-27
  tasks: 2
  files: 3
---

# Phase 11 Plan 07: Room-Layer Expedition Wiring Proof Summary

Proved the whole Expedition wiring end to end at the room layer used by the Durable Object: six full runs (3/4/5 seats x two fixed seeds) go `lobby -> in_progress -> ended` through `room-state.ts`'s real `createEmptyRoom`/`joinRoom`/`startGame`/`applyGameAction`, driven entirely by bots that read only their own `projectSeatView` output (never `room.game`), with every step's projected view schema-validated and every encoded wire frame leak-checked — closing the gap where a nested field could satisfy compile-time assertions yet fail strict runtime parsing.

## What Was Built

**Task 1 — Export the leak checker; extend structural confinement**

`packages/rules/src/index.ts` gained `checkExpeditionViewForLeaks`/`secretsForExpeditionSeat`/`ExpeditionSeatSecrets` exports, mirroring the existing Hanabi leak-check export, so worker tests can import them from `@games/rules` without a deep subpath.

`apps/worker/src/source-structure.test.ts` gained two new assertions in the same describe block as the existing A9/D-11 Hanabi confinement tests: `A9-expedition` proves `expeditionGame` occurs at least once in `game-registration.ts` and nowhere else among non-test worker sources; `D-11-expedition` proves the string literal `"expedition"` (any quote style) appears in no non-test src file other than `game-registration.ts`.

**Task 2 — Room-level Expedition wiring test**

`apps/worker/src/expedition-wiring.test.ts` (new, 304 lines):

- **Lobby/limits describe block** (4 tests): first join with `gameId: "expedition"` locks the room (`gameId` and `config: null`); `startGame` with 1 or 2 seats is refused `bad_request`; a 6th join is refused `full`; a 3-seat `startGame` succeeds.
- **Full-run describe block** (6 `it`s + 1 non-vacuity `it`, 120000ms timeout each): for each of 3/4/5 player counts x two fixed 32-hex seeds, `driveExpeditionRoomToEnd` starts a room and loops while `room.status === "in_progress"` (20000-step bound). At every step, for every seat plus the unseated id `"spectator"`: `projectSeatView` is asserted non-null for seats; the result is encoded via `encodeServerMessage({ type: "state", view })`; `checkExpeditionViewForLeaks` is asserted `[]` against secrets from `secretsForExpeditionSeat(room.game as RunState, id, undefined, seed)` (the only two places `room.game` is read at all — never `.attempt`/`.seats` directly, verified by grep). A bot then picks the next action: `buildCandidates` builds a priority-ordered candidate list (pick-draft, set-loadout-once-per-visit, ready, use-gear across all target-arity combinations, whisper, skip-window, pick-objective, play-card) from the seat's OWN view only, iterating seats starting at `step mod seatCount`; the first candidate any seat's real `applyGameAction` accepts is committed. After the loop, `room.status === "ended"` and `GAME_REGISTRY.expedition.adapter.checkGameEnd(room.game)` returns a valid `{ outcome, campReached: 1-6, suppliesLeft >= 0 }`. A final non-vacuity test asserts fireside and camp views were both checked, at least one checked view had a non-empty `reveals` list, and at least one had a spent gear item — proving whisper/gear-reveal traffic genuinely reached the wire, not just the lobby/camp-start states.

All 11 tests pass in 627ms (well under the plan's 60s target).

## Deviations from Plan

None — plan executed exactly as written. All acceptance-criteria greps passed on first attempt: `projectSeatView(` (3), `encodeServerMessage` (2), `checkExpeditionViewForLeaks` (3), the forbidden `(room.game as RunState).attempt|.seats` pattern (0), `"spectator"` (4), `Math.random` (0). No candidate-priority or seed adjustments were needed — the non-vacuity counters were positive on the first run.

## Known Stubs

None.

## Threat Flags

None. This plan's own threat register (T-11-23, T-11-09, T-11-21, T-11-24) is exactly what `expedition-wiring.test.ts` proves: T-11-23 by the per-step encoded-wire-frame leak check including the seed scan; T-11-09 by asserting `projectSeatView` non-null (strict runtime parse) at every step for every seat; T-11-21 by the new A9-expedition/D-11-expedition structural confinement assertions; T-11-24 by the bot failing the test with the step number and runPhase if no seat has an accepted candidate, bounded at 20000 steps. No new, unlisted surface was introduced.

## Self-Check: PASSED

- `apps/worker/src/expedition-wiring.test.ts` — FOUND
- `packages/rules/src/index.ts` — FOUND (modified, `checkExpeditionViewForLeaks` export present)
- `apps/worker/src/source-structure.test.ts` — FOUND (modified, `A9-expedition`/`D-11-expedition` present)
- Commit `a85f869` (Task 1: leak-checker export + structural confinement) — FOUND in `git log`
- Commit `6dee45d` (Task 2: room-layer wiring test) — FOUND in `git log`
- `npx vitest run --project worker apps/worker/src/source-structure.test.ts` — 31 tests passed
- `npx vitest run --project worker apps/worker/src/expedition-wiring.test.ts` — 11 tests passed
- `npm run typecheck` — exits 0
- `npm test` (full workspace) — 1812 tests passed (122 files)
