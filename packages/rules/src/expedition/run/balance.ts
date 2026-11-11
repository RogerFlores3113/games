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
  short: [2, 3, 3, 4],
  standard: [2, 2, 3, 3, 3, 4],
  long: [2, 3, 3, 4, 4, 4, 5, 4],
};

/** Seat objectives each camp adds to OBJECTIVE_RAMP for its crew size, one
 * entry per camp. The ramp is tuned for 3 players; bigger crews hold more
 * cards between them, so they get more to do, at the camps chosen here. */
export const EXTRA_OBJECTIVES: Readonly<Record<RunLength, Readonly<Record<3 | 4 | 5, readonly number[]>>>> = {
  short: { 3: [0, 0, 1, 1], 4: [0, 0, 0, 1], 5: [1, 1, 1, 2] },
  standard: { 3: [0, 0, 0, 0, 0, 0], 4: [0, 0, 0, 0, 0, 1], 5: [1, 2, 2, 2, 2, 2] },
  long: { 3: [0, 0, 0, 0, 0, 0, 0, 0], 4: [0, 1, 1, 1, 1, 1, 1, 1], 5: [1, 2, 2, 2, 2, 2, 2, 2] },
};

/** No seat is ever dealt more objectives than this in one camp. */
export const MAX_SEAT_OBJECTIVES = 5;

/** Ordered pairs and trick-count slots appear from this camp on. */
export const MIX_FROM_CAMP = 4;

/** From this crew size on, mixed slots start one camp before MIX_FROM_CAMP. */
export const EARLY_MIX_PLAYERS = 4;

/** A route may mix in both an ordered pair and a trick-count slot only at a
 * camp with at least this many seat slots. */
export const BOTH_MIX_MIN_SLOTS = 4;

export const SUPPLIES_START = 5;
export const SUPPLIES_MAX = 6;
/** Coins for one supply at the shop. */
export const SUPPLY_PRICE = 6;
/** Supplies a failed camp costs before items add to it (Heavy Pack). */
export const FAILURE_COST = 1;
/** Coins a failed attempt pays into the crew purse, as consolation. */
export const FAILED_ATTEMPT_COINS = 1;

export const PURSE_START = 0;

/** Coins a cleared camp pays: `base`, plus `riskyLocation` away from plain
 * ground and `riskyWeather` in anything but fair weather, plus
 * `perUnplayedTrick` per trick left unplayed, for at most `unplayedCap`
 * tricks. */
export const PAYOUT = { base: 3, riskyLocation: 1, riskyWeather: 1, perUnplayedTrick: 1, unplayedCap: 2 } as const;

/** The locations and weathers that change nothing, so pay no risk bonus. */
export const PLAIN_GROUND: { readonly locations: readonly string[]; readonly weathers: readonly string[] } = { locations: ["jungle", "clearing"], weathers: ["fair"] };

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
  rain: { spared: 3, exposed: 2 },
  downpour: { spared: 2, exposed: 3 },
} as const;

/** Tornado: after every `every`th trick, `cards` random cards from every
 * hand pass to the player on the right. The half body blows every 2 * every. */
export const TORNADO = { every: 3, cards: 3 } as const;

/** Flooding (and Monsoon): every objective must be done once this share of
 * the camp's tricks is played. Placeholder. */
export const RIVER_SHARE = 3 / 4;

/** A draft offer: `options` single items, or after a boss camp `options`
 * bundles of `bossBundleSize`. Each item rolls 0..99: below `odds.rare` it
 * is rare, below `odds.rare + odds.uncommon` uncommon, else common. */
export const DRAFT = { options: 3, bundleSize: 1, bossBundleSize: 2, odds: { rare: 10, uncommon: 30 } } as const;

/** Every item's price lies in its rarity's band (inclusive). Rarity follows
 * the strength of an item's effect, not its win rate. */
export const PRICE_BANDS = { common: { min: 1, max: 2 }, uncommon: { min: 3, max: 4 }, rare: { min: 5, max: 6 } } as const;

