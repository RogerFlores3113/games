---
phase: 01-room-transport-skeleton
reviewed: 2026-09-15T15:00:00Z
depth: standard
files_reviewed: 68
files_reviewed_list:
  - apps/web/.env.example
  - apps/web/app/api/room/route.test.ts
  - apps/web/app/api/room/route.ts
  - apps/web/app/globals.css
  - apps/web/app/layout.tsx
  - apps/web/app/page.tsx
  - apps/web/app/room/[code]/RoomClient.tsx
  - apps/web/app/room/[code]/page.tsx
  - apps/web/components/Button.tsx
  - apps/web/components/CounterGame.tsx
  - apps/web/components/JoinForm.tsx
  - apps/web/components/Lobby.tsx
  - apps/web/components/RefusalCard.tsx
  - apps/web/components/RoomCode.tsx
  - apps/web/components/SeatRow.tsx
  - apps/web/lib/room-code.test.ts
  - apps/web/lib/room-code.ts
  - apps/web/lib/room-socket.ts
  - apps/web/lib/room-store.test.ts
  - apps/web/lib/room-store.ts
  - apps/web/lib/seat-token.test.ts
  - apps/web/lib/seat-token.ts
  - apps/web/next.config.ts
  - apps/web/package.json
  - apps/web/postcss.config.mjs
  - apps/web/tsconfig.build.json
  - apps/worker/package.json
  - apps/worker/src/index.ts
  - apps/worker/src/origin.ts
  - apps/worker/src/persistence.test.ts
  - apps/worker/src/persistence.ts
  - apps/worker/src/room-do.test.ts
  - apps/worker/src/room-do.ts
  - apps/worker/src/room-state.test.ts
  - apps/worker/src/room-state.ts
  - apps/worker/src/scheduler.test.ts
  - apps/worker/src/scheduler.ts
  - apps/worker/src/seat-identity.test.ts
  - apps/worker/src/seat-identity.ts
  - apps/worker/src/seat-naming.test.ts
  - apps/worker/src/seat-naming.ts
  - apps/worker/src/smoke.test.ts
  - apps/worker/test/cloudflare-workers-shim.ts
  - apps/worker/tsconfig.json
  - apps/worker/wrangler.jsonc
  - docs/deployment.md
  - docs/manual-checks/cold-start.md
  - docs/manual-checks/custom-domain.md
  - docs/manual-checks/free-tier.md
  - e2e/create-room.spec.ts
  - e2e/helpers.ts
  - e2e/in-progress-arrival.spec.ts
  - e2e/join-room.spec.ts
  - e2e/seat-list.spec.ts
  - e2e/seat-takeover.spec.ts
  - e2e/smoke.spec.ts
  - e2e/start-game.spec.ts
  - packages/rules/src/adapter.test.ts
  - packages/rules/src/adapter.ts
  - packages/rules/src/counter-game.test.ts
  - packages/rules/src/counter-game.ts
  - packages/rules/src/index.ts
  - packages/schema/src/constants.ts
  - packages/schema/src/index.ts
  - packages/schema/src/messages.test.ts
  - packages/schema/src/messages.ts
  - packages/schema/src/room.test.ts
  - packages/schema/src/room.ts
findings:
  critical: 3
  warning: 9
  info: 4
  total: 16
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-09-15T15:00:00Z
**Depth:** standard
**Files Reviewed:** 68
**Status:** issues_found

## Summary

I looked hardest at the Durable Object lifecycle (`room-do.ts`), the pure room state machine, the scheduler and persistence modules, the origin check, seat-token handling, and the client socket and store. I also checked the relevant internals of `partyserver` 0.5.10 in `node_modules`: `getConnections` only yields OPEN sockets, `webSocketClose` still calls `onClose`, and `__ps_name` is persisted before `onStart`.

Per-seat redaction holds for now. Every outbound `state` or `joined` frame goes through `toSeatView` for that connection's own seat, and the seat token never appears in `PublicSeat`.

The serious problems are in seat connection bookkeeping:

