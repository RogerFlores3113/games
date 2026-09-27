// Phase 10 draft offers (Plan 05, RUN-04, D-05).
//
// RUN-04: a draft offer is PRIVATE to the offered seat. Callers store the
// result on that seat's OWN SeatRun.draftOffer (run/types.ts) — never on a
// shared/public list. This file only computes the offer; it has no opinion
// about where it is stored.
//
// D-05: exclusion is per OFFERED PLAYER ONLY. Two different seats may see
// (and later own) the same gear id in their own offers; ownedGearIds only
// ever filters the calling seat's own candidate pool.
//
// A1: the sole draw site is STREAMS.draft(campNumber, seatId) — draft draws
// happen at most once per (campNumber, seatId) per run (a draft only
// follows a cleared camp, D-01), so the stream name deliberately omits the
// attempt number (matches run/types.ts's A1 stream-name table).

import { shuffleWithSeed } from "../../shuffle";
import { DRAFT_OFFER_SIZE } from "./balance";
import { STREAMS } from "./rng";

/** A 1-of-DRAFT_OFFER_SIZE (or fewer, if the pool is that small) private
 * draft offer for `seatId` at `campNumber`, deterministic for identical
 * arguments. Never includes an id already in `ownedGearIds`. Returns null
 * only when every gear id is already owned (no candidates left). */
export function draftOfferFor(
  seed: string,
  campNumber: number,
  seatId: string,
  allGearIds: readonly string[],
  ownedGearIds: readonly string[],
): readonly string[] | null {
  const owned = new Set(ownedGearIds);
  // Sorted first (per the plan's behavior list) so the caller's ids order
  // never affects the drawn offer.
  const candidates = [...allGearIds].filter((id) => !owned.has(id)).sort();

  if (candidates.length === 0) return null;

  return shuffleWithSeed(candidates, seed, STREAMS.draft(campNumber, seatId)).slice(0, DRAFT_OFFER_SIZE);
}
