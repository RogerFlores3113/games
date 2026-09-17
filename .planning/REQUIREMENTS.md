# Requirements: games.rogerflores.dev

**Defined:** 2026-09-01
**Core Value:** A friend clicks a link and is playing Hanabi within seconds — and the game does not break, stall, or lose their seat for the next 25 minutes.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Room Lifecycle

- [x] **ROOM-01**: Host can create a Hanabi room and receive a shareable link
- [x] **ROOM-02**: Player opening the link can join by entering a display name, with no account or email
- [x] **ROOM-03**: Two players entering the same display name are disambiguated rather than colliding
- [x] **ROOM-04**: All players in a room see the current seat list, with each seat's connection status, before the game starts (amended 2026-09-01 during Phase 1 discussion: per-player ready state cut from scope — the host starts the game at will)
- [x] **ROOM-05**: Host can configure the variant at room creation: base, Rainbow, or Black
- [x] **ROOM-06**: Host can start the game once between 2 and 5 players are seated and ready
- [x] **ROOM-07**: A player arriving at a link for a game already in progress is told so clearly rather than silently failing or joining a broken state
- [x] **ROOM-08**: Abandoned rooms are garbage collected without manual intervention

### Realtime & Session Durability

- [x] **RT-01**: A player's action appears on every other player's screen without manual refresh
- [x] **RT-02**: The backend serves a cold link click after a week of total inactivity with no manual intervention and no perceptible wake delay
- [x] **RT-03**: A player who refreshes the page rejoins their same seat with full game state and no lost turn
- [x] **RT-04**: A player who loses connection or whose mobile tab is suspended rejoins their same seat and resumes the game in progress
- [x] **RT-05**: Reconnecting a player uses the same state-delivery path as initial join, not a separate resume path
- [x] **RT-06**: Remaining players see a clear disconnected indicator for an absent player, and the game pauses in place rather than freezing or erroring
- [x] **RT-07**: An occupied seat cannot be taken over by another person holding the room link
- [x] **RT-08**: A player opening the room in a second tab does not corrupt or duplicate their seat
- [x] **RT-09**: Submitting the same action twice (double-click, retry after a dropped response) applies it once

### Hidden Information Integrity

- [x] **HIDE-01**: A player's client never receives the suit or rank of any card in that player's own hand, verifiable by inspecting the network payload
- [x] **HIDE-02**: Every outbound payload — initial join, live update, reconnect, and error responses — is produced by a single per-seat projection function, with no path that bypasses it
- [x] **HIDE-03**: The wire format for a hidden card structurally lacks suit and rank fields rather than nulling or emptying them
- [x] **HIDE-04**: An automated test fails if a serialized seat view contains the true identity of any card in that seat's own hand
- [x] **HIDE-05**: The server rejects any client-supplied action payload that asserts game state rather than requesting an action

### Hanabi Rules Engine

- [x] **RULES-01**: Game deals correct hand sizes — 5 cards for 2-3 players, 4 cards for 4-5 players
- [x] **RULES-02**: Deck is constructed correctly for the selected variant, with three 1s, two each of 2/3/4, and one 5 per suit, and the Black suit instead holding a single copy of each rank
- [x] **RULES-03**: Suit count is derived from the variant configuration rather than hardcoded, so base (5 suits), Rainbow (6), and Black (6) all resolve correctly
- [x] **RULES-04**: Player can play a card from their hand on their turn
- [x] **RULES-05**: Player can discard a card from their hand on their turn, regaining a clue token
- [x] **RULES-06**: Player can give a clue naming exactly one color or one rank to exactly one other player, spending a clue token
- [x] **RULES-07**: A clue indicates every matching card in the target's hand, and no others
- [x] **RULES-08**: A clue that would touch zero cards is rejected
- [x] **RULES-09**: Giving a clue is unavailable when zero clue tokens remain
- [x] **RULES-10**: Discarding is unavailable when all 8 clue tokens are already available
- [x] **RULES-11**: Illegal actions are visibly unavailable in the interface rather than only rejected on submission
- [x] **RULES-12**: Playing a card that does not extend a stack loses a fuse and sends the card to the discard pile
- [x] **RULES-13**: Completing a stack with a 5 regains a clue token, unless the team is already at 8, in which case the bonus is forfeit
- [ ] **RULES-14**: In the Rainbow variant, rainbow cards are indicated by clues of every color, and no clue names "rainbow" as a color
- [x] **RULES-15**: When the deck empties, a turns-remaining counter is set as explicit state, and every player including the one who drew the last card takes exactly one more turn
- [x] **RULES-16**: No cards are drawn during the final round
- [x] **RULES-17**: Game ends and is scored when the third fuse is lost, when all stacks are complete, or when the final round elapses
- [x] **RULES-18**: Final score is calculated and presented with its descriptive band
- [x] **RULES-19**: Shuffling is deterministic from a stored seed, so any game can be reproduced exactly for debugging
- [x] **RULES-20**: Turn history is recorded in game state from the first turn, with no interface exposing it in v1

