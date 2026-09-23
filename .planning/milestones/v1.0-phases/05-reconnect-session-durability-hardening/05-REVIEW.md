---
phase: 05-reconnect-session-durability-hardening
reviewed: 2026-09-16T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - apps/web/app/room/[code]/RoomClient.tsx
  - apps/web/components/HanabiBoard.tsx
  - apps/web/components/Lobby.tsx
  - apps/web/components/ReconnectingBanner.tsx
  - apps/web/lib/close-codes.test.ts
  - apps/web/lib/hanabi-board-logic.test.ts
  - apps/web/lib/hanabi-board-logic.ts
  - apps/web/lib/heartbeat.test.ts
  - apps/web/lib/heartbeat.ts
  - apps/web/lib/room-socket.ts
  - apps/web/lib/room-store.test.ts
  - apps/web/lib/room-store.ts
  - apps/worker/src/heartbeat.test.ts
  - apps/worker/src/heartbeat.ts
  - apps/worker/src/room-do.test.ts
  - apps/worker/src/room-do.ts
  - apps/worker/src/scheduler.test.ts
  - apps/worker/src/scheduler.ts
  - apps/worker/src/source-structure.test.ts
  - apps/worker/tsconfig.json
  - docs/manual-checks/mobile-background.md
  - e2e/hanabi-realtime.spec.ts
  - e2e/helpers.ts
  - e2e/seat-takeover.spec.ts
  - packages/schema/src/constants.test.ts
  - packages/schema/src/constants.ts
  - playwright.config.ts
findings:
  critical: 2
  warning: 6
  info: 5
  total: 13
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-09-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the Phase 5 heartbeat, zombie-sweep and reconnect work on the worker (RoomDO, scheduler, heartbeat helpers) and on the client (room-socket hook, heartbeat decisions, store, RoomClient, board/lobby reconnecting UI), plus the tests that go with it. I checked the partyserver lifecycle in `node_modules/partyserver/dist/index.js`. Its `alarm()`, `webSocketMessage()` and `webSocketClose()` all call `#ensureInitialized()`, and that runs `onStart()` before the handler whenever the instance has been evicted from memory.

The heartbeat rule holds. The pong comes back through `setWebSocketAutoResponse`, there is still exactly one `.send(` in the worker (inside `#send`), and the client sends the raw ping with `socket.send` without wrapping it in JSON. The superseded-tab latch is checked in all three automatic triggers (visibility, online, pong timeout).

The main problems are in how the zombie sweep is scheduled:

1. `onAlarm` picks due events from the **persisted** timer table. The alarm, however, is set from a timer table built **in memory** (`#timers` plus the in-memory `#pendingZombieSweepAt`), and the two can differ. When they do, the sweep target is never cleared. Depending on how the runtime reports `getAlarm()` inside an alarm handler, the room either sets an alarm in the past over and over (a tight loop that uses up the free-tier request quota) or loses its alarm entirely.
2. The sweep only looks at sockets that are still open. A seat marked `connected: true` in storage with no socket behind it, which is exactly what an eviction or deploy leaves behind, is never fixed. Teammates see a player who left as "Connected", the lobby host never transfers, and the room wakes every 15s until idle GC.
3. `#pendingZombieSweepAt` is lost on hibernation, and `onStart` rebuilds it from `Date.now()`. So the Pitfall 3 race (an alarm that is overdue but not yet delivered gets pushed back by a newer target) comes back for any DO that hibernates between moves, which is the normal case for Hanabi. The only regression test keeps the DO awake with a message every 500ms, so it never covers this.

On the client, returning to a tab forces a reconnect even when the socket is healthy, if nothing has been heard for more than 30s. Chrome throttles background timers to about once a minute, so every alt-tab back from the voice call longer than ~30s tears down a working socket and briefly shows the player as disconnected.

## Critical Issues

### CR-01: Alarm is set from in-memory timers but events are chosen from persisted timers, which can cause an alarm loop in the past or a lost alarm

**File:** `apps/worker/src/room-do.ts:288-289, 353-358, 371, 377, 409-423`
**Issue:**
`onAlarm` builds `due` from `loadTimers(this.ctx.storage)`, the table saved at the last `#commit`. Only the `zombie_sweep` branch clears `#pendingZombieSweepAt`, and only when a `zombie_sweep` entry is actually in that **persisted** `due` list. Every `#syncAlarm` call, though, uses the **in-memory** `#timers()` result, and `#timers()` keeps returning the saved `#pendingZombieSweepAt` until that branch runs.

