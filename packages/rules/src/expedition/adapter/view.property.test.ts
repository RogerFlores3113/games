// Phase 11, Plan 04: the whole-run every-step per-seat leak property
// (COMM-03/ENG-03). This is ROADMAP Phase 11 success criterion 1 and 3: the
// checker runs for EVERY seat plus one unseated viewer ("spectator") at
// EVERY state in driveRun's states array — not only in the turn immediately
// following a reveal's creation (ROADMAP criterion 1's own explicit
// prohibition; run-test-support.ts's driveRun already drives whole runs
// across 3/4/5 players, every boss twist and random loadouts drawn from the
// real registries).
//
// Seeds are 32-hex (fc.stringMatching(/^[0-9a-f]{32}$/)) so the raw seed
// substring scan (string:forbidden-token) is always a live assertion in this
// suite, never a vacuous no-op. This file never uses the platform's
// non-seeded random API: every random choice comes from fast-check's own
// seeded generation, or from the deterministic `examples` list below; the
// run itself draws exclusively from run/rng.ts's seeded streams (A1).

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { GEAR_REGISTRY } from "../gear/registry";
import { BOSS_REGISTRY } from "../boss/registry";
import { CATALOG } from "../run/catalog";
import { createRun } from "../run/lifecycle";
import { driveRun, setupRun } from "../run/run-test-support";
import { toExpeditionPlayerView } from "./view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "./view-leak-check";
import type { CampNumber, RunState } from "../run/types";

const GEAR_IDS = Object.keys(GEAR_REGISTRY);
const BOSS_IDS = Object.keys(BOSS_REGISTRY);

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

// Copied from run/run.property.test.ts (file-local there, not exported) —
// an ordered pair of DISTINCT BOSS_REGISTRY keys, one per boss camp (3, 6).
const bossPairArb: fc.Arbitrary<[string, string]> = fc
  .tuple(fc.constantFrom(...BOSS_IDS), fc.constantFrom(...BOSS_IDS))
  .filter(([a, b]) => a !== b) as fc.Arbitrary<[string, string]>;

// Copied from run/run.property.test.ts: per-seat loadouts, a subarray of
// GEAR_REGISTRY keys, kept to at most 4 items each.
function loadoutsArb(seatIds: readonly string[]): fc.Arbitrary<Record<string, string[]>> {
  return fc
    .tuple(...seatIds.map(() => fc.subarray(GEAR_IDS, { maxLength: 4 })))
    .map((perSeat) => Object.fromEntries(seatIds.map((seatId, i) => [seatId, perSeat[i]!])));
}

// Identical to run/run.property.test.ts's own runInputArb EXCEPT seed uses
// fc.stringMatching(/^[0-9a-f]{32}$/) (this file's own requirement, so the
// forbidden-token seed scan is always live).
const runInputArb: fc.Arbitrary<RunInput> = fc
  .constantFrom(3, 4, 5)
  .chain((seatCount) => {
    const seatIds = seatIdsFor(seatCount);
    return fc.record({
      seatIds: fc.constant(seatIds),
      seed: fc.stringMatching(/^[0-9a-f]{32}$/),
      choices: fc.array(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 64 }),
      startCamp: fc.constantFrom<CampNumber>(1, 2, 3, 4, 5, 6),
      bossPair: bossPairArb,
      loadouts: loadoutsArb(seatIds),
    });
  });

// Non-vacuity counters (T-11-18): every one of these must be observed > 0 by
// the end of this file's suite, or the coverage claimed by ROADMAP success
// criteria 1/3 would be unproven.
const counters = {
  viewChecks: 0,
  revealViewChecks: 0,
  faceDownChecks: 0,
  draftOfferChecks: 0,
  unseatedChecks: 0,
  preDealChecks: 0,
};

/** Checks every seat's view AND an unseated "spectator" viewer's view for
 * leaks at exactly this one state — never guarded by a reveal-conditional
 * branch (T-11-17): the leak assertion itself always runs; only the
 * COUNTERS below are conditionally incremented. */
function assertNoLeaksAt(state: RunState, seed: string): void {
  for (const id of [...state.seatIds, "spectator"]) {
    const view = toExpeditionPlayerView(state, id, CATALOG);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);

    const secrets = secretsForExpeditionSeat(state, id, CATALOG, seed);
    const reasons = checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets });
    expect(reasons).toEqual([]);

    counters.viewChecks++;
    if (view.attempt !== null && view.attempt.reveals.length > 0) counters.revealViewChecks++;
    if (view.attempt?.camp?.objectiveAssignment === "face-down") counters.faceDownChecks++;
    if (view.yourDraftOffer !== null) counters.draftOfferChecks++;
    if (id === "spectator") counters.unseatedChecks++;
    if (view.runPhase === "pre-deal") counters.preDealChecks++;
  }
}

const DETERMINISTIC_SEED = "1234567890abcdef1234567890abcdef";
const DETERMINISTIC_CHOICES = [0, 1, 2, 3, 5, 8, 13, 21];

function otherBossId(bossId: string): string {
  return BOSS_IDS.find((id) => id !== bossId)!;
}

/** One deterministic example per (boss id, player count) pair, so ENG-03's
 * "every boss twist" and this file's non-vacuity counters are guaranteed
 * positive regardless of fast-check's own random seed — not left to chance.
 * loadouts give seat 0 "peek" (a between-tricks reveal, for
 * revealViewChecks) and seat 1 "jam" (a pre-deal gear, for preDealChecks);
 * every other seat gets no gear. */
const examples: RunInput[] = BOSS_IDS.flatMap((bossId) =>
  [3, 4, 5].map((seatCount) => {
    const seatIds = seatIdsFor(seatCount);
    const loadouts: Record<string, string[]> = Object.fromEntries(
      seatIds.map((seatId, i) => [seatId, i === 0 ? ["peek"] : i === 1 ? ["jam"] : []]),
    );
    return {
      seatIds,
      seed: DETERMINISTIC_SEED,
      choices: DETERMINISTIC_CHOICES,
      startCamp: 3 as CampNumber,
      bossPair: [bossId, otherBossId(bossId)] as [string, string],
      loadouts,
    };
  }),
);

describe("property: whole-run per-seat leak checker (COMM-03/ENG-03)", () => {
  it("no seat's view, nor an unseated viewer's view, ever leaks another seat's card at any step of a whole simulated run", () => {
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

        const { states } = driveRun(initial, choices, CATALOG);
        for (const state of states) assertNoLeaksAt(state, seed);
      }),
      { numRuns: 25, examples: examples.map((example) => [example] as const) },
    );
  });

  it("draft-offer coverage: a fresh fireside gives every seat a real private draft offer (3, 4 and 5 seats)", () => {
    for (const seatCount of [3, 4, 5]) {
      const seatIds = seatIdsFor(seatCount);
      const state = createRun({ seatIds, seed: DETERMINISTIC_SEED }, CATALOG);
      assertNoLeaksAt(state, DETERMINISTIC_SEED);
    }
  });

  it("non-vacuity: every coverage counter observed at least one qualifying state", () => {
    expect(counters.viewChecks).toBeGreaterThan(0);
    expect(counters.revealViewChecks).toBeGreaterThan(0);
    expect(counters.faceDownChecks).toBeGreaterThan(0);
    expect(counters.draftOfferChecks).toBeGreaterThan(0);
    expect(counters.unseatedChecks).toBeGreaterThan(0);
    expect(counters.preDealChecks).toBeGreaterThan(0);
  });
});
