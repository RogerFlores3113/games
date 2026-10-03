import { describe, expect, it } from "vitest";
import { BOSS_DISPLAY, SOURCE_DISPLAY, type ExpeditionView } from "@games/rules";
import { buildRulesReference } from "./rules-reference";

const bossId = Object.keys(BOSS_DISPLAY)[0]!;

function viewWith(over: { characterId?: string | null; kit?: string[]; activeBossTwistId?: string | null; campNumber?: number }) {
  return {
    yourSeatId: "s1",
    seats: [{ seatId: "s1", characterId: over.characterId === undefined ? "scout" : over.characterId, kit: over.kit ?? [] }],
    activeBossTwistId: over.activeBossTwistId ?? null,
    campNumber: over.campNumber ?? 1,
  } as ExpeditionView;
}

const byId = (sections: ReturnType<typeof buildRulesReference>, id: string) => sections.find((s) => s.id === id)!;

describe("buildRulesReference", () => {
  it("returns the six sections in order for a null view", () => {
    expect(buildRulesReference(null).map((s) => s.heading)).toEqual([
      "Goal",
      "Tricks",
      "Objectives",
      "The Whisper",
      "Your kit",
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

  it("with no view, has an empty kit and no boss twist", () => {
    const sections = buildRulesReference(null);
    expect(byId(sections, "kit").items).toEqual([]);
    expect(byId(sections, "kit").paragraphs).toContain("You have not picked a character yet.");
    expect(byId(sections, "this-camp").paragraphs).toEqual(["No boss twist this camp."]);
  });

  it("lists your character, then your kit, with window, limit and text", () => {
    const scout = SOURCE_DISPLAY.scout!;
    const bait = SOURCE_DISPLAY.bait!;
    const kit = byId(buildRulesReference(viewWith({ characterId: "scout", kit: ["bait"] })), "kit");
    expect(kit.items.map((i) => i.label)).toEqual([scout.name, bait.name]);
    expect(kit.items[0]!.body).toBe(`Between tricks, 1 per camp. ${scout.text}`);
    expect(kit.items[1]!.body).toContain(bait.text);
    expect(kit.paragraphs).not.toContain("You have not picked a character yet.");
  });

  it("marks a passive-only source as always on", () => {
    const kit = byId(buildRulesReference(viewWith({ characterId: "signaller" })), "kit");
    expect(kit.items[0]!.body).toBe(`Always. ${SOURCE_DISPLAY.signaller!.text}`);
  });

  it("skips kit ids missing from the catalogue and says so when nothing is left", () => {
    const kit = byId(buildRulesReference(viewWith({ characterId: null, kit: ["nope"] })), "kit");
    expect(kit.items).toEqual([]);
    expect(kit.paragraphs).toContain("You have not picked a character yet.");
  });

  it("shows the active boss twist name and text", () => {
    const b = BOSS_DISPLAY[bossId]!;
    const camp = byId(buildRulesReference(viewWith({ activeBossTwistId: bossId })), "this-camp");
    expect(camp.items).toEqual([{ label: b.name, body: b.text }]);
    expect(camp.paragraphs).toEqual([]);
  });
});
