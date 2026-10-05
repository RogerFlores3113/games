import { describe, expect, it } from "vitest";
import { CHARACTER_DISPLAY, SOURCE_DISPLAY } from "@games/rules";
import { buildTrailModel, musterLines } from "../../../lib/expedition/trail-model";
import { initialLocalUi } from "../../../lib/expedition/local-ui";
import { wrapWords } from "./draw/text-fit";
import { TABLE_IDS } from "./art/art-registry";
import {
  BUNDLE_TAKE_H,
  BUNDLE_TEXT_LINES,
  CARD_H,
  DRAFT_ZONES,
  bundleBoxes,
  bundleItemH,
  bundleTextChars,
  musterBoxes,
  musterTextChars,
  MUSTER_LINE,
  MUSTER_TEXT_LINES,
  MUSTER_ZONES,
  CARD_W,
  HAND_CARD_Y,
  HAND_MARKER_H,
  HOVER_LIFT,
  INTERACTABLE_ANCHORS,
  KICK_POCKET,
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
  tableArtAt,
  tableRowXs,
  tableSpan,
  boardArtAt,
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

describe("bundle cards", () => {
  const items = Object.values(SOURCE_DISPLAY).filter((d) => d.kind === "item");

  it("fit every item's rules in full at the narrowest offer", () => {
    const narrowest = Math.min(...bundleBoxes(3).map((b) => b.w));
    const long = items.filter((d) => wrapWords(d.text, bundleTextChars(narrowest)).length > BUNDLE_TEXT_LINES).map((d) => d.id);
    expect(long).toEqual([]);
  });

  it("hold two items at full length and the Take button in the offer zone", () => {
    expect(2 * bundleItemH(BUNDLE_TEXT_LINES) + 1 + BUNDLE_TAKE_H + 3).toBeLessThanOrEqual(DRAFT_ZONES.offer.h - 4);
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

describe("seats around the table", () => {
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

  // A hand and its tricks never both reach two digits, so "14 cards" beside
  // "0 tricks", or "4 cards" beside "10 tricks", is the longest counts row.
  it.each([1, 2, 3, 4])("count=%i: every plate is wide enough for the full counts row", (count) => {
    const spots = seatSpots(count);
    expect(spots.map((_, i) => plateRect(spots, i).w).filter((w) => w < 112)).toEqual([]);
  });

  it.each([2, 3, 4, 5])("count=%i: every played card lands on the stump, clear of the others and of yours", (count) => {
    const cards = [...seatSpots(count).map((s) => card(s.card)), card(YOUR_CARD_AT)];
    for (const c of cards) expect(rectContains(ZONES.table, c)).toBe(true);
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) expect(rectsIntersect(cards[i]!, cards[j]!)).toBe(false);
    }
  });
});

describe("KICK_POCKET", () => {
  it("is clear of every zone of the scenes a run under way draws, and of the corner buttons at 2x and up", () => {
    for (const scene of ["camp", "trail", "route", "draft", "muster"]) {
      for (const [id, zone] of Object.entries(SCENE_ZONES[scene]!)) expect(rectsIntersect(KICK_POCKET, zone), `${scene}.${id}`).toBe(false);
    }
    const buttonsAt2x = { x: 584, y: 0, w: 56, h: 26 };
    expect(rectsIntersect(KICK_POCKET, buttonsAt2x)).toBe(false);
    expect(rectContains(STAGE, KICK_POCKET)).toBe(true);
  });
});

describe("tables and boards", () => {
  it.each(TABLE_IDS)("%s: the table rises from behind the board to its flat top where the cards land, and the board stands on the bottom edge", (id) => {
    const span = tableSpan(id);
    expect(span.top).toBe(ZONES.table.y);
    expect(span.foot).toBeGreaterThanOrEqual(span.boardTop + 2);
    expect(boardArtAt(id).y + 72).toBeGreaterThanOrEqual(STAGE.h);
    expect(tableArtAt(id).x).toBe(112);
  });

  it.each(TABLE_IDS)("%s: your resting hand stands on the board, its front showing below the cards", (id) => {
    expect(HAND_CARD_Y + CARD_H).toBeGreaterThanOrEqual(tableSpan(id).boardTop + 18);
    expect(HAND_CARD_Y + CARD_H).toBeLessThanOrEqual(STAGE.h - 16);
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

describe("tableRowXs", () => {
  it("centres items on the stump", () => {
    expect(tableRowXs(3, 48)).toEqual([272, 320, 368]);
  });
});

describe("INTERACTABLE_ANCHORS", () => {
  it("places the fireflies in the world zone, scattering inside it, and the mascot in the actions zone", () => {
    const at = (p: { x: number; y: number }): Rect => ({ x: p.x, y: p.y, w: 1, h: 1 });
    const scatter = { x: INTERACTABLE_ANCHORS.fireflies.x - 21, y: INTERACTABLE_ANCHORS.fireflies.y - 21, w: 43, h: 43 };
    expect(rectContains(ZONES.world, scatter)).toBe(true);
    expect(rectContains(ZONES.actions, at(INTERACTABLE_ANCHORS.mascot))).toBe(true);
  });
});

describe("pointInRect (the drop test)", () => {
  it("accepts any point inside the stump and rejects the hand and the stump's far edge", () => {
    expect(pointInRect(ZONES.table, { x: 320, y: 180 })).toBe(true);
    expect(pointInRect(ZONES.table, { x: 192, y: 148 })).toBe(true);
    expect(pointInRect(ZONES.table, { x: 448, y: 180 })).toBe(false);
    expect(pointInRect(ZONES.table, { x: 320, y: 300 })).toBe(false);
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
    expect(pathLayout(9, longest.count, longest.hint, 8)).toMatchObject({ countX: 165, hintX: 361, tileY: 274, textY: 276 });
  });

  it.each([2, 3, 4])("count=%i teammates: the path is clear of every seat, the table, the hand, the kit, the world column and the top bar", (count) => {
    const spots = seatSpots(count);
    const seats = spots.flatMap((s, i) => [plateRect(spots, i), { x: s.x - SILHOUETTE_W / 2, y: s.bottom - SILHOUETTE_H, w: SILHOUETTE_W, h: SILHOUETTE_H }]);
    for (const r of [...seats, ZONES.table, ZONES.hand, ZONES.kit, ZONES.world, ZONES.topBar, ZONES.you]) expect(rectsIntersect(ZONES.path, r)).toBe(false);
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
    const tag = chip("no-tricks", "No tricks");
    expect([objectiveItemWidth(tag), objectiveItemWidth(tag, true)]).toEqual([64, 22]);
    const room = 108 - 2 * 17 - 4;
    expect(objectiveItemWidth(chip("ordered", "10♠"), true) + 2 + objectiveItemWidth(tag, true)).toBeLessThanOrEqual(room);
  });
});

describe("muster cards", () => {
  it("fit every character's rules in full, and never overlap", () => {
    // Sized for the nine, so a smaller crew of cards has room to spare.
    const boxes = musterBoxes(Math.max(9, Object.keys(CHARACTER_DISPLAY).length));
    const narrowest = Math.min(...boxes.map((b) => b.w));
    const cards = buildTrailModel(
      {
        game: { yourSeatId: null, runStatus: "in_progress", length: null, campCount: null, purse: 0, supplies: { count: 3, max: 4 }, plan: [], seats: [], kicked: [], yourAbilities: [], history: [], lastVote: null, stage: { tag: "muster", ballots: [] } },
        roomSeats: [],
        hostSeatId: null,
      },
      initialLocalUi(),
    ).panel;
    if (cards.kind !== "muster") throw new Error("expected the muster");
    const chars = musterTextChars(narrowest);
    const long = cards.characters.filter((c) => musterLines(c, chars, 0).length > MUSTER_TEXT_LINES || [c.name, c.theme, c.power.name].some((line) => line.length > chars)).map((c) => c.characterId);
    expect(long).toEqual([]);
    for (const box of boxes) expect(box.y + box.h).toBeLessThanOrEqual(MUSTER_ZONES.cards.y + MUSTER_ZONES.cards.h);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i]!, boxes[j]!];
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    }
    expect(3 + (3 + MUSTER_TEXT_LINES) * MUSTER_LINE).toBeLessThanOrEqual(Math.min(...boxes.map((b) => b.h)));
  });
});
