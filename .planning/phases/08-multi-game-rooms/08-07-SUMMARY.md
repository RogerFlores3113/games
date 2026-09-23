---
phase: 08-multi-game-rooms
plan: 07
subsystem: api
tags: [registry, test-fixture, source-structure, vitest, wrangler-dry-run]

# Dependency graph
requires:
  - phase: 08-multi-game-rooms
    provides: "08-03 (gameId-keyed GAME_REGISTRY, injectable `games` parameter on every registry-reading room-state.ts/seat-projection.ts function), 08-04/08-05 (RoomState/RoomView carry gameId/config/limits), 08-06 (joinRoom's first-join gameId locking)"
provides:
  - "apps/worker/test/toy-game.ts: a minimal, test-only second GameAdapter (3-4 seat limits, its own strict config/view schemas, its own closed error codes) — TOY_GAME_ID, toyGameEntry, TEST_GAME_REGISTRY, LEAKY_TOY_REGISTRY"
  - "apps/worker/src/registry.test.ts: end-to-end proof that room-state.ts/seat-projection.ts's pure functions dispatch correctly per-game through an injected registry — seat limits, config validation, view-schema validation, first-join locking, unknown-gameId refusal, prototype-key rejection, Hanabi+toy coexistence, production isolation"
  - "source-structure.test.ts D-10/D-11 assertions: the toy game is structurally confined to tests (no src import, no __toy__ literal), no src file branches on gameId === \"literal\", the \"hanabi\" literal is confined to game-registration.ts"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Test-only game fixtures live in apps/worker/test/ (not src/), imported only by a src/*.test.ts file, so tsc -b still typechecks them (via the test file's import) while source-structure.test.ts's src-only file scan never sees a second toPlayerView( call site"
    - "A toy GameAdapter proves the registry's dependency-injection seam (the `games: GameRegistry = GAME_REGISTRY` parameter every room-state.ts/seat-projection.ts function already took) rather than requiring any new registration mechanism, env-var gate, or mutable module-level registry"

key-files:
  created:
    - apps/worker/test/toy-game.ts
    - apps/worker/src/registry.test.ts
  modified:
    - apps/worker/src/source-structure.test.ts

key-decisions:
  - "No env-var/NODE_ENV gate was needed for D-10 (unlike RESEARCH.md's speculative `registerTestGame`/env-detection design): plans 08-03 to 08-06 already built the injectable `games: GameRegistry = GAME_REGISTRY` parameter on every registry-reading function, so the toy game reaches production code purely by constructing a plain `TEST_GAME_REGISTRY` object and passing it as an explicit argument — no runtime guard, no module-level mutable state, no wrangler --var wiring needed. D-10's five required behaviors are all provable at the room-state.ts/seat-projection.ts pure-function layer (RESEARCH.md's recommended option (b)), so room-do.ts's wrangler-dev integration test was left untouched."
  - "The toy's error codes (toy_not_your_turn, toy_bad_request) are mapped to GameErrorDetail via an explicit `as unknown as GameErrorDetail` cast, mirroring the plan's own instruction — GameErrorDetail's real discriminated union has no TOY_GAME_ID member (D-09), so this is the toy's deliberate escape hatch, exercised only by registry.test.ts's direct pure-function calls, never by anything reaching ServerMessageSchema.parse."
  - "The D-11 gameId-branching guard regex (`/gameId\\s*[!=]==\\s*[\"'\\`]/`) was applied to ALL non-test src files including game-registration.ts itself, per the plan's explicit instruction — confirmed zero matches today since game-registration.ts resolves games only through resolveGame()/Object.hasOwn, never a gameId string comparison."

patterns-established: []

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-09-23
---

# Phase 8 Plan 07: Prove the Game Registry With a Test-Only Toy Game Summary

**A structurally different second `GameAdapter` (3-4 seat limits, its own strict config/view schemas, its own closed error codes) runs end-to-end through the SAME production `room-state.ts`/`seat-projection.ts` pure functions Hanabi uses — proving D-10's registry dispatch, D-01's first-join locking, and D-11's "no gameId branching outside the registry" — while remaining structurally unreachable from the production bundle, confirmed against a real `wrangler deploy --dry-run` output.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files modified:** 2 created + 1 modified

## Accomplishments

- `apps/worker/test/toy-game.ts` (new, outside `src/` so it can never inflate `source-structure.test.ts`'s single-`toPlayerView(`-call-site count): a full, invariant-upholding `GameAdapter<ToyState, ToyAction, ToyConfig, ToyEndResult, ToyErrorCode>` with `limits: { min: 3, max: 4 }` (structurally different from Hanabi's 2-5), a strict `ToyConfigSchema` (`{ rounds: 1|2|3 }`), a strict `ToyViewSchema` (`{ you, turnSeatId, rounds }`), and two closed error codes (`toy_not_your_turn`, `toy_bad_request`) mapped via an exhaustive `never`-defaulted switch, mirroring `game-registration.ts`'s own `mapError` pattern exactly. Exports `TEST_GAME_REGISTRY` (Hanabi + toy, via the existing `GAME_REGISTRY` spread) and `LEAKY_TOY_REGISTRY` (a toy entry whose `toPlayerView` adds an unexpected `secret` key, for proving fail-closed view dispatch).
- `apps/worker/src/registry.test.ts` (new, 20 tests): proves every D-10 behavior bullet by calling `joinRoom`/`startGame`/`setConfig`/`applyGameAction`/`toSeatView`/`validateGameView`/`projectSeatView` directly with `TEST_GAME_REGISTRY` (or `LEAKY_TOY_REGISTRY`) as the injected `games` argument — no new registration mechanism, no env-var gate, no mutable module state: the dependency-injection seam plans 08-03 to 08-06 already built (`games: GameRegistry = GAME_REGISTRY` on every registry-reading function) is sufficient by itself.
  - Seat limits: a toy room's 5th join is refused `full` at 4 seats (Hanabi's own limit is 5); `startGame` at 2 seats is `bad_request`, at 3 seats succeeds.
  - Config: fail-closed in both directions — a toy room accepts `{ rounds: 2 }`, refuses a bare Hanabi variant string, refuses an out-of-union `rounds: 9`, refuses an extra-key payload (strict schema); a Hanabi room refuses a toy-shaped config. State is unchanged on every refusal (asserted directly against the pre/post `state.config`).
  - View dispatch: a started toy room's projected view passes `ToyViewSchema` and carries the toy's own `limits`/`gameDisplayName`; the leaky adapter's extra key fails `projectSeatView` closed to `null`; a Hanabi-shaped `game` under a toy `gameId` fails `validateGameView` closed to `null`.
  - D-01 locking: a first join with `gameId: TOY_GAME_ID` sets `gameId`, adopts the toy's `defaultConfig`, and flips `gameLocked: true`; a later join or a reclaim carrying `gameId: "hanabi"` leaves the locked room's `gameId` unchanged.
  - Unknown ids: a first join with an unregistered `gameId` is refused `bad_request`; `resolveGame("__proto__"|"toString", TEST_GAME_REGISTRY)` is `undefined` (Object.hasOwn guard, T-8-06 reused).
  - Coexistence: a 2-seat Hanabi room and a 3-seat toy room, built against the SAME `TEST_GAME_REGISTRY`, both start; each seat's projected view validates against its own game; a toy out-of-turn action returns `{ gameId: TOY_GAME_ID, code: "toy_not_your_turn" }` while a Hanabi out-of-turn discard returns `{ gameId: "hanabi", code: "not_your_turn" }` — two independently namespaced error vocabularies from one registry.
  - Production isolation: `GameIdSchema.options` is `["hanabi"]`, `GameIdSchema.safeParse(TOY_GAME_ID).success` is `false`, `Object.keys(GAME_REGISTRY)` is `["hanabi"]`, and a `join` frame carrying the toy `gameId` fails `parseClientMessage` closed to `bad_request`.
- `apps/worker/src/source-structure.test.ts` gained three new assertions in the same comment-stripped, exact-count style as the existing A1-A9 chokepoint audit: (1) no non-test `src` file references `toy-game`, imports a `test/` path, or contains the `__toy__` literal (D-10); (2) no `src` file — including `game-registration.ts` itself — matches `gameId\s*[!=]==\s*["'`]` (D-11/Pitfall 17, no gameId-to-literal branching anywhere); (3) the `"hanabi"` string literal appears in no non-test `src` file other than `game-registration.ts` (D-11/D-08).
- Bundle proof (D-14, no real deploy): `cd apps/worker && npx wrangler deploy --dry-run --outdir /tmp/gsd-08-07-bundle` produced `Total Upload: 852.82 KiB / gzip: 141.85 KiB` and `--dry-run: exiting now.` — no `Uploaded`/`Deployed`/`Published` line anywhere in the output. `grep -rc "__toy__" /tmp/gsd-08-07-bundle` reported `0` for every file (`README.md`, `index.js`, `index.js.map`); `grep -rl "Toy Test Game" /tmp/gsd-08-07-bundle` printed nothing. The temporary output directory was deleted after inspection.
- Full gate green throughout: `npm test` 1108/1108 (up from 1085 pre-plan: +20 registry.test.ts, +3 source-structure assertions), `npm run typecheck` (root `tsc -b`) clean after both commits.

## Task Commits

Each task was committed atomically:

1. **Task 1: Test-only toy game fixture and D-10 registry proof** — `1df99c8` (test)
2. **Task 2: Production-isolation guards (source structure + bundle check)** — `ecd9480` (test)

## Files Created/Modified

- `apps/worker/test/toy-game.ts` — new: toy `GameAdapter`, `ToyConfigSchema`/`ToyViewSchema`, `toyGameEntry`, `TEST_GAME_REGISTRY`, `LEAKY_TOY_REGISTRY`
- `apps/worker/src/registry.test.ts` — new: 20 tests proving D-10's registry dispatch end to end
- `apps/worker/src/source-structure.test.ts` — three new assertions (D-10 confinement, D-11 gameId-branching ban, D-11/D-08 "hanabi" literal confinement)

## Decisions Made

- No env-var/`NODE_ENV`-gated registration mechanism was built, despite RESEARCH.md flagging this as the likely D-10 design (MEDIUM confidence, Assumption A3). Plans 08-03 to 08-06 already delivered the actual seam needed — every registry-reading function takes an injectable `games: GameRegistry = GAME_REGISTRY` parameter — so the toy game only needed to construct a plain frozen object (`{ ...GAME_REGISTRY, [TOY_GAME_ID]: toyGameEntry }`) and pass it explicitly at each test call site. This is simpler than the research's speculative design and requires zero production code changes.
- Per RESEARCH.md's own recommended option (b): D-10's five required test behaviors are all proven at the `room-state.ts`/`seat-projection.ts` pure-function layer; `room-do.ts`'s `wrangler dev`-spawning integration test was correctly left untouched, since none of D-10's requirements mention surviving a real hibernation/process-boundary cycle.
- `TOY_GAME_ID`'s error-mapping cast (`{ gameId: TOY_GAME_ID, code } as unknown as GameErrorDetail`) and the toy's `defineGame(...)` registration both required an explicit, documented cast at exactly the two points where the toy's deliberately-outside-the-union identity meets a type that assumes Hanabi-or-nothing (`GameId`, `GameErrorDetail`) — consistent with the plan's own instruction, not a workaround discovered mid-implementation.

## Deviations from Plan

None. The plan's task list, file list, and acceptance criteria were followed exactly; both tasks landed as their own commit in the order specified.

## Issues Encountered

None. `npm test && npm run typecheck` stayed green after each commit; the targeted `vitest run --project worker registry`/`source-structure` commands and the `wrangler deploy --dry-run` bundle check all passed on the first attempt.

## User Setup Required

None — no external service configuration required. No deployment was performed (D-14: the executor does not deploy); the dry-run bundle output directory was inspected and deleted, never uploaded.

## Next Phase Readiness

- D-10's registry-genericity proof is now complete and committed; `MGR-01`'s "proven with a test-only second game" clause is satisfied by this plan, but `MGR-01` itself stays **Pending** in `REQUIREMENTS.md` — it additionally requires the host to actually choose the game via a landing-page UI (D-02/D-12/D-17), which no plan has built yet.
- `MGR-02`/`MGR-03` stay **Pending**: this plan proves per-game seat limits and config validation are enforced correctly at the worker layer (already true since 08-03/08-06), but their web-side clauses ("the lobby enforces them" / "the host sees only the current game's settings") require `apps/web/components/Lobby.tsx` and `apps/web/app/page.tsx` changes not in this plan's scope.
- `MGR-05` was already marked Complete in `REQUIREMENTS.md` before this plan (by 08-03/08-04's `validateGameView`/`seat-projection.ts` work); this plan adds an independent, structurally-distinct-game proof of the same claim but makes no `REQUIREMENTS.md` change for it.
- No blockers for the next plan. The registry's dependency-injection seam is now proven correct against a real structurally-different second game, not merely asserted by type signatures — any future game (Expedition, Phase 11) can reuse this exact test pattern (construct a registry object, pass it as the trailing `games` argument) with no worker-layer changes required.

---
*Phase: 08-multi-game-rooms*
*Completed: 2026-09-23*

## Self-Check: PASSED

All created files confirmed present on disk (apps/worker/test/toy-game.ts, apps/worker/src/registry.test.ts). Commits 1df99c8 and ecd9480 confirmed present in git log.
