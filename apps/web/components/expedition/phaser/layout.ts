/**
 * Stage-pixel geometry for the camp scene, designed once at 640x360 (D-10).
 * Every element is placed inside one rectangle of `ZONES`; `layout.test.ts`
 * proves the zones never intersect, so two zones' contents can never cover
 * each other. No `phaser` import, so Vitest loads this module directly.
 */

import { LABEL_CELL } from "./font/font-keys";
import type { TableId } from "./art/art-registry";

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
/** The transition signboard, drawn at `scale` over every scene: its art's
 * top rests `top` stage px below the stage's top edge; `face` is the plank
 * inside the carved border and `chain` one link pair at each corner, in the
 * art's own px. The chains repeat that pair up past the stage's top. */
export const SIGNBOARD = {
  scale: 2,
  top: 30,
  face: { x: 22, y: 40, w: 148, h: 68 },
  facePad: 8,
  /** The plank's four boards between their seams, inclusive rows: one line of lettering each. */
  boards: [[42, 56], [58, 72], [74, 87], [89, 104]],
  chain: { y: 11, h: 10, w: 10, xs: [27, 155] },
} as const;

export const SETTINGS_SAFE_ZONE: Rect = { x: 584, y: 0, w: 56, h: 56 };

/** The pocket under the corner buttons, right of the prompt and above the
 * whispers and the trail map, that no scene draws in while a run is under
 * way: the HTML kick vote sits here, one pill high, at any zoom. */
export const KICK_POCKET: Rect = { x: 546, y: 26, w: 90, h: 17 };

export const ZONES = {
  topBar: { x: 0, y: 0, w: 576, h: 22 },
  prompt: { x: 96, y: 24, w: 448, h: 16 },
  /** The left column above the kit: the fireflies, or in a boss camp the
   * boss in their place. */
  world: { x: 6, y: 42, w: 96, h: 100 },
  crowd: { x: 104, y: 42, w: 432, h: 104 },
  whispers: { x: 540, y: 58, w: 92, h: 112 },
  kit: { x: 8, y: 146, w: 92, h: 126 },
  /** The table's flat top, where cards land, and the drop target. */
  table: { x: 192, y: 148, w: 256, h: 80 },
  lastTrick: { x: 540, y: 174, w: 92, h: 58 },
  ticker: { x: 136, y: 228, w: 368, h: 18 },
  tooltip: { x: 104, y: 248, w: 432, h: 24 },
  you: { x: 8, y: 276, w: 108, h: 80 },
  /** The temple's plate path, along the foot of the altar above your hand. */
  path: { x: 120, y: 272, w: 400, h: 16 },
  /** Your hand, standing on its board: the board's front shows below it. */
  hand: { x: 120, y: 288, w: 400, h: 68 },
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

/** The draft while your offer is open: the bundles take the panel and crew
 * row, so every item's rules fit in full. */
export const DRAFT_ZONES = {
  topBar: TRAIL_ZONES.topBar,
  prompt: TRAIL_ZONES.prompt,
  trail: TRAIL_ZONES.trail,
  offer: ROUTE_ZONES.routes,
  tooltip: TRAIL_ZONES.tooltip,
  backpack: TRAIL_ZONES.backpack,
  ready: TRAIL_ZONES.ready,
} as const satisfies Record<string, Rect>;

const BUNDLE_GAP = 8;
const BUNDLE_MAX_W = 200;
/** Lines of rules text a bundle item has room for; `layout.test.ts` checks
 * every item's text wraps within it at the narrowest bundle card. */
export const BUNDLE_TEXT_LINES = 3;

/** The bundle cards of a draft offer, centred in the offer zone. */
export function bundleBoxes(count: number): { x: number; w: number }[] {
  const zone = DRAFT_ZONES.offer;
  const boxes = rowBoxes(0, zone.w - 12, count, BUNDLE_GAP, BUNDLE_MAX_W);
  const span = boxes.length === 0 ? 0 : boxes.at(-1)!.x + boxes.at(-1)!.w;
  const left = zone.x + Math.floor((zone.w - span) / 2);
  return boxes.map((box) => ({ x: left + box.x, w: box.w }));
}

const BUNDLE_LINE_H = LABEL_CELL.h + 2;
/** A bundle card's Take button, at its foot. */
export const BUNDLE_TAKE_H = 14;
export const BUNDLE_ITEM_TEXT_Y = 14;

/** A bundle item's height: its name row, its rules, then its uses chips. */
export function bundleItemH(lines: number): number {
  return BUNDLE_ITEM_TEXT_Y + lines * BUNDLE_LINE_H + 2 + BUNDLE_LINE_H + 2;
}

/** Characters of rules text per line in a bundle card `w` wide. */
export function bundleTextChars(w: number): number {
  return Math.floor((w - 8) / LABEL_CELL.w);
}

/** The muster before camp 1: the characters, the crew and the length vote. */
export const MUSTER_ZONES = {
  topBar: { x: 0, y: 0, w: 576, h: 22 },
  prompt: { x: 96, y: 24, w: 448, h: 16 },
  cards: { x: 8, y: 56, w: 624, h: 236 },
  crew: { x: 8, y: 296, w: 136, h: 60 },
  lengths: { x: 148, y: 296, w: 420, h: 60 },
  lockIn: { x: 572, y: 296, w: 60, h: 60 },
} as const satisfies Record<string, Rect>;

const MUSTER_COLS = 3;
const MUSTER_CARD_GAP = 4;
/** A muster card's portrait column, with the pick or taker under it. */
export const MUSTER_PORTRAIT_W = 40;
/** Lines a muster card holds right of its portrait: the name, the theme,
 * the power's name, then MUSTER_TEXT_LINES of rules, MUSTER_LINE apart
 * (a pixel closer than elsewhere, so nine cards fit). */
export const MUSTER_TEXT_LINES = 5;
export const MUSTER_LINE = LABEL_CELL.h + 1;

/** The muster's character cards, three to a row, the last row centred. */
export function musterBoxes(count: number): Rect[] {
  const zone = MUSTER_ZONES.cards;
  const rows = Math.max(1, Math.ceil(count / MUSTER_COLS));
  const w = Math.floor((zone.w - (MUSTER_COLS - 1) * MUSTER_CARD_GAP) / MUSTER_COLS);
  const h = Math.floor((zone.h - (rows - 1) * MUSTER_CARD_GAP) / rows);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / MUSTER_COLS);
    const inRow = Math.min(MUSTER_COLS, count - row * MUSTER_COLS);
    const left = zone.x + Math.floor((zone.w - (inRow * w + (inRow - 1) * MUSTER_CARD_GAP)) / 2);
    return { x: left + (i % MUSTER_COLS) * (w + MUSTER_CARD_GAP), y: zone.y + row * (h + MUSTER_CARD_GAP), w, h };
  });
}

