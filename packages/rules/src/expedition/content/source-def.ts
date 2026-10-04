// The catalogue's def types: characters (each with a base power and exactly
// two upgrades), upgrades and items are all sources. A source may carry an
// active ability (a window, a limit and typed targets) and a passive rule
// layer. An item's `uses` is its limit, counted per owned instance. `apply`
// returns toolkit op data; the engine owns spending, gating, target
// resolution, RNG naming and projection.

import type { DraftOffer, DraftShape } from "../run/draft";
import type { EngineEvent, EngineEventType } from "../run/react";
import type { RuleModifier, RunRules } from "../run/run-rules";
import type { Target, TargetSpec, TargetsOf } from "../run/targets";
import type { ToolkitOp } from "../run/toolkit";
import type { Catalog, RunState, SeatEffect } from "../run/types";
import type { ActiveWindow } from "../run/windows";
import type { CampState, ExpeditionCard } from "../state";

export type SourceId = string;

/** How often an active ability can fire. Exactly one per ability. */
export type UsageLimit =
  | { readonly kind: "per-camp"; readonly times: number } // counted by (camp, attempt) stamp; a replay is a fresh camp
  | { readonly kind: "per-run"; readonly times: number } // counted over the whole ledger; survives replays
  | { readonly kind: "pool"; readonly cost: number } // the owner's character pool; characters and upgrades only
  | { readonly kind: "supplies"; readonly cost: number } // the crew's supplies; never spends the last one
  /** Shared by the crew: earned this attempt minus every seat's uses this
   * attempt. `locked` is the reason shown while none was earned. */
  | { readonly kind: "crew-tokens"; earned(run: RunState, rules: RunRules): number; readonly locked: string }
  /** Coins from the crew's purse, spent by the engine after the use. */
  | { readonly kind: "coins"; cost(ctx: CoinCost): number };

/** What a coins price may read: the key's counted uses so far, and the
 * picked targets (null before they are picked, when the price shown is the
 * least the use can cost). */
export type CoinCost = {
  readonly run: RunState;
  readonly seatId: string;
  readonly uses: { readonly thisCamp: number; readonly thisRun: number };
  readonly targets: readonly Target[] | null;
};

/** What an ability or passive knows about its holder. Derived from SeatRun. */
export type Owner = { readonly seatId: string; hasUpgrade(upgradeId: SourceId): boolean };
/** A value an upgrade may tune. Evaluated fresh at each read, never stored. */
export type Tuned<T> = T | ((owner: Owner) => T);

/** A character's personal resource. At most one per character. */
export type PoolDef = { readonly name: string; readonly start: number; readonly max: number; readonly regain: Tuned<number> };

export type EffectParams = Readonly<Record<string, string | number | boolean>>;

export type AbilityContext<S extends readonly TargetSpec[]> = {
  readonly self: string;
  readonly sourceId: SourceId;
  readonly owner: Owner;
  readonly run: RunState; // read-only snapshot, before the use
  /** The dealt camp; null in a stage window (loadout, draft, route). */
  readonly camp: CampState | null;
  readonly rules: RunRules;
  readonly catalog: Catalog;
  readonly targets: TargetsOf<S>; // resolved domain targets, positionally typed
  ownHand(): readonly ExpeditionCard[];
  handSize(seatId: string): number;
  /** Seeded. Up to n distinct opaque card ids from that hand. Throws outside apply. */
  randomCards(seatId: string, n: number): readonly string[];
  /** Seeded, 0..n-1. Throws outside apply. */
  randomIndex(n: number): number;
  /** Seeded. An offer of `shape` for that seat's character, for an
   * add-offer op. Throws outside apply. */
  drawOffer(seatId: string, shape: DraftShape): DraftOffer;
};

/** What a source knows while reacting to an engine event: the seat holding
 * it and the run after the event. Draws are seeded and numbered per call. */
export type SourceReactionCtx<E extends SourceEventType = SourceEventType> = {
  readonly self: string;
  readonly sourceId: SourceId;
  readonly owner: Owner;
  readonly run: RunState;
  /** The dealt camp; null before one is dealt (run-started). */
  readonly camp: CampState | null;
  readonly rules: RunRules;
  readonly catalog: Catalog;
  readonly event: Extract<SourceEvent, { readonly type: E }>;
  draw(n: number): number;
  drawOffer(seatId: string, shape: DraftShape): DraftOffer;
};
/** The engine's events plus run-started, when the length vote opens camp 1. */
export type SourceEvent = EngineEvent | { readonly type: "run-started" };
export type SourceEventType = EngineEventType | "run-started";
export type SourceReactions = { readonly [E in SourceEventType]?: (ctx: SourceReactionCtx<E>) => readonly ToolkitOp[] };