When the persisted table has no `zombie_sweep` entry but some seat has `connected: true`, the alarm is set for the in-memory target T and fires. `due` does not include `zombie_sweep`, so the target is not cleared. The code after the loop calls `#syncAlarm(#timers(...))`, which returns T again, and T is now in the past.
- If `getAlarm()` returns `null` during the handler, `setAlarm(T)` sets an alarm in the past. It fires again right away and repeats while the instance stays in memory. That loop uses up the Workers Free 100k requests/day shared by **every** room.
- If `getAlarm()` still returns T, `next === currentAlarm`, so nothing is set. Once the handler finishes the alarm is gone. No sweep and no idle GC happen until some unrelated event arrives.

How this happens in practice:
- **Rooms saved before Phase 5.** `ROOM_SCHEMA_VERSION` was not bumped (still 3), so their saved `timers` hold only `idle_gc`/`host_transfer`/`seat_release`. `onStart` sets `#pendingZombieSweepAt` and the alarm without saving, and if nobody rejoins (no `#commit`) the saved table never gains a `zombie_sweep` entry. CR-02 makes this likely: seats keep `connected: true` after the deploy drops their sockets.
- **The catch path.** An exception in the `due` loop before line 358 (for example `getWebSocketAutoResponseTimestamp` or `connection.close` throwing, or an earlier `transferHost` throwing) leaves `#pendingZombieSweepAt` at T, now in the past. Line 377 then calls `#syncAlarm(#timers(...))`, which sets an alarm in the past. If the failure is deterministic, the handler fails again on every firing and the loop never ends. Without the in-memory target, a fresh calculation would have given a future time.

**Fix:** Make the sweep decision independent of the persisted table, and never set an alarm in the past from the saved target. For example:
```ts
// onAlarm: decide the sweep from live state, not from the stored table
const now = Date.now();
const sweepDue =
  current.seats.some((s) => s.connected) &&
  (this.#pendingZombieSweepAt === null || this.#pendingZombieSweepAt <= now);
const events = due.filter((e) => e.type !== "zombie_sweep");
if (sweepDue) events.push({ type: "zombie_sweep", dueAt: now });
...
// #timers: never reuse a target that is already in the past
if (this.#pendingZombieSweepAt === null || this.#pendingZombieSweepAt <= now) {
  this.#pendingZombieSweepAt = freshSweep.dueAt;
}
```
Also clear `#pendingZombieSweepAt` in the `catch` block (or do the past-target check above) so a sweep that throws cannot set an alarm in the past. Consider bumping `ROOM_SCHEMA_VERSION`, or backfilling a missing `zombie_sweep` entry on load. Add a unit test where the saved timers have no `zombie_sweep` and a seat is `connected: true`, and assert that the alarm is set in the future after `onAlarm`.

### CR-02: The zombie sweep never clears `connected: true` on seats that have no socket

**File:** `apps/worker/src/room-do.ts:339-352` (with `scheduler.ts:164-170`)
**Issue:** The sweep loops over `this.getConnections()` only (partyserver yields OPEN sockets only). If a seat has `connected: true` in storage but no socket at all, it is never looked at. That state is common: a deploy, an eviction, or a DO restart drops every hibernated socket, and `webSocketClose` is not guaranteed to reach the new instance. The phase exists to catch sockets that die "without ever delivering a close event", and this is the most common case of that. Consequences:
- Other players see a teammate who has left as "Connected", and the turn indicator never shows "— disconnected" (breaks D-07/RT-06).
- In the lobby, `computeRoomTimers` only schedules `host_transfer`/`seat_release` for seats with `!connected`. A host who left is therefore never replaced and their seat is never released, so the lobby cannot start.
- `computeRoomTimers` keeps scheduling `zombie_sweep` because "some seat is connected". A room with no sockets wakes every 15s for up to 1h (lobby) or 12h (in progress). In an older room this also triggers CR-01.
- The e2e/integration tests close sockets cleanly before killing wrangler (`room-do.test.ts` D-15 test: `wsAlice.close(); wsBob.close();` before `killAndWait`), so they never cover this.

**Fix:** In the sweep branch, also mark disconnected every seat that is `connected` in storage but has no live binding (with a grace period based on `lastActivityAt` or a new `connectedAt`, so a join in progress is not caught):
```ts
const bound = this.bindings;
for (const seat of current.seats) {
  if (seat.connected && bound[seat.seatId] === undefined) {
    current = markConnected(current, seat.seatId, false, now); // or route via #disconnectSeat with a sentinel id
  }
}
```
If you do this through `#disconnectSeat`, the structural test P5-5 (one `markConnected` call, two `#disconnectSeat` calls) needs updating. Add an integration test that kills wrangler **without** closing the sockets and asserts the surviving seat sees the other seat flip to `connected: false`.

