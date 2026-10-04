import { describe, expect, it } from "vitest";
import { characterName, chargeText, isSpent, sourceBadges, sourceKind, sourceName, sourceRulesText } from "./source-text";

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
    expect(sourceBadges("heavy-pack")).toEqual(["Always"]);
    expect(sourceBadges("scout.keen-eye")).toEqual(["Always"]);
  });

  it("keeps the sentence free of the badges", () => {
    expect(sourceRulesText("medic")).toEqual({ title: "Triage", text: "Drop a failed objective.", badges: ["When an objective fails", "1 supply"] });
    expect(sourceRulesText("nope")).toBeNull();
  });
});

describe("chargeText and isSpent", () => {
  it.each([
    ["scout", { kind: "uses", left: 1, of: 1 }, "1 left", false],
    ["scout", { kind: "uses", left: 0, of: 1 }, "used", true],
    ["bait", { kind: "uses", left: 1, of: 1 }, "1 left", false],
    ["botanist", { kind: "pool", balance: 2, max: 3, cost: 1 }, "2/3 herbs", false],
    ["botanist.antidote", { kind: "pool", balance: 1, max: 3, cost: 2 }, "1/3 herbs", true],
    ["medic", { kind: "supplies", cost: 1 }, "1 supply", false],
  ] as const)("%s with %o reads %s", (sourceId, remaining, text, spent) => {
    expect(chargeText(sourceId, remaining)).toBe(text);
    expect(isSpent(remaining)).toBe(spent);
  });

  it("a passive with no usage is always on; nothing to say for an active one", () => {
    expect(chargeText("heavy-pack", null)).toBe("always on");
    expect(chargeText("scout", null)).toBe("");
    expect(isSpent(null)).toBe(false);
  });
});
