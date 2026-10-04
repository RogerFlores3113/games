// Phase 12, Plan 02: SOURCE_DISPLAY and CHARACTER_DISPLAY are
// function-free projections of the production catalogue. Key coverage
// iterates CATALOG so a new source is covered with no edit here; the
// per-entry values are literal, so a drift in what the client shows fails.

import { describe, expect, it } from "vitest";
import { CATALOG } from "../run/catalog";
import { BALANCE_DISPLAY, CHARACTER_DISPLAY, MOD_DISPLAY, SOURCE_DISPLAY } from "./catalog-display";

describe("SOURCE_DISPLAY", () => {
  it("has exactly one entry per source in the catalogue, plus the temple's granted skip", () => {
    expect(Object.keys(SOURCE_DISPLAY).sort()).toEqual([...Object.keys(CATALOG.sources), "temple"].sort());
  });

  it("shows a granted ability under its modifier's id, with every window it fires in", () => {
    expect(SOURCE_DISPLAY.temple).toEqual({
      id: "temple",
      name: "Skip",
      text: "Drop one open objective.",
      kind: "grant",
      characterId: null,
      active: { windows: ["between-tricks", "rescue"], windowPhrase: "Between tricks or when an objective fails", limitBadge: "Crew token", limitKind: "crew-tokens", targets: ["objective"] },
      passive: false,
      item: null,
    });
  });

  it("carries a character's name, text, kind, window phrase, limit badge and target kinds", () => {
    expect(SOURCE_DISPLAY.explorer).toEqual({
      id: "explorer",
      name: "The Explorer",
      text: "A card in your hand counts one rank higher or lower.",
      kind: "character",
      characterId: "explorer",
      active: { windows: ["between-tricks", "in-trick"], windowPhrase: "Between tricks or on your turn", limitBadge: "Once per camp", limitKind: "per-camp", targets: ["card-value"] },
      passive: false,
      item: null,
    });
  });

  it("carries an upgrade's characterId and an upgrade with no active as active: null", () => {
    expect(SOURCE_DISPLAY["explorer.second-wind"]).toMatchObject({ kind: "upgrade", characterId: "explorer", active: null, passive: false });
    expect(SOURCE_DISPLAY["leader.delegate"]).toMatchObject({
      kind: "upgrade",
      characterId: "leader",
      active: { windowPhrase: "Between tricks", limitBadge: "Takes a whisper", limitKind: "whispers", targets: ["player"] },
    });
  });

  it("carries an item with a null characterId, and flags passive-only sources", () => {
    expect(SOURCE_DISPLAY["trained-monkey"]).toMatchObject({ kind: "item", characterId: null, active: { targets: ["card", "hand"] } });
    expect(SOURCE_DISPLAY["heavy-pack"]).toMatchObject({ kind: "item", characterId: null, active: null, passive: true });
    expect(SOURCE_DISPLAY["heavy-pack"]!.item).toEqual({ rarity: "common", price: 3, sellsFor: 1, exclusiveTo: null, uses: null, usesKind: null });
    expect(SOURCE_DISPLAY.leader).toMatchObject({ kind: "character", active: null, passive: true });
    expect(SOURCE_DISPLAY["cartographer.redraw"]).toMatchObject({ kind: "power", characterId: "cartographer", active: { windows: ["objective-pick"], targets: ["objective"] } });
  });

  it("carries an item's rarity, price and uses badge", () => {
    expect(SOURCE_DISPLAY["trail-map"]!.item).toEqual({ rarity: "rare", price: 5, sellsFor: 2, exclusiveTo: null, uses: "Single use", usesKind: "single-use" });
    expect(SOURCE_DISPLAY["pack-mule"]!.item).toEqual({ rarity: "common", price: 3, sellsFor: 1, exclusiveTo: null, uses: "Once per camp", usesKind: "per-camp" });
    expect(SOURCE_DISPLAY["rain-poncho"]!.item).toEqual({ rarity: "common", price: 3, sellsFor: 1, exclusiveTo: null, uses: "2 charges", usesKind: "charges" });
    expect(SOURCE_DISPLAY["pocket-glass"]!.item).toMatchObject({ price: 1, sellsFor: 1, exclusiveTo: "pack-rat" });
    expect(SOURCE_DISPLAY["explorer.second-wind"]!.item).toBeNull();
  });

  it("phrases each limit kind, and an item's uses as its badge", () => {
    expect(SOURCE_DISPLAY.explorer!.active!.limitBadge).toBe("Once per camp");
    expect(SOURCE_DISPLAY["trail-map"]!.active!.limitBadge).toBe("Single use");
    expect(SOURCE_DISPLAY["rain-poncho"]!.active!.limitBadge).toBe("2 charges");
    expect(SOURCE_DISPLAY["parrot"]!.active!.limitBadge).toBe("Once per camp");
    expect(SOURCE_DISPLAY.whetstone!.active!.limitBadge).toBe("Single use");
    expect(SOURCE_DISPLAY["explorer.reshape"]!.active!.limitBadge).toBe("Once per camp, shared with Compass");
    expect(SOURCE_DISPLAY["cartographer.treasure-map"]!.active!.limitBadge).toBe("Once per run");
    expect([SOURCE_DISPLAY.businessman!.active!.limitBadge, SOURCE_DISPLAY["businessman.pop-up-shop"]!.active!.limitBadge]).toEqual(["No limit", "Costs coins"]);
    expect(["cartographer.treasure-map", "rain-poncho", "parrot", "trail-map", "explorer.reshape", "leader.delegate", "cartographer"].map((id) => SOURCE_DISPLAY[id]!.active!.limitKind)).toEqual([
      "per-run",
      "charges",
      "per-camp",
      "single-use",
      "per-camp",
      "whispers",
      "supplies",
    ]);
    expect(SOURCE_DISPLAY.cartographer!.active!.limitBadge).toBe("1 supply");
  });

  it("phrases each window", () => {
    expect(SOURCE_DISPLAY["rain-poncho"]!.active!.windowPhrase).toBe("Between tricks");
    expect(SOURCE_DISPLAY["cartographer.redraw"]!.active!.windowPhrase).toBe("While picking objectives");
    expect(SOURCE_DISPLAY.cartographer!.active!.windowPhrase).toBe("While choosing the route");
    expect(SOURCE_DISPLAY.businessman!.active!.windowPhrase).toBe("Before setting out");
    expect(SOURCE_DISPLAY["businessman.cash-out"]!.active!.windowPhrase).toBe("While drafting");
    expect(SOURCE_DISPLAY["jd.rule-breaker"]!.active!.windowPhrase).toBe("On your turn");
    expect(SOURCE_DISPLAY["businessman.buyout"]!.active!.windowPhrase).toBe("When an objective fails");
  });

  it("lists target kinds in step order", () => {
    expect(SOURCE_DISPLAY["pack-mule"]!.active!.targets).toEqual(["won-trick", "player"]);
    expect(SOURCE_DISPLAY["pack-rat.quartermaster"]!.active!.targets).toEqual(["item", "player"]);
    expect(SOURCE_DISPLAY["rain-poncho"]!.active!.targets).toEqual([]);
  });

  it("is JSON round-trippable (no function-valued property survives)", () => {
    for (const display of Object.values(SOURCE_DISPLAY)) {
      expect(JSON.parse(JSON.stringify(display))).toEqual(display);
    }
  });
});

