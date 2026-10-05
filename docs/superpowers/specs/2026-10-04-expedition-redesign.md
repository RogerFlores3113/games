# Expedition: routing, camps, bosses and items

Design, 2026-10-04. Synthesized from candidate A (one camp-modifier catalogue over a journaled
run) and candidate B (a staged run with reactive hazards). Replaces the six-camp run, the four
boss twists, the kit and the upgrade draft. Characters are redesigned last, in their own units.

---

## Problem

The owner redesigned the run on 2026-10-03/04. The crew votes a run length (4, 6 or 8 camps).
Bosses are drawn once per run. Between cleared camps the crew earns coins, drafts item bundles,
votes a route, meets an event and, before a boss camp, a shop. Every camp has a location and a
weather. There are six animal bosses, seven disasters and a temple finale where earlier bosses
return at half strength. Items have uses and slots. Nine new characters follow.

Five things in today's engine make the shape non-obvious.

- Camp identity is a number. `CampNumber = 1..6`, `BOSS_CAMPS`, `FINAL_CAMP`, `BALANCE_TABLE`
  and `bossTwists: {3, 6}` assume one length. A replay must reuse location, weather and boss.
- The run phase is decoded from nullable fields (`runPhase` in `run/lifecycle.ts`). The new loop
  has seven waiting points, each with its own data (ballots, private offers, shop stock).
- A boss is a `RuleModifier` only (`boss/boss-def.ts`). Half the new bosses act at a moment
  (Tornado moves cards, Locusts eat items, the Snake bites a whisperer). Hands are stored, so a
  hook cannot say "three cards blew right".
- The trick record cannot say a card burned or counted as another card. `trickContaining`
  matches printed identities, and `trickWinner` reads the led suit from `plays[0]`, which a burn
  or `winnerExcluding` (Bait) can remove.
- `SeatRun.kit` fuses ownership and use. Items now have slots, a backpack and per-instance uses.

Kept: the pure rules package; toolkit ops as the only mutation surface, with card conservation;
`RuleModifier` layering with card-reading hooks folded first (WR-03); seeded named RNG streams,
seed never projected (A1); strict per-seat views with the independent leak check; one file plus
one registry line per entry, with contract tests that need no edits. No compatibility layer:
`ROOM_SCHEMA_VERSION` bumps and in-flight rooms reset.

## Usage (caller's view)

### README excerpt: the run loop

> A run is a stored stage. `applyRunAction` is still the one transition: it checks the stage
> accepts the action, runs the stage's handler, then advances stages to a fixed point.
>
> 1. **Muster.** Each seat sends `pick-character` and `vote { choice }` ("short", "standard",
>    "long"). A ballot may change until the vote resolves. The last missing input resolves it
>    (majority, else a seeded coin flip the view shows), draws the run plan and opens the loadout
>    for camp 1 (Jungle, fair weather).
> 2. **Loadout.** Each seat sends `equip { itemUids }`, before a boss camp `buy { stockId }`, then
>    `ready`. The last `ready` deals the camp.
> 3. **Camp.** As today. Camp modifiers react to the Core's events. The camp ends the moment every
>    objective and every goal is done.
> 4. **Settle.** A failure costs supplies and reopens the loadout for the same camp spec with a
>    fresh deal; 0 supplies ends the run. A clear pays `5 + min(3, unplayed tricks)` into the
>    purse and deals every seat a private draft offer, or wins the run at the final camp.
> 5. **Draft.** Each seat sends `pick-bundle { bundle }`.
> 6. **Route.** Each seat votes over 2 or 3 options. Each previews its event and the next camp's
>    location, weather, objective types and, for a boss camp, the boss.
> 7. **Event.** A stub. Each seat sends `ready`, then the next camp's loadout opens.
>
> A disconnected seat's ballot is cast as an abstention by the worker's auto-pass after the
> existing grace (`ABSENT_SEAT_PASS_GRACE_MS`).

```ts
run = act(run, "p0", { type: "vote", choice: "standard" });   // last ballot: plan, loadout of camp 1
run = act(run, "p1", { type: "equip", itemUids: ["it3"] });  // replaces the equipped set
run = act(run, "p2", { type: "pick-bundle", bundle: 1 });     // draft
run = act(run, "p0", { type: "vote", choice: "b" });          // route
```

### README excerpt: add a camp modifier

> Locations, weathers, pairings, bosses and the temple are all `ModDef`s: one file in
> `content/mods/<id>.ts`, one line in `content/mods/registry.ts`. A def has a `kind`, a draw
> `weight`, one sentence of `text` and a `full` body. A boss also has a `half` body, used when it
> returns as a temple helper. A body has any of: `rules(ctx)`, a `RuleModifier` for any question
> the engine asks; `on`, reactions to engine events returning toolkit ops, only when something
> must happen at a moment; `effect(e, ctx)`, the layer an `add-modifier` from `on` switches on;
> `slots(prev)`, the camp's objective slots at plan time; `status(ctx)`, public entity state for
> the table; `grants`, an ability every seat may use. `ctx.roll(label, n)` and `ctx.draw(n)` are
> seeded and the engine names the stream. `mods.contract.test.ts` drives every registered body
> through a camp at 3, 4 and 5 players with no edits.

```ts
// content/mods/thunderstorm.ts: a weather that rolls at a moment
export const thunderstorm = defineMod({
  id: "thunderstorm", kind: "weather", name: "Thunderstorm", weight: 1,
  text: "Lightning may strike before a trick, and then the lowest card wins it.",
  full: {
    on: {
      "trick-started": (ctx) => {
        const t = ctx.event.trickIndex;
        const strikes = strikesOf(ctx.run, "thunderstorm");
        if (strikes.length >= 2 || strikes.some((s) => s.atTrick === t)) return [];
        if (ctx.draw(100) >= Math.min(100, 20 + 10 * t)) return [];
        return [{ op: "add-modifier", lasts: "trick", audience: "public", params: { strike: true }, deferIfFatal: true }];
      },
    },
    effect: () => ({ trickWinner: () => (plays) => lowestSeat(plays) }),
    status: (ctx) => stormStatus(ctx), // next chance, strikes left, "strike" while one is pending
  },
});

// content/mods/crocodile.ts: an animal boss, a derived rule with a half body
const crocodileBody = (every: number): ModBody => ({
  rules: (ctx) => ({
    goals: (prev) => (camp) => [
      ...prev(camp),
      guard("crocodile", camp.completedTricks.some((t) => t.winnerSeatId === facing(ctx, t.index, every))),
    ],
  }),
  status: (ctx) => {
    const seatId = ctx.camp === null ? null : facing(ctx, ctx.camp.currentTrick.index, every);
    return seatId === null ? [] : [{ kind: "facing", seatId }];
  },
});
const facing = (ctx: ModCtx, trick: number, every: number): string | null =>
  trick % every !== 0 ? null : ctx.run.seatIds[(ctx.roll("start", ctx.run.seatIds.length) + trick) % ctx.run.seatIds.length]!;

export const crocodile = defineBoss({
  id: "crocodile", kind: "animal", name: "Crocodile", weight: 1,
  text: "The crocodile watches one player each trick, and if they win it the camp is lost.",
  full: crocodileBody(1),
  half: crocodileBody(2), // as a temple helper it watches every other trick
});
```

A location that changes the deal is one `rules` line (`magma`: `deckFor: () => heatDeck`). A
disaster that moves cards is an `on` handler: Tornado's draws each hand's cards first
(`ctx.randomCards`), reveals each sent card to its sender, then moves them right.

### README excerpt: add an item

```ts
// content/items/bait.ts
export const bait = defineItem({
  id: "bait", name: "Bait", rarity: "common", price: 2, // placeholder price
  uses: { kind: "single-use" },                        // or per-camp, or { kind: "charges", n }
  text: "A card on the table can't win this trick.",
  active: itemAbility({
    window: "in-trick",
    targets: [{ kind: "card", where: "board" }],
    apply: (ctx) => [{ op: "add-modifier", lasts: "trick", audience: "public", params: { cardId: ctx.targets[0].cardId } }],
    effect: (e) => ({ trickWinner: (prev) => (plays, led) => winnerExcluding(prev, plays, led, (p) => p.card.id === e.params.cardId) }),
  }),
});
```

An item's `uses` is its limit, so an item ability has no `limit`. The engine counts uses per
instance and removes a spent instance from its owner.

### Call sites

```ts
// run/stages/camp.ts: the only new steps inside an accepted camp action
const result = applyCampAction(camp, seatId, action, rules);            // now also returns events
const settled = deferFatalEffects(run, seatId, action, result, catalog); // Thunderstorm, below
return ok(react(settled.run, settled.events, catalog));                // applyRunAction then advances
// adapter/view.ts and view-leak-check.ts read the same stack and the same hook
const mods = campStack(run, catalog).map((layer) => toModView(layer, modCtx(run, layer)));
const hidden = rules.hides(run, viewerSeatId, { kind: "play", trickIndex, position, seatId });
```

---

## Shape

The public surface stays `createRun`, `applyRunAction`, `toExpeditionPlayerView`, the define
helpers and four registries (`ITEMS`, `CHARACTERS`, `MODS`, `EVENTS`). Stage transitions, the
stack, composition order, reactions, the fatal deferral, RNG naming and leak derivation hide
behind them. A content author learns one body type and one channel rule.

### Module map

```
expedition/
  state.ts actions.ts camp.ts trick.ts rules.ts objectives.ts deck.ts   Core: CampEvents, ResolvedPlay,
                       discards, goals, identityOf, burns, objectiveDeckFor, objectiveStatus, trickWinner(plays, led)
  content/
    source-def.ts      ItemDef (uses, rarity, price), ItemAbility, UsageLimit (+ crew-tokens)
    items/, characters/                 as today (13 items remapped; six characters until unit 13)
    mods/mod-def.ts    ModDef, ModBody, ModCtx, ReactionCtx, StatusPart, defineMod, defineBoss
    mods/<id>.ts + registry.ts          MODS; mods/pairings.ts PAIRINGS; mods/mods.contract.test.ts
    events/<id>.ts + registry.ts        EVENTS (one stub)
  run/
    types.ts           RunState, Stage, RunAt, SeatRun, ItemInstance, AttemptState, Origin, ActiveEffect
    stages/registry.ts STAGES, applyRunAction, advance to a fixed point (replaces run-actions.ts)
    stages/<tag>.ts    muster, loadout, camp, draft, route, event
    lifecycle.ts       createRun, runStatus, dealCamp, settleCamp, nextAttemptNumber
    balance.ts plan.ts vote.ts route.ts draft.ts shop.ts   tuning, plan, votes, routes, offers, stock
    stack.ts react.ts  NEW   campStack (the one composition list); react (one pass, no cascade)
    compose.ts run-rules.ts toolkit.ts usage.ts windows.ts abilities.ts targets.ts whisper.ts rng.ts
  dev/                 shortcuts, check, inspect, autoplay, hooks (updated by every unit)
  adapter/             view.ts, view-types.ts, view-leak-check.ts, request-guards.ts, adapter.ts
  boss/                DELETED
```

A camp play is three files deep: `stages/registry.ts`, `stages/camp.ts`, then `react.ts` or
`toolkit.ts`.

### Run state and stages

```ts
// run/types.ts
export type RunLength = "short" | "standard" | "long";
export type CampIndex = number & { readonly __brand: "CampIndex" }; // 1-based; minted only by plan.ts
export type SeatId = string;
export type PerSeat<T> = Readonly<Partial<Record<SeatId, T>>>;      // each seat writes only its key

export type RunState = {
  readonly seed: string;                      // never projected
  readonly seatIds: readonly SeatId[];
  readonly seats: readonly SeatRun[];         // seatIds order
  readonly purse: number;                     // shared coins, >= 0
  readonly supplies: number;                  // 0..SUPPLIES_MAX
  readonly plan: RunPlan | null;              // null only in muster
  readonly history: readonly CampResult[];    // one per decided attempt
  readonly lastVote: VoteRecord | null;       // the latest resolved vote, for the flip animation
  readonly itemSerial: number;                // next item instance number
  readonly stage: Stage;
};
export type Stage =
  | { readonly tag: "muster"; readonly ballots: PerSeat<RunLength | null> }  // null abstains
  | { readonly tag: "loadout"; readonly camp: CampSpec; readonly stock: readonly StockEntry[] | null; readonly ready: PerSeat<true> }
  | { readonly tag: "camp"; readonly camp: CampSpec; readonly attempt: AttemptState }
  | { readonly tag: "draft"; readonly cleared: CampIndex; readonly payout: number }
  | { readonly tag: "route"; readonly from: CampIndex; readonly options: readonly RouteOption[]; readonly ballots: PerSeat<RouteChoice | null> }
  | { readonly tag: "event"; readonly route: RouteOption; readonly ready: PerSeat<true> }
  | { readonly tag: "ended"; readonly result: "won" | "lost" };
export type StageTag = Stage["tag"];
/** The run narrowed to one stage. Stage handlers take this and never re-check the tag. */
export type RunAt<T extends StageTag> = RunState & { readonly stage: Extract<Stage, { tag: T }> };

export type CampResult = { readonly camp: CampIndex; readonly attempt: number; readonly status: "cleared" | "failed"; readonly suppliesSpent: number; readonly coins: number };
export type AttemptState = {
  readonly attemptNumber: number;
  readonly camp: CampState;                   // always dealt: the pre-deal window is deleted
  readonly effects: readonly ActiveEffect[];
  readonly reveals: readonly Reveal[];
  readonly log: readonly LogEntry[];
};
```

The stage tag is the phase; `runPhase` is deleted and `runStatus` reads `ended`. Draft offers
live on `SeatRun.offers`, not on the stage, so a later Treasure Map can queue special drafts.

```ts
// run/stages/registry.ts
export type StageDef<T extends StageTag> = {
  readonly accepts: readonly RunAction["type"][];  // any other type is refused wrong_stage
  apply(run: RunAt<T>, seatId: SeatId, action: RunAction, catalog: Catalog): AdapterResult<RunState, RunError>;
  /** Idempotent: returns run unchanged until the stage is done. */
  advance(run: RunAt<T>, catalog: Catalog): RunState;
};
export const STAGES: { readonly [T in StageTag]: StageDef<T> } = { /* six files; ended accepts [] */ } as never;
/** invalid_action, not_a_seat, run_over, wrong_stage, STAGES[tag].apply, then advance until the
 * tag stops changing (bounded by the stage count). */
export function applyRunAction(run: RunState, seatId: SeatId, action: RunAction, catalog: Catalog): AdapterResult<RunState, RunError> {
  throw new Error("not implemented");
}
```

| Stage | Accepts | Advances when | To |
|---|---|---|---|
| muster | pick-character, vote | every seat has a character and a ballot | loadout(camp 1) |
| loadout | equip, buy, ready | every seat ready | camp, dealt, `camp-dealt` reacted |
| camp | use-ability, skip-window, whisper, pick-objective, play-card | decided, no rescue pending | draft, loadout (replay) or ended |
| draft | pick-bundle | no seat has an offer | route |
| route | vote | every seat has a ballot | event |
| event | ready | every seat ready | loadout(next) |

**Why stored stages.** Each stage carries data that exists only there (ballots, options, stock,
the chosen route). A stored union makes stale data unrepresentable, and the web switches on one
tag per screen. Purse, supplies and history are stored plainly: four writers (settle, buy,
`adjust-supplies`, `adjust-coins`), and every reader (HUD, dev panel, shop) wants the number, so
a fold buys nothing. `itemSerial` mints opaque ids (`it7`), so an id never names its item and a
fogged loadout cannot leak through one.

### The plan, routes and votes

```ts
// run/balance.ts (the one tuning file; placeholders unless the brief fixed the number)
export const RUN_LENGTHS = {
  short:    { camps: 4, bossCamps: [{ at: 4, tier: "temple" }] },
  standard: { camps: 6, bossCamps: [{ at: 3, tier: "animal" }, { at: 6, tier: "temple" }] },
  long:     { camps: 8, bossCamps: [{ at: 3, tier: "animal" }, { at: 6, tier: "disaster" }, { at: 8, tier: "temple" }] },
} as const;
/** Seat objectives per camp, before boss and temple slot layers. The temple adds the Sun. */
export const OBJECTIVE_RAMP: Record<RunLength, readonly number[]> = {
  short: [2, 3, 4, 3], standard: [2, 3, 3, 4, 4, 4], long: [2, 3, 3, 4, 4, 4, 5, 4],
};
export const MIX_FROM_CAMP = 4;            // ordered pairs and trick-count slots from camp 4
export const SUPPLIES_START = 3, SUPPLIES_MAX = 4, SUPPLY_PRICE = 6;
export const PAYOUT = { base: 5, perUnplayedTrick: 1, unplayedCap: 3 };
export const NORMAL_WEATHER_CHANCE = 80;   // percent; a location may override (Clifftop 50)
export const ROUTE_OPTIONS = { min: 2, max: 3 };
export const DRAFT = { options: 3, bundleSize: 2, rareChance: 15 };
export const SHOP = { items: 3, upgradePrice: 8 };
export const TRICK_COUNT_N_RANGE = { min: 2, max: 4 };
```

