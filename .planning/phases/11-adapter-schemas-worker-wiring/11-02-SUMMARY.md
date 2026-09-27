---
phase: 11-adapter-schemas-worker-wiring
plan: 02
subsystem: schema
tags: [expedition, zod, wire-schema, subpath, COMM-03]
dependency-graph:
  requires:
    - "ExpeditionView type contract (packages/rules/src/expedition/adapter/view-types.ts, Plan 11-01)"
  provides:
    - "ExpeditionViewSchema, ExpeditionConfigSchema, EXPEDITION_GAME_ID (packages/schema/src/games/expedition.ts)"
    - "ExpeditionErrorCodeSchema (packages/schema/src/games/expedition-errors.ts)"
    - "@games/schema/games/expedition subpath (package.json exports, tsconfig.base.json paths, vitest.config.ts aliases in all four projects)"
  affects:
    - "Plan 11-06 (registers ExpeditionViewSchema/ExpeditionConfigSchema/mapExpeditionError in game-registration.ts; widens GameIdSchema/CreateRoomRequestSchema alongside the registry entry)"
tech-stack:
  added: []
  patterns:
    - "z.strictObject at every nesting level, declared independently (hanabi.ts's D-05/D-06 discipline, mirrored verbatim)"
    - "z.discriminatedUnion for structurally-unrepresentable variant branches (joker vs. standard identity, four objective kinds)"
key-files:
  created:
    - packages/schema/src/games/expedition-errors.ts
    - packages/schema/src/games/expedition.ts
    - packages/schema/src/games/expedition.test.ts
  modified:
    - packages/schema/src/games/subpath.test.ts
    - packages/schema/package.json
    - tsconfig.base.json
    - vitest.config.ts
decisions:
  - "Header-comment wording in expedition.ts/expedition-errors.ts avoids the literal tokens the plan's own acceptance greps scan for (`.omit(`, `@games/rules`) by describing the same constraint in different words, since hanabi.ts's identical phrasing trips the same grep at count 1 (verified) — this plan's acceptance criteria explicitly require 0 for expedition's own files, so the wording was adjusted rather than carried over verbatim from the analog"
metrics:
  duration: ~25min
  completed: 2026-09-27
  tasks: 2
  files: 6
---

# Phase 11 Plan 02: Expedition Wire Schemas & Subpath Wiring Summary

Wrote Expedition's Zod wire schemas (`ExpeditionViewSchema`, `ExpeditionErrorCodeSchema`, `ExpeditionConfigSchema`) as a strict, field-for-field mirror of Plan 11-01's `ExpeditionView` contract and the 24-member `RunError` union, and wired the `@games/schema/games/expedition` subpath through the package exports map, `tsconfig.base.json`, and all four `vitest.config.ts` projects.

## What Was Built

**Task 1 — Error enum, view schema, config schema, subpath wiring**

`packages/schema/src/games/expedition-errors.ts`: `ExpeditionErrorCodeSchema = z.enum([...])` listing all 24 `RunError` member names (`CampError`'s 7 plus `RunError`'s 17 additional members) in the exact order given in the plan's `<interfaces>` block, imports only `zod`.

`packages/schema/src/games/expedition.ts`: 23 independently-declared `z.strictObject` schemas building up to `ExpeditionViewSchema`, mirroring `ExpeditionView` key-for-key. Notable structural choices:
- `CardIdentityViewSchema` is `z.discriminatedUnion("kind", [standard, joker])` so a joker with a `suit` key or a standard card with a `joker` key is structurally rejected, not merely disallowed by convention.
- `ObjectiveViewSchema` is a 4-member discriminated union on `kind`, each branch declaring exactly its own keys (`order`/`target` only on `ordered`/`win-card`, `n` only on `exactly-n`).
- `HandSizeViewSchema` is `{seatId, size}` only — no `cards` key exists anywhere in the schema for another seat's hand.
- `gearWindow` is `z.enum(["pre-deal", "objective-pick", "between-tricks"]).nullable()` — `"passive"` is deliberately excluded from the wire vocabulary.
- `ExpeditionConfigSchema = z.null()` (MGR-03: no settings in v2.0).
- `EXPEDITION_GAME_ID = "expedition" as const`.

Subpath wiring added in three places, mirroring Hanabi's existing entries exactly: `packages/schema/package.json`'s `exports` map, `tsconfig.base.json`'s `compilerOptions.paths`, and all four `vitest.config.ts` projects' `resolve.alias` maps (schema, rules, worker, web), each placed immediately after the Hanabi subpath key and before the generic `@games/schema` key (prefix-matching order is load-bearing).

