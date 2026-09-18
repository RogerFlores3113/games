---
phase: 07-variant-support-rainbow-black
plan: 01
subsystem: rules-engine, adapter, worker
tags: [hanabi, legality, security-fix, rules-14]
dependency-graph:
  requires: []
  provides: [clue_color_not_nameable-reason, canClue-nameable-colour-guard]
  affects: [packages/rules, packages/schema, apps/worker]
tech-stack:
  added: []
  patterns:
    - "Closed-union threading: a new legality reason added simultaneously to AdapterError, ErrorDetailSchema and mapAdapterError's exhaustive never-typed switch, so a missed site is a compile error"
    - "Variant parametrization read only from VariantConfig.cluableColors, never a literal suit === \"rainbow\"/\"black\" branch"
key-files:
  created:
    - packages/rules/src/hanabi/nameable-colour.property.test.ts
  modified:
    - packages/rules/src/hanabi/legality.ts
    - packages/rules/src/hanabi/legality.test.ts
    - packages/rules/src/adapter.ts
    - packages/schema/src/messages.ts
    - packages/schema/src/messages.test.ts
    - apps/worker/src/room-state.ts
    - apps/worker/src/room-state.test.ts
    - packages/rules/src/hanabi/actions.ts
    - packages/rules/src/hanabi/actions.test.ts
decisions:
  - "Guard placed in canClue immediately before cardsTouchedByClue (after target-hand lookup), reading only config.cluableColors — matches 07-PATTERNS.md's proposed insertion point exactly"
  - "Guard ordering preserved: not_your_turn/game_over/no_clue_tokens/clue_target_invalid still win over clue_color_not_nameable, proven by an explicit regression case and respected by the property test (which skips the non-nameable probe once clueTokens hits 0)"
metrics:
  duration: ~35min
  completed: 2026-09-18
  tasks: 2
  files: 9
---

# Phase 07 Plan 01: canClue nameable-colour guard (RULES-14) Summary

Closed a live server-side cheating hole where a hand-crafted WebSocket frame could name "rainbow" (or, in base, "black"/"rainbow") as a colour clue and have it accepted, because `canClue` only checked whether the clue touched at least one card — and in Rainbow, a "rainbow" clue does touch the rainbow cards.

## What Was Built

