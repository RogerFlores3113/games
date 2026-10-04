import { describe, expect, it } from "vitest";
import { characterName, isSpent, usesLabel, sourceBadges, sourceKind, sourceName, sourceRulesText } from "./source-text";

describe("sourceName", () => {
  it("names a character by its base power, and an upgrade or item by its own name", () => {
    expect(sourceName("explorer")).toBe("Compass");
    expect(sourceName("leader.delegate")).toBe("Delegate");
    expect(sourceName("bait")).toBe("Bait");
    expect(sourceName("not-a-source")).toBe("not-a-source");
    expect(characterName("explorer")).toBe("The Explorer");
  });
});

describe("sourceKind and sourceBadges", () => {
  it("reads the kind and the when and how-often badges from the catalogue", () => {
    expect([sourceKind("explorer"), sourceKind("explorer.reshape"), sourceKind("bait")]).toEqual(["character", "upgrade", "item"]);
    expect(sourceBadges("bait")).toEqual(["On your turn", "Single use"]);
    expect(sourceBadges("explorer")).toEqual(["Between tricks or on your turn", "Once per camp"]);
    expect(sourceBadges("heavy-pack")).toEqual(["Always on"]);
    expect(sourceBadges("leader.momentum")).toEqual(["Always on"]);
  });

  it("keeps the sentence free of the badges", () => {
    expect(sourceRulesText("leader.delegate")).toEqual({ title: "Delegate", text: "Give one of your whispers to a teammate.", badges: ["Between tricks", "Takes a whisper"] });
    expect(sourceRulesText("explorer.reshape")?.badges).toContain("Once per camp, shared with Compass");
    expect(sourceRulesText("nope")).toBeNull();
  });
});

describe("usesLabel and isSpent", () => {
  it.each([
    ["explorer", { kind: "uses", left: 1, of: 1 }, "Once per camp", "1 per camp", false],
    ["explorer", { kind: "uses", left: 0, of: 1 }, "Used this camp", "Used", true],
    ["explorer", { kind: "uses", left: 1, of: 2 }, "1 of 2 this camp", "1 left", false],
    ["bait", { kind: "uses", left: 1, of: 1 }, "Single use", "Single use", false],
    ["parrot", { kind: "uses", left: 0, of: 1 }, "Used this camp", "Used", true],
    ["rain-poncho", { kind: "uses", left: 1, of: 2 }, "1 of 2 charges", "1/2 charges", false],
    ["leader.delegate", { kind: "whispers", left: 2 }, "2 whispers left", "2 left", false],
    ["leader.delegate", { kind: "whispers", left: 1 }, "1 whisper left", "1 left", false],
    ["leader.delegate", { kind: "whispers", left: 0 }, "No whispers left", "Used", true],
    ["jd", { kind: "unlimited" }, "No limit", "No limit", false],
    ["parrot", { kind: "supplies", cost: 1 }, "Costs 1 supply", "1 supply", false],
    ["temple", { kind: "crew", left: 0, earned: 0 }, "Not earned", "Not earned", true],
    ["temple", { kind: "crew", left: 1, earned: 1 }, "1 left", "1 left", false],
  ] as const)("%s with %o reads %s, or %s when short of room", (sourceId, remaining, full, short, spent) => {
    expect(usesLabel(sourceId, remaining)).toEqual({ full, short });
    expect(isSpent(remaining)).toBe(spent);
  });

  it("a passive with no usage is always on; an active one with none reads its catalogue badge", () => {
    expect(usesLabel("heavy-pack", null)).toEqual({ full: "Always on", short: "Always on" });
    expect(usesLabel("explorer", null)).toEqual({ full: "Once per camp", short: "Once per camp" });
    expect(isSpent(null)).toBe(false);
  });
});
