# Requirements: games.rogerflores.dev — v2.0 Expedition

**Defined:** 2026-09-22
**Core Value:** A friend clicks a link and is playing within seconds — and the game does not break, stall, or lose their seat for the rest of the session.
**Source of truth:** `docs/superpowers/specs/2026-09-22-expedition-design.md` (owner-approved 2026-09-22), plus owner scoping decisions made 2026-09-22 during milestone setup.

## v2.0 Requirements

### Multi-game rooms

- [x] **MGR-01**: The host chooses the game when creating a room, and the room link opens that game's lobby. Proven in Phase 8 with Hanabi plus a test-only second game; the Expedition option stays disabled until Phase 12 makes it playable
- [ ] **MGR-02**: Each game sets its own seat limits (Hanabi 2–5, Expedition 3–5), and the lobby enforces them
- [x] **MGR-03**: Each game brings its own settings. The host sees only the current game's settings (Hanabi: variant; Expedition: none in v2.0)
- [x] **MGR-04**: Hanabi plays exactly as before. The full existing unit and e2e suites pass, with only fixture renames allowed as diffs
- [x] **MGR-05**: Every per-seat view is validated against its own game's view schema before it is sent
- [x] **MGR-06**: Deploying the multi-game change resets saved rooms to empty lobbies (a schema-version bump), and the deploy is timed for when no game is in progress
- [x] **MGR-07**: `npm run typecheck` works from the repo root, via a root `tsconfig.json` with project references (v1.0 debt)
- [x] **MGR-08**: "Create room" becomes usable promptly even under heavy parallel e2e load, fixed at the cause rather than with retries (v1.0 debt)

### Expedition rules

- [x] **XRULE-01**: 3–5 players are dealt equal hands from a 54-card deck (A–2 in four suits, plus the Sun and Moon jokers). 4 players remove 2♣ and 2♦; 5 players remove all four 2s. Removed cards are shown to everyone
- [x] **XRULE-02**: A player must follow the led suit if they can, and may play anything if they can't. The Sun or Moon wins the trick (Sun beats Moon); otherwise the highest card of the led suit wins, and the winner leads next
- [x] **XRULE-03**: When the Sun or Moon is led, whoever holds the other one must play it
- [x] **XRULE-04**: The holder of the Sun is the expedition leader: they pick the first objective and lead the first trick. The holder of A♠ leads when the Sun is out of play
- [x] **XRULE-05**: Objectives are flipped from a second deck and taken one at a time, starting with the leader and going clockwise, until all are taken
- [x] **XRULE-06**: Objective kinds are win-card, ordered (①/②/last), no-tricks and exactly-N. Each objective's status (pending, done, failed) is always visible to everyone
- [x] **XRULE-07**: A camp succeeds when every objective is done, and fails the moment any objective becomes impossible or a failure check fires. Play stops at that point
- [x] **XRULE-08**: Played cards are final: there is no undo and no auto-play of a queued card

### Communication and hidden information

- [x] **COMM-01**: Once per camp, after objectives are picked and only between tricks, a player can show one card from their hand to one teammate. Only that teammate sees the card; everyone sees who whispered to whom
- [x] **COMM-02**: A private reveal (Whisper, Spyglass) stays visible to its audience for the rest of the camp and clears when the camp ends or is replayed
- [ ] **COMM-03**: No player's view or log ever contains another seat's card, except through a reveal addressed to that player. This is checked at every step of full simulated runs, not only right after a reveal

### Run structure

- [x] **RUN-01**: A run is six camps. Camps 3 and 6 are boss camps, and objective counts and difficulty follow the balance table (ordered pair from camp 4, trick-count objective from camp 5)
- [x] **RUN-02**: The crew starts with 3 supplies. A failed camp costs 1 supply (plus any Energy Tonic penalty) and is replayed with a fresh deal and fresh objectives. At 0 supplies the run is lost; clearing camp 6 wins it
- [x] **RUN-03**: Each player's capacity equals the current camp number, whatever the number of attempts
- [x] **RUN-04**: Each player drafts 1 of 3 offered gear at the start of the run and after each cleared camp. They are never offered gear they already own, and their offers are private
- [x] **RUN-05**: Between camps, each player equips owned gear up to their capacity. Every player's loadout is visible to everyone during play and at the fireside
- [x] **RUN-06**: Each equipped piece of gear can be used once per camp, in its timing window. Used flags, rule modifiers and the leader all reset when a camp is replayed
- [ ] **RUN-07**: Every run replays deterministically from its seed and action log

