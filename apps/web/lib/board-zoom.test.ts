import { describe, expect, it } from "vitest";
import { BOARD_ZOOM_MAX, computeBoardZoom, screenPxToBoardPx } from "./board-zoom";
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

describe("screenPxToBoardPx", () => {
  it("is a no-op at zoom 1 (the 1280x720 floor)", () => {
    expect(screenPxToBoardPx(150, 1)).toBe(150);
  });

  it("UAT gap 27: divides a screen-pixel pointer delta by the zoom factor, so a translate() applied through a 1.5x-zoomed ancestor renders at the original screen distance", () => {
    // A cursor that moved 150 screen px at zoom 1.5 must be expressed as a
    // 100 pre-zoom CSS px translate — 100 * 1.5 = 150 on screen, matching
    // the cursor 1:1 instead of travelling 1.5x too far.
    expect(screenPxToBoardPx(150, 1.5)).toBeCloseTo(100, 10);
  });

  it("UAT gap 28: divides a measured getBoundingClientRect() distance (e.g. slot pitch) by the zoom factor the same way", () => {
    expect(screenPxToBoardPx(180, BOARD_ZOOM_MAX)).toBeCloseTo(100, 10);
  });

  it("handles a negative screen-pixel delta (leftward/upward pointer movement)", () => {
    expect(screenPxToBoardPx(-150, 1.5)).toBeCloseTo(-100, 10);
  });

  it("returns 0 unchanged regardless of zoom", () => {
    expect(screenPxToBoardPx(0, 1.8)).toBe(0);
  });
});
