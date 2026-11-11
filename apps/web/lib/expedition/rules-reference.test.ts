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
      "A cleared camp pays 5 coins into the crew's purse, 2 more anywhere but the Jungle and the Clearing, 2 more in any weather but Fair, and 1 for each unplayed trick, up to 2 more. Each route card says what its camp pays.",
      "Before every camp, camp 1 too, everyone drafts one of 3 items; after a boss camp, one of 3 pairs of items. After every other camp an event waits on the trail, and it may give the crew coins, a supply or items. Then the crew votes on the route to the next camp, and a tied vote is settled by a coin flip.",
      "Before every boss camp, and before camp 3 of a Short run, a shop opens once the route is chosen. The purse splits into an equal share for each explorer and a crew pot of what is left; a buy spends your share first, then the pot, and you can give coins of your share to a teammate. You spend it on supplies (6 coins), items, and your own character's upgrades (8 coins). An upgrade also gives you one more whisper each camp.",
      "Each explorer has 2 item slots, and only the items in them go into camp. Up to 6 more wait in the backpack: open it from the item bar between camps to swap items, or to discard one when it is full.",
    ]);
  });

  it("states the supplies and the failure cost", () => {
    expect(byId(buildRulesReference(null), "goal").paragraphs[1]).toBe(
      "A camp is cleared when every objective is done. A failed camp costs one supply and is replayed with a fresh deal; the crew's purse gets 2 coins as consolation. The crew starts with 4 supplies and holds at most 5. With none left, the run ends.",
    );
  });

  it("says a replay goes straight back to the camp's loadout", () => {
    expect(byId(buildRulesReference(null), "goal").paragraphs[2]).toBe(
      "A replay skips the draft, the event and the route vote: the crew goes back to the same camp's loadout, through the shop again before a boss camp.",
    );
  });

  it("explains the Sun and Moon's own suit and a baited led suit", () => {
    const tricks = byId(buildRulesReference(null), "tricks").paragraphs;
    expect(tricks).toContain("The Sun and Moon form their own two-card suit: if one is led, whoever holds the other must play it.");
    expect(tricks).toContain("If Bait stops the only card of the led suit from winning, the highest card left wins, and a tie goes to the card played first.");
  });

  it("says how many whispers each seat has per camp", () => {
    expect(byId(buildRulesReference(null), "whisper").paragraphs[0]).toMatch(/^Twice per camp, between tricks/);
  });

  it("says when whispers can be sent", () => {
    expect(byId(buildRulesReference(null), "whisper").paragraphs).toContain(
      "Whispers go only between tricks, before the next lead: never while objectives are being picked, and never once a trick has started.",
    );
  });

  it("explains an off-plate lead and the Sun's lead at the temple", () => {
    expect(byId(buildRulesReference(null), "temple").paragraphs).toContain(
      "A trick led in any other suit presses nothing, and the camp fails once too few tricks remain for the plates left. The Sun must lead the trick for the last plate: if it is led before the other plates are pressed, or played or discarded any other way, the camp fails.",
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
    expect(kit.items[0]!.body).toBe("Always on. Whisper once more each camp.");
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
      "Most camps have fair weather (80% of routes, never on the Clifftop). Other weather is drawn for the route. On the Clifftop bad weather hits harder: Rain washes away 2 more whispers, a Downpour 3 more, and lightning can strike 3 times.",
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
