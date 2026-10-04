// Phase 10 rule-hook layering type contract (Plan 02).
//
// LABELED DEVIATION: RunRules lives BESIDE CoreRules (a `CoreRules &
// RunHooks` intersection) rather than being folded into rules.ts's own
// CoreRules type. This keeps Core (rules.ts) importing nothing from run/,
// so the Core layer never names a source id (per rules.ts's own
// header contract).
//
// COMPOSITION ORDER (spec §6.1, "each hook receives the previous layer's
// answer"): base -> camp-stack layers (location, weather, pairing, boss) ->
// live passives (seat order, then each seat's [character, upgrade,
// ...equipped] order) -> active effects (in the order they were added) ->
// the passives marked foldsLast.
// A RuleModifier is a function from the previous layer's hook to this
// layer's hook; composing a full RunRules means folding every layer's
// RuleModifier, hook by hook, in that fixed order.
//
// Rules are RECOMPUTED on every call and are NEVER cached: RunState is
// plain JSON data (ActiveEffect entries, not stored functions), so a
// composed RunRules value is always rebuilt fresh from that data via each
// source's `passive.modifier`/`active.effect`. This is
// what lets Phase 11 persist RunState with no special-casing of "live"
// rule objects.

import type { CoreRules } from "../rules";
import { FAILURE_COST, ITEM_SLOTS, WHISPERS_PER_CAMP, WHISPERS_PER_UPGRADE } from "./balance";
import { BASE_DRAFT_SHAPE, type DraftShape } from "./draft";
import type { Origin, RunState, SourceKey } from "./types";

/** A thing a camp rule may keep from a viewer. */
export type Concealable =
  /** A play in the current trick. */
  | { readonly kind: "play"; readonly trickIndex: number; readonly position: number; readonly seatId: string }
  /** An objective's kind and target, not its existence. */
  | { readonly kind: "objective"; readonly objectiveId: string }
  /** A seat's backpack and the equipped items it has not used this attempt. */
  | { readonly kind: "loadout"; readonly seatId: string };

export type RunHooks = {
  /** Whether `subject` is kept from `viewerSeatId`. The view and the leak
   * check both read it. */
  hides(run: RunState, viewerSeatId: string, subject: Concealable): boolean;
  whisperAllowed(run: RunState, seatId: string): boolean;
  whisperAudience(run: RunState, seatId: string, targetSeatId: string): readonly string[];
  whispersPerCamp(run: RunState, seatId: string): number;
  failureCost(run: RunState): number;
  itemSlots(run: RunState, seatId: string): number;
  /** Percent chance of fair weather on a route, given the location's own. */
  normalWeatherChance(run: RunState, chance: number): number;
  /** How many options a route vote offers, given the seeded count (1 to 3). */
  routeOptionCount(run: RunState, count: number): number;
  /** Whether route option `option` (0-based) leads to a different boss at
   * the next animal or disaster boss camp. */
  swapsBoss(run: RunState, option: number): boolean;
  /** The offer a seat is dealt after a cleared camp. */
  draftShape(run: RunState, seatId: string): DraftShape;
  /** What `seatId` pays at the shop for something listed at `price`. */
  shopPrice(run: RunState, seatId: string, price: number): number;
  /** Whether a camp modifier's effect aimed at `seatId` reaches it. Camp
   * modifiers ask it through `ctx.affects`, which folds the seat layers
   * only, since the modifiers' own layers are being built. */
  affectsSeat(run: RunState, seatId: string, origin: Origin): boolean;
  /** Whether this use of `sourceKey` is free: it counts against no limit
   * and spends nothing. */
  freeUse(run: RunState, seatId: string, sourceKey: SourceKey): boolean;
  /** Whether `seatId` sees the objectives a coming camp will deal. */
  surveys(run: RunState, seatId: string): boolean;
};

export type RunRules = CoreRules & RunHooks;
export type HookName = keyof RunRules;

// Spec §6.1 "each hook receives the previous layer's answer": a layer maps
// the previous layer's hook to its own.
export type RuleModifier = { readonly [K in HookName]?: (prev: RunRules[K]) => RunRules[K] };

// Built from an object literal typed Record<HookName, true> so that adding
// a hook to RunRules without listing it here is a compile error (mirrors
// objectives.ts's KindRegistry exhaustiveness idiom).
const HOOK_NAME_SET: Record<HookName, true> = {
  deckFor: true,
  objectiveDeckFor: true,
  leaderFor: true,
  identityOf: true,
  isTrump: true,
  rankOf: true,
  trickWinner: true,
  legalPlays: true,
  burns: true,
  nextLeader: true,
  objectiveStatus: true,
  goals: true,
  hides: true,
  whisperAllowed: true,
  whisperAudience: true,
  whispersPerCamp: true,
  failureCost: true,
  itemSlots: true,
  voidsTrick: true,
  objectivePicker: true,
  normalWeatherChance: true,
  routeOptionCount: true,
  swapsBoss: true,
  draftShape: true,
  shopPrice: true,
  affectsSeat: true,
  freeUse: true,
  surveys: true,
};

export const HOOK_NAMES: readonly HookName[] = Object.keys(HOOK_NAME_SET) as HookName[];

export const baseRunHooks: RunHooks = {
  hides(_run, _viewerSeatId, _subject) {
    return false;
  },
  whisperAllowed(_run, _seatId) {
    return true;
  },
  whisperAudience(_run, _seatId, targetSeatId) {
    return [targetSeatId];
  },
  whispersPerCamp(run, seatId) {
    const upgraded = run.seats.some((seat) => seat.seatId === seatId && seat.upgradeId !== null);
    return WHISPERS_PER_CAMP + (upgraded ? WHISPERS_PER_UPGRADE : 0);
  },
  failureCost(_run) {
    return FAILURE_COST;
  },
  itemSlots(_run, _seatId) {
    return ITEM_SLOTS;
  },
  normalWeatherChance(_run, chance) {
    return chance;
  },
  routeOptionCount(_run, count) {
    return count;
  },
  swapsBoss(_run, _option) {
    return false;
  },
  draftShape(_run, _seatId) {
    return BASE_DRAFT_SHAPE;
  },
  shopPrice(_run, _seatId, price) {
    return price;
  },
  affectsSeat(_run, _seatId, _origin) {
    return true;
  },
  freeUse(_run, _seatId, _sourceKey) {
    return false;
  },
  surveys(_run, _seatId) {
    return false;
  },
};
