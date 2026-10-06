// Draft offers. An offer is PRIVATE to its seat and lives on that seat's
// SeatRun.offers queue; the head is the one to pick. The draft before each
// camp deals each seat a standard offer, of single items, or of bundles of
// two after a boss camp; an ability may queue special ones.
//
// Each item of a bundle rolls its rarity, then picks uniformly over that
// rarity's sorted ids, so catalogue order never changes a draw. Upgrades are
// never drafted: they are bought at the shop.

import type { ItemDef, Rarity } from "../content/source-def";
import { DRAFT } from "./balance";
import { STREAMS, seededIndex, type ItemDrawPart } from "./rng";
import { draftsBundles } from "./trail";
import type { Catalog, RunState, SeatRun } from "./types";

export type DraftOffer = { readonly kind: "standard" | "special"; readonly bundles: readonly (readonly string[])[] };

/** One offer: `options` bundles, each of `bundleSize` items anyone may
 * draft plus `exclusive` items only the seat's character drafts. Each item
 * is rare with `rareChance` percent. */
export type DraftShape = { readonly options: number; readonly bundleSize: number; readonly exclusive: number; readonly rareChance: number };

export const BASE_DRAFT_SHAPE: DraftShape = { options: DRAFT.options, bundleSize: DRAFT.bundleSize, exclusive: 0, rareChance: DRAFT.rareChance };
export const BOSS_DRAFT_SHAPE: DraftShape = { ...BASE_DRAFT_SHAPE, bundleSize: DRAFT.bossBundleSize };

/** The standard offer of the draft the run is at: bundles after a boss camp. */
export function standardDraftShape(run: RunState): DraftShape {
  const stage = run.stage;
  return stage.tag === "draft" && run.plan !== null && draftsBundles(run.plan.length, stage.next) ? BOSS_DRAFT_SHAPE : BASE_DRAFT_SHAPE;
}

/** Item ids by rarity, sorted. */
export type ItemPool = Readonly<Record<Rarity, readonly string[]>>;

function poolOf(catalog: Catalog, keep: (item: ItemDef) => boolean): ItemPool {
  const kept = Object.values(catalog.items).filter(keep);
  const ids = (rarity: Rarity): string[] => kept.filter((item) => item.rarity === rarity).map((item) => item.id).sort();
  return { common: ids("common"), rare: ids("rare") };
}

/** Items no character holds exclusively: the draft's bundles and the shop. */
export function openPool(catalog: Catalog): ItemPool {
  return poolOf(catalog, (item) => item.exclusiveTo === undefined);
}

/** Items only `characterId` drafts; empty with no character. */
export function exclusivePool(catalog: Catalog, characterId: string | null): ItemPool {
  return poolOf(catalog, (item) => characterId !== null && item.exclusiveTo === characterId);
}

/** Rolls a rarity (rare at `rareChance` percent), then picks an item of it
 * not in `taken`; falls back to the other rarity when that one has none
 * left. null when the pool has nothing left at all. */
export function drawItem(seed: string, stream: (part: ItemDrawPart) => string, pool: ItemPool, taken: ReadonlySet<string>, rareChance: number): string | null {
  const rolled: Rarity = seededIndex(seed, stream("rarity"), 100) < rareChance ? "rare" : "common";
  for (const rarity of [rolled, rolled === "rare" ? "common" : "rare"] as const) {
    const left = pool[rarity].filter((id) => !taken.has(id));
    if (left.length > 0) return left[seededIndex(seed, stream("pick"), left.length)]!;
  }
  return null;
}

/** Draws an offer of `shape` for a seat of `characterId`. `stream` names
 * item `item` of bundle `bundle`; the exclusive items number on after the
 * open ones. Bundles of several items may repeat across options; one-item
 * bundles never do, so a pick of one is a pick between different items.
 * Bundles may hold items the seat already owns. */
export function drawOffer(
  seed: string,
  stream: (bundle: number, item: number, part: ItemDrawPart) => string,
  characterId: string | null,
  catalog: Catalog,
  shape: DraftShape,
  kind: DraftOffer["kind"],
): DraftOffer {
  const open = openPool(catalog);
  const exclusive = exclusivePool(catalog, characterId);
  const single = shape.bundleSize + shape.exclusive === 1;
  const offered = new Set<string>();
  const bundles = Array.from({ length: shape.options }, (_, bundle) => {
    const taken = new Set<string>();
    const pick = (pool: ItemPool, item: number): void => {
      const id = drawItem(seed, (part) => stream(bundle, item, part), pool, single ? offered : taken, shape.rareChance);
      if (id === null) return;
      taken.add(id);
      offered.add(id);
    };
    for (let item = 0; item < shape.bundleSize; item++) pick(open, item);
    for (let item = 0; item < shape.exclusive; item++) pick(exclusive, shape.bundleSize + item);
    return [...taken];
  });
  return { kind, bundles };
}

/** An offer of the draft after camp `cleared` (0 before camp 1), seeded per
 * (cleared camp, seat, ordinal): the ordinal counts the seat's offers from
 * that draft. */
export function draftOfferFor(seed: string, cleared: number, seat: SeatRun, ordinal: number, catalog: Catalog, shape: DraftShape = BASE_DRAFT_SHAPE): DraftOffer {
  return drawOffer(seed, (bundle, item, part) => STREAMS.draftItem(cleared, seat.seatId, ordinal, bundle, item, part), seat.characterId, catalog, shape, "standard");
}