### Gear (v1 catalogue)

- [x] **GEAR-01**: Information gear works as specced: Signal Whistle (a second Whisper), Spyglass (see a random card from a chosen teammate), Signal Flare (your Whisper is shown to everyone)
- [x] **GEAR-02**: Objective gear works as specced:
  - Compass: rerolls a face-up, untaken objective. An ordered objective's replacement keeps its order marker.
  - Trail Map: swaps unresolved objectives between two players.
  - Camouflage: drops one of your objectives. Winning any later trick then fails the camp, and it can't be used after you've already won a trick.
- [x] **GEAR-03**: Table gear works as specced: Trained Monkey (swap a chosen card for a random card from a teammate), Machete (lead the next trick yourself)
- [x] **GEAR-04**: Run gear works as specced: Rain Poncho (cancel the boss twist, but no Whispers that camp; used before the deal), Energy Tonic (size 0, +2 capacity, and a failed camp costs 1 extra supply per equipped Tonic)
- [ ] **GEAR-05**: Targeted gear and Whispers show a confirm step before they take effect, and are final once they resolve (no undo)
- [ ] **GEAR-06**: Gear that can't be used right now shows the reason

### Boss twists

- [x] **BOSS-01**: Each boss camp applies one twist from the provisional v1 set:
  - Monsoon: no Whispers.
  - Eclipse: no Sun or Moon, its own even deal per player count, and the A♠ holder leads.
  - Thick Fog: objectives dealt face-down, left out of other players' views on the server.
  - Mutiny: the leader must not win the first trick.

### Engine extensibility

- [x] **ENG-01**: Adding a piece of gear, an objective kind, a boss twist, an interactable or a card pack takes one file plus one registry line. The recipes are documented in the package README
- [x] **ENG-02**: Every registered catalogue entry is checked automatically: unique id, valid size and window, deterministic effect, card conservation, and no view leak
- [ ] **ENG-03**: Property-based simulated runs across 3, 4 and 5 players, every boss twist and random loadouts always end, never throw, conserve cards and never leak

### Scenes (Phaser)

- [ ] **SCENE-01**: Expedition renders in Phaser, loaded only on an Expedition game page and never on the landing page or in Hanabi
- [ ] **SCENE-02**: The camp scene seats players around an oval stump table in turn order, with your hand at the bottom and the trick in the middle. Each seat shows its objectives with status and its equipped gear. Supplies, camp number and the boss twist are shown within the scene
- [ ] **SCENE-03**: Cards you can't legally play are dimmed, and the trick shows which card was led and by whom
- [ ] **SCENE-04**: A player can glance at the last completed trick: who led, what was played, who won
- [ ] **SCENE-05**: The between-camps fireside scene shows the trail of six camps, the draft of three gear, and loadout packing into capacity slots. Text is minimal, with gear rules shown only on hover
- [ ] **SCENE-06**: The run-end scene shows whether the expedition reached the temple or turned back, with the camp reached and supplies left
- [ ] **SCENE-07**: A rules reference can be opened from the scene: the trick rules, what each objective marker means, and the current boss twist
- [ ] **SCENE-08**: Each player chooses a card pack, Big Index (the default) or Classic. The choice is saved per browser and only changes that player's view
- [ ] **SCENE-09**: Four interactables (campfire, fireflies, lantern, the red panda mascot) react to clicks and never affect game state
- [ ] **SCENE-10**: Pixel art stays crisp at any window size from the 1280×720 minimum upward
- [ ] **SCENE-11**: A refresh or reconnect in the middle of a camp, including during a draft, a loadout or an open timing window, resumes the same seat and state
- [ ] **SCENE-12**: Playwright can drive a full camp through a test-only object bridge that is absent from production builds

### Art

- [ ] **ARTX-01**: Scene art comes from PixelLab generations and verified CC0 or permissive packs. Each asset is recorded in CREDITS.md with its source and licence before use, and nothing shows people or watermarks
- [ ] **ARTX-02**: PixelLab prompt specs are kept in the repo so assets can be regenerated consistently
- [ ] **ARTX-03**: The owner signs off the scene art in a visual review

### Balance

- [ ] **BAL-01**: The balance table is tuned through play-tests with the owner's group until a typical run takes about 35–45 minutes and the owner judges runs winnable but not trivial

## Future Requirements

Deferred by the owner during v2.0 scoping (2026-09-22):

