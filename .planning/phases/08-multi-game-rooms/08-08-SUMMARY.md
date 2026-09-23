---
phase: 08-multi-game-rooms
plan: 08
subsystem: web
tags: [gameId, registry, lobby, pending-config, room-client, source-scan]

# Dependency graph
requires:
  - phase: 08-multi-game-rooms
    provides: "08-04 (RoomView carries gameId/config/limits), 08-05 (worker-side registry dispatch), 08-06 (set_config wire message, join's gameId honoured only on first join)"
provides:
  - "apps/web/components/game-ui.tsx: BOARD_COMPONENTS (Record<GameId, ...>, compile-time exhaustive) and LOBBY_SETTINGS (Partial<Record<GameId, ...>>) — the one web module permitted to name a specific game's UI"
  - "apps/web/lib/pending-room.ts (replaces pending-variant.ts): pending game + pending config localStorage bridge (D-02); readPendingGame rides the join frame as gameId (D-01)"
  - "Lobby.tsx and RoomClient.tsx now dispatch on view.gameId through game-ui.tsx's maps — no isHanabi/gameId conditional remains in either file"
affects: [08-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BOARD_COMPONENTS uses Record (not Partial) so a future GameId with no board is a compile error; LOBBY_SETTINGS uses Partial since a game legitimately may have no in-lobby settings (the D-10 toy game, Expedition today)"
    - "HanabiBoard's typed onAction (HanabiActionRequest) is bridged to game-ui.tsx's generic BoardProps.onAction(request: unknown) via an explicit `as unknown as ComponentType<BoardProps>` cast at the single registration site, mirroring the toy-game adapter's own documented escape-hatch cast pattern from 08-07"

key-files:
  created:
    - apps/web/components/game-ui.tsx
    - apps/web/components/hanabi/HanabiLobbySettings.tsx
    - apps/web/lib/pending-room.ts
    - apps/web/lib/pending-room.test.ts
    - apps/web/lib/lobby-render.test.ts
    - apps/web/lib/game-agnostic-source.test.ts
  modified:
    - apps/web/lib/room-socket.ts
    - apps/web/app/page.tsx
    - apps/web/components/Lobby.tsx
    - apps/web/app/room/[code]/RoomClient.tsx
  deleted:
    - apps/web/lib/pending-variant.ts
    - apps/web/lib/pending-variant.test.ts

key-decisions:
  - "Both tasks landed as ONE commit (deviation from the plan's per-task commit note), mirroring 08-06's precedent: Task 1 alone leaves RoomClient.tsx importing the now-deleted pending-variant module, so npm run typecheck fails until Task 2's game-ui.tsx/RoomClient.tsx rewiring lands in the same commit"
  - "HanabiLobbySettings' props intentionally omit a reconnecting flag (matching the plan's exact LobbySettingsProps interface), even though the pre-existing variant picker disabled its radios while reconnecting — safe because RoomClient.tsx's send() chokepoint already no-ops every dispatch while status === reconnecting, so this is a UI-only disabled-affordance difference, not a functional regression"

patterns-established: []

requirements-completed: []

# Metrics
duration: 40min
completed: 2026-09-23
---

# Phase 8 Plan 08: gameId-Keyed Board and Lobby Settings; Pending Game Rides the First Join

**`apps/web/components/game-ui.tsx` becomes the single module permitted to name a specific game's UI — `RoomClient.tsx` picks its board and `Lobby.tsx` picks its settings fieldset from `GameId`-keyed maps instead of an `isHanabi` conditional — while the landing page's chosen game now travels via `localStorage` onto the first `join` frame's optional `gameId` field, generalizing the existing pending-variant pattern to carry both the game and its config.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 2 (landed as one commit — Task 1 alone breaks `npm run typecheck` since `RoomClient.tsx` imports the deleted `pending-variant` module until Task 2's rewiring lands)
- **Files modified:** 10 (4 new source, 2 new test, 4 modified; 2 deleted via `git mv`)

## Accomplishments

