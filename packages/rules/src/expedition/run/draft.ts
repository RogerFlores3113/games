// Draft offers after a cleared camp. An offer is PRIVATE to its seat and
// lives on that seat's SeatRun.offers queue; the head is the one to pick.
//
// Each item of a bundle rolls its rarity, then picks uniformly over that
// rarity's sorted ids, so catalogue order never changes a draw. Upgrades are
// never drafted: they are bought at the shop.

import type { Rarity } from "../content/source-def";
import { DRAFT } from "./balance";
import { STREAMS, seededIndex, type ItemDrawPart } from "./rng";
import type { CampIndex, Catalog, SeatRun } from "./types";

export type DraftOffer = { readonly kind: "standard"; readonly bundles: readonly (readonly string[])[] };

/** Item ids by rarity, sorted, without items exclusive to another character
 * (with no character, every exclusive item is out). */
export type ItemPool = Readonly<Record<Rarity, readonly string[]>>;

export function itemPool(catalog: Catalog, characterId: string | null): ItemPool {
  const open = Object.values(catalog.items).filter((item) => item.exclusiveTo === undefined || item.exclusiveTo === characterId);
  const ids = (rarity: Rarity): string[] => open.filter((item) => item.rarity === rarity).map((item) => item.id).sort();
  return { common: ids("common"), rare: ids("rare") };
}

/** Rolls a rarity (rare at DRAFT.rareChance percent), then picks an item of
 * it not in `taken`; falls back to the other rarity when that one has none
 * left. null when the pool has nothing left at all. */
export function drawItem(seed: string, stream: (part: ItemDrawPart) => string, pool: ItemPool, taken: ReadonlySet<string>): string | null {
  const rolled: Rarity = seededIndex(seed, stream("rarity"), 100) < DRAFT.rareChance ? "rare" : "common";
  for (const rarity of [rolled, rolled === "rare" ? "common" : "rare"] as const) {
    const left = pool[rarity].filter((id) => !taken.has(id));
    if (left.length > 0) return left[seededIndex(seed, stream("pick"), left.length)]!;
  }
  return null;
}

/** DRAFT.options bundles of up to DRAFT.bundleSize distinct items, seeded
 * per (cleared camp, seat, ordinal). Bundles may repeat across options and
 * may hold items the seat already owns. */
export function draftOfferFor(seed: string, cleared: CampIndex, seat: SeatRun, ordinal: number, catalog: Catalog): DraftOffer {
  const pool = itemPool(catalog, seat.characterId);
  const bundles = Array.from({ length: DRAFT.options }, (_, bundle) => {
    const taken = new Set<string>();
    for (let item = 0; item < DRAFT.bundleSize; item++) {
      const id = drawItem(seed, (part) => STREAMS.draftItem(cleared, seat.seatId, ordinal, bundle, item, part), pool, taken);
      if (id !== null) taken.add(id);
    }
    return [...taken];
  });
  return { kind: "standard", bundles };
}
