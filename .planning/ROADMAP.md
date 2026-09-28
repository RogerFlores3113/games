# Roadmap: games.rogerflores.dev

## Milestones

- ✅ **v1.0 Hanabi**: Phases 1–7 (shipped 2026-09-19, archived 2026-09-22)
- 🚧 **v2.0 Expedition** (in progress): Phases 8–15, a roguelite co-op trick-taking game (spec at `docs/superpowers/specs/2026-09-22-expedition-design.md`)

## Phases

<details>
<summary>✅ v1.0 Hanabi (Phases 1–7): SHIPPED 2026-09-19</summary>

- [x] Phase 1: Room & Transport Skeleton (11 plans), completed 2026-09-15
- [x] Phase 2: Per-Seat Redaction Contract (6 plans), completed 2026-09-15
- [x] Phase 3: Hanabi Rules Engine (5 plans), completed 2026-09-16
- [x] Phase 4: Wire Engine Into Room Actor (9 plans), completed 2026-09-16
- [x] Phase 5: Reconnect & Session Durability Hardening (6 plans), completed 2026-09-16
- [x] Phase 6: Game Interface (7 plans), completed 2026-09-17
- [x] Phase 6.1: Table Polish, INSERTED (15 plans), completed 2026-09-17
- [x] Phase 6.2: Board Redesign, INSERTED (20 plans), completed 2026-09-18
- [x] Phase 7: Variant Support: Rainbow, Black (13 plans), completed 2026-09-19

