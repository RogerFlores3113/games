# Expedition: design spec

**Date:** 2026-09-22
**Status:** Draft for owner review
**Working title:** Expedition (game id `expedition`). The owner may rename it; the id is internal.

A cooperative, roguelite trick-taking game in the spirit of The Crew, for
games.rogerflores.dev. It is played with a standard 54-card deck, has its own
communication rule (the Whisper), gives each player an identity through drafted
gear, and runs as pixel art in Phaser in the style of rogerflores.dev.

---

## 1. Goals

**Who it's for:** the same group as Hanabi — friends on a voice call who open a link
and play. Table talk about hands is banned; everything that crosses the table goes
through the game.

**What success looks like:**
- A run fits one game night: 6 camps, roughly 35–45 minutes.
- Each player ends the run with a recognisable identity built from their gear.
- It looks and feels like rogerflores.dev: pixel-art jungle at night, a world that is
  the interface, things to click that react — not panels and buttons.
- Adding a new piece of gear, objective kind, boss twist, interactable or card pack is
  a one-file change plus a registry line. Adding a new mechanic is a local change to
  one extension point. (Owner requirement, 2026-09-22: "asking for changes to things
  and new cards and new mechanics should be easy because it extends easily.")

**Non-negotiables inherited from the project:** server-authoritative state, a strictly
per-seat view (a client never receives a card it is not entitled to see), survives
refresh/disconnect/sleeping tab, runs on the free tiers already in use.

---

## 2. Scope and order of work

Two sub-projects, built in order.

**Sub-project 1 — multi-game rooms.** Today the room layer is game-agnostic in
principle but wired to Hanabi in practice:
- `apps/worker/src/game-registration.ts` exports a single hard-coded `activeGame`;
- `VariantSchema` (`base | rainbow | black`) sits in the shared room and message
  schemas;
- `MIN_PLAYERS = 2` / `MAX_PLAYERS = 5` are global constants;
- `GameEndResult` is `{ score, reason, band? }`, shaped for Hanabi.

Sub-project 1 makes the room layer carry a `gameId` chosen at room creation, with
per-game config schema, seat limits, view schema and end-result shape looked up from
a game registry. Hanabi keeps working unchanged, with its full test suite passing.
Expedition is registered as a second game. The landing page's game picker enables it.

**Sub-project 2 — Expedition.** Everything else in this spec.

**Out of scope for v1:**
- 2-player mode (no dummy hand).
- Anything persisting across runs except the room's best-run record (no meta-unlocks).
- Audio.
- Spectators.
- Mobile-first layout. Desktop/laptop landscape is the target, at a 1280×720
  minimum like Hanabi; mobile landscape is best effort.
- Custom illustrated cards for gear. The data model supports them (`art`), v1 shows
  text cards.

---

## 3. Round rules

A "camp" is one round: one deal, played to the last trick.

### Deck and deal
- 54 cards: A (high) down to 2 in ♠ ♥ ♦ ♣, plus two Jokers — the **Sun** (big) and
  the **Moon** (little).
- 3 players: all 54, 18 each. 4 players: remove 2♣ 2♦, 13 each. 5 players: remove
  all four 2s, 10 each.
- Removed cards are public.

### Tricks
- Follow the led suit if you can. If you can't, play anything, including the Sun or
  Moon.
- The Sun or Moon wins the trick (Sun beats Moon). Otherwise the highest card of the
  led suit wins.
- For following purposes the Sun and Moon form their own two-card suit: if one is
  led, whoever holds the other must play it.
- The trick's winner leads the next trick, unless a rule hook says otherwise.

### Expedition leader
- Whoever holds the Sun is the expedition leader for the camp. If the Sun is not in
  play (see Eclipse), the holder of A♠ is the leader.
- The leader picks an objective first and leads the first trick.

### Objectives
- Objective cards are flipped from a second, separately shuffled deck of the same
  card identities as the play deck, minus removed cards and minus the Sun and Moon.
- Starting with the leader and going clockwise, players take one face-up objective at
  a time until all are taken.
- The base objective: win the trick that contains that card.
- Other objective kinds (§5.2) add ordering and trick-count conditions.

### The Whisper
- Free for everyone, once per camp.
- Only after objectives are picked, and only between tricks (§4.4).
- You choose one teammate and one card in your hand. Only that teammate sees the card.
  Everyone sees that you whispered to that teammate.

### Success and failure
- The camp succeeds when every objective is done.
- The camp fails the moment any objective becomes impossible (its card won by the
  wrong player, an order broken, a trick-count condition breached) or any active
  failure check fires (e.g. Camouflage). Play stops at that moment.

---

## 4. The run

### 4.1 Shape
- 6 camps. Camp 3 is a boss camp; camp 6 is the final boss camp at the temple.
- The crew starts with **3 supplies**.
- A failed camp costs 1 supply (plus any Energy Tonic penalty, §5.1) and the camp is
  **replayed** with a fresh deal and fresh objectives. The only way forward is to
  clear it.
- 0 supplies ends the run. Clearing camp 6 wins it.
- The room keeps a best-run record: furthest camp reached, supplies left.

### 4.2 Gear: capacity, draft, loadout
- **Capacity** equals the camp number: 1 bar at camp 1, 6 bars at camp 6. It is tied
  to the camp, not to attempts, so failing never makes anyone stronger.
- **Draft:** at the start of the run, each player picks 1 gear from 3 offered. After
  each cleared camp, each player picks 1 more from 3. A player is never offered gear
  they already own. Offers are private to the player.
- **Loadout:** between camps, each player equips any gear they own whose sizes sum to
  at most their capacity. Loadouts are public.
- Each equipped piece of gear can be used **once per camp**, in its timing window,
  unless its own text says otherwise. Passive gear has no activation.

### 4.3 Camp ramp

All numbers live in one balance table in code and are expected to be tuned.

| Camp | Objectives | Extra |
|---|---|---|
| 1 | 2 | — |
| 2 | 3 | — |
| 3 | 3 | Boss twist (random from the boss pool) |
| 4 | 4 | One ordered pair (① before ②) |
| 5 | 4 | One trick-count objective (no tricks, or exactly N) |
| 6 | 5 | Final boss: one random boss twist, plus one ordered pair |

### 4.4 Timing windows
Every action outside playing a card happens in a named window. Windows are part of the
engine's vocabulary, so gear declares which one it uses.

| Window | When | Who may act |
|---|---|---|
| `pre-deal` | Start of a camp, before the deal | Players with pre-deal gear equipped; each confirms or skips |
| `objective-pick` | While objectives are being taken | Players with objective-pick gear; plus the picking player |
| `between-tricks` | After objectives are picked and before the first card of each trick | Anyone: Whisper and between-tricks gear |
| `passive` | Always | Nobody — passive gear only modifies rules |

The `between-tricks` window closes when the trick's leader plays a card. The server
serialises actions in arrival order.

---

## 5. Content catalogues (v1)

Content is data plus small pure functions, registered by stable id. Mechanic ids are
generic; display names carry the theme, so a re-theme never touches rules code.

### 5.1 Gear

✦ marks gear with a built-in downside.

| Gear (display) | id | Size | Window | Effect |
|---|---|---|---|---|
| Signal Whistle | `chatter` | 1 | between-tricks | Whisper a second time this camp |
| Spyglass | `peek` | 1 | between-tricks | See one random card from a chosen teammate's hand |
| Signal Flare | `broadcast` | 1 | between-tricks | Your Whisper this camp is shown to everyone |
| Camouflage ✦ | `ghost` | 1 | between-tricks | Drop one of your unresolved objectives. From then on, if you win any trick this camp, the camp fails. Unusable if you have already won a trick this camp |
| Compass | `reroll` | 2 | objective-pick | Replace one face-up, not-yet-taken objective with a new valid one from the objective deck |
| Trained Monkey ✦ | `pickpocket` | 2 | between-tricks | Swap a card of your choice for a random card from a chosen teammate's hand. You might get something worse |
| Machete | `commandeer` | 2 | between-tricks | You lead the next trick instead of the last trick's winner |
| Rain Poncho ✦ | `jam` | 2 | pre-deal | Cancel this camp's boss twist. Nobody may Whisper this camp (gear that whispers is blocked too) |
| Trail Map | `reassign` | 3 | between-tricks | Swap all unresolved objectives between two players. Completed objectives stay |
| Energy Tonic ✦ | `overclock` | 0 | passive | While equipped: +2 capacity. If this camp fails, it costs 1 extra supply (each equipped Tonic adds 1) |

### 5.2 Objective kinds

| id | Meaning | Fails when |
|---|---|---|
| `win-card` | Win the trick containing card X | Another player wins that trick |
| `ordered` | A `win-card` objective with an order marker (①, ②…, or "last") | Its card is won out of order relative to other ordered objectives, or not in the last trick |
| `no-tricks` | Win no tricks this camp | The holder wins any trick |
| `exactly-n` | Win exactly N tricks this camp | The holder exceeds N, or can no longer reach N with the tricks left |

### 5.3 Boss twists

**Provisional.** Owner review, 2026-09-22: "you're still very tied to the crew bosses
- but they'll do for now." These four ship as placeholders to get the boss system
working. More original, jungle-native twists are expected to replace them. Each is one
catalogue entry (§6.1), so replacing them touches no core code.

| Twist (display) | id | Effect |
|---|---|---|
| Monsoon | `radio-silence` | No Whispers this camp |
| Eclipse | `eclipse` | The Sun and Moon are removed; there are no trumps. Deck: 3p removes 2♣ (51, 17 each); 4p removes nothing (52, 13 each); 5p removes 2♣ 2♦ (50, 10 each). A♠'s holder leads |
| Thick Fog | `blind-orders` | Objectives are dealt face-down at random instead of picked; each player sees only their own |
| Mutiny | `mutiny` | The leader must not win the first trick, or the camp fails |

### 5.4 Interactables (v1)
Clickable world objects, for fun only. They never change game state and never reach
the server. Each is a registry entry like the rest.
- Campfire: click for a burst of sparks.
- Fireflies: click to scatter them.
- Hanging lantern: swings when clicked.
- Camp mascot: a red panda (the owner's PixelLab sprite) that cheers a completed
  objective, flops on a failed camp, and shows a tip or joke bubble when clicked.

---

## 6. Engine architecture

All game logic lives in `packages/rules/src/expedition/`, beside `hanabi/`, with zero
runtime dependencies.

### 6.1 Layers
1. **Core.** Deck for a player count, legal plays, trick winner, the camp state
   machine, the run state machine. Pure functions.
2. **Rule hooks.** The core asks a rule set for anything a boss or gear might bend. The
   rule set is composed fresh for each camp from three layers: base rules, then the
   boss twist, then equipped gear (including modifiers added mid-camp by activated
   gear, e.g. Camouflage's failure check). Each hook receives the previous layer's
   answer and returns its own:

   | Hook | Used for |
   |---|---|
   | `deckFor(playerCount)` | Eclipse |
   | `leaderFor(hands)` | Eclipse's A♠ fallback |
   | `isTrump(card)` / `trickWinner(trick)` | Sun and Moon; future trump twists |
   | `legalPlays(state, seat)` | Follow-suit rules and future restrictions |
   | `nextLeader(state, trick)` | Machete |
   | `whisperAllowed(state, seat)` / `whisperAudience(state, seat)` | Monsoon, Rain Poncho, Signal Flare |
   | `whispersPerCamp(state, seat)` | Signal Whistle |
   | `objectiveAssignment(state)` | Thick Fog's face-down dealing |
   | `failureChecks(state)` | Mutiny, Camouflage |
   | `capacity(state, seat)` / `failureCost(state)` | Energy Tonic |

   Adding a new mechanic means adding a hook here and calling it from the core.
3. **Content catalogues.** One file per gear, objective kind, boss twist and
   interactable, registered by id.

### 6.2 Gear definitions
```ts
export const pickpocket: GearDef = {
  id: "pickpocket",
  name: "Trained Monkey",
  size: 2,
  text: "Swap a card of your choice for a random card from a teammate.",
  downside: "The card you get may be worse.",
  window: "between-tricks",
  targets: [{ kind: "teammate" }, { kind: "own-card" }],
  canUse: (ctx) => ctx.handSize(ctx.target(0)) > 0 || "They have no cards",
  apply: (ctx) =>
    ctx.swapCards(ctx.self, ctx.chosenCard(1), ctx.target(0), ctx.rng.pickFromHand(ctx.target(0))),
  art: undefined, // optional custom illustration; text card when absent
};
```
- **Targets are declarative.** Kinds: `teammate`, `own-card`, `face-up-objective`,
  `player-pair`, `own-objective`. The UI builds targeting from them; gear using
  existing kinds needs no UI code.
- **`canUse` returns true or a reason string**, shown to the player when the gear is
  unavailable.
- **`apply` only changes state through the toolkit** (§6.3), never directly.
- Passive gear has `window: "passive"` and a `modifiers` object of hooks instead of
  `apply`.

Objective kinds are `ObjectiveKindDef { id, describe, evaluate(camp, objective) →
"pending" | "done" | "failed" }`, evaluated by the core after every trick. Boss
twists are `BossDef { id, name, text, modifiers }`: hooks only.

### 6.3 The toolkit
The only way content changes state. Each operation keeps invariants by construction:
- `moveCard` / `swapCards` — card conservation holds.
- `replaceObjective` — draws a valid replacement from the objective deck.
- `swapObjectives` — moves unresolved objectives only.
- `reveal(card, audience)` — the one channel for private information (§6.4).
- `addModifier(hooks)` — attaches a rule modifier for the rest of the camp.
- `setNextLeader(seat)`.
- `log(event, audience)` — log entries carry an audience like reveals.
- `rng` — the seeded generator (§6.5).

### 6.4 Hidden information
- A **reveal** is a card plus the list of seats allowed to see it. The Whisper,
  Spyglass and Signal Flare are reveals with different audiences; future information
  gear uses the same mechanism.
- A seat's view contains: its own hand; every other hand's size; objectives (all
  face-up ones, or only its own under Thick Fog); reveals addressed to it; public
  loadouts; its own draft offers; removed cards; supplies, camp and phase; the log
  entries addressed to it.
- A view never contains: another seat's cards except through a reveal addressed to
  the viewer, the play deck or objective deck order, other players' draft offers, or
  the RNG state.

### 6.5 Randomness
A seeded PRNG (the existing `sfc32`/`cyrb128` pair from `packages/rules/src/shuffle.ts`)
is carried in state. Deals, the objective deck, draft offers, boss selection and
Trained Monkey all draw from it, so every run replays deterministically from its seed
and action log.

### 6.6 Adapter
Expedition implements `GameAdapter<ExpeditionState, ExpeditionAction>`:
- `createInitialState` sets up a run at the draft phase.
- `applyAction` accepts: `pick-draft`, `set-loadout`, `ready`, `use-gear` (pre-deal,
  objective-pick, between-tricks), `skip-window`, `pick-objective`, `whisper`,
  `play-card`. Each is validated against the phase, the seat and the rule set;
  illegal requests return an error and change nothing.
- `toPlayerView` builds the per-seat view of §6.4 from an explicit field list, never
  by copying state.
- `checkGameEnd` returns the run result: outcome (won/lost), camp reached, supplies
  left. Its shape is Expedition's own, per sub-project 1.

### 6.7 Documentation
`packages/rules/src/expedition/README.md` gives the recipes: add gear, add an objective
kind, add a boss twist, add an interactable, add a card pack, add a hook.

---

## 7. Rendering

### 7.1 Architecture
- Next.js keeps the room shell: landing page, lobby, join, reconnect banner.
- When an Expedition game starts, a React component mounts a Phaser canvas, loaded with
  a dynamic import so Phaser never ships on the landing page or with Hanabi.
- **Phaser only renders.** A pure `buildSceneModel(serverView, localUi)` produces what
  should be on screen. Scenes draw the model and animate differences between models.
- **Input becomes requests.** Clicks produce requests to the store, which sends them
  to the server. Phaser never decides an outcome.
- Gear targeting is a generic scene mode driven by the gear's declarative `targets`.

### 7.2 Scenes
- **Camp scene (the table).** Layout B: players seated around an oval tree-stump table
  in turn order, with your hand fanned at the bottom and the trick in the middle.
  Night-time jungle with parallax layers, the campfire, fireflies and the mascot.
  Objectives sit in front of each seat with order badges; loadouts appear as gear
  items at each seat; a used item dims. Supplies are crates, camp number and boss
  twist are shown in the scene itself (e.g. rain for Monsoon, a dark sky for Eclipse).
- **Fireside scene (between camps).** Minimal text, maximum visuals. The trail map
  shows the six camps and where the crew stands. The draft is three gear items laid
  out by the fire; the loadout is packing a backpack whose slots equal capacity. Text
  appears only on hover or long-press (the gear's rules text), never as panels.
- **Run end scene.** The temple reached or the expedition turned back, with camp and
  supplies.

### 7.3 Card packs
- `CardPackDef { id, name, face(card), back() }`, drawing to Phaser textures,
  registered in `apps/web`. The player's choice is stored per browser, like Hanabi's
  tile colour.
- v1 ships two packs so switching is proven: **Big Index** (default: big corner ranks,
  four-colour suits, Sun and Moon) and **Classic** (traditional two-colour).

### 7.4 Art pipeline
- Sources: PixelLab generations (characters, gear items, boss scenery) and CC0 or
  permissively licensed pixel packs.
- Every asset is listed in `apps/web/public/expedition/CREDITS.md` with its source and
  licence, verified before use, as with the existing background photos. Assets with
  people, watermarks or unverified licences are not used.
- PixelLab prompt specs are kept in the repo (`apps/web/art/expedition/prompts/`) so
  assets can be regenerated in a consistent style.

### 7.5 Test bridge
In test builds only (compiled out of production), `window.__expeditionTest` lists every
interactive object with a stable id (`hand:Q♥`, `gear:pickpocket`, `seat:<seatId>`,
`objective:K♦`) and its screen position, plus the current scene model. Playwright
clicks through it.

---

## 8. Testing

- **Rules unit tests:** deck per player count and per Eclipse, legal plays, trick
  winner, each objective kind's evaluation, each gear's behaviour, each boss twist.
- **Catalogue contract tests,** run automatically for every registered entry: unique
  id, valid size and window, deterministic `apply`, card conservation after `apply`,
  and no view leak after `apply`.
- **Property-based simulated runs** (fast-check): random bots play full runs across 3,
  4 and 5 players, every boss twist and random loadouts. Every run must end, never
  throw, conserve cards and pass the leak checker at every step.
- **Leak checker:** extends the existing Hanabi leak-check pattern; a seat's view may
  contain another seat's card only through a reveal addressed to that seat.
- **Scene model unit tests:** `buildSceneModel` for each phase, including targeting
  mode and boss visuals.
- **E2E (Playwright through the test bridge):** create a room, 3 players, draft,
  loadout, play a camp to completion, use a piece of gear, Whisper, refresh mid-camp
  and resume.
- **Sub-project 1:** the full existing Hanabi unit and e2e suites pass unchanged.

---

## 9. Build order

1. Sub-project 1: multi-game rooms.
2. Rules core: deck, tricks, camp state machine, objective kinds. Simulation tests.
3. Run layer: camps, supplies, replay, capacity, draft, loadout, bosses; hooks,
   toolkit, reveals; the v1 gear catalogue.
4. Adapter, schemas and worker wiring; per-seat views; leak checks.
5. Phaser shell: camp scene with placeholder art, card packs, test bridge, e2e.
6. Fireside and run end scenes.
7. Art pass: PixelLab and CC0 assets, interactables, animations, with owner visual
   review.
8. Balance pass: play-tests, tuning the balance table.

---

## 10. Decisions log (owner, 2026-09-22)

| Decision | Choice |
|---|---|
| Game | Crew-like co-op trick-taking, not Innovation |
| Deck | Standard deck rules, playable with a real deck |
| Trumps | The two Jokers only (Sun > Moon) |
| Card art | Big Index as the default, with swappable per-player card packs |
| Structure | Roguelite, one-sitting runs |
| Communication | The Whisper: show one card to one teammate, once per camp |
| Powers | Special abilities with identity; some with downsides |
| Acquisition | Draft 1 at the start and 1 after each cleared camp |
| Economy | Bars are capacity (equipment slots), +1 per camp; equip freely between camps |
| Kit | Gear sizes in bars; once per camp each |
| Ramp | Ramp plus boss camps |
| Boss twists | The four v1 twists are provisional placeholders, too close to The Crew; to be replaced with original ones later |
| Players | 3–5, removing 2s to even hands |
| Round rules | Whisper between tricks only; objectives picked before whispering; a led Joker forces the other |
| Run | Failed camp is replayed; capacity = camp number; loadouts public |
| Engine | One adapter owns the run; content catalogues; toolkit-only state changes; declarative targets; reveals with audiences |
| Gear art | Optional custom art per gear; text cards in v1 |
| Table | Layout B, seats around an oval |
| Look | Pixel art in Phaser, styled after rogerflores.dev; world-as-interface; clickable interactables; between-camps minimal text |
| Setting | Jungle expedition camp; supplies instead of hull; expedition leader instead of captain |
| Art sources | PixelLab generation and verified CC0/free packs |
| Rendering | Phaser renders the whole game from a pure scene model; test bridge for e2e |
