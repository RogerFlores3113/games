// Phase 11, Plan 04: the whole-run every-step per-seat leak property
// (COMM-03/ENG-03). This is ROADMAP Phase 11 success criterion 1 and 3: the
// checker runs for EVERY seat plus one unseated viewer ("spectator") at
// EVERY state in driveRun's states array — not only in the turn immediately
// following a reveal's creation (ROADMAP criterion 1's own explicit
// prohibition; run-test-support.ts's driveRun already drives whole runs
// across 3/4/5 players and random loadouts drawn from the real registries).
//
// Seeds are 32-hex (fc.stringMatching(/^[0-9a-f]{32}$/)) so the raw seed
// substring scan (string:forbidden-token) is always a live assertion in this
// suite, never a vacuous no-op. This file never uses the platform's
// non-seeded random API: every random choice comes from fast-check's own
// seeded generation, or from the deterministic `examples` list below; the
// run itself draws exclusively from run/rng.ts's seeded streams (A1).

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ITEMS } from "../content/items/registry";
import { CATALOG } from "../run/catalog";
import { draftOfferFor } from "../run/draft";
import { createRun } from "../run/lifecycle";
import { driveRun, setupRun } from "../run/run-test-support";
import { toExpeditionPlayerView } from "./view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "./view-leak-check";
import { RUN_LENGTHS } from "../run/balance";
import { campIndex } from "../run/plan";
import type { RunLength, RunState } from "../run/types";

const ITEM_IDS = Object.keys(ITEMS);

function seatIdsFor(seatCount: number): string[] {
  return Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
}

type RunInput = {
  seatIds: string[];
  seed: string;
  choices: number[];
  length: RunLength;
  startCamp: number;
  items: Record<string, string[]>;
};

// Per-seat items: a subarray of ITEMS keys, kept to at most 4 items each.
function itemsArb(seatIds: readonly string[]): fc.Arbitrary<Record<string, string[]>> {
  return fc
    .tuple(...seatIds.map(() => fc.subarray(ITEM_IDS, { maxLength: 4 })))
    .map((perSeat) => Object.fromEntries(seatIds.map((seatId, i) => [seatId, perSeat[i]!])));
}

// Identical to run/run.property.test.ts's own runInputArb EXCEPT seed uses
// fc.stringMatching(/^[0-9a-f]{32}$/) (this file's own requirement, so the
// forbidden-token seed scan is always live).
const runInputArb: fc.Arbitrary<RunInput> = fc
  .tuple(fc.constantFrom(3, 4, 5), fc.constantFrom<RunLength>("short", "standard", "long"))
  .chain(([seatCount, length]) => {
    const seatIds = seatIdsFor(seatCount);
    return fc.record({
      seatIds: fc.constant(seatIds),
      seed: fc.stringMatching(/^[0-9a-f]{32}$/),
      choices: fc.array(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 64 }),
      length: fc.constant(length),
      startCamp: fc.integer({ min: 1, max: RUN_LENGTHS[length].camps }),
      items: itemsArb(seatIds),
    });
  });

// Non-vacuity counters (T-11-18): every one of these must be observed > 0 by
// the end of this file's suite, or the coverage claimed by ROADMAP success
// criteria 1/3 would be unproven.
const counters = {
  viewChecks: 0,
  revealViewChecks: 0,
  draftOfferChecks: 0,
  unseatedChecks: 0,
  musterChecks: 0,
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
    if (view.stage.tag === "camp" && view.stage.attempt.reveals.length > 0) counters.revealViewChecks++;
    if (view.stage.tag === "draft" && view.stage.yourOffer !== null) counters.draftOfferChecks++;
    if (id === "spectator") counters.unseatedChecks++;
    if (view.stage.tag === "muster") counters.musterChecks++;
  }
}

const DETERMINISTIC_SEED = "1234567890abcdef1234567890abcdef";
const DETERMINISTIC_CHOICES = [0, 1, 2, 3, 5, 8, 13, 21];

/** One deterministic example per player count, so this file's non-vacuity
 * counters are guaranteed positive regardless of fast-check's own random
 * seed — not left to chance. seat 0 is the Scout (a between-tricks reveal,
 * for revealViewChecks); seat 1 carries the Rain Poncho; every other seat
 * gets no items. */
const examples: RunInput[] = [3, 4, 5].map((seatCount) => {
  const seatIds = seatIdsFor(seatCount);
  const items: Record<string, string[]> = Object.fromEntries(seatIds.map((seatId, i) => [seatId, i === 1 ? ["rain-poncho"] : []]));
  return { seatIds, seed: DETERMINISTIC_SEED, choices: DETERMINISTIC_CHOICES, length: "standard" as const, startCamp: 3, items };
});

describe("property: whole-run per-seat leak checker (COMM-03/ENG-03)", () => {
  it("no seat's view, nor an unseated viewer's view, ever leaks another seat's card at any step of a whole simulated run", () => {
    fc.assert(
      fc.property(runInputArb, ({ seatIds, seed, choices, length, startCamp, items }) => {
        const initial = setupRun({
          seatIds,
          seed,
          catalog: CATALOG,
          length,
          camp: startCamp,
          characters: { [seatIds[0]!]: "explorer" },
          items,
        });

        const { states } = driveRun(initial, choices, CATALOG);
        for (const state of states) assertNoLeaksAt(state, seed);
      }),
      { numRuns: 25, examples: examples.map((example) => [example] as const) },
    );
  }, 30_000);

  it("draft-offer coverage: every seat holding a real private draft offer leaks nothing (3, 4 and 5 seats)", () => {
    for (const seatCount of [3, 4, 5]) {
      const base = setupRun({ seatIds: seatIdsFor(seatCount), seed: DETERMINISTIC_SEED, catalog: CATALOG, camp: 2 });
      const state: RunState = {
        ...base,
        seats: base.seats.map((seat) => ({ ...seat, offers: [draftOfferFor(DETERMINISTIC_SEED, campIndex(2), seat, 0, CATALOG)] })),
        stage: { tag: "draft", cleared: campIndex(2), payout: 5 },
      };
      expect(state.seats.every((seat) => seat.offers.length === 1)).toBe(true);
      assertNoLeaksAt(state, DETERMINISTIC_SEED);
    }
  });

  it("muster coverage: a fresh run still choosing characters leaks nothing (3, 4 and 5 seats)", () => {
    for (const seatCount of [3, 4, 5]) {
      const state = createRun({ seatIds: seatIdsFor(seatCount), seed: DETERMINISTIC_SEED });
      expect(toExpeditionPlayerView(state, "seat-0", CATALOG).stage.tag).toBe("muster");
      assertNoLeaksAt(state, DETERMINISTIC_SEED);
    }
  });

  it("non-vacuity: every coverage counter observed at least one qualifying state", () => {
    expect(counters.viewChecks).toBeGreaterThan(0);
    expect(counters.revealViewChecks).toBeGreaterThan(0);
    expect(counters.draftOfferChecks).toBeGreaterThan(0);
    expect(counters.unseatedChecks).toBeGreaterThan(0);
    expect(counters.musterChecks).toBeGreaterThan(0);
  });
});