## Warnings

### WR-01: `#pendingZombieSweepAt` is lost on hibernation, so the Pitfall 3 race comes back for DOs that hibernate

**File:** `apps/worker/src/room-do.ts:114-132, 158-164, 409-423`
**Issue:** The field comment says a hibernation wake "re-derives it fresh in onStart". That fresh value is exactly the re-derivation the field was added to avoid. Take a room with the alarm set for boundary T that hibernates. A message wakes it at `now >= T`, after the boundary but before the runtime has delivered the alarm (delivery is best-effort and can lag, and retries back off). `webSocketMessage → #ensureInitialized → onStart` finds `#pendingZombieSweepAt === null` and computes T+interval. `#syncAlarm` sees `next !== currentAlarm` and **overwrites the pending T alarm**, pushing the sweep back one interval. In a Hanabi game players often think for more than 10s between moves and heartbeat pings do not wake the DO, so hibernating between messages is the normal case. The fix therefore only works while the DO stays in memory. The regression test ("a chatty host acting every 500ms") keeps the DO awake the whole time and cannot catch this.
**Fix:** Persist the pending sweep target (for example keep the `zombie_sweep.dueAt` already in the saved `timers` table) and restore it in `onStart` before calling `#timers`. Also treat an existing alarm whose time is `<= now` as authoritative in `#syncAlarm`: do not replace a pending alarm that is already overdue with a later one.
```ts
// onStart
const stored = (await loadTimers(this.ctx.storage)).find((t) => t.type === "zombie_sweep");
this.#pendingZombieSweepAt = stored?.dueAt ?? null;
```

### WR-02: Returning to a tab tears down a healthy socket after a normal alt-tab

**File:** `apps/web/lib/heartbeat.ts:77-79`, `apps/web/lib/room-socket.ts:219-229, 242-243`
**Issue:** `resumeAction` returns `"reconnect"` for an OPEN socket if `now - lastHeardAt > intervalMs + pongTimeoutMs` (30s). The code comment itself says Chrome's intensive throttling limits hidden-tab timers to once a minute, so pings, and the pongs that update `lastHeardAt`, can be about 60s apart on a perfectly healthy socket. A desktop player who alt-tabs to Discord for more than 30s and comes back gets `socket.reconnect()`. Their teammates then see a "Disconnected" state pushed to them (server `onClose`), the player sees the "Reconnecting…" banner, and a click in that window is dropped (`maxEnqueuedMessages: 0`). The unit test `heartbeat.test.ts` "reconnects when OPEN but nothing has been heard…" locks in this behavior.
**Fix:** When the socket is OPEN, always return `"ping"` and let the existing pong-timeout path decide whether it is dead (at most 10s more). Only return `"reconnect"` when `readyState !== OPEN`, or when the gap is far beyond any throttling (for example `> SOCKET_STALE_MS`, after which the server has already reaped the socket).

### WR-03: The superseded latch depends on a parsed frame, not the close code, so the ping-pong between tabs can still happen

**File:** `apps/web/lib/room-socket.ts:84-101, 165-167`
**Issue:** `stopReconnectingRef` is set for supersede only when the `superseded` JSON frame passes `ServerMessageSchema.safeParse`. For a 4001 close, `onClose` returns early (`isTerminalCloseCode`) **without setting the latch or the status**. If the frame is dropped (for example a mismatched schema across a deploy, so `safeParse` fails and the message is silently ignored), the tab ends up with status `"seated"`, a CLOSED socket and no latch. The next `visibilitychange`/`online` event runs `resumeAction` → `readyState !== OPEN` → `"reconnect"`, which automatically takes the seat back from the other tab. That other tab is in the same state, which is the exact auto ping-pong D-11 forbids.
**Fix:** Set the latch from the close code itself:
```ts
onClose: (event) => {
  if (isTerminalCloseCode(event.code)) {
    stopReconnectingRef.current = true;
    if (event.code === SUPERSEDED_CLOSE_CODE) setStatus("superseded");
    ...
  }
```

### WR-04: Any unrelated `error` frame while reconnecting counts as a failed join and sends the player back to the name form

