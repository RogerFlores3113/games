# Phase 2: Per-Seat Redaction Contract - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning
**Mode:** `--auto --chain` — every gray area resolved to its recommended option without interactive questions. Review the decisions below; any can be overturned before or during planning.

<domain>
## Phase Boundary

This phase replaces the D-15 shared-counter placeholder with a **toy secret-holding game** and proves the whitelist-serialize per-seat projection pattern end to end:

- a seat's own secret never reaches that seat's socket, and the hidden entry **structurally lacks** the identity field (HIDE-01, HIDE-03)
- every outbound frame — `joined`, live `state`, reconnect, `refused`, `superseded`, `error` — leaves the worker through one chokepoint, with no bypass path (HIDE-02)
- an automated leak test, run as part of the normal test suite, fails the build if any seat view contains that seat's own secret (HIDE-04)

**Not in this phase:** Hanabi rules (Phase 3), HIDE-05's action-vs-state-assertion rejection for the real engine (Phase 3 — although the existing `unknown`-request boundary must not be eroded), reconnect/multi-tab hardening (Phase 5), and real board UI (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Toy secret game shape
- **D-01:** The toy game is a Hanabi-shaped **"forehead card"** game. Each seat holds one hidden card that **every other seat can see and its owner cannot**. A shared draw deck, built from the server-minted seed, is hidden from everyone. On their turn, the active player guesses their own card's value. Whether the guess is right or wrong, the card is **revealed publicly** (it moves to a public "revealed" pile/score) and the player draws a replacement. The game ends when the deck runs out; `checkGameEnd` returns a score, which exercises the `ended` status path. This deliberately mirrors Hanabi's three visibility classes: visible to others but not self, hidden from all (the deck), and public after a transition.
- **D-02:** The D-15 counter is **deleted**, not kept alongside the toy: `packages/rules/src/counter-game.ts` and its tests, `apps/web/components/CounterGame.tsx`, and the counter exports in `packages/rules/src/index.ts`. The `const adapter = counterGame` line in `apps/worker/src/room-state.ts` switches to the toy adapter, and the `CounterState`/`CounterAction` casts there go away with it. E2E specs that drive the counter (`e2e/start-game.spec.ts`, `e2e/in-progress-arrival.spec.ts`) are updated to the toy.
- **D-03:** The toy is **minimally playable in the browser**. It shows other seats' cards face up, the viewer's own card as a face-down placeholder, the revealed pile/score, a turn indicator, and one guess control per possible value. Styling stays at the same deliberately bare level as `CounterGame.tsx` on the existing Phase 1 theme tokens. It exists to be deleted in Phase 4, not to look finished.
- **D-04:** Every card instance, including hidden ones, carries an **opaque card id** that the client can use as a React key and that Phase 6's clue memory will need. The id **must not correlate with identity**. It is assigned at deal/draw time and must never be the card's pre-shuffle deck index or anything else derivable from the deck composition. A predictable id is a leak.

### Wire-level enforcement (HIDE-03)
- **D-05:** `toPlayerView` builds views by **explicit whitelist construction**, copying named fields one by one. Spread (`...card`), `omit`, `delete`, and "set to null/undefined" are forbidden in projection code. A hidden card is a **distinct shape** (discriminated union: e.g. `{ id, hidden: true }` vs `{ id, hidden: false, value }`) whose hidden variant has no identity key at all.
- **D-06:** Game views are validated on every send by a **strict (unknown-key-rejecting) Zod schema**. `RoomViewSchema.game` stays generic (`z.unknown()` at the room layer, preserving FDN-01), but the send path also runs the active game's strict view schema, so a stray `value` key on a hidden card fails validation. `packages/rules` stays zero-dependency (FDN-02), so the Zod view schema cannot live there. It lives in a **game-namespaced module** that the room/transport code reaches only through a single adapter registration point, never by importing game specifics throughout generic code.
- **D-07:** Validation **fails closed**. If a projected view fails its schema, that connection gets an `error` frame and no view, and the failure is logged. There is no fallback to sending the unvalidated or raw object.

