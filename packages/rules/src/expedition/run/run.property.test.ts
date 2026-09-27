// Whole-run fast-check simulation properties (Plan 10-17, RUN-07). This is
// ROADMAP success criterion 3 and the phase's strongest end-to-end
// regression net: arbitrary seeds, 3/4/5 players, every boss-twist pairing
// for camps 3 and 6, random starting camps and random loadouts drawn from
// the REAL gear/boss registries, driven by random bots through driveRun
// (run-test-support.ts), which applies every step through the real
// applyRunAction transition (the only dispatcher in the run layer).
//
// Phase 11 extends this suite with the real per-seat leak checker for
// ENG-03/COMM-03 (toPlayerView doesn't exist yet in this phase); Property D
// below is a STRUCTURAL no-leak check only (reveal audiences are non-empty
// subsets of seatIds, log entries carry no card fields, draft offers are
// never the offered seat's own gear) — it is not the full leak proof.
//
// Never uses the platform's non-seeded random API: every random choice in
// this file (seed strings, seatCount, startCamp, boss pairs, loadouts,
// choice streams) comes from fast-check's own seeded generation; the run
// itself draws exclusively from run/rng.ts's seeded streams (A1).

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { GEAR_REGISTRY } from "../gear/registry";
import { BOSS_REGISTRY } from "../boss/registry";
import { runStatus } from "./lifecycle";
import { advanceTo, driveRun, replayRun, setupRun } from "./run-test-support";
import { campCardIds } from "./toolkit";
import type { Catalog, CampNumber } from "./types";

const CATALOG: Catalog = { gear: GEAR_REGISTRY, bosses: BOSS_REGISTRY };
const GEAR_IDS = Object.keys(GEAR_REGISTRY);
const BOSS_IDS = Object.keys(BOSS_REGISTRY);
const LOG_ENTRY_KEYS = ["event", "actorSeatId", "subjectSeatIds", "gearId", "audience"];

function seatIdsFor(seatCount: number): string[] {
  return Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
}

type RunInput = {
  seatIds: string[];
  seed: string;
  choices: number[];
  startCamp: CampNumber;
  bossPair: [string, string];
  loadouts: Record<string, string[]>;
};

// An ordered pair of DISTINCT BOSS_REGISTRY keys, one per boss camp (3, 6) —
// D-03: a run never repeats a boss twist, so the pair is never equal.
const bossPairArb: fc.Arbitrary<[string, string]> = fc
  .tuple(fc.constantFrom(...BOSS_IDS), fc.constantFrom(...BOSS_IDS))
  .filter(([a, b]) => a !== b) as fc.Arbitrary<[string, string]>;

// Per-seat loadouts: a subarray of GEAR_REGISTRY keys, kept to at most 4
// items each for runtime (behavior spec).
function loadoutsArb(seatIds: readonly string[]): fc.Arbitrary<Record<string, string[]>> {
  return fc
    .tuple(...seatIds.map(() => fc.subarray(GEAR_IDS, { maxLength: 4 })))
    .map((perSeat) => Object.fromEntries(seatIds.map((seatId, i) => [seatId, perSeat[i]!])));
}

const runInputArb: fc.Arbitrary<RunInput> = fc
  .constantFrom(3, 4, 5)
  .chain((seatCount) => {
    const seatIds = seatIdsFor(seatCount);
    return fc.record({
      seatIds: fc.constant(seatIds),
      seed: fc.string({ minLength: 1 }),
      choices: fc.array(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 64 }),
      startCamp: fc.constantFrom<CampNumber>(1, 2, 3, 4, 5, 6),
      bossPair: bossPairArb,
      loadouts: loadoutsArb(seatIds),
    });
  });

