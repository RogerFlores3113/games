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
  opponents: { x: 8, y: 42, w: 568, h: 70 },
  stump: { x: 136, y: 116, w: 368, h: 128 },
  whispers: { x: 512, y: 116, w: 120, h: 56 },
  lastTrick: { x: 512, y: 176, w: 120, h: 68 },
  world: { x: 8, y: 116, w: 120, h: 128 },
  tooltip: { x: 120, y: 248, w: 400, h: 24 },
  you: { x: 8, y: 276, w: 108, h: 80 },
  hand: { x: 120, y: 276, w: 400, h: 80 },
  actions: { x: 524, y: 276, w: 108, h: 80 },
} as const satisfies Record<string, Rect>;

export type ZoneId = keyof typeof ZONES;

/** The fireside between camps. The trail stops short of the settings safe
 * zone in the top-right corner. */
export const FIRESIDE_ZONES = {
  topBar: { x: 0, y: 0, w: 576, h: 22 },
  prompt: { x: 96, y: 24, w: 448, h: 16 },
  trail: { x: 16, y: 44, w: 568, h: 64 },
  draft: { x: 16, y: 116, w: 384, h: 120 },
  crew: { x: 408, y: 116, w: 216, h: 120 },
  tooltip: { x: 16, y: 240, w: 608, h: 24 },
  backpack: { x: 16, y: 268, w: 448, h: 88 },
  ready: { x: 472, y: 268, w: 152, h: 88 },
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
  fireside: FIRESIDE_ZONES,
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
// Opponent seat blocks
// ---------------------------------------------------------------------------

export const SEAT_BLOCK_W = 138;
export const SEAT_BLOCK_GAP = 4;
export const SEAT_BLOCK_PAD = 4;

/** One block per opponent, left to right in turn order, centred in the
 * `opponents` zone. Four blocks fill the zone at full width; a fifth (only
 * possible for an unseated spectator of a 5-player game) shrinks them all. */
export function opponentBlocks(count: number): Rect[] {
  if (count <= 0) return [];
  const zone = ZONES.opponents;
  const w = Math.min(SEAT_BLOCK_W, Math.floor((zone.w - SEAT_BLOCK_GAP * (count - 1)) / count));
  const total = w * count + SEAT_BLOCK_GAP * (count - 1);
  const startX = zone.x + Math.floor((zone.w - total) / 2);
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * (w + SEAT_BLOCK_GAP), y: zone.y, w, h: zone.h }));
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
export const TRICK_STEP = 48;
export const TRICK_CARD_TOP = STUMP_CENTRE.y - 24;
export const OBJECTIVE_POOL_STEP = 52;

/** Centre x of each of `count` items spaced `step` apart, centred on the
 * stump. */
export function stumpRowXs(count: number, step: number): number[] {
  const firstX = STUMP_CENTRE.x - ((count - 1) * step) / 2;
  return Array.from({ length: count }, (_, i) => Math.round(firstX + i * step));
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
  campfire: { x: 48, y: 214 },
  fireflies: { x: 40, y: 140 },
  lantern: { x: 104, y: 150 },
  mascot: { x: 612, y: 338 },
};

// ---------------------------------------------------------------------------
// Fireside
// ---------------------------------------------------------------------------

/** Trail stops: the six camps then the temple, evenly spaced along the trail
 * zone. Returns each stop's centre x. */
export function trailStopXs(count: number): number[] {
  const zone = FIRESIDE_ZONES.trail;
  const step = zone.w / count;
  return Array.from({ length: count }, (_, i) => Math.round(zone.x + step * (i + 0.5)));
}

/** `count` equal boxes with `gap` between them, filling at most `maxW` px
 * and never wider than `maxBox` each. Returns each box's left x and width. */
export function rowBoxes(x: number, maxW: number, count: number, gap: number, maxBox: number): { x: number; w: number }[] {
  if (count <= 0) return [];
  const w = Math.min(maxBox, Math.floor((maxW - gap * (count - 1)) / count));
  return Array.from({ length: count }, (_, i) => ({ x: x + i * (w + gap), w }));
}
