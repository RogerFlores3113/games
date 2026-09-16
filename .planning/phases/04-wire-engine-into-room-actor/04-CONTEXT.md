# Phase 4: Wire Engine Into Room Actor - Context

**Gathered:** 2026-09-16
**Status:** Ready for planning
**Mode:** `--auto --chain` — every gray area resolved to its recommended option without interactive questions. Review the decisions below; any can be overturned before or during planning.

<domain>
## Phase Boundary

This phase deletes the forehead-card toy and calls the **real Hanabi engine** through the existing game-adapter seam, producing a live, playable base-game Hanabi table. It covers RT-01 (actions appear on every screen without a refresh), RT-03 (refresh mid-game rejoins the same seat with full state), and RT-09 (a double-sent action applies exactly once).

**Explicitly not in this phase:**
- **No designed board.** The interface here is deliberately rough and functional — enough to play. UI-01…UI-11 and RULES-11 (illegal actions visibly disabled) are Phase 6, which owns the colorblind glyph system and the luminosity theme.
- **No reconnect hardening.** RT-04/RT-05/RT-06/RT-08 — mobile backgrounding, multi-tab, the disconnected indicator — are Phase 5. RT-03's plain refresh is in scope here; the rest is not.
- **No variant proving.** Rainbow and Black stay selectable and will work through the parametrized engine, but RULES-14/UI-07 and end-to-end variant proof are Phase 7. Base is what this phase proves.
- **No rules changes.** The engine shipped in Phase 3 and is not reopened here; if a rules bug surfaces, fix it in `packages/rules` with a test, but do not redesign.

</domain>

<decisions>
## Implementation Decisions

### Deleting the toy (the Phase 2/3 scaffolding)
- **D-01:** The forehead-card toy is **deleted outright**, not left beside the engine: `packages/rules/src/forehead-card.ts`, `forehead-card-leak-check.ts`, `forehead-card.property.test.ts` and their tests, `packages/schema/src/games/forehead-card.ts` and its test, `apps/web/components/ForeheadCardGame.tsx`, and every export of those names from `packages/rules/src/index.ts`. Phases 2 and 3 both promised this deletion; it happens here.
- **D-02:** The toy's **leak-test coverage must be repointed, not deleted with it.** `apps/worker/src/redaction-wire.test.ts` (wire-level property) and the frame-capture test in `apps/worker/src/room-do.test.ts` currently prove redaction using the toy's checker. They must be rewritten against `checkHanabiViewForLeaks` / `secretsForHanabiSeat` **before or in the same change as** the deletion, so the wire-level leak proof is never absent from the suite. Deleting the toy without this would silently remove the HIDE-01 evidence on the wire.
- **D-03:** `apps/worker/src/source-structure.test.ts` keeps enforcing the chokepoint counts unchanged (one `.send(`, one `encodeServerMessage(`, one `toSeatView(`, one `projectSeatView(`, zero `broadcast(`), with its game-naming confinement check repointed from the toy to Hanabi in `game-registration.ts`.

### Wiring the engine in
- **D-04:** The swap happens in **`apps/worker/src/game-registration.ts` and nowhere else** in the worker: its imports become `hanabiGame` plus the new Hanabi view schema, and `ActiveGameState` becomes `HanabiState`. `room-state.ts`, `seat-projection.ts` and `room-do.ts` must not learn the game's name — that is what Phase 2 built the registration point for. Keep the file's compile-time assignability assertions, repointed to `HanabiView` / the new wire type.
- **D-05:** A new **`packages/schema/src/games/hanabi.ts`** strict view schema mirrors the toy's discipline exactly: `z.strictObject` at every nesting level and a `z.discriminatedUnion("hidden", …)` for cards, so a card in the viewer's own hand structurally cannot carry `suit` or `rank`. It ships with its subpath export, the `tsconfig.base.json` path entry, and the alias in all four Vitest projects — with the subpath alias ordered **before** the bare `@games/schema` alias, since Vite matches by prefix in insertion order.
- **D-06:** `ROOM_SCHEMA_VERSION` is **bumped again** so rooms persisted with the toy's state reset to an empty lobby on deploy rather than being handed to the Hanabi adapter (the D-17 reset path from Phase 1, reused exactly as in Phase 2).

