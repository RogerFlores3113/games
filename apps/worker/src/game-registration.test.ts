import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_ID, GAME_REGISTRY, resolveGame } from "./game-registration";
import type { GameRegistry, GameRegistryEntry } from "./game-registration";
import { GameErrorDetailSchema } from "@games/schema";
import type { RunError } from "@games/rules";

/** All 25 `RunError` members (7 `CampError` + 18 more), in the same order as
 * `packages/schema/src/games/expedition-errors.ts`'s `ExpeditionErrorCodeSchema`. */
const ALL_RUN_ERRORS: readonly RunError[] = [
  "not_your_turn",
  "wrong_phase",
  "camp_over",
  "card_not_in_hand",
  "must_follow_suit",
  "objective_not_available",
  "invalid_action",
  "not_a_seat",
  "run_over",
  "unknown_character",
  "character_taken",
  "character_pending",
  "draft_pending",
  "no_draft_pending",
  "not_offered",
  "already_ready",
  "not_owned",
  "wrong_window",
  "ability_spent",
  "cannot_afford",
  "ability_unavailable",
  "invalid_target",
  "whisper_blocked",
  "no_whispers_left",
  "nothing_to_skip",
];

describe("D-08/D-09: GAME_REGISTRY / resolveGame", () => {
  it("resolveGame('hanabi') returns the Hanabi entry with its full shape", () => {
    const entry = resolveGame("hanabi");
    expect(entry).toBeDefined();
    expect(entry?.displayName).toBe("Hanabi");
    expect(entry?.limits).toEqual({ min: 2, max: 5 });
    expect(entry?.defaultConfig).toBe("base");
    expect(entry?.adapter.id).toBe("hanabi");
  });

  it.each(["innovation", "__proto__", "toString", "", "constructor"])(
    "resolveGame(%j) returns undefined against the production registry",
    (gameId) => {
      expect(resolveGame(gameId)).toBeUndefined();
    },
  );

  it("resolveGame('expedition') returns the Expedition entry", () => {
    const entry = resolveGame("expedition");
    expect(entry).toBeDefined();
    expect(entry?.displayName).toBe("Expedition");
    expect(entry?.limits).toEqual({ min: 3, max: 5 });
    expect(entry?.defaultConfig).toBeNull();
    expect(entry?.adapter.id).toBe("expedition");
    expect(entry?.configSchema.safeParse(null).success).toBe(true);
    expect(entry?.configSchema.safeParse("base").success).toBe(false);
    expect(entry?.mapError("no_whispers_left")).toEqual({ gameId: "expedition", code: "no_whispers_left" });
  });

  it("mapError maps every one of the 25 RunError names to a wire-parseable GameErrorDetail", () => {
    const entry = resolveGame("expedition");
    expect(entry).toBeDefined();
    for (const name of ALL_RUN_ERRORS) {
      const detail = entry!.mapError(name);
      expect(detail).toEqual({ gameId: "expedition", code: name });
      expect(GameErrorDetailSchema.safeParse(detail).success).toBe(true);
    }
  });

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

  it("GAME_REGISTRY is frozen and holds Hanabi and Expedition (D-09 fulfilled)", () => {
    expect(Object.isFrozen(GAME_REGISTRY)).toBe(true);
    expect(Object.keys(GAME_REGISTRY)).toEqual(["hanabi", "expedition"]);
  });

  it("DEFAULT_GAME_ID is 'hanabi' (D-03)", () => {
    expect(DEFAULT_GAME_ID).toBe("hanabi");
  });
});
