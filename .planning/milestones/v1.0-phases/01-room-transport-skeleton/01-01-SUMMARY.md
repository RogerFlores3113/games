---
phase: 01-room-transport-skeleton
plan: 01
subsystem: infra
tags: [npm-workspaces, monorepo, vitest, playwright, wrangler, next.js, cloudflare-workers, typescript]

# Dependency graph
requires: []
provides:
  - "npm-workspaces monorepo skeleton: apps/web, apps/worker, packages/rules, packages/schema"
  - "Root Vitest 4 config using `projects` (schema, rules, worker, web) with a real passing test per project"
  - "Playwright harness (playwright.config.ts + e2e/smoke.spec.ts) booting next dev + wrangler dev via webServer"
  - "wrangler.jsonc SQLite-backed Durable Object binding (ROOM -> RoomDO), no nodejs_compat"
  - "docs/deployment.md: Vercel root-directory checklist, wrangler dry-run result, user prerequisites"
  - "Exact TypeScript 5.9.3 pin (research assumption A1 resolved)"
affects: [02-toy-game-redaction, 07-room-durable-object, 11-deploy]

# Tech tracking
tech-stack:
  added: [typescript@5.9.3, vitest@4.1.11, "@playwright/test@1.62.1", fast-check@4.9.0, next@16.3.4, react@19.2.8, partyserver@0.5.10, partysocket@1.3.0, wrangler@4.128.0, "@cloudflare/workers-types@5.20260902.1", zod@4.5.4, zustand@5.0.15, clsx@2.1.1, tailwindcss@4.3.3]
  patterns:
    - "packages/rules and packages/schema are dependency-free/single-dependency TS-source packages (no build step), consumed via workspace `exports` map pointing at src/index.ts"
    - "Vitest 4 monorepo discovery via `projects` array inside root vitest.config.ts (NOT vitest.workspace.ts, removed in v4)"
    - "Worker entry module (apps/worker/src/index.ts) never re-exports plain constants as top-level named exports — wrangler's Modules format reserves top-level named exports for Worker entrypoints (class/function only)"

key-files:
  created:
    - package.json
    - tsconfig.base.json
    - vitest.config.ts
    - playwright.config.ts
    - e2e/smoke.spec.ts
    - packages/schema/src/index.ts
    - packages/rules/src/index.ts
    - apps/worker/wrangler.jsonc
    - apps/worker/src/index.ts
    - apps/worker/test/cloudflare-workers-shim.ts
    - apps/web/app/page.tsx
    - docs/deployment.md
  modified: []

key-decisions:
  - "TypeScript pinned to exact 5.9.3 (option pin-5x, human-confirmed at Task 1 checkpoint) — matches CLAUDE.md's '5.7+' constraint and the major every other pinned tool in research was validated against; npm's `latest` resolves to an unvalidated 7.x major"
  - "vitest's slopcheck TYPOSQUAT_RISK flag (name-similarity to vite) accepted as a false positive, human-confirmed at Task 1 checkpoint — proceeded without further mitigation"
  - "apps/worker/src/index.ts must NOT re-export plain constants as top-level named exports (wrangler Modules-format constraint) — sentinels are exercised through the fetch handler instead"

patterns-established:
  - "Cross-package smoke sentinels (SCHEMA_SMOKE, RULES_SMOKE) prove workspace resolution by grep/test, not by vibes — later plans can follow the same pattern for new shared exports"
  - "Vitest project-scoped resolve.alias mirrors tsconfig.base.json's `paths` map; any new workspace package must update both plus vitest.config.ts's per-project alias blocks"

requirements-completed: [FDN-01]

# Metrics
duration: ~13min
completed: 2026-09-02
---

# Phase 1 Plan 1: Room & Transport Skeleton — Monorepo Foundation Summary

**npm-workspaces monorepo (apps/web, apps/worker, packages/rules, packages/schema) with Vitest 4 `projects` test discovery, a passing Playwright smoke harness, and both deploy targets (wrangler dry-run, next build) bundling cross-workspace imports offline.**

## Performance

- **Duration:** ~13 min (Tasks 2-4; Task 1 was a human checkpoint pause)
- **Completed:** 2026-09-02T07:43:22Z
- **Tasks:** 4 (1 checkpoint:decision, 3 auto)
- **Files modified:** 33 (created)

