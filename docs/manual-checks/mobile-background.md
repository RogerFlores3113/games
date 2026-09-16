# Mobile Background Check (RT-04, RT-06, RT-08)

## Why this check exists

The primary path this product is built for is friends on a voice call, with
the game open on a phone that gets locked or switched away from mid-turn.
That is not a corner case — it is the expected way most players will
actually use this app. iOS and Android suspend backgrounded browser tabs at
the OS level, and that suspension can silently leave a WebSocket half-open:
the socket object still looks connected from JavaScript's point of view, but
no frames are actually flowing.

Phase 5's automated coverage (`e2e/hanabi-realtime.spec.ts`'s "Phase 5
reconnect hardening" block, 05-05) proves the same behavior using Chrome
DevTools Protocol `Page.setWebLifecycleState('frozen')` paired with a hard
`context.setOffline(true)` network drop. That is a good proxy, but it is
still a simulation run inside a desktop Chromium instance under CI's
control — not real OS-level tab suspension on a real phone's real browser.
RESEARCH.md Pitfall 4 (and Assumption A2) documents this gap explicitly:
CDP's frozen lifecycle state and an actually-stopped JS timer are two
different subsystems, and 05-05 itself found that a bare CDP freeze did not
reliably stop the client heartbeat in the installed Chromium, needing the
network drop as defense-in-depth. This document is the only thing that
converts "should behave the same on a real phone" from an assumption into
recorded evidence.

For reference, the production timing constants (`packages/schema/src/constants.ts`,
D-04) are: client heartbeat ping every 20s (`HEARTBEAT_INTERVAL_MS`), pong
timeout 10s (`HEARTBEAT_PONG_TIMEOUT_MS`), server staleness threshold 75s
(`SOCKET_STALE_MS`), zombie sweep grid 15s (`ZOMBIE_SWEEP_INTERVAL_MS`). A
teammate should see a backgrounded phone flip to "disconnected" within
roughly 75-90 seconds of the last heartbeat landing — "about a minute," not
instantly on a blip and not many minutes later.

## Procedure

1. **Confirm production is live and untampered.** Both `https://games.rogerflores.dev`
   (Vercel) and the Worker at `https://games-worker.rflores3113.workers.dev`
   must be deployed with Phase 5 code. Confirm none of these four override
   variables are set in production: `SOCKET_STALE_MS`, `ZOMBIE_SWEEP_INTERVAL_MS`
   (Worker vars) or `NEXT_PUBLIC_HEARTBEAT_INTERVAL_MS`, `NEXT_PUBLIC_HEARTBEAT_PONG_TIMEOUT_MS`
   (Vercel env). If any of these test-only timing overrides are present in
   production, remove them and redeploy before running this check — their
   presence would produce false disconnects or mask real ones.
2. **Laptop creates the room.** From a laptop browser, visit
   `https://games.rogerflores.dev`, create a room, and note the room code.
3. **Phone joins.** From a real phone (note the device model, OS, and mobile
   browser used, and whether it is on cellular or wifi), open the room link
   and join as a second seat.
4. **Start the game and take at least one action**, so the room is mid-game
   (not still in the lobby) before the background window starts.
5. **Make it the PHONE's turn.** Play, clue, or discard from the laptop seat
   (or wait out however many turns it takes) until the active player is the
   phone's seat.
6. **Lock the phone, or switch away to another app, for at least 10 minutes
   of real stopwatch time.** This is the literal ROADMAP Phase 5 success
   criterion — do not shorten it and do not estimate it.
7. **On the laptop, within about 2 minutes of the lock/switch, confirm:**
   the phone's seat shows "Disconnected", and the turn indicator reads
   "Waiting for {name} — disconnected". Confirm nothing else about the game
   changes while waiting (no turn skip, no card movement, no fuse/clue
   change) — the table should read as paused, not frozen or broken.
8. **After 10+ minutes, unlock the phone / return to its browser tab.**
   Start a stopwatch the moment you do. Record the number of seconds until
   any "Reconnecting…" banner (if one is shown at all) clears and the phone
   shows "Your turn" in the same seat, with the same hand, the same clue
   tokens, and the same deck count as before — with no join form and no page
   reload.
9. **On the laptop, confirm it now shows "Connected"** for that seat and, if
   it is still that player's turn, the plain "Waiting for {name}" (non-
   disconnected) turn text.
10. **Second-tab handoff (Use this tab).** The seat token lives in one
    browser's storage, so this step is done within the phone's own browser:
    on the phone, open the same room link in a second tab. Confirm the
    FIRST tab now shows "This room was opened in another tab." Tap
    "Use this tab" in the first tab and confirm it reclaims the seat, while
    the laptop still shows exactly one hand for that player throughout (no
    duplicate seat, no flicker between two hands).
11. **Append a row to the Log below with the real observed values** — do not estimate or backfill.

## Log

| Date | Device / browser | Minutes backgrounded | Seconds to seated after return | Same seat + turn? | Teammate saw Disconnected? | Use this tab OK? | Owner's verbatim reply |
|------|-------------------|-----------------------|----------------------------------|---------------------|-------------------------------|----------------------|---------------------------|

## When to re-run

- After **Phase 6** (the board visual rewrite) — confirm the new board still
  renders per-seat connection status and the disconnected-turn text
  correctly.
- After any change to `apps/web/lib/room-socket.ts`, the heartbeat
  constants in `packages/schema/src/constants.ts`, or `RoomDO`'s `onAlarm`
  zombie-sweep logic in `apps/worker/src/room-do.ts`.
- After any `partysocket`, `partyserver`, or `wrangler` upgrade — these are
  exactly the layers this check exercises end to end.
- Whenever a friend reports losing their seat, or the game feeling "stuck"
  after backgrounding their phone during a real session.

## What failure looks like

Any of the following means RT-04 is **not** passing and should not be
recorded as such:

- The phone lands on the join form, or on a fresh/different seat, instead of
  its original seat with its original hand.
- The phone is stuck showing "Reconnecting…" or "Connecting to room…" for
  more than roughly 10 seconds after returning to the tab.
- The laptop never shows "Disconnected" for a phone gone 10+ minutes, or
  shows "Disconnected" for a player who was actually present the whole time.
- The turn was skipped, auto-played, or the game state changed in any way
  while the phone was away.
- "Use this tab" produces two hands for one player on the laptop's board, or
  the two phone tabs flip back and forth between "active" and "superseded"
  on their own without the player tapping anything.

If any of these are observed, do not mark RT-04 as passing.