```ts
// run/plan.ts
export type BossTier = "animal" | "disaster" | "temple";
export type PlannedBoss = { readonly at: CampIndex; readonly tier: BossTier; readonly modId: ModId | null };
export type RunPlan = { readonly length: RunLength; readonly bosses: readonly PlannedBoss[] };
/** Once, at the length vote. Animal and disaster from their pools (ids sorted, seeded index); the
 * temple tier is "temple". null when the pool is empty: the camp plays plain. */
export function drawPlan(seed: string, length: RunLength, catalog: Catalog): RunPlan;
export function bossAt(plan: RunPlan, at: CampIndex): PlannedBoss | null;
export function isFinalCamp(plan: RunPlan, at: CampIndex): boolean;
/** At the temple: every earlier planned boss, in order. Short none, Standard one, Long two. */
export function helpersFor(plan: RunPlan, at: CampIndex): readonly PlannedBoss[];
/** The furthest camp previewed: muster 0, loadout and camp spec.index, draft cleared, route
 * from + 1, event route.next.index, ended Infinity. A boss id is public iff at <= horizon. */
export function horizon(run: RunState): number;

// run/route.ts
export type CampSpec = {
  readonly index: CampIndex;
  readonly location: ModId;
  readonly weather: ModId;
  readonly event: EventId | null;           // the event on the route that led here; null at camp 1
  readonly slots: readonly SlotTemplate[];  // seat objective types; boss and temple layers add theirs
};
export type RouteChoice = "a" | "b" | "c";
export type RouteOption = { readonly id: RouteChoice; readonly next: CampSpec }; // shop and boss derive from the plan
export function firstCampSpec(length: RunLength): CampSpec; // Jungle, fair, all win-card
/** 2 or 3 options (seeded count). Each: location by weight; fair at the location's normal chance,
 * else a weighted non-fair weather that PAIRINGS allows there (none: fair); a uniform event; a mix. */
export function routeOptions(run: RunAt<"draft">, catalog: Catalog): readonly RouteOption[];
/** The preview's objective types: the spec's slots after every stack layer's `slots`. */
export function slotKindsFor(run: RunState, spec: CampSpec, catalog: Catalog): readonly SlotTemplate["kind"][];

// run/vote.ts
export type VoteResult<C extends string> = {
  readonly tally: readonly { readonly choice: C; readonly votes: number }[];
  readonly tied: readonly C[] | null;       // non-null: settled by the seeded flip the view shows
  readonly winner: C;
};
export type VoteRecord = { readonly topic: "length" | "route"; readonly result: VoteResult<string> };
/** null until every seat has a ballot. Abstentions count for nothing; all abstaining ties every
 * choice. A tie draws seededIndex over the tied choices on `stream`. */
export function tally<C extends string>(seed: string, stream: string, choices: readonly C[], seatIds: readonly SeatId[], ballots: PerSeat<C | null>): VoteResult<C> | null;
```

**Slot mixes.** Camp `k` gets `OBJECTIVE_RAMP[length][k-1]` seat slots, all win-card below
`MIX_FROM_CAMP`. From camp 4 on each route option draws a mix: plain, an ordered pair (two slots
become ordered 1 and 2), a trick-count slot (resolved per attempt, as today), or both when the camp
has 4 or more slots. A replay keeps the spec, so it keeps its mix.

### Seats, items, upgrades, draft and shop

```ts
// run/types.ts
export type ItemUid = string;                         // "it7", minted from run.itemSerial
export type ItemInstance = { readonly uid: ItemUid; readonly itemId: ItemId };
export type SourceKey = CharacterId | UpgradeId | ItemUid | ModId; // ModId: a granted ability
export type SeatRun = {
  readonly seatId: SeatId;
  readonly characterId: CharacterId | null;          // null only in muster
  readonly upgradeId: UpgradeId | null;              // one per player, bought at the shop
  readonly items: readonly ItemInstance[];           // owned; a spent instance leaves
  readonly equipped: readonly ItemUid[];             // subset of items, <= rules.itemSlots(run, seatId)
  readonly offers: readonly DraftOffer[];            // PRIVATE to seatId; the head is the one to pick
  readonly ledger: readonly LedgerEntry[];           // never projected raw
};
export type Stamp = { readonly camp: CampIndex; readonly attempt: number; readonly trick: number | null };
// LedgerEntry as today, keyed by sourceKey instead of sourceId; "regained" goes in unit 13.
export function backpackOf(seat: SeatRun): readonly ItemInstance[];   // usage.ts: items not equipped
/** usage.ts: [character, upgrade?, ...equipped uids, ...granted mod ids]. */
export function liveSourceKeys(run: RunState, seat: SeatRun, catalog: Catalog): readonly SourceKey[];

// content/source-def.ts
export type Rarity = "common" | "rare";
export type ItemUses = { readonly kind: "single-use" } | { readonly kind: "per-camp" } | { readonly kind: "charges"; readonly n: number };
export type ItemAbility = Omit<ActiveAbility, "limit">;
export type ItemDef = SourceBase & { readonly kind: "item"; readonly rarity: Rarity; readonly price: number; readonly exclusiveTo?: CharacterId }
  & ({ readonly uses: ItemUses; readonly active: ItemAbility } | { readonly uses?: never; readonly active?: never; readonly passive: PassiveAbility });
export type UsageLimit =
  | { readonly kind: "per-camp"; readonly times: number }
  | { readonly kind: "per-run"; readonly times: number }
  | { readonly kind: "pool"; readonly cost: number }         // deleted in unit 13
  | { readonly kind: "supplies"; readonly cost: number }
  | { readonly kind: "crew-tokens"; earned(run: RunState): number }; // earned this attempt minus every seat's uses
```

Item remaining folds `used` entries keyed by the uid: per-camp counts the current
`(camp, attempt)` stamp, charges count all time, single-use is one charge. `useAbility` removes the
instance from `items` and `equipped` on the use that spends its last charge.

**Equip.** `equip { itemUids }` replaces the equipped set: owned and distinct (`not_owned_item`),
within `rules.itemSlots` for the loadout's camp (`too_many_items`). `ready` re-checks the count,
since a Rats camp lowers slots under a set carried from the last camp. Equip only in the loadout.

**Upgrades.** Every upgrade gives its owner one more whisper per camp: the base
`whispersPerCamp` is `1 + (upgradeId === null ? 0 : 1)`. `ownerOf(seat).hasUpgrade(id)` reads
`upgradeId === id`. Until unit 13 the six characters keep two upgrades each; a seat buys one.

```ts
// run/draft.ts
export type DraftOffer = { readonly kind: "standard"; readonly bundles: readonly (readonly ItemId[])[] };
/** Seeded per (camp, seat, ordinal). Each bundle: rarity first (rareChance), then an item of that
 * rarity; distinct within a bundle; exclusiveTo filters by character. Never an upgrade. */
export function draftOfferFor(seed: string, cleared: CampIndex, seat: SeatRun, ordinal: number, catalog: Catalog): DraftOffer;

// run/shop.ts
export type StockEntry = {
  readonly stockId: string;                                    // "supplies" | "item0".."item2"
  readonly what: { readonly kind: "supplies" } | { readonly kind: "item"; readonly itemId: ItemId };
  readonly price: number;
  readonly soldTo: SeatId | null;                              // items only, one copy each
};
/** Opened on every visit to the loadout before a boss camp; a replay is a visit with the same
 * stock. Upgrades are not stock: each seat sees its own character's upgrades at
 * SHOP.upgradePrice while its upgradeId is null. No blacksmith. */
export function stockFor(seed: string, at: CampIndex, catalog: Catalog): readonly StockEntry[];
```

`pick-bundle` mints one instance per item and drops the offer. A draft follows every cleared camp
but the final one. `buy` spends the shared purse (`cannot_afford`): supplies refuse at max
(`supplies_full`); an item mints into the buyer's backpack (`sold_out` after); `upgrade:<id>`
sets `upgradeId` (`upgrade_owned`, `not_your_upgrade`). The Durable Object serializes actions, so
two buyers never both spend the last coins.

### Camp modifiers: def, stack and composition

```ts
// content/mods/mod-def.ts
export type ModId = string;               // also the web art id
export type ModKind = "location" | "weather" | "pairing" | "animal" | "disaster" | "temple";
export type Strength = "full" | "half";
export type ModCtx = {
  readonly run: RunState; readonly spec: CampSpec; readonly strength: Strength;
  readonly camp: CampState | null;          // null in the loadout, before the deal
  /** Seeded 0..n-1 on expedition-mod:{id}:{strength}:camp{k}:attempt{a}:rule:{label}. The same
   * label gives the same value within an attempt. */
  roll(label: string, n: number): number;
};
export type ReactionCtx<E extends EngineEventType> = ModCtx & {
  readonly camp: CampState; readonly event: Extract<EngineEvent, { type: E }>; readonly rules: RunRules;
  draw(n: number): number;                  // seeded, numbered per call: ...:on:{eventKey}:draw{j}
  randomCards(seatId: string, n: number): readonly string[];
};
export type Reactions = { readonly [E in EngineEventType]?: (ctx: ReactionCtx<E>) => readonly ToolkitOp[] };

/** Public table state. Carries no card id or identity by type. */
export type StatusPart =
  | { readonly kind: "facing"; readonly seatId: string }                              // Crocodile
  | { readonly kind: "dam"; readonly suit: Suit }                                      // Beaver
  | { readonly kind: "streak"; readonly seatId: string; readonly count: number }      // Tiger
  | { readonly kind: "bitten"; readonly seatId: string; readonly tricksLeft: number } // Snake
  | { readonly kind: "meter"; readonly left: number; readonly of: number }            // Monsoon, Flooding
  | { readonly kind: "chance"; readonly percent: number; readonly strikesLeft: number } // Thunderstorm
  | { readonly kind: "strike" }                                                        // a strike sits on this trick
  | { readonly kind: "countdown"; readonly tricks: number }                           // Tornado, Earthquake
  | { readonly kind: "alternating"; readonly activeNow: boolean }                     // Blood Moon, half bodies
  | { readonly kind: "path"; readonly plates: readonly (Suit | "sun")[]; readonly pressed: number }; // Temple

export type ModBody = {
  readonly rules?: (ctx: ModCtx) => RuleModifier;
  readonly on?: Reactions;
  readonly effect?: (effect: ActiveEffect, ctx: ModCtx) => RuleModifier; // required iff `on` can add-modifier
  readonly slots?: (prev: readonly SlotTemplate[]) => readonly SlotTemplate[];
  readonly status?: (ctx: ModCtx) => readonly StatusPart[];
  readonly grants?: ActiveAbility;
};
type DefBase<K extends ModKind> = { readonly id: ModId; readonly kind: K; readonly name: string; readonly text: string; readonly weight: number; readonly full: ModBody };
export type LocationDef = DefBase<"location"> & { readonly normalWeatherChance?: number };
export type BossDef = DefBase<"animal" | "disaster"> & { readonly half: ModBody };
export type ModDef = LocationDef | DefBase<"weather"> | DefBase<"pairing"> | BossDef | DefBase<"temple">; // weight 0: never drawn

// run/stack.ts
export type StackLayer = { readonly def: ModDef; readonly strength: Strength; readonly body: ModBody };
/** Fold order: location (unless a pairing cancels it), weather (unless cancelled), the pairing's
 * added def, the planned boss (full) or the temple, then helpers (half) in the order faced. Reads
 * the loadout or camp stage's spec; [] in every other stage. */
export function campStack(run: RunState, catalog: Catalog): readonly StackLayer[];
```

Half strength is a hand-written body per boss, not arithmetic: a generic halving means nothing for
Rats or Capybara, and the owner can read and tune a body.

**Composition order** (`run/compose.ts`): base, then each stack layer's `rules(ctx)`, then each
seat's live passives (seat order, then `[character, upgrade, ...equipped]`), then each live
effect in stored order (a seat effect's `active.effect`, a mod effect's `body.effect`). The
card-reading hooks `identityOf`, `isTrump` and `rankOf` fold first, in that order. Bosses fold
after weather so a boss can refine a weather. Passives fold after both so an item can lift a camp
rule for its owner (Mosquito Net under Rain). Effects win last. Compose, the view, the route
preview and the leak check all read `campStack`.

```ts
// content/mods/pairings.ts
export type PairingRule = { readonly location: ModId; readonly weathers: readonly ModId[]; readonly result: "never" | { readonly cancels: readonly ModId[]; readonly adds: ModId | null } };
export const PAIRINGS: readonly PairingRule[] = [
  { location: "magma", weathers: ["rain", "thunderstorm"], result: { cancels: ["magma"], adds: "steam" } },
  { location: "cave", weathers: ["rain"], result: { cancels: [], adds: "flooding" } },
  { location: "cave", weathers: ["night"], result: "never" },
  { location: "desert", weathers: ["rain"], result: "never" },
];
```

`steam` is a pairing def with an empty body. `flooding` carries the river guard and meter. The
route generator filters "never" weathers before the draw, so there is no rejection loop.

### Hooks

Core (`CoreRules`):

| Hook | Signature | Base | Users |
|---|---|---|---|
| `deckFor` | unchanged | | Magma |
| `objectiveDeckFor` NEW | `(deck) => StandardIdentity[]` | standard cards ranked above the deck's lowest rank | every camp (the floor); Meteor drops aces |
| `identityOf` NEW, folded first | `(card) => CardIdentity` | printed | Blood Moon; Explorer later |
| `isTrump`, `rankOf` | unchanged; the base reads `identityOf(card)` | | items |
| `trickWinner` CHANGED | `(plays, led: CardIdentity) => seatId` | see trick resolution | Thunderstorm, Bait, Puffball, Howler Call |
| `legalPlays`, `nextLeader`, `leaderFor` | unchanged | | Tiger, Beaver (`legalPlays`) |
| `burns` NEW | `(plays, led, winnerOf) => cardId[]` | `[]` | Wildfire, Meteor |
| `objectiveStatus` NEW | `(camp, objective) => ObjectiveStatus` | `evaluateObjective` | Snake |
| `goals` REPLACES `failureChecks` | `(camp) => Goal[]` | `[]` | Crocodile, Monsoon, Flooding, Temple, Camouflage |

Run (`RunHooks`):

| Hook | Signature | Base | Users |
|---|---|---|---|
| `hides` NEW | `(run, viewerSeatId, subject: Concealable) => boolean` | false | Desert, Cave, Night, Heavy fog |
| `itemSlots` NEW | `(run, seatId) => number` | 2 | Rats; Pack Rat later |
| `whispersPerCamp` | unchanged signature | 1 + owned upgrade | Heavy Pack, Rain Poncho, Smoke Signal |
| `whisperAllowed`, `whisperAudience`, `failureCost` | unchanged | | Rain, Mosquito Net |
| `objectiveAssignment` | DELETED | | |

```ts
export type Concealable =
  | { readonly kind: "play"; readonly trickIndex: number; readonly position: number; readonly seatId: string } // current trick
  | { readonly kind: "objective"; readonly objectiveId: string }  // its kind and target, not its existence
  | { readonly kind: "loadout"; readonly seatId: string };        // unused equipped items and the backpack
export type Goal = { readonly id: string; readonly status: "pending" | "done" | "failed" };
/** A guard is done until broken. A task is pending until achieved and failed once unreachable. */
export function guard(id: string, broken: boolean): Goal;
```

`objectiveStatuses(state, rules)` and every caller of `evaluateObjective` outside `objectives.ts`
(toolkit `swap-objectives` and `replace-objective`, `content/helpers.ts`, windows, the view, the
leak check) read `rules.objectiveStatus`.

### Events and reactions

```ts
// state.ts: values the Core already computes, never stored
export type CampEvent =
  | { readonly type: "objective-picked"; readonly seatId: string; readonly objectiveId: string }
  | { readonly type: "card-played"; readonly trickIndex: number; readonly position: number; readonly seatId: string; readonly cardId: string }
  | { readonly type: "trick-completed"; readonly trickIndex: number; readonly winnerSeatId: string; readonly burnedCardIds: readonly string[] }
  | { readonly type: "trick-started"; readonly trickIndex: number; readonly leaderSeatId: string }; // after the last pick and each non-final trick
// actions.ts
export type CampActionResult = { readonly ok: true; readonly state: CampState; readonly events: readonly CampEvent[] } | { readonly ok: false; readonly error: CampError };

// run/react.ts
export type EngineEvent =
  | CampEvent
  | { readonly type: "camp-dealt" }                     // lifecycle.dealCamp
  | { readonly type: "whisper-sent"; readonly ordinal: number; readonly fromSeatId: string; readonly toSeatId: string }; // whisper.ts
export type EngineEventType = EngineEvent["type"];
/** One pass: events in order; for each, every stack layer with a handler, in stack order, each
 * seeing the previous layer's ops. Ops never emit events, so a reaction never triggers one. Each
 * reactor's ops fold through applyToolkitOps (conservation per reactor). trick-completed and
 * trick-started reactions are skipped once the camp is decided or no trick remains. */
export function react(run: RunAt<"camp">, events: readonly EngineEvent[], catalog: Catalog): RunAt<"camp">;
```

Reactors are stack layers only; unit 12 may add `on` to `SourceBase` if a character needs it.
Reactions run before advance, so the camp settles on the post-reaction state.

### Which channel each mechanic uses

A question the engine asks is a `rules` hook, derived from the trick log and seeded rolls. A change
to stored state at a moment is an `on` reaction. The shape of the deal or the slots is a deal hook
or `slots`. Half bodies are placeholders for owner review.

