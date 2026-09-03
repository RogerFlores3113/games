---
phase: 01-room-transport-skeleton
plan: 09
subsystem: ui
tags: [partysocket, zustand, nextjs-app-router, websocket-client, reconnect]

# Dependency graph
requires:
  - phase: 01-room-transport-skeleton
    provides: "RoomDO (Plan 07) — the WebSocket URL shape (`ws(s)://<worker-host>/parties/room/<ROOM_CODE>`) and the join/joined/state/refused/superseded/error wire protocol this plan connects to"
  - phase: 01-room-transport-skeleton
    provides: "Tailwind v4 theme tokens + Button/RefusalCard/RoomCode/SeatRow shared components, POST /api/room, sessionStorage `room:{code}:displayName` convention (Plan 08)"
  - phase: 01-room-transport-skeleton
    provides: "ClientMessageSchema/ServerMessageSchema wire protocol, RoomView/PublicSeat client-facing shapes (Plan 03)"
provides:
  - "apps/web/lib/seat-token.ts: SSR-safe, throw-safe localStorage seat-token persistence keyed by room code (D-05)"
  - "apps/web/lib/room-store.ts: Zustand cache of the last server-pushed RoomView plus connection status/refusal reason/seatId"
  - "apps/web/lib/room-socket.ts: useRoomSocket — partysocket connection replaying the seat token on every open, validating every inbound frame with ServerMessageSchema, disabling reconnection on refused/superseded"
  - "apps/web/app/room/[code]/{page.tsx,RoomClient.tsx}, components/{JoinForm,Lobby,CounterGame}.tsx: the live join/lobby/counter-game screens"
