/**
 * Pure stage-pixel geometry, designed once at 640x360 (D-10). No `phaser`
 * import so Vitest can load this module directly — every scene under
 * `apps/web/components/expedition/phaser/**` reads placement from here
 * rather than hand-computing coordinates inline.
 *
 * Every exported coordinate is a whole stage pixel (never sub-pixel) —
 * `Math.round`/`Math.floor` below is what guarantees that.
 */

export const CARD_W = 28;
export const CARD_H = 40;
export const MINI_W = 14;
export const MINI_H = 20;

/** UI-SPEC "stage-lg": table-to-HUD-edge margin. */
export const STAGE_MARGIN = 16;

export const HAND_MAX_W = 440;
export const HAND_Y = 316;
export const HOVER_LIFT = 6;

export const STUMP = { x: 320, y: 168, rx: 176, ry: 64 };

export interface Point {
  x: number;
  y: number;
}

/** Seat ellipse: larger than STUMP so seats sit clear of the table. Index 0
 * (the viewer) sits at the bottom (theta = 90deg, the ellipse's max-y
 * point); remaining seats spread evenly across the upper arc, left to
 * right (theta 200deg..340deg), matching a clockwise reading of the table
 * from the viewer's own seat. */
const SEAT_ELLIPSE = { cx: 320, cy: 170, rx: 240, ry: 140 };
const VIEWER_ANGLE_DEG = 90;
const UPPER_ARC_START_DEG = 200;
const UPPER_ARC_END_DEG = 340;

function pointOnSeatEllipse(angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round(SEAT_ELLIPSE.cx + SEAT_ELLIPSE.rx * Math.cos(rad)),
    y: Math.round(SEAT_ELLIPSE.cy + SEAT_ELLIPSE.ry * Math.sin(rad)),
  };
}

/** Seat placements for `count` seats. Index 0 is always the viewer, seated
 * just below the stump (the ellipse's bottom point, so it has the largest
 * y of any seat). The remaining `count - 1` seats spread evenly across the
 * upper arc, ordered left to right by x. */
export function seatAnchors(count: number): Point[] {
  if (count <= 0) return [];
  const anchors: Point[] = [pointOnSeatEllipse(VIEWER_ANGLE_DEG)];
  const upperCount = count - 1;
  for (let k = 0; k < upperCount; k++) {
    const angle =
      upperCount === 1
        ? (UPPER_ARC_START_DEG + UPPER_ARC_END_DEG) / 2
        : UPPER_ARC_START_DEG + (k * (UPPER_ARC_END_DEG - UPPER_ARC_START_DEG)) / (upperCount - 1);
    anchors.push(pointOnSeatEllipse(angle));
  }
  return anchors;
}

/** Left-x of each card in a `count`-card hand fan, centred on x=320.
 * Hand order (which identity goes in which slot) is decided by Plan 12-05,
 * not here — this only produces slot positions. */
export function handFanXs(count: number): number[] {
  if (count <= 1) {
    return [Math.round(320 - CARD_W / 2)];
  }
  const step = Math.min(CARD_W + 2, Math.floor((HAND_MAX_W - CARD_W) / (count - 1)));
  const totalSpan = step * (count - 1) + CARD_W;
  const firstX = Math.round(320 - totalSpan / 2);
  const xs: number[] = [];
  for (let i = 0; i < count; i++) {
    xs.push(firstX + step * i);
  }
  return xs;
}

/** Centre positions for up to 5 trick cards, arranged radially inside the
 * stump ellipse's bounds around its centre. */
export function trickSlots(count: number): Point[] {
  if (count <= 0) return [];
  const rx = 60;
  const ry = 28;
  const slots: Point[] = [];
  for (let i = 0; i < count; i++) {
    const angleDeg = (360 / count) * i;
    const rad = (angleDeg * Math.PI) / 180;
    slots.push({
      x: Math.round(STUMP.x + rx * Math.cos(rad)),
      y: Math.round(STUMP.y + ry * Math.sin(rad)),
    });
  }
  return slots;
}

export const HUD: {
  supplies: Point;
  campNumber: Point;
  sign: Point;
  whisper: Point;
  settingsSafeZone: { x: number; y: number; w: number; h: number };
} = {
  supplies: { x: 16, y: 16 },
  campNumber: { x: 296, y: 16 },
  sign: { x: 460, y: 110 },
  whisper: { x: 40, y: 290 },
  // Top-right 56x56 region reserved for the HTML gear settings button.
  settingsSafeZone: { x: 584, y: 0, w: 56, h: 56 },
};

export const INTERACTABLE_ANCHORS: {
  campfire: Point;
  fireflies: Point;
  lantern: Point;
  mascot: Point;
} = {
  campfire: { x: 220, y: 180 },
  fireflies: { x: 60, y: 40 },
  lantern: { x: 520, y: 40 },
  mascot: { x: 580, y: 320 },
};
