import { describe, expect, it } from "vitest";
import { computeZoom, isBelowComfortSize, STAGE_HEIGHT, STAGE_WIDTH } from "./compute-zoom";

describe("compute-zoom", () => {
  it("stage constants are 640x360 (D-10)", () => {
    expect(STAGE_WIDTH).toBe(640);
    expect(STAGE_HEIGHT).toBe(360);
  });

  it.each([
    [1280, 720, 2],
    [1920, 1080, 3],
    [2560, 1440, 4],
    [1279, 719, 1],
    [500, 300, 1],
    [1920, 700, 1],
    [3000, 720, 2],
  ])("computeZoom(%i, %i) === %i", (w, h, expected) => {
    expect(computeZoom(w, h)).toBe(expected);
  });

  it("is always a whole number >= 1 across 200 sampled sizes between 0 and 4000", () => {
    for (let i = 0; i < 200; i++) {
      const w = Math.floor((i / 200) * 4000);
      const h = Math.floor(((199 - i) / 200) * 4000);
      const zoom = computeZoom(w, h);
      expect(Number.isInteger(zoom)).toBe(true);
      expect(zoom).toBeGreaterThanOrEqual(1);
    }
  });

  it.each([
    [1280, 720, false],
    [1279, 900, true],
    [1400, 719, true],
  ])("isBelowComfortSize(%i, %i) === %s", (w, h, expected) => {
    expect(isBelowComfortSize(w, h)).toBe(expected);
  });
});
