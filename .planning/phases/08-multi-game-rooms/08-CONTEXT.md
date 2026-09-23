# Phase 8: Multi-Game Rooms - Context

**Gathered:** 2026-09-22
**Status:** Ready for planning
**Mode:** `--auto --chain`. Every gray area below was resolved by taking the recommended option without prompting, and each choice is logged in `08-DISCUSSION-LOG.md`. Owner-level decisions from milestone setup (2026-09-22) are carried forward, not re-asked.

<domain>
## Phase Boundary

The room layer carries a `gameId`, and each game brings its own settings, seat limits, view schema and error vocabulary from a registry. Hanabi is re-registered through the registry and plays exactly as before. The registry is proven with a test-only second game. Expedition is **not** registered in production in this phase (its adapter arrives in Phase 11); its landing-page option is visible but disabled until Phase 12.

Also in scope, as folded-in v1.0 debt:
- MGR-07: a root `npm run typecheck` that works.
- MGR-08: a "Create room" that is usable promptly under load, fixed at the cause.

Requirements: MGR-01 … MGR-08.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (owner, 2026-09-22 — locked)
- **Saved rooms reset on deploy** (MGR-06): bump the schema version so pre-change rooms reset to an empty lobby through the existing D-17 path. No migration code. The deploy is timed for when no game is in progress.
- **Expedition is not offered until it's playable**: its picker option stays disabled ("coming soon") until Phase 12. The registry is proven with a test-only second game (roadmap adjustment, 2026-09-22).
- **Hanabi behaves exactly as before** (MGR-04). `packages/rules/src/hanabi/**` has no behavioural changes, and the existing suites pass with only fixture-rename diffs.

### How the game reaches the room
- **D-01:** The host's game choice travels as an optional `gameId` on the host's first `join` message. `joinRoom` records it only on the room's very first join, mirroring how `hostSeatId` is set today. Every later join — including reclaims — ignores any `gameId` it carries, so a joiner can never assert or change the room's game. No new wire message type.
- **D-02:** The landing page stores the chosen game next to the pending variant (the same `localStorage` pattern as `lib/pending-variant.ts`). `useRoomSocket` attaches it to the `join` frame, the way it already attaches `seatToken` and `joinId`.
- **D-03:** `POST /api/room` accepts and validates `gameId` plus that game's config, and still only mints a room code; no Worker call is added. An empty room defaults to `hanabi` until the first join overwrites it.

### Room envelope and wire shape
- **D-04:** `RoomState` and `RoomView` gain a `gameId`. The top-level Hanabi-specific `variant` field is replaced by an opaque `config`, validated against the room's game `configSchema`, fail-closed. `set_variant` generalises to `set_config`. Hanabi's config value is its existing `Variant`, and its adapter receives it unchanged.
- **D-05:** `RoomView` also carries the game's seat limits (`{ min, max }`, from the registry), so the web app never duplicates registry data. `Lobby.tsx` stops importing the global `MIN_PLAYERS`/`MAX_PLAYERS` and uses the view's limits and the game's display name. This fixes today's hard-coded "Hanabi needs 2 to 5" copy.
- **D-06:** `GameAdapter` gains type parameters for config, end result and error (`TConfig`, `TEndResult`, `TError`). The room layer keeps checking only `checkGameEnd(...) !== null` (confirmed: one call site, `room-state.ts:461`).
- **D-07:** Errors are namespaced per game on the wire as `{ gameId, code }`. Each registry entry supplies its own closed code enum and mapper. This avoids a flat union that grows with every game (research open question; Pitfall 17). Hanabi's existing codes keep their names inside its namespace.

### Registry and the test-only second game
- **D-08:** `apps/worker/src/game-registration.ts` becomes a registry keyed by `gameId`. Each entry holds the adapter, view schema, config schema, default config, min/max players, error mapper and display name. It stays the only non-test file allowed to name a specific game.
- **D-09:** The production registry contains **Hanabi only** in this phase. `GameIdSchema` lists only production-registered games; Expedition joins the enum and the registry in Phase 11.
- **D-10:** A minimal **test-only toy game** proves the registry end to end: different seat limits (e.g. 3–4), its own config and view schemas, and its own error codes. It is wired in through a test-only registry injection point and is never reachable from the production bundle or wire enum. Tests cover:
  - a per-game seat limit enforced on join and start
  - per-game config validation, fail-closed
  - per-game view-schema dispatch, fail-closed
  - the first join locking the room's game, and a later join unable to change it
  - two rooms of different games coexisting
- **D-11:** There is no `gameId === "…"` branching outside the registry (Pitfall 17). On the web side, `RoomClient.tsx` picks the board component from a small component map keyed by `gameId` rather than an if/else. Hanabi is the only entry today.

### Landing page
- **D-12:** The game picker lists **Hanabi** (enabled) and **Expedition** (disabled, labelled "coming soon"), replacing the Innovation option. The option list is client-side; Phase 12 enables Expedition. Each game's settings fieldset (Hanabi's variant radios) comes from a per-game lookup rather than an `isHanabi` conditional.

### Deploy and persisted state (MGR-06)
- **D-13:** Bump `ROOM_SCHEMA_VERSION` from 4 to 5. A test proves that a real pre-change (v4) persisted Hanabi blob resets cleanly to an empty lobby: no crash, no partial state, no deserialising of the old blob. This replaces the research's "old room rehydrates" check (Pitfall 16), which assumed migration.
- **D-14:** Deploy order is unchanged: worker first, then web, because the wire schema changes. `docs/deployment.md` gains a pre-deploy checklist item: "schema-version bump — confirm with the owner that no game is in progress". **The executor does not deploy**; deploying is a separate owner go-ahead.
- **D-15:** During the brief window where an old cached web client talks to the new worker, strict schemas must fail closed (a refusal or error frame), never crash the Durable Object.