- `apps/web/lib/pending-room.ts` (git-mv'd from `pending-variant.ts`, history preserved): keeps the SSR-safe `getLocalStorage()` helper and try/catch-everywhere discipline verbatim, and adds `readPendingGame`/`writePendingGame`/`clearPendingGame` (validated with `GameIdSchema.safeParse` on read, D-02) alongside the generalized `readPendingConfig`/`writePendingConfig`/`clearPendingConfig`/`configToApply` (JSON-serialized, opaque — the client never validates a config shape; the server's `set_config` handler is the fail-closed authority, D-04).
- `apps/web/lib/room-socket.ts`'s `onOpen` join frame now sends `gameId: readPendingGame(code)` alongside `seatToken`/`joinId`; `JSON.stringify` drops the field when `undefined`, so a joiner or a reconnecting client without a pending game sends the same shape as before.
- `apps/web/app/page.tsx`: swapped the import to `pending-room`, narrows the picker's `game` state through `GameIdSchema.safeParse` before calling `writePendingGame`, and calls `writePendingConfig` in place of the deleted `writePendingVariant` — deliberately minimal per the plan's note that 08-09 rewrites this file's picker/hydration behavior.
- `apps/web/components/game-ui.tsx` (new): `BOARD_COMPONENTS: Readonly<Record<GameId, ComponentType<BoardProps>>>` (currently `{ hanabi: HanabiBoard }`) and `LOBBY_SETTINGS: Readonly<Partial<Record<GameId, ComponentType<LobbySettingsProps>>>>` (currently `{ hanabi: HanabiLobbySettings }`) — a header comment states this is the only web module allowed to name a game's components, matching the worker-side `game-registration.ts` invariant.
- `apps/web/components/hanabi/HanabiLobbySettings.tsx` (new): the segmented Base/Rainbow/Black variant picker moved byte-for-byte out of `Lobby.tsx`, reading its selected value from `VariantSchema.safeParse(config)`.
- `apps/web/components/Lobby.tsx`: the host-only settings section is now `const Settings = LOBBY_SETTINGS[view.gameId]`, rendered inside the same divider+section wrapper only when present — Hanabi's markup is byte-identical to before; a game with no registered entry renders no settings section at all. The `MIN_PLAYERS`/`MAX_PLAYERS`/`VariantSchema` imports and the local `VARIANT_OPTIONS` constant are gone from this file.
- `apps/web/app/room/[code]/RoomClient.tsx`: the board is now `const Board = BOARD_COMPONENTS[view.gameId]`, rendering `null` if a view's gameId has no registered board (an old/unknown gameId) rather than crashing; the pending-config apply-once effect switched from `readPendingVariant`/`variantToApply`/`clearPendingVariant` to `readPendingConfig`/`configToApply`/`clearPendingConfig`, and the same effect now also calls `clearPendingGame(code)` once a view has arrived (D-01, client side — the pending game was only ever needed on the already-sent first `join` frame).
- `apps/web/lib/lobby-render.test.ts` (new, `renderToStaticMarkup`): proves the host+Hanabi fieldset/radio/Rainbow-checked/needs-players-copy contract, a game with no `LOBBY_SETTINGS` entry (`"Other"`, limits `{3,4}`) renders no `variant-picker`/no radios/no settings divider with its own generic copy, and a non-host view shows no settings section.
- `apps/web/lib/game-agnostic-source.test.ts` (new, comment-stripped scan, mirrors `own-hand-source.test.ts`'s character-scanner stripper): every non-test `.ts`/`.tsx` under `app/room`, `components`, `lib` has no `gameId\s*[!=]==` and no `isHanabi`; `RoomClient.tsx` has no `<HanabiBoard` JSX and no `HanabiBoard` reference; `Lobby.tsx` has no `MIN_PLAYERS`/`MAX_PLAYERS`/`variant-picker` markup of its own.
- Full gate green: `npm test` (1120/1120, up from 1108 pre-plan), `npm run typecheck` (root `tsc -b`) clean, `npx vitest run --project web` (555/555), and the six lobby/board Playwright specs (26 tests) green on a clean re-run — one flaked run of `host-room-controls.spec.ts` (`create-room`'s "Create room" hydration timing, the documented pre-existing MGR-08 flake fixed in plan 08-09) reproduced the known symptom and then passed cleanly on immediate re-run, confirming it is not a regression introduced by this plan's changes.

## Task Commits

Both tasks landed as ONE commit per the 08-06 precedent (Task 1 alone leaves `apps/web` importing a deleted module until Task 2's map-based rewiring lands):

1. **Task 1 (pending-room.ts + join-frame gameId) + Task 2 (game-ui.tsx maps + Lobby/RoomClient rewiring + render/source-scan tests): gameId-keyed board/lobby settings and pending-game join (D-02, D-11, MGR-03)** — `f65e6f9` (feat)
2. **Fix: land the four files a `git add` pathspec error dropped from `f65e6f9`** — `ae64e50` (fix, staging-only, no source changes — see Deviations)

## Files Created/Modified

- `apps/web/lib/pending-room.ts` — generalized pending game + pending config localStorage bridge, git-mv'd from `pending-variant.ts`
- `apps/web/lib/pending-room.test.ts` — behavior coverage for pending-game/pending-config storage and `configToApply`, git-mv'd from `pending-variant.test.ts` and rewritten
- `apps/web/lib/room-socket.ts` — `onOpen`'s join frame carries `gameId: readPendingGame(code)`
- `apps/web/app/page.tsx` — imports `pending-room`; writes the parsed `GameId` alongside the pending config
- `apps/web/components/game-ui.tsx` — new: `BOARD_COMPONENTS`/`LOBBY_SETTINGS` maps, the sole web module naming a game
- `apps/web/components/hanabi/HanabiLobbySettings.tsx` — new: Hanabi's variant picker, moved out of `Lobby.tsx`
- `apps/web/components/Lobby.tsx` — settings section now a `LOBBY_SETTINGS[view.gameId]` lookup
- `apps/web/app/room/[code]/RoomClient.tsx` — board now a `BOARD_COMPONENTS[view.gameId]` lookup; pending effect generalized and clears the pending game
- `apps/web/lib/lobby-render.test.ts` — new: render-contract proof for the per-game settings lookup
- `apps/web/lib/game-agnostic-source.test.ts` — new: comment-stripped source scan for `gameId`/`isHanabi` branching and file-specific markup bans

## Decisions Made

- Both tasks committed together (documented deviation from the plan's per-task instruction) — the same reasoning 08-06's SUMMARY recorded: splitting them would leave an intermediate commit that fails `npm run typecheck`, violating the "every commit leaves `npm test && npm run typecheck` green" project constraint.
- `HanabiLobbySettingsProps` was implemented exactly as the plan specified (`{ config: unknown; onSetConfig }`, no `reconnecting` field), even though this drops the pre-existing radios' `disabled={reconnecting}` visual state. This is not a functional regression: `RoomClient.tsx`'s `send()` is the single dispatch chokepoint and already no-ops any message while `status === "reconnecting"`, so a reconnecting host who clicks a radio anyway triggers no wire effect — only the disabled *look* of the control differs, and neither the plan's behavior list nor the UI-SPEC's Component Notes call this out as a required carry-forward.

## Deviations from Plan

**1. [Process deviation, not Rule 1-4] Both tasks committed as one, not two**
- **Found during:** Task 1's own verification step (`npx vitest run --project web pending-room && npm run typecheck`)
- **Issue:** Task 1's acceptance criteria requires `grep -rn "pending-variant" apps/web` to print nothing, but `RoomClient.tsx` (a Task 2 file) still imported `pending-variant` until Task 2 landed — committing Task 1 alone would leave `npm run typecheck` red, violating the project's per-commit gate.
- **Fix:** Both tasks were implemented and verified together, then committed as a single `feat` commit — identical resolution to 08-06's SUMMARY-documented precedent for the same structural reason.
- **Files modified:** all files listed above.
- **Commit:** `f65e6f9`

**2. [Rule 3 - blocking issue] A `git add` pathspec error silently dropped four modified files from commit `f65e6f9`**
- **Found during:** post-commit verification (`git status --short` before the metadata commit showed `page.tsx`, `RoomClient.tsx`, `Lobby.tsx`, `room-socket.ts` still modified after they were supposedly committed).
- **Issue:** the staging command included a stale pathspec for the already-`git mv`'d `pending-variant.ts`; git aborted the entire multi-path `add` invocation on that unmatched pathspec, so none of that invocation's other paths — including the four files above — were staged, even though the earlier `pending-room.ts`/new-file `add` calls had already succeeded. Commit `f65e6f9` therefore landed describing changes to files it did not actually contain, leaving that commit alone unbuildable.
- **Fix:** re-verified the untouched working tree against `npm test`/`npm run typecheck` (both green, unchanged from the pre-fix run since no code was re-edited), then staged and committed the four files as `ae64e50`.
- **Files modified:** none (staging-only fix; no source changes).
- **Commit:** `ae64e50`

No deviations affected scope, architecture, or requirement completion beyond these two commit-sequencing notes.

## Issues Encountered

None beyond the pre-existing, already-documented MGR-08 Create-room hydration flake (see Performance section) — reproduced once during the six-spec Playwright run and confirmed non-regressive by an immediate clean re-run of the same spec and the full six-spec set.

## User Setup Required

None — no external service configuration required. No deployment was performed.

## Next Phase Readiness

- `MGR-03` ("each game brings its own settings; host sees only current game's") is now substantially closed on the web side: `Lobby.tsx`'s settings section is a per-game lookup with no `isHanabi`/gameId conditional, proven by both a render test (Hanabi fieldset byte-identical; an unregistered game renders nothing) and a source scan. `REQUIREMENTS.md` is left for the orchestrator/next plan to mark, since this plan's own scope note is web-only — the worker-side `set_config`/registry dispatch half was already covered by 08-05/08-06.
- `MGR-01` ("host chooses the game… proven with Hanabi plus a test-only second game") remains **Pending**: this plan wires the mechanism for a real second `gameId` to ride the first join (D-01/D-02 client-side plumbing, `readPendingGame`/`gameId` on the join frame), but the landing page still only ever produces `"hanabi"` today (`page.tsx`'s picker is unchanged in this plan beyond the import swap) — plan 08-09 is where the picker itself (Expedition option, D-17 hydration fix) is rewritten.
- `apps/web/app/page.tsx` is deliberately left in its pre-08-09 shape (still gates "Create room" on `isHanabi`, still lists `innovation` not `expedition`) per this plan's explicit scope note — do not treat that as a gap in this plan; it is plan 08-09's stated deliverable.
- No blockers for plan 08-09. `BOARD_COMPONENTS`/`LOBBY_SETTINGS` in `game-ui.tsx` are ready to receive a second entry (a test-only toy board/settings, or later Expedition's) with no change to `Lobby.tsx`/`RoomClient.tsx` required.

---
*Phase: 08-multi-game-rooms*
*Completed: 2026-09-23*

## Self-Check: PASSED

All created files confirmed present on disk (game-ui.tsx, HanabiLobbySettings.tsx, pending-room.ts); pending-variant.ts confirmed deleted. Commit f65e6f9 confirmed present in git log.
