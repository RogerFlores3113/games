---
phase: 08-multi-game-rooms
reviewed: 2026-09-23T00:00:00Z
depth: standard
files_reviewed: 67
files_reviewed_list:
  - .gitignore
  - apps/web/app/LandingForm.tsx
  - apps/web/app/api/room/route.test.ts
  - apps/web/app/api/room/route.ts
  - apps/web/app/page.tsx
  - apps/web/app/room/[code]/RoomClient.tsx
  - apps/web/components/Lobby.tsx
  - apps/web/components/game-ui.tsx
  - apps/web/components/hanabi/HanabiCreateSettings.tsx
  - apps/web/components/hanabi/HanabiLobbySettings.tsx
  - apps/web/lib/game-agnostic-source.test.ts
  - apps/web/lib/lobby-render.test.ts
  - apps/web/lib/lobby-seats.test.ts
  - apps/web/lib/lobby-seats.ts
  - apps/web/lib/pending-room-cookie.test.ts
  - apps/web/lib/pending-room-cookie.ts
  - apps/web/lib/pending-room.test.ts
  - apps/web/lib/pending-room.ts
  - apps/web/lib/room-socket.ts
  - apps/web/lib/room-store.test.ts
  - apps/web/lib/settings-modal-render.test.ts
  - apps/web/tsconfig.json
  - apps/worker/src/game-registration.test.ts
  - apps/worker/src/game-registration.ts
  - apps/worker/src/persistence.test.ts
  - apps/worker/src/redaction-wire.test.ts
  - apps/worker/src/registry.test.ts
  - apps/worker/src/room-do.test.ts
  - apps/worker/src/room-do.ts
  - apps/worker/src/room-state.test.ts
  - apps/worker/src/room-state.ts
  - apps/worker/src/scheduler.test.ts
  - apps/worker/src/seat-naming.ts
  - apps/worker/src/seat-projection.test.ts
  - apps/worker/src/seat-projection.ts
  - apps/worker/src/source-structure.test.ts
  - apps/worker/test/toy-game.ts
  - apps/worker/tsconfig.json
  - e2e/create-room.spec.ts
  - e2e/helpers.ts
  - e2e/start-game.spec.ts
  - packages/rules/src/adapter.test.ts
  - packages/rules/src/adapter.ts
  - packages/rules/src/hanabi/actions.ts
  - packages/rules/src/hanabi/adapter.ts
  - packages/rules/src/hanabi/conservation.property.test.ts
  - packages/rules/src/hanabi/discard-order.property.test.ts
  - packages/rules/src/hanabi/nameable-colour.property.test.ts
  - packages/rules/src/hanabi/redaction.property.test.ts
  - packages/rules/src/hanabi/termination.property.test.ts
  - packages/rules/src/hanabi/variant-matrix.test.ts
  - packages/rules/tsconfig.json
  - packages/schema/src/constants.ts
  - packages/schema/src/create-room.test.ts
  - packages/schema/src/create-room.ts
  - packages/schema/src/games/hanabi-errors.ts
  - packages/schema/src/games/hanabi.test.ts
  - packages/schema/src/games/hanabi.ts
  - packages/schema/src/games/subpath.test.ts
  - packages/schema/src/index.ts
  - packages/schema/src/messages.test.ts
  - packages/schema/src/messages.ts
  - packages/schema/src/room.test.ts
  - packages/schema/src/room.ts
  - packages/schema/tsconfig.json
  - tsconfig.json
findings:
  critical: 0
  warning: 4
  info: 8
  total: 12
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-09-23
**Depth:** standard
**Files Reviewed:** 67 (the 68-entry list includes `apps/web/lib/pending-variant.test.ts`, which this phase deleted)
**Status:** issues_found

## Summary

I reviewed the Phase 8 diff (`ec10e56..HEAD`), focusing on the trust boundaries named in the brief. Each of them holds:

