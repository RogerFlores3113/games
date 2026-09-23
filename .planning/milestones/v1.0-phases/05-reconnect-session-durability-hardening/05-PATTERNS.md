# Phase 5: Reconnect & Session Durability Hardening - Pattern Map

**Mapped:** 2026-09-16
**Files analyzed:** 10 (7 edited, 2 new, 1 config)
**Analogs found:** 10 / 10 (all are self-analogs — this phase edits existing files following their own established internal patterns; no cross-file analog needed for most)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `apps/web/lib/room-socket.ts` | hook (client transport) | event-driven (WebSocket lifecycle) | itself (existing `usePartySocket` config) | exact — extend in place |
| `apps/web/lib/room-store.ts` | store (Zustand) | event-driven (message → state reducer) | itself (existing `applyServerMessage` switch) | exact — extend in place |
| `apps/web/app/room/[code]/RoomClient.tsx` | component (screen switch) | request-response (render-by-status) | itself (existing superseded/abandoned/connecting branches) | exact — extend in place |
| `apps/web/components/HanabiBoard.tsx` | component (board) | request-response (render `RoomView`) | `apps/web/components/SeatRow.tsx` (connection-dot idiom) | exact — copy idiom verbatim |
| `apps/worker/src/room-do.ts` | controller/actor (Durable Object) | event-driven (WS lifecycle + alarm) | itself (`onConnect`/`onClose`/`onAlarm`/`#send`/`#commit`/`#syncAlarm`) | exact — extend in place |
| `apps/worker/src/scheduler.ts` | utility (pure timer derivation) | transform (derive-whole-table) | itself (`computeRoomTimers`'s `idle_gc`/`host_transfer`/`seat_release` blocks) | exact — extend in place |
| `packages/schema/src/constants.ts` | config (tuning constants) | — | itself (existing `HOST_TRANSFER_GRACE_MS`/`LOBBY_SEAT_RELEASE_GRACE_MS` block) | exact — extend in place |
| `apps/worker/tsconfig.json` | config | — | itself | exact — one-line `types` array edit |
| `apps/worker/src/room-do.test.ts` | test (integration, live `wrangler dev` + raw `ws`) | event-driven | itself (existing `describe("RoomDO integration...")` blocks, eviction pattern at line 812) | exact — extend in place |
| `apps/worker/src/source-structure.test.ts` | test (structural/static analysis) | transform (source scan → count assertions) | itself (existing A1-A9 chokepoint tests) | exact — extend in place |
| `docs/manual-checks/mobile-background.md` | doc (manual check) | — | `docs/manual-checks/cold-start.md` | exact — template to copy |
| `e2e/hanabi-realtime.spec.ts`, `e2e/seat-takeover.spec.ts` | test (Playwright e2e) | event-driven | itself (not read this pass — CONTEXT.md/RESEARCH.md say "extend," not read directly; see note below) | role-match — extend existing specs |

**Note on e2e specs:** `e2e/hanabi-realtime.spec.ts` and `e2e/seat-takeover.spec.ts` were not read in this pass (RESEARCH.md's canonical-refs list them as files to extend, and the phase's job is additive test cases inside already-established Playwright fixtures/helpers in `e2e/helpers.ts`). The planner should have the implementing plan read these two files directly before writing new test cases — they are existing analogs of themselves, not files needing an external pattern donor.

## Pattern Assignments

### `apps/web/lib/room-socket.ts` (hook, event-driven)

**Analog:** itself — this file already has every pattern this phase's D-01/D-02/D-11 need; the job is additive listeners and a heartbeat, not a new pattern.

**Existing shape to extend** (full file, 109 lines, already read in full):
```typescript
// Full imports (lines 1-9)
"use client";
import { useEffect, useRef } from "react";
import usePartySocket from "partysocket/react";
import type { PartySocket } from "partysocket";
import { ROOM_ABANDONED_CLOSE_CODE, ServerMessageSchema, type DisplayName } from "@games/schema";
import { clearSeatToken, readJoinSeatToken, writeSeatToken } from "./seat-token";
import { isTerminalCloseCode } from "./close-codes";
import { useRoomStore } from "./room-store";

// The existing latch (line 34) — D-11 requires new reconnect triggers to respect it
const stopReconnectingRef = useRef(false);

// Existing usePartySocket config (lines 36-99): minReconnectionDelay: 1000,
// maxReconnectionDelay: 30000, reconnectionDelayGrowFactor: 1.5,
// shouldReconnectOnClose gates on stopReconnectingRef.current, onClose/onOpen/onMessage.

// Existing reset-on-new-room effect (lines 101-106):
useEffect(() => {
  stopReconnectingRef.current = false;
}, [code]);
```

**What to add, following this file's existing idioms exactly:**
- A `visibilitychange`/`online` `useEffect` (D-01) that checks `stopReconnectingRef.current` first (same guard style as `shouldReconnectOnClose`) before calling `socket.reconnect()`.
- A heartbeat interval `useEffect` (D-02) sending the fixed ping literal via `socket.send(PING_LITERAL)` — NOT `JSON.stringify`, since `onMessage`'s `ServerMessageSchema.safeParse(raw)` (line 78) already silently drops anything that doesn't parse/validate, so a raw literal pong arriving here is naturally ignored by the existing `try { JSON.parse(...) } catch { return; }` (lines 70-76) without any new branch — confirm this is the intended behavior (pong is answered via `setWebSocketAutoResponse`, never reaching `onMessage` at all, per D-02/D-13).
- An exported "reclaim" entry point for D-11's "Use this tab" button that resets `stopReconnectingRef.current = false` and calls `socket.reconnect()` — same call shape as the existing `visibilitychange` handler, just user-triggered instead of event-triggered.
- Import the new heartbeat/timeout constants from `@games/schema` (see `packages/schema/src/constants.ts` pattern below) rather than hardcoding numbers, matching this file's existing import of `ROOM_ABANDONED_CLOSE_CODE` from the same package.

**Error handling pattern** (lines 68-76): non-JSON/invalid input is silently dropped, never thrown — reuse this exact degrade-to-noop shape for any new inbound frame handling.

---

### `apps/web/lib/room-store.ts` (store, event-driven)

**Analog:** itself — extend the existing `RoomConnectionStatus` union and `applyServerMessage` switch.

**Core pattern to extend** (full file, 100 lines, already read in full):
```typescript
// Existing status union (lines 10-22) — D-05 adds a "reconnecting" value here,
// NOT a separate boolean flag bolted on beside `status`, to stay consistent
// with this file's existing single-discriminant design:
export type RoomConnectionStatus =
  | "connecting"
  | "joining"
  | "seated"
  | "refused"
  | "superseded"
  | "abandoned"
  | "join_failed";

// Existing reducer shape (lines 57-95): a switch over message.type, each case
// calling `set({...})` with an explicit partial object — no derived/computed
// fields, no side effects inside the reducer.
applyServerMessage: (message) => {
  switch (message.type) {
    case "joined":
      set({ view: message.view, seatId: message.seatId, status: "seated", refusalReason: null, joinError: null });
      return;
    case "state":
      set({ view: message.view, status: "seated" });
      return;
    // ...
  }
},

setStatus: (status) => set({ status }),
```

**What to add:** D-05 requires the store to KEEP `view` while flipping to a `"reconnecting"`-like state — this is a `setStatus`-driven transition (socket layer calls `setStatus("reconnecting")` on drop, exactly like it already calls `setStatus("joining")` in `room-socket.ts` line 57), NOT a new field. When a `state`/`joined` frame arrives afterward, the existing `case "state"`/`case "joined"` handlers already do `set({ view: ..., status: "seated" })`, which naturally clears the reconnecting flag for free — no new logic needed there. Do not mutate `view` on disconnect (D-05 explicitly: "The stale view is only displayed, never acted on" — `view` must stay whatever it last was).

**Comment style to match:** every field/action in this file has a `/** WR-xx: ... */` or `/** D-xx: ... */` doc comment explaining WHY, not just what — follow this exactly for the new status value.

---

### `apps/web/app/room/[code]/RoomClient.tsx` (component, request-response)

**Analog:** itself — the existing `status === "superseded"` branch (lines 145-159) is the direct analog for D-11's "Use this tab" button; the existing "connecting" fallback (lines 177-198) is the analog for how a full-screen state renders vs. how D-05's banner must NOT behave (banner renders INSIDE `HanabiBoard`, not as a competing full-screen branch here).

**Superseded-screen pattern to extend** (lines 145-159, already read in full):
```typescript
if (status === "superseded") {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-[length:var(--space-md)]"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <p
        className="text-[length:var(--text-body)]"
        style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }}
      >
        This room was opened in another tab.
      </p>
    </main>
  );
}
```
Add a `Button variant="primary"` (import from `../../../components/Button`, matching the import style already used for `RefusalCard`/`JoinForm`/`Lobby`/`HanabiBoard` at lines 16-19) below the `<p>`, wired to `room-socket.ts`'s new reclaim entry point. Per UI-SPEC: `md` gap, label "Use this tab", `data-testid="use-this-tab-button"`.

**Status-render dispatch pattern** (the whole function body from line 140 onward): a flat sequence of `if (status === X) return <...>` early returns, ending in the `view.status === "lobby"` / else-`HanabiBoard` split at lines 200-220. This is the exact shape any new status-based branch must follow — no nested ternaries, no separate router component.

---

### `apps/web/components/HanabiBoard.tsx` (component, request-response)

**Analog:** `apps/web/components/SeatRow.tsx` for the connection-dot idiom (D-07); itself for the turn-indicator string and disabled-controls pattern (D-05/D-08).

**Connection-dot idiom to copy verbatim from `SeatRow.tsx`** (lines 59-73, already read in full):
```tsx
<div className="flex items-center gap-[length:var(--space-xs)]">
  <span
    aria-hidden="true"
    className="inline-block h-2 w-2 rounded-full"
    style={{
      backgroundColor: connected ? "var(--color-status-connected)" : "var(--color-status-disconnected)",
    }}
  />
  <span
    className="text-[length:var(--text-label)]"
    style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
  >
    {connected ? "Connected" : "Disconnected"}
  </span>
</div>
```
Per UI-SPEC §Screens & States item 1: wrap each rendered hand (own + `otherHands`) with this idiom next to the existing seat label, reading `view.seats.find(s => s.seatId === hand.seatId)?.connected`. Add `data-testid={`seat-status-${seatId}`}` per UI-SPEC's stable-hook requirement (line 155 of UI-SPEC).

**Turn-indicator pattern to extend** (`HanabiBoard.tsx` lines 91-102, already read in full):
```tsx
{!isEnded && (
  <p
    data-testid="turn-indicator"
    className="text-[length:var(--text-body)]"
    style={{
      color: game.isYourTurn ? "var(--color-accent)" : "var(--color-text-muted)",
      lineHeight: "var(--text-body--line-height)",
    }}
  >
    {game.isYourTurn ? "Your turn" : `Waiting for ${labelFor(game.activeSeatId)}`}
  </p>
)}
```
Per UI-SPEC/D-07: append " — disconnected" to the `Waiting for {name}` string (never change color to destructive) when `view.seats.find(s => s.seatId === game.activeSeatId)?.connected === false`. Same `data-testid`, same element — do not introduce a second indicator.

**Disabled-controls pattern to reuse for the reconnecting banner (D-05):** `Button` components throughout this file already accept a `disabled` prop (e.g. `disabled={isPlayDisabled(game) || !selectedCardId}` at line 272) — when the store's status is `"reconnecting"`, thread an additional `|| isReconnecting` into every action button's existing `disabled` expression rather than wrapping the whole action area in a new disabled-overlay component. This reuses `Button`'s existing disabled visual treatment (Phase 4, per UI-SPEC's explicit instruction) with no new styling.