export type ActiveAbility<S extends readonly TargetSpec[] = readonly TargetSpec[], P extends EffectParams = EffectParams> = {
  /** One window, or several the ability may fire in. */
  readonly window: ActiveWindow | readonly ActiveWindow[];
  readonly limit: Tuned<UsageLimit>;
  readonly targets: S;
  /** Target-free availability, checked after window and limit. true or a player-facing reason. */
  canUse?(ctx: AbilityContext<readonly []>): true | string;
  /** Rules that span targets or are specific to the entry, after every target resolved through its kind. */
  canTarget?(ctx: AbilityContext<S>): true | string;
  apply(ctx: AbilityContext<S>): readonly ToolkitOp<P>[];
  /** Required if and only if apply can emit add-modifier: the rule layer that op activates, for this run. */
  effect?(effect: SeatEffect<P>, run: RunState): RuleModifier;
};

/** An item's ability: its `uses` stand in for the limit. */
export type ItemAbility<S extends readonly TargetSpec[] = readonly TargetSpec[], P extends EffectParams = EffectParams> = Omit<ActiveAbility<S, P>, "limit">;

/** `foldsLast` folds the layer after every effect, for a rule that must
 * have the last word over items and abilities. */
export type PassiveAbility = { modifier(owner: Owner): RuleModifier; readonly foldsLast?: true };

export type Rarity = "common" | "rare";
/** single-use is one charge; a spent instance leaves its owner. per-camp
 * resets with every attempt and never runs out. */
export type ItemUses = { readonly kind: "single-use" } | { readonly kind: "per-camp" } | { readonly kind: "charges"; readonly n: number };

type Named = {
  readonly id: SourceId;
  readonly name: string;
  readonly text: string; // one plain sentence, effect only
  readonly art?: string;
};
type SourceBase = Named & {
  readonly active?: ActiveAbility;
  readonly passive?: PassiveAbility;
  /** Reactions to engine events, as a camp modifier's `on`, while the source
   * is live. An add-modifier from here resolves through `active.effect`. */
  readonly on?: SourceReactions;
};
export type ItemDef = Named & {
  readonly kind: "item";
  readonly rarity: Rarity;
  readonly price: number;
  /** Drafted only by this character. */
  readonly exclusiveTo?: string;
} & (
    | { readonly uses: ItemUses; readonly active: ItemAbility; readonly passive?: never }
    | { readonly uses?: never; readonly active?: never; readonly passive: PassiveAbility }
  );
export type UpgradeDef = SourceBase & { readonly kind: "upgrade"; readonly characterId: string };
export type CharacterDef = SourceBase & {
  readonly kind: "character";
  readonly theme: string;
  /** The base power's name, which upgrades refer to ("Your Spyglass ..."). */
  readonly power: string;
  readonly pool?: PoolDef;
  readonly upgrades: readonly [UpgradeDef, UpgradeDef];
};
export type SourceDef = CharacterDef | UpgradeDef | ItemDef;

type UnboundUpgrade = Omit<UpgradeDef, "characterId">;

/** Keeps S and P literal so ctx.targets is a typed tuple; erases them for storage (the one cast). */
export function ability<const S extends readonly TargetSpec[], P extends EffectParams = EffectParams>(a: ActiveAbility<S, P>): ActiveAbility {
  return a as unknown as ActiveAbility;
}

/** ability() for an item: no limit, since the item's uses are its limit. */
export function itemAbility<const S extends readonly TargetSpec[], P extends EffectParams = EffectParams>(a: ItemAbility<S, P>): ItemAbility {
  return a as unknown as ItemAbility;
}

type ItemInput = ItemDef extends infer D ? (D extends unknown ? Omit<D, "kind"> : never) : never;

export function defineItem(def: ItemInput): ItemDef {
  return { ...def, kind: "item" } as ItemDef;
}

export function defineUpgrade(def: Omit<UpgradeDef, "kind" | "characterId">): UnboundUpgrade {
  return { ...def, kind: "upgrade" };
}

/** Stamps characterId onto both upgrades, so an upgrade cannot name the wrong character. */
export function defineCharacter(
  def: Omit<CharacterDef, "kind" | "upgrades"> & { readonly upgrades: readonly [UnboundUpgrade, UnboundUpgrade] },
): CharacterDef {
  const [first, second] = def.upgrades;
  return {
    ...def,
    kind: "character",
    upgrades: [
      { ...first, characterId: def.id },
      { ...second, characterId: def.id },
    ],
  };
}

export function windowsOf(active: { readonly window: ActiveWindow | readonly ActiveWindow[] }): readonly ActiveWindow[] {
  return typeof active.window === "string" ? [active.window] : active.window;
}

export function resolveTuned<T>(value: Tuned<T>, owner: Owner): T {
  return typeof value === "function" ? (value as (owner: Owner) => T)(owner) : value;
}
