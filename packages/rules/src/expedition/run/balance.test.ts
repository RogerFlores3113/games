import { describe, expect, it } from "vitest";
import { createCamp } from "../camp";
import type { CampState } from "../state";
import { EXTRA_OBJECTIVES_BY_PLAYERS, MIX_FROM_CAMP, OBJECTIVE_RAMP, RUN_LENGTHS, TRICK_COUNT_N_RANGE, mixFromCampFor, objectiveSlotsFor, payoutFor, seatObjectivesAt } from "./balance";
import { campIndex } from "./plan";
import { CATALOG } from "./catalog";
import { campSpecAt, type CampSpec } from "./route";
import type { RunLength } from "./types";

function seatIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

const trickCountSpec: CampSpec = { index: campIndex(5), location: "jungle", weather: "fair", slots: [{ kind: "win-card" }, { kind: "trick-count" }] };

describe("payoutFor", () => {
  const camp = (totalTricks: number, completed: number): CampState =>
    ({ totalTricks, completedTricks: Array.from({ length: completed }, (_, index) => ({ index, leaderSeatId: "p0", plays: [], winnerSeatId: "p0" })) }) as unknown as CampState;

  it("pays 5 plus one per unplayed trick, at most 3", () => {
    expect(payoutFor(camp(18, 18))).toBe(5);
    expect(payoutFor(camp(18, 16))).toBe(7);
    expect(payoutFor(camp(18, 3))).toBe(8);
  });
});

describe("seatObjectivesAt", () => {
  it("is the ramp at 3 players, one more at 4 and two more at 5, at every camp", () => {
    expect(EXTRA_OBJECTIVES_BY_PLAYERS).toEqual({ 3: 0, 4: 1, 5: 2 });
    for (const length of Object.keys(RUN_LENGTHS) as RunLength[]) {
      OBJECTIVE_RAMP[length].forEach((ramp, i) => {
        expect([3, 4, 5].map((players) => seatObjectivesAt(length, i + 1, players))).toEqual([ramp, ramp + 1, ramp + 2]);
      });
    }
  });

  it("refuses a camp the run length does not have", () => {
    expect(() => seatObjectivesAt("short", 5, 3)).toThrow("balance: short run has no camp 5");
  });
});

describe("mixFromCampFor", () => {
  it("mixes from MIX_FROM_CAMP at 3 players and one camp earlier at 4 and 5", () => {
    expect([3, 4, 5].map(mixFromCampFor)).toEqual([MIX_FROM_CAMP, MIX_FROM_CAMP - 1, MIX_FROM_CAMP - 1]);
  });
});

describe("objectiveSlotsFor", () => {
  it("passes win-card and ordered slots through unchanged", () => {
    const spec: CampSpec = { ...trickCountSpec, slots: [{ kind: "ordered", order: 1 }, { kind: "ordered", order: 2 }, { kind: "win-card" }] };
    expect(objectiveSlotsFor("seed-a", spec, 1)).toEqual([{ kind: "ordered", order: 1 }, { kind: "ordered", order: 2 }, { kind: "win-card" }]);
  });

  it("resolves a trick-count slot to no-tricks or exactly-n within TRICK_COUNT_N_RANGE, both occurring", () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const resolved = objectiveSlotsFor(`seed-${i}`, trickCountSpec, 1)[1]!;
      kinds.add(resolved.kind);
      if (resolved.kind === "exactly-n") {
        expect(resolved.n).toBeGreaterThanOrEqual(TRICK_COUNT_N_RANGE.min);
        expect(resolved.n).toBeLessThanOrEqual(TRICK_COUNT_N_RANGE.max);
      }
    }
    expect([...kinds].sort()).toEqual(["exactly-n", "no-tricks"]);
  });

  it("is deterministic per (seed, attempt) and redrawn for another attempt", () => {
    expect(objectiveSlotsFor("seed-b", trickCountSpec, 2)).toEqual(objectiveSlotsFor("seed-b", trickCountSpec, 2));
    const byAttempt = new Set(Array.from({ length: 20 }, (_, a) => JSON.stringify(objectiveSlotsFor("seed-b", trickCountSpec, a + 1))));
    expect(byAttempt.size).toBeGreaterThan(1);
  });

  it("every camp of every length deals at 3, 4 and 5 seats", () => {
    for (const length of Object.keys(RUN_LENGTHS) as RunLength[]) {
      for (let k = 1; k <= RUN_LENGTHS[length].camps; k++) {
        for (const players of [3, 4, 5]) {
          const seed = `deal-${length}-${k}-${players}`;
          const slots = objectiveSlotsFor(seed, campSpecAt(seed, length, campIndex(k), CATALOG, players), 1);
          expect(createCamp({ seatIds: seatIds(players), seed, objectiveSlots: slots }).objectives).toHaveLength(slots.length);
        }
      }
    }
  });
});
