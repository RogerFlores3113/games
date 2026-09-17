# Roadmap: games.rogerflores.dev (Hanabi v1)

## Overview

This milestone ships online multiplayer Hanabi (base, Rainbow, Black) as a link-based, no-account game at games.rogerflores.dev. The project is built in horizontal layers, deliberately: the three structurally risky mechanisms — realtime transport on free-tier serverless, per-seat hidden-information redaction, and reconnect/session durability — are proven against a toy game before a single line of Hanabi rules exists, and the rules engine is written as a pure, network-free package tested in a fast unit/property-test loop before it ever touches a WebSocket. Only once the wire contract and rules are stable does UI get built, and only once the base game is fully correct do the box variants (Rainbow, Black) get switched on. This order exists because every research document converged on the same finding: the two hardest things to get right (an own-hand information leak, and the final-round end condition) are both silent, structural failure modes that are cheap to prevent early and expensive to retrofit once UI and variants are layered on top.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Room & Transport Skeleton** - Prove the Cloudflare Durable Objects + partyserver + Vercel split on real infrastructure with a link-based, reconnect-safe room, before any game logic exists. (completed 2026-09-15)
- [x] **Phase 2: Per-Seat Redaction Contract** - Prove the single whitelist-serialize per-seat projection chokepoint against a toy secret-holding game, with an automated leak test in place. (completed 2026-09-15)
- [x] **Phase 3: Hanabi Rules Engine** - Build the full Hanabi rules engine as a pure, variant-parametrized, network-free package tested in isolation. (completed 2026-09-16)
- [x] **Phase 4: Wire Engine Into Room Actor** - Replace the toy game with the real engine behind the game-adapter interface, delivering a live, correctly-filtered, correctly-ruled base-game table. (completed 2026-09-16)
- [x] **Phase 5: Reconnect & Session Durability Hardening** - Exercise and harden the mobile-backgrounding and multi-tab failure modes that a manual refresh test does not surface. (completed 2026-09-16)
- [x] **Phase 6: Game Interface** - Build the board render, persistent per-card clue memory, colorblind-safe glyphs, and dark "fireworks night" luminosity theme against the now-stable wire contract. (completed 2026-09-17)
- [x] **Phase 6.1: Table Polish (INSERTED)** - Firework-burst card art per suit, clue marks above cards plus player notes, drag reorder/play/discard with slot-preserving draws, audio cues, and a city-at-night background. (completed 2026-09-17)
- [ ] **Phase 06.2: Board Redesign (INSERTED)** - Hint display (clue-coloured highlight, number on the tile back, keep-hints toggle), tile styling and player colour picker, wooden board texture, labelled Play/Discard areas with token art and deck counter, drag-reorder gap preview, always-visible private note box, and a shared rearrangeable discard order. Follow-on requests from the Phase 6.1 owner sign-off.
- [ ] **Phase 7: Variant Support (Rainbow, Black)** - Enable and test the Rainbow and Black configurations end to end, proving the variant-parametrized engine and UI built earlier need no special-casing.

## Phase Details

### Phase 1: Room & Transport Skeleton

**Goal**: A friend can create a Hanabi room, get a link, and join it, with the backend reachable and reconnect-safe from the very first request — even after a week of total silence — before any Hanabi-specific code exists.
**Depends on**: Nothing (first phase)
**Requirements**: ROOM-01, ROOM-02, ROOM-03, ROOM-04, ROOM-05, ROOM-06, ROOM-07, ROOM-08, RT-02, RT-07, FDN-01, FDN-03, FDN-04
**Success Criteria** (what must be TRUE):

  1. Host can create a room at games.rogerflores.dev, choose a variant (base/Rainbow/Black), and receive a shareable link.
  2. A player joins via the link by entering a display name (no account), is assigned a seat, and every player in the room sees the live seat list and each seat's connection status update, with duplicate display names shown as distinct entries rather than colliding. (Amended 2026-09-01: ready states cut from scope.)
  3. Host can start the game at will once 2-5 players are seated; a player arriving at a link for a game already in progress sees a clear message rather than a broken or blank table. (Amended 2026-09-01: no ready gate.)
  4. A returning player's browser reattaches automatically to its previously assigned seat via a saved token, and a seat already claimed by one person cannot be taken over by a second person holding the same link.
  5. The room/seat/connection machinery contains no Hanabi-specific logic (proven by routing a trivial placeholder game through it), the whole stack runs entirely on free-tier services with no paid plan, room state survives a forced actor restart, a cold link click after a week of inactivity succeeds within seconds with no manual step, and abandoned rooms are cleaned up automatically.

