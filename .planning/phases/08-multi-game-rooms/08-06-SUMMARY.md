---
phase: 08-multi-game-rooms
plan: 06
subsystem: api
tags: [zod, room-envelope, gameId, wire-protocol, worker, lobby, cutover]

# Dependency graph
requires:
  - phase: 08-multi-game-rooms
    provides: "08-04 (RoomView carries gameId/config/limits), 08-05 (RoomState carries gameId/config/gameLocked; worker-side setConfig already registry-validated)"
provides:
  - "SetConfigMessageSchema (D-04): the wire's set_variant { variant } client message is gone, replaced by set_config { config: unknown } — validated downstream by the room's own game configSchema, never by this schema package"
  - "JoinMessageSchema.gameId (D-01): an optional GameId on join, honoured ONLY by joinRoom's new-join branch while the room is unlocked — every reclaim (seatToken or joinId match) and every join once gameLocked ignores it entirely"
  - "room-do.ts: set_config wire dispatch calls setConfig(room, actorSeatId, msg.config, now); #handleJoin threads gameId into joinRoom's input"
  - "D-15 proof: an old client's set_variant frame fails ClientMessageSchema and is refused bad_request without disturbing the Durable Object — proven both at the schema layer (messages.test.ts) and against a real wrangler dev DO (room-do.test.ts, a following set_config on the same socket still succeeds)"
