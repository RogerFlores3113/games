/**
 * Small drawing primitives shared by the camp draw modules. Every object is
 * placed on whole stage pixels; text never sits on a control unless it is
 * that control's own label, fully inside it.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL, WORLD_LABEL_FONT } from "../font/font-keys";
import { MINI_H, MINI_W } from "../layout";
import { cardTextureKey } from "../card-packs/card-pack-def";
import type { CardPackId } from "../../../../lib/expedition/card-pack-ids";
import type { ObjectiveChip } from "../../../../lib/expedition/build-scene-model";
import { fitLabel } from "./text-fit";

export type Layer = Phaser.GameObjects.Container;

export const DIM_ALPHA = 0.45;

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

/** A labelled button centred on (cx, cy). Interactive only when `onClick` is
 * given; a disabled button is dimmed. Returns the container. */
export function button(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  w: number,
  h: number,
  label: string,
  opts: { onClick?: () => void; outline?: boolean; color?: string } = {},
): Phaser.GameObjects.Container {
  const container = scene.add.container(Math.round(cx), Math.round(cy));
  const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(opts.color ?? PALETTE.stump));
  if (opts.outline) bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  const shown = fitLabel(label, Math.floor((w - 2) / LABEL_CELL.w));
  const t = scene.add
    .bitmapText(-Math.floor(labelWidth(shown) / 2), -Math.floor(LABEL_CELL.h / 2), WORLD_LABEL_FONT, shown)
    .setTint(toPhaserColor(PALETTE.text));
  container.add([bg, t]);
  container.setSize(w, h);
  if (opts.onClick) {
    container.setInteractive({ useHandCursor: true });
    container.on("pointerdown", opts.onClick);
  } else {
    container.setAlpha(DIM_ALPHA);
  }
  return container;
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
  opts: { onClick: () => void; dim: boolean },
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
  if (chip.targetable) {
    const hit = scene.add.zone(0, 0, w, MINI_H).setOrigin(0, 0);
    container.add(hit);
    hit.setInteractive({ useHandCursor: true });
    hit.on("pointerdown", opts.onClick);
  }
  container.setAlpha(opts.dim && !chip.targetable ? DIM_ALPHA : 1);
  return container;
}

export function miniCard(scene: Phaser.Scene, x: number, y: number, label: string, packId: CardPackId): Phaser.GameObjects.Image {
  return scene.add.image(Math.round(x), Math.round(y), cardTextureKey(packId, label, "mini")).setOrigin(0, 0);
}
