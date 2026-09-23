# Phase 5: Reconnect & Session Durability Hardening - Context

**Gathered:** 2026-09-16
**Status:** Ready for planning
**Mode:** `--auto` — every gray area below was resolved by picking the recommended option without prompting. Each choice is logged in `05-DISCUSSION-LOG.md` for review.

<domain>
## Phase Boundary

Harden the reconnect and seat-durability machinery from Phases 1 and 4 against the failure modes a quick manual refresh does not surface. The two that matter most are a **mobile tab backgrounded for 10+ minutes during a voice call** and **two tabs open to one seat**. This covers RT-04, RT-05, RT-06 and RT-08.

What exists today (verified by reading the code on 2026-09-16):
- One `join` handler serves both first join and reconnect. The client replays its seat token on every `open` (`apps/web/lib/room-socket.ts`).
- `partysocket` reconnects with backoff (1s → 30s cap). There is **no heartbeat** and no `visibilitychange` handling.
- The server marks seats connected or disconnected from `onConnect` and `onClose`. It has **no dead-socket detection** (`setWebSocketAutoResponse` is not used).
- In-progress seats are never auto-released, and host transfer is lobby-only (`apps/worker/src/scheduler.ts`).
- A second tab rebinds the seat, and the older tab is told `superseded` and closed. The superseded tab shows only the text "This room was opened in another tab." and has no way to take the seat back.
- `HanabiBoard.tsx` renders **no connection status at all**. Only the lobby's `SeatRow` does.

Not in this phase: board visual design (Phase 6), variants (Phase 7), skipping a turn or removing a player, spectators.

</domain>

<decisions>
## Implementation Decisions

### Detecting a dead connection (the backgrounded mobile tab)
- **D-01:** The client **reconnects right away when the tab becomes visible again or the network comes back** (`visibilitychange` → visible, `online`), rather than waiting out partysocket's backoff, which can reach 30s. On resume, if the socket is not `OPEN` or has not heard from the server recently, force `socket.reconnect()`. Retries and backoff otherwise stay inside partysocket (Phase 1's "don't hand-roll retry" rule still holds).
- **D-02:** A **lightweight application heartbeat** catches half-open sockets, which are common after mobile suspend: the socket looks `OPEN` but is dead. The client sends a ping on an interval while visible. If no pong or other frame arrives within a timeout, it force-reconnects. On the server, the ping must be answered via the Durable Object's **`setWebSocketAutoResponse`**, so heartbeats never wake a hibernated DO or cost billed duration. The ping/pong frames are fixed literal strings. They sit outside `ServerMessageSchema` and are not state-bearing, so they do not violate the Phase 2 D-08 single-`#send` chokepoint. `source-structure.test.ts` counts must stay unchanged, or be amended explicitly with justification.
- **D-03:** The server also **marks zombie sockets disconnected**, so other players' indicators tell the truth. A socket whose last auto-response timestamp (`getWebSocketAutoResponseTimestamp`) is older than a threshold is treated as gone. It is closed, and its seat is flipped to disconnected through the existing `onClose` path. This runs from the existing alarm-driven scheduler, using `computeRoomTimers`' derive-the-whole-table pattern and never a second alarm. The check is scheduled only while seats are connected, so an empty room still hibernates and costs nothing.
- **D-04:** Timing values (ping interval, pong timeout, server staleness threshold) are Claude's discretion, within this intent: a returning player is seated within a few seconds of the tab becoming visible, and teammates see a dead phone go "disconnected" within about a minute, not instantly on a blip.

### What the reconnecting player sees
- **D-05:** During a reconnect, the client **keeps rendering the last server view with a visible "Reconnecting…" banner and all action controls disabled**. It does not drop back to the full-screen "Connecting to room…" page. The store keeps `view` and adds a connection-state flag (for example, `status: "reconnecting"` once a view has been received). The server stays authoritative. The stale view is only displayed, never acted on.
- **D-06:** An action attempted just before the connection dropped is **not queued or auto-replayed** after reconnect. Controls are disabled while disconnected. After reconnect, the fresh view is the truth, and the player re-decides. The Phase 4 `actionId` dedup already makes a send that raced the drop safe if it did reach the server. Silent replay of a stale intent against a possibly changed table is worse than a re-click.

