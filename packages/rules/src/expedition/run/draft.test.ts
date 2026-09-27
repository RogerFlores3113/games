// Tests for run/draft.ts (Plan 10-05, RUN-04, D-05).

import { describe, expect, it } from "vitest";
import { draftOfferFor } from "./draft";

const ALL_GEAR = ["gear-a", "gear-b", "gear-c", "gear-d", "gear-e"];

describe("draftOfferFor", () => {
  it("returns 3 distinct ids from allGearIds", () => {
    const offer = draftOfferFor("s", 1, "p0", ALL_GEAR, []);
    expect(offer).not.toBeNull();
    expect(offer!.length).toBe(3);
    expect(new Set(offer)).toEqual(new Set(offer)); // distinct by construction
    expect(new Set(offer).size).toBe(3);
    for (const id of offer!) {
      expect(ALL_GEAR).toContain(id);
    }
  });

  it("is deterministic for identical args", () => {
    const a = draftOfferFor("s", 1, "p0", ALL_GEAR, []);
    const b = draftOfferFor("s", 1, "p0", ALL_GEAR, []);
    expect(a).toEqual(b);
  });

  it("never includes an id in ownedGearIds", () => {
    const owned = ["gear-a", "gear-b"];
    for (let seed = 0; seed < 20; seed++) {
      const offer = draftOfferFor(`seed-${seed}`, 1, "p0", ALL_GEAR, owned);
      expect(offer).not.toBeNull();
      for (const id of offer!) {
        expect(owned).not.toContain(id);
      }
    }
  });

  it("with 2 candidates left, returns both", () => {
    const owned = ["gear-a", "gear-b", "gear-c"];
    const offer = draftOfferFor("s", 1, "p0", ALL_GEAR, owned);
    expect(offer).not.toBeNull();
    expect(offer!.length).toBe(2);
    expect(new Set(offer)).toEqual(new Set(["gear-d", "gear-e"]));
  });

  it("with 0 candidates left, returns null", () => {
    const offer = draftOfferFor("s", 1, "p0", ALL_GEAR, ALL_GEAR);
    expect(offer).toBeNull();
  });

  it("candidate order does not depend on the caller's ids order (sorted first)", () => {
    const reversed = [...ALL_GEAR].reverse();
    const a = draftOfferFor("s", 1, "p0", ALL_GEAR, []);
    const b = draftOfferFor("s", 1, "p0", reversed, []);
    expect(a).toEqual(b);
  });

  it("different seats with the same seed/camp get independently drawn offers", () => {
    let sawDifference = false;
    for (let seed = 0; seed < 20; seed++) {
      const offerP0 = draftOfferFor(`seed-${seed}`, 1, "p0", ALL_GEAR, []);
      const offerP1 = draftOfferFor(`seed-${seed}`, 1, "p1", ALL_GEAR, []);
      if (JSON.stringify(offerP0) !== JSON.stringify(offerP1)) {
        sawDifference = true;
        break;
      }
    }
    expect(sawDifference).toBe(true);
  });

  it("two seats may both be offered the same id (D-05)", () => {
    let sawOverlap = false;
    for (let seed = 0; seed < 20; seed++) {
      const offerP0 = new Set(draftOfferFor(`seed-${seed}`, 1, "p0", ALL_GEAR, []) ?? []);
      const offerP1 = new Set(draftOfferFor(`seed-${seed}`, 1, "p1", ALL_GEAR, []) ?? []);
      for (const id of offerP0) {
        if (offerP1.has(id)) {
          sawOverlap = true;
          break;
        }
      }
      if (sawOverlap) break;
    }
    expect(sawOverlap).toBe(true);
  });
});
