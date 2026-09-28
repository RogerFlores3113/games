/**
 * Big Index card pack (default, spec 7.3, D-13): large corner rank drawn
 * with the world-sign font, four-colour suit pips, and large centred Sun /
 * Moon pips for the jokers. Draws with integer `fillRect` calls only —
 * never a raw text-drawing call — so it stays crisp at every integer zoom
 * (SCENE-10). No `phaser` import.
 */

import { PALETTE } from "../palette";
import { CARD_H, CARD_W, MINI_H, MINI_W } from "../layout";
import { rankLabel } from "../../../../lib/expedition/expedition-ids";
import { FULL_PIPS, MINI_PIPS } from "./pips";
import type { CardPackDef, CardSize } from "./card-pack-def";

function dimsFor(size: CardSize): { w: number; h: number } {
  return size === "full" ? { w: CARD_W, h: CARD_H } : { w: MINI_W, h: MINI_H };
}

function drawCardBody(ctx: CanvasRenderingContext2D, w: number, h: number, faceColor: string): void {
  ctx.fillStyle = PALETTE.cardEdge;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = faceColor;
  ctx.fillRect(1, 1, w - 2, h - 2);
}

function drawPip(
  ctx: CanvasRenderingContext2D,
  mask: readonly string[],
  originX: number,
  originY: number,
  color: string,
): void {
  ctx.fillStyle = color;
  for (let row = 0; row < mask.length; row++) {
    const line = mask[row]!;
    for (let col = 0; col < line.length; col++) {
      if (line[col] === "#") {
        ctx.fillRect(originX + col, originY + row, 1, 1);
      }
    }
  }
}

function centredOrigin(w: number, h: number, mask: readonly string[]): { x: number; y: number } {
  return {
    x: Math.round((w - mask[0]!.length) / 2),
    y: Math.round((h - mask.length) / 2),
  };
}

export const bigIndex: CardPackDef = {
  id: "big-index",
  name: "Big Index",

  face(ctx, identity, size, glyphs) {
    const { w, h } = dimsFor(size);
    drawCardBody(ctx, w, h, PALETTE.cardFace);

    if (identity.kind === "joker") {
      const color = identity.joker === "sun" ? PALETTE.sun : PALETTE.moon;
      const mask = size === "full" ? FULL_PIPS[identity.joker] : MINI_PIPS[identity.joker];
      const origin = centredOrigin(w, h, mask);
      drawPip(ctx, mask, origin.x, origin.y, color);
      return;
    }

    const color = PALETTE.suitBigIndex[identity.suit];
    const mask = size === "full" ? FULL_PIPS[identity.suit] : MINI_PIPS[identity.suit];
    const origin = centredOrigin(w, h, mask);
    const pipY = size === "full" ? origin.y + 4 : origin.y;
    drawPip(ctx, mask, origin.x, pipY, color);

    const label = rankLabel(identity.rank);
    if (size === "full") {
      glyphs.drawText(ctx, label, 2, 2, "sign", color);
    } else {
      glyphs.drawText(ctx, label, 1, 1, "label", color);
    }
  },

  back(ctx, size) {
    const { w, h } = dimsFor(size);
    drawCardBody(ctx, w, h, PALETTE.cardBack);
  },
};
