import { describe, expect, it } from "vitest";
import { rarityItemLabel, rarityOf, rarityTag } from "./rarity";

describe("rarity", () => {
  it("reads the three tiers from the catalogue", () => {
    expect([rarityOf("bait"), rarityOf("whetstone"), rarityOf("rope-ladder")]).toEqual(["common", "uncommon", "rare"]);
    expect([rarityOf(null), rarityOf("leader")]).toEqual(["common", "common"]);
  });

  it("labels and tags each tier", () => {
    expect(["common", "uncommon", "rare"].map((r) => rarityItemLabel(r as "common"))).toEqual(["Common item", "Uncommon item", "Rare item"]);
    expect([rarityTag("common"), rarityTag("uncommon"), rarityTag("rare")]).toEqual([null, "Uncommon", "Rare"]);
  });
});