| Mod | Kind | Channel | Full | Half |
|---|---|---|---|---|
| clearing, jungle | location | none | empty body | |
| clifftop | location | plan | `normalWeatherChance: 50` | |
| desert (Mirage) | location | rule | `hides` one objective (`roll("mirage")`) from everyone until the first trick completes | |
| cave (Darkness) | location | rule | `hides` every current-trick play from all but its player | |
| magma (Heat) | location | deal | `deckFor`: no 2s or 3s, then 4s (clubs, diamonds, hearts, spades) until the deck divides by the seat count (45, 44, 45 cards); the floor makes targets 5+ | |
| fair | weather | none | drawn at the location's normal chance | |
| rain | weather | rule | `whisperAllowed` false | |
| fog (Heavy fog) | weather | rule | `hides` every other seat's loadout | |
| thunderstorm | weather | reaction + effect | `trick-started` rolls a strike; the strike's `trickWinner` is the lowest card | |
| night | weather | rule | `hides` position 0 of the current trick | |
| steam | pairing | data | magma with rain or thunderstorm cancels Magma | |
| flooding | pairing | rule | cave with rain: `goals` guard, every objective done by trick `river(total)`; `meter` | |
| tiger | animal | rule | `legalPlays`: a leader who won the last two tricks has one legal lead, `roll("t{i}")` over the hand; `streak` | pounces only on even trick indices |
| rats | animal | rule | `itemSlots` - 1 | - 1 only for `seatIds[0]` and `seatIds[1]` |
| snake | animal | reaction + effect | `whisper-sent` adds an attempt effect `{seatId, from: t, through: t + 1}`; `objectiveStatus` fails a card objective that seat won in that span; `bitten` | the bite lasts one trick |
| crocodile | animal | rule | `goals` guard; `facing` shifts one seat per trick from `roll("start")` | faces every other trick |
| capybara | animal | slots | + 2 win-card slots | + 1 |
| beaver | animal | rule | `legalPlays`: suit `SUITS[(roll("start") + t) % 4]` is out unless no other standard card is legal; jokers are never forced; `dam` | dams every other trick |
| tornado | disaster | reaction | every 3rd `trick-completed`: 3 random cards per hand pass right, revealed to the sender | every 6th |
| earthquake | disaster | reaction | at `trick-completed` when completed = `floor(total / 2)`: open owned objectives shuffled and dealt back keeping each seat's count (`reassign-objective` where the owner changes) | `swap-objectives` between two random seats |
| wildfire | disaster | rule | `burns` the lowest standard card (printed rank; a tie burns the earliest) | odd tricks only |
| meteor | disaster | rule | `burns` the card `winnerOf(plays)` names, Sun and Moon included; `objectiveDeckFor` drops aces | odd tricks only; aces still dropped |
| blood-moon | disaster | rule | `identityOf` on odd tricks: spades count as diamonds, clubs as hearts; `alternating` | tricks 3, 7, 11... |
| locusts | disaster | reaction | each `trick-completed`: `break-item` on the next seat with an equipped item, round-robin from the expedition leader; with none left anywhere, `discard-round` one random card per hand | items only, odd tricks only |
| monsoon | disaster | rule | `goals` guard, every objective done by trick `river(total)`; `meter` | floods one trick later |
| temple | temple | slots, rule, status, grants | see the temple | |

`river(total) = ceil(total * 3 / 4)` is a placeholder shared by Monsoon and Flooding.

### Trick resolution, burning, ties and lost targets

```ts
// state.ts
export type ResolvedPlay = {
  readonly seatId: string; readonly card: ExpeditionCard;
  readonly countsAs: CardIdentity | null;   // identityOf at completion, when it differs from printed
  readonly burned: boolean;                 // left the trick: never wins, never counts for an objective
};
export type CompletedTrick = { readonly index: number; readonly leaderSeatId: string; readonly plays: readonly ResolvedPlay[]; readonly winnerSeatId: string };
export type Discard = { readonly card: ExpeditionCard; readonly afterTrick: number }; // eaten from a hand
// CampState gains discards. ObjectiveSlot's win-card gains `fixed?: CardIdentity`.
// WinCardObjective.target widens to CardIdentity (the Sun).
```

Completion in `applyPlayCard`:

1. `led = rules.identityOf(plays[0].card)`. The led identity is fixed at the lead.
2. `burned = rules.burns(plays, led, (p) => rules.trickWinner(p, led))`. Every play burned is a
   composition defect and throws (A3).
3. `winner = rules.trickWinner(kept, led)`. Base: the highest trump kept; else the highest kept
   card following `led`; else the highest kept card. Equal strength goes to the earliest play.
   This replaces the malformed-trick throw, which a burned lead makes reachable.
4. Record each play with `countsAs` and `burned`. A trick is resolved once; no rule re-resolves
   history.

`winnerExcluding(prev, plays, led, excluded)` passes `led` through, so Bait on the led card no
longer changes the led suit. `lowestOfLedSuit` (Howler Call) takes `led`.

**Conservation.** Burned cards stay in their trick. Eaten cards move to `camp.discards`. Heat
removes cards before the deal, into `removedCards`. `campCardIds` adds `discards`.

**Lost targets.** `trickContaining` matches `countsAs ?? card.identity` on unburned plays. A target
is lost when its printed card burned, counted as another identity or was discarded; a lost target
fails its objective at once. A card objective whose target was never played by the final trick
also fails, so a camp cannot stick `in_progress`. Failure stays absorbing.

**Objective floor.** The base `objectiveDeckFor` keeps standard cards ranked above the deck's
lowest rank: 3 and up at 3 or 4 players, 4 and up at 5 players (no 2s in that deck), 5 and up at
a magma pool. `createCamp` shuffles it on the existing stream. A `fixed` slot draws nothing.

**Outcome.** `checkCampOutcome(camp, rules)`: failed when an objective or a goal failed
(`{ failedObjectiveIds, failedGoalIds }`); succeeded when every objective and goal is done;
otherwise in progress. The engine already stops play at success (`campPhase` returns `ended`), so
a camp ends the moment every objective and goal is done. Rescue opens only on failed objectives
with no failed goal, as fired checks behave today.

### Thunderstorm: a fatal strike waits

A strike is an `add-modifier` effect, `lasts: "trick"` at the current trick, `deferIfFatal: true`.
The deferral is generic and lives in `stages/camp.ts`, so it is judged under the fully composed
rules (Snake, Crocodile, plates and every goal):

1. Apply the play. If it did not complete trick `t`, or no live `deferIfFatal` effect sits on `t`,
   keep the result.
2. If the outcome under `rulesFor(next)` is failed, recompute the same play with those effects
   moved to `t + 1` (dropped after the last trick).
3. Keep the recomputed result only if its outcome is not failed. Otherwise the strike landed.

The roll never fires while a strike already sits on the trick, and stops after two stored
strikes; a moved strike is the same effect, so it counts once. The roll happens at
`trick-started`, before the lead, so the table sees the strike while the trick is played.

### The temple

```ts
// content/mods/temple.ts
export const temple = defineMod({
  id: "temple", kind: "temple", name: "The Temple", weight: 0,
  text: "Lead each plate's suit in order, ending with the Sun.",
  full: {
    slots: (prev) => [...prev, { kind: "win-card", fixed: { kind: "joker", joker: "sun" } }],
    rules: (ctx) => ({ goals: (prev) => (camp) => [...prev(camp), platesGoal(camp, platePath(ctx, camp))] }),
    status: (ctx) => (ctx.camp === null ? [] : [{ kind: "path", plates: platePath(ctx, ctx.camp), pressed: pressedCount(ctx.camp, platePath(ctx, ctx.camp)) }]),
    grants: ability({
      window: ["between-tricks", "rescue"],
      limit: { kind: "crew-tokens", earned: (run) => (sunObjectiveDone(run) ? 1 : 0) },
      targets: [{ kind: "objective", whose: "open" }], // new `whose`: any owned pending or failed
      apply: (ctx) => [{ op: "remove-objective", objectiveId: ctx.targets[0].objective.id }],
    }),
  },
});
```

- **Plates.** `platePath` draws `floor(totalTricks / 2) - 1` suits with `roll("plate{i}", 4)`, then
  `"sun"`. A completed trick whose led identity matches the next plate presses it; another suit
  does nothing. The plates goal is a task: done when all are pressed, failed when fewer tricks
  remain than plates.
- **The Sun objective** is a win-card objective on the Sun, picked and required like any other.
- **The skip** is a crew token earned by winning the Sun. Any seat spends it between tricks or in
  rescue to drop one open objective. `ActiveAbility.window` widens to `ActiveWindow | readonly
  ActiveWindow[]`. While the token is unspent, rescue waits on every seat.
- **Helpers.** `campStack` appends the half bodies of `helpersFor(plan, at)`, `slots` included.

### Toolkit ops

```ts
export type Origin =
  | { readonly kind: "seat"; readonly seatId: SeatId; readonly sourceKey: SourceKey }
  | { readonly kind: "mod"; readonly modId: ModId; readonly strength: Strength };
export type ActiveEffect<P extends EffectParams = EffectParams> = {
  readonly origin: Origin; readonly atTrick: number; readonly lasts: "attempt" | "trick";
  readonly deferIfFatal: boolean; readonly params: P; readonly audience: "public" | "owner";
};
export function applyToolkitOps(run: RunAt<"camp">, origin: Origin, ops: readonly ToolkitOp[]): RunAt<"camp">;
// LogEntry.actorSeatId becomes string | null (null for a mod); sourceId carries the item, upgrade
// or mod id. Reveal.source is "whisper", a source id or a mod id.
```

| Op | Change |
|---|---|
| `add-modifier` | gains `deferIfFatal?: true` |
| `adjust-supplies` | bounds `[1, SUPPLIES_MAX]` |
| `adjust-coins` NEW | purse += delta; never below 0 |
| `break-item` NEW | `{ seatId, uid }`: removes an equipped instance |
| `discard-round` NEW | `{ cardIds }`: exactly one card from every hand to `discards`, `totalTricks - 1`; anything else throws |
| `cancel-boss-twist` | DELETED |

### Windows and abilities

`pre-deal` is deleted (Rain Poncho was its only user), so `AttemptState.camp` is never null.
Windows keep `objective-pick`, `between-tricks`, `in-trick` and `rescue`. `abilityStatus` reads
`window` as a list. Abilities are keyed by `SourceKey`; granted abilities come from `campStack`'s
`grants`, keyed by the mod id. Unit 12 adds stage windows (`loadout`, `draft`, `route`).

### RNG streams

Two different draws never share a name. A shop visit and its replay share names on purpose.

| Draw | Stream |
|---|---|
| Length vote tie | `expedition-vote:length` |
| Route vote tie | `expedition-vote:route:camp{k}` (k = the next camp) |
| Planned boss | `expedition-plan:{animal\|disaster}` |
| Route option count | `expedition-route:camp{k}:count` |
| Route option field | `expedition-route:camp{k}:reroll{r}:option{i}:{location\|fair\|weather\|event\|mix}` (r = 0 until Cartographer) |
| Draft item | `expedition-draft:camp{k}:seat{id}:offer{o}:bundle{b}:item{j}:{rarity\|pick}` |
| Shop item | `expedition-shop:camp{k}:item{i}:{rarity\|pick}` |
| Attempt deal | `{seed}:camp{k}:attempt{a}` (unchanged) |
| Trick-count kind and N | `expedition-trickcount-{kind\|n}:camp{k}:attempt{a}` (unchanged) |
| Mod rule roll | `expedition-mod:{id}:{strength}:camp{k}:attempt{a}:rule:{label}` |
| Mod reaction draw | `expedition-mod:{id}:{strength}:camp{k}:attempt{a}:on:{eventKey}:draw{j}` |
| Ability draws | unchanged |

`eventKey` is `dealt`, `pick{n}`, `t{i}-start`, `t{i}-p{position}`, `t{i}-done` or
`whisper{ordinal}`; the `rule:` and `on:` prefixes keep labels and event keys apart. Deleted:
`draftUpgrade`, `draftItems`, `boss(N)`, `faceDown`. `rng.test.ts`'s grid gains every builder.

### Actions and errors

```ts
export type RunAction =
  | { readonly type: "pick-character"; readonly characterId: string }       // muster
  | { readonly type: "vote"; readonly choice: string | null }              // muster, route; null abstains
  | { readonly type: "equip"; readonly itemUids: readonly string[] }       // loadout
  | { readonly type: "buy"; readonly stockId: string }                     // loadout before a boss camp
  | { readonly type: "pick-bundle"; readonly bundle: number }              // draft
  | { readonly type: "ready" }                                             // loadout, event
  | { readonly type: "use-ability"; readonly sourceKey: string; readonly targets: readonly string[] }
  | { readonly type: "skip-window" }
  | { readonly type: "whisper"; readonly targetSeatId: string; readonly cardId: string }
  | { readonly type: "pick-objective"; readonly objectiveId: string }
  | { readonly type: "play-card"; readonly cardId: string };
// RunError gains wrong_stage, not_a_choice, not_owned_item, too_many_items, sold_out,
// supplies_full, upgrade_owned, not_your_upgrade; loses draft_pending, no_draft_pending, not_offered.
```

`vote`, `equip` and `pick-bundle` converge when repeated. `ready` refuses `already_ready`, and so
does `equip` after `ready`. `autoPassRequest` returns `{ type: "vote", choice: null }` for a seat
with no ballot in muster or route, and `skip-window` in a gated window, as today.

### Views and schema

`ExpeditionView` becomes a header plus one stage view, mirrored field for field in
`packages/schema/src/games/expedition.ts` (strict objects) and bound by the `extends` assertions in
`apps/worker/src/game-registration.ts`.

```ts
export type ExpeditionView = {
  yourSeatId: string | null;
  runStatus: "in_progress" | "won" | "lost";
  length: RunLength | null; campCount: number | null;
  purse: number; supplies: { count: number; max: number };
  plan: { at: number; tier: BossTier; bossId: string | null }[];   // bossId null beyond the horizon
  seats: ExpeditionSeatView[];
  yourAbilities: ExpeditionAbilityView[];
  history: { camp: number; attempt: number; status: "cleared" | "failed"; coins: number }[];
  lastVote: { topic: "length" | "route"; tally: { choice: string; votes: number }[]; tied: string[] | null; winner: string } | null;
  stage: ExpeditionStageView;
};
export type CampPreviewView = { index: number; location: string; weather: string; pairing: string | null; event: string | null; slotKinds: string[]; bossId: string | null; shop: boolean };
export type ModView = { id: string; kind: ModKind; strength: "full" | "half"; status: StatusPartView[] };
export type ExpeditionStageView =
  | { tag: "muster"; ballots: { seatId: string; choice: string | null }[] }
  | { tag: "loadout"; camp: CampPreviewView; mods: ModView[]; yourSlots: number; shop: ShopView | null; readySeatIds: string[] }
  | { tag: "camp"; camp: CampPreviewView; mods: ModView[]; attempt: ExpeditionAttemptView }
  | { tag: "draft"; cleared: number; payout: number; yourOffer: { bundles: string[][] } | null; pendingSeatIds: string[] }
  | { tag: "route"; options: { id: string; next: CampPreviewView }[]; ballots: { seatId: string; choice: string | null }[] }
  | { tag: "event"; event: string; next: CampPreviewView; readySeatIds: string[] }
  | { tag: "ended"; result: "won" | "lost" };
// ShopView: stock entries plus yourUpgrades { stockId, upgradeId, price }[]. ItemView: { uid, itemId, remaining }.
export type ExpeditionSeatView = {
  seatId: string; characterId: string | null; upgradeId: string | null;
  /** concealed under Heavy fog: equipped lists only items used this attempt; backpack is null. */
  items: { equipped: ItemView[]; backpack: ItemView[] | null; concealed: boolean };
  usage: { sourceKey: string; remaining: ExpeditionRemainingView }[];
};
```

Camp-level changes: a current-trick play is `{ seatId; hidden: false; card; effectiveRank }` or
`{ seatId; hidden: true; suit: Suit | "joker" }` (the effective follow key, no rank, no id).
Completed plays gain `countsAs` and `burned`; `yourHand` cards gain `countsAs`. Objectives gain
`{ id; kind: "hidden"; ownerSeatId; status }`, and a win-card target may be a joker. The camp view
gains `goals` and `discards` and loses `objectiveAssignment`. The attempt view loses
`bossCancelled`, `window` loses `pre-deal`, `rescue` gains `failedGoalIds`, and effect views carry
`origin`. Removed: `runPhase`, `campNumber`, `bossTwists`, `activeBossTwistId`, `yourDraftOffer`,
`seats[].kit`, `seats[].draftPending`, `seats[].ready`.

`ROOM_SCHEMA_VERSION` goes 6 to 7 in unit 1 and up by one in each later unit that changes the
persisted `RunState`.

### Leak check additions

Every secret is derived independently through `rulesFor` and `campStack`, never through `view.ts`.

| Secret | Derivation | Rule |
|---|---|---|
| Concealed plays | `rules.hides` over `currentTrick.plays` | card id in `hiddenIds`; identity not counted |
| Hidden objective | `rules.hides` per objective | target identity not counted; the id stays visible |
| Fogged loadouts | `rules.hides` per seat | unused equipped and backpack uids in `hiddenIds`; `items.backpack` null |
| Other seats' offers | `SeatRun.offers` | `ownDraft` replaces `ownDraftOffer`; another seat's bundles are a leak |
| Unrevealed bosses | `plan.bosses` with `at > horizon(run)` | the boss id is a hidden string leaf |
| Discards and burns | public | counted for everyone |

`FORBIDDEN_VIEW_KEYS` gains `offers`, `itemSerial` and `bosses` (the view's `plan` is the filtered
array) and loses `readySeatIds`. A `StatusPart` cannot carry a card by type, and a status reads
only the current trick; the contract test perturbs a later trick's roll and asserts the status is
unchanged. Each new secret gets a canary: a view that shows it must be flagged.

