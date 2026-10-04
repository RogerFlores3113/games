/**
 * Stage-pixel geometry for the camp scene, designed once at 640x360 (D-10).
 * Every element is placed inside one rectangle of `ZONES`; `layout.test.ts`
 * proves the zones never intersect, so two zones' contents can never cover
 * each other. No `phaser` import, so Vitest loads this module directly.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export const STAGE: Rect = { x: 0, y: 0, w: 640, h: 360 };

/** Reserved for the HTML settings button drawn over the canvas. */
export const SETTINGS_SAFE_ZONE: Rect = { x: 584, y: 0, w: 56, h: 56 };

export const ZONES = {
  topBar: { x: 0, y: 0, w: 576, h: 22 },
  prompt: { x: 96, y: 24, w: 448, h: 16 },
  /** The left column above the kit: the campfire, or in a boss camp the
   * boss in its place. */
  world: { x: 6, y: 42, w: 96, h: 100 },
  crowd: { x: 104, y: 42, w: 432, h: 104 },
  whispers: { x: 540, y: 58, w: 92, h: 112 },
  kit: { x: 8, y: 146, w: 92, h: 126 },
  stump: { x: 192, y: 148, w: 256, h: 82 },
  lastTrick: { x: 540, y: 174, w: 92, h: 58 },
  ticker: { x: 136, y: 232, w: 368, h: 18 },
  tooltip: { x: 104, y: 252, w: 432, h: 24 },
  you: { x: 8, y: 276, w: 108, h: 80 },
  /** The temple's plate path, along the foot of the stump above your hand. */
  path: { x: 120, y: 276, w: 400, h: 16 },
  hand: { x: 120, y: 292, w: 400, h: 64 },
  actions: { x: 524, y: 276, w: 108, h: 80 },
} as const satisfies Record<string, Rect>;

export type ZoneId = keyof typeof ZONES;

/** The trail between camps: the draft, the event and the loadout. The trail
 * map stops short of the settings safe zone in the top-right corner. */
export const TRAIL_ZONES = {
  topBar: { x: 0, y: 0, w: 576, h: 22 },
  prompt: { x: 96, y: 24, w: 448, h: 16 },
  trail: { x: 16, y: 44, w: 568, h: 64 },
  panel: { x: 16, y: 112, w: 400, h: 144 },
  crew: { x: 424, y: 112, w: 200, h: 144 },
  tooltip: { x: 16, y: 258, w: 608, h: 24 },
  backpack: { x: 16, y: 284, w: 448, h: 72 },
  ready: { x: 472, y: 284, w: 152, h: 72 },
} as const satisfies Record<string, Rect>;

/** The route vote: the options take the panel and crew row. */
export const ROUTE_ZONES = {
  topBar: TRAIL_ZONES.topBar,
  prompt: TRAIL_ZONES.prompt,
  trail: TRAIL_ZONES.trail,
  routes: { x: 16, y: 112, w: 608, h: 144 },
  tooltip: TRAIL_ZONES.tooltip,
  backpack: TRAIL_ZONES.backpack,
  ready: TRAIL_ZONES.ready,
} as const satisfies Record<string, Rect>;

/** The muster before camp 1: the characters, the crew and the length vote. */
export const MUSTER_ZONES = {
  topBar: { x: 0, y: 0, w: 576, h: 22 },
  prompt: { x: 96, y: 24, w: 448, h: 16 },
  cards: { x: 8, y: 56, w: 624, h: 236 },
  crew: { x: 8, y: 296, w: 132, h: 60 },
  lengths: { x: 144, y: 296, w: 488, h: 60 },
} as const satisfies Record<string, Rect>;

/** The end of the run: the outcome, the per-camp strip, and the restart. */
export const RUN_END_ZONES = {
  headline: { x: 32, y: 40, w: 544, h: 44 },
  strip: { x: 16, y: 104, w: 608, h: 76 },
  mascot: { x: 296, y: 192, w: 48, h: 44 },
  actions: { x: 168, y: 248, w: 304, h: 96 },
} as const satisfies Record<string, Rect>;

