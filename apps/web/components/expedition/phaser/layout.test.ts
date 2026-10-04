import { describe, expect, it } from "vitest";
import {
  CARD_H,
  CARD_W,
  HAND_CARD_Y,
  HAND_MARKER_H,
  HOVER_LIFT,
  INTERACTABLE_ANCHORS,
  SCENE_ZONES,
  SETTINGS_SAFE_ZONE,
  STAGE,
  ZONES,
  handFanXs,
  plateRect,
  seatSpots,
  SILHOUETTE_H,
  SILHOUETTE_W,
  YOUR_CARD_AT,
  TRAIL_ZONES,
  gearLayout,
  pointInRect,
  rectContains,
  rectsIntersect,
  rowBoxes,
  stumpRowXs,
  trailStopXs,
  type Rect,
  type SeatSpot,
} from "./layout";

describe.each(Object.entries(SCENE_ZONES))("%s zones", (_scene, zones) => {
  const zoneEntries = Object.entries(zones);

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

describe("trailStopXs", () => {
  it("spaces seven stops evenly across the trail zone", () => {
    expect(trailStopXs(7)).toEqual([57, 138, 219, 300, 381, 462, 543]);
  });
});

describe("rowBoxes", () => {
  it("caps the box width, and shrinks boxes so the row fits", () => {
    expect(rowBoxes(10, 200, 3, 4, 40)).toEqual([
      { x: 10, w: 40 },
      { x: 54, w: 40 },
      { x: 98, w: 40 },
    ]);
    expect(rowBoxes(0, 100, 4, 4, 40)).toEqual([
      { x: 0, w: 22 },
      { x: 26, w: 22 },
      { x: 52, w: 22 },
      { x: 78, w: 22 },
    ]);
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

describe("seats around the stump", () => {
  const silhouette = (spot: SeatSpot): Rect => ({ x: spot.x - SILHOUETTE_W / 2, y: spot.bottom - SILHOUETTE_H, w: SILHOUETTE_W, h: SILHOUETTE_H });
  const card = (at: { x: number; y: number }): Rect => ({ x: at.x, y: at.y, w: CARD_W, h: CARD_H });

  it("three teammates sit left, behind and right, each plate above its head", () => {
    const spots = seatSpots(3);
    expect(spots.map((s) => s.x)).toEqual([160, 320, 480]);
    expect(spots.map((_, i) => plateRect(spots, i))).toEqual([
      { x: 104, y: 92, w: 112, h: 48 },
      { x: 256, y: 42, w: 128, h: 48 },
      { x: 424, y: 92, w: 112, h: 48 },
    ]);
  });

  it.each([2, 3, 4, 5])("count=%i: plates stay in the crowd zone and clear of each other and every silhouette", (count) => {
    const spots = seatSpots(count);
    expect(spots).toHaveLength(count);
    const plates = spots.map((_, i) => plateRect(spots, i));
    for (const p of plates) expect(rectContains(ZONES.crowd, p)).toBe(true);
    for (let i = 0; i < plates.length; i++) {
      for (let j = i + 1; j < plates.length; j++) expect(rectsIntersect(plates[i]!, plates[j]!)).toBe(false);
      for (const s of spots) expect(rectsIntersect(plates[i]!, silhouette(s))).toBe(false);
    }
  });

  it.each([2, 3, 4, 5])("count=%i: every played card lands on the stump, clear of the others and of yours", (count) => {
    const cards = [...seatSpots(count).map((s) => card(s.card)), card(YOUR_CARD_AT)];
    for (const c of cards) expect(rectContains(ZONES.stump, c)).toBe(true);
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) expect(rectsIntersect(cards[i]!, cards[j]!)).toBe(false);
    }
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
  it("places the campfire, fireflies and lantern in the world zone, clear of the boss, and the mascot in the actions zone", () => {
    const at = (p: { x: number; y: number }): Rect => ({ x: p.x, y: p.y, w: 1, h: 1 });
    expect(rectContains(ZONES.world, at(INTERACTABLE_ANCHORS.campfire))).toBe(true);
    expect(rectContains(ZONES.world, at(INTERACTABLE_ANCHORS.fireflies))).toBe(true);
    expect(rectContains(ZONES.world, at(INTERACTABLE_ANCHORS.lantern))).toBe(true);
    expect(rectContains(ZONES.actions, at(INTERACTABLE_ANCHORS.mascot))).toBe(true);
    const lanternWithRope = { x: INTERACTABLE_ANCHORS.lantern.x - 8, y: INTERACTABLE_ANCHORS.lantern.y - 20, w: 16, h: 28 };
    expect(rectContains(ZONES.world, lanternWithRope)).toBe(true);
  });
});

describe("pointInRect (the drop test)", () => {
  it("accepts any point inside the stump and rejects the hand and the stump's far edge", () => {
    expect(pointInRect(ZONES.stump, { x: 320, y: 180 })).toBe(true);
    expect(pointInRect(ZONES.stump, { x: 192, y: 148 })).toBe(true);
    expect(pointInRect(ZONES.stump, { x: 448, y: 180 })).toBe(false);
    expect(pointInRect(ZONES.stump, { x: 320, y: 300 })).toBe(false);
  });
});

describe("gearLayout", () => {
  it("keeps every slot and backpack cell inside the backpack zone, none overlapping, for 1 to 3 slots", () => {
    for (const slots of [1, 2, 3]) {
      const geo = gearLayout(slots);
      const cells = [...geo.slots, ...geo.pack];
      expect(cells.every((cell) => rectContains(TRAIL_ZONES.backpack, cell))).toBe(true);
      for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) expect(rectsIntersect(cells[i]!, cells[j]!)).toBe(false);
      expect(geo.slots.map((s) => s.h)).toEqual(Array(slots).fill(slots === 3 ? 17 : 22));
    }
  });

  it("drops onto the slot under the pointer, and the backpack beside the slots", () => {
    const geo = gearLayout(2);
    expect(geo.slots.findIndex((r) => pointInRect(r, { x: 60, y: 325 }))).toBe(1);
    expect(pointInRect(geo.packArea, { x: 300, y: 320 })).toBe(true);
    expect(pointInRect(geo.packArea, { x: 60, y: 320 })).toBe(false);
  });
});

describe("the boss in the world column", () => {
  it("fits the longest boss caption on one line, and its rule on one ticker line", async () => {
    const { CAPTION_CHARS } = await import("./draw/draw-boss");
    const { CAPTION_MAX_CHARS, RULE_MAX_CHARS } = await import("../../../lib/expedition/boss-model");
    expect(CAPTION_CHARS).toBeGreaterThanOrEqual(CAPTION_MAX_CHARS);
    expect(Math.floor((ZONES.ticker.w - 4) / 6)).toBeGreaterThanOrEqual(RULE_MAX_CHARS);
  });

  it("scales every boss sprite to stand inside the column, above its caption, the widest at 0.59", async () => {
    const { bossScale, bossStage } = await import("./draw/draw-boss");
    const { ART } = await import("./art/art-registry");
    const stage = bossStage();
    expect(rectContains(ZONES.world, stage)).toBe(true);
    const sizes = Object.entries(ART).filter(([id]) => id.startsWith("boss-")).map(([id, art]) => {
      const scale = bossScale(art.w, art.h);
      return { id, fits: Math.round(art.w * scale) <= stage.w && Math.round(art.h * scale) <= stage.h, scale: Math.round(scale * 100) / 100 };
    });
    expect(sizes).toHaveLength(13);
    expect(sizes.filter((s) => !s.fits)).toEqual([]);
    expect(Math.min(...sizes.map((s) => s.scale))).toBe(0.59);
  });
});

describe("the temple", () => {
  it("lays the longest path (9 plates at 3 players) and its longest texts inside the path zone, centred", async () => {
    const { pathLayout, PLATE_TILE } = await import("./layout");
    const longest = { count: "Plates 9/9".length * 6, hint: "Every plate pressed".length * 6 };
    for (const plates of [9, 6, 5, 1]) {
      const geo = pathLayout(plates, longest.count, longest.hint, 8);
      const pieces: Rect[] = [
        { x: geo.countX, y: geo.textY, w: longest.count, h: 8 },
        ...geo.tileXs.map((x) => ({ x, y: geo.tileY, w: PLATE_TILE, h: PLATE_TILE })),
        { x: geo.hintX, y: geo.textY, w: longest.hint, h: 8 },
      ];
      expect(pieces.every((p) => rectContains(ZONES.path, p))).toBe(true);
      for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) expect(rectsIntersect(pieces[i]!, pieces[j]!)).toBe(false);
      expect(rectContains(ZONES.path, geo.row)).toBe(true);
    }
    expect(pathLayout(9, longest.count, longest.hint, 8)).toMatchObject({ countX: 165, hintX: 361, tileY: 278, textY: 280 });
  });

  it.each([2, 3, 4])("count=%i teammates: the path is clear of every seat, the stump, the hand, the kit, the world column and the top bar", (count) => {
    const spots = seatSpots(count);
    const seats = spots.flatMap((s, i) => [plateRect(spots, i), { x: s.x - SILHOUETTE_W / 2, y: s.bottom - SILHOUETTE_H, w: SILHOUETTE_W, h: SILHOUETTE_H }]);
    for (const r of [...seats, ZONES.stump, ZONES.hand, ZONES.kit, ZONES.world, ZONES.topBar, ZONES.you]) expect(rectsIntersect(ZONES.path, r)).toBe(false);
    const lifted = handFanXs(18).map((x) => ({ x, y: HAND_CARD_Y - HOVER_LIFT - HAND_MARKER_H - 1, w: CARD_W, h: CARD_H }));
    for (const card of lifted) expect(rectsIntersect(ZONES.path, card)).toBe(false);
  });

  it("stacks one or two helpers in the world column, each sprite above its two caption lines", async () => {
    const { helperRows } = await import("./layout");
    const { CAPTION_CHARS } = await import("./draw/draw-boss");
    for (const count of [1, 2]) {
      const rows = helperRows(count);
      const boxes = rows.flatMap((r) => [r.sprite, r.caption]);
      expect(boxes.every((b) => rectContains(ZONES.world, b))).toBe(true);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(rectsIntersect(boxes[i]!, boxes[j]!)).toBe(false);
      for (const r of rows) expect(CAPTION_CHARS * 6).toBeLessThanOrEqual(r.caption.w);
    }
    expect(helperRows(2).map((r) => r.sprite)).toEqual([{ x: 7, y: 43, w: 94, h: 30 }, { x: 7, y: 93, w: 94, h: 30 }]);
  });

  it("stands a lone helper at exactly half its boss's size, and two at up to half, each inside its row", async () => {
    const { helperRows } = await import("./layout");
    const { bossScale, helperScale } = await import("./draw/draw-boss");
    const { ART } = await import("./art/art-registry");
    const bosses = Object.entries(ART).filter(([id]) => id.startsWith("boss-"));
    expect(bosses).toHaveLength(13);
    for (const count of [1, 2]) {
      const room = helperRows(count)[0]!.sprite;
      const ratios = bosses.map(([, art]) => {
        const scale = helperScale(art.w, art.h, room);
        expect(Math.round(art.w * scale)).toBeLessThanOrEqual(room.w);
        expect(Math.round(art.h * scale)).toBeLessThanOrEqual(room.h);
        return Math.round((scale / bossScale(art.w, art.h)) * 100) / 100;
      });
      if (count === 1) expect(new Set(ratios)).toEqual(new Set([0.5]));
      else expect(Math.min(...ratios)).toBe(0.35);
    }
  });
});

describe("the top bar's modifier strip at the temple", () => {
  it("fits a pairing, the temple and two helpers in the span left at 1280x720, naming the temple and only icons for the rest", async () => {
    const { stripFit } = await import("./draw/draw-weather");
    const chip = (id: string, kind: "location" | "weather" | "pairing" | "animal" | "disaster" | "temple", name: string, strength: "full" | "half" = "full") =>
      ({ id, objectId: `mod:${id}`, kind, strength, name, badge: null, pips: 0, gauge: null, alert: false });
    const chips = [
      chip("magma", "location", "Magma pool"),
      chip("rain", "weather", "Rain"),
      chip("steam", "pairing", "Steam"),
      chip("temple", "temple", "The Temple"),
      chip("crocodile", "animal", "Crocodile (half)", "half"),
      chip("blood-moon", "disaster", "Blood Moon (half)", "half"),
    ];
    expect(stripFit(chips, 219)).toEqual({ tier: "icon", total: 173 });
  });
});

describe("a crowded objective row", () => {
  it("shortens a trick-count tag to its number, so a card and the tag fit a teammate plate beside two kit icons", async () => {
    const { objectiveItemWidth } = await import("./draw/ui-kit");
    const chip = (kind: "ordered" | "no-tricks", label: string) => ({ objectiveId: label, objectId: label, kind, label, orderBadge: null, status: "pending" as const, ownerSeatId: "s1", pickable: false, targetable: false, selected: false });
    const tag = chip("no-tricks", "0 tricks");
    expect([objectiveItemWidth(tag), objectiveItemWidth(tag, true)]).toEqual([58, 16]);
    const room = 108 - 2 * 17 - 4;
    expect(objectiveItemWidth(chip("ordered", "10♠"), true) + 2 + objectiveItemWidth(tag, true)).toBeLessThanOrEqual(room);
  });
});
