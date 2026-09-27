// Phase 10 balance table (Plan 03, RUN-01, D-14, D-15).
//
// D-14/D-15: camp 5's trick-count slot is a normal face-up objective slot,
// taken in the same clockwise pick order as every other objective (matching
// Phase 9's A-TRICKCOUNT). It is not a special mid-camp draw; it is resolved
// ONCE per attempt, before objective picking begins, by objectiveSlotsFor
// replacing the table's "trick-count" placeholder with a concrete
// ObjectiveSlot (either { kind: "no-tricks" } or { kind: "exactly-n", n }).
//
// The resolution is deterministic per (seed, campNumber, attemptNumber) and
// draws ONLY through run/rng.ts's STREAMS.trickCountKind / STREAMS.trickCountN
// (A1) — never an ad-hoc stream name — so it composes correctly with every
// other seeded draw in the run and is reproducible for replay/debugging.
//
// Every tunable number for the run's ramp lives in this one file
// (STARTING_SUPPLIES, FINAL_CAMP, BOSS_CAMPS, DRAFT_OFFER_SIZE,
// TRICK_COUNT_N_RANGE, BALANCE_TABLE) so a balance pass (BAL-01, Phase 15)
// touches only this file, never compose.ts, camp.ts or actions.ts.
//
// TRICK_COUNT_N_RANGE is an A6 placeholder: the specific [min, max] bounds
// are a provisional guess pending owner playtesting in Phase 15, not a
// spec-derived constant.

import type { CampNumber, BossCampNumber } from "./types";
import type { ObjectiveSlot } from "../state";
import { STREAMS, seededIndex } from "./rng";

export const STARTING_SUPPLIES = 3;
export const FINAL_CAMP: CampNumber = 6;
export const BOSS_CAMPS: readonly BossCampNumber[] = [3, 6];
export const DRAFT_OFFER_SIZE = 3;

// A6 placeholder (Phase 15 tuning target): camp 5's exactly-n draw picks N
// uniformly from this inclusive range when the RNG doesn't choose no-tricks.
export const TRICK_COUNT_N_RANGE = { min: 2, max: 4 } as const;

export type BalanceSlot = ObjectiveSlot | { readonly kind: "trick-count" };

export type CampBalanceEntry = {
  readonly slots: readonly BalanceSlot[];
  readonly isBossCamp: boolean;
};

// Spec §4.3 camp ramp: 2/3/3/4/4/5 objective slots for camps 1-6; camps 3
// and 6 are boss camps; camps 4 and 6 each carry an ordered ①② pair; camp 5
// carries one trick-count placeholder alongside three win-card slots.
export const BALANCE_TABLE: Readonly<Record<CampNumber, CampBalanceEntry>> = {
  1: {
    slots: [{ kind: "win-card" }, { kind: "win-card" }],
    isBossCamp: false,
  },
  2: {
    slots: [{ kind: "win-card" }, { kind: "win-card" }, { kind: "win-card" }],
    isBossCamp: false,
  },
  3: {
    slots: [{ kind: "win-card" }, { kind: "win-card" }, { kind: "win-card" }],
    isBossCamp: true,
  },
  4: {
    slots: [
      { kind: "ordered", order: 1 },
      { kind: "ordered", order: 2 },
      { kind: "win-card" },
      { kind: "win-card" },
    ],
    isBossCamp: false,
  },
  5: {
    slots: [{ kind: "win-card" }, { kind: "win-card" }, { kind: "win-card" }, { kind: "trick-count" }],
    isBossCamp: false,
  },
  6: {
    slots: [
      { kind: "ordered", order: 1 },
      { kind: "ordered", order: 2 },
      { kind: "win-card" },
      { kind: "win-card" },
      { kind: "win-card" },
    ],
    isBossCamp: true,
  },
};

function resolveTrickCountSlot(seed: string, campNumber: number, attemptNumber: number): ObjectiveSlot {
  const kindIndex = seededIndex(seed, STREAMS.trickCountKind(campNumber, attemptNumber), 2);
  if (kindIndex === 0) {
    return { kind: "no-tricks" };
  }
  const { min, max } = TRICK_COUNT_N_RANGE;
  const n = min + seededIndex(seed, STREAMS.trickCountN(campNumber, attemptNumber), max - min + 1);
  return { kind: "exactly-n", n };
}

/** Resolves BALANCE_TABLE[campNumber]'s slots into concrete ObjectiveSlots
 * for createCamp. Only camp 5's "trick-count" placeholder is resolved (via
 * the seeded RNG, D-14); every other slot passes through unchanged. */
export function objectiveSlotsFor(seed: string, campNumber: CampNumber, attemptNumber: number): ObjectiveSlot[] {
  return BALANCE_TABLE[campNumber].slots.map((slot): ObjectiveSlot => {
    if (slot.kind === "trick-count") {
      return resolveTrickCountSlot(seed, campNumber, attemptNumber);
    }
    return slot;
  });
}

export type { CampNumber } from "./types";
