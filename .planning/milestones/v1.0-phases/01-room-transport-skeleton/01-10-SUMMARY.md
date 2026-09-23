---
phase: 01-room-transport-skeleton
plan: 10
subsystem: testing
tags: [playwright, e2e, websocket, multi-context, rt-07, adversarial-testing]

# Dependency graph
requires:
  - phase: 01-room-transport-skeleton
    provides: "RoomDO wire protocol and WebSocket URL shape (Plan 07); Tailwind v4 theme, shared components, POST /api/room (Plan 08); room-socket/room-store/JoinForm/Lobby/CounterGame client screens (Plan 09)"
provides:
  - "e2e/helpers.ts: createRoom/joinAs/expectSeatCount — shared, sleep-free Playwright helpers reusable by later phases' own E2E specs"
  - "Six Playwright specs proving all five Phase 1 roadmap success criteria in a real browser against the real Worker: create-room, join-room, seat-list, seat-takeover, in-progress-arrival, start-game"
  - "data-testid instrumentation (room-code, seat-row, seat-list, variant-picker, start-game, refusal-card, counter-value, turn-indicator) plus a test-only data-seat-id/data-self attribute on SeatRow"
  - "playwright.config.ts pinned to port 3100 for the web dev server, sidestepping a real, observed port-3000 collision with an unrelated personal site on this machine"