- **"Why we failed" moment**: before a replay, show which objective broke and why. Research rated this high value.
- **"What can I do now" signal**: one indicator of the open timing window and the actions available to you.
- **Room best-run record**: furthest camp and supplies left, shown in the lobby and at run end.
- **Multi-trick history** beyond the last trick.
- **Keyboard play and screen-reader support** for the canvas game.
- **Original, jungle-native boss twists** to replace the provisional four.
- **Custom illustrated cards for gear** (the `art` field exists; v2.0 shows text cards).
- **Opt-in "play my queued card instantly"**, only if proven safe against the timing windows.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Screen-reader and keyboard accessibility in v2.0 | Owner decision 2026-09-22: mouse only for v2.0, recorded as a Key Decision |
| Migrating saved rooms across the multi-game change | Owner decision 2026-09-22: reset on deploy instead (MGR-06) |
| Undo of plays, gear or Whispers | Information already revealed can't be un-revealed |
| Auto-play of a queued card | Races the between-tricks window for Whispers and gear |
| Free-text notes on Whispers, in-app chat | Standing project decision; the Whisper stays structured and server-verified |
| Meta-progression and run statistics across runs | Spec §2: nothing persists across runs in v2.0 |
| 2-player mode | Spec §2 |
| Audio for Expedition | Spec §2 |
| Spectators and run replays | Standing project decision |
| Multi-step secret interactables | Poor payoff for a four-person group; four simple interactables only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MGR-01 | Phase 8 | Complete |
| MGR-02 | Phase 8 | Pending |
| MGR-03 | Phase 8 | Complete |
| MGR-04 | Phase 8 | Complete |
| MGR-05 | Phase 8 | Complete |
| MGR-06 | Phase 8 | Complete |
| MGR-07 | Phase 8 | Complete |
| MGR-08 | Phase 8 | Complete |
| XRULE-01 | Phase 9 | Complete |
| XRULE-02 | Phase 9 | Complete |
| XRULE-03 | Phase 9 | Complete |
| XRULE-04 | Phase 9 | Complete |
| XRULE-05 | Phase 9 | Complete |
| XRULE-06 | Phase 9 | Complete |
| XRULE-07 | Phase 9 | Complete |
| XRULE-08 | Phase 9 | Complete |
| COMM-01 | Phase 10 | Complete |
| COMM-02 | Phase 10 | Complete |
| COMM-03 | Phase 11 | Pending |
| RUN-01 | Phase 10 | Complete |
| RUN-02 | Phase 10 | Complete |
| RUN-03 | Phase 10 | Complete |
| RUN-04 | Phase 10 | Complete |
| RUN-05 | Phase 10 | Complete |
| RUN-06 | Phase 10 | Complete |
| RUN-07 | Phase 10 | Pending |
| GEAR-01 | Phase 10 | Complete |
| GEAR-02 | Phase 10 | Complete |
| GEAR-03 | Phase 10 | Complete |
| GEAR-04 | Phase 10 | Complete |
| GEAR-05 | Phase 10 | Pending |
| GEAR-06 | Phase 10 | Pending |
| BOSS-01 | Phase 10 | Complete |
| ENG-01 | Phase 10 | Complete |
| ENG-02 | Phase 10 | Complete |
| ENG-03 | Phase 11 | Pending |
| SCENE-01 | Phase 12 | Pending |
| SCENE-02 | Phase 12 | Pending |
| SCENE-03 | Phase 12 | Pending |
| SCENE-04 | Phase 12 | Pending |
| SCENE-05 | Phase 13 | Pending |
| SCENE-06 | Phase 13 | Pending |
| SCENE-07 | Phase 13 | Pending |
| SCENE-08 | Phase 12 | Pending |
| SCENE-09 | Phase 12 | Pending |
| SCENE-10 | Phase 12 | Pending |
| SCENE-11 | Phase 12 | Pending |
| SCENE-12 | Phase 12 | Pending |
| ARTX-01 | Phase 14 | Pending |
| ARTX-02 | Phase 14 | Pending |
| ARTX-03 | Phase 14 | Pending |
| BAL-01 | Phase 15 | Pending |

**Coverage:**
- v2.0 requirements: 52 total
- Mapped to phases: 52/52 ✓

---
*Requirements defined: 2026-09-22*
*Last updated: 2026-09-22 after v2.0 roadmap creation (Phases 8-15, 52/52 requirements mapped)*