**Plans**: 11 plans
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Monorepo scaffold, Vitest 4 `projects` + Playwright harness, deploy-shape smoke tests (Wave 0)
- [x] 01-02-PLAN.md — Game-adapter interface + D-15 shared-counter placeholder (`packages/rules`)
- [x] 01-03-PLAN.md — Zod wire protocol, room/seat schemas, phase constants (`packages/schema`)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-04-PLAN.md — Pure room state machine: seating, name disambiguation, variant lock, start gating, refusals
- [x] 01-05-PLAN.md — Seat identity: room-code vs seat-token minting, reclaim, newest-socket-wins rebinding
- [x] 01-06-PLAN.md — Unified single-slot alarm scheduler + versioned persistence with D-17 reset
- [x] 01-08-PLAN.md — Tailwind v4 `@theme` dark palette, shared components, `POST /api/room`, create-room screen

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-07-PLAN.md — RoomDO assembly on `partyserver`: hibernation, dispatch, per-seat push, onAlarm, idle GC

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-09-PLAN.md — partysocket client, seat-token persistence, join/lobby/counter screens (human verification)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-10-PLAN.md — Playwright E2E: create, join, live seat list, seat takeover, in-progress refusal, start game

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-11-PLAN.md — Deploy, custom domain, free-tier confirmation, RT-02 cold-start procedure (manual)

**Research note**: Cloudflare Durable Objects / `partyserver` API surface moves quickly — re-verify exact library version, hibernation lifecycle hooks, and free-tier limits against current docs immediately before planning this phase (research flagged MEDIUM confidence here).

### Phase 2: Per-Seat Redaction Contract

**Goal**: The single most important correctness pattern in the project — whitelist-serialize per-seat projection — is proven end to end against a toy secret-holding state before there is real game complexity to hide a leak inside.
**Depends on**: Phase 1
**Requirements**: HIDE-01, HIDE-02, HIDE-03, HIDE-04
**Success Criteria** (what must be TRUE):

  1. Inspecting the raw network payload for any seat's connection never reveals that seat's own secret value — the wire message for a hidden item structurally lacks the field entirely, rather than nulling or emptying it.
  2. Every outbound message — initial join, live update, and reconnect — is produced by calling the exact same single projection function; no other code path serializes and sends raw, unprojected state.
  3. An automated test fails the build if any serialized seat view is found to contain that seat's own true secret value, run as a standard part of the test suite.

**Plans**: 6 plans
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Forehead-card toy adapter, 128-bit seeded shuffle, shared leak checker + D-13 canary + D-11 layer-1 property test (`packages/rules`)
- [x] 02-02-PLAN.md — Strict game-namespaced Zod view schema at `@games/schema/games/forehead-card`, closed error-detail enum

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-03-PLAN.md — Worker registration point + adapter swap, fail-closed `projectSeatView` gate, ROOM_SCHEMA_VERSION bump, D-11 layer-2 wire property test

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-04-PLAN.md — Single `#send` chokepoint in RoomDO, D-09 structural source test, D-11 layer-3 live-wire leak test (join/update/reconnect)
- [x] 02-05-PLAN.md — Toy game UI replacing CounterGame, updated E2E specs, D-15 counter deleted

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-06-PLAN.md — Phase-wide automated gate + human DevTools WebSocket frame verification

### Phase 3: Hanabi Rules Engine

