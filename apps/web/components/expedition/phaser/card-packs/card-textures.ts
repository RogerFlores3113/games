/**
 * Generates per-pack card textures (full + mini face for every identity,
 * plus full + mini backs) as Phaser canvas textures. Idempotent: skips any
 * texture key that already exists (T-12-13), so re-renders never regenerate
 * the 216 (54 identities x 2 sizes + 2 sizes of back, x N packs) textures.
 * `import type Phaser` only — every Phaser API used here is reached through
 * the injected `scene`, so no Phaser value is imported.
 */

import type Phaser from "phaser";
import { CARD_PACK_REGISTRY } from "./registry";
import { allCardIdentities, cardBackTextureKey, cardTextureKey } from "./card-pack-def";
import type { CardSize } from "./card-pack-def";
import type { CardPackId } from "../../../../lib/expedition/card-pack-ids";
import { cardLabel } from "../../../../lib/expedition/expedition-ids";
import type { GlyphBlitter } from "../font/glyph-atlas";
import { CARD_H, CARD_W, MINI_H, MINI_W } from "../layout";

const SIZES: readonly CardSize[] = ["full", "mini"];

function dimsFor(size: CardSize): { w: number; h: number } {
  return size === "full" ? { w: CARD_W, h: CARD_H } : { w: MINI_W, h: MINI_H };
}

/** Idempotent: creates a canvas texture per identity x size for `packId`'s
 * faces, plus its full/mini backs, skipping any key that already exists. */
export function ensureCardTextures(scene: Phaser.Scene, packId: CardPackId, glyphs: GlyphBlitter): void {
  const def = CARD_PACK_REGISTRY[packId];

  for (const identity of allCardIdentities()) {
    const label = cardLabel(identity);
    for (const size of SIZES) {
      const key = cardTextureKey(packId, label, size);
      if (scene.textures.exists(key)) continue;
      const { w, h } = dimsFor(size);
      const texture = scene.textures.createCanvas(key, w, h);
      if (!texture) continue;
      texture.context.imageSmoothingEnabled = false;
      def.face(texture.context, identity, size, glyphs);
      texture.refresh();
    }
  }

  for (const size of SIZES) {
    const key = cardBackTextureKey(packId, size);
    if (scene.textures.exists(key)) continue;
    const { w, h } = dimsFor(size);
    const texture = scene.textures.createCanvas(key, w, h);
    if (!texture) continue;
    texture.context.imageSmoothingEnabled = false;
    def.back(texture.context, size);
    texture.refresh();
  }
}
