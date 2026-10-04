/**
 * The boss on the table, in the `boss` zone above the campfire: its sprite
 * at half size, breathing; under it a caption with what it is doing; for
 * the Crocodile, an arrow pointing at the seat it watches. The sprite lives
 * in its own layer and is rebuilt only when the boss changes, so the idle
 * bob runs on across redraws.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { ART, modArtId } from "../art/art-registry";
import { placeArt } from "../art/place-art";
import { ZONES, centreOf, type Point } from "../layout";
import type { ObjectIndex } from "../object-index";
import type { SceneModel } from "../../../../lib/expedition/build-scene-model";
import type { BossModel } from "../../../../lib/expedition/boss-model";
import type { CampHandlers } from "./camp-handlers";
import { seatRect } from "./draw-seats";
import { fitLabel } from "./text-fit";
import { labelWidth, platedText, type Layer } from "./ui-kit";

/** The boss art is drawn at 96-160 px; half keeps it inside its zone. */
export const BOSS_SCALE = 0.5;
const CAPTION_H = LABEL_CELL.h + 2;
const BOB_PX = 1;
const BOB_MS = 900;
const ARROW_LEN = 14;
/** What the boss zone's caption line holds; boss-model.ts writes captions to it. */
export const CAPTION_CHARS = Math.floor((ZONES.boss.w - 4) / LABEL_CELL.w);

/** The sprite's bottom-centre: standing on the caption. */
function spriteFoot(): Point {
  const zone = ZONES.boss;
  return { x: zone.x + Math.floor(zone.w / 2), y: zone.y + zone.h - CAPTION_H - 1 - BOB_PX };
}

/** Builds the boss sprite into `layer` (cleared first), bobbing, with its
 * hover showing the boss's rules. */
export function placeBoss(scene: Phaser.Scene, layer: Layer, boss: BossModel | null, index: ObjectIndex, handlers: CampHandlers): void {
  layer.removeAll(true);
  if (boss === null) return;
  const art = modArtId({ id: boss.id, kind: "animal" });
  if (art === null) return;
  const foot = spriteFoot();
  const h = Math.round(ART[art].h * BOSS_SCALE);
  const sprite = placeArt(scene, art, foot.x, foot.y - Math.floor(h / 2)).setScale(BOSS_SCALE);
  sprite.setInteractive();
  sprite.on("pointerover", () => handlers.onModHover(boss.id));
  sprite.on("pointerout", () => handlers.onModHover(null));
  scene.tweens.add({ targets: sprite, y: sprite.y + BOB_PX, duration: BOB_MS, ease: "Sine.InOut", yoyo: true, repeat: -1 });
  layer.add(sprite);
  index.register("camp", boss.objectId, sprite);
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

/** The caption under the sprite, and the gaze arrow toward the watched seat. */
export function drawBossCaption(scene: Phaser.Scene, layer: Layer, model: SceneModel): void {
  const boss = model.boss;
  if (boss === null) return;
  const zone = ZONES.boss;
  const caption = fitLabel(boss.caption, CAPTION_CHARS);
  const x = zone.x + Math.floor((zone.w - labelWidth(caption)) / 2);
  layer.add(platedText(scene, x, zone.y + zone.h - CAPTION_H + 1, caption, boss.alert ? PALETTE.destructive : PALETTE.sun));
  if (boss.facingSeatId === null) return;
  const seat = seatRect(model, boss.facingSeatId);
  if (seat === null) return;
  const from = { x: zone.x + zone.w - ARROW_LEN - 2, y: zone.y + ARROW_LEN + 1 };
  layer.add(gazeArrow(scene, from, centreOf(seat)));
}