- **CR-01:** a second-tab takeover, or a normal reconnect race, marks a live player's seat as disconnected. In the lobby, that seat is deleted 30 seconds later.
- **CR-02:** a lowercase or otherwise invalid room code in the URL makes every write throw, so the page hangs forever on "Connecting…".
- **CR-03:** the server accepts `leave` during a game. That permanently stalls turn order.

The existing tests miss all three. The takeover tests never check `connected`, and they never wait past the 30-second release grace period.

## Critical Issues

### CR-01: A superseded or stale connection's `onClose` marks the live seat disconnected, and the lobby then releases it

**File:** `apps/worker/src/room-do.ts:179-195` (with `:293-299`)
**Issue:** In `#handleJoin`, when a new connection reclaims a seat, the old connection gets `superseded` and is closed with 4001. Its attachment still holds `{ seatId }`, because nothing clears it before `close`. `partyserver` then runs `webSocketClose` → `onClose` for the old socket. `#seatIdFor` reads the stale attachment and returns the seat, and `markConnected(room, seatId, false, now)` flips the seat to `connected: false` with `disconnectedAt = now`. The newer connection is still open and bound to that seat. The comment at lines 183-185 says this "cannot clobber a newer connection". Line 190 does exactly that.

What happens next:
- **In the lobby:** `computeRoomTimers` schedules `seat_release` at +30s and `host_transfer` at +45s. `onAlarm` then deletes the seat of a player who is connected and looking at the lobby. That player keeps receiving views whose `youSeatId` no longer matches any seat. They drop out of the seat list, lose host if they had it, and are excluded from `startGame`.
- **In a game:** every teammate sees an active player as "Disconnected" until that player reconnects.

This does not need two tabs. It happens on any ordinary reconnect where the server has not yet noticed the old socket died, such as a wifi blip or a phone waking from sleep. The new `join` supersedes the half-dead socket, and its delayed close then marks the seat disconnected. That breaks the core promise that a session survives a dropped connection. `room-do.test.ts:252-275` and `e2e/seat-takeover.spec.ts` only check the 4001 code and the seat count. Neither checks `connected` or waits past 30s.
**Fix:**
```ts
// room-do.ts #handleJoin — detach the superseded socket before closing it
if (superseded !== undefined) {
  superseded.setState(null);
  superseded.send(encodeServerMessage({ type: "superseded" }));
  superseded.close(SUPERSEDED_CLOSE_CODE, "superseded");
}

// room-do.ts onClose — also guard against any other live binding for the seat
const seatId = this.#seatIdFor(connection as unknown as ConnectionWithSeat);
if (seatId === null) return;
connection.setState(null);
const liveOwner = this.bindings[seatId];
if (liveOwner !== undefined && liveOwner !== connection.id) return; // a newer socket owns it
```
Add a regression test: join, reclaim from a second socket, wait for close, then assert the seat is still `connected: true` and that no `seat_release` timer exists.

### CR-02: A non-canonical room code in the URL makes every write throw, and the client hangs forever on "Connecting…"

**File:** `apps/web/app/room/[code]/page.tsx:29-31`, `apps/worker/src/room-do.ts:94-96`, `apps/worker/src/persistence.ts:77-80,95`, `apps/worker/src/index.ts:32-34`
**Issue:** `RoomPage` passes the raw `code` path segment straight to `RoomClient` and `partysocket`, with no normalization or validation. Room codes are read aloud, so a friend typing `/room/abcdef` is realistic. That creates a DO named `abcdef`. The chain from there:
1. `onStart` calls `createEmptyRoom(this.name as RoomCode, …)`, a cast that is never validated.
2. `resetRoom` `put`s it without parsing.
3. The first `join` reaches `#commit` → `saveRoom` → `RoomStateSchema.parse`, which throws because the code fails `ROOM_CODE_PATTERN`. `this.room` was already set to the new state at line 346, before the throw.
4. The throw escapes `onMessage`. `partyserver` swallows and logs it, so the client never gets `joined`, `refused`, or `error`, and sits on "Connecting to room abcdef…" forever.
5. On the next wake, `loadRoom`'s `safeParse` fails and resets the room again.

