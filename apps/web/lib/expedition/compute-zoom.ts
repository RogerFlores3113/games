/**
 * D-09/D-10/D-11: the stage is a fixed 640x360 16:9 canvas, scaled by a
 * WHOLE NUMBER only — never fractionally. This is the single source of
 * that arithmetic; `apps/web/components/expedition/phaser/**` reads
 * `computeZoom`/`isBelowComfortSize` rather than re-deriving the formula.
 *
 * D-11: below 1280x720 the stage still renders, clamped to 1x — it is
 * never blocked. The clamp-to-1 below (`computeZoom`'s final return) is
 * exactly that.
 */

export const STAGE_WIDTH = 640;
export const STAGE_HEIGHT = 360;

/** Comfort threshold below which the stage renders at 1x (D-11). */
const COMFORT_WIDTH = 1280;
const COMFORT_HEIGHT = 720;

/** Whole-number zoom for a given viewport: 2x at 1280x720, 3x at 1080p,
 * 4x at 1440p, clamped to a minimum of 1x (D-09/D-10/D-11). Never returns
 * a fractional or zero/negative value. */
export function computeZoom(viewportWidth: number, viewportHeight: number): number {
  const zoom = Math.min(Math.floor(viewportWidth / STAGE_WIDTH), Math.floor(viewportHeight / STAGE_HEIGHT));
  return Math.max(1, zoom);
}

/** True when the viewport is below the 1280x720 comfort threshold, meaning
 * the stage renders at 1x and the "enlarge your window" hint should show
 * (D-11). Never blocks play either way. */
export function isBelowComfortSize(viewportWidth: number, viewportHeight: number): boolean {
  return viewportWidth < COMFORT_WIDTH || viewportHeight < COMFORT_HEIGHT;
}
