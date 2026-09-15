# Cold-Start Check (RT-02)

## Why this check exists

The whole architecture in `CLAUDE.md` was chosen to avoid one specific failure mode:
Supabase's free-tier projects pause after roughly a week of inactivity, which directly
violates this product's core promise — "a friend clicks a link on a random Tuesday and
is playing within seconds." Cloudflare Durable Objects were picked specifically because
they **hibernate rather than pause**, and room state is persisted to SQLite storage that
survives eviction, not held only in memory.

That said, "hibernate, don't pause" is a claim from Cloudflare's own documentation, not
something this repo has verified against our actual deployment. Local dev and CI cannot
produce real elapsed idle time — a `wrangler dev` process never truly hibernates the way
a deployed Worker does, and nothing in `npx vitest run`/`npx playwright test` can fake a
week passing. This document is the only thing that converts the hibernation assumption
into evidence, on our own account, on our own domain.

## Procedure

1. **Confirm both targets are deployed at the recorded hosts.** The Worker host and the
   Vercel production URL (`https://games.rogerflores.dev`) must both be live before the
   idle window can start. See `docs/deployment.md` for the recorded hosts and the
   redeploy history.
2. **Do not touch either deployment or open any room for at least 7 days of real
   elapsed time.** No `wrangler deploy`, no Vercel production deploy, no visiting
   `games.rogerflores.dev` or any `/room/[code]` URL, and no `wrangler dev`/`next dev`
   traffic hitting the production Worker. A redeploy resets the Worker's own
   hibernation/eviction clock and the DO's runtime lifetime — if you ship a change
   during the window, the window must restart from that deploy, not from the original
   date. Note the restart in the Log below rather than silently continuing the old row.
3. **From a browser that has never visited the site** (a private/incognito window, no
   saved seat token, no cached DNS-adjacent state), create a fresh room by visiting
   `https://games.rogerflores.dev` and clicking "Create room."
4. **Time the click-to-connected-lobby interval with a stopwatch.** Record whether:
   - (a) it succeeded with **no redeploy or restart** of either target, and
   - (b) the wait was "a couple of seconds," not tens of seconds.
5. **Append a row to the Log below** with the observed values, using real dates and a
   real stopwatch reading — do not estimate or backfill.

## Log

| Date | Days idle | Browser | Click→connected | Manual intervention needed? | Notes |
|------|-----------|---------|------------------|------------------------------|-------|
| 2026-09-15 | 0 | — | — | — | PENDING — 7-day window opens 2026-09-15, first check due 2026-09-22. Both targets confirmed live on 2026-09-15: Worker `games-worker.rflores3113.workers.dev`, web `https://games.rogerflores.dev` (Vercel project `games-web`). The originally seeded 2026-09-03 date predated any live deploy and is superseded. Production Playwright runs and redeploys on 2026-09-15 count as activity; if either target is redeployed or a room is opened after that, restart the window from that date and log the restart here. |

## When to re-run

- After **Phase 4** (the real Hanabi rules engine is wired into the room/DO layer) —
  confirm the heavier bundle and any new persisted state shape didn't change cold-start
  behavior.
- After **Phase 5** (reconnect hardening) — confirm nothing in the reconnect path adds a
  cold-path dependency that wasn't there in Phase 1.
- **Any time connection latency feels off** in normal use — the audit trail below exists
  so a regression is visible against a recorded baseline instead of argued about from
  memory.

## What failure looks like

Any of the following means RT-02 is **unmet** and the Durable Object hibernation
assumption needs re-examination before Phase 4 builds further on top of it:

- The connection **hangs or errors** on the first click — no `joined`/`state` message
  ever arrives, or the WebSocket handshake itself fails.
- The lobby takes **tens of seconds** (not a couple of seconds) to render as connected.
- A **redeploy or restart is needed** to make the room connect at all — this would mean
  the DO did not actually survive its idle period the way hibernation is documented to
  work, and the whole "click a link on a random Tuesday" promise this architecture was
  chosen to keep is not actually being kept.

If any of these are observed, do not mark RT-02 as passing — file it as a blocker before
Phase 4 work begins, since Phase 4 assumes this check already passed.
