// The shop: the stage before a boss camp (and its replays). The stock is one
// supply line and SHOP.items single copies, drawn on every visit from the
// same stream names, so a replay of the boss camp offers the same stock
// again. Upgrades are not stock: each seat sees its own character's upgrades
// while it owns none. Every buy spends the shared purse; the Durable Object
// serializes actions, so two buyers never both spend the last coins.

import { DRAFT, SHOP, SUPPLIES_MAX, SUPPLY_PRICE } from "./balance";
import { rulesFor } from "./compose";
import { drawItem, openPool } from "./draft";
import { mintItems, roomFor } from "./items";
import { STREAMS } from "./rng";
import type { CampIndex, Catalog, RunAt, RunError, RunState, SeatId, SeatRun } from "./types";
import { seatOf } from "./usage";

export type StockEntry = {
  readonly stockId: string; // "supplies" | "item0".."item2"
  readonly what: { readonly kind: "supplies" } | { readonly kind: "item"; readonly itemId: string };
  readonly price: number;
  readonly soldTo: SeatId | null; // items only, one copy each
};

export type UpgradeOffer = { readonly stockId: string; readonly upgradeId: string; readonly price: number };

const UPGRADE_PREFIX = "upgrade:";

export function stockFor(seed: string, at: CampIndex, catalog: Catalog): readonly StockEntry[] {
  const pool = openPool(catalog);
  const taken = new Set<string>();
  const items: StockEntry[] = [];
  for (let i = 0; i < SHOP.items; i++) {
    const itemId = drawItem(seed, (part) => STREAMS.shopItem(at, i, part), pool, taken, DRAFT.rareChance);
    if (itemId === null) break;
    taken.add(itemId);
    items.push({ stockId: `item${i}`, what: { kind: "item", itemId }, price: catalog.items[itemId]!.price, soldTo: null });
  }
  return [{ stockId: "supplies", what: { kind: "supplies" }, price: SUPPLY_PRICE, soldTo: null }, ...items];
}

/** The seat's own character's upgrades, while it owns none. */
export function upgradeOffers(seat: SeatRun, catalog: Catalog): readonly UpgradeOffer[] {
  if (seat.upgradeId !== null || seat.characterId === null) return [];
  const character = catalog.characters[seat.characterId];
  return (character?.upgrades ?? []).map((upgrade) => ({ stockId: `${UPGRADE_PREFIX}${upgrade.id}`, upgradeId: upgrade.id, price: SHOP.upgradePrice }));
}

type Purchase = { readonly price: number; readonly take: (run: RunAt<"shop">) => RunState };

function upgradePurchase(seat: SeatRun, upgradeId: string, catalog: Catalog): Purchase | RunError {
  if (seat.upgradeId !== null) return "upgrade_owned";
  const offer = upgradeOffers(seat, catalog).find((o) => o.upgradeId === upgradeId);
  if (offer === undefined) return "not_your_upgrade";
  return { price: offer.price, take: (run) => ({ ...run, seats: run.seats.map((s) => (s.seatId === seat.seatId ? { ...s, upgradeId } : s)) }) };
}

function stockPurchase(run: RunAt<"shop">, seatId: SeatId, entry: StockEntry, catalog: Catalog): Purchase | RunError {
  const what = entry.what;
  if (what.kind === "supplies") {
    return run.supplies >= SUPPLIES_MAX ? "supplies_full" : { price: entry.price, take: (r) => ({ ...r, supplies: r.supplies + 1 }) };
  }
  if (entry.soldTo !== null) return "sold_out";
  if (roomFor(run, seatId, catalog) < 1) return "backpack_full";
  return {
    price: entry.price,
    take: (r) => {
      const stock = r.stage.stock.map((e) => (e.stockId === entry.stockId ? { ...e, soldTo: seatId } : e));
      return mintItems({ ...r, stage: { ...r.stage, stock } }, seatId, [what.itemId], catalog);
    },
  };
}

/** What `seatId` pays for something listed at `price`: the composed
 * shopPrice. POLICY A3: a negative or fractional price is a rule defect. */
export function priceFor(run: RunState, seatId: SeatId, price: number, catalog: Catalog): number {
  const paid = rulesFor(run, catalog).shopPrice(run, seatId, price);
  if (!Number.isInteger(paid) || paid < 0) throw new Error(`shop: shopPrice gave ${paid} for a price of ${price}`);
  return paid;
}

/** not_a_choice (no such stock), already_ready, then the entry's own
 * refusal (supplies_full, sold_out, backpack_full, upgrade_owned,
 * not_your_upgrade), then cannot_afford at the seat's shopPrice. */
export function buy(run: RunAt<"shop">, seatId: SeatId, stockId: string, catalog: Catalog): { readonly ok: true; readonly state: RunState } | { readonly ok: false; readonly error: RunError } {
  const stock = run.stage.stock;
  if (Object.hasOwn(run.stage.ready, seatId)) return { ok: false, error: "already_ready" };
  const entry = stock.find((e) => e.stockId === stockId);
  const purchase = stockId.startsWith(UPGRADE_PREFIX)
    ? upgradePurchase(seatOf(run, seatId), stockId.slice(UPGRADE_PREFIX.length), catalog)
    : entry === undefined
      ? "not_a_choice"
      : stockPurchase(run, seatId, entry, catalog);
  if (typeof purchase === "string") return { ok: false, error: purchase };
  const price = priceFor(run, seatId, purchase.price, catalog);
  if (run.purse < price) return { ok: false, error: "cannot_afford" };
  return { ok: true, state: purchase.take({ ...run, purse: run.purse - price }) };
}
