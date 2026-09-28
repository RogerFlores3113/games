/**
 * Classic card pack (traditional two-colour, spec 7.3, D-13): small corner
 * rank drawn with the world-label font and two-colour suit pips (black for
 * spades/clubs, red for hearts/diamonds). Draws with integer `fillRect`
 * calls only — never a raw text-drawing call. No `phaser` import.
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

function isBlackSuit(suit: "spades" | "hearts" | "diamonds" | "clubs"): boolean {
  return suit === "spades" || suit === "clubs";
}

export const classic: CardPackDef = {
  id: "classic",
  name: "Classic",

  face(ctx, identity, size, glyphs) {
    const { w, h } = dimsFor(size);
    drawCardBody(ctx, w, h, PALETTE.cardFace);

    if (identity.kind === "joker") {
      const color = identity.joker === "sun" ? PALETTE.sun : PALETTE.moon;
      const mask = size === "full" ? FULL_PIPS[identity.joker] : MINI_PIPS[identity.joker];
      const originX = Math.round((w - mask[0]!.length) / 2);
      const originY = Math.round((h - mask.length) / 2);
      drawPip(ctx, mask, originX, originY, color);
      return;
    }

    const color = isBlackSuit(identity.suit) ? PALETTE.suitClassic.black : PALETTE.suitClassic.red;
    const label = rankLabel(identity.rank);
    glyphs.drawText(ctx, label, 2, 2, "label", color);

    const mask = size === "full" ? FULL_PIPS[identity.suit] : MINI_PIPS[identity.suit];
    const pipY = size === "full" ? 12 : 8;
    drawPip(ctx, mask, 2, pipY, color);
  },

  back(ctx, size) {
    const { w, h } = dimsFor(size);
    drawCardBody(ctx, w, h, PALETTE.cardBack);
  },
};
