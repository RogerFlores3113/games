// Objective-kind catalogue contract (Plan 10-14, ENG-02). objectives.ts's
// own header states the ENG-01 recipe for an objective kind: one
// ObjectiveKindDef plus one OBJECTIVE_KINDS line (Phase 9's KindRegistry
// mapped type already makes a missing line a compile error). This file
// auto-checks every REGISTERED kind by iterating
// Object.entries(OBJECTIVE_KINDS) only — never a hand-written per-kind test
// list. The only per-kind data anywhere in this file is the minimal
// ObjectiveSlot needed to build a one-objective fixture, looked up by kind
// in FIXTURE_SLOT_FOR; the guard test below asserts that map covers every
// OBJECTIVE_KINDS key, so a newly registered kind with no fixture entry
// fails loudly here rather than silently skipping its contract check.

import { describe, expect, it } from "vitest";
import { createCamp } from "./camp";
import { describeObjective, evaluateObjective, OBJECTIVE_KINDS } from "./objectives";
import { objectiveSlotsFor, RUN_LENGTHS } from "./run/balance";
import { campIndex } from "./run/plan";
import { CATALOG } from "./run/catalog";
import { campSpecAt } from "./run/route";
import type { RunLength } from "./run/types";
import type { ObjectiveKind, ObjectiveSlot, ObjectiveStatus } from "./state";

const SEAT_IDS = ["p0", "p1", "p2"];
const SEED = "objective-kinds-contract-seed";
const VALID_STATUSES: readonly ObjectiveStatus[] = ["pending", "done", "failed"];

const FIXTURE_SLOT_FOR: Record<ObjectiveKind, ObjectiveSlot> = {
  "win-card": { kind: "win-card" },
  ordered: { kind: "ordered", order: 1 },
  "no-tricks": { kind: "no-tricks" },
  "exactly-n": { kind: "exactly-n", n: 1 },
};

describe("OBJECTIVE_KINDS fixture coverage guard", () => {
  it("FIXTURE_SLOT_FOR covers every OBJECTIVE_KINDS key", () => {
    const registryKeys = Object.keys(OBJECTIVE_KINDS).sort();
    const fixtureKeys = Object.keys(FIXTURE_SLOT_FOR).sort();
    expect(fixtureKeys).toEqual(registryKeys);
  });
});

for (const [id, def] of Object.entries(OBJECTIVE_KINDS)) {
  describe(`objective-kind catalogue contract: ${id}`, () => {
    it("registry key equals the def's own id", () => {
      expect(def.id).toBe(id);
    });

    it("describe() is non-empty and evaluate() is deterministic and in {pending, done, failed}", () => {
      const slot = FIXTURE_SLOT_FOR[id as ObjectiveKind];
      expect(slot.kind).toBe(id);

      const camp = createCamp({ seatIds: SEAT_IDS, seed: `${SEED}-${id}`, objectiveSlots: [slot] });
      const objective = camp.objectives[0]!;
      expect(objective.kind).toBe(id);

      const description = describeObjective(objective);
      expect(typeof description).toBe("string");
      expect(description.length).toBeGreaterThan(0);

      const status = evaluateObjective(camp, objective);
      expect(VALID_STATUSES).toContain(status);
      expect(evaluateObjective(camp, objective)).toBe(status); // identical on a second call
    });
  });
}

describe("every ObjectiveSlot kind a camp spec can produce is registered", () => {
  it("objectiveSlotsFor over every camp of every run length and 20 seeds only ever produces a registered kind", () => {
    const lengths: readonly RunLength[] = ["short", "standard", "long"];
    const registryKeys = new Set(Object.keys(OBJECTIVE_KINDS));

    for (let i = 0; i < 20; i++) {
      const seed = `${SEED}-balance-${i}`;
      for (const length of lengths) {
        for (let k = 1; k <= RUN_LENGTHS[length].camps; k++) {
          const spec = campSpecAt(seed, length, campIndex(k), CATALOG);
          for (const slot of objectiveSlotsFor(seed, spec, 1)) {
            expect(registryKeys.has(slot.kind)).toBe(true);
          }
        }
      }
    }
  });
});
