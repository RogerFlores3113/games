# Roadmap: games.rogerflores.dev (Hanabi v1)

## Overview

This milestone ships online multiplayer Hanabi (base, Rainbow, Black) as a link-based, no-account game at games.rogerflores.dev. The project is built in horizontal layers, deliberately: the three structurally risky mechanisms — realtime transport on free-tier serverless, per-seat hidden-information redaction, and reconnect/session durability — are proven against a toy game before a single line of Hanabi rules exists, and the rules engine is written as a pure, network-free package tested in a fast unit/property-test loop before it ever touches a WebSocket. Only once the wire contract and rules are stable does UI get built, and only once the base game is fully correct do the box variants (Rainbow, Black) get switched on. This order exists because every research document converged on the same finding: the two hardest things to get right (an own-hand information leak, and the final-round end condition) are both silent, structural failure modes that are cheap to prevent early and expensive to retrofit once UI and variants are layered on top.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Room & Transport Skeleton** - Prove the Cloudflare Durable Objects + partyserver + Vercel split on real infrastructure with a link-based, reconnect-safe room, before any game logic exists.
- [ ] **Phase 2: Per-Seat Redaction Contract** - Prove the single whitelist-serialize per-seat projection chokepoint against a toy secret-holding game, with an automated leak test in place.
- [ ] **Phase 3: Hanabi Rules Engine** - Build the full Hanabi rules engine as a pure, variant-parametrized, network-free package tested in isolation.
- [ ] **Phase 4: Wire Engine Into Room Actor** - Replace the toy game with the real engine behind the game-adapter interface, delivering a live, correctly-filtered, correctly-ruled base-game table.
- [ ] **Phase 5: Reconnect & Session Durability Hardening** - Exercise and harden the mobile-backgrounding and multi-tab failure modes that a manual refresh test does not surface.
- [ ] **Phase 6: Game Interface** - Build the board render, persistent per-card clue memory, colorblind-safe glyphs, and dark "fireworks night" luminosity theme against the now-stable wire contract.
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

- [ ] 01-01-PLAN.md — Monorepo scaffold, Vitest 4 `projects` + Playwright harness, deploy-shape smoke tests (Wave 0)
- [ ] 01-02-PLAN.md — Game-adapter interface + D-15 shared-counter placeholder (`packages/rules`)
- [ ] 01-03-PLAN.md — Zod wire protocol, room/seat schemas, phase constants (`packages/schema`)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-04-PLAN.md — Pure room state machine: seating, name disambiguation, variant lock, start gating, refusals
- [ ] 01-05-PLAN.md — Seat identity: room-code vs seat-token minting, reclaim, newest-socket-wins rebinding
- [ ] 01-06-PLAN.md — Unified single-slot alarm scheduler + versioned persistence with D-17 reset
- [ ] 01-08-PLAN.md — Tailwind v4 `@theme` dark palette, shared components, `POST /api/room`, create-room screen

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-07-PLAN.md — RoomDO assembly on `partyserver`: hibernation, dispatch, per-seat push, onAlarm, idle GC

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 01-09-PLAN.md — partysocket client, seat-token persistence, join/lobby/counter screens (human verification)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 01-10-PLAN.md — Playwright E2E: create, join, live seat list, seat takeover, in-progress refusal, start game

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 01-11-PLAN.md — Deploy, custom domain, free-tier confirmation, RT-02 cold-start procedure (manual)

**Research note**: Cloudflare Durable Objects / `partyserver` API surface moves quickly — re-verify exact library version, hibernation lifecycle hooks, and free-tier limits against current docs immediately before planning this phase (research flagged MEDIUM confidence here).

### Phase 2: Per-Seat Redaction Contract

**Goal**: The single most important correctness pattern in the project — whitelist-serialize per-seat projection — is proven end to end against a toy secret-holding state before there is real game complexity to hide a leak inside.
**Depends on**: Phase 1
**Requirements**: HIDE-01, HIDE-02, HIDE-03, HIDE-04
**Success Criteria** (what must be TRUE):

  1. Inspecting the raw network payload for any seat's connection never reveals that seat's own secret value — the wire message for a hidden item structurally lacks the field entirely, rather than nulling or emptying it.
  2. Every outbound message — initial join, live update, and reconnect — is produced by calling the exact same single projection function; no other code path serializes and sends raw, unprojected state.
  3. An automated test fails the build if any serialized seat view is found to contain that seat's own true secret value, run as a standard part of the test suite.

**Plans**: TBD

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

**Plans**: TBD

### Phase 4: Wire Engine Into Room Actor

**Goal**: With room/seat machinery and the redaction pattern already separated by construction in Phases 1-2, the toy game is deleted and the real engine is called through the game-adapter interface, producing a live, playable base-game Hanabi table.
**Depends on**: Phase 3
**Requirements**: RT-01, RT-03, RT-09
**Success Criteria** (what must be TRUE):

  1. A live base-game Hanabi table is playable end to end: every player's action (clue, play, discard) appears on every other player's screen in near real time without a manual refresh.
  2. A player who refreshes mid-game rejoins their exact same seat with full game state and no lost turn.
  3. Submitting the same action twice (double-click, or retry after a dropped response) is applied exactly once, verified by deliberately double-sending a request.

**Plans**: TBD

### Phase 5: Reconnect & Session Durability Hardening

**Goal**: The failure modes that a quick manual-refresh test does not surface — a mobile tab backgrounded for many minutes during a voice call, two tabs open to one seat — are explicitly exercised and hardened, since this is the expected usage pattern for this project, not a corner case.
**Depends on**: Phase 4
**Requirements**: RT-04, RT-05, RT-06, RT-08
**Success Criteria** (what must be TRUE):

  1. A player whose connection drops, or whose mobile tab is backgrounded for 10+ minutes, reconnects to their same seat and resumes the game in progress.
  2. Reconnecting a player is served through the exact same state-delivery function used for a fresh join, with no separate resume code path.
  3. Remaining players see a clear disconnected indicator for an absent player, and the game pauses in place rather than freezing or erroring.
  4. Opening the room in a second tab for an already-connected seat does not corrupt or duplicate that seat's state.

**Plans**: TBD

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

**Plans**: TBD
**UI hint**: yes
**Research note**: No existing implementation combines a luminosity-as-signal theme with colorblind-safe rendering — this needs original design work at plan time, not an adapted reference; design the colorblind glyph system and the luminosity/lightness steps jointly since they compete for the same visual channel.

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
| 1. Room & Transport Skeleton | 0/11 | Not started | - |
| 2. Per-Seat Redaction Contract | 0/TBD | Not started | - |
| 3. Hanabi Rules Engine | 0/TBD | Not started | - |
| 4. Wire Engine Into Room Actor | 0/TBD | Not started | - |
| 5. Reconnect & Session Durability Hardening | 0/TBD | Not started | - |
| 6. Game Interface | 0/TBD | Not started | - |
| 7. Variant Support (Rainbow, Black) | 0/TBD | Not started | - |