## Synthesis decision

**Base: candidate A** for the camp model: one `ModDef` with explicit `full` and `half` bodies; one
`campStack` order read by compose, view, preview and leak check; the `PAIRINGS` table; one `hides`
hook read by view and leak check; item instances with uses; derived rules over the trick log for
every mechanic that is a question; `goals` replacing `failureChecks`; `burned` and `countsAs` on
`ResolvedPlay`; `discards`; the temple as slots, a goal and a granted ability.

**Grafted from B.** Typed `CampEvent`s from `applyCampAction` plus `camp-dealt` and
`whisper-sent`, feeding a one-pass, non-cascading reaction channel that emits toolkit ops. It
replaces A's untyped `atBoundary` trigger ("the deal is boundary 0"). The stored stage union with
a `STAGES` registry replaces A's journal and its eight-branch `runPhase` fold, whose event step
depended on the absence of a result since the last arrival: hard to trace and to set from the dev
panel. Also `trickWinner(plays, led)`, deleting the pre-deal window, the `Origin` union and
private offers per seat.

**Rejected from A.** The derive-everything journal (reader load). `stormAt`, which inferred a strike
from "the winner is the lowest seat" and miscounts a lowest card that would have won anyway. "The
first surviving card sets the led suit" (overruled by the lead). Clifftop fair weather at 40%.

**Rejected from B.** Per-kind registries and helpers (five catalogues for compose, view and leak
check to learn). `playConcealed` plus `itemsVisible` (one `hides`). Stored `veils`, `firedChecks`
and `spoiledObjectiveIds` (derived instead). Crocodile and Tiger as reactions (they are questions).
A `plate-path` crew objective kind that changed `campPhase` (a goal instead). The `skip-objective`
action (a granted ability reuses the ability UI and rescue gating). `Span` effects: B's Snake layer
vanished after its span and flipped a failed objective back to done; the bite is an attempt-long
effect with a trick range in its params. Votes that wait forever on a disconnected seat.

**Defects in both.** Reworking Rain Poncho into "nothing can stop your whispers" collides with
Mosquito Net; Poncho becomes a whisper item and Mosquito Net the Rain counter. Neither judged the
Thunderstorm fatal check under composed rules; the generic `deferIfFatal` retry does.

**Deviations from the lead's direction.**

- The shop is a panel of the loadout before a boss camp, not its own stage. Equipping follows
  buying, and a separate stage would put three ready screens in a row before a boss. The players
  still see event, then shop, then camp.
- The shop reopens on a boss-camp replay with the same stock. Undecided by the lead; buying a
  supply before a retry is the natural want.
- `camp-dealt` and `card-played` are reported though no map mod reacts to them. The lead asked,
  the Core computes them for free, and unit 12 is their first reader.

## Tradeoffs accepted

- We accept two authoring channels per mod in exchange for each mechanic reading as what it is.
  The channel table is the rule.
- We accept that reactions never react (a Tornado move does not trigger Locusts) in exchange for no
  cascade and one conservation check per reactor.
- We accept a stored stage and plain counters in exchange for per-stage data that cannot exist in
  the wrong stage and a dev panel that can set them.
- We accept duplicate item instances in exchange for drafts and stock that never depend on what a
  seat owns.
- We accept hand-written half bodies in exchange for half strength the owner can read and tune,
  where a multiplier ("fire half as often") means nothing for Rats or Capybara.
- We accept a shared purse spent first come, first served, in exchange for no approval flow.
- We accept that rescue waits on every seat while a temple token is unspent.
- We accept recomputing a struck final play once in exchange for judging "would lose the camp"
  under every composed rule.
- We accept tricks with no follower after a burned lead; the highest kept card then wins.

## Alternatives considered

- **A journal with every counter folded (A's run).** No total can drift, but every reader learns
  the fold order and the dev panel must forge entries: a wide derivation surface hiding little.
- **Hooks only, the house style.** Stored hands give Tornado, Earthquake and Locusts no derived form.
- **An event bus with cascades.** Every pair of reactors becomes an ordering question. No mechanic
  reacts to a reaction.
- **Events by diffing camps in the run layer.** The run layer would re-derive every Core rule
  (burns, the final trick, pick to play). The Core already knows.

## Open questions and risks

- Must every temple plate be pressed? The spec fails the camp otherwise (lead decision, unconfirmed).
- Is Monsoon in the disaster pool? It lands in unit 9 with the river at `ceil(total * 3 / 4)`,
  shared with Flooding.
- Should a disconnected seat be auto-readied in loadout and event, and auto-picked in the draft?
  Only votes are auto-passed; the others wait, as fireside `ready` does today.
- Half bodies, prices, rarities, `rareChance`, the river and the slot mixes are placeholders.
- Risk: `hides` makes three view paths conditional. Unit 7's canaries prove the leak check covers
  them.
- Risk: unit 3 is the widest (stage machine, view header, web screens); units 1 and 2 go first.
- Risk: `discard-round` shrinks `totalTricks`; exactly-n, plates and the river recompute against it.
- Risk: each `RunState` change breaks the concurrent dev sandbox; each unit's done list names it.

### Lead decisions (2026-10-04)

- Camp 1 is Jungle with fair weather. Bosses are drawn at the length vote and revealed in the route
  preview that leads to their camp.
- Concealed plays (Cave, Night) show their suit; rank and id stay hidden until the trick completes.
- A burned lead keeps the led suit. If nothing kept follows, the highest kept card wins.
- Thunderstorm: 20% before the first trick, +10% per trick, at most 2 strikes; a strike that would
  lose the camp waits one trick, judged under the composed rules.
- Locusts eat items round-robin; with none left, one random card from every hand (a trick is lost).
- The Sun's skip is a crew token any seat spends between tricks or in rescue to drop an open objective.
- Using an item reveals it, even under Heavy fog.
- A disconnected seat's vote is cast as an abstention after the existing auto-pass grace.
- Every plate must be pressed before the camp ends, or the camp fails. Flagged for the owner.
- Half-strength bodies are placeholders for owner review.
- Ramp: Short 2, 3, 4, temple 4; Standard 2, 3, 3 + animal, 4, 4, temple 5; Long 2, 3, 3 + animal,
  4, 4, 4 + disaster, 5, temple 5 (temples count the Sun). Mixes add ordered pairs and trick-count
  slots from camp 4.
- Weather: 80% fair, Clifftop 50%. J.D.'s hidden luck later adds 5 points.
- Shop stub: supplies at 6 (cap 4), 3 placeholder items, own character's upgrades at 8. No selling,
  no blacksmith.
- Characters land last, in their own units; until then the six current characters keep working
  with one upgrade per player bought at the shop.
- The 13 items take the new kinds with placeholder price and rarity; Rain Poncho's cancel is deleted.

## Next implementation step

Unit 1: delete `boss/`, `bossTwists`, `bossCancelled`, `cancel-boss-twist`, `objectiveAssignment`
with face-down assignment, and the pre-deal window, and get typecheck, Vitest and the expedition
e2e green with plain boss camps.

---

## Catalogue

Mod text is one sentence per def, written in the unit that registers it from the channel table's
"Full" column. Mod ids match the staged art: `clearing`, `jungle`, `clifftop`, `desert`, `cave`,
`magma`, `fair`, `rain`, `fog`, `thunderstorm`, `night`, `steam`, `flooding`, `tiger`, `rats`,
`snake`, `crocodile`, `capybara`, `beaver`, `tornado`, `earthquake`, `wildfire`, `meteor`,
`blood-moon`, `locusts`, `monsoon`, `temple`. Location and non-fair weather weights start at 1.

| Item | Uses | Rarity | Price | Change |
|---|---|---|---|---|
| Trained Monkey, Pack Mule, Parrot | per-camp | common | 3 | |
| Trail Map | single-use | rare | 5 | was once per run |
| Rain Poncho | charges 2 | common | 3 | now "Whisper once more this camp."; the boss cancel is deleted |
| Smoke Signal | charges 2 | rare | 5 | the supplies cost is dropped |
| Whetstone, Puffball, Bait | single-use | common | 2 | Bait keeps the led suit fixed |
| Camouflage | single-use | rare | 4 | its failure check becomes a guard goal |
| Rope Ladder | single-use | common | 3 | |
| Heavy Pack | passive | common | 3 | |
| Mosquito Net | passive | rare | 4 | now "Rain can't stop your whispers." (the same layer) |

Events: one stub, `{ id: "event", name: "Event", text: "Nothing happens here yet." }`. Character
events arrive later as blank templates with the same shape.

## Delete list

- `boss/` entirely (four twists, `BOSS_REGISTRY`, `BossId`, the old `BossDef`,
  `boss.contract.test.ts`, `radio-eclipse.test.ts`, `fog-mutiny.test.ts`) and README "Add a boss twist".
- `RunState.campNumber`, `bossTwists`, `readySeatIds`, top-level `attempt`; `CampNumber`,
  `BossCampNumber`, `BOSS_CAMPS`, `FINAL_CAMP`, the 1..6 `BALANCE_TABLE`, `DRAFT_OFFER_SIZE`,
  `STARTING_SUPPLIES`.
- `runPhase`, `RunPhase`, the `fireside` name, `activeBossId`, `drawBossTwist`, `run-actions.ts`.
- `AttemptState.bossCancelled`, `cancel-boss-twist`, the pre-deal window, `AttemptState.camp:
  null` and the gated deal hold in `advanceRun`.
- `objectiveAssignment`, `assignFaceDown`, `STREAMS.faceDown`, and the face-down branches in
  `visibility.ts`, `trail-map.ts`, the view and the leak check.
- `SeatRun.kit`, `SeatRun.draftOffer`, the draft upgrade slot, `pick-draft`, `STREAMS.draftUpgrade`,
  `STREAMS.draftItems`.
- `failureChecks`, `firedFailureCheckIds`, `ActiveEffect.sourceId` and `seatId`, and the
  malformed-trick throw in `trickWinner`.
- In unit 13: the six characters, `PoolDef`, the `pool` limit, `regained`, their art and icons.
- View keys listed under Views and schema.

## Implementation units (in order; each ends green)

Every unit ends with `npm run typecheck`, `npm test` and every e2e spec it touches green, and is
one commit or a short series. A unit that changes `RunState` or `ExpeditionView` changes
`view-types.ts`, the schema, the worker's `extends` assertions and enough web code to compile in
the same unit, so main never holds a view the client cannot parse.

**Dev sandbox, in every unit's definition of done.** The dev-mode sandbox (`dev/` in the rules
package, the worker dev hook, the web panel) is being built concurrently. Every unit that changes
`RunState` updates `dev/shortcuts.ts`, `dev/check.ts`, `dev/inspect.ts`, `dev/autoplay.ts` and the
`milestone` in `dev/hooks.ts` in the same commit, plus any shortcut id named in
`apps/worker/src/dev-room.test.ts` or `packages/schema/src/messages.test.ts`. Surviving ids keep
their names (`jump-to-camp`, `end-run`, `force-camp`, `set-supplies`, `set-character`,
`move-card`, `set-objective-owner`). The checker accepts every reachable state; `dev/*.test.ts`
stays green.

**1. Subtract.** Delete the four bosses, `bossTwists`, `bossCancelled`, `cancel-boss-twist`,
`objectiveAssignment` with face-down assignment, and the pre-deal window (`startAttempt` deals at
once). Rain Poncho becomes "Whisper once more this camp" (per-run, 2). Boss camps play plain.
`ROOM_SCHEMA_VERSION` 7. Check: the run property ends every run; `view.test.ts` and the leak
property pass without the removed keys. Web: drop the boss banner and twist names, face-down
objectives, the pre-deal banner and the PD badge. e2e: `expedition-driver.ts` stops waiting on
pre-deal; `expedition-abilities.spec.ts`. Dev: delete `set-boss`; drop boss lines in `check.ts`
and `inspect.ts`.

**2. Core seams.** `identityOf`, `objectiveDeckFor` with the floor, `burns`, `ResolvedPlay`,
`trickWinner(plays, led)` with the highest-kept fallback, `objectiveStatus`, `goals` replacing
`failureChecks` (Camouflage becomes a guard), `discards`, the lost-target and never-played rules,
`CardIdentity` targets with `fixed` slots, `CampEvent`s from `applyCampAction`;
`winnerExcluding` and `lowestOfLedSuit` take `led`. Check: `trick.test.ts` gains "a burned card
cannot win", "a counted-as identity follows its new suit", "a burned lead keeps the led suit",
"with no follower kept the highest kept card wins"; `trick.property.test.ts` gains "ties go to the
earliest play under arbitrary rankOf and identityOf layers"; `objectives.property.test.ts`
restates monotonicity over lost and never-played targets; the camp property never sticks
`in_progress`; an events test pins a full camp's event sequence. Web: completed plays render
`burned` dimmed and `countsAs` as a corner pip; goals replace fired-check text. Dev: `check.ts`
counts `discards`; `inspect.ts` shows burned and counts-as.

**3. Staged run, length vote, routes and events.** `Stage`, `STAGES`, `RunAt`, the table
dispatcher, muster with the length vote and `tally`, `RunPlan` (pools empty, so boss camps play
plain), `CampIndex`, `RUN_LENGTHS`, `OBJECTIVE_RAMP` and mixes, supplies 3 of 4, purse and payout,
replay of the same spec, `ended`, `lastVote`, the route stage (`firstCampSpec`; `routeOptions`
with only Jungle and fair, so options differ by event and mix), `EVENTS` and the event stage, the
loadout stage with `ready` only. The draft stage keeps today's single-pick kit offer for this one
unit. `autoPassRequest` abstains votes; `checkGameEnd` reports the spec index. Check:
`lifecycle.test.ts` covers "a failure replays the same spec with a fresh deal", "supplies at 0 end
the run", "a clear pays 5 + min(3, unplayed)", "a tie resolves by the seeded flip", "an
abstention does not block"; the run property runs all three lengths; `vote.test.ts`; the RNG grid.
Web: muster gains the length vote (three cards, ballots, the flip from `lastVote`); the fireside
scene becomes the trail scene hosting the draft, route vote (option cards with location, weather,
objective types, boss), event and loadout panels; the HUD shows purse, supplies of 4 and camp k of
N; run-end reads `stage.ended`. e2e: `expedition-driver.ts` and `expedition-scenarios.ts` learn
vote, route, event and loadout; `expedition-create.spec.ts`, `expedition-camp.spec.ts`,
`expedition-tour.spec.ts`. Dev: `jump-to-camp` takes a length and an index and builds the loadout
or camp stage; new `set-purse`; `force-camp` and `end-run` go through `settleCamp`; `autoplay.ts`
votes and readies per stage; `milestone` reads the tag and spec index.

**4. Items, loadout, bundles, shop and upgrades.** `ItemDef` uses, rarity and price; instances,
`itemSerial`, `equipped`, `backpackOf`; `itemSlots`; `equip`; bundle drafts with no upgrade;
`SeatRun.offers` (kit and `draftOffer` deleted); the shop in the loadout before boss camps;
`upgradeId` with +1 whisper; `SourceKey`; `adjust-coins`; the 13 items remapped; the six
characters' upgrades sold at the shop. Check: `sources.contract.test.ts` gains per item "uses
exhaust as declared", "a per-camp item resets on replay", "a spent instance leaves its owner";
`shop.test.ts` covers price, `sold_out`, `supplies_full`, `upgrade_owned`, `not_your_upgrade` and
the replay visit; `draft.test.ts` covers bundles and rarity. Web: the loadout screen (backpack
grid, two slots, tap or drag to equip, charge badges), bundle draft cards, the shop panel. e2e:
the driver equips and buys; `expedition-abilities.spec.ts` uses source keys. Dev: `set-kit` and
`give-source` become `give-item` and `set-upgrade`; `check.ts` validates instances, slots and
offers.

**5. Camp modifier engine and routes.** `ModDef`, `MODS`, `campStack`, the composition order,
`PAIRINGS`, weather draws, `slotKindsFor`, `ModView`, `react` with `camp-dealt` and
`whisper-sent` wired, `Origin`, `applyToolkitOps(run, origin, ops)`, `deferIfFatal` and the
deferral, `break-item`, `discard-round`. Registers clearing, jungle, clifftop, fair, rain and
thunderstorm; Mosquito Net becomes the Rain counter. Check: `mods.contract.test.ts` iterates the
registry (shape, kind rules, `half` on bosses, `rules` keys in `HOOK_NAMES`, `on` keys in
`EngineEventType`, a driven camp at 3, 4 and 5 players with the def forced into the stack:
conservation, JSON round-trip, determinism, the leak check every step, status stable under a later
roll); `route.property.test.ts` (no "never" pair over 500 seeds); "a fatal strike waits a trick",
"at most two strikes", "a strike that is not the cause lands". Web: route cards show location,
weather and pairing; backdrops by labelled fallback; the weather overlay slot (rain, the storm
chance badge, a lightning flash on a strike); the mods status strip. e2e: a forced Thunderstorm
scenario in `expedition-camp.spec.ts`. Dev: new `set-spec` (location, weather), re-dealing a
camp; `inspect.ts` lists the stack and statuses.