- **First-join gameId lock (D-01).** `joinRoom` reads `input.gameId` only on the new-join branch when `!state.gameLocked`. Both reclaim branches return before that point. `gameLocked` is set to `true` on every successful new join and is never cleared, including by `releaseSeat` and `restartLobby`. A later join cannot change the room's game.
- **set_config (D-04).** `setConfig` checks host, then status, then runs `configSchema.safeParse` before any mutation, and it stores `parsed.data`. `startGame` validates the persisted config again before passing it to the adapter.
- **View validation.** Every `joined`/`state` frame goes through `#viewFor` → `projectSeatView` → `validateGameView`. The branded `ProjectedRoomView` type blocks hand-built views at compile time.
- **Namespaced error frame.** `GameErrorDetailSchema` is a closed discriminated union over closed code enums. `room-do.ts` checks `result.gameError` with `safeParse` before sending it, so a bad mapper output cannot make `encodeServerMessage` throw.
- **pending_room cookie.** The cookie has `Path=/room/{code}` and `Max-Age=120`, and it is expired whether or not it parses. Its contents are validated again with `CreateRoomRequestSchema` on read. Neither the name, game nor config ever reaches the URL.
- **Toy game.** It is imported only by `*.test.ts` files. It sits outside `src/`, is absent from `GameIdSchema`, and does not appear in `GAME_REGISTRY`.
- **Root typecheck (MGR-07).** `npx tsc -b` passes from the repo root.

No BLOCKERs were found. The WARNINGs are:

- a lobby behaviour regression: the host's variant controls are no longer disabled while reconnecting, which breaks MGR-04 "behaves exactly as before";
- a landing-form field-naming design that fails as soon as a second game is added;
- a fail-closed branch that can never be reached because the code before it throws first;
- a silently dropped game-error frame.

## Warnings

### WR-01: Host variant picker is no longer disabled while reconnecting (MGR-04 regression)

**File:** `apps/web/components/Lobby.tsx:155-162`, `apps/web/components/hanabi/HanabiLobbySettings.tsx:167-180`, `apps/web/components/game-ui.tsx:30-33`
**Issue:** Before this phase, the lobby's variant radios had `disabled={reconnecting}`. `LobbyProps.reconnecting` still documents this: "Start game and every host variant control [are disabled]". When the picker moved into `HanabiLobbySettings`, `disabled` was dropped, and `LobbySettingsProps` has no `reconnecting`/`disabled` prop to pass it through. The result:

- While the reconnecting banner is showing, the host can click a variant.
- `RoomClient`'s `send()` silently discards the message (`if (status === "reconnecting") return`).
- The controlled radio snaps back.

The host sees an enabled control that does nothing, which contradicts D-05 ("display-only view") and MGR-04 ("Hanabi behaves exactly as before"). No test covers this. `lobby-render.test.ts`/`settings-modal-render.test.ts` never assert disabled-while-reconnecting on the picker.
**Fix:** Pass the flag through the per-game settings contract:
```tsx
// game-ui.tsx
export interface LobbySettingsProps { config: unknown; onSetConfig: (c: unknown) => void; disabled: boolean }
// Lobby.tsx
<Settings config={view.config} onSetConfig={onSetConfig} disabled={reconnecting} />
// HanabiLobbySettings.tsx
<input ... disabled={disabled} />
```
Add a render test asserting that the radios are disabled when `reconnecting` is true.

### WR-02: Landing form submits every game's settings under one shared `name="config"`

**File:** `apps/web/app/LandingForm.tsx:24-30,176-180`, `apps/web/components/hanabi/HanabiCreateSettings.tsx:33`, `packages/schema/src/create-room.ts:13-19`
**Issue:** Every entry in `LANDING_SETTINGS` is always rendered, and the CSS only hides the ones not selected with `display:none`. Hidden form controls are still submitted. Hanabi's fieldset uses `name="config"` with `defaultChecked="base"`. Once a second game is added in Phase 11/12:

- **Second game with no settings.** Submitting it still posts `config=base` from the hidden Hanabi radios. `CreateRoomRequestSchema` then rejects the request (or, in the worst case, accepts Hanabi's config for the other game), so create fails with "check your name".
- **Second game with its own `name="config"` radios.** Its radios join the same radio group as Hanabi's. Only one value can be checked across both games, and `formData.get("config")` returns whichever comes first in the DOM.

The per-game lookup (D-12) is therefore not actually separated by game at the form level. Separately, `CreateRoomRequestSchema` hard-codes `config: VariantSchema`, which duplicates the registry's `configSchema`. Two sources of truth can drift.
**Fix:** Disable the controls of non-selected games so they are not submitted. For example, wrap each panel in `<fieldset disabled={selectedGame !== gameId}>` once hydrated, and namespace names such as `name={\`config.${gameId}\`}` so the server reads `formData.get(\`config.${gameId}\`)` for the chosen `gameId` only. This works before hydration, which the CSS-only approach needs. Add a test that submits a form with two settings panels.

### WR-03: The "no registry entry" fail-closed branch in `validateGameView` can never run; an unknown gameId throws instead

**File:** `apps/worker/src/seat-projection.ts:55-63,81-83`, `apps/worker/src/room-state.ts:39-45,523`
**Issue:** `projectSeatView` calls `toSeatView` first. `toSeatView` calls `roomGame(state, games)`, which **throws** `Unknown game id: …` whenever `state.gameId` is not in the registry. Execution therefore never reaches `validateGameView`'s `resolveGame(...) === undefined → return null` branch through the production path. The contract "an unresolvable entry fails closed exactly like a schema mismatch, sending `view_unavailable`" is not what happens.

What actually happens is an exception:
- `onMessage` catches it and returns a generic error;
- `#pushState` aborts its whole fan-out loop partway through.

When the view has `game === null` (the lobby), `validateGameView` returns before resolving the entry at all. The test for this branch presumably calls `validateGameView` directly with a hand-built view, which makes the code look covered when it is not.
**Fix:** In `toSeatView`, resolve the entry without throwing, or catch the error in `projectSeatView`:
```ts
export function projectSeatView(room, seatId, games = GAME_REGISTRY) {
  if (resolveGame(room.gameId, games) === undefined) {
    console.error("HIDE-03: no registry entry for room game", { seatId });
    return null;
  }
  return validateGameView(toSeatView(room, seatId, games), games);
}
```
Also add a `projectSeatView` test with an injected registry that lacks the room's gameId.

### WR-04: An invalid `gameError` is dropped without logging, and its gameId is never checked against the room

**File:** `apps/worker/src/room-do.ts:228-238`, `apps/worker/src/game-registration.ts:98-127`
**Issue:** If `GameErrorDetailSchema.safeParse(result.gameError)` fails, the field is silently left out. A registry entry whose mapper drifts from the wire enum then shows up as bare `bad_request` errors in production, with no log line to trace. In addition:

- Nothing checks that `gameError.gameId === room.gameId`.
- `defineGame` never checks that `entry.gameId` matches its registry key.

An entry registered under one key but mapping to another game's namespace would therefore pass schema validation and send a mis-attributed code.
**Fix:** Log redacted diagnostics on parse failure, e.g. `console.error("game error failed wire schema", { gameId: room.gameId })`. Require `parsed.data.gameId === room.gameId` before attaching the error. In `resolveGame`, or with a registry-construction assertion, verify `entry.gameId === key`.

## Info

### IN-01: `apps/web/tsconfig.tsbuildinfo` is tracked even though `*.tsbuildinfo` is now ignored

**File:** `.gitignore:5`, `apps/web/tsconfig.tsbuildinfo`
**Issue:** The file is tracked, so the new ignore rule has no effect. Every `npm run typecheck` dirties the working tree (it is currently `M` in `git status`).
**Fix:** Run `git rm --cached apps/web/tsconfig.tsbuildinfo`.

### IN-02: Unnecessary double cast in `BOARD_COMPONENTS` hides future prop drift

**File:** `apps/web/components/game-ui.tsx:27`
**Issue:** `HanabiBoard as unknown as ComponentType<BoardProps>` is not needed, because `BoardProps` is assignable to `HanabiBoardProps`. The cast would also hide a future required prop on a board that `RoomClient` never passes.
**Fix:** Drop the cast: `hanabi: HanabiBoard`. If that fails to compile, fix the props instead.

### IN-03: Landing error message always blames the name

**File:** `apps/web/app/LandingForm.tsx:42`, `apps/web/app/api/room/route.ts:26,72`
**Issue:** Every native-path failure redirects to `/?error=create`, and the page then always shows "check your name". That includes no game selected, a bad config, or a malformed multipart body. `?error=create` also stays in the URL after the user corrects the form.
**Fix:** Use a generic message, or distinct error codes. Clear the param with `router.replace("/")` once the error has been shown.

### IN-04: Cross-site POST can plant a pending-room cookie (login-CSRF style)

**File:** `apps/web/app/api/room/route.ts:67-80`
**Issue:** The native form path accepts cross-origin `application/x-www-form-urlencoded` POSTs. Another site can submit the form and redirect the victim into a new room seated under an attacker-chosen display name. Impact is low: the room is new and no existing seat is exposed. It is still an unauthenticated state change driven from another origin.
**Fix:** Reject form posts whose `Origin` header is present and not same-origin, or whose `Sec-Fetch-Site` is `cross-site`.

### IN-05: The persisted `config` is sent to clients without validation

**File:** `apps/worker/src/room-state.ts:529`, `packages/schema/src/room.ts:129,186`
**Issue:** `RoomStateSchema.config` and `RoomViewSchema.config` are both `z.unknown()`. `toSeatView` copies the persisted value straight onto the wire. It is only ever written through `setConfig`/`defaultConfig`, so the risk is low. However, it is the one room-level field with no outbound schema gate, unlike `game`.
**Fix:** Validate `state.config` with `entry.configSchema.safeParse` inside `projectSeatView`, and fail closed on a mismatch.

### IN-06: The schema barrel is no longer game-agnostic, contradicting a header comment

**File:** `packages/schema/src/messages.ts:10`, `packages/schema/src/games/hanabi.ts:25-28`, `packages/schema/src/create-room.ts`
**Issue:** `hanabi.ts` says the barrel "stays game-agnostic". In practice, `messages.ts` (re-exported from `index.ts`) imports `HanabiErrorCodeSchema`, and `create-room.ts` names Hanabi's `VariantSchema`. This is probably the intended trade-off for a closed union, but the comment is wrong.
**Fix:** Update the comment, or move the union's per-game members behind the `games/*` subpaths.

### IN-07: Magic number and stale comments

**File:** `apps/web/app/LandingForm.tsx:157`, `apps/web/lib/lobby-seats.ts:5`, `apps/web/lib/pending-room.ts:88-90`, `apps/worker/src/room-state.ts:406`, `apps/worker/src/game-registration.ts:148-152`
**Issue:**
- `LandingForm.tsx:157` has `maxLength={24}` instead of `MAX_DISPLAY_NAME_LENGTH`.
- `lobby-seats.ts:5` still refers to `MAX_PLAYERS`.
- The `configToApply` docstring is garbled ("the game hasn't started's lobby has already moved on").
- The `startGame` doc still says "a 2-5 seat count".
- The `DEFAULT_GAME_ID` doc says `RoomState` "has no gameId field until plan 08-05", which is now false.

**Fix:** Import the constant and refresh the comments.

### IN-08: The `!Board` guard in `RoomClient` is dead code

**File:** `apps/web/app/room/[code]/RoomClient.tsx:265-268`
**Issue:** `view.gameId` has already been validated by `GameIdSchema`, and `BOARD_COMPONENTS` is an exhaustive `Record<GameId, …>`, so the guard can never be taken. If it ever were, the user would get a blank screen with no message.
**Fix:** Remove the guard, or render an explicit error card rather than `null`.

---

_Reviewed: 2026-09-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