/** The run-length cards' gap, and the most room a stop marker takes. */
export const LENGTH_CARD_GAP = 4;
export const STOP_MARKER = 16;
const STOP_STEP_MAX = STOP_MARKER + 1;

/** How far apart a length card `cardW` wide spaces its `stops` markers:
 * a pixel between them where the card has room, else touching, clear of
 * the card's edges by 4. */
export function lengthStopStep(stops: number, cardW: number): number {
  if (stops < 2) return STOP_STEP_MAX;
  return Math.min(STOP_STEP_MAX, Math.floor((cardW - 8 - STOP_MARKER) / (stops - 1)));
}

/** Characters per line in a muster card's text column. */
export function musterTextChars(cardW: number): number {
  return Math.floor((cardW - MUSTER_PORTRAIT_W - 4) / LABEL_CELL.w);
}

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
  draft: DRAFT_ZONES,
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
// The table, its board and the seats around it
// ---------------------------------------------------------------------------

/** Where every table's flat top begins: each location's art is lifted so its
 * top starts here, and its foot runs down behind your board to the stage's
 * bottom edge. */
export const TABLE_TOP_Y = ZONES.table.y;
const TABLE_ART_W = 416;
const BOARD_ART_W = 424;

/** Rows measured in each 2x art (stage px from its top): where the table's
 * flat top begins at its centre and where its foot ends, and where the
 * board's rim begins at its centre and where it ends. */
const TABLE_ROWS: Readonly<Record<TableId, { top: number; foot: number; boardTop: number; boardFoot: number }>> = {
  jungle: { top: 8, foot: 220, boardTop: 14, boardFoot: 60 },
  clifftop: { top: 6, foot: 216, boardTop: 12, boardFoot: 64 },
  magma: { top: 10, foot: 216, boardTop: 12, boardFoot: 64 },
  clearing: { top: 28, foot: 208, boardTop: 16, boardFoot: 56 },
  desert: { top: 14, foot: 208, boardTop: 14, boardFoot: 60 },
  cave: { top: 8, foot: 216, boardTop: 12, boardFoot: 62 },
  temple: { top: 24, foot: 200, boardTop: 18, boardFoot: 56 },
};