describe("CHARACTER_DISPLAY", () => {
  it("has one entry per character, listing its further powers and its upgrades", () => {
    expect(Object.keys(CHARACTER_DISPLAY).sort()).toEqual(Object.keys(CATALOG.characters).sort());
    expect(CHARACTER_DISPLAY.explorer).toEqual({
      id: "explorer",
      name: "The Explorer",
      theme: "Changes card values",
      power: "Compass",
      powerIds: [],
      upgradeIds: ["explorer.second-wind", "explorer.true-form", "explorer.reshape"],
    });
  });

  it("is JSON round-trippable", () => {
    for (const display of Object.values(CHARACTER_DISPLAY)) {
      expect(JSON.parse(JSON.stringify(display))).toEqual(display);
    }
  });
});

describe("MOD_DISPLAY", () => {
  it("names every camp modifier with its kind and one sentence, and round-trips through JSON", () => {
    expect(Object.keys(MOD_DISPLAY).sort()).toEqual(Object.keys(CATALOG.mods).sort());
    expect(MOD_DISPLAY.thunderstorm).toEqual({ id: "thunderstorm", name: "Thunderstorm", kind: "weather", text: "Lightning may strike before a trick, and then the lowest card wins it." });
    expect(JSON.parse(JSON.stringify(MOD_DISPLAY))).toEqual(MOD_DISPLAY);
  });
});

describe("BALANCE_DISPLAY", () => {
  it("carries the run's numbers as plain data", () => {
    expect(BALANCE_DISPLAY).toEqual({
      suppliesStart: 3,
      suppliesMax: 4,
      supplyPrice: 6,
      failureCost: 1,
      payout: { base: 5, perUnplayedTrick: 1, unplayedCap: 3 },
      draftOptions: 3,
      itemSlots: 2,
      upgradePrice: 8,
      whispersPerUpgrade: 1,
    });
  });
});