**6. Map art.** Integrates the staged art in `/home/rflor/.claude/jobs/5e5ee5f4/tmp/bossart/`:
13 boss sprites to `apps/web/public/expedition/sprites/bosses/<id>.png`, six backdrops to
`sprites/locations/bg-<id>.png` (Jungle keeps `camp/bg-jungle-night.png`). Register them in
`art-registry.ts`, regenerate `art-files.generated.ts`, and record each id, job, size, seed and
prompt from `prompts.json` and `MANIFEST.md` in `apps/web/art/expedition/make-prompts.mjs`. Check:
`mod-art.test.ts` asserts every `MODS` id of kind animal, disaster or location has an art id
naming a file in `ART_FILES`. Web: the loadout and camp scenes draw the backdrop; the boss sprite
slot is ready for unit 8. Dev: none.

**7. Concealment and the remaining locations and weather.** `hides`, `Concealable`; desert, cave,
magma, night, fog; steam, flooding and the "never" rules; the view's hidden variants and fogged
seats; the leak-check additions. Check: the contract test covers the new defs with no edits;
canaries prove each new secret is checked; "using an item reveals it under fog"; "a magma camp's
objectives start at 5". Web: face-down trick cards with a suit pip, a hidden objective card, fog
over other seats' slots, the magma removed-cards note, the flood meter. e2e: a Cave scenario.
Dev: `set-spec` gains the new ids; `inspect.ts` marks hidden things.

**8. Animal bosses.** Tiger, Rats, Snake, Crocodile, Capybara and Beaver with halves; `drawPlan`
draws the animal pool; `horizon` gates the reveal. Check: the contract test covers all six and
their halves with no edits; one behaviour test per boss; "a boss id is hidden until the route
preview leads to it". Web: the boss entity on the table (sprite plus gaze arrow, dam chip, streak
badge, bite marker); the route card's boss portrait. e2e: one animal camp. Dev: new
`set-plan-boss`.

**9. Disaster bosses.** Tornado, Earthquake, Wildfire, Meteor, Blood Moon, Locusts and Monsoon
with halves. Check: as unit 8, plus "Meteor never deals an ace objective", "Locusts with no items
shorten the camp by one trick", "Tornado keeps hand sizes", "Earthquake keeps each seat's open
count". Web: burned and vaporized animations, the tornado card flight with the sent-card reveal,
the earthquake shuffle, the river meter, the blood-moon tint and swapped pips in hand, the locust
toast. e2e: the tour reaches camp 6 of a Long run. Dev: `set-plan-boss` covers disasters.

**10. Temple.** The temple def, plates, the Sun slot, `crew-tokens`, list windows, helpers at
half. Check: "Short has no helpers, Standard one, Long two", "plates press only on the next suit",
"an unpressed plate fails the camp", "the skip unlocks only after the Sun is won", "a spent token
ends rescue's wait", a full Long run in the property suite. Web: the plate path along the table
edge, the Sun objective card, the skip in the ability bar, half-size helper sprites. e2e: the tour
reaches the temple. Dev: `jump-to-camp` to the final camp lands in the temple.

**11. Run polish and docs.** README recipes (a camp modifier, an item, an event, the channel rule),
the rules modal pages for locations, weather and bosses (`rules-reference.ts`), route and run-end
copy, and a balance pass over the placeholders with the owner. Check: `rules-reference.test.ts`,
`catalog-display.test.ts`, `expedition-rules.spec.ts`.

**12. Character seams.** Engine pieces the nine need, each with a base equal to today, so the six
stay green: stage windows (`loadout`, `draft`, `route`); RunHooks `normalWeatherChance` (J.D.'s
hidden luck, never projected), `routeOptionCount`, `draftShape`, `shopPrice`, `affectsSeat(run,
seatId, origin)`; Core `voidsTrick` (a hallucination returns every card to its hand); ops
`grant-item`, `give-item`, `swap-slots`, `reroll-route` (bumps `r`), `add-objective`; a `coins`
usage limit; `RouteOption.swapBoss` (Cartographer's third route rewrites `plan` at the next boss
camp); `on` on `SourceBase` if needed. Check: each seam has a test with a test-only source. Web:
compile only. Dev: shortcuts for any new field.

**13. The nine characters.** Replace the six with the nine and their upgrades; delete pools,
`regained` and the six characters' files and art. One commit per character group. Check:
`sources.contract.test.ts` over the new registry; one behaviour test per power. Web: crew sprites
and icons (`CREW_IDS`, `SOURCE_ICON_IDS`), muster silhouettes, the Pop-up Shop panel, the
Magician's fanned-hand picker, the route reroll button. e2e: `expedition-abilities.spec.ts` per
group. Dev: `set-character` follows the registry; `check.ts` drops pool checks.

| Character | Fits on |
|---|---|
| J.D. | `grant-item` at muster; `normalWeatherChance` + 5; Blend In `affectsSeat`; Free Spirit an `objectiveStatus` effect; Rule Breaker a `legalPlays` effect |
| Businessman | settle-time coins by empty slots; a draft-window skip for 4 coins; selling in the loadout; Pop-up Shop a private stock with a `coins` limit; Buyout in rescue; Haggle `shopPrice` |
| Magician | `swap-cards` with a fanned-hand target kind; Double Act `whispersPerCamp`; Misdirection two other seats; Switcheroo `swap-objectives` |
| Perfumist | a `voidsTrick` effect; Turncoat an `identityOf` effect on the led card; Upside Down a `trickWinner` effect; Smelling Salts in rescue |
| Cartographer | `routeOptionCount` 3, `swapBoss`, `reroll-route` for supplies; Redraw `replace-objective`; Survey a private preview; Treasure Map queues two special offers and `adjust-coins` |
| Explorer | a `rankOf` effect; True Form an `identityOf` effect; Reshape shifts an objective target |
| Leader | `whispersPerCamp` 2; Open Ears `whisperAudience`; Delegate; Momentum reads won tricks |
| Hermit | `remove-objective` plus a `goals` guard (wins no tricks); Burden `add-objective`; First Pick an objective-pick window; Alms `whispersPerCamp` |
| Pack Rat | `draftShape` with `exclusiveTo` items; `itemSlots` 3; Quartermaster `give-item`; Pack Animal `swap-slots`; Sturdy Straps a first-use exemption |

## Implementation notes

### Implementation notes (unit 1)

- `AttemptState.camp` and `Stamp.trick` are no longer nullable: with the pre-deal window gone an
  attempt is always dealt. The attempt view's `camp` is non-null to match.
- `startAttempt` deals and returns; it no longer settles. `ready` settles through the dispatcher's
  usual pass, so a camp decided at the deal (a forced failure check) still settles in that call.
  `advanceRun` and `dealAttempt` are deleted.
- Rain Poncho fires `between-tricks` (the spec names no window) with `per-run` 2 until unit 4
  gives it `charges 2`.
- Mosquito Net reads "Nothing can stop your whispers." until unit 5 makes it the Rain counter,
  since the boss twists it named are gone. It is tested against a test-only whisper blocker.
- `secretsForExpeditionSeat` keeps its `catalog` parameter, unread for now, so twenty callers do
  not change twice before unit 7's `hides` needs it.
- Web: no "PD" badge existed, so there was none to drop. The gated-window button ids were
  `predeal-use:<id>` and `predeal-skip`; they are now `gate-use:<id>` and `gate-skip`, and the
  banner model loses `window` (only rescue is gated). The top bar's twist readout, the rain and
  dark-sky boss effects and the rules modal's "This camp" section are deleted; units 5 and 11
  bring weather overlays and camp pages back. Boss-camp markers and the "Boss camp" label stay,
  since camps 3 and 6 are still boss camps by position until unit 3.

### Implementation notes (unit 2)

- Trick completion lives in `trick.ts`'s `resolveTrick(plays, rules)`, which `applyPlayCard`
  calls, so `trick.test.ts` tests burns and counted-as identities directly. The card reading is
  one value, `CardReading { identityOf, isTrump, rankOf }`, built by `cardReading(parts)`; its
  default `rankOf` reads the strength of what the card counts as. `baseRulesWith(reading)` and
  `compose.ts` both build from it. `ledIdentity` is deleted: the led identity is always
  `identityOf(plays[0].card)`.
- `applyToolkitOps` takes the composed rules as a trailing parameter, because `swap-objectives`
  and `replace-objective` must read `rules.objectiveStatus`. Unit 5's `(run, origin, ops)`
  signature should keep a rules argument for the same reason.
- `lowestOfLedSuit` falls back to the lowest kept card when no kept card follows the led identity;
  a burned lead made its old `reduce` over an empty list throw.
- The rescue view does not gain `failedGoalIds`: rescue opens only while no goal has failed, so
  the list would always be empty. Unit 10 can add it if the temple's token changes that.
- Goal ids are `<rule id>:<seat id>` (Camouflage: `camouflage:<seatId>`). The camp-over prompt
  names a broken goal by its rule's display name ("Camp failed: Camouflage broke"); before this
  unit a fired failure check showed "Camp cleared!".
- `applyCampAction` emits `trick-started` after the last pick even if that pick decided the camp;
  `react` skips decided camps, so the run layer needs no extra check. The run layer ignores events
  until unit 5.
- The objective floor changes which objectives a seed deals (3 and up at 3 or 4 players, 4 and up
  at 5), so seeded fixtures that named objective targets moved.
- Web: a burned card in the last-trick fan is dimmed; a counted-as card wears a pip under it with
  the counted suit (or S/M for a joker) in that suit's colour. A rank change is not drawn; unit 13
  (True Form) may need the full label. The pip sits inside the card's fan column, so neighbours
  never overlap.

### Implementation notes (unit 3)

- `StageDef` is `{ on, advance }`: `on` maps each accepted action type to its handler, so the
  accepted list and the dispatch cannot drift. Any other type is refused `wrong_stage` before a
  handler runs, as the spec's `accepts` intended. `applyRunAction` lives in `run/stages/registry.ts`
  and `run/run-actions.ts` is deleted.
- Pieces the spec places in later units are left out rather than stubbed: `itemSerial`, the
  loadout's `stock`, `CampPreviewView.pairing` and `.shop`, and `horizon` (every planned boss is
  `modId: null`, so nothing can leak yet; unit 8 adds the gate). `drawPlan(length)` takes no seed
  or catalogue, and the temple tier is also `null` until unit 10 registers the temple; the web
  names boss camps from the plan's tier ("Animal boss", "Disaster boss", "The Temple").
  `slotKindsFor(spec)` reads the spec alone until unit 5 adds stack layers. `RouteField` is
  `event | mix` until unit 5 draws locations and weather.
- The draft keeps today's single-pick offer: `SeatRun.draftOffer`, `pick-draft { sourceId }`, and
  the draft stage view's `yourOffer: string[] | null`. `no_draft_pending` and `not_offered` stay
  until unit 4; `draft_pending` and `character_pending` are gone (muster has no `ready`).
- `run/route.ts` adds `campSpecAt(seed, length, k)`: camp k's spec as route "a" would give it.
  The dev jump and `setupRun` use it so a mid-run fixture has a real spec and mix.
- `run/attempt.ts` (`attemptOf`, `withAttempt`) is the one read and write path for the attempt on
  the camp stage; usage, windows, abilities, whisper, toolkit, compose and the view go through it.
- The dev `milestone` is `${history.length}:${runStatus}`, not the stage tag and index. The panel's
  "End of camp" autoplay stop compares milestones, and a tag-based string would stop it at every
  vote and ready; this one changes only when a camp settles or the run ends. Bots abstain from
  votes so the human's ballot decides; an everyone-scope autoplay therefore resolves votes by the
  flip. `force-camp` takes `cleared | failed` and, from muster, a draft, a route or an event,
  deals the camp the run is heading to. `jump-to-camp` lists the run's own length first because
  the panel preselects a choice field's first option.
- `checkGameEnd`'s `campReached` is the last settled camp's index. The view's history drops
  `suppliesSpent` as specified, so the failed-camp prompt names no supply count.
- The schema mirrors `CampIndex` with a zod transform to the brand, so the worker's
  `[ExpeditionRunStateWire] extends [RunState]` assertion holds. `ROOM_SCHEMA_VERSION` is 9.
- Web: the fireside scene is the trail scene (`SceneKey` "trail", `TRAIL_ZONES`, `ROUTE_ZONES`).
  The muster drops its Ready button for a length ballot row (three cards with a mini trail of
  boss and temple markers, voters named on each); the route vote takes the full panel width.
  The vote that just resolved is shown on the event (route) and on camp 1's first loadout
  (length) with a tally of pips; a tie spins a coin through the tied choices (faces are the
  route letter, or the camp count since Short and Standard share an initial) and lands on the
  winner. The flip's start is kept in scene time per vote, so a redraw mid-flip continues it.
  The top bar shows supplies of their cap, the purse as a coin, and the camp with its boss.
  Before camp 4 the route cards are identical (one location, one weather, one event), as the
  spec expected.

### Implementation notes (unit 4)

