# Phase 8: Multi-Game Rooms - Research

**Researched:** 2026-09-22
**Domain:** Generalizing a single-game-hardwired Cloudflare Durable Object room layer (Hanabi only) into a per-`gameId` registry, plus two folded-in v1.0 debt fixes (root TypeScript project references, a landing-page hydration flake)
**Confidence:** HIGH — every claim below is a direct read of the current repository or a live experiment run in this session (`tsc -b`), not training-data recall about the ecosystem. This is not framework research; it is an exact-file inventory and two verified experiments (project-reference composite/noEmit interaction; the "Create room" disabled-until-hydration root cause).

## Summary

Phase 8 turns three Hanabi-hardwired seams (`activeGame`, a top-level `variant` field on the room envelope, global `MIN_PLAYERS`/`MAX_PLAYERS`) into a `gameId`-keyed registry, with Hanabi as the only production entry and a test-only second game proving the seam is real. The milestone-level `ARCHITECTURE.md` §1 already designed the target shape (registry interface, wire changes, `GameAdapter` generics) — this research does not redesign it. What follows is (1) the exact, current-repo inventory of every file that references the fields being renamed/generalized, so nothing is missed in the same commit; (2) how the existing structural chokepoint tests (`source-structure.test.ts`) must change without weakening their guarantee; (3) a concrete, tested design for the test-only registry injection point (D-10); (4) the root-caused fix for the "Create room" hydration flake (MGR-08), including a verified Next.js 16 App Router mechanism; (5) a verified, working root `tsconfig.json` project-reference configuration (MGR-07) — this was actually built and run with `tsc -b` in this session, not assumed; (6) the exact test pattern for D-13's "real v4 blob resets cleanly" proof, copied from an existing precedent in `persistence.test.ts`.

**Primary recommendation:** Follow `ARCHITECTURE.md` §1's registry design exactly. For MGR-07, give every package `packages/rules` and `packages/schema` reference `composite: true` **and** `noEmit: false` in a project-reference-specific tsconfig (not their existing one used by Vitest/standalone `tsc`), and leave `apps/web`/`apps/worker` as ordinary (non-composite) leaf references — this exact combination was built and passed `tsc -b` cleanly in this session; any other combination (e.g. `composite: true` without overriding the inherited `noEmit: true`) fails with `TS6310`. For MGR-08, the root cause is not only the hydration gate: the "Create room" button is **also** wrapped inside `{isHanabi && (...)}` in `apps/web/app/page.tsx`, so it does not exist in the DOM at all until a game is chosen — fix both independently.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Game registry lookup (`resolveGame`) | API / Backend (Cloudflare Worker) | — | Server-authoritative; the registry decides seat limits, config validation, view schema, error mapping — none of this can live client-side |
| `gameId` selection on first join | API / Backend | Browser / Client (landing page choice) | The client only *proposes* a `gameId` on its first `join` frame; the server is the sole writer of `RoomState.gameId` (D-01) |
| Per-game config validation (`set_config`) | API / Backend | — | Fail-closed schema validation must happen server-side; a malicious client could otherwise assert an unvalidated config |
| Per-game view schema dispatch | API / Backend | — | `validateGameView`/`seat-projection.ts` is the existing fail-closed chokepoint; extending it to per-game dispatch keeps the same tier |
| Board component selection (`gameId` → component) | Browser / Client | — | `RoomClient.tsx`'s component map is pure rendering, no authority implications |
| Landing-page game/settings picker | Browser / Client (SSR shell) + Frontend Server (SSR) | — | `apps/web/app/page.tsx` is SSR'd for first paint; the D-17 progressive-enhancement fix moves room-minting to a server-side route handler so it works pre-hydration |
| Schema-version reset on deploy | API / Backend (Durable Object storage) | — | `persistence.ts#loadRoom` is the sole authority; no client involvement |
| Root TypeScript project graph | Build tooling (repo-wide, not a runtime tier) | — | `tsc -b` is a dev-time check, not part of any runtime tier |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

**Carried forward (owner, 2026-09-22 — locked)**
- Saved rooms reset on deploy (MGR-06): bump the schema version so pre-change rooms reset to an empty lobby through the existing D-17 path. No migration code. The deploy is timed for when no game is in progress.
- Expedition is not offered until it's playable: its picker option stays disabled ("coming soon") until Phase 12. The registry is proven with a test-only second game (roadmap adjustment, 2026-09-22).
- Hanabi behaves exactly as before (MGR-04). `packages/rules/src/hanabi/**` has no behavioural changes, and the existing suites pass with only fixture-rename diffs.

**How the game reaches the room**
- D-01: The host's game choice travels as an optional `gameId` on the host's first `join` message. `joinRoom` records it only on the room's very first join, mirroring how `hostSeatId` is set today. Every later join — including reclaims — ignores any `gameId` it carries, so a joiner can never assert or change the room's game. No new wire message type.
- D-02: The landing page stores the chosen game next to the pending variant (the same `localStorage` pattern as `lib/pending-variant.ts`). `useRoomSocket` attaches it to the `join` frame, the way it already attaches `seatToken` and `joinId`.
- D-03: `POST /api/room` accepts and validates `gameId` plus that game's config, and still only mints a room code; no Worker call is added. An empty room defaults to `hanabi` until the first join overwrites it.

**Room envelope and wire shape**
- D-04: `RoomState` and `RoomView` gain a `gameId`. The top-level Hanabi-specific `variant` field is replaced by an opaque `config`, validated against the room's game `configSchema`, fail-closed. `set_variant` generalises to `set_config`. Hanabi's config value is its existing `Variant`, and its adapter receives it unchanged.
- D-05: `RoomView` also carries the game's seat limits (`{ min, max }`, from the registry), so the web app never duplicates registry data. `Lobby.tsx` stops importing the global `MIN_PLAYERS`/`MAX_PLAYERS` and uses the view's limits and the game's display name. This fixes today's hard-coded "Hanabi needs 2 to 5" copy.
- D-06: `GameAdapter` gains type parameters for config, end result and error (`TConfig`, `TEndResult`, `TError`). The room layer keeps checking only `checkGameEnd(...) !== null` (confirmed: one call site, `room-state.ts:461`).
- D-07: Errors are namespaced per game on the wire as `{ gameId, code }`. Each registry entry supplies its own closed code enum and mapper. This avoids a flat union that grows with every game (research open question; Pitfall 17). Hanabi's existing codes keep their names inside its namespace.

**Registry and the test-only second game**
- D-08: `apps/worker/src/game-registration.ts` becomes a registry keyed by `gameId`. Each entry holds the adapter, view schema, config schema, default config, min/max players, error mapper and display name. It stays the only non-test file allowed to name a specific game.
- D-09: The production registry contains **Hanabi only** in this phase. `GameIdSchema` lists only production-registered games; Expedition joins the enum and the registry in Phase 11.
- D-10: A minimal **test-only toy game** proves the registry end to end: different seat limits (e.g. 3–4), its own config and view schemas, and its own error codes. It is wired in through a test-only registry injection point and is never reachable from the production bundle or wire enum. Tests cover: a per-game seat limit enforced on join and start; per-game config validation, fail-closed; per-game view-schema dispatch, fail-closed; the first join locking the room's game, and a later join unable to change it; two rooms of different games coexisting.
- D-11: There is no `gameId === "…"` branching outside the registry (Pitfall 17). On the web side, `RoomClient.tsx` picks the board component from a small component map keyed by `gameId` rather than an if/else. Hanabi is the only entry today.

