// Draft offers after a cleared camp (RUN-04). An offer is PRIVATE to the
// offered seat; callers store it on that seat's own SeatRun.draftOffer.
//
// Slot 1 is one of the seat's own character's unowned upgrades, while any
// remain. The other slots are items not in the seat's kit, so a consumed
// single-use item can return. Each part draws on its own stream, once per
// (cleared camp, seat), since a draft only follows a clear.

import { shuffleWithSeed } from "../../shuffle";
import type { SourceId } from "../content/source-def";
import { STREAMS } from "./rng";
import type { Catalog, SeatRun } from "./types";

const DRAFT_OFFER_SIZE = 3;

/** A private offer of up to DRAFT_OFFER_SIZE sources for `seat` after
 * clearing `clearedCamp`, deterministic for identical arguments. null only
 * when nothing is left to offer. Candidates are sorted before shuffling so
 * catalogue order never changes a draw. */
export function draftOfferFor(seed: string, clearedCamp: number, seat: SeatRun, catalog: Catalog): readonly SourceId[] | null {
  const owned = new Set(seat.kit);
  const character = seat.characterId === null ? undefined : catalog.characters[seat.characterId];
  const upgrades = (character?.upgrades ?? []).map((upgrade) => upgrade.id).filter((id) => !owned.has(id)).sort();
  const upgradeSlot = shuffleWithSeed(upgrades, seed, STREAMS.draftUpgrade(clearedCamp, seat.seatId)).slice(0, 1);
  const items = Object.keys(catalog.items).filter((id) => !owned.has(id)).sort();
  const itemSlots = shuffleWithSeed(items, seed, STREAMS.draftItems(clearedCamp, seat.seatId)).slice(0, DRAFT_OFFER_SIZE - upgradeSlot.length);
  const offer = [...upgradeSlot, ...itemSlots];
  return offer.length === 0 ? null : offer;
}
