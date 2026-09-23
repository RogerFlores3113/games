# Deferred Items — Phase 04

Pre-existing, out-of-scope issues discovered during plan execution. Not fixed
per the executor's scope boundary (only issues directly caused by the
current task's changes are auto-fixed).

## 04-09: root `tsconfig.json` missing, breaking `npm run typecheck` (`tsc -b`)

- **Found during:** 04-09 Task 2 verification
- **Symptom:** `npx tsc -b` (and `npm run typecheck`) fails with
  `error TS5083: Cannot read file '/home/rflor/games/tsconfig.json'.`
  because no composite root `tsconfig.json` with `references` exists at the
  repo root — only `tsconfig.base.json` plus each workspace's own
  `tsconfig.json`.
- **Not caused by this plan:** confirmed via `git log --oneline --all -- tsconfig.json`
  (zero history) — the file has never existed in this repo, so this is a
  pre-existing gap, not a regression from 04-09's changes.
- **Workaround used for this plan's verification:** ran
  `npx tsc -b apps/web packages/rules packages/schema apps/worker` (explicit
  per-project build) instead of the bare `npx tsc -b` / `npm run typecheck`,
  which type-checked clean.
- **Suggested fix (future plan):** add a root `tsconfig.json` with
  `"files": []` and a `references` array pointing at each of
  `apps/web`, `apps/worker`, `packages/rules`, `packages/schema` (each of
  those `tsconfig.json`s would also need `"composite": true` added), so that
  `npm run typecheck` works as written.