- A newly minted instance (from `pick-bundle`, `buy` or the dev `give-item`) is equipped while
  the seat has a free slot, else it goes to the backpack (`run/items.ts`'s `mintItems`). The spec
  minted into the backpack; a new player who drafts a bundle and presses Set out without opening
  the backpack would then walk into camp empty-handed. "A free slot" reads the composed
  `itemSlots`, so a passive that raises or lowers the slots counts.
- Effects (`ActiveEffect.sourceId`), log entries and reveals keep the def id (an item's `itemId`),
  not the source key: a spent instance is gone by the time compose needs its `effect`. Unit 5's
  `Origin` must carry the def id beside the source key for the same reason.
- `openLoadout` draws the stock on every visit to a boss camp's loadout, from the same stream
  names, so a failed boss camp's replay offers the same stock again, unsold. An item bought on
  the first visit stays with its buyer and is for sale again.
- `liveSourceKeys(seat)` takes the seat alone; unit 5 adds the run and catalogue when granted
  mod abilities join the keys.
- `ExpeditionItemView.remaining` is `null` for a passive item. The seat view keeps `pool` until
  unit 13 deletes pools.
- The shop draws its items with the draft's rarity-then-pick rule over a pool with no character,
  so an item with `exclusiveTo` is never stocked. A draft or shop pool that runs out gives a
  shorter bundle or stock; an empty bundle is a legal pick that mints nothing (reachable only with
  a test catalogue).
- `buy` refuses in this order: `not_a_choice` (no shop, unknown stock id), `already_ready`, the
  entry's own refusal (`supplies_full`, `sold_out`, `upgrade_owned`, `not_your_upgrade`), then
  `cannot_afford`, so "sold out" wins over "can't afford".
- `ITEM_SLOTS = 2` lives in `balance.ts`; the base `itemSlots` reads it. The base
  `whispersPerCamp` gives an upgrade owner its extra whisper, so every count that included an
  upgrade owner went up by one.
- The leak check's `ownDraft` is the viewer's head offer; `foreignOffers` holds every other seat's
  offers (queued ones too) as JSON, and any array in a view equal to one is
  `structural:foreign-offer`. `FORBIDDEN_VIEW_KEYS` gains `offers` and `itemSerial` and loses
  `draftOffer`; `bosses` and `readySeatIds` are left to the units that change them.
- `dev/check.ts` checks the slots only when the crew's ids are all known, since composing rules
  over an unknown id throws. The two whole-run properties in `run.property.test.ts` have a 30 s
  timeout: with shop and equip moves in the random walk they passed the 5 s default under the full
  suite's load.
- Web: the draft panel draws each bundle as one card (`bundle:<n>`, its items' names, texts and
  uses badges) with "Take it"; after the pick it names the newest instance. Camp chips, the kit
  rows and the gated-window buttons are keyed by source key (`source:<key>`, `kit:<key>`,
  `seat-source:<seat>:<key>`, `gate-use:<key>`) and resolve the def id for art and text. There
  is no equip or shop UI yet (part B); the loadout's kit lists the equipped items.
- e2e: the rewritten-view scenarios give the item under test the uid `it90`
  (`scenarioKey`); `DRAFT_PREFERENCE` lost its upgrades, since upgrades are never drafted.
- Web (part B): the loadout keeps the trail map. Its panel is a compact camp preview (no event
  row) beside one side card: the length vote on camp 1's first loadout, the shop before a boss
  camp, or else "Your explorer" (the character's power and the upgrade, with their rules). The
  backpack zone holds your slots (`slot:<n>`) and a 3 by 2 backpack grid (`pack:<uid>`), paged
  by `pack-page:prev` and `pack-page:next`. `gearLayout` in `layout.ts` places both and is also
  the drop hit test. A tap unequips, or fills the next free slot; while the slots are full a tap
  does nothing and the header says to drag. A drop on a full slot swaps, and slot onto slot
  swaps the two. Every change is one `equip` built by `equipAfter`
  (`lib/expedition/loadout-model.ts`); nothing is applied before the server answers. Once you
  are ready the tiles stop moving and the header says so.
- Web: each shop row has the icon, name, a detail line (the supplies' cap, the item's rarity,
  "Upgrade, +1 whisper"), the price and Buy (`shop:<stockId>`). A row that can't be bought shows
  a dimmed button with the reason ("Need 2 more", "Full", "Locked"), or a status with no price
  ("Sold to Bob", "Owned"). Hovering the name (`shop-info:<stockId>`) shows the rules. The
  bought upgrade stays listed as Owned.
- Web: a draft bundle is one card: per item its icon, name, two lines of text, a uses chip and
  a blue Rare tag; hovering an item (`bundle-item:<n>:<i>`) shows its full rules, and one "Take
  bundle" button (`bundle:<n>`) picks it. The taken panel names the bundle from local UI memory
  (`takenBundle`); after a refresh it names only the newest item, since the view keeps no record
  of the pick. `ItemDisplay` gains `usesKind`, so the web can say "Used this camp" or "1 of 2
  charges".
- Web: route cards are as tall as their content. The event reads "On the way" with a chip, and a
  route to a boss camp shows a Shop chip.
- Phaser hit-tests mouse presses on the window, so a real click on a DOM control drawn over the
  canvas also presses the canvas button under it (seen: a dev panel shortcut pressed Set out).
  `expedition-loadout.spec.ts` presses dev buttons with a DOM click event. The underlying issue
  is not fixed.

### Implementation notes (unit 5)

- `Catalog` gains `mods` and `pairings`. The pairing table lives in the catalogue, not only in
  `PAIRINGS`, so a test can rule a pair out with test mods (`route.property.test.ts`).
  `PAIRINGS` is empty until unit 7 registers the defs its rows name.
- `StatusPart` has only `chance` and `strike`, and `ModBody` has no `grants`: each later unit
  adds the parts and channels its defs use, with the schema mirror. `liveSourceKeys` is
  unchanged until the temple grants an ability (unit 10).
- `campStack` stacks location, weather, the pairing's def and the planned boss at full
  strength; helpers at half arrive with the temple. The contract test drives full bodies only
  and checks half bodies for shape, hook keys and event keys.
- "Status stable under a later roll": the contract test moves every `t{i}` roll label for a
  trick after the current one and asserts the status does not change, and that no card id
  appears in it.
- `SeatOrigin` carries `sourceId` beside `sourceKey` (unit 4's note). An ability's `effect`
  receives a `SeatEffect` (`effect.origin.seatId`). `applyToolkitOps(run, origin, ops, rules)`
  keeps the rules argument (unit 2's note). The effect view carries `origin` as
  `{ kind: "seat", seatId, sourceId }` or `{ kind: "mod", modId, strength }`, without the key.
- The deferral moves only `lasts: "trick"` effects; an attempt-long effect cannot wait a trick.
- `dealCamp` folds the stack's `slots` into the spec's before resolving trick-count slots, then
  reacts to `camp-dealt`. `nextAttemptNumber` moved to `run/attempt.ts` so `stack.ts` can name
  a loadout's coming attempt without importing the lifecycle.
- `discard-round` stamps its discards `afterTrick: completedTricks.length`.
- Fair's display name is "Fair". Mosquito Net reads "Rain can't stop your whispers." It is
  the same passive, which folds after Rain's layer. `ROOM_SCHEMA_VERSION` is 11.
- Web: a location without a backdrop file draws the Jungle's backdrop tinted with its
  registered placeholder colour rather than the registry's flat labelled rectangle, whose
  centred label the stump would cover. `bg-clearing` and `bg-clifftop` are registered at
  `locations/bg-<id>.png` for unit 6. The strip of modifier chips (icon, name, live reading,
  strike pips; hover for the rules) sits in the top bar between the purse and the camp, and
  drops the readings when the bar is too narrow. A strike lights the sky once per
  `camp:attempt:trick` key, turns the storm chip into "Lowest wins", and takes the ticker line
  under the stump. Rain and storm draw falling rain behind the table, the storm darker. Route
  cards, the event and the loadout preview show location, weather and any pairing with
  pixel icons. The Whisper button names Rain when Rain is why it is blocked.
- e2e: `dev-mode.spec.ts` no longer expects camp 4 in the Jungle, since a camp's location is
  drawn now. The tour gains `camp-storm-strike`, `camp-rain` and `route-weather` from
  rewritten views.

### Implementation notes (unit 6)

- The art was fetched with `fetch-art.mjs` from each job's download URL (sprites at scale 1,
  backdrops at scale 2); every file matches the staged copy byte for byte, and every sprite is
  natively transparent (no `--matte`). `make-prompts.mjs` records the full job id per spec.
  `fetch-art.mjs` now inserts its CREDITS row into the art table; it appended after the audio
  table that was added since.
- `modArtId(mod)` in `art-registry.ts` names a location's backdrop or a boss's sprite (null for
  other kinds or a missing id); `backdropArtId` reads it and falls back to the Jungle's.
  `mod-art.test.ts` iterates `MOD_DISPLAY`, the projection of `MODS`. That is the boss sprite
  slot: no table zone is added before unit 8 has something to place in it.
- The tinted-Jungle fallback is deleted; a location with no file draws the registry's labelled
  placeholder. Each backdrop gets a shade from `BACKDROP_SHADE` in `draw-table.ts`, a flat dim
  plus an edge vignette (the Jungle none, the desert and the temple the most), so the panels and
  hand stay readable on bright art.
- The loadout draws the backdrop of the camp it sets out for; the draft, route and event keep the
  fireside. `bg-temple` is registered, but nothing draws it until unit 10 decides whether the
  temple camp shows it over its location.

### Implementation notes (unit 7)

- `goals` receives every objective's composed status: `goals(camp, statuses)`, called only
  through `campGoals(camp, rules)` (the outcome, the view and inspect). Flooding's guard needs
  "every objective is done", which a layer cannot ask the composed `objectiveStatus`. The guard
  breaks once `river(totalTricks)` tricks are complete with an objective not done; `river` lives
  in `content/mods/flooding.ts` over `RIVER_SHARE` in `balance.ts`, for Monsoon to share.
- `hides` is a run hook (base false; each layer ORs its own). The Desert's mirage hides
  `objectives[roll("mirage", n)]` until a trick completes; nothing is hidden in the loadout, which
  has no objectives. Heavy fog applies in the loadout too, since the weather is on its stack.
- A board card target skips plays hidden from the seat (`targets.ts`), so Bait cannot name a
  face-down card. An effect whose params name a card hidden from the viewer shows `params: null`.
  The leak check hides a face-down card's id unless it was revealed to the viewer, and does not
  exempt it for a public effect's params (canary M).
- Fog shows an equipped item once a `used` ledger entry stamps it with this camp and attempt, in
  `items.equipped` and `usage`; `backpack` is null. The leak check's secrets gain
  `concealedSeatIds`, and a non-null backpack for one is `structural:fogged-backpack`.
- Steam and Flooding have weight 0. Magma is `deckFor` only; the public `removedCards` already
  says what the heat burned. `route.property.test.ts` now checks the real `PAIRINGS`.
- `RunState` is unchanged, so `ROOM_SCHEMA_VERSION` stays 11. The view's current-trick play is
  `{ hidden: false, card, effectiveRank }` or `{ hidden: true, suit }`, objectives gain
  `kind: "hidden"` and status parts `meter`, each mirrored in the schema.
- Web: a face-down trick card is the pack's card back with a suit pip (a star for a joker),
  registered as `trick:face-down:<seatId>`. A hidden objective is a mini card back with "?" (the
  pool captions it "hidden"); its tooltip names the mirage. A fogged teammate shows a fog tile
  left of their kit icons (`seat-fog:<seatId>`, hovering shows Heavy fog's rules) and on their
  loadout crew row. The Flooding chip reads "N left" with a gauge and turns to an alert one trick
  out, and the river rises behind the table as the tricks run out. The magma chip reads
  "No 2s 3s 4♣" and its tooltip repeats it. Night darkens the sky; Heavy fog drifts mist bands
  kept clear of the seat plates. The seven new defs have pixel icons.
- The Whisper caption under rain showed only "whispers" (`fitLabel` keeps the last word of a
  label that does not fit); it reads "Blocked by Rain" now.
- e2e: the scenarios' `playing()` gives current plays `hidden: false`, which the client's schema
  now requires. The tour gains `camp-cave`, `camp-night`, `camp-desert`, `camp-fog`,
  `camp-magma`, `camp-flood` and `loadout-fog` from rewritten views, and its bot reads a face-down
  lead's suit.

### Implementation notes (unit 8)

- `drawPlan(seed, length, catalog)` draws each animal or disaster boss camp from its tier's pool
  (registered defs with weight above 0, ids sorted, one `seededIndex` on `expedition-plan:{tier}`).
  The disaster pool is empty until unit 9 and the temple tier stays null until unit 10, so those
  camps still plan null. `horizon(run)` and `visibleBossId` live in `run/plan.ts`; the view gates
  the header's `plan` and every camp preview through them, the leak check adds each planned boss
  beyond the horizon to `hiddenIds`, and `FORBIDDEN_VIEW_KEYS` gains `bosses`.
- Deviation: `openLoadout` cuts every equipped set to the camp's composed `itemSlots`, the last
  items going back to the backpack. The spec left a carried set over the slots for `ready` to
  refuse; a player arriving at a Rats camp would then press Set out and be refused, and bots
  (which never equip) would stall the table. `ready` still re-checks.
- Tiger: the streak is the last winner's run of consecutive wins. The leader pounced on is the
  last winner on a streak of two or more, before the lead, so a third win in a row pounces again.
  The forced card is `roll("t{i}")` over the previous layer's legal plays, so it composes with
  other `legalPlays` layers. Status `streak` appears from one win.
- Beaver reads the printed suit: a `rules(ctx)` layer cannot ask the composed `identityOf`. A
  Beaver helper under Blood Moon (unit 10) would dam by printed suit.
- Snake: the bite is an attempt-long mod effect with params `{ seatId, from, through }`; it fails
  only card objectives (`win-card`, `ordered`) owned by the bitten seat and won by them in the
  span. Whispers happen only between tricks, so `from` is the next trick played.
- Crocodile's goal id is `crocodile`; Rats' half body takes a slot from `seatIds[0]` and
  `seatIds[1]`; the Capybara adds win-card slots. The contract test still drives full bodies only
  (half bodies are shape-checked, as in unit 5) until the temple stacks helpers.
- `RunState` is unchanged, so `ROOM_SCHEMA_VERSION` stays 11. Status parts gain `facing`, `dam`,
  `streak` and `bitten`, mirrored in the schema.
- Dev: `set-plan-boss` (Run group) sets an animal or disaster camp's boss or none, re-opening
  that camp if the run is at it (a dealt camp is dealt again). `jump-to-camp` keeps the run's own
  plan when the length matches, so a boss set first survives the jump. `check.ts` flags a planned
  boss whose kind is not its tier; `inspect.ts` labels the new status parts and marks a boss not
  yet revealed.
- Web: the camp's `world` zone is split: `boss` (6, 42, 96x58, wide enough for a 15-character caption) above, `world` (8, 102, 92x40)
  with the campfire, and the lantern and fireflies moved down into it. The boss sprite is drawn
  at half size (the art is 96-160 px on a 640x360 stage) in its own layer, rebuilt only when the
  boss changes, so its idle bob survives redraws; hovering it shows the boss's rules. Under it a
  caption reads its state ("Watching Bianca", "Dam: ♥ hearts", "Pounce: Bot 1", "Bit you",
  "-1 item slot", "+2 objectives"). The Crocodile's gaze arrow sits inside the boss zone and points
  at the watched seat's plate. A boss mark ("watched", "streak 2", "bitten 2") hangs under a
  teammate's plate or sits in your own name row; an alert mark outlines the plate in red.
- Deviation: the boss's one-line rule is pinned to the ticker under the stump ("Crocodile: if
  Bianca wins this trick, the camp is lost"), not the top-bar strip. At 1280x720 the strip's free
  span (about 219 stage px) is already filled by three chip names. The strip now drops readings,
  then every name but the boss's, before it would overflow; in a boss camp the top bar's camp
  label drops the tier ("Camp 3 of 6"), since the chip names the boss. Both fix an overlap of the
  strip with the camp label that a third chip exposed.
- Web: a dammed card's reason is "The beaver dams ♠", a pounced lead's "The tiger picked your
  lead" (a follow-suit reason wins when the player can follow). Route cards, the event panel and
  the loadout preview show a revealed boss's portrait with its name and tier; a route card too
  short for the portrait falls back to one line ("Crocodile, animal boss").
- e2e: `expedition-bosses.spec.ts` sets each boss with the dev panel and plays into the state
  that shows it (the crocodile camp plays to its settle); with `BOSS_SCREENSHOT_DIR` it captures
  each at 1280x720 and 1920x1080. The tour gains `camp-tiger`, `camp-rats`, `camp-snake`,
  `camp-crocodile`, `camp-capybara`, `camp-beaver` and `route-boss` from rewritten views.

### Implementation notes (unit 9)

- Status parts gain `countdown { tricks }` (tricks still to finish, the current one included,
  before the boss acts), `alternating { activeNow }` and, beyond the spec, `swarm { seatId | null }`:
  the seat whose equipped item the Locusts eat next, or null when they will eat a card from every
  hand. Tornado shows no countdown once no gust remains (none blows after the final trick), and
  Earthquake none after the quake. Wildfire and Meteor at full strength have no status.
- Deviation: a current-trick play the viewer sees carries `countsAs` like a completed play, so a
  Blood Moon trick shows what a played spade or club counts as while the trick is open. The leak
  check counts that identity for the current trick as it already did for hands and completed tricks.
- Tornado: "the player on the right" is the previous seat in turn order (turn order runs to the
  left; the web seats the next player on your left). Every hand's cards are drawn first, then each
  sent card is revealed to its sender only (`reveal`, source `tornado`), then moved. Up to three
  cards each, so equal hands stay equal. A public `log` entry `gust` marks each gust.
- Earthquake: the open (pending under the composed rules) owned objectives are permuted over the
  same list of owners with `ctx.draw`, and `reassign-objective` moves each whose owner changed; a
  done or failed objective stays. Log `quake`. The half body logs `quake` and swaps two random
  seats' open objectives.
- Wildfire burns the lowest printed standard card; the Sun and Moon never burn. Meteor burns the
  card the composed `trickWinner` names among the cards not already burned. Display names "Meteor
  shower" and "Locust swarm".
- Blood Moon reads the trick in play from `ctx.camp.currentTrick.index`; the full moon is up on odd
  indices, the half on indices 3, 7, 11. Trick completion composes the rules before the play, so
  `countsAs` records the moon of the trick being completed.
- Locusts: the meal goes round the table after the last seat eaten from (the latest public
  `ate-item:<itemId>` log entry), starting at the expedition leader; the item is a seeded pick of
  that seat's equipped instances. With no equipped item anywhere, `discard-round` takes a seeded card
  from every hand (log `ate-cards`). That can end a camp with one trick left, failing its unplayed
  targets; a placeholder for the balance pass. The item id in the log is public: eaten is gone.
- Monsoon shares `river` with Flooding; the half body floods one trick later. Goal id `monsoon`.
- Half bodies are tested by a catalogue whose def plays its half body as `full`, since the stack
  adds helpers only in unit 10. `TORNADO` (every 3, 3 cards) joins `balance.ts`.
- `RunState` is unchanged, so `ROOM_SCHEMA_VERSION` stays 11. Dev: `set-plan-boss` already listed
  every boss kind; a test sets a Long run's disaster and jumps to camp 6.
- Web: the boss stands larger and in the camp's place. `ZONES.boss` and `ZONES.world` are folded
  into one `world` column above the kit (6, 42, 96x100). In a boss camp the boss fills it, scaled to
  fit (0.59 for the crocodile up to 0.98 for the capybara, against 0.5 before), and the campfire,
  lantern and fireflies are hidden; in a plain camp they stand there as before. A taller, narrower
  column with a trimmed kit was compared and dropped: the wide sprites shrank and the caption
  crowded "Your kit". `layout.test.ts` checks every boss sprite fits. Checked at 3, 4 and 5 players
  at 1280x720 and 1920x1080.
- Web: each disaster has a caption and a one-line rule under the stump ("Gust in 2", "Quake in 1",
  "Burns lowest", "Vaporizes top", "Moon rises", "Eats Bianca's", "River: 3 left"); rules are capped
  at 60 characters, the ticker's width. The Locusts' next meal hangs a "next meal" mark on that seat.
- Web: animations play once per key (the trick, the log entry) and never for what was already on the
  table when the scene first drew. A burned card chars to ash where it lay; a vaporized one is hit by
  a streak and flashes away; in the last-trick fan both are dimmed and crossed. A gust flies your sent
  cards to the teammate on your right, the cards you got glow, and the sent cards stay in "Cards you
  know" as "gust sent to <name>" until the next gust. Tornado reveals are not shown as cards you
  showed. The latest gust's cards are the sender's tornado reveals after three per earlier gust,
  which is exact: a gust with fewer than three cards in hand is always the last one. A quake shakes
  the camera and slides ghost chips from old owners to new. Under a risen Blood Moon the sky turns
  red and hand and stump cards wear a red-ringed badge with the suit they follow now. Each gust,
  quake and locust meal shows a toast over the stump for about three seconds, with the eaten cards.
  Monsoon reuses the Flooding chip, gauge and rising river.
- e2e: `expedition-bosses.spec.ts` gains one test per disaster: jump to camp 6 of a Long run, set the
  boss with `set-plan-boss`, and step autoplay until the state shows (a failed camp replays with
  supplies topped up). The earthquake test depends on a camp surviving to its halfway trick under
  random play, so it has an 800-step budget. The tour gains `camp-tornado` ... `camp-monsoon` from
  rewritten views and `long-camp-6`, camp 6 of 8 reached through the dev jump.

### Implementation notes (unit 10)

- `ModBody.grants` is a `Grant`: an `ActiveAbility` plus a `name` and one sentence of `text`,
  since the ability bar needs both and a bare ability has neither. `SOURCE_DISPLAY` lists a
  grant under its modifier's id with `kind: "grant"` (the temple's is "Skip").
- `liveSourceKeys(seat)` keeps only the seat's own keys, which passives fold from. The new
  `abilityKeys(run, seat, catalog)` appends the stack's granted mod ids and is what abilities,
  the view's `yourAbilities` and `usage` and the random driver read; `abilityOf` resolves a
  grant before a seat source. Every seat's `usage` carries the crew's token, so any seat can
  read its charge outside the skip's windows, where `yourAbilities` gives only the window.
- `crew-tokens` takes `earned(run, rules)`, not `earned(run)`: the Sun objective's status is
  the composed one (a Snake helper's bite can fail it). The limit also carries `locked`, the
  reason shown while none is earned ("Win the Sun to earn it"); once spent the reason is "The
  crew has used it". The view's remaining gains `{ kind: "crew", left, earned }`.
- `ActiveAbility.window` is `ActiveWindow | readonly ActiveWindow[]`, read through `windowsOf`.
  `SourceActiveDisplay.window` became `windows`; the phrase joins them with "or".
- Deviation: the plates goal also fails once the Sun has left play (played or discarded)
  without pressing the last plate. The goal is unreachable then, and a task fails once
  unreachable. It follows that the Sun can be won without failing the camp only by leading it
  as the last plate, so the skip is earned at the end of the path.
- The path is rolled per attempt (`roll("plate{i}")`) against the current `totalTricks`; a
  Locusts helper's `discard-round` shortens it by its last suit plate. Status part `path {
  plates, pressed }`.
- `drawPlan` plans the registered temple def for the temple tier. `visibleBossId` shows the
  temple at every horizon and the leak check never hides it: its tier already names it, and
  the hidden-string check would otherwise flag the tier itself.
- The objective target gains `whose: "open"`: any seat's taken objective that is not done.
- The contract test plays every boss's half body as a temple helper (the boss planned at camp
  1, the temple at camp 2) at 3, 4 and 5 players. The Long-run property plays every camp with
  random legal moves; before the temple a camp failed twice, or a failure that would end the
  run, is cleared by `force-camp` (Heavy Packs can make one failure cost more than full
  supplies).
- `RunState` is unchanged, so `ROOM_SCHEMA_VERSION` stays 11. Rescue still opens only with no
  failed goal, so its view still needs no `failedGoalIds`. The skip's 16x16 icon is drawn in
  code (`apps/web/art/expedition/draw-icon-skip.mjs`).

### Implementation notes (unit 10, web)

- The web shows the Skip in every seat's kit with its charge from `usage` ("not earned", "1
  left", "used").
- The temple camp, and its loadout, stand in `bg-temple` whatever the location; the location's
  chip and rules stay. `Sky.backdrop` and `CampPreview.backdrop` name what is drawn
  (`campBackdrop`: the temple when the camp's `bossId` is the temple def). A route card or
  loadout preview of the temple has `bossId: null`, so it reads "The Temple" with the temple
  marker, never a boss without a portrait.
- The plate path takes a new `path` zone (120, 276, 400x16) at the foot of the stump, carved off
  the top of the hand zone, which shrinks to (120, 292, 400x64): the hand tray and a lifted card
  already started at y 292, so the hand does not move. It reads "Plates 2/9", a 12px tile per
  plate (a pressed plate lit, the next outlined with a pulsing ring, those ahead dark with a grey
  pip; the Sun last) and "Next: lead ♠", "Next: lead the Sun", "Every plate pressed" or "The path
  is broken" from the `temple` goal. A newly pressed plate throws a ring once. Hovering the row
  shows the temple's rules. `layout.test.ts` checks the longest path (9 plates at 3 players)
  with the longest texts.
- Helpers stack in the world column, one row each, the sprite above two caption lines: "Tiger
  (half)" (short names for the crocodile, earthquake, meteor, Blood Moon and locusts) and its
  reading. A lone helper stands at exactly half its boss's scale; two share the column at up to
  half (the tallest sprites drop to about 0.35 of their boss scale, 70% of half), since half
  scale for both would put a sprite over a caption. A helper has no gaze arrow and no ticker
  rule; its seat marks still show (the boss's mark wins a seat, then the first helper's). The
  half Capybara reads "+1 objective" and the half Rats "Chewing 2 packs". At a Short temple,
  with no helper, the campfire stands as in a plain camp.
- The top bar's strip keeps the temple's name (and a full boss's) when it narrows; a helper's
  chip drops to its icon. Its name reads "Tiger (half)" and its tooltip adds "Half strength at
  the temple". In a boss camp or the temple the camp label reads "Camp 6 of 6".
- The Sun objective is an `ObjectiveChip` of kind `sun`: the Sun mini card with a sun-coloured
  ring, captioned "the Sun" in the pool; its tooltip says to lead it on the last plate and that
  winning it earns the crew a Skip.
- The Skip is a `grant` source chip on every seat, on moss in your kit. A teammate's plate leaves
  it out of its kit icons: the token is the crew's, and at 4 objectives the icon crowded the
  plate's objective row. Its tooltip gives the window and "Crew token" badges and the lock
  reason; it targets through the existing objective picker, and the rescue banner offers "Use
  Skip". A rescue waiting on more than two others lists them with commas.
- Temple camps deal 4 to 6 objectives, so a teammate's plate holds two or three. A row that does
  not fit now shortens a trick-count tag to its number ("0", "=2") before it squeezes items
  together; the squeeze alone overlapped a "0 tricks" tag with the card before it.
- Dev: autoplay leads the next plate's suit at the temple when it can and holds the Sun back
  until it presses the last plate. `e2e/expedition-temple.spec.ts` plays each length's temple to
  a pressed plate, and a 5-player Short temple to the Sun on the last plate (the Sun moved to the
  leader and its objective given to them with the dev panel), then spends the Skip. The dev
  panel helpers moved to `e2e/expedition-dev-panel.ts`. The tour gains `temple-short`,
  `temple-standard`, `temple-long` and `temple-rescue`.

### Implementation notes (unit 11)

- `run/balance.ts` gains the five tunables that lived elsewhere, each at its old value:
  `WHISPERS_PER_CAMP` and `WHISPERS_PER_UPGRADE` (the base `whispersPerCamp` in
  `run/run-rules.ts`), `FAILURE_COST` (the base `failureCost`), `BOTH_MIX_MIN_SLOTS` (the "both"
  mix threshold in `run/route.ts`) and `PURSE_START` (`createRun` in `run/lifecycle.ts`).
- A number that one def alone reads stays in that def: half-body parameters, the temple's plate
  count, the earthquake's trick, Clifftop's fair chance, the Heat's ranks, and every item's price,
  rarity and uses. A number two defs share lives in `balance.ts` (`RIVER_SHARE`, read by Flooding
  and Monsoon through `river`). `THUNDERSTORM` and `TORNADO` were in `balance.ts` already and stay.
- A boss's `weight` only gates its pool: `drawPlan` draws uniformly among a tier's defs with weight
  above 0. Locations and non-fair weathers draw by weight.

Every number the owner may tune is below. Paths are relative to `packages/rules/src/expedition/`,
and a bare identifier lives in `run/balance.ts`. A def's `text` repeats some of its numbers
("two extra objectives"), so a tuning pass edits both.

| What | Current value | Where it lives |
|---|---|---|
| Run lengths and boss camps | Short 4 camps, temple at 4; Standard 6, animal at 3, temple at 6; Long 8, animal at 3, disaster at 6, temple at 8 | `RUN_LENGTHS` |
| Seat objectives per camp, before boss and temple slots | Short 2, 3, 4, 3; Standard 2, 3, 3, 4, 4, 4; Long 2, 3, 3, 4, 4, 4, 5, 4 | `OBJECTIVE_RAMP` |
| First camp with mixed slots | camp 4 | `MIX_FROM_CAMP` |
| Fewest slots for the "both" mix | 4 | `BOTH_MIX_MIN_SLOTS` |
| Mix choices | plain, ordered pair (2 slots), trick-count, both; uniform | `run/route.ts` `optionsAfter`, `slotsFor` |
| Trick-count slot kind | no-tricks or exactly-n, even odds, per attempt | `resolveTrickCountSlot` |
| Exactly-n's N | 2 to 4, uniform | `TRICK_COUNT_N_RANGE` |
| Route options | 2 or 3, uniform | `ROUTE_OPTIONS` |
| Event on a route | uniform over `EVENTS` | `run/route.ts` `optionsAfter` |
| Supplies at the start | 3 | `SUPPLIES_START` |
| Supplies cap | 4 | `SUPPLIES_MAX` |
| Supply price at the shop | 6 coins | `SUPPLY_PRICE` |
| Failure cost | 1 supply | `FAILURE_COST` |
| Purse at the start | 0 coins | `PURSE_START` |
| Payout for a clear | 5, plus 1 per unplayed trick up to 3 | `PAYOUT` |
| Draft offer | 3 bundles of 2 items | `DRAFT.options`, `DRAFT.bundleSize` |
| Rare chance, draft and shop | 15% | `DRAFT.rareChance` |
| Shop items | 3 single copies | `SHOP.items` |
| Upgrade price | 8 coins | `SHOP.upgradePrice` |
| Item slots | 2 | `ITEM_SLOTS` |
| Whispers per camp | 1 | `WHISPERS_PER_CAMP` |
| Extra whispers for an upgrade owner | 1 | `WHISPERS_PER_UPGRADE` |
| Trained Monkey, Pack Mule, Parrot | 3 coins, common, per-camp | `content/items/<id>.ts` `price`, `rarity`, `uses` |
| Trail Map | 5 coins, rare, single-use | `content/items/trail-map.ts` |
| Rain Poncho | 3 coins, common, 2 charges, +1 whisper each | `content/items/rain-poncho.ts` |
| Smoke Signal | 5 coins, rare, 2 charges, +1 whisper for everyone each | `content/items/smoke-signal.ts` |
| Whetstone | 2 coins, common, single-use, up to 2 ranks either way | `content/items/whetstone.ts` (`spread: 2`) |
| Puffball, Bait | 2 coins, common, single-use | `content/items/<id>.ts` |
| Camouflage | 4 coins, rare, single-use | `content/items/camouflage.ts` |
| Rope Ladder | 3 coins, common, single-use | `content/items/rope-ladder.ts` |
| Heavy Pack | 3 coins, common, passive: +1 whisper, +1 supply per failure | `content/items/heavy-pack.ts` |
| Mosquito Net | 4 coins, rare, passive | `content/items/mosquito-net.ts` |
| Fair weather chance | 80% | `NORMAL_WEATHER_CHANCE` |
| Clifftop's fair weather chance | 50% | `content/mods/clifftop.ts` `normalWeatherChance` |
| Location weights | clearing, jungle, clifftop, desert, cave, magma: 1 each | each def's `weight` in `content/mods/<id>.ts` |
| Weather weights | rain, fog, thunderstorm, night: 1 each; fair 0 (drawn by chance) | each def's `weight` |
| Pairing and temple weights | steam, flooding, temple: 0 (never drawn) | each def's `weight` |
| Boss pool | uniform over a tier's defs with weight above 0; every boss weight 1 | `run/plan.ts` `bossPool`, each def's `weight` |
| Thunderstorm strike chance | 20% before trick 0, +10% per trick, capped at 100% | `THUNDERSTORM.firstChance`, `THUNDERSTORM.perTrick` |
| Thunderstorm strikes per camp | at most 2 | `THUNDERSTORM.maxStrikes` |
| River (Flooding, Monsoon) | every objective done by trick `ceil(total * 3 / 4)` | `RIVER_SHARE`; `river` in `content/mods/flooding.ts` |
| Heat (Magma) | no 2s or 3s, then 4s (clubs, diamonds, hearts, spades) until the deck divides by the seat count | `content/mods/magma.ts` `heatDeck`, `FOURS_ORDER` |
| Tiger | pounces on a leader with 2 or more wins in a row; full every trick, half even trick indices | `content/mods/tiger.ts` `pounceOn`, `body(1)`, `body(2)` |
| Rats | full: every seat 1 slot fewer; half: only the first 2 seats | `content/mods/rats.ts` `full`, `half` (`slice(0, 2)`) |
| Snake | a whisper's bite lasts full 2 tricks, half 1 | `content/mods/snake.ts` `body(2)`, `body(1)` |
| Crocodile | full watches every trick, half every other | `content/mods/crocodile.ts` `body(1)`, `body(2)` |
| Capybara | full +2 win-card slots, half +1 | `content/mods/capybara.ts` `extra(2)`, `extra(1)` |
| Beaver | full dams every trick, half every other | `content/mods/beaver.ts` `body(1)`, `body(2)` |
| Tornado | full every 3rd trick, half every 6th; 3 cards from each hand | `TORNADO.every`, `TORNADO.cards`; half `TORNADO.every * 2` in `content/mods/tornado.ts` |
| Earthquake | once floor(total / 2) tricks are done; full deals open objectives out again, half swaps two seats' | `content/mods/earthquake.ts` `quakeAt`, `shuffleOpen`, `swapTwo` |
| Wildfire | full burns every trick, half odd tricks | `content/mods/wildfire.ts` `body(false)`, `body(true)` |
| Meteor | full every trick, half odd tricks; aces never objectives at either | `content/mods/meteor.ts` `body(false)`, `body(true)` |
| Blood Moon | full odd trick indices (period 2), half indices 3, 7, 11 (period 4) | `content/mods/blood-moon.ts` `body(2)`, `body(4)` |
| Locusts | full every trick, items then a card from every hand; half items only, odd tricks | `content/mods/locusts.ts` `body(false)`, `body(true)` |
| Monsoon | full floods at the river, half 1 trick later | `content/mods/monsoon.ts` `body(0)`, `body(1)` |
| Temple plates | floor(total / 2) - 1 suits, then the Sun | `content/mods/temple.ts` `platePath` |
| Temple skips | 1 per Sun won | `content/mods/temple.ts` `grants.limit.earned` |

Web and test notes:

- Deviation: no balance pass. The owner was not available, so every placeholder is listed in the
  table above for a later pass instead of being tuned.
- `ROOM_SCHEMA_VERSION` is 12: unit 10 planned the temple def for the temple tier without a bump,
  so a room in flight kept a plan with no temple.
- One uses wording, `usesLabel` in `apps/web/lib/expedition/source-text.ts`, for the loadout,
  the trail kit and the camp kit: "Single use", "Once per camp", "Used this camp", "1 of 2
  charges", "Once per run", "Costs 1 supply", "Not earned", "Always on". It also gives a short
  form ("1 per camp", "1/2 charges", "Used"), which only the camp's kit rows use: at 11
  characters they cannot hold "Once per camp". The catalogue badge for a per-camp limit of 1 now
  reads "Once per camp", a passive's badge "Always on", and `SourceActiveDisplay` gains
  `limitKind` so the web can phrase what is left.
- The draft offer takes the panel and crew row (`DRAFT_ZONES.offer`), so each bundle card is
  about 193 stage px wide and every item's rules show in full, at most three lines.
  `layout.test.ts` fails if an item's text would need a fourth. The crew panel returns once the
  offer is taken; "N still choosing" beside Ready says who is left. The panel's payout heading
  is deleted; the prompt says it once.
- Route cards: "On the way" holds the event and, before a boss camp, the Shop chip. The cards in
  a row share the tallest card's height, their votes pinned to the foot.
- The boss's one-line rule and a strike notice under the stump sit on an opaque plate edged in
  their colour; whispers keep the old translucent backing.
- Seat plates: `plateRect` counted a plate on the row below as a neighbour, which held every
  five-seat plate to 98 px. Plates now limit each other only where they overlap vertically, so
  every plate at 2 to 5 seats is at least 112 px, room for "14 cards" beside "0 tricks". A
  spectator's narrowest plates fall back to "0 won", then to the bare hand count.
- The rules modal has four pages (Rules, Locations, Weather, Bosses). Locations and bosses show
  their art; weather and pairings show the canvas's 9x9 icons as SVG, whose grids moved to the
  Phaser-free `art/mod-icons.ts`. The copy reads its numbers from `BALANCE_DISPLAY` and
  `RUN_LENGTH_DISPLAY`.
- Run end: each camp names its boss under its number ("Tiger", "The Temple"); a lost run says
  where ("Out of supplies after 2 tries against the Tiger"), a won one the length ("Standard
  run: all 6 camps cleared, with 2 supplies and 32 coins left").
- The earthquake e2e loads the seed `quake-8` through the dev state editor; autoplay reaches the
  quake at step 31 whatever the seat ids, pinned by `dev/autoplay.test.ts`. It ran in 6 s
  instead of up to 10 minutes.
- The UI tour adds a five-seat table (you and four bots): `five-route`, `five-camp` and
  `five-temple`. The strict tour passed at 1920x1080 and 1280x720 with 0 layout violations.
- Two e2e fixes found by the full suite: the temple's Skip test expected the trail after the Skip
  dropped the last open objective, but that clears a Short run's final camp and wins the run, so
  it now expects the run end. `expedition-overlay-input.spec.ts` dispatched clicks on dev panel
  buttons that are disabled until the room answers, and under eight workers the click was
  dropped; it now waits for each button to be enabled.

### Implementation notes (unit 12)

- Seams beyond the "Fits on" table, each added because a character in the
  owner's brief needs it: the run hooks `swapsBoss` (which option carries
  Cartographer's boss swap), `freeUse` (Sturdy Straps) and `surveys` with
  each camp preview's `survey` (Survey); the Core hook `objectivePicker`
  (First Pick); `PassiveAbility.foldsLast` (Momentum's "no other bonus
  whispers apply" must outrank items and effects); the ops `drop-item`
  (selling), `drop-offer` (the draft skip), `add-offer` (Treasure Map),
  `retarget-objective` (Reshape) and `void-trick` (Smelling Salts); the
  target kinds `item`, `route-option`, `fanned-card`, `objective-value` and
  `option`; `ctx.catalog` and `ctx.drawOffer` on abilities; `ctx.affects`
  on camp modifiers; the events `run-started` (sources only) and
  `camp-settled`.
- Deviation: First Pick fits on a Core hook, not an objective-pick window
  ability. Taking an unowned objective through the toolkit would count as a
  pick and shift the rotation, so the leader would lose the first pick.
  `objectivePicker(state, picked)` lets the Hermit pick before the leader,
  with the usual rotation after.
- `applyToolkitOps` takes the catalogue (`reroll-route` draws locations,
  `grant-item` mints) and `RunRules` (`swap-slots` and `give-item` read
  `itemSlots`). Supplies, coins, items, offers and routes are run ops that
  work in any stage; the others throw outside a camp. Conservation is
  checked only in a camp.
- A stage window stamps trick 0 of the camp it belongs to: the loadout the
  attempt it will deal (so a per-camp limit shares the camp's count), the
  draft and route the attempt that cleared. In those windows `ctx.camp` is
  null; use-ability is accepted by the loadout, draft and route stages, and
  a use there writes no log entry (the log lives on the attempt).
- An item instance's uses are counted on every seat's ledger, so an
  instance given away keeps what it has spent.
- A voided trick keeps its index: `currentTrick.index` moves on while
  `completedTricks.length` does not, and the trick is kept in
  `CampState.voidedTricks` (the view's `camp.voidedTricks`). Its cards are
  public; the leak check exempts their ids. `void-trick` voids only the last
  completed trick between tricks, and its leader leads again.
- Behaviour change: an item with `exclusiveTo` is drafted only through
  `draftShape.exclusive` (`exclusive` items per bundle after the open ones).
  Before, it joined that character's ordinary pool. No production item has
  `exclusiveTo`, so only `draft.test.ts`'s catalogue changed.
- A cleared camp appends its standard offer behind any special offers an
  ability queued, instead of replacing the queue.
- `shopPrice` prices every purchase (supplies, items, upgrades), and the
  shop view shows each viewer its own prices.
- `affectsSeat` is folded from the seat layers only (passives, seat
  effects, `foldsLast` passives), since the camp modifiers ask it while their
  own layers are being built. Tiger, Rats, Snake, Crocodile and Beaver ask
  it; the Crocodile still faces an unaffected seat but its win breaks
  nothing. The base answers true, so the bosses behave as before.
- The `coins` limit is `cost({ run, seatId, uses: { thisCamp, thisRun },
  targets })`; `targets` is null before they are picked (the view's
  remaining `{ kind: "coins", cost }`), so a price may depend on the pick
  (Pop-up Shop's price map, Buyout's 10 per open objective).
- A source's `on` reacts after the camp modifiers; an `add-modifier` from it
  resolves its layer through the source's `active.effect`.
- `sources.contract.test.ts` lists the five new target kinds as awaiting the
  nine characters; unit 13 deletes the list.
- `RunState` changed (voided tricks, `free` ledger entries, route `reroll`
  and `swapBoss`, offer `kind`), so `ROOM_SCHEMA_VERSION` is 13. The view
  gains the coins remaining, the three stage windows, the five target kinds,
  `survey`, `swapsBoss`, the offer's `kind` and `voidedTricks`.
- Dev: `void-last-trick`, `reroll-route`, `set-route-swap` and `queue-offer`;
  `check.ts` validates rerolls, swaps and hallucinations; `inspect.ts`
  shows them and special offers. A `free` ledger entry has no shortcut: only
  `freeUse` at the moment of a use writes one.
- Web: compile only. `usesLabel` reads a coins price ("Costs 3 coins").

How each of the nine fits (for unit 13):

| Character | Power or upgrade | Seams |
|---|---|---|
| J.D. | extra random item at the start | `on["run-started"]`, `ctx.drawOffer`, `grant-item` |
| J.D. | hidden luck | `normalWeatherChance` passive (+5; never projected) |
| J.D. | Blend In | `affectsSeat` passive, deciding by `run.plan` tier `animal` |
| J.D. | Free Spirit | `add-modifier` effect on `objectiveStatus` (existing) |
| J.D. | Rule Breaker | `in-trick` `add-modifier` effect on `legalPlays` (existing) |
| Businessman | +2 coins for 1 empty slot, +5 for 2 | `on["camp-dealt"]` or `on["camp-settled"]`, `adjust-coins` |
| Businessman | skip a draft for +4 | `draft` window, `drop-offer`, `adjust-coins` |
| Businessman | sell items at the shop | `loadout` window, `canUse` on `stage.stock`, `item` target, `drop-item`, `adjust-coins`, `ctx.catalog` for the price |
| Businessman | Pop-up Shop | camp windows, `option` target (stock from `scope.roll`, refresh as an option), `coins` limit priced by the pick and the uses, `grant-item` into a `player` target |
| Businessman | Buyout | `rescue` window, `coins` limit (10 per failed objective), `remove-objective` |
| Businessman | Haggle | `shopPrice` passive |
| Magician | swap from a fanned hand | `fanned-card` target, `swap-cards` |
| Magician | Double Act | `whispersPerCamp` passive plus `canUse` over the shared count |
| Magician | Misdirection | two `fanned-card` targets, `swap-cards` |
| Magician | Switcheroo | `swap-objectives` |
| Magician | 2 swaps with any upgrade | `Tuned` per-camp limit |
| Perfumist | mist as leader | `between-tricks`, `canUse` on the leader, trick `add-modifier` whose effect is `voidsTrick` |
| Perfumist | can't whisper until upgraded | `whispersPerCamp` passive |
| Perfumist | Turncoat | `in-trick` effect on `identityOf` of the lead |
| Perfumist | Upside Down | `in-trick` effect on `trickWinner` |
| Perfumist | Smelling Salts | `rescue` window, per-run, `void-trick` |
| Cartographer | 3 routes, the third to another boss | `routeOptionCount`, `swapsBoss`, `RouteOption.swapBoss` |
| Cartographer | reroll for supplies | `route` window, `route-option` target, supplies limit, `reroll-route` |
| Cartographer | Redraw | `objective-pick`, `replace-objective` (existing) |
| Cartographer | Survey | `surveys` passive |
| Cartographer | Treasure Map | per-run, `ctx.drawOffer` with 1-item bundles and a high `rareChance`, `add-offer` twice per seat, `adjust-coins` 10 |
| Explorer | a card counts 1 higher or lower | `card-value` target, effect on `rankOf` (existing) |
| Explorer | Second Wind | `Tuned` limit |
| Explorer | True Form | effect on `identityOf` |
| Explorer | Reshape | `objective-value` target, `retarget-objective` |
| Leader | 2 whispers | `whispersPerCamp` passive |
| Leader | Open Ears | `whisperAudience` passive |
| Leader | Delegate | effect on `whispersPerCamp` for a `player` target (`canTarget` on `whisperAllowed`) |
| Leader | Momentum | `foldsLast` passive on `whispersPerCamp` reading won tricks |
| Hermit | drop an objective | `objective` target (`mine`), `canUse` on tricks won, `remove-objective`, attempt effect with a `goals` guard |
| Hermit | Burden | `add-objective` |
| Hermit | First Pick | `objectivePicker` passive |
| Hermit | Alms | the drop's apply adds an extra-whisper effect for a teammate |
| Pack Rat | 2 items plus 2 Pack Rat items | `draftShape` (`exclusive: 2`), `exclusiveTo` items |
| Pack Rat | 3 slots | `itemSlots` passive |
| Pack Rat | Quartermaster | `loadout` window, `item` and `player` targets, `give-item` |
| Pack Rat | Pack Animal | camp window, `item` targets, `swap-slots` |
| Pack Rat | Sturdy Straps | `freeUse` passive over the attempt's ledger |
| Every upgrade | +1 whisper | base `whispersPerCamp` (unit 4) |

### Implementation notes (unit 13)

- A base power that acts in more than one window or on different targets
  is split into powers: `CharacterDef.powers` holds `PowerDef`s (kind
  `power`, id `<character>.<name>`), each its own source key, live whenever
  the seat is that character (`liveSourceKeys(seat, catalog)`). Characters
  have two or three upgrades (`defineCharacter` takes either).
- `UsageLimit` loses `pool` and gains `unlimited`, `whispers` (usable while
  the seat has a whisper left; the ability's own layer takes it through
  `whispersPerCamp`) and `shares { of, spends }` (counts against another of
  the seat's sources; Reshape spends the Compass's use). `CoinCost` gains
  `rules` and `catalog`. The ledger's `used` entry loses `poolCost` and
  `regained` is deleted, so `ROOM_SCHEMA_VERSION` is 14. The view's
  remaining gains `unlimited` and `whispers` and loses `pool`; seats lose
  `pool`; `CHARACTER_DISPLAY` loses `pool` and gains `powerIds`.
- J.D.: Beginner's Luck grants one item drawn like a one-item draft on
  `run-started`; the hidden luck is a passive adding 5 to
  `normalWeatherChance` (never projected). Blend In answers `affectsSeat`
  false for a planned animal boss, a temple helper included. Free Spirit is
  an attempt effect that evaluates every ordered objective as a win-card,
  usable while picking, between tricks or in rescue, so it can save an
  ordered objective already failed by order. Rule Breaker makes the whole
  hand legal for its user this trick.
- Leader: Megaphone is one extra whisper. Open Ears adds the Leader to the
  audience of each teammate's first whisper of an attempt. Delegate (limit
  `whispers`) moves one whisper per use to a teammate who can whisper.
  Momentum is `foldsLast`: 2 plus one per trick won; the reading the doc
  asks the owner to confirm, with the upgrade's own +1 counted among the
  bonuses that no longer apply.
- Explorer: the Compass works between tricks or on your turn. True Form is
  recorded in the effect's params at the use, so an upgrade bought later
  does not change a card recounted earlier. A recounted rank now wears a
  badge on the hand card ("8♠"), and a counted-as badge or pip shows the
  rank whenever it changed (the unit 2 note).
- Tests: `setupRun` gives unnamed seats quiet characters first (Explorer,
  Magician, Hermit, J.D.) so counts stay the base rules'. The sources
  contract walks camps 1, 3 and 4 (Free Spirit needs an ordered objective)
  and finds stage-window abilities too. Its whole-catalogue runs rotate the
  characters and upgrades across the three seeds.
- Web: an objective-value step holds an objective and offers its ranks in
  the tray, as a card-value step does with a hand card (`RANK_STEPS` in
  `local-ui.ts`). The muster card drops the power's icon when a long name
  (Beginner's Luck) would not fit beside it.
- Businessman: the coins for empty slots are paid at `camp-dealt`, so a
  replay pays again (a failure costs more than it pays). Selling is the
  base power's own ability in the loadout while the shop is open, for half
  the item's price rounded down, at least 1 (`salePrice`, projected as
  `ItemDisplay.sellsFor`); skipping a draft is the power `Cash Out`. The
  Pop-up Shop is one ability with one option step: `buy:<place>:<item>:
  <price>:<seat>` for each unsold place and player, and `refresh:<price>`,
  so the price rides in the value and the coins limit reads it there. Its
  stock is three distinct open-pool items rolled on `stock-r<refreshes>`;
  the refreshes and the places sold since are the owner's private `log`
  entries (`popup-refresh`, `popup-sold:<place>`). It opens while picking,
  between tricks and on your turn, not in rescue, where a usable ability
  would hold the table. A buy needs a free slot on its player. Buyout opens
  only once every hand is empty and costs 10 per failed objective. Haggle
  takes 1 off every shop price, never below 1.
- Pack Rat: Big Pack adds a slot (the Rats still take one) and two items
  exclusive to the Pack Rat per bundle. The four exclusive items reuse
  retired effects at lower prices: Pocket Glass (the old Spyglass), Message
  in a Bottle (one extra whisper), First Aid Kit (the old Field Kit) and
  Signal Flare (the old Landmark), so the `supplies` and
  `completed-objective` target kinds stay in use. Their icons are spare
  frames of the same batch. Sturdy Straps frees the first item use of each
  attempt, whatever the item.
- Cartographer: Mapmaker is a passive (three routes, the third swapping
  the boss) and the reroll ability; Redraw is the power
  `cartographer.redraw`. The owner's doc lists two upgrades, Survey and
  Treasure Map; the third is still undesigned, so the Cartographer has two.
  Treasure Map fires while drafting: every player queues two special offers
  of three one-item bundles at 50% rare, and the purse gains 10. Survey
  shows each previewed camp's next deal; a replay deals afresh, so the
  survey names the first attempt only.
- Tests: the sources contract gives p0 a spare item and 40 coins, so
  selling and Buyout find a usable state, and skips its replay check in a
  stage window, which has no attempt to replay.
- Web: between camps, a usable power is a button under Set out (or in the
  Ready corner when there is none). Aiming one marks what it can pick: your
  item tiles (a sale shows the coins, "+2"), or teammates' crew rows; the
  pick uses it at once. A route-option power (the reroll) is a Reroll
  button on each route card instead. Route cards show a surveyed camp's
  objective cards and "Another boss at camp 3" on a swapped route. A
  bundle with more than two items lists names and tags only (Pack Rat,
  Rare), its rules on hover. The shop's rows close up to fit seven. The
  Pop-up Shop is a panel over the stump: a row per item with its price and
  a button per player, and Refresh. The muster lays the characters out
  three to a row, the silhouette at half size in a column with the pick
  under it, sized for nine (`musterBoxes`, `layout.test.ts`).
- e2e: the rescue tests give the host a Rope Ladder through the dev panel,
  since no base power rescues now.
- Magician: Card Trick swaps a card of yours for a place in a teammate's
  seeded fan (or a card you were shown). Any upgrade makes it two swaps a
  camp. Double Act's swap takes a whisper (limit `whispers`) and its passive
  adds two whispers less the swaps made, so one count serves both.
  Misdirection is its own ability between two teammates' fans, sharing the
  swaps; Switcheroo spends both (`shares`, `spends: 2`) to swap two
  players' open objectives.
- Perfumist: Pink Mist needs you to lead the trick it mists. The whisper
  ban is a `foldsLast` passive, so no item or Delegate lifts it before an
  upgrade. Turncoat changes what the lead card counts as (`identityOf`),
  so a lead that was an objective's card is lost with it; a joker lead
  cannot turn. Upside Down is the Thunderstorm's lowest-wins rule
  (`lowestSeat` moved to `content/helpers.ts`). Smelling Salts voids the
  last completed trick from rescue.
- Hermit: the vow is an attempt effect adding the goal `hermit:<seat>`
  (broken by any trick the Hermit wins); a second drop under Burden keeps
  one goal. Burden adds the objective at `camp-dealt`, already the Hermit's.
  Alms is its own ability, usable once per drop this camp: the owner's text
  ("when you drop an objective, a teammate gets +1 whisper") needs a
  teammate picked, and the drop's targets cannot depend on the upgrade.
- Power names are the working titles the owner's doc left open, kept to 11
  letters so the camp's kit chips show them whole: Lucky Start, Bottom
  Line, Card Trick, Pink Mist, Mapmaker, Compass, Megaphone, Lone Vow, Big
  Pack. Themes are shortened to fit a muster card where the owner's roles
  ran long.
- The leak check missed a case unit 12 opened: a card shown in a
  hallucination and later played face down (Cave, Night) was flagged
  because its id is hidden face down. Its id is public since the
  hallucination, so the check now exempts it there too (found by the
  worker's five-seat wiring run).
- Web: the Magician's picker fans each teammate's hand face down over the
  stump, one card back per place, then the cards you know face up; a hand
  already picked from this use is dimmed (Misdirection). Pink mist hangs
  over the stump while a misted trick is played. A seat under the vow
  wears a "vow" mark. The Whisper button tells a Perfumist "No whispers
  this camp" rather than "Used". Turncoat's suits come up in the pick tray.
- `sources.contract.test.ts` loses its list of target kinds awaiting the
  nine: the catalogue uses every kind.

### Implementation notes (review fixes)

- The river ends the camp (lead decision). Monsoon and Flooding no longer
  carry a `goals` guard: their shared `riverBody(late)` in
  `content/mods/flooding.ts` layers `objectiveStatus` so that, once
  `river(total) + late` tricks are complete, every objective is judged on a
  camp whose `totalTricks` is the tricks played. A no-tricks or exactly-n
  objective resolves on the tricks won so far and an unwon card objective
  fails, so the camp is decided at the flood. Before, a trick-count
  objective was only ever done at the last trick, so a Monsoon or Flooding
  camp with one could not be won. A flood that fails an objective now opens
  rescue like any failed objective (a failed goal never did). A camp cleared
  at the flood is paid for its unplayed tricks like any early clear.
- A disconnected seat no longer freezes the table (lead decision).
  `run/absent.ts`'s `absentSeatAction`, which the adapter's
  `autoPassRequest` returns after the existing grace, picks the first free
  character in registry order at the muster (J.D. first), abstains from a
  vote, takes the head offer's first bundle in the draft (a special offer
  too; it never uses Cash Out), readies in the loadout and at an event with
  the gear it has, and passes a gated window. Bots have no disconnect time,
  so the worker never auto-passes them. Each alarm submits one action per
  seat; the room reschedules while the seat is still awaited, so a muster
  takes two alarms (character, then ballot). This answers the open question
  on auto-readying.