Full phase details: `.planning/milestones/v1.0-ROADMAP.md`
Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
Audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`
Phase artifacts: `.planning/milestones/v1.0-phases/`

</details>

- [x] **Phase 8: Multi-Game Rooms** - A room carries its game id; Hanabi keeps working unchanged behind a genuinely generic registry (completed 2026-09-23)
- [x] **Phase 9: Expedition Rules Core** - A pure, property-tested deck/trick/objective engine for the Expedition round rules (completed 2026-09-24)
- [x] **Phase 10: Run Layer, Gear Engine & Bosses** - The full six-camp run: draft, loadout, replay-on-fail, the hook/toolkit engine, the v1 gear and boss catalogues, and the Whisper (completed 2026-09-27)
- [x] **Phase 11: Adapter, Schemas & Worker Wiring** - Expedition wired into the room actor with a leak-checked per-seat view proven across whole simulated runs (completed 2026-09-27)
- [ ] **Phase 12: Phaser Shell** - Expedition renders as a pixel-art camp scene, isolated from the rest of the site, with mount/unmount and test-bridge discipline established
- [ ] **Phase 13: Fireside & Run-End Scenes** - The between-camps fireside, the run-end scene, and an in-scene rules reference
- [ ] **Phase 14: Art Pass** - PixelLab and verified CC0 art replace placeholders, every asset licence-recorded, owner sign-off
- [ ] **Phase 15: Balance Pass** - The camp ramp is tuned through play-tests until a run feels right

## Phase Details

### Phase 8: Multi-Game Rooms

**Goal**: A room carries its `gameId`, with each game bringing its own config, seat limits and view schema looked up from a registry. Hanabi is re-registered through it and keeps working exactly as before. The registry is proven with a test-only second game; Expedition's option on the landing page stays visible but disabled until Phase 12 makes it playable, so no deploy ever offers an unplayable game.
**Depends on**: Nothing (first phase of v2.0; builds on the `GameAdapter` seam v1.0 already proved)
**Requirements**: MGR-01, MGR-02, MGR-03, MGR-04, MGR-05, MGR-06, MGR-07, MGR-08
**Success Criteria** (what must be TRUE):

  1. The host chooses the game when creating a room, and the link opens that game's lobby showing only that game's own settings. This is proven end to end with Hanabi plus a test-only second game; the Expedition option is shown disabled ("coming soon") on the live landing page.
  2. Each game's seat limits (Hanabi 2–5, Expedition 3–5) are enforced when players join a new room of that game.
  3. Deploying the multi-game change resets any saved rooms cleanly to empty lobbies rather than corrupting mid-game state (a schema-version bump), and the deploy is timed for when no game is in progress.
  4. Hanabi's full existing unit and e2e suites pass with only fixture-rename diffs.
  5. `npm run typecheck` works from the repo root via a root `tsconfig.json` with project references, and "Create room" stays usable promptly even under heavy parallel e2e load — both fixed at the cause, not with retries.

**Plans**: 10 plans

Plans:
**Wave 1**

- [x] 08-01-PLAN.md — Root tsconfig with project references; `npm run typecheck` works (MGR-07)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 08-02-PLAN.md — Contracts: generic GameAdapter, GameId/HanabiErrorCode/CreateRoomRequest schemas (D-06, D-09)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 08-03-PLAN.md — Per-game namespaced wire errors; gameId-keyed worker registry with injectable games parameter (D-07, D-08, D-09)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 08-04-PLAN.md — Room view carries gameId/config/limits; per-game view validation; lobby reads limits (D-05, MGR-02, MGR-05)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 08-05-PLAN.md — Persisted room carries gameId/config/gameLocked; setConfig; schema v5 reset (D-03, D-04, D-13, MGR-06)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 08-06-PLAN.md — set_config replaces set_variant; first join locks the game; old clients fail closed (D-01, D-15)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 08-07-PLAN.md — Test-only toy game proves the registry; production-isolation guards (D-10, D-11)
- [x] 08-08-PLAN.md — Web: gameId-keyed board and lobby settings, pending game on the first join (D-02, D-11, MGR-03)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 08-09-PLAN.md — Landing: pre-hydration native create with cookie hand-off, Expedition "coming soon" (D-12, D-17, MGR-08)

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 08-10-PLAN.md — Deploy checklist and phase gate: three consecutive clean e2e runs, no retries (D-14, D-18)

**Cross-cutting constraints:**

- MGR-04: Hanabi plays exactly as before; existing suites pass with fixture-rename diffs only

### Phase 9: Expedition Rules Core

**Goal**: A pure, framework-free Expedition rules engine exists — deck construction, legal plays, trick winner, the camp state machine, and all four objective kinds — verified by property tests against the spec's rule text, not just hand-written examples.
**Depends on**: Phase 8 (registry seam Expedition will plug into later; the engine itself is framework-free and could build in parallel, but is sequenced after per the owner-approved spec's build order)
**Requirements**: XRULE-01, XRULE-02, XRULE-03, XRULE-04, XRULE-05, XRULE-06, XRULE-07, XRULE-08
**Success Criteria** (what must be TRUE):

  1. 3–5 players are dealt equal hands from the correctly-sized 54/52/50-card deck (2s removed per player count), with removed cards shown to everyone.
  2. Follow-suit and trick-winner logic correctly handle the Sun/Moon two-card joker suit for both lead directions, proven by fast-check property tests across all deck sizes, not one hand-tested example.
  3. The Sun holder (or A♠ when the Sun is out of play) is the expedition leader, picks the first objective, and leads first; every objective's status (pending/done/failed) is always visible to everyone.
  4. A camp fails the instant any objective becomes impossible — including an exactly-N objective becoming mathematically unreachable before its holder's final relevant trick — proven by fast-check property tests on failure timing, not just the late-detectable case.
  5. Played cards are final: there is no undo and no auto-play of a queued card. (Gear and Whisper finality is proven in Phase 10, where they exist.)

**Plans**: 8 plans (6 complete + 2 gap closure)

Plans:
**Wave 1**

- [x] 09-01-PLAN.md — Core type contract (state.ts) and deck per player count, deal, removed cards, objective deck (XRULE-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 09-02-PLAN.md — Follow-suit with the Sun/Moon joker suit, trick winner, expedition leader with A♠ fallback (XRULE-02, 03, 04)
- [x] 09-03-PLAN.md — Four objective kinds as an ObjectiveKindDef registry, earliest-moment failure, clockwise pick order (XRULE-05, 06, 07)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 09-04-PLAN.md — CoreRules hook seam, createCamp, derived phase/actor/outcome (XRULE-01, 04, 05, 07)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 09-05-PLAN.md — Legality predicates and applyCampAction; no undo, no auto-play (XRULE-08)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 09-06-PLAN.md — Whole-camp fast-check simulations, failure-timing proofs, purity guard (XRULE-07)

**Gap closure** *(wave 1, parallel; from 09-REVIEW.md WR-01/WR-02 via 09-HUMAN-UAT.md)*

- [x] 09-07-PLAN.md — Monotone ordered-objective evaluator (WR-01) + independent pair-based oracle and post-failure prefix monotonicity property (WR-02) (XRULE-06, 07)
- [x] 09-08-PLAN.md — Validate leaderFor/nextLeader hook seat ids (WR-04), plus adjacent IN-02/IN-06 hardening (XRULE-02, 04)

### Phase 10: Run Layer, Gear Engine & Bosses

**Goal**: The full six-camp run — supplies, replay-on-failure, capacity, draft, loadout — built on the layered hook/toolkit engine (base → boss twist → gear), with the v1 gear catalogue, the provisional boss twists, and the Whisper communication mechanic all working end to end.
**Depends on**: Phase 9 (rules core: camp state machine, objective evaluation)
**Requirements**: COMM-01, COMM-02, RUN-01, RUN-02, RUN-03, RUN-04, RUN-05, RUN-06, RUN-07, GEAR-01, GEAR-02, GEAR-03, GEAR-04, GEAR-05, GEAR-06, BOSS-01, ENG-01, ENG-02
**Success Criteria** (what must be TRUE):

  1. A player can Whisper one card to one teammate once per camp, only after objectives are picked and only between tricks; everyone sees who whispered to whom, only the target sees the card, and the reveal stays visible to its audience for the rest of the camp before clearing at camp end or replay.
  2. An explicit fail-then-replay integration test proves every camp-scoped resource — gear-used flags, active modifiers, the leader, Whisper availability, reveals — resets on replay, while owned and equipped gear correctly persists.
  3. A full run replays deterministically from its seed and action log: every draft offer, deal, boss selection and random gear effect draws exclusively from the carried seeded RNG, never `Math.random()`.
  4. Each player drafts 1 of 3 private, never-already-owned gear offers at the run's start and after each cleared camp, equips owned gear up to their camp-number capacity, and every loadout is publicly visible; each v1 gear item (info, objective, table, run gear) and the one v1 boss twist per boss camp work exactly as specced, with a confirm step before targeted gear/Whispers take effect, no undo once they resolve, and a visible reason when gear can't be used.
  5. Adding a new gear item, objective kind, boss twist or interactable is a one-file-plus-registry-line change, and every registered entry is checked automatically for a unique id, valid size/window, deterministic effect, card conservation and no view leak.

**Plans**: 19 plans

Plans:
**Wave 1**

- [x] 10-01-PLAN.md — Core hook hardening: isTrump routed (WR-03), trickWinner validated (WR-05), one throw policy + no nextLeader after the final trick (WR-06, A3)
- [x] 10-02-PLAN.md — Type contracts (RunState, RunAction, RunRules/RuleModifier, GearDef, BossDef, ToolkitOp), RNG stream names (A1), recursive purity guard

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 10-03-PLAN.md — Hook composition (base → boss → gear → effects, recomputed per call) and the balance table (RUN-01, D-14/D-15)
- [x] 10-04-PLAN.md — Toolkit: timing windows, GearContext, availability reasons (GEAR-06), own-hand-only targets, invariant-checked op executor

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 10-05-PLAN.md — Draft offers and run lifecycle: supplies, replay, capacity, boss draw (D-01..D-04, D-12), face-down dealing
- [x] 10-06-PLAN.md — The Whisper (COMM-01/02) and the generic use-gear pipeline (GEAR-05 engine side, GEAR-06)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 10-07-PLAN.md — applyRunAction dispatcher (draft, loadout, ready, skip, camp delegation) and run simulation helpers

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 10-08-PLAN.md — Information gear: Signal Whistle, Spyglass, Signal Flare (GEAR-01, D-08)
- [x] 10-09-PLAN.md — Objective gear: Compass, Trail Map (D-10), Camouflage (D-11) (GEAR-02)
- [x] 10-10-PLAN.md — Table gear: Trained Monkey, Machete (D-09) (GEAR-03)
- [x] 10-11-PLAN.md — Run gear: Rain Poncho (D-04, D-12), Energy Tonic (GEAR-04)
- [x] 10-12-PLAN.md — Boss twists: Monsoon, Eclipse with its own deck table (BOSS-01)
- [x] 10-13-PLAN.md — Boss twists: Thick Fog, Mutiny (BOSS-01)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 10-14-PLAN.md — BOSS_REGISTRY + boss and objective-kind catalogue contract tests (ENG-01, ENG-02)
- [x] 10-15-PLAN.md — GEAR_REGISTRY + gear catalogue contract test (ENG-01, ENG-02)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 10-16-PLAN.md — Production CATALOG, fail-then-replay integration test (RUN-06, COMM-01/02), README recipes (ENG-01)
- [x] 10-17-PLAN.md — Whole-run property tests: deterministic replay from seed + action log (RUN-07)

**Wave 8 (gap closure)** *(from 10-VERIFICATION.md)*

- [x] 10-18-PLAN.md — Compass rerolls win-card objectives (CR-01) + harness enumerates objective-pick gear and every accepted target combo (WR-01) (GEAR-02, ENG-02)
- [x] 10-19-PLAN.md — Trail Map legality ignores hidden objectives under Thick Fog (WR-02) (GEAR-06, GEAR-02)

### Phase 11: Adapter, Schemas & Worker Wiring

**Goal**: `ExpeditionAdapter` implements `GameAdapter` and is wired through Phase 8's registry seam; the per-seat view is built from an explicit allowlist and proven leak-free across whole simulated runs, not just immediately after a reveal.
**Depends on**: Phase 8 (registry seam), Phase 10 (run layer, gear/boss catalogue, reveals to leak-check)
**Requirements**: COMM-03, ENG-03
**Success Criteria** (what must be TRUE):

  1. The leak checker asserts no seat's view or log ever contains another seat's card — except through a reveal addressed to that seat — at every step of full simulated runs, not only in the turn immediately following a reveal's creation.
  2. Thick Fog's face-down objectives are omitted from the server's per-seat view payload itself, never merely hidden by a client-side conditional.
  3. Property-based simulated runs across 3, 4 and 5 players, every boss twist, and random loadouts always end, never throw, conserve cards, and never leak.

**Plans**: 7 plans

Plans:
**Wave 1**

- [x] 11-01-PLAN.md — ExpeditionView contract + toExpeditionPlayerView allowlist projection, Thick Fog omission, WR-03 reveal ruling (COMM-03)
- [x] 11-02-PLAN.md — Expedition Zod wire schemas (view/errors/config) + @games/schema/games/expedition subpath (COMM-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 11-03-PLAN.md — expeditionGame adapter + hostile-input request guards + @games/rules exports (COMM-03, ENG-03)
- [x] 11-04-PLAN.md — Per-seat leak checker with canaries + whole-run every-step leak property (COMM-03, ENG-03)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 11-05-PLAN.md — Replace Phase 10 interim no-leak checks in run property / gear / boss contracts + README (ENG-03, COMM-03)
- [x] 11-06-PLAN.md — Production registration: GameId widening, error/create-room members, registry entry + compile-time asserts, web board map (COMM-03)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 11-07-PLAN.md — Room-level end-to-end wiring test with per-step schema + wire leak checks; structural confinement (COMM-03, ENG-03)

### Phase 12: Phaser Shell

**Goal**: Expedition renders as a pixel-art camp scene through a dynamically-imported Phaser canvas, isolated from the rest of the site, with the React mount/unmount discipline, pixel-art config, and Playwright test bridge established once, correctly, before scenes multiply.
**Depends on**: Phase 11 (a real, leak-checked view schema to render against)
**Requirements**: SCENE-01, SCENE-02, SCENE-03, SCENE-04, SCENE-08, SCENE-09, SCENE-10, SCENE-11, SCENE-12
**Success Criteria** (what must be TRUE):

  1. The Expedition option on the landing page is enabled, and creating an Expedition room works end to end. Expedition's Phaser bundle loads only on an Expedition game page; the landing page and Hanabi bundles never include Phaser.
  2. The camp scene seats players around an oval stump table in turn order, with hand, trick, per-seat objectives and gear, supplies, camp number and boss twist all visible; cards you can't legally play are dimmed, the trick shows who led what, and a player can glance at the last completed trick.
  3. Navigating away from and back into an Expedition room does not double-mount the canvas or leak a WebGL context, verified under React strict mode; pixel art stays crisp at 1280×720 and above, verified with placeholder art before the art pass.
  4. A player chooses a card pack (Big Index default, Classic), saved per browser and affecting only their own view; the four interactables react to clicks without ever touching game state; a refresh or reconnect mid-camp — including during a draft, a loadout, or an open timing window — resumes the same seat and state.
  5. Playwright drives a full camp (create room, draft, loadout, play, use gear, Whisper, refresh-and-resume) through `window.__expeditionTest`, which is absent from production builds; the owner reviews the placeholder-art camp scene and signs off that it reads correctly before the art pass begins.

**Plans**: 14 plans
**UI hint**: yes

Plans:
**Wave 1**

- [x] 12-01-PLAN.md — D-17/WR-06: native landing form yields config null for Expedition (SCENE-01)
- [x] 12-02-PLAN.md — Gear/boss display catalogue, D-02 targeting state machine, bridge id scheme
- [x] 12-03-PLAN.md — Whole-number zoom, stage layout, canvas palette, font keys, card-pack pref (SCENE-08/10)
- [x] 12-04-PLAN.md — Owner-gated phaser install, Phaser import confinement test, production build check (checkpoint)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 12-05-PLAN.md — TDD: buildSceneModel + between-camps model (SCENE-02/03/04)
- [x] 12-06-PLAN.md — Bitmap pixel fonts and the Big Index / Classic card packs
- [x] 12-07-PLAN.md — Four interactables registry + contract test (SCENE-09)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 12-08-PLAN.md — Scene store, Strict-Mode-safe Phaser mount, test bridge, ExpeditionBoard, camp static layer

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 12-09-PLAN.md — Camp table: seats, hand, trick, last-trick glance, highlight-then-confirm input
- [x] 12-11-PLAN.md — Settings button + modal: card pack, mute slot, host delete/restart, Leave (D-05)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 12-10-PLAN.md — Between-camps stub scene (D-01), e2e helpers, mount/scaling e2e

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 12-12-PLAN.md — Enable Expedition on the landing page, bundle-isolation e2e, README

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 12-13-PLAN.md — Full-camp e2e through window.__expeditionTest, resume, packs, interactables

**Wave 8** *(blocked on Wave 7 completion)*

- [ ] 12-14-PLAN.md — Phase gate + owner sign-off on the placeholder camp scene (checkpoint)

### Phase 13: Fireside & Run-End Scenes

**Goal**: The between-camps fireside scene (trail, draft, loadout-as-backpack) and the run-end scene, plus an in-scene rules reference, built on Phase 12's established scene conventions.
**Depends on**: Phase 12 (scene bootstrap, `buildSceneModel` conventions, test bridge)
**Requirements**: SCENE-05, SCENE-06, SCENE-07
**Success Criteria** (what must be TRUE):

  1. The fireside scene shows the trail of six camps and where the crew stands, the draft of three gear items, and loadout packing into capacity slots, with gear rules text shown only on hover — minimal text otherwise.
  2. The run-end scene shows whether the expedition reached the temple or turned back, with the camp reached and supplies left.
  3. A rules reference can be opened from the scene, showing the trick rules, what each objective marker means, and the current boss twist.
  4. The owner reviews both scenes with placeholder art and signs off that they read correctly before the art pass begins.

**Plans**: TBD
**UI hint**: yes

### Phase 14: Art Pass

**Goal**: PixelLab generations and verified CC0/permissive pixel packs replace every placeholder, each asset licence-verified and recorded at sourcing time, gated on the owner's visual sign-off.
**Depends on**: Phase 12, Phase 13 (scenes to skin)
**Requirements**: ARTX-01, ARTX-02, ARTX-03
**Success Criteria** (what must be TRUE):

  1. Every asset used — PixelLab generation or CC0/permissive pack — is recorded in `CREDITS.md` with its source and licence at the time it is sourced, not batched at the end of the phase.
  2. No shipped asset shows people or watermarks.
  3. PixelLab prompt specs are kept in the repo so assets can be regenerated consistently.
  4. The owner signs off the finished scene art in a visual review.

**Plans**: TBD
**UI hint**: yes

### Phase 15: Balance Pass

**Goal**: The camp ramp's balance table is tuned through play-tests with the owner's group until a run feels right.
**Depends on**: Phase 10, Phase 11, Phase 12, Phase 13 (the full loop must be playable end to end)
**Requirements**: BAL-01
**Success Criteria** (what must be TRUE):

  1. The owner's group plays full runs end to end against the current balance table.
  2. A typical run takes about 35–45 minutes.
  3. The owner judges runs winnable but not trivial, and signs off on the tuned balance table.

**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|---|---|---|---|---|
| 1. Room & Transport Skeleton | v1.0 | 11/11 | Complete | 2026-09-15 |
| 2. Per-Seat Redaction Contract | v1.0 | 6/6 | Complete | 2026-09-15 |
| 3. Hanabi Rules Engine | v1.0 | 5/5 | Complete | 2026-09-16 |
| 4. Wire Engine Into Room Actor | v1.0 | 9/9 | Complete | 2026-09-16 |
| 5. Reconnect & Session Durability | v1.0 | 6/6 | Complete | 2026-09-16 |
| 6. Game Interface | v1.0 | 7/7 | Complete | 2026-09-17 |
| 6.1. Table Polish | v1.0 | 15/15 | Complete | 2026-09-17 |
| 6.2. Board Redesign | v1.0 | 20/20 | Complete | 2026-09-18 |
| 7. Variant Support | v1.0 | 13/13 | Complete | 2026-09-19 |
| 8. Multi-Game Rooms | v2.0 | 10/10 | Complete   | 2026-09-23 |
| 9. Expedition Rules Core | v2.0 | 8/8 | Complete    | 2026-09-27 |
| 10. Run Layer, Gear Engine & Bosses | v2.0 | 19/19 | Complete    | 2026-09-27 |
| 11. Adapter, Schemas & Worker Wiring | v2.0 | 7/7 | Complete    | 2026-09-27 |
| 12. Phaser Shell | v2.0 | 11/14 | In Progress|  |
| 13. Fireside & Run-End Scenes | v2.0 | 0/? | Not started | - |
| 14. Art Pass | v2.0 | 0/? | Not started | - |
| 15. Balance Pass | v2.0 | 0/? | Not started | - |