/** Every scene's zone table, for the disjointness test. */
export const SCENE_ZONES: Readonly<Record<string, Readonly<Record<string, Rect>>>> = {
  camp: ZONES,
  trail: TRAIL_ZONES,
  route: ROUTE_ZONES,
  muster: MUSTER_ZONES,
  "run-end": RUN_END_ZONES,
};

export const CARD_W = 28;
export const CARD_H = 40;
export const MINI_W = 14;
export const MINI_H = 20;

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function pointInRect(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

export function centreOf(r: Rect): Point {
  return { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) };
}

// ---------------------------------------------------------------------------
// Seats around the stump
// ---------------------------------------------------------------------------

/** The stump sprite's top-left; its flat top spans x 206..450, y 150..223. */
export const STUMP_ART_AT: Point = { x: 128, y: 138 };
export const SILHOUETTE_W = 64;
export const SILHOUETTE_H = 80;
export const PLATE_H = 48;
const PLATE_GAP = 2;

/** Where a teammate sits: the silhouette's bottom-centre (its legs hidden
 * behind the stump's rim), and the top-left of the card they play, on the
 * stump in front of them. */
export interface SeatSpot {
  x: number;
  bottom: number;
  card: Point;
}

const SIDE_LEFT: SeatSpot = { x: 160, bottom: 222, card: { x: 226, y: 170 } };
const BACK_LEFT: SeatSpot = { x: 262, bottom: 174, card: { x: 268, y: 151 } };
const BACK: SeatSpot = { x: 320, bottom: 172, card: { x: 306, y: 150 } };
const BACK_RIGHT: SeatSpot = { x: 378, bottom: 174, card: { x: 344, y: 151 } };
const SIDE_RIGHT: SeatSpot = { x: 480, bottom: 222, card: { x: 386, y: 170 } };
const BACK_LEFT_5: SeatSpot = { x: 248, bottom: 174, card: { x: 262, y: 151 } };
const BACK_RIGHT_5: SeatSpot = { x: 392, bottom: 174, card: { x: 350, y: 151 } };

/** Your own card, at the front of the stump. */
export const YOUR_CARD_AT: Point = { x: 306, y: 190 };

/** Teammates left to right in turn order: with two they flank the stump,
 * with three one sits behind it. Five is a spectator's view. */
const SPOTS: Readonly<Record<number, readonly SeatSpot[]>> = {
  1: [BACK],
  2: [SIDE_LEFT, SIDE_RIGHT],
  3: [SIDE_LEFT, BACK, SIDE_RIGHT],
  4: [SIDE_LEFT, BACK_LEFT, BACK_RIGHT, SIDE_RIGHT],
  5: [SIDE_LEFT, BACK_LEFT_5, BACK, BACK_RIGHT_5, SIDE_RIGHT],
};

export function seatSpots(count: number): readonly SeatSpot[] {
  return SPOTS[count] ?? [];
}

/** The name plate above a seat's head: as wide as fits between its
 * neighbours on the same row, and never outside the crowd zone. */
export function plateRect(spots: readonly SeatSpot[], i: number): Rect {
  const spot = spots[i]!;
  const y = spot.bottom - SILHOUETTE_H - PLATE_GAP - PLATE_H;
  const sameRow = spots.filter((s) => s !== spot && Math.abs(s.bottom - spot.bottom) < PLATE_H + PLATE_GAP * 2);
  const gap = Math.min(...sameRow.map((s) => Math.abs(s.x - spot.x) - 4), 128);
  const zone = ZONES.crowd;
  const w = Math.min(gap, 2 * (spot.x - zone.x), 2 * (zone.x + zone.w - spot.x));
  return { x: Math.round(spot.x - w / 2), y, w, h: PLATE_H };
}