/** An event waits on the trail after camp 1 and every `EVENT_EVERY`th camp
 * after it, while a camp follows. */
export const EVENT_EVERY = 2;

/** The shop: `items` single copies beside the supplies, and each seat's own
 * character's upgrades. */
/** The part of the purse the shop deals out as per-seat shares, split evenly
 * (each seat gets floor(purse * SHOP_SHARE_PORTION / seats)); the rest is the
 * crew pot anyone's buy may draw on after their own share. */
export const SHOP_SHARE_PORTION = 1;

export const SHOP = { items: 3, upgradePrice: 6 } as const;

/** The camps a shop opens before, after their route vote: every boss camp,
 * and camp 3 of a Short run too. */
export const SHOP_CAMPS: Readonly<Record<RunLength, readonly number[]>> = {
  short: [3, 4],
  standard: [3, 6],
  long: [3, 6, 8],
};

/** Item slots a seat starts with; camp rules and passives move it. */
export const ITEM_SLOTS = 2;

/** Items a seat stores beside its slots. Only equipped items act in camp. */
export const BACKPACK_SIZE = 6;

/** Whispers each seat has per camp, before items add to it. */
export const WHISPERS_PER_CAMP = 2;
/** Extra whispers per camp for a seat that owns an upgrade. */
export const WHISPERS_PER_UPGRADE = 0;
/** No seat has more than this many whispers in a camp, whatever stacks
 * (Leader, items, upgrades). Applied last, where the composed count is read. */
export const WHISPER_CAP = 4;
/** Whispers per camp for a Perfumist until it owns an upgrade. */
export const PERFUMIST_WHISPERS_UNUPGRADED = 1;

/** Placeholder: an exactly-n slot draws N uniformly from this range. */
export const TRICK_COUNT_N_RANGE = { min: 2, max: 4 } as const;

/** Crew sizes outside 3 to 5 read as the nearest one. */
function crewSize(players: number): 3 | 4 | 5 {
  return players <= 3 ? 3 : players >= 5 ? 5 : 4;
}

/** Camp k's seat objectives for a crew of `players`, before boss and temple
 * slot layers: OBJECTIVE_RAMP plus EXTRA_OBJECTIVES, at most MAX_SEAT_OBJECTIVES. */
export function seatObjectivesAt(length: RunLength, k: number, players: number): number {
  const ramp = OBJECTIVE_RAMP[length][k - 1];
  if (ramp === undefined) throw new Error(`balance: ${length} run has no camp ${k}`);
  const extra = EXTRA_OBJECTIVES[length][crewSize(players)][k - 1] ?? 0;
  return Math.min(MAX_SEAT_OBJECTIVES, ramp + extra);
}

/** The first camp with mixed slots for a crew of `players`. */
export function mixFromCampFor(players: number): number {
  return players >= EARLY_MIX_PLAYERS ? MIX_FROM_CAMP - 1 : MIX_FROM_CAMP;
}

type Ground = Pick<CampSpec, "location" | "weather">;

/** The coins a camp pays before its unplayed tricks: the base and its risk bonus. */
export function basePayout(spec: Ground): number {
  const location = PLAIN_GROUND.locations.includes(spec.location) ? 0 : PAYOUT.riskyLocation;
  const weather = PLAIN_GROUND.weathers.includes(spec.weather) ? 0 : PAYOUT.riskyWeather;
  return PAYOUT.base + location + weather;
}

/** The fewest and most coins clearing `spec` pays. */
export function payoutRange(spec: Ground): { readonly min: number; readonly max: number } {
  const min = basePayout(spec);
  return { min, max: min + PAYOUT.perUnplayedTrick * PAYOUT.unplayedCap };
}

/** Coins a cleared camp pays: its base payout plus a bonus per trick left unplayed. */
export function payoutFor(spec: Ground, camp: CampState): number {
  const unplayed = camp.totalTricks - camp.completedTricks.length;
  return basePayout(spec) + PAYOUT.perUnplayedTrick * Math.min(PAYOUT.unplayedCap, unplayed);
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