## Accomplishments
- Stood up the four-package npm-workspaces monorepo (`apps/web`, `apps/worker`, `packages/rules`, `packages/schema`) with exact-pinned dependency versions from research, all typechecking cleanly
- Wired Vitest 4's `projects` field (not the removed `vitest.workspace.ts`) so `npx vitest run` discovers and passes a real test in all four projects (4/4, 0 failed)
- Built a Playwright harness that boots both `next dev` and `wrangler dev` and asserts each serves its expected smoke sentinel over HTTP
- Retired research assumption A3 (wrangler + npm-workspace symlink/hoisting resolution) with a live `wrangler deploy --dry-run` that bundled both hoisted workspace packages with **no alias workaround needed**
- Retired Pitfall 5 locally (`next build` succeeds importing `@games/schema`); the Vercel-specific "Include files outside the Root Directory" toggle is documented in `docs/deployment.md` for confirmation at the first live Vercel deploy (Plan 11)
- TypeScript pinned to an exact, human-confirmed version (5.9.3) rather than letting `npm install` grab an unvalidated 7.x major

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm TypeScript pin and vitest legitimacy flag** — checkpoint:decision, resolved by user (pin-5x, vitest accepted); no code commit, decision recorded here
2. **Task 2: Create the npm-workspaces monorepo skeleton** — `8f80322` (feat)
3. **Task 3: Wire Vitest 4 `projects` discovery and Playwright harness** — `cb5d804` (feat)
4. **Task 4: Retire deploy-shape risks with dry-run builds** — `83f7046` (docs)

## Files Created/Modified
- `package.json` — npm workspaces root, exact TypeScript 5.9.3 pin, test/build scripts
- `tsconfig.base.json` — strict TS base config, `@games/schema`/`@games/rules` path aliases
- `packages/schema/src/index.ts`, `packages/rules/src/index.ts` — smoke sentinels (`SCHEMA_SMOKE`, `RULES_SMOKE`); `packages/rules` has zero dependencies
- `apps/worker/wrangler.jsonc` — SQLite-backed DO binding (`new_sqlite_classes`), no `nodejs_compat`
- `apps/worker/src/index.ts` — stub `RoomDO extends DurableObject`, fetch handler proving both workspace imports resolve
- `apps/web/app/page.tsx`, `app/layout.tsx`, `next.config.ts` — minimal App Router shell rendering `SCHEMA_SMOKE`
- `vitest.config.ts` — root Vitest 4 `projects` config (schema, rules, worker, web), each with a resolve.alias mirroring the tsconfig paths
- `apps/worker/test/cloudflare-workers-shim.ts` — Node-side shim for the `cloudflare:workers` module specifier, aliased only inside the Vitest `worker` project
- `playwright.config.ts`, `e2e/smoke.spec.ts` — E2E harness against `next dev` (3000) + `wrangler dev` (8787)
- `docs/deployment.md` — Vercel/Cloudflare deploy checklist, dry-run result, user prerequisites, `TODO(Plan 11)` custom-domain section

## Decisions Made
- **TypeScript pin: `pin-5x` → exact `5.9.3`.** Matches CLAUDE.md's "5.7+" constraint and the major every other pinned tool (Next 16, Vitest 4, wrangler 4) was validated against in research (assumption A1). Pinned as an exact literal (no `^`/`~`) so a later `npm install` cannot drift the major.
- **`vitest` SUS flag: accepted as false positive.** User reviewed and approved — the slopcheck `TYPOSQUAT_RISK` flag fires purely on name-similarity to `vite`; vitest is already in CLAUDE.md's locked stack and verified against the npm registry and the `vitest-dev` GitHub org.
- **wrangler dry-run outcome: no alias workaround needed.** `wrangler@4.128.0`'s bundler resolved both hoisted workspace packages unassisted — research assumption A3 is retired as fixed in the current wrangler version.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] apps/worker/src/index.ts crashed `wrangler dev` due to invalid top-level named exports**
- **Found during:** Task 3 (Vitest/Playwright harness) — surfaced via `npx playwright test` when `wrangler dev` failed to start
- **Issue:** The Task-2-authored `apps/worker/src/index.ts` re-exported `SCHEMA_SMOKE`/`RULES_SMOKE` as top-level named exports alongside the default export. wrangler's Modules format treats every top-level named export of the entry module as a potential Worker entrypoint (class/function only); a plain string constant crashed the Workers runtime at startup with `Uncaught TypeError: Incorrect type for map entry 'RULES_SMOKE': the provided value is not of type 'function or ExportedHandler'`.
- **Fix:** Removed the re-export; the sentinels are still imported and used inside the `fetch` handler. `apps/worker/src/smoke.test.ts` was rewritten to call `worker.fetch()` and assert on the response body instead of importing the constants directly.
- **Files modified:** `apps/worker/src/index.ts`, `apps/worker/src/smoke.test.ts`
- **Verification:** `npx vitest run` and `npx playwright test` both pass; `wrangler deploy --dry-run` (Task 4) also confirms the entry module bundles and starts cleanly.
- **Committed in:** `cb5d804` (Task 3 commit)