The same happens with any code containing `0`, `O`, `1`, or `I`. It is reachable in production today.
**Fix:** Normalize and validate at both ends:
```tsx
// page.tsx
import { notFound, redirect } from "next/navigation";
const { code: raw } = await params;
const upper = raw.toUpperCase();
if (!RoomCodeSchema.safeParse(upper).success) notFound();
if (upper !== raw) redirect(`/room/${upper}`);
```
```ts
// worker index.ts, before routePartykitRequest
const m = url.pathname.match(/^\/parties\/room\/([^/]+)/);
if (m && !RoomCodeSchema.safeParse(decodeURIComponent(m[1]!)).success) {
  return new Response("Not Found", { status: 404 });
}
```

### CR-03: `leave` is accepted during a game, which removes a seat the game still has in its turn order and stalls the game permanently

**File:** `apps/worker/src/room-do.ts:170-176`, `apps/worker/src/room-state.ts:157-175`
**Issue:** The `leave` handler calls `releaseSeat` whatever `room.status` is. The `releaseSeat` docstring says "Called only for lobby seats", but nothing enforces that. During a game, the seat disappears from `room.seats` while `game.seatIds` still contains it. When `turnIndex` reaches that seat, no connection can ever act, because `applyAction` requires `actorSeatId === seatIds[turnIndex]`. The departed player's token is also deleted, so they cannot reclaim the seat: a new join gets refused with `in_progress`. The only recovery is the 12h idle GC.

The current UI never sends `leave`. But any seated player can send `{"type":"leave"}` from devtools, and a later phase could easily wire up a "Leave" button without noticing. Either way, a validated server action corrupts the game.
**Fix:**
```ts
// room-state.ts
export function releaseSeat(state: RoomState, seatId: string, now: number): RoomResult { … }
// or, minimally, in room-do.ts
if (msg.type === "leave") {
  if (room.status !== "lobby") {
    connection.send(encodeServerMessage({ type: "error", code: "bad_request" }));
    return;
  }
  …
}
```
Also add a lobby-only guard in `onAlarm`'s `seat_release` branch, as defense in depth.

## Warnings

### WR-01: An idle-GC'd room brings itself back through `onClose` and re-arms its alarm

**File:** `apps/worker/src/room-do.ts:218-228`
**Issue:** The `idle_gc` branch closes every connection, then runs `deleteAll()` and returns, and the comment says the room "must not keep waking itself up". The connections' attachments are not cleared, though. Each closing socket then fires `onClose`, and `#seatIdFor` returns its seat. `#ensureRoom()` sees `room === null` and calls `onStart()`, where `loadRoom` finds no `schemaVersion`. `resetRoom` then writes a fresh room, `#commit` saves it, and a new 1h `idle_gc` alarm is armed.

On top of that, close code 1000 does not stop `partysocket` from reconnecting, because `shouldReconnectOnClose` still returns true. Clients reconnect with a token that no longer exists. They silently get a brand-new empty lobby, and a reclaiming client ends up as host under the placeholder name "Player".
**Fix:** Clear attachments before closing, and use a close code or a message the client treats as terminal:
```ts
for (const connection of this.getConnections()) {
  connection.setState(null);
  connection.close(4002, "room abandoned");
}
```
Stop reconnecting on that code in `room-socket.ts`. Also make `onClose` return early when there is no persisted room, rather than running `onStart`.

### WR-02: A lobby with connected players is deleted after 1 hour with no state changes

**File:** `apps/worker/src/scheduler.ts:119-123`, `apps/worker/src/room-state.ts:213-227`
**Issue:** `idle_gc` counts from `lastActivityAt`, and only join, release, connect or disconnect, start and game actions update it. `setVariant` does not update it either. A group sitting connected in the lobby, waiting for a late friend, is force-closed and wiped at +1h even though every seat is connected. Idle time should not count while sockets are connected.
**Fix:** In `computeRoomTimers`, skip `idle_gc` while any seat is `connected`, or measure from the latest `disconnectedAt` once all seats are disconnected. Also set `lastActivityAt: now` in `setVariant`, which currently takes no `now` argument.

### WR-03: A second `join` on an already-seated connection leaves a ghost seat that never releases

