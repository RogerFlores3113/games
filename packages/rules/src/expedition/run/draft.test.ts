// Tests for run/draft.ts (RUN-04, D-05).

import { describe, expect, it } from "vitest";
import { defineItem } from "../content/source-def";
import { draftOfferFor } from "./draft";
import { testCatalog } from "./run-test-support";
import type { SeatRun } from "./types";

const ITEM_IDS = ["item-a", "item-b", "item-c", "item-d", "item-e"];
const CATALOG = testCatalog({
  items: Object.fromEntries(ITEM_IDS.map((id) => [id, defineItem({ id, name: id, text: "Nothing happens." })])),
});

function seat(seatId: string, kit: readonly string[] = [], characterId: string | null = "plain-1"): SeatRun {
  return { seatId, characterId, kit, draftOffer: null, ledger: [] };
}

describe("draftOfferFor", () => {
  it("offers 3 distinct sources: slot 1 an own-character upgrade, the rest items", () => {
    const offer = draftOfferFor("s", 1, seat("p0"), CATALOG);
    expect(offer).not.toBeNull();
    expect(offer!.length).toBe(3);
    expect(new Set(offer).size).toBe(3);
    expect(["plain-1.a", "plain-1.b"]).toContain(offer![0]);
    for (const id of offer!.slice(1)) expect(ITEM_IDS).toContain(id);
  });

  it("is deterministic for identical arguments", () => {
    expect(draftOfferFor("s", 1, seat("p0"), CATALOG)).toEqual(draftOfferFor("s", 1, seat("p0"), CATALOG));
  });

  it("offers only the upgrade the character does not own yet", () => {
    for (let n = 0; n < 10; n++) {
      expect(draftOfferFor(`seed-${n}`, 1, seat("p0", ["plain-1.a"]), CATALOG)![0]).toBe("plain-1.b");
    }
  });

  it("never offers another character's upgrade", () => {
    for (let n = 0; n < 20; n++) {
      const offer = draftOfferFor(`seed-${n}`, 1, seat("p0"), CATALOG)!;
      expect(offer.filter((id) => id.startsWith("plain-2"))).toEqual([]);
    }
  });

  it("with both upgrades owned, offers items only", () => {
    const offer = draftOfferFor("s", 1, seat("p0", ["plain-1.a", "plain-1.b"]), CATALOG)!;
    expect(offer.length).toBe(3);
    for (const id of offer) expect(ITEM_IDS).toContain(id);
  });

  it("never offers an item already in the kit", () => {
    const kit = ["plain-1.a", "item-a", "item-b"];
    for (let n = 0; n < 20; n++) {
      const offer = draftOfferFor(`seed-${n}`, 1, seat("p0", kit), CATALOG)!;
      expect(offer).not.toContain("item-a");
      expect(offer).not.toContain("item-b");
      expect(offer).not.toContain("plain-1.a");
    }
  });

  it("with an upgrade and 2 items left, offers exactly those", () => {
    const kit = ["plain-1.a", "item-a", "item-b", "item-c"];
    const offer = draftOfferFor("s", 1, seat("p0", kit), CATALOG)!;
    expect(offer[0]).toBe("plain-1.b");
    expect(new Set(offer.slice(1))).toEqual(new Set(["item-d", "item-e"]));
    expect(offer.length).toBe(3);
  });

  it("returns null when nothing is left to offer", () => {
    expect(draftOfferFor("s", 1, seat("p0", ["plain-1.a", "plain-1.b", ...ITEM_IDS]), CATALOG)).toBeNull();
  });

  it("offers no upgrade slot before a character is chosen", () => {
    const offer = draftOfferFor("s", 1, seat("p0", [], null), CATALOG)!;
    for (const id of offer) expect(ITEM_IDS).toContain(id);
  });

  it("does not depend on the order the catalogue lists its items", () => {
    const reversed = testCatalog({
      items: Object.fromEntries([...ITEM_IDS].reverse().map((id) => [id, defineItem({ id, name: id, text: "Nothing happens." })])),
    });
    expect(draftOfferFor("s", 1, seat("p0"), CATALOG)).toEqual(draftOfferFor("s", 1, seat("p0"), reversed));
  });

  it("different seats with the same seed and camp are drawn independently", () => {
    let sawDifference = false;
    for (let n = 0; n < 20 && !sawDifference; n++) {
      const a = draftOfferFor(`seed-${n}`, 1, seat("p0"), CATALOG);
      const b = draftOfferFor(`seed-${n}`, 1, seat("p1"), CATALOG);
      sawDifference = JSON.stringify(a) !== JSON.stringify(b);
    }
    expect(sawDifference).toBe(true);
  });

  it("two seats may both be offered the same item (D-05)", () => {
    let sawOverlap = false;
    for (let n = 0; n < 20 && !sawOverlap; n++) {
      const a = new Set(draftOfferFor(`seed-${n}`, 1, seat("p0"), CATALOG)!.slice(1));
      const b = draftOfferFor(`seed-${n}`, 1, seat("p1"), CATALOG)!.slice(1);
      sawOverlap = b.some((id) => a.has(id));
    }
    expect(sawOverlap).toBe(true);
  });

  it("draws the upgrade slot and the item slots on separate streams per camp", () => {
    let sawDifferentCamp = false;
    for (let n = 0; n < 20 && !sawDifferentCamp; n++) {
      const camp1 = draftOfferFor(`seed-${n}`, 1, seat("p0"), CATALOG);
      const camp2 = draftOfferFor(`seed-${n}`, 2, seat("p0"), CATALOG);
      sawDifferentCamp = JSON.stringify(camp1) !== JSON.stringify(camp2);
    }
    expect(sawDifferentCamp).toBe(true);
  });
});