affects: [08-07, 08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "joinRoom's new-join branch resolves a differing input.gameId only while !state.gameLocked, adopting the resolved registry entry's defaultConfig/adapter.id atomically with gameId — an unresolvable gameId returns bad_request with state completely unchanged (no partial write), mirroring the existing fail-closed Zod-boundary idiom used everywhere else in this codebase"
    - "The reclaim branches (seatToken match, joinId match) structurally never read input.gameId at all — not merely 'ignore its value' but never touch the field — matching D-01's requirement that a joiner can never assert or change a locked room's game"

key-files:
  created: []
  modified:
    - packages/schema/src/messages.ts
    - packages/schema/src/messages.test.ts
    - apps/worker/src/room-state.ts
    - apps/worker/src/room-state.test.ts
    - apps/worker/src/room-do.ts
    - apps/worker/src/room-do.test.ts
    - apps/web/components/Lobby.tsx
    - apps/web/app/room/[code]/RoomClient.tsx
    - apps/web/app/page.tsx
    - apps/web/lib/pending-variant.ts

key-decisions:
  - "joinRoom threads gameId resolution through a local `entry` variable that starts as roomGame(state, games) and is only reassigned when a differing, unlocked-room gameId resolves successfully — the seat-limit check (`entry.limits.max`) and the state write both read from this single resolved entry, so there is no window where the seat-count gate checks one game's limits while the write adopts another's config"
  - "apps/web/app/page.tsx and apps/web/lib/pending-variant.ts (not in the plan's files_modified list) had doc-comment prose referencing the old `set_variant` message name; updated in the same commit as a Rule 3 blocking-issue fix since the plan's own acceptance-criteria grep (`set_variant|onSetVariant` across all of apps/web) would otherwise fail on stale comment text, not just code"

patterns-established: []

requirements-completed: []

# Metrics
duration: 45min
completed: 2026-09-23
---

# Phase 8 Plan 06: set_config Replaces set_variant; First Join Locks the Room's Game Summary

**The client-protocol cutover: `set_variant { variant }` becomes `set_config { config: unknown }` on the wire, `join` gains an optional `gameId` honoured only on a room's very first (unlocked) join, and an old cached client's `set_variant` frame now fails closed with `bad_request` while the Durable Object keeps serving every other connection — both web senders (the variant picker, the pending-config apply-once effect) updated in the same commit.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2 (landed as one commit per the plan's explicit instruction — Task 1's schema/worker change alone leaves `apps/web` sending a now-rejected `set_variant` frame until Task 2's web senders land)
- **Files modified:** 10

## Accomplishments

- `packages/schema/src/messages.ts`: `JoinMessageSchema` gains `gameId: GameIdSchema.optional()` with a D-01 doc comment matching the file's existing `seatToken`-doc-comment style; `SetVariantMessageSchema` is replaced by `SetConfigMessageSchema` (`{ type: "set_config", config: z.unknown() }`, validated downstream by the room's registry `configSchema`, same "deliberately unknown here" convention as `game_action`'s `request` field). The now-unused `VariantSchema` import was removed.
- `apps/worker/src/room-state.ts`'s `joinRoom`: the new-join branch resolves `input.gameId` against the registry ONLY while `!state.gameLocked` and the id differs from `state.gameId` — an unresolvable id returns `{ ok: false, reason: "bad_request" }` with the input state completely untouched; a resolved id adopts that entry's `gameId`/`defaultConfig`/`adapter.id` atomically with the seat-limit check (`entry.limits.max`), so the gate and the write always agree on which game's limits applied. The seatToken/joinId reclaim branches at the top of the function structurally never reference `input.gameId`.
- `apps/worker/src/room-do.ts`: the `set_variant` dispatch branch is now `set_config`, calling `setConfig(room, actorSeatId, msg.config, now)`; `#handleJoin` gained a `gameId: GameId | undefined` parameter threaded straight into `joinRoom`'s input from `msg.gameId`.
- `apps/web/components/Lobby.tsx`: prop renamed `onSetVariant(variant: Variant)` -> `onSetConfig(config: unknown)`; the segmented picker's markup is byte-identical, only its `onChange` handler's call target changed.
- `apps/web/app/room/[code]/RoomClient.tsx`: the Lobby wiring and the pending-config apply-once effect both now send `{ type: "set_config", config }`; the now-unused `Variant` type import was removed.
- **D-15 proof, two layers:** `packages/schema/src/messages.test.ts` proves `parseClientMessage('{"type":"set_variant","variant":"rainbow"}')` returns `{ ok: false, reason: "bad_request" }` at the schema layer. `apps/worker/src/room-do.test.ts` proves it against a real `wrangler dev` Durable Object: an old-shaped `set_variant` frame produces an `error` frame with `code: "bad_request"`, and a FOLLOWING `set_config` on the SAME socket still succeeds and produces a `state` frame — the DO never tore down or stopped serving.
- **D-01 proof:** `apps/worker/src/room-state.test.ts` gained a new describe block proving: a first join carrying `gameId: "hanabi"` sets `gameLocked: true`; a second join carrying a (cast, unresolvable) `gameId` once the room is locked leaves `gameId`/`config` unchanged; a reclaim by `seatToken` carrying a `gameId` changes nothing; a first join whose `gameId` is not in the registry returns `bad_request` and the room stays unlocked (fresh room, `gameLocked` never flips).
- Full gate green: `npm test` (1085/1085), `npm run typecheck` (root `tsc -b`) clean, and the four targeted Playwright specs (`create-room`, `start-game`, `variant-rainbow`, `variant-black`, 21/21) green in a single run — no flake observed, no deploy performed (D-14).

## Task Commits

Both tasks landed as ONE commit per the plan's explicit instruction (Task 1 alone leaves `apps/web` sending a wire frame the new schema rejects until Task 2's senders land):

1. **Task 1 (schema/worker protocol) + Task 2 (web senders, full gate): set_config replaces set_variant; first join locks the room's game (D-01, D-04, D-15)** — `b1b568b` (feat)

## Files Created/Modified

- `packages/schema/src/messages.ts` — `SetConfigMessageSchema` replaces `SetVariantMessageSchema`; `JoinMessageSchema.gameId` optional field with D-01 doc comment
- `packages/schema/src/messages.test.ts` — `set_config` acceptance tests (string config, object config, extra-key rejection), join-with/without-`gameId` acceptance, unregistered-`gameId` rejection, D-15 `parseClientMessage` proof
- `apps/worker/src/room-state.ts` — `JoinInput.gameId?: GameId`; `joinRoom`'s new-join branch resolves it only while unlocked
- `apps/worker/src/room-state.test.ts` — new "D-01: the first join's gameId locks the room's game" describe block (4 tests)
- `apps/worker/src/room-do.ts` — `set_config` dispatch; `#handleJoin` gains and threads `gameId`
- `apps/worker/src/room-do.test.ts` — every `set_variant` send fixture renamed to `set_config`; new D-15 old-client test proving the DO keeps serving
- `apps/web/components/Lobby.tsx` — `onSetVariant` -> `onSetConfig` prop rename, picker markup unchanged
- `apps/web/app/room/[code]/RoomClient.tsx` — both senders emit `set_config`; unused `Variant` import removed
- `apps/web/app/page.tsx` — stale `set_variant` doc-comment reference updated (Rule 3, found via the plan's own acceptance grep)
- `apps/web/lib/pending-variant.ts` — same stale doc-comment fix

## Decisions Made

- `joinRoom`'s gameId resolution and its seat-limit check share one resolved `entry` local, so there is no code path where the "full" gate is evaluated against the room's OLD game's limits while the state write adopts a NEW game's config — both read the same resolved registry entry within the same function call.
- The two out-of-plan doc-comment fixes (`page.tsx`, `pending-variant.ts`) were applied as Rule 3 blocking-issue fixes, not deferred: the plan's own acceptance criteria explicitly grep all of `apps/web` for `set_variant`/`onSetVariant`, and stale prose would fail that gate even though it's comment-only, not code.

## Deviations from Plan

**1. [Rule 3 — blocking issue] Stale `set_variant` doc-comment references outside the plan's file list**
- **Found during:** Task 2's acceptance-criteria grep (`grep -rn "set_variant|onSetVariant" apps/web`)
- **Issue:** `apps/web/app/page.tsx` and `apps/web/lib/pending-variant.ts` (neither in the plan's `files_modified` list) had doc-comment prose naming the old wire message.
- **Fix:** Updated both comments to say `set_config` (and, for `pending-variant.ts`, added a `(D-04)` reference matching the file's existing decision-citation style).
- **Files modified:** `apps/web/app/page.tsx`, `apps/web/lib/pending-variant.ts`
- **Commit:** `b1b568b`

No deviations affected scope, architecture, or requirement completion beyond this one comment-only fix.

## Issues Encountered

One test-only TypeScript error surfaced by `npm run typecheck` after adding the new D-15 room-do.test.ts case: casting an inline object literal directly to `{ code: string }` is not a valid narrowing of the file's own `Parsed` union type. Fixed by following the file's own established pattern at two other call sites (`(await c1.waitFor(...)) as Parsed & { code: string }`) rather than a fresh cast shape. No other issues; `npm test`/`npm run typecheck` stayed green throughout otherwise.

## User Setup Required

None — no external service configuration required. No deployment was performed (D-14: the executor does not deploy).

## Next Phase Readiness

- The wire protocol and worker-side D-01/D-04/D-15 mechanisms this plan built are already final — plan 08-07's test-only toy game (D-10) can register a second entry in a test-only registry and immediately exercise `joinRoom`'s `input.gameId` resolution path end to end, since that path resolves against the injectable `games` parameter, not a hardcoded Hanabi lookup.
- **`MGR-01`** ("host chooses the game... proven with Hanabi plus a test-only second game") is left **Pending** in `REQUIREMENTS.md`: this plan proves the wire/worker half of "a join can select a game" (D-01's locking mechanism, proven with a synthetic unresolvable gameId), but there is still no landing-page game picker sending a real second `gameId`, and no test-only second game registered anywhere yet — that is explicitly plan 08-07's deliverable (D-10) and a later plan's landing-page work (D-02).
- **`MGR-03`** ("each game brings its own settings; host sees only current game's") stays **Pending**: this plan's `set_config` rename is the wire-shape half only. The web-side "host sees only current game's settings fieldset" (D-12, replacing `page.tsx`'s `isHanabi`-gated block with a per-game lookup) is untouched here — same scope boundary 08-05's SUMMARY already documented for this requirement.
- **`MGR-04`** ("Hanabi unchanged, full suites pass") was already marked Complete in `REQUIREMENTS.md` before this plan (by 08-05); this plan's own verification ran the full unit suite (1085/1085) plus 4 targeted Playwright specs (21/21) per its own `<verification>` section, not the complete e2e suite — consistent with how prior plans in this phase have scoped their own gates. No REQUIREMENTS.md change made for MGR-04 by this plan.
- No blockers for plan 08-07.

---
*Phase: 08-multi-game-rooms*
*Completed: 2026-09-23*
