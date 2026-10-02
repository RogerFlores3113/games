import type Phaser from "phaser";
import { buildLabelAtlas, type GlyphAtlas } from "../font/glyph-atlas";
import { PALETTE } from "../palette";
import { ART, artFallbackKey, fittedFallbackLabel, resolveArt, type ArtId } from "./art-registry";
import { ART_FILES } from "./art-files.generated";

const FILES: ReadonlySet<string> = new Set(ART_FILES);

let labelAtlas: GlyphAtlas | null = null;

/** Queues every `ART` sprite whose file is on disk. Call from `preload()`. */
export function preloadArt(scene: Phaser.Scene): void {
  for (const id of Object.keys(ART) as ArtId[]) {
    const source = resolveArt(id, FILES);
    if (source.kind !== "file" || scene.textures.exists(source.key)) continue;
    const frames = source.def.frames ?? 1;
    if (frames > 1) {
      scene.load.spritesheet(source.key, source.url, { frameWidth: source.def.w, frameHeight: source.def.h });
    } else {
      scene.load.image(source.key, source.url);
    }
  }
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function ensureFallbackTexture(scene: Phaser.Scene, id: ArtId, key: string): void {
  if (scene.textures.exists(key)) return;
  const def = ART[id];
  const texture = scene.textures.createCanvas(key, def.w, def.h);
  if (!texture) return;
  const ctx = texture.context;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = hex(def.fallback.color);
  ctx.fillRect(0, 0, def.w, def.h);
  const label = fittedFallbackLabel(def);
  if (label !== "") {
    labelAtlas ??= buildLabelAtlas();
    const x = Math.floor((def.w - label.length * labelAtlas.cellW) / 2);
    const y = Math.floor((def.h - labelAtlas.cellH) / 2);
    labelAtlas.drawText(ctx, label, x, y, PALETTE.plate);
  }
  texture.refresh();
}

/** A sprite of `id` centred on (x, y): the loaded PNG (animated when it is a
 * strip), or a labelled placeholder of the same size when the file is
 * absent. The caller adds it to its own layer. */
export function placeArt(scene: Phaser.Scene, id: ArtId, x: number, y: number): Phaser.GameObjects.Sprite {
  const source = resolveArt(id, FILES);
  const loaded = source.kind === "file" && scene.textures.exists(source.key);
  const key = loaded ? source.key : artFallbackKey(id);
  if (!loaded) ensureFallbackTexture(scene, id, key);

  const sprite = scene.add.sprite(Math.round(x), Math.round(y), key);
  const frames = source.def.frames ?? 1;
  if (loaded && frames > 1) {
    const animKey = `${key}:loop`;
    if (!scene.anims.exists(animKey)) {
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: frames - 1 }),
        frameRate: source.def.fps ?? 6,
        repeat: -1,
      });
    }
    sprite.play(animKey);
  }
  return sprite;
}