**Banner placement:** UI-SPEC gives Claude's discretion on exact placement but specifies `--color-surface` fill, `--color-border` outline, `md` padding, `data-testid="reconnecting-banner"`, positioned above the turn indicator inside the same `<main>` (not a new full-screen branch in `RoomClient.tsx`).

---

### `apps/worker/src/room-do.ts` (Durable Object actor, event-driven)

**Analog:** itself — every relevant pattern (auto-response registration, zombie sweep, alarm handling, connected-flag flip) already has a near-identical sibling in this file.

**Auto-response registration point — `onStart`** (lines 111-119, already read in full):
```typescript
async onStart(): Promise<void> {
  const { room, wasReset } = await loadRoom(this.ctx.storage, () =>
    createEmptyRoom(this.name as RoomCode, "base", Date.now()),
  );
  this.room = room;
  this.#persisted = !wasReset;
  await this.#syncAlarm(this.#persisted ? computeRoomTimers(room, Date.now()) : []);
}
```
Per RESEARCH.md Pattern 1: add `this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_LITERAL, PONG_LITERAL))` here — `onStart` already reruns on every wake (this file's own doc comment on `bindings`, lines 99-106, documents this rerun behavior), which is exactly the re-arm point auto-response needs.

**Existing `onClose`'s `markConnected(..., false, ...)` pattern — the exact shape the zombie sweep's disconnect-flip must reuse** (lines 212-239, already read in full):
```typescript
async onClose(connection: Connection): Promise<void> {
  const seatId = this.#seatIdFor(connection as unknown as ConnectionWithSeat);
  if (seatId === null) return;
  connection.setState(null);
  const liveOwner = this.bindings[seatId];
  if (liveOwner !== undefined && liveOwner !== connection.id) return;
  const room = await this.#ensureRoom();
  if (!this.#persisted || !room.seats.some((seat) => seat.seatId === seatId)) return;
  const now = Date.now();
  const nextState = markConnected(room, seatId, false, now);
  await this.#commit(nextState, now);
  await this.#pushState();
}
```
D-03's zombie sweep must call `connection.close(...)` (which triggers this SAME `onClose` path) rather than calling `markConnected` directly from `onAlarm` — this is what "flipped to disconnected through the existing `onClose` path" in CONTEXT.md D-03 means concretely: no new state-mutation call site, reuse this one.

**`onAlarm`'s existing `for (const event of due)` dispatch loop — the exact site the zombie-sweep `TimerType` case must be added to** (lines 247-309, already read in full):
```typescript
for (const event of due) {
  now = Date.now();
  if (event.type === "host_transfer") {
    current = transferHost(current, now);
  } else if (event.type === "seat_release" && event.seatId !== undefined) {
    const released = releaseSeat(current, event.seatId, now);
    if (released.ok) current = released.state;
  } else if (event.type === "idle_gc") {
    // ... (abandon-room branch, lines 271-294)
  }
}
```
Add an `else if (event.type === "zombie_sweep")` branch here per RESEARCH.md Pattern 2: iterate `this.getConnections()`, check `this.ctx.getWebSocketAutoResponseTimestamp(connection)` against the staleness threshold, and `connection.close(...)` for stale ones — the resulting `onClose` handles the state flip (see above), so this branch itself performs NO direct `markConnected` call, matching the CR-01/detach-before-close discipline already documented at lines 217-224.

**`#send`/single-writer chokepoint (D-13, MUST NOT be touched by the heartbeat):**
```typescript
// Lines 421-428, already read in full — the ONLY method that calls connection.send:
#send(connection: Connection, frame: OutboundFrame): void {
  connection.send(encodeServerMessage(frame));
}
```
The ping/pong auto-response explicitly bypasses this method entirely (per D-02/D-13) — `source-structure.test.ts`'s A1/A3 counts (exactly 1 `.send(`, exactly 1 `#send(` definition, ≥8 `this.#send(` call sites) must stay unchanged by this phase's heartbeat work; only the zombie-sweep's `connection.close(...)` and `onClose`→`#pushState()`→`this.#send(...)` cascade adds new **calls into the existing chokepoint**, not new chokepoints.

**Error-containment pattern to mirror for the zombie sweep** (`onMessage`'s try/catch, lines 141-209, and `onAlarm`'s own try/catch, lines 247-309): every handler in this file wraps its body in try/catch and logs via `console.error` with a prefixed message (`"RoomDO onMessage failed (${connection.id}):"`, `"RoomDO onAlarm failed:"`) rather than letting an exception escape and tear down the room (T-1-10, documented at lines 138-140 and 302-308). Follow this exact shape for any new zombie-sweep logic added inside `onAlarm`.

---

### `apps/worker/src/scheduler.ts` (pure utility, transform)

**Analog:** itself — `computeRoomTimers`'s existing three derivation blocks are the direct template for the new `zombie_sweep` `TimerType`.

**Full existing derivation pattern to extend** (lines 99-148, already read in full):
```typescript
export type TimerType = "idle_gc" | "host_transfer" | "seat_release";

export function computeRoomTimers(state: RoomState, now: number): TimerEvent[] {
  void now;
  let timers: TimerEvent[] = [];

  const idleGcMs = state.status === "in_progress" ? IDLE_GC_IN_PROGRESS_MS : IDLE_GC_LOBBY_MS;
  timers = upsertTimer(timers, { type: "idle_gc", dueAt: state.lastActivityAt + idleGcMs });

  if (state.status === "lobby" && state.hostSeatId !== null) {
    const hostSeat = state.seats.find((s) => s.seatId === state.hostSeatId);
    if (hostSeat && !hostSeat.connected && hostSeat.disconnectedAt !== null) {
      timers = upsertTimer(timers, {
        type: "host_transfer",
        dueAt: hostSeat.disconnectedAt + HOST_TRANSFER_GRACE_MS,
      });
    }
  }
  // ... seat_release block, same shape ...
  return timers;
}
```
Add `"zombie_sweep"` to the `TimerType` union (line 31) and a new block: `if (state.seats.some((s) => s.connected)) { timers = upsertTimer(timers, { type: "zombie_sweep", dueAt: now + ZOMBIE_SWEEP_INTERVAL_MS }); }`. **Read Pitfall 3 in RESEARCH.md before writing this** — because `computeRoomTimers` is called on EVERY `#commit` (not just alarm fires), a `now + INTERVAL` derivation risks perpetually deferring; RESEARCH.md's resolution is to treat the timer's firing as "check again," with the actual staleness decision made at sweep time in `room-do.ts` against `getWebSocketAutoResponseTimestamp`, not against whether the alarm fired "on schedule."

**Module-level constraint documented in this file's header (lines 1-20, already read in full) that the new code must respect:** "never touches `ctx.storage`, never calls `setAlarm`, and never reads `Date.now()`" — the zombie-sweep block must take `now` as the existing parameter, exactly like every other block in this function, never call `Date.now()` internally.

---

### `packages/schema/src/constants.ts` (config)

**Analog:** itself — the existing grace-period constants are the direct template for the new heartbeat/timeout/staleness values.

**Existing pattern to extend** (full file, 64 lines, already read in full):
```typescript
/** D-07: host auto-transfers to the next connected seat after 20s
 * disconnected, in the lobby only. Must stay SHORTER than
 * `LOBBY_SEAT_RELEASE_GRACE_MS` (WR-09): ... */
export const HOST_TRANSFER_GRACE_MS = 20_000;

/** D-12: a disconnected lobby seat is freed for someone else after 30s.
 * In-progress seats are NEVER auto-released in this phase. */
export const LOBBY_SEAT_RELEASE_GRACE_MS = 30_000;
```
Add (per RESEARCH.md Open Question 2's concrete recommendation and D-04's intent): a `HEARTBEAT_INTERVAL_MS` (client ping cadence while visible), `HEARTBEAT_PONG_TIMEOUT_MS` (client-side "force reconnect if no pong" timeout), and `ZOMBIE_SWEEP_STALENESS_MS` (server-side threshold against `getWebSocketAutoResponseTimestamp`) — each with a `/** D-04: ... */`-style doc comment explaining the tradeoff, exactly matching every existing constant in this file. RESEARCH.md's suggested starting values: ping every 15s, pong timeout 10s, server staleness ~45-60s — the planner should lock exact numbers here, not leave them as inline magic numbers in `room-socket.ts`/`room-do.ts`/`scheduler.ts`.

**File-level convention documented at the top of this file (lines 1-4, already read in full):** "Every discretionary number CONTEXT.md delegated to planning ... is fixed HERE as a single named export set. Later plans import from this file rather than re-deciding any of these values." This applies directly to D-04's discretion.

---

### `apps/worker/src/source-structure.test.ts` (structural test)

**Analog:** itself — the existing A1-A9 chokepoint-count tests are the exact template for D-13's "no new frame types, no new call sites, heartbeat not routed through `#send`" proof.

**Pattern to extend** (e.g. A1, lines 207-214; A8, lines 290-295, already read in full):
```typescript
it("A1: `.send(` occurs exactly once across all non-test files, in room-do.ts, and room-do.ts calls connection.send(encodeServerMessage(", () => {
  const hits = findFilesWithMatch(/\.send\(/g);
  const total = hits.reduce((sum, h) => sum + h.count, 0);
  expect(total, `expected exactly 1 total .send( match, found in: ${JSON.stringify(hits)}`).toBe(1);
  expect(hits).toHaveLength(1);
  expect(hits[0]?.file).toBe("room-do.ts");
  expect(strippedByFile.get("room-do.ts")).toContain("connection.send(encodeServerMessage(");
});

it("A8 (D-10): room-do.ts has exactly 1 #viewFor method definition, exactly 1 `type: \"joined\"`, and exactly 1 `type: \"state\"` occurrence", () => {
  const roomDo = strippedByFile.get("room-do.ts") ?? "";
  expect(countMatches(roomDo, /^\s*#viewFor\(/gm)).toBe(1);
  expect(countMatches(roomDo, /type:\s*"joined"/g)).toBe(1);
  expect(countMatches(roomDo, /type:\s*"state"/g)).toBe(1);
});
```
D-02/D-13 require a NEW test asserting: (1) the A1/A3/A8 counts are literally UNCHANGED after this phase's edits (re-run/reassert the existing numbers, since D-02 explicitly says "must stay unchanged, or be amended explicitly with justification"), and (2) `setWebSocketAutoResponse(` appears exactly once (in `onStart`), never inside `#send` or `onMessage`. Follow the exact `findFilesWithMatch`/`countMatches` helper style already defined at the top of this file (lines 134-149) — do not write a new ad-hoc string-search helper.

---

### `apps/worker/src/room-do.test.ts` (integration test, `wrangler dev` + raw `ws`)

**Analog:** itself — the existing CR-01 test (lines 280-323) and the forced-eviction test (lines 812-858) are the direct templates for D-12's "heartbeat/zombie-close paths must not corrupt CR-01" proof and D-15's "reconnect after eviction returns same seat/view" proof.

**`openSocket`/`send`/`collectMessages` harness helpers (lines 100-178, not fully quoted here — read in full at time of planning):** every existing test in this file opens raw `WebSocket`s against the spawned `wrangler dev` process via `openSocket(code)`, sends via `send(ws, msg)`, and collects frames via `collectMessages(ws)`. New heartbeat/zombie-sweep tests must reuse these exact helpers, sending the raw ping literal via `ws.send(PING_LITERAL)` (not `send(ws, {...})`, which JSON-stringifies) and asserting a raw pong arrives without a `state`/`joined` frame accompanying it.

**Forced-eviction pattern to reuse for D-15** (lines 812-858 header, already located via grep — read the full block at implementation time): kills and respawns the `wrangler dev` child process on the same port (`killAndWait`/`spawnWrangler`/`waitForReady`, lines 52-99) to prove persisted state survives real eviction, not just a socket reconnect. D-15's "Reconnect after a forced worker eviction mid-game" test should follow this exact respawn sequence.

**Timing-injection requirement (D-15):** "Timing constants are injectable or shortened for tests, so no test sleeps for real minutes." The planner should design the new heartbeat/staleness constants (in `packages/schema/src/constants.ts`) to be short enough for CI, or add an environment-injectable override — check how existing grace periods (`LOBBY_SEAT_RELEASE_GRACE_MS`, already imported at line 32 of this test file) are exercised in existing tests for the established pattern of waiting out a real (but short, ~30s) grace period in `wrangler dev` tests, versus needing a faster override for a 45-60s zombie-sweep threshold.

---

### `docs/manual-checks/mobile-background.md` (new file)

**Analog:** `docs/manual-checks/cold-start.md` (full file, 72 lines, already read in full) — this is an explicit, named template per D-16.

**Structure to copy exactly:**
```markdown
# <Check Name> (<REQ-ID>)

## Why this check exists
<architecture claim being verified, why CI/local dev cannot fake it>

## Procedure
<numbered steps, ending in "Append a row to the Log below ... do not estimate or backfill">

## Log
| Date | ... | Notes |
|------|-----|-------|
| ... | ... | ... |

## When to re-run
<bullet list of future phases/triggers>

## What failure looks like
<bulleted list of failure signatures, ending in "If any of these are observed, do not mark <REQ-ID> as passing">
```
Adapt for RT-04's "10+ minutes backgrounded on a real phone" scenario: the "Why" section should explain that CDP-forced freeze (Pitfall 4) cannot fully substitute for real OS suspension, the "Procedure" should specify a real phone, real backgrounding duration (≥10 min), locking/unlocking the screen mid-game, and confirming the same seat/turn is resumed plus the other player saw a correct disconnected→connected transition. The "Log" table and "do not estimate or backfill" instruction, and the waived-with-justification precedent shown in `cold-start.md`'s own Log row (line 45), are the exact sign-off format D-16 requires ("recorded as the owner's verbatim reply, never fabricated").

---

## Shared Patterns

### Single alarm slot / derive-whole-table
**Source:** `apps/worker/src/scheduler.ts` (module header, lines 1-20) + `apps/worker/src/room-do.ts` `#syncAlarm` (lines 461-484)
**Apply to:** Any new timer logic (zombie sweep). Never call `ctx.storage.setAlarm` from anywhere but `#syncAlarm`; never derive a timer's `dueAt` from a value that changes on every ordinary message (see Pitfall 3 discussion above).

### Detach-before-close (CR-01)
**Source:** `apps/worker/src/room-do.ts` `#handleJoin`'s supersede branch (lines 370-380): `superseded.setState(null)` is called BEFORE `superseded.close(...)`.
**Apply to:** The zombie sweep's `connection.close(...)` call in `onAlarm` — must also `connection.setState(null)` first, exactly like the existing supersede and idle-GC abandon paths (line 287: `connection.setState(null)` before `connection.close(...)` in the idle_gc abandon loop), so the resulting `onClose` doesn't corrupt a seat a newer connection may have already claimed.

### Single `#send` chokepoint
**Source:** `apps/worker/src/room-do.ts` lines 421-428, enforced by `apps/worker/src/source-structure.test.ts` A1/A3.
**Apply to:** All new outbound frames. The heartbeat pong is the deliberate EXCEPTION (routes through `setWebSocketAutoResponse`, never `#send`) — this must be a conscious, tested exception, not an accidental second writer.

### Doc-comment convention (`/** D-xx: ... */` / `/** WR-xx: ... */`)
**Source:** pervasive across every file read this pass (`constants.ts`, `scheduler.ts`, `room-do.ts`, `seat-identity.ts`, `room-socket.ts`, `room-store.ts`).
**Apply to:** Every new constant, method, and non-obvious branch this phase adds — cite the CONTEXT.md decision ID (D-01 through D-16) it implements, exactly like the existing codebase does for D-01 through D-17 already in place.

### Connection-dot + label idiom (never color alone)
**Source:** `apps/web/components/SeatRow.tsx` lines 59-73.
**Apply to:** `HanabiBoard.tsx`'s new per-seat status rendering (D-07) — copy verbatim, do not redesign; UI-SPEC explicitly forbids inventing a new visual for the same fact.

### Status-driven full-file re-render, no local derived state
**Source:** `apps/web/lib/room-store.ts`'s `applyServerMessage` switch + `apps/web/app/room/[code]/RoomClient.tsx`'s flat `if (status === X)` dispatch.
**Apply to:** Any new client-side state this phase introduces (reconnecting flag, superseded-reclaim pending state) — stay inside the existing single-discriminant `status` design, do not add a parallel boolean that can desync from it.

## No Analog Found

None. Every file this phase touches already exists with an established internal pattern from Phases 1-4; this is a hardening phase with zero new architectural surface (confirmed by RESEARCH.md's own framing: "Nothing new is being invented architecturally").

## Metadata

**Analog search scope:** `apps/web/lib/`, `apps/web/components/`, `apps/web/app/room/[code]/`, `apps/worker/src/`, `packages/schema/src/`, `docs/manual-checks/`
**Files scanned/read in full:** `room-socket.ts`, `room-store.ts`, `RoomClient.tsx`, `HanabiBoard.tsx`, `SeatRow.tsx`, `room-do.ts`, `scheduler.ts`, `seat-identity.ts`, `source-structure.test.ts`, `constants.ts`, `cold-start.md` (11 files, all read in full — none exceeded 2,000 lines); `room-do.test.ts` scanned via `grep` for structural landmarks (1083 lines, targeted read deferred to implementation time per its own size).
**Pattern extraction date:** 2026-09-16
