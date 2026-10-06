// Every tunable number of the run lives in this one file, so a balance pass
// touches nothing else. Numbers the owner did not fix are placeholders.

import type { CampState, ObjectiveSlot } from "../state";
import type { BossTier } from "./plan";
import { STREAMS, seededIndex } from "./rng";
import type { CampSpec, SlotTemplate } from "./route";
import type { RunLength } from "./types";

export const RUN_LENGTHS: Readonly<Record<RunLength, { readonly camps: number; readonly bossCamps: readonly { readonly at: number; readonly tier: BossTier }[] }>> = {
  short: { camps: 4, bossCamps: [{ at: 4, tier: "temple" }] },
  standard: { camps: 6, bossCamps: [{ at: 3, tier: "animal" }, { at: 6, tier: "temple" }] },
  long: { camps: 8, bossCamps: [{ at: 3, tier: "animal" }, { at: 6, tier: "disaster" }, { at: 8, tier: "temple" }] },
};

/** Seat objectives per camp, before boss and temple slot layers. */
export const OBJECTIVE_RAMP: Readonly<Record<RunLength, readonly number[]>> = {
  short: [2, 3, 4, 3],
  standard: [2, 3, 3, 4, 4, 4],
  long: [2, 3, 3, 4, 4, 4, 5, 4],
};

/** Ordered pairs and trick-count slots appear from this camp on. */
export const MIX_FROM_CAMP = 4;

/** A route may mix in both an ordered pair and a trick-count slot only at a
 * camp with at least this many seat slots. */
export const BOTH_MIX_MIN_SLOTS = 4;

export const SUPPLIES_START = 3;
export const SUPPLIES_MAX = 4;
/** Coins for one supply at the shop. */
export const SUPPLY_PRICE = 6;
/** Supplies a failed camp costs before items add to it (Heavy Pack). */
export const FAILURE_COST = 1;

export const PURSE_START = 0;

export const PAYOUT = { base: 5, perUnplayedTrick: 1, unplayedCap: 3 } as const;

export const ROUTE_OPTIONS = { min: 2, max: 3 } as const;

/** Percent chance a route's weather is fair; a location may set its own. */
export const NORMAL_WEATHER_CHANCE = 80;

/** A strike's chance before trick t is firstChance + perTrick * t percent.
 * At an exposed location (Clifftop) it may strike `exposedStrikes` more times. */
export const THUNDERSTORM = { firstChance: 20, perTrick: 10, maxStrikes: 2, exposedStrikes: 1 } as const;

/** Rain and Downpour wash away the crew's first whispers each camp: the
 * player count less `spared`, plus `exposed` more at an exposed location
 * (Clifftop). A washed whisper is spent and nobody sees its card. */
export const WASHES = {
  rain: { spared: 2, exposed: 2 },
  downpour: { spared: 1, exposed: 3 },
} as const;

/** Tornado: after every `every`th trick, `cards` random cards from every
 * hand pass to the player on the right. The half body blows every 2 * every. */
export const TORNADO = { every: 3, cards: 3 } as const;

/** Flooding (and Monsoon): every objective must be done once this share of
 * the camp's tricks is played. Placeholder. */
export const RIVER_SHARE = 3 / 4;

/** A draft offer: `options` single items, or after a boss camp `options`
 * bundles of `bossBundleSize`; each item is rare with `rareChance` percent. */
export const DRAFT = { options: 3, bundleSize: 1, bossBundleSize: 2, rareChance: 15 } as const;

/** An event waits on the trail after camp 1 and every `EVENT_EVERY`th camp
 * after it, while a camp follows. */
export const EVENT_EVERY = 2;

/** The shop before a boss camp: `items` single copies beside the supplies,
 * and each seat's own character's upgrades. */
export const SHOP = { items: 3, upgradePrice: 8 } as const;

/** Item slots a seat starts with; camp rules and passives move it. */
export const ITEM_SLOTS = 2;

/** Items a seat stores beside its slots. Only equipped items act in camp. */
export const BACKPACK_SIZE = 6;

/** Whispers each seat has per camp, before items add to it. */
export const WHISPERS_PER_CAMP = 1;
/** Extra whispers per camp for a seat that owns an upgrade. */
export const WHISPERS_PER_UPGRADE = 1;

/** Placeholder: an exactly-n slot draws N uniformly from this range. */
export const TRICK_COUNT_N_RANGE = { min: 2, max: 4 } as const;

/** Coins a cleared camp pays: the base plus a bonus per trick left unplayed. */
export function payoutFor(camp: CampState): number {
  const unplayed = camp.totalTricks - camp.completedTricks.length;
  return PAYOUT.base + PAYOUT.perUnplayedTrick * Math.min(PAYOUT.unplayedCap, unplayed);
}

function resolveTrickCountSlot(seed: string, spec: CampSpec, attemptNumber: number): ObjectiveSlot {
  if (seededIndex(seed, STREAMS.trickCountKind(spec.index, attemptNumber), 2) === 0) return { kind: "no-tricks" };
  const { min, max } = TRICK_COUNT_N_RANGE;
  return { kind: "exactly-n", n: min + seededIndex(seed, STREAMS.trickCountN(spec.index, attemptNumber), max - min + 1) };
}

/** The spec's slots for one attempt: a trick-count slot resolves afresh per
 * attempt, so a replay keeps the mix but not the count. */
export function objectiveSlotsFor(seed: string, spec: CampSpec, attemptNumber: number): ObjectiveSlot[] {
  return spec.slots.map((slot: SlotTemplate): ObjectiveSlot => (slot.kind === "trick-count" ? resolveTrickCountSlot(seed, spec, attemptNumber) : slot));
}
