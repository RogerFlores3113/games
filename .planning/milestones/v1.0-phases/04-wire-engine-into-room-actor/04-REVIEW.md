---
phase: 04-wire-engine-into-room-actor
reviewed: 2026-09-16T00:00:00Z
depth: standard
files_reviewed: 29
files_reviewed_list:
  - apps/web/app/room/[code]/RoomClient.tsx
  - apps/web/components/HanabiBoard.tsx
  - apps/web/lib/hanabi-board-logic.ts
  - apps/web/lib/hanabi-board-logic.test.ts
  - apps/worker/package.json
  - apps/worker/src/game-registration.ts
  - apps/worker/src/room-do.ts
  - apps/worker/src/room-state.ts
  - apps/worker/src/persistence.test.ts
  - apps/worker/src/redaction-wire.test.ts
  - apps/worker/src/room-do.test.ts
  - apps/worker/src/room-state.test.ts
  - apps/worker/src/seat-projection.test.ts
  - apps/worker/src/source-structure.test.ts
  - e2e/hanabi-realtime.spec.ts
  - e2e/in-progress-arrival.spec.ts
  - e2e/start-game.spec.ts
  - packages/rules/src/adapter.test.ts
  - packages/rules/src/index.ts
  - packages/schema/package.json
  - packages/schema/src/constants.ts
  - packages/schema/src/games/hanabi.ts
  - packages/schema/src/games/hanabi.test.ts
  - packages/schema/src/games/subpath.test.ts
  - packages/schema/src/messages.ts
  - packages/schema/src/messages.test.ts
  - packages/schema/src/room.ts
  - tsconfig.base.json
  - vitest.config.ts
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-09-16
**Depth:** standard
**Files Reviewed:** 29
**Status:** issues_found

## Summary

This phase wires the real Hanabi rules engine into `RoomDO` through the single `game-registration.ts` seam and deletes the forehead-card toy. The core security properties this phase is explicitly weighted on hold up well under direct inspection:

- **Hidden information**: `HanabiViewSchema` (packages/schema/src/games/hanabi.ts) is a genuinely strict, per-level `z.strictObject`/`z.discriminatedUnion("hidden", …)` schema that structurally forbids a hidden own-hand card from carrying `suit`/`rank`, including as an `undefined`-valued key (verified both by the schema-level tests in `hanabi.test.ts` and the fail-closed gate tests in `seat-projection.test.ts`/`redaction-wire.test.ts`). `HanabiBoard.tsx` never reads `suit`/`rank` off a card unless `!card.hidden` is already true. `validateGameView`'s rejection log (`seat-projection.ts`) only emits `seatId` and each Zod issue's `code`/`path` — never values — which the test suite directly asserts.
- **Exactly-once actions**: the `lastAppliedActionId` dedup check in `applyGameAction` (room-state.ts) runs before `adapter.applyAction`, is scoped per-seat (cannot be spoofed to replay/suppress another seat's action, since `actorSeatId` is always server-derived from the connection's own attachment, never from message content), is persisted (`SeatSchema.lastAppliedActionId`), and is deliberately absent from `PublicSeatSchema`/`RoomView`. See WR-01 below for one real edge case in this otherwise-solid mechanism.
- **The seam**: `game-registration.ts` is confirmed (by `source-structure.test.ts`'s A9 check) to be the only worker file naming `hanabiGame` or importing `@games/schema/games/*`. `room-state.ts` and `room-do.ts` reach the game exclusively through `activeGame`'s four adapter methods. See IN-01 for one inherited (pre-phase-4) wrinkle in this seam.
- **Toy remnants**: `source-structure.test.ts` positively proves both the `foreheadCardGame` identifier and the toy's source files are gone, scoped narrowly enough to not false-positive on legitimate historical comment prose. No dangling toy references found in any reviewed file.
- **Vacuous tests**: most of the suite is unusually disciplined about avoiding vacuous assertions (explicit "TRAP"/"positive control"/"non-vacuousness" comments throughout `room-do.test.ts`, `redaction-wire.test.ts`, `seat-projection.test.ts`). One real vacuous assertion was found — see WR-02.

No BLOCKER-level defects were found. Four WARNING-level issues and two INFO-level observations are below.

## Warnings

### WR-01: The action-dedup guarantee silently breaks for the game-ending action

**File:** `apps/worker/src/room-state.ts:339-377`

**Issue:** `applyGameAction`'s own docstring states the `actionId` dedup check is done "unconditionally, for every action type, BEFORE `adapter.applyAction` is ever called" and that "a dedup hit is NOT an error: the caller commits and pushes this (unchanged) state, so a retry after a dropped response looks like success to the retrying client."

In the actual code, the dedup check only runs when `state.status === "in_progress"`, because the function returns early with `{ ok: false, reason: "bad_request" }` before ever reaching the dedup comparison:

```ts
export function applyGameAction(...): RoomResult {
  if (state.status !== "in_progress") {
    return { ok: false, reason: "bad_request" };   // <-- runs first, unconditionally
  }
  const actorSeat = state.seats.find((seat) => seat.seatId === actorSeatId);
  if (actorSeat !== undefined && actorSeat.lastAppliedActionId === actionId) {
    return { ok: true, state };                    // <-- dedup path, only reachable while in_progress
  }
  ...
}
```

Concretely: if a client's game-ending action (the action whose `adapter.checkGameEnd` result flips `state.status` to `"ended"`) is applied server-side, but the response frame is dropped before the client sees it (the exact scenario the dedup mechanism exists to protect — see `RT-09`/`D-08` in the test suite), the client's automatic retry with the *same* `actionId` will now see `state.status === "ended"` and get a `bad_request` error frame instead of the documented idempotent success. This is a narrow but real edge case: it only affects the single action that ends a given game, but it is exactly the action most likely to be retried (client UIs commonly retry on the transition they're most anxious about), and it produces a spurious, misleading error for an action that in fact already succeeded — with no way for the client to distinguish "your last action already applied" from "your last action was rejected."

No test in `room-state.test.ts` or `room-do.test.ts` exercises retrying the specific `actionId` that ended the game (the existing dedup tests retry mid-game actions only, and the existing "played to the end" tests use fresh, never-repeated `actionId`s for the final action).

**Fix:** Move the dedup lookup ahead of the status gate, and let it short-circuit before the `status !== "in_progress"` refusal:

```ts
export function applyGameAction(
  state: RoomState,
  actorSeatId: string,
  actionId: string,
  request: unknown,
  now: number,
): RoomResult {
  const actorSeat = state.seats.find((seat) => seat.seatId === actorSeatId);
  if (actorSeat !== undefined && actorSeat.lastAppliedActionId === actionId) {
    return { ok: true, state };
  }
  if (state.status !== "in_progress") {
    return { ok: false, reason: "bad_request" };
  }
  ...
}
```

### WR-02: A conformance-suite assertion never actually executes for any adapter

**File:** `packages/rules/src/adapter.test.ts:75-81`

**Issue:** The reusable `describeAdapterConformance` helper's `"checkGameEnd returns null or an object with a numeric score"` test only ever calls `checkGameEnd` on the adapter's freshly created `createInitialState` output:

```ts
it("checkGameEnd returns null or an object with a numeric score", () => {
  const state = adapter.createInitialState(createInput);
  const result = adapter.checkGameEnd(state);
  if (result !== null) {
    expect(typeof result.score).toBe("number");
  }
});
```

For Hanabi (and for any adapter with sane initial-state semantics), `checkGameEnd` on a just-created game is essentially always `null` — the deck is full, fuses/clue-tokens are at their starting values, and no seat has taken a turn. That means `if (result !== null)` never evaluates true, so the `expect(typeof result.score).toBe("number")` line inside it never runs. This test currently passes for any adapter regardless of whether `checkGameEnd`'s non-null branch is correct — including a broken adapter that returns `{ score: "oops" }` on game end.

**Fix:** Either drive `state` to an actually-ended condition before calling `checkGameEnd` (e.g., reuse a `legalActionFor`-style helper to play the game to completion, as `room-state.test.ts` and `redaction-wire.test.ts` already do), or add an explicit assertion that fails loudly if the branch is never exercised, e.g.:

```ts
it("checkGameEnd returns null or an object with a numeric score", () => {
  const state = adapter.createInitialState(createInput);
  const result = adapter.checkGameEnd(state);
  expect(result).toBeNull(); // initial state is always in-progress
  // A companion test (or this helper extended to accept an "ended state"
  // builder) must independently prove the non-null branch's shape.
});
```

### WR-03: `isHanabiView`'s type predicate is unsound

**File:** `apps/web/components/HanabiBoard.tsx:27-40`

**Issue:** `isHanabiView(game: unknown): game is HanabiView` only checks that `yourHand`, `otherHands`, `stacks`, and `discard` exist and are arrays. It asserts nothing about `clueTokens`, `fuses`, `deckCount`, `finalTurnsRemaining`, `activeSeatId`, `isYourTurn`, `score`, `history`, `variant`, or `yourSeatId` — roughly two-thirds of `HanabiView`'s fields — yet TypeScript is told the full `HanabiView` shape is guaranteed once this returns `true`. Every subsequent read in the component (`game.clueTokens`, `game.fuses`, `game.isYourTurn`, `game.score`, …) is type-checked as always-present based on this narrowing, without any runtime check backing that guarantee.

In today's system this is low-risk in practice because the server-side `HanabiViewSchema` fail-closed gate (`seat-projection.ts`/`validateGameView`) already guarantees any `view.game` that reaches the wire is a complete, schema-valid `HanabiView` — so a malformed shape should never actually arrive at this component under normal operation. But the type guard itself is a soundness gap: it lies about what it verified, and if this component is ever reused with a less-trusted data source (e.g., a future spectator mode, a locally-mocked view in a story/test harness, or a schema drift bug), the missing fields would silently render as `undefined` in text nodes (e.g., "undefined clue tokens") rather than fail closed.

**Fix:** Either check the full field set the component actually reads, or better, defer to the schema this project already has (`HanabiViewSchema.safeParse` from `@games/schema/games/hanabi`) so there is exactly one definition of "a valid HanabiView" instead of two independently-maintained ones:

```ts
function isHanabiView(game: unknown): game is HanabiView {
  return (
    typeof game === "object" &&
    game !== null &&
    "yourHand" in game && Array.isArray((game as { yourHand: unknown }).yourHand) &&
    "otherHands" in game && Array.isArray((game as { otherHands: unknown }).otherHands) &&
    "stacks" in game && Array.isArray((game as { stacks: unknown }).stacks) &&
    "discard" in game && Array.isArray((game as { discard: unknown }).discard) &&
    "clueTokens" in game && typeof (game as { clueTokens: unknown }).clueTokens === "number" &&
    "isYourTurn" in game && typeof (game as { isYourTurn: unknown }).isYourTurn === "boolean" &&
    "score" in game && typeof (game as { score: unknown }).score === "number" &&
    "activeSeatId" in game && typeof (game as { activeSeatId: unknown }).activeSeatId === "string"
    // ...or import and reuse the wire schema directly.
  );
}
```

### WR-04: `RoomDO#onMessage` has no top-level exception containment, unlike `#onAlarm`

**File:** `apps/worker/src/room-do.ts:132-202`

**Issue:** The class-level comment on `onError` states the invariant this file is meant to uphold: "Never rethrow — an exception escaping a handler tears down the room for every seat (T-1-10)." `onAlarm` (lines 239-301) is explicitly wrapped in `try { ... } catch (error) { console.error(...); /* re-sync alarm */ }` to honor exactly this invariant. `onMessage` — the handler that now routes into the real Hanabi engine via `applyGameAction`/`setVariant`/`startGame`/`releaseSeat` — has no equivalent containment. If any of those calls throws (contrary to the adapter contract, but `mapAdapterError`'s own exhaustive `switch` in this same file has a `default` branch that deliberately `throw`s on an unrecognized `AdapterError`, so at least one intentionally-reachable-on-drift throw path already exists in this call chain), the exception propagates out of `onMessage` uncaught. Depending on how `partyserver`'s `Server` base class invokes message handlers, this could tear down message handling for the room's other live connections, or at minimum silently drop the response to the connection that triggered it (no `error` frame is ever sent), contradicting the class's own stated defensive posture.

Risk today is mitigated by `adapter.test.ts`'s property-based fuzz test asserting `applyAction` never throws for arbitrary hostile payloads, and by TypeScript's compile-time exhaustiveness check on `mapAdapterError`'s `switch`. But this phase substantially increased the code path's surface area (a full rules engine, versus the earlier toy), and the defense-in-depth `onAlarm` already establishes as this file's convention is conspicuously absent from the handler that now matters most.

**Fix:** Wrap `onMessage`'s body (after the `parseClientMessage` gate) in a try/catch mirroring `onAlarm`'s pattern, logging only non-state-bearing information and sending a generic `error` frame rather than leaving the client's request unanswered:

```ts
async onMessage(connection: Connection, raw: string | ArrayBuffer | ArrayBufferView): Promise<void> {
  const parsed = parseClientMessage(String(raw));
  if (!parsed.ok) {
    this.#send(connection, { type: "error", code: "bad_request" });
    return;
  }
  try {
    // ... existing dispatch body ...
  } catch (error) {
    console.error(`RoomDO onMessage failed (${connection.id}):`, error);
    this.#send(connection, { type: "error", code: "bad_request" });
  }
}
```

## Info

### IN-01: Hanabi-specific vocabulary is compiled into the "game-agnostic" room layer via `AdapterError`

**File:** `apps/worker/src/room-state.ts:301-324`

**Issue:** `mapAdapterError`'s exhaustive `switch` names concrete Hanabi gameplay concepts (`no_clue_tokens`, `clue_touches_nothing`, `clue_target_invalid`, `discard_at_max_clues`) directly in `room-state.ts`, which FDN-01 documents as holding "no game logic" and reaching the game only through the adapter's four methods. This is not something Phase 4 introduced — the `AdapterError` union itself already bakes these Hanabi-flavored refusal reasons into `packages/rules/src/adapter.ts`'s "generic" `GameAdapter<TState, TAction>` interface (predating this phase) — but it does mean the single-seam claim (`source-structure.test.ts`'s A9, scoped to the identifier `hanabiGame` and the `@games/schema/games/` import path) doesn't fully capture this second, narrower form of game-specific coupling: a second game with a differently-shaped error vocabulary would require editing this same `mapAdapterError` switch in the "generic" room layer, not just `game-registration.ts`. Worth a note for whoever designs the second game's integration (per CLAUDE.md's Innovation milestone).

### IN-02: Hardcoded file list in the "no Node/Worker-specific runtime modules" purity check risks silently under-scanning new files

**File:** `packages/rules/src/adapter.test.ts:98-127`

**Issue:** The `"imports no Node/Worker-specific runtime modules from src"` test enumerates the files to scan as a manually maintained array literal (`"adapter.ts"`, `"hanabi/state.ts"`, … 14 entries). Any future file added under `packages/rules/src/` or `packages/rules/src/hanabi/` that is not also added to this array is silently excluded from the FDN-02 zero-dependency purity check — the test would continue to pass even if the new file imported `node:fs` or `partyserver` directly. This is a maintenance footgun rather than a live bug today (the current 14-file list matches the current tree), but it's the kind of check that should fail loudly (or be data-driven off a directory walk) rather than pass quietly on an incomplete list.

**Fix:** Replace the hardcoded list with a recursive scan of `packages/rules/src/**/*.ts` excluding `*.test.ts`, mirroring the pattern `apps/worker/src/source-structure.test.ts` already uses (`listSourceFiles`) for the same class of problem.

---

_Reviewed: 2026-09-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