**Goal**: The actual game-rules risk (token economy, final-round trigger, variant-parametrized suit count) is burned down in a fast unit/property-test loop, with zero networking involved, before this logic is wired into the transport built in Phases 1-2.
**Depends on**: Phase 2
**Requirements**: RULES-01, RULES-02, RULES-03, RULES-04, RULES-05, RULES-06, RULES-07, RULES-08, RULES-09, RULES-10, RULES-12, RULES-13, RULES-15, RULES-16, RULES-17, RULES-18, RULES-19, RULES-20, HIDE-05, FDN-02
**Success Criteria** (what must be TRUE):

  1. The engine deals correct hand sizes and constructs a correct deck for any configured variant (base 5 suits, Rainbow 6, Black's single-copy-per-rank suit), with suit count always derived from configuration and never hardcoded.
  2. A simulated game can play, discard, and clue through a full turn cycle: clues cost a token and touch only the correct cards, illegal clues (zero tokens available, or touching zero cards) are rejected, discarding at 8 available clue tokens is rejected, a misplay loses a fuse and goes to the discard pile, and completing a stack with a 5 refunds a clue token unless the team is already at 8.
  3. A simulated game driven to deck-exhaustion enters an explicit final round giving every player — including the one who drew the last card — exactly one more turn with no further draws during that round, and the game ends and is scored correctly under any of the three end conditions (three fuses lost, all stacks complete, or the final round elapsing).
  4. Two games created with the same seed produce identical shuffles and identical outcomes, and every game's state includes a full turn history from the first turn even though no interface displays it yet.
  5. The engine rejects any submitted action that asserts a resulting game state rather than requesting an action, and the entire package has zero networking or storage dependencies — it is built, run, and fully tested in isolation.

**Plans**: 5 plans
Plans:
**Wave 1**

- [x] 03-01-PLAN.md — VariantConfig, shared engine types, deterministic variant-parametrized dealer

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Public-facts-only turn history, clue-fact narrowing, typed legality predicates

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-03-PLAN.md — Request guards, play/discard/clue branches, final round, end conditions and scoring

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-04-PLAN.md — Per-seat whitelist projection, generalized leak checker with canaries, composed hanabiGame adapter

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 03-05-PLAN.md — Conservation, redaction and termination properties, variant matrix, phase gate

### Phase 4: Wire Engine Into Room Actor

**Goal**: With room/seat machinery and the redaction pattern already separated by construction in Phases 1-2, the toy game is deleted and the real engine is called through the game-adapter interface, producing a live, playable base-game Hanabi table.
**Depends on**: Phase 3
**Requirements**: RT-01, RT-03, RT-09
**Success Criteria** (what must be TRUE):

  1. A live base-game Hanabi table is playable end to end: every player's action (clue, play, discard) appears on every other player's screen in near real time without a manual refresh.
  2. A player who refreshes mid-game rejoins their exact same seat with full game state and no lost turn.
  3. Submitting the same action twice (double-click, or retry after a dropped response) is applied exactly once, verified by deliberately double-sending a request.

**Plans**: 9 plans
Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Strict Hanabi view schema at `@games/schema/games/hanabi` + subpath wiring (D-05)

**Wave 2** *(blocked on Wave 1)*

- [x] 04-02-PLAN.md — Wire protocol: `actionId`, widened closed `ErrorDetail`, persisted seat key, schema version bump (D-06/D-07/D-08/D-10)

**Wave 3** *(blocked on Wave 2)*

- [x] 04-03-PLAN.md — Registration-point swap to `hanabiGame`, leak-test repoint, structural confinement rewrite (D-02/D-03/D-04)

**Wave 4** *(blocked on Wave 3)*

- [x] 04-04-PLAN.md — Exactly-once actions: per-seat `actionId` dedup before the adapter, 1:1 refusal mapping (D-08/D-09/D-10)

**Wave 5** *(blocked on Wave 4)*

- [x] 04-05-PLAN.md — Live-wire proofs: Hanabi frame capture, double-sent clue, dedup across a forced eviction (D-02/D-15)

**Wave 6** *(blocked on Wave 4)*

- [x] 04-06-PLAN.md — Interim playable board, D-12 disabling predicates, `RoomClient` swap (D-11/D-12/D-13)

**Wave 7** *(blocked on Wave 6)*

- [x] 04-07-PLAN.md — Playwright: RT-01 no-refresh propagation and RT-03 mid-game reload (D-14)

**Wave 8** *(blocked on Wave 7)*

- [x] 04-08-PLAN.md — Forehead-card toy deletion sweep, zero-occurrence regression, phase gate (D-01/D-03/D-16)

**Gap closure**

- [x] 04-09-PLAN.md — Fuse counter shows fuses remaining (MAX_FUSES - fuses), regression tests (UAT test 10)

### Phase 5: Reconnect & Session Durability Hardening

**Goal**: The failure modes that a quick manual-refresh test does not surface — a mobile tab backgrounded for many minutes during a voice call, two tabs open to one seat — are explicitly exercised and hardened, since this is the expected usage pattern for this project, not a corner case.
**Depends on**: Phase 4
**Requirements**: RT-04, RT-05, RT-06, RT-08
**Success Criteria** (what must be TRUE):

  1. A player whose connection drops, or whose mobile tab is backgrounded for 10+ minutes, reconnects to their same seat and resumes the game in progress.
  2. Reconnecting a player is served through the exact same state-delivery function used for a fresh join, with no separate resume code path.
  3. Remaining players see a clear disconnected indicator for an absent player, and the game pauses in place rather than freezing or erroring.
  4. Opening the room in a second tab for an already-connected seat does not corrupt or duplicate that seat's state.

**Plans**: 6 plans
Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Experimental workers-types, D-04 heartbeat constants, auto-response registration + wrangler dev spike, heartbeat structural audit (Wave 0)

**Wave 2**

- [x] 05-02-PLAN.md — Server zombie sweep in the single alarm, shared CR-01 disconnect helper, socket proofs of D-03/D-12/D-13/D-15
- [x] 05-03-PLAN.md — Client heartbeat, visibility/online fast resume, `reconnecting` status, no-queue sends, reclaimSeat

**Wave 3**

- [x] 05-04-PLAN.md — Board per-seat status + "— disconnected" turn text, Reconnecting… banner with disabled controls, Use this tab button

**Wave 4**

- [x] 05-05-PLAN.md — Playwright proofs: network drop, frozen background tab, mid-game second tab + reclaim (injected timing)

**Wave 5**

- [x] 05-06-PLAN.md — Real-phone manual check doc, full gate, owner sign-off recorded verbatim (checkpoint)

### Phase 6: Game Interface

**Goal**: Against a by-now-stable wire contract, the board is rendered with persistent clue memory as the product's sole memory aid (card notes are explicitly out of scope), an always-on colorblind-safe suit system, and the dark "fireworks night" luminosity theme.
**Depends on**: Phase 4
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-08, UI-09, UI-10, UI-11, RULES-11
**Success Criteria** (what must be TRUE):

  1. Clue tokens, fuse tokens, deck count, discard pile, and all played stacks are visible at all times without opening a menu, and the active player is unmistakably indicated.
  2. A player sees every other player's hand face up and their own hand face down, and illegal actions are visibly disabled in the interface rather than only rejected after submission.
  3. Cards touched by a clue are marked immediately and the marking persists until the card leaves the hand or gains further information, and each card in a player's own hand visibly accumulates and displays both what it has been confirmed to be and what it has been ruled out as, narrowing as more clues land — the product's only memory aid, since player-authored notes are explicitly excluded.
  4. Every card shows a non-color suit identifier by default with no accessibility toggle required, and card luminosity visibly conveys accumulated clue information as a signal independent of hue, within a dark "fireworks night" visual treatment.
  5. The end-of-game screen shows the final score, its descriptive band, and the completed stacks, and the whole interface is usable on a desktop browser at common window sizes.

**Plans**: 7 plans
Plans:
**Wave 1**

- [x] 06-01-PLAN.md — Pure visual derivations (luminosity, candidates, clue ids, disabled reasons, end reason, deck text, turn order) with D-15 identity tripwire (TDD)
- [x] 06-02-PLAN.md — Suit identity system: 7 glyphs + AA-verified hue tokens, card-glow token, CSS keyframes with reduced motion

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-03-PLAN.md — Card and hand components: luminosity frame, candidate strip, teammate/own cards (facts-only own card + source scan), hand containers
- [x] 06-04-PLAN.md — Tableau, Play/Discard + clue picker with visible disabled reasons and hover/focus preview, end-of-game overlay

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 06-05-PLAN.md — Wire the board orchestrator into RoomClient, delete interim board, restyle banner, same-change e2e compatibility

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 06-06-PLAN.md — Playwright proofs for D-24: tableau visibility, active marker, clue marks + refresh persistence, reasons, end screen, 5-player viewport

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 06-07-PLAN.md — Phase gate + owner visual sign-off recorded verbatim (D-25), RT-04 phone check offered

**UI hint**: yes
**Research note**: No existing implementation combines a luminosity-as-signal theme with colorblind-safe rendering — this needs original design work at plan time, not an adapted reference; design the colorblind glyph system and the luminosity/lightness steps jointly since they compete for the same visual channel.

### Phase 06.1: Table Polish (Firework Art, Notes, Drag, Audio) (INSERTED)

**Goal:** Turn the signed-off first-pass board into the table the owner wants to play on: firework-burst card art with a distinct burst shape per suit, clue marks above cards plus player-typed notes, drag-to-reorder/play/discard with slot-preserving draws that every player sees, simple audio cues, and a city-at-night backdrop.
**Requirements**: ART-01, ART-02, NOTE-01, NOTE-02, HAND-01, HAND-02, HAND-03, AUD-01
**Depends on:** Phase 6
**Success Criteria** (what must be TRUE):

  1. Every face-up card shows original firework-burst art, and with color ignored each suit's burst silhouette is still distinguishable from every other suit's.
  2. Clue marks appear above each card, and a player can type and keep notes on each of their own cards.
  3. A player can drag their own cards to reorder them, and every other player sees the same order, including after a refresh; dragging to the center plays and to the discard zone discards, with buttons still available.
  4. A drawn card lands in the slot the played or discarded card left, on every screen.
  5. Distinct short sounds play for a clue, a play, a discard, a lost fuse, and a completed stack, over a static city-at-night background that leaves cards legible.

**Notes:** Owner feedback recorded verbatim in `.planning/phases/06-game-interface/06-HUMAN-UAT.md`. HAND-01/HAND-03 change hand ordering in the engine and wire contract, so the per-seat redaction chokepoint and leak tests must stay intact. The owner asked for the box game's per-color burst designs; the art must be original work in that spirit, not copied publisher artwork — show the owner the burst shapes before building them into cards.
**Plans:** 15/15 plans complete

Plans:

- [x] 06.1-01-PLAN.md — Engine: slot-preserving draw + server-validated reorder action (HAND-01, HAND-03)
- [x] 06.1-02-PLAN.md — Firework burst art in suit-visuals.ts, card face/back components, dev preview page (ART-01)
- [x] 06.1-03-PLAN.md — Pure client logic: safe storage, notes, discard grouping, drag resolution (NOTE-02, HAND-01/02)
- [x] 06.1-04-PLAN.md — Audio logic: live-history diff, cue selection, Web Audio engine + prefs (AUD-01)
- [x] 06.1-05-PLAN.md — City-at-night background image, license record, scrim (ART-02)
- [x] 06.1-06-PLAN.md — Property/projection/room-layer tests for reorder and slot-preserving draw (HAND-01, HAND-03)
- [x] 06.1-07-PLAN.md — Owner gate: burst shapes approved before building into cards (ART-01)
- [x] 06.1-08-PLAN.md — Audio wired into the board with mute/volume controls (AUD-01)
- [x] 06.1-09-PLAN.md — Clue marks above every card; firework faces and neutral card backs (NOTE-01, ART-01)
- [x] 06.1-10-PLAN.md — Stack/discard art, compact discard + full-art overlay (ART-01)
- [x] 06.1-11-PLAN.md — Private per-card notes on own hand (NOTE-02)
- [x] 06.1-12-PLAN.md — Drag to reorder/play/discard with drop zones (HAND-01, HAND-02)
- [x] 06.1-13-PLAN.md — Fly-to animation for departing cards (HAND-02, HAND-03)
- [x] 06.1-14-PLAN.md — Playwright proofs for the phase (all behavioural requirements)
- [x] 06.1-15-PLAN.md — Phase gate + owner visual/audio sign-off (D-31)

**Cross-cutting constraints:**

- Phase 6 D-01: five players still fit 1280x720 without scrolling

### Phase 06.2: Board Redesign: hint display, tile styling, board layout, tokens, and shared discard order (INSERTED)

**Goal:** Rework the table's visual language and hint feedback so the board reads like a physical tile game, and give the discard pile a shared, player-arrangeable order.
**Requirements**: HINT-01, HINT-02, HINT-03, HINT-04, NOTE-03, DRAG-01, TILE-01, TILE-02, TILE-03, BOARD-01, BOARD-02, BOARD-03, BOARD-04, BOARD-05, DISC-01 (from the 17 owner requests under "## Gaps" in .planning/phases/06.1-table-polish-firework-art-notes-drag-audio/06.1-HUMAN-UAT.md)
**Depends on:** Phase 06.1
**Plans:** 2/11 plans executed

Scope (owner requests, 06.1 sign-off):
- Hint display: a clue highlights the tile in that clue's colour (not a generic yellow); a number clue shows the number on the tile back; a "keep hints visible" toggle (on = hints persist past the next player's move, off = they clear).
- Hand interaction: other tiles shift aside during a drag reorder so the drop position is clear; an always-visible faint note box above each tile that is click-to-type, autosaving, and private to its own player (replaces the current note chip).
- Tile and board styling: tile background visually distinct from the board; wooden (or similar) board texture; player-settable tile colour via a colour picker.
- Board layout: Play area at the top and Discard at the bottom, each with a subtle labelled outline; clue tokens (black, blue question mark) in a vertical line with fuse tokens (black, yellow explosion with orange-red rim) beside them, both on the right; spent tokens removed from the board rather than only decremented; deck counter rendered as "48 x [card back]" between Play and Discard.
- Played stack: every firework in a stack is clearly visible, not just the top card.
- Shared discard order: the discard shows every discarded tile, rearrangeable by any player, with the arrangement visible to everyone — the only server-side item (new action + ordering/conflict rules); everything else is client-side.

