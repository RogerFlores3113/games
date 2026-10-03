# Expedition: characters, powers, items and the effect engine

Design, 2026-10-03. Synthesized from candidate A (evolve the engine) and candidate B (a
declarative event engine). Replaces gear entirely.

---

## Problem

The owner wants a character select at run start, a base power per character, a private
draft after each cleared camp that mixes power upgrades and items, passive and active effects
on both, real usage limits (a resource, once per run, once per camp, single use), and twelve
explicit target kinds: player (self), players, hand, card, objective, completed objective,
failed objective, whisper, won trick, card value, board, supplies.

Today's `GearDef` fuses ownership, timing, limits (always once per attempt, from
`attempt.gearUses`) and targeting. Targeting is interpreted twice: `validateTargets` in
`run/toolkit.ts` and the client mirror `candidateIdsForKind` in `apps/web/lib/expedition/local-ui.ts`.

"Failed objective" is unreachable today. `checkCampOutcome` (camp.ts) reports failure the moment
any objective fails, `campPhase` returns `ended`, and `settleIfDecided` (run/lifecycle.ts) tears
the attempt down in the same `advanceRun` call.

Kept: the pure rules package; toolkit ops as the only mutation surface, with card conservation;
`RuleModifier` layering (`isTrump` folded first, WR-03); seeded named RNG streams (A1); strict
per-seat views with the independent leak check; one file plus one registry line per entry, with
contract tests that need no edits. No compatibility layer: `ROOM_SCHEMA_VERSION` goes 5 to 6,
in-flight rooms reset, web and worker deploy together.

## Usage (caller's view)

### README excerpt: adding content

> **Add an item.** Create `content/items/<id>.ts` exporting `defineItem({...})`. Add one line to
> `content/items/registry.ts`. **Add a character.** Create `content/characters/<id>.ts`
> exporting `defineCharacter({...})` with its base power and exactly two upgrades in the same
> file. Add one line to `content/characters/registry.ts`. The contract tests iterate both
> registries, upgrades included, and need no edits.
>
> An active ability names a `window` (when), a `limit` (how often) and `targets` (from the twelve
> kinds). `apply` returns toolkit op data. `ctx.targets` arrives resolved and typed per kind; you
> never parse an id or validate a kind. `text` is one short sentence about the effect. Window and
> limit render as badges from data, so the text never repeats them.

### A character with a pool, a tuned base power and two upgrades

```ts
// content/characters/botanist.ts
export const botanist = defineCharacter({
  id: "botanist",
  name: "The Botanist",
  theme: "Brews jungle herbs that change how cards fall.",
  pool: { name: "Herbs", start: 2, max: 3, regain: (o) => (o.hasUpgrade("botanist.greenhouse") ? 2 : 1) },
  text: "A card in your hand counts one rank higher or lower this camp.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "pool", cost: 1 },
    targets: [{ kind: "card-value", spread: 1 }],
    apply: (ctx) => [{
      op: "add-modifier", lasts: "attempt", audience: "owner",
      params: { cardId: ctx.targets[0].cardId, rank: ctx.targets[0].rank },
    }],
    effect: (e) => ({ rankOf: (prev) => (card) => (card.id === e.params.cardId ? e.params.rank : prev(card)) }),
  }),
  upgrades: [
    defineUpgrade({ id: "botanist.greenhouse", name: "Greenhouse", text: "Regain 2 herbs after each cleared camp." }),
    defineUpgrade({
      id: "botanist.antidote",
      name: "Antidote",
      text: "Swap a failed objective for a fresh one.",
      active: ability({
        window: "rescue",
        limit: { kind: "pool", cost: 2 },
        targets: [{ kind: "failed-objective" }],
        canUse: (ctx) => freshObjectiveAvailable(ctx.camp) || "No fresh objective is left",
        apply: (ctx) => [{ op: "replace-objective", objectiveId: ctx.targets[0].objective.id }],
      }),
    }),
  ],
});
```

### A single-use item

```ts
// content/items/bait.ts
export const bait = defineItem({
  id: "bait",
  name: "Bait",
  text: "A card on the table can't win this trick.",
  active: ability({
    window: "in-trick",
    limit: { kind: "single-use" },
    targets: [{ kind: "card", where: "board" }],
    apply: (ctx) => [{ op: "add-modifier", lasts: "trick", audience: "public", params: { cardId: ctx.targets[0].cardId } }],
    effect: (e) => ({ trickWinner: (prev) => (plays) => winnerExcluding(prev, plays, (p) => p.card.id === e.params.cardId) }),
  }),
});
// content/items/registry.ts: one line, `bait,`
```

### How the run reducer calls the engine

```ts
// run/run-actions.ts (dispatcher shape unchanged; handlers swapped)
switch (action.type) {
  case "pick-character": return handlePickCharacter(run, seat, action.characterId, catalog);
  case "pick-draft":     return handlePickDraft(run, seat, action.sourceId, catalog);
  case "ready":          return handleReady(run, seat, catalog); // refused with character_pending during muster
  case "use-ability":    return delegated(useAbility(run, seat, action.sourceId, action.targets, catalog), catalog);
  case "skip-window":    return delegated(passWindow(run, seat, catalog), catalog); // pre-deal and rescue
  case "whisper":        return delegated(applyWhisper(run, seat, action, catalog), catalog);
  case "pick-objective":
  case "play-card":      return handleCampAction(run, seat, action, catalog);
}
// advanceRun (lifecycle.ts) after every accepted action, as today:
//   deal once no seat is pending in the pre-deal window;
//   settle a decided camp, unless the failure is only failed objectives and a seat is pending in rescue.
```

### How the view and the client call it

```ts
// adapter/view.ts
const yourAbilities = liveSourceIds(seat, catalog).flatMap((id) => {
  const s = abilityStatus(state, seatId, id, catalog); // null for passive-only sources
  return s === null ? [] : [toAbilityView(id, s)];     // steps carry server-computed choice ids
});

// apps/web/lib/expedition/local-ui.ts: candidateIdsForKind is deleted
const step = view.yourAbilities.find((a) => a.sourceId === ui.targeting.sourceId)!.steps[ui.targeting.selected.length];
PICKERS[step.kind].highlight(step.choices); // one picker per kind; legality comes only from the server
```

---

## Shape

### Module map

