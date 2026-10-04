// Phase 12, Plan 02: SOURCE_DISPLAY and CHARACTER_DISPLAY are
// function-free projections of the production catalogue. Key coverage
// iterates CATALOG so a new source is covered with no edit here; the
// per-entry values are literal, so a drift in what the client shows fails.

import { describe, expect, it } from "vitest";
import { CATALOG } from "../run/catalog";
import { CHARACTER_DISPLAY, SOURCE_DISPLAY } from "./catalog-display";

describe("SOURCE_DISPLAY", () => {
  it("has exactly one entry per source in the catalogue", () => {
    expect(Object.keys(SOURCE_DISPLAY).sort()).toEqual(Object.keys(CATALOG.sources).sort());
  });

  it("carries a character's name, text, kind, window phrase, limit badge and target kinds", () => {
    expect(SOURCE_DISPLAY.scout).toEqual({
      id: "scout",
      name: "The Scout",
      text: "See a random card in a teammate's hand.",
      kind: "character",
      characterId: "scout",
      active: { window: "between-tricks", windowPhrase: "Between tricks", limitBadge: "1 per camp", targets: ["hand"] },
      passive: false,
      item: null,
    });
  });

  it("carries an upgrade's characterId and an upgrade with no active as active: null", () => {
    expect(SOURCE_DISPLAY["scout.keen-eye"]).toMatchObject({ kind: "upgrade", characterId: "scout", active: null, passive: false });
    expect(SOURCE_DISPLAY["scout.eavesdrop"]).toMatchObject({
      kind: "upgrade",
      characterId: "scout",
      active: { windowPhrase: "Between tricks", limitBadge: "1 per camp", targets: ["whisper"] },
    });
  });

  it("carries an item with a null characterId, and flags passive-only sources", () => {
    expect(SOURCE_DISPLAY["trained-monkey"]).toMatchObject({ kind: "item", characterId: null, active: { targets: ["card", "hand"] } });
    expect(SOURCE_DISPLAY["heavy-pack"]).toMatchObject({ kind: "item", characterId: null, active: null, passive: true });
    expect(SOURCE_DISPLAY["heavy-pack"]!.item).toEqual({ rarity: "common", price: 3, uses: null });
    expect(SOURCE_DISPLAY.signaller).toMatchObject({ kind: "character", active: null, passive: true });
  });

  it("carries an item's rarity, price and uses badge", () => {
    expect(SOURCE_DISPLAY["trail-map"]!.item).toEqual({ rarity: "rare", price: 5, uses: "Single use" });
    expect(SOURCE_DISPLAY["pack-mule"]!.item).toEqual({ rarity: "common", price: 3, uses: "Once per camp" });
    expect(SOURCE_DISPLAY["rain-poncho"]!.item).toEqual({ rarity: "common", price: 3, uses: "2 charges" });
    expect(SOURCE_DISPLAY["scout.keen-eye"]!.item).toBeNull();
  });

  it("phrases each limit kind, and an item's uses as its badge", () => {
    expect(SOURCE_DISPLAY.scout!.active!.limitBadge).toBe("1 per camp");
    expect(SOURCE_DISPLAY["guide.howler-call"]!.active!.limitBadge).toBe("Once per run");
    expect(SOURCE_DISPLAY["trail-map"]!.active!.limitBadge).toBe("Single use");
    expect(SOURCE_DISPLAY["rain-poncho"]!.active!.limitBadge).toBe("2 charges");
    expect(SOURCE_DISPLAY["parrot"]!.active!.limitBadge).toBe("Once per camp");
    expect(SOURCE_DISPLAY.whetstone!.active!.limitBadge).toBe("Single use");
    expect(SOURCE_DISPLAY.botanist!.active!.limitBadge).toBe("1 herb");
    expect(SOURCE_DISPLAY["botanist.antidote"]!.active!.limitBadge).toBe("2 herbs");
    expect(SOURCE_DISPLAY.medic!.active!.limitBadge).toBe("1 supply");
  });

  it("phrases each window", () => {
    expect(SOURCE_DISPLAY["rain-poncho"]!.active!.windowPhrase).toBe("Between tricks");
    expect(SOURCE_DISPLAY.cartographer!.active!.windowPhrase).toBe("While picking objectives");
    expect(SOURCE_DISPLAY["guide.howler-call"]!.active!.windowPhrase).toBe("On your turn");
    expect(SOURCE_DISPLAY.medic!.active!.windowPhrase).toBe("When an objective fails");
  });

  it("lists target kinds in step order", () => {
    expect(SOURCE_DISPLAY["pack-mule"]!.active!.targets).toEqual(["won-trick", "player"]);
    expect(SOURCE_DISPLAY["cartographer.detour"]!.active!.targets).toEqual(["objective", "player"]);
    expect(SOURCE_DISPLAY["rain-poncho"]!.active!.targets).toEqual([]);
  });

  it("is JSON round-trippable (no function-valued property survives)", () => {
    for (const display of Object.values(SOURCE_DISPLAY)) {
      expect(JSON.parse(JSON.stringify(display))).toEqual(display);
    }
  });
});

describe("CHARACTER_DISPLAY", () => {
  it("has one entry per character, listing its two upgrades and its pool", () => {
    expect(Object.keys(CHARACTER_DISPLAY).sort()).toEqual(Object.keys(CATALOG.characters).sort());
    expect(CHARACTER_DISPLAY.scout).toMatchObject({ id: "scout", power: "Spyglass", pool: null, upgradeIds: ["scout.keen-eye", "scout.eavesdrop"] });
    expect(CHARACTER_DISPLAY.botanist!.pool).toEqual({ name: "Herbs", start: 2, max: 3 });
  });

  it("is JSON round-trippable", () => {
    for (const display of Object.values(CHARACTER_DISPLAY)) {
      expect(JSON.parse(JSON.stringify(display))).toEqual(display);
    }
  });
});
