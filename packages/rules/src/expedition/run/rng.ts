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
// pairwise-distinct over the full camp/attempt/seat/use-index/gear-id/
// purpose grid.
//
// seededIndex is the single seeded-draw primitive every later plan uses for
// a 0..n-1 pick (Spyglass, Trained Monkey, Thick Fog's face-down assignment,
// camp 5's trick-count kind/N draws). It never falls back to Math.random.

import { nextRandom, seedToRngState } from "../../shuffle";

export function attemptSeed(seed: string, campNumber: number, attemptNumber: number): string {
  return `${seed}:camp${campNumber}:attempt${attemptNumber}`;
}

export const STREAMS = {
  draft(campNumber: number, seatId: string): string {
    return `expedition-draft:camp${campNumber}:seat${seatId}`;
  },
  boss(campNumber: number): string {
    return `expedition-boss:camp${campNumber}`;
  },
  trickCountKind(campNumber: number, attemptNumber: number): string {
    return `expedition-trickcount-kind:camp${campNumber}:attempt${attemptNumber}`;
  },
  trickCountN(campNumber: number, attemptNumber: number): string {
    return `expedition-trickcount-n:camp${campNumber}:attempt${attemptNumber}`;
  },
  faceDown(campNumber: number, attemptNumber: number): string {
    return `expedition-face-down:camp${campNumber}:attempt${attemptNumber}`;
  },
  gear(
    campNumber: number,
    attemptNumber: number,
    useIndex: number,
    gearId: string,
    seatId: string,
    purpose: string,
  ): string {
    return `expedition-gear:camp${campNumber}:attempt${attemptNumber}:use${useIndex}:${gearId}:${seatId}:${purpose}`;
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