```
expedition/
  content/
    source-def.ts            SourceDef, CharacterDef, UpgradeDef, ItemDef, ActiveAbility, PassiveAbility,
                             UsageLimit, PoolDef, Owner, Tuned, AbilityContext, define* and ability helpers
    helpers.ts               winnerExcluding, freshObjectiveAvailable (shared effect helpers, pure)
    characters/<id>.ts       one file per character: base power plus its two upgrades
    characters/registry.ts   CHARACTERS
    items/<id>.ts            one file per item
    items/registry.ts        ITEMS
  run/
    catalog.ts         CATALOG = { characters, items, bosses } plus a flattened `sources` index
    targets.ts    NEW  TARGET_KINDS registry, resolveTargets, stepsFor
    visibility.ts NEW  visibleObjectives (moved out of adapter/view.ts; used by targets and the view)
    windows.ts    NEW  WINDOWS registry, currentWindow, gatedPendingSeatIds (pre-deal and rescue)
    usage.ts      NEW  ledger folds: remaining, poolBalance, liveSourceIds
    abilities.ts  NEW  abilityStatus, useAbility, passWindow (replaces use-gear.ts)
    toolkit.ts         applyToolkitOps: five ops added or extended; folds over RunState
    compose.ts         layers from live sources; trick-scoped effects filtered by derivation
    run-rules.ts       drops `capacity`
    draft.ts           offers mix one own-character upgrade with items
    lifecycle.ts       muster; no capacity or loadout; pool regain on clear; rescue-aware settle
    types.ts           SeatRun, LedgerEntry, ActiveEffect, RunAction, RunError changes
  rules.ts             CoreRules gains rankOf
  gear/                DELETED
```

A use is three files deep, as today: `run-actions.ts`, `abilities.ts`, `toolkit.ts`.

### Catalogue def types

```ts
// content/source-def.ts
export type SourceId = string; // "botanist", "botanist.antidote", "bait"

/** How often an active ability can fire. Exactly one per ability. */
export type UsageLimit =
  | { readonly kind: "per-camp"; readonly times: number } // counted by (camp, attempt) stamp; a replay is a fresh camp
  | { readonly kind: "per-run"; readonly times: number }  // counted over the whole ledger; survives replays
  | { readonly kind: "single-use" }                       // the item leaves the kit on use
  | { readonly kind: "pool"; readonly cost: number }      // the owner's character pool; characters and upgrades only
  | { readonly kind: "supplies"; readonly cost: number }; // the crew's supplies; never spends the last one

/** A character's personal resource. At most one per character. */
export type PoolDef = { readonly name: string; readonly start: number; readonly max: number; readonly regain: Tuned<number> };

/** What an ability or passive knows about its holder. Derived from SeatRun. */
export type Owner = { readonly seatId: string; hasUpgrade(upgradeId: SourceId): boolean };
/** A value an upgrade may tune. Evaluated fresh at each read, never stored. */
export type Tuned<T> = T | ((owner: Owner) => T);

export type ActiveWindow = "pre-deal" | "objective-pick" | "between-tricks" | "in-trick" | "rescue";
export type EffectParams = Readonly<Record<string, string | number | boolean>>;

export type ActiveAbility<S extends readonly TargetSpec[] = readonly TargetSpec[], P extends EffectParams = EffectParams> = {
  readonly window: ActiveWindow;
  readonly limit: Tuned<UsageLimit>;
  readonly targets: S;
  /** Target-free availability, checked after window and limit. true or a player-facing reason. */
  canUse?(ctx: AbilityContext<readonly []>): true | string;
  /** Rules that span targets or are specific to the entry, after every target resolved through its kind. */
  canTarget?(ctx: AbilityContext<S>): true | string;
  apply(ctx: AbilityContext<S>): readonly ToolkitOp<P>[];
  /** Required if and only if apply can emit add-modifier: the rule layer that op activates. */
  effect?(effect: ActiveEffect<P>): RuleModifier;
};

export type PassiveAbility = { modifier(owner: Owner): RuleModifier };

type SourceBase = {
  readonly id: SourceId;
  readonly name: string;
  readonly text: string; // one plain sentence, effect only
  readonly active?: ActiveAbility;
  readonly passive?: PassiveAbility;
  readonly art?: string;
};
export type ItemDef = SourceBase & { readonly kind: "item" };
export type UpgradeDef = SourceBase & { readonly kind: "upgrade"; readonly characterId: string };
export type CharacterDef = SourceBase & {
  readonly kind: "character";
  readonly theme: string;
  readonly pool?: PoolDef;
  readonly upgrades: readonly [UpgradeDef, UpgradeDef];
};
export type SourceDef = CharacterDef | UpgradeDef | ItemDef;

/** Keeps S and P literal so ctx.targets is a typed tuple; erases them for storage (the one cast). */
export declare function ability<const S extends readonly TargetSpec[], P extends EffectParams = EffectParams>(a: ActiveAbility<S, P>): ActiveAbility;
export declare function defineItem(def: Omit<ItemDef, "kind">): ItemDef;
export declare function defineUpgrade(def: Omit<UpgradeDef, "kind" | "characterId">): Omit<UpgradeDef, "characterId">;
/** Stamps characterId onto both upgrades, so an upgrade cannot name the wrong character. */
export declare function defineCharacter(def: Omit<CharacterDef, "kind" | "upgrades"> & { readonly upgrades: readonly [Omit<UpgradeDef, "characterId">, Omit<UpgradeDef, "characterId">] }): CharacterDef;

export type AbilityContext<S extends readonly TargetSpec[]> = {
  readonly self: string;
  readonly sourceId: SourceId;
  readonly owner: Owner;
  readonly run: RunState;          // read-only snapshot, before the use
  readonly camp: CampState | null; // null during pre-deal
  readonly rules: RunRules;
  readonly targets: TargetsOf<S>;  // resolved domain targets, positionally typed
  ownHand(): readonly ExpeditionCard[];
  handSize(seatId: string): number;
  /** Seeded. Up to n distinct opaque card ids from that hand. Throws outside apply. */
  randomCards(seatId: string, n: number): readonly string[];
  /** Seeded, 0..n-1. Throws outside apply. */
  randomIndex(n: number): number;
};
```

Encoded in types: an upgrade's `characterId` is stamped by its character; `effect` receives the
same `P` that `apply` emitted; `ctx.targets[1]` on a one-target ability is a compile error.
Contract tests cover the rest: unique ids; a `pool` limit only on a character or its upgrades,
and only when the character declares a pool; `effect` present if and only if `apply` can emit
`add-modifier`; `text` is one sentence with no trailing clarifier; every `TargetKind` is used by
at least one registered source.

### Target-kind registry

One entry per kind, exhaustive by mapped type (a missing kind is a compile error, the
`KindRegistry` idiom from `objectives.ts`). The load-bearing decision: each kind has a single
`choices` function that returns `{ id, target }` pairs. Validation is "the submitted id is among
the choices". Resolution is "take that pair's target". Enumeration, validation and resolution are
one function and cannot drift.

`choices` reads only what the seat may see. Its ids ship to the client in the view, so the
existing structural leak check covers every kind with no new code. Hidden things are targeted
as wholes (`hand`), never by element. Choices for one step never depend on earlier picks, so the
lists are complete and precomputable. Rules that span steps live in `canTarget`.

