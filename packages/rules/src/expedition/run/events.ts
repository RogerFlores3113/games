// The event on the trail before a camp: drawn from EVENT_POOL on its own
// stream, its effect applied once as the event opens. What it gave rides on
// the event stage for every seat to see.

import { NO_GAINS, type EventDef, type EventGains, type EventId } from "../content/events/event-def";
import { EVENT_POOL } from "../content/events/registry";
import { SUPPLIES_MAX } from "./balance";
import { drawItem, openPool } from "./draft";
import { mintItems, roomFor } from "./items";
import { STREAMS, seededIndex } from "./rng";
import type { CampIndex, Catalog, RunState } from "./types";

/** The event before camp `next`: one of EVENT_POOL, ids sorted, on its own stream. */
export function drawEventId(seed: string, next: CampIndex): EventId {
  const pool = [...EVENT_POOL].sort();
  return pool[seededIndex(seed, STREAMS.event(next), pool.length)]!;
}

/** Each seat with room, in seat order, mints one common item drawn on its
 * own stream; a seat with a full backpack gets nothing. */
function giveCommonItems(run: RunState, next: CampIndex, catalog: Catalog): { run: RunState; gains: EventGains } {
  const commons = { common: openPool(catalog).common, uncommon: [], rare: [] };
  const items: { seatId: string; itemId: string }[] = [];
  let given = run;
  for (const { seatId } of run.seats) {
    if (roomFor(given, seatId, catalog) < 1) continue;
    const itemId = drawItem(run.seed, (part) => STREAMS.eventItem(next, seatId, part), commons, new Set(), { rare: 0, uncommon: 0 });
    if (itemId === null) continue;
    given = mintItems(given, seatId, [itemId], catalog);
    items.push({ seatId, itemId });
  }
  return { run: given, gains: { ...NO_GAINS, items } };
}

/** Applies `def`'s effect to the run, once, and says what it gave. */
export function applyEvent(run: RunState, def: EventDef, next: CampIndex, catalog: Catalog): { run: RunState; gains: EventGains } {
  const effect = def.effect;
  if (effect === undefined) return { run, gains: NO_GAINS };
  switch (effect.kind) {
    case "coins":
      return { run: { ...run, purse: run.purse + effect.coins }, gains: { ...NO_GAINS, coins: effect.coins } };
    case "supplies": {
      const supplies = Math.max(0, Math.min(SUPPLIES_MAX, run.supplies + effect.supplies) - run.supplies);
      if (supplies > 0) return { run: { ...run, supplies: run.supplies + supplies }, gains: { ...NO_GAINS, supplies } };
      return { run: { ...run, purse: run.purse + effect.elseCoins }, gains: { ...NO_GAINS, coins: effect.elseCoins } };
    }
    case "common-item":
      return giveCommonItems(run, next, catalog);
  }
}