### Other players' view of an absent player (RT-06)
- **D-07:** The Hanabi board shows **per-seat connection status for every player**. It reuses the lobby's connected/disconnected tokens (`--color-status-connected` / `--color-status-disconnected`) at Phase 4's plain fidelity. When the **active** player is disconnected, the turn indicator says so explicitly (for example, "Waiting for Bianca — disconnected"), so the table reads as paused rather than frozen. Phase 6 restyles it. This phase makes it exist and be correct.
- **D-08:** "Pauses in place" means **nothing changes in the game**. There is no turn skip, auto-action, timeout, seat release, or kick. The turn simply stays with the absent player until they return. This confirms the Phase 1 scheduler rule that in-progress seats are never auto-released, and the 12h in-progress idle GC stays the only backstop. Other players' controls stay correctly disabled because it is not their turn, which already falls out of the view.
- **D-09:** A disconnected player who is **not** the active player blocks nothing. Turns may pass to them. If it becomes their turn while they are away, D-07's waiting state applies.

### Two tabs, one seat (RT-08)
- **D-10:** Keep Phase 1's **newest-tab-wins** rebinding. It is already corruption-safe (CR-01 detach-before-close, a single binding per seat). Harden and prove it rather than redesigning it.
- **D-11:** The superseded tab gets an **explicit "Use this tab" button**. It resets the stop-reconnecting latch and reconnects with the same seat token, which in turn supersedes the other tab. This is the fix for a player who opens the link on their phone and then wants the laptop back. It is a user action, so the two tabs can never ping-pong automatically. The reconnect paths from D-01/D-02 must **not** fire in a superseded tab: visibility and heartbeat reconnects respect the latch.
- **D-12:** A second tab opened while the first is mid-reconnect or half-open must still end with **exactly one bound socket, one seat, and an unchanged seat count** for other players. Stale `onClose` events from the losing socket must never flip the winner's seat to disconnected. The existing CR-01 guard covers this and must be tested under the new heartbeat and zombie-close paths too.

### RT-05: one delivery path
- **D-13:** Reconnect stays on the same `join` → `#viewFor` → `toSeatView` path with **no resume-specific handler, frame type, or serializer**. This is proven structurally by extending `apps/worker/src/source-structure.test.ts`: no new outbound frame types for resume, the existing single-call-site counts unchanged, and the heartbeat auto-response not routed through `#send`. It is also proven behaviourally: a reconnect's `joined` frame is schema-identical to a fresh join's.