```ts
// run/targets.ts
export type TargetKind =
  | "self" | "player" | "hand" | "card" | "objective" | "completed-objective"
  | "failed-objective" | "whisper" | "won-trick" | "card-value" | "board" | "supplies";

/** Per-kind spec parameters (only what the catalogue uses), with each kind's choices. */
type SpecParams = {
  self: {};                                                  // [seat:<self>], auto-confirmed
  player: { readonly who: "teammate" | "anyone" };           // seat:<id>
  hand: {};                                                  // hand:<seat>, teammates with cards
  card: { readonly where: "my-hand" | "board" };             // card:<id>, own hand or current trick plays
  objective: { readonly whose: "unclaimed" | "mine" };       // objective:<id>, pending and visible
  "completed-objective": {};                                 // objective:<id>, done and visible
  "failed-objective": {};                                    // objective:<id>, failed and visible
  whisper: { readonly which: "sent" | "received" | "overheard" }; // whisper:<ordinal>
  "won-trick": {};                                           // trick:<index>, completed tricks you won
  "card-value": { readonly spread: 1 | 2 };                  // value:<cardId>:<rank>, own standard cards, 2..14
  board: {};                                                 // board, iff currentTrick.plays.length > 0
  supplies: {};                                              // supplies
};
export type TargetSpec = { [K in TargetKind]: { readonly kind: K } & SpecParams[K] }[TargetKind];

/** What `apply` receives per kind. Plain data, no ids to re-parse. */
export type TargetOf = {
  self: { readonly kind: "self"; readonly seatId: string };
  player: { readonly kind: "player"; readonly seatId: string };
  hand: { readonly kind: "hand"; readonly seatId: string; readonly size: number };
  card: { readonly kind: "card"; readonly cardId: string; readonly location: "hand" | "board" };
  objective: { readonly kind: "objective"; readonly objective: Objective };
  "completed-objective": { readonly kind: "completed-objective"; readonly objective: Objective };
  "failed-objective": { readonly kind: "failed-objective"; readonly objective: Objective; readonly cardWinnerSeatId: string | null };
  whisper: { readonly kind: "whisper"; readonly ordinal: number; readonly fromSeatId: string; readonly toSeatIds: readonly string[] };
  "won-trick": { readonly kind: "won-trick"; readonly trick: CompletedTrick };
  "card-value": { readonly kind: "card-value"; readonly cardId: string; readonly rank: StandardRank };
  board: { readonly kind: "board"; readonly trickIndex: number };
  supplies: { readonly kind: "supplies"; readonly current: number; readonly max: number };
};
export type TargetsOf<S extends readonly TargetSpec[]> = { readonly [I in keyof S]: TargetOf[S[I]["kind"]] };

export type SeatScope = { readonly run: RunState; readonly seatId: string; readonly camp: CampState | null; readonly rules: RunRules };
export type Choice<K extends TargetKind> = { readonly id: string; readonly target: TargetOf[K] };

export type TargetKindDef<K extends TargetKind> = {
  readonly kind: K;
  /** Prompt line, e.g. "Pick a teammate's hand". */
  describe(spec: Extract<TargetSpec, { kind: K }>): string;
  /** Every legal choice, visible to the seat only, in stable table order. */
  choices(scope: SeatScope, spec: Extract<TargetSpec, { kind: K }>): readonly Choice<K>[];
};

export declare const TARGET_KINDS: { readonly [K in TargetKind]: TargetKindDef<K> }; // one entry per kind

/** Length check, then each id must be among choices(scope, specs[i]). */
export declare function resolveTargets(scope: SeatScope, specs: readonly TargetSpec[], ids: unknown): { ok: true; targets: readonly unknown[] } | { ok: false; reason: string };
/** For the view: one step per spec, with prompt and choice ids. */
export declare function stepsFor(scope: SeatScope, specs: readonly TargetSpec[]): readonly AbilityStep[];
export type AbilityStep = { readonly kind: TargetKind; readonly prompt: string; readonly choices: readonly string[] };
```

`whisper` ids are the ordinal among whisper reveals, which matches the public log; the raw
`reveals` index would count private reveals. `card-value` picks a pair, so it is its own kind.
Each kind has one web picker (`Record<TargetKind, Picker>`): the kind is the affordance.

### Windows, including the rescue window

```ts
// run/windows.ts
export type WindowDef = {
  readonly id: ActiveWindow;
  readonly phrase: string;    // badge text: "Before the deal", "When an objective fails", "On your turn"
  readonly gated: boolean;    // gated windows wait for every eligible seat to use or pass
  isOpen(run: RunState, rules: RunRules): boolean;
  mayAct(run: RunState, rules: RunRules, seatId: string): boolean;
};

export const WINDOWS: { readonly [W in ActiveWindow]: WindowDef } = {
  "pre-deal":       notImplementedWindow(), // gated. attempt exists, camp null (today's D-12)
  "objective-pick": notImplementedWindow(), // open. campPhase objective-pick
  "between-tricks": notImplementedWindow(), // open. playing, currentTrick.plays.length === 0
  "in-trick":       notImplementedWindow(), // open. playing, plays > 0; mayAct only the current actor
  rescue:           notImplementedWindow(), // gated. outcome failed, failedObjectiveIds non-empty, no fired failure check
};

/** At most one window is open. The isOpen predicates are mutually exclusive by construction. */
export function currentWindow(run: RunState, rules: RunRules): ActiveWindow | null { throw new Error("not implemented"); }

/** Seats a gated window waits on: each owns a live active ability for this window whose
 * abilityStatus is usable, and has no `passed` ledger entry at the current stamp. Replaces
 * preDealPendingSeatIds. */
export function gatedPendingSeatIds(run: RunState, catalog: Catalog): readonly string[] { throw new Error("not implemented"); }
```

**When a failed objective exists without the camp being over.** The Core does not change.
`settleIfDecided` gains one rule: a failure caused only by failed objectives (no fired failure
check) is not settled while `gatedPendingSeatIds` is non-empty in the `rescue` window. A seat is
pending only if it owns a live rescue ability that is affordable, passes `canUse`, and has a
visible failed objective to pick. If nobody can respond, the camp fails in the same `advanceRun`
call, exactly as today.

While rescue is open, `campPhase` reports `ended`, so plays and picks are refused (`camp_over`)
and whispers too (`wrong_window`). Pending seats use a rescue ability or `skip-window`.
`advanceRun` re-derives after each action. No objective failed: play resumes on the next trick,
which `applyCampAction` already set up. Outcome `succeeded` (last trick): the camp clears. Still
failed and nobody pending: the camp fails.

Rescue is not a stored mode. It derives from objective statuses, the composed rules and the
ledgers. A pass is a ledger entry stamped `{ camp, attempt, trick: completedTricks.length }`, so a
later failure opens a fresh rescue and a replay starts clean. Fired failure checks (Camouflage,
Mutiny) never open rescue. Rescue ops: `remove-objective`, `replace-objective` (extended to owned
failed objectives), `reassign-objective`.