### Single outbound chokepoint (HIDE-02)
- **D-08:** Exactly **one method in the worker calls `connection.send`** (e.g. a private `#send(connection, frame)` in `apps/worker/src/room-do.ts`). The `joined`, `state`, `refused`, `superseded`, and `error` frames all pass through it. Frames that carry a room view can get that view only from `#viewFor` → `toSeatView` → `adapter.toPlayerView`. Frames without a view (`refused`, `superseded`, `error`) are built from closed strict schemas with no state-bearing fields. HIDE-02's "error responses" clause is satisfied by guaranteeing error frames can never carry state; if an error ever needs game context, that context comes through projection.
- **D-09:** "No bypass" is proven by a **structural source test in the normal Vitest suite**, which fails the build. It extends Phase 1's grep-verifiable single-call-site convention: in `apps/worker/src`, excluding tests, `connection.send(` / `.send(` occurs exactly once, `toSeatView(` has exactly one call site, `toPlayerView(` is called only from `toSeatView`, and partyserver's room-wide `broadcast(` appears **zero** times. Adding type-level branding of projected views on top is Claude's discretion; the structural test is required.
- **D-10:** Join, live update, and reconnect all use the same `#viewFor` path. Phase 1 already made first join and reconnect the same `join` handler (RT-05 groundwork), and this phase must not introduce a separate resume serializer.

### Leak test strategy (HIDE-04)
- **D-11:** The leak test is **layered**, and every layer runs in the standard `npm test`:
  1. **Adapter property test (fast-check):** from any seeded initial state advanced by random legal action sequences, for every seat, `toPlayerView` contains no identity on that seat's own card, and no deck contents or seed appear anywhere.
  2. **Wire-level property test:** the same generated states through `toSeatView` + `encodeServerMessage`, checked on the **encoded JSON string** that would actually be sent.
  3. **Integration test against a running worker** (the `wrangler dev` pattern from `apps/worker/src/room-do.test.ts`): capture the real frames each seat receives on initial join, a live update after an action, and a reconnect via seat token, then run the same leak checker over them.
