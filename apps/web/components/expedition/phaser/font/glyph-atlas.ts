/**
 * Builds two runtime canvas atlases from `GLYPHS_5X7` (D-12: `world-label`
 * at `LABEL_CELL` and `world-sign` at `SIGN_CELL`). Browser-only (uses
 * `document.createElement("canvas")`) — no `phaser` import, so
 * `pixel-font.ts` (Plan 12-06 Task 3) is the only consumer that turns these
 * into registered Phaser bitmap fonts. Not exercised by Vitest (no DOM
 * canvas 2D context in this project's Node test environment) — covered by
 * e2e once a real scene renders text.
 */

import { GLYPHS_5X7 } from "./glyphs-5x7";
import { LABEL_CELL, SIGN_CELL } from "./font-keys";

export interface GlyphAtlas {
  canvas: HTMLCanvasElement;
  cellW: number;
  cellH: number;
  chars: string;
  drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void;
}

/** Implemented by `pixel-font.ts`'s `ensurePixelFonts` return value; card
 * packs draw rank/name text through this rather than a raw `GlyphAtlas`, so
 * they never choose an atlas directly. */
export interface GlyphBlitter {
  drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: "label" | "sign", color: string): void;
}

/** Every known glyph key, in a fixed order (object key insertion order,
 * since `GLYPHS_5X7`'s keys were authored in ascending char-code order plus
 * a trailing "…") — this is the atlas's left-to-right cell layout. */
const ATLAS_CHARS: readonly string[] = Object.keys(GLYPHS_5X7);

function glyphFor(ch: string): readonly string[] {
  return GLYPHS_5X7[ch] ?? GLYPHS_5X7["?"]!;
}

/** Draws every glyph's raw "#" pixels, opaque white, into `canvas`'s 2D
 * context — one `cellW x cellH` cell per char in `ATLAS_CHARS` order,
 * pixels centred within the cell. */
function paintGlyphCells(ctx: CanvasRenderingContext2D, cellW: number, cellH: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ATLAS_CHARS.forEach((ch, index) => {
    const glyph = glyphFor(ch);
    const glyphW = glyph[0]!.length;
    const glyphH = glyph.length;
    const originX = index * cellW + Math.floor((cellW - glyphW) / 2);
    const originY = Math.floor((cellH - glyphH) / 2);
    for (let row = 0; row < glyphH; row++) {
      const line = glyph[row]!;
      for (let col = 0; col < glyphW; col++) {
        if (line[col] === "#") {
          ctx.fillRect(originX + col, originY + row, 1, 1);
        }
      }
    }
  });
}

/** Blits `text` from `atlasCanvas`'s cell strip onto `ctx` at integer
 * `(x, y)`, tinting each cell to `color` via a scratch canvas and
 * `source-in` compositing (so the atlas itself stays a single reusable
 * white-on-transparent texture, never re-painted per colour). */
function blit(
  atlasCanvas: HTMLCanvasElement,
  cellW: number,
  cellH: number,
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.imageSmoothingEnabled = false;
  let cursorX = Math.round(x);
  const roundedY = Math.round(y);
  for (const ch of text) {
    const known = ch in GLYPHS_5X7 ? ch : "?";
    const index = ATLAS_CHARS.indexOf(known);
    const safeIndex = index === -1 ? ATLAS_CHARS.indexOf("?") : index;

    const scratch = document.createElement("canvas");
    scratch.width = cellW;
    scratch.height = cellH;
    const scratchCtx = scratch.getContext("2d");
    if (scratchCtx) {
      scratchCtx.imageSmoothingEnabled = false;
      scratchCtx.drawImage(atlasCanvas, safeIndex * cellW, 0, cellW, cellH, 0, 0, cellW, cellH);
      scratchCtx.globalCompositeOperation = "source-in";
      scratchCtx.fillStyle = color;
      scratchCtx.fillRect(0, 0, cellW, cellH);
      ctx.drawImage(scratch, cursorX, roundedY);
    }
    cursorX += cellW;
  }
}

function buildAtlas(cellW: number, cellH: number, paint: (ctx: CanvasRenderingContext2D) => void): GlyphAtlas {
  const canvas = document.createElement("canvas");
  canvas.width = cellW * ATLAS_CHARS.length;
  canvas.height = cellH;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    paint(ctx);
  }
  const chars = ATLAS_CHARS.join("");
  return {
    canvas,
    cellW,
    cellH,
    chars,
    drawText: (drawCtx, text, x, y, color) => blit(canvas, cellW, cellH, drawCtx, text, x, y, color),
  };
}

/** `world-label` atlas: raw `GLYPHS_5X7` pixels at `LABEL_CELL` size. */
export function buildLabelAtlas(): GlyphAtlas {
  return buildAtlas(LABEL_CELL.w, LABEL_CELL.h, (ctx) => paintGlyphCells(ctx, LABEL_CELL.w, LABEL_CELL.h));
}

/** `world-sign` atlas: rasterizes each char with a bold monospace browser
 * font, then thresholds every pixel's alpha to fully opaque or fully
 * transparent (no antialiasing survives) — a coarser, larger placeholder
 * glyph than `GLYPHS_5X7`'s hand-authored 5x7 shapes, reserved for the
 * bigger `world-sign` size. */
export function buildSignAtlas(): GlyphAtlas {
  return buildAtlas(SIGN_CELL.w, SIGN_CELL.h, (ctx) => {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px monospace";
    ctx.textBaseline = "top";
    ATLAS_CHARS.forEach((ch, index) => {
      ctx.fillText(ch, index * SIGN_CELL.w, 0);
    });
    const width = SIGN_CELL.w * ATLAS_CHARS.length;
    const imageData = ctx.getImageData(0, 0, width, SIGN_CELL.h);
    const data = imageData.data;
    for (let p = 0; p < data.length; p += 4) {
      const opaque = data[p + 3]! >= 128;
      data[p] = 255;
      data[p + 1] = 255;
      data[p + 2] = 255;
      data[p + 3] = opaque ? 255 : 0;
    }
    ctx.putImageData(imageData, 0, 0);
  });
}