### Usage limits and where uses live

Per-actor state. Each seat appends only to its own ledger. The crew's `supplies` stays the one
shared resource, changed only by settle and by `adjust-supplies`.

```ts
// run/types.ts
export type Stamp = { readonly camp: CampNumber; readonly attempt: number; readonly trick: number | null };

export type LedgerEntry =
  | { readonly kind: "used"; readonly sourceId: SourceId; readonly at: Stamp; readonly poolCost: number } // 0 unless a pool limit
  | { readonly kind: "passed"; readonly sourceId: SourceId; readonly at: Stamp }                       // gated-window pass
  | { readonly kind: "regained"; readonly amount: number; readonly at: Stamp };                        // pool regain on a clear

export type SeatRun = {
  readonly seatId: string;
  readonly characterId: string | null;             // PUBLIC; null only during muster; unique in the crew
  readonly kit: readonly SourceId[];               // PUBLIC; upgrades and items in draft order; single-use items leave on use
  readonly draftOffer: readonly SourceId[] | null; // PRIVATE to seatId
  readonly ledger: readonly LedgerEntry[];         // never projected raw; append-only; survives replays
};
// Removed: ownedGearIds, equippedGearIds, AttemptState.gearUses.
```

```ts
// run/usage.ts
export type Remaining =
  | { readonly kind: "uses"; readonly left: number; readonly of: number }        // per-camp, per-run
  | { readonly kind: "single-use" }                                              // held means available
  | { readonly kind: "pool"; readonly balance: number; readonly max: number; readonly cost: number }
  | { readonly kind: "supplies"; readonly cost: number };

/** per-camp: times minus `used` entries stamped (camp, attempt). per-run: times minus all
 * `used` entries. pool: poolBalance >= cost. supplies: run.supplies > cost. */
export function remaining(run: RunState, seatId: string, sourceId: SourceId, catalog: Catalog): Remaining { throw new Error("not implemented"); }
/** start, then in ledger order: minus poolCost, plus regained capped at max. */
export function poolBalance(seat: SeatRun, catalog: Catalog): number | null { throw new Error("not implemented"); }
/** [characterId, ...kit]: every source that contributes passives and abilities. */
export function liveSourceIds(seat: SeatRun, catalog: Catalog): readonly SourceId[] { throw new Error("not implemented"); }
```

Spending is the engine's job. `useAbility` appends `used` (with `poolCost`), applies an implicit
`adjust-supplies` for a supplies limit, and removes a single-use item from the kit. A successful
settle appends `regained` for each pooled character (once per decided attempt). Replays need no
reset code: per-camp counts filter by stamp, per-run counts ignore it, pools and kit are
run-level. Single-use availability is "in the kit", so a re-drafted consumable is fresh. Restores
cap at `STARTING_SUPPLIES` (3).

### Ability pipeline

```ts
// run/abilities.ts
export type AbilityStatus =
  | { readonly usable: true; readonly steps: readonly AbilityStep[]; readonly remaining: Remaining }
  | { readonly usable: false; readonly error: RunError; readonly reason: string; readonly remaining: Remaining };

/** null for a source with no active ability. Order: live (not_owned) -> window open and mayAct
 * (wrong_window) -> limit (ability_spent / cannot_afford) -> canUse (ability_unavailable) ->
 * every step has a choice (ability_unavailable). */
export function abilityStatus(run: RunState, seatId: string, sourceId: SourceId, catalog: Catalog): AbilityStatus | null { throw new Error("not implemented"); }

/** abilityStatus -> resolveTargets (invalid_target) -> canTarget (invalid_target) -> apply with a
 * ctx built from the run before the use -> applyToolkitOps -> spend (ledger, supplies, kit) ->
 * public log entry (actor and subject seats, never a card). */
export function useAbility(run: RunState, seatId: string, sourceId: SourceId, targetIds: unknown, catalog: Catalog): AdapterResult<RunState, RunError> { throw new Error("not implemented"); }

/** skip-window: in the open gated window, appends `passed` for each of the seat's pending
 * sources. nothing_to_skip when the seat is not pending. */
export function passWindow(run: RunState, seatId: string, catalog: Catalog): AdapterResult<RunState, RunError> { throw new Error("not implemented"); }
```

### Effects and rule layers

```ts
// run/types.ts
export type ActiveEffect<P extends EffectParams = EffectParams> = {
  readonly sourceId: SourceId;
  readonly seatId: string;
  readonly atTrick: number;              // currentTrick.index at activation
  readonly lasts: "attempt" | "trick";   // "trick": live only while currentTrick.index === atTrick
  readonly params: P;
  readonly audience: "public" | "owner"; // who sees params in the view
};
```

Layers: base, boss, then per seat (seat order) each live source's `passive.modifier(owner)` in
`[character, ...kit]` order, then each live effect's `active.effect(effect)` in order. Trick-scoped
effects are filtered by derivation: `applyCampAction` resolves `trickWinner` while
`currentTrick.index === atTrick`, so Bait, Puffball and Howler Call bend one trick. Used between
tricks, `atTrick` is the next trick.

Core change: `CoreRules.rankOf(card): number` (default `trumpStrength`), folded first beside
`isTrump` ("card-reading hooks fold first", WR-03 generalised). The base `trickWinner` reads it;
ties go to the earliest play. `legalPlays` reads suits and is untouched. `RunHooks.capacity` goes.
`winnerExcluding(prev, plays, excluded)` calls `prev` on the remaining plays. A trick has 3 to 5
plays and one is excluded, so it never throws and always names a seat that played (WR-05).

### Toolkit ops

Kept: `move-card`, `swap-cards`, `swap-objectives`, `remove-objective`, `reveal`,
`set-next-leader`, `cancel-boss-twist`, `log`. Changed and added:

```ts
export type ToolkitOp<P extends EffectParams = EffectParams> =
  | /* ...kept ops... */
  | { readonly op: "add-modifier"; readonly lasts: "attempt" | "trick"; readonly params: P; readonly audience: "public" | "owner" }
  | { readonly op: "replace-objective"; readonly objectiveId: string }
      // EXTENDED: unowned (as today), or owned and failed. An owned one becomes a plain win-card for the
      // same owner, using the first objectiveDeck identity whose card is still in a hand.
  | { readonly op: "reassign-objective"; readonly objectiveId: string; readonly toSeatId: string } // owner change
  | { readonly op: "reassign-trick"; readonly trickIndex: number; readonly toSeatId: string }      // winner change; cards untouched
  | { readonly op: "share-reveal"; readonly whisperOrdinal: number; readonly audience: readonly string[] }
      // copies a whisper's identity and pinned fromSeatId (WR-03) to a new audience; source = the ability's sourceId
  | { readonly op: "adjust-supplies"; readonly delta: number };  // result must stay in [1, STARTING_SUPPLIES]
```

