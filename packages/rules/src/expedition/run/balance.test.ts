import { describe, expect, it } from "vitest";
import { createCamp } from "../camp";
import type { CampState } from "../state";
import { PLAIN_GROUND, RUN_LENGTHS, SHOP_CAMPS, TRICK_COUNT_N_RANGE, objectiveSlotsFor, payoutFor, payoutRange } from "./balance";
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

  it("pays 5 plus one per unplayed trick, at most 2, on plain ground", () => {
    expect(payoutFor(plain, camp(18, 18))).toBe(5);
    expect(payoutFor(plain, camp(18, 17))).toBe(6);
    expect(payoutFor(plain, camp(18, 3))).toBe(7);
  });

  it("pays 2 more away from plain ground and 2 more in any weather but fair", () => {
    expect(payoutFor({ location: "clearing", weather: "fair" }, camp(18, 18))).toBe(5);
    expect(payoutFor({ location: "cave", weather: "fair" }, camp(18, 18))).toBe(7);
    expect(payoutFor({ location: "jungle", weather: "downpour" }, camp(18, 18))).toBe(7);
    expect(payoutFor({ location: "cave", weather: "downpour" }, camp(18, 3))).toBe(11);
  });

  it("states the range a route pays", () => {
    expect(payoutRange(plain)).toEqual({ min: 5, max: 7 });
    expect(payoutRange({ location: "clifftop", weather: "rain" })).toEqual({ min: 9, max: 11 });
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
          const slots = objectiveSlotsFor(seed, campSpecAt(seed, length, campIndex(k), CATALOG), 1);
          expect(createCamp({ seatIds: seatIds(players), seed, objectiveSlots: slots }).objectives).toHaveLength(slots.length);
        }
      }
    }
  });
});