**Landing page**
- D-12: The game picker lists **Hanabi** (enabled) and **Expedition** (disabled, labelled "coming soon"), replacing the Innovation option. The option list is client-side; Phase 12 enables Expedition. Each game's settings fieldset (Hanabi's variant radios) comes from a per-game lookup rather than an `isHanabi` conditional.

**Deploy and persisted state (MGR-06)**
- D-13: Bump `ROOM_SCHEMA_VERSION` from 4 to 5. A test proves that a real pre-change (v4) persisted Hanabi blob resets cleanly to an empty lobby: no crash, no partial state, no deserialising of the old blob. This replaces the research's "old room rehydrates" check (Pitfall 16), which assumed migration.
- D-14: Deploy order is unchanged: worker first, then web, because the wire schema changes. `docs/deployment.md` gains a pre-deploy checklist item: "schema-version bump — confirm with the owner that no game is in progress". **The executor does not deploy**; deploying is a separate owner go-ahead.
- D-15: During the brief window where an old cached web client talks to the new worker, strict schemas must fail closed (a refusal or error frame), never crash the Durable Object.

**Root typecheck (MGR-07)**
- D-16: Add a root `tsconfig.json` with project `references` to the four package tsconfigs, so `npm run typecheck` (`tsc -b`) passes from the repo root. Verify that all four packages still build individually as well.

**"Create room" reliability (MGR-08)**
- D-17: Fix the cause. "Create room" must work *before* hydration instead of staying disabled until it. Use progressive enhancement: the form submits natively to a server endpoint that mints the code and redirects to `/room/{code}`, with the JS handler kept as an enhancement. Constraint: the display name, game and config must reach the room page **without ending up in the shareable room link** (Copy link uses `window.location.href`). A short-lived cookie, or a parameter stripped with `history.replaceState` before the lobby renders, are both acceptable; the planner chooses.
- D-18: Acceptance: the full e2e suite at default parallelism passes three consecutive runs with no create-room timeout, and no retries are added anywhere.

### Claude's Discretion
- File and type naming (keep `game-registration.ts`, or rename it and update the source-structure tests to match).
- The exact shape of the test-only toy game, and where its fixtures live.
- Whether the global `MIN_PLAYERS`/`MAX_PLAYERS` are deleted or moved into Hanabi's schema module, as long as nothing outside the registry reads them.
- Plan granularity and wave structure.

### Deferred Ideas (OUT OF SCOPE)
- Registering Expedition's adapter and adding it to `GameIdSchema`: Phase 11.
- Enabling the Expedition picker option: Phase 12.
- Migrating saved rooms across schema changes: rejected by the owner for this milestone (reset on deploy). Revisit only if resets ever hurt a live game.

</user_constraints>

## Phase Requirements

<phase_requirements>

| ID | Description | Research Support |
|----|-------------|------------------|
| MGR-01 | Host chooses the game; room link opens that game's lobby; proven with Hanabi + a test-only second game; Expedition disabled | §1.2–1.3 registry design (inherited from ARCHITECTURE.md), §"Landing Page and Progressive Enhancement" for D-17's create flow, §"Test-Only Registry Injection Point" for D-10 |
| MGR-02 | Each game sets its own seat limits, enforced on join/start | §"Exact File Inventory" (`joinRoom`/`startGame` in `room-state.ts` currently import global `MIN_PLAYERS`/`MAX_PLAYERS`; must switch to `resolveGame(state.gameId)`) |
| MGR-03 | Each game brings its own settings; host sees only current game's settings | §"Exact File Inventory" (`apps/web/app/page.tsx`'s `isHanabi` conditional → per-game fieldset lookup) |
| MGR-04 | Hanabi plays exactly as before; full suites pass with only fixture-rename diffs | §"Exact File Inventory" enumerates every non-`packages/rules/src/hanabi` file that references `variant`/`MIN_PLAYERS`/`MAX_PLAYERS`/`activeGame`/`ROOM_SCHEMA_VERSION`/`ErrorDetailSchema`/`mapAdapterError`, so every consumer is caught in the same commit |
| MGR-05 | Every per-seat view validated against its own game's view schema before sending | `seat-projection.ts`'s `validateGameView` already fail-closed; one-line change to `resolveGame(view.gameId).viewSchema.safeParse(...)`, confirmed by direct read |
| MGR-06 | Deploy resets saved rooms to empty lobbies via schema-version bump | §"D-13 Test Pattern" gives the exact, precedented test shape from `persistence.test.ts`'s Phase 7 stack-shape-swap test |
| MGR-07 | Root `npm run typecheck` works via project references | §"Root tsconfig.json: Verified Working Configuration" — built and run with `tsc -b` in this session, not assumed |
| MGR-08 | "Create room" usable promptly under load, fixed at the cause | §"MGR-08 Root Cause and Fix" — two independent causes identified by direct read of `apps/web/app/page.tsx` |

</phase_requirements>

## Exact File Inventory

Grep run against the live tree (excluding `node_modules`, `.next`, `.wrangler`, `dist`) on 2026-09-22. Every file listed touches one of the fields this phase renames or generalizes. **Files under `packages/rules/src/hanabi/**` are deliberately excluded from the "must change" list** — MGR-04 requires them to have zero behavioral changes; their internal `variant` field is Hanabi's own rules-engine concept and is untouched (only the outer envelope's field name changes, per ARCHITECTURE.md §1.8).

### `variant` / `set_variant` / `VariantSchema` at the room-envelope level