affects: [01-10-reconnect-and-e2e-hardening, 02-toy-game-redaction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One code path for first join and every reconnect: room-socket.ts's onOpen handler re-reads readSeatToken(code) and sends the join frame on EVERY open, not just the first — no separate reconnect branch exists to diverge later"
    - "A seat token match is ALWAYS a reclaim server-side (room-state.ts joinRoom), so the client can send a non-empty placeholder display name when it only has a saved token and no known name — the server ignores it and reuses the seat's persisted name"
    - "Reconnection is stopped (not fought) by flipping a ref checked from partysocket's own shouldReconnectOnClose callback on refused/superseded, rather than hand-rolling a retry loop or calling an undocumented private API"

key-files:
  created:
    - apps/web/lib/seat-token.ts
    - apps/web/lib/seat-token.test.ts
    - apps/web/lib/room-store.ts
    - apps/web/lib/room-store.test.ts
    - apps/web/lib/room-socket.ts
    - apps/web/.env.example
    - apps/web/app/room/[code]/page.tsx
    - apps/web/app/room/[code]/RoomClient.tsx
    - apps/web/components/JoinForm.tsx
    - apps/web/components/Lobby.tsx
    - apps/web/components/CounterGame.tsx
  modified: []

key-decisions:
  - "RECONNECT_PLACEHOLDER_NAME (\"Player\") sent as displayName when a seat token exists but no sessionStorage display name is known — safe because room-state.ts's joinRoom treats any seatToken match as a reclaim and ignores the presented name, so no player ever actually sees this placeholder as their own name"
  - "ConnectedRoom (inside RoomClient.tsx) builds ClientMessage payloads inline and calls socket.send(JSON.stringify(...)) directly, rather than adding a send helper to room-socket.ts — keeps room-socket.ts's file scope to Task 1's connection/validation responsibility only"

requirements-completed: [ROOM-01, ROOM-02, ROOM-04, ROOM-06, ROOM-07]

# Metrics
duration: ~70min (including checkpoint wait and post-checkpoint fix cycle)
completed: 2026-09-02
---

# Phase 1 Plan 9: Room & Transport Skeleton — Room Client & Live Screens Summary

**The browser side of the room: a `partysocket` client that replays the seat token on every connect and validates every inbound frame, a thin Zustand cache of the last server-pushed view, and the three live screens (join, lobby, D-15 counter game) that make a friend clicking a link into a seated player.**

## Performance

- **Duration:** ~70 min (2 auto tasks + human-verification checkpoint + a post-checkpoint fix cycle across three files this plan touches)
- **Completed:** 2026-09-02
- **Tasks:** 3 (2 auto, 1 checkpoint:human-verify)
- **Files created:** 11

## Accomplishments

- `seat-token.ts` persists the D-05 seat token in `localStorage`, keyed by room code, and is proven SSR-safe and throw-safe: a test stubs the `window.localStorage` *getter itself* to throw (simulating Safari private mode) and asserts `readSeatToken` returns `undefined` without throwing
- `room-store.ts` is a pure reducer over `ServerMessage` variants — a `refused` message is proven by test to clear `view` to `null` (a refused arrival never renders stale seats), and `error` is proven to leave `view`/`status`/`seatId` untouched (a non-fatal protocol error does not corrupt the last-known-good server state)
- `room-socket.ts` sends the `join` frame from a single `onOpen` handler that fires identically on first connect and on every automatic reconnect — no separate reconnect code path exists to diverge from the first-join path later (this is RT-05's Phase 5 groundwork, called out explicitly in the plan)
- Reconnection is grep-provably not hand-rolled: no `setTimeout`/`retryCount`/backoff string appears in `room-socket.ts`; all retry timing lives inside `partysocket`, and refused/superseded are handled by returning `false` from partysocket's own `shouldReconnectOnClose` callback
- `RoomClient.tsx` connects immediately (no form) when either a saved seat token or a `sessionStorage` display name exists, and shows `JoinForm` otherwise — implementing D-03's "host lands directly in the lobby" and D-05's "no name re-entry" with one branch
- `Lobby.tsx` has no ready toggle, no ready column, and no literal "ready" anywhere (grep-verified) — Start game is gated purely on 2–5 seated players (D-10/D-11); `CounterGame.tsx` is a single number, a turn indicator, and one "+1" button, deliberately small enough that Phase 2 can delete it in a legible diff (D-15)

## Task Commits

1. **Task 1: Build the seat-token store and the typed partysocket client** — `49d6e84` (feat)
2. **Task 2: Build the join screen, the live lobby, and the counter-game screen** — `abed36a` (feat)
3. **Task 3: Verify the room lifecycle by hand in two browsers** — checkpoint:human-verify, see "Human Verification Outcome" below. Three defects found during verification were fixed and committed by the orchestrator, not by this plan's own task commits (see Deviations).

## Files Created

- `apps/web/lib/seat-token.ts` / `seat-token.test.ts` — D-05 localStorage persistence
- `apps/web/lib/room-store.ts` / `room-store.test.ts` — Zustand cache of the last server-pushed view
- `apps/web/lib/room-socket.ts` — `useRoomSocket`, the `partysocket` wrapper
- `apps/web/.env.example` — `NEXT_PUBLIC_WORKER_HOST` with the `wrangler dev` default
- `apps/web/app/room/[code]/page.tsx` — server component, OpenGraph metadata per room code
- `apps/web/app/room/[code]/RoomClient.tsx` — owns the join/lobby/refusal/superseded/counter-game flow
- `apps/web/components/JoinForm.tsx`, `Lobby.tsx`, `CounterGame.tsx` — the three live screens

## Human Verification Outcome (Task 3, 13 numbered steps)

Verified by the user against both dev servers (`npx wrangler dev` on 8787, `npm run dev --workspace apps/web`, which fell back to port 3001 in this sandbox because port 3000 was occupied by an unrelated process):

- **Steps 1–8: CONFIRMED.** Room creation lands directly in the lobby already seated as host (D-03); room code is legible/speakable in monospace; "Copy link" shows "Copied!" and reverts; a second browser joins live within a second with no refresh, seated as `{Name} (2)`; "Start game" enables at 2 seats with no ready toggle visible anywhere; the host's variant change (Black) propagates live and the joiner has no variant control; closing the joiner's window shows a slate "Disconnected" dot with the word "Disconnected" in the host window within a second or two.
- **Step 9: CONFIRMED.** Reopening the joiner URL in the same browser reattaches to the same seat automatically, with no name re-entry (D-05).
- **Step 11: CONFIRMED.** Starting the game switches both windows to the counter screen, exactly one side reads "Your turn," and clicking "+1" increments the shared count and passes the turn in both windows.
- **Step 10 (second-tab supersede, D-08): NOT manually verified.** The user chose to move on before exercising this step in a browser. This path IS covered by `apps/worker/src/room-do.test.ts`'s existing RT-07/D-08 integration suite (reclaim + supersede + close 4001, driven over real WebSockets against a live `wrangler dev` instance) and by `RoomClient.tsx`'s `superseded` branch (grep-verified to render the exact copy "This room was opened in another tab."), but neither of those is a two-browser-tab manual confirmation. **Outstanding — flagged for Plan 01-10 as a must-cover Playwright scenario, not nice-to-have.**
- **Step 12 (in-progress refusal, ROOM-07/D-14): NOT manually verified.** Same situation: `room-do.test.ts` has a server-side integration test for the in-progress refusal, and `RoomClient.tsx` is grep-verified to route a `refused` status to `RefusalCard`, but no one opened a third browser against an in-progress room to visually confirm no partial table renders behind the refusal card. **Outstanding — flagged for Plan 01-10 as a must-cover Playwright scenario.**
- **Step 13 (overall dark-theme look):** implicitly confirmed by steps 1–8 producing no reported visual complaints once the spacing-token defect (see Deviations) was fixed; not called out as a separate explicit pass/fail by the user.

**Net effect on requirements:** ROOM-01, ROOM-02, ROOM-04, ROOM-06 are browser-verified end-to-end. ROOM-07 is server-integration-tested and client-code-verified but not yet browser-verified — Plan 01-10 should close that gap before Phase 1 is considered fully proven, not just fully built.

## Deviations from Plan

### Auto-fixed Issues (found during Task 3 verification, fixed and committed by the orchestrator outside this plan's own task commits)

**1. [Rule 1 - Bug] WebSocket origin allowlist hardcoded port 3000, blocking every browser handshake once Next dev fell back to 3001**
- **Found during:** Task 3, first browser connection attempt — the lobby rendered permanently blank
- **Issue:** `RoomDO`'s origin allowlist (`apps/worker`) checked `ALLOWED_ORIGINS.includes(origin)` against an exact `http://localhost:3000` string (Plan 07). Port 3000 was already occupied in this sandbox (the same stray-process anomaly `deferred-items.md` logged from Plan 07), so Next fell back to 3001, every handshake was closed with 1008 "origin not allowed," and the client never received a `RoomView` — indistinguishable, from this plan's own `RoomClient.tsx`, from a working-but-slow connection, because the `!view` branch rendered an empty `<main />`.
- **Fix:** Extracted a pure `isOriginAllowed` (`apps/worker/src/origin.ts` + tests) that allows any loopback origin on any port, restricting only remote origins to the production domain — the dev port is not a security boundary once loopback access is already implied. `RoomClient.tsx`'s `!view` branch was also changed to render a visible "Connecting to room {code}…" state instead of an empty element, so a rejected handshake is now visually distinguishable from a broken client.
- **Files modified:** `apps/worker/src/origin.ts` (new), `apps/worker/src/origin.test.ts` (new), `apps/worker/src/room-do.ts`, `apps/web/app/room/[code]/RoomClient.tsx`
- **Committed in:** `e8b3c0b` (fix, orchestrator commit, outside this plan's own task commits)

**2. [Rule 1 - Bug] `--spacing-*` custom tokens collided with Tailwind v4's reserved sizing namespace, collapsing every page to a one-word-per-line column**
- **Found during:** Task 3, first visual look at the running app
- **Issue:** Plan 08's `globals.css` declared `--spacing-xs..--spacing-3xl` inside `@theme`. `--spacing-*` is a namespace Tailwind v4 reserves to feed its own sizing utilities, so `max-w-sm` silently resolved to `--spacing-sm` (8px) and `max-w-2xl` to `--spacing-2xl` (48px) instead of their intended container widths — every form and the lobby wrapped text at min-content width.
- **Fix:** Renamed the custom scale from `--spacing-*` to `--space-*` (not a reserved namespace) across `globals.css` and all seven components, including this plan's `RoomClient.tsx`, `JoinForm.tsx`, `Lobby.tsx`, and `CounterGame.tsx`. The lobby also became desktop-first responsive (`lg:max-w-3xl lg:justify-center`) as part of the same fix, and disabled primary buttons now drop the accent fill instead of fading it to a muddy brown.
- **Files modified (in this plan's scope):** `apps/web/app/room/[code]/RoomClient.tsx`, `apps/web/components/JoinForm.tsx`, `apps/web/components/Lobby.tsx`, `apps/web/components/CounterGame.tsx` (plus `globals.css` and three Plan 08 components, outside this plan's scope)
- **Committed in:** `190a0af` (fix, orchestrator commit, outside this plan's own task commits)

**3. [Rule 1 - Bug] Hibernation wiped the in-memory seat-binding map, so the host never saw a new joiner until reloading**
- **Found during:** Task 3, step 5 — the joiner's seat did not appear in the host's window without a manual refresh
- **Issue:** Plan 07's `seatId -> connectionId` map lived as a plain in-memory field on `RoomDO`. Cloudflare hibernates a Durable Object's memory between messages while its WebSockets stay technically connected (RESEARCH.md's documented memory-vs-storage pitfall); the room woke from hibernation holding zero bindings, so `#pushState` iterated an empty map and never told anyone already seated that a new player had joined. Reloading re-sent `join`, which rebuilt the binding — making it look like a client bug rather than a server-side memory-vs-storage gap.
- **Fix:** The seat id now rides on each connection's own attachment via `partyserver`'s `setState` (backed by `serializeAttachment`, hibernation-safe); `bindings` is derived from live connections rather than held as separate state.
- **Files modified:** `apps/worker/src/room-do.ts` (outside this plan's own `files_modified` scope — no `apps/web` file needed a change for this one)
- **Committed in:** `a46c513` (fix, orchestrator commit, outside this plan's own task commits)

---

**Total deviations:** 3 auto-fixed (all Rule 1 bugs), all discovered during Task 3's human verification and fixed/committed by the orchestrator rather than as part of this plan's own two task commits. Two of the three (defects 1 and 2) touched files inside this plan's `files_modified` scope (`RoomClient.tsx`, `JoinForm.tsx`, `Lobby.tsx`, `CounterGame.tsx`); defect 3 was entirely `apps/worker`-side. No scope creep — all three were necessary to make the plan's own success criteria (a live, visually correct, joinable room) actually observable.

## Issues Encountered

- Port 3000 was occupied by an unrelated stray process in this sandbox during Task 3's checkpoint (same anomaly logged in Plan 07's `deferred-items.md`); `npm run dev --workspace apps/web` fell back to port 3001. This is what surfaced deviation 1 above — worth keeping in mind for Plan 10/11's own dev-server assumptions.
- Steps 10 (D-08 second-tab supersede) and 12 (ROOM-07/D-14 in-progress refusal) of the 13-step checkpoint were not manually exercised in a browser before the user moved on. Both paths have existing server-side integration coverage (`room-do.test.ts`) and client-side code coverage (grep-verified copy/routing in `RoomClient.tsx`), but no browser-level confirmation exists yet. Recorded above as outstanding, not as passed.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 01-10 should treat browser-level confirmation of D-08 (second-tab supersede) and ROOM-07/D-14 (in-progress refusal screen) as **must-cover** Playwright scenarios, not nice-to-have — both were left unverified at the browser level by this plan's checkpoint.
- `apps/worker/src/origin.ts`'s `isOriginAllowed` (loopback-any-port, restricted-remote) is now the origin policy Plan 10/11 should build on rather than re-hardcoding a dev port.
- `--space-*` (not `--spacing-*`) is now the project's custom spacing-token namespace — documented in `globals.css` to prevent reintroducing the Tailwind v4 reserved-namespace collision.
- `npx vitest run` — 19 files / 154 tests, all green. `npm run build --workspace apps/web` and `npm run build --workspace apps/worker` both clean.

---
*Phase: 01-room-transport-skeleton*
*Completed: 2026-09-02*

## Self-Check: PASSED
All 11 created files verified present on disk. All 5 relevant commit hashes (49d6e84, abed36a, e8b3c0b, 190a0af, a46c513) verified in git log.
