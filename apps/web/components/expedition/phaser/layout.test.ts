import { describe, expect, it } from "vitest";
import {
  CARD_W,
  HAND_MAX_W,
  HUD,
  INTERACTABLE_ANCHORS,
  STAGE_MARGIN,
  STUMP,
  handFanXs,
  seatAnchors,
  trickSlots,
  type Point,
} from "./layout";

const STAGE_WIDTH = 640;
const STAGE_HEIGHT = 360;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function expectInMarginBounds(p: Point): void {
  expect(p.x).toBeGreaterThanOrEqual(STAGE_MARGIN);
  expect(p.x).toBeLessThanOrEqual(STAGE_WIDTH - STAGE_MARGIN);
  expect(p.y).toBeGreaterThanOrEqual(STAGE_MARGIN);
  expect(p.y).toBeLessThanOrEqual(STAGE_HEIGHT - STAGE_MARGIN);
}

function expectIntegerPoint(p: Point): void {
  expect(Number.isInteger(p.x)).toBe(true);
  expect(Number.isInteger(p.y)).toBe(true);
}

describe("seatAnchors", () => {
  it.each([3, 4, 5])("count=%i: length, ordering, spacing, bounds", (count) => {
    const anchors = seatAnchors(count);
    expect(anchors).toHaveLength(count);

    for (const anchor of anchors) {
      expectIntegerPoint(anchor);
      expectInMarginBounds(anchor);
    }

    // Index 0 has the largest y (the viewer, seated below the stump).
    const viewer = anchors[0]!;
    for (let i = 1; i < anchors.length; i++) {
      expect(viewer.y).toBeGreaterThan(anchors[i]!.y);
    }

    // Pairwise distance >= 96.
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        expect(distance(anchors[i]!, anchors[j]!)).toBeGreaterThanOrEqual(96);
      }
    }

    // Anchors 1..n-1 ordered left-to-right by x.
    for (let i = 1; i < anchors.length - 1; i++) {
      expect(anchors[i]!.x).toBeLessThanOrEqual(anchors[i + 1]!.x);
    }
  });
});

describe("handFanXs", () => {
  it("handFanXs(17): fits within HAND_MAX_W, integer, non-decreasing step", () => {
    const xs = handFanXs(17);
    expect(xs).toHaveLength(17);

    const leftBound = (STAGE_WIDTH - HAND_MAX_W) / 2;
    const rightBound = (STAGE_WIDTH + HAND_MAX_W) / 2;
    expect(xs[0]!).toBeGreaterThanOrEqual(leftBound);
    expect(xs[xs.length - 1]! + CARD_W).toBeLessThanOrEqual(rightBound);

    for (const x of xs) {
      expect(Number.isInteger(x)).toBe(true);
    }

    for (let i = 1; i < xs.length; i++) {
      const step = xs[i]! - xs[i - 1]!;
      expect(step).toBeGreaterThanOrEqual(12);
      expect(Number.isInteger(step)).toBe(true);
      expect(step).toBeLessThanOrEqual(CARD_W + 2);
    }
  });

  it("handFanXs(1): centres one card at 320 - CARD_W/2", () => {
    const xs = handFanXs(1);
    expect(xs).toEqual([320 - CARD_W / 2]);
    expect(Number.isInteger(xs[0]!)).toBe(true);
  });
});

describe("trickSlots", () => {
  it("trickSlots(5): 5 integer points within the stump ellipse bounds", () => {
    const slots = trickSlots(5);
    expect(slots).toHaveLength(5);
    for (const slot of slots) {
      expectIntegerPoint(slot);
      expect(slot.x).toBeGreaterThanOrEqual(STUMP.x - STUMP.rx);
      expect(slot.x).toBeLessThanOrEqual(STUMP.x + STUMP.rx);
      expect(slot.y).toBeGreaterThanOrEqual(STUMP.y - STUMP.ry);
      expect(slot.y).toBeLessThanOrEqual(STUMP.y + STUMP.ry);
    }
  });
});

function expectOutsideSafeZone(p: Point): void {
  const zone = HUD.settingsSafeZone;
  const inside = p.x >= zone.x && p.x <= zone.x + zone.w && p.y >= zone.y && p.y <= zone.y + zone.h;
  expect(inside).toBe(false);
}

function expectInsideStage(p: Point): void {
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x).toBeLessThanOrEqual(STAGE_WIDTH);
  expect(p.y).toBeGreaterThanOrEqual(0);
  expect(p.y).toBeLessThanOrEqual(STAGE_HEIGHT);
}

describe("HUD and INTERACTABLE_ANCHORS", () => {
  it("every HUD point (except the safe zone itself) is inside the stage and outside the safe zone", () => {
    for (const p of [HUD.supplies, HUD.campNumber, HUD.sign, HUD.whisper]) {
      expectIntegerPoint(p);
      expectInsideStage(p);
      expectOutsideSafeZone(p);
    }
  });

  it("every interactable anchor is inside the stage and outside the safe zone", () => {
    for (const p of Object.values(INTERACTABLE_ANCHORS)) {
      expectIntegerPoint(p);
      expectInsideStage(p);
      expectOutsideSafeZone(p);
    }
  });
});
