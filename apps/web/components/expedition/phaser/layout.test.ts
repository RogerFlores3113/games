import { describe, expect, it } from "vitest";
import {
  CARD_H,
  CARD_W,
  HAND_CARD_Y,
  HAND_MARKER_H,
  HOVER_LIFT,
  INTERACTABLE_ANCHORS,
  SETTINGS_SAFE_ZONE,
  STAGE,
  ZONES,
  handFanXs,
  opponentBlocks,
  rectContains,
  rectsIntersect,
  stumpRowXs,
  type Rect,
} from "./layout";

const zoneEntries = Object.entries(ZONES) as [string, Rect][];

describe("ZONES", () => {
  it("no two zones intersect", () => {
    const overlapping: string[] = [];
    for (let i = 0; i < zoneEntries.length; i++) {
      for (let j = i + 1; j < zoneEntries.length; j++) {
        if (rectsIntersect(zoneEntries[i]![1], zoneEntries[j]![1])) {
          overlapping.push(`${zoneEntries[i]![0]} x ${zoneEntries[j]![0]}`);
        }
      }
    }
    expect(overlapping).toEqual([]);
  });

  it("every zone is inside the 640x360 stage and outside the settings safe zone", () => {
    const outside = zoneEntries.filter(([, r]) => !rectContains(STAGE, r)).map(([id]) => id);
    const unsafe = zoneEntries.filter(([, r]) => rectsIntersect(SETTINGS_SAFE_ZONE, r)).map(([id]) => id);
    expect(outside).toEqual([]);
    expect(unsafe).toEqual([]);
  });

  it("every zone has whole-pixel edges", () => {
    const fractional = zoneEntries.filter(([, r]) => ![r.x, r.y, r.w, r.h].every(Number.isInteger)).map(([id]) => id);
    expect(fractional).toEqual([]);
  });
});

describe("rect helpers", () => {
  it("treats touching edges as disjoint and overlap as intersecting", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 })).toBe(true);
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 2, y: 2, w: 8, h: 8 })).toBe(true);
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 2, y: 2, w: 9, h: 8 })).toBe(false);
  });
});

describe("opponentBlocks", () => {
  it("lays four 138x70 blocks with 4px gaps across the opponents zone", () => {
    expect(opponentBlocks(4)).toEqual([
      { x: 10, y: 42, w: 138, h: 70 },
      { x: 152, y: 42, w: 138, h: 70 },
      { x: 294, y: 42, w: 138, h: 70 },
      { x: 436, y: 42, w: 138, h: 70 },
    ]);
  });

  it("centres two blocks", () => {
    expect(opponentBlocks(2)).toEqual([
      { x: 152, y: 42, w: 138, h: 70 },
      { x: 294, y: 42, w: 138, h: 70 },
    ]);
  });

  it.each([1, 2, 3, 4, 5])("count=%i: blocks sit inside the zone and never overlap", (count) => {
    const blocks = opponentBlocks(count);
    expect(blocks).toHaveLength(count);
    for (const b of blocks) expect(rectContains(ZONES.opponents, b)).toBe(true);
    for (let i = 1; i < blocks.length; i++) expect(rectsIntersect(blocks[i - 1]!, blocks[i]!)).toBe(false);
  });
});

describe("handFanXs", () => {
  it("fits 18 cards with a 21px step, centred in the hand zone", () => {
    const xs = handFanXs(18);
    expect(xs[0]).toBe(128);
    expect(xs[1]! - xs[0]!).toBe(21);
    expect(xs[17]! + CARD_W).toBe(513);
  });

  it("centres a single card", () => {
    expect(handFanXs(1)).toEqual([306]);
  });

  it.each([1, 5, 10, 17, 18])("count=%i: every card, lifted or not, stays in the hand zone", (count) => {
    for (const x of handFanXs(count)) {
      const lifted = { x, y: HAND_CARD_Y - HOVER_LIFT - HAND_MARKER_H - 1, w: CARD_W, h: CARD_H + HOVER_LIFT + HAND_MARKER_H + 1 };
      expect(rectContains(ZONES.hand, lifted)).toBe(true);
    }
  });
});

describe("stumpRowXs", () => {
  it("centres items on the stump", () => {
    expect(stumpRowXs(3, 48)).toEqual([272, 320, 368]);
  });
});

describe("INTERACTABLE_ANCHORS", () => {
  it("places the campfire, fireflies and lantern in the world zone and the mascot in the actions zone", () => {
    const at = (p: { x: number; y: number }): Rect => ({ x: p.x, y: p.y, w: 1, h: 1 });
    expect(rectContains(ZONES.world, at(INTERACTABLE_ANCHORS.campfire))).toBe(true);
    expect(rectContains(ZONES.world, at(INTERACTABLE_ANCHORS.fireflies))).toBe(true);
    expect(rectContains(ZONES.world, at(INTERACTABLE_ANCHORS.lantern))).toBe(true);
    expect(rectContains(ZONES.actions, at(INTERACTABLE_ANCHORS.mascot))).toBe(true);
  });
});