### Root typecheck (MGR-07)
- **D-16:** Add a root `tsconfig.json` with project `references` to the four package tsconfigs, so `npm run typecheck` (`tsc -b`) passes from the repo root. Verify that all four packages still build individually as well.

### "Create room" reliability (MGR-08)
- **D-17:** Fix the cause. "Create room" must work *before* hydration instead of staying disabled until it. Use progressive enhancement: the form submits natively to a server endpoint that mints the code and redirects to `/room/{code}`, with the JS handler kept as an enhancement. Constraint: the display name, game and config must reach the room page **without ending up in the shareable room link** (Copy link uses `window.location.href`). A short-lived cookie, or a parameter stripped with `history.replaceState` before the lobby renders, are both acceptable; the planner chooses.
- **D-18:** Acceptance: the full e2e suite at default parallelism passes three consecutive runs with no create-room timeout, and no retries are added anywhere.

### Claude's Discretion
- File and type naming (keep `game-registration.ts`, or rename it and update the source-structure tests to match).
- The exact shape of the test-only toy game, and where its fixtures live.
- Whether the global `MIN_PLAYERS`/`MAX_PLAYERS` are deleted or moved into Hanabi's schema module, as long as nothing outside the registry reads them.
- Plan granularity and wave structure.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design and scope
- `docs/superpowers/specs/2026-09-22-expedition-design.md` §2 — sub-project 1 (multi-game rooms) scope; §10 decisions log, including the milestone scoping decisions
- `.planning/REQUIREMENTS.md` — MGR-01 … MGR-08 (MGR-01 is amended: Expedition stays disabled until Phase 12)
- `.planning/ROADMAP.md` — Phase 8 goal and success criteria

### Research
- `.planning/research/ARCHITECTURE.md` §1 (1.1–1.9) — file-level integration plan for the registry, `gameId` on join, envelope changes, seat limits, view validation, end result, landing/lobby. **Exception:** its schema-bump rationale is kept, but D-13's reset test replaces any rehydration expectation.
- `.planning/research/PITFALLS.md` — Pitfall 16 (live Hanabi state; adapted by D-13) and Pitfall 17 (no re-specialisation to "Hanabi + Expedition"; D-07, D-11)
- `.planning/research/SUMMARY.md` — open questions resolved here (error namespacing: D-07)

### v1.0 context and debt
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md` — the root-tsconfig and Create-room flake entries (MGR-07/08)
- `.planning/RETROSPECTIVE.md` — lesson 2: prove "game-agnostic" with a second game; stale e2e locator anti-pattern (update every consumer in the same commit)
- `docs/deployment.md` — deploy procedure to extend (D-14)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/lib/pending-variant.ts`: the pattern for carrying a landing-page choice into the room's first join, reused for the pending game (D-02).
- `apps/web/lib/room-socket.ts` `onOpen`: already attaches `seatToken`/`joinId` to every `join`; `gameId` rides the same path.
- `apps/worker/src/persistence.ts` `loadRoom`: the schema-version reset path (D-17 in v1.0) that D-13 relies on.
- `apps/worker/src/seat-projection.ts` `validateGameView`: fail-closed view validation; becomes a per-game dispatch with a one-line change.
- `apps/web/lib/room-store.ts`: already game-agnostic (`view: RoomView | null`), with no changes expected.

### Established Patterns
- **Single call sites enforced by source-scan tests:** one `#send`, one `projectSeatView`, one registration point, one alarm writer. The registry must keep "only `game-registration.ts` names a game", with the test updated rather than removed.
- **Strict Zod unions, fail-closed:** every schema change keeps `strictObject` and closed enums.
- **Update every consumer in the same commit** as a behaviour change, including e2e specs and `apps/web/lib/*.test.ts` (v1.0 anti-pattern).
- **Kill dev servers on 3100/8787 by PID** before any Playwright run (v1.0 anti-pattern).

### Integration Points
- `packages/schema/src/room.ts`, `messages.ts`, `constants.ts`: the envelope, wire messages, schema version, seat constants.
- `packages/rules/src/adapter.ts`: `GameAdapter` generics.
- `apps/worker/src/game-registration.ts`, `room-state.ts` (`createEmptyRoom`, `joinRoom`, `setVariant`→`setConfig`, `startGame`, `applyGameAction`, `mapAdapterError`, `toSeatView`), `seat-projection.ts`, `room-do.ts` (`onStart` default room).
- `apps/web/app/page.tsx` (picker, the hydration gate D-17 replaces), `apps/web/app/api/room/route.ts`, `apps/web/app/room/[code]/RoomClient.tsx` (board map), `apps/web/components/Lobby.tsx` (seat limits, settings fieldset).
- Tests expected to change (fixture renames only): `apps/worker/src/room-state.test.ts`, `seat-projection.test.ts`, `packages/schema/src/room.test.ts`, `messages.test.ts`, plus e2e specs that pick a variant (`e2e/helpers.ts` `createRoom`).

</code_context>

<specifics>
## Specific Ideas

- The lobby redesign shipped on 2026-09-19 (fireworks backdrop, open-seat placeholders, segmented variant picker) must keep looking and behaving the same for Hanabi. Only its data source for limits and settings changes.
- "Coming soon" for Expedition should match how Innovation's disabled option looked in the picker.

</specifics>

<deferred>
## Deferred Ideas

- Registering Expedition's adapter and adding it to `GameIdSchema`: Phase 11.
- Enabling the Expedition picker option: Phase 12.
- Migrating saved rooms across schema changes: rejected by the owner for this milestone (reset on deploy). Revisit only if resets ever hurt a live game.

</deferred>

---

*Phase: 08-multi-game-rooms*
*Context gathered: 2026-09-22*