**File:** `apps/worker/src/room-do.ts:123-126, 267-316`
**Issue:** `#handleJoin` never checks whether `connection.state.seatId` is already set. If a seated connection sends `join` again without a token, `joinRoom` mints a new seat and `setState` overwrites the attachment. The original seat stays `connected: true` with `disconnectedAt: null`. It therefore never gets a `seat_release` or `host_transfer` timer, and it keeps host if it had it. A single socket can fill all 5 seats this way. The standard client does not do this, but the server should not trust it not to.
**Fix:** At the top of `#handleJoin`: if the connection already has a seat, either reply `error bad_request`, or treat the join as a no-op and resend `joined` for the existing seat.

### WR-04: The variant chosen when creating a room is silently discarded

**File:** `apps/web/app/page.tsx:36,47`, `apps/web/app/api/room/route.ts:26-32`, `apps/worker/src/room-do.ts:95`
**Issue:** The landing page sends `variant` to `/api/room`, which validates it and then throws it away. The DO always creates the room with `"base"`. Nothing carries the choice forward (only `displayName` goes into sessionStorage), and nothing sends `set_variant` after joining. A host who picks Rainbow lands in a Base lobby.
**Fix:** Store the variant next to the display name (`room:${code}:variant`). After the host's first `joined` where `youSeatId === hostSeatId`, send `set_variant` once. Alternatively, remove the picker from the landing page.

### WR-05: Server `error` frames are ignored, so a rejected `join` leaves the client stuck on "Connecting…" and retrying forever

**File:** `apps/web/lib/room-store.ts:67-71`, `apps/web/lib/room-socket.ts:43-55`, `apps/worker/src/room-do.ts:114-118`
**Issue:** If the `join` frame fails `ClientMessageSchema`, the server replies `error bad_request` and keeps the socket open. That happens when a localStorage `room:{code}` value is not 24 characters (corruption, or another app on the same origin using that key), or when a stored name fails `DisplayNameSchema`. The store drops `error`, so status stays `"joining"` and the page shows "Connecting…" indefinitely. Every reconnect replays the same bad token. The same silent drop hides `not_seated` after a seat was released.
**Fix:** While `status === "joining"`, treat an `error` as a failed join: clear the seat token, reset `displayName` so `JoinForm` appears, and surface the error. Also validate the token client-side with `SeatTokenSchema.safeParse` before sending it, and omit it if invalid.

### WR-06: Joiners' names are never persisted, so a lobby seat released after a sleeping tab rejoins as "Player"

**File:** `apps/web/app/room/[code]/RoomClient.tsx:22,45-52`, `apps/web/components/JoinForm.tsx:29-37`
**Issue:** Only the host flow writes `room:{code}:displayName` to sessionStorage, and sessionStorage is per tab. After a refresh in a new tab, or on any `JoinForm` joiner, only the token exists and `"Player"` is sent. If the token still matches, that is harmless. But lobby seats are released after 30s disconnected, which a locked phone easily exceeds. The stale token then falls through to a new join, and the player reappears as "Player" (or "Player (2)"). If the room was GC'd, they become host of a fresh empty room under that name.
**Fix:** Persist the display name in localStorage alongside the token, including from `JoinForm`. When the server mints a different seat than the stored token implied, show `JoinForm` instead of auto-joining.

### WR-07: The game seed is the public room code, which will leak the deck order once the Hanabi shuffle uses it

**File:** `apps/worker/src/room-do.ts:149`, `packages/rules/src/adapter.ts:40-47`
**Issue:** `startGame(room, actorSeatId, now, this.name)` passes the room code as `seed`. The adapter contract says the shuffle is deterministic from `seed`, which is meant for RULES-19. Every player knows the room code, so any player could recompute the whole deck, including their own hand. That breaks the project's core confidentiality rule. It is harmless with the counter game, but this call site survives the "one-line adapter swap".
**Fix:** Generate a secret seed on the server and keep it only in `RoomState`, for example `crypto.randomUUID()` or 128 random bits from `crypto.getRandomValues`. Add a Phase 2 redaction test asserting the seed never appears in any `RoomView`.

### WR-08: Anyone can create unlimited Durable Objects and storage writes with arbitrary room names

