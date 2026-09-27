// Tests for Thick Fog (blind-orders.ts) and Mutiny (mutiny.ts) — Plan
// 10-13, BOSS-01. Integration behavior is driven exclusively through
// applyRunAction and the run-test-support helpers (setupRun/advanceTo), per
// this plan's own <interfaces> note, except for the direct assignFaceDown
// determinism checks and the bare failureChecks-hook checks, which need no
// full run at all (matching 10-12's precedent for eclipseDeckFor).

import { describe, expect, it } from "vitest";
import { applyRunAction } from "../run/run-actions";
import { advanceTo, setupRun } from "../run/run-test-support";
import { rulesFor } from "../run/compose";
import { currentWindow } from "../run/toolkit";
import { assignFaceDown } from "../run/lifecycle";
import { objectiveSlotsFor } from "../run/balance";
import { attemptSeed } from "../run/rng";
import { createCamp, currentActorSeatId } from "../camp";
import type { Catalog, CampNumber, RunState } from "../run/types";
import { blindOrders } from "./blind-orders";
import { mutiny } from "./mutiny";
import type { CampState } from "../state";

function makeCatalog(): Catalog {
  return {
    gear: {},
    bosses: { "blind-orders": blindOrders, mutiny },
  };
}

describe("Thick Fog (blind-orders)", () => {
  const SEED = "thick-fog-seed";

  for (const playerCount of [3, 4, 5] as const) {
    it(`playerCount=${playerCount}: every objective is owned face-down, and the window is between-tricks (never objective-pick)`, () => {
      const catalog = makeCatalog();
      const seatIds = Array.from({ length: playerCount }, (_, i) => `p${i}`);
      const run = advanceTo(
        setupRun({
          seatIds,
          seed: SEED,
          catalog,
          campNumber: 3 as CampNumber,
          bossTwists: { 3: "blind-orders", 6: null },
        }),
        // "objective-pick" merely means "returns once dealt" (advanceTo's
        // own contract) — it does NOT assert the campPhase sub-window is
        // objective-pick. Capturing the state at this earliest post-deal
        // point is exactly what proves the window skipped straight past it.
        "objective-pick",
        catalog,
      );

      const camp = run.attempt!.camp!;
      expect(camp.objectives.every((o) => o.ownerSeatId !== null)).toBe(true);

      const rules = rulesFor(run, catalog);
      expect(currentWindow(run, rules)).toBe("between-tricks");
    });
  }

  it("5 seats, 3 objectives: exactly 3 distinct seats each own exactly one", () => {
    const catalog = makeCatalog();
    const seatIds = ["p0", "p1", "p2", "p3", "p4"];
    const run = advanceTo(
      setupRun({
        seatIds,
        seed: SEED,
        catalog,
        campNumber: 3 as CampNumber,
        bossTwists: { 3: "blind-orders", 6: null },
      }),
      "objective-pick",
      catalog,
    );

    const camp = run.attempt!.camp!;
    expect(camp.objectives.length).toBe(3);
    const owners = camp.objectives.map((o) => o.ownerSeatId);
    expect(owners.every((o) => o !== null)).toBe(true);
    expect(new Set(owners).size).toBe(3);
  });
});

describe("Thick Fog determinism (assignFaceDown, direct)", () => {
  const SEED = "thick-fog-direct-seed";
  const CAMP_NUMBER = 3 as CampNumber;
  const seatIds = ["p0", "p1", "p2", "p3", "p4"];

  function fixtureCamp(): CampState {
    return createCamp({
      seatIds,
      seed: attemptSeed(SEED, CAMP_NUMBER, 1),
      objectiveSlots: objectiveSlotsFor(SEED, CAMP_NUMBER, 1),
    });
  }

  it("the same (seed, campNumber, attemptNumber) gives the same assignment", () => {
    const camp = fixtureCamp();
    const a = assignFaceDown(camp, SEED, CAMP_NUMBER, 1);
    const b = assignFaceDown(camp, SEED, CAMP_NUMBER, 1);
    expect(a.objectives.map((o) => o.ownerSeatId)).toEqual(b.objectives.map((o) => o.ownerSeatId));
  });

  it("attempt 2 is computed from STREAMS.faceDown(3, 2) and differs from attempt 1 for this seed", () => {
    const camp = fixtureCamp();
    const attempt1 = assignFaceDown(camp, SEED, CAMP_NUMBER, 1);
    const attempt2 = assignFaceDown(camp, SEED, CAMP_NUMBER, 2);
    expect(attempt2.objectives.map((o) => o.ownerSeatId)).not.toEqual(
      attempt1.objectives.map((o) => o.ownerSeatId),
    );
  });
});

