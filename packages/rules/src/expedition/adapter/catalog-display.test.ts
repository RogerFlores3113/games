// Phase 12, Plan 02: proves GEAR_DISPLAY/BOSS_DISPLAY are faithful,
// function-free projections of GEAR_REGISTRY/BOSS_REGISTRY. Iterates the
// registries directly (never a hand list) so a future 11th gear item or 5th
// boss twist is covered automatically with zero test edits.

import { describe, expect, it } from "vitest";
import { GEAR_REGISTRY } from "../gear/registry";
import { BOSS_REGISTRY } from "../boss/registry";
import { GEAR_DISPLAY, BOSS_DISPLAY } from "./catalog-display";

describe("GEAR_DISPLAY", () => {
  it("has exactly the same keys as GEAR_REGISTRY, in the same order", () => {
    expect(Object.keys(GEAR_DISPLAY)).toEqual(Object.keys(GEAR_REGISTRY));
  });

  for (const [id, def] of Object.entries(GEAR_REGISTRY)) {
    it(`${id}: display fields mirror the registry def`, () => {
      const display = GEAR_DISPLAY[id];
      expect(display).toBeDefined();
      if (!display) throw new Error("unreachable");
      expect(display.id).toBe(def.id);
      expect(display.name).toBe(def.name);
      expect(display.size).toBe(def.size);
      expect(display.window).toBe(def.window);
      expect(display.text).toBe(def.text);
      expect(display.downside).toBe(def.downside ?? null);
      expect(display.targets).toEqual(def.targets.map((t) => t.kind));
    });
  }

  it("no GEAR_DISPLAY value has any function-valued property (JSON round-trip is lossless)", () => {
    for (const display of Object.values(GEAR_DISPLAY)) {
      expect(JSON.parse(JSON.stringify(display))).toEqual(display);
    }
  });

  it("peek.targets is [teammate]; pickpocket.targets is [teammate, own-card]", () => {
    expect(GEAR_DISPLAY.peek?.targets).toEqual(["teammate"]);
    expect(GEAR_DISPLAY.pickpocket?.targets).toEqual(["teammate", "own-card"]);
  });
});

describe("BOSS_DISPLAY", () => {
  it("has exactly the same keys as BOSS_REGISTRY", () => {
    expect(Object.keys(BOSS_DISPLAY)).toEqual(Object.keys(BOSS_REGISTRY));
  });

  it('radio-silence.name is "Monsoon"', () => {
    expect(BOSS_DISPLAY["radio-silence"]?.name).toBe("Monsoon");
  });

  it("no BOSS_DISPLAY value carries a modifiers key", () => {
    for (const display of Object.values(BOSS_DISPLAY)) {
      expect(display).not.toHaveProperty("modifiers");
    }
  });

  it("no BOSS_DISPLAY value has any function-valued property (JSON round-trip is lossless)", () => {
    for (const display of Object.values(BOSS_DISPLAY)) {
      expect(JSON.parse(JSON.stringify(display))).toEqual(display);
    }
  });
});