// ---------------------------------------------------------------------------
// Hand
// ---------------------------------------------------------------------------

export const HOVER_LIFT = 8;
/** Resting top edge of a hand card: low enough that the lifted card's top
 * (`HAND_CARD_Y - HOVER_LIFT`) and the targeting marker above it stay in
 * the hand zone. */
export const HAND_CARD_Y = ZONES.hand.y + ZONES.hand.h - CARD_H - 12;
export const HAND_MARKER_H = 2;

/** Left x of each card in a `count`-card fan centred in the hand zone. The
 * step never exceeds a small gap, and shrinks so every card fits. */
export function handFanXs(count: number): number[] {
  const zone = ZONES.hand;
  const centreX = zone.x + zone.w / 2;
  if (count <= 0) return [];
  if (count === 1) return [Math.round(centreX - CARD_W / 2)];
  const step = Math.min(CARD_W + 2, Math.floor((zone.w - CARD_W) / (count - 1)));
  const span = step * (count - 1) + CARD_W;
  const firstX = Math.round(centreX - span / 2);
  return Array.from({ length: count }, (_, i) => firstX + step * i);
}

// ---------------------------------------------------------------------------
// Stump: trick row and the face-up objective pool
// ---------------------------------------------------------------------------

export const STUMP_CENTRE: Point = centreOf(ZONES.stump);
export const OBJECTIVE_POOL_STEP = 50;

/** Centre x of each of `count` items spaced `step` apart, centred on the
 * stump. */
export function stumpRowXs(count: number, step: number): number[] {
  const firstX = STUMP_CENTRE.x - ((count - 1) * step) / 2;
  return Array.from({ length: count }, (_, i) => Math.round(firstX + i * step));
}

// ---------------------------------------------------------------------------
// The temple: its plate path, and the helpers in the world column
// ---------------------------------------------------------------------------

export const PLATE_TILE = 12;
const PLATE_STEP = PLATE_TILE + 2;
const PATH_GAP = 6;

export interface PathLayout {
  /** Left x of the count ("Plates 2/9"), each tile, and the hint. */
  countX: number;
  tileXs: number[];
  hintX: number;
  /** Top of the tiles, and of the text centred beside them. */
  tileY: number;
  textY: number;
  /** The whole row, for its hover. */
  row: Rect;
}

/** The count, `plates` tiles and the hint in one row centred in the path
 * zone, for texts `countW` and `hintW` px wide. */
export function pathLayout(plates: number, countW: number, hintW: number, textH: number): PathLayout {
  const zone = ZONES.path;
  const tilesW = plates * PLATE_STEP - 2;
  const total = countW + PATH_GAP + tilesW + PATH_GAP + hintW;
  const countX = zone.x + Math.floor((zone.w - total) / 2);
  const firstTile = countX + countW + PATH_GAP;
  const tileY = zone.y + Math.floor((zone.h - PLATE_TILE) / 2);
  return {
    countX,
    tileXs: Array.from({ length: plates }, (_, i) => firstTile + i * PLATE_STEP),
    hintX: firstTile + tilesW + PATH_GAP,
    tileY,
    textY: zone.y + Math.floor((zone.h - textH) / 2),
    row: { x: countX - 2, y: zone.y, w: total + 4, h: zone.h },
  };
}

export const HELPER_CAPTION_LINE_H = 9;
const HELPER_CAPTION_LINES = 2;

export interface HelperRow {
  /** Where the helper's sprite stands. */
  sprite: Rect;
  /** Its two caption lines: its name, then what it is doing. */
  caption: Rect;
}

/** The world column split into one row per temple helper, top to bottom:
 * each row's sprite above its caption, so neither overlaps the other or
 * the kit below. The sprite's box leaves a pixel above and below for its
 * idle bob. */
