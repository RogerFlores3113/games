import { describe, expect, it } from "vitest";
import { MOD_DISPLAY } from "@games/rules";
import { ART, modArtId } from "./art-registry";
import { ART_FILES } from "./art-files.generated";

const FILES: ReadonlySet<string> = new Set(ART_FILES);
const DRAWN_KINDS: ReadonlySet<string> = new Set(["location", "animal", "disaster"]);

describe("camp modifier art", () => {
  it("every registered location and boss has art whose file is on disk", () => {
    const missing = Object.values(MOD_DISPLAY)
      .filter((mod) => DRAWN_KINDS.has(mod.kind))
      .flatMap((mod) => {
        const id = modArtId(mod);
        if (id === null) return [`${mod.id}: no art id`];
        return FILES.has(ART[id].file) ? [] : [`${mod.id}: ${ART[id].file} is not in ART_FILES`];
      });
    expect(missing).toEqual([]);
  });

  it("names a location's backdrop, a boss's sprite, and nothing for a weather or an unknown id", () => {
    expect(modArtId({ id: "jungle", kind: "location" })).toBe("bg-jungle-night");
    expect(modArtId({ id: "cave", kind: "location" })).toBe("bg-cave");
    expect(modArtId({ id: "crocodile", kind: "animal" })).toBe("boss-crocodile");
    expect(modArtId({ id: "blood-moon", kind: "disaster" })).toBe("boss-blood-moon");
    expect(modArtId({ id: "rain", kind: "weather" })).toBeNull();
    expect(modArtId({ id: "nowhere", kind: "location" })).toBeNull();
  });
});
