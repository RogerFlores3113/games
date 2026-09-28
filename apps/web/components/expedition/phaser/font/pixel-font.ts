/**
 * Registers the two D-12 world bitmap fonts (`WORLD_LABEL_FONT` /
 * `WORLD_SIGN_FONT`) with Phaser and returns a `GlyphBlitter` for card-face
 * drawing. Idempotent per `scene.game` (T-12-13: re-renders never
 * regenerate the atlases or re-register the fonts).
 *
 * Installed Phaser version (3.90.0) API used here (confirmed against
 * node_modules/phaser/types/phaser.d.ts before writing this file):
 *   - `Phaser.GameObjects.RetroFont.Parse(scene, config)` returns a
 *     `BitmapFontData` from an already-loaded/added image texture key.
 *   - `scene.textures.addCanvas(key, canvas)` registers a canvas element as
 *     a texture under `key` (this is how the atlas canvas becomes the
 *     "image" RetroFont.Parse reads from — RetroFont.Parse itself takes a
 *     texture key, never a raw canvas).
 *   - `scene.cache.bitmapFont.add(key, data)` (`Phaser.Cache.BaseCache`)
 *     registers the parsed font data so `scene.add.bitmapText(x, y, key,
 *     text)` can use it.
 */

import Phaser from "phaser";
import { buildLabelAtlas, buildSignAtlas } from "./glyph-atlas";
import type { GlyphAtlas, GlyphBlitter } from "./glyph-atlas";
import { LABEL_CELL, SIGN_CELL, WORLD_LABEL_FONT, WORLD_SIGN_FONT } from "./font-keys";

const BLITTER_CACHE = new WeakMap<Phaser.Game, GlyphBlitter>();

function registerAtlasFont(scene: Phaser.Scene, fontKey: string, atlas: GlyphAtlas, cellW: number, cellH: number): void {
  const textureKey = `${fontKey}-atlas`;
  if (!scene.textures.exists(textureKey)) {
    scene.textures.addCanvas(textureKey, atlas.canvas);
  }
  if (!scene.cache.bitmapFont.has(fontKey)) {
    const parsed = Phaser.GameObjects.RetroFont.Parse(scene, {
      image: textureKey,
      width: cellW,
      height: cellH,
      chars: atlas.chars,
      charsPerRow: atlas.chars.length,
      "offset.x": 0,
      "offset.y": 0,
      "spacing.x": 0,
      "spacing.y": 0,
      lineSpacing: 0,
    });
    scene.cache.bitmapFont.add(fontKey, parsed);
  }
}

function makeGlyphBlitter(labelAtlas: GlyphAtlas, signAtlas: GlyphAtlas): GlyphBlitter {
  return {
    drawText(ctx, text, x, y, font, color) {
      const atlas = font === "label" ? labelAtlas : signAtlas;
      atlas.drawText(ctx, text, x, y, color);
    },
  };
}

/** Idempotent per `scene.game`: builds both atlases once, registers
 * `WORLD_LABEL_FONT` / `WORLD_SIGN_FONT`, and returns a cached
 * `GlyphBlitter`. Safe to call from every scene's `create()`. */
export function ensurePixelFonts(scene: Phaser.Scene): GlyphBlitter {
  const cached = BLITTER_CACHE.get(scene.game);
  if (cached) return cached;

  const labelAtlas = buildLabelAtlas();
  const signAtlas = buildSignAtlas();
  registerAtlasFont(scene, WORLD_LABEL_FONT, labelAtlas, LABEL_CELL.w, LABEL_CELL.h);
  registerAtlasFont(scene, WORLD_SIGN_FONT, signAtlas, SIGN_CELL.w, SIGN_CELL.h);

  const blitter = makeGlyphBlitter(labelAtlas, signAtlas);
  BLITTER_CACHE.set(scene.game, blitter);
  return blitter;
}
