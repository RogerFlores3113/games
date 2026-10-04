/**
 * The boss on the table, in the `world` column above your kit where the
 * campfire stands in a plain camp: its sprite scaled to fill the column,
 * breathing; under it a caption with what it is doing; for the Crocodile,
 * an arrow pointing at the seat it watches. At the temple the column holds
 * the helpers instead, one row each at half a boss's size, captioned with
 * their name and what they are doing. The sprites live in their own layer
 * and are rebuilt only when the bosses change, so the idle bob runs on
 * across redraws.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { ART, modArtId, type ArtId } from "../art/art-registry";
import { placeArt } from "../art/place-art";
import { HELPER_CAPTION_LINE_H, ZONES, centreOf, helperRows, type Point, type Rect } from "../layout";
import type { ObjectIndex } from "../object-index";
import type { SceneModel } from "../../../../lib/expedition/build-scene-model";
import type { BossModel } from "../../../../lib/expedition/boss-model";
import type { CampHandlers } from "./camp-handlers";
import { seatRect } from "./draw-seats";
import { fitLabel } from "./text-fit";
import { labelWidth, platedText, type Layer } from "./ui-kit";

const CAPTION_H = LABEL_CELL.h + 2;
const BOB_PX = 1;
const BOB_MS = 900;
const ARROW_LEN = 14;
/** What the caption line holds; boss-model.ts writes captions to it. */
export const CAPTION_CHARS = Math.floor((ZONES.world.w - 4) / LABEL_CELL.w);

/** Where the sprite stands: the column above the caption, less the bob. */
export function bossStage(zone: Rect = ZONES.world): Rect {
  return { x: zone.x + 1, y: zone.y + BOB_PX, w: zone.w - 2, h: zone.h - CAPTION_H - 2 - 2 * BOB_PX };
}

/** The scale that fits a `w` x `h` sprite in the stage, never above 1. */
export function bossScale(w: number, h: number, stage: Rect = bossStage()): number {
  return Math.min(1, stage.w / w, stage.h / h);
}

/** A helper stands at half the scale its boss gets alone, or smaller
 * when its row is too short for that. */
export function helperScale(w: number, h: number, room: Rect): number {
  return Math.min(bossScale(w, h) / 2, room.w / w, room.h / h);
}

/** The boss's art and the height it stands at in `stage`. */
function bossArt(bossId: string, stage: Rect, helper: boolean): { art: ArtId; scale: number; h: number } | null {
  const art = modArtId({ id: bossId, kind: "animal" });
  if (art === null) return null;
  const scale = helper ? helperScale(ART[art].w, ART[art].h, stage) : bossScale(ART[art].w, ART[art].h, stage);
  return { art, scale, h: Math.round(ART[art].h * scale) };
}

/** One bobbing sprite standing at the foot of `stage`, its hover showing
 * the boss's rules. */
function placeSprite(scene: Phaser.Scene, layer: Layer, boss: BossModel, stage: Rect, helper: boolean, index: ObjectIndex, handlers: CampHandlers): void {
  const fit = bossArt(boss.id, stage, helper);
  if (fit === null) return;
  const sprite = placeArt(scene, fit.art, stage.x + Math.floor(stage.w / 2), stage.y + stage.h - Math.ceil(fit.h / 2)).setScale(fit.scale);
  sprite.setInteractive();
  sprite.on("pointerover", () => handlers.onModHover(boss.id));
  sprite.on("pointerout", () => handlers.onModHover(null));
  scene.tweens.add({ targets: sprite, y: sprite.y + BOB_PX, duration: BOB_MS, ease: "Sine.InOut", yoyo: true, repeat: -1 });
  layer.add(sprite);
  index.register("camp", boss.objectId, sprite);
}

/** What stands in the world column, as a key that changes only when the
 * bosses there do: null for the campfire. */
export function worldKey(model: SceneModel): string | null {
  if (model.boss !== null) return model.boss.id;
  return model.helpers.length === 0 ? null : model.helpers.map((h) => h.id).join("+");
}

/** Builds the boss, or the temple's helpers, into `layer` (cleared first). */
export function placeBosses(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  layer.removeAll(true);
  if (model.boss !== null) {
    placeSprite(scene, layer, model.boss, bossStage(), false, index, handlers);
    return;
  }
  const rows = helperRows(model.helpers.length);
  model.helpers.forEach((helper, i) => placeSprite(scene, layer, helper, rows[i]!.sprite, true, index, handlers));
}

/** Each helper's caption under its sprite: its name, then what it does. */
function drawHelperCaptions(scene: Phaser.Scene, layer: Layer, model: SceneModel): void {
  const rows = helperRows(model.helpers.length);
  model.helpers.forEach((helper, i) => {
    const box = rows[i]!.caption;
    const lines = [
      { value: fitLabel(helper.name, CAPTION_CHARS), color: PALETTE.textDim },
      { value: fitLabel(helper.caption, CAPTION_CHARS), color: helper.alert ? PALETTE.destructive : PALETTE.sun },
    ];
    lines.forEach((line, j) => {
      const x = box.x + Math.floor((box.w - labelWidth(line.value)) / 2);
      layer.add(platedText(scene, x, box.y + j * HELPER_CAPTION_LINE_H + 1, line.value, line.color));
    });
  });
}

/** An arrow from (x, y) pointing at `to`. */
function gazeArrow(scene: Phaser.Scene, from: Point, to: Point): Phaser.GameObjects.Graphics {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const tip = { x: from.x + Math.cos(angle) * ARROW_LEN, y: from.y + Math.sin(angle) * ARROW_LEN };
  const g = scene.add.graphics();
  g.lineStyle(2, toPhaserColor(PALETTE.destructive), 1);
  g.lineBetween(from.x, from.y, tip.x, tip.y);
  g.fillStyle(toPhaserColor(PALETTE.destructive), 1);
  const back = (side: number) => ({ x: tip.x - Math.cos(angle + side) * 6, y: tip.y - Math.sin(angle + side) * 6 });
  const a = back(0.6);
  const b = back(-0.6);
  g.fillTriangle(tip.x, tip.y, a.x, a.y, b.x, b.y);
  return g;
}

/** The caption under the sprite, and the gaze arrow toward the watched seat;
 * at the temple, the helpers' captions. */
export function drawBossCaption(scene: Phaser.Scene, layer: Layer, model: SceneModel): void {
  const boss = model.boss;
  if (boss === null) {
    drawHelperCaptions(scene, layer, model);
    return;
  }
  const zone = ZONES.world;
  const caption = fitLabel(boss.caption, CAPTION_CHARS);
  const x = zone.x + Math.floor((zone.w - labelWidth(caption)) / 2);
  layer.add(platedText(scene, x, zone.y + zone.h - CAPTION_H + 1, caption, boss.alert ? PALETTE.destructive : PALETTE.sun));
  if (boss.facingSeatId === null) return;
  const seat = seatRect(model, boss.facingSeatId);
  if (seat === null) return;
  const stage = bossStage();
  const from = { x: zone.x + zone.w - ARROW_LEN - 2, y: stage.y + stage.h - Math.floor((bossArt(boss.id, stage, false)?.h ?? 0) / 2) };
  layer.add(gazeArrow(scene, from, centreOf(seat)));
}
