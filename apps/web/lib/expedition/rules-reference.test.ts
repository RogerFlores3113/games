import { describe, expect, it } from "vitest";
import { MOD_DISPLAY, SOURCE_DISPLAY, type ExpeditionView } from "@games/rules";
import { REFERENCE_PAGES, buildModPages, buildRulesReference } from "./rules-reference";

function viewWith(over: { characterId?: string | null; kit?: string[] }) {
  const view: Pick<ExpeditionView, "yourSeatId" | "seats"> = {
    yourSeatId: "s1",
    seats: [
      {
        seatId: "s1",
        characterId: over.characterId === undefined ? "explorer" : over.characterId,
        upgradeId: null,
        items: { equipped: (over.kit ?? []).map((itemId, i) => ({ uid: `it${i}`, itemId, remaining: null })), backpack: [], concealed: false },
        usage: [],
      },
    ],
  };
  return view as ExpeditionView;
}

const byId = (sections: ReturnType<typeof buildRulesReference>, id: string) => sections.find((s) => s.id === id)!;

describe("buildRulesReference", () => {
  it("returns the sections in order for a null view", () => {
    expect(buildRulesReference(null).map((s) => s.heading)).toEqual([
      "Goal",
      "Between camps",
      "Tricks",
      "Objectives",
      "The Whisper",
      "Explorers and gear",
      "The temple",
      "Your kit",
    ]);
  });

  it("states the run lengths from the catalogue", () => {
    expect(byId(buildRulesReference(null), "goal").paragraphs[0]).toBe(
      "Before camp 1 the crew votes on the run: Short (4 camps), Standard (6) or Long (8). The last camp is the temple.",
    );
  });

  it("explains the purse, draft, route vote, shop and loadout", () => {
    expect(byId(buildRulesReference(null), "between").paragraphs).toEqual([
      "A cleared camp pays 5 coins into the crew's purse, plus 1 for each unplayed trick, up to 3 more.",
      "Everyone then drafts one of 3 bundles of items. The crew votes on the route to the next camp, and a tied vote is settled by a coin flip. An event waits on the trail.",
      "Before a boss camp the crew shops with the purse: supplies (6 coins), items, and your own character's upgrades (8 coins). An upgrade also gives you one more whisper each camp.",
      "Each explorer has 2 item slots. Extra items wait in the backpack, and you choose your loadout between camps.",
    ]);
  });

  it("states the supplies and the failure cost", () => {
    expect(byId(buildRulesReference(null), "goal").paragraphs[1]).toBe(
      "A camp is cleared when every objective is done. A failed camp costs one supply and is replayed with a fresh deal. The crew starts with 3 supplies and holds at most 4. With none left, the run ends.",
    );
  });

  it("lists the usage wordings", () => {
    expect(byId(buildRulesReference(null), "gear").items.map((i) => i.label)).toEqual([
      "Once per run",
      "Single use",
      "Once per camp",
      "N charges",
      "Always on",
      "Rescue",
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

  it("with no view, has an empty kit", () => {
    const sections = buildRulesReference(null);
    expect(byId(sections, "kit").items).toEqual([]);
    expect(byId(sections, "kit").paragraphs).toContain("You have not picked a character yet.");
  });

  it("lists your character, then your kit, with window, limit and text", () => {
    const explorer = SOURCE_DISPLAY.explorer!;
    const bait = SOURCE_DISPLAY.bait!;
    const kit = byId(buildRulesReference(viewWith({ characterId: "explorer", kit: ["bait"] })), "kit");
    expect(kit.items.map((i) => i.label)).toEqual(["Compass (The Explorer)", bait.name]);
    expect(kit.items[0]!.body).toBe("Between tricks or on your turn, Once per camp. A card in your hand counts one rank higher or lower.");
    expect(kit.items[1]!.body).toContain(bait.text);
    expect(kit.paragraphs).not.toContain("You have not picked a character yet.");
  });

  it("marks a passive-only source as always on", () => {
    const kit = byId(buildRulesReference(viewWith({ characterId: "leader" })), "kit");
    expect(kit.items[0]!.body).toBe("Always on. Whisper twice each camp.");
  });

  it("skips kit ids missing from the catalogue and says so when nothing is left", () => {
    const kit = byId(buildRulesReference(viewWith({ characterId: null, kit: ["nope"] })), "kit");
    expect(kit.items).toEqual([]);
    expect(kit.paragraphs).toContain("You have not picked a character yet.");
  });

  it("has a page per tab, in order", () => {
    expect(REFERENCE_PAGES.map((p) => p.label)).toEqual(["Rules", "Locations", "Weather", "Bosses"]);
    expect(buildModPages().map((p) => p.id)).toEqual(["locations", "weather", "bosses"]);
  });

  it("lists every location with its catalogue text and backdrop", () => {
    const [group] = buildModPages().find((p) => p.id === "locations")!.groups;
    expect(group!.entries.map((e) => e.id)).toEqual(Object.values(MOD_DISPLAY).filter((m) => m.kind === "location").map((m) => m.id));
    const jungle = group!.entries.find((e) => e.id === "jungle")!;
    expect(jungle.imageUrl).toBe("/expedition/sprites/camp/bg-jungle-night.png");
    expect(jungle.text).toBe(MOD_DISPLAY.jungle!.text);
    expect(group!.entries.find((e) => e.id === "magma")!.imageUrl).toBe("/expedition/sprites/locations/bg-magma.png");
  });

  it("lists weather and pairings on the weather page, each with the canvas's pixel icon", () => {
    const groups = buildModPages().find((p) => p.id === "weather")!.groups;
    expect(groups.map((g) => g.heading)).toEqual(["Weather", "Pairings"]);
    expect(groups[1]!.entries.map((e) => e.id).sort()).toEqual(["flooding", "steam"]);
    expect(groups.flatMap((g) => g.entries).every((e) => e.imageUrl === null)).toBe(true);
    expect(groups[0]!.entries.map((e) => e.id)).toContain("thunderstorm");
    expect(groups[0]!.entries.find((e) => e.id === "downpour")!.icon[4]).toBe("b.b.b.b.b");
    expect(groups[0]!.note).toBe(
      "Most camps have fair weather (80% of routes, fewer on the Clifftop). Other weather is drawn for the route. On the Clifftop bad weather hits harder: Rain washes away 2 more whispers, a Downpour 3 more, and lightning can strike 3 times.",
    );
    expect(groups[0]!.entries.find((e) => e.id === "fair")!.icon).toEqual(["....o....", ".o.....o.", "...ooo...", "..ooooo..", "o.ooooo.o", "..ooooo..", "...ooo...", ".o.....o.", "....o...."]);
  });

  it("lists animal, disaster and temple bosses with sprites", () => {
    const groups = buildModPages().find((p) => p.id === "bosses")!.groups;
    expect(groups.map((g) => g.heading)).toEqual(["Animal bosses", "Disaster bosses", "The temple"]);
    expect(groups[0]!.entries.find((e) => e.id === "tiger")!.imageUrl).toBe("/expedition/sprites/bosses/tiger.png");
    expect(groups[1]!.entries.find((e) => e.id === "blood-moon")!.imageUrl).toBe("/expedition/sprites/bosses/blood-moon.png");
    expect(groups[2]!.entries.map((e) => e.id)).toEqual(["temple"]);
    expect(groups[2]!.entries[0]!.imageUrl).toBe("/expedition/sprites/locations/bg-temple.png");
    expect(groups.map((g) => g.note)).toEqual(["One waits at camp 3 of a Standard or Long run.", "One waits at camp 6 of a Long run.", null]);
  });
});