`applyToolkitOps(run, actorSeatId, sourceId, ops)` now folds over `RunState` (supplies are
run-level). No new op moves cards. Each throws on its own invariant (POLICY A3).

### RNG streams

| Draw | Stream name |
|---|---|
| Draft, upgrade slot | `expedition-draft:camp{N}:seat{id}:upgrade` |
| Draft, item slots | `expedition-draft:camp{N}:seat{id}:items` |
| Ability draws | `expedition-ability:camp{N}:attempt{A}:seat{id}:use{k}:draw{j}` |
| Boss, deal, trick-count, face-down | unchanged |

`k` is the seat's ledger length before the use (unique for the run). `j` counts draws inside one
`apply`, held by the context, so authors never name a purpose. `replace-objective` and character
select draw nothing.

### Run flow, actions and errors

- **Muster.** `createRun` starts every seat with `characterId: null`. Run phase `muster` is
  derived (any seat without a character). `pick-character` is public, final, and unique within
  the crew. `ready` is refused with `character_pending` until the seat has a character. Once all
  seats are ready, `startAttempt` runs exactly as today. There is no run-start draft.
- **Draft** after each cleared camp 1 to 5: three private offers. Slot 1 is one of the seat's own
  character's unowned upgrades, if any remain. The other slots are items not in the seat's kit,
  so a consumed item can return. Five clears bound the kit at five sources. There is no capacity,
  loadout, `size` or `set-loadout`.
- **Actions:** add `pick-character { characterId }`; `pick-draft { sourceId }`; `use-gear` becomes
  `use-ability { sourceId, targets: string[] }`; remove `set-loadout`. `skip-window` covers
  pre-deal and rescue.
- **Errors:** add `unknown_character`, `character_taken`, `character_pending`, `not_owned`,
  `ability_spent`, `cannot_afford`, `ability_unavailable`. Remove `gear_not_owned`,
  `duplicate_gear`, `over_capacity`, `gear_not_equipped`, `gear_already_used`,
  `gear_unavailable`. Keep `wrong_window`, `invalid_target`, `nothing_to_skip`.

### View and schema

```ts
type ExpeditionSeatView = {
  seatId: string; characterId: string | null; kit: string[]; ready: boolean; draftPending: boolean;
  pool: { balance: number; max: number } | null;                // public
  usage: { sourceId: string; remaining: RemainingView }[];       // public, every live source with an active ability
};
type ExpeditionAbilityView = {                                   // viewer only
  sourceId: string; usableNow: boolean; reason: string | null;
  steps: { kind: TargetKind; prompt: string; choices: string[] }[]; // [] unless usableNow
};
// ExpeditionView: runPhase adds "muster"; + yourAbilities, yourDraftOffer: string[] | null;
//   - yourGear, yourOwnedGearIds, yourCapacity, yourBaseCapacity.
// ExpeditionAttemptView: gearWindow -> window (ActiveWindow | null);
//   preDealPendingSeatIds -> pendingSeatIds; - gearUses;
//   + rescue: { failedObjectiveIds: string[] } | null   (visible objectives only);
//   effects: { sourceId, seatId, atTrick, lasts, params: Record<string, string | number | boolean> | null }
//            (params null unless audience is public or the viewer is the owner).
// ExpeditionLogEntryView: gearId -> sourceId.
// Camp: plays[].effectiveRank and yourHand[].effectiveRank: number | null (set only when rankOf differs).
```

Leak check: `ownedGearIds` leaves `FORBIDDEN_VIEW_KEYS` (the kit is public) and `ledger` joins it.
The existing hidden-id scan covers effect params and every kind's choices. The schema mirrors all
of this with `z.strictObject`. `GEAR_DISPLAY` becomes `SOURCE_DISPLAY` (name, text, kind,
characterId, window phrase, limit badge, target kinds).

### Interface depth, and what is not done

Authors learn four helpers, twelve kinds' params and fourteen op shapes; never spending, gating,
target parsing, RNG naming or projection. The reducer learns three functions, the web one shape
(`steps`). Not done: no event bus, no effect DSL, one limit per ability, no hidden-element
targeting, no item pools, no restore-a-use op, no whisper cap.

---

## Synthesis decision

**Base: candidate A.** Content stays TypeScript defs with `apply(ctx) -> ToolkitOp[]` and
`RuleModifier` passives. B's declarative DSL (`Op<Spec>`, `Rule`, `Condition`, selectors,
`RULE_COMPILERS`) is rejected as the authoring model: three parameterised unions and an
interpreter that v1 does not need, duplicating the toolkit op layer.

**Grafted from B, or agreed by both:** server-computed choices with validation derived from them
(A's string ids over B's `EntityRef`, since the wire stays `string[]` and the leak checker scans
strings; B's one picker per kind over A's `PickAffordance` enum). Rescue opens only when a seat
can respond (A's derived form over B's stored `Interrupt`: no stored mode, no "same failing set"
check). RNG without purpose strings (a per-apply draw counter, simpler than B's selector paths).
Separate draft streams for the upgrade and item slots (A's slot-order stream dropped). Consumed
items leave the kit and can be drafted again (B), so single-use needs no per-instance ids.

**Derived events (`on` hook): not adopted.** The bar was two catalogue entries that need it. None
do: event-flavoured effects are passives over derived state (Call and Response reads the attempt
log inside `whispersPerCamp`). B's entries that mutate at an event (Dawn Patrol, Forager, Glow
Moss) were cut.

**Usage limits: A's ledger.** B needs four structures (`AttemptSeat.resolutions`,
`runResolutions`, `passedPreDeal`, `Interrupt.passedSeatIds`); A needs one. Neither resets on
replay. Trimmed to three entry kinds.

**Defects found, and fixes:**

- A allowed item pools (Lantern, a `PoolId` namespace). An item pool without regain is a per-run
  limit. Pools are now one per character, with no ids.
- A's `restore-use` was the only cross-seat ledger write. Cut with its only user (Lucky Idol).
- A's `whisper:<n>` used the raw `reveals` index, which counts private reveals. Now the ordinal.
- A's "last pick starts camp 1" was a second way to start an attempt. Muster gates `ready`.
- A raised the supply cap to 5. Restores cap at `STARTING_SUPPLIES` instead.
- B's `pardonedObjectiveIds` changed Core `CampState`, and `cardValue` plus `canWin` were two Core
  hooks. Here the Core only gains `rankOf`; "can't win" is a trick-scoped `trickWinner` override.
- B's Switchback ("trumps can't win") has no honest outcome when a joker is led and only the other
  joker follows. Cut.

**Lead decisions kept:** no capacity or loadout; five drafts bound the kit; a disconnected seat
stalls a gated window, with pre-deal parity (a risk below).