**Task 1 — `canClue` nameable-colour guard, threaded through the closed-union chain:**
- `packages/rules/src/hanabi/legality.ts`: `canClue` now returns `{ legal: false, reason: "clue_color_not_nameable" }` when `clue.type === "color"` and `config.cluableColors` does not include `clue.value` — checked immediately before the touch check (`cardsTouchedByClue`), reading only `variantConfig(state.variant).cluableColors`, never a literal suit comparison.
- `packages/rules/src/adapter.ts`: `AdapterError` widened with `| "clue_color_not_nameable"`.
- `packages/schema/src/messages.ts`: `ErrorDetailSchema` widened with the byte-identical string.
- `apps/worker/src/room-state.ts`: `mapAdapterError`'s exhaustive switch gained the matching case; the `never`-typed default remains the compile-time safety net (no catch-all added).
- Regression tests: `legality.test.ts` sweeps all three variants and every suit outside `cluableColors`, including crafting a target hand that actually holds a card of the non-nameable suit (Rainbow: a rainbow card in the target's hand), proving the rejection is not an incidental `clue_touches_nothing`. Also proves guard ordering (wrong actor still gets `not_your_turn`) and the Black positive case ("black" against a black card stays legal).
- `messages.test.ts`'s member-list test updated from 9 to 10 members.

**Task 2 — adapter/worker regressions, doc fix, property test:**
- `actions.test.ts`: `applyHanabiAction` sweep across the three variants and every non-nameable suit, asserting `{ ok: false, error: "clue_color_not_nameable" }` with unchanged `clueTokens`/`history`.
- `room-state.test.ts`: `startedThreeSeatRoom` gained an optional `variant` parameter (defaulting to `"base"`, every existing call site unchanged) that calls `setVariant` before `startGame`; a new describe block proves a forged non-nameable colour clue frame is refused at the worker layer with `{ ok: false, reason: "bad_request", detail: "clue_color_not_nameable" }` and unchanged `clueTokens`, for rainbow/"rainbow", base/"black" and black/"rainbow".
- `packages/rules/src/hanabi/nameable-colour.property.test.ts` (new): a fast-check property, copying `termination.property.test.ts`'s driver shape, that at every turn of a randomly-driven game across all three variants attempts a forged colour clue drawn from all seven suits; asserts non-nameable colours are always rejected with `clue_color_not_nameable` (skipped only when `clueTokens` is 0, since `no_clue_tokens` legitimately wins per guard ordering) and nameable colours are never rejected with that reason; after each run, every `history` entry of clue kind with a colour value is confirmed nameable.
- `actions.ts`'s `isClueRequest` doc comment corrected (D-03): it no longer claims a non-nameable colour "touches zero cards and is rejected with `clue_touches_nothing`" (false in Rainbow); it now points at `canClue`'s dedicated nameable-colour check. Comment-only change — `git diff --stat` confirms no function-body lines changed.

## Deviations from Plan

None — plan executed exactly as written. The property test needed one added condition (skip the non-nameable probe when `state.clueTokens === 0`) to respect the plan's own stated guard ordering (`no_clue_tokens` outranks `clue_color_not_nameable`); this was implicit in the plan's Task 1 behavior spec and Task 2's property description did not explicitly call it out, so it is recorded here rather than as a Rule 1/2/3 deviation.

## Verification

- `npx vitest run --project rules` — 18 files, 182 tests passed
- `npx vitest run --project schema` — 6 files, 57 tests passed
- `npx vitest run --project worker` — 13 files, 224 tests passed
- `npx tsc -b` inside `packages/rules`, `packages/schema`, `apps/worker`, `apps/web` — all clean (see note below on the root `typecheck` script)
- `grep -c "clue_color_not_nameable" packages/rules/src/adapter.ts packages/schema/src/messages.ts apps/worker/src/room-state.ts packages/rules/src/hanabi/legality.ts` — 1, 1, 2, 1 (all ≥ required minimums)
- `grep -nE "=== \"rainbow\"|=== \"black\""` on `legality.ts` — no matches (no hardcoded suit branching)

### Note: root `npm run typecheck` (`tsc -b`)

The root `tsc -b` command fails with `TS5083: Cannot read file '/home/rflor/games/tsconfig.json'` — there is no root `tsconfig.json` in this repository (confirmed via `git log`: it has never existed in git history; only `tsconfig.base.json` and four per-package `tsconfig.json` files exist, with no root composite config referencing them). This is a pre-existing condition, unrelated to this plan's changes, and out of this plan's scope per the deviation rules' scope boundary (issues not caused by the current task's changes). Verification was performed instead by running `npx tsc -b` inside each of the four package directories individually, all clean. Logged to `deferred-items.md` in this phase's directory rather than fixed.

## Self-Check: PASSED

- FOUND: packages/rules/src/hanabi/legality.ts
- FOUND: packages/rules/src/hanabi/legality.test.ts
- FOUND: packages/rules/src/adapter.ts
- FOUND: packages/schema/src/messages.ts
- FOUND: packages/schema/src/messages.test.ts
- FOUND: apps/worker/src/room-state.ts
- FOUND: apps/worker/src/room-state.test.ts
- FOUND: packages/rules/src/hanabi/actions.ts
- FOUND: packages/rules/src/hanabi/actions.test.ts
- FOUND: packages/rules/src/hanabi/nameable-colour.property.test.ts
- FOUND commit f3d4f96 (Task 1)
- FOUND commit 3feaebc (Task 2)