### Game Interface

- [x] **UI-01**: Clue tokens, fuse tokens, deck count, discard pile contents, and all played stacks are visible at all times without opening a menu or drawer
- [x] **UI-02**: The active player is unmistakably indicated
- [x] **UI-03**: A player sees every other player's hand face-up, and their own hand face-down
- [x] **UI-04**: Cards touched by a clue are marked immediately and the marking persists until the card leaves the hand or gains further information
- [x] **UI-05**: Each card in a player's own hand accumulates and displays both positive and negative clue information, narrowing the candidate suits and ranks as clues land
- [x] **UI-06**: Every card carries a non-color suit identifier by default, with no accessibility mode to enable
- [ ] **UI-07**: Suit identification remains unambiguous in the Rainbow variant, where color alone cannot distinguish a rainbow card
- [x] **UI-08**: Card luminosity conveys accumulated clue information as a channel independent of hue
- [x] **UI-09**: The interface presents a dark fireworks-night visual treatment
- [x] **UI-10**: The end-of-game screen shows the final score, its band, and the completed stacks
- [x] **UI-11**: The interface is usable on a desktop browser at common window sizes

### Table Polish (added 2026-09-17 at owner sign-off of Phase 6)

- [x] **ART-01**: Every face-up card shows firework-burst art whose burst silhouette is distinct per suit, so suits stay distinguishable with color ignored; the art is original (inspired by the box game's per-color burst shapes, not copied from the publisher's artwork)
- [ ] **ART-02**: The table sits on a static city-at-night background image that does not reduce card legibility
- [ ] **NOTE-01**: Clue marks a card has received are shown above the card rather than on its face
- [ ] **NOTE-02**: A player can type free-text notes on each card in their own hand; the automatic positive/negative clue tracking (UI-05) remains
- [x] **HAND-01**: A player can reorder their own hand by clicking and dragging, and every player sees the new order (server-authoritative, survives refresh)
- [ ] **HAND-02**: Dragging an own card to the center plays it and dragging it to a discard zone discards it, with the existing buttons kept as a keyboard fallback
- [x] **HAND-03**: A newly drawn card takes the hand slot of the card that was played or discarded, rather than joining the end of the hand
- [ ] **AUD-01**: Simple audio cues play for a clue, a play, a discard, a lost fuse, and a completed stack of five

### Foundation

- [x] **FDN-01**: Room, seating, connection, and reconnect machinery is separated from Hanabi-specific rules behind a game-adapter interface
- [x] **FDN-02**: The rules engine is a pure package with no networking or storage dependencies, testable in isolation
- [x] **FDN-03**: The deployed system runs entirely within free tiers, with no service requiring a paid plan or stored payment method to remain reachable
- [x] **FDN-04**: games.rogerflores.dev resolves to the deployed application

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Mobile

- **MOB-01**: Touch-first card table layout accommodating 4-5 hands on a phone screen
- **MOB-02**: Touch interaction for playing, discarding, and clue giving that does not depend on hover or right-click

### Quality of Life

- **QOL-01**: Chronological clue log panel, built on the turn history already recorded in v1
- **QOL-02**: Sound or haptic cue when a player's turn begins or when they are clued (action sound cues pulled into v1 as AUD-01; turn-start cue and haptics remain v2)

### Second Game

