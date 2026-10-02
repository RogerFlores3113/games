import { describe, expect, it } from "vitest";
import { BOSS_DISPLAY, GEAR_DISPLAY, type ExpeditionView } from "@games/rules";
import { buildRulesReference } from "./rules-reference";

const gearId = Object.keys(GEAR_DISPLAY)[0]!;
const bossId = Object.keys(BOSS_DISPLAY)[0]!;

function viewWith(over: Partial<Pick<ExpeditionView, "yourOwnedGearIds" | "activeBossTwistId" | "campNumber" | "yourCapacity">>) {
  return { yourOwnedGearIds: [], activeBossTwistId: null, campNumber: 1, yourCapacity: 1, ...over } as ExpeditionView;
}

const byId = (sections: ReturnType<typeof buildRulesReference>, id: string) => sections.find((s) => s.id === id)!;

describe("buildRulesReference", () => {
  it("returns the six sections in order for a null view", () => {
    expect(buildRulesReference(null).map((s) => s.heading)).toEqual([
      "Goal",
      "Tricks",
      "Objectives",
      "The Whisper",
      "Gear",
      "This camp",
    ]);
  });

  it("lists objective markers", () => {
    expect(byId(buildRulesReference(null), "objectives").items.map((i) => i.label)).toEqual([
      "A card",
      "Order badge (1, 2, ...)",
      "Last",
      "No tricks",
      "Exactly N tricks",
    ]);
  });

  it("with no view or no gear, says you own none and says no boss twist", () => {
    const sections = buildRulesReference(null);
    expect(byId(sections, "gear").items).toEqual([]);
    expect(byId(sections, "gear").paragraphs).toContain("You do not own any gear yet.");
    expect(byId(sections, "this-camp").paragraphs).toEqual(["No boss twist this camp."]);
  });

  it("lists owned gear from the display catalogue with name, size, window, text", () => {
    const g = GEAR_DISPLAY[gearId]!;
    const gear = byId(buildRulesReference(viewWith({ yourOwnedGearIds: [gearId], campNumber: 3, yourCapacity: 3 })), "gear");
    expect(gear.paragraphs).toContain("Your capacity this camp: 3.");
    expect(gear.items).toHaveLength(1);
    expect(gear.items[0]!.label).toBe(g.name);
    expect(gear.items[0]!.body).toContain(g.text);
    expect(gear.items[0]!.body).toContain(`Size ${g.size}`);
  });

  it("skips gear ids missing from the catalogue", () => {
    expect(byId(buildRulesReference(viewWith({ yourOwnedGearIds: ["nope"] })), "gear").items).toEqual([]);
  });

  it("falls back to the camp number when capacity is null", () => {
    expect(byId(buildRulesReference(viewWith({ campNumber: 4, yourCapacity: null })), "gear").paragraphs).toContain(
      "Your capacity this camp: 4.",
    );
  });

  it("shows the active boss twist name and text", () => {
    const b = BOSS_DISPLAY[bossId]!;
    const camp = byId(buildRulesReference(viewWith({ activeBossTwistId: bossId })), "this-camp");
    expect(camp.items).toEqual([{ label: b.name, body: b.text }]);
    expect(camp.paragraphs).toEqual([]);
  });
});
