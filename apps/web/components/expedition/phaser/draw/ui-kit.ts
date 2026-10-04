/**
 * Small drawing primitives shared by the camp draw modules. Every object is
 * placed on whole stage pixels; text never sits on a control unless it is
 * that control's own label, fully inside it.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL, SIGN_CELL, WORLD_LABEL_FONT, WORLD_SIGN_FONT } from "../font/font-keys";
import { MINI_H, MINI_W } from "../layout";
import { cardTextureKey } from "../card-packs/card-pack-def";
import type { CardPackId } from "../../../../lib/expedition/card-pack-ids";
import type { ObjectiveChip } from "../../../../lib/expedition/build-scene-model";
import { placeArt } from "../art/place-art";
import { ART, sourceArtId, type ArtId } from "../art/art-registry";
import { fitLabel } from "./text-fit";

export type Layer = Phaser.GameObjects.Container;

export const DIM_ALPHA = 0.45;
/** Opacity of the dark plates that keep text readable over the art. */
export const PANEL_ALPHA = 0.82;

/** Label-font text with its top-left at (x, y). */
export function text(scene: Phaser.Scene, x: number, y: number, value: string, color: string = PALETTE.text): Phaser.GameObjects.BitmapText {
  return scene.add.bitmapText(Math.round(x), Math.round(y), WORLD_LABEL_FONT, value).setTint(toPhaserColor(color));
}

export function labelWidth(value: string): number {
  return Array.from(value).length * LABEL_CELL.w;
}

export function plate(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: string = PALETTE.plate): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(Math.round(x), Math.round(y), w, h, toPhaserColor(color)).setOrigin(0, 0);
}

/** Label-font text at (x, y) on a snug dark plate, for text drawn straight
 * over art. Add both to a layer: `layer.add(platedText(...))`. */
export function platedText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  color: string = PALETTE.text,
): [Phaser.GameObjects.Rectangle, Phaser.GameObjects.BitmapText] {
  const backing = plate(scene, x - 2, y - 1, labelWidth(value) + 3, LABEL_CELL.h + 1).setAlpha(PANEL_ALPHA);
  return [backing, text(scene, x, y, value, color)];
}

/** Below this many characters a gear name is dropped and its icon shown alone. */
const GEAR_NAME_MIN_CHARS = 4;

/** A gear's icon followed by its name, centred on (cx, cy) and no wider
 * than `maxW`: the name is shortened to fit, or dropped when too short. */
export function gearLabel(scene: Phaser.Scene, cx: number, cy: number, maxW: number, gearId: string, name: string): Phaser.GameObjects.GameObject[] {
  const art = sourceArtId(gearId);
  const iconW = art === null ? 0 : ART[art].w + 1;
  const room = Math.floor((maxW - iconW) / LABEL_CELL.w);
  const shown = room >= GEAR_NAME_MIN_CHARS ? fitLabel(name, room) : "";
  const left = cx - Math.floor((iconW + labelWidth(shown)) / 2);
  const parts: Phaser.GameObjects.GameObject[] = [];
  if (art !== null) parts.push(placeArt(scene, art, left + ART[art].w / 2, cy));
  if (shown !== "") parts.push(text(scene, left + iconW, cy - LABEL_CELL.h / 2, shown));
  return parts;
}

/** A labelled button centred on (cx, cy), with an optional 16px icon left
 * of the label. Interactive only when `onClick` is given; a disabled button
 * is drawn as a dark plate with a dim label unless `dim: false`. `big` sets
 * the label in the sign font. Returns the container. */
export function button(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  w: number,
  h: number,
  label: string,
  opts: { onClick?: () => void; outline?: boolean; color?: string; big?: boolean; dim?: boolean; icon?: ArtId } = {},
): Phaser.GameObjects.Container {
  const container = scene.add.container(Math.round(cx), Math.round(cy));
  const disabled = opts.onClick === undefined && opts.dim !== false;
  const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(disabled ? PALETTE.plate : (opts.color ?? PALETTE.stump)));
  if (opts.outline) bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  else if (disabled) bg.setStrokeStyle(1, toPhaserColor(PALETTE.plateEdge));
  container.add(bg);
  const cell = opts.big ? SIGN_CELL : LABEL_CELL;
  const iconW = opts.icon === undefined ? 0 : ART[opts.icon].w + 2;
  const shown = fitLabel(label, Math.floor((w - 2 - iconW) / cell.w));
  const shownW = Array.from(shown).length * cell.w;
  const left = -Math.floor((shownW + iconW) / 2);
  if (opts.icon !== undefined) {
    const icon = placeArt(scene, opts.icon, left + ART[opts.icon].w / 2, 0);
    container.add(disabled ? icon.setAlpha(DIM_ALPHA) : icon);
  }
  const t = scene.add
    .bitmapText(left + iconW, -Math.floor(cell.h / 2), opts.big ? WORLD_SIGN_FONT : WORLD_LABEL_FONT, shown)
    .setTint(toPhaserColor(disabled ? PALETTE.textDim : PALETTE.text));
  container.add(t);
  container.setSize(w, h);
  if (opts.onClick) {
    container.setInteractive({ useHandCursor: true });
    container.on("pointerdown", opts.onClick);
  }
  return container;
}

