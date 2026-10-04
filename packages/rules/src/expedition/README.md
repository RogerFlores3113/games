# Expedition rules engine

This package (`packages/rules/src/expedition/`) is the whole Expedition rules
engine: framework-free TypeScript, zero Node/Worker/browser APIs, imported by
both the Cloudflare Worker (source of truth) and the Next.js client (display
only; the client never decides legality). See `purity.test.ts` for the
enforced import and API restrictions.

ENG-01's promise: adding an item, a character, a camp modifier, an
objective kind, a hook or a toolkit op is **one new file plus one
registry (or union or list) line**, and the catalogue contract tests
(`content/sources.contract.test.ts`, `content/mods/mods.contract.test.ts`,
`run/targets.contract.test.ts`, `objective-kinds.contract.test.ts`) cover
the new entry with no test edits (ENG-02). The one exception is the source
count in `sources.contract.test.ts` (see "Add an item"). Every recipe below
names the exact files and identifiers involved.

## Layout

- **Core** (this directory's top level): `state.ts` (the type vocabulary:
  `CampState` with its `discards`, `ResolvedPlay`, the `Objective`/
  `ObjectiveSlot` unions, `Goal`, `CampEvent`, `CampAction`/`CampError`),
  `camp.ts` (`createCamp`, `checkCampOutcome`, `campPhase`,
  `currentActorSeatId`, `guard`), `actions.ts` (`applyCampAction`, which
  also reports the action's `CampEvent`s), `objectives.ts`
  (`OBJECTIVE_KINDS`, `evaluateObjective`), `rules.ts` (`CoreRules`,
  `baseRules`), `deck.ts`, `trick.ts` (`legalPlaysFor`, `trickWinner`,
  `resolveTrick`), `leader.ts`, `legality.ts`. The Core never imports a
  source id; it only calls through a `CoreRules` value.

**Core hooks** (`rules.ts`'s `CoreRules`): `deckFor`, `objectiveDeckFor`
(base: standard cards ranked above the deck's lowest rank), `leaderFor`, the
card reading `identityOf`, `isTrump` and `rankOf`, `trickWinner(plays,
led)`, `legalPlays`, `burns(plays, led, winnerOf)`, `nextLeader`,
`objectiveStatus` (base: `evaluateObjective`), `goals` (camp-wide
conditions, given every objective's composed status; every one must be
done), `voidsTrick` (base: false; a voided trick is a hallucination: every
card goes back to the hand that played it, it is kept in
`CampState.voidedTricks`, and the same leader leads the next trick, whose
index still moves on) and `objectivePicker(state, picked)` (base: the
rotation from the expedition leader). A full trick resolves once, in
`resolveTrick`: the led identity is what the lead counts as, burned plays
leave the trick (and never count for an objective), and the winner is the
highest trump kept, else the highest kept card following the led identity,
else the highest kept card; equal strength goes to the earliest play. A card
objective fails at once when its printed card burned, counted as another
card or was discarded, and fails if never played by the final trick.
- **`content/`**: the catalogue. `content/source-def.ts` holds the def types
  (`CharacterDef`, `UpgradeDef`, `ItemDef`, `ActiveAbility`,
  `PassiveAbility`, `UsageLimit`, `PoolDef`, `AbilityContext`) and the
  `defineCharacter`/`defineUpgrade`/`defineItem`/`ability` helpers.
  `content/characters/<id>.ts` is one character with its base power and its
  two upgrades; `content/items/<id>.ts` is one item. Each folder has a
  `registry.ts` (`CHARACTERS`, `ITEMS`). `content/helpers.ts` holds shared
  effect helpers (`winnerExcluding`, `freshObjectiveAvailable`).
  `content/mods/` holds the camp modifiers: `mod-def.ts` (`ModDef`,
  `ModBody`, `ModCtx`, `ReactionCtx`, `StatusPart`, `defineMod`,
  `defineBoss`), one file per location, weather, pairing or boss, its
  `registry.ts` (`MODS`), `pairings.ts` (`PAIRINGS`) and
  `mods.contract.test.ts`.
- **`run/`**: the staged run on top of Core. `run/types.ts` (`RunState`,
  its `Stage` union and `RunAt<T>`, `SeatRun` with its `ledger`,
  `RunAction`, `Catalog`), `run/stages/` (`registry.ts`'s `STAGES` and
  `applyRunAction`, the single run-level transition, plus one file per
  stage: muster, loadout, camp, draft, route, event), `run/lifecycle.ts`
  (`createRun`, `runStatus`, `dealCamp`, `settleCamp`), `run/plan.ts`
  (`RunPlan`, `campIndex`, `drawPlan`, `helpersFor`, `horizon`),
  `run/route.ts` (`CampSpec`, `firstCampSpec`, `routeOptions`,
  `slotKindsFor`), `run/vote.ts` (`tally`),
  `run/stack.ts` (`campStack`, the one list of a camp's modifiers, and
  `modCtx`), `run/react.ts` (`react`, the camp modifiers' one pass over the
  engine's events),
  `run/attempt.ts` (`attemptOf`, `withAttempt`), `run/abilities.ts`
  (`abilityStatus`, `useAbility`, `passWindow`), `run/targets.ts`
  (`TARGET_KINDS`, `resolveTargets`, `stepsFor`), `run/windows.ts`
  (`WINDOWS`, `currentWindow`, `gatedPendingSeatIds`), `run/usage.ts`
  (`remaining`, `poolBalance`, `liveSourceKeys`, `abilityKeys`,
  `backpackOf`, `defIdOf`), `run/items.ts` (`mintItems`, `equipError`),
  `run/compose.ts` (`rulesFor`, the rule layers), `run/run-rules.ts` (`RunHooks`,
  `HOOK_NAMES`), `run/toolkit.ts` (`ToolkitOp`, `applyToolkitOps`, the only
  mutation surface for abilities), `run/draft.ts` (`draftOfferFor`,
  `drawOffer`, `DraftShape`), `run/shop.ts` (`stockFor`, `buy`, `priceFor`),
  `run/survey.ts` (`surveyedCamps`, `surveyObjectives`), `run/whisper.ts`,
  `run/balance.ts` (the run's tunable numbers; a number only one def
  reads, such as an item's price or a boss's half-strength parameter,
  lives in that def), `run/rng.ts` (`STREAMS`,
  `seededIndex`) and `run/catalog.ts`'s `CATALOG` (`{ characters, items,
  mods, pairings }` plus the flattened `sources` index). `content/events/`
  holds the route events: `event-def.ts` (`EventDef`, `defineEvent`), one
  file per event and its `registry.ts` (`EVENTS`).

**The run loop.** A run is a stored stage, and `applyRunAction` is the one
transition: it refuses an action type the stage does not accept
(`wrong_stage`), runs the stage's handler, then advances stage by stage
until the tag stops changing.

1. **Muster.** Each seat sends `pick-character` and `vote { choice }`
   ("short", "standard", "long", or null to abstain). A ballot may change
   until the vote resolves. The last missing input resolves it (majority,
   else a seeded coin flip recorded in `lastVote`), draws the plan (each
   boss camp's boss from its tier's pool, ids sorted, one seeded index) and
   opens the loadout for camp 1 (the Jungle, fair weather). A planned boss
   stays out of every view until a route preview leads to its camp
   (`run/plan.ts`'s `horizon`); the leak check flags it before then.
2. **Loadout.** Each seat sends `equip { itemUids }` (replaces its equipped
   set, within `rules.itemSlots`), before a boss camp `buy { stockId }` at
   the shop (supplies, three single items, and the seat's own character's
   upgrades while it has none), then `ready`, which re-checks the slots.
   A loadout opens with each equipped set cut to the camp's slots (Rats
   take one), the last items going back to the backpack.
   After its `ready` a seat can change nothing. The last `ready` deals the
   camp.
3. **Camp.** Play as before. The camp's modifiers react to the engine's
   events (the deal, picks, plays, completed and started tricks, whispers)
   with toolkit ops; a decided camp settles unless a rescue is pending.
4. **Settle.** A failure costs supplies and reopens the loadout for the same
   camp spec with a fresh deal; 0 supplies ends the run. A clear pays
   `5 + min(3, unplayed tricks)` into the shared purse and deals every seat
   a private draft offer, or wins the run at the final camp.
5. **Draft.** Each seat with an offer sends `pick-bundle { bundle }`: one
   instance per item of that bundle of its head offer, equipped while a slot
   is free, else into the backpack.
6. **Route.** Each seat votes over 2 or 3 options to the next camp.
7. **Event.** A stub with no effect yet. Each seat sends `ready`, then the
   next camp's loadout opens.

A disconnected seat's ballot is cast as an abstention by the worker's
auto-pass after the existing grace.

**Layering order** (`run/compose.ts`): **base, then each camp-stack
layer's `rules` (location, weather, pairing, the boss or the temple, then
the temple's helpers at half strength), then per seat (seat
order) each live source's passive in `[character, upgrade, ...equipped]`
order, then each live effect's layer in `attempt.effects` order, then the
passives marked `foldsLast`.** A boss
folds after the weather so it can refine it; passives fold after both, so an
item can lift a camp rule for its owner (Mosquito Net under Rain). A
`foldsLast` passive has the last word over items and effects (Momentum's
whisper count). A backpack item is not live: no passive, no ability.

**Camp modifiers.** A camp's location, weather, pairing and boss are
`ModDef`s, stacked by `run/stack.ts`'s `campStack`. A body's
`rules(ctx)` answers the engine's questions, `on` reacts to an event with
toolkit ops (under the origin `{ kind: "mod" }`), `effect` is the layer an
`add-modifier` from `on` switches on, `slots` reshapes the camp's
objective slots, `status` is public table state the view projects, and
`grants` is an ability every seat may use while the def is in play, keyed
by the def's id (the temple's skip, a crew token: one use for the whole
crew, earned by winning the Sun). At the temple the stack also carries every
earlier planned boss at half strength (its `half` body), in the order faced.
The run hook `hides(run, viewer, subject)` keeps a current-trick play, an
objective's kind and target, or a seat's unused items from a viewer (Cave,
Night, Desert, Heavy fog); the view and the leak check both read it, so a
new concealment needs no change to either. A boss uses whichever channel
its mechanic is: a question is a rule (Crocodile's guard, Wildfire's and
Meteor's `burns`, Blood Moon's `identityOf`, Monsoon's river guard), a
moment is a reaction (Snake's bite on `whisper-sent`; Tornado, Earthquake
and Locusts on `trick-completed`, moving cards with `move-card` and
`reveal`, owners with `reassign-objective`, items with `break-item` and
cards with `discard-round`, each with a public `log` entry the table can
animate).
`ctx.roll(label, n)` and a reaction's `ctx.draw(n)` are seeded. A trick
effect added with `deferIfFatal` (a Thunderstorm strike) waits one trick
when, under the fully composed rules, it is what lost the camp
(`run/stages/camp.ts`).

**Source keys.** A seat acts through a key: its character id, its upgrade
id, an item instance's uid (`it7`, minted from `RunState.itemSerial`), or
the id of a camp modifier that grants an ability (`abilityKeys`).
The ledger, `use-ability`, `abilityStatus`, `remaining` and the view's
`yourAbilities` and `usage` are keyed by it, so two copies of one item keep
separate uses. An effect's `origin` carries the seat, the key and the def
id (the item's id), and log entries and reveals carry the def id, since a
spent instance is gone by the time they are read.
Each layer's `RuleModifier` maps the previous layer's answer to its own, hook
by hook. The card-reading hooks `identityOf`, `isTrump` and `rankOf` fold
first, in that order (WR-03); every other hook folds over the base built
from them. A trick-scoped effect
(`lasts: "trick"`) is live only while `currentTrick.index === atTrick`.

**The toolkit is the only mutation surface** (`run/toolkit.ts`'s
`applyToolkitOps`): an ability's `apply` returns `ToolkitOp` data and never
touches `RunState` or `CampState` itself. Supplies, coins, items, offers
and routes are run-level ops and work in any stage; every other op needs a
dealt camp and throws outside one. In a camp `applyToolkitOps` asserts card
conservation after the ops; a broken op throws (a content-author defect,
POLICY A3).

**Spending is the engine's job.** `useAbility` appends a `used` ledger entry
(with its pool cost), takes the supplies of a supplies limit and the coins
of a coins limit, and removes an item instance on the use that spends its
last charge. A use the composed `freeUse` names is stamped `free`: it
spends nothing and counts against no limit. Authors never count uses.

**The RNG stream rule (A1):** `RunState` carries only a `seed` string. Every
draw derives a fresh, uniquely named stream via `run/rng.ts`'s `STREAMS`:

| Draw | Stream name |
|---|---|
| Length vote tie | `expedition-vote:length` |
| Planned boss | `expedition-plan:{animal\|disaster}` |
| Route vote tie | `expedition-vote:route:camp{k}` (k = the next camp) |
| Route option count | `expedition-route:camp{k}:count` |
| Route option field | `expedition-route:camp{k}:reroll{r}:option{i}:{location\|fair\|weather\|event\|mix}` |
| Draft item | `expedition-draft:camp{k}:seat{id}:offer{o}:bundle{b}:item{j}:{rarity\|pick}` (k = the cleared camp) |
| Shop item | `expedition-shop:camp{k}:item{i}:{rarity\|pick}` (a replay of the boss camp draws the same stock) |
| Attempt deal seed | `{seed}:camp{k}:attempt{A}` |
| Trick-count kind and N | `expedition-trickcount-{kind\|n}:camp{k}:attempt{A}` |
| Ability draws (`ctx.randomCards`, `ctx.randomIndex`) | `expedition-ability:camp{k}:attempt{A}:seat{id}:use{u}:draw{j}` |
| An offer an ability draws (`ctx.drawOffer`) | `expedition-ability:camp{k}:attempt{A}:seat{id}:use{u}:draw{j}:bundle{b}:item{i}:{rarity\|pick}` |
| A fanned hand's order | `expedition-fan:camp{k}:attempt{A}:seat{id}:of{id}:use{u}` |
| An option target's `scope.roll` | `expedition-option:camp{k}:attempt{A}:seat{id}:{label}` |
| An objective an ability adds | `expedition-objective-added:camp{k}:attempt{A}:n{n}` (n = the camp's objective count) |
| A source reaction's draws (`ctx.draw`, `ctx.drawOffer`) | `expedition-source:{key}:seat{id}:{place}:on:{eventKey}:draw{j}` (place `camp{k}:attempt{A}`, or `run` before a stamp exists), plus `:bundle{b}:item{i}:{part}` for an offer |
| Mod rule roll (`ctx.roll`) | `expedition-mod:{id}:{strength}:camp{k}:attempt{A}:rule:{label}` |
| Mod reaction draw (`ctx.draw`, `ctx.randomCards`) | `expedition-mod:{id}:{strength}:camp{k}:attempt{A}:on:{eventKey}:draw{j}` |

`u` is the seat's ledger length before the use and `j` counts draws inside
one `apply`; the context builds both, so an ability never names a stream.
A camp modifier never names one either: `ctx.roll` gives the same value for
the same label within an attempt, and `eventKey` is `dealt`, `pick{n}`,
`t{i}-start`, `t{i}-p{position}`, `t{i}-done`, `t{i}-void`,
`whisper{ordinal}`, `settled` or (sources only) `started`. A stage window
(loadout, draft, route) stamps trick 0 of the camp it belongs to, so `k`
and `A` there are that camp's.

## Add an item

1. Create `content/items/<id>.ts` exporting `defineItem({ id, name, rarity,
   price, text, ... })`. `rarity` is `"common"` or `"rare"`. The draft and
   the shop roll the rarity first, rare at `DRAFT.rareChance` percent
   (`run/balance.ts`), then pick an item of it. `price` is its cost in coins
   at the shop. The optional `exclusiveTo` names the one character it is
   drafted for, and the shop never stocks such an item. `text` is one short
   sentence about the effect; the window and uses render as badges from the
   def, so the text never repeats them.
2. An active item gives `uses` and `active: itemAbility({ window, targets,
   apply })`; a passive item gives `passive: { modifier(owner) }` and
   neither of the others (the type allows only these two shapes).
   - `uses`: `{ kind: "single-use" }`, `{ kind: "per-camp" }` (once per
     attempt, never runs out) or `{ kind: "charges", n }`. The uses are the
     limit, so an item ability has no `limit`; the engine counts them per
     instance and removes a spent instance from its owner.
   - `window`: one of `run/windows.ts`'s `ActiveWindow`s, or a list of
     them when the ability may fire in several (see "Add a window").
   - `targets`: a list of `TargetSpec`s, one picker step each (see "Add a
     target kind"). `ctx.targets` arrives resolved and typed per kind; you
     never parse an id or check a choice.
   - `canUse?(ctx)`: target-free availability, `true` or a player-facing
     reason. `canTarget?(ctx)`: rules across targets, `true` or a reason.
   - `apply(ctx)`: returns `ToolkitOp` data. If it emits `add-modifier`,
     also give `effect(e, run)`, the `RuleModifier` that op switches on.
3. Add one line to `content/items/registry.ts`'s `ITEMS`.
4. `content/sources.contract.test.ts` covers it: shape, one sentence of
   text, a rarity and a price, `effect` iff `add-modifier`, determinism,
   conservation, a JSON round-trip, the per-seat leak check, the usage
   limits, and for an active item that its uses exhaust as declared, that a
   per-camp item resets on a replay, and that a spent instance leaves its
   owner. Its first test (`has 6 characters, 12 upgrades and 13 items with
   unique ids`) counts the catalogue, so raise the item count and the id
   total there.
5. Add its 16x16 icon as `apps/web/public/expedition/sprites/sources/<id>.png`
   and its id to `SOURCE_ICON_IDS` (`apps/web/components/expedition/phaser/
   art/art-registry.ts`); `source-icons.test.ts` fails until you do.

**Worked example (Bait, `content/items/bait.ts`):** common, price 2, uses
`single-use`, window `"in-trick"`, one `{ kind: "card", where: "board" }`
target. `apply` returns one trick-scoped `add-modifier` whose params name the card, and
`effect` overrides `trickWinner` with `winnerExcluding(prev, plays, led, ...)`, so
that card can't win this one trick.

## Add a character

1. Create `content/characters/<id>.ts` exporting `defineCharacter({ id,
   name, theme, power, text, pool?, active?, passive?, upgrades })`. `power`
   names the base power ("Spyglass"); `text` says what it does. A character
   or upgrade ability gives `ability({ window, limit, targets, apply })`
   with `limit` one of `{ kind: "per-camp", times }`, `{ kind: "per-run",
   times }`, `{ kind: "pool", cost }`, `{ kind: "supplies", cost }` or
   `{ kind: "coins", cost(ctx) }` (a price from the purse that may read the
   key's uses this camp and this run, and the picked targets). A
   character or upgrade may also react to engine events with `on` (see
   "The character seams").
2. `pool` (optional) is the character's resource: `{ name, start, max,
   regain }`. Abilities of this character and its upgrades may use
   `{ kind: "pool", cost }`; the engine regains it after each cleared camp.
3. `upgrades` is exactly two `defineUpgrade({...})` entries in the same
   file. `defineCharacter` stamps the character id onto both. A seat buys
   one of its own character's upgrades at the shop, and owning one also
   gives it one more whisper per camp. An upgrade that tunes the base power
   has no ability of its own: the base power reads `owner.hasUpgrade("<upgrade
   id>")` through a `Tuned<T>` value (see Pathfinder in `guide.ts`).
4. Add one line to `content/characters/registry.ts`'s `CHARACTERS`. The
   contract tests cover the character and both upgrades; raise the counts
   in `sources.contract.test.ts`'s first test. Add the 64x80 silhouette as
   `sprites/crew/<id>.png`, the icons for the power and both upgrades under
   `sprites/sources/`, and the ids to `CREW_IDS` and `SOURCE_ICON_IDS`.

## The character seams

The nine characters stand on these. With no source using one, each answers
as the engine did before them.

- **Stage windows.** `loadout` (until the seat is ready), `draft` (a seat
  with an offer) and `route`, beside the camp windows. Abilities there get
  `ctx.camp === null`; the loadout stamps the attempt it will deal, so a
  per-camp limit counts loadout uses with that camp's.
- **Run hooks** (`run/run-rules.ts`): `normalWeatherChance(run, chance)`
  shifts a route's fair-weather chance (never projected);
  `routeOptionCount(run, count)` (1 to 3); `swapsBoss(run, option)` gives
  that option a `swapBoss`, another boss of the next animal or disaster
  boss camp's tier, written into the plan when the route is chosen and
  hidden while beyond the horizon; `draftShape(run, seatId)` is a cleared
  camp's offer (`DraftShape`: options, bundle size, items exclusive to the
  character, rare chance); `shopPrice(run, seatId, price)`, which the shop
  view shows per viewer; `affectsSeat(run, seatId, origin)`, which the
  animal bosses ask through `ctx.affects` before singling a seat out (it
  folds the seat layers only); `freeUse(run, seatId, key)`; and
  `surveys(run, seatId)`, which puts the objectives a previewed camp will
  deal into that seat's `survey` (`run/survey.ts`).
- **Core hooks**: `voidsTrick` and `objectivePicker`, above.
- **Ops**: `grant-item`, `give-item` (the instance keeps its spent uses),
  `drop-item`, `swap-slots`, `drop-offer`, `add-offer`, `reroll-route` (the
  option's place and event again on reroll `r + 1`), `add-objective`,
  `retarget-objective` and `void-trick` (the last completed trick becomes a
  hallucination).
- **Target kinds**: `item` (your own, equipped, backpack or any),
  `route-option`, `fanned-card` (a teammate's hand as a seeded fan, plus the
  cards shown to you while that seat held them; one that has left the hand
  lands on the fan's first place, so the choice never says where it went),
  `objective-value` (a pending card objective's target one or two ranks
  along) and `option` (values the spec lists from its scope, with a seeded
  `scope.roll`).
- **Limits and context**: the `coins` limit; `ctx.catalog` and
  `ctx.drawOffer(seatId, shape)` (a special offer for `add-offer`).
- **Reactions**: a character or upgrade's `on` reacts like a camp
  modifier's, after the camp's modifiers, to the engine's events plus
  `run-started` (the length vote opening camp 1) and `camp-settled`
  (before a decided camp settles). Its ops run under the seat's origin; an
  `add-modifier` from it resolves its layer through the source's
  `active.effect`.
- **Passives**: `foldsLast` (above).

## The channel rule

A camp modifier's body has six channels. Pick each mechanic's channel by
what the mechanic is.

| The mechanic is | Channel | Example |
|---|---|---|
| A question the engine asks: who wins, what is legal, what is done, who sees what | `rules(ctx)`, a `RuleModifier` over `HOOK_NAMES` | Crocodile's `goals` guard (`content/mods/crocodile.ts`) asks whether the watched seat won a trick |
| A change to stored state at a moment: cards move, an item breaks | `on`, a reaction to an `EngineEvent` that returns toolkit ops | Tornado's `trick-completed` handler (`content/mods/tornado.ts`) returns `reveal` and `move-card` ops |
| A rule that starts at a moment | `on` returns `add-modifier`, and `effect(e, ctx)` is the layer it switches on | Snake's `whisper-sent` bite (`content/mods/snake.ts`), whose `effect` fails objectives through `objectiveStatus` |
| The shape of the deal or of the objective slots | a deal hook in `rules` (`deckFor`, `objectiveDeckFor`) or `slots(prev)` | Magma's `deckFor` (`content/mods/magma.ts`); Capybara's `slots` (`content/mods/capybara.ts`) |
| An action a player chooses | `grants`, an ability every seat may use while the def is in play | the temple's Skip (`content/mods/temple.ts`) |
| Public state the table draws | `status(ctx)`, a list of `StatusPart`s | Beaver's `dam` part (`content/mods/beaver.ts`) |

Prefer a rule to a reaction. A rule derives its answer from the camp, the
trick log and `ctx.roll`, so it stores nothing and a replay rebuilds it.
Crocodile asks who won the trick it watched, and Tiger asks what a
leader may lead, so both are rules even though they act every trick. Write
a reaction only when stored state must change: hands, items, owners or the
attempt's effects.
Reactions never trigger reactions, so a Tornado move does not wake the
Locusts. The same rule applies to sources. An item's `passive` is a rule;
its `active.apply` returns ops, and its `effect` is the rule an
`add-modifier` switches on.

## Add a camp modifier

Locations, weathers, pairings, bosses and the temple are all `ModDef`s
(`content/mods/mod-def.ts`). Read "The channel rule" first.

1. Create `content/mods/<id>.ts`. A location, weather, pairing or temple
   exports `defineMod({ id, kind, name, weight, text, full })`. An animal or
   disaster boss exports `defineBoss({ id, kind, name, weight, text, full,
   half })`.
   - `id` is also the web art id.
   - `text` is one sentence that ends with a period.
   - `weight` is the draw weight; 0 is never drawn. A location or a
     non-fair weather is drawn for a route by weight. A boss of weight
     above 0 joins its tier's pool, and `drawPlan` draws uniformly from the
     pool. Pairings, `fair` and the temple have weight 0.
   - A location may set `normalWeatherChance`, the percent chance of fair
     weather there (Clifftop: 50). Without it the route uses
     `NORMAL_WEATHER_CHANCE`.
2. Write the `full` body with the channels from "The channel rule".
   - In `rules` and `status`, `ctx.roll(label, n)` is seeded and gives the
     same value for the same label within an attempt. Put the trick in the
     label (`t${index}`) when the roll changes per trick.
   - In `on`, `ctx.draw(n)` and `ctx.randomCards(seatId, n)` are seeded and
     numbered per call. `ctx.rules` is the composed rules.
   - `ctx.camp` is null in the loadout, before the deal.
   - A `status` part carries no card and reads only the current trick. A
     new part kind goes in `StatusPart`, `adapter/view-types.ts`'s
     `ExpeditionStatusPartView` and `packages/schema/src/games/
     expedition.ts`'s `StatusPartViewSchema`.
3. A boss also writes a `half` body by hand. It plays when the boss returns
   as a temple helper. Write the body as a function of its parameter and
   call it twice, so full and half cannot drift apart.
4. Add one line to `content/mods/registry.ts`'s `MODS`.
5. A location that changes with a weather gets a row in
   `content/mods/pairings.ts`'s `PAIRINGS`. `"never"` keeps the pair off
   every route. `{ cancels, adds }` drops the named defs from the stack and
   adds a pairing def, registered like any other with weight 0.
6. Put each number in one place. A number only this def reads stays in the
   def. A number two defs share goes in `run/balance.ts` (`RIVER_SHARE`,
   read by Flooding and Monsoon).
7. `content/mods/mods.contract.test.ts` covers the def with no edits: its
   id, kind, name, one sentence and whole weight; a half body if and only
   if it is a boss; `rules` keys in `HOOK_NAMES`, `on` keys in
   `ENGINE_EVENT_TYPES`, and `effect` only beside `on`. It forces the def
   into camp 2's stack and plays the camp with random legal actions at 3, 4
   and 5 players, at full strength and, for a boss, as a half-strength
   temple helper. Every step must conserve cards, round-trip through JSON,
   replay the same, pass the leak check, and keep a status that a later
   trick's roll does not change. Add one behaviour test beside its kind's
   (`locations.test.ts`, `weather.test.ts`, `bosses.test.ts`,
   `disasters.test.ts`, `temple.test.ts`).
8. Art in `apps/web`. `modArtId` in `components/expedition/phaser/art/
   art-registry.ts` names a location's backdrop and a boss's sprite.
   - A location: a 640x360 backdrop at `public/expedition/sprites/
     locations/bg-<id>.png` and its `LOCATION_ART` entry.
   - A boss: a sprite at `public/expedition/sprites/bosses/<id>.png` and
     its size in `BOSS_SIZES`.
   - Then run `npm run art:files --workspace apps/web` to regenerate
     `art-files.generated.ts`. `mod-art.test.ts` fails until every location
     and boss has its file.
   - The modifier chip draws a 9x9 pixel icon from `ICONS` in
     `components/expedition/phaser/art/mod-icons.ts`; without one it
     falls back to its kind's `KIND_ICON`.
   - The rules modal's Locations, Weather and Bosses pages
     (`lib/expedition/rules-reference.ts`'s `buildModPages`) list every
     `MOD_DISPLAY` entry by kind with its art or icon, with no edits.
   - A boss's caption and one-line rule come from its entry in `READERS`
     (`lib/expedition/boss-model.ts`). A weather that changes the sky maps
     its id in `PRECIPITATION` or `HAZE` (`lib/expedition/weather-model.ts`).
   - A `grants` ability needs a 16x16 icon at `public/expedition/sprites/
     sources/<id>.png` and the id in `SOURCE_ICON_IDS`, since
     `SOURCE_DISPLAY` lists it as a source (`source-icons.test.ts`).

**Worked example, a boss with a half body (`content/mods/crocodile.ts`):**
`body(every)` returns a body with two channels. Its `rules` add a `goals`
guard that breaks once the seat it faces wins a trick. Its `status` names
that seat as a `facing` part. The facing seat starts at
`ctx.roll("start")` and shifts one seat per trick. `full: body(1)` faces
every trick; `half: body(2)` faces every other one.

**Worked example, slots and grants (`content/mods/temple.ts`):** `slots`
appends a win-card slot `fixed` on the Sun. `rules` adds the plates goal
over `platePath`, which rolls `floor(totalTricks / 2) - 1` suits with
`ctx.roll`, one label `plate{i}` per plate, and ends with the Sun.
`status` reports the `path` part. `grants` is the Skip: an ability with a `name` and `text`, usable
`between-tricks` or in `rescue`, whose `crew-tokens` limit earns one token
when the Sun objective is done. Its key is the def id `temple`, through
`run/usage.ts`'s `abilityKeys`.

## Add an event

An event waits on every route between two camps. Events have no effect
yet; the event stage (`run/stages/event.ts`) waits for every seat's
`ready`.

1. Create `content/events/<id>.ts` exporting `defineEvent({ id, name, text
   })` (`content/events/event-def.ts`). `text` is one sentence.
2. Add one line to `content/events/registry.ts`'s `EVENTS`.

Nothing else changes. `run/route.ts`'s `optionsAfter` draws each route's
event uniformly from `EVENTS`, ids sorted, on the route option's `event`
stream. Adding an event changes which event a seeded route shows; the other
route fields draw on their own streams and stay. `adapter/
catalog-display.ts`'s `EVENT_DISPLAY` projects the name and text, and the
web shows them on the route card and the event panel
(`apps/web/lib/expedition/trail-model.ts`). No contract test covers events
yet.

**Worked example (`content/events/event.ts`):** the one stub,
`defineEvent({ id: "event", name: "Event", text: "Nothing happens here
yet." })`, exported as `blankEvent` and registered as `event: blankEvent`.

## Add a target kind

1. Add the kind to `run/targets.ts`'s `TargetKind` union, its spec params to
   `SpecParams`, and what `apply` receives to `TargetOf`.
2. Add its entry to `TARGET_KINDS` (a mapped type, so a missing entry is a
   compile error): `describe(spec)` is the prompt line ("Pick a teammate's
   hand"), and `choices(scope, spec)` returns every legal `{ id, target }`
   pair the seat may see, in stable table order. The ids ship to the client,
   so they must name only things the seat can see; hidden things are
   targeted as wholes. Validation and resolution both come from `choices`.
3. `run/targets.contract.test.ts` checks every kind at 3, 4 and 5 players
   (stable choices, each resolves to itself, a foreign id is refused, the
   leak check passes).
4. In the web client, map the id prefix to a clickable thing:
   `apps/web/lib/expedition/local-ui.ts`'s `PickEntity` and
   `ENTITY_PREFIX`, then highlight it from `choiceFor` in
   `build-scene-model.ts`, or offer it in the pick tray (`buildTray`) when it
   has no single place on the table. `describeChoice` in `build-prompt.ts`
   names it on the confirm line.

## Add a window

1. Add the id to `run/windows.ts`'s `ActiveWindow` and its `WindowDef` to
   `WINDOWS`: `phrase` (the badge text), `gated` (whether the table waits
   for every eligible seat to use or pass), `isOpen(run, rules)` and
   `mayAct(run, rules, seatId)`. The `isOpen` predicates must stay mutually
   exclusive: `currentWindow` assumes at most one is open.
2. A gated window needs a hold in `run/stages/camp.ts`'s `settleIfDecided`
   (rescue holds the settle) and is passed with `skip-window`.
   `gatedPendingSeatIds` already counts any gated window.
3. The web client shows a gated window as the banner on the stump
   (`buildBanner` in `apps/web/lib/expedition/build-scene-model.ts`); an open
   window needs nothing more, since `yourAbilities` already says what is
   usable now.

## Add an objective kind

1. Add a member to `state.ts`'s `Objective` union (and, if it needs
   setup-time data, `ObjectiveSlot` too) — e.g. a new `{ id, kind: "<kind>",
   ...fields, ownerSeatId: string | null }` shape.
2. Add an `ObjectiveKindDef` in `objectives.ts` (`describe(objective)`, a
   human-readable string; `evaluate(state, objective)` returning
   `"pending" | "done" | "failed"`, recomputed fresh from `CampState` on
   every call — never cached, never reading a stored status field).
3. Add one line to `objectives.ts`'s `OBJECTIVE_KINDS` registry (keyed by
   `kind`). `OBJECTIVE_KINDS`'s type (`KindRegistry`, a mapped type over
   `ObjectiveKind`) makes a missing entry a **compile error** — the registry
   line isn't optional, the compiler enforces it.
4. `objective-kinds.contract.test.ts` iterates
   `Object.entries(OBJECTIVE_KINDS)` and checks every registered kind
   (`key === id`, a non-empty `describe()`, a deterministic `evaluate()` in
   `{pending, done, failed}`) — but it also keeps its own `FIXTURE_SLOT_FOR`
   map (the file's only per-kind data) with a guard test asserting its keys
   exactly match `OBJECTIVE_KINDS`'s keys. **Adding a kind means adding one
   line here too**, or the guard test fails loudly (by design — a silently
   un-fixtured kind would otherwise pass its contract vacuously).
5. Honestly: `camp.ts`'s `createCamp` builds each `Objective` from its
   `ObjectiveSlot` in a single `objectiveSlots.map(...)` with one branch per
   card-bearing vs. cardless kind (`slot.kind === "win-card"` /
   `"ordered"` both pull from `objectiveDeckRemaining`, unless a win-card
   slot names a `fixed` target; anything else is assumed cardless). A genuinely new *shape* of slot (neither
   card-bearing nor a bare cardless flag) may need one more branch there —
   the existing four kinds needed none beyond that split, but this is not
   a promise that every future kind is literally zero extra lines in
   `camp.ts`.

## Add a hook

1. Add the hook's signature to `run/run-rules.ts`'s `RunHooks` type (or, for
   a hook the *Core* itself calls rather than the run layer, to
   `rules.ts`'s `CoreRules`).
2. Give it a base implementation: `run/run-rules.ts`'s `baseRunHooks` (or
   `rules.ts`'s `baseRulesWith`/`baseRules` for a `CoreRules` hook).
3. List it in `run/run-rules.ts`'s `HOOK_NAMES` (built from a `Record<
   HookName, true>` object literal, `HOOK_NAME_SET`) — **omitting it here is
   a compile error**, by construction, the same exhaustiveness idiom
   `objectives.ts`'s `KindRegistry` uses for objective kinds. `HOOK_NAMES`
   is what `run/compose.ts`'s `composeRules` iterates to fold every layer's
   `RuleModifier`, so a hook missing from this list is never composed at
   all, silently.
4. Call it from the one Core or run-layer site that needs it — e.g. a new
   Core hook is called from `camp.ts`/`actions.ts`; a new run hook is called
   from wherever in `run/` needs its answer (`run/toolkit.ts`,
   `run/whisper.ts`, `run/lifecycle.ts`, etc., following the pattern of
   `whisperAllowed`/`failureCost`'s own single call sites).

## Add a toolkit op

1. Extend `run/toolkit.ts`'s `ToolkitOp` union with a new `{ readonly op:
   "<name>"; ...fields }` variant.
2. Implement it as a new `case "<name>":` branch in `run/toolkit.ts`'s
   `applyOp` — state its invariant in a comment (mirroring `move-card`'s
   card-conservation guard, `reveal`'s non-empty-audience/no-duplicates
   guard, `swap-objectives`'s pending-only guard D-10, or
   `set-next-leader`'s no-trick-in-progress guard) and enforce it by
   throwing (POLICY A3) rather than silently producing an invalid state.
   `applyToolkitOps`'s exhaustiveness check (`const exhaustive: never = op`)
   makes a missing `case` a compile error.

## Add an interactable

Interactables are clickable world objects, for fun only (spec §5.4): a
campfire's spark burst, scattering fireflies, a swinging lantern, the camp
mascot's click bubble. **They never change game state and never reach the
server** — the registry lives entirely in `apps/web`, not in this package:
`apps/web/components/expedition/phaser/interactables/registry.ts`'s
`INTERACTABLE_REGISTRY`, built in Phase 12. The fixed contract: an
`InteractableDef` is one new file under `interactables/<id>.ts` plus one
import and one object-literal line in that registry, purely client-side (a
Phaser scene reacting to a click), with no `RunAction`, no toolkit op, and no
server round-trip of any kind — enforced automatically for every registered
entry by `interactables.contract.test.ts`'s source scan. The mascot's
reactions to game events (hopping on a completed objective, flopping on a
failed camp) arrive with Phase 14's art pass; only its click bubble exists
today.

## Add a card pack

Card packs are the player's chosen card-face art (spec §7.3), stored per
browser like Hanabi's tile colour — not part of the rules engine's state or
legality at all. This registry also lives in `apps/web`, built in Phase 12:
`apps/web/components/expedition/phaser/card-packs/registry.ts`'s
`CARD_PACK_REGISTRY`, typed against `CardPackId`
(`apps/web/lib/expedition/card-pack-ids.ts`) so a missing or misnamed pack is
a compile error. The fixed contract: `CardPackDef { id, name, face(card),
back() }`, drawing to Phaser textures, one file plus one registry line per
pack (v1 ships two: Big Index and Classic, per spec §7.3) — covered
automatically by `card-packs.contract.test.ts`.

## Dev mode

A sandbox for debugging: skip to any camp, edit any state, play a 3-5 seat
table alone.

**Enable.** Both halves must be on. The worker needs `DEV_MODE`: `npm run
dev` in `apps/worker` runs `wrangler dev --port 8787 --var DEV_MODE:1`, and
Playwright's worker command passes the same var. `wrangler.jsonc` never sets
it, so a deploy refuses every `dev` message with a `dev_result` saying how
to turn it on. The web app shows the panel when `NODE_ENV` is `development`
(`next dev`) or `NEXT_PUBLIC_DEV_MODE=1`.

**Use.** On a room page press backtick or click the small DEV button
(bottom left).
- Lobby: "Add bot" seats a bot (a seat nobody connects to). Two bots plus you
  is a legal Expedition table.
- Autoplay: pick who it plays for (bots, everyone but me, everyone) and when
  it stops (your decision, or the next camp to settle), with a step cap.
  Bots abstain from votes, so your ballot decides.
  "Bots act automatically" re-runs bot autoplay after every change.
- Shortcuts: jump to a camp of a chosen run length (arriving at its loadout
  or dealt), jump to the final camp, end the run won or lost, force the camp
  to clear or fail (through the real settle), set supplies, set the purse,
  set a boss camp's boss (`set-plan-boss`, kept by a later jump in the same
  length, re-dealing that camp if it is in play), set a seat's character,
  give a seat an item (`give-item`: a new instance, equipped while a slot is
  free), set a seat's upgrade (`set-upgrade`, its own character's or none),
  set the camp's location and weather (`set-spec`, dealing a dealt camp
  again), move a card between hands, make the last trick a hallucination
  (`void-last-trick`), reroll a route option (`reroll-route`), set a route's
  boss swap (`set-route-swap`), queue a special draft offer
  (`queue-offer`), set an objective's owner.
- Reveal all hands: a plain-text dump of every hand, objective and trick,
  naming the seats each concealed thing is hidden from.
- State: the whole `RunState` as JSON. Edit and Apply; the worker parses it
  with `ExpeditionRunStateSchema` and then `dev/check.ts` (card conservation,
  known ids, seat alignment, item instances below `itemSerial`, equipped
  sets within the slots, draft offers of known items, upgrades of the seat's
  own character, route rerolls and boss swaps, hallucinations naming this
  camp's cards), and answers with a readable error if either fails.
- Snapshots: named copies of the state in this browser's localStorage. One
  saved in another room loads into any room with the same seat count; its
  seat ids are renamed to the room's.

**Where it lives.** The room plumbing is game-agnostic: `GameAdapter.dev`
(`packages/rules/src/adapter.ts`), `apps/worker/src/dev-room.ts`, the `dev`
messages in `packages/schema/src/dev.ts`, and `apps/web/components/dev/
DevPanel.tsx`, which renders whatever shortcuts the game describes. The
Expedition layer is `dev/`: `shortcuts.ts` (the `DEV_SHORTCUTS` registry,
one small pure function over `RunState` each), `check.ts`, `autoplay.ts`
(`botMove`, the first priority move `applyRunAction` accepts, never a
whisper, an ability, an equip or a buy; it takes a draft's first bundle),
`inspect.ts` and `hooks.ts`. When `RunState`
changes, update `ExpeditionRunStateSchema` (the worker's compile-time
assertion in `game-registration.ts` fails until you do), then `check.ts` and
whichever shortcuts touch the changed fields.

## Invariants

- **No state mutation outside the toolkit.** An ability's `apply` only ever
  returns `ToolkitOp` data; `run/toolkit.ts`'s `applyToolkitOps` is the only
  function that ever writes to a `CampState`/`RunState` on its behalf.
  Every other transition in this package (`applyCampAction`,
  `applyRunAction`, `applyWhisper`) builds and returns a new state, never
  mutates its input.
- **Derive, don't cache.** Phase, status, the current actor, the open
  window, the next attempt number, every seat's remaining Whisper count and
  every source's remaining uses are *computed* from `CampState`/`RunState`
  and the seat ledgers on every call (`campPhase`, `checkCampOutcome`,
  `currentActorSeatId`, `currentWindow`, `runStatus`,
  `nextAttemptNumber`, `whispersUsedBy`, `remaining`). None is a stored
  field; rescue is not a stored mode. A composed `RunRules` value is likewise never cached
  (`run/compose.ts`'s `rulesFor` recomputes fresh every call); this is what
  lets a replay reset every camp-scoped resource structurally, by simply
  building a fresh `AttemptState`, rather than needing to hand-clear
  anything.
- **No non-seeded randomness or clock.** Every draw goes through
  `run/rng.ts`'s `seededIndex`/`STREAMS`, exposed to abilities only through
  `AbilityContext.randomIndex`/`randomCards`. `purity.test.ts` scans this
  whole directory and fails on a stray non-seeded random or clock call, or
  a Node/Worker/browser/Hanabi import — new files are covered automatically,
  with no test edit required.
- **Reveals are the only private channel.** A card identity is visible to a
  seat only via a `Reveal` addressed to it (`run/toolkit.ts`'s `reveal` op:
  audience must be non-empty, no duplicates, every seat known) or via that
  seat's own hand. A `LogEntry` never carries a card id, by its own type
  (`run/types.ts`).
- **The seed and draft offers are private.** `RunState.seed` is redacted by
  `adapter/view.ts`'s explicit allowlist — it is never written into any view
  literal, at any nesting level — since it is the root of every RNG stream
  and its exposure would let a client predict future draws. `SeatRun.offers`
  is likewise redacted to a plain per-seat conditional lookup: a viewer's
  draft stage's `yourOffer` is the head of their own offers or `null`, never
  another seat's, and `itemSerial` is never projected. The leak check flags
  another seat's bundles anywhere in a view. Both are proven redacted by
  `adapter/view.property.test.ts`'s whole-run per-seat leak property
  (COMM-03/ENG-03).
- **A reveal pins identity only (WR-03).** A `Reveal` shows the card's
  identity and the seat that held it at the moment of the reveal; it never
  follows the card after a later move/swap, and the view never re-derives a
  revealed card's CURRENT holder from that reveal. A reveal is a fixed,
  point-in-time fact, not a live tracker.
- **Rule-hook defects throw (A3).** A composed hook returning an
  out-of-domain value (an unknown seat, a missing catalogue id) is a
  content-authoring defect, not a player error, and it throws a plain
  `Error` naming the problem — it is never silently corrected or allowed to
  soft-lock a run.

## Adapter

`adapter/adapter.ts` (`expeditionGame`, the `GameAdapter` conformance),
`adapter/view.ts` (`toExpeditionPlayerView`, the sole per-seat projection),
`adapter/request-guards.ts` (hostile-input `unknown` → `RunAction` narrowing)
and `adapter/view-leak-check.ts` (`checkExpeditionViewForLeaks`/
`secretsForExpeditionSeat`, the real per-seat leak checker) are this
engine's only seam to the room layer. A new source or target kind
registered per the recipes above is leak-checked automatically by
`sources.contract.test.ts` and `targets.contract.test.ts`, which call the
real checker for every registered entry with zero test edits.
`adapter/catalog-display.ts` projects the catalogue for the client
(`SOURCE_DISPLAY`, `CHARACTER_DISPLAY`): names, text, window and limit
badges (an item's uses badge: "Single use", "Once per camp", "2 charges"),
an item's rarity and price, never a function.