**2. [Rule 3 - Blocking] `cloudflare:workers` module unresolvable under Vitest's Node runtime**
- **Found during:** Task 3, first `npx vitest run` attempt for the `worker` project
- **Issue:** `apps/worker/src/index.ts` imports `DurableObject` from `cloudflare:workers`, a built-in module specifier that only exists inside `workerd`/`wrangler dev`. Vitest runs the `worker` project in Node, so the bare import failed with `Cannot find package 'cloudflare:workers'`.
- **Fix:** Added a minimal shim (`apps/worker/test/cloudflare-workers-shim.ts`, exporting a plain `DurableObject` class) and aliased `cloudflare:workers` to it, scoped only to the Vitest `worker` project's `resolve.alias` — real DO runtime behavior is still exercised via `wrangler dev` (Playwright) and `wrangler deploy --dry-run` (Task 4), which both use the actual Workers bundler/runtime, not this shim.
- **Files modified:** `apps/worker/test/cloudflare-workers-shim.ts` (new), `vitest.config.ts`
- **Verification:** `npx vitest run` — worker project passes (1/1); `wrangler dev`/`wrangler deploy --dry-run` still exercise the real `cloudflare:workers` module, unaffected by the shim.
- **Committed in:** `cb5d804` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking). Both were discovered by the plan's own verification steps (exactly the point of Wave 0), fixed inline, and re-verified.
**Impact on plan:** No scope creep — both fixes were necessary to make the plan's own acceptance criteria (`npx vitest run`, `npx playwright test`, `wrangler deploy --dry-run`) pass. The wrangler named-export finding is a genuine, previously-undocumented pitfall worth carrying forward: **apps/worker/src/index.ts must never re-export plain constants as top-level named exports.**

## Issues Encountered

`npx playwright install --with-deps chromium` failed in this sandbox (no passwordless `sudo` for installing OS-level browser dependencies). Worked around with `npx playwright install chromium` (browser binary only, no OS deps) — Playwright tests ran successfully against the already-present system libraries. Not a plan deviation; a sandbox environment quirk. Document for future runs: if `--with-deps` is unavailable in a given environment, the plain `install chromium` is sufficient here since chromium's runtime deps were already satisfied.

## User Setup Required

Two dashboard-only prerequisites are documented in `docs/deployment.md` but were **not** performed in this plan (not required until Plan 11):
- Cloudflare account on the Workers Free plan + `npx wrangler login` (for `apps/worker` deploys)
- Vercel project connected to this repo with Root Directory `apps/web` and "Include files outside the Root Directory in the Build Step" enabled (for `apps/web` deploys)

Both are flagged in the plan's `user_setup` frontmatter and recorded as a checklist in `docs/deployment.md`.

## Next Phase Readiness

- All four workspace packages exist, typecheck, and are covered by a real (non-trivial) test discovered via Vitest 4's `projects` field — later plans in this phase can add real logic and tests without touching the harness.
- `npx vitest run` project names for later plans to target: **`schema`**, **`rules`**, **`worker`**, **`web`** (e.g. `npx vitest run --project worker`).
- Both deploy targets are proven to bundle cross-workspace imports offline; no known blocker remains for Plan 11's live-deploy wiring beyond the two dashboard prerequisites above.
- `apps/worker/src/index.ts`'s "no top-level named-export constants" constraint should be kept in mind by Plan 07 when the real `partyserver`-based `RoomDO`/`fetch` handler replaces this stub.

---
*Phase: 01-room-transport-skeleton*
*Completed: 2026-09-02*

## Self-Check: PASSED
All 12 created files verified present on disk. All 4 commit hashes (8f80322, cb5d804, 83f7046, ad5d09f) verified in git log.