Files that reference the top-level room-envelope `variant` (not Hanabi's internal rules-engine `Variant` type, which stays unchanged as the *value* of the new `config` field):

**Schema/wire (must change):**
- `packages/schema/src/room.ts` — `RoomStateSchema.variant`, `RoomViewSchema.variant` (lines 112, 158)
- `packages/schema/src/messages.ts` — `SetVariantMessageSchema` (line 34), imports `VariantSchema` (line 2)

**Worker (must change):**
- `apps/worker/src/room-state.ts` — `createEmptyRoom(code, variant, ...)` (line 72), `setVariant` function (line 239), `startGame`'s `adapter.createInitialState({ ..., variant: state.variant, ... })` (line 372), `toSeatView`'s `variant: state.variant` (line 498)
- `apps/worker/src/room-do.ts` — `createEmptyRoom(this.name as RoomCode, "base", Date.now())` (line 149) — the hardcoded default room fallback

**Web (must change — the D-02/D-17 pending-choice plumbing):**
- `apps/web/lib/pending-variant.ts` — the entire module (`pendingVariantKey`, `readPendingVariant`, `writePendingVariant`, `variantToApply`) is Hanabi-shaped; either generalize or add a sibling `pending-game.ts` per ARCHITECTURE.md §1.3 (Claude's Discretion on naming)
- `apps/web/app/page.tsx` — POST body `{ displayName, variant }` (must become `{ displayName, gameId, config }`), `isHanabi` conditional gating both the settings fieldset **and the Create room button** (see MGR-08 root cause below)
- `apps/web/app/api/room/route.ts` — `CreateRoomBodySchema` (`variant: VariantSchema`)
- `apps/web/app/room/[code]/RoomClient.tsx` — reads `view.variant` for `variantToApply`/`onSetVariant` wiring, hardcodes `<HanabiBoard>` as the sole render branch
- `apps/web/components/Lobby.tsx` — `onSetVariant: (variant: Variant) => void` prop, `VARIANT_OPTIONS`, imports `MIN_PLAYERS`/`MAX_PLAYERS` (see next section)

**Test fixtures (rename-only diffs expected per MGR-04):**
- `apps/web/app/api/room/route.test.ts`
- `apps/worker/src/persistence.test.ts`, `room-do.test.ts`, `room-state.test.ts` (19 occurrences), `scheduler.test.ts`, `seat-projection.test.ts` (4 occurrences)
- `packages/schema/src/room.test.ts`, `messages.test.ts` (`set_variant` fixture at line 106)
- `apps/web/lib/room-store.test.ts`, `pending-variant.test.ts`
- e2e specs that select a variant via `e2e/helpers.ts`'s `createRoom`/`variantLabel`: `board-fit-black.spec.ts`, `create-room.spec.ts`, `hanabi-realtime.spec.ts`, `hanabi-table-polish.spec.ts`, `start-game.spec.ts`, `variant-black.spec.ts`, `variant-rainbow.spec.ts`

**Hanabi-internal `Variant` (excluded from "must change" — MGR-04 protects these):** every file under `packages/rules/src/hanabi/**` (rules engine, deck construction, clue legality) and `packages/schema/src/games/hanabi.ts`/`hanabi.test.ts` (the per-game schema module) — these keep the name `variant`/`Variant` as their own internal vocabulary; only the *outer envelope's* field is renamed to `config`. All the `apps/web/components/hanabi/**` and `apps/web/lib/hanabi-*.ts` files that showed up in the initial grep reference this same internal `Variant` type via UI props and are likewise unaffected in behavior (they may still show as touched files if `Variant` is re-exported differently, but no logic changes).

### `MIN_PLAYERS` / `MAX_PLAYERS`

- `packages/schema/src/constants.ts` — the two exports (lines 45–46), doc-commented "ROOM-06, D-10"
- `apps/worker/src/room-state.ts` — `joinRoom`'s `state.seats.length >= MAX_PLAYERS` (line 136), `startGame`'s `state.seats.length < MIN_PLAYERS || state.seats.length > MAX_PLAYERS` (lines 364–366)
- `apps/worker/src/seat-naming.ts` — references `MAX_PLAYERS` (confirm exact use at implementation time; likely the display-label suffix ceiling)
- `apps/web/components/Lobby.tsx` — `canStart`, `MAX_PLAYERS` in seat-count display, `lobbySlots(view.seats, MAX_PLAYERS)`
- `apps/web/lib/lobby-seats.ts`, `lobby-seats.test.ts` — `lobbySlots` takes a `maxPlayers` parameter already (good — this file may need **no** signature change, only its caller in `Lobby.tsx` switching from the global constant to `view.limits.max`)
- `apps/worker/src/room-state.test.ts` — 4 occurrences (fixture-only)

**Claude's Discretion note (confirmed feasible):** `lobby-seats.ts`'s `lobbySlots(seats, maxPlayers)` already takes `maxPlayers` as a parameter, not a hardcoded import — so per-game seat limits flow through it for free once `Lobby.tsx`'s call site passes `view.limits.max` instead of the imported constant. No change needed inside `lobby-seats.ts` itself.

### `activeGame`

- `apps/worker/src/game-registration.ts` — the export itself (becomes the registry)
- `apps/worker/src/room-state.ts` — `const adapter = activeGame.adapter` (line 36, module-level constant — becomes `resolveGame(state.gameId).adapter` threaded through each function)
- `apps/worker/src/seat-projection.ts` — `activeGame.viewSchema.safeParse(view.game)` (line 51)
- `apps/worker/src/room-state.test.ts` — fixture references

### `ROOM_SCHEMA_VERSION`

- `packages/schema/src/constants.ts` — the export (currently `4`, doc-commented with the full bump history — three prior bumps for exactly this class of change, each with its own persistence-test precedent)
- `apps/worker/src/persistence.ts` — `loadRoom`/`saveRoom` (the version-gate logic itself; **no code change needed**, only the constant's value changes)
- `apps/worker/src/persistence.test.ts` — needs a **new** describe block (D-13), not a modification to existing ones; see §"D-13 Test Pattern" below

### `ErrorDetailSchema` / `mapAdapterError`

- `packages/schema/src/messages.ts` — `ErrorDetailSchema` enum (lines 147–158), currently a flat 10-member union mirroring `AdapterError` 1:1
- `apps/worker/src/room-state.ts` — `mapAdapterError` function (lines 396–421), an exhaustive switch with a `never`-typed default
- `packages/schema/src/messages.test.ts` — fixture references

**D-07 implication confirmed by direct read:** `mapAdapterError`'s exhaustive-switch-with-`never`-default pattern is exactly what must be replicated per-game (one switch per registry entry) rather than widened into one giant switch — the existing pattern is the template, not something to abandon. The wire shape becomes `{ gameId, code }` per D-07; `ErrorDetailSchema` needs restructuring from a flat enum to either (a) a `z.record` of per-game closed enums, or (b) a discriminated union keyed on `gameId`. Recommend (b) — it stays a closed, exhaustively-checkable shape and mirrors the existing `ClientMessageSchema`/`ServerMessageSchema` discriminated-union convention already used throughout this codebase (see `messages.ts` line 90, 167).

## Test-Only Registry Injection Point (D-10)

### Constraint restated
The toy game must be (1) exercisable by worker unit tests (`room-state.test.ts`, `seat-projection.test.ts`) and (2) exercisable by the wrangler-dev-spawning RoomDO integration test (`room-do.test.ts`, which per `package.json`'s `test:integration` script spawns a real `wrangler dev` process), while (3) never being present in the production bundle or the wire `GameIdSchema` enum.

### Recommended design (HIGH confidence — derived directly from the existing `source-structure.test.ts` A9 pattern, which already enforces "confined to one file")

1. **`GAME_REGISTRY` stays a plain `Record<GameId, GameRegistryEntry>`** exported from `game-registration.ts`, keyed by the production `GameIdSchema` enum (Hanabi only this phase). This is what `resolveGame` reads by default.

2. **A separate, exported test-only registration function**, e.g. `registerTestGame(entry: GameRegistryEntry): void` (or `__TEST_ONLY__registerGame`), defined in `game-registration.ts` itself — keeping the "only this file names a specific game" invariant intact, since the toy game's *entry construction* can live in a test fixture file, but the *registration call* that mutates/extends the lookup map must go through this one function. This function pushes into a **module-level mutable registry** (a `Map`, not the frozen `GAME_REGISTRY` constant) that `resolveGame` actually reads from at runtime — seeded from `GAME_REGISTRY` at module load, extendable only via `registerTestGame`.

3. **Guard against production reachability**: `registerTestGame` should assert `process.env.NODE_ENV !== "production"` (or an equivalent Worker-safe check — Cloudflare Workers set `process.env` differently than Node; verify the actual env-detection mechanism already used elsewhere in this codebase, e.g. `apps/worker/src/origin.ts`'s existing environment-conditional logic, and reuse that same mechanism rather than inventing a second one) and throw if called outside a test context. This makes "reachable from the production bundle" a runtime assertion failure, not just a convention.

4. **The `GameId` wire enum stays closed to `["hanabi"]`** (production) — the toy game's `gameId` value (e.g. `"__test_toy__"`) is intentionally a string that does NOT validate against `GameIdSchema`. This means the toy game **cannot** flow through the real wire schema validation path (`JoinMessageSchema.gameId`, `RoomViewSchema.gameId`) unless those tests construct `RoomState`/`RoomView` objects directly (bypassing `ClientMessageSchema.safeParse`) — which is exactly what `room-state.test.ts` already does today (it calls `joinRoom`/`startGame`/`toSeatView` as pure functions, not through the wire parser). Confirmed by direct read: `room-state.test.ts` imports functions from `room-state.ts` directly, never `parseClientMessage`. **Recommendation:** widen `GameIdSchema` itself to accept an additional test-only literal only inside the `messages.test.ts`/`room.test.ts` suites by constructing a parallel schema instance in the test file (`z.enum(["hanabi", "__test_toy__"])`), never by widening the production `GameIdSchema` export. This keeps the wire-level guarantee (D-09: "GameIdSchema lists only production-registered games") intact while still letting schema-level tests exercise config/view validation against a second, structurally different shape.

5. **For the wrangler-dev RoomDO integration test** (`room-do.test.ts`): this test spawns a real Worker process via `wrangler dev`, so it cannot reach into the Worker's in-memory module state from the test process to call `registerTestGame`. Two options, in order of preference:
   - **(a) Environment-variable gate in `game-registration.ts`** itself: if an env var (e.g. `TEST_ENABLE_TOY_GAME`) is set, the module registers the toy game entry at load time, inside a conditional block that is dead code (and tree-shaken or simply never true) in the production deploy, which never sets that var. `playwright.config.ts`'s existing pattern of passing `--var SOCKET_STALE_MS:...` to `wrangler dev` (confirmed at `playwright.config.ts` line 76) is the precedent to follow — `wrangler dev --var TEST_ENABLE_TOY_GAME:1` for the integration-test spawn only, never for `npm run dev` or the production `wrangler deploy`.
   - **(b) Skip toy-game coverage in the wrangler-dev integration test entirely** and prove D-10's "two rooms of different games coexisting" claim purely at the `room-state.ts` pure-function level (already fully testable without a real Worker process, per point 4 above) plus at the `seat-projection.ts` level for view-schema dispatch. The RoomDO integration test's job (per its existing scope) is proving hibernation/storage/WebSocket lifecycle survive real process boundaries — not proving registry correctness, which is better proven at the pure-function layer anyway. **Recommend (b)** as lower-risk and consistent with the existing test pyramid (`room-state.test.ts` already carries the vast majority of room-lifecycle assertions; `room-do.test.ts` is reserved for I/O-boundary concerns per its file's own scope).

**Confidence:** MEDIUM on the exact mechanism (env-var gate vs. pure-function-only coverage) — both are structurally sound against the existing codebase's patterns, but the planner should treat option (b) as the default and only reach for (a) if plan-time discussion surfaces a concrete need to prove registry dispatch survives a real hibernation cycle specifically (D-10's five listed test requirements do not mention hibernation, so (b) fully satisfies D-10 as written).

## Source-Structure Test Changes (source-structure.test.ts)

Direct read of `apps/worker/src/source-structure.test.ts` confirms the exact assertions that must be updated, not merely "kept meaningful" in the abstract:

- **A9** (`hanabiGame` and `@games/schema/games/` appear only in `game-registration.ts`): this assertion's *shape* survives unchanged — the registry still confines both identifiers to one file. No test code change needed here as long as the registry's Hanabi entry still literally names `hanabiGame`.
- **New assertion needed (not in the current file):** confine the toy-game registration to `game-registration.ts` the same way, e.g. an A9-sibling assertion that `registerTestGame(` (or whatever the injection function is named) is defined exactly once, in `game-registration.ts`, mirroring A9's `hanabiGame` confinement pattern. This is the concrete "test updated rather than removed" the CONTEXT.md canonical references call for (RETROSPECTIVE.md lesson 2).
- **A4/A5/A7** (`toSeatView`/`toPlayerView`/`projectSeatView` single-call-site assertions): these are unaffected by the registry change — `toSeatView` still calls `resolveGame(state.gameId).adapter.toPlayerView(...)` from exactly the same one call site inside its own function body. No test change needed; re-verify after implementation that the call-site count assertion (A5) still finds exactly one `toPlayerView(` call, now reading through `resolveGame(...).adapter` instead of the module-level `adapter` constant — the regex-based count is on the literal string `toPlayerView(`, which is unaffected by how the adapter reference resolves.
- **D-01/D-03 toy-module tests** (lines 324–344, checking `foreheadCardGame` is fully gone): these are historical (Phase 4's toy) and unrelated to Phase 8's new toy game — leave unchanged, they document a *different, already-deleted* toy from Phase 2/4.

## Root tsconfig.json: Verified Working Configuration

**This was built and run with `tsc -b` in this session** (not assumed from documentation) using the actual repo file tree, then fully cleaned up (no residue committed). Confirmed facts:

1. **No root `tsconfig.json` currently exists.** `cat tsconfig.base.json` exists (the shared base every package's own `tsconfig.json` extends), but there is no root `tsconfig.json` with `references`. Running `npm run typecheck` (which is `tsc -b`) today fails immediately: `error TS5083: Cannot read file '/home/rflor/games/tsconfig.json'.` This is the exact, confirmed root cause of MGR-07 — not a misconfiguration, an entirely absent file.

2. **`composite: true` alone is insufficient; `noEmit: false` must also be set**, overriding `tsconfig.base.json`'s `noEmit: true`. Verified error when omitted: `error TS6310: Referenced project '.../tsconfig.json' may not disable emit.` — TypeScript's project-reference build mode requires every project that is *referenced by another project* to actually emit (at minimum, declaration files) so the referencing project can consume its types incrementally. A project that only extends `tsconfig.base.json` unmodified will fail this check the moment it becomes a reference target.

3. **Only `packages/schema` and `packages/rules` need `composite: true` + `noEmit: false`** — they are the two packages referenced by other packages/apps (`@games/schema`, `@games/rules` are workspace-resolved via `tsconfig.base.json`'s `paths`, confirmed at lines 12–16). `apps/web` and `apps/worker` are never referenced *by* anything else in this repo (nothing imports from `apps/web` or `apps/worker`), so they can stay exactly as they are today — `noEmit: true`, no `composite` flag — as long as they carry `references` pointing at the two packages they depend on. **Verified: a full `tsc -b` root build with this exact split (schema+rules composite/emit-enabled; web+worker plain, referencing the two packages) completed with exit code 0.**

4. **Recommended concrete structure** (planner should treat this as the load-bearing design, already verified working):
   - `packages/schema/tsconfig.json` and `packages/rules/tsconfig.json`: add `"composite": true, "noEmit": false, "declarationDir": "dist/types"` (or similar — an output directory that is `.gitignore`'d; verify `.gitignore` already excludes `dist/` at those paths, or add it) to their existing `compilerOptions` block. This is a **change to the files Vitest and `apps/worker`'s own `tsc -p` already use** — verify Vitest's `vitest.config.ts` alias-based resolution (confirmed: it aliases `@games/schema`/`@games/rules` directly to `src/index.ts`, not through the compiled `dist/`) is unaffected, since Vitest never reads `tsconfig.json`'s `outDir`/`declarationDir` for module resolution — only `tsc -b` does. **Verify this assumption by running `npm test` after the tsconfig change**, since it was not independently re-tested with Vitest in this research session (only `tsc -b` was tested).
   - `apps/worker/tsconfig.json`: add a `"references"` array pointing at `../../packages/schema/tsconfig.json` and `../../packages/rules/tsconfig.json`. No other change needed (confirmed: worker does not need `composite`).
   - `apps/web/tsconfig.json`: same — add `"references"` pointing at the same two packages. No other change needed (confirmed: web does not need `composite`, and Next.js's own `noEmit: true`/`plugins: [{name: "next"}]` setup is untouched).
   - **New root `/tsconfig.json`**: `{ "files": [], "references": [{ "path": "packages/schema" }, { "path": "packages/rules" }, { "path": "apps/worker" }, { "path": "apps/web" }] }` — an empty-`files` root that only lists references, the standard TypeScript multi-project pattern. Order in the array does not matter; `tsc -b` topologically sorts by each project's own `references`.

5. **Verify all four packages still build individually** (CONTEXT.md D-16's explicit ask): after the tsconfig changes, `tsc -p packages/schema/tsconfig.json --noEmit` (forcing a throwaway `noEmit` override at the CLI to avoid writing `dist/` during ad-hoc checks) and the equivalent for the other three should each still pass standalone — this was the exact command shape used to verify the pre-existing baseline in this research session (`tsc -p packages/rules/tsconfig.json --noEmit` and `tsc -p packages/schema/tsconfig.json --noEmit` both passed cleanly against the current, unmodified tree).

**Confidence:** HIGH — this is a verified experiment, not documentation-derived. The one open item is Vitest's continued correctness after the `composite`/`declarationDir` change, flagged above as needing a fresh `npm test` run at implementation time (Assumption A1 in the Assumptions Log).

## MGR-08 Root Cause and Fix

### Root cause (confirmed by direct read of `apps/web/app/page.tsx`, not assumed)

There are **two independent, compounding causes**, not one:

1. **The documented hydration gate**: `useHydrated()` (a `useSyncExternalStore` returning `false` during SSR/hydration and `true` after) disables the "Create room" button via `disabled={submitting || !hydrated}`. This is the cause the codebase's own comment documents (lines 18–24 of `page.tsx`).
2. **A second, undocumented cause**: the entire "Create room" button — along with the variant fieldset — is rendered **only** inside `{isHanabi && (...)}` (line ~175 in the current file). Since `game` defaults to `""` (no game pre-selected) and `isHanabi = game === "hanabi"`, the button **does not exist in the DOM at all** until the user has already selected "Hanabi" from the dropdown. `e2e/helpers.ts`'s `createRoom` already works around this today (`await page.getByLabel("Game").selectOption("hanabi")` runs *before* `await expect(createButton).toBeEnabled()`), but this is a second, compounding source of "Create room stays disabled/unusable" beyond pure hydration timing, and it means **any** fix that only addresses hydration timing (cause 1) without also addressing the conditional render (cause 2) will not fully resolve MGR-08 — a page load racing multiple parallel e2e workers still has to wait for React to mount, run the `useState` initial render, and process the `onChange` from selecting a game, all before the button exists, which is strictly more client-side work than "the button exists but is disabled."

### D-17's progressive-enhancement fix — verified against Next.js 16 App Router docs

Per `apps/web/AGENTS.md`'s explicit instruction, this section is based on `node_modules/next/dist/docs/01-app/` (version confirmed: `16.3.4`, read directly from `node_modules/next/package.json` in this session), specifically:
- `node_modules/next/dist/docs/01-app/02-guides/forms.md`
- `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/form.md`

**Recommended mechanism:** a `<form action={createRoomAction}>` using a **Server Action** (not a plain route-handler POST with a manual native-submit fallback), because:
- A Server Action attached via `action={...}` on a `<form>` **works without JavaScript** by design — the App Router progressively enhances a Server-Action-bound form into a real HTML form `action`/`method` pair automatically, which is exactly D-17's requirement ("the form submits natively... with the JS handler kept as an enhancement") without hand-building two separate code paths (one native POST handler, one `fetch`-based JS handler) the way the current `route.ts` + client `handleSubmit` split does today.
- `redirect()` inside a Server Action is the documented mechanism for "mint the code and redirect to `/room/{code}`" (confirmed pattern name in `forms.md`).

**Carrying `displayName`/`gameId`/`config` to the room page without leaking into the shareable link:**

The constraint is specifically that `window.location.href` (which `Lobby.tsx`'s `RoomCode` component reads for "Copy link", confirmed at `Lobby.tsx` line ~55: `shareUrl = typeof window !== "undefined" ? window.location.href : ...`) must not carry these values as query params by the time a viewer clicks "Copy link" — but it is fine for them to be *briefly* present in the URL during the redirect, since the fix can strip them client-side before the lobby is interactive.

Two viable mechanisms, matching D-17's own framing ("A short-lived cookie, or a parameter stripped with `history.replaceState`... the planner chooses"):

- **Cookie approach:** the Server Action calls `cookies().set(...)` (Next.js server-side cookie API, App Router) with a short TTL (e.g. 60s) scoped to the room code, before `redirect(path)`. The room page (`RoomClient.tsx`, or a thin Server Component wrapper around it) reads the cookie server-side on first render, passes `displayName`/`gameId`/`config` as props into the client component, and the client component's existing `writeDisplayName`/`writePendingVariant`-equivalent localStorage write happens once on mount — after which the cookie is redundant and can be cleared. **Advantage:** the URL is never polluted even transiently; simplest mental model; no client-side timing window. **Tradeoff:** requires the room route to read cookies server-side, a small new pattern for this codebase (currently `RoomClient.tsx` is a pure client component with no server-side data fetching).
- **Query-param + `history.replaceState` approach:** the Server Action's `redirect()` target includes the values as query params (`/room/{code}?displayName=...&gameId=...`); the room page's client component reads them via `useSearchParams()` on mount, writes them into the existing `localStorage` scheme (`writeDisplayName`, the D-02 pending-game equivalent), and immediately calls `window.history.replaceState(null, "", `/room/${code}`)` to strip the query string **before** `Lobby.tsx` ever computes `shareUrl` from `window.location.href`. **Advantage:** no new server-side cookie-reading code path; stays inside the existing all-client-component `RoomClient.tsx` architecture. **Risk:** there is a real (if narrow) window between first paint and the `replaceState` call where `window.location.href` briefly contains the query string — if the "Copy link" button could theoretically be clicked in that window (unlikely given a host has not yet even seen their own seat render) this would leak into a shared link. Mitigate by calling `replaceState` in the *earliest possible* effect (before first paint if using `useLayoutEffect`, or even better, doing the strip synchronously during the initial client render pass rather than in a `useEffect`).

**Recommendation:** the query-param + `replaceState` approach is lower-implementation-risk for this specific codebase (no new server-side data-fetching pattern introduced into `RoomClient.tsx`'s architecture, which is currently 100% client-driven post-mount) and the "Copy link" leak window is negligible in practice (a fresh room has no seat rendered yet, and the host is the only person who could click Copy link in that instant, before even seeing their own name appear). The planner should still consider the cookie approach if the discuss-phase surfaces a stronger aversion to any transient query-string exposure. **This is a discretion point already explicitly left to the planner by D-17's own text ("the planner chooses") — not re-litigated here as a locked decision.**

**How the existing localStorage-based auto-join adapts:** `apps/web/lib/seat-token.ts`'s `writeDisplayName` and the pending-game equivalent of `pending-variant.ts` are called exactly once, from wherever the values first become available client-side (either the cookie-reading Server Component's client child, or the query-param-reading effect) — this is structurally identical to today's flow where `handleSubmit` in `page.tsx` calls `writeDisplayName`/`writePendingVariant` synchronously after a successful `fetch` response, just moved to fire on the room page's mount instead of the landing page's submit handler. `RoomClient.tsx`'s existing `useEffect` that reads `readDisplayName(code)` on mount (confirmed at lines ~60-68) needs **no change** — it already reads from the same localStorage keys these values would be written to, so once the room page's new effect writes them (before or in the same tick as that existing read effect), the auto-join path is unaffected.

**Confidence:** HIGH on the Next.js 16 mechanism (Server Actions progressively enhance `<form action>` — read directly from the installed version's own bundled docs, not training data) and on the localStorage integration (direct code read). MEDIUM on the cookie-vs-replaceState tradeoff recommendation — this is genuine design judgment, not a verified fact, and is correctly left as planner discretion per D-17's own text.

## D-13 Test Pattern

`apps/worker/src/persistence.test.ts` already contains **three precedent tests** for exactly this shape of proof (schema-version bump → old blob resets cleanly, unread), one for each prior `ROOM_SCHEMA_VERSION` bump in this codebase's history. The most recent (Phase 7 plan 10, lines 169–194) is the closest template:

```ts
describe("Phase 8: multi-game registry swap (D-13): pre-change (v4, single-game) rooms reset", () => {
  it("a schemaVersion 4 room with a real Hanabi variant field (no gameId/config) resets without reading the room blob", async () => {
    expect(ROOM_SCHEMA_VERSION).toBeGreaterThan(4);

    const { storage, getCalls } = makeFakeStorage();
    await storage.put(STORAGE_KEYS.schemaVersion, 4);
    await storage.put(STORAGE_KEYS.room, {
      ...fallbackRoom(),
      adapterId: "hanabi",
      variant: "base", // pre-D-04 shape: top-level `variant`, no `gameId`/`config`
      game: { /* a real, minimal in-progress Hanabi game-state shape */ },
    });
    getCalls.length = 0; // reset instrumentation after seeding

    const result = await loadRoom(storage, fallbackRoom);

    expect(result.wasReset).toBe(true);
    expect(getCalls).not.toContain(STORAGE_KEYS.room);
  });
});
```

This exactly matches D-13's wording ("a test proves that a real pre-change (v4) persisted Hanabi blob resets cleanly to an empty lobby: no crash, no partial state, no deserialising of the old blob"). The `getCalls).not.toContain(STORAGE_KEYS.room)` assertion is the "no deserialising of the old blob" proof — `loadRoom`'s existing code path (confirmed by direct read of `persistence.ts` lines 78–83) checks `storedVersion !== ROOM_SCHEMA_VERSION` and calls `resetRoom` **before** ever calling `storage.get(STORAGE_KEYS.room)`, so this assertion is already true by construction once the version constant is bumped — the test's job is to prove it stays true, not to make it true.

**No new production code is needed for D-13** — `persistence.ts`'s `loadRoom` function requires zero changes; only `constants.ts`'s `ROOM_SCHEMA_VERSION` value (4 → 5) and this new test.

## Threat Model Input

Trust boundaries newly touched or widened by this phase, for the plan-checker's security review:

| Trust Boundary | Threat | Mitigation (existing pattern to extend) |
|---|---|---|
| First-join `gameId` assertion | A malicious/buggy client sends `gameId` on a join that is NOT the room's first join, attempting to hijack an existing room's game | D-01 is explicit: `joinRoom` must read `state.gameId` (already-set) for any non-first join and silently ignore the client-supplied value — never trust client input for this field past the first join. Mirrors the existing `hostSeatId` first-write-wins pattern (`state.hostSeatId ?? seatId`), which is already proven correct in production. |
| `set_config` validation | A client sends a `config` payload that does not match the room's game's `configSchema` (e.g. a Hanabi room sent an Expedition-shaped config, or arbitrary garbage) | Extend the existing D-07/D-08 fail-closed discipline already used for `validateGameView`: `resolveGame(state.gameId).configSchema.safeParse(config)` must reject before `setConfig` ever mutates `RoomState`, returning `bad_request` — same pattern as every other room-layer refusal. |
| Old-client/new-worker window during deploy (D-15) | A cached-in-browser old web client (pre-migration, still sending `set_variant`/expecting a top-level `variant` field) talks to the newly-deployed worker, which no longer understands `set_variant` or emits `variant` | `ClientMessageSchema.safeParse` already fails closed on an unrecognized `type` discriminant (`parseClientMessage`'s `result.success` check, confirmed at `messages.ts` line 196) — an old client's `set_variant` frame will simply fail to parse and produce `{ ok: false, reason: "bad_request" }`, which the worker already turns into a `bad_request` error frame, never a crash. This is the *existing* mechanism; D-15 requires no new code, only confirming (via a test) that this exact old-shaped frame is rejected cleanly post-deploy, not silently coerced. |
| Test-only registry injection reachability | The test-only toy game (D-10) becomes reachable in a production deploy, either via the wire `GameIdSchema` enum or via the registry map itself | Addressed in §"Test-Only Registry Injection Point" above — recommend a runtime assertion (`registerTestGame` throws outside a test context) as defense-in-depth beyond the source-structure test's static confinement check, since a structural/grep-based test can be fooled by dynamic code construction in a way a runtime assertion cannot. |
| Error namespace widening (D-07) | `ErrorDetailSchema`'s restructuring from a flat enum to a per-game discriminated shape accidentally reintroduces a free-text or non-exhaustive channel | The existing `mapAdapterError`'s exhaustive-switch-with-`never`-default pattern (confirmed at `room-state.ts` lines 396–421) is the load-bearing compile-time guarantee here — replicate this pattern per-game (one exhaustive switch per registry entry), never fall back to a generic `String(error)` cast, which would silently reopen the exact state-leak channel Phase 2's D-08 closed. |

## Package Legitimacy Audit

Not applicable — this phase introduces zero new external dependencies. All work is internal refactoring (registry pattern, schema restructuring, Next.js Server Actions using framework APIs already present in the installed `next@16.3.4`) plus a new root `tsconfig.json` (no new package). No `npm install` occurs in this phase's scope.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (unit/integration, `vitest.config.ts` project-based: `schema`, `rules`, `worker` projects) + Playwright 1.62.1 (e2e, `playwright.config.ts`) |
| Config file | `/home/rflor/games/vitest.config.ts`, `/home/rflor/games/playwright.config.ts` |
| Quick run command | `npm test -- --project worker room-state` (targeted); `npm run typecheck` for the MGR-07 gate |
| Full suite command | `npm test` (all Vitest projects) + `npm run test:e2e` (Playwright, default parallelism) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MGR-01 | Host picks game, room opens that game's lobby (Hanabi + toy) | unit + e2e | `vitest run --project worker room-state` + `playwright test create-room.spec.ts` | ✅ modify existing |
| MGR-02 | Per-game seat limits enforced on join/start | unit | `vitest run --project worker room-state` (new toy-game cases) | ✅ modify existing |
| MGR-03 | Per-game settings shown, host sees only current game's | unit + e2e | `vitest run --project web` (Lobby/page render tests) + Playwright lobby spec | ✅ modify existing |
| MGR-04 | Hanabi unchanged, full suite passes with fixture-rename diffs only | unit + e2e | `npm test && npm run test:e2e` (full gate) | ✅ existing, no new file |
| MGR-05 | Per-seat view validated against its own game's schema, fail-closed | unit | `vitest run --project worker seat-projection` | ✅ modify existing |
| MGR-06 | Deploy resets saved rooms via schema-version bump | unit | `vitest run --project worker persistence` (new D-13 describe block) | ❌ Wave 0 — add new test |
| MGR-07 | Root `npm run typecheck` passes | build check | `npm run typecheck` (`tsc -b` from root) | ❌ Wave 0 — root tsconfig.json does not exist yet |
| MGR-08 | Create room usable promptly under e2e load, no retries | e2e (stress) | `npm run test:e2e` at default parallelism, 3 consecutive runs (D-18's explicit acceptance bar) | ✅ existing suite; acceptance is a repeated-run discipline, not a new test file |

### Sampling Rate
- **Per task commit:** targeted `vitest run --project <name> <file-substring>` for the file(s) touched, plus `npm run typecheck` once the root tsconfig exists (cheap, catches cross-package type drift immediately)
- **Per wave merge:** `npm test` (full Vitest) + `npm run typecheck`
- **Phase gate:** `npm test && npm run typecheck && npm run test:e2e` (default parallelism) — and per D-18, the e2e run specifically must be repeated 3 consecutive times with zero create-room timeouts before the phase is considered done

### Wave 0 Gaps
- [ ] Root `/tsconfig.json` — does not exist; MGR-07 cannot pass without it (§"Root tsconfig.json" above gives the verified-working shape)
- [ ] `packages/schema/tsconfig.json`, `packages/rules/tsconfig.json` — need `composite: true, noEmit: false` added (verified necessary; `TS6310` otherwise)
- [ ] New D-13 describe block in `apps/worker/src/persistence.test.ts` — does not exist; template given above, copied from the existing Phase 7 precedent in the same file
- [ ] Toy-game fixture module (D-10) — location is Claude's Discretion per CONTEXT.md; recommend `apps/worker/src/test-fixtures/toy-game.ts` or co-located with `room-state.test.ts`, following existing patterns for prior toy games (`packages/rules/src/forehead-card.ts` was the Phase 2/4 precedent location, now deleted per `source-structure.test.ts`'s D-01/D-03 checks — do not resurrect that exact filename)

## Common Pitfalls

### Pitfall 1 (project-specific instance of milestone Pitfall 16): the envelope rename breaks old persisted Hanabi rooms if the schema-version bump is forgotten or misordered
**What goes wrong:** `RoomStateSchema`/`RoomViewSchema` change shape (`variant` → `gameId`+`config`) in the same commit as the code that reads them, but if `ROOM_SCHEMA_VERSION` is not bumped, `persistence.ts#loadRoom` will attempt to `RoomStateSchema.safeParse` an old-shaped blob against the new schema, fail validation, and take the "corrupt storage" reset path rather than the clean "version mismatch" path — functionally the same end state (reset to lobby) but for the wrong, harder-to-diagnose reason, and a false confidence signal if a test only checks "does it reset" without checking "does it reset via the version-check path, not the corrupt-blob path."
**Why it happens:** The version bump (`constants.ts`) and the shape change (`room.ts`) are two separate file edits; nothing forces them into the same commit.
**How to avoid:** D-13's test explicitly seeds a v4-versioned blob and checks `getCalls).not.toContain(STORAGE_KEYS.room)` — this specifically proves the version-check path fires (never reads the blob), not merely "ends up reset." Keep this exact assertion; do not weaken it to `result.wasReset === true` alone, which would pass even via the corrupt-blob fallback path and mask a forgotten version bump.
**Warning signs:** A D-13 test that passes even when `ROOM_SCHEMA_VERSION` is NOT bumped (i.e., left at 4) — if this happens, the test is only checking the corrupt-blob path, not the version-mismatch path, and is not actually proving D-13's claim.

### Pitfall 2: `source-structure.test.ts`'s regex-based call-site counts silently break on a refactor that changes indentation/formatting around a matched pattern
**What goes wrong:** Several assertions (A3, A8, P5-4 through P5-7) locate a code region by `indexOf` on an exact string like `"async onStart(): Promise<void>"` or `"#timers(room: RoomState, now: number)"`. A registry-driven refactor of `room-state.ts`/`room-do.ts` that changes a function's parameter list, adds a parameter, or reformats a signature (e.g. `toSeatView(state: RoomState, seatId: string)` gaining no new params, but a *different* touched function's signature changing) can silently break one of these `indexOf`-based slices, producing a test that either throws confusingly (`nextExportIdx === -1` fallback) or silently scopes to zero lines.
**Why it happens:** These are string-literal anchors, not AST-aware; they were written against the exact current signatures.
**How to avoid:** After any signature change to `room-do.ts`/`room-state.ts`/`seat-projection.ts` functions named in `source-structure.test.ts`'s `indexOf` calls, re-run `apps/worker/src/source-structure.test.ts` specifically and read its failure output carefully — a `toBeGreaterThanOrEqual(0)` assertion failing on an `indexOf` call is the signal this pitfall has occurred, not a signal the underlying invariant is actually violated.
**Warning signs:** Any `source-structure.test.ts` failure whose message mentions "expected an `async X(...)` definition" rather than a call-count mismatch — that is an anchor-string breakage, not a real chokepoint violation.

### Pitfall 3: the D-07 error-namespace restructuring reopens the free-text leak D-08 (Phase 2) closed
**What goes wrong:** Widening `ErrorDetailSchema` from a flat enum to a per-game shape is tempting to implement as `z.object({ gameId: GameIdSchema, code: z.string() })` (a "practical enough" widening) rather than a true closed discriminated union — this reintroduces exactly the free-text channel Phase 2's D-08 was written to prevent, since `code: z.string()` accepts anything.
**Why it happens:** A discriminated union keyed on `gameId` with per-game closed code enums is more code to write than a loose `{ gameId, code: string }` shape, and both satisfy "the error frame carries a gameId and a code" at a glance.
**How to avoid:** Use `z.discriminatedUnion("gameId", [z.object({ gameId: z.literal("hanabi"), code: HanabiErrorCodeSchema }), ...])` — mirroring the existing `ClientMessageSchema`/`ServerMessageSchema` discriminated-union pattern already used twice in this same file. Each game's registry entry should export its own closed `z.enum([...])` for its error codes, exactly like `ErrorDetailSchema` does today for Hanabi's 9 codes.
**Warning signs:** Any `z.string()` (unconstrained) appearing anywhere in the new error-detail schema — this codebase's own established convention (confirmed by reading `messages.ts`'s doc comments on `ErrorDetailSchema`) is zero tolerance for free-text in error frames.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vitest's module resolution (alias-based, reading `src/index.ts` directly) is unaffected by adding `composite: true`/`declarationDir` to `packages/schema` and `packages/rules`'s tsconfig files | Root tsconfig.json §4 | LOW — Vitest's `vitest.config.ts` aliases are independent of `tsconfig.json`'s `outDir`, but this was not re-verified with an actual `npm test` run after the hypothetical change in this research session (only `tsc -b` was tested); if wrong, Vitest would need its own config adjustment, a small follow-up task |
| A2 | `apps/worker/src/seat-naming.ts`'s `MAX_PLAYERS` usage is a display-label-suffix ceiling, not a seat-limit gate that would need per-game logic | Exact File Inventory § MIN_PLAYERS/MAX_PLAYERS | LOW-MEDIUM — if this file actually gates something seat-limit-related rather than cosmetic, it needs the same `resolveGame(...)` treatment as `room-state.ts`; the planner should read this file directly at plan time rather than trust this inference, since it was not opened in this research session |
| A3 | Cloudflare Workers' `process.env`-based environment detection (for gating `registerTestGame`/toy-game registration) works the same way `apps/worker/src/origin.ts`'s existing environment-conditional logic already relies on | Test-Only Registry Injection Point | MEDIUM — if `origin.ts`'s mechanism is different from a simple `process.env.NODE_ENV` check (Workers don't always have Node's exact env semantics), the recommended guard needs to match whatever mechanism `origin.ts` actually uses; the planner should read `origin.ts` directly before implementing this guard |
| A4 | The query-param + `history.replaceState` approach for D-17 is lower-risk than the cookie approach for this specific codebase | MGR-08 Root Cause and Fix | LOW — this is stated as a recommendation with reasoning, not a verified fact; D-17 explicitly leaves the choice to the planner, so this is not blocking, just a documented opinion |

**If this table is empty:** N/A — see above, four items logged.

## Open Questions (RESOLVED)

1. **Exact toy-game fixture location and shape**
   - What we know: CONTEXT.md explicitly leaves this to Claude's Discretion; the prior toy-game precedent (`forehead-card.ts`) was deleted and its exact filename should not be resurrected per `source-structure.test.ts`'s own D-01/D-03 checks.
   - What's unclear: whether the toy game's fixtures should live under `apps/worker/src/` (co-located with the tests that use it) or in a new `packages/rules/src/test-fixtures/` (parallel to the deleted `forehead-card.ts`'s original location).
   - Recommendation: co-locate with `apps/worker/src/room-state.test.ts` (or a small sibling fixture file in `apps/worker/src/`) since D-10's five required test behaviors are all worker-layer (registry dispatch) concerns, not rules-engine concerns — the toy game does not need real game logic, just a minimal `GameAdapter` implementation with distinguishable seat limits/config/error codes.
   - RESOLVED: plan 08-07 puts the toy game in `apps/worker/test/toy-game.ts` (worker-layer, outside `src/` so no production file can import it, and so a second `toPlayerView(` occurrence never lands in `src/`, which would break source-structure assertion A5); its tests live in `apps/worker/src/registry.test.ts`.

2. **Whether `apps/worker/src/seat-naming.ts`'s `MAX_PLAYERS` usage needs the registry treatment**
   - What we know: it's listed in the grep inventory; not independently read in this session (see Assumption A2).
   - What's unclear: whether it's cosmetic (label suffix ceiling) or load-bearing (a seat-limit gate).
   - Recommendation: planner reads this file directly before writing the task list; likely a one-line change either way, but the task should not be silently dropped from the plan.
   - RESOLVED: cosmetic — `MAX_PLAYERS` appears only in a doc comment in `seat-naming.ts` (no import; orchestrator-verified). Plan 08-03 Task 2 rewords that comment to "the room's game seat limit (at most 5 for Hanabi)"; no code change.

## Environment Availability

Skipped — this phase has no new external tool/service dependencies. All work uses the existing installed toolchain (`wrangler`, `next`, `vitest`, `playwright`, `typescript`), already verified present and working in this session (`tsc -b` ran successfully against the real tree; `npm test`/`npm run test:e2e` scripts already exist and are unchanged in shape).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No — this phase has no auth changes (seat tokens are unchanged, D-01/D-07 pre-existing patterns) | — |
| V3 Session Management | Partial — the D-17 cookie option (if chosen) introduces a new short-lived cookie; must be scoped narrowly (single room code, short TTL, not a session-wide cookie) | Next.js `cookies()` API with explicit `maxAge`/`path` scoping |
| V4 Access Control | Yes — first-join `gameId` write-once semantics (D-01), host-only `set_config` (mirrors existing host-only `set_variant` gate in `setVariant`/soon `setConfig`) | Existing `actorSeatId !== state.hostSeatId` check pattern, unchanged, extended to `setConfig` |
| V5 Input Validation | Yes — every new/changed wire field (`gameId` on join, `config` on `set_config`, per-game view schemas) | Zod `strictObject`/closed enums/discriminated unions, matching this codebase's existing 100%-Zod-validated wire boundary |
| V6 Cryptography | No — no crypto changes in this phase | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Room-game hijack via a later join's `gameId` field | Tampering | D-01: server-side write-once check on `state.gameId`, ignoring any later client-supplied value (see Threat Model Input table above) |
| Config injection (client sends a config shaped for a different game than the room's actual `gameId`) | Tampering | Per-game `configSchema.safeParse` before any mutation, fail-closed to `bad_request` |
| Old-client wire-shape confusion during the D-15 deploy window | Tampering / Denial of Service | Existing `ClientMessageSchema.safeParse` fail-closed parsing (unchanged mechanism, already proven) |
| Test-only toy game reachable in production | Elevation of Privilege (an unintended, unaudited game becomes playable) | Runtime assertion guard on `registerTestGame` (§Test-Only Registry Injection Point) plus the existing static `source-structure.test.ts` confinement pattern, as defense-in-depth |

## Sources

### Primary (HIGH confidence — direct repository reads and live experiments this session)
- Direct reads: `apps/worker/src/{game-registration,room-state,seat-projection,persistence,source-structure.test}.ts`, `apps/worker/src/room-do.ts` (targeted `onStart`/`createEmptyRoom` grep), `packages/schema/src/{room,messages,constants}.ts`, `packages/rules/src/adapter.ts`, `apps/web/{app/page.tsx,app/api/room/route.ts,app/room/[code]/RoomClient.tsx,components/Lobby.tsx,lib/pending-variant.ts,lib/seat-token.ts,lib/room-socket.ts}`, `apps/worker/src/persistence.test.ts`, `vitest.config.ts`, `playwright.config.ts`, `package.json` (root + all four workspaces), `tsconfig.base.json` + all four package `tsconfig.json` files
- Live experiments (this session, in the real repo tree, fully cleaned up afterward — verified via `git status --short`): (1) `npm run typecheck` against the current tree, confirming `TS5083` (no root tsconfig); (2) `tsc -p packages/rules/tsconfig.json --noEmit` and the schema equivalent, confirming clean standalone baselines; (3) a full `tsc -b` project-reference build with temporary composite tsconfigs for all four packages, confirming the exact `composite`+`noEmit: false` requirement (`TS6310` reproduced and then resolved) and confirming `apps/web`/`apps/worker` do not need `composite: true` as leaf references
- `node_modules/next/package.json` — confirmed installed Next.js version `16.3.4`
- `node_modules/next/dist/docs/01-app/02-guides/{forms,server-actions}.md`, `node_modules/next/dist/docs/01-app/03-api-reference/02-components/form.md` — bundled docs for the installed version, per `apps/web/AGENTS.md`'s explicit instruction to read these rather than rely on training data

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` §1 (milestone-level integration research) — the target design this research builds on and does not redevelop; confidence inherited as stated there (HIGH on file-level integration points, MEDIUM on exact Expedition schema field lists, not relevant to this phase's Hanabi-only scope)
- `.planning/research/PITFALLS.md` Pitfalls 16/17 — read in full; Pitfall 16 is addressed by this phase's D-13 (schema-version reset, not migration, per the owner's explicit override of the pitfall's original migration-focused recommendation); Pitfall 17 is addressed by D-07/D-11's discretion to keep the registry genuinely open-ended

### Tertiary (LOW confidence)
- None — every claim in this document traces to a direct repository read, a live experiment, or the CONTEXT.md/ARCHITECTURE.md documents explicitly provided as canonical references.

## Metadata

**Confidence breakdown:**
- Standard stack / exact file inventory: HIGH — direct greps and reads against the live tree, cross-checked
- Root tsconfig.json project-reference design (MGR-07): HIGH — verified via live `tsc -b` experiments in this session, not documentation-derived
- MGR-08 root cause and Next.js 16 mechanism: HIGH on the root cause (direct code read revealing two compounding causes, not one); HIGH on the Server Actions progressive-enhancement mechanism (read from installed-version docs per project convention); MEDIUM on the cookie-vs-replaceState recommendation (explicitly a judgment call, correctly left to planner discretion by D-17)
- Test-only registry injection point (D-10): MEDIUM — the design is structurally sound against existing patterns (source-structure.test.ts's confinement style, playwright.config.ts's `--var` precedent) but the exact env-detection mechanism needs confirmation against `origin.ts` at plan/implementation time (Assumption A3)
- D-13 test pattern: HIGH — directly copied from an existing, working precedent in the same file (`persistence.test.ts`'s Phase 7 stack-shape-swap test)

**Research date:** 2026-09-22
**Valid until:** 30 days (stable, internal-refactor-only phase; no external ecosystem dependencies that could drift) — but re-verify against the live tree if any other phase-8-adjacent work lands on `main` before planning executes, since several assertions here are keyed to exact current line numbers/file contents that could shift.