/** The top-left of a table's art, centred on the stage. */
export function tableArtAt(id: TableId): Point {
  return { x: (STAGE.w - TABLE_ART_W) / 2, y: TABLE_TOP_Y - TABLE_ROWS[id].top };
}

/** The top-left of a board's art: centred, its foot on the stage's bottom
 * edge, in front of the table's foot. */
export function boardArtAt(id: TableId): Point {
  return { x: (STAGE.w - BOARD_ART_W) / 2, y: STAGE.h - TABLE_ROWS[id].boardFoot };
}

/** The stage rows a table's art covers, and where its board's rim begins. */
export function tableSpan(id: TableId): { top: number; foot: number; boardTop: number } {
  const rows = TABLE_ROWS[id];
  return { top: TABLE_TOP_Y, foot: tableArtAt(id).y + rows.foot, boardTop: boardArtAt(id).y + rows.boardTop };
}

export const SILHOUETTE_W = 64;
export const SILHOUETTE_H = 80;
export const PLATE_H = 48;
const PLATE_GAP = 2;

/** Where a teammate sits: the silhouette's bottom-centre (its legs hidden
 * behind the table's far rim), and the top-left of the card they play, on
 * the table in front of them. */
export interface SeatSpot {
  x: number;
  bottom: number;
  card: Point;
}

// The tables' tops are shallow: the back row of cards sits at the far rim,
// the side seats' a little nearer and as far in as the seats allow, and the
// card of the seat straight behind you lands left of centre, clear of yours
// at the front.
const seat = (x: number, bottom: number, cardX: number, cardY: number): SeatSpot => ({ x, bottom, card: { x: cardX, y: cardY } });

/** Your own card, at the front of the table. */
export const YOUR_CARD_AT: Point = { x: 318, y: 164 };

/** Teammates left to right in turn order: with two they flank the table,
 * with three one sits behind it. Five is a spectator's view. */
const SPOTS: Readonly<Record<number, readonly SeatSpot[]>> = {
  1: [seat(320, 172, 286, 148)],
  2: [seat(160, 222, 244, 156), seat(480, 222, 372, 156)],
  3: [seat(160, 222, 236, 156), seat(320, 172, 286, 148), seat(480, 222, 372, 156)],
  4: [seat(160, 222, 226, 154), seat(262, 174, 258, 148), seat(378, 174, 352, 148), seat(480, 222, 384, 154)],
  5: [seat(160, 222, 226, 154), seat(248, 174, 258, 148), seat(320, 172, 286, 148), seat(392, 174, 352, 148), seat(480, 222, 384, 154)],
};

export function seatSpots(count: number): readonly SeatSpot[] {
  return SPOTS[count] ?? [];
}

/** The name plate above a seat's head: as wide as fits between its
 * neighbours whose plates share its rows, and never outside the crowd zone. */
export function plateRect(spots: readonly SeatSpot[], i: number): Rect {
  const spot = spots[i]!;
  const y = spot.bottom - SILHOUETTE_H - PLATE_GAP - PLATE_H;
  const sameRow = spots.filter((s) => s !== spot && Math.abs(s.bottom - spot.bottom) < PLATE_H);
  const gap = Math.min(...sameRow.map((s) => Math.abs(s.x - spot.x) - 4), 128);
  const zone = ZONES.crowd;
  const w = Math.min(gap, 2 * (spot.x - zone.x), 2 * (zone.x + zone.w - spot.x));
  return { x: Math.round(spot.x - w / 2), y, w, h: PLATE_H };
}

// ---------------------------------------------------------------------------
// Hand
// ---------------------------------------------------------------------------

export const HOVER_LIFT = 8;
/** Resting top edge of a hand card, on its board: low enough that the
 * lifted card's top (`HAND_CARD_Y - HOVER_LIFT`) and the targeting marker
 * above it stay in the hand zone. */
export const HAND_CARD_Y = ZONES.hand.y + ZONES.hand.h - CARD_H - 16;
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
// Table: trick row and the face-up objective pool
// ---------------------------------------------------------------------------

export const TABLE_CENTRE: Point = centreOf(ZONES.table);
export const OBJECTIVE_POOL_STEP = 50;

/** Centre x of each of `count` items spaced `step` apart, centred on the
 * table. */
export function tableRowXs(count: number, step: number): number[] {
  const firstX = TABLE_CENTRE.x - ((count - 1) * step) / 2;
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
  fireflies: Point;
  mascot: Point;
} = {
  fireflies: { x: 52, y: 88 },
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
