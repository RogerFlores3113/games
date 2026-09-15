---
phase: 01-room-transport-skeleton
plan: 11
subsystem: infra
tags: [cloudflare-workers, durable-objects, vercel, dns, deployment, playwright, free-tier]

# Dependency graph
requires:
  - phase: 01-room-transport-skeleton
    provides: "Deploy-shape checklist in docs/deployment.md (Plan 01); RoomDO + WebSocket origin allowlist (Plan 07); Playwright E2E suite and helpers (Plan 10)"
provides:
  - "Live Worker games-worker at https://games-worker.rflores3113.workers.dev (Durable Object binding ROOM -> RoomDO)"
  - "Live Vercel project games-web serving https://games.rogerflores.dev over Let's Encrypt TLS"
  - "PLAYWRIGHT_BASE_URL override in playwright.config.ts for running specs against a live deployment"
  - "ALLOWED_ORIGINS Worker var for deploy-time extra WebSocket origins"
  - "docs/manual-checks/free-tier.md (FDN-03 PASS), custom-domain.md (FDN-04 PASS), cold-start.md (RT-02 PENDING, due 2026-09-22)"
affects: [02-toy-game-redaction, 04-hanabi-engine, 05-reconnect-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vercel installs only the apps/web workspace's own dependencies. Anything next build needs (typescript) must be declared in apps/web/package.json, and the production type-check must not include files importing root devDependencies."
    - "next build type-checks through apps/web/tsconfig.build.json (tests excluded); editors and vitest keep tsconfig.json."
    - "NEXT_PUBLIC_WORKER_HOST is inlined at build time: set it before building and redeploy after any change."

key-files:
  created:
    - apps/web/tsconfig.build.json
    - docs/manual-checks/cold-start.md
    - docs/manual-checks/free-tier.md
    - docs/manual-checks/custom-domain.md
  modified:
    - apps/worker/src/origin.ts
    - apps/worker/src/room-do.ts
    - apps/web/package.json
    - apps/web/next.config.ts
    - playwright.config.ts
    - docs/deployment.md
    - .planning/STATE.md

key-decisions:
  - "The production origin lives in apps/worker/src/origin.ts's ALLOWED_ORIGINS, not inline in room-do.ts, plus an ALLOWED_ORIGINS Worker var for extra origins (a *.vercel.app URL) without a code change."
  - "DNS for rogerflores.dev is on Cloudflare; the games CNAME to Vercel is DNS only (grey cloud) so Vercel can issue its certificate."
  - "The RT-02 idle window restarts at the real live-deploy date (2026-09-15, first check due 2026-09-22); the 2026-09-03 seed predated any deploy."

patterns-established:
  - "Production E2E: PLAYWRIGHT_BASE_URL=https://games.rogerflores.dev npx playwright test create-room join-room. Only room-creating specs; each run counts as activity against the RT-02 idle window."

requirements-completed: [FDN-03, FDN-04]

# Metrics
duration: ~2 days elapsed (human dashboard/DNS steps); ~1h agent time
completed: 2026-09-15
---

# Phase 1 Plan 11: Room & Transport Skeleton — Live Deployment Summary

**The stack runs on real free-tier infrastructure: Worker `games-worker.rflores3113.workers.dev` plus Vercel project `games-web` serve `https://games.rogerflores.dev` over TLS. Create-room and join-room pass against production (6/6), both providers are confirmed free with no payment method, and the RT-02 cold-start check has a written procedure with its first check due 2026-09-22.**

## Performance

- **Duration:** ~2 days elapsed, mostly waiting on human dashboard and DNS steps
- **Started:** 2026-09-02
- **Completed:** 2026-09-15
- **Tasks:** 4 of 4 (RT-02 itself stays open by design; it needs 7 real days idle)
- **Files modified:** 11

## Accomplishments

- Deployed the Worker (Durable Object binding `ROOM` -> `RoomDO`); `/__smoke` returns `schema-smoke-ok rules-smoke-ok`.
- Deployed the Next.js app to Vercel with `NEXT_PUBLIC_WORKER_HOST` baked in; the production room bundle dials `games-worker.rflores3113.workers.dev`.
- Wired `games.rogerflores.dev` through a Cloudflare DNS-only CNAME to Vercel; HTTP 200, "Create room" served, Let's Encrypt YR2 certificate.
- Proved the live stack, not just the deploy: `PLAYWRIGHT_BASE_URL=https://games.rogerflores.dev npx playwright test create-room join-room` gives 6 passed.
- Recorded FDN-03 (PASS), FDN-04 (PASS) and the RT-02 procedure under `docs/manual-checks/`.

## Recorded values (for /gsd:verify-work)

| Item | Value |
|---|---|
| Worker host | `games-worker.rflores3113.workers.dev` (version `87aa953d-dc45-41ef-aada-c1f792dd9c80`) |
| Vercel project | `games-web`, team "Roger Flores' projects" |
| Cloudflare plan (verbatim) | "Free" ($0, "Current plan") |
| Vercel plan (verbatim) | "Hobby" |
| Payment method / suspension notice | None on either service |
| DNS | `CNAME games -> 2dd48b707c982d85.vercel-dns-017.com`, DNS only |
| TLS issuer | Let's Encrypt, CN=YR2 |
| RT-02 first check due | **2026-09-22** (still PENDING when this phase closes) |

## Task Commits

1. **Task 1: Authenticate Cloudflare and Vercel, wire the custom domain.** Human action, no commit. Wrangler OAuth login, Vercel project `games-web`, Cloudflare CNAME.
2. **Task 2: Deploy both targets and verify the live stack.** `84009e8` (feat: deploy-time extra WebSocket origins), `c69dad3` (fix: typescript in web workspace), `c62e279` (fix: exclude tests from production type-check), `3392c5f` (feat: record live deployment, production E2E)
3. **Task 3: Record FDN-03 and FDN-04.** `4e2eb59` (docs)
4. **Task 4: RT-02 cold-start procedure and audit log.** `cf94040` (docs), `17e7f80` (docs: restart window at live deploy date)

## Files Created/Modified

- `apps/worker/src/origin.ts`: `ALLOWED_ORIGINS` includes the production origin; optional `ALLOWED_ORIGINS` env var for extra origins
- `apps/worker/src/room-do.ts`: passes `env.ALLOWED_ORIGINS` to the origin check
- `apps/web/package.json`: declares `typescript` 5.9.3 for Vercel's workspace-only install
- `apps/web/next.config.ts`, `apps/web/tsconfig.build.json`: production type-check excludes test files
- `playwright.config.ts`: `PLAYWRIGHT_BASE_URL` override that skips local dev servers
- `docs/deployment.md`: live hosts, redeploy rules, Vercel build gotchas, custom domain, production E2E
- `docs/manual-checks/{cold-start,free-tier,custom-domain}.md`: RT-02, FDN-03, FDN-04 records
- `.planning/STATE.md`: RT-02 pending todo due 2026-09-22

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vercel build could not find TypeScript**
- **Found during:** Task 2 (first Vercel build)
- **Issue:** Vercel installs only `apps/web`'s dependencies; `typescript` was declared only at the monorepo root, so `next build` failed its TypeScript step.
- **Fix:** Declared `typescript` 5.9.3 in `apps/web/package.json`.
- **Files modified:** `apps/web/package.json`, `package-lock.json`
- **Verification:** local `npm run build:web`; the next Vercel build passed the TypeScript install check
- **Committed in:** `c69dad3`

**2. [Rule 3 - Blocking] Production type-check pulled in vitest test files**
- **Found during:** Task 2 (second Vercel build)
- **Issue:** `apps/web/tsconfig.json` includes `**/*.ts`, so five test files importing `vitest` (a root devDependency Vercel does not install) failed type-checking.
- **Fix:** Added `apps/web/tsconfig.build.json` excluding tests; `next.config.ts` sets `typescript.tsconfigPath` to it.
- **Files modified:** `apps/web/next.config.ts`, `apps/web/tsconfig.build.json`
- **Verification:** `tsc --listFilesOnly` shows no test files; local build green; web unit tests 28/28; Vercel build green and site live
- **Committed in:** `c62e279`

**3. [Plan wording] Production origin lives in origin.ts, not room-do.ts**
- **Found during:** Task 2
- **Issue:** The acceptance criterion greps `room-do.ts` for `games.rogerflores.dev`, but the allowlist was extracted to `origin.ts` (Plan 07/09) as a pure, unit-tested function.
- **Fix:** None needed. `origin.ts:20` allowlists `https://games.rogerflores.dev`, and `room-do.ts` enforces it. Production rooms connect (E2E 6/6), so no allowlist-change Worker redeploy was required.
- **Committed in:** `84009e8`

---

**Total deviations:** 3 (2 blocking build fixes, 1 plan-wording mismatch)
**Impact on plan:** Both fixes were required for any Vercel build to succeed. No scope creep.

## Issues Encountered

- The plan was interrupted at the Task 1 human gate with Task 4 already committed; resumed from inspected git state, with nothing redone.
- The agent's own `wrangler deploy` was blocked by the permission classifier as a production deploy; the user ran it.

## User Setup Required

Done during this plan: Cloudflare Workers Free and wrangler login; Vercel `games-web` with Root Directory `apps/web` and `NEXT_PUBLIC_WORKER_HOST`; Cloudflare DNS CNAME `games` (DNS only).

## Next Phase Readiness

- Real infrastructure is proven: DO-per-room over WebSocket works across Vercel -> Workers in production.
- **Open:** RT-02 is PENDING until the 2026-09-22 cold-start check logs a real row. Don't redeploy or open rooms before then, or the window restarts. Phase 4 assumes RT-02 passed.

---
*Phase: 01-room-transport-skeleton*
*Completed: 2026-09-15*