Resolved during discussion (06.2-CONTEXT.md):
- The new automatic-tile-note format IS the hint indicators themselves, with the keep-hints toggle making them persistent (D-01, owner verbatim). The pip rows are removed and ruled-out information is dropped with no replacement (D-07, owner-confirmed "Let it go").
- Shared discard ordering: any seated player may reorder at any time, validation mirrors canReorder's exact-permutation check, last write wins, and the order is server state projected identically to every seat (D-23..D-29).

Plans:

**Wave 1**

- [x] 06.2-01-PLAN.md — Engine + wire: shared discardOrder state, reorderDiscard action, permutation property test (DISC-01)
- [x] 06.2-02-PLAN.md — Seven @theme tokens, wooden board surface, shift-aside motion, 1280x720 height ledger
- [ ] 06.2-03-PLAN.md — Pure hint derivation and lifetime, keep-hints and tile-colour preferences

**Wave 2** *(blocked on Wave 1)*

- [ ] 06.2-04-PLAN.md — Hint indicators on tiles, pip band deleted, raised tile surface (HINT-01/02/04, TILE-01)
- [ ] 06.2-05-PLAN.md — Clue/fuse token art, shrinking token column, fanned played stacks (BOARD-02/03/05)

**Wave 3** *(blocked on Wave 2)*

