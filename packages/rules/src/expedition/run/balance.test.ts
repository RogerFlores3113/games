// Tests for run/balance.ts (Plan 10-03, RUN-01, D-14, D-15).

import { describe, expect, it } from "vitest";
import { createCamp } from "../camp";
import { BALANCE_TABLE, TRICK_COUNT_N_RANGE, objectiveSlotsFor } from "./balance";
import type { CampNumber } from "./types";

const ALL_CAMPS: CampNumber[] = [1, 2, 3, 4, 5, 6];
const EXPECTED_SLOT_COUNTS: Record<CampNumber, number> = { 1: 2, 2: 3, 3: 3, 4: 4, 5: 4, 6: 5 };

function seatIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

describe("BALANCE_TABLE", () => {
  it("has 2/3/3/4/4/5 slots for camps 1..6", () => {
    for (const camp of ALL_CAMPS) {
      expect(BALANCE_TABLE[camp].slots.length).toBe(EXPECTED_SLOT_COUNTS[camp]);
    }
  });

  it("marks only camps 3 and 6 as boss camps", () => {
    for (const camp of ALL_CAMPS) {
      expect(BALANCE_TABLE[camp].isBossCamp).toBe(camp === 3 || camp === 6);
    }
  });

  it("camps 4 and 6 contain ordered slots with order 1 and 2", () => {
    for (const camp of [4, 6] as const) {
      const orders = BALANCE_TABLE[camp].slots.filter((s) => s.kind === "ordered").map((s) => (s as { order: number }).order);
      expect(orders).toEqual([1, 2]);
    }
  });

  it("camp 5 contains exactly one trick-count placeholder", () => {
    const trickCountSlots = BALANCE_TABLE[5].slots.filter((s) => s.kind === "trick-count");
    expect(trickCountSlots.length).toBe(1);
  });
});

describe("objectiveSlotsFor", () => {
  it("passes non-camp-5 slots through unchanged", () => {
    for (const camp of [1, 2, 3, 4, 6] as const) {
      const resolved = objectiveSlotsFor("seed-a", camp, 1);
      expect(resolved).toEqual(BALANCE_TABLE[camp].slots);
    }
  });

  it("resolves camp 5's placeholder to no-tricks or exactly-n within TRICK_COUNT_N_RANGE", () => {
    const resolved = objectiveSlotsFor("seed-a", 5, 1);
    expect(resolved.length).toBe(4);
    const resolvedSlot = resolved[3]!;
    expect(["no-tricks", "exactly-n"]).toContain(resolvedSlot.kind);
    if (resolvedSlot.kind === "exactly-n") {
      expect(resolvedSlot.n).toBeGreaterThanOrEqual(TRICK_COUNT_N_RANGE.min);
      expect(resolvedSlot.n).toBeLessThanOrEqual(TRICK_COUNT_N_RANGE.max);
    }
  });

  it("is deterministic per (seed, attemptNumber)", () => {
    const a = objectiveSlotsFor("seed-b", 5, 2);
    const b = objectiveSlotsFor("seed-b", 5, 2);
    expect(a).toEqual(b);
  });

  it("yields both no-tricks and exactly-n across 200 seeds", () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const resolved = objectiveSlotsFor(`seed-${i}`, 5, 1);
      kinds.add(resolved[3]!.kind);
    }
    expect(kinds.has("no-tricks")).toBe(true);
    expect(kinds.has("exactly-n")).toBe(true);
  });

  it("produces slot lists valid for createCamp at 3, 4 and 5 seats, for every camp", () => {
    for (const players of [3, 4, 5]) {
      for (const camp of ALL_CAMPS) {
        const slots = objectiveSlotsFor(`seed-players${players}`, camp, 1);
        expect(() =>
          createCamp({ seatIds: seatIds(players), seed: `seed-players${players}-camp${camp}`, objectiveSlots: slots }),
        ).not.toThrow();
      }
    }
  });
});