**File:** `apps/worker/src/index.ts:32-34`, `apps/worker/src/room-do.ts:93-111`, `apps/worker/src/persistence.ts:73-82`
**Issue:** Every request to `/parties/room/<anything>` wakes a DO and runs `onStart`. For a new name that means: `__ps_name` put, `deleteAll`, two puts, `getAlarm`, and `setAlarm`. That applies to plain HTTP GETs as well as WebSocket upgrades, and there is no name validation or origin check (the origin check only runs in `onConnect`). A trivial loop can burn through the Free plan's 100K row writes/day, and after that every real room fails to persist. The FDN-03 free-tier constraint makes this an availability risk in production.
**Fix:** Validate the room name in `index.ts` (same change as CR-02) and return 404 for non-WebSocket requests. Make `onStart` persist nothing until the first successful `join`: keep the fallback room in memory, and write storage and arm the alarm only in `#commit`.

### WR-09: `host_transfer` (D-07) effectively never runs, and releasing the host can hand host to a disconnected seat

**File:** `apps/worker/src/scheduler.ts:125-145`, `apps/worker/src/room-state.ts:161-175`
**Issue:** In the lobby, a disconnected host gets `seat_release` at +30s, which always fires before `host_transfer` at +45s. `releaseSeat` then gives host to `remaining[0]` without checking `connected`. So the D-07 "transfer to the earliest connected seat" rule never actually runs, and the lobby can end up with a disconnected host who has no Start control for up to another 30s.
**Fix:** In `releaseSeat`, prefer the earliest connected remaining seat and fall back to `remaining[0]`. Either make the grace periods consistent (host transfer ≤ seat release) or remove the unreachable timer.

## Info

### IN-01: The timing-safe `resolveSeatByToken` is unused, and production compares tokens with `===`

**File:** `apps/worker/src/room-state.ts:99-100`, `apps/worker/src/seat-identity.ts:94-110`
**Issue:** `joinRoom` matches with `seat.seatToken === input.seatToken`. The documented T-1-15 defense (`resolveSeatByToken`) is only exercised by tests, so its comments overstate the protection.
**Fix:** Use `resolveSeatByToken(state.seats, input.seatToken)` in `joinRoom`, or delete the helper and its claim.

### IN-02: Loopback origins on any port are accepted by the production Worker

**File:** `apps/worker/src/origin.ts:22,61-64`
**Issue:** Any page served from `http://localhost:*` on a player's machine passes the origin check against the production Worker. The same check allows a missing Origin header, so this is defense in depth only. The loopback allowance should still be dev-only.
**Fix:** Gate the loopback allowance behind an env var (e.g., `ALLOW_LOOPBACK_ORIGINS`) set only in `wrangler dev` / `.dev.vars`.

### IN-03: The client store is a global singleton that is never reset between rooms

**File:** `apps/web/lib/room-store.ts:77-79`, `apps/web/app/room/[code]/RoomClient.tsx:66-70`
**Issue:** `reset()` is never called. After client-side navigation, such as going back to home and creating another room, `ConnectedRoom` briefly renders the previous room's `view` with its code and seats until the new `joined` arrives.
**Fix:** Call `useRoomStore.getState().reset()` in a `useEffect` keyed on `code` in `ConnectedRoom`, or on unmount.

### IN-04: `resetRoom`'s `deleteAll()` wipes partyserver's `__ps_name` record, and the web client silently defaults to `localhost:8787`

**File:** `apps/worker/src/persistence.ts:77`, `apps/web/lib/room-socket.ts:14`
**Issue:**
- `partyserver` writes `__ps_name` before calling `onStart`. A first-time `resetRoom` deletes it, so the alarm-handler name fallback is gone, and it is rewritten on every wake. This is harmless while `ctx.id.name` is populated.
- Separately, if `NEXT_PUBLIC_WORKER_HOST` is missing at Vercel build time, production connects to `localhost:8787` and just shows "Connecting…".

**Fix:**
- In `resetRoom`, delete only `STORAGE_KEYS` values instead of calling `deleteAll`.
- Make the production build fail when `NEXT_PUBLIC_WORKER_HOST` is unset.

---

_Reviewed: 2026-09-15T15:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
