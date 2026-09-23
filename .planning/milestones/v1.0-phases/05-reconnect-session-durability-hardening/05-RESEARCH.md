# Phase 5: Reconnect & Session Durability Hardening - Research

**Researched:** 2026-09-16
**Domain:** Cloudflare Durable Object WebSocket Hibernation (auto-response/dead-peer detection), `partysocket` client reconnect, Playwright network/lifecycle simulation
**Confidence:** HIGH (all load-bearing APIs confirmed directly against the exact installed package versions in this repo's `node_modules`, not training-data recall)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** The client reconnects right away when the tab becomes visible again or the network comes back (`visibilitychange` → visible, `online`), rather than waiting out partysocket's backoff, which can reach 30s. On resume, if the socket is not `OPEN` or has not heard from the server recently, force `socket.reconnect()`. Retries and backoff otherwise stay inside partysocket (Phase 1's "don't hand-roll retry" rule still holds).

**D-02:** A lightweight application heartbeat catches half-open sockets, which are common after mobile suspend: the socket looks `OPEN` but is dead. The client sends a ping on an interval while visible. If no pong or other frame arrives within a timeout, it force-reconnects. On the server, the ping must be answered via the Durable Object's `setWebSocketAutoResponse`, so heartbeats never wake a hibernated DO or cost billed duration. The ping/pong frames are fixed literal strings. They sit outside `ServerMessageSchema` and are not state-bearing, so they do not violate the Phase 2 D-08 single-`#send` chokepoint. `source-structure.test.ts` counts must stay unchanged, or be amended explicitly with justification.

**D-03:** The server also marks zombie sockets disconnected, so other players' indicators tell the truth. A socket whose last auto-response timestamp (`getWebSocketAutoResponseTimestamp`) is older than a threshold is treated as gone. It is closed, and its seat is flipped to disconnected through the existing `onClose` path. This runs from the existing alarm-driven scheduler, using `computeRoomTimers`' derive-the-whole-table pattern and never a second alarm. The check is scheduled only while seats are connected, so an empty room still hibernates and costs nothing.

**D-04:** Timing values (ping interval, pong timeout, server staleness threshold) are Claude's discretion, within this intent: a returning player is seated within a few seconds of the tab becoming visible, and teammates see a dead phone go "disconnected" within about a minute, not instantly on a blip.

**D-05:** During a reconnect, the client keeps rendering the last server view with a visible "Reconnecting…" banner and all action controls disabled. It does not drop back to the full-screen "Connecting to room…" page. The store keeps `view` and adds a connection-state flag (for example, `status: "reconnecting"` once a view has been received). The server stays authoritative. The stale view is only displayed, never acted on.

**D-06:** An action attempted just before the connection dropped is not queued or auto-replayed after reconnect. Controls are disabled while disconnected. After reconnect, the fresh view is the truth, and the player re-decides. The Phase 4 `actionId` dedup already makes a send that raced the drop safe if it did reach the server. Silent replay of a stale intent against a possibly changed table is worse than a re-click.

**D-07:** The Hanabi board shows per-seat connection status for every player. It reuses the lobby's connected/disconnected tokens (`--color-status-connected` / `--color-status-disconnected`) at Phase 4's plain fidelity. When the active player is disconnected, the turn indicator says so explicitly (for example, "Waiting for Bianca — disconnected"), so the table reads as paused rather than frozen. Phase 6 restyles it. This phase makes it exist and be correct.

**D-08:** "Pauses in place" means nothing changes in the game. There is no turn skip, auto-action, timeout, seat release, or kick. The turn simply stays with the absent player until they return. This confirms the Phase 1 scheduler rule that in-progress seats are never auto-released, and the 12h in-progress idle GC stays the only backstop. Other players' controls stay correctly disabled because it is not their turn, which already falls out of the view.

**D-09:** A disconnected player who is not the active player blocks nothing. Turns may pass to them. If it becomes their turn while they are away, D-07's waiting state applies.

**D-10:** Keep Phase 1's newest-tab-wins rebinding. It is already corruption-safe (CR-01 detach-before-close, a single binding per seat). Harden and prove it rather than redesigning it.

**D-11:** The superseded tab gets an explicit "Use this tab" button. It resets the stop-reconnecting latch and reconnects with the same seat token, which in turn supersedes the other tab. This is the fix for a player who opens the link on their phone and then wants the laptop back. It is a user action, so the two tabs can never ping-pong automatically. The reconnect paths from D-01/D-02 must not fire in a superseded tab: visibility and heartbeat reconnects respect the latch.

**D-12:** A second tab opened while the first is mid-reconnect or half-open must still end with exactly one bound socket, one seat, and an unchanged seat count for other players. Stale `onClose` events from the losing socket must never flip the winner's seat to disconnected. The existing CR-01 guard covers this and must be tested under the new heartbeat and zombie-close paths too.

**D-13:** Reconnect stays on the same `join` → `#viewFor` → `toSeatView` path with no resume-specific handler, frame type, or serializer. This is proven structurally by extending `apps/worker/src/source-structure.test.ts`: no new outbound frame types for resume, the existing single-call-site counts unchanged, and the heartbeat auto-response not routed through `#send`. It is also proven behaviourally: a reconnect's `joined` frame is schema-identical to a fresh join's.

**D-14:** Playwright against the real worker proves the browser-visible behaviour. Drop and restore the network with `context.setOffline`. Simulate a backgrounded tab by emulating hidden visibility and suspending the page (CDP `Page.setWebLifecycleState` frozen → active, or an equivalent). Then show the player returns to the same seat mid-game with the same turn, the other player saw "disconnected" and then "connected", and a second tab supersedes, while "Use this tab" reclaims without duplicating the seat. Extend `e2e/hanabi-realtime.spec.ts` and `e2e/seat-takeover.spec.ts` rather than adding a parallel harness.

**D-15:** Socket-level tests in the existing `wrangler dev` + raw `ws` harness (`apps/worker/src/room-do.test.ts`) prove the server half. A socket that stops answering is marked disconnected by the staleness sweep. The heartbeat is answered without a `state` frame. Reconnect after a forced worker eviction mid-game (Phase 4's eviction pattern) returns the same seat and view. Timing constants are injectable or shortened for tests, so no test sleeps for real minutes.

**D-16:** The literal "10+ minutes backgrounded on a real phone" criterion is covered by a documented manual check at `docs/manual-checks/mobile-background.md`, following Phase 1's `cold-start.md` precedent (D-04 there). Real OS tab suspension cannot be faithfully faked in CI. The phase gate is `npm test`, `npx playwright test` and per-package `tsc --noEmit`, all green, plus owner sign-off on the manual check. The sign-off is recorded as the owner's verbatim reply, never fabricated.

### Claude's Discretion

- Heartbeat interval, pong timeout, and server staleness threshold (within D-04's intent), and where the constants live (`packages/schema` constants are the likely home).
- Exact ping/pong literal strings, and whether the client heartbeat pauses while hidden. Browsers throttle timers in hidden tabs anyway, so the resume check in D-01 is what matters.
- Store shape for the reconnecting state and banner placement and wording.
- How the "Use this tab" action resets partysocket, whether through `reconnect()` or a remount.
- The mechanism used to simulate backgrounding in Playwright.

### Deferred Ideas (OUT OF SCOPE)

- Voting to skip or remove a player who never returns mid-game: a new capability, not hardening. Revisit only if the group hits it.
- Styled connection indicators on the board: Phase 6 (Game Interface).
- Push or OS notifications that it is your turn while backgrounded: a new capability, out of v1 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RT-04 | A player who loses connection or whose mobile tab is suspended rejoins their same seat and resumes the game in progress | `setWebSocketAutoResponse`/`getWebSocketAutoResponseTimestamp` (Pattern 1, Pitfall 1/2), client `visibilitychange`/`online` fast-resume via `partysocket.reconnect()` (Pattern 3), zombie sweep in `computeRoomTimers` (Pattern 2, Pitfall 3), Playwright + manual-check proof strategy (Validation Architecture, Pitfall 4) |
| RT-05 | Reconnecting a player uses the same state-delivery path as initial join, not a separate resume path | Confirmed existing `#handleJoin` → `#viewFor` → `toSeatView` single path (Summary point 4, Architecture Diagram); `source-structure.test.ts` structural proof pattern (Validation Architecture) |
| RT-06 | Remaining players see a clear disconnected indicator for an absent player, and the game pauses in place rather than freezing or erroring | Existing `connected` flag flow through `toSeatView` confirmed (Architectural Responsibility Map); zombie sweep ensures the flag is truthful even for half-open sockets (Pattern 2); board rendering is additive only, no `RoomState`/scheduler changes (Anti-Patterns) |
| RT-08 | A player opening the room in a second tab does not corrupt or duplicate their seat | Existing D-08 (Phase 1) newest-tab-wins rebind + CR-01 detach-before-close confirmed unchanged (`seat-identity.ts`, `room-do.ts` read in full); "Use this tab" reclaim mechanics (Recommended Code Structure); CR-01 must be re-proven under new heartbeat/zombie-close paths (D-12, Validation Architecture RT-08 row) |
</phase_requirements>

## Summary

Phase 5 hardens machinery that already exists and already works for the simple case (manual refresh, RT-03, done in Phase 4). Nothing new is being invented architecturally — the CONTEXT.md decisions (D-01 through D-16) are already fully specified and code-verified as of 2026-09-16. This research's job is to close the four explicit open technical questions the phase description flagged, using the actual installed versions rather than assumed ones, and to surface one blocking gap CONTEXT.md did not flag: **`setWebSocketAutoResponse` and `getWebSocketAutoResponseTimestamp` are declared only in `@cloudflare/workers-types/experimental`, not in the base `@cloudflare/workers-types` package this repo's `apps/worker/tsconfig.json` currently points `types` at.** Without adding the experimental subpath to `apps/worker/tsconfig.json`, D-02/D-03's auto-response code will not type-check.

All four of the phase description's open questions were answered directly from installed source:
1. `partyserver` 0.5.10's `Server` class exposes `protected ctx: DurableObjectState`, and `DurableObjectState` (declared in the `experimental` types subpath) carries `setWebSocketAutoResponse`, `getWebSocketAutoResponse`, and `getWebSocketAutoResponseTimestamp`. `apps/worker/src/room-do.ts` (which extends `Server`) can call `this.ctx.setWebSocketAutoResponse(...)` today, once the tsconfig gap above is fixed. `wrangler dev`'s bundled `miniflare`/`workerd` (v4.128.0, current-latest is 4.133.0, no breaking relevance) contains auto-response wiring, so local dev and the existing `room-do.test.ts` `wrangler dev` harness can exercise it.
2. `partysocket` 1.3.0's `ReconnectingWebSocket` (the class `PartySocket` extends) exposes `reconnect(code?, reason?)`, `readyState`, and the standard `OPEN`/`CLOSED`/`CONNECTING`/`CLOSING` statics — confirmed directly from its `.d.ts`. It has **no built-in heartbeat and no `visibilitychange`/`online` listener** — CONTEXT.md's D-01/D-02 claim is correct and D-01's "force `socket.reconnect()`" plan is directly supported by this API.
3. Playwright 1.62.1 (installed) supports `context.setOffline(true)` (drops all network including WebSocket traffic — WebSearch-verified, MEDIUM confidence, no first-party doc fetched this session but consistent across sources) and CDP `Page.setWebLifecycleState` via `page.context().newCDPSession(page)` (MEDIUM confidence, same caveat). Both are Chromium-only, matching this repo's single `chromium` Playwright project.
4. `computeRoomTimers` (`apps/worker/src/scheduler.ts`) already derives its whole table from `RoomState` and is the single alarm-arming call site (`#syncAlarm` in `room-do.ts`). A zombie-sweep timer fits this pattern as a new `TimerType` member, scheduled only while any *connected* seat exists (mirroring D-07/D-12's "only when a seat is disconnected" pattern in reverse) — this is a pure addition to `computeRoomTimers`, no second alarm.

**Primary recommendation:** Implement D-01–D-16 exactly as specified in CONTEXT.md. The only research-driven addition to the plan is: fix `apps/worker/tsconfig.json`'s `types` array to include `@cloudflare/workers-types/experimental` (see Pitfall 1) before any auto-response code is written, or the very first `tsc -b` will fail.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dead-socket detection (half-open) | API/Backend (Durable Object) | Browser/Client (heartbeat sender) | The auto-response pair and staleness timestamp are DO-native; only the DO can decide a socket is stale without waking itself. The client only emits the ping. |
| Fast resume on tab foreground/online | Browser/Client | — | `visibilitychange`/`online` are DOM-only signals; no server involvement needed to decide to attempt reconnect. |
| Reconnect state delivery | API/Backend (Durable Object) | — | Must reuse the existing `#handleJoin` → `#viewFor` path (D-13); no new tier, no new frame type. |
| Absent-player indicator | Browser/Client (render) | API/Backend (source of truth: `connected` flag already in `RoomView`) | The `connected` flag already flows through `toSeatView`; this phase only adds board-level rendering, not new server logic. |
| Seat-release timer scheduling | API/Backend (Durable Object, `computeRoomTimers`) | — | Single-alarm-slot constraint (Phase 1 Pitfall 1) means all timer logic must stay centralized in `scheduler.ts`. |
| Second-tab reclaim ("Use this tab") | Browser/Client | API/Backend (existing `#handleJoin` rebind path, unchanged) | The reclaim is a client-side latch reset + `reconnect()` call; the server-side rebind logic (D-08 from Phase 1) needs no changes, only proof. |

## Standard Stack

### Core (already installed, verified against registry — no version changes needed)

| Library | Installed Version | Latest (npm view) | Purpose | Confidence |
|---------|---------|---------|---------|--------------|
| `partyserver` | 0.5.10 | 0.5.10 | DO WebSocket lifecycle, `Connection`/`Server` API | `[VERIFIED: npm registry, direct .d.ts inspection]` |
| `partysocket` | 1.3.0 | 1.3.0 | Client reconnect-with-backoff wrapper | `[VERIFIED: npm registry, direct .d.ts inspection]` |
| `wrangler` | 4.128.0 | 4.133.0 | Local DO runtime (`wrangler dev`), deploy | `[VERIFIED: npm registry]` — minor version drift, non-blocking, no phase action needed |
| `@cloudflare/workers-types` | (workspace-pinned, check `package.json`) | — | TS ambient types for `DurableObjectState` incl. experimental auto-response API | `[VERIFIED: direct .d.ts inspection — experimental subpath confirmed to carry the API, base subpath confirmed NOT to]` |
| `@playwright/test` | 1.62.1 | — | E2E harness (`setOffline`, CDP sessions) | `[VERIFIED: package.json]` |

**No new packages are required for this phase.** Every capability (heartbeat, auto-response, zombie sweep, reclaim button, board status) is built from APIs already present in the installed dependency tree. **Package Legitimacy Audit is not applicable** — skip.

### Supporting

| Item | Where it lives | Purpose |
|------|-----------------|---------|
| Heartbeat/timeout/staleness constants | `packages/schema/src/constants.ts` (existing file, same pattern as `HOST_TRANSFER_GRACE_MS` etc.) | Single source of truth per Phase 1's established pattern — do not duplicate constants client- and server-side |
| Ping/pong literal frame | New, outside `ClientMessageSchema`/`ServerMessageSchema` (D-02) | Auto-response requires exact byte-for-byte request/response pairing (see Pitfall 2) |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| DO `setWebSocketAutoResponse` for pong | Route heartbeat through the existing `onMessage`/`#send` path | Rejected by D-02 itself: wakes the DO and costs billed duration on every heartbeat, defeating the whole point of hibernation-safe pinging. Confirmed correct: `onMessage`/`#send` require a full `webSocketMessage` invocation, auto-response bypasses it entirely per Cloudflare's hibernation model. |
| Client `visibilitychange`/`online` force-reconnect | Rely solely on partysocket's exponential backoff | Rejected by D-01: up to 30s (this repo's configured `maxReconnectionDelay`) is too slow for "reconnect right away when the tab becomes visible." |
| CDP `Page.setWebLifecycleState` for Playwright | `context.setOffline` alone | Neither alone covers both failure modes: `setOffline` simulates a dead network (socket drops), CDP freeze simulates OS-level tab suspension (timers/JS paused, socket may or may not survive depending on Chrome's policy — see Pitfall 4). CONTEXT.md D-14 already specifies using both. |

## Architecture Patterns

### System Architecture Diagram (reconnect/heartbeat data flow)

```
Browser tab (visible, connected)
  │
  ├─ heartbeat timer (interval, while visible) ──ping frame (outside ServerMessageSchema)──▶ DO WebSocket
  │                                                                                              │
  │                                                                          ctx.setWebSocketAutoResponse
  │                                                                          answers WITHOUT waking DO JS,
  │                                                                          records auto-response timestamp
  │◀────────────────────────── pong frame (auto, no #send, no onMessage) ─────────────────────┘
  │
  [tab backgrounded 10+ min: heartbeat timer throttled/frozen by browser]
  [socket may go half-open: OS/network silently drops it, no close event fires]
  │
  ═══ DO alarm fires (onAlarm, existing single-slot scheduler) ═══
        │
        ├─ zombie sweep: for each connected seat's socket,
        │     getWebSocketAutoResponseTimestamp(ws) older than STALE_MS?
        │        yes → connection.close(...) → existing onClose path (CR-01-safe)
        │                → markConnected(seat, false) → #pushState (other players see "disconnected")
        │
        └─ computeRoomTimers re-derives whole table incl. next zombie-sweep due time
             (scheduled only while >=1 seat is connected; empty/all-disconnected room
              re-enters existing idle_gc path, no wasted alarm wake)

  [tab foregrounded again: visibilitychange → "visible"]
  │
  ├─ client checks: socket.readyState !== OPEN OR no recent pong ⟶ socket.reconnect()
  │
  ▼
partysocket reconnect() ──▶ new WebSocket open ──▶ onOpen handler replays
  {type:"join", seatToken} (UNCHANGED existing path, D-05 from Phase 1)
  │
  ▼
DO#handleJoin → same #viewFor/#send path as first join (D-13, RT-05) → "joined" frame,
  same schema as any fresh join → room-store sets status "seated", view refreshed
```

### Recommended Code Structure (files touched, not new modules — this phase edits, does not scaffold)

```
apps/web/lib/
├── room-socket.ts        # + heartbeat send/receive, visibilitychange/online listeners,
│                          #   "Use this tab" latch-reset entry point
├── room-store.ts          # + reconnecting-status derivation (no `view` mutation on drop)
apps/web/components/
├── HanabiBoard.tsx         # + per-seat connection dot, "waiting for X — disconnected" turn text
apps/web/app/room/[code]/
├── RoomClient.tsx           # + "Reconnecting…" banner, "Use this tab" button on superseded screen
apps/worker/src/
├── room-do.ts               # + auto-response registration (onConnect), zombie sweep call (onAlarm)
├── scheduler.ts              # + new TimerType member, derivation rule for zombie sweep
apps/worker/tsconfig.json      # + "@cloudflare/workers-types/experimental" in `types`
packages/schema/src/constants.ts # + heartbeat interval / pong timeout / staleness threshold consts
```

### Pattern 1: Hibernation-safe heartbeat via `setWebSocketAutoResponse`

**What:** Register a fixed request/response byte-pair per connection so the Cloudflare runtime answers pings without invoking `webSocketMessage`/`onMessage` — the DO stays hibernated (or wakes only for the alarm, not per-heartbeat).
**When to use:** Any client-driven "is the socket still alive" probe on a hibernatable DO, per D-02.
**Example (API shape, from installed `.d.ts`, not yet present in this repo's source):**
```typescript
// Source: node_modules/@cloudflare/workers-types/experimental/index.d.ts (installed, confirmed 2026-09-16)
// interface DurableObjectState {
//   setWebSocketAutoResponse(maybeReqResp?: WebSocketRequestResponsePair): void;
//   getWebSocketAutoResponse(): WebSocketRequestResponsePair | null;
//   getWebSocketAutoResponseTimestamp(ws: WebSocket): Date | null;
// }
// class WebSocketRequestResponsePair { constructor(request: string, response: string); }

// In onStart (partyserver's Server subclass exposes `this.ctx`):
this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_LITERAL, PONG_LITERAL));
```
Note: `setWebSocketAutoResponse` is registered **once per DO instance**, not per-connection — it applies the SAME request/response pair to every hibernatable WebSocket the DO holds. This matches this codebase's single-room-many-seats model cleanly (one ping/pong pair suffices for the whole room), but means it must be (re-)armed in `onStart` (which already reruns on every wake per this file's own documented pattern), not per-`onConnect`.

### Pattern 2: Zombie sweep inside the existing single alarm

**What:** Extend `computeRoomTimers` with a new `TimerType` (e.g. `"zombie_sweep"`) whose `dueAt` is derived from the room's connected seats, and handle it in `onAlarm`'s existing `for (const event of due)` loop — never a second `setAlarm` call site.
**When to use:** Exactly this phase's D-03 requirement.
**Example:**
```typescript
// scheduler.ts — additive to computeRoomTimers, same derive-whole-table shape as
// existing host_transfer/seat_release blocks:
if (state.seats.some((s) => s.connected)) {
  timers = upsertTimer(timers, {
    type: "zombie_sweep",
    dueAt: now + ZOMBIE_SWEEP_INTERVAL_MS, // re-derived every call, self-renewing while any seat is connected
  });
}
```
Caution (see Pitfall 3): because `computeRoomTimers` is pure and takes `now` as an argument but the existing lobby/host timers derive `dueAt` from a **persisted** timestamp (`disconnectedAt`), a zombie-sweep timer derived from `now + INTERVAL` on every call risks perpetually pushing itself forward if `computeRoomTimers` is invoked on every non-alarm event (it is — see `#commit`). The interval must be checked against the actual auto-response timestamp at sweep time inside `onAlarm`, not trusted as "if this alarm fired, the peer is definitely stale" — the fixed re-arm-on-every-`#commit` pattern only guarantees "check again in N seconds," the staleness decision itself happens against `getWebSocketAutoResponseTimestamp` at sweep time.

### Pattern 3: Client fast-resume on visibility/online

**What:** `visibilitychange` → `"visible"` and `window.addEventListener("online", ...)` force `socket.reconnect()` if not already `OPEN`.
**Example:**
```typescript
// Source: node_modules/partysocket/ws-DfTZCobx.d.ts (installed, confirmed 2026-09-16)
// reconnect(code?: number, reason?: string): void;
// get readyState(): number;   static get OPEN(): number;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (stopReconnectingRef.current) return; // D-11: never fire in a superseded tab
  if (socket.readyState !== socket.OPEN /* or stale-pong check */) socket.reconnect();
});
```

### Anti-Patterns to Avoid

- **Routing heartbeat pong through `#send`/`onMessage`:** defeats hibernation entirely (wakes the DO on every ping) and inflates the `.send(`/`#send(` structural counts `source-structure.test.ts` (D-13) enforces. Must go through `setWebSocketAutoResponse` only.
- **A second `ctx.storage.setAlarm` call site for the zombie sweep:** violates the single-alarm-slot invariant this codebase already documents as Pitfall 1 from Phase 1's own RESEARCH.md. Must be folded into `computeRoomTimers`/`#syncAlarm`.
- **Queueing/replaying the in-flight action on reconnect:** explicitly rejected by D-06. The fresh view after reconnect is truth; do not build any client-side action queue.
- **Auto-releasing or skipping a disconnected active player's turn:** explicitly rejected by D-08/D-09. "Pauses in place" must produce literally zero `RoomState`/scheduler changes beyond the `connected` flag.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reconnect backoff | Custom setTimeout/backoff loop | `partysocket`'s built-in `minReconnectionDelay`/`maxReconnectionDelay`/`reconnectionDelayGrowFactor` (already configured) | Already in use; CONTEXT.md D-01 explicitly keeps this in place and only adds a force-reconnect trigger on top |
| Dead-peer detection primitive | A custom WebSocket ping/pong protocol routed through normal message handling | `ctx.setWebSocketAutoResponse` / `getWebSocketAutoResponseTimestamp` | Purpose-built by Cloudflare specifically so hibernation-safe heartbeats don't cost DO wake time; a hand-rolled version would either wake the DO per ping or require its own timestamp bookkeeping duplicate of what the runtime already tracks |
| Timer/alarm scheduling | A second independent timer/interval inside the Worker | `computeRoomTimers` + the existing single `#syncAlarm` chokepoint | A DO has exactly one alarm slot; any second scheduling mechanism either silently clobbers the first or requires reimplementing coalescing logic `computeRoomTimers` already provides |

**Key insight:** every "don't hand-roll" item here is a *re*-use of infrastructure this codebase already built in Phases 1 and 4 specifically anticipating this phase (see `scheduler.ts`'s own header comment: "Plan 07 is the ONLY place that wires this to the real Durable Object alarm API" — Phase 5 extends that plan's timer table, it does not add a second wiring point).

## Common Pitfalls

### Pitfall 1: `setWebSocketAutoResponse` is not in the base `@cloudflare/workers-types` types
**What goes wrong:** `tsc -b` fails with "Property 'setWebSocketAutoResponse' does not exist on type 'DurableObjectState'" the moment auto-response code is written.
**Why it happens:** `apps/worker/tsconfig.json` currently sets `"types": ["@cloudflare/workers-types", "node"]`. Direct inspection confirms `setWebSocketAutoResponse`/`getWebSocketAutoResponse`/`getWebSocketAutoResponseTimestamp`/`WebSocketRequestResponsePair` are declared ONLY in `@cloudflare/workers-types/experimental/index.d.ts`, not in the package's default `index.d.ts` that ships as `@cloudflare/workers-types`.
**How to avoid:** Change `apps/worker/tsconfig.json`'s `types` array to `["@cloudflare/workers-types/experimental", "node"]` (the experimental subpath is a superset that still includes everything the stable subpath does — confirmed both files declare the shared base interfaces like `DurableObjectStorage`). Do this as the FIRST task in this phase's plan, before any auto-response code, so the type surface is available from task 1.
**Warning signs:** Any plan task that writes `this.ctx.setWebSocketAutoResponse` before touching `tsconfig.json` will fail its own `tsc -b` verification step.

### Pitfall 2: Auto-response request/response must match byte-for-byte, and only ONE pair is active DO-wide
**What goes wrong:** If the client sends a ping frame that doesn't exactly match the registered request string (e.g. trailing whitespace from `JSON.stringify` vs. a raw literal), the runtime does not auto-respond, and the ping silently falls through to `webSocketMessage`/`onMessage` — which then must handle (or safely ignore) an unrecognized message rather than crash, since `onMessage`'s existing `parseClientMessage` will reject anything outside `ClientMessageSchema` as `bad_request`.
**Why it happens:** `setWebSocketAutoResponse` compares the incoming frame to the registered request literal exactly; it is not a routing table keyed by message type, and only one pair can be registered per DO instance at a time (registering a new pair replaces the old one, it does not add to a set).
**How to avoid:** Use a **plain, minimal literal string** (not JSON) for both ping and request, e.g. `"__ping__"` / `"__pong__"`, sent as raw string frames (not `JSON.stringify`'d), so there is exactly one fixed byte sequence to match. Ensure `onMessage`'s `parseClientMessage` path degrades gracefully (it already does — non-JSON input is handled, per the existing "robustness: non-JSON input yields an error message" test) if a ping ever reaches it unanswered (e.g., during a hibernation wake race before auto-response is re-armed in `onStart`).
**Warning signs:** A ping that occasionally shows up as a `bad_request` error frame in server logs/tests instead of being silently auto-answered.

### Pitfall 3: Zombie-sweep timer must not self-extend forever via `computeRoomTimers`'s "recompute on every mutation" pattern
**What goes wrong:** If the zombie-sweep `dueAt` is computed as `now + INTERVAL` and `computeRoomTimers` is called (as it already is, via `#commit`) on every ordinary game action, a chatty room (frequent clues/plays) keeps pushing the zombie-sweep deadline forward and it may never actually fire, defeating D-03.
**Why it happens:** This is the exact inverse of Phase 1's own documented Pitfall 2 ("perpetually deferring the deadline so it never fires") — but that pitfall was about re-arming the SAME alarm repeatedly; this is about a timer whose *derivation rule itself* is relative to `now` rather than to a fixed, persisted anchor point (unlike `host_transfer`/`seat_release`, which anchor to `disconnectedAt`, a value that does not change on every `#commit`).
**How to avoid:** Anchor the zombie-sweep `dueAt` to something that does NOT change on every ordinary message — e.g., derive it from the room's `lastActivityAt` plus interval only if no sweep is currently pending, or (simpler, and consistent with this file's existing idempotent-recompute philosophy) accept that the sweep interval is a periodic "wake up roughly every N seconds while anyone is connected" signal and make the ZOMBIE CHECK ITSELF (via `getWebSocketAutoResponseTimestamp`, evaluated fresh at sweep time) the actual staleness decision — not the alarm's mere firing. This makes the timer's exact re-derivation behavior harmless: even if it fires "late" because chatty traffic kept nudging it, the staleness check at fire time is still correct because it reads the live auto-response timestamp, not a snapshot.
**Warning signs:** A socket-level test where a steady stream of legal actions from OTHER seats prevents a genuinely dead seat from ever being marked disconnected.

### Pitfall 4: CDP `Page.setWebLifecycleState: "frozen"` does not guarantee the WebSocket closes
**What goes wrong:** A Playwright test that freezes the page and then asserts the OTHER player sees "disconnected" may flake if Chromium's freeze policy keeps the WebSocket alive (freezing pauses JS timers/rAF, it does not necessarily terminate active network connections — Chrome's page-freezing feature is explicitly documented as deferring/excepting pages with active WebSocket connections under its *normal* heuristic freeze policy, though a CDP-forced freeze bypasses those heuristics and may behave differently — this is the one area WebSearch could not fully disambiguate this session).
**Why it happens:** "Frozen" (page lifecycle) and "socket closed" (network layer) are two different browser subsystems; CDP's forced freeze is a test tool, not a guarantee about socket teardown.
**How to avoid:** Design the Playwright scenario (per D-14) to not depend on which of the two actually happens — assert the OBSERVABLE OUTCOME (the OTHER player's board eventually shows "disconnected" within the test's injected/shortened staleness window per D-15's "timing constants are injectable or shortened for tests") rather than asserting a specific mechanism fired. If the socket does stay technically open but idle (heartbeat stops because JS timers are frozen), the SERVER-side zombie sweep (D-03) is what actually catches it — this is precisely why D-03 exists as a second, server-independent detection layer rather than relying on `onClose` alone. Combine with `context.setOffline` for the scenario that specifically needs a hard socket drop (D-14 already specifies using both).
**Warning signs:** A Playwright test that passes locally but flakes in CI with a longer real staleness window, or passes only because the socket happened to drop for an unrelated reason (e.g., dev server restart) rather than the mechanism under test.

## Code Examples

### Playwright: simulate offline + restore
```typescript
// Source: Playwright official docs pattern (BrowserContext.setOffline),
// installed @playwright/test 1.62.1 — WebSearch-verified 2026-09-16, MEDIUM confidence
await context.setOffline(true);
// ... assert reconnecting UI, other player's disconnected indicator ...
await context.setOffline(false);
// ... assert socket.reconnect() path fires, same-seat resume ...
```

### Playwright: simulate backgrounded/frozen tab via CDP
```typescript
// Source: Chrome DevTools Protocol Page domain, via Playwright's newCDPSession —
// WebSearch-verified 2026-09-16, MEDIUM confidence (no official Playwright doc page
// fetched directly this session; pattern is consistent across multiple sources)
const client = await page.context().newCDPSession(page);
await client.send("Page.setWebLifecycleState", { state: "frozen" });
// ... wait, then ...
await client.send("Page.setWebLifecycleState", { state: "active" });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — this is the first phase to add heartbeat/dead-peer detection to this codebase | `ctx.setWebSocketAutoResponse` (present in this installed `partyserver`/`workers-types` version) | Cloudflare shipped auto-response as part of the WebSocket Hibernation API well before this project started (stable, not a recent addition) | No migration risk; this is greenfield use of an existing, stable primitive within this codebase |

**Deprecated/outdated:** Nothing in this phase's dependency surface is deprecated. `partyserver` 0.5.x and `partysocket` 1.3.0 are both current-latest per direct `npm view`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `context.setOffline(true)` in Chromium actually terminates in-flight WebSocket connections (not just blocks new HTTP) | Pitfall/Code Examples | If wrong, the D-14 offline-simulation scenario would need `page.routeWebSocket()`-based mocking instead of `setOffline`; low risk since even if the socket lingers, the eventual heartbeat timeout / zombie sweep still catches it (defense in depth already designed for this) |
| A2 | CDP `Page.setWebLifecycleState: "frozen"` freezes JS timers in a way that stops the client heartbeat from firing (simulating the real "backgrounded mobile tab" scenario) without the test needing a real 10+ minute wait | Pitfall 4 | If wrong, the automated Playwright coverage for RT-04's core scenario would be weaker than believed; D-16's documented manual phone check is the explicit backstop for exactly this uncertainty, so risk is contained by design, not eliminated by this research |
| A3 | `wrangler dev`'s bundled `miniflare`/`workerd` (current pinned 4.128.0) implements `setWebSocketAutoResponse` faithfully enough for `room-do.test.ts`'s raw-`ws` harness to exercise it (not just the production `workerd` binary) | Summary, Standard Stack | If wrong, D-15's socket-level auto-response tests would need to run only against a deployed Worker, weakening local/CI coverage; this was inferred from grep hits for "AutoResponse" strings inside `node_modules/miniflare/dist`, not from running a live test — the plan should include an early spike task verifying this before committing to it as a load-bearing test strategy |

## Open Questions

1. **Does `wrangler dev`'s local `workerd` fully honor `setWebSocketAutoResponse` (not just declare the type)?**
   - What we know: `miniflare`'s bundled JS references "AutoResponse" strings (grep-confirmed), and the type declarations are present at the exact installed version.
   - What's unclear: Whether a raw `ws` client hitting `wrangler dev` actually receives an auto-answered pong without the DO's `onMessage`/`webSocketMessage` ever firing — this requires an actual running test, not static inspection.
   - Recommendation: The plan's first heartbeat-related task should include a small spike/smoke test against `wrangler dev` (extending the existing `room-do.test.ts` harness) that sends the ping literal and asserts a pong arrives AND that a DO-side counter/log proves `onMessage` was never invoked for it — do this before building the rest of D-02/D-03 on top of the assumption.

2. **Exact numeric values for heartbeat interval / pong timeout / staleness threshold**
   - What we know: D-04 delegates this to Claude's discretion within the stated intent ("resume within a few seconds," "teammates see disconnected within about a minute, not instantly on a blip").
   - What's unclear: No further constraint from research is needed here — this is genuinely a tuning choice, not a factual gap.
   - Recommendation: The planner should pick concrete numbers (e.g., ping every 15s while visible, pong timeout 10s, server staleness threshold ~45-60s) and record them as a locked decision in the plan, not leave them as an implicit magic number scattered across files — per this codebase's established pattern of naming every tuning constant in `packages/schema/src/constants.ts`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `wrangler` (local dev) | D-15 socket-harness tests, auto-response spike | ✓ | 4.128.0 | — |
| Chromium (Playwright) | D-14 e2e tests | ✓ | bundled with `@playwright/test` 1.62.1 | — |
| Real mobile device | D-16 manual check | Not verifiable from this environment | — | Documented manual check at `docs/manual-checks/mobile-background.md`, owner sign-off required (already the established pattern from `cold-start.md`) |

**Missing dependencies with no fallback:** None — the one genuinely unautomatable dependency (a real phone, real OS suspension) already has a documented fallback per D-16.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (root + per-package projects), Playwright 1.62.1 (E2E) |
| Config file | root `vitest.config.ts` / `playwright.config.ts` (existing, no changes needed) |
| Quick run command | `npx vitest run --project worker room-do` (existing pattern, per `apps/worker/package.json`'s `test:integration`) |
| Full suite command | `npm test` (root) + `npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RT-04 | Dropped/backgrounded 10+ min player reconnects to same seat, resumes | integration (socket) + e2e | `npx vitest run --project worker room-do` / `npx playwright test hanabi-realtime` | ✅ extend `apps/worker/src/room-do.test.ts`, `e2e/hanabi-realtime.spec.ts` |
| RT-04 (literal 10+ min real phone) | manual-only, justified (real OS suspension not fakeable in CI) | manual | — | ❌ Wave 0: create `docs/manual-checks/mobile-background.md` |
| RT-05 | Reconnect uses same state-delivery path as fresh join | structural (source-structure) + behavioral (socket) | `npx vitest run --project worker source-structure` | ✅ extend `apps/worker/src/source-structure.test.ts` |
| RT-06 | Remaining players see disconnected indicator, game pauses in place | e2e + integration | `npx playwright test hanabi-realtime`, `npx vitest run --project worker room-do` | ✅ extend both |
| RT-08 | Second tab does not corrupt/duplicate seat | e2e + integration | `npx playwright test seat-takeover`, `npx vitest run --project worker room-do` (CR-01 under heartbeat/zombie paths) | ✅ extend `e2e/seat-takeover.spec.ts`, `apps/worker/src/room-do.test.ts` |

### Sampling Rate
- **Per task commit:** `npx vitest run --project worker <relevant-file>` + `tsc -b` for touched packages
- **Per wave merge:** `npm test` (full vitest) + `npm run test:e2e`
- **Phase gate:** Full suite green, plus `docs/manual-checks/mobile-background.md` owner sign-off (D-16) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `docs/manual-checks/mobile-background.md` — new file, following `docs/manual-checks/cold-start.md`'s template, covers the literal 10+ minute real-phone scenario for RT-04
- [ ] `apps/worker/tsconfig.json` types fix (Pitfall 1) — not a test file, but blocks every subsequent `tsc -b` in this phase; treat as a Wave 0 prerequisite task
- [ ] Spike/smoke test confirming `wrangler dev`'s local `workerd` honors `setWebSocketAutoResponse` without invoking `onMessage` (Open Question 1) — should land before the rest of D-02/D-03 are built on top of the assumption

*(No gaps in existing framework/config — Vitest and Playwright are both already fully wired for this repo's pattern; only new test FILES/CASES and the tsconfig fix are needed.)*

## Sources

### Primary (HIGH confidence — direct inspection of installed code in this repo)
- `node_modules/@cloudflare/workers-types/experimental/index.d.ts` — confirmed `setWebSocketAutoResponse`/`getWebSocketAutoResponse`/`getWebSocketAutoResponseTimestamp`/`WebSocketRequestResponsePair` declarations, confirmed absent from the base `index.d.ts`
- `node_modules/partyserver/dist/index.d.ts` — confirmed `Server` class shape, `protected ctx: DurableObjectState<Props>`, `getConnections`/`onConnect`/`onClose`/`onMessage`/`onAlarm` signatures
- `node_modules/partysocket/ws-DfTZCobx.d.ts` — confirmed `ReconnectingWebSocket`'s `reconnect()`, `readyState`, `OPEN`/`CLOSED` statics; confirmed absence of any heartbeat/visibilitychange API
- `apps/worker/src/room-do.ts`, `scheduler.ts`, `seat-identity.ts`, `source-structure.test.ts`, `room-do.test.ts` — read in full, confirmed existing patterns (single alarm slot, single `#send`, CR-01 detach-before-close, `computeRoomTimers` derive-whole-table)
- `apps/web/lib/room-socket.ts`, `room-store.ts`, `apps/web/app/room/[code]/RoomClient.tsx`, `apps/web/components/HanabiBoard.tsx` — read in full, confirmed exact current state matches CONTEXT.md's domain summary
- `packages/schema/src/constants.ts` — confirmed existing tuning-constant pattern to extend
- `npm view partyserver version` / `npm view partysocket version` / `npm view wrangler version` — confirmed installed versions are current-latest (or near-latest, non-blocking for wrangler)

### Secondary (MEDIUM confidence — WebSearch, not independently fetched from an official doc page this session)
- Playwright `context.setOffline` WebSocket-closing behavior in Chromium
- CDP `Page.setWebLifecycleState` via `page.context().newCDPSession(page)` pattern

### Tertiary (LOW confidence — flagged for validation)
- Whether CDP-forced page freeze actually terminates the WebSocket vs. merely pausing JS timers (Pitfall 4, Assumption A2) — genuinely unresolved by available sources this session; the phase's own design (server-side zombie sweep as a second, independent detection layer, D-16's manual-check backstop) already absorbs this uncertainty rather than depending on a single mechanism

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version and API surface confirmed by direct `.d.ts`/`package.json` inspection of what's actually installed, not training-data recall
- Architecture: HIGH — this phase edits an already-built, already-documented system; the patterns are extensions of code that exists and is read in full above
- Pitfalls: MEDIUM-HIGH — Pitfalls 1-3 are HIGH confidence (derived from direct code/type inspection); Pitfall 4 is explicitly flagged LOW/unresolved and the phase's own defense-in-depth design (D-03 zombie sweep + D-16 manual check) already compensates for it

**Research date:** 2026-09-16
**Valid until:** 30 days (stable dependencies, no fast-moving APIs; re-verify `wrangler`/`workerd` auto-response fidelity if `wrangler` is upgraded before this phase executes)

## Project Constraints (from CLAUDE.md)

- Cloudflare Durable Objects (via `partyserver`) remain the sole authoritative state/transport layer — this phase adds no new services, no new hosting surface, and stays entirely within the already-approved Workers Free plan.
- No new dependency may be added without a workable free tier — moot for this phase since zero new packages are introduced.
- Per-seat redaction (`toPlayerView`) is untouched by this phase; heartbeat/pong frames are explicitly designed (D-02) to sit outside `ServerMessageSchema` so they cannot become a second state-carrying channel that would need redaction review.
- Session durability ("a ~25-minute game must survive a refresh, a dropped connection, and a sleeping tab without ending") is the literal product requirement this phase exists to prove, per PROJECT.md.