**File:** `apps/web/lib/room-socket.ts:168-176`, `apps/web/lib/room-store.ts:85-94`, `apps/worker/src/room-do.ts:178-183`
**Issue:** In the `"reconnecting"` status, the store turns *any* `error` frame into `join_failed`: it wipes `view`, clears the stored display name (`RoomClient.tsx:130`) and unmounts the room. Error frames are not tied to the message that caused them. The server also answers a stray `HEARTBEAT_PING` that reaches `onMessage` with `bad_request`, because `parseClientMessage("__ping__")` fails. The client sends pings while `"reconnecting"` (the socket is OPEN before `joined` arrives), so if a ping ever reaches `onMessage` instead of the auto-response (for example a race in auto-response registration on a fresh instance), a seated player who is reconnecting gets bounced to the join form. The spike test covers only the normal case.
**Fix:** In `onMessage`, return early without replying when `raw === HEARTBEAT_PING`. The structural test P5-2 would need a narrowly scoped exception, or put the check in a helper. On the client, set `join_failed` only for errors that answer the join (for example add `detail`/`inReplyTo: "join"` to join-rejection errors), or only while `status === "joining"` before any `joined` has been received on that socket.

### WR-05: Resume triggers call `reconnect()` while the socket is still CONNECTING

**File:** `apps/web/lib/heartbeat.ts:74-76`, `apps/web/lib/room-socket.ts:242-243`
**Issue:** `readyState !== OPEN` includes `CONNECTING (0)`. On a flaky mobile network, `online` and `visibilitychange` often fire in bursts. Each one aborts the handshake in progress and starts a new one, which can repeatedly block the connection from completing, the opposite of D-01's goal.
**Fix:** Return `"none"` for `readyState === 0`, and `"reconnect"` only for `CLOSING`/`CLOSED`.

### WR-06: Tests do not exercise the paths their titles claim

**File:** `e2e/hanabi-realtime.spec.ts:253-296`, `apps/worker/src/room-do.test.ts` ("Pitfall 3: a chatty host…")
**Issue:**
- The RT-04 test "a frozen, hidden tab…" silently ignores a failure of `freezePage` and relies on `setOffline(true)`. `setOffline(false)` fires `online`, and partysocket reconnects with its own backoff, so the visibility-resume path (D-01) is never shown to be what restored the seat. The test would pass with the visibility handler deleted.
- The Pitfall 3 integration test sends a message every 500ms, which keeps the DO in memory, so it cannot catch the hibernation regression in WR-01.
- No test kills the worker without first closing sockets cleanly (CR-02), and no test covers a saved timer table without `zombie_sweep` (CR-01).
**Fix:** In RT-04, make the recovery depend on visibility: stay offline → emulate `visible` → assert that a reconnect happens before partysocket's backoff would have fired, or restore the network without an `online` event. Add worker tests that let the DO hibernate (for example gaps longer than 10s with sparse messages timed across a sweep boundary), and the two CR cases.

## Info

### IN-01: `#pendingZombieSweepAt` is not reset when idle GC deletes the room

**File:** `apps/worker/src/room-do.ts:322-325`
**Issue:** After `deleteAll()`, the old target stays in memory. The next join in the recreated room makes `#timers` reuse that past target, so an alarm is set in the past and a sweep fires immediately for no reason (and CR-01 conditions apply).
**Fix:** Set `this.#pendingZombieSweepAt = null;` next to `this.room = null`.

### IN-02: The saved `zombie_sweep.dueAt` goes stale after sweeps that change nothing, contradicting the scheduler's "cannot drift" claim

**File:** `apps/worker/src/room-do.ts:363-371`, `apps/worker/src/scheduler.ts:14-20`
**Issue:** A sweep that changes nothing does not save, so the saved `zombie_sweep.dueAt` stays in the past forever. Every later `host_transfer`/`seat_release` alarm then runs an extra sweep, and the saved table no longer matches the alarm. This is harmless on its own, but it is the gap CR-01 grows out of, and the module header comment is now wrong.
**Fix:** Resolve CR-01/WR-01 by persisting the sweep target, or update the documentation.

### IN-03: The worker's whole type environment switched to `@cloudflare/workers-types/experimental`

**File:** `apps/worker/tsconfig.json:4`
**Issue:** Experimental types let APIs not enabled by `compatibility_date: 2026-09-01` type-check across the whole worker, just to type `getWebSocketAutoResponseTimestamp`.
**Fix:** Prefer the dated entry point matching the compatibility date, or add a small local type declaration for the one API.

### IN-04: The comment on `sendPing` contradicts the code

**File:** `apps/web/lib/room-socket.ts:182-186`
**Issue:** The comment says "Declared as a plain function (not useCallback)", but the code uses `useCallback`.
**Fix:** Fix the comment.

### IN-05: Dead code in the structural test

**File:** `apps/worker/src/source-structure.test.ts` (P5-5: `onErrorIdx` … `void onErrorIdx;`)
**Issue:** The variable is computed and then thrown away with `void`.
**Fix:** Remove it.

---

_Reviewed: 2026-09-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
