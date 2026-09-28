/**
 * The card-pack contract (SCENE-08, spec 7.3). Every registered pack draws
 * a full-size and a mini-size face/back onto an injected 2D context with
 * integer coordinates only — never a raw text-drawing call — so packs stay
 * unit-testable in Node with a recording mock context and stay crisp at
 * every integer zoom (SCENE-10). No `phaser` import.
 */

import type { ExpeditionCardIdentityView } from "@games/rules";
import type { CardPackId } from "../../../../lib/expedition/card-pack-ids";
import type { GlyphBlitter } from "../font/glyph-atlas";

export type CardSize = "full" | "mini";

export interface CardPackDef {
  id: CardPackId;
  name: string;
  face(ctx: CanvasRenderingContext2D, identity: ExpeditionCardIdentityView, size: CardSize, glyphs: GlyphBlitter): void;
  back(ctx: CanvasRenderingContext2D, size: CardSize): void;
}

export function cardTextureKey(packId: CardPackId, label: string, size: CardSize): string {
  return `card:${packId}:${label}:${size}`;
}

export function cardBackTextureKey(packId: CardPackId, size: CardSize): string {
  return `card-back:${packId}:${size}`;
}

const STANDARD_SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
const STANDARD_RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

/** 52 standard identities plus the Sun and Moon jokers (54 total), in a
 * fixed, deterministic order. */
export function allCardIdentities(): ExpeditionCardIdentityView[] {
  const identities: ExpeditionCardIdentityView[] = [];
  for (const suit of STANDARD_SUITS) {
    for (const rank of STANDARD_RANKS) {
      identities.push({ kind: "standard", suit, rank });
    }
  }
  identities.push({ kind: "joker", joker: "sun" });
  identities.push({ kind: "joker", joker: "moon" });
  return identities;
}