describe("property: whole-run simulation (RUN-07)", () => {
  // Properties A (RUN-07 replay) and D (whole-run safety) are combined into
  // one fc.property, driving the run ONCE and checking both, to halve the
  // runtime (per the plan's own instruction). numRuns kept at 40 to stay
  // under ~60s locally alongside Property B's 15 (measured duration recorded
  // in SUMMARY.md).
  it("replays byte-for-byte from seed + action log, and holds every whole-run safety invariant at every step", () => {
    fc.assert(
      fc.property(runInputArb, ({ seatIds, seed, choices, startCamp, bossPair, loadouts }) => {
        const initial = setupRun({
          seatIds,
          seed,
          catalog: CATALOG,
          campNumber: startCamp,
          loadouts,
          bossTwists: { 3: bossPair[0], 6: bossPair[1] },
        });

        const { states, log } = driveRun(initial, choices, CATALOG);

        // Property A (RUN-07): replaying the log from the same initial state
        // reproduces every step deep-equal.
        const replayed = replayRun(initial, log, CATALOG);
        expect(replayed).toEqual(states);

        // Property D: the run always terminates won or lost (never gets
        // stuck with legal actions exhausted mid-run, and never throws —
        // driveRun/replayRun above would have thrown already if it did).
        const final = states[states.length - 1]!;
        expect(runStatus(final)).not.toBe("in_progress");

        const firstDealtIdsByAttempt = new Map<string, readonly string[]>();
        let prevSupplies = states[0]!.supplies;

        for (const state of states) {
          // JSON round-trippable at every step.
          expect(JSON.parse(JSON.stringify(state))).toEqual(state);

          // Supplies never increase.
          expect(state.supplies).toBeLessThanOrEqual(prevSupplies);
          prevSupplies = state.supplies;

          // Every draft offer excludes gear that seat already owns (RUN-04).
          for (const seat of state.seats) {
            if (seat.draftOffer !== null) {
              for (const gearId of seat.draftOffer) {
                expect(seat.ownedGearIds).not.toContain(gearId);
              }
            }
          }

          if (state.attempt !== null && state.attempt.camp !== null) {
            const camp = state.attempt.camp;
            const ids = campCardIds(camp);

            // No card id appears twice.
            expect(new Set(ids).size).toBe(ids.length);

            // The multiset of campCardIds equals this attempt's FIRST dealt
            // ids (cards are conserved for the whole attempt's lifetime).
            const key = `${state.campNumber}:${state.attempt.attemptNumber}`;
            const first = firstDealtIdsByAttempt.get(key);
            if (first === undefined) {
              firstDealtIdsByAttempt.set(key, ids);
            } else {
              expect(ids).toEqual(first);
            }

            // Structural no-leak checks (interim; Phase 11 extends this with
            // the real per-seat leak checker for ENG-03/COMM-03).
            for (const reveal of state.attempt.reveals) {
              expect(reveal.audience.length).toBeGreaterThan(0);
              for (const audienceSeatId of reveal.audience) {
                expect(seatIds).toContain(audienceSeatId);
              }
            }
            for (const entry of state.attempt.log) {
              expect(Object.keys(entry).every((k) => LOG_ENTRY_KEYS.includes(k))).toBe(true);
            }
          }
        }

        // Supplies decrease by >= 1 per failed camp (RUN-02).
        for (const entry of final.history) {
          if (entry.status === "failed") {
            expect(entry.suppliesSpent).toBeGreaterThanOrEqual(1);
          }
        }
      }),
      { numRuns: 40 },
    );
  });

  // Property B: same seed, same seatIds, same action stream -> deep-equal
  // states arrays, independent of Property A's own replay check (this
  // property drives TWO independently built RunStates from scratch, rather
  // than replaying a single log).
  it("gives deep-equal state arrays for two independently-built runs from identical seed/seatIds driven by an identical action stream", () => {
    fc.assert(
      fc.property(runInputArb, ({ seatIds, seed, choices, startCamp, bossPair, loadouts }) => {
        const opts = {
          seatIds,
          seed,
          catalog: CATALOG,
          campNumber: startCamp,
          loadouts,
          bossTwists: { 3: bossPair[0], 6: bossPair[1] },
        };

        const runA = setupRun(opts);
        const runB = setupRun(opts);

        const { states: statesA } = driveRun(runA, choices, CATALOG);
        const { states: statesB } = driveRun(runB, choices, CATALOG);

        expect(statesB).toEqual(statesA);
      }),
      { numRuns: 15 },
    );
  });

  // Property C: seed sensitivity, example-based (not a property) over the
  // first 20 generated seed pairs with s1 != s2 — asserts the attempt-1
  // hands at camp 1 differ in at least one of the 20 pairs (the seed is the
  // only randomness root, A1).
  it("gives different attempt-1 camp-1 hands for at least one of 20 distinct seed pairs (seed sensitivity, A1)", () => {
    const seatIds = seatIdsFor(4);

    function attempt1Camp1Hands(seed: string) {
      const run = setupRun({ seatIds, seed, catalog: CATALOG });
      const dealt = advanceTo(run, "objective-pick", CATALOG);
      return dealt.attempt!.camp!.hands;
    }

    let sawDifference = false;
    for (let i = 0; i < 20; i++) {
      const seedA = `seed-a-${i}`;
      const seedB = `seed-b-${i}`;
      const handsA = attempt1Camp1Hands(seedA);
      const handsB = attempt1Camp1Hands(seedB);
      if (JSON.stringify(handsA) !== JSON.stringify(handsB)) {
        sawDifference = true;
        break;
      }
    }

    expect(sawDifference).toBe(true);
  });
});

