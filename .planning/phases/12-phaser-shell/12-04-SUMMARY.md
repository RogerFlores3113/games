---
phase: 12-phaser-shell
plan: 04
subsystem: infra
tags: [phaser, npm, package-legitimacy, source-scan-guard, build-guard, vitest, nextjs]

# Dependency graph
requires:
  - phase: 12-phaser-shell (plan 01)
    provides: Expedition room-creation form-config fix (D-17/WR-06), unblocking Expedition room creation for later plans
provides:
  - phaser@3.90.0 installed pinned in apps/web (owner-approved at a blocking human checkpoint)
  - apps/web/lib/phaser-import-confinement.test.ts — SCENE-01 source-scan guard confining every phaser import to components/expedition/phaser/**
  - apps/web/scripts/check-expedition-build.mjs — SCENE-12 post-build guard failing on a leaked __expeditionTest bridge, wired as `npm run check:expedition-build` in apps/web
affects: [12-phaser-shell later plans that add apps/web/components/expedition/phaser/**]

# Tech tracking
tech-stack:
  added: ["phaser@3.90.0 (exact pin, apps/web dependency)"]
  patterns:
    - "Source-scan confinement test (stripComments + listFiles, copied from game-agnostic-source.test.ts) reused for a new import-confinement contract"
    - "Post-build .next/static grep guard as a standalone Node ESM script with no dependencies, wired via a package.json script"

key-files:
  created:
    - apps/web/lib/phaser-import-confinement.test.ts
    - apps/web/scripts/check-expedition-build.mjs
  modified:
    - apps/web/package.json
    - package-lock.json

key-decisions:
  - "Owner approved phaser@3.90.0 (not the 4.x latest) at the blocking-human package-legitimacy checkpoint, matching RESEARCH's A1 recommendation"
  - "PHASER_SIGNATURE for the build-check's Phaser-presence assertion is the runtime string literal 'https://phaser.io/' from Phaser's Config.js default gameURL, chosen because it is a real runtime string concatenation (survives minification) rather than a doc comment"
  - "phaser-import-confinement.test.ts excludes its own file path from the scan set, since the test's own regex source and positive-control assertion strings necessarily contain the literal pattern it's asserting against"
  - "No @types/phaser added — Phaser 3.90.0 ships its own types/phaser.d.ts"

patterns-established:
  - "Import-confinement guard: comment-stripped source scan for a literal import specifier, plus a second pass resolving static (non-dynamic, non-type) import specifiers against a same-directory allowlist set, with dynamic import() as the sanctioned escape hatch"

requirements-completed: [SCENE-01, SCENE-12]

# Metrics
duration: 25min
completed: 2026-09-27
---

# Phase 12 Plan 04: Phaser Install Gate and Structural Guards Summary

**phaser@3.90.0 installed pinned after an owner-approved package-legitimacy checkpoint, with a source-scan confinement test (SCENE-01) and a post-build __expeditionTest leak guard (SCENE-12) in place before any Phaser scene code exists**

## Performance

- **Duration:** ~25 min (across two agent sessions, split by the blocking checkpoint)
- **Tasks:** 3 (2 completed in the prior session: registry evidence + owner checkpoint; 1 completed this session: install + guards)
- **Files modified:** 4 (apps/web/package.json, package-lock.json, apps/web/lib/phaser-import-confinement.test.ts, apps/web/scripts/check-expedition-build.mjs)

## Accomplishments

- Registry evidence for `phaser@3.90.0` (repository, licence, maintainers, no install-lifecycle scripts, publish history) gathered before any install, per RESEARCH's Package Legitimacy Audit flagging it `[ASSUMED]`
- Owner reviewed the evidence at the `checkpoint:human-verify` gate (`gate="blocking-human"`, never auto-approvable) and replied **"approved 3.90.0"**
- `phaser@3.90.0` installed with `--save-exact` into `apps/web` — `apps/web/package.json` lists `"phaser": "3.90.0"` with no caret/tilde
- `apps/web/lib/phaser-import-confinement.test.ts` added: a 3-assertion source-scan guard proving no file outside `components/expedition/phaser/` imports phaser directly or transitively via a static import (dynamic `import()` remains the sanctioned `next/dynamic` boundary)
- `apps/web/scripts/check-expedition-build.mjs` added: a dependency-free Node ESM script that fails if `__expeditionTest` appears anywhere in `.next/static`, and (unless `--skip-phaser-presence` is passed) fails if no Phaser signature string is found; wired as `check:expedition-build` in `apps/web/package.json`

## Task Commits

1. **Task 1: Collect registry evidence for phaser before any install** — no commit (read-only evidence gathering; prior session)
2. **Task 2: Owner verifies phaser package legitimacy and version (checkpoint)** — no commit (checkpoint; prior session; owner replied "approved 3.90.0")
3. **Task 3: Install phaser pinned, add the confinement test and the production build check** — `49e0757` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `apps/web/package.json` — adds `"phaser": "3.90.0"` (exact pin) to dependencies and a `check:expedition-build` script
- `package-lock.json` — lockfile entries for phaser's transitive dependency tree (only change from the phaser install)
- `apps/web/lib/phaser-import-confinement.test.ts` — SCENE-01 source-scan guard (3 assertions: no direct phaser import outside the phaser dir; no static import of a phaser-importing file outside the phaser dir; positive control proving the regex distinguishes static from dynamic references)
- `apps/web/scripts/check-expedition-build.mjs` — SCENE-12 post-build guard (fails on `__expeditionTest` presence; optionally asserts Phaser-signature presence)

## Decisions Made

- **Owner-approved version:** `phaser@3.90.0`, matching RESEARCH's A1 recommendation over the 4.x latest (`4.2.1`) — recorded verbatim from the owner's checkpoint reply, "approved 3.90.0"
- **Registry evidence recap (from Task 1, prior session):** `phaser@3.90.0` — repository `github.com/phaserjs/phaser`, licence MIT, maintainer `photonstorm`, no `preinstall`/`install`/`postinstall` scripts, package created 2014, last modified 2026-07-09; `slopcheck` was not available on PATH so it was skipped, noted explicitly rather than silently omitted
- **Types resolution:** Phaser 3.90.0's `package.json` declares `"types": "./types/phaser.d.ts"` — Phaser ships its own type declarations; no `@types/phaser` package was added (there is none conflicting to add — this is the correct, only path)
- **Phaser build signature:** chose the runtime string literal `'https://phaser.io/'` (from `node_modules/phaser/src/core/Config.js`'s default `gameURL` value, `'https://phaser.io/' + CONST.LOG_VERSION`) as `PHASER_SIGNATURE` in the build-check script, since it is a real string concatenation at runtime — not a JSDoc comment or dead code — and therefore survives minification/tree-shaking intact while a comment would not
- **Self-exclusion in the confinement test:** `phaser-import-confinement.test.ts` excludes its own file path from `NON_PHASER_FILES` before scanning, because the test file legitimately contains the literal pattern `["']phaser["']` inside its own regex source and its positive-control assertion strings (`'import Phaser from "phaser";'`) — without this exclusion the test would fail against itself on a false positive, not a real violation

## Deviations from Plan

None — plan executed exactly as written. One implementation-detail fix found and corrected during verification (documented below), scoped entirely within Task 3's own new file:

### Auto-fixed Issues

**1. [Rule 1 - Bug] Confinement test's own source tripped its own assertion**
- **Found during:** Task 3 verification (`npx vitest run --project web phaser-import-confinement`)
- **Issue:** The initial version of `phaser-import-confinement.test.ts` scanned `apps/web/lib/**` including itself; the test file's own regex source literal and positive-control example strings (`'import Phaser from "phaser";'`) matched `PHASER_IMPORT_RE`, failing assertion 1 against itself rather than any real violation
- **Fix:** Added a `SELF_PATH` constant (`fileURLToPath(import.meta.url)`) and excluded it from `NON_PHASER_FILES`
- **Files modified:** `apps/web/lib/phaser-import-confinement.test.ts` (same file, pre-commit — no separate commit)
- **Verification:** `npx vitest run --project web phaser-import-confinement game-agnostic-source` — 2 files, 7 tests, all passing
- **Committed in:** `49e0757` (part of Task 3's single commit; the fix landed before the commit, not as a follow-up)

---

**Total deviations:** 1 auto-fixed (1 bug, self-contained to the new test file, fixed before commit)
**Impact on plan:** No scope creep — the fix only corrected the new guard's own self-scan blind spot; the guard's intended behavior (catching real violations in other files) was unaffected and is proven by the 3 passing assertions.

## Issues Encountered

None beyond the self-scan fix documented above.

## Verification Results

- `npx vitest run --project web phaser-import-confinement game-agnostic-source` — 2 files, 7 tests, all passing
- `npm run build:web` — production build succeeds (Next.js 16.3.4 / Turbopack)
- `node apps/web/scripts/check-expedition-build.mjs --skip-phaser-presence` — exit 0, `__expeditionTest` absent from `.next/static`
- `npm run typecheck` (`tsc -b`) — exit 0
- `grep -c "\"phaser\": \"3\\.\|\"phaser\": \"4\\." apps/web/package.json` → `1`; `grep -c "\"phaser\": \"[\^~]" apps/web/package.json` → `0`
- `grep -c "__expeditionTest" apps/web/scripts/check-expedition-build.mjs` → `2` (comment reference + the marker constant)

## User Setup Required

None — no external service configuration required. The only gate was the in-workflow package-legitimacy checkpoint, which the owner already resolved.

## Next Phase Readiness

- `phaser` is available to later Phase 12 plans as an owner-approved, exactly-pinned dependency
- The confinement test (`phaser-import-confinement.test.ts`) will fail the moment a future plan imports phaser outside `apps/web/components/expedition/phaser/**`, catching Pitfall 4 regressions immediately as new files are added
- The build-check script currently must be run with `--skip-phaser-presence` since no Phaser scene code exists yet; a future plan wiring the actual `next/dynamic` Phaser mount should drop that flag from its own CI/verification step once `apps/web/components/expedition/phaser/**` exists and is reachable from a real route
- No blockers for the next plan in this phase

---
*Phase: 12-phaser-shell*
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: apps/web/lib/phaser-import-confinement.test.ts
- FOUND: apps/web/scripts/check-expedition-build.mjs
- FOUND commit: 49e0757
- `apps/web/package.json` contains `"phaser": "3.90.0"` (exact pin)