## Tradeoffs accepted

- We accept views that carry choice lists (worst case Whetstone, about 70 short ids) in exchange
  for zero client legality code and leak coverage per kind for free.
- We accept step choices that ignore earlier picks (Detour may list a seat `canTarget` refuses)
  in exchange for complete, precomputable lists.
- We accept that a gated window waits on a disconnected holder in exchange for no timers.
- We accept base powers that read `owner.hasUpgrade` in exchange for one-file characters.
- We accept a public kit: everything owned is in play, and the crew plans better seeing it.
- We accept objective statuses that are not monotone under the reassign and remove ops. The Core
  property in `camp.property.test.ts` drives Core actions only and is unaffected; the run property
  suite restates monotonicity as "absent those ops".
- We accept that old logs stop replaying byte-identically (new RNG index). Rooms reset anyway.
- We accept text without window or limit in exchange for one source of truth: badges from the def.

## Alternatives considered

- **A declarative effect DSL (B's shape).** Inspectable data, but complexity moves into three
  unions, a selector walker and per-rule compilers, and each new mechanic needs an interpreter
  change. More to learn per mechanic, and it duplicates the op layer.
- **A trigger or event bus.** More expressive, but reactions become ordered callbacks with
  re-entrancy (a reaction causes a failure that triggers a reaction) and need a cascade limit.
  Derived passives and one gated window cover v1.
- **Shared candidate functions on client and server.** Two inputs (view and RunState) for one
  function means two projections that must agree. Shipping choices removes the problem.
- **Stored counters for uses and pools.** Simpler to read, but they bring back reset-on-replay
  bookkeeping and lose the stamped passes rescue needs.
- **A failure grace step.** It changes the base rules for crews that cannot rescue.

## Open questions and risks

- Should the worker auto-pass a seat that stays disconnected in a gated window (a synthetic
  `skip-window`)? Pre-deal has the same exposure today.
- Under a face-down objective twist, the Medic sees and rescues only their own objectives. Should
  rescue see every failed objective, since the failure is public anyway?
- Whisper bonuses come from five sources. Is a per-seat cap needed? None is added before playtests.
- Is Rally too strong? It turns any failed card objective into a success once per run.
- Should ordered objectives be droppable? Dropping one relaxes the order checks on the others.
- Risk: the in-trick window widens the mid-trick surface. The bridge and e2e must cover the
  current actor acting before their play.
- Risk: during rescue `campPhase` is `ended`. Web and worker code reading `ended` as "camp over"
  must check `attempt.rescue` first, or the table shows a failure banner during a pause.
- Risk: unit 6 is large and crosses four packages. Units 1 to 5 land every orthogonal piece first.

### Lead decisions (2026-10-03)

- Disconnected seats are not auto-passed in v1. Pre-deal already behaves this way. Revisit after playtests.
- Rescue sees every failed objective, even under a face-down twist. A failure is public.
- No whisper cap before playtests.
- Ordered objectives may be dropped. The remaining order checks relax with them.
- Rally stays. It is once per run and only for card objectives.

## Next implementation step

Add `CoreRules.rankOf`, folded first beside `isTrump`, have the base `trickWinner` read it, and
add a test that a shifted rank changes a trick's winner (unit 1).

---

## Catalogue

**When** is the window badge: BT between tricks (the default, shown with no badge), OP while
picking objectives, PD before the deal, IT on your turn, RS when an objective fails, Always for
passives. **Limit** is the usage badge. Neither is repeated in the text.

### Characters

| Character | Silhouette prop | Theme | Pool |
|---|---|---|---|
| The Scout | Spyglass raised to one eye | Eyes in the canopy | none |
| The Guide | Machete held high | Cuts the trail | none |
| The Botanist | Wide straw hat with a flower | Brews jungle herbs | Herbs: start 2, max 3, regain 1 per cleared camp |
| The Medic | Shoulder satchel with a rolled bandage | Keeps the crew walking | none (spends supplies) |
| The Signaller | Talking drum slung at the hip | Talks in drums | none |
| The Cartographer | Map tube across the back | Redraws the route | none |

### Powers (base power in bold, then two upgrades)

| Character | Power | Text | When | Limit | Targets | 16x16 icon |
|---|---|---|---|---|---|---|
| Scout | **Spyglass** | See a random card in a teammate's hand. | BT | 1 per camp | hand | Brass spyglass, diagonal |
| Scout | Keen Eye | Your Spyglass shows two cards. | Always | tunes Spyglass | (hand) | Eye with a gold glint |
| Scout | Eavesdrop | See the card in a whisper between two teammates. | BT | 1 per camp | whisper (overheard) | Cupped ear with a sound arc |
| Guide | **Machete** | Choose who leads the next trick. | BT | 1 per camp | player (anyone) | Machete blade |
| Guide | Pathfinder | Your Machete works twice per camp. | Always | tunes Machete | (player) | Two boot prints |
| Guide | Howler Call | The lowest card of the led suit wins this trick. | IT | once per run | board | Howler monkey head, mouth open |
| Botanist | **Herb Tonic** | A card in your hand counts one rank higher or lower this camp. | BT | 1 herb | card value (1) | Green vial with a leaf |
| Botanist | Greenhouse | Regain 2 herbs after each cleared camp. | Always | tunes Herbs | none | Glass dome over a sprout |
| Botanist | Antidote | Swap a failed objective for a fresh one. | RS | 2 herbs | failed objective | Stoppered blue bottle |
| Medic | **Triage** | Drop a failed objective. | RS | 1 supply | failed objective | Rolled white bandage |
| Medic | Rally | Give a failed objective to the player who won its card. | RS | once per run | failed objective | Raised hand holding a card |
| Medic | Field Kit | Restore 1 supply. | BT | once per run | supplies | Small crate with a green leaf |
| Signaller | **Talking Drum** | You may whisper twice each camp. | Always | none | none | Hourglass drum |
| Signaller | Loud Call | Show one of your whispers to everyone. | BT | 1 per camp | whisper (sent) | Conch shell |
| Signaller | Call and Response | A teammate you whisper to may whisper once more this camp. | Always | none | none | Two speech arcs facing each other |
| Cartographer | **Redraw** | Replace a face-up objective with a new one. | OP | 1 per camp | objective (unclaimed) | Pencil over a card |
| Cartographer | Detour | Give one of your open objectives to a teammate. | BT | 1 per camp | objective (mine), player (teammate) | Bent arrow |
| Cartographer | Landmark | The owner of a completed objective may whisper once more this camp. | BT | 1 per camp | completed objective | Flag on a stone cairn |

### Items (13)

| Item | Text | Type | When | Limit | Targets | 16x16 icon |
|---|---|---|---|---|---|---|
| Trained Monkey | Swap a card in your hand with a random card from a teammate's hand. | active | BT | 1 per camp | card (my hand), hand | Small monkey holding a card |
| Pack Mule | Give a trick you won to a teammate. | active | BT | 1 per camp | won trick, player (teammate) | Mule head with a pack |
| Parrot | Pass a whisper you received on to a teammate. | active | BT | 1 per camp | whisper (received), player (teammate) | Red parrot in profile |
| Trail Map | Swap all your open objectives with a teammate's. | active | BT | once per run | player (teammate) | Folded map with a dotted path |
| Rain Poncho | Cancel this camp's boss twist, and nobody may whisper this camp. | active | PD | once per run | none | Yellow poncho |
| Smoke Signal | Everyone may whisper once more this camp. | resource | BT | 1 supply | none | Smoke puffs over a fire |
| Whetstone | A card in your hand counts up to two ranks higher or lower this camp. | consumable | BT | single use | card value (2) | Grey stone with a spark |
| Puffball | You can't win the next trick. | consumable | BT | single use | self | Puffball mushroom with spores |
| Bait | A card on the table can't win this trick. | consumable | IT | single use | card (board) | Banana on a string |
| Camouflage | Drop one of your open objectives, and the camp fails if you win a trick. | consumable | BT | single use | objective (mine) | Leafy cloak |
| Rope Ladder | Drop a failed objective. | consumable | RS | single use | failed objective | Rope ladder |
| Heavy Pack | You may whisper once more each camp, but a failed camp costs 1 more supply. | passive | Always | none | none | Bulging backpack |
| Mosquito Net | Boss twists can't stop your whispers. | passive | Always | none | none | Net with a mosquito |

### Entry rules

- Camouflage `canUse`: you have won no trick this camp (as `gear/ghost.ts` today). Its failure is
  a fired check, so it never opens rescue.
- Rain Poncho `canUse`: this camp has an uncancelled boss twist. Pre-deal therefore gates only
  boss camps.
- Field Kit `canUse`: supplies are below the start ("Supplies are full").
- Mosquito Net is a passive layer, so it overrides a boss's `whisperAllowed: false` for its owner.
  Rain Poncho's effect layers after passives and still silences the owner.
- Antidote `canUse`: some objective-deck identity is still in a hand. Rally `canTarget`: card
  objectives only. Pack Mule `canTarget`: the trick does not settle a card objective.
- Puffball, Bait and Howler Call are trick-scoped `trickWinner` overrides. Herb Tonic and
  Whetstone are attempt-scoped `rankOf` overrides with owner audience. Landmark and Smoke Signal
  are attempt-scoped `whispersPerCamp` effects. Loud Call, Parrot and Eavesdrop use `share-reveal`.

### Mix and coverage

- Single use (5): Whetstone, Puffball, Bait, Camouflage, Rope Ladder.
- Once per run (5): Trail Map, Rain Poncho, Howler Call, Rally, Field Kit.
- Resource users (4): Herb Tonic and Antidote (herbs), Triage and Smoke Signal (supplies).
- Passive (7): Talking Drum, Call and Response, Heavy Pack, Mosquito Net, and the tuning
  upgrades Keen Eye, Pathfinder and Greenhouse.

Target coverage: self (Puffball); player (Machete, Detour, Pack Mule, Parrot, Trail Map); hand
(Spyglass, Trained Monkey); card (Trained Monkey, Bait); objective (Redraw, Detour, Camouflage);
completed objective (Landmark); failed objective (Triage, Rally, Antidote, Rope Ladder); whisper
(Eavesdrop, Loud Call, Parrot); won trick (Pack Mule); card value (Herb Tonic, Whetstone); board
(Howler Call); supplies (Field Kit). `sources.contract.test.ts` asserts the union equals `TargetKind`.

Balance: information stays scarce (Spyglass, Trained Monkey and Eavesdrop each give one card,
Keen Eye two; Loud Call and Parrot only re-share a sanctioned whisper). Every rescue costs a
supply (never the last), two of at most three herbs, a once-per-run, or a consumable. Machete,
Detour, Pack Mule and Puffball reward a crew that read each other's whispers. Smoke Signal and
Heavy Pack trade lives for words.

---

## Migration units (in order; each ends green)

`npm test` is Vitest, `npm run typecheck` is `tsc -b`, `npm run test:e2e` is Playwright.

### 1. Core rank seam

Add `CoreRules.rankOf`, folded first beside `isTrump`; `trickWinner` reads it. Green check
**`rank-of`**: `trick.test.ts` gains "a shifted rank changes the trick winner" and "a rank tie
goes to the earliest play"; `npm test` and `npm run typecheck` pass.

### 2. Effect generalisation

Add `lasts`, `params`, `audience` to `ActiveEffect` and `add-modifier` (gear passes defaults);
filter trick-scoped effects; add `winnerExcluding`. Green check **`trick-scoped-effects`**:
`compose.test.ts` gains "a trick-scoped effect bends exactly one trick" and a fast-check case
"winnerExcluding always returns a seat that played"; `npm test` passes.

### 3. Target-kind registry and shared visibility

Add `run/targets.ts` with all twelve kinds; move the face-down filter from `adapter/view.ts` to
`run/visibility.ts`; map today's four kinds onto it (teammate to player, own-card to card,
face-up-objective and own-objective to objective). Green check **`target-kinds-contract`**: a new
`targets.contract.test.ts` checks per kind, at 3, 4 and 5 players, that choices are stable, each
resolves to itself, a foreign id is refused, and a view carrying them passes `view-leak-check`
for every seat. `gear.contract.test.ts` and `view.test.ts` pass unchanged.

