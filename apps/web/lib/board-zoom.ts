import { VIEWPORT_TEST_HEIGHT_PX, VIEWPORT_TEST_WIDTH_PX } from "./layout-budget";

/**
 * UAT gap 11 (second owner review): "1280x720 should be the MINIMUM
 * supported size, not the design target — the board must scale with the
 * viewport so a 1080p or 1440p window gets proportionally larger tiles,
 * while 720p still fits without scrolling." Capped so an ultrawide/very-tall
 * window doesn't blow tiles up unreasonably — 1.8x roughly matches the
 * "1.5-1.8x at 1440p" range named in the gap.
 */
export const BOARD_ZOOM_MAX = 1.8;

/**
 * Every fixed pixel constant in layout-budget.ts was tuned to the
 * VIEWPORT_TEST_WIDTH_PX x VIEWPORT_TEST_HEIGHT_PX (1280x720) floor. Rather
 * than re-deriving each constant per viewport, the whole board+hands region
 * is rendered at native size and then scaled uniformly via CSS `zoom` (NOT
 * `transform: scale`, which would decouple pointer-event coordinates and
 * `getBoundingClientRect()` from the visually rendered box — `zoom` keeps
 * both in sync natively, the same as a browser page-zoom, so the existing
 * pointer-based drag code in useHandDrag/useDiscardDrag needs no changes).
 *
 * The factor is the SMALLER of the height and width ratios against the
 * 1280x720 floor, so neither axis ever overflows its viewport: exactly 1 at
 * (or below) the floor — byte-identical to the pre-gap-11 fixed layout — and
 * growing toward BOARD_ZOOM_MAX as the window grows past it (e.g. 1.5 at a
 * 1920x1080 window, matching both axes' 1.5x ratio against 1280x720).
 */
export function computeBoardZoom(viewportWidthPx: number, viewportHeightPx: number): number {
  const heightRatio = viewportHeightPx / VIEWPORT_TEST_HEIGHT_PX;
  const widthRatio = viewportWidthPx / VIEWPORT_TEST_WIDTH_PX;
  const scale = Math.min(heightRatio, widthRatio);
  return Math.min(BOARD_ZOOM_MAX, Math.max(1, scale));
}
