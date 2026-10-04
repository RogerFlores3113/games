// Tests for run/draft.ts: bundle offers after a cleared camp.

import { describe, expect, it } from "vitest";
import { defineItem, type Rarity } from "../content/source-def";
import { CATALOG } from "./catalog";
import { BASE_DRAFT_SHAPE, draftOfferFor } from "./draft";
import { campIndex } from "./plan";
import { STREAMS, seededIndex } from "./rng";
import { testCatalog } from "./run-test-support";
import type { SeatRun } from "./types";

const plain = (id: string, rarity: Rarity, exclusiveTo?: string) =>
  defineItem({ id, name: id, rarity, price: 1, text: "Nothing happens.", passive: { modifier: () => ({}) }, ...(exclusiveTo === undefined ? {} : { exclusiveTo }) });

const COMMONS = ["c-1", "c-2", "c-3", "c-4"];
const RARES = ["r-1", "r-2", "r-3"];
const MIXED = testCatalog({ items: Object.fromEntries([...COMMONS.map((id) => plain(id, "common")), ...RARES.map((id) => plain(id, "rare"))].map((def) => [def.id, def])) });
const CAMP_1 = campIndex(1);

function seat(seatId: string, characterId: string | null = "plain-1"): SeatRun {
  return { seatId, characterId, upgradeId: null, items: [], equipped: [], offers: [], ledger: [] };
}

describe("draftOfferFor", () => {
  it("offers 3 bundles of 2 distinct items, deterministically", () => {
    for (let n = 0; n < 30; n++) {
      const offer = draftOfferFor(`seed-${n}`, CAMP_1, seat("p0"), 0, MIXED);
      expect(offer.kind).toBe("standard");
      expect(offer.bundles.map((bundle) => bundle.length)).toEqual([2, 2, 2]);
      for (const bundle of offer.bundles) expect(new Set(bundle).size).toBe(2);
      expect(draftOfferFor(`seed-${n}`, CAMP_1, seat("p0"), 0, MIXED)).toEqual(offer);
    }
  });

  it("pins a production offer, so a stream rename shows up", () => {
    expect(draftOfferFor("pinned", CAMP_1, seat("p0", "explorer"), 0, CATALOG)).toEqual({
      kind: "standard",
      bundles: [
        ["trained-monkey", "trail-map"],
        ["rope-ladder", "heavy-pack"],
        ["rain-poncho", "parrot"],
      ],
    });
  });

  it("gives each item the rarity its roll names, while that rarity has items left", () => {
    let rares = 0;
    for (let n = 0; n < 80; n++) {
      const offer = draftOfferFor(`roll-${n}`, CAMP_1, seat("p1"), 0, MIXED);
      offer.bundles.forEach((bundle, b) =>
        bundle.forEach((id, j) => {
          const rolledRare = seededIndex(`roll-${n}`, STREAMS.draftItem(1, "p1", 0, b, j, "rarity"), 100) < 15;
          expect(RARES.includes(id)).toBe(rolledRare);
          if (rolledRare) rares++;
        }),
      );
    }
    expect(rares).toBeGreaterThan(0);
  });

  it("falls back to the other rarity when the rolled one has nothing left", () => {
    const commonsOnly = testCatalog({ items: Object.fromEntries(COMMONS.map((id) => [id, plain(id, "common")])) });
    const oneRare = testCatalog({ items: { "c-1": plain("c-1", "common"), "r-1": plain("r-1", "rare") } });
    for (let n = 0; n < 40; n++) {
      for (const bundle of draftOfferFor(`fall-${n}`, CAMP_1, seat("p0"), 0, commonsOnly).bundles) for (const id of bundle) expect(COMMONS).toContain(id);
      for (const bundle of draftOfferFor(`fall-${n}`, CAMP_1, seat("p0"), 0, oneRare).bundles) expect([...bundle].sort()).toEqual(["c-1", "r-1"]);
    }
  });

  it("adds an exclusive item to each bundle only when the shape asks, and only for its character", () => {
    const catalog = testCatalog({ items: { "c-1": plain("c-1", "common"), "c-2": plain("c-2", "common"), mine: plain("mine", "common", "plain-1") } });
    const packRat = { ...BASE_DRAFT_SHAPE, exclusive: 1 };
    const offered = (characterId: string, shape = BASE_DRAFT_SHAPE) =>
      new Set(Array.from({ length: 20 }, (_, n) => draftOfferFor(`ex-${n}`, CAMP_1, seat("p0", characterId), 0, catalog, shape).bundles.flat()).flat());
    expect(offered("plain-1")).toEqual(new Set(["c-1", "c-2"]));
    expect(offered("plain-1", packRat)).toEqual(new Set(["c-1", "c-2", "mine"]));
    const bundles = draftOfferFor("ex", CAMP_1, seat("p0", "plain-1"), 0, catalog, packRat).bundles;
    expect(bundles.map((bundle) => [bundle.length, bundle[2]])).toEqual([
      [3, "mine"],
      [3, "mine"],
      [3, "mine"],
    ]);
    expect(offered("plain-2", packRat)).toEqual(new Set(["c-1", "c-2"]));
  });

  it("never offers an upgrade", () => {
    const upgradeIds = new Set(Object.values(CATALOG.sources).filter((def) => def.kind === "upgrade").map((def) => def.id));
    for (let n = 0; n < 30; n++) {
      for (const id of draftOfferFor(`up-${n}`, CAMP_1, seat("p0", "explorer"), 0, CATALOG).bundles.flat()) {
        expect(upgradeIds.has(id)).toBe(false);
        expect(Object.hasOwn(CATALOG.items, id)).toBe(true);
      }
    }
  });

  it("does not depend on the order the catalogue lists its items", () => {
    const reversed = testCatalog({ items: Object.fromEntries(Object.entries(MIXED.items).reverse()) });
    expect(draftOfferFor("s", CAMP_1, seat("p0"), 0, reversed)).toEqual(draftOfferFor("s", CAMP_1, seat("p0"), 0, MIXED));
  });

  it("draws per seat, per camp and per ordinal", () => {
    const differs = (a: (n: number) => unknown, b: (n: number) => unknown) => Array.from({ length: 20 }, (_, n) => JSON.stringify(a(n)) !== JSON.stringify(b(n))).some(Boolean);
    expect(differs((n) => draftOfferFor(`d-${n}`, CAMP_1, seat("p0"), 0, MIXED), (n) => draftOfferFor(`d-${n}`, CAMP_1, seat("p1"), 0, MIXED))).toBe(true);
    expect(differs((n) => draftOfferFor(`d-${n}`, CAMP_1, seat("p0"), 0, MIXED), (n) => draftOfferFor(`d-${n}`, campIndex(2), seat("p0"), 0, MIXED))).toBe(true);
    expect(differs((n) => draftOfferFor(`d-${n}`, CAMP_1, seat("p0"), 0, MIXED), (n) => draftOfferFor(`d-${n}`, CAMP_1, seat("p0"), 1, MIXED))).toBe(true);
  });
});