**Task 2 — Schema conformance and subpath tests**

`packages/schema/src/games/expedition.test.ts` (50 tests): a full fireside fixture (`attempt: null`, populated `yourDraftOffer`, a `draftPending: true` seat) and a full mid-camp fixture (attempt with camp; one standard + one joker card in `yourHand`; 3-seat `handSizes`; one objective of each of the four kinds; one completed trick and one current-trick play; one reveal; one public and one private log entry; one gear use; one effect; `yourGear` with both a `reason` string and a `reason: null` entry) both parse successfully. Fourteen `it.each` rejection cases cover every forbidden-key and out-of-domain scenario listed in the plan's `<behavior>` block (`seed`, `objectiveDeck`, `cards` on a hand-size entry, an extra key on a hand card, `audience` on a log entry, `draftOffer` on a seat, a joker carrying `suit`, ranks 15/1, `playerCount` 6, `gearWindow: "passive"`, a `win-card` objective missing `target`, a `no-tricks` objective carrying `target`, `campNumber` 7, `yourCapacity` -1). `ExpeditionErrorCodeSchema` is proven to accept all 24 codes, reject `"x"`/`""`/`"view_unavailable"`, and have exactly 24 options. `ExpeditionConfigSchema` accepts `null` and rejects `undefined`/`{}`/`"base"`. `EXPEDITION_GAME_ID` equals `"expedition"`.

`packages/schema/src/games/subpath.test.ts` extended with an expedition bare-specifier resolution test (imports `EXPEDITION_GAME_ID`/`ExpeditionViewSchema` from `@games/schema/games/expedition`, asserts `ExpeditionViewSchema.safeParse({}).success === false`) and the barrel-purity assertion widened to also assert `index.ts` never contains `"Expedition"`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded two header comments to satisfy this plan's own acceptance-criteria greps**
- **Found during:** Task 1 verification (running the plan's acceptance-criteria grep commands)
- **Issue:** The plan's acceptance criteria require `grep -cE "\.omit\(|\.extend\(|\.partial\(|\.merge\(" packages/schema/src/games/expedition.ts` and `grep -c "@games/rules" packages/schema/src/games/expedition-errors.ts` to print 0, but the header comments (closely modeled on `hanabi.ts`/`hanabi-errors.ts`'s own wording, which contain the same literal tokens in prose) tripped both greps at count 1 each. `hanabi.ts`/`hanabi-errors.ts` themselves also trip the equivalent greps at count 1 — this plan's acceptance criteria are stricter than the analog files satisfy.
- **Fix:** Reworded both comments to state the same constraint without using the literal tokens (`.omit()` etc. and `@games/rules`) verbatim in prose.
- **Files modified:** `packages/schema/src/games/expedition.ts`, `packages/schema/src/games/expedition-errors.ts`
- **Commit:** `396bacc`

## Known Stubs

None. Both schemas are fully implemented and exercised by the tests in this plan; no field is a placeholder.

## Threat Flags

None. This plan's `<threat_model>` register (T-11-09, T-11-11, T-11-10) maps directly to `ExpeditionViewSchema`'s strict-at-every-level construction, `ExpeditionErrorCodeSchema`'s closed 24-member enum, and `ExpeditionConfigSchema`'s `z.null()`, all proven by this plan's own tests. No new, unlisted surface was introduced — `packages/schema/src/room.ts`, `create-room.ts`, and `index.ts` were deliberately left untouched (Plan 11-06's job, per the plan's `<objective>`).

## Self-Check: PASSED

- `packages/schema/src/games/expedition-errors.ts` — FOUND
- `packages/schema/src/games/expedition.ts` — FOUND
- `packages/schema/src/games/expedition.test.ts` — FOUND
- `packages/schema/src/games/subpath.test.ts` — FOUND (modified)
- `packages/schema/package.json` — FOUND (modified, `./games/expedition` export present)
- `tsconfig.base.json` — FOUND (modified, `@games/schema/games/expedition` path present)
- `vitest.config.ts` — FOUND (modified, alias present in all 4 projects)
- Commit `396bacc` (Task 1: error enum, view schema, config schema, subpath wiring) — FOUND in `git log`
- Commit `95eb819` (Task 2: schema conformance and subpath tests) — FOUND in `git log`
- `npx vitest run --project schema` — 148 tests passed (8 files)
- `npm run typecheck` — exits 0