### Exactly-once actions (RT-09)
- **D-07:** The client mints an **opaque `actionId` per user intent** (a nanoid, minted when the player commits to an action, reused verbatim on any retry) and sends it alongside the action. `GameActionMessageSchema` gains a bounded, validated `actionId` string. It is an idempotency key only: it never reaches the adapter, never influences game logic, and carries no state — preserving the HIDE-05 boundary that a client requests actions and never asserts results.
- **D-08:** The Durable Object records the **last applied `actionId` per seat in persisted room state**. A `game_action` whose `actionId` matches that seat's last applied id is **not re-applied**; the server re-sends that seat's current view instead of an error, so a retry after a dropped response looks like success to the player. Persisting it (rather than holding it in memory) is required — hibernation wipes memory, and a retry commonly arrives after exactly that.
- **D-09:** Why an explicit key rather than relying on the engine: a repeated **play or discard** is naturally rejected because the card has left the hand, but a repeated **clue is perfectly legal and would spend a second token**. Natural rejection is therefore not sufficient, and the test for this must double-send a *clue*, not only a play.

### Refusals the player can act on
- **D-10:** Today every adapter refusal collapses to `bad_request`, which tells a player nothing. `ErrorDetailSchema` is widened with a **closed enum** of rule-refusal reasons (out of clue tokens, clue touches no cards, discard at maximum tokens, not your turn, card not in your hand, game over) and `mapAdapterError` maps the adapter's typed errors onto it. This stays inside D-08-from-Phase-2's rule that error frames carry no state: a closed vocabulary, never free text, never game data.

### The interim table
- **D-11:** Phase 4 ships a **deliberately plain, playable board** at the same bare fidelity as the toy screens: your own hand as face-down slots showing their accumulated clue facts, every other hand face up, the played stacks, the discard pile, clue and fuse tokens, deck count, whose turn it is, and controls to play or discard a slot and to give a colour or rank clue to a chosen seat. No card art, no animation, no glyph system, no luminosity work — Phase 6 replaces this wholesale, and it should be cheap to throw away.
- **D-12:** Client-side disabling is limited to what **the view makes unambiguous**: not your turn, no clue tokens left, discard at 8 tokens, and a clue that touches zero visible cards. Everything else is submitted and may be refused by the server, which stays the authority. The engine's `canPlay`/`canDiscard`/`canClue` predicates need full `HanabiState` and so cannot run in the client; Phase 6 owns the complete RULES-11 treatment.
- **D-13:** The end of a game shows the final score and its band from the engine and stops accepting actions. A designed end screen (UI-10) is Phase 6.

### Proving it
- **D-14:** RT-01 and RT-03 are proven by **Playwright against the real worker**: two browsers, a clue/play/discard appearing on the other screen without a refresh, and a mid-game refresh returning to the same seat with full state and the same turn. This extends the existing e2e specs rather than adding a parallel harness.
- **D-15:** RT-09 is proven by **deliberately double-sending the same `actionId`** at the **socket level**, extending the existing `wrangler dev` + raw `ws` harness in `apps/worker/src/room-do.test.ts` (the same one that proves the D-17 eviction path). Playwright offers no reliable hook for forcing a byte-identical duplicate frame, so it is the wrong tool for this one.
  **Corrected 2026-09-16:** an earlier draft of this decision named "history length" as an assertion target. That was wrong — turn history is server-only by Phase 3's D-19 and has no field in `HanabiView`, so it is not observable on the wire. Assert only on wire-visible evidence that the second send changed nothing: `clueTokens`, `activeSeatId`/`isYourTurn`, `deckCount`, and the target hand's clue facts. Do **not** add a debug hook to expose internal state for the sake of a test.
- **D-16:** The phase gate is the full suite plus the e2e specs, matching Phases 2 and 3: `npm test` and `npx playwright test` green, and per-package `tsc --noEmit` clean.

### Claude's Discretion
- Module/file split for the interim board components and where the action controls live.
- Exact `actionId` length and alphabet, and whether more than one id per seat is retained.
- Naming of the new refusal-reason enum members.
- Whether the Hanabi view schema is hand-written or derived, provided it stays strict and unknown-key-rejecting.
- How the e2e specs seed a deterministic game (the seed is server-minted and secret; the tests may need to assert on relative change rather than absolute identities).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` § "Phase 4: Wire Engine Into Room Actor" — goal and the three success criteria.
- `.planning/REQUIREMENTS.md` — RT-01, RT-03, RT-09 are this phase's requirements. RT-04/05/06/08 (Phase 5), UI-* and RULES-11 (Phase 6), RULES-14/UI-07 (Phase 7) are out.
- `.planning/PROJECT.md` — the Correctness constraint (a client never receives its own hand's identities) and the Session durability constraint.

### The seam being used
- `apps/worker/src/game-registration.ts` — the single registration point; its header states that Phase 4 swaps this file's imports "and nothing else in the worker".
- `apps/worker/src/seat-projection.ts` — `projectSeatView`/`validateGameView`, the fail-closed gate and the `ProjectedRoomView` brand.
- `apps/worker/src/room-do.ts` — `#send`, `#viewFor`, `#pushState`; the chokepoint Phase 2 enforced.
- `apps/worker/src/room-state.ts` — `startGame` (already passes seatIds/variant/seed to the adapter), `applyGameAction`, `mapAdapterError`, `toSeatView`.
- `packages/schema/src/messages.ts` — `GameActionMessageSchema` (gains `actionId`, D-07) and `ErrorDetailSchema` (widened, D-10).
- `packages/schema/src/games/forehead-card.ts` — the exact strict-schema pattern the Hanabi schema copies before the toy is deleted.

