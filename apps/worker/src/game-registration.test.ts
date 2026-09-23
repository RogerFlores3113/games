import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_ID, GAME_REGISTRY, resolveGame } from "./game-registration";
import type { GameRegistry, GameRegistryEntry } from "./game-registration";

describe("D-08/D-09: GAME_REGISTRY / resolveGame", () => {
  it("resolveGame('hanabi') returns the Hanabi entry with its full shape", () => {
    const entry = resolveGame("hanabi");
    expect(entry).toBeDefined();
    expect(entry?.displayName).toBe("Hanabi");
    expect(entry?.limits).toEqual({ min: 2, max: 5 });
    expect(entry?.defaultConfig).toBe("base");
    expect(entry?.adapter.id).toBe("hanabi");
  });

  it.each(["expedition", "__proto__", "toString", "", "constructor"])(
    "resolveGame(%j) returns undefined against the production registry",
    (gameId) => {
      expect(resolveGame(gameId)).toBeUndefined();
    },
  );

  it("resolveGame('x', customRegistry) looks only in customRegistry, never falling back to GAME_REGISTRY", () => {
    const customEntry = { ...GAME_REGISTRY.hanabi, gameId: "x", displayName: "Custom" } as GameRegistryEntry;
    const customRegistry: GameRegistry = Object.freeze({ x: customEntry });

    expect(resolveGame("x", customRegistry)).toBe(customEntry);
    expect(resolveGame("hanabi", customRegistry)).toBeUndefined();
    expect(resolveGame("x")).toBeUndefined();
  });

  it("resolveGame returns undefined for an entry registered under a key other than its own gameId (WR-04)", () => {
    const misKeyed: GameRegistry = Object.freeze({ other: GAME_REGISTRY.hanabi });
    expect(resolveGame("other", misKeyed)).toBeUndefined();
  });

  it("Object.hasOwn guards resolveGame against prototype-chain keys even on a plain-object custom registry", () => {
    const customRegistry = {} as GameRegistry;
    expect(resolveGame("__proto__", customRegistry)).toBeUndefined();
    expect(resolveGame("toString", customRegistry)).toBeUndefined();
    expect(resolveGame("hasOwnProperty", customRegistry)).toBeUndefined();
  });

  it("GAME_REGISTRY is frozen and holds Hanabi only (D-09)", () => {
    expect(Object.isFrozen(GAME_REGISTRY)).toBe(true);
    expect(Object.keys(GAME_REGISTRY)).toEqual(["hanabi"]);
  });

  it("DEFAULT_GAME_ID is 'hanabi' (D-03)", () => {
    expect(DEFAULT_GAME_ID).toBe("hanabi");
  });
});