- **D-12:** The leak checker asserts **both** structural absence (the own card's entry has no identity key: `!("value" in entry)`, not `entry.value === undefined`) **and** the absence of the true secret in the raw serialized string. Secret values in the toy must not collide with other numbers legitimately present in a view, such as seat counts or scores. Test fixtures therefore use distinctive secret values or identity tokens so a raw-string scan cannot pass or fail by coincidence. The exact technique is the planner's call.
- **D-13:** The leak checker must be **proven able to fail**. A canary test runs it against a deliberately leaky projection (own value included, and separately `value: null`/`undefined` present) and asserts that it reports a leak.
- **D-14:** The server-only seed (`RoomState.seed`, WR-07) and the undealt deck order fall under the leak checker's "never in any view" rule too, for every seat.

### Claude's Discretion
- Exact toy rules within D-01: value range, deck size and composition, and scoring.
- Module location and naming for the toy adapter and its Zod view schema, within D-06's constraints (rules package stays zero-dependency; one registration point).
- Whether to generify the adapter typing in `room-state.ts` (removing the `as CounterState` cast pattern) or keep a single module-level adapter constant.
- Whether to add a branded `SeatProjection` type in addition to D-09's structural test.
- Number of fast-check runs and shrinking configuration.
- Minimal toy UI layout within D-03.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and requirements
- `.planning/PROJECT.md` — the Correctness constraint (a client must never receive its own hand's card identities) and the game-agnostic Extensibility constraint.
- `.planning/REQUIREMENTS.md` — HIDE-01…HIDE-04 are this phase's requirements. HIDE-05 (Phase 3) and FDN-01/FDN-02 are constraints it must not break.
- `.planning/ROADMAP.md` § "Phase 2: Per-Seat Redaction Contract" — goal and the three success criteria.

### Stack and patterns
- `CLAUDE.md` § "What NOT to Use" — the forbidden shared-state broadcast, and `toPlayerView(state, seatId)` per seat as the required pattern.
- `CLAUDE.md` § "Testing Approach for the Rules Engine" — fast-check for hand-visibility redaction invariants.
- `CLAUDE.md` § "Shared Types Strategy" — `packages/rules` (zero-dependency, pure) vs `packages/schema` (Zod wire protocol).

### Prior phase decisions
- `.planning/phases/01-room-transport-skeleton/01-CONTEXT.md` — D-15 (counter is meant to be deleted in Phase 2), D-05/D-08 (seat token, supersede), D-17 (schema-version reset on persisted-state mismatch; the adapter swap changes `adapterId`, so persisted counter rooms must reset cleanly).

### Code that is the contract
- `packages/rules/src/adapter.ts` — the `GameAdapter` interface and its three invariants (no mutation, hostile `request`, `toPlayerView` is the only exit).
- `apps/worker/src/room-state.ts` — `toSeatView` (the sole serializer) and the module-level `adapter` constant this phase swaps.
- `apps/worker/src/room-do.ts` — `#viewFor` / `#pushState` / `#handleJoin` and every current `connection.send` call site that D-08 consolidates.
- `packages/schema/src/messages.ts` and `packages/schema/src/room.ts` — `encodeServerMessage`, the strict server frame schemas, and `PublicSeatSchema`'s independent-declaration whitelist precedent.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GameAdapter` interface (`packages/rules/src/adapter.ts`): the toy implements it unchanged. `createInitialState` already takes the secret `seed` string.
- `mintGameSeed` (`apps/worker/src/seat-identity.ts`) and `RoomState.seed`: a server-only seed already exists for the toy's deterministic deck.
- `encodeServerMessage` (`packages/schema/src/messages.ts`): already validates frames before stringifying. This is the natural place to attach D-06's game-view validation.
- The `wrangler dev` integration-test harness in `apps/worker/src/room-do.test.ts`, reusable for D-11 layer 3.
- `CounterGame.tsx` / `RoomClient.tsx` / `room-store.ts`: the client render path the toy UI replaces, keeping the thin server-pushed-view cache.

### Established Patterns
- Whitelist declaration: `PublicSeatSchema` is declared independently of `SeatSchema`, never via `.omit()`. D-05/D-06 extend this to game views.
- Grep-verifiable single call sites: `room-do.ts` already documents "exactly one `toSeatView(` call site" and "exactly one alarm-arming call site". D-09 turns this into an enforced test.
- `z.strictObject` for every wire frame, and hostile-input parsing that never throws.
- Exact version pins for dependencies (fast-check must be pinned exactly when added).

### Integration Points
- `apps/worker/src/room-state.ts` line `const adapter = counterGame;`: the one-line swap point.
- `apps/worker/src/room-do.ts`: `connection.send` currently appears at many sites (error, refused, superseded, joined, state), all of which move behind D-08's single method.
- `apps/web/app/room/[code]/RoomClient.tsx`: renders `CounterGame` once `status === "in_progress"`; it will render the toy instead.
- `apps/worker/src/persistence.ts` / D-17: persisted rooms carrying `adapterId: "counter"` must reset rather than deserialize into the toy.

</code_context>

<specifics>
## Specific Ideas

- The toy should be **Hanabi-shaped on purpose** ("you see everyone's card but your own"). The redaction code proven here is then the same shape Phase 4 needs, not a private-hand pattern that would have to be rethought.
- A leak test that has never failed proves nothing, hence D-13's canary.
- The `value: null` / `value: undefined` case is exactly what HIDE-03 forbids, so the checker must flag key presence and not just truthy values.

</specifics>

<deferred>
## Deferred Ideas

- **Playwright network-payload capture test** (inspecting frames in a real browser's DevTools protocol). Considered for D-11. The wrangler-dev frame capture already exercises the real wire, so a browser-level check is optional hardening for Phase 5 or 6 if wanted.
- **Distinguishing adapter refusal reasons on the wire** (today every `AdapterError` collapses to `bad_request`). Not a redaction concern; revisit when Phase 4/6 need player-facing rule-refusal messages.

</deferred>

---

*Phase: 02-per-seat-redaction-contract*
*Context gathered: 2026-09-15*
