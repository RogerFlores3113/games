import { describe, expect, it } from "vitest";
import { characterName, isSpent, usesLabel, sourceBadges, sourceKind, sourceName, sourceRulesText } from "./source-text";

describe("sourceName", () => {
  it("names a character by its base power, and an upgrade or item by its own name", () => {
    expect(sourceName("scout")).toBe("Spyglass");
    expect(sourceName("botanist.antidote")).toBe("Antidote");
    expect(sourceName("bait")).toBe("Bait");
    expect(sourceName("not-a-source")).toBe("not-a-source");
    expect(characterName("scout")).toBe("The Scout");
  });
});

describe("sourceKind and sourceBadges", () => {
  it("reads the kind and the when and how-often badges from the catalogue", () => {
    expect([sourceKind("medic"), sourceKind("medic.rally"), sourceKind("bait")]).toEqual(["character", "upgrade", "item"]);
    expect(sourceBadges("bait")).toEqual(["On your turn", "Single use"]);
    expect(sourceBadges("botanist")).toEqual(["Between tricks", "1 herb"]);
    expect(sourceBadges("heavy-pack")).toEqual(["Always on"]);
    expect(sourceBadges("scout.keen-eye")).toEqual(["Always on"]);
  });

  it("keeps the sentence free of the badges", () => {
    expect(sourceRulesText("medic")).toEqual({ title: "Triage", text: "Drop a failed objective.", badges: ["When an objective fails", "1 supply"] });
    expect(sourceRulesText("nope")).toBeNull();
  });
});

describe("usesLabel and isSpent", () => {
  it.each([
    ["scout", { kind: "uses", left: 1, of: 1 }, "Once per camp", "1 per camp", false],
    ["scout", { kind: "uses", left: 0, of: 1 }, "Used this camp", "Used", true],
    ["guide", { kind: "uses", left: 1, of: 2 }, "1 of 2 this camp", "1 left", false],
    ["guide.howler-call", { kind: "uses", left: 1, of: 1 }, "Once per run", "1 per run", false],
    ["guide.howler-call", { kind: "uses", left: 0, of: 1 }, "Used this run", "Used", true],
    ["bait", { kind: "uses", left: 1, of: 1 }, "Single use", "Single use", false],
    ["parrot", { kind: "uses", left: 0, of: 1 }, "Used this camp", "Used", true],
    ["rain-poncho", { kind: "uses", left: 1, of: 2 }, "1 of 2 charges", "1/2 charges", false],
    ["botanist", { kind: "pool", balance: 2, max: 3, cost: 1 }, "2/3 herbs", "2/3 herbs", false],
    ["botanist.antidote", { kind: "pool", balance: 1, max: 3, cost: 2 }, "1/3 herbs", "1/3 herbs", true],
    ["medic", { kind: "supplies", cost: 1 }, "Costs 1 supply", "1 supply", false],
    ["temple", { kind: "crew", left: 0, earned: 0 }, "Not earned", "Not earned", true],
    ["temple", { kind: "crew", left: 1, earned: 1 }, "1 left", "1 left", false],
  ] as const)("%s with %o reads %s, or %s when short of room", (sourceId, remaining, full, short, spent) => {
    expect(usesLabel(sourceId, remaining)).toEqual({ full, short });
    expect(isSpent(remaining)).toBe(spent);
  });

  it("a passive with no usage is always on; an active one with none reads its catalogue badge", () => {
    expect(usesLabel("heavy-pack", null)).toEqual({ full: "Always on", short: "Always on" });
    expect(usesLabel("scout", null)).toEqual({ full: "Once per camp", short: "Once per camp" });
    expect(isSpent(null)).toBe(false);
  });
});