- [ ] 06.2-06-PLAN.md — Always-visible note box, keep-hints toggle, tile-colour picker (NOTE-03, HINT-03, TILE-03)

**Wave 4** *(blocked on Wave 3)*

- [ ] 06.2-07-PLAN.md — Table layout rework: wooden board, labelled Play/Discard, deck counter, token column (BOARD-01..05, TILE-02)

**Wave 5** *(blocked on Wave 4)*

- [ ] 06.2-08-PLAN.md — Discard drag: pure drop logic, useDiscardDrag, reorderDiscard dispatch (DISC-01)
- [ ] 06.2-09-PLAN.md — Drag shift-aside gap preview in the hand (DRAG-01)

**Wave 6** *(blocked on Wave 5)*

- [ ] 06.2-10-PLAN.md — Playwright proofs for every behavioural requirement + measured 1280x720 worst-case fit

**Wave 7** *(blocked on Wave 6)*

- [ ] 06.2-11-PLAN.md — Phase gate + owner visual sign-off recorded verbatim (checkpoint)

### Phase 7: Variant Support (Rainbow, Black)

**Goal**: Rainbow and Black are enabled and tested as a multiplier on an already-correct, already-parametrized core, giving the suit-count and clue-touch parametrization built in Phase 3 its real end-to-end test.
**Depends on**: Phase 6
**Requirements**: RULES-14, UI-07
**Success Criteria** (what must be TRUE):

  1. In the Rainbow variant, a clue of any single color highlights the rainbow card, and no clue option lets a player name "rainbow" as if it were a color.
  2. In the Rainbow variant, a rainbow card remains visually unambiguous from every other suit despite no single color clue being able to identify it alone.
  3. A full game can be played and correctly scored in each of the three variants (base, Rainbow, Black) end to end, confirming the engine and UI built in earlier phases handle all three configurations without special-casing.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Room & Transport Skeleton | 11/11 | Complete   | 2026-09-15 |
| 2. Per-Seat Redaction Contract | 6/6 | Complete    | 2026-09-15 |
| 3. Hanabi Rules Engine | 5/5 | Complete    | 2026-09-16 |
| 4. Wire Engine Into Room Actor | 9/9 | Complete   | 2026-09-16 |
| 5. Reconnect & Session Durability Hardening | 6/6 | Complete    | 2026-09-17 |
| 6. Game Interface | 7/7 | Complete    | 2026-09-17 |
| 7. Variant Support (Rainbow, Black) | 0/TBD | Not started | - |
