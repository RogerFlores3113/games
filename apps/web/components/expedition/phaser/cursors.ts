/**
 * The glove cursors as CSS cursor values: pointing at what can be clicked,
 * open over a card that can be dragged, closed while dragging, blocked over
 * what can't be played now. Phaser objects take them as their `cursor`;
 * the board's HTML takes them as CSS variables. No `phaser` import.
 */
import { ART, ART_URL_PREFIX, CURSOR_KINDS, type CursorKind } from "./art/art-registry";

/** Where each glove points or grips, in its 32x32 image. */
const HOTSPOT: Readonly<Record<CursorKind, readonly [number, number]>> = {
  default: [4, 2],
  pointer: [4, 4],
  grab: [16, 16],
  grabbing: [14, 16],
  "not-allowed": [6, 2],
};

export const CURSOR: Readonly<Record<CursorKind, string>> = Object.fromEntries(
  CURSOR_KINDS.map((kind) => [kind, `url(${ART_URL_PREFIX}${ART[`cursor-${kind}`].file}) ${HOTSPOT[kind][0]} ${HOTSPOT[kind][1]}, ${kind}`]),
) as Record<CursorKind, string>;

/** An interactive object's config: the pointing glove while `clickable`.
 * Undefined otherwise, since Phaser reads an empty object as a hit area. */
export function pointerIf(clickable: boolean): { cursor: string } | undefined {
  return clickable ? { cursor: CURSOR.pointer } : undefined;
}
