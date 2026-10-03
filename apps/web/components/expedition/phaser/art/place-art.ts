import type Phaser from "phaser";
import { buildLabelAtlas, type GlyphAtlas } from "../font/glyph-atlas";
import { PALETTE } from "../palette";
import { ART, artFallbackKey, fittedFallbackLabel, resolveArt, type ArtId } from "./art-registry";
import { ART_FILES } from "./art-files.generated";
import { keyOutBorderColour } from "./matte";

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

/** A copy of `key`'s image with its flat backdrop keyed out (`ArtDef.matte`). */
function ensureMatted(scene: Phaser.Scene, key: string): string {
  const matted = `${key}:matte`;
  if (scene.textures.exists(matted)) return matted;
  const image = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const texture = scene.textures.createCanvas(matted, image.width, image.height);
  if (!texture) return key;
  texture.context.drawImage(image, 0, 0);
  const pixels = texture.context.getImageData(0, 0, image.width, image.height);
  keyOutBorderColour(pixels.data, image.width, image.height);
  texture.context.putImageData(pixels, 0, 0);
  texture.refresh();
  return matted;
}

/** The animation that plays `id`'s strip, repeating `repeat` more times (-1
 * loops), or null when the strip is not loaded. */
function artAnimation(scene: Phaser.Scene, id: ArtId, repeat: number): string | null {
  const source = resolveArt(id, FILES);
  const frames = source.def.frames ?? 1;
  if (source.kind !== "file" || frames < 2 || !scene.textures.exists(source.key)) return null;
  const animKey = `${source.key}:${repeat < 0 ? "loop" : `x${repeat + 1}`}`;
  if (!scene.anims.exists(animKey)) {
    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(source.key, { start: 0, end: frames - 1 }),
      frameRate: source.def.fps ?? 6,
      repeat,
    });
  }
  return animKey;
}

/** A sprite of `id` centred on (x, y): the loaded PNG (looping when it is a
 * strip), or a labelled placeholder of the same size when the file is
 * absent. The caller adds it to its own layer. */
export function placeArt(scene: Phaser.Scene, id: ArtId, x: number, y: number): Phaser.GameObjects.Sprite {
  const source = resolveArt(id, FILES);
  const loaded = source.kind === "file" && scene.textures.exists(source.key);
  let key = loaded ? source.key : artFallbackKey(id);
  if (!loaded) ensureFallbackTexture(scene, id, key);
  else if (source.def.matte) key = ensureMatted(scene, key);

  const sprite = scene.add.sprite(Math.round(x), Math.round(y), key);
  const loop = artAnimation(scene, id, -1);
  if (loop !== null) sprite.play(loop);
  return sprite;
}