export function helperRows(count: number): HelperRow[] {
  const zone = ZONES.world;
  const rowH = Math.floor(zone.h / Math.max(1, count));
  const captionH = HELPER_CAPTION_LINES * HELPER_CAPTION_LINE_H;
  return Array.from({ length: count }, (_, i) => {
    const y = zone.y + i * rowH;
    return {
      sprite: { x: zone.x + 1, y: y + 1, w: zone.w - 2, h: rowH - captionH - 2 },
      caption: { x: zone.x, y: y + rowH - captionH, w: zone.w, h: captionH },
    };
  });
}

// ---------------------------------------------------------------------------
// World furniture
// ---------------------------------------------------------------------------

export const INTERACTABLE_ANCHORS: {
  campfire: Point;
  fireflies: Point;
  lantern: Point;
  mascot: Point;
} = {
  campfire: { x: 50, y: 120 },
  fireflies: { x: 30, y: 64 },
  lantern: { x: 84, y: 70 },
  mascot: { x: 612, y: 338 },
};

// ---------------------------------------------------------------------------
// Trail
// ---------------------------------------------------------------------------

/** Trail stops, evenly spaced along the trail zone. Returns each stop's
 * centre x. */
export function trailStopXs(count: number): number[] {
  const zone = TRAIL_ZONES.trail;
  const step = zone.w / count;
  return Array.from({ length: count }, (_, i) => Math.round(zone.x + step * (i + 0.5)));
}

// ---------------------------------------------------------------------------
// Loadout gear: your slots, then the backpack grid, in the backpack zone
// ---------------------------------------------------------------------------

export const GEAR_HEADER_H = 13;
export const GEAR_SLOT_W = 112;
export const PACK_COLS = 3;
export const PACK_ROWS = 2;
const GEAR_TILE_MAX_H = 22;
const GEAR_GAP = 3;

export interface GearLayout {
  slotArea: Rect;
  slots: Rect[];
  packArea: Rect;
  /** One cell per backpack item shown on a page, row by row. */
  pack: Rect[];
}

/** Where each slot and backpack cell sits. The scene draws with it and
 * hit-tests drops with it, so a drop lands where the tile is drawn. */
export function gearLayout(slotCount: number): GearLayout {
  const zone = TRAIL_ZONES.backpack;
  const top = zone.y + GEAR_HEADER_H;
  const h = zone.y + zone.h - 3 - top;
  const slotArea = { x: zone.x + 4, y: top, w: GEAR_SLOT_W, h };
  const n = Math.max(1, slotCount);
  const slotH = Math.min(GEAR_TILE_MAX_H, Math.floor((h - (n - 1) * 2) / n));
  const slots = Array.from({ length: slotCount }, (_, i) => ({ x: slotArea.x, y: top + i * (slotH + 2), w: GEAR_SLOT_W, h: slotH }));
  const packX = slotArea.x + GEAR_SLOT_W + 8;
  const packArea = { x: packX, y: top, w: zone.x + zone.w - 4 - packX, h };
  const cellW = Math.floor((packArea.w - (PACK_COLS - 1) * GEAR_GAP) / PACK_COLS);
  const pack = Array.from({ length: PACK_COLS * PACK_ROWS }, (_, i) => ({
    x: packX + (i % PACK_COLS) * (cellW + GEAR_GAP),
    y: top + Math.floor(i / PACK_COLS) * (GEAR_TILE_MAX_H + GEAR_GAP),
    w: cellW,
    h: GEAR_TILE_MAX_H,
  }));
  return { slotArea, slots, packArea, pack };
}

/** `count` equal boxes with `gap` between them, filling at most `maxW` px
 * and never wider than `maxBox` each. Returns each box's left x and width. */
export function rowBoxes(x: number, maxW: number, count: number, gap: number, maxBox: number): { x: number; w: number }[] {
  if (count <= 0) return [];
  const w = Math.min(maxBox, Math.floor((maxW - gap * (count - 1)) / count));
  return Array.from({ length: count }, (_, i) => ({ x: x + i * (w + gap), w }));
}