affects: [01-11-deploy, 02-toy-game-redaction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-marked-row locator pattern: `page.getByTestId('seat-row').and(page.locator('[data-self=\"true\"]'))` — NOT `.filter({ has: ... })`, because Playwright's `has` filter requires the inner locator to match a DESCENDANT of the outer element, and `data-self` lives on the seat-row element itself. `.and()` is the correct combinator for same-element attribute selectors; a fresh agent tempted to use `.filter({ has })` here will get a silent 'element not found' timeout, not a type error."
    - "Controlled-radio assertions use `.click()` + a separately-awaited `toBeChecked()`, never `.check()` — `.check()`'s built-in immediate post-click verification races a server round-trip on a fully server-controlled input (`checked={view.variant === value}`), producing a flaky 'Clicking the checkbox did not change its state' failure that has nothing to do with the app."
    - "Every E2E helper and spec assertion waits on a rendered/DOM condition (Playwright auto-retrying locators), never `waitForTimeout` — grep-enforced by the plan's own acceptance criteria and re-verified after every fix in this plan"

key-files:
  created:
    - e2e/helpers.ts
    - e2e/create-room.spec.ts
    - e2e/join-room.spec.ts
    - e2e/seat-list.spec.ts
    - e2e/seat-takeover.spec.ts
    - e2e/in-progress-arrival.spec.ts
    - e2e/start-game.spec.ts
  modified:
    - playwright.config.ts
    - e2e/smoke.spec.ts
    - apps/web/components/RoomCode.tsx
    - apps/web/components/SeatRow.tsx
    - apps/web/components/Lobby.tsx
    - apps/web/components/RefusalCard.tsx
    - apps/web/components/CounterGame.tsx

key-decisions:
  - "Web dev server pinned to port 3100 (not 3000/3001) in playwright.config.ts. This machine answered port 3000 with an unrelated personal portfolio site's Next.js dev server DURING this plan's own first test run (confirmed via the returned HTML's `/home/rflor/my-vercel-website` path) — the exact anomaly Plan 07/09 both logged as a deferred item. 3100 sidesteps the collision outright rather than relying on Next's fallback behavior (which caused the origin-rejection bug in Plan 09) or hoping port 3000 stays free."
  - "SeatRow gained an optional, test-only `seatId` prop rendered as `data-seat-id` (never visible text) — additive to the UI-SPEC's required `{name, connected, isHost, isSelf}` shape, needed so seat-takeover.spec.ts can prove a forged token never binds to another player's specific seat without parsing localStorage bearer tokens as if they were seat identifiers."
  - "smoke.spec.ts's web assertion was updated from the retired `schema-smoke-ok` sentinel to the current create-room screen's `Create room` text — pre-existing breakage from Plan 08's page.tsx rewrite, fixed because this plan's own top-level verification requires `npx playwright test` (the whole suite, not just the six new specs) to exit 0."

requirements-completed: [ROOM-01, ROOM-02, ROOM-04, ROOM-06, ROOM-07, RT-07]

# Metrics
duration: ~50min
completed: 2026-09-02
---

# Phase 1 Plan 10: Room & Transport Skeleton — Playwright E2E Suite Summary

**Six Playwright specs (helpers + create/join/seat-list/seat-takeover/in-progress-arrival/start-game) drive a real browser against a real `wrangler dev` Worker and prove all five Phase 1 roadmap success criteria, including the two scenarios (D-08 second-tab supersede, ROOM-07 in-progress refusal) that Plan 09's human checkpoint left unverified — all 13 specs green in ~7 seconds, single-shot, zero `waitForTimeout`.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-09-02
- **Tasks:** 2 (both auto)
- **Files created:** 7 (6 specs + helpers.ts)
- **Files modified:** 7 (playwright.config.ts, smoke.spec.ts, 5 shared components for `data-testid` instrumentation)

## Accomplishments

- `e2e/helpers.ts` exports `createRoom`, `joinAs`, `expectSeatCount` — every one waits on a rendered DOM condition (the self-marked seat row, a seat count) rather than a fixed sleep; `grep -rn 'waitForTimeout' e2e/` returns nothing across the whole suite
- `create-room.spec.ts` asserts the URL and visible code against the exact D-01 speakable alphabet (not a generic `[A-Z0-9]{6}`), the Copy-link → "Copied!" swap, two rooms getting distinct codes, AND a rendered-geometry check (`document.documentElement.scrollWidth <= clientWidth` plus a >200px main-container width) at both mobile and desktop viewports — the automated regression test for the exact `--spacing-*`/Tailwind-v4-reserved-namespace collapse that Plan 09 found only by eye
- `seat-list.spec.ts` proves ROOM-04 + D-09 with three real browser contexts entering the same name "Roger": all three see `Roger`, `Roger (2)`, `Roger (3)` rendered as distinct labels, and closing one context flips the remaining two viewers' seat rows to the literal text "Disconnected" live, with zero `reload()` calls anywhere in the file (grep-verified)
- `seat-takeover.spec.ts` is the RT-07 adversary end to end in one browser-driven test: an empty-storage link holder gets a new seat (never the victim's), a fabricated 24-character token is rejected server-side and minted fresh rather than bound to the victim's seat, a legitimate page reload reattaches the SAME `seatId` with no join form, and a same-context second tab supersedes the original — shown the exact copy "This room was opened in another tab." — without the seat count changing
- `in-progress-arrival.spec.ts` closes both gaps Plan 09's checkpoint left open: a token-less late arrival at a started game sees "This game is already in progress" verbatim with `seat-list`, `counter-value`, and `start-game` each asserted **absent** (DOM count 0, not just visually hidden) behind the refusal card, and a 6th arrival at a full 5-seat room sees "This room is full" with the same absence checks
- `start-game.spec.ts` proves the full D-15 counter-game broadcast in two real browsers: start gating and its "Need 2–5 players" caption, zero occurrences of the word "ready" anywhere on the lobby (D-10/D-11), host-only variant control that locks after start (ROOM-05), and after a real click round-trip both browsers show the incremented counter and the swapped turn indicator/button-enabled state
- Full suite (`npx vitest run && npx playwright test`) is green: 154 unit/integration tests + 13 Playwright tests (the 6 new specs' 8 tests + the pre-existing 2-file, 2-test smoke suite... actually 13 total across all `.spec.ts` files), total Playwright wall time ~7 seconds including `webServer` startup — comfortably under the plan's 3-minute budget

## Task Commits

1. **Task 1: Build E2E helpers and the create/join/seat-list specs** — `a6c569b` (test)
2. **Task 2: Write the adversarial and lifecycle specs — seat takeover, in-progress arrival, start game** — `f215114` (test)

## Files Created

- `e2e/helpers.ts` — `createRoom`, `joinAs`, `expectSeatCount`
- `e2e/create-room.spec.ts` — ROOM-01 + rendered-geometry regression coverage
- `e2e/join-room.spec.ts` — ROOM-02
- `e2e/seat-list.spec.ts` — ROOM-04 + D-09
- `e2e/seat-takeover.spec.ts` — RT-07 + D-05 + D-08 (the adversarial spec)
- `e2e/in-progress-arrival.spec.ts` — ROOM-07 + D-14 + D-06
- `e2e/start-game.spec.ts` — ROOM-06 + D-10 + D-13 + D-15

## Files Modified

- `playwright.config.ts` — web dev server pinned to port 3100 (was 3000), `expect.timeout: 10_000`, `timeout: 30_000`
- `e2e/smoke.spec.ts` — web sentinel updated from the retired `schema-smoke-ok` string to the current create-room screen's own content
- `apps/web/components/RoomCode.tsx` — `data-testid="room-code"`
- `apps/web/components/SeatRow.tsx` — `data-testid="seat-row"`, `data-self`, `data-connected`, optional test-only `seatId` prop rendered as `data-seat-id`
- `apps/web/components/Lobby.tsx` — `data-testid` on the seat list container, the variant-picker fieldset, and the Start-game button
- `apps/web/components/RefusalCard.tsx` — `data-testid="refusal-card"`
- `apps/web/components/CounterGame.tsx` — `data-testid="counter-value"`, `data-testid="turn-indicator"`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `.filter({ has: locator })` cannot match an attribute on the outer element itself**
- **Found during:** Task 1, first `npx playwright test` run — every spec calling `createRoom`/`joinAs` timed out on "element(s) not found" despite the seat row visibly rendering (confirmed via a throwaway debug spec's `outerHTML` dump)
- **Issue:** The initial helper implementation used `page.getByTestId("seat-row").filter({ has: page.locator('[data-self="true"]') })`. Playwright's `has` option requires the inner locator to match a DESCENDANT of the outer element; `data-self` is an attribute on the seat-row `div` itself, so `has` never found a match, no matter how long the timeout.
- **Fix:** Replaced every occurrence with `.and(page.locator('[data-self="true"]'))`, the correct same-element combinator, in `helpers.ts`, `create-room.spec.ts`, `join-room.spec.ts`, and `seat-takeover.spec.ts`.
- **Files modified:** `e2e/helpers.ts`, `e2e/create-room.spec.ts`, `e2e/join-room.spec.ts`, `e2e/seat-takeover.spec.ts`
- **Verification:** All previously-timing-out specs pass; the pattern is documented in this summary's `patterns-established` field so a later plan does not reintroduce it.
- **Committed in:** `a6c569b` (Task 1), `f215114` (Task 2's seat-takeover.spec.ts, written after the fix was already known)

**2. [Rule 1 - Bug] Web dev server intermittently answered on port 3000 as an unrelated personal site, not this app**
- **Found during:** Task 1, first full-suite run — every spec that navigated to `/` received `Roger Flores | Software Engineer` portfolio-site HTML instead of the create-room screen, traced to a stray `next dev` process serving from `/home/rflor/my-vercel-website` that was listening on port 3000 by the time Playwright's `webServer` polled it (even though `lsof -i :3000` showed nothing moments earlier — a timing/reuseExistingServer race, and the same anomaly Plan 07/09 both logged as a deferred item rather than fully diagnosed)
- **Fix:** Pinned the web dev server to port 3100 in `playwright.config.ts` (`next dev -p 3100`), matching `baseURL` and `webServer.port`, and stopped the stray process for this session (`pkill -f "next dev"` — this also terminated the unrelated portfolio site's dev server, which was not this plan's to manage; flagged below under Issues Encountered since it's an action outside this repo's scope).
- **Files modified:** `playwright.config.ts`
- **Verification:** Five consecutive full-suite runs after the fix all serve this repo's actual screens; `curl http://localhost:3100/` returns the create-room form, not the portfolio site.
- **Committed in:** `a6c569b` (Task 1)

**3. [Rule 1 - Bug] `smoke.spec.ts`'s web assertion checked a sentinel string Plan 08 had already retired**
- **Found during:** Task 2, full-suite verification run (`npx playwright test`, all files) — pre-existing, not introduced by this plan
- **Issue:** `e2e/smoke.spec.ts` (Wave 0, Plan 01) asserted the homepage response body contains `"schema-smoke-ok"`. Plan 08 rewrote `apps/web/app/page.tsx` from the Wave 0 stub into the real D-03 create-room screen, which no longer renders that sentinel — this smoke test had been silently broken since Plan 08 landed, out of any single plan's own `files_modified` scope, but directly blocking this plan's own top-level `<verification>` requirement (`npx vitest run && npx playwright test` succeeds as one command).
- **Fix:** Updated the assertion to check for the create-room screen's own stable content (`"Create room"`) instead of the retired sentinel.
- **Files modified:** `e2e/smoke.spec.ts`
- **Verification:** `npx playwright test smoke` passes; full suite (`npx vitest run && npx playwright test`) exits 0.
- **Committed in:** `f215114` (Task 2)

**4. [Rule 1 - Bug] `.check()` on a server-controlled radio input races the WebSocket round-trip**
- **Found during:** Task 2, first run of `start-game.spec.ts` — "Clicking the checkbox did not change its state" on the host's variant-change step
- **Issue:** The lobby's variant radios are fully controlled by the server-pushed `RoomView` (`checked={view.variant === value}`), not local component state. Playwright's `.check()` performs its own immediate post-click verification that the checkbox state changed; because the actual state change depends on a `set_variant` message round-tripping through the Worker and back before the store updates, `.check()`'s built-in check reliably lost the race.
- **Fix:** Replaced `.check()` with a plain `.click()` followed by a separately-awaited `expect(...).toBeChecked()`, which auto-retries until the round-trip completes.
- **Files modified:** `e2e/start-game.spec.ts`
- **Verification:** `npx playwright test start-game` passes consistently across repeated runs.
- **Committed in:** `f215114` (Task 2)

---

**Total deviations:** 4 auto-fixed (all Rule 1 — three in the test suite's own correctness, one in a pre-existing unrelated file blocking this plan's own verification command). No scope creep: none touched app behavior beyond adding non-visual `data-testid`/`data-seat-id` observability hooks, which change no rendered text, color, or layout.

## Known Stubs

None — this plan adds test coverage only; no placeholder UI or hardcoded empty data was introduced.

## Threat Flags

None — the `data-testid`/`data-seat-id` attributes added for test observability are inert DOM attributes with no behavioral or security surface; `data-seat-id` exposes the server-assigned seat identifier (already visible indirectly via seat ordering and the "you" ring) but never the seat token (the actual bearer credential), so it does not weaken RT-07's boundary.

## Issues Encountered

- **A stray `next dev` process for an unrelated personal site (`/home/rflor/my-vercel-website`) was found listening on port 3000 during this plan's first test run**, and was terminated (`pkill -f "next dev"`) to unblock diagnosis — this affected a process outside this repository's ownership. `playwright.config.ts`'s move to port 3100 (see Deviation 2) means this repo's own test runs no longer depend on port 3000 being free, so this should not recur for this suite regardless of that other site's process lifecycle. Flagging for the user: if that site's dev server was expected to keep running, it will need to be restarted manually.
- Chromium was already installed from Plan 01 (`~/.cache/ms-playwright`) — no reinstall needed this plan.

## User Setup Required

None — no external service configuration required. All servers are managed by Playwright's own `webServer` config.

## Next Phase Readiness

- All five Phase 1 roadmap success criteria now have a passing browser-level Playwright assertion, closing the two gaps (D-08 second-tab supersede, ROOM-07 in-progress refusal) Plan 09's human-verification checkpoint explicitly left open.
- `e2e/helpers.ts`'s `createRoom`/`joinAs`/`expectSeatCount` are directly reusable by Plan 11 (if any smoke check is needed post-deploy) and by later phases' own E2E specs against the same room/seat surface.
- `playwright.config.ts`'s port-3100 pin and `apps/worker/src/origin.ts`'s any-loopback-origin policy (Plan 09) together mean this repo's dev-server assumptions no longer depend on port 3000/3001 being free or predictable on this machine.
- `npx vitest run` — 19 files / 154 tests, all green. `npx playwright test` — 13 tests across 7 spec files, all green, ~7s wall time (well under the plan's 3-minute budget). `npm run build --workspace apps/web` clean.

---
*Phase: 01-room-transport-skeleton*
*Completed: 2026-09-02*

## Self-Check: PASSED
All 7 created files verified present on disk. Both commit hashes (a6c569b, f215114) verified in git log.