### 4. New and extended toolkit ops

Add `reassign-objective`, `reassign-trick`, `share-reveal`, `adjust-supplies`; extend
`replace-objective`; fold over `RunState`. Green check **`toolkit-ops`**: `toolkit.test.ts` gains
a success and an invariant-throw case per op, plus conservation over random batches.

### 5. Windows registry and the rescue window

Add `run/windows.ts` (five windows, `gatedPendingSeatIds`), the in-trick window and rescue-aware
settle. Production gear has no rescue or in-trick entry; a test-only def drives both. Green check
**`rescue-window`**: `lifecycle.test.ts` gains "a rescue holder pauses settle", "a pass settles the
camp as failed", "a rescue that clears every failure resumes play" and "with no rescue holder the
camp fails at once"; `run.property.test.ts` passes with the test def (every run ends, never
throws, round-trips JSON).

### 6. The swap (one change across packages)

Rules: `content/` (6 characters, 13 items), `usage.ts`, `abilities.ts`, the ledger, muster, the
draft rewrite, pool regain; delete capacity, loadout, `size`, `set-loadout`, `use-gear`, `gear/`,
`use-gear.ts`, `gear.contract.test.ts`. Adapter: view, view-types, `SOURCE_DISPLAY` (characters,
upgrades, items), request guards, leak-check keys. Schema: strict shapes, `ROOM_SCHEMA_VERSION` 6.
Worker: error map; the wiring test's random player picks from `steps[].choices`. Web, compile
level: targeting reads `steps[].choices`, `candidateIdsForKind` deleted, no loadout packing.