describe("Mutiny (failureChecks hook, direct)", () => {
  const SEED = "mutiny-hook-seed";
  const SEAT_IDS = ["p0", "p1", "p2"];

  function fixtureRun(catalog: Catalog): RunState {
    return advanceTo(
      setupRun({
        seatIds: SEAT_IDS,
        seed: SEED,
        catalog,
        campNumber: 3 as CampNumber,
        bossTwists: { 3: "mutiny", 6: null },
      }),
      "between-tricks",
      catalog,
    );
  }

  it("is [] before any trick has completed", () => {
    const catalog = makeCatalog();
    const run = fixtureRun(catalog);
    const rules = rulesFor(run, catalog);
    expect(rules.failureChecks(run.attempt!.camp!)).toEqual([]);
  });

  it("includes \"mutiny\" on a spread camp whose completedTricks[0].winnerSeatId is the expedition leader", () => {
    const catalog = makeCatalog();
    const run = fixtureRun(catalog);
    const rules = rulesFor(run, catalog);
    const camp = run.attempt!.camp!;
    const leaderSeatId = camp.expeditionLeaderSeatId;

    const spread: CampState = {
      ...camp,
      completedTricks: [{ index: 0, leaderSeatId, plays: [], winnerSeatId: leaderSeatId }],
    };
    expect(rules.failureChecks(spread)).toContain("mutiny");
  });

  it("is [] when trick 0 is won by another seat, even if the leader wins trick 1", () => {
    const catalog = makeCatalog();
    const run = fixtureRun(catalog);
    const rules = rulesFor(run, catalog);
    const camp = run.attempt!.camp!;
    const leaderSeatId = camp.expeditionLeaderSeatId;
    const otherSeatId = SEAT_IDS.find((id) => id !== leaderSeatId)!;

    const spread: CampState = {
      ...camp,
      completedTricks: [
        { index: 0, leaderSeatId, plays: [], winnerSeatId: otherSeatId },
        { index: 1, leaderSeatId: otherSeatId, plays: [], winnerSeatId: leaderSeatId },
      ],
    };
    expect(rules.failureChecks(spread)).toEqual([]);
  });
});

describe("Mutiny integration (driven camp-3 attempts)", () => {
  const SEAT_IDS = ["p0", "p1", "p2"];

  function driveUntilTrick0Outcome(seed: string, catalog: Catalog): { failed: boolean } {
    let state: RunState = advanceTo(
      setupRun({
        seatIds: SEAT_IDS,
        seed,
        catalog,
        campNumber: 3 as CampNumber,
        bossTwists: { 3: "mutiny", 6: null },
      }),
      "between-tricks",
      catalog,
    );

    for (;;) {
      if (state.attempt === null) {
        const last = state.history[state.history.length - 1]!;
        return { failed: last.status === "failed" };
      }
      const camp = state.attempt.camp!;
      const rules = rulesFor(state, catalog);
      const actorSeatId = currentActorSeatId(camp, rules);
      if (actorSeatId === null) return { failed: false };

      const legal = rules.legalPlays(camp, actorSeatId);
      const cardId = legal[0]!.id;
      const result = applyRunAction(state, actorSeatId, { type: "play-card", cardId }, catalog);
      if (!result.ok) {
        throw new Error(`driveUntilTrick0Outcome: play-card rejected for seat "${actorSeatId}": ${result.error}`);
      }
      state = result.state;

      if (state.attempt === null) {
        const last = state.history[state.history.length - 1]!;
        return { failed: last.status === "failed" };
      }
      if (state.attempt.camp!.completedTricks.length >= 1) {
        return { failed: false };
      }
    }
  }

  it("at least one of seeds m0..m49 has the leader win trick 0, settling the camp failed in that same action", () => {
    const catalog = makeCatalog();
    let foundFailure = false;

    for (let i = 0; i < 50; i++) {
      const { failed } = driveUntilTrick0Outcome(`m${i}`, catalog);
      if (failed) {
        foundFailure = true;
        break;
      }
    }

    expect(foundFailure).toBe(true);
  });
});