### Proving it
- **D-14:** **Playwright against the real worker** proves the browser-visible behaviour. Drop and restore the network with `context.setOffline`. Simulate a backgrounded tab by emulating hidden visibility and suspending the page (CDP `Page.setWebLifecycleState` frozen → active, or an equivalent). Then show the player returns to the same seat mid-game with the same turn, the other player saw "disconnected" and then "connected", and a second tab supersedes, while "Use this tab" reclaims without duplicating the seat. Extend `e2e/hanabi-realtime.spec.ts` and `e2e/seat-takeover.spec.ts` rather than adding a parallel harness.
- **D-15:** **Socket-level tests** in the existing `wrangler dev` + raw `ws` harness (`apps/worker/src/room-do.test.ts`) prove the server half. A socket that stops answering is marked disconnected by the staleness sweep. The heartbeat is answered without a `state` frame. Reconnect after a forced worker eviction mid-game (Phase 4's eviction pattern) returns the same seat and view. Timing constants are injectable or shortened for tests, so no test sleeps for real minutes.
- **D-16:** The literal **"10+ minutes backgrounded on a real phone"** criterion is covered by a **documented manual check** at `docs/manual-checks/mobile-background.md`, following Phase 1's `cold-start.md` precedent (D-04 there). Real OS tab suspension cannot be faithfully faked in CI. The phase gate is `npm test`, `npx playwright test` and per-package `tsc --noEmit`, all green, plus owner sign-off on the manual check. The sign-off is recorded as the owner's verbatim reply, never fabricated.

### Claude's Discretion
- Heartbeat interval, pong timeout, and server staleness threshold (within D-04's intent), and where the constants live (`packages/schema` constants are the likely home).
- Exact ping/pong literal strings, and whether the client heartbeat pauses while hidden. Browsers throttle timers in hidden tabs anyway, so the resume check in D-01 is what matters.
- Store shape for the reconnecting state and banner placement and wording.
- How the "Use this tab" action resets partysocket, whether through `reconnect()` or a remount.
- The mechanism used to simulate backgrounding in Playwright.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/ROADMAP.md` §Phase 5 — goal and the 4 success criteria
- `.planning/REQUIREMENTS.md` — RT-04, RT-05, RT-06, RT-08
- `.planning/PROJECT.md` — Constraints (session durability, free-tier cost) and Core Value

### Prior decisions this phase builds on
- `.planning/phases/01-room-transport-skeleton/01-CONTEXT.md` — D-05 (seat token), D-07/D-12 (lobby-only grace and release), D-08 (newest socket wins, with RT-08 hardening deferred to here), D-04 (manual-check precedent)
- `.planning/phases/02-per-seat-redaction-contract/02-CONTEXT.md` — D-08/D-09 (single `#send` chokepoint and structural test), D-10 (join, update and reconnect share `#viewFor`)
- `.planning/phases/04-wire-engine-into-room-actor/04-CONTEXT.md` — D-07/D-08 (`actionId` dedup persisted per seat), D-14/D-15 (Playwright and socket-harness proof patterns)

### Code to read first
- `apps/web/lib/room-socket.ts` — partysocket config, the stop-reconnecting latch, and join replay on `open`
- `apps/web/lib/room-store.ts` — connection status union and view cache
- `apps/web/app/room/[code]/RoomClient.tsx` — superseded, abandoned and connecting screens
- `apps/web/components/HanabiBoard.tsx` — board with no connection indicator yet
- `apps/worker/src/room-do.ts` — `onConnect` / `onClose` (CR-01 stale-close guard), rebinding and supersede, `onAlarm`
- `apps/worker/src/scheduler.ts` — `computeRoomTimers`, the derive-whole-table alarm pattern
- `apps/worker/src/seat-identity.ts` — `rebindSeatConnection`, `supersededConnectionId`
- `apps/worker/src/source-structure.test.ts` — chokepoint counts that must hold
- `apps/worker/src/room-do.test.ts` — `wrangler dev` + `ws` harness and eviction pattern
- `e2e/hanabi-realtime.spec.ts`, `e2e/seat-takeover.spec.ts`, `e2e/helpers.ts` — e2e specs to extend
- `docs/manual-checks/cold-start.md` — template for the new manual check

### External
- Cloudflare Durable Objects WebSocket Hibernation docs (`setWebSocketAutoResponse`, `getWebSocketAutoResponseTimestamp`), and how `partyserver` exposes them. The researcher should verify the current API surface.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `isTerminalCloseCode` / `SUPERSEDED_CLOSE_CODE` / `ROOM_ABANDONED_CLOSE_CODE`: an existing close-code vocabulary for distinguishing terminal closes from recoverable ones
- `setSeatConnected` in `room-state.ts`, with a persisted `disconnectedAt`: already feeds the connected flag into every seat view
- `SeatRow` connection dot and CSS status tokens: the visual language to reuse on the board
- `stopReconnectingRef` latch: the gate that the new visibility and heartbeat reconnects must respect

### Established Patterns
- Timers are derived as a whole table from `RoomState` on every event, with a single alarm slot (Phase 1 Pitfall 1). The zombie sweep must fit this pattern.
- Detach before close (CR-01/WR-01) whenever the server closes a socket
- Structural source tests enforce chokepoints. Changes to counts are explicit and justified.
- Manual checks are documented as files, and sign-off is recorded verbatim.

### Integration Points
- Client: `room-socket.ts` (heartbeat, visibility and online listeners), `room-store.ts` (reconnecting status), `RoomClient.tsx` (superseded "Use this tab" and reconnecting banner), `HanabiBoard.tsx` (per-seat status and waiting-for-disconnected turn text)
- Worker: `room-do.ts` (auto-response setup, zombie sweep in `onAlarm`), `scheduler.ts` (new timer type), `packages/schema` constants

</code_context>

<specifics>
## Specific Ideas

- The expected usage is friends on a voice call, often with the game on a phone that gets locked or switched away from. This is the primary path, not a corner case.
- The laptop/phone handoff ("Use this tab") is the realistic multi-tab scenario, more than accidental duplicate tabs.

</specifics>

<deferred>
## Deferred Ideas

- Voting to skip or remove a player who never returns mid-game: a new capability, not hardening. Revisit only if the group hits it.
- Styled connection indicators on the board: Phase 6 (Game Interface).
- Push or OS notifications that it is your turn while backgrounded: a new capability, out of v1 scope.

</deferred>

---

*Phase: 05-reconnect-session-durability-hardening*
*Context gathered: 2026-09-16*