Green check **`sources-contract`**: `npm test` and `npm run typecheck` pass monorepo-wide. The new
`sources.contract.test.ts` iterates every source: shape, one-sentence text, effect iff
add-modifier, pool limits only on pooled characters, determinism, conservation, JSON round-trip,
per-seat leak check, limits (n+1th use refused, single-use leaves the kit, per-run survives a
replay, per-camp resets on replay) and twelve-kind coverage. `e2e/expedition-camp.spec.ts` passes
with gear steps replaced by ability steps.

### 7. Web experience

Muster scene with six silhouettes; draft cards with window and limit badges; one picker per kind
(seat, teammate hand, own or table card, objective card, trick pile, whisper bubble, rank dial,
table, supply crates); the rescue prompt (use or pass, "waiting on" a seat); the in-trick
affordance; bridge ids `source:<id>`, `trick:<i>`, `whisper:<n>`, `supplies`; the tour. Green
check **`expedition-e2e`**: `npm run test:e2e` passes, including a new
`e2e/expedition-abilities.spec.ts` covering muster, a draft pick, one use per picker, and a rescue
followed by resumed play.

### 8. Art and docs

Icons for 18 powers and 13 items move from `sprites/gear/` to `sprites/sources/<id>.png`, plus
six silhouettes, through `apps/web/art/expedition`. README recipes: add an item, a character, a
target kind, a window. Green check **`source-icons`**: a new
`apps/web/lib/expedition/source-icons.test.ts` asserts every `SOURCE_DISPLAY` id has
`public/expedition/sprites/sources/<id>.png`; `npm test` passes.

---

## Implementation notes

- Unit 2: `EffectParams` lives in `run/types.ts` beside `ActiveEffect`, and `ActiveEffect` keeps
  `gearId` until the swap. `content/source-def.ts` arrives in unit 6, which moves the type and
  renames the field to `sourceId`.
- Unit 3: choice ids carry a kind prefix (`card:<id>`), which the leak check's exact-leaf scan
  would miss. `view-leak-check.ts` now also tests each `:`-separated segment of a string leaf
  against the hidden ids, so the per-kind coverage the spec promises is real. Canary I proves it.
- Unit 3: until the swap, gear keeps bare target ids. `validateTargets` maps each gear kind to a
  registry spec and prefixes the id before `resolveTargets`; both go in unit 6.
- Unit 3: `card-value` offers ranks around the printed rank, not the composed `rankOf`, so a
  second tonic on the same card replaces the first instead of stacking.
- Unit 4: the random-batch property found `swap-cards` with `seatA === seatB` duplicating a card,
  caught only by the conservation backstop. It now throws on its own invariant, like `move-card`.
- Unit 4: `reassign-objective` and `reassign-trick` throw when the new seat is the current one, and
  `reassign-objective` refuses an unowned objective (taking one is a pick). Rally's `canTarget`
  must refuse an ordered objective whose card its owner won.
- Unit 5: gear has no stamped ledger yet, so a rescue pass marks the seat's rescue gear skipped for
  the rest of the attempt. The stamped `passed` entry, which lets a later failure reopen rescue for
  that seat, arrives with the ledger in unit 6.
- Unit 5: `gatedPendingSeatIds` requires a choice for every target step; `gearAvailability` does
  not, so existing gear keeps its `usableNow` answers until `abilityStatus` replaces it.
- Unit 5: until the view swap, `gearWindow` reports `in-trick` and `rescue` as null and
  `preDealPendingSeatIds` reads the gated list only in pre-deal. `ExpeditionGearWindow` excludes the
  two new windows and `GEAR_DISPLAY` throws if production gear uses one, so the web compiles
  unchanged.
- Unit 5: the lead decision "rescue sees every failed objective" lands here, in
  `run/visibility.ts` and the leak check's independent rule, because rescue is what makes a failed
  objective observable in a live camp.
- Unit 5: the test-only defs (`WINDOW_TEST_GEAR`: a rescue rope and an in-trick duck) live in
  `run/run-test-support.ts`. `run.property.test.ts` adds them to its catalogue and gains a property
  that guarantees them on alternate seats and asserts rescue was reached.
- Unit 6: `abilityStatus` takes a live source of the seat and throws otherwise; `useAbility` answers
  `not_owned` for a non-live source before asking it, and `ability_unavailable` for a passive-only
  one. `canTarget` refusals are `invalid_target`, as the spec says.
- Unit 6: a seat's second `pick-character` is `wrong_phase` (its muster is done), and `skip-window`
  with no gated window open is `wrong_window`.
- Unit 6: `createRun({ seatIds, seed })` and `liveSourceIds(seat)` take no catalogue; muster needs
  none and `[characterId, ...kit]` reads only the seat.
- Unit 6: when no upgrade of the seat's character remains, all three draft slots are items.
- Unit 6: the leak check treats ids named in an effect the viewer may read as known, like a reveal.
  A Herb Tonic'd card later swapped away keeps its id in its owner's effect params.
- Unit 6: Howler Call compares printed ranks; a `RuleModifier` layer has no handle on the composed
  `rankOf`, so a tonic does not move a card inside that one trick.
- Unit 6: Pack Mule's `canTarget` reads every objective, so under Thick Fog a refusal hints that a
  hidden objective's card is in that trick (the WR-02 oracle). Open; the alternative lets a mule
  settle a hidden objective.
- Unit 6: `CHARACTER_DISPLAY` sits beside `SOURCE_DISPLAY` (theme, pool, upgrade ids); badges show
  the untuned limit. The view has no list of characters, so muster pickers read
  `CHARACTER_DISPLAY`.
- Unit 6: `attempt.pendingSeatIds` reports either gated window, and `attempt.rescue` is set only
  while the rescue window is open.
- Unit 6 (web, compile level): muster renders in the fireside scene, whose draft panel offers the
  untaken characters and then the draft; the backpack zone shows the kit with no packing. Camp chips
  are `source:<id>` (yours) and `seat-source:<seat>:<id>`; targeting reads `steps[].choices`, and a
  clicked seat, hand card or objective counts only when the current step offers it. The pre-deal
  panel is a `gate` that also covers rescue (Use or Skip). Pickers for whisper, won-trick,
  card-value, board and supplies steps, icons and badges on tiles are unit 7 and 8 work.
- Review fix: stacked "can't win" effects (Puffball, Bait) ignore the exclusion that would empty
  the trick. Each layer filters what the outer layers left; when nothing remains it passes its
  input through, so the trick still has a winner who played. Three Puffballs in a three-seat camp
  leave the trick to the base rules.
