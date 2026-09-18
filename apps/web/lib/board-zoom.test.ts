import { describe, expect, it } from "vitest";
import { BOARD_ZOOM_MAX, computeBoardZoom } from "./board-zoom";
import { VIEWPORT_TEST_HEIGHT_PX, VIEWPORT_TEST_WIDTH_PX } from "./layout-budget";

describe("computeBoardZoom", () => {
  it("returns exactly 1 at the 1280x720 floor (UI-11 fit tests must be a no-op)", () => {
    expect(computeBoardZoom(VIEWPORT_TEST_WIDTH_PX, VIEWPORT_TEST_HEIGHT_PX)).toBe(1);
  });

  it("returns 1 below the floor — never shrinks the board smaller than the floor", () => {
    expect(computeBoardZoom(1024, 600)).toBe(1);
  });

  it("scales up proportionally to the smaller of the two axis ratios at 1920x1080", () => {
    // Both axes are exactly 1.5x the 1280x720 floor here.
    expect(computeBoardZoom(1920, 1080)).toBeCloseTo(1.5, 5);
  });

  it("is bound by the narrower axis when width and height ratios diverge", () => {
    // Height ratio is 2x, width ratio is only 1.1x — must not overflow width.
    expect(computeBoardZoom(1408, 1440)).toBeCloseTo(1.1, 5);
  });

  it("never exceeds BOARD_ZOOM_MAX even on a very large viewport", () => {
    expect(computeBoardZoom(3840, 2160)).toBe(BOARD_ZOOM_MAX);
  });
});
