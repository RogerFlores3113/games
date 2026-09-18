# Phase 7 — Deferred Items

## Root `npm run typecheck` (`tsc -b`) has no root `tsconfig.json`

Discovered during 07-01 execution (not caused by this plan's changes — confirmed
via `git log -- tsconfig.json`, which shows the file has never existed in this
repo's git history). Only `tsconfig.base.json` and four per-package
`tsconfig.json` files exist (`apps/web`, `apps/worker`, `packages/schema`,
`packages/rules`), with no root composite config referencing them via
`references`. Running `npm run typecheck` (`tsc -b` at the repo root) fails
immediately with `TS5083: Cannot read file '/home/rflor/games/tsconfig.json'`.

Out of scope for 07-01 per the deviation rules' scope boundary (pre-existing,
unrelated to this task's files). Verified instead by running `npx tsc -b`
inside each of the four package directories individually — all clean as of
07-01.

Recommendation: a future plan should add a root `tsconfig.json` with
`references` to the four package tsconfigs so `npm run typecheck` works as
documented in 07-VALIDATION.md's "Full suite command".