/** A brass coin of radius `r` centred on (cx, cy), with a one-letter face.
 * The container scales on x to spin; `setCoinFace` turns it over. */
export function coin(scene: Phaser.Scene, cx: number, cy: number, r: number, face = ""): Phaser.GameObjects.Container {
  const container = scene.add.container(Math.round(cx), Math.round(cy));
  const g = scene.add.graphics();
  g.fillStyle(toPhaserColor(PALETTE.coinEdge), 1);
  g.fillCircle(0, 0, r);
  g.fillStyle(toPhaserColor(PALETTE.coin), 1);
  g.fillCircle(0, 0, r - 1);
  g.fillStyle(toPhaserColor(PALETTE.coinShine), 1);
  g.fillRect(-r + 2, -r + 2, 2, 2);
  container.add(g);
  container.add(scene.add.bitmapText(-Math.floor(LABEL_CELL.w / 2) + 1, -Math.floor(LABEL_CELL.h / 2), WORLD_LABEL_FONT, "").setTint(toPhaserColor(PALETTE.coinEdge)));
  setCoinFace(container, face);
  return container;
}

/** Shows the first letter of `face` on a coin from `coin`. */
export function setCoinFace(coinContainer: Phaser.GameObjects.Container, face: string): void {
  (coinContainer.list[1] as Phaser.GameObjects.BitmapText).setText(Array.from(face)[0] ?? "");
}

const STATUS_GLYPH: Readonly<Record<ObjectiveChip["status"], { glyph: string; color: string } | null>> = {
  pending: null,
  done: { glyph: "✓", color: PALETTE.done },
  failed: { glyph: "x", color: PALETTE.destructive },
};

function orderText(chip: ObjectiveChip): string | null {
  if (chip.orderBadge === null) return null;
  return chip.orderBadge === "L" ? "L" : chip.orderBadge;
}

/** Width of one compact objective item: a mini card plus a badge column, or
 * a text tag for trick-count objectives. */
export function objectiveItemWidth(chip: ObjectiveChip): number {
  const isCard = chip.kind === "win-card" || chip.kind === "ordered";
  return isCard ? MINI_W + 1 + LABEL_CELL.w : labelWidth(chip.label) + 4 + LABEL_CELL.w;
}

/** A compact objective (mini card with order and status badges, or a
 * trick-count tag) with its top-left at (x, y). The container is
 * interactive only while it is a valid target. */
export function objectiveItem(
  scene: Phaser.Scene,
  x: number,
  y: number,
  chip: ObjectiveChip,
  packId: CardPackId,
  opts: { onClick: () => void; onHover: (over: boolean) => void; dim: boolean },
): Phaser.GameObjects.Container {
  const container = scene.add.container(Math.round(x), Math.round(y));
  const isCard = chip.kind === "win-card" || chip.kind === "ordered";
  const w = objectiveItemWidth(chip);
  const bodyW = isCard ? MINI_W : labelWidth(chip.label) + 4;

  if (isCard) {
    container.add(scene.add.image(0, 0, cardTextureKey(packId, chip.label, "mini")).setOrigin(0, 0));
  } else {
    container.add(plate(scene, 0, 0, bodyW, MINI_H, PALETTE.stump));
    container.add(text(scene, 2, Math.floor((MINI_H - LABEL_CELL.h) / 2), chip.label));
  }
  const order = orderText(chip);
  if (order !== null) container.add(text(scene, bodyW + 1, 0, order, PALETTE.sun));
  const status = STATUS_GLYPH[chip.status];
  if (status !== null) container.add(text(scene, bodyW + 1, MINI_H - LABEL_CELL.h, status.glyph, status.color));

  if (chip.targetable || chip.selected) {
    container.add(scene.add.rectangle(0, 0, bodyW, MINI_H, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
  }
  const hit = scene.add.zone(0, 0, w, MINI_H).setOrigin(0, 0);
  container.add(hit);
  hit.setInteractive({ useHandCursor: chip.targetable });
  hit.on("pointerover", () => opts.onHover(true));
  hit.on("pointerout", () => opts.onHover(false));
  if (chip.targetable) hit.on("pointerdown", opts.onClick);
  container.setAlpha(opts.dim && !chip.targetable && !chip.selected ? DIM_ALPHA : 1);
  return container;
}

export function miniCard(scene: Phaser.Scene, x: number, y: number, label: string, packId: CardPackId): Phaser.GameObjects.Image {
  return scene.add.image(Math.round(x), Math.round(y), cardTextureKey(packId, label, "mini")).setOrigin(0, 0);
}
