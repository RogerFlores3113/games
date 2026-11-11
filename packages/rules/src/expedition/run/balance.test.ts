import { describe, expect, it } from "vitest";
import { createCamp } from "../camp";
import type { CampState } from "../state";
import { EXTRA_OBJECTIVES, FAILED_ATTEMPT_COINS, PAYOUT, MAX_SEAT_OBJECTIVES, SUPPLIES_MAX, SUPPLIES_START, WASHES, WHISPERS_PER_CAMP, MIX_FROM_CAMP, OBJECTIVE_RAMP, PLAIN_GROUND, RUN_LENGTHS, SHOP_CAMPS, TRICK_COUNT_N_RANGE, mixFromCampFor, objectiveSlotsFor, payoutFor, payoutRange, seatObjectivesAt } from "./balance";
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

  const plain = { location: "jungle", weather: "fair" };

  it("pays the base plus one per unplayed trick, at most the cap, on plain ground", () => {
    expect(payoutFor(plain, camp(18, 18))).toBe(PAYOUT.base);
    expect(payoutFor(plain, camp(18, 17))).toBe(PAYOUT.base + PAYOUT.perUnplayedTrick);
    expect(payoutFor(plain, camp(18, 3))).toBe(PAYOUT.base + PAYOUT.perUnplayedTrick * PAYOUT.unplayedCap);
  });

  it("pays the risk bonus away from plain ground and in any weather but fair", () => {
    expect(payoutFor({ location: "clearing", weather: "fair" }, camp(18, 18))).toBe(PAYOUT.base);
    expect(payoutFor({ location: "cave", weather: "fair" }, camp(18, 18))).toBe(PAYOUT.base + PAYOUT.riskyLocation);
    expect(payoutFor({ location: "jungle", weather: "downpour" }, camp(18, 18))).toBe(PAYOUT.base + PAYOUT.riskyWeather);
    expect(payoutFor({ location: "cave", weather: "downpour" }, camp(18, 3))).toBe(PAYOUT.base + PAYOUT.perUnplayedTrick * PAYOUT.unplayedCap + PAYOUT.riskyLocation + PAYOUT.riskyWeather);
  });

  it("states the range a route pays", () => {
    expect(payoutRange(plain)).toEqual({ min: PAYOUT.base, max: PAYOUT.base + PAYOUT.perUnplayedTrick * PAYOUT.unplayedCap });
    expect(payoutRange({ location: "clifftop", weather: "rain" })).toEqual({ min: PAYOUT.base + PAYOUT.riskyLocation + PAYOUT.riskyWeather, max: PAYOUT.base + PAYOUT.perUnplayedTrick * PAYOUT.unplayedCap + PAYOUT.riskyLocation + PAYOUT.riskyWeather });
  });

  it("names only defs that change nothing as plain ground", () => {
    for (const id of [...PLAIN_GROUND.locations, ...PLAIN_GROUND.weathers]) expect(CATALOG.mods[id]?.full).toEqual({});
  });
});

describe("SHOP_CAMPS", () => {
  it("opens a shop before every boss camp, never before camp 1", () => {
    for (const length of Object.keys(RUN_LENGTHS) as RunLength[]) {
      for (const boss of RUN_LENGTHS[length].bossCamps) expect(SHOP_CAMPS[length]).toContain(boss.at);
      for (const at of SHOP_CAMPS[length]) {
        expect(at).toBeGreaterThan(1);
        expect(at).toBeLessThanOrEqual(RUN_LENGTHS[length].camps);
      }
    }
  });

  it("gives a Short run a second shop before camp 3", () => {
    expect(SHOP_CAMPS.short).toEqual([3, 4]);
  });
});

describe("seatObjectivesAt", () => {
  it("adds each crew size's extras at the camps EXTRA_OBJECTIVES names", () => {
    expect(EXTRA_OBJECTIVES.short).toEqual({ 3: [0, 0, 1, 1], 4: [0, 0, 0, 1], 5: [1, 1, 1, 2] });
    expect(EXTRA_OBJECTIVES.standard).toEqual({ 3: [0, 0, 0, 0, 0, 0], 4: [0, 0, 0, 0, 0, 1], 5: [1, 2, 2, 2, 2, 2] });
    for (const length of Object.keys(RUN_LENGTHS) as RunLength[]) {
      for (const players of [3, 4, 5] as const) {
        expect(EXTRA_OBJECTIVES[length][players]).toHaveLength(RUN_LENGTHS[length].camps);
        OBJECTIVE_RAMP[length].forEach((ramp, i) => {
          expect(seatObjectivesAt(length, i + 1, players)).toBe(Math.min(MAX_SEAT_OBJECTIVES, ramp + EXTRA_OBJECTIVES[length][players][i]!));
        });
      }
    }
    expect([1, 2, 3, 4].map((k) => seatObjectivesAt("short", k, 4))).toEqual([2, 2, 3, 4]);
    expect([1, 2, 3, 4, 5, 6].map((k) => seatObjectivesAt("standard", k, 4))).toEqual([2, 2, 3, 3, 3, 5]);
  });

  it("never returns more than MAX_SEAT_OBJECTIVES", () => {
    expect(MAX_SEAT_OBJECTIVES).toBe(5);
    for (const length of Object.keys(RUN_LENGTHS) as RunLength[]) {
      for (let k = 1; k <= RUN_LENGTHS[length].camps; k++) {
        for (const players of [3, 4, 5]) expect(seatObjectivesAt(length, k, players)).toBeLessThanOrEqual(MAX_SEAT_OBJECTIVES);
      }
    }
    expect(seatObjectivesAt("long", 7, 5)).toBe(5);
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

describe("round 2 numbers", () => {
  it("starts the crew with 5 supplies and holds 6 at most (A2)", () => {
    expect([SUPPLIES_START, SUPPLIES_MAX]).toEqual([5, 6]);
  });

  it("spares 3 players' whispers from Rain and 2 from a Downpour (A3)", () => {
    expect([WASHES.rain.spared, WASHES.downpour.spared]).toEqual([3, 2]);
    expect([3, 4, 5].map((players) => Math.max(0, players - WASHES.rain.spared))).toEqual([0, 1, 2]);
    expect([3, 4, 5].map((players) => Math.max(0, players - WASHES.downpour.spared))).toEqual([1, 2, 3]);
  });

  it("gives every seat 2 whispers a camp (A4)", () => {
    expect(WHISPERS_PER_CAMP).toBe(2);
  });

  it("pays 1 coin for a failed attempt (A5)", () => {
    expect(FAILED_ATTEMPT_COINS).toBe(1);
  });
});
