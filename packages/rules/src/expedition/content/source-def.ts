// The catalogue's def types: characters (each with a base power and exactly
// two upgrades), upgrades and items are all sources. A source may carry an
// active ability (a window, a limit and typed targets) and a passive rule
// layer. An item's `uses` is its limit, counted per owned instance. `apply`
// returns toolkit op data; the engine owns spending, gating, target
// resolution, RNG naming and projection.

import type { RuleModifier, RunRules } from "../run/run-rules";
import type { TargetSpec, TargetsOf } from "../run/targets";
import type { ToolkitOp } from "../run/toolkit";
import type { ActiveEffect, RunState } from "../run/types";
import type { ActiveWindow } from "../run/windows";
import type { CampState, ExpeditionCard } from "../state";

export type SourceId = string;

/** How often an active ability can fire. Exactly one per ability. */
export type UsageLimit =
  | { readonly kind: "per-camp"; readonly times: number } // counted by (camp, attempt) stamp; a replay is a fresh camp
  | { readonly kind: "per-run"; readonly times: number } // counted over the whole ledger; survives replays
  | { readonly kind: "pool"; readonly cost: number } // the owner's character pool; characters and upgrades only
  | { readonly kind: "supplies"; readonly cost: number }; // the crew's supplies; never spends the last one

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
  readonly camp: CampState;
  readonly rules: RunRules;
  readonly targets: TargetsOf<S>; // resolved domain targets, positionally typed
  ownHand(): readonly ExpeditionCard[];
  handSize(seatId: string): number;
  /** Seeded. Up to n distinct opaque card ids from that hand. Throws outside apply. */
  randomCards(seatId: string, n: number): readonly string[];
  /** Seeded, 0..n-1. Throws outside apply. */
  randomIndex(n: number): number;
};

export type ActiveAbility<S extends readonly TargetSpec[] = readonly TargetSpec[], P extends EffectParams = EffectParams> = {
  readonly window: ActiveWindow;
  readonly limit: Tuned<UsageLimit>;
  readonly targets: S;
  /** Target-free availability, checked after window and limit. true or a player-facing reason. */
  canUse?(ctx: AbilityContext<readonly []>): true | string;
  /** Rules that span targets or are specific to the entry, after every target resolved through its kind. */
  canTarget?(ctx: AbilityContext<S>): true | string;
  apply(ctx: AbilityContext<S>): readonly ToolkitOp<P>[];
  /** Required if and only if apply can emit add-modifier: the rule layer that op activates, for this run. */
  effect?(effect: ActiveEffect<P>, run: RunState): RuleModifier;
};

/** An item's ability: its `uses` stand in for the limit. */
export type ItemAbility<S extends readonly TargetSpec[] = readonly TargetSpec[], P extends EffectParams = EffectParams> = Omit<ActiveAbility<S, P>, "limit">;

export type PassiveAbility = { modifier(owner: Owner): RuleModifier };

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

export function resolveTuned<T>(value: Tuned<T>, owner: Owner): T {
  return typeof value === "function" ? (value as (owner: Owner) => T)(owner) : value;
}
