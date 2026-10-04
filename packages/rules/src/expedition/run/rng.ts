// A1 (Phase 10, Plan 02): the run carries only its `seed` string (see
// run/types.ts's RunState); it never carries a mutable generator state.
// Every draw derives a FRESH sfc32 stream by a unique name, via
// seedToRngState(seed, stream) in ../../shuffle.ts. This is a labeled
// deviation from spec §6.5's "carried generator" wording: it removes the
// entire "forgot to persist the advanced generator state" bug class,
// because there is no advanced state to forget to save in the first place.
//
// STREAMS is the SINGLE builder for every run-level draw-site name (the
// table is reproduced in run/types.ts's header so both files stay in
// sync). Two draws must never share a stream name; rng.test.ts proves this
// pairwise-distinct over the full camp/attempt/seat/use-index/draw grid.
//
// seededIndex is the single seeded-draw primitive every later plan uses for
// a 0..n-1 pick (ability draws and camp 5's trick-count
// kind/N draws). It never falls back to Math.random.

import { nextRandom, seedToRngState } from "../../shuffle";

export function attemptSeed(seed: string, campNumber: number, attemptNumber: number): string {
  return `${seed}:camp${campNumber}:attempt${attemptNumber}`;
}

export const STREAMS = {
  draftUpgrade(campNumber: number, seatId: string): string {
    return `expedition-draft:camp${campNumber}:seat${seatId}:upgrade`;
  },
  draftItems(campNumber: number, seatId: string): string {
    return `expedition-draft:camp${campNumber}:seat${seatId}:items`;
  },
  trickCountKind(campNumber: number, attemptNumber: number): string {
    return `expedition-trickcount-kind:camp${campNumber}:attempt${attemptNumber}`;
  },
  trickCountN(campNumber: number, attemptNumber: number): string {
    return `expedition-trickcount-n:camp${campNumber}:attempt${attemptNumber}`;
  },
  ability(campNumber: number, attemptNumber: number, seatId: string, useIndex: number, draw: number): string {
    return `expedition-ability:camp${campNumber}:attempt${attemptNumber}:seat${seatId}:use${useIndex}:draw${draw}`;
  },
};

/** Seeded 0..n-1 draw. Throws for a non-positive-integer n, matching the
 * "opaque id only" contract callers rely on elsewhere in this package. */
export function seededIndex(seed: string, stream: string, n: number): number {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`seededIndex: n must be a positive integer, got ${n}`);
  }
  const state = seedToRngState(seed, stream);
  const { value } = nextRandom(state);
  return Math.floor((value / 4294967296) * n);
}