### The engine being wired
- `packages/rules/src/hanabi/state.ts` — `HanabiState`, `HanabiAction`, `HanabiView`, `HanabiCardView`, `ClueFacts`; the view types are deliberately non-readonly so they stay assignable to a `z.infer` type.
- `packages/rules/src/hanabi/adapter.ts` and `packages/rules/src/index.ts` — `hanabiGame` and the exported helpers (`canPlay`, `canDiscard`, `canClue`, `cardsTouchedByClue`, `currentScore`, `scoreBand`, `checkHanabiViewForLeaks`, `secretsForHanabiSeat`).

### Prior decisions that carry forward
- `.planning/phases/02-per-seat-redaction-contract/02-CONTEXT.md` — D-05 whitelist construction, D-06 registration point, D-07 fail-closed, D-08/D-09 single send chokepoint and its structural test.
- `.planning/phases/03-hanabi-rules-engine/03-CONTEXT.md` — D-11 card-id addressing, D-12 exact-key guards, D-13 legality as exported predicates.
- `.planning/phases/03-hanabi-rules-engine/03-REVIEW.md` and `03-VERIFICATION.md` — CR-01 is **resolved**; WR-01 (the checker's baseline derives from the same state it checks) remains an open structural note worth remembering now that this checker guards the real wire.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The whole Phase 1/2 transport: seating, seat tokens, reclaim, the alarm scheduler, the single send chokepoint and the fail-closed projection gate — none of it needs to change for a different game.
- `startGame` already mints a secret seed and passes `{seatIds, variant, seed}` to `adapter.createInitialState`, which is exactly `hanabiGame`'s signature. No call-site change expected.
- `packages/schema/src/games/forehead-card.ts` plus its subpath wiring is a working template for the Hanabi schema, including the Vite alias ordering trap.
- `apps/web/app/room/[code]/RoomClient.tsx` renders one component for the in-progress branch — the swap point is a single element.
- `apps/web/lib/room-store.ts` is a thin cache of the last server view and needs no structural change.

### Established Patterns
- Whitelist-constructed views; hidden entries omit fields rather than nulling them.
- Grep-verifiable single call sites, enforced by a comment-stripping structural test.
- `z.strictObject` for every wire frame; hostile input parsed, never trusted.
- Schema-version bump as the migration strategy (reset, never migrate).
- Exact dependency version pins; `packages/rules` stays dependency-free.

### Integration Points
- `game-registration.ts` — the two imports that constitute the swap.
- `packages/schema/package.json`, `tsconfig.base.json`, `vitest.config.ts` — the subpath export trio for the new schema module.
- `packages/schema/src/constants.ts` — `ROOM_SCHEMA_VERSION`.
- `RoomClient.tsx` — the in-progress branch and the `game_action` send site (which gains `actionId`).
- `e2e/start-game.spec.ts`, `e2e/in-progress-arrival.spec.ts` — currently drive the toy; they move to Hanabi.

</code_context>

<specifics>
## Specific Ideas

- The measure of whether Phase 2's seam was worth building is that this phase's worker diff is **small and boring**: a registration file, a schema module, a version bump, an idempotency key. If a plan finds itself editing `room-state.ts` or `room-do.ts` to teach them about Hanabi, that is a signal the seam is being eroded.
- The interim board should look unfinished on purpose. Phase 6 does the real design work, and a half-polished Phase 4 board invites both wasted effort and premature attachment.
- A clue is the action that breaks naive idempotency, so it is the action the RT-09 test must double-send.

</specifics>

<deferred>
## Deferred Ideas

- **Mobile backgrounding, multi-tab hardening, the disconnected indicator** (RT-04/05/06/08) — Phase 5.
- **The designed board**: clue memory rendering, colorblind glyphs, luminosity, end-of-game screen, illegal actions visibly disabled (UI-01…UI-11, RULES-11) — Phase 6.
- **Rainbow and Black proven end to end** (RULES-14, UI-07) — Phase 7.
- **Surfacing turn history in the interface** — out of scope for v1 (QOL-01 is v2); it is recorded, never displayed.
- **Hardening the leak checker's self-derived baseline** (Phase 3 review WR-01) — noted, not scheduled; worth revisiting if the checker ever becomes the only redaction proof.

</deferred>

---

*Phase: 04-wire-engine-into-room-actor*
*Context gathered: 2026-09-16*