- **INNOV-01**: Innovation, as a sibling rules engine reusing the v1 room and seating machinery unchanged

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| User accounts, sign-in, persistent profiles | Known friend group sharing a link; auth is friction with no payoff, and it converts an ephemeral app into an identity-management product |
| Public lobby, matchmaking, game browser | No engagement goal beyond one small group; a discovery surface reintroduces the abuse and moderation problems accounts were rejected to avoid |
| In-app chat | Players are on a voice call. Worse, a text channel is an attractive nuisance for typing out card identities, which violates Hanabi's core rule |
| Bot or AI takeover of a disconnected seat | Destroys the point of a game about reasoning with specific known teammates, and masks the failure state. Pause-and-resume is strictly better here. |
| Replay and turn scrubber | Not requested. Turn history is stored (RULES-20) so this can be built properly later rather than shipped half-working |
| Spectators | Not requested, and every spectator code path is another place per-seat redaction can be skipped |
| Hanab Live extended variant catalogue (Pink, White, Brown, Omni, Null, Prism, Up or Down, Clue Starved, etc.) | Chasing it turns "ship Hanabi" into "ship a generalized card-game rules DSL" — a different, much larger project |
| Empathy view / auto-inference of card identities | Borders on playing the game for the players; wrong for a casual group |
| Server-enforced convention systems | Conventions are a social agreement, not a rules layer. A legal-but-unconventional clue must remain legal. |
| Ranked play, ELO, stats, leaderboards | Hanabi is cooperative, and this is a friend group |
| Native or installable mobile apps | The web link is the entire distribution model; an app reintroduces the install friction the product exists to avoid |
| Innovation in v1 | Deferred to a later milestone to prove the multiplayer foundation on one game first |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ROOM-01 | Phase 1 | Complete |
| ROOM-02 | Phase 1 | Complete |
| ROOM-03 | Phase 1 | Complete |
| ROOM-04 | Phase 1 | Complete |
| ROOM-05 | Phase 1 | Complete |
| ROOM-06 | Phase 1 | Complete |
| ROOM-07 | Phase 1 | Complete |
| ROOM-08 | Phase 1 | Complete |
| RT-01 | Phase 4 | Complete |
| RT-02 | Phase 1 | Complete (waived 2026-09-15 by owner) |
| RT-03 | Phase 4 | Complete |
| RT-04 | Phase 5 | Complete |
| RT-05 | Phase 5 | Complete |
| RT-06 | Phase 5 | Complete |
| RT-07 | Phase 1 | Complete |
| RT-08 | Phase 5 | Complete |
| RT-09 | Phase 4 | Complete |
| HIDE-01 | Phase 2 | Complete |
| HIDE-02 | Phase 2 | Complete |
| HIDE-03 | Phase 2 | Complete |
| HIDE-04 | Phase 2 | Complete |
| HIDE-05 | Phase 3 | Complete |
| RULES-01 | Phase 3 | Complete |
| RULES-02 | Phase 3 | Complete |
| RULES-03 | Phase 3 | Complete |
| RULES-04 | Phase 3 | Complete |
| RULES-05 | Phase 3 | Complete |
| RULES-06 | Phase 3 | Complete |
| RULES-07 | Phase 3 | Complete |
| RULES-08 | Phase 3 | Complete |
| RULES-09 | Phase 3 | Complete |
| RULES-10 | Phase 3 | Complete |
| RULES-11 | Phase 6 | Complete |
| RULES-12 | Phase 3 | Complete |
| RULES-13 | Phase 3 | Complete |
| RULES-14 | Phase 7 | Pending |
| RULES-15 | Phase 3 | Complete |
| RULES-16 | Phase 3 | Complete |
| RULES-17 | Phase 3 | Complete |
| RULES-18 | Phase 3 | Complete |
| RULES-19 | Phase 3 | Complete |
| RULES-20 | Phase 3 | Complete |
| UI-01 | Phase 6 | Complete |
| UI-02 | Phase 6 | Complete |
| UI-03 | Phase 6 | Complete |
| UI-04 | Phase 6 | Complete |
| UI-05 | Phase 6 | Complete |
| UI-06 | Phase 6 | Complete |
| UI-07 | Phase 7 | Pending |
| UI-08 | Phase 6 | Complete |
| UI-09 | Phase 6 | Complete |
| UI-10 | Phase 6 | Complete |
| UI-11 | Phase 6 | Complete |
| FDN-01 | Phase 1 | Complete |
| FDN-02 | Phase 3 | Complete |
| FDN-03 | Phase 1 | Complete |
| FDN-04 | Phase 1 | Complete |
| ART-01 | Phase 6.1 | Complete |
| ART-02 | Phase 6.1 | Pending |
| NOTE-01 | Phase 6.1 | Pending |
| NOTE-02 | Phase 6.1 | Pending |
| HAND-01 | Phase 6.1 | Complete |
| HAND-02 | Phase 6.1 | Pending |
| HAND-03 | Phase 6.1 | Complete |
| AUD-01 | Phase 6.1 | Pending |

**Coverage:**
- v1 requirements: 65 total
- Mapped to phases: 65
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-01*
*Last updated: 2026-09-17 — Phase 6.1 table-polish requirements added at owner sign-off; player notes moved from Out of Scope to v1 (NOTE-02)*
